/**
 * dsh-tunnel-preview —— 让 agent 自己把容器里的服务挂到公网，用完自己注销。
 *
 * 解决的问题：DSH Host 跑在容器里，agent 起的 dev server 绑在 127.0.0.1:5173，
 * 容器只对外暴露一个 8443。这个插件复用那条**已经通**的 Cloudflare 命名隧道，
 * 把「端口 → 公网子域」的登记和转发做成 agent 可调的工具。
 *
 * 三个部分：
 *  1. 反代：插件自己监听 127.0.0.1:<listen>，隧道 catch-all 指向它，按 Host 里的
 *     端口号转发到 `127.0.0.1:<port>`；HTTP 与 WebSocket（HMR）都通。
 *  2. 登记表：只有**登记过**的端口才会被转发。登记 = 一条 DNS 记录 + 登记表里一行
 *     （落盘，宿主重启不丢）。没登记的端口拿不到入口，注销后立刻 403。
 *  3. 工具：`preview_register` / `preview_unregister` / `preview_list`，agent 自己
 *     开户、自己销户，不需要人来改配置。
 *
 * 闸门：URL 里不带 token 就打不开（本机直连除外）。token 只落盘在服务端，
 * 不走命令行参数，避免 `ps` 里看得到。用 query 验过一次会换成域级 Cookie，
 * 之后同一浏览器的所有端口子域都免 token。
 *
 * 取舍：DNS 记录默认「建得起来就删得掉」——前提是绑定了 Cloudflare API token
 * （设置 → 插件配置里粘贴 `cloudflare.apiToken`，插件自己校验、自己找 zone）。
 * 没绑定时退回 `cloudflared tunnel route dns` CLI：只建不删，记录留着无害，入口是否
 * 通行由登记表决定，重新登记同一个端口因此是瞬时的。两种模式在工具返回里都写明。
 */
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import z from '@deepseek-ai/schemastery';

export const name = 'tunnel-preview';
/** 工具给所有 agent 用；prompt 段落说明什么时候该用；webServer 注册侧栏 API。 */
export const inject = ['tools', 'systemPrompt'];

const HOME = process.env.HOME || '/workspace';

const DEFAULTS = {
  /** 反代监听地址；隧道 config 里的 catch-all 必须指向这里。 */
  listen: 9999,
  /** 子域后缀：5173.example.com。 */
  domain: 'example.com',
  /** 状态目录：token、登记表、日志都在这里。 */
  stateDir: path.join(HOME, 'devpreview'),
  /** token 文件；沿用既有约定，便于和早先的脚本共用同一把钥匙。 */
  tokenFile: '',
  /** 登记表文件。 */
  stateFile: '',
  /** 命名隧道名（`cloudflared tunnel route dns` 用）。 */
  tunnelName: 'dsh-dev',
  /** cloudflared 可执行文件。 */
  cloudflared: path.join(HOME, 'bin', 'cloudflared'),
  /** 隧道 config（catch-all 指向本插件的 listen）。 */
  tunnelConfig: path.join(HOME, '.cloudflared', 'config.yml'),
  /** 由插件托管 cloudflared 进程；宿主退出时一并带走。 */
  manageTunnel: true,
  /** 登记时自动建 DNS 记录。 */
  manageDns: true,
  /** 永不转发的端口（宿主设施）。 */
  deny: [3080, 5241, 5244, 5246, 5900, 6080, 8731, 8788, 8792, 8931, 9222],
  /** 转发时把 Host / Origin / Referer 改写成上游自己，避免 dev server 的 host 校验拦下来。 */
  rewriteHost: true,
  /** 域级 Cookie 有效期（秒）。 */
  cookieMaxAge: 2592000,
  minPort: 1024,
  /**
   * Cloudflare API 绑定（设置里一行 token 就够）：抖平为三个顶层 volatile 字段，
   * 便于表单直接寻址；旧版嵌套 `cloudflare: {...}` 配置仍兼容（见 apply 里的 fallback）。
   * 不填：只能靠 cloudflared CLI 建记录，删不掉；填了：自建 + 自删，cert.pem 也不再是前提。
   */
  cloudflareApiToken: '',
  cloudflareAccountId: '',
  cloudflareZoneId: '',
  /** 注销时怎么处理 DNS 记录：keep 保留（重新登记瞬时）/ delete 删掉（公网零残留）。 */
  dnsOnUnregister: 'delete',
};

/**
 * 设置页的权威 schema：宿主按它渲染表单，用户在 DSH 设置里填 token 即完成绑定
 * （`role('secret')` 的字段在 describe 时被抹成占位符，不会回传给远程调用者）。
 */
export const Config = z.object({
  listen: z.natural().min(1024).max(65535).default(DEFAULTS.listen).description('反代监听端口（隧道 catch-all 指向这里）'),
  domain: z.string().default(DEFAULTS.domain).description('子域后缀：<端口>.<domain>'),
  stateDir: z.string().default('').description('状态目录，空 = $HOME/devpreview'),
  tokenFile: z.string().default('').description('专用 token 文件，空 = stateDir/token'),
  stateFile: z.string().default('').description('登记表文件，空 = stateDir/previews.json'),
  tunnelName: z.string().default(DEFAULTS.tunnelName).description('命名隧道名（CLI 建记录时用）'),
  cloudflared: z.string().default('').description('cloudflared 路径，空 = $HOME/bin/cloudflared'),
  tunnelConfig: z.string().default('').description('隧道 config.yml，空 = $HOME/.cloudflared/config.yml'),
  manageTunnel: z.boolean().default(true).description('由插件托管 cloudflared 进程'),
  manageDns: z.boolean().default(true).description('登记端口时自动建 DNS 记录'),
  deny: z.array(z.natural()).default(DEFAULTS.deny).description('永不公开的端口'),
  rewriteHost: z.boolean().default(true).description('转发时改写 Host/Origin/Referer'),
  cookieMaxAge: z.natural().default(DEFAULTS.cookieMaxAge).description('域级 Cookie 有效期（秒）'),
  minPort: z.natural().default(DEFAULTS.minPort).description('允许公开的最小端口'),
  /**
   * Cloudflare API 绑定（一键绑定：在插件页的表单里粘贴 token 保存即完成）。
   * 三个字段都是 volatile：改它们的值只触发 `loader/volatile-update`，不重挂插件，
   * 插件在监听里重新 resolve 并热再绑定。
   */
  cloudflareApiToken: z
    .string()
    .role('secret')
    .default('')
    .volatile()
    .description(
      'Cloudflare API token（权限：Zone.DNS Edit + Zone.Zone Read，可加 Account Tunnel Read）。' +
        '粘贴后点保存即完成绑定：插件会自己校验、自己找 zone，之后 DNS 记录能建也能删。',
    ),
  cloudflareAccountId: z.string().default('').volatile().description('账号 id，空 = 自动探测（一个 token 只属于一个账号）'),
  cloudflareZoneId: z.string().default('').volatile().description('zone id，空 = 按 domain 自动查'),
  dnsOnUnregister: z
    .union(['keep', 'delete'])
    .default(DEFAULTS.dnsOnUnregister)
    .description('注销时 DNS 记录：keep 保留 / delete 删除（需已绑定 API token）'),
});

/* ------------------------------------------------------------------ 纯函数 */

/** `/proc/net/tcp{,6}` 里状态 0A = LISTEN 的端口集合。 */
export function listeningPorts() {
  const set = new Set();
  for (const f of ['/proc/net/tcp', '/proc/net/tcp6']) {
    let txt;
    try {
      txt = fs.readFileSync(f, 'utf8');
    } catch {
      continue;
    }
    for (const line of txt.split('\n').slice(1)) {
      const p = line.trim().split(/\s+/);
      if (p.length < 4 || p[3] !== '0A') continue;
      const port = parseInt(p[1].split(':').pop(), 16);
      if (port) set.add(port);
    }
  }
  return set;
}

/** 从 Host 头里取端口：`5173.example.com` → 5173。只认一级子域。 */
export function portFromHost(hostHeader, domain) {
  const host = String(hostHeader || '').split(':')[0].toLowerCase();
  if (!host.endsWith('.' + domain)) return null;
  const label = host.slice(0, -(domain.length + 1));
  if (!label || label.includes('.')) return null;
  const m = /^p?(\d{2,5})$/.exec(label);
  return m ? Number(m[1]) : null;
}

/** 端口是否允许出现在公网上（登记表之外的第二道闸）。 */
export function portAllowed(port, cfg) {
  if (!Number.isInteger(port) || port < cfg.minPort || port > 65535) return false;
  if (cfg.deny.includes(port) || port === cfg.listen) return false;
  return true;
}

export function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

/** 从隧道 config.yml 里取 UUID：`tunnel: <uuid>`。API 建记录要 `<uuid>.cfargotunnel.com`。 */
export function parseTunnelId(yamlText) {
  const m = /^\s*tunnel:\s*["']?([0-9a-fA-F-]{36})["']?\s*$/m.exec(String(yamlText || ''));
  return m ? m[1] : '';
}

/** Cloudflare 的错误体压成一句人话。 */
export function cfReason(body, status) {
  const list = Array.isArray(body?.errors) ? body.errors.map((e) => e?.message || String(e)) : [];
  return list.length ? list.slice(0, 2).join('; ') : `HTTP ${status}`;
}

const CF_BASE = 'https://api.cloudflare.com/client/v4';

/** 带 token 的 API 客户端。baseUrl 可换——单测把它指向本地桩，不碰真 Cloudflare。 */
export function makeCfClient(token, baseUrl = CF_BASE) {
  return async function cfApi(pathname, init = {}) {
    const res = await fetch(baseUrl + pathname, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        ...(init.headers || {}),
      },
      signal: AbortSignal.timeout(15000),
    });
    let body = {};
    try {
      body = await res.json();
    } catch {}
    return { ok: res.ok && body?.success !== false, status: res.status, body };
  };
}

/**
 * 绑定：校验 token，再把 zone / account 解析出来。
 * 任何失败都退成一句可读的 detail，不抛——插件其余功能不靠绑定。
 */
export async function cfBind({ cfApi, domain, zoneId = '', accountId = '' }) {
  try {
    const verify = await cfApi('/user/tokens/verify');
    if (!verify.ok) return { bound: false, zoneId, accountId, detail: `token 校验失败：${cfReason(verify.body, verify.status)}` };
    if (!zoneId) {
      const zones = await cfApi(`/zones?name=${encodeURIComponent(domain)}&per_page=1`);
      if (!zones.ok) return { bound: false, zoneId: '', accountId, detail: cfReason(zones.body, zones.status) };
      zoneId = String(zones.body?.result?.[0]?.id || '');
      if (!zoneId) return { bound: false, zoneId: '', accountId, detail: `token 里看不到 ${domain} 这个 zone（权限缺 Zone.Zone Read？）` };
    }
    if (!accountId) {
      const acct = await cfApi('/accounts?per_page=1');
      accountId = String(acct.body?.result?.[0]?.id || '');
    }
    return {
      bound: true,
      zoneId,
      accountId,
      detail: `已绑定（zone ${domain} ${zoneId.slice(0, 8)}…${accountId ? ` / account ${accountId.slice(0, 8)}…` : ''}）`,
    };
  } catch (e) {
    return { bound: false, zoneId, accountId, detail: `绑定异常：${e?.message || e}` };
  }
}

/** 建 `<port>.<domain>` → `<tunnelId>.cfargotunnel.com`；已存在且指向本隧道算成功。 */
export async function cfEnsureDns(cfApi, { zoneId, domain, port, tunnelId }) {
  if (!tunnelId) return { ok: false, detail: '读不到隧道 UUID（tunnelConfig 里没有 tunnel: 行）' };
  const host = `${port}.${domain}`;
  const found = await cfApi(`/zones/${zoneId}/dns_records?type=CNAME&name=${encodeURIComponent(host)}&per_page=1`);
  if (!found.ok) return { ok: false, detail: cfReason(found.body, found.status) };
  const existing = found.body?.result?.[0];
  if (existing) {
    if (String(existing.content || '').includes(tunnelId)) return { ok: true, detail: 'DNS 记录已存在并指向本隧道' };
    return { ok: false, detail: `记录已存在但指向 ${existing.content}，需要人工处理` };
  }
  const created = await cfApi(`/zones/${zoneId}/dns_records`, {
    method: 'POST',
    body: JSON.stringify({
      type: 'CNAME',
      name: host,
      content: `${tunnelId}.cfargotunnel.com`,
      proxied: true,
      ttl: 1,
      comment: 'dsh-tunnel-preview',
    }),
  });
  return created.ok ? { ok: true, detail: 'DNS 记录已创建（API）' } : { ok: false, detail: cfReason(created.body, created.status) };
}

/** 删 `<port>.<domain>` 的 CNAME；本来没有也算成功。 */
export async function cfRemoveDns(cfApi, { zoneId, domain, port }) {
  const host = `${port}.${domain}`;
  const found = await cfApi(`/zones/${zoneId}/dns_records?type=CNAME&name=${encodeURIComponent(host)}&per_page=1`);
  if (!found.ok) return { ok: false, detail: cfReason(found.body, found.status) };
  const id = found.body?.result?.[0]?.id;
  if (!id) return { ok: true, detail: '本来就没有对应记录' };
  const del = await cfApi(`/zones/${zoneId}/dns_records/${id}`, { method: 'DELETE' });
  return del.ok ? { ok: true, detail: 'DNS 记录已删除（API）' } : { ok: false, detail: cfReason(del.body, del.status) };
}

/* ------------------------------------------------------------------ apply */

export function apply(ctx, rawConfig = {}) {
  /** volatile 字段是 `{ get(), [write] }` 引用；普通字段就是原值。解引用后再判空。 */
  const plain = (v) => (v && typeof v === 'object' && typeof v.get === 'function' ? v.get() : v);
  /** 兼容旧版嵌套 cloudflare:{} 配置：新平铺字段优先，缺失才看旧字段。 */
  const legacyCf = plain(rawConfig.cloudflare);
  const resolveCf = () => {
    const flat = {
      apiToken: String(plain(rawConfig.cloudflareApiToken) ?? '').trim(),
      accountId: String(plain(rawConfig.cloudflareAccountId) ?? '').trim(),
      zoneId: String(plain(rawConfig.cloudflareZoneId) ?? '').trim(),
    };
    const legacy = legacyCf && typeof legacyCf === 'object'
      ? {
          apiToken: String(plain(legacyCf.apiToken) ?? '').trim(),
          accountId: String(plain(legacyCf.accountId) ?? '').trim(),
          zoneId: String(plain(legacyCf.zoneId) ?? '').trim(),
        }
      : { apiToken: '', accountId: '', zoneId: '' };
    const pick = (flatVal, legacyVal, hadFlat) => {
      // patch 里显式写过平铺字段（哪怕是空的/被清掉的）就以平铺为准；
      // 只当平铺字段从未配置过（默认值空串）才回退旧嵌套结构。
      const f = flatVal.trim();
      if (f) return f;
      if (hadFlat) return '';
      return legacyVal.trim();
    };
    const hadFlat = Object.prototype.hasOwnProperty.call(rawConfig, 'cloudflareApiToken')
      || Object.prototype.hasOwnProperty.call(rawConfig, 'cloudflareAccountId')
      || Object.prototype.hasOwnProperty.call(rawConfig, 'cloudflareZoneId');
    return {
      apiToken: pick(flat.apiToken, legacy.apiToken, hadFlat),
      accountId: pick(flat.accountId, legacy.accountId, hadFlat),
      zoneId: pick(flat.zoneId, legacy.zoneId, hadFlat),
    };
  };
  const cfg = {
    ...DEFAULTS,
    ...rawConfig,
    deny: [...(rawConfig.deny || DEFAULTS.deny)],
    cloudflare: resolveCf(),
  };
  // 空字符串即「用默认值」：patch 里留空比抄一遍绝对路径更不容易过期
  for (const key of ['stateDir', 'cloudflared', 'tunnelConfig', 'tokenFile', 'stateFile']) {
    if (!cfg[key]) cfg[key] = DEFAULTS[key];
  }
  const stateDir = cfg.stateDir;
  const tokenFile = cfg.tokenFile || path.join(stateDir, 'token');
  const stateFile = cfg.stateFile || path.join(stateDir, 'previews.json');

  fs.mkdirSync(stateDir, { recursive: true });

  /* ---------------- token ---------------- */
  function loadToken() {
    if (process.env.DP_TOKEN) return process.env.DP_TOKEN.trim();
    try {
      const t = fs.readFileSync(tokenFile, 'utf8').trim();
      if (t) return t;
    } catch {}
    const t = crypto.randomBytes(24).toString('hex');
    fs.writeFileSync(tokenFile, t + '\n', { mode: 0o600 });
    log(`生成新 token → ${tokenFile}`);
    return t;
  }
  const token = loadToken();
  const cookieHeader = () =>
    `dp_token=${token}; Path=/; Domain=.${cfg.domain}; Max-Age=${cfg.cookieMaxAge}; SameSite=Lax; Secure; HttpOnly`;

  /** 'local' | 'cookie' | 'header' | 'query' | null —— 本机直连免 token，方便容器内自测。 */
  function authMode(req) {
    const host = String(req.headers.host || '').split(':')[0];
    if (host === '127.0.0.1' || host === 'localhost') return 'local';
    if (parseCookies(req.headers.cookie).dp_token === token) return 'cookie';
    if (req.headers['x-dp-token'] === token) return 'header';
    try {
      if (new URL(req.url, 'http://x').searchParams.get('dp_token') === token) return 'query';
    } catch {}
    return null;
  }

  /* ---------------- Cloudflare API 绑定 ---------------- */
  /** 设置里填了 token 就等于绑定：校验一次、把 zone/account 解析出来，之后 DNS 记录能建也能删。 */
  const cfApi = () => {
    const token = String(cfg.cloudflare.apiToken || '').trim();
    return token ? makeCfClient(token) : null;
  };
  const cf = { bound: false, zoneId: '', accountId: '', detail: '未绑定（在插件页「绑定 Cloudflare」表单里粘贴 token 保存即可）', apiToken: '' };

  async function bindCloudflare() {
    const client = cfApi();
    if (!client) {
      cf.bound = false;
      cf.zoneId = '';
      cf.accountId = '';
      cf.detail = '未绑定（在插件页「绑定 Cloudflare」表单里粘贴 token 保存即可）';
      cf.apiToken = '';
      return;
    }
    Object.assign(
      cf,
      await cfBind({
        cfApi: client,
        domain: cfg.domain,
        zoneId: String(cfg.cloudflare.zoneId || '').trim(),
        accountId: String(cfg.cloudflare.accountId || '').trim(),
      }),
    );
    cf.apiToken = String(cfg.cloudflare.apiToken || '').trim();
    log(cf.bound ? 'Cloudflare 已绑定：DNS 记录可自建自删，cert.pem 不再是前提' : `Cloudflare 绑定失败 —— ${cf.detail}`);
  }

  /** 隧道 UUID（API 建记录要 `<uuid>.cfargotunnel.com`）。 */
  function tunnelId() {
    try {
      return parseTunnelId(fs.readFileSync(cfg.tunnelConfig, 'utf8'));
    } catch {
      return '';
    }
  }

  /** 绑定在装载时就跑；建/删记录前 await 一次，等它把 zone 解析完；热更新时替换。 */
  let cfBinding = bindCloudflare();

  /**
   * 表单保存的是三个 volatile 字段 → loader 只更新引用、发 `loader/volatile-update`，
   * 不会重挂插件。在这里重新 resolve 并热再绑定，保存 token 即刻生效；同步更新
   * preview_list 里展示的绑定状态。
   */
  ctx.on('loader/volatile-update', (paths) => {
    const changed = (paths ?? []).some((p) => p && String(p[0]).startsWith('cloudflare'));
    if (!changed) return;
    cfg.cloudflare = resolveCf();
    // refresh 复原初始状态；用户可能在绑定期间就调用建删，清掉 pending 信号
    cfBinding = bindCloudflare();
    cfBinding.then(() => log(`Cloudflare 配置已热更新：${cf.detail}`)).catch((e) => log(`Cloudflare 热更新失败 —— ${e.message}`));
    log(`检测到 cloudflare 配置变更（${(paths ?? []).map((p) => p.join('.')).join(', ')}），重新绑定`);
  });

  /* ---------------- 登记表 ---------------- */
  /** { "5173": { label, createdAt } } —— 落盘，宿主重启不丢。 */
  let entries = {};
  function loadState() {
    try {
      const raw = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      if (raw && typeof raw === 'object' && raw.entries) entries = raw.entries;
    } catch {}
  }
  function saveState() {
    const tmp = stateFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ entries }, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(tmp, stateFile);
  }
  const registered = () => new Set(Object.keys(entries).map(Number));
  loadState();

  /* ---------------- 隧道进程 ---------------- */
  let tunnel = null;
  let tunnelConnectedAt = 0;
  let restartTimer = null;
  let restartCount = 0;
  let disposing = false;

  function log(msg) {
    console.log(`[tunnel-preview] ${msg}`);
  }

  function startTunnel() {
    if (!cfg.manageTunnel || disposing || tunnel) return;
    if (!fs.existsSync(cfg.cloudflared)) {
      log(`cloudflared 不存在：${cfg.cloudflared}（manageTunnel=false 可关掉托管）`);
      return;
    }
    if (!fs.existsSync(cfg.tunnelConfig)) {
      log(`隧道 config 不存在：${cfg.tunnelConfig}`);
      return;
    }
    const child = spawn(cfg.cloudflared, ['--no-autoupdate', '--config', cfg.tunnelConfig, 'tunnel', 'run'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    tunnel = child;
    const watch = (buf) => {
      const text = String(buf);
      if (/Registered tunnel connection/.test(text)) tunnelConnectedAt = Date.now();
      for (const line of text.split('\n')) {
        const t = line.trim();
        if (t && !/^\s*$/.test(t)) log(`cf | ${t.slice(0, 200)}`);
      }
    };
    child.stdout?.on('data', watch);
    child.stderr?.on('data', watch);
    child.on('exit', (code, signal) => {
      tunnel = null;
      tunnelConnectedAt = 0;
      if (disposing) return;
      log(`cloudflared 退出（code=${code} signal=${signal}），准备重启`);
      if (restartCount >= 5) return log('重启次数过多，停止托管；请检查 config 与网络');
      const delay = Math.min(2000 * ++restartCount, 15000);
      restartTimer = setTimeout(startTunnel, delay);
      restartTimer.unref?.();
    });
    log(`cloudflared 已启动（pid ${child.pid}）`);
  }

  function stopTunnel() {
    disposing = true;
    if (restartTimer) clearTimeout(restartTimer);
    restartTimer = null;
    if (tunnel) {
      try {
        tunnel.kill('SIGTERM');
      } catch {}
      tunnel = null;
    }
  }

  /* ---------------- DNS ---------------- */
  /** CLI 模式：`cloudflared tunnel route dns`。已存在视为成功。 */
  function ensureDnsViaCli(port) {
    const host = `${port}.${cfg.domain}`;
    if (!fs.existsSync(cfg.cloudflared)) return Promise.resolve({ ok: false, detail: `cloudflared 不存在：${cfg.cloudflared}` });
    return new Promise((resolve) => {
      const child = spawn(cfg.cloudflared, ['tunnel', 'route', 'dns', cfg.tunnelName, host], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let out = '';
      child.stdout.on('data', (b) => (out += String(b)));
      child.stderr.on('data', (b) => (out += String(b)));
      const timer = setTimeout(() => child.kill('SIGKILL'), 30000);
      child.on('error', (e) => {
        clearTimeout(timer);
        resolve({ ok: false, detail: e.message });
      });
      child.on('exit', (code) => {
        clearTimeout(timer);
        if (/already exists|record with that host/i.test(out)) return resolve({ ok: true, detail: 'DNS 记录已存在' });
        if (code === 0 && /Added CNAME/i.test(out)) return resolve({ ok: true, detail: 'DNS 记录已创建' });
        // 「already configured to route to your tunnel」= 这条记录早已指向本隧道，也算成功，
        // 否则重复登记同一个端口会一直报 DNS 失败
        if (/already configured to route to your tunnel/i.test(out))
          return resolve({ ok: true, detail: 'DNS 记录早已指向本隧道' });
        resolve({ ok: false, detail: out.trim().split('\n').slice(-2).join(' ') || `exit ${code}` });
      });
    });
  }

  /** API 模式：不依赖 cert.pem，也能顺手检查「记录指向的还是不是这条隧道」。 */
  function ensureDnsViaApi(port) {
    return cfEnsureDns(cfApi(), { zoneId: cf.zoneId, domain: cfg.domain, port, tunnelId: tunnelId() });
  }

  /** 建 `<port>.<domain>` → 本隧道的 CNAME：绑定了就直连 API，否则退回 CLI。 */
  async function ensureDns(port) {
    if (!cfg.manageDns) return { ok: true, detail: 'manageDns=false，跳过' };
    await cfBinding;
    if (cf.bound) {
      const viaApi = await ensureDnsViaApi(port);
      if (viaApi.ok) return viaApi;
      if (!fs.existsSync(cfg.cloudflared)) return viaApi;
      log(`API 建记录失败（${viaApi.detail}），退回 cloudflared CLI`);
    }
    return ensureDnsViaCli(port);
  }

  /** 注销时按 dnsOnUnregister 处理记录；只有绑定 API 才删得掉。 */
  async function removeDns(port) {
    if (cfg.dnsOnUnregister !== 'delete') return { ok: true, detail: '按 dnsOnUnregister=keep 保留' };
    await cfBinding;
    if (!cf.bound) return { ok: false, detail: '未绑定 API token，记录保留' };
    return cfRemoveDns(cfApi(), { zoneId: cf.zoneId, domain: cfg.domain, port });
  }

  /* ---------------- 反代 ---------------- */
  /** 解析 Host → 端口；不合法/未登记/没在听，各自给一个能读的理由。 */
  function resolve(req) {
    const port = portFromHost(req.headers.host, cfg.domain);
    if (port == null)
      return { error: 404, why: `Host「${req.headers.host}」里没有端口，期望形如 5173.${cfg.domain}` };
    if (!portAllowed(port, cfg)) return { error: 403, why: `端口 ${port} 不在允许范围（<${cfg.minPort} 或受保护）` };
    if (!registered().has(port))
      return { error: 403, why: `端口 ${port} 没有登记。先在 agent 里调用 preview_register({ port: ${port} })` };
    if (!listeningPorts().has(port)) return { error: 502, why: `127.0.0.1:${port} 当前没有服务在监听` };
    return { port };
  }

  function rewriteHeaders(headers, port) {
    const h = { ...headers };
    if (cfg.rewriteHost) {
      const origin = `http://127.0.0.1:${port}`;
      if (h.host) {
        h['x-forwarded-host'] = h.host;
        h.host = `127.0.0.1:${port}`;
      }
      if (h.origin) h.origin = origin;
      if (h.referer) {
        try {
          const u = new URL(h.referer);
          u.host = `127.0.0.1:${port}`;
          h.referer = u.href;
        } catch {}
      }
      // token 是网关的钥匙，不该出现在上游应用的访问日志里
      if (h.cookie) h.cookie = h.cookie.split(';').filter((c) => !c.trim().startsWith('dp_token=')).join(';');
    }
    h['x-forwarded-proto'] = 'https';
    delete h['cf-connecting-ip'];
    return h;
  }

  function deny401(req, res) {
    const host = String(req.headers.host || '').split(':')[0];
    res.writeHead(401, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
    });
    res.end(`<!doctype html><meta charset=utf-8><title>preview · 需要 token</title>
<body style="font:15px/1.7 system-ui;max-width:34em;margin:12vh auto;padding:0 1.2em;color:#222">
<h2>需要 token</h2>
<p>这条预览入口是有闸门的：</p>
<ol>
  <li>浏览器：在地址后加一次参数，之后会记住 30 天<br>
      <code>https://${host}/?dp_token=&lt;token&gt;</code></li>
  <li>脚本：<code>-H "x-dp-token: &lt;token&gt;"</code></li>
</ol>
<p style="color:#666">token 在容器里：<code>${tokenFile}</code>（<code>cat ${tokenFile}</code>）。
让 agent 调用 <code>preview_list</code> 也能拿到带 token 的完整链接。</p>
</body>`);
  }

  const server = http.createServer((req, res) => {
    const auth = authMode(req);
    if (!auth) return deny401(req, res);
    if (auth === 'query') {
      const u = new URL(req.url, 'http://x');
      u.searchParams.delete('dp_token');
      res.writeHead(302, { location: u.pathname + (u.search || ''), 'set-cookie': cookieHeader(), 'cache-control': 'no-store' });
      return res.end();
    }
    const t = resolve(req);
    if (t.error) {
      res.writeHead(t.error, { 'content-type': 'text/plain; charset=utf-8' });
      return res.end(`tunnel-preview ${t.error}\n${t.why}\n`);
    }
    const up = http.request(
      { host: '127.0.0.1', port: t.port, method: req.method, path: req.url, headers: rewriteHeaders(req.headers, t.port) },
      (ur) => {
        const h = { ...ur.headers };
        if (!h['referrer-policy']) h['referrer-policy'] = 'no-referrer';
        res.writeHead(ur.statusCode, h);
        ur.pipe(res);
      },
    );
    up.on('error', (e) => {
      if (res.headersSent) return res.destroy();
      res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(`tunnel-preview 502\n${e.message}\n`);
    });
    req.pipe(up);
  });

  // HMR 走升级请求，必须同样过闸门、同样按 Host 解析端口
  server.on('upgrade', (req, socket, head) => {
    if (!authMode(req)) return socket.end('HTTP/1.1 401 Unauthorized\r\ncontent-length: 0\r\n\r\n');
    const t = resolve(req);
    if (t.error) return socket.end(`HTTP/1.1 ${t.error} Bad\r\ncontent-length: 0\r\n\r\n`);
    const up = net.connect(t.port, '127.0.0.1', () => {
      const h = rewriteHeaders(req.headers, t.port);
      let raw = `${req.method} ${req.url} HTTP/1.1\r\n`;
      for (const [k, v] of Object.entries(h)) raw += `${k}: ${v}\r\n`;
      up.write(raw + '\r\n');
      if (head?.length) up.write(head);
      up.pipe(socket);
      socket.pipe(up);
    });
    up.on('error', () => socket.destroy());
    socket.on('error', () => up.destroy());
  });

  server.on('error', (e) => {
    if (e && e.code === 'EADDRINUSE')
      log(`127.0.0.1:${cfg.listen} 已被占用；先停掉旧的 dispatcher（/workspace/devpreview/start.sh stop）或改 config.listen`);
    else log(`反代监听失败：${e && e.message}`);
  });

  ctx.effect(() => {
    server.listen(cfg.listen, '127.0.0.1', () =>
      log(`反代就绪 127.0.0.1:${cfg.listen} → *.<port>.${cfg.domain} | 已登记 ${registered().size} 个端口`),
    );
    return () => {
      try {
        server.close();
      } catch {}
    };
  });

  ctx.effect(() => {
    startTunnel();
    return () => stopTunnel();
  });

  /* ---------------- 工具 ---------------- */
  const urlOf = (port) => `https://${port}.${cfg.domain}/`;
  const shareUrlOf = (port) => `https://${port}.${cfg.domain}/?dp_token=${token}`;

  /* ---------------- 统一业务层：登记 / 注销 / 概览 ---------------- */
  async function doRegister(port, label, agentId) {
    if (!portAllowed(port, cfg)) throw new Error(`端口 ${port} 不能公开（需在 ${cfg.minPort}-65535 且不在受保护列表）`);
    if (!listeningPorts().has(port)) throw new Error(`127.0.0.1:${port} 没有服务在监听；先把服务起起来再登记`);
    const dns = await ensureDns(port);
    const existed = registered().has(port);
    entries[port] = {
      label: String(label || entries[port]?.label || '').slice(0, 120),
      createdAt: entries[port]?.createdAt || new Date().toISOString(),
      ...(existed ? {} : { createdBy: agentId || execAgentId() }),
    };
    saveState();
    return {
      port,
      label: entries[port].label,
      createdAt: entries[port].createdAt,
      createdBy: entries[port].createdBy,
      url: urlOf(port),
      shareUrl: shareUrlOf(port),
      dns,
      existed,
    };
  }

  async function doUnregister(port) {
    if (!registered().has(port)) throw new Error(`端口 ${port} 没有登记，无需注销`);
    const dns = await removeDns(port);
    delete entries[port];
    saveState();
    return {
      port,
      dns,
    };
  }

  function getServicesOverview() {
    const listening = listeningPorts();
    const reg = registered();
    const services = Object.entries(entries)
      .map(([p, info]) => {
        const port = Number(p);
        return {
          port,
          label: info?.label || '',
          createdAt: info?.createdAt || '',
          createdBy: info?.createdBy || '',
          listening: listening.has(port),
          url: urlOf(port),
          shareUrl: shareUrlOf(port),
        };
      })
      .sort((a, b) => a.port - b.port);

    const candidatePorts = Array.from(listening)
      .filter((p) => portAllowed(p, cfg) && !reg.has(p))
      .sort((a, b) => a - b);

    return {
      ok: true,
      domain: cfg.domain,
      tunnelConnected: !!tunnelConnectedAt,
      cloudflare: {
        bound: cf.bound,
        detail: cf.detail,
      },
      services,
      candidatePorts,
    };
  }

  function parseJsonBody(req) {
    return new Promise((resolve, reject) => {
      let raw = '';
      req.on('data', (chunk) => {
        raw += chunk;
        if (raw.length > 65536) req.destroy(new Error('payload too large'));
      });
      req.on('end', () => {
        try {
          resolve(raw ? JSON.parse(raw) : {});
        } catch {
          reject(new Error('Invalid JSON payload'));
        }
      });
      req.on('error', reject);
    });
  }

  ctx.effect(() =>
    ctx.tools.register({
      name: 'preview_register',
      description:
        'Expose an HTTP service that listens on 127.0.0.1:<port> inside this container at a public HTTPS URL ' +
        'https://<port>.<domain>, through the existing Cloudflare tunnel. Creates the DNS record and adds a ' +
        'token-gated proxy entry, then returns the ready-to-open URL. The service must already be listening.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          port: {
            type: 'integer',
            description: 'Local listening port, 1024-65535. Confirm the service answers on it before registering; a port that is not listening fails the public URL with 502.',
          },
          label: {
            type: 'string',
            description: 'One-line purpose shown by preview_list, so a later preview_unregister can tell which entry to drop.',
          },
        },
        required: ['port'],
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: String(value) }],
      },
      async execute(args) {
        const port = Number(args?.port);
        const label = args?.label;
        const res = await doRegister(port, label, execAgentId());
        const { existed, dns } = res;
        const lines = [
          `${existed ? '已更新' : '已登记'}端口 ${port}${entries[port].label ? `（${entries[port].label}）` : ''}`,
          `  打开：${shareUrlOf(port)}`,
          `  干净地址（已带 cookie 的浏览器）：${urlOf(port)}`,
          `  DNS：${dns.ok ? dns.detail : `未建成（${dns.detail}）——域名可能解析不到，稍后重试登记`}`,
          `  隧道：${tunnelConnectedAt ? '已连接' : '未连接（cloudflared 正在重试，域名可能暂时打不开）'}`,
        ];
        if (!dns.ok) lines.push('  提示：DNS 失败通常是 cloudflared 未授权（~/.cloudflared/cert.pem 缺失）或域名不在该账号下。');
        return lines.join('\n');
      },
    }),
  );

  ctx.effect(() =>
    ctx.tools.register({
      name: 'preview_unregister',
      description:
        'Remove a registered preview: its public URL stops proxying immediately and returns 403. ' +
        'With a bound Cloudflare API token the DNS record is deleted too (dnsOnUnregister=delete); ' +
        'otherwise the record is kept, so registering the same port again is instant.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          port: { type: 'integer', description: 'Port previously passed to preview_register.' },
        },
        required: ['port'],
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: String(value) }],
      },
      async execute(args) {
        const port = Number(args?.port);
        const { dns } = await doUnregister(port);
        return [
          `已注销端口 ${port}`,
          `  https://${port}.${cfg.domain}/ 现在返回 403（登记表里已经没有这一行）`,
          dns.ok
            ? `  DNS：${dns.detail}${/保留/.test(dns.detail) ? '（重新登记同一端口即刻生效）' : ''}`
            : `  DNS：记录没删掉（${dns.detail}）——登记表已清空，公网已经打不开，域名解析上还留着一条 CNAME`,
        ].join('\n');
      },
    }),
  );

  ctx.effect(() =>
    ctx.tools.register({
      name: 'preview_list',
      description:
        'List every registered preview with its public URL and whether the local service is still listening. ' +
        'Use it to decide which entries to retire with preview_unregister.',
      parameters: { type: 'object', additionalProperties: false, properties: {} },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: String(value) }],
      },
      async execute() {
        const live = listeningPorts();
        const rows = Object.entries(entries).map(([p, e]) => ({ port: Number(p), ...e }));
        if (!rows.length) return '当前没有任何登记的预览入口。';
        rows.sort((a, b) => a.port - b.port);
        const body = rows
          .map((r) => {
            const state = live.has(r.port) ? '在听' : '已停（入口会 502）';
            const label = r.label ? `  「${r.label}」` : '';
            return `  ${r.port}  ${state}${label}\n${shareUrlOf(r.port)}`;
          })
          .join('\n');
        return [
          `登记 ${rows.length} 个端口 | 隧道${tunnelConnectedAt ? '已连接' : '未连接'} | 门 ${cfg.domain}`,
          `  Cloudflare API：${cf.detail}`,
          body,
        ].join('\n');
      },
    }),
  );

  /* ---------------- REST API：供 Web 客户端侧边栏「服务」标签调用 ---------------- */
  ctx.inject(['webServer'], (scope) => {
    scope.effect(() => {
      if (!scope.webServer) return;
      return scope.webServer.register({
        kind: 'exact',
        path: '/dsh-tunnel-preview/services',
        handler: async (_req, res) => {
          try {
            const overview = getServicesOverview();
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(overview));
          } catch (err) {
            res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: false, error: err.message }));
          }
        },
      });
    });

    scope.effect(() => {
      if (!scope.webServer) return;
      return scope.webServer.register({
        kind: 'exact',
        path: '/dsh-tunnel-preview/register',
        handler: async (req, res) => {
          try {
            const body = await parseJsonBody(req);
            const port = Number(body?.port);
            const label = typeof body?.label === 'string' ? body.label : '';
            const result = await doRegister(port, label, 'web-ui');
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: true, ...result }));
          } catch (err) {
            res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: false, error: err.message }));
          }
        },
      });
    });

    scope.effect(() => {
      if (!scope.webServer) return;
      return scope.webServer.register({
        kind: 'exact',
        path: '/dsh-tunnel-preview/unregister',
        handler: async (req, res) => {
          try {
            const body = await parseJsonBody(req);
            const port = Number(body?.port);
            const result = await doUnregister(port);
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: true, ...result }));
          } catch (err) {
            res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: false, error: err.message }));
          }
        },
      });
    });
  });

  function execAgentId() {
    try {
      return String(ctx.agents?.currentInitiator()?.id || '') || undefined;
    } catch {
      return undefined;
    }
  }

  /* ---------------- 系统提示：告诉 agent 这扇门存在 ---------------- */
  ctx.effect(() =>
    ctx.systemPrompt.section({
      name: 'tunnel-preview',
      order: 800,
      text: [
        '## 预览服务对外暴露',
        '容器里起的 HTTP 服务默认只有容器内能访问。要让你自己或用户用浏览器打开，用 preview_register 把端口登记成 `https://<端口>.' +
          cfg.domain +
          '`（自动建 DNS、自动过 token 闸门），它会返回可直接打开的链接；服务用完用 preview_unregister 注销，preview_list 看当前还开着哪些。',
        '只在确实需要看的时候开，改完就收回——留着不关的入口会一直在公网上。',
        'DNS 记录能不能删取决于是否绑定了 Cloudflare API token。绑定入口：DSH 的「插件」页 → tunnel-preview → 「绑定 Cloudflare」表单里粘贴 token 保存，立即生效；没绑定时只建不删，工具返回里会说清楚。',
      ].join('\n'),
    }),
  );

  log(`插件就绪：stateDir=${stateDir} token=${token.slice(0, 6)}… tunnel=${cfg.manageTunnel ? '托管' : '外部'}`);
  cfBinding.then(() => log(`Cloudflare：${cf.detail}`));
}
