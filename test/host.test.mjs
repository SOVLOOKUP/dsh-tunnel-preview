// 纯函数单测：不碰网络、不起隧道。node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { portFromHost, portAllowed, parseCookies, listeningPorts, parseTunnelId, cfReason, Config } from '../index.js';

const cfg = { domain: 'metapoint.tech', minPort: 1024, listen: 9999, deny: [5900, 9222] };

test('portFromHost 只认一级子域里的端口', () => {
  assert.equal(portFromHost('5173.metapoint.tech', cfg.domain), 5173);
  assert.equal(portFromHost('p5173.metapoint.tech', cfg.domain), 5173);
  assert.equal(portFromHost('5173.MetaPoint.Tech:443', cfg.domain), 5173);
  // 二级子域、非端口标签、别人的域名一律不认
  assert.equal(portFromHost('a.5173.metapoint.tech', cfg.domain), null);
  assert.equal(portFromHost('ds.metapoint.tech', cfg.domain), null);
  assert.equal(portFromHost('5173.example.com', cfg.domain), null);
  assert.equal(portFromHost('', cfg.domain), null);
  assert.equal(portFromHost('123456.metapoint.tech', cfg.domain), null);
});

test('portAllowed 挡掉特权端口、受保护端口与反代自己的端口', () => {
  assert.equal(portAllowed(5173, cfg), true);
  assert.equal(portAllowed(1023, cfg), false);
  assert.equal(portAllowed(70000, cfg), false);
  assert.equal(portAllowed(5900, cfg), false); // deny 列表
  assert.equal(portAllowed(9999, cfg), false); // 反代自己
  assert.equal(portAllowed(Number('abc'), cfg), false);
});

test('parseCookies 只切第一个等号，值里的等号保留', () => {
  assert.deepEqual(parseCookies('a=1; b=x=y'), { a: '1', b: 'x=y' });
  assert.deepEqual(parseCookies(''), {});
  assert.deepEqual(parseCookies(undefined), {});
});

test('listeningPorts 返回集合且包含当前进程能看到的端口', () => {
  const ports = listeningPorts();
  assert.ok(ports instanceof Set);
  for (const p of ports) assert.ok(Number.isInteger(p) && p > 0);
});

/* ---------------- Cloudflare 绑定相关的纯逻辑 ---------------- */

test('parseTunnelId 只认 tunnel: 那行的 36 位 UUID', () => {
  const yml = 'tunnel: c6d44fe7-a026-4e91-a432-57d606e05b26\ncredentials-file: /x.json\n';
  assert.equal(parseTunnelId(yml), 'c6d44fe7-a026-4e91-a432-57d606e05b26');
  assert.equal(parseTunnelId('tunnel: "c6d44fe7-a026-4e91-a432-57d606e05b26"'), 'c6d44fe7-a026-4e91-a432-57d606e05b26');
  assert.equal(parseTunnelId('ingress:\n  - service: http://127.0.0.1:9999'), '');
  assert.equal(parseTunnelId(''), '');
});

test('cfReason 把 Cloudflare 错误体压成一句人话', () => {
  assert.equal(cfReason({ errors: [{ message: 'Invalid API Token' }] }, 403), 'Invalid API Token');
  assert.equal(cfReason({ errors: [{ message: 'a' }, { message: 'b' }, { message: 'c' }] }, 400), 'a; b');
  assert.equal(cfReason({}, 502), 'HTTP 502');
});

test('Config schema 收得下 patch 里的既有配置，并给 cloudflare 三个平铺字段补默认值', () => {
  const resolved = Config({ domain: 'metapoint.tech', deny: [5900] });
  assert.equal(resolved.domain, 'metapoint.tech');
  assert.equal(resolved.listen, 9999);
  assert.equal(resolved.dnsOnUnregister, 'delete');
  // volatile 字段解析后是 Volatile 引用（.get() 取当前值），这正是「热更新不重挂」的机制
  assert.equal(typeof resolved.cloudflareApiToken.get, 'function');
  assert.equal(resolved.cloudflareApiToken.get(), '');
  assert.equal(resolved.cloudflareAccountId.get(), '');
  assert.equal(resolved.cloudflareZoneId.get(), '');
});



