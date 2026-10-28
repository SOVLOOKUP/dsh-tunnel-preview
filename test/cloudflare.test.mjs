// Cloudflare API 相关的集成测试：本地起一个 API 桩，不碰真 Cloudflare。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { makeCfClient, cfBind, cfEnsureDns, cfRemoveDns } from '../index.js';

const TUNNEL = 'c6d44fe7-a026-4e91-a432-57d606e05b26';
const DOMAIN = 'example.com';

/** 最小 API 桩：只实现本插件用到的那几条路由。 */
async function stub(seed = []) {
  const state = { records: seed.map((r) => ({ ...r })) };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://stub');
    const send = (code, body) => {
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (url.pathname === '/user/tokens/verify') {
      if (req.headers.authorization !== 'Bearer good')
        return send(400, { success: false, errors: [{ message: 'Invalid API Token' }] });
      return send(200, { success: true, result: { status: 'active' } });
    }
    if (url.pathname === '/zones') return send(200, { success: true, result: [{ id: 'zone-1' }] });
    if (url.pathname === '/accounts') return send(200, { success: true, result: [{ id: 'acct-1' }] });

    const m = /^\/zones\/([^/]+)\/dns_records(?:\/(.+))?$/.exec(url.pathname);
    if (!m) return send(404, { success: false, errors: [{ message: 'no route ' + url.pathname }] });
    if (req.method === 'GET') {
      const name = url.searchParams.get('name');
      const type = url.searchParams.get('type');
      return send(200, {
        success: true,
        result: state.records.filter((r) => (!name || r.name === name) && (!type || r.type === type)),
      });
    }
    if (req.method === 'POST') {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        const rec = { ...JSON.parse(raw), id: `rec-${state.records.length + 1}` };
        state.records.push(rec);
        send(200, { success: true, result: rec });
      });
      return;
    }
    if (req.method === 'DELETE') {
      const i = state.records.findIndex((r) => r.id === m[2]);
      if (i < 0) return send(404, { success: false, errors: [{ message: 'Record not found' }] });
      state.records.splice(i, 1);
      return send(200, { success: true, result: { id: m[2] } });
    }
    send(405, { success: false, errors: [{ message: 'method not allowed' }] });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    state,
    close: () => new Promise((r) => server.close(r)),
  };
}

test('cfBind：token 有效则解析出 zone/account，无效则退成一句可读的失败原因', async () => {
  const s = await stub();
  try {
    const good = await cfBind({ cfApi: makeCfClient('good', s.base), domain: DOMAIN });
    assert.equal(good.bound, true);
    assert.equal(good.zoneId, 'zone-1');
    assert.equal(good.accountId, 'acct-1');

    const bad = await cfBind({ cfApi: makeCfClient('bad', s.base), domain: DOMAIN });
    assert.equal(bad.bound, false);
    assert.match(bad.detail, /Invalid API Token/);
  } finally {
    await s.close();
  }
});

test('cfBind：zone 查不到时明确指向权限问题，而不是假装成功', async () => {
  const s = await stub();
  const cfApi = async (pathname) => {
    if (pathname.startsWith('/user/tokens/verify')) return { ok: true, status: 200, body: { success: true, result: [] } };
    if (pathname.startsWith('/zones')) return { ok: true, status: 200, body: { success: true, result: [] } };
    return { ok: true, status: 200, body: { success: true, result: [] } };
  };
  try {
    const r = await cfBind({ cfApi, domain: DOMAIN });
    assert.equal(r.bound, false);
    assert.match(r.detail, /Zone.Zone Read/);
  } finally {
    await s.close();
  }
});

test('cfEnsureDns：建记录指向本隧道，重复调用幂等', async () => {
  const s = await stub();
  try {
    const cfApi = makeCfClient('good', s.base);
    const first = await cfEnsureDns(cfApi, { zoneId: 'zone-1', domain: DOMAIN, port: 3000, tunnelId: TUNNEL });
    assert.equal(first.ok, true);
    assert.match(first.detail, /已创建/);
    assert.deepEqual(
      s.state.records.map((r) => [r.type, r.name, r.content, r.proxied]),
      [['CNAME', `3000.${DOMAIN}`, `${TUNNEL}.cfargotunnel.com`, true]],
    );

    const again = await cfEnsureDns(cfApi, { zoneId: 'zone-1', domain: DOMAIN, port: 3000, tunnelId: TUNNEL });
    assert.equal(again.ok, true);
    assert.match(again.detail, /已存在并指向本隧道/);
    assert.equal(s.state.records.length, 1);
  } finally {
    await s.close();
  }
});

test('cfEnsureDns：记录指向别的隧道时不覆盖，如实报错', async () => {
  const s = await stub([
    { id: 'rec-old', type: 'CNAME', name: `3100.${DOMAIN}`, content: 'old-tunnel.cfargotunnel.com' },
  ]);
  try {
    const r = await cfEnsureDns(makeCfClient('good', s.base), {
      zoneId: 'zone-1',
      domain: DOMAIN,
      port: 3100,
      tunnelId: TUNNEL,
    });
    assert.equal(r.ok, false);
    assert.match(r.detail, /指向 old-tunnel/);
    assert.equal(s.state.records.length, 1);
  } finally {
    await s.close();
  }
});

test('cfRemoveDns：删掉记录；本来没有也算成功；读不到隧道 UUID 时不静默', async () => {
  const s = await stub([{ id: 'rec-1', type: 'CNAME', name: `3000.${DOMAIN}`, content: 'x' }]);
  try {
    const cfApi = makeCfClient('good', s.base);
    const del = await cfRemoveDns(cfApi, { zoneId: 'zone-1', domain: DOMAIN, port: 3000 });
    assert.equal(del.ok, true);
    assert.match(del.detail, /已删除/);
    assert.equal(s.state.records.length, 0);

    const again = await cfRemoveDns(cfApi, { zoneId: 'zone-1', domain: DOMAIN, port: 3000 });
    assert.equal(again.ok, true);
    assert.match(again.detail, /本来就没有/);

    const noTunnel = await cfEnsureDns(cfApi, { zoneId: 'zone-1', domain: DOMAIN, port: 3000, tunnelId: '' });
    assert.equal(noTunnel.ok, false);
    assert.match(noTunnel.detail, /隧道 UUID/);
  } finally {
    await s.close();
  }
});

/* ---------------- 网络故障：DNS 清理不能把注销整条链拖死 ---------------- */

const brokenCf = async () => {
  // 模拟 fetch 层直接炸：连不上 api.cloudflare.com / TLS 被代理掐断 / AbortSignal 超时
  const err = new TypeError('fetch failed');
  err.cause = new Error('Client network socket disconnected before secure TLS connection was established');
  throw err;
};

test('cfRemoveDns：cfApi 抛网络异常时返回 ok:false，绝不向上抛', async () => {
  const r = await cfRemoveDns(brokenCf, { zoneId: 'zone-1', domain: DOMAIN, port: 3000 });
  assert.equal(r.ok, false);
  assert.match(r.detail, /DNS API 调用异常/);
  assert.match(r.detail, /fetch failed/);
});

test('cfEnsureDns：cfApi 抛网络异常时同样只报 detail，不抛', async () => {
  const r = await cfEnsureDns(brokenCf, { zoneId: 'zone-1', domain: DOMAIN, port: 3000, tunnelId: TUNNEL });
  assert.equal(r.ok, false);
  assert.match(r.detail, /DNS API 调用异常/);
});

test('走真 HTTP 桩但端口关掉（连接被拒）时，注销用的 cfRemoveDns 仍返回 ok:false', async () => {
  const s = await stub([]);
  const base = s.base;
  await s.close(); // 桩没了 → fetch 会 ECONNREFUSED
  const r = await cfRemoveDns(makeCfClient('good', base), { zoneId: 'zone-1', domain: DOMAIN, port: 3000 });
  assert.equal(r.ok, false);
  assert.match(r.detail, /DNS API 调用异常/);
});
