/**
 * dsh-tunnel-preview 浏览器伴生包：
 * 1. 在右侧栏（Sidebar Right）中注册「服务」标签（Services Tab），实时一览并管理所有暴露的端口服务。
 * 2. 在会话顶部（Session Header）提供快速打开「服务」标签的快捷入口。
 * 3. 在 DSH「插件」页的 tunnel-preview 卡片里渲染「绑定 Cloudflare」表单。
 */
window.__ModuleLoader__.load({
  id: 'dsh-tunnel-preview',
  factory: (require) => {
    'use strict';
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

    let react_jsx_runtime = require('react/jsx-runtime');
    let react = require('react');
    let _deepseek_ai_dsh_client_ui_primitives = require('@deepseek-ai/dsh-client-ui-primitives');

    const NS = 'tunnel-preview';
    const SERVICES_ID = 'dsh-tunnel-preview/services';
    const SERVICES_KIND = 'services';
    const CF_TEMPLATE_URL =
      'https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=%5B%7B%22key%22%3A%22dns%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22zone%22%2C%22type%22%3A%22read%22%7D%5D&accountId=*&zoneId=all&name=DSH-Tunnel-Preview';

    //#region locales
    const en = {
      title: 'Bind Cloudflare',
      intro:
        'Paste a Cloudflare API token to let this plugin create and delete preview DNS records itself (no cert.pem needed). Saves immediately — no reload.',
      domain: 'Public domain',
      domainHint:
        'Apex domain you control in Cloudflare, with no scheme or port — for example example.com. Preview URLs are https://<port>.<domain>. Saves immediately.',
      token: 'API token',
      tokenHint: 'Write-only field: the token is never echoed back. Required scopes: Zone.DNS Edit + Zone.Zone Read (+ Account Tunnel Read).',
      accountId: 'Account ID (optional)',
      accountIdHint: 'Leave empty to auto-detect (a token belongs to one account).',
      zoneId: 'Zone ID (optional)',
      zoneIdHint: 'Leave empty to look up the zone by the configured domain.',
      overridden: 'Overridden',
      reset: 'Reset to default',
      unavailable: 'Cloudflare binding is unavailable.',
      readOnly: 'This deployment stores settings read-only.',
      saveFailed: 'The deployment did not accept these values; they were left for you to correct.',
      save: 'Save',
      saving: 'Saving…',
      unsaved: 'Unsaved changes',
      saved: 'Saved — binding is being reapplied. Run preview_list to see the result.',

      // Services panel copy
      'services.panelTitle': 'Exposed Services',
      'services.tabTitle': 'Services',
      'services.guideTitle': 'Services',
      'services.guideDesc': 'Inspect and manage local preview services exposed via tunnel',
      'services.headerTooltip': 'Exposed Services',
      'services.empty': 'No local services exposed via tunnel yet',
      'services.emptyHint': 'Start a web service inside the container, then expose its port here or via preview_register tool.',
      'services.refresh': 'Refresh',
      'services.newService': 'Expose Port',
      'services.closeForm': 'Cancel',
      'services.port': 'Port',
      'services.portPlaceholder': 'e.g. 3000',
      'services.label': 'Label / Purpose (optional)',
      'services.labelPlaceholder': 'e.g. Web Frontend',
      'services.submit': 'Expose Now',
      'services.submitting': 'Exposing…',
      'services.openWindow': 'Open in Tab',
      'services.openSidebar': 'Preview in Sidebar',
      'services.copyLink': 'Copy Link',
      'services.copied': 'Copied ✓',
      'services.unregister': 'Unregister',
      'services.unregistering': 'Removing…',
      'services.listening': 'Listening',
      'services.notListening': 'Offline',
      'services.tunnelConnected': 'Tunnel Connected',
      'services.tunnelConnecting': 'Tunnel Connecting',
      'services.cfBound': 'Cloudflare API Bound (auto-cleanup DNS)',
      'services.cfUnbound': 'No API Token (DNS kept on unregister)',
      'services.quickCreateLink': '⚡ Quick Create Token',
      'services.detectedPorts': 'Detected local ports:',
      'services.serviceCount': '{n} active',
      'services.zeroCount': 'None',
      quickCreateTitle: 'Quick Create Token (Pre-configured)',
      quickCreateDesc: 'Open Cloudflare token creation page with pre-configured permissions (Zone.DNS Edit + Zone.Zone Read). No need to search or configure scopes manually.',
      quickCreateBtn: '⚡ Generate Token on Cloudflare ↗',
      quickStep1: '1. Click the button above to open Cloudflare with scopes pre-filled.',
      quickStep2: '2. Scroll to the bottom and click "Continue to summary" → "Create Token".',
      quickStep3: '3. Copy the token, paste it into the field below, and click "Save".',
    };

    const zh = {
      title: '绑定 Cloudflare',
      intro:
        '粘贴 Cloudflare API token 即可让插件自己创建/删除预览子域的 DNS 记录（不再需要 cert.pem）。保存立即生效，无需重载。',
      domain: '公网域名',
      domainHint:
        '填你在 Cloudflare 托管的主域名，不要带协议或端口，例如 example.com。预览地址是 https://<端口>.<域名>。保存立即生效。',
      token: 'API token',
      tokenHint: '只写字段：token 不会回显，留空保持现有绑定不变。所需权限：Zone.DNS Edit + Zone.Zone Read（可加 Account Tunnel Read）。',
      accountId: '账号 id（可选）',
      accountIdHint: '留空自动探测（一个 token 只属于一个账号）。',
      zoneId: 'zone id（可选）',
      zoneIdHint: '留空按配置的域名自动查找。',
      overridden: '已覆盖',
      reset: '恢复默认',
      unavailable: 'Cloudflare 绑定暂不可用',
      readOnly: '本部署的设置为只读',
      saveFailed: '本部署没有接受这些值，已保留供你修改',
      save: '保存',
      saving: '保存中…',
      unsaved: '有未保存的修改',
      saved: '已保存——正在重新绑定，调用 preview_list 可查看结果',

      // Services panel copy
      'services.panelTitle': '暴露的服务',
      'services.tabTitle': '服务',
      'services.guideTitle': '服务',
      'services.guideDesc': '一览与管理通过隧道暴露的本地预览服务',
      'services.headerTooltip': '暴露的服务一览',
      'services.empty': '当前暂无通过隧道对外暴露的本地服务',
      'services.emptyHint': '在容器内启动服务后，可在上方快速暴露端口，或由 agent 调用 preview_register。',
      'services.refresh': '刷新',
      'services.newService': '暴露新端口',
      'services.closeForm': '取消',
      'services.port': '本地端口',
      'services.portPlaceholder': '例如 3000',
      'services.label': '备注用途（可选）',
      'services.labelPlaceholder': '例如 Web 前端开发服务',
      'services.submit': '立即暴露',
      'services.submitting': '正在暴露…',
      'services.openWindow': '新标签打开',
      'services.openSidebar': '侧栏并排预览',
      'services.copyLink': '复制链接',
      'services.copied': '已复制 ✓',
      'services.unregister': '注销服务',
      'services.unregistering': '注销中…',
      'services.listening': '正常监听',
      'services.notListening': '未检测到监听',
      'services.tunnelConnected': 'Cloudflare 隧道已连接',
      'services.tunnelConnecting': 'Cloudflare 隧道重连中',
      'services.cfBound': '已绑定 Cloudflare API（注销时自动删除 DNS 记录）',
      'services.cfUnbound': '未绑定 API Token（DNS 记录将保留，可在插件设置中绑定）',
      'services.quickCreateLink': '⚡ 快速生成 Token',
      'services.detectedPorts': '检测到本地监听端口：',
      'services.serviceCount': '{n} 个在线',
      'services.zeroCount': '暂无服务',
      quickCreateTitle: '一键预置权限生成 Token',
      quickCreateDesc: '通过 Cloudflare 官方模板链接直达创建页（已自动选好 Zone.DNS Edit 与 Zone.Zone Read 权限），无需手动逐项翻找配置。',
      quickCreateBtn: '⚡ 直达 Cloudflare 生成 Token ↗',
      quickStep1: '1. 点击上方按钮，在新窗口直达 Cloudflare 创建页（权限与名称已自动选好）；',
      quickStep2: '2. 页面底部点击「Continue to summary」→「Create Token」完成创建；',
      quickStep3: '3. 点击「Copy」复制 Token，回到此处粘贴在下方输入框，点击「保存」。',
    };

    function formLabels(t) {
      return {
        unavailable: t('unavailable'),
        readOnly: t('readOnly'),
        saveFailed: t('saveFailed'),
        save: t('save'),
        saving: t('saving'),
      };
    }
    //#endregion

    //#region CSS Injection
    const CSS_TAG_ID = 'dsh-tunnel-preview/services.css';
    const servicesCss = `
      .tp-panel {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
        background: var(--dsw-alias-bg-base);
        color: var(--dsw-alias-label-primary);
        font-family: var(--dsw-font-family);
        overflow-y: auto;
        overflow-x: hidden;
      }
      .tp-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        border-bottom: 0.5px solid var(--dsw-alias-border-l2);
        background: var(--dsw-alias-bg-layer-1);
        gap: 8px;
        position: sticky;
        top: 0;
        z-index: 10;
      }
      .tp-header-left {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }
      .tp-header-title {
        font-size: 14px;
        font-weight: 600;
        color: var(--dsw-alias-label-primary);
        white-space: nowrap;
      }
      .tp-header-badge {
        font-size: 11px;
        font-weight: 500;
        padding: 2px 7px;
        border-radius: var(--dsw-radius-xl, 12px);
        background: var(--dsw-alias-bg-layer-2);
        color: var(--dsw-alias-label-secondary);
        white-space: nowrap;
      }
      .tp-header-badge.active {
        background: rgba(34, 197, 94, 0.15);
        color: var(--dsw-static-green-500, #22c55e);
      }
      .tp-header-actions {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .tp-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        border: 0.5px solid var(--dsw-alias-border-l3);
        background: var(--dsw-alias-bg-layer-2);
        color: var(--dsw-alias-label-primary);
        font-size: 12px;
        line-height: 1.2;
        padding: 5px 9px;
        border-radius: var(--dsw-radius-sm, 6px);
        cursor: pointer;
        transition: all 0.15s ease;
        user-select: none;
      }
      .tp-btn:hover:not(:disabled) {
        background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
        border-color: var(--dsw-alias-border-l4);
        transform: scale(0.98);
      }
      .tp-btn:active:not(:disabled) {
        transform: scale(0.95);
      }
      .tp-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .tp-btn-primary {
        background: var(--dsw-alias-brand-primary, #3964fe);
        color: #fff;
        border-color: transparent;
      }
      .tp-btn-primary:hover:not(:disabled) {
        background: color-mix(in srgb, var(--dsw-alias-brand-primary, #3964fe) 88%, #000);
      }
      .tp-btn-icon-only {
        padding: 5px;
        width: 26px;
        height: 26px;
      }
      .tp-spinning {
        animation: tp-spin 0.8s linear infinite;
      }
      @keyframes tp-spin {
        100% { transform: rotate(360deg); }
      }
      .tp-form-box {
        margin: 12px 16px 4px 16px;
        padding: 12px;
        border-radius: var(--dsw-radius-md, 8px);
        background: var(--dsw-alias-bg-layer-1);
        border: 0.5px solid var(--dsw-alias-border-l2);
        display: flex;
        flex-direction: column;
        gap: 10px;
        animation: tp-slide-down 0.2s cubic-bezier(0.2, 0, 0, 1);
      }
      @keyframes tp-slide-down {
        from { opacity: 0; transform: translateY(-6px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .tp-form-row {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .tp-form-label {
        font-size: 11px;
        color: var(--dsw-alias-label-secondary);
        font-weight: 500;
      }
      .tp-input {
        background: var(--dsw-alias-bg-base);
        border: 0.5px solid var(--dsw-alias-border-l3);
        border-radius: var(--dsw-radius-sm, 6px);
        color: var(--dsw-alias-label-primary);
        font-size: 13px;
        padding: 6px 10px;
        outline: none;
        transition: border-color 0.15s ease;
      }
      .tp-input:focus {
        border-color: var(--dsw-alias-brand-primary, #3964fe);
      }
      .tp-candidates {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        color: var(--dsw-alias-label-secondary);
      }
      .tp-chip {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        padding: 2px 7px;
        background: var(--dsw-alias-bg-layer-2);
        border: 0.5px solid var(--dsw-alias-border-l3);
        border-radius: var(--dsw-radius-sm, 4px);
        color: var(--dsw-alias-label-primary);
        cursor: pointer;
        font-weight: 500;
        transition: all 0.15s ease;
      }
      .tp-chip:hover {
        border-color: var(--dsw-alias-brand-primary, #3964fe);
        background: var(--dsw-alias-interactive-bg-hover);
      }
      .tp-services-list {
        padding: 12px 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        flex: 1;
      }
      .tp-card {
        background: var(--dsw-alias-bg-layer-1);
        border: 0.5px solid var(--dsw-alias-border-l2);
        border-radius: var(--dsw-radius-md, 8px);
        padding: 12px 14px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
      }
      .tp-card:hover {
        border-color: var(--dsw-alias-border-l4);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
      }
      .tp-card-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .tp-card-port-wrap {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .tp-status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .tp-status-dot.online {
        background: #22c55e;
        box-shadow: 0 0 6px rgba(34, 197, 94, 0.6);
      }
      .tp-status-dot.offline {
        background: #ef4444;
        box-shadow: 0 0 6px rgba(239, 68, 68, 0.4);
      }
      .tp-port-title {
        font-size: 14px;
        font-weight: 700;
        letter-spacing: -0.2px;
        font-family: var(--dsh-font-family-code-default, monospace);
        color: var(--dsw-alias-label-primary);
      }
      .tp-tag {
        font-size: 11px;
        padding: 2px 6px;
        border-radius: var(--dsw-radius-xs, 4px);
        background: var(--dsw-alias-bg-layer-2);
        color: var(--dsw-alias-label-secondary);
        max-width: 150px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .tp-time {
        font-size: 11px;
        color: var(--dsw-alias-label-caption, #888);
      }
      .tp-card-url-box {
        display: flex;
        align-items: center;
        background: var(--dsw-alias-bg-base);
        border: 0.5px solid var(--dsw-alias-border-l2);
        border-radius: var(--dsw-radius-sm, 6px);
        padding: 6px 10px;
        font-size: 12px;
        font-family: var(--dsh-font-family-code-default, monospace);
        color: var(--dsw-alias-label-secondary);
        word-break: break-all;
        user-select: all;
      }
      .tp-card-actions {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 4px;
        flex-wrap: wrap;
      }
      .tp-card-action-btn {
        font-size: 11px;
        padding: 4px 8px;
        border-radius: var(--dsw-radius-xs, 4px);
      }
      .tp-btn-danger {
        color: var(--dsw-alias-state-error-primary, #ef4444);
        border-color: rgba(239, 68, 68, 0.2);
        margin-left: auto;
      }
      .tp-btn-danger:hover:not(:disabled) {
        background: rgba(239, 68, 68, 0.08);
        border-color: rgba(239, 68, 68, 0.4);
      }
      .tp-empty-box {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 48px 24px;
        text-align: center;
        gap: 12px;
        color: var(--dsw-alias-label-secondary);
      }
      .tp-empty-icon {
        color: var(--dsw-alias-label-tertiary, #999);
        margin-bottom: 4px;
      }
      .tp-empty-title {
        font-size: 14px;
        font-weight: 500;
        color: var(--dsw-alias-label-primary);
      }
      .tp-empty-hint {
        font-size: 12px;
        line-height: 1.5;
        max-width: 280px;
        color: var(--dsw-alias-label-secondary);
      }
      .tp-footer-status {
        padding: 10px 16px;
        border-top: 0.5px solid var(--dsw-alias-border-l2);
        background: var(--dsw-alias-bg-layer-1);
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-size: 11px;
        color: var(--dsw-alias-label-secondary);
      }
      .tp-footer-item {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .tp-tab-title-wrap {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .tp-header-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border-radius: var(--dsw-radius-sm, 6px);
        border: none;
        background: transparent;
        color: var(--dsw-alias-label-secondary);
        cursor: pointer;
        padding: 0;
        transition: all 0.15s ease;
      }
      .tp-header-btn:hover {
        background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.06));
        color: var(--dsw-alias-label-primary);
      }
      .tp-quick-banner {
        margin: 10px 0 16px 0;
        padding: 12px 14px;
        border-radius: var(--dsw-radius-md, 8px);
        background: color-mix(in srgb, #f38020 8%, var(--dsw-alias-bg-layer-1));
        border: 0.5px solid color-mix(in srgb, #f38020 30%, var(--dsw-alias-border-l2));
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .tp-quick-banner-header {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .tp-quick-banner-title {
        font-size: 13px;
        font-weight: 600;
        color: var(--dsw-alias-label-primary);
      }
      .tp-quick-banner-desc {
        font-size: 12px;
        line-height: 1.5;
        color: var(--dsw-alias-label-secondary);
      }
      .tp-btn-cf {
        align-self: flex-start;
        background: #f38020;
        color: #fff;
        border-color: transparent;
        font-weight: 500;
        padding: 6px 12px;
        box-shadow: 0 1px 3px rgba(243, 128, 32, 0.25);
      }
      .tp-btn-cf:hover:not(:disabled) {
        background: #e56d10;
        box-shadow: 0 2px 6px rgba(243, 128, 32, 0.35);
      }
      .tp-quick-steps {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding-top: 6px;
        border-top: 0.5px dashed color-mix(in srgb, #f38020 25%, var(--dsw-alias-border-l2));
      }
      .tp-quick-step-item {
        font-size: 11px;
        color: var(--dsw-alias-label-secondary);
        line-height: 1.4;
      }
    `;

    if (typeof document !== 'undefined' && document.querySelector(`style[data-plugin-css="${CSS_TAG_ID}"]`) === null) {
      const styleTag = document.createElement('style');
      styleTag.dataset.plugin = 'dsh-tunnel-preview';
      styleTag.dataset.pluginCss = CSS_TAG_ID;
      styleTag.textContent = servicesCss;
      document.head.appendChild(styleTag);
    }
    //#endregion

    //#region Icon
    function CloudflareIcon({ size = 16, className = '' }) {
      return react_jsx_runtime.jsx('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        className,
        children: react_jsx_runtime.jsx('path', {
          d: 'M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z',
          fill: '#f38020',
        }),
      });
    }

    function ServicesIcon({ size = 16, className = '' }) {
      return react_jsx_runtime.jsxs('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        className,
        children: [
          react_jsx_runtime.jsx('circle', { cx: '12', cy: '12', r: '10' }),
          react_jsx_runtime.jsx('line', { x1: '2', y1: '12', x2: '22', y2: '12' }),
          react_jsx_runtime.jsx('path', {
            d: 'M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z',
          }),
        ],
      });
    }

    function RefreshIcon({ size = 13, className = '' }) {
      return react_jsx_runtime.jsxs('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        className,
        children: [
          react_jsx_runtime.jsx('path', { d: 'M21.5 2v6h-6' }),
          react_jsx_runtime.jsx('path', { d: 'M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67' }),
        ],
      });
    }

    function ExternalIcon({ size = 12, className = '' }) {
      return react_jsx_runtime.jsxs('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        className,
        children: [
          react_jsx_runtime.jsx('path', { d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' }),
          react_jsx_runtime.jsx('polyline', { points: '15 3 21 3 21 9' }),
          react_jsx_runtime.jsx('line', { x1: '10', y1: '14', x2: '21', y2: '3' }),
        ],
      });
    }

    function CopyIcon({ size = 12, className = '' }) {
      return react_jsx_runtime.jsxs('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        className,
        children: [
          react_jsx_runtime.jsx('rect', { x: '9', y: '9', width: '13', height: '13', rx: '2', ry: '2' }),
          react_jsx_runtime.jsx('path', { d: 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' }),
        ],
      });
    }

    function TrashIcon({ size = 12, className = '' }) {
      return react_jsx_runtime.jsxs('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        className,
        children: [
          react_jsx_runtime.jsx('polyline', { points: '3 6 5 6 21 6' }),
          react_jsx_runtime.jsx('path', { d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' }),
        ],
      });
    }
    //#endregion

    //#region Tab View & Components
    function ServicesTitle({ t }) {
      return react_jsx_runtime.jsxs('span', {
        className: 'tp-tab-title-wrap',
        children: [
          react_jsx_runtime.jsx(ServicesIcon, { size: 14 }),
          react_jsx_runtime.jsx('span', { children: t('services.tabTitle') }),
        ],
      });
    }

    function ServicesHeaderAction({ openServicesTab, t }) {
      return react_jsx_runtime.jsx('button', {
        type: 'button',
        className: 'tp-header-btn',
        title: t('services.headerTooltip'),
        'aria-label': t('services.headerTooltip'),
        onClick: openServicesTab,
        children: react_jsx_runtime.jsx(ServicesIcon, { size: 16 }),
      });
    }

    function ServicesPanel(props) {
      const { t, ctx } = props;
      const [data, setData] = react.useState({
        services: [],
        candidatePorts: [],
        tunnelConnected: false,
        cloudflare: { bound: false, detail: '' },
      });
      const [backendReady, setBackendReady] = react.useState(true);
      const [loading, setLoading] = react.useState(true);
      const [refreshing, setRefreshing] = react.useState(false);
      const [showForm, setShowForm] = react.useState(false);
      const [newPort, setNewPort] = react.useState('');
      const [newLabel, setNewLabel] = react.useState('');
      const [submitting, setSubmitting] = react.useState(false);
      const [formError, setFormError] = react.useState(null);
      const [copiedPort, setCopiedPort] = react.useState(null);
      const [unregisteringPort, setUnregisteringPort] = react.useState(null);

      const fetchServices = react.useCallback(async (silent = false) => {
        if (!silent) setRefreshing(true);
        try {
          const res = await fetch('/dsh-tunnel-preview/services', { cache: 'no-store' });
          const text = await res.text();
          if (res.ok) {
            try {
              const json = JSON.parse(text);
              if (json && json.ok) {
                setData(json);
                setBackendReady(true);
              }
            } catch {
              // response is not json
            }
          } else {
            setBackendReady(false);
          }
        } catch {
          // ignore network poll error
        } finally {
          setLoading(false);
          setRefreshing(false);
        }
      }, []);

      // Auto poll every 4 seconds
      react.useEffect(() => {
        fetchServices(false);
        const timer = setInterval(() => {
          fetchServices(true);
        }, 4000);
        return () => clearInterval(timer);
      }, [fetchServices]);

      const handleRegister = async (e) => {
        if (e) e.preventDefault();
        const p = parseInt(newPort, 10);
        if (isNaN(p) || p < 1024 || p > 65535) {
          setFormError('请输入合法的端口号（1024-65535）');
          return;
        }
        setSubmitting(true);
        setFormError(null);
        try {
          const res = await fetch('/dsh-tunnel-preview/register', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ port: p, label: newLabel.trim() }),
          });
          const text = await res.text();
          let json = null;
          try {
            json = JSON.parse(text);
          } catch {}
          if (res.ok && json && json.ok) {
            setNewPort('');
            setNewLabel('');
            setShowForm(false);
            fetchServices(false);
          } else {
            setFormError((json && json.error) || '暴露失败');
          }
        } catch (err) {
          setFormError(err.message || '网络请求失败');
        } finally {
          setSubmitting(false);
        }
      };

      const handleUnregister = async (port) => {
        setUnregisteringPort(port);
        try {
          const res = await fetch('/dsh-tunnel-preview/unregister', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ port }),
          });
          const text = await res.text();
          let json = null;
          try {
            json = JSON.parse(text);
          } catch {}
          if (res.ok && json && json.ok) {
            fetchServices(false);
          }
        } catch {
          // ignore
        } finally {
          setUnregisteringPort(null);
        }
      };

      const handleCopy = (port, url) => {
        if (navigator.clipboard) {
          navigator.clipboard.writeText(url).then(() => {
            setCopiedPort(port);
            setTimeout(() => setCopiedPort(null), 2000);
          });
        }
      };

      const handleOpenSidebarBrowser = (url) => {
        try {
          if (ctx.sidebarRight && ctx.sidebarRightTabs && ctx.sidebarRightTabs.get('browser')) {
            ctx.sidebarRight.openTab('browser', { params: { url } });
            return;
          }
        } catch {
          // fallback
        }
        window.open(url, '_blank');
      };

      const formatTime = (iso) => {
        if (!iso) return '';
        try {
          const d = new Date(iso);
          return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
        } catch {
          return iso;
        }
      };

      const services = data.services || [];
      const candidatePorts = data.candidatePorts || [];

      return react_jsx_runtime.jsxs('div', {
        className: 'tp-panel',
        children: [
          // Header
          react_jsx_runtime.jsxs('div', {
            className: 'tp-panel-header',
            children: [
              react_jsx_runtime.jsxs('div', {
                className: 'tp-header-left',
                children: [
                  react_jsx_runtime.jsx(ServicesIcon, { size: 16 }),
                  react_jsx_runtime.jsx('span', {
                    className: 'tp-header-title',
                    children: t('services.panelTitle'),
                  }),
                  react_jsx_runtime.jsx('span', {
                    className: `tp-header-badge ${services.length > 0 ? 'active' : ''}`,
                    children: services.length > 0 ? `${services.length} 在线` : t('services.zeroCount'),
                  }),
                ],
              }),
              react_jsx_runtime.jsxs('div', {
                className: 'tp-header-actions',
                children: [
                  react_jsx_runtime.jsx('button', {
                    type: 'button',
                    className: 'tp-btn tp-btn-icon-only',
                    title: t('services.refresh'),
                    onClick: () => fetchServices(false),
                    disabled: refreshing,
                    children: react_jsx_runtime.jsx(RefreshIcon, {
                      size: 13,
                      className: refreshing ? 'tp-spinning' : '',
                    }),
                  }),
                  react_jsx_runtime.jsx('button', {
                    type: 'button',
                    className: 'tp-btn tp-btn-primary',
                    onClick: () => setShowForm(!showForm),
                    children: showForm ? t('services.closeForm') : `+ ${t('services.newService')}`,
                  }),
                ],
              }),
            ],
          }),

          // Backend Pending Notice
          !backendReady &&
            react_jsx_runtime.jsxs('div', {
              style: {
                margin: '10px 16px 0 16px',
                padding: '10px 12px',
                borderRadius: 'var(--dsw-radius-sm, 6px)',
                background: 'rgba(57, 100, 254, 0.08)',
                border: '0.5px solid rgba(57, 100, 254, 0.25)',
                fontSize: 12,
                lineHeight: 1.5,
                color: 'var(--dsw-alias-label-secondary)',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              },
              children: [
                react_jsx_runtime.jsx('div', {
                  style: { fontWeight: 600, color: 'var(--dsw-alias-brand-primary, #3964fe)' },
                  children: '💡 后端插件路由就绪中',
                }),
                react_jsx_runtime.jsx('div', {
                  children:
                    '插件前端界面已更新。若宿主刚更新，待下一次重载后后台路由将完全连通；在此期间您可直接在会话中由 Agent 使用 preview_list 等工具管理服务。',
                }),
              ],
            }),

          // Expose Form (Collapsible)
          showForm &&
            react_jsx_runtime.jsxs('form', {
              className: 'tp-form-box',
              onSubmit: handleRegister,
              children: [
                candidatePorts.length > 0 &&
                  react_jsx_runtime.jsxs('div', {
                    className: 'tp-candidates',
                    children: [
                      react_jsx_runtime.jsx('span', { children: t('services.detectedPorts') }),
                      candidatePorts.map((cp) =>
                        react_jsx_runtime.jsx(
                          'span',
                          {
                            className: 'tp-chip',
                            onClick: () => setNewPort(String(cp)),
                            children: `:${cp}`,
                          },
                          cp,
                        ),
                      ),
                    ],
                  }),
                react_jsx_runtime.jsxs('div', {
                  className: 'tp-form-row',
                  children: [
                    react_jsx_runtime.jsx('label', {
                      className: 'tp-form-label',
                      children: t('services.port'),
                    }),
                    react_jsx_runtime.jsx('input', {
                      type: 'number',
                      min: 1024,
                      max: 65535,
                      className: 'tp-input',
                      placeholder: t('services.portPlaceholder'),
                      value: newPort,
                      onChange: (e) => setNewPort(e.target.value),
                      required: true,
                    }),
                  ],
                }),
                react_jsx_runtime.jsxs('div', {
                  className: 'tp-form-row',
                  children: [
                    react_jsx_runtime.jsx('label', {
                      className: 'tp-form-label',
                      children: t('services.label'),
                    }),
                    react_jsx_runtime.jsx('input', {
                      type: 'text',
                      maxLength: 120,
                      className: 'tp-input',
                      placeholder: t('services.labelPlaceholder'),
                      value: newLabel,
                      onChange: (e) => setNewLabel(e.target.value),
                    }),
                  ],
                }),
                formError &&
                  react_jsx_runtime.jsx('div', {
                    style: { color: 'var(--dsw-alias-state-error-primary, #ef4444)', fontSize: 11 },
                    children: formError,
                  }),
                react_jsx_runtime.jsxs('div', {
                  style: { display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 4 },
                  children: [
                    react_jsx_runtime.jsx('button', {
                      type: 'button',
                      className: 'tp-btn',
                      onClick: () => setShowForm(false),
                      children: t('services.closeForm'),
                    }),
                    react_jsx_runtime.jsx('button', {
                      type: 'submit',
                      className: 'tp-btn tp-btn-primary',
                      disabled: submitting,
                      children: submitting ? t('services.submitting') : t('services.submit'),
                    }),
                  ],
                }),
              ],
            }),

          // Service List
          react_jsx_runtime.jsx('div', {
            className: 'tp-services-list',
            children:
              services.length === 0 && !loading
                ? react_jsx_runtime.jsxs('div', {
                    className: 'tp-empty-box',
                    children: [
                      react_jsx_runtime.jsx('div', {
                        className: 'tp-empty-icon',
                        children: react_jsx_runtime.jsx(ServicesIcon, { size: 36 }),
                      }),
                      react_jsx_runtime.jsx('div', {
                        className: 'tp-empty-title',
                        children: t('services.empty'),
                      }),
                      react_jsx_runtime.jsx('div', {
                        className: 'tp-empty-hint',
                        children: t('services.emptyHint'),
                      }),
                      candidatePorts.length > 0 &&
                        react_jsx_runtime.jsxs('div', {
                          className: 'tp-candidates',
                          style: { marginTop: 8, justifyContent: 'center' },
                          children: [
                            react_jsx_runtime.jsx('span', { children: t('services.detectedPorts') }),
                            candidatePorts.map((cp) =>
                              react_jsx_runtime.jsx(
                                'button',
                                {
                                  type: 'button',
                                  className: 'tp-chip',
                                  onClick: () => {
                                    setNewPort(String(cp));
                                    setShowForm(true);
                                  },
                                  children: `一键暴露 :${cp}`,
                                },
                                cp,
                              ),
                            ),
                          ],
                        }),
                    ],
                  })
                : services.map((s) => {
                    const isCopied = copiedPort === s.port;
                    const isUnregistering = unregisteringPort === s.port;
                    return react_jsx_runtime.jsxs(
                      'div',
                      {
                        className: 'tp-card',
                        children: [
                          react_jsx_runtime.jsxs('div', {
                            className: 'tp-card-top',
                            children: [
                              react_jsx_runtime.jsxs('div', {
                                className: 'tp-card-port-wrap',
                                children: [
                                  react_jsx_runtime.jsx('span', {
                                    className: `tp-status-dot ${s.listening ? 'online' : 'offline'}`,
                                    title: s.listening ? t('services.listening') : t('services.notListening'),
                                  }),
                                  react_jsx_runtime.jsxs('span', {
                                    className: 'tp-port-title',
                                    children: [':', s.port],
                                  }),
                                  s.label &&
                                    react_jsx_runtime.jsx('span', {
                                      className: 'tp-tag',
                                      title: s.label,
                                      children: s.label,
                                    }),
                                ],
                              }),
                              react_jsx_runtime.jsx('span', {
                                className: 'tp-time',
                                children: formatTime(s.createdAt),
                              }),
                            ],
                          }),

                          // URL Box
                          react_jsx_runtime.jsx('div', {
                            className: 'tp-card-url-box',
                            children: s.url,
                          }),

                          // Actions
                          react_jsx_runtime.jsxs('div', {
                            className: 'tp-card-actions',
                            children: [
                              react_jsx_runtime.jsxs('button', {
                                type: 'button',
                                className: 'tp-btn tp-card-action-btn',
                                onClick: () => window.open(s.shareUrl || s.url, '_blank'),
                                children: [
                                  react_jsx_runtime.jsx(ExternalIcon, {}),
                                  react_jsx_runtime.jsx('span', { children: t('services.openWindow') }),
                                ],
                              }),
                              react_jsx_runtime.jsxs('button', {
                                type: 'button',
                                className: 'tp-btn tp-card-action-btn',
                                onClick: () => handleOpenSidebarBrowser(s.shareUrl || s.url),
                                title: t('services.openSidebar'),
                                children: [
                                  react_jsx_runtime.jsx(ServicesIcon, { size: 12 }),
                                  react_jsx_runtime.jsx('span', { children: t('services.openSidebar') }),
                                ],
                              }),
                              react_jsx_runtime.jsxs('button', {
                                type: 'button',
                                className: 'tp-btn tp-card-action-btn',
                                onClick: () => handleCopy(s.port, s.shareUrl || s.url),
                                children: [
                                  react_jsx_runtime.jsx(CopyIcon, {}),
                                  react_jsx_runtime.jsx('span', {
                                    children: isCopied ? t('services.copied') : t('services.copyLink'),
                                  }),
                                ],
                              }),
                              react_jsx_runtime.jsxs('button', {
                                type: 'button',
                                className: 'tp-btn tp-card-action-btn tp-btn-danger',
                                disabled: isUnregistering,
                                onClick: () => handleUnregister(s.port),
                                children: [
                                  react_jsx_runtime.jsx(TrashIcon, {}),
                                  react_jsx_runtime.jsx('span', {
                                    children: isUnregistering ? t('services.unregistering') : t('services.unregister'),
                                  }),
                                ],
                              }),
                            ],
                          }),
                        ],
                      },
                      s.port,
                    );
                  }),
          }),

          // Footer Status
          react_jsx_runtime.jsxs('div', {
            className: 'tp-footer-status',
            children: [
              react_jsx_runtime.jsxs('div', {
                className: 'tp-footer-item',
                children: [
                  react_jsx_runtime.jsx('span', {
                    style: {
                      display: 'inline-block',
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: data.tunnelConnected ? '#22c55e' : '#f59e0b',
                    },
                  }),
                  react_jsx_runtime.jsx('span', {
                    children: data.tunnelConnected ? t('services.tunnelConnected') : t('services.tunnelConnecting'),
                  }),
                ],
              }),
              react_jsx_runtime.jsxs('div', {
                className: 'tp-footer-item',
                children: [
                  react_jsx_runtime.jsx('span', {
                    style: {
                      display: 'inline-block',
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: data.cloudflare?.bound ? '#22c55e' : '#888',
                    },
                  }),
                  react_jsx_runtime.jsx('span', {
                    children: data.cloudflare?.bound ? t('services.cfBound') : t('services.cfUnbound'),
                  }),
                  !data.cloudflare?.bound &&
                    react_jsx_runtime.jsxs('a', {
                      href: CF_TEMPLATE_URL,
                      target: '_blank',
                      rel: 'noopener noreferrer',
                      style: {
                        color: '#f38020',
                        textDecoration: 'none',
                        marginLeft: 6,
                        fontWeight: 500,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 2,
                      },
                      children: [
                        react_jsx_runtime.jsx('span', { children: t('services.quickCreateLink') }),
                        react_jsx_runtime.jsx(ExternalIcon, { size: 10 }),
                      ],
                    }),
                ],
              }),
            ],
          }),
        ],
      });
    }
    //#endregion

    //#region CloudflareSettings Form
    function CloudflareSettings(props) {
      const { t } = props;
      const domainId = react.useId(),
        tokenId = react.useId(),
        accountId = react.useId(),
        zoneId = react.useId();
      const state = props.useCloudflareForm((value) => value);
      const disabled = !state.writable || state.saving;
      return react_jsx_runtime.jsxs(_deepseek_ai_dsh_client_ui_primitives.SettingsForm, {
        labels: formLabels(t),
        state,
        onSave: props.save,
        onDiscard: props.discard,
        children: [
          react_jsx_runtime.jsx('p', {
            children: t('intro'),
          }),
          react_jsx_runtime.jsxs('div', {
            className: 'tp-quick-banner',
            children: [
              react_jsx_runtime.jsxs('div', {
                className: 'tp-quick-banner-header',
                children: [
                  react_jsx_runtime.jsx(CloudflareIcon, { size: 18 }),
                  react_jsx_runtime.jsx('span', {
                    className: 'tp-quick-banner-title',
                    children: t('quickCreateTitle'),
                  }),
                ],
              }),
              react_jsx_runtime.jsx('div', {
                className: 'tp-quick-banner-desc',
                children: t('quickCreateDesc'),
              }),
              react_jsx_runtime.jsxs('button', {
                type: 'button',
                className: 'tp-btn tp-btn-cf',
                onClick: () => window.open(CF_TEMPLATE_URL, '_blank', 'noopener,noreferrer'),
                children: [
                  react_jsx_runtime.jsx(ExternalIcon, { size: 12 }),
                  react_jsx_runtime.jsx('span', { children: t('quickCreateBtn') }),
                ],
              }),
              react_jsx_runtime.jsxs('div', {
                className: 'tp-quick-steps',
                children: [
                  react_jsx_runtime.jsx('div', { className: 'tp-quick-step-item', children: t('quickStep1') }),
                  react_jsx_runtime.jsx('div', { className: 'tp-quick-step-item', children: t('quickStep2') }),
                  react_jsx_runtime.jsx('div', { className: 'tp-quick-step-item', children: t('quickStep3') }),
                ],
              }),
            ],
          }),
          react_jsx_runtime.jsx(_deepseek_ai_dsh_client_ui_primitives.SettingsValueField, {
            id: domainId,
            label: t('domain'),
            hint: t('domainHint'),
            ...state.domain,
            overriddenLabel: t('overridden'),
            resetLabel: t('reset'),
            disabled,
            onEdit: (value) => props.edit('domain', value),
            onReset: () => props.resetField('domain'),
          }),
          react_jsx_runtime.jsx(_deepseek_ai_dsh_client_ui_primitives.SettingsValueField, {
            id: tokenId,
            label: t('token'),
            hint: t('tokenHint'),
            ...state.cloudflareApiToken,
            overriddenLabel: t('overridden'),
            resetLabel: t('reset'),
            disabled,
            onEdit: (value) => props.edit('cloudflareApiToken', value),
            onReset: () => props.resetField('cloudflareApiToken'),
          }),
          react_jsx_runtime.jsx(_deepseek_ai_dsh_client_ui_primitives.SettingsValueField, {
            id: accountId,
            label: t('accountId'),
            hint: t('accountIdHint'),
            ...state.cloudflareAccountId,
            overriddenLabel: t('overridden'),
            resetLabel: t('reset'),
            disabled,
            onEdit: (value) => props.edit('cloudflareAccountId', value),
            onReset: () => props.resetField('cloudflareAccountId'),
          }),
          react_jsx_runtime.jsx(_deepseek_ai_dsh_client_ui_primitives.SettingsValueField, {
            id: zoneId,
            label: t('zoneId'),
            hint: t('zoneIdHint'),
            ...state.cloudflareZoneId,
            overriddenLabel: t('overridden'),
            resetLabel: t('reset'),
            disabled,
            onEdit: (value) => props.edit('cloudflareZoneId', value),
            onReset: () => props.resetField('cloudflareZoneId'),
          }),
        ],
      });
    }

    var CloudflareForm = class {
      form;
      state;
      constructor(scope) {
        this.form = new _deepseek_ai_dsh_client_ui_primitives.SettingsFormModel(scope, [
          _deepseek_ai_dsh_client_ui_primitives.settingsTextField('domain'),
          _deepseek_ai_dsh_client_ui_primitives.settingsTextField('cloudflareApiToken'),
          _deepseek_ai_dsh_client_ui_primitives.settingsTextField('cloudflareAccountId'),
          _deepseek_ai_dsh_client_ui_primitives.settingsTextField('cloudflareZoneId'),
        ]);
        this.state = this.form.bind(() => ({
          ...this.form.shell(),
          domain: this.form.field('domain'),
          cloudflareApiToken: this.form.field('cloudflareApiToken'),
          cloudflareAccountId: this.form.field('cloudflareAccountId'),
          cloudflareZoneId: this.form.field('cloudflareZoneId'),
        }));
      }
      inject() {
        return {
          hooks: { cloudflareForm: this.state },
          ...this.form.actions(),
        };
      }
      dispose() {
        this.form.dispose();
      }
    };
    //#endregion

    //#region Mount
    const inject = ['slots', 'locale', 'configForms'];

    function apply(ctx) {
      // 1. 注册多语言词条
      ctx.effect(() => ctx.locale.register(NS, { en, zh }));
      const t = ctx.locale.bind(NS);

      // 2. 插件设置页：绑定 Cloudflare 表单
      try {
        const scope = ctx.configForms.get('tunnel-preview');
        if (scope) {
          const form = new CloudflareForm(scope);
          ctx.effect(() => () => form.dispose());
          ctx.slots.inject('plugins.bundle.config', () =>
            ctx.slots.register(
              {
                name: 'plugins.bundle.config',
                key: 'dsh-tunnel-preview',
                locale: NS,
                inject: () => form.inject(),
              },
              CloudflareSettings,
            ),
          );
        }
      } catch {
        // ignore if config forms unavailable
      }

      // 3. 右侧栏「服务」Tab 与顶栏入口：在 sidebarRight 与 sidebarRightTabs 就绪时注入
      ctx.inject(['sidebarRight', 'sidebarRightTabs'], (scope) => {
        // 注册右侧栏 Tab 类型
        scope.effect(
          () =>
            scope.sidebarRightTabs.register({
              id: SERVICES_ID,
              kind: SERVICES_KIND,
              multiple: false,
              priority: 'extension',
              title: () => t('services.tabTitle'),
              guide: [
                {
                  id: 'services',
                  order: 35,
                  title: () => t('services.guideTitle'),
                  description: () => t('services.guideDesc'),
                  icon: ServicesIcon,
                },
              ],
            }),
          'dsh-tunnel-preview: services tab type',
        );

        // 注册右侧栏 Tab Title 槽位
        scope.slots.inject('sidebar.right.pane.tab.title', () =>
          scope.slots.register(
            {
              name: 'sidebar.right.pane.tab.title',
              key: SERVICES_ID,
              locale: NS,
            },
            ServicesTitle,
          ),
        );

        // 注册右侧栏 Tab Body 槽位
        scope.slots.inject('sidebar.right.pane.tab', () =>
          scope.slots.register(
            {
              name: 'sidebar.right.pane.tab',
              key: SERVICES_ID,
              locale: NS,
              inject: () => ({ ctx: scope }),
            },
            ServicesPanel,
          ),
        );

        // 注册会话顶部 Header 工具栏快捷入口
        scope.slots.inject('conversation.session.header.utilities', () =>
          scope.slots.register(
            {
              name: 'conversation.session.header.utilities',
              id: 'dsh-tunnel-preview/services-header',
              order: 50,
              locale: NS,
              inject: () => ({
                openServicesTab: () => {
                  scope.sidebarRight.openTab(SERVICES_KIND);
                },
              }),
            },
            ServicesHeaderAction,
          ),
        );
      });
    }
    //#endregion

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
