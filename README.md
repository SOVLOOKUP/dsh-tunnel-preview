# dsh-tunnel-preview

给 agent 一把「开/关公网入口」的钥匙：把容器里正在监听的端口登记成
`https://<端口>.<你的域名>`，用完自己注销。复用已有的 Cloudflare 命名隧道，
不新增对外端口、不需要人来改配置。

## 它做三件事

1. **反代**：插件监听 `127.0.0.1:9999`（`listen` 可改），隧道的 catch-all 指向它；
   它按 Host 里的端口号把请求转发到 `127.0.0.1:<端口>`。HTTP 与 WebSocket（HMR）
   走同一条路径，所以改代码的热更新在公网链接上也是通的。
2. **登记表**：只有登记过的端口才会被转发，登记表落盘在 `stateDir/previews.json`，
   宿主重启不丢。没登记的端口 403，登记完注销立刻恢复 403。
3. **闸门**：URL 不带 token 打不开（容器内直连 127.0.0.1 除外）。用
   `?dp_token=<token>` 验一次就换成一个域级 Cookie，
   之后所有端口子域都免 token，浏览器里点一次就够。

## 工具

| 工具 | 作用 |
|---|---|
| `preview_register({ port, label? })` | 建 DNS 记录（API 优先，退回 CLI）+ 入登记表，返回可直接打开的链接 |
| `preview_unregister({ port })` | 出登记表，公网入口立刻 403；绑定了 API token 时顺带删 DNS 记录 |
| `preview_list()` | 列出所有登记项：端口、公网地址、本地服务还在不在听 |

登记前服务必须已经在听（插件读 `/proc/net/tcp{,6}` 的 LISTEN 套接字判断），
否则登记出来的链接是 502——先起服务，再登记。

## GUI：右侧栏「服务」标签与快捷入口

插件为 DSH Web 界面提供了内置伴生前端：

1. **右侧栏「服务」标签（Services Tab）**：
   - 位于 DSH 右侧栏标签页，图标为专用服务/网络地球标；
   - **服务卡片一览**：实时展示所有通过隧道暴露的端口、备注、公网域名与创建时间；
   - **在线状态检测**：动态检测本地端口监听状态（🟢 正常监听 / 🔴 端口未监听）；
   - **一键快捷操作**：
     - 🚀 **新标签打开**：浏览器新窗口直接打开免密分享链接；
     - 🌐 **侧栏并排预览**：与内置浏览器标签页联动，在右侧栏内并排预览；
     - 📋 **复制链接**：带弹性动效与“已复制 ✓”浮动反馈；
     - 🗑️ **注销服务**：一键安全注销并切断公网访问（若绑定 Cloudflare Token 则自动清理 DNS 记录）；
   - **快速暴露新端口**：支持自动探测容器内当前正在监听的本地端口（如 `:3000`、`:8000`），支持一键快速暴露；
   - **隧道与 DNS 状态**：底部常驻提示 Cloudflare 隧道连接状态与 API 绑定情况。
2. **会话顶栏快捷入口**：
   - 会话右上角工具条常驻「暴露的服务」图标按钮，点击直接展开右侧栏并聚焦到「服务」标签。
3. **REST API 扩展**：
   - `GET /api/tunnel-preview/services`：获取当前暴露服务、候选端口与隧道状态；
   - `POST /api/tunnel-preview/register`：动态暴露端口 `{ port, label }`；
   - `POST /api/tunnel-preview/unregister`：动态注销端口 `{ port }`。


## 配置

见 `cordis.patch.yml`，全部有默认值：

| 键 | 默认 | 说明 |
|---|---|---|
| `listen` | `9999` | 反代监听地址，必须与隧道 config 的 catch-all 一致 |
| `domain` | `example.com` | 子域后缀（主域名）。设置页「公网域名」可改，保存立即生效 |
| `stateDir` | `$HOME/devpreview` | token、`previews.json` 落盘目录 |
| `tunnelName` | `dsh-dev` | `cloudflared tunnel route dns` 用的隧道名 |
| `cloudflared` | `$HOME/bin/cloudflared` | 可执行文件 |
| `tunnelConfig` | `$HOME/.cloudflared/config.yml` | 隧道 config |
| `manageTunnel` | `true` | 托管 cloudflared 进程：宿主退出一起走，崩了自动重连（最多 5 次） |
| `manageDns` | `true` | 登记时自动建 CNAME（已存在视为成功） |
| `deny` | VNC/调试端口 | 永不公开的端口 |
| `rewriteHost` | `true` | 改写 Host/Origin/Referer，避免 dev server 的 host 校验拦截 |
| `cookieMaxAge` | `2592000` | 域级 Cookie 有效期（秒） |
| `minPort` | `1024` | 允许公开的最小端口 |
| `cloudflareApiToken` | 空 | **粘贴即绑定**：插件自己校验 token、自己找 zone，之后 DNS 记录能建也能删。字段是 `secret` + `volatile`：读回不回显明文，保存只热更新、不重挂插件 |
| `cloudflareZoneId` / `cloudflareAccountId` | 空 | 一般留空，自动探测 |
| `dnsOnUnregister` | `delete` | 注销时的 DNS：`delete` 删（需已绑定 token）/ `keep` 留 |

## 用哪个域名

预览地址是 `https://<端口>.<domain>`。域名不写死在代码里，在插件设置里改：

1. 打开 **DSH 侧栏 → 插件 → tunnel-preview**。
2. 在表单最上面的 **「公网域名」** 填主域名，不要带 `https://` 和端口，例如 `example.com`。
3. 点 **保存**。`domain` 是 volatile 字段：宿主只更新这一项并重跑绑定，不重载插件。已填 token 时会按新域名重新查 zone。

出厂默认是插件自带 `cordis.patch.yml` 里的 `domain: example.com`。如果在 **profile** 的 `cordis.patch.yml` 里给 `tunnel-preview` 写了 `config`，loader 是整对象覆盖：那一份里的 `domain` 才是初始值，插件自带的这份不再生效。之后仍以设置页保存的值为准。

## 在设置里一键绑定 Cloudflare

不绑定也能用：建记录走 `cloudflared tunnel route dns`，只是**删不掉**。要让插件自己管 DNS：

### 推荐方式：官方模板一键直达（免手动勾选权限）

1. 进 **DSH 侧栏 → 插件 → tunnel-preview**，点击设置表单上的 **「⚡ 直达 Cloudflare 生成 Token ↗」**，或直接打开预置权限直达链接：
   > [Cloudflare API Token 预填创建页](https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=%5B%7B%22key%22%3A%22dns%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22zone%22%2C%22type%22%3A%22read%22%7D%5D&accountId=*&zoneId=all&name=DSH-Tunnel-Preview)  
   （已自动预选好 `Zone → DNS → Edit` 与 `Zone → Zone → Read` 权限，名称预设为 `DSH-Tunnel-Preview`）
2. 页面底部点击 **Continue to summary** → **Create Token**
3. 点击 **Copy** 复制生成的 Token，回到 DSH 插件设置页粘贴并保存即可！

保存即热生效（不重挂插件）：宿主只更新 `domain` 和那三个 Cloudflare volatile 字段并重跑绑定。`preview_list()` 顶部会显示
`Cloudflare API：已绑定（zone example.com …）`；失败也在这里写明原因
（token 无效 / 缺 Zone.Zone Read / 网络不通），不会静默降级。

表单只认四个**顶层**字段（`domain` / `cloudflareApiToken` / `cloudflareAccountId` / `cloudflareZoneId`）。
旧的嵌套 `cloudflare: { apiToken, accountId, zoneId }` 仍能被读到，但只要 patch 里写过任一
平铺字段，就以平铺为准。token 落在 profile 的 patch 里，字段标了 `role('secret')`：
设置页与远程调用方读回时是占位符，不回显明文。

绑定后行为变化：

- `preview_register` 直接打 API 建记录，不再依赖 `~/.cloudflared/cert.pem`；
- `preview_unregister` 顺手删掉记录（`dnsOnUnregister=delete`），公网零残留；
- 记录已存在但指向**别的**隧道时不覆盖，如实报错——不静默改别人的解析。

## 已知取舍

- **DNS 记录删不删，看有没有绑定**：未绑定 API token 时建记录只能走 CLI，于是只建不删
  （留着无害，通不通由登记表决定）；绑定后默认 `dnsOnUnregister=delete`，注销即清干净。
- **公网可见**：这是真的公网入口，token 只挡「猜不到」的人。要让陌生人彻底进不来，
  应在 Cloudflare 侧加 Access 策略，而不是依赖这里的 token。
- **只支持一级子域**：`5173.example.com` 可以，`5173.dev.example.com` 不行
  （Universal SSL 只覆盖一级子域，二级要付费 ACM）。

## 迁移自手写脚本

这套逻辑原先散在 `/workspace/devpreview/{dispatcher.mjs,start.sh,addport.sh}`。
装插件前先停掉旧栈，否则 `9999` 被占：

```bash
/workspace/devpreview/start.sh stop
```

之后 dispatcher 与 cloudflared 都由插件托管，`addport.sh` 的职责换成
`preview_register` 工具。旧的 `.token` 继续被复用，已发出去的链接不会失效。

## 测试

```bash
node --check index.js && node --test test/
```

- `test/host.test.mjs`：纯函数（Host 解析、端口白名单、cookie、隧道 UUID、schema 兜底）
- `test/cloudflare.test.mjs`：本地起一个 Cloudflare API 桩，跑绑定、建记录幂等、指向冲突、
  删记录、缺隧道 UUID —— 不碰真 Cloudflare，也不要求有 token

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)

