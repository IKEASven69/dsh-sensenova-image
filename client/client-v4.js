/**
 * dsh-sensenova-image — 生图工作台 v4（客户端模块）
 *
 * Phase 0：无限画布底座（WORKBENCH-PLAN.md）
 *  - shell.overlay 全屏工作台：Konva 无限画布 + 右侧生成/历史面板
 *  - 视口：滚轮缩放（指针锚点）、空格/中键平移、缩放控件、F 适应画面
 *  - 节点：拖拽、Transformer、shift 多选/框选、右键菜单
 *  - 文档 {nodes, camera} 存服务端 JSON，防抖自动保存；undo/redo（cap 60）
 *  - 生成：幽灵节点原位替换；结果落盘 /api/sensenova/image/:id
 *
 * Phase 1：标配交互
 *  - 浮动操作条（选中单图）：变体 / 增强 / 局部重绘 / 扩图 / 下载 / 删除
 *  - 悬浮 prompt bar：无选中 = 文生图；选中图 = 编辑（i2i，图自动带上），Enter 生成
 *  - 蒙版局部重绘：画笔标注 → 合成"原图+高亮标注板"发 i2i（仅改高亮区）
 *  - 扩图 outpaint：比例预设 → 原图居中合成白边画布发 i2i
 *  - 拖入/粘贴图片即成节点；模型档位（默认/u1.5-lite/u1.5）
 *
 * 模式沿用 deck：window.__ModuleLoader__ + slots 注入。
 */
window.__snxDebug = window.__snxDebug || { step: 'init', src: 'client-v4' }
window.__ModuleLoader__.load({
  id: 'dsh-sensenova-image',
  factory: (require) => {
    const module = { exports: {} }
    const inject = ['slots', 'sessions', 'uiConversation', 'conversation', 'sidebarRightTabs', 'sidebarRight', 'layout']
    // v8.1：可选支持 dsh-better-sidebar（软依赖 — ctx.betterSidebar 不存在时静默回退到原生右栏注册）
    const hasBetterSidebar = (ctx) => { try { return ctx && ctx.get && !!ctx.get('betterSidebar') } catch { return false } }
    const React = require('react')
    const { useState, useEffect, useRef, useMemo, createElement: h } = React

    // ——— 数据访问（同源 fetch）———
    function post(url, body, signal) {
      return fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal })
        .then(async (r) => ({ ok: r.ok, ...(await r.json().catch(() => ({}))) }))
    }
    function get(url) { return fetch(url).then(async (r) => ({ ok: r.ok, ...(await r.json().catch(() => ({}))) })) }
    function put(url, body) {
      return fetch(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
        .then(async (r) => ({ ok: r.ok, ...(await r.json().catch(() => ({}))) }))
    }
    function del(url) { return fetch(url, { method: 'DELETE' }).then((r) => ({ ok: r.ok })) }

    const CANVAS_ROUTE = '/api/sensenova/canvas'
    const CONFIG_ROUTE = '/api/sensenova/config'
    const STATUS_ROUTE = '/api/sensenova/status'

    // ——— Phase 2：会话桥（deck 同款三级降级：sendSession → session.prompt → scoped send）———
    let bridge = null
    function initBridge(ctx) {
      bridge = { sessions: ctx.sessions || null, conversation: ctx.conversation || null }
    }
    function currentSessionId() {
      try {
        const snap = bridge && bridge.sessions && bridge.sessions.list ? bridge.sessions.list.getSnapshot() : null
        return snap && snap.current ? snap.current : null
      } catch { return null }
    }
    function canvasContextText(node) {
      const nodes = store.doc.nodes
      const others = nodes.filter((n) => !node || n.id !== node.id).slice(-8)
        .map((n) => `[${n.id}](${n.x},${n.y}) "${String(n.prompt || '').slice(0, 30)}"`)
      return [
        '【来自生图画布】附图 = 画布当前选中图' + (node && node.prompt ? `（其来源提示词：${String(node.prompt).slice(0, 80)}）` : '') + '。',
        `画布共 ${nodes.length} 张` + (others.length ? '；其他节点：' + others.join(' ') : '') + '。',
      ].join(' ')
    }
    async function askAgent(text, imageSrc) {
      if (!bridge || !bridge.sessions) throw new Error('此 dsh 版本不支持插件直发会话')
      let sid = currentSessionId()
      if (!sid && typeof bridge.sessions.create === 'function') {
        sid = await bridge.sessions.create({})
        try { bridge.sessions.open(sid) } catch { }
      }
      if (!sid) throw new Error('没有当前会话')
      let session = null
      for (let i = 0; i < 10; i++) {
        try { session = bridge.sessions.binding ? (bridge.sessions.binding(sid) || {}).session || null : null } catch { session = null }
        if (session) break
        await new Promise((r) => setTimeout(r, 200))
      }
      if (!session) throw new Error('会话绑定不可用')
      const imageIds = []
      if (imageSrc && bridge.conversation && typeof bridge.conversation.createDraftImages === 'function') {
        try {
          const blob = await (await fetch(imageSrc)).blob()
          const file = new window.File([blob], 'canvas.png', { type: blob.type || 'image/png' })
          const atts = bridge.conversation.createDraftImages([file])
          atts.forEach((a) => { if (a && a.id) imageIds.push(a.id) })
        } catch { /* 附图失败降级纯文本 */ }
      }
      if (bridge.conversation && typeof bridge.conversation.sendSession === 'function') {
        try { await bridge.conversation.sendSession(session, text, imageIds, 'queue'); return } catch { }
      }
      const r = await session.prompt([{ type: 'text', text }], 'queue')
      if (r && r.ok) return
      throw new Error('发送失败')
    }

    // ——— 开关状态（localStorage + window 事件；deck 同款）———
    const LS_OPEN = 'dsh-sensenova-open'
    const EVT = 'snx-open-changed'
    function isOpen() {
      try { return localStorage.getItem(LS_OPEN) === '1' } catch { return false }
    }
    function setOpen(v) {
      try { localStorage.setItem(LS_OPEN, v ? '1' : '0') } catch { }
      try { window.dispatchEvent(new CustomEvent(EVT)) } catch { }
    }

    function isTyping(e) {
      const t = e.target
      return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
    }

    // ——— 样式 ———
    const css = `
/* ── 主题令牌（跟随 dsh 亮/暗主题；每个 var 第二参为旧宿主回退色 = 暗色观感）──
   单一强调色：宿主主色（DeepSeek 蓝）；错误/成功/警示用宿主状态色 */
.snx-cv,.snx-pro,.snx-cfg,.snx-tv,.snx-lb,.snx-fs,.snx-help,.snx-bsb-preview,.snx-sidebtn,.snx-rb-title{
  --snx-accent:var(--dsw-alias-link,#7aaaff);
  --snx-accent-fill:var(--dsw-alias-button-info-fill,#7aaaff);
  --snx-accent-fill-hover:var(--dsw-alias-button-info-hover,#4176e6);
  --snx-on-accent:var(--dsw-alias-label-primary-foreground,#fff);
  --snx-error:var(--dsw-alias-state-error-primary,#f25a5a);
  --snx-ok:var(--dsw-alias-state-success-primary,#22c55e);
  --snx-warn:var(--dsw-alias-state-warn-secondary,#f7ad31);
}
/* v4.2+：rightbar tab 模式（不再挂 sidebarCol DOM，也不是全屏遮挡/右侧抽屉）
   思路：ctx.sidebarRightTabs.register 注册 tab 类型 + slots.inject('sidebar.right.pane.tab')
   渲染 WorkbenchBoundary（WBErrorBoundary > Workbench），与文件浏览器 tab 并排。
   窄布局用 @container snxpro 容器查询自适应，不依赖宿主 DOM 选择器 */
.snx-cv{position:relative;display:flex;flex-direction:column;width:100%;height:100%;
  background:var(--dsw-alias-bg-layer-1,#232324);color:var(--dsw-alias-label-primary,#f9fafb);
  font-family:var(--dsw-font-family,"Segoe UI","Microsoft YaHei",sans-serif);overflow:hidden}
.snx-cv-top{height:44px;flex-shrink:0;display:flex;align-items:center;gap:14px;padding:0 16px;
  border-bottom:1px solid var(--dsw-alias-border-l2,#ffffff1f);background:var(--dsw-alias-bg-layer-2,#2c2c2e)}
.snx-cv-top .brand{font-weight:900;font-size:14px;letter-spacing:.06em;color:var(--dsw-alias-label-primary,#f9fafb)}
.snx-cv-top .brand b{color:var(--snx-accent)}
.snx-cv-top .key{font-size:11px;padding:2px 9px;border-radius:9px;border:1px solid var(--dsw-alias-border-l2,#ffffff1f);color:var(--dsw-alias-label-tertiary,#adb2b8)}
.snx-cv-top .key.ok{color:var(--snx-accent);border-color:color-mix(in srgb,var(--snx-accent) 40%,transparent)}
.snx-cv-top .key.no{color:var(--snx-error);border-color:color-mix(in srgb,var(--snx-error) 40%,transparent)}
.snx-cv-top .sp{flex:1}
.snx-cv-top button{background:none;border:1px solid var(--dsw-alias-border-l2,#ffffff1f);color:var(--dsw-alias-label-secondary,#cfd3d6);padding:4px 10px;border-radius:6px;
  cursor:pointer;font-size:12px;font-family:inherit;transition:all .15s}
.snx-cv-top button:hover{border-color:var(--snx-accent);color:var(--dsw-alias-label-primary,#f9fafb);background:color-mix(in srgb,var(--snx-accent) 10%,transparent)}
.snx-cv-top button.close:hover{border-color:var(--snx-error);color:var(--snx-error);background:color-mix(in srgb,var(--snx-error) 8%,transparent)}
.snx-cv-main{flex:1;display:flex;flex-direction:row;min-height:0;min-width:0}
.snx-cv-wrap{flex:1;position:relative;overflow:hidden;background-color:var(--dsw-alias-bg-layer-1,#232324);
  background-image:radial-gradient(var(--dsw-alias-interactive-bg-hover,#ffffff14) 1px,transparent 1px);min-width:0}
.snx-cv-stage{position:absolute;inset:0}
.snx-cv-right{width:280px;flex-shrink:0;border-left:1px solid var(--dsw-alias-border-l2,#ffffff1f);display:flex;flex-direction:column;min-height:0;
  min-width:0;overflow:hidden}
/* 容器查询：rightbar < 720px 时改为竖排（画布在上，参数面板在下）
   rightbar 通常在 ~360-420px，所以默认就是窄布局 */
.snx-cv{container-type:inline-size;container-name:snx}
@container snx (max-width:719px){
  .snx-cv{flex-direction:column}
  .snx-cv-main{flex-direction:column}
  .snx-cv-right{width:100%;max-height:46%;border-left:none;border-top:1px solid var(--dsw-alias-border-l2,#ffffff1f)}
  .snx-cv-top{height:38px;padding:0 10px;gap:8px;font-size:12px}
  .snx-cv-top .brand{font-size:12px}
  .snx-cv-top .key{display:none}
  .snx-cv-top button.fit{display:none}
  .snx-cv-top button{padding:3px 8px;font-size:11px}
  .snx-cv-body{padding:10px}
}
.snx-cv-tabs{display:flex;border-bottom:1px solid var(--dsw-alias-border-l2,#ffffff1f);flex-shrink:0}
.snx-cv-tabs button{flex:1;background:none;border:none;color:var(--dsw-alias-label-tertiary,#adb2b8);padding:10px 0;cursor:pointer;font-size:12.5px;
  border-bottom:2px solid transparent;font-family:inherit}
.snx-cv-tabs button.on{color:var(--snx-accent);border-bottom-color:var(--snx-accent)}
.snx-cv-body{flex:1;overflow-y:auto;padding:14px}
.snx-cv-body label{display:block;font-size:11px;color:var(--dsw-alias-label-tertiary,#adb2b8);margin:10px 0 4px;letter-spacing:.05em}
.snx-cv-body textarea,.snx-cv-body input,.snx-cv-body select{width:100%;box-sizing:border-box;background:var(--dsw-alias-bg-module-platform,#353638);
  border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:6px;color:var(--dsw-alias-label-primary,#f9fafb);padding:8px 10px;font-size:13px;font-family:inherit;resize:vertical}
.snx-cv-body textarea{min-height:88px}
.snx-cv-body textarea:focus,.snx-cv-body input:focus,.snx-cv-body select:focus{outline:none;border-color:var(--snx-accent)}
.snx-cv-body .row{display:flex;gap:8px}
.snx-cv-body .row>*{flex:1;min-width:0}
.snx-cv-gen{width:100%;margin-top:14px;padding:10px;border:none;border-radius:8px;cursor:pointer;
  background:var(--snx-accent-fill);color:var(--dsw-alias-label-primary-foreground,#fff);font-size:14px;font-weight:700;font-family:inherit}
.snx-cv-gen:hover:not(:disabled){filter:brightness(1.15)}
.snx-cv-gen:disabled{opacity:.5;cursor:wait}
.snx-cv-hint{font-size:11px;color:var(--dsw-alias-label-caption,#81858c);margin-top:12px;line-height:1.7}
.snx-cv-zoom{position:absolute;left:14px;bottom:14px;display:flex;gap:4px;z-index:5}
.snx-cv-zoom button{width:30px;height:28px;background:var(--dsw-alias-button-floating-fill,#2c2c2e);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);color:var(--dsw-alias-label-secondary,#cfd3d6);
  border-radius:6px;cursor:pointer;font-size:13px}
.snx-cv-zoom button:hover{color:var(--snx-accent);border-color:var(--snx-accent)}
.snx-cv-zoom .pct{min-width:52px;display:flex;align-items:center;justify-content:center;font-size:11px;
  color:var(--dsw-alias-label-tertiary,#adb2b8);background:var(--dsw-alias-button-floating-fill,#2c2c2e);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:6px}
.snx-cv-status{height:28px;flex-shrink:0;border-top:1px solid var(--dsw-alias-border-l2,#ffffff1f);display:flex;align-items:center;gap:16px;
  padding:0 14px;font-size:11px;color:var(--dsw-alias-label-caption,#81858c);font-family:Consolas,monospace}
.snx-cv-menu{position:fixed;z-index:400;background:var(--dsw-alias-bg-layer-3,#353638);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:8px;
  padding:4px;min-width:150px;box-shadow:0 12px 32px rgba(0,0,0,.28)}
.snx-cv-menu button{display:block;width:100%;text-align:left;background:none;border:none;color:var(--dsw-alias-label-primary,#f9fafb);
  padding:7px 12px;font-size:12.5px;cursor:pointer;border-radius:5px;font-family:inherit}
.snx-cv-menu button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,#ffffff14);color:var(--snx-accent)}
.snx-cv-menu button:disabled{color:var(--dsw-alias-label-caption,#81858c);cursor:default}
.snx-cv-menu .sep{height:1px;background:var(--dsw-alias-border-l2,#ffffff1f);margin:4px 6px}
.snx-cv-hist{display:flex;flex-direction:column;gap:8px}
.snx-cv-hist .hi{display:flex;gap:8px;border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:8px;padding:6px;cursor:pointer}
.snx-cv-hist .hi:hover{border-color:var(--snx-accent)}
.snx-cv-hist .hi img{width:64px;height:64px;object-fit:cover;border-radius:5px;background:var(--dsw-alias-bg-document-preview,#151517)}
.snx-cv-hist .hp{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:space-between}
.snx-cv-hist .p1{font-size:11.5px;color:var(--dsw-alias-label-secondary,#cfd3d6);line-height:1.4;display:-webkit-box;-webkit-line-clamp:3;
  -webkit-box-orient:vertical;overflow:hidden}
.snx-cv-hist .p2{font-size:10px;color:var(--dsw-alias-label-caption,#81858c);font-family:Consolas,monospace}
.snx-cv-hist .del{background:none;border:none;color:var(--dsw-alias-label-caption,#81858c);cursor:pointer;font-size:12px;align-self:flex-start;padding:0}
.snx-cv-hist .del:hover{color:var(--snx-error)}
.snx-cv-err{font-size:12px;color:var(--snx-error);margin-top:8px;line-height:1.5}
.snx-form label{display:block;font-size:11px;color:var(--dsw-alias-label-tertiary,#adb2b8);margin:12px 0 4px}
.snx-form input{width:100%;box-sizing:border-box;background:var(--dsw-alias-bg-module-platform,#353638);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:6px;
  color:var(--dsw-alias-label-primary,#f9fafb);padding:8px 10px;font-size:13px;font-family:inherit}
.snx-form input:focus{outline:none;border-color:var(--snx-accent)}
.snx-form .go{margin-top:14px;padding:9px 22px;border:none;border-radius:8px;cursor:pointer;
  background:var(--snx-accent-fill);color:var(--dsw-alias-label-primary-foreground,#fff);font-size:13px;font-weight:700;font-family:inherit}
.snx-empty{font-size:12px;color:var(--dsw-alias-label-caption,#81858c);padding:12px 0}
/* 设置卡片（v4.1 重排版：强样式覆盖，避开宿主 settings 页的影响） */
.snx-cfg{padding:4px 0;color:var(--dsw-alias-label-primary,#f9fafb)}
.snx-cfg-row{margin-bottom:20px}
.snx-cfg-row>label.snx-cfg-lb{display:block;font-size:13px;color:var(--dsw-alias-label-primary,#f9fafb)!important;font-weight:600;
  margin:0 0 4px;letter-spacing:.02em}
.snx-cfg-hint{display:block;font-size:11.5px;color:var(--dsw-alias-label-tertiary,#adb2b8);margin:0 0 8px;line-height:1.5}
.snx-cfg-row>input.snx-cfg-in,.snx-cfg-row>select.snx-cfg-sel{display:block;width:100%;box-sizing:border-box;
  background:var(--dsw-alias-bg-module-platform,#353638)!important;border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:7px;color:var(--dsw-alias-label-primary,#f9fafb)!important;
  padding:9px 12px;font-size:13px;font-family:inherit;outline:none;line-height:1.4;min-height:36px}
.snx-cfg-row>input.snx-cfg-in:focus,.snx-cfg-row>select.snx-cfg-sel:focus{border-color:var(--snx-accent);background:var(--dsw-alias-bg-layer-3,#353638)!important}
.snx-cfg-row>select.snx-cfg-sel{appearance:none;-webkit-appearance:none;
  background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23979da6' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M6 9l6 6 6-6'/></svg>")!important;
  background-repeat:no-repeat;background-position:right 12px center;padding-right:36px;cursor:pointer}
.snx-cfg-in-wrap{position:relative}
.snx-cfg-in-wrap input.snx-cfg-in{padding-right:42px}
.snx-cfg-eye{position:absolute;right:4px;top:50%;transform:translateY(-50%);
  background:none;border:none;color:var(--dsw-alias-label-tertiary,#adb2b8);cursor:pointer;font-size:14px;padding:6px 10px;border-radius:4px}
.snx-cfg-eye:hover{color:var(--dsw-alias-label-primary,#f9fafb);background:var(--dsw-alias-interactive-bg-hover,#ffffff14)}
.snx-cfg-help{display:block;font-size:11.5px;color:var(--dsw-alias-label-tertiary,#adb2b8);margin:8px 0 0;line-height:1.5;font-style:italic}
.snx-cfg-help b{color:var(--snx-accent);font-style:normal;font-weight:600}
.snx-cfg-actions{display:flex;gap:10px;margin-top:8px;flex-wrap:wrap}
.snx-cfg-go{padding:9px 22px;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:700;
  background:var(--snx-accent-fill)!important;color:var(--dsw-alias-label-primary-foreground,#fff)!important;font-family:inherit;
  transition:filter .15s}
.snx-cfg-go:hover{filter:brightness(1.15)}
.snx-cfg-test{padding:9px 18px;border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:8px;cursor:pointer;
  background:transparent!important;color:var(--dsw-alias-label-primary,#f9fafb)!important;font-size:13px;font-weight:600;font-family:inherit;
  transition:all .15s}
.snx-cfg-test:hover:not(:disabled){border-color:var(--snx-accent);color:var(--snx-accent)!important}
.snx-cfg-test:disabled{opacity:.5;cursor:default}
.snx-cfg-msg{margin-top:14px;padding:10px 14px;border-radius:7px;font-size:12px;
  background:var(--dsw-alias-bg-layer-3,#353638);color:var(--dsw-alias-label-tertiary,#adb2b8);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);line-height:1.5}
.snx-cfg-msg.ok{color:var(--snx-accent);border-color:color-mix(in srgb,var(--snx-accent) 35%,transparent);background:color-mix(in srgb,var(--snx-accent) 7%,transparent)}
.snx-cfg-msg.err{color:var(--snx-error);border-color:color-mix(in srgb,var(--snx-error) 35%,transparent);background:color-mix(in srgb,var(--snx-error) 7%,transparent)}
/* 侧栏按钮（自包含样式 — dsh 左下角小工具按钮） */
.snx-sidebtn{display:inline-flex;align-items:center;gap:6px;
  padding:6px 12px;border-radius:10px;border:1px solid var(--dsw-alias-border-l2,#ffffff1f);
  background:var(--dsw-alias-bg-layer-3,#353638);color:var(--dsw-alias-label-primary,#f9fafb);font-size:12px;
  font-weight:600;cursor:pointer;transition:all .15s;line-height:1;font-family:inherit}
.snx-sidebtn:hover{border-color:var(--snx-accent);background:var(--dsw-alias-bg-layer-3,#353638);color:var(--snx-accent)}
.snx-sidebtn:active{transform:translateY(1px)}
.snx-sidebtn svg{width:13px;height:13px;flex-shrink:0;stroke:currentColor}
/* rightbar tab 标题（在 dsh 右栏 tab 标签里显示） */
.snx-rb-title{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600}
.snx-rb-ico{color:var(--snx-accent);font-size:14px;line-height:1}
/* Phase 1：浮动操作条 / 悬浮 prompt bar / 蒙版工具条 / 比例弹层 */
.snx-ab{position:absolute;z-index:6;display:flex;gap:1px;background:var(--dsw-alias-button-floating-fill,#2c2c2e);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);
  border-radius:8px;padding:3px;box-shadow:0 8px 24px rgba(0,0,0,.22)}
.snx-ab button{background:none;border:none;color:var(--dsw-alias-label-secondary,#cfd3d6);font-size:13px;padding:5px 8px;cursor:pointer;border-radius:5px;font-family:inherit}
.snx-ab button:hover{background:var(--dsw-alias-interactive-bg-hover,#ffffff14);color:var(--snx-accent)}
.snx-ab button.warn:hover{color:var(--snx-error)}
.snx-pbar{position:absolute;top:12px;left:50%;transform:translateX(-50%);z-index:6;display:flex;align-items:center;gap:8px;
  background:var(--dsw-alias-button-floating-fill,#2c2c2e);border:1px solid color-mix(in srgb,var(--snx-accent) 30%,transparent);border-radius:10px;padding:7px 9px;
  box-shadow:0 10px 30px rgba(0,0,0,.22);max-width:72%}
.snx-pbar input{flex:1;min-width:240px;width:320px;background:var(--dsw-alias-bg-layer-1,#232324);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:7px;
  color:var(--dsw-alias-label-primary,#f9fafb);padding:8px 12px;font-size:13px;font-family:inherit;outline:none}
.snx-pbar input:focus{border-color:var(--snx-accent)}
.snx-pbar .tag{font-size:10.5px;letter-spacing:.08em;color:var(--snx-accent);border:1px solid color-mix(in srgb,var(--snx-accent) 40%,transparent);
  border-radius:4px;padding:3px 8px;white-space:nowrap}
.snx-pbar .tag.t2i{color:var(--snx-accent);border-color:color-mix(in srgb,var(--snx-accent) 40%,transparent)}
.snx-pbar button.go{background:var(--snx-accent-fill);border:none;color:var(--dsw-alias-label-primary-foreground,#fff);border-radius:7px;
  padding:8px 14px;cursor:pointer;font-weight:700;font-family:inherit}
.snx-pbar button.go:disabled{opacity:.5;cursor:default}
.snx-maskbar{position:absolute;top:12px;left:50%;transform:translateX(-50%);z-index:9;display:flex;align-items:center;gap:10px;
  background:var(--dsw-alias-button-floating-fill,#2c2c2e);border:1px solid color-mix(in srgb,var(--snx-accent) 45%,transparent);border-radius:10px;padding:7px 12px;
  box-shadow:0 10px 30px rgba(0,0,0,.24);max-width:82%}
.snx-maskbar .lb{font-size:11px;color:var(--snx-accent);white-space:nowrap}
.snx-maskbar input[type=text]{width:230px;background:var(--dsw-alias-bg-layer-1,#232324);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:7px;color:var(--dsw-alias-label-primary,#f9fafb);
  padding:7px 10px;font-size:12.5px;outline:none;font-family:inherit}
.snx-maskbar input[type=text]:focus{border-color:var(--snx-accent)}
.snx-maskbar input[type=range]{width:100px;accent-color:var(--snx-accent)}
.snx-maskbar button{background:none;border:1px solid var(--dsw-alias-border-l2,#ffffff1f);color:var(--dsw-alias-label-secondary,#cfd3d6);border-radius:6px;padding:6px 10px;
  cursor:pointer;font-size:12px;font-family:inherit;white-space:nowrap}
.snx-maskbar button:hover:not(:disabled){border-color:var(--snx-accent);color:var(--snx-accent)}
.snx-maskbar button.go{background:var(--snx-accent-fill);border:none;color:var(--dsw-alias-label-primary-foreground,#fff);font-weight:700}
.snx-maskbar button.go:disabled{opacity:.5;cursor:default}
.snx-maskbar button.go:hover:not(:disabled){color:var(--dsw-alias-label-primary-foreground,#fff);filter:brightness(1.15)}
.snx-ratio{position:absolute;z-index:7;display:flex;gap:3px;background:var(--dsw-alias-button-floating-fill,#2c2c2e);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);
  border-radius:8px;padding:4px;box-shadow:0 10px 30px rgba(0,0,0,.24)}
.snx-ratio button{background:none;border:none;color:var(--dsw-alias-label-primary,#f9fafb);padding:6px 10px;cursor:pointer;font-size:12px;
  border-radius:5px;font-family:inherit}
.snx-ratio button:hover{background:var(--dsw-alias-interactive-bg-hover,#ffffff14);color:var(--snx-accent)}
.snx-cv-mask{position:absolute;inset:0;z-index:8;cursor:crosshair}
/* Phase 2：聊天内生图工具卡片 */
.snx-tv{display:flex;flex-direction:column;gap:6px;padding:8px;border:1px solid color-mix(in srgb,var(--snx-accent) 25%,transparent);
  border-radius:8px;background:var(--dsw-alias-bg-layer-2,#2c2c2e);margin:2px 0;max-width:340px}
.snx-tv-img{display:block;width:fit-content;border:.5px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:12px;overflow:hidden;cursor:zoom-in;
  background:var(--dsw-alias-interactive-bg-hover,#ffffff14);padding:0;line-height:0;flex:none;
  transition:transform .15s ease, box-shadow .15s ease}
.snx-tv-img:hover{transform:translateY(-1px);box-shadow:0 6px 20px rgba(0,0,0,.35)}
.snx-tv-img img{display:block;object-fit:cover}
.snx-tv-run{font-size:12px;color:var(--snx-accent)}
.snx-tv-err{font-size:12px;color:var(--snx-error)}
.snx-tv-row{display:flex;align-items:center;gap:8px;min-width:0}
.snx-tv-prompt{font-size:11px;color:var(--dsw-alias-label-tertiary,#adb2b8);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.snx-tv-row button,.snx-tv-btns button{background:var(--dsw-alias-interactive-bg-hover,#ffffff14);border:1px solid color-mix(in srgb,var(--snx-accent) 40%,transparent);color:var(--snx-accent);border-radius:6px;
  padding:4px 10px;cursor:pointer;font-size:11.5px;font-family:inherit;white-space:nowrap}
.snx-tv-row button:hover,.snx-tv-btns button:hover{filter:brightness(1.2)}
.snx-tv-btns{display:flex;gap:6px;flex-wrap:wrap}

/* ════════════════════════════════════════════════════════════════
   v5 专业生图台（snx-pro / snx-gen / snx-canvas-wrap / snx-gal）
   颜色基调：宿主 dsh 0.2 设计令牌（--dsw-alias-*），单强调色 = 宿主主色 DeepSeek 蓝，自动跟随亮/暗主题
   ════════════════════════════════════════════════════════════════ */

/* ─── 根容器 ─── */
.snx-pro{
  position:relative;display:flex;flex-direction:column;width:100%;height:100%;
  background:var(--dsw-alias-bg-layer-1,#232324);
  color:var(--dsw-alias-label-primary,#f9fafb);font-family:var(--dsw-font-family,"Segoe UI","Microsoft YaHei",sans-serif);
  overflow:hidden;container-type:inline-size;container-name:snxpro;
}
.snx-pro.canvas-mode{background:var(--dsw-alias-bg-layer-1,#232324)}

/* ─── 顶部品牌栏 ─── */
.snx-pro-top{
  height:46px;flex-shrink:0;display:flex;align-items:center;gap:10px;
  padding:0 14px;border-bottom:1px solid var(--dsw-alias-border-l2,#ffffff1f);
  background:var(--dsw-alias-bg-layer-2,#2c2c2e);
}
.snx-pro-brand{display:flex;align-items:center;gap:8px;font-weight:800;font-size:14px;letter-spacing:.02em}
.snx-pro-ico{
  display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:6px;
  background:var(--snx-accent-fill);color:var(--dsw-alias-label-primary-foreground,#fff);font-size:14px;line-height:1;
  box-shadow:0 0 12px color-mix(in srgb,var(--snx-accent) 35%,transparent);
}
.snx-pro-name{color:var(--dsw-alias-label-primary,#f9fafb);font-weight:900}
.snx-pro-tag{
  font-size:10.5px;color:var(--dsw-alias-label-tertiary,#adb2b8);letter-spacing:.08em;padding:2px 7px;border-radius:4px;
  border:1px solid var(--dsw-alias-border-l2,#ffffff1f);background:var(--dsw-alias-bg-module-platform,#353638);
}
.snx-pro-spacer{flex:1}
.snx-pro-key{
  font-size:11px;padding:3px 9px;border-radius:10px;border:1px solid var(--dsw-alias-border-l2,#ffffff1f);color:var(--dsw-alias-label-tertiary,#adb2b8);
  display:inline-flex;align-items:center;gap:4px;
}
.snx-pro-key.ok{color:var(--snx-accent);border-color:color-mix(in srgb,var(--snx-accent) 35%,transparent);background:color-mix(in srgb,var(--snx-accent) 6%,transparent)}
.snx-pro-key.no{color:var(--snx-error);border-color:color-mix(in srgb,var(--snx-error) 40%,transparent);background:color-mix(in srgb,var(--snx-error) 6%,transparent)}
.snx-pro-key.unk{color:var(--dsw-alias-label-tertiary,#adb2b8)}

/* ─── 模式 tab ─── */
.snx-pro-tabs{
  display:flex;flex-shrink:0;border-bottom:1px solid var(--dsw-alias-border-l2,#ffffff1f);background:var(--dsw-alias-bg-layer-2,#2c2c2e);
  padding:0 6px;gap:2px;
}
.snx-pro-tabs button{
  flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;
  background:none;border:none;color:var(--dsw-alias-label-caption,#81858c);padding:9px 0;cursor:pointer;
  font-size:12.5px;font-weight:600;font-family:inherit;
  border-bottom:2px solid transparent;transition:all .15s;position:relative;
}
.snx-pro-tabs button .ti{font-size:14px;line-height:1}
.snx-pro-tabs button .cnt{
  font-size:10px;background:var(--dsw-alias-border-l2,#ffffff1f);color:var(--dsw-alias-label-secondary,#cfd3d6);padding:1px 6px;border-radius:8px;margin-left:2px;
}
.snx-pro-tabs button:hover{color:var(--dsw-alias-label-secondary,#cfd3d6);background:var(--dsw-alias-interactive-bg-hover,#ffffff14)}
.snx-pro-tabs button.on{
  color:var(--snx-accent);border-bottom-color:var(--snx-accent);
}
.snx-pro-tabs button.on .cnt{background:color-mix(in srgb,var(--snx-accent) 20%,transparent);color:var(--snx-accent)}

/* ─── 主内容 ─── */
.snx-pro-main{
  flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;
  background:var(--dsw-alias-bg-layer-2,#2c2c2e);
}
.snx-pro-main::-webkit-scrollbar{width:6px}
.snx-pro-main::-webkit-scrollbar-track{background:transparent}
.snx-pro-main::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l2,#ffffff1f);border-radius:3px}
.snx-pro-main::-webkit-scrollbar-thumb:hover{background:var(--dsw-alias-border-l3,#ffffff29)}

/* ═══════ GEN mode ═══════ */
.snx-gen{display:flex;flex-direction:column;padding:14px;gap:16px}

/* ── 预览大图 ── */
.snx-gen-hero{
  position:relative;border-radius:10px;overflow:hidden;
  background:var(--dsw-alias-bg-layer-2,#2c2c2e);
  border:1px solid var(--dsw-alias-border-l2,#ffffff1f);box-shadow:0 4px 18px rgba(0,0,0,.16);
}
.snx-gen-hero.empty{padding:0}
.snx-gen-hero-inner{padding:12px}
.snx-gen-hero-imgbox{
  position:relative;aspect-ratio:1;width:100%;overflow:hidden;border-radius:8px;
  background:var(--dsw-alias-bg-document-preview,#151517);display:flex;align-items:center;justify-content:center;
}
.snx-gen-hero-imgbox img{
  display:block;width:100%;height:100%;object-fit:contain;background:var(--dsw-alias-bg-document-preview,#151517);
}
.snx-gen-hero-fail{color:var(--snx-error);font-size:12px}
.snx-gen-hero-cap{padding-top:10px}
.snx-gen-hero-cap .pr{
  font-size:12.5px;color:var(--dsw-alias-label-primary,#f9fafb);line-height:1.5;font-weight:500;
  display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;
}
.snx-gen-hero-cap .meta{font-size:11px;color:var(--dsw-alias-label-caption,#81858c);margin-top:4px;letter-spacing:.04em}
.snx-gen-hero-cap .acts{display:flex;gap:6px;margin-top:10px;flex-wrap:wrap}
.snx-gen-act{
  background:var(--dsw-alias-bg-layer-3,#353638);color:var(--dsw-alias-label-secondary,#cfd3d6);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:6px;
  padding:5px 10px;font-size:11.5px;cursor:pointer;font-family:inherit;text-decoration:none;
  display:inline-flex;align-items:center;gap:4px;transition:all .15s;
}
.snx-gen-act:hover{background:var(--dsw-alias-interactive-bg-hover,#ffffff14);color:var(--dsw-alias-label-primary,#f9fafb);border-color:var(--dsw-alias-border-l3,#ffffff29)}

/* 空状态 */
.snx-gen-hero-empty{
  padding:48px 20px;text-align:center;color:var(--dsw-alias-label-caption,#81858c);
}
.snx-gen-hero-empty .big{font-size:42px;opacity:.25;line-height:1;margin-bottom:8px}
.snx-gen-hero-empty .t1{font-size:13px;color:var(--dsw-alias-label-tertiary,#adb2b8);font-weight:600;margin-bottom:4px}
.snx-gen-hero-empty .t2{font-size:11px;color:var(--dsw-alias-label-caption,#81858c)}

/* 忙时遮罩 */
.snx-gen-hero-busy{
  position:absolute;inset:0;background:var(--dsw-alias-bg-mask-1,#00000080);backdrop-filter:blur(6px);
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;z-index:5;
}
.snx-gen-hero-busy .spin{
  width:36px;height:36px;border-radius:50%;
  border:3px solid color-mix(in srgb,var(--snx-accent) 20%,transparent);border-top-color:var(--snx-accent);
  animation:snx-spin .8s linear infinite;
}
.snx-gen-hero-busy .lbl{font-size:13px;color:var(--snx-accent);font-weight:600;letter-spacing:.04em}
@keyframes snx-spin{to{transform:rotate(360deg)}}

/* ── 表单 ── */
.snx-gen-form{display:flex;flex-direction:column;gap:14px}
.snx-gen-fprompt{display:flex;flex-direction:column;gap:8px}
.snx-gen-label,.snx-gen-fprompt .lb,.snx-gen-fsize .lb,.snx-gen-ff .lb{
  display:flex;align-items:center;gap:6px;font-size:11px;color:var(--dsw-alias-label-tertiary,#adb2b8);
  font-weight:600;letter-spacing:.06em;text-transform:uppercase;
}
.snx-gen-label .ti,.snx-gen-fprompt .lb .ti,.snx-gen-fsize .lb .ti,.snx-gen-ff .lb .ti{font-size:13px;line-height:1;color:var(--snx-accent)}
.snx-gen-fprompt .lb .hk{margin-left:auto;font-size:10px;color:var(--dsw-alias-label-caption,#81858c);font-weight:500;letter-spacing:.04em;text-transform:none}
.snx-gen-ta{
  width:100%;box-sizing:border-box;background:var(--dsw-alias-bg-module-platform,#353638);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:8px;
  color:var(--dsw-alias-label-primary,#f9fafb);padding:10px 12px;font-size:13px;font-family:inherit;resize:vertical;
  min-height:70px;line-height:1.55;transition:border-color .15s;
}
.snx-gen-ta.sm{min-height:48px;font-size:12px}
.snx-gen-ta:focus{outline:none;border-color:var(--snx-accent);background:var(--dsw-alias-bg-layer-3,#353638)}

/* 高级折叠 */
.snx-gen-fneg-tg{
  background:none;border:none;color:var(--dsw-alias-label-tertiary,#adb2b8);font-size:11px;cursor:pointer;font-family:inherit;
  padding:4px 0;display:inline-flex;align-items:center;gap:6px;
}
.snx-gen-fneg-tg:hover{color:var(--dsw-alias-label-secondary,#cfd3d6)}
.snx-gen-fneg-body{margin-top:8px;display:flex;flex-direction:column;gap:10px}
.snx-gen-seed{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--dsw-alias-label-tertiary,#adb2b8)}
.snx-gen-seed input{
  width:90px;background:var(--dsw-alias-bg-module-platform,#353638);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:6px;
  color:var(--dsw-alias-label-primary,#f9fafb);padding:5px 8px;font-size:12px;
}
.snx-gen-seed input:focus{outline:none;border-color:var(--snx-accent)}
.snx-gen-seed button{
  background:var(--dsw-alias-bg-layer-3,#353638);color:var(--dsw-alias-label-secondary,#cfd3d6);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:6px;
  padding:5px 8px;cursor:pointer;font-size:12px;
}
.snx-gen-seed button:hover{background:var(--dsw-alias-interactive-bg-hover,#ffffff14);color:var(--dsw-alias-label-primary,#f9fafb)}
.snx-gen-seed .h{margin-left:auto;color:var(--dsw-alias-label-caption,#81858c);font-size:10.5px}

/* 比例快选 */
.snx-gen-fsize-row{display:flex;gap:6px;flex-wrap:wrap}
.snx-gen-chip{
  background:var(--dsw-alias-bg-module-platform,#353638);color:var(--dsw-alias-label-secondary,#cfd3d6);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:6px;
  padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;
  transition:all .15s;
}
.snx-gen-chip:hover{background:var(--dsw-alias-bg-layer-3,#353638);color:var(--dsw-alias-label-primary,#f9fafb);border-color:var(--dsw-alias-border-l3,#ffffff29)}
.snx-gen-chip.on{
  background:color-mix(in srgb,var(--snx-accent) 15%,transparent);
  border-color:var(--snx-accent);color:var(--snx-accent);
}

/* 模型+张数行 */
.snx-gen-frow{display:flex;gap:10px}
.snx-gen-ff{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px}
.snx-gen-ff.small{flex:0 0 110px}
.snx-gen-sel{
  width:100%;box-sizing:border-box;background:var(--dsw-alias-bg-module-platform,#353638);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:6px;
  color:var(--dsw-alias-label-primary,#f9fafb);padding:7px 10px;font-size:12.5px;font-family:inherit;cursor:pointer;
}
.snx-gen-sel:focus{outline:none;border-color:var(--snx-accent)}

/* 张数 stepper */
.snx-gen-stepper{
  display:inline-flex;align-items:center;border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:6px;
  background:var(--dsw-alias-bg-module-platform,#353638);overflow:hidden;
}
.snx-gen-stepper button{
  width:30px;height:32px;background:none;border:none;color:var(--dsw-alias-label-secondary,#cfd3d6);cursor:pointer;font-size:14px;font-family:inherit;
}
.snx-gen-stepper button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,#ffffff14);color:var(--dsw-alias-label-primary,#f9fafb)}
.snx-gen-stepper button:disabled{opacity:.35;cursor:not-allowed}
.snx-gen-stepper span{
  display:inline-flex;align-items:center;justify-content:center;min-width:32px;height:32px;
  color:var(--dsw-alias-label-primary,#f9fafb);font-size:13px;font-weight:700;
}

/* 生成按钮 */
.snx-gen-go{
  display:flex;align-items:center;justify-content:center;gap:10px;width:100%;
  padding:14px;border:none;border-radius:10px;cursor:pointer;
  background:var(--snx-accent-fill);
  color:var(--dsw-alias-label-primary-foreground,#fff);font-size:14.5px;font-weight:800;font-family:inherit;letter-spacing:.04em;
  box-shadow:0 4px 16px color-mix(in srgb,var(--snx-accent) 30%,transparent),inset 0 1px 0 color-mix(in srgb,var(--dsw-alias-label-primary-foreground,#fff) 15%,transparent);
  transition:all .15s;position:relative;overflow:hidden;
}
.snx-gen-go:hover:not(:disabled){
  transform:translateY(-1px);box-shadow:0 6px 22px color-mix(in srgb,var(--snx-accent) 45%,transparent),inset 0 1px 0 color-mix(in srgb,var(--dsw-alias-label-primary-foreground,#fff) 20%,transparent);
}
.snx-gen-go:active:not(:disabled){transform:translateY(0)}
.snx-gen-go:disabled,.snx-gen-go.disabled{opacity:.45;cursor:not-allowed}
.snx-gen-go.busy{background:var(--snx-accent-fill-hover);cursor:wait}
.snx-gen-go .ti{font-size:18px;line-height:1}
.snx-gen-go::after{
  content:'';position:absolute;inset:0;
  background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--dsw-alias-label-primary-foreground,#fff) 18%,transparent),transparent);
  transform:translateX(-100%);animation:snx-shimmer 2.2s infinite;
}
.snx-gen-go.busy::after{animation:snx-shimmer 1.2s infinite}
@keyframes snx-shimmer{to{transform:translateX(100%)}}

.snx-gen-err{
  font-size:12px;color:var(--snx-error);background:color-mix(in srgb,var(--snx-error) 8%,transparent);border:1px solid color-mix(in srgb,var(--snx-error) 30%,transparent);
  border-radius:6px;padding:8px 10px;line-height:1.5;
}

/* 最近画廊 */
.snx-gen-recent{display:flex;flex-direction:column;gap:8px;padding-top:6px;border-top:1px solid var(--dsw-alias-border-l2,#ffffff1f)}
.snx-gen-recent .lb{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--dsw-alias-label-tertiary,#adb2b8);font-weight:600;letter-spacing:.06em;text-transform:uppercase}
.snx-gen-recent .lb .ti{font-size:13px;color:var(--snx-accent)}
.snx-gen-recent .lb .h{margin-left:auto;color:var(--dsw-alias-label-caption,#81858c);text-transform:none;letter-spacing:0;font-weight:500}
.snx-gen-more{
  margin-left:auto;background:none;border:none;color:var(--snx-accent);cursor:pointer;font-size:11.5px;
  font-family:inherit;font-weight:600;
}
.snx-gen-more:hover{color:var(--snx-accent)}
.snx-gen-thumbs{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.snx-gen-thumb{
  position:relative;aspect-ratio:1;overflow:hidden;border-radius:6px;
  border:1px solid var(--dsw-alias-border-l2,#ffffff1f);background:var(--dsw-alias-bg-layer-2,#2c2c2e);cursor:pointer;padding:0;
  transition:all .15s;
}
.snx-gen-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.snx-gen-thumb:hover{border-color:var(--snx-accent);transform:translateY(-1px);box-shadow:0 4px 12px color-mix(in srgb,var(--snx-accent) 25%,transparent)}
.snx-gen-thumb.on{border-color:var(--snx-accent);box-shadow:0 0 0 2px color-mix(in srgb,var(--snx-accent) 25%,transparent)}

/* ═══════ CANVAS mode ═══════ */
.snx-canvas-wrap{
  position:relative;width:100%;height:100%;background:var(--dsw-alias-bg-layer-1,#232324);overflow:hidden;
}
.snx-canvas-stage{position:absolute;inset:0;overflow:hidden}
.snx-canvas-err{
  position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  color:var(--snx-error);font-size:13px;
}
.snx-canvas-empty{
  position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
  pointer-events:none;gap:8px;user-select:none;
}
.snx-canvas-empty .big{font-size:48px;opacity:.3;line-height:1;color:var(--snx-accent)}
.snx-canvas-empty .t1{font-size:13px;color:var(--dsw-alias-label-tertiary,#adb2b8);font-weight:600}
.snx-canvas-empty .t2{font-size:11px;color:var(--dsw-alias-label-caption,#81858c)}

/* 画布模式下的 prompt 浮动条（顶部居中）*/
.snx-pro.canvas-mode .snx-pbar{top:8px}

/* ═══════ GALLERY mode ═══════ */
.snx-gal{padding:14px;display:flex;flex-direction:column;gap:14px;min-height:100%}
.snx-gal-bar{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--dsw-alias-label-tertiary,#adb2b8);font-weight:600}
.snx-gal-btn{
  background:var(--dsw-alias-bg-layer-3,#353638);color:var(--snx-error);border:1px solid color-mix(in srgb,var(--snx-error) 30%,transparent);border-radius:6px;
  padding:5px 10px;font-size:11.5px;cursor:pointer;font-family:inherit;
}
.snx-gal-btn:hover{background:var(--dsw-alias-interactive-bg-hover,#ffffff14);color:var(--snx-error)}
.snx-gal-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
.snx-gal-item{
  background:var(--dsw-alias-bg-module-platform,#353638);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:8px;overflow:hidden;
  cursor:pointer;transition:all .15s;
}
.snx-gal-item:hover{border-color:var(--snx-accent);transform:translateY(-1px);box-shadow:0 4px 14px color-mix(in srgb,var(--snx-accent) 20%,transparent)}
.snx-gal-item-img{aspect-ratio:1;background:var(--dsw-alias-bg-document-preview,#151517);overflow:hidden}
.snx-gal-item-img img{width:100%;height:100%;object-fit:cover;display:block}
.snx-gal-item-meta{padding:8px 10px}
.snx-gal-item-pr{
  font-size:11.5px;color:var(--dsw-alias-label-primary,#f9fafb);line-height:1.4;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;
}
.snx-gal-item-sub{font-size:10.5px;color:var(--dsw-alias-label-caption,#81858c);margin-top:4px;letter-spacing:.04em}
.snx-gal-empty{
  flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;
  padding:60px 20px;text-align:center;color:var(--dsw-alias-label-caption,#81858c);gap:6px;
}
.snx-gal-empty .big{font-size:42px;opacity:.25;line-height:1;margin-bottom:8px}
.snx-gal-empty .t1{font-size:13px;color:var(--dsw-alias-label-tertiary,#adb2b8);font-weight:600}
.snx-gal-empty .t2{font-size:11px;color:var(--dsw-alias-label-caption,#81858c)}

/* ═══════ 状态栏 ═══════ */
.snx-pro-status{
  flex-shrink:0;display:flex;align-items:center;gap:12px;
  height:28px;padding:0 14px;border-top:1px solid var(--dsw-alias-border-l2,#ffffff1f);
  background:var(--dsw-alias-bg-layer-2,#2c2c2e);font-size:11px;color:var(--dsw-alias-label-caption,#81858c);letter-spacing:.03em;
}
.snx-pro-status span{display:inline-flex;align-items:center}

/* ═══════ 全局轻提示（非画布模式 / 全屏画布下的 notify）═══════ */
.snx-snack{
  position:fixed;bottom:56px;left:50%;transform:translateX(-50%);z-index:10000;
  max-width:70%;padding:8px 16px;border-radius:8px;
  background:var(--dsw-alias-toast-bg,#43454a);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);color:var(--dsw-alias-toast-label,#fff);
  font-size:12px;box-shadow:0 8px 24px rgba(0,0,0,.22);
  animation:snx-snack-in .18s ease-out;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}
@keyframes snx-snack-in{from{opacity:0;transform:translate(-50%,6px)}to{opacity:1;transform:translate(-50%,0)}}

/* ═══════ 窄布局适配（rightbar < 380px）═══ */
@container snxpro (max-width:379px){
  .snx-gen{padding:10px;gap:12px}
  .snx-pro-top{height:42px;padding:0 10px}
  .snx-pro-tag{display:none}
  .snx-gen-thumbs{grid-template-columns:repeat(3,1fr)}
  .snx-gal-grid{grid-template-columns:1fr}
  .snx-gen-frow,.snx-gen-frow3{flex-direction:column;gap:8px}
  .snx-gen-ff.small,.snx-gen-ff.tiny,.snx-gen-ff.tiny2{flex:1}
}

/* ═══════ v5 增量：Lightbox + Settings + i2i 锚点 + 风格预设 ═══════ */

/* ─── Lightbox 全屏预览 ─── */
.snx-lb-backdrop{
  position:fixed;inset:0;background:var(--dsw-alias-bg-mask-photo,#000000e0);backdrop-filter:blur(10px);
  z-index:9999;display:flex;align-items:center;justify-content:center;
  animation:snx-lb-in .2s ease-out;
}
@keyframes snx-lb-in{from{opacity:0}to{opacity:1}}
.snx-lb{
  display:flex;flex-direction:column;width:min(96vw,1100px);height:min(96vh,860px);
  background:var(--dsw-alias-bg-layer-1,#232324);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:12px;overflow:hidden;
  box-shadow:0 30px 80px rgba(0,0,0,.28),0 0 0 1px color-mix(in srgb,var(--snx-accent) 8%,transparent);
}
.snx-lb-top{
  height:48px;flex-shrink:0;display:flex;align-items:center;gap:12px;
  padding:0 16px;border-bottom:1px solid var(--dsw-alias-border-l2,#ffffff1f);background:var(--dsw-alias-bg-layer-2,#2c2c2e);
}
.snx-lb-info{display:flex;align-items:center;gap:10px;font-size:11.5px;color:var(--dsw-alias-label-tertiary,#adb2b8)}
.snx-lb-id{font-family:ui-monospace,Consolas,monospace;color:var(--snx-accent);background:color-mix(in srgb,var(--snx-accent) 10%,transparent);padding:2px 8px;border-radius:4px;font-size:10.5px}
.snx-lb-time{color:var(--dsw-alias-label-caption,#81858c);font-variant-numeric:tabular-nums}
.snx-lb-zoom{display:flex;align-items:center;gap:4px;background:var(--dsw-alias-bg-module-platform,#353638);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:6px;padding:2px}
.snx-lb-zoom button{width:26px;height:26px;background:none;border:none;color:var(--dsw-alias-label-secondary,#cfd3d6);cursor:pointer;border-radius:4px;font-family:inherit;font-size:14px}
.snx-lb-zoom button:hover{background:var(--dsw-alias-interactive-bg-hover,#ffffff14);color:var(--dsw-alias-label-primary,#f9fafb)}
.snx-lb-zoom span{display:inline-flex;align-items:center;justify-content:center;min-width:46px;font-size:11px;color:var(--dsw-alias-label-tertiary,#adb2b8);font-variant-numeric:tabular-nums}
.snx-lb-close{
  width:32px;height:32px;background:var(--dsw-alias-bg-layer-3,#353638);color:var(--dsw-alias-label-secondary,#cfd3d6);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);
  border-radius:6px;cursor:pointer;font-size:14px;
}
.snx-lb-close:hover{background:var(--dsw-alias-interactive-bg-hover,#ffffff14);color:var(--snx-error);border-color:color-mix(in srgb,var(--snx-error) 30%,transparent)}

.snx-lb-stage{
  flex:1;min-height:0;overflow:auto;display:flex;align-items:center;justify-content:center;
  background:
    radial-gradient(circle at 25% 25%,color-mix(in srgb,var(--snx-accent) 4%,transparent) 0%,transparent 50%),
    radial-gradient(circle at 75% 75%,color-mix(in srgb,var(--snx-accent) 4%,transparent) 0%,transparent 50%),
    var(--dsw-alias-bg-layer-1,#232324);
  background-image:
    linear-gradient(45deg,color-mix(in srgb,var(--dsw-alias-label-primary,#f9fafb) 4%,transparent) 25%,transparent 25%),
    linear-gradient(-45deg,color-mix(in srgb,var(--dsw-alias-label-primary,#f9fafb) 4%,transparent) 25%,transparent 25%),
    linear-gradient(45deg,transparent 75%,color-mix(in srgb,var(--dsw-alias-label-primary,#f9fafb) 4%,transparent) 75%),
    linear-gradient(-45deg,transparent 75%,color-mix(in srgb,var(--dsw-alias-label-primary,#f9fafb) 4%,transparent) 75%);
  background-size:24px 24px;background-position:0 0,0 12px,12px -12px,-12px 0;
}
.snx-lb-imgwrap{
  display:inline-block;transition:transform .2s ease-out;
  transform-origin:center center;
}
.snx-lb-img{
  display:block;max-width:none;height:auto;
  box-shadow:0 8px 40px rgba(0,0,0,.22);
  border-radius:4px;
}

.snx-lb-bot{
  flex-shrink:0;display:flex;flex-direction:column;gap:12px;
  padding:16px;border-top:1px solid var(--dsw-alias-border-l2,#ffffff1f);background:var(--dsw-alias-bg-layer-2,#2c2c2e);
  max-height:280px;
}
.snx-lb-meta{display:flex;flex-direction:column;gap:10px;min-height:0;overflow-y:auto}
.snx-lb-pr .lb{font-size:10.5px;color:var(--dsw-alias-label-tertiary,#adb2b8);letter-spacing:.06em;text-transform:uppercase;font-weight:600;margin-bottom:4px}
.snx-lb-pr .val{
  font-size:12.5px;color:var(--dsw-alias-label-primary,#f9fafb);line-height:1.55;
  background:var(--dsw-alias-bg-module-platform,#353638);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:6px;padding:8px 10px;
  max-height:80px;overflow-y:auto;white-space:pre-wrap;word-break:break-word;
}
.snx-lb-params{
  display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;
}
.snx-lb-params>div{display:flex;flex-direction:column;gap:2px;font-size:11px}
.snx-lb-params .k{color:var(--dsw-alias-label-caption,#81858c);letter-spacing:.04em;text-transform:uppercase;font-size:10px}
.snx-lb-params .v{color:var(--dsw-alias-label-primary,#f9fafb);font-weight:600;font-variant-numeric:tabular-nums}
.snx-lb-acts{
  display:flex;gap:6px;flex-wrap:wrap;padding-top:10px;border-top:1px solid var(--dsw-alias-border-l2,#ffffff1f);
}
.snx-lb-act{
  background:var(--dsw-alias-bg-layer-3,#353638);color:var(--dsw-alias-label-secondary,#cfd3d6);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:6px;
  padding:7px 12px;font-size:12px;cursor:pointer;font-family:inherit;font-weight:500;
  display:inline-flex;align-items:center;gap:5px;
}
.snx-lb-act:hover{background:var(--dsw-alias-interactive-bg-hover,#ffffff14);color:var(--dsw-alias-label-primary,#f9fafb);border-color:var(--dsw-alias-border-l3,#ffffff29)}
.snx-lb-act.go{background:color-mix(in srgb,var(--snx-accent) 15%,transparent);border-color:var(--snx-accent);color:var(--snx-accent)}
.snx-lb-act.go:hover{background:color-mix(in srgb,var(--snx-accent) 25%,transparent)}
.snx-lb-act.danger{color:var(--snx-error);border-color:color-mix(in srgb,var(--snx-error) 30%,transparent)}
.snx-lb-act.danger:hover{background:color-mix(in srgb,var(--snx-error) 10%,transparent);color:var(--snx-error)}

/* ─── i2i 锚点提示（GenForm 顶部）── */
.snx-gen-anchor{
  display:flex;align-items:center;gap:10px;padding:8px;
  background:color-mix(in srgb,var(--snx-accent) 9%,transparent);
  border:1px solid color-mix(in srgb,var(--snx-accent) 40%,transparent);border-radius:8px;
  box-shadow:0 0 0 1px color-mix(in srgb,var(--snx-accent) 8%,transparent),0 4px 12px color-mix(in srgb,var(--snx-accent) 10%,transparent);
}
.snx-gen-anchor-thumb{
  width:48px;height:48px;border-radius:6px;object-fit:cover;flex-shrink:0;
  border:1px solid color-mix(in srgb,var(--snx-accent) 40%,transparent);
}
.snx-gen-anchor-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.snx-gen-anchor-info .lb{font-size:10.5px;color:var(--snx-accent);font-weight:700;letter-spacing:.08em;text-transform:uppercase}
.snx-gen-anchor-info .sub{
  font-size:11.5px;color:var(--dsw-alias-label-secondary,#cfd3d6);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
}
.snx-gen-anchor-x{
  width:24px;height:24px;background:none;border:1px solid color-mix(in srgb,var(--snx-accent) 30%,transparent);color:var(--snx-accent);
  border-radius:6px;cursor:pointer;font-size:12px;flex-shrink:0;
}
.snx-gen-anchor-x:hover{background:color-mix(in srgb,var(--snx-accent) 15%,transparent)}

/* ─── 风格预设 chips ─── */
.snx-gen-styles{display:flex;flex-direction:column;gap:6px;margin-top:8px}
.snx-gen-styles .lb{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--dsw-alias-label-tertiary,#adb2b8);font-weight:600;letter-spacing:.06em;text-transform:uppercase}
.snx-gen-styles .lb .ti{font-size:13px;color:var(--snx-accent)}
.snx-gen-styles-clr{
  margin-left:auto;background:none;border:none;color:var(--dsw-alias-label-tertiary,#adb2b8);cursor:pointer;
  font-size:11px;font-family:inherit;
}
.snx-gen-styles-clr:hover{color:var(--snx-error)}
.snx-gen-styles-row{display:flex;flex-wrap:wrap;gap:5px}
.snx-gen-styles-row .snx-gen-chip{font-size:11px;padding:4px 9px}

/* ─── 字符计数 + 高级标签 ─── */
.snx-gen-fprompt .lb .cnt{
  font-size:10px;color:var(--dsw-alias-label-caption,#81858c);font-weight:500;letter-spacing:0;text-transform:none;
  font-variant-numeric:tabular-nums;padding:2px 6px;background:var(--dsw-alias-bg-module-platform,#353638);border-radius:8px;
}
.snx-gen-fprompt .lb .cnt.over{color:var(--snx-error);background:color-mix(in srgb,var(--snx-error) 10%,transparent)}

/* ─── 3 列参数行（模型/画质/张数）── */
.snx-gen-frow3{display:flex;gap:8px}
.snx-gen-ff.tiny{flex:0 0 70px}
.snx-gen-ff.tiny2{flex:0 0 90px}

/* ─── Segmented control（2K/4K）── */
.snx-gen-seg{
  display:inline-flex;border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:6px;background:var(--dsw-alias-bg-module-platform,#353638);overflow:hidden;
}
.snx-gen-seg button{
  flex:1;background:none;border:none;color:var(--dsw-alias-label-tertiary,#adb2b8);cursor:pointer;padding:6px 10px;
  font-size:11px;font-family:inherit;font-weight:700;letter-spacing:.05em;
}
.snx-gen-seg button:hover{color:var(--dsw-alias-label-primary,#f9fafb);background:var(--dsw-alias-interactive-bg-hover,#ffffff14)}
.snx-gen-seg button.on{
  background:color-mix(in srgb,var(--snx-accent) 16%,transparent);
  color:var(--snx-accent);
}

/* ─── 比例当前值 ─── */
.snx-gen-fsize .lb .now{
  margin-left:auto;font-size:10.5px;color:var(--dsw-alias-label-secondary,#cfd3d6);font-variant-numeric:tabular-nums;
  padding:2px 6px;background:var(--dsw-alias-bg-module-platform,#353638);border-radius:8px;
}

/* ─── 高级展开（种子）── */
.snx-gen-advanced{display:flex;flex-direction:column;gap:8px;margin-top:6px}

/* ─── Hero hover overlay ─── */
.snx-gen-hero-imgbox{cursor:zoom-in;position:relative}
.snx-gen-hero-overlay{
  position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  background:var(--dsw-alias-bg-mask-2,#0003);backdrop-filter:blur(2px);
  opacity:0;transition:opacity .15s;pointer-events:none;border-radius:8px;
}
.snx-gen-hero-imgbox:hover .snx-gen-hero-overlay{opacity:1}
.snx-gen-hero-zoom{
  padding:8px 14px;background:var(--snx-accent-fill);color:var(--dsw-alias-label-primary-foreground,#fff);border-radius:20px;
  font-size:12px;font-weight:700;letter-spacing:.04em;
  box-shadow:0 4px 16px color-mix(in srgb,var(--snx-accent) 50%,transparent);
}

/* ─── 最近画廊空状态 ─── */
.snx-gen-recent-empty{
  font-size:11.5px;color:var(--dsw-alias-label-caption,#81858c);line-height:1.55;padding:8px 4px;
  border:1px dashed var(--dsw-alias-border-l2,#ffffff1f);border-radius:6px;
}

/* ═══════ Settings tab ═══════ */
.snx-set{padding:14px;display:flex;flex-direction:column;gap:14px}
.snx-set-section{
  background:var(--dsw-alias-bg-module-platform,#353638);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:8px;padding:14px;
}
.snx-set-h{
  display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--dsw-alias-label-primary,#f9fafb);
  font-weight:700;letter-spacing:.02em;
}
.snx-set-h .ti{font-size:14px;line-height:1;color:var(--snx-accent)}
.snx-set-tip{
  font-size:11.5px;color:var(--dsw-alias-label-tertiary,#adb2b8);line-height:1.6;margin-top:10px;
}
.snx-set-tip code{
  background:var(--dsw-alias-bg-layer-2,#2c2c2e);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:4px;padding:1px 6px;
  font-size:10.5px;color:var(--snx-accent);font-family:ui-monospace,Consolas,monospace;
}
.snx-set-row{display:flex;flex-direction:column;gap:8px;margin-top:10px}
.snx-set-row>div{
  display:flex;align-items:center;justify-content:space-between;gap:10px;
  font-size:12px;padding:6px 10px;background:var(--dsw-alias-bg-layer-2,#2c2c2e);border-radius:6px;
  border:1px solid var(--dsw-alias-border-l2,#ffffff1f);
}
.snx-set-row .k{color:var(--dsw-alias-label-tertiary,#adb2b8);letter-spacing:.04em}
.snx-set-row .v{color:var(--dsw-alias-label-primary,#f9fafb);font-weight:600;font-variant-numeric:tabular-nums}
.snx-set-btn{
  background:var(--dsw-alias-bg-layer-3,#353638);color:var(--snx-error);border:1px solid color-mix(in srgb,var(--snx-error) 30%,transparent);border-radius:6px;
  padding:5px 12px;font-size:11.5px;cursor:pointer;font-family:inherit;font-weight:500;
}
.snx-set-btn:hover{background:color-mix(in srgb,var(--snx-error) 12%,transparent);color:var(--snx-error)}
.snx-set-btn:disabled{opacity:.5;cursor:default}
.snx-set-btn.save{color:var(--snx-accent);border-color:color-mix(in srgb,var(--snx-accent) 35%,transparent)}
.snx-set-btn.save:hover:not(:disabled){background:color-mix(in srgb,var(--snx-accent) 12%,transparent);color:var(--snx-accent)}
.snx-set-btn.test{color:var(--dsw-alias-label-primary,#f9fafb);border-color:var(--dsw-alias-border-l2,#ffffff1f)}
.snx-set-btn.test:hover:not(:disabled){background:var(--dsw-alias-bg-layer-3,#353638);color:var(--dsw-alias-label-primary,#f9fafb)}

/* ═══════ v6 增量：QUEUE 队列 + COMPARE 对比 ═══════ */

/* ─── 队列 tab ─── */
.snx-queue{display:flex;flex-direction:column;gap:14px;padding:14px;min-height:100%}
.snx-queue-summary{
  display:grid;grid-template-columns:repeat(4,1fr);gap:8px;
}
.snx-queue-summary .stat{
  position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;
  padding:10px 6px;background:var(--dsw-alias-bg-module-platform,#353638);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:8px;
  transition:all .15s;
}
.snx-queue-summary .stat .n{font-size:18px;font-weight:900;letter-spacing:.04em;color:var(--dsw-alias-label-tertiary,#adb2b8);font-variant-numeric:tabular-nums}
.snx-queue-summary .stat .lb{font-size:10px;color:var(--dsw-alias-label-caption,#81858c);letter-spacing:.06em;text-transform:uppercase}
.snx-queue-summary .stat.running .n{color:var(--snx-accent)}
.snx-queue-summary .stat.running{border-color:color-mix(in srgb,var(--snx-accent) 40%,transparent);background:color-mix(in srgb,var(--snx-accent) 8%,transparent)}
.snx-queue-summary .stat.running .dot{
  position:absolute;top:8px;right:8px;width:6px;height:6px;border-radius:50%;
  background:var(--snx-accent);box-shadow:0 0 0 0 color-mix(in srgb,var(--snx-accent) 60%,transparent);
  animation:snx-pulse 1.4s infinite;
}
@keyframes snx-pulse{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--snx-accent) 60%,transparent)}70%{box-shadow:0 0 0 8px color-mix(in srgb,var(--snx-accent) 0%,transparent)}100%{box-shadow:0 0 0 0 color-mix(in srgb,var(--snx-accent) 0%,transparent)}}
.snx-queue-summary .stat.pending .n{color:var(--dsw-alias-label-secondary,#cfd3d6)}
.snx-queue-summary .stat.done .n{color:var(--snx-ok)}
.snx-queue-summary .stat.error .n{color:var(--snx-error)}
.snx-queue-cancel{
  align-self:flex-end;background:color-mix(in srgb,var(--snx-error) 12%,transparent);color:var(--snx-error);
  border:1px solid color-mix(in srgb,var(--snx-error) 30%,transparent);border-radius:6px;padding:6px 12px;
  font-size:11.5px;cursor:pointer;font-family:inherit;font-weight:600;
}
.snx-queue-cancel:hover{background:color-mix(in srgb,var(--snx-error) 20%,transparent);color:var(--snx-error)}

.snx-queue-progress{
  display:flex;flex-direction:column;gap:6px;padding:10px;
  background:color-mix(in srgb,var(--snx-accent) 5%,transparent);
  border:1px solid color-mix(in srgb,var(--snx-accent) 20%,transparent);border-radius:8px;
}
.snx-queue-progress .bar{
  height:6px;background:var(--dsw-alias-bg-layer-2,#2c2c2e);border-radius:3px;overflow:hidden;
  border:1px solid var(--dsw-alias-border-l2,#ffffff1f);
}
.snx-queue-progress .fill{
  height:100%;background:var(--snx-accent-fill);
  transition:width .3s ease-out;
  box-shadow:0 0 10px color-mix(in srgb,var(--snx-accent) 50%,transparent);
}
.snx-queue-progress .lbl{font-size:11px;color:var(--dsw-alias-label-tertiary,#adb2b8);letter-spacing:.04em;font-variant-numeric:tabular-nums}

.snx-queue-list{display:flex;flex-direction:column;gap:6px}
.snx-queue-empty{
  flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;
  padding:60px 20px;text-align:center;color:var(--dsw-alias-label-caption,#81858c);gap:6px;
}
.snx-queue-empty .big{font-size:42px;opacity:.25;line-height:1;color:var(--snx-accent);margin-bottom:8px}
.snx-queue-empty .t1{font-size:13px;color:var(--dsw-alias-label-tertiary,#adb2b8);font-weight:600}
.snx-queue-empty .t2{font-size:11px;color:var(--dsw-alias-label-caption,#81858c)}

/* ─── 队列单项 ─── */
.snx-qi{
  display:flex;align-items:center;gap:10px;padding:8px 10px;
  background:var(--dsw-alias-bg-module-platform,#353638);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:8px;
  cursor:default;transition:all .15s;
}
.snx-qi-done{cursor:pointer}
.snx-qi-done:hover{border-color:var(--snx-accent);background:var(--dsw-alias-bg-layer-3,#353638)}
.snx-qi-error{border-color:color-mix(in srgb,var(--snx-error) 30%,transparent);background:color-mix(in srgb,var(--snx-error) 4%,transparent)}
.snx-qi-running{border-color:color-mix(in srgb,var(--snx-accent) 30%,transparent);background:color-mix(in srgb,var(--snx-accent) 5%,transparent)}
.snx-qi-pending{opacity:.85}
.snx-qi-img{
  width:54px;height:54px;border-radius:6px;flex-shrink:0;
  background:var(--dsw-alias-bg-layer-2,#2c2c2e);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);overflow:hidden;
  display:flex;align-items:center;justify-content:center;position:relative;
}
.snx-qi-img img{width:100%;height:100%;object-fit:cover}
.snx-qi-spin{display:flex;flex-direction:column;align-items:center;gap:4px;font-size:9.5px;color:var(--dsw-alias-label-tertiary,#adb2b8)}
.snx-qi-spin .spin{
  width:18px;height:18px;border-radius:50%;
  border:2px solid color-mix(in srgb,var(--snx-accent) 20%,transparent);border-top-color:var(--snx-accent);
  animation:snx-spin .8s linear infinite;
}
.snx-qi-err-ico{color:var(--snx-error);font-size:22px}
.snx-qi-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.snx-qi-pr{
  font-size:12px;color:var(--dsw-alias-label-primary,#f9fafb);line-height:1.4;
  display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden;
}
.snx-qi-meta{font-size:10.5px;color:var(--dsw-alias-label-caption,#81858c);display:flex;flex-wrap:wrap;gap:0;letter-spacing:.03em}
.snx-qi-st{
  display:inline-block;padding:1px 6px;border-radius:3px;
  font-size:9.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
}
.snx-qi-running .snx-qi-st{background:color-mix(in srgb,var(--snx-accent) 20%,transparent);color:var(--snx-accent)}
.snx-qi-pending .snx-qi-st{background:var(--dsw-alias-interactive-bg-hover,#ffffff14);color:var(--dsw-alias-label-secondary,#cfd3d6)}
.snx-qi-done .snx-qi-st{background:color-mix(in srgb,var(--snx-ok) 15%,transparent);color:var(--snx-ok)}
.snx-qi-error .snx-qi-st{background:color-mix(in srgb,var(--snx-error) 20%,transparent);color:var(--snx-error)}
.snx-qi-err-msg{color:var(--snx-error)}
.snx-qi-acts{display:flex;gap:4px;flex-shrink:0}
.snx-qi-act{
  width:26px;height:26px;background:var(--dsw-alias-bg-layer-3,#353638);color:var(--dsw-alias-label-secondary,#cfd3d6);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);
  border-radius:5px;cursor:pointer;font-size:12px;font-family:inherit;
}
.snx-qi-act:hover{background:var(--dsw-alias-interactive-bg-hover,#ffffff14);color:var(--dsw-alias-label-primary,#f9fafb)}
.snx-qi-act.danger{color:var(--snx-error);border-color:color-mix(in srgb,var(--snx-error) 30%,transparent)}
.snx-qi-act.danger:hover{background:color-mix(in srgb,var(--snx-error) 12%,transparent);color:var(--snx-error)}

/* ─── 队列 tab 角标（pulse 动画）── */
.snx-pro-tabs button .cnt.pulse{
  background:var(--snx-accent-fill);color:var(--dsw-alias-label-primary-foreground,#fff);
  box-shadow:0 0 0 0 color-mix(in srgb,var(--snx-accent) 60%,transparent);
  animation:snx-pulse 1.4s infinite;
}

/* ═══════ COMPARE 对比视图 ═══════ */
.snx-cmp{display:flex;flex-direction:column;gap:12px;padding:14px;min-height:100%}
.snx-cmp-bar{display:flex;align-items:center;gap:8px}
.snx-cmp-picks{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;flex:1}
.snx-cmp-slot{
  position:relative;aspect-ratio:1;background:var(--dsw-alias-bg-layer-2,#2c2c2e);border:1px dashed var(--dsw-alias-border-l2,#ffffff1f);
  border-radius:6px;display:flex;align-items:center;justify-content:center;
  color:var(--dsw-alias-label-caption,#81858c);font-size:18px;
}
.snx-cmp-slot.filled{border-style:solid;border-color:var(--snx-accent)}
.snx-cmp-slot img{width:100%;height:100%;object-fit:cover;border-radius:5px}
.snx-cmp-slot-x{
  position:absolute;top:2px;right:2px;width:18px;height:18px;
  background:var(--dsw-alias-bg-mask-1,#00000080);color:var(--dsw-alias-label-primary-foreground,#fff);border:none;border-radius:50%;cursor:pointer;
  font-size:10px;line-height:1;
}
.snx-cmp-add{
  background:var(--dsw-alias-bg-module-platform,#353638);color:var(--dsw-alias-label-primary,#f9fafb);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:6px;
  padding:6px 8px;font-size:11px;cursor:pointer;font-family:inherit;max-width:140px;
}
.snx-cmp-empty{
  flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;
  padding:40px 20px;text-align:center;color:var(--dsw-alias-label-caption,#81858c);gap:6px;
}
.snx-cmp-empty .big{font-size:42px;opacity:.25;line-height:1;color:var(--snx-accent);margin-bottom:8px}
.snx-cmp-empty .t1{font-size:13px;color:var(--dsw-alias-label-tertiary,#adb2b8);font-weight:600}
.snx-cmp-empty .t2{font-size:11px;color:var(--dsw-alias-label-caption,#81858c)}

/* ─── 两图 overlay slider ─── */
.snx-cmp-pair{display:flex;flex-direction:column;gap:10px}
.snx-cmp-stage{
  position:relative;background:var(--dsw-alias-bg-document-preview,#151517);border-radius:8px;overflow:hidden;
  aspect-ratio:1;cursor:ew-resize;user-select:none;
  border:1px solid var(--dsw-alias-border-l2,#ffffff1f);
}
.snx-cmp-base,.snx-cmp-clip img{display:block;width:100%;height:100%;object-fit:contain}
.snx-cmp-clip{
  position:absolute;top:0;left:0;height:100%;overflow:hidden;
  border-right:2px solid var(--snx-accent);
  box-shadow:4px 0 16px color-mix(in srgb,var(--snx-accent) 30%,transparent);
}
.snx-cmp-handle{
  position:absolute;top:0;bottom:0;width:2px;transform:translateX(-50%);
  cursor:ew-resize;display:flex;align-items:center;justify-content:center;
}
.snx-cmp-handle-bar{
  position:absolute;inset:0;background:var(--snx-accent-fill);
  box-shadow:0 0 12px color-mix(in srgb,var(--snx-accent) 50%,transparent);
}
.snx-cmp-handle-knob{
  position:relative;width:36px;height:36px;border-radius:50%;
  background:var(--snx-accent-fill);color:var(--dsw-alias-label-primary-foreground,#fff);
  display:flex;align-items:center;justify-content:center;font-size:14px;
  box-shadow:0 4px 12px color-mix(in srgb,var(--snx-accent) 50%,transparent);
}
.snx-cmp-tag{
  position:absolute;top:8px;padding:3px 8px;background:var(--dsw-alias-bg-mask-1,#00000080);
  color:var(--dsw-alias-label-primary-foreground,#fff);font-size:10.5px;font-weight:700;letter-spacing:.06em;border-radius:4px;
}
.snx-cmp-tag.l{left:8px}
.snx-cmp-tag.r{right:8px;background:var(--snx-accent-fill)}
.snx-cmp-info{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.snx-cmp-info-c{
  background:var(--dsw-alias-bg-module-platform,#353638);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:6px;padding:8px 10px;
}
.snx-cmp-info-c .lb{font-size:10px;color:var(--dsw-alias-label-tertiary,#adb2b8);letter-spacing:.06em;text-transform:uppercase;font-weight:700;margin-bottom:4px}
.snx-cmp-info-c .pr{
  font-size:11.5px;color:var(--dsw-alias-label-primary,#f9fafb);line-height:1.4;
  display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;
}

/* ─── 3-4 图网格 ─── */
.snx-cmp-grid{display:flex;flex-direction:column;gap:8px}
.snx-cmp-grid-big{
  position:relative;background:var(--dsw-alias-bg-document-preview,#151517);border-radius:8px;overflow:hidden;
  aspect-ratio:1;border:1px solid var(--dsw-alias-border-l2,#ffffff1f);
}
.snx-cmp-grid-big img{width:100%;height:100%;object-fit:contain}
.snx-cmp-grid-big-pr{
  position:absolute;left:0;right:0;bottom:0;padding:8px 12px;
  background:linear-gradient(transparent,var(--dsw-alias-bg-mask-photo,#000000e0));color:var(--dsw-alias-label-primary-foreground,#fff);
  font-size:11.5px;line-height:1.4;
}
.snx-cmp-grid-row{display:grid;gap:6px}
.snx-cmp-grid-row.cols-2{grid-template-columns:repeat(2,1fr)}
.snx-cmp-grid-row.cols-3{grid-template-columns:repeat(3,1fr)}
.snx-cmp-grid-row.cols-4{grid-template-columns:repeat(4,1fr)}
.snx-cmp-grid-cell{
  position:relative;aspect-ratio:1;background:var(--dsw-alias-bg-layer-2,#2c2c2e);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);
  border-radius:6px;overflow:hidden;cursor:pointer;padding:0;
  transition:all .15s;
}
.snx-cmp-grid-cell img{width:100%;height:100%;object-fit:cover;display:block}
.snx-cmp-grid-cell:hover{border-color:var(--snx-accent)}
.snx-cmp-grid-cell.on{border-color:var(--snx-accent);box-shadow:0 0 0 2px color-mix(in srgb,var(--snx-accent) 30%,transparent)}
.snx-cmp-grid-cell-tag{
  position:absolute;top:4px;left:4px;padding:1px 6px;
  background:var(--dsw-alias-bg-mask-1,#00000080);color:var(--dsw-alias-label-primary-foreground,#fff);font-size:9.5px;
  font-family:ui-monospace,Consolas,monospace;border-radius:3px;
}

/* ─── 对比池 ─── */
.snx-cmp-pool{display:flex;flex-direction:column;gap:8px;margin-top:6px}
.snx-cmp-pool .lb{font-size:10.5px;color:var(--dsw-alias-label-tertiary,#adb2b8);letter-spacing:.06em;text-transform:uppercase;font-weight:700}
.snx-cmp-pool-row{
  display:grid;grid-template-columns:repeat(8,1fr);gap:4px;
}
.snx-cmp-pool-item{
  position:relative;aspect-ratio:1;background:var(--dsw-alias-bg-layer-2,#2c2c2e);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);
  border-radius:5px;overflow:hidden;cursor:pointer;padding:0;
  transition:all .15s;
}
.snx-cmp-pool-item img{width:100%;height:100%;object-fit:cover;display:block}
.snx-cmp-pool-item:hover{border-color:var(--snx-accent)}
.snx-cmp-pool-item.on{border-color:var(--snx-accent);box-shadow:0 0 0 2px color-mix(in srgb,var(--snx-accent) 30%,transparent)}

/* ═══════ v7 增量：FULLSCREEN CANVAS 全屏画布 ═══════ */

/* 画布模式下的「展开」按钮 */
.snx-canvas-fs{
  position:absolute;top:8px;right:8px;z-index:10;
  background:var(--dsw-alias-button-floating-fill,#2c2c2e);color:var(--dsw-alias-label-secondary,#cfd3d6);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);
  border-radius:6px;padding:4px 9px;font-size:11px;cursor:pointer;
  font-family:inherit;font-weight:500;backdrop-filter:blur(4px);
}
.snx-canvas-fs:hover{background:color-mix(in srgb,var(--snx-accent) 15%,transparent);color:var(--snx-accent);border-color:var(--snx-accent)}

/* 全屏画布 overlay */
.snx-fs{
  position:fixed;inset:0;z-index:9998;
  background:var(--dsw-alias-bg-layer-1,#232324);display:flex;flex-direction:column;
  animation:snx-fs-in .2s ease-out;
}
@keyframes snx-fs-in{from{opacity:0;transform:scale(.98)}to{opacity:1;transform:scale(1)}}
.snx-fs-top{
  height:48px;flex-shrink:0;display:flex;align-items:center;gap:12px;
  padding:0 16px;border-bottom:1px solid var(--dsw-alias-border-l2,#ffffff1f);
  background:var(--dsw-alias-bg-layer-2,#2c2c2e);
}
.snx-fs-brand{display:flex;align-items:center;gap:8px;font-weight:700;font-size:13px;color:var(--dsw-alias-label-primary,#f9fafb)}
.snx-fs-brand .ti{font-size:15px;color:var(--snx-accent)}
.snx-fs-brand .cnt{
  font-size:10px;color:var(--dsw-alias-label-tertiary,#adb2b8);padding:2px 7px;background:var(--dsw-alias-bg-module-platform,#353638);border-radius:8px;
  border:1px solid var(--dsw-alias-border-l2,#ffffff1f);letter-spacing:.04em;
}
.snx-fs-hint{font-size:11px;color:var(--dsw-alias-label-caption,#81858c);letter-spacing:.04em;padding:2px 8px;border:1px dashed var(--dsw-alias-border-l2,#ffffff1f);border-radius:4px}
.snx-fs-x{
  background:color-mix(in srgb,var(--snx-error) 10%,transparent);color:var(--snx-error);border:1px solid color-mix(in srgb,var(--snx-error) 30%,transparent);
  border-radius:6px;padding:6px 12px;font-size:12px;cursor:pointer;
  font-family:inherit;font-weight:600;
}
.snx-fs-x:hover{background:color-mix(in srgb,var(--snx-error) 20%,transparent);color:var(--snx-error)}

.snx-fs-body{flex:1;min-height:0;display:flex}

/* 左右侧栏 */
.snx-fs-layers,.snx-fs-props{
  width:240px;flex-shrink:0;background:var(--dsw-alias-bg-layer-2,#2c2c2e);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);
  display:flex;flex-direction:column;min-height:0;
}
.snx-fs-layers{border-right:1px solid var(--dsw-alias-border-l2,#ffffff1f)}
.snx-fs-props{border-left:1px solid var(--dsw-alias-border-l2,#ffffff1f)}
.snx-fs-h{
  flex-shrink:0;height:36px;display:flex;align-items:center;
  padding:0 14px;font-size:11.5px;color:var(--dsw-alias-label-tertiary,#adb2b8);font-weight:700;
  letter-spacing:.08em;text-transform:uppercase;border-bottom:1px solid var(--dsw-alias-border-l2,#ffffff1f);
}
.snx-fs-layers-list{
  flex:1;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:5px;
}
.snx-fs-layer{
  display:flex;align-items:center;gap:8px;padding:6px 8px;
  background:var(--dsw-alias-bg-module-platform,#353638);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:6px;
  cursor:pointer;transition:all .12s;
}
.snx-fs-layer:hover{border-color:var(--dsw-alias-border-l3,#ffffff29);background:var(--dsw-alias-bg-layer-3,#353638)}
.snx-fs-layer.on{border-color:var(--snx-accent);background:color-mix(in srgb,var(--snx-accent) 8%,transparent)}
.snx-fs-layer-img{
  width:42px;height:42px;flex-shrink:0;border-radius:4px;
  background:var(--dsw-alias-bg-document-preview,#151517);overflow:hidden;display:flex;align-items:center;justify-content:center;
  font-size:14px;color:var(--dsw-alias-label-caption,#81858c);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);
}
.snx-fs-layer-img img{width:100%;height:100%;object-fit:cover}
.snx-fs-layer-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.snx-fs-layer-pr{
  font-size:11.5px;color:var(--dsw-alias-label-primary,#f9fafb);line-height:1.3;
  display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden;
}
.snx-fs-layer-sub{font-size:10px;color:var(--dsw-alias-label-caption,#81858c);display:flex;align-items:center;gap:4px}
.snx-fs-layer-st{
  padding:1px 5px;border-radius:3px;font-size:9px;font-weight:700;
  letter-spacing:.06em;text-transform:uppercase;
}
.st-pending{background:var(--dsw-alias-interactive-bg-hover,#ffffff14);color:var(--dsw-alias-label-secondary,#cfd3d6)}
.st-running{background:color-mix(in srgb,var(--snx-accent) 20%,transparent);color:var(--snx-accent)}
.st-done{background:color-mix(in srgb,var(--snx-ok) 15%,transparent);color:var(--snx-ok)}
.st-error{background:color-mix(in srgb,var(--snx-error) 20%,transparent);color:var(--snx-error)}

/* 中央画布区 */
.snx-fs-stage{
  flex:1;min-width:0;position:relative;
  background:
    radial-gradient(circle at 25% 25%,color-mix(in srgb,var(--snx-accent) 4%,transparent) 0%,transparent 50%),
    radial-gradient(circle at 75% 75%,color-mix(in srgb,var(--snx-accent) 4%,transparent) 0%,transparent 50%),
    var(--dsw-alias-bg-layer-1,#232324);
  display:flex;flex-direction:column;
}
.snx-fs-canvas{position:relative;flex:1;overflow:hidden}
.snx-fs-stage .snx-pbar{top:8px}

/* 右侧属性面板 */
.snx-fs-props-body{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:12px}
.snx-fs-prop{
  background:var(--dsw-alias-bg-module-platform,#353638);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:6px;padding:10px 12px;
}
.snx-fs-prop .lb{font-size:10px;color:var(--dsw-alias-label-tertiary,#adb2b8);letter-spacing:.06em;text-transform:uppercase;font-weight:700;margin-bottom:5px}
.snx-fs-prop .val{
  font-size:12px;color:var(--dsw-alias-label-primary,#f9fafb);line-height:1.5;
  background:var(--dsw-alias-bg-layer-2,#2c2c2e);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:4px;padding:6px 8px;
}
.snx-fs-prop .val.mono{font-family:ui-monospace,Consolas,monospace;font-size:11px;color:var(--snx-accent)}
.snx-fs-prop-acts{display:flex;flex-direction:column;gap:6px}
.snx-fs-pa{
  background:var(--dsw-alias-bg-layer-3,#353638);color:var(--dsw-alias-label-secondary,#cfd3d6);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:5px;
  padding:7px 10px;font-size:11.5px;cursor:pointer;font-family:inherit;
  text-align:left;display:flex;align-items:center;gap:6px;
}
.snx-fs-pa:hover{background:var(--dsw-alias-interactive-bg-hover,#ffffff14);color:var(--dsw-alias-label-primary,#f9fafb);border-color:var(--dsw-alias-border-l3,#ffffff29)}
.snx-fs-pa.danger{color:var(--snx-error);border-color:color-mix(in srgb,var(--snx-error) 30%,transparent)}
.snx-fs-pa.danger:hover{background:color-mix(in srgb,var(--snx-error) 10%,transparent);color:var(--snx-error)}
.snx-fs-props-empty{
  flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:8px;color:var(--dsw-alias-label-caption,#81858c);font-size:11px;padding:40px 20px;text-align:center;
}
.snx-fs-props-empty .big{font-size:36px;opacity:.25}

/* 窄屏适配：右栏宽度小时折叠侧栏 */
@container snxpro (max-width:500px){
  .snx-pro-tabs button span.ti+*{display:none}
  .snx-fs-layers,.snx-fs-props{width:160px}
  .snx-fs-layers-list{padding:4px}
}

/* ═══════ v8 增量：多参考图 / 画笔v2 / 画布工具 / 提示词库 / 快捷键 overlay / 调整 / 导出 ═══════ */

/* ── 多参考图槽位 ── */
.snx-gen-refs-add{
  width:100%;padding:7px;background:var(--dsw-alias-bg-layer-2,#2c2c2e);border:1px dashed var(--dsw-alias-border-l2,#ffffff1f);
  border-radius:6px;color:var(--dsw-alias-label-tertiary,#adb2b8);font-size:11.5px;cursor:pointer;font-family:inherit;
  margin-top:-2px;
}
.snx-gen-refs-add:hover{border-color:var(--snx-accent);color:var(--snx-accent)}
.snx-gen-refs{
  background:var(--dsw-alias-bg-layer-2,#2c2c2e);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:6px;padding:8px 10px;
  margin-top:-2px;
}
.snx-gen-refs>.lb{display:flex;align-items:center;gap:5px;font-size:10.5px;color:var(--dsw-alias-label-tertiary,#adb2b8);
  letter-spacing:.06em;text-transform:uppercase;font-weight:700;margin-bottom:6px}
.snx-gen-refs>.lb .h{color:var(--dsw-alias-label-caption,#81858c);font-weight:400;text-transform:none;font-size:10px}
.snx-gen-refs-row{display:flex;flex-wrap:wrap;gap:6px}
.snx-gen-ref{
  display:flex;flex-direction:column;background:var(--dsw-alias-bg-module-platform,#353638);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);
  border-radius:5px;overflow:hidden;width:84px;
}
.snx-gen-ref-img{width:84px;height:54px;object-fit:cover;display:block}
.snx-gen-ref-meta{padding:3px 4px;display:flex;flex-direction:column;gap:2px}
.snx-gen-ref-role{
  background:var(--dsw-alias-bg-layer-2,#2c2c2e);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);color:var(--dsw-alias-label-primary,#f9fafb);font-size:9px;
  border-radius:3px;padding:1px 2px;font-family:inherit;
}
.snx-gen-ref-strength{width:100%;height:3px;accent-color:var(--snx-accent)}
.snx-gen-ref-x{
  position:absolute;margin-left:-14px;margin-top:2px;width:14px;height:14px;
  background:var(--dsw-alias-bg-mask-1,#00000080);color:var(--dsw-alias-label-primary-foreground,#fff);border:none;border-radius:50%;font-size:9px;cursor:pointer;line-height:1;
}
.snx-gen-ref-add{
  display:flex;align-items:center;justify-content:center;width:84px;height:84px;
  background:var(--dsw-alias-bg-layer-2,#2c2c2e);border:1px dashed var(--dsw-alias-border-l2,#ffffff1f);border-radius:5px;
  color:var(--dsw-alias-label-tertiary,#adb2b8);font-size:11px;cursor:pointer;font-family:inherit;
}
.snx-gen-ref-add:hover{border-color:var(--snx-accent);color:var(--snx-accent)}
.snx-gen-ref-picker{
  margin-top:6px;display:grid;grid-template-columns:repeat(4,1fr);gap:4px;
  max-height:140px;overflow-y:auto;background:var(--dsw-alias-bg-layer-2,#2c2c2e);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);
  border-radius:5px;padding:5px;
}
.snx-gen-ref-pick{
  aspect-ratio:1;background:var(--dsw-alias-bg-document-preview,#151517);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:3px;
  overflow:hidden;cursor:pointer;padding:0;
}
.snx-gen-ref-pick:hover{border-color:var(--snx-accent)}
.snx-gen-ref-pick img{width:100%;height:100%;object-fit:cover;display:block}

/* ── 提示词星标按钮 ── */
.snx-gen-star{
  background:none;border:1px solid var(--dsw-alias-border-l2,#ffffff1f);color:var(--dsw-alias-label-tertiary,#adb2b8);width:22px;height:22px;
  border-radius:4px;font-size:13px;cursor:pointer;padding:0;line-height:1;
}
.snx-gen-star.on{color:var(--snx-warn);border-color:var(--snx-warn);background:color-mix(in srgb,var(--snx-warn) 10%,transparent)}

/* ── 画笔 v2 控件 ── */
.snx-maskbar.v2{flex-wrap:wrap;max-width:520px}
.snx-brush-controls{
  display:flex;flex-direction:column;gap:4px;padding:5px 9px;
  background:var(--dsw-alias-bg-layer-1,#232324);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:6px;
}
.snx-brush-controls .lb{font-size:10.5px;color:var(--snx-accent);letter-spacing:.04em;font-weight:700}
.br-row{display:flex;align-items:center;gap:5px;font-size:10px;color:var(--dsw-alias-label-tertiary,#adb2b8)}
.br-row .br-k{width:42px;color:var(--dsw-alias-label-secondary,#cfd3d6);font-weight:500}
.br-row input[type=range]{flex:1;height:3px;accent-color:var(--snx-accent)}
.br-row .br-v{width:36px;color:var(--snx-accent);text-align:right;font-variant-numeric:tabular-nums}
.snx-brush-cursor{
  position:fixed;pointer-events:none;z-index:9999;
  border:1.5px solid var(--snx-accent);border-radius:50%;
  background:color-mix(in srgb,var(--snx-accent) 15%,transparent);mix-blend-mode:multiply;
}

/* ── Lightbox v8：3 栏 + 版本树 + 调整 + 导出 ── */
.snx-lb-body{display:grid;grid-template-columns:200px 1fr 280px;flex:1;min-height:0}
.snx-lb-stage{overflow:auto;background:var(--dsw-alias-bg-document-preview,#151517);display:flex;align-items:center;justify-content:center;position:relative}
.snx-lb-imgwrap{transform-origin:center center;transition:transform .15s ease}
.snx-lb-img{display:block;max-width:100%;max-height:100%}

.snx-lb-tree{
  background:var(--dsw-alias-bg-layer-2,#2c2c2e);border-right:1px solid var(--dsw-alias-border-l2,#ffffff1f);overflow-y:auto;
  display:flex;flex-direction:column;
}
.snx-lb-tree-h{
  flex-shrink:0;height:36px;display:flex;align-items:center;
  padding:0 12px;font-size:11.5px;color:var(--dsw-alias-label-tertiary,#adb2b8);font-weight:700;
  letter-spacing:.08em;text-transform:uppercase;border-bottom:1px solid var(--dsw-alias-border-l2,#ffffff1f);
}
.snx-tree{flex:1;overflow-y:auto;padding:6px}
.snx-tree-row{
  display:flex;align-items:center;gap:6px;width:100%;padding:4px 6px;
  background:var(--dsw-alias-bg-module-platform,#353638);border:1px solid transparent;border-radius:4px;
  cursor:pointer;font-family:inherit;text-align:left;
}
.snx-tree-row:hover{background:var(--dsw-alias-bg-layer-3,#353638)}
.snx-tree-node.on>.snx-tree-row{border-color:var(--snx-accent);background:color-mix(in srgb,var(--snx-accent) 8%,transparent)}
.snx-tree-thumb{width:30px;height:30px;border-radius:3px;background:var(--dsw-alias-bg-document-preview,#151517);overflow:hidden;flex-shrink:0;
  display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--dsw-alias-label-caption,#81858c)}
.snx-tree-thumb img{width:100%;height:100%;object-fit:cover}
.snx-tree-info{flex:1;min-width:0}
.snx-tree-info .pr{font-size:10.5px;color:var(--dsw-alias-label-primary,#f9fafb);line-height:1.3;
  display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}
.snx-tree-info .sub{font-size:9px;color:var(--dsw-alias-label-caption,#81858c);display:flex;gap:3px;align-items:center}
.snx-tree-curr{color:var(--snx-accent);font-weight:700}
.snx-tree-cnt{
  background:var(--dsw-alias-interactive-bg-hover,#ffffff14);color:var(--dsw-alias-label-tertiary,#adb2b8);font-size:9px;padding:1px 5px;
  border-radius:8px;font-weight:700;
}
.snx-tree-children{border-left:1px dashed var(--dsw-alias-border-l2,#ffffff1f);margin-left:14px}

.snx-lb-side{
  background:var(--dsw-alias-bg-layer-2,#2c2c2e);border-left:1px solid var(--dsw-alias-border-l2,#ffffff1f);overflow-y:auto;
  display:flex;flex-direction:column;
}
.snx-lb-side>.snx-lb-meta{padding:12px;border-bottom:1px solid var(--dsw-alias-border-l2,#ffffff1f)}
.snx-lb-side>.snx-lb-acts{flex-shrink:0;padding:10px;border-bottom:1px solid var(--dsw-alias-border-l2,#ffffff1f)}

.snx-lb-up{
  background:color-mix(in srgb,var(--snx-accent) 10%,transparent);color:var(--snx-accent);border:1px solid color-mix(in srgb,var(--snx-accent) 30%,transparent);
  border-radius:5px;padding:4px 8px;font-size:10.5px;cursor:pointer;font-family:inherit;font-weight:600;
  margin-right:6px;
}
.snx-lb-up:hover{background:color-mix(in srgb,var(--snx-accent) 20%,transparent);color:var(--dsw-alias-label-primary,#f9fafb)}

.snx-lb-fav{
  background:none;border:1px solid var(--dsw-alias-border-l2,#ffffff1f);color:var(--dsw-alias-label-tertiary,#adb2b8);width:26px;height:26px;
  border-radius:4px;font-size:14px;cursor:pointer;line-height:1;
}
.snx-lb-fav.on{color:var(--snx-warn);border-color:var(--snx-warn);background:color-mix(in srgb,var(--snx-warn) 10%,transparent)}

/* 调整浮窗 */
.snx-lb-adj{
  position:absolute;right:14px;top:14px;width:240px;
  background:var(--dsw-alias-button-floating-fill,#2c2c2e);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:8px;
  padding:10px 12px;backdrop-filter:blur(8px);
}
.snx-lb-adj-h{display:flex;align-items:center;gap:6px;margin-bottom:8px;font-size:11px;color:var(--snx-accent);font-weight:700}
.snx-lb-adj-h button{background:none;border:1px solid var(--dsw-alias-border-l2,#ffffff1f);color:var(--dsw-alias-label-secondary,#cfd3d6);
  border-radius:4px;padding:3px 7px;font-size:10px;cursor:pointer;font-family:inherit}
.snx-lb-adj-h button.save{background:var(--snx-accent-fill);border:none;color:var(--dsw-alias-label-primary-foreground,#fff);font-weight:700}
.snx-lb-adj-h button.save:disabled{opacity:.5;cursor:default}
.snx-lb-adj label{display:grid;grid-template-columns:36px 1fr 36px;gap:6px;align-items:center;
  font-size:10.5px;color:var(--dsw-alias-label-secondary,#cfd3d6);margin-bottom:4px}
.snx-lb-adj label input{width:100%;height:3px;accent-color:var(--snx-accent)}
.snx-lb-adj label .v{text-align:right;color:var(--snx-accent);font-variant-numeric:tabular-nums}

/* 导出面板 */
.snx-lb-export{
  margin:0 10px 10px;background:var(--dsw-alias-bg-module-platform,#353638);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);
  border-radius:6px;padding:10px 12px;
}
.snx-lb-export .lb{font-size:10.5px;color:var(--snx-accent);font-weight:700;margin-bottom:6px;
  letter-spacing:.04em}
.snx-lb-export label{display:grid;grid-template-columns:42px 1fr 36px;gap:6px;
  align-items:center;font-size:10.5px;color:var(--dsw-alias-label-secondary,#cfd3d6);margin-bottom:5px}
.snx-lb-export label input[type=range]{height:3px;accent-color:var(--snx-accent)}
.snx-lb-export label .v{text-align:right;color:var(--snx-accent);font-variant-numeric:tabular-nums}
.snx-lb-export select{
  background:var(--dsw-alias-bg-layer-2,#2c2c2e);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);color:var(--dsw-alias-label-primary,#f9fafb);
  border-radius:4px;padding:4px 6px;font-family:inherit;font-size:10.5px;
}
.snx-lb-export-chk{display:flex!important;grid-template-columns:auto 1fr!important;
  gap:6px;cursor:pointer}
.snx-lb-export-chk input[type=checkbox]{accent-color:var(--snx-accent)}
.snx-lb-export-acts{display:flex;gap:5px;margin-top:8px}
.snx-lb-export-acts .snx-lb-act{font-size:10.5px;padding:5px 9px}

/* ── 画廊工具栏（搜索/标签/排序/收藏筛选）── */
.snx-gal-tools{
  display:flex;flex-direction:column;gap:6px;padding:8px 12px;
  background:var(--dsw-alias-bg-layer-2,#2c2c2e);border-bottom:1px solid var(--dsw-alias-border-l2,#ffffff1f);
}
.snx-gal-q{
  width:100%;padding:6px 9px;background:var(--dsw-alias-bg-layer-2,#2c2c2e);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);
  border-radius:5px;color:var(--dsw-alias-label-primary,#f9fafb);font-size:11.5px;font-family:inherit;
}
.snx-gal-q:focus{outline:none;border-color:var(--snx-accent)}
.snx-gal-tools>div:not(.snx-gal-tags){
  display:flex;align-items:center;gap:6px;
}
.snx-gal-sel{
  background:var(--dsw-alias-bg-module-platform,#353638);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);color:var(--dsw-alias-label-primary,#f9fafb);
  border-radius:5px;padding:4px 6px;font-size:10.5px;font-family:inherit;flex-shrink:0;
}
.snx-gal-fav{
  background:var(--dsw-alias-bg-module-platform,#353638);color:var(--dsw-alias-label-tertiary,#adb2b8);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:5px;
  padding:4px 9px;font-size:10.5px;cursor:pointer;font-family:inherit;
}
.snx-gal-fav.on{color:var(--snx-warn);border-color:var(--snx-warn);background:color-mix(in srgb,var(--snx-warn) 10%,transparent)}
.snx-gal-tags{display:flex;flex-wrap:wrap;gap:4px}
.snx-gal-tag{
  background:var(--dsw-alias-bg-module-platform,#353638);color:var(--dsw-alias-label-tertiary,#adb2b8);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:3px;
  padding:3px 7px;font-size:10px;cursor:pointer;font-family:inherit;font-weight:500;
}
.snx-gal-tag:hover{color:var(--snx-accent);border-color:var(--snx-accent)}
.snx-gal-tag.on{background:color-mix(in srgb,var(--snx-accent) 15%,transparent);color:var(--snx-accent);border-color:var(--snx-accent)}

/* 画廊项的收藏 + 标签标记 */
.snx-gal-item{position:relative}
.snx-gal-item.fav .snx-gal-item-img{outline:2px solid color-mix(in srgb,var(--snx-warn) 50%,transparent);outline-offset:-2px}
.snx-gal-item-fav{
  position:absolute;top:4px;left:4px;width:22px;height:22px;
  background:var(--dsw-alias-bg-mask-1,#00000080);color:var(--snx-warn);font-size:13px;
  display:flex;align-items:center;justify-content:center;border-radius:50%;
  border:1px solid color-mix(in srgb,var(--snx-warn) 30%,transparent);
}
.snx-gal-item-tags{
  position:absolute;bottom:4px;left:4px;right:4px;
  display:flex;flex-wrap:wrap;gap:3px;
}
.snx-gal-item-tag{
  background:var(--dsw-alias-bg-mask-1,#00000080);color:var(--snx-accent);font-size:9px;
  padding:1px 5px;border-radius:3px;
}

/* ── 提示词库 section ── */
.snx-promptlib{display:flex;flex-direction:column;gap:6px}
.snx-promptlib-h{
  font-size:10px;color:var(--dsw-alias-label-tertiary,#adb2b8);font-weight:700;letter-spacing:.06em;
  text-transform:uppercase;margin-top:6px;margin-bottom:2px;
}
.snx-promptlib-item{
  display:flex;align-items:center;gap:6px;padding:5px 8px;
  background:var(--dsw-alias-bg-module-platform,#353638);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:5px;
}
.snx-promptlib-item.star{border-color:color-mix(in srgb,var(--snx-warn) 30%,transparent);background:color-mix(in srgb,var(--snx-warn) 4%,transparent)}
.snx-promptlib-pr{
  flex:1;min-width:0;font-size:11px;color:var(--dsw-alias-label-primary,#f9fafb);cursor:pointer;line-height:1.4;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;
}
.snx-promptlib-pr:hover{color:var(--snx-accent)}
.snx-promptlib-ts{font-size:9.5px;color:var(--dsw-alias-label-caption,#81858c);font-weight:400;flex-shrink:0}
.snx-promptlib-star,.snx-promptlib-x{
  background:none;border:none;color:var(--dsw-alias-label-tertiary,#adb2b8);cursor:pointer;font-size:14px;
  padding:0 4px;line-height:1;flex-shrink:0;
}
.snx-promptlib-star:hover,.snx-promptlib-x:hover{color:var(--snx-warn)}
.snx-promptlib-empty{font-size:11px;color:var(--dsw-alias-label-caption,#81858c);text-align:center;padding:14px 4px}

/* ── 快捷键速查 overlay ── */
.snx-help-bg{
  position:fixed;inset:0;z-index:10000;
  background:var(--dsw-alias-bg-mask-1,#00000080);display:flex;align-items:center;justify-content:center;
  backdrop-filter:blur(4px);animation:snx-fs-in .2s ease-out;
}
.snx-help{
  width:680px;max-width:92vw;max-height:88vh;
  background:var(--dsw-alias-bg-layer-2,#2c2c2e);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);
  border-radius:12px;display:flex;flex-direction:column;
  box-shadow:0 16px 64px rgba(0,0,0,.22);
}
.snx-help-top{
  display:flex;align-items:center;gap:8px;padding:14px 18px;
  border-bottom:1px solid var(--dsw-alias-border-l2,#ffffff1f);font-size:14px;font-weight:700;color:var(--dsw-alias-label-primary,#f9fafb);
}
.snx-help-top .ti{font-size:18px;color:var(--snx-accent)}
.snx-help-top .h{font-size:10.5px;color:var(--dsw-alias-label-caption,#81858c);letter-spacing:.04em}
.snx-help-top .snx-help-x{
  background:var(--dsw-alias-bg-layer-3,#353638);color:var(--dsw-alias-label-secondary,#cfd3d6);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);
  border-radius:5px;width:30px;height:30px;cursor:pointer;font-size:13px;
}
.snx-help-top .snx-help-x:hover{background:var(--dsw-alias-interactive-bg-hover,#ffffff14);color:var(--dsw-alias-label-primary,#f9fafb)}
.snx-help-body{
  padding:16px;overflow-y:auto;display:grid;
  grid-template-columns:repeat(2,1fr);gap:14px;
}
.snx-help-gh{
  font-size:11px;color:var(--dsw-alias-label-tertiary,#adb2b8);font-weight:700;letter-spacing:.06em;
  text-transform:uppercase;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid var(--dsw-alias-border-l2,#ffffff1f);
}
.snx-help-row{
  display:flex;align-items:center;gap:8px;font-size:11.5px;color:var(--dsw-alias-label-secondary,#cfd3d6);
  padding:4px 0;line-height:1.5;
}
.snx-help-row kbd{
  display:inline-block;min-width:110px;padding:3px 8px;
  background:var(--dsw-alias-bg-layer-3,#353638);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);
  border-radius:4px;font-family:ui-monospace,Consolas,monospace;
  font-size:10.5px;color:var(--snx-accent);text-align:center;flex-shrink:0;
  box-shadow:0 1px 0 var(--dsw-alias-bg-layer-2,#2c2c2e) inset;
}
.snx-help-foot{
  padding:10px 18px;border-top:1px solid var(--dsw-alias-border-l2,#ffffff1f);font-size:10.5px;color:var(--dsw-alias-label-caption,#81858c);
  text-align:center;letter-spacing:.06em;
}

/* ── 图层属性（v8）── */
.snx-fs-prop-row{margin-bottom:6px}
.snx-fs-prop-row label{display:grid;grid-template-columns:48px 1fr 36px;gap:6px;
  align-items:center;font-size:10.5px;color:var(--dsw-alias-label-secondary,#cfd3d6)}
.snx-fs-prop-row input[type=range]{height:3px;accent-color:var(--snx-accent)}
.snx-fs-prop-row .v{text-align:right;color:var(--snx-accent);font-variant-numeric:tabular-nums;font-size:10px}
.snx-fs-prop-row select{
  width:100%;background:var(--dsw-alias-bg-layer-2,#2c2c2e);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);color:var(--dsw-alias-label-primary,#f9fafb);
  border-radius:4px;padding:4px 6px;font-size:10.5px;font-family:inherit;
}
.snx-fs-prop-row.btns{display:flex;gap:5px}
.snx-fs-pa2{
  flex:1;background:var(--dsw-alias-bg-layer-3,#353638);color:var(--dsw-alias-label-secondary,#cfd3d6);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:5px;
  padding:6px;font-size:11px;cursor:pointer;font-family:inherit;
}
.snx-fs-pa2:hover{background:var(--dsw-alias-interactive-bg-hover,#ffffff14);color:var(--dsw-alias-label-primary,#f9fafb)}
.snx-fs-pa2.on{background:color-mix(in srgb,var(--snx-accent) 15%,transparent);color:var(--snx-accent);border-color:var(--snx-accent)}

/* ── 窄屏适应：版树/调整/导出在 360px 内自动折叠 ── */
@container snxpro (max-width:420px){
  .snx-lb-body{grid-template-columns:1fr 200px}
  .snx-lb-tree{display:none}
}

/* ═══════ v8.1：dsh-better-sidebar 文件预览器样式 ═══════ */
.snx-bsb-preview{
  display:flex;flex-direction:column;width:100%;height:100%;
  background:var(--dsw-alias-bg-layer-2,#2c2c2e);color:var(--dsw-alias-label-primary,#f9fafb);
  font-family:inherit;
}
.snx-bsb-toolbar{
  display:flex;align-items:center;gap:6px;
  padding:6px 10px;background:var(--dsw-alias-bg-layer-3,#353638);border-bottom:1px solid var(--dsw-alias-border-l2,#ffffff1f);
  font-size:11px;flex-shrink:0;
}
.snx-bsb-path{
  max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  color:var(--dsw-alias-label-tertiary,#adb2b8);font-family:ui-monospace,Consolas,monospace;font-size:10.5px;
}
.snx-bsb-info{color:var(--snx-accent);font-variant-numeric:tabular-nums}
.snx-bsb-toolbar button{
  background:var(--dsw-alias-bg-layer-3,#353638);color:var(--dsw-alias-label-secondary,#cfd3d6);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:4px;
  padding:3px 8px;font-size:11px;cursor:pointer;font-family:inherit;
}
.snx-bsb-toolbar button:hover{background:var(--dsw-alias-interactive-bg-hover,#ffffff14);color:var(--dsw-alias-label-primary,#f9fafb)}
.snx-bsb-toolbar button.snx-bsb-dl{
  background:var(--snx-accent-fill);border:none;color:var(--dsw-alias-label-primary-foreground,#fff);font-weight:600;
}
.snx-bsb-pct{
  display:inline-block;min-width:42px;text-align:center;color:var(--snx-accent);
  font-variant-numeric:tabular-nums;font-size:10.5px;
}
.snx-bsb-canvas{
  flex:1;overflow:auto;display:flex;align-items:center;justify-content:center;
  background:
    linear-gradient(45deg,color-mix(in srgb,var(--dsw-alias-label-primary,#f9fafb) 4%,transparent) 25%,transparent 25%) 0 0/16px 16px,
    linear-gradient(-45deg,color-mix(in srgb,var(--dsw-alias-label-primary,#f9fafb) 4%,transparent) 25%,transparent 25%) 0 8px/16px 16px,
    linear-gradient(45deg,transparent 75%,color-mix(in srgb,var(--dsw-alias-label-primary,#f9fafb) 4%,transparent) 75%) 8px -8px/16px 16px,
    linear-gradient(-45deg,transparent 75%,color-mix(in srgb,var(--dsw-alias-label-primary,#f9fafb) 4%,transparent) 75%) -8px 0/16px 16px,
    var(--dsw-alias-bg-layer-2,#2c2c2e);
  padding:20px;min-height:0;
}
.snx-bsb-canvas img{
  display:block;max-width:none;transition:transform .12s ease-out;
  box-shadow:0 8px 32px rgba(0,0,0,.28);
}
.snx-bsb-load,.snx-bsb-err{
  flex:1;display:flex;align-items:center;justify-content:center;gap:10px;
  color:var(--dsw-alias-label-tertiary,#adb2b8);font-size:13px;
}
.snx-bsb-err{color:var(--snx-error)}

/* ── v9：会话内灯箱（聊天页全屏预览，独立于工作台 lightbox）── */
.snx-tvlb{position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.82);
  display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:zoom-out;
  animation:snx-tvlb-in .14s ease-out}
@keyframes snx-tvlb-in{from{opacity:0}to{opacity:1}}
.snx-tvlb img{max-width:90vw;max-height:74vh;object-fit:contain;border-radius:8px;cursor:default;
  box-shadow:0 18px 60px rgba(0,0,0,.5)}
.snx-tvlb-bar{margin-top:14px;max-width:86vw;display:flex;align-items:center;gap:10px;cursor:default}
.snx-tvlb-prompt{font-size:12px;color:#d5d8dc;line-height:1.5;flex:1;min-width:0;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-all}
.snx-tvlb-bar button{flex-shrink:0;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.25);
  color:#fff;border-radius:7px;padding:6px 13px;font-size:12px;font-family:inherit;cursor:pointer}
.snx-tvlb-bar button:hover{background:rgba(255,255,255,.2)}
.snx-tvlb-x{position:fixed;top:14px;right:18px;background:none;border:none;color:#cfd3d6;
  font-size:22px;cursor:pointer;line-height:1}
.snx-tvlb-x:hover{color:#fff}

/* ── v9：回合尾投递（turnTail：生成的图直接落在回复下方）── */
.snx-tail{display:flex;flex-wrap:wrap;gap:10px;min-width:0;padding:2px 0}

/* ── v9：设置页顶部状态卡（对齐 dsh 设置页样式）── */
.snx-hero{display:flex;gap:8px;flex-wrap:wrap;margin:2px 0 6px}
.snx-hero-tile{flex:1;min-width:96px;border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:10px;
  padding:9px 12px;background:color-mix(in srgb,var(--dsw-alias-label-primary,#f9fafb) 4%,transparent);
  display:flex;flex-direction:column;gap:1px}
.snx-hero-num{font-size:16px;font-weight:600;line-height:1.2;color:var(--dsw-alias-label-primary,#f9fafb);
  font-variant-numeric:tabular-nums;display:flex;align-items:center;gap:6px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.snx-hero-dot{width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-state-success-primary,#22c55e);flex:none}
.snx-hero-dot.off{background:var(--dsw-alias-label-caption,#81858c)}
.snx-hero-dot.err{background:var(--dsw-alias-state-error-primary,#f25a5a)}
.snx-hero-lb{font-size:11px;color:var(--dsw-alias-label-tertiary,#adb2b8)}
`


    // ——— 主题令牌桥（Konva/Canvas 需要真实色值：getComputedStyle 读一次并缓存；读不到 → 中性回退）———
    let snxThemeCache = null
    function snxTheme() {
      if (snxThemeCache) return snxThemeCache
      const mk = (r, g, b, a) => `rgba(${r},${g},${b},${a})`
      const fb = {
        accent: [122, 170, 255],        // dsh deepseek-400（暗色主色）
        error: [242, 90, 90],           // dsh red-400
        ok: [34, 197, 94],              // dsh green-500
        surface: [35, 35, 36],          // dsh bg-layer-1 暗色值
        label: [173, 178, 184],         // dsh label-tertiary 暗色值
        border: [255, 255, 255, 0.12],  // dsh border-l2 暗色值
      }
      const t = {
        accent: mk(...fb.accent, 1),
        error: mk(...fb.error, 1),
        ok: mk(...fb.ok, 1),
        surface: mk(...fb.surface, 1),
        label: mk(...fb.label, 1),
        border: mk(...fb.border),
      }
      try {
        const probe = document.createElement('span')
        probe.style.display = 'none'
        document.body.appendChild(probe)
        const read = (name, fallback) => {
          try {
            probe.style.color = `var(${name}, transparent)`
            const m = getComputedStyle(probe).color.replace(/\s+/g, '')
              .match(/^rgba?\(([\d.]+),([\d.]+),([\d.]+)(?:,([\d.]+))?\)$/)
            if (m && (m[4] === undefined || parseFloat(m[4]) > 0)) {
              const a = m[4] === undefined ? 1 : parseFloat(m[4])
              return [+m[1], +m[2], +m[3], a]
            }
          } catch { /* 令牌缺失 → 回退 */ }
          return fallback
        }
        const solid = (p) => mk(p[0], p[1], p[2], 1)
        t.accent = solid(read('--dsw-alias-link', fb.accent))
        t.error = solid(read('--dsw-alias-state-error-primary', fb.error))
        t.ok = solid(read('--dsw-alias-state-success-primary', fb.ok))
        t.surface = solid(read('--dsw-alias-bg-layer-1', fb.surface))
        t.label = solid(read('--dsw-alias-label-tertiary', fb.label))
        t.border = mk(...read('--dsw-alias-border-l2', fb.border))
        probe.remove()
      } catch { /* DOM 不可用 → 全部用回退 */ }
      t.tint = (rgbStr, a) => {
        const m = String(rgbStr).match(/(\d+),(\d+),(\d+)/)
        return m ? mk(+m[1], +m[2], +m[3], a) : mk(fb.accent[0], fb.accent[1], fb.accent[2], a)
      }
      snxThemeCache = t
      return t
    }

    // ——— Konva 按需加载（本地 vendor，不走 CDN）———
    let konvaPromise = null
    function ensureKonva() {
      if (window.Konva) return Promise.resolve()
      if (konvaPromise) return konvaPromise
      konvaPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script')
        s.src = '/sensenova/vendor/konva.js'
        s.onload = () => window.Konva ? resolve() : reject(new Error('konva 加载异常'))
        s.onerror = () => { konvaPromise = null; reject(new Error('konva.js 加载失败')) }
        document.head.appendChild(s)
      })
      return konvaPromise
    }

    // ——— 自动保存（防抖 700ms → PUT 整文档）———
    let saveTimer = null
    function setSaveState(t) {
      const el = document.getElementById('snx-cv-save')
      if (el) el.textContent = t
    }
    function autosave() {
      if (!isOpen()) return
      setSaveState('● 保存中…')
      clearTimeout(saveTimer)
      saveTimer = setTimeout(() => {
        put(CANVAS_ROUTE, { doc: store.doc }).then((r) => {
          setSaveState(r.ok ? '✓ 已保存 ' + new Date().toTimeString().slice(0, 8) : '✗ 保存失败')
        }).catch(() => setSaveState('✗ 保存失败'))
      }, 700)
    }

    // ——— 画布文档 store（vanilla，单一事实源）———
    let activeEngine = null   // 打开中的引擎实例；store.emit 时驱动重绘
    function nid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7) }
    function emptyDoc() { return { v: 1, camera: { x: 0, y: 0, scale: 1 }, nodes: [] } }

    const store = {
      doc: emptyDoc(),
      sel: new Set(),          // 选中节点 id（运行态，不持久化）
      undoStack: [], redoStack: [],
      _listeners: new Set(),
      subscribe(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn) },
      emit() {
        if (activeEngine) activeEngine.renderAll()
        this._listeners.forEach((fn) => { try { fn() } catch { } })
      },
      snapshot() { return JSON.stringify(this.doc) },
      pushUndo() {
        this.undoStack.push(this.snapshot())
        if (this.undoStack.length > 60) this.undoStack.shift()
        this.redoStack.length = 0
      },
      undo() {
        const s = this.undoStack.pop(); if (!s) return
        this.redoStack.push(this.snapshot())
        this.doc = JSON.parse(s); this.sel.clear()
        this.emit(); autosave()
      },
      redo() {
        const s = this.redoStack.pop(); if (!s) return
        this.undoStack.push(this.snapshot())
        this.doc = JSON.parse(s); this.sel.clear()
        this.emit(); autosave()
      },
      node(id) { return this.doc.nodes.find((n) => n.id === id) },
      addNode(n, withUndo) { if (withUndo) this.pushUndo(); this.doc.nodes.push(n); this.emit(); autosave() },
      updateNode(id, patch) {
        const n = this.node(id); if (!n) return
        Object.assign(n, patch); this.emit(); autosave()
      },
      removeSelected() {
        if (!this.sel.size) return
        this.pushUndo()
        this.doc.nodes = this.doc.nodes.filter((n) => !this.sel.has(n.id))
        this.sel.clear(); this.emit(); autosave()
      },
      duplicateSelected() {
        if (!this.sel.size) return
        this.pushUndo()
        const clones = this.doc.nodes.filter((n) => this.sel.has(n.id)).map((n) => ({
          ...JSON.parse(JSON.stringify(n)), id: nid(), x: n.x + 24, y: n.y + 24,
        }))
        clones.forEach((c) => this.doc.nodes.push(c))
        this.sel = new Set(clones.map((c) => c.id))
        this.emit(); autosave()
      },
    }

    // ——— 多选对齐 / 等距分布 / 成组（tldraw 基线）———
    function selNodes() {
      const arr = []
      for (const id of store.sel) { const n = store.node(id); if (n) arr.push(n) }
      return arr
    }
    function alignSel(mode) {
      const ns = selNodes()
      if (ns.length < 2) return
      const x0 = Math.min(...ns.map((n) => n.x))
      const x1 = Math.max(...ns.map((n) => n.x + n.w))
      const y0 = Math.min(...ns.map((n) => n.y))
      const y1 = Math.max(...ns.map((n) => n.y + n.h))
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
      store.pushUndo()
      if (mode === 'dist-h' || mode === 'dist-v') {
        const horiz = mode === 'dist-h'
        const sorted = ns.slice().sort((a, b) => horiz ? a.x - b.x : a.y - b.y)
        const total = horiz ? x1 - x0 : y1 - y0
        const sum = sorted.reduce((acc, n) => acc + (horiz ? n.w : n.h), 0)
        const gap = sorted.length > 1 ? (total - sum) / (sorted.length - 1) : 0
        let cur = horiz ? x0 : y0
        for (const n of sorted) {
          const v = Math.round(cur)
          if (horiz) { if (n.x !== v) store.updateNode(n.id, { x: v }); cur += n.w + gap }
          else { if (n.y !== v) store.updateNode(n.id, { y: v }); cur += n.h + gap }
        }
      } else {
        for (const n of ns) {
          let x = n.x, y = n.y
          if (mode === 'left') x = x0
          else if (mode === 'hcenter') x = Math.round(cx - n.w / 2)
          else if (mode === 'right') x = x1 - n.w
          else if (mode === 'top') y = y0
          else if (mode === 'vcenter') y = Math.round(cy - n.h / 2)
          else if (mode === 'bottom') y = y1 - n.h
          if (x !== n.x || y !== n.y) store.updateNode(n.id, { x: Math.round(x), y: Math.round(y) })
        }
      }
      store.emit(); autosave()
    }
    function groupSel() {
      const ns = selNodes()
      if (ns.length < 2) return
      store.pushUndo()
      const gid = nid()
      for (const n of ns) store.updateNode(n.id, { groupId: gid })
      store.emit(); autosave()
    }
    function ungroupSel() {
      const ns = selNodes().filter((n) => n.groupId)
      if (!ns.length) return
      store.pushUndo()
      for (const n of ns) store.updateNode(n.id, { groupId: undefined })
      store.emit(); autosave()
    }

    // ——— 图片加载 / 尺寸工具 ———
    const imgCache = new Map()
    function getImg(src, cb) {
      let im = imgCache.get(src)
      if (im) {
        if (im.complete && im.naturalWidth) cb(im)
        else {
          const prev = im.onload
          im.onload = () => { if (prev) prev(); cb(im) }
        }
        return im
      }
      im = new window.Image()
      im.onload = () => cb(im)
      im.src = src
      imgCache.set(src, im)
      return im
    }
    function loadImg(src) {
      return new window.Promise((resolve, reject) => {
        const im = new window.Image()
        im.onload = () => resolve(im)
        im.onerror = () => reject(new Error('图片加载失败: ' + src.slice(0, 80)))
        im.src = src
      })
    }
    function nodeFit(im, maxSide) {
      const s = Math.min(maxSide / im.naturalWidth, maxSide / im.naturalHeight, 1)
      return { w: Math.max(40, Math.round(im.naturalWidth * s)), h: Math.max(40, Math.round(im.naturalHeight * s)) }
    }
    const SIZES = [[2048, 2048], [2752, 1536], [1536, 2752], [2560, 720], [2048, 1152]]
    function sizeForAspect(w, h) {
      const a = w / h
      let best = SIZES[0], bd = Infinity
      for (const s of SIZES) {
        const d = Math.abs(s[0] / s[1] - a)
        if (d < bd) { bd = d; best = s }
      }
      return best[0] + 'x' + best[1]
    }
    // 画质档位 → 实际请求尺寸：限定在已验证的 SIZES 线内（4096 对 SenseNova images/generations
    // 的支持无本地证据）——4K 取同比例的最大已验证预设，像素数不超过原尺寸时维持原值
    function applyQuality(size, quality) {
      if (quality !== '4k') return size
      const parts = String(size).split('x').map((x) => parseInt(x, 10) || 0)
      const w = parts[0], h = parts[1]
      if (!w || !h) return size
      const cand = sizeForAspect(w, h)
      const cp = cand.split('x').map((x) => parseInt(x, 10) || 0)
      return (cp[0] * cp[1] > w * h) ? cand : size
    }
    // dataURL 这类大引用不进文档（8MB 上限），重试时丢弃；文件/网络 URL 可以存
    function keepShortRef(ref) {
      return ref && !ref.startsWith('data:') ? ref : undefined
    }

    // ——— 生成流程（右面板 / 悬浮 bar / 操作条共用）———
    // 在途任务注册表：nodeId -> AbortController（队列「取消」真正中断请求）
    const inflightJobs = new Map()
    function isCancelled(nodeId) {
      const n = store.node(nodeId)
      return !!(n && n.status === 'error' && n.errMsg === '用户取消')
    }
    function cancelJob(nodeId) {
      const ac = inflightJobs.get(nodeId)
      if (ac) { try { ac.abort() } catch { } }
      const n = store.node(nodeId)
      if (n && (n.status === 'pending' || n.status === 'running')) {
        n.status = 'error'; n.errMsg = '用户取消'
        store.emit(); autosave()
      }
    }
    async function runOne(nodeId, o) {
      const { prompt, size = '2048x2048', model = '', reference, refs, upscale, negative, seed } = o
      store.updateNode(nodeId, { status: 'running', _startedAt: Date.now(), errMsg: '' })
      const ac = new AbortController()
      inflightJobs.set(nodeId, ac)
      try {
        // 构造要发送的 refs：dataURL/内联直接传，远程 URL 简化只传 refs 数组（服务端会解析）
        const refsPayload = (refs || []).map((r) => ({ src: r.src, role: r.role || 'reference', strength: r.strength ?? 0.7 }))
        const r = await post('/api/sensenova/generate', {
          prompt, size, model: model || undefined,
          negative: negative || undefined,
          seed: typeof seed === 'number' && seed >= 0 ? seed : undefined,
          reference: reference || undefined,
          refs: refsPayload.length ? refsPayload : undefined,
          persist: true,
        }, ac.signal)
        if (!r.ok || !r.image) throw new Error(r.error || '生成失败')
        const value = r.image.kind === 'base64' ? 'data:image/png;base64,' + r.image.value : r.image.value
        const im = await loadImg(value)
        // 落图前最后检查：已被用户取消就不复活成 done（竞态窗口：响应刚回来时点了取消）
        if (isCancelled(nodeId)) { inflightJobs.delete(nodeId); return }
        // upscale 倍数 → 节点初始尺寸放大（与原图一致便于构图）
        const baseSize = upscale ? 480 * (upscale === 4 ? 2 : 1.5) : 480
        const fit = nodeFit(im, baseSize)
        store.updateNode(nodeId, { status: 'done', src: value, w: fit.w, h: fit.h, error: '', errMsg: '', ts: Date.now() })
      } catch (e) {
        const aborted = !!(e && (e.name === 'AbortError' || /abort/i.test(String((e && e.message) || e))))
        if (aborted || isCancelled(nodeId)) {
          store.updateNode(nodeId, { status: 'error', error: '用户取消', errMsg: '用户取消' })
        } else {
          store.updateNode(nodeId, { status: 'error', error: String((e && e.message) || e).slice(0, 200) })
        }
      } finally {
        if (inflightJobs.get(nodeId) === ac) inflightJobs.delete(nodeId)
      }
    }
    // 无引擎兜底：按整窗视口 + 当前相机估算世界中心（生图 tab 落图时画布 DOM 未挂载、engineRef 为 null）
    function fallbackCenter() {
      const c = (store.doc && store.doc.camera) || { x: 0, y: 0, scale: 1 }
      const s = c.scale || 1
      return { x: (window.innerWidth / 2 - (c.x || 0)) / s, y: (window.innerHeight / 2 - (c.y || 0)) / s }
    }
    // anchorNode（done 图）存在 → 结果落其右侧挂 parentId（i2i 锚点）；否则视口中心
    async function genToCanvas(engine, opts) {
      const { prompt, size = '2048x2048', model = '', reference, anchorNode, n = 1, refs, upscale, negative, seed } = opts
      let bx, by, parentId
      if (anchorNode && anchorNode.status === 'done') {
        bx = anchorNode.x + anchorNode.w + 60; by = anchorNode.y; parentId = anchorNode.id
      } else {
        const c = engine && engine.centerWorld ? engine.centerWorld() : fallbackCenter()
        bx = c.x - 240; by = c.y - 240
      }
      store.pushUndo()
      const ids = []
      // 并发布局：n>4 时改用 4 列网格，避免画布太宽
      const cols = Math.min(n, 4)
      const cellW = 540, cellH = 540
      // 多参考图：优先用 refs，没传时回退到 reference
      const effRefs = (refs && refs.length) ? refs : (reference ? [{ src: reference, role: 'reference', strength: 0.7 }] : [])
      for (let i = 0; i < n; i++) {
        const id = nid()
        ids.push(id)
        const col = i % cols, row = Math.floor(i / cols)
        store.doc.nodes.push({
          id, type: 'image', status: 'pending', src: '', parentId,
          x: Math.round(bx + col * cellW), y: Math.round(by + row * cellH), w: 480, h: 480,
          prompt, params: {
            size, model,
            negative: negative || undefined,
            seed: typeof seed === 'number' && seed >= 0 ? seed : undefined,
            reference: keepShortRef(reference),
            refs: effRefs.map((r) => ({ src: keepShortRef(r.src), role: r.role || 'reference', strength: r.strength ?? 0.7 })),
            upscale,
          }, ts: Date.now(),
        })
      }
      store.emit(); autosave()
      // 并发跑（已 Promise.all），但单图失败不再拖垮其他
      await Promise.allSettled(ids.map((id) => runOne(id, { prompt, size, model, reference, refs: effRefs, upscale, negative, seed })))
    }

    // ——— 蒙版/扩图合成（标注板模式：原图 + 高亮标注 → i2i）———
    // brush: {opacity, hardness, feather} 可选（0~100 滑块值）；不传用默认 70/70/30，与蒙版预览双层描边算法一致
    async function composeMaskBoard(node, strokes, brush) {
      const im = await loadImg(node.src)
      // 按原图 natural 分辨率合成标注板（原先用画布显示尺寸 ~480px，2048px 原图清晰度被压到约 1/4）
      const sx = im.naturalWidth / node.w, sy = im.naturalHeight / node.h
      const op = brush ? Math.max(0, Math.min(1, brush.opacity / 100)) : 0.7
      const hard = brush ? Math.max(0, Math.min(1, brush.hardness / 100)) : 0.7
      const feath = brush ? Math.max(0, Math.min(1, brush.feather / 100)) : 0.3
      const cv = document.createElement('canvas')
      cv.width = im.naturalWidth; cv.height = im.naturalHeight
      const cx = cv.getContext('2d')
      cx.drawImage(im, 0, 0, cv.width, cv.height)
      cx.save()
      cx.beginPath(); cx.rect(0, 0, cv.width, cv.height); cx.clip()
      cx.strokeStyle = snxTheme().accent; cx.lineCap = 'round'; cx.lineJoin = 'round'
      for (const st of strokes) {
        // 双层 stroke 模拟硬度（外围渐变 + 内核实色），与蒙版预览层同参——发出的标注板与用户所见一致
        const trace = () => { cx.beginPath(); st.pts.forEach((p, i) => { const x = (p.x - node.x) * sx, y = (p.y - node.y) * sy; i ? cx.lineTo(x, y) : cx.moveTo(x, y) }); cx.stroke() }
        cx.save()
        cx.globalAlpha = op * 0.4
        cx.lineWidth = st.brush * (1 + feath * 0.6) * sx
        trace()
        cx.globalAlpha = op
        cx.lineWidth = st.brush * hard * sx
        trace()
        cx.restore()
      }
      cx.restore()
      return cv.toDataURL('image/png')
    }
    async function composeOutpaint(node, ratio) {
      const im = await loadImg(node.src)
      const iw = im.naturalWidth, ih = im.naturalHeight
      let cw = iw / 0.62, ch = cw / ratio
      if (ch < ih / 0.62) { ch = ih / 0.62; cw = ch * ratio }
      const s = Math.min(1, 2752 / cw, 2752 / ch)
      cw = Math.round(cw * s); ch = Math.round(ch * s)
      const cv = document.createElement('canvas')
      cv.width = cw; cv.height = ch
      const cx = cv.getContext('2d')
      cx.fillStyle = '#FFFFFF'; cx.fillRect(0, 0, cw, ch)
      cx.drawImage(im, Math.round((cw - iw * s) / 2), Math.round((ch - ih * s) / 2), Math.round(iw * s), Math.round(ih * s))
      return { dataUrl: cv.toDataURL('image/png'), size: sizeForAspect(cw, ch) }
    }
    const OUTPAINT_PROMPT = '扩展图片：将画面自然延伸填满整个画幅，白色区域全部补全，原图内容保持不变，扩展区域与原图风格、光照、透视自然衔接。'
    const MASK_PROMPT_SUFFIX = '；仅修改图中高亮标注的区域，未标注部分严格保持原样。'
    // 消除笔：进入蒙版模式时预填的指令（配合标注板发 i2i，applyMask 会再拼 MASK_PROMPT_SUFFIX）
    const ERASE_MASK_PROMPT = '清除图中高亮标注区域的内容（删除该区域内的物体/文字/水印），用周围背景自然延伸填补'
    // 一键去背景（抠图）：U1.5 i2i 无透明通道，落地为纯白背景抠图
    const REMOVE_BG_PROMPT = '抠图：完全去除背景，只保留画面主体；背景替换为纯白色，主体边缘干净利落，不要裁切或变形主体。'

    // ——— Konva 引擎 ———
    function createEngine(wrap) {
      const Konva = window.Konva
      const theme = snxTheme()   // Konva 需真实色值：getComputedStyle 读一次并缓存
      const stageDiv = document.createElement('div')
      stageDiv.className = 'snx-cv-stage'
      wrap.appendChild(stageDiv)

      const stage = new Konva.Stage({ container: stageDiv, width: wrap.clientWidth, height: wrap.clientHeight })
      const edgeLayer = new Konva.Layer({ listening: false })
      const mainLayer = new Konva.Layer()
      const fxLayer = new Konva.Layer({ listening: false })   // 框选矩形
      const trLayer = new Konva.Layer()
      stage.add(edgeLayer); stage.add(mainLayer); stage.add(fxLayer); stage.add(trLayer)

      const tr = new Konva.Transformer({
        rotateEnabled: true, anchorSize: 8, borderStroke: theme.accent,
        anchorStroke: theme.accent, anchorFill: theme.surface, keepRatio: false,
        boundBoxFunc: (oldB, newB) => (newB.width < 40 || newB.height < 40) ? oldB : newB,
      })
      trLayer.add(tr)

      const kmap = new Map()   // docNodeId -> Konva node
      let spaceDown = false
      let destroyed = false
      let marquee = null
      let panning = null
      const opts = {}
      const viewHooks = new Set()   // 视口变化回调（操作条定位 / 蒙版重绘）

      const cam = () => store.doc.camera
      function applyCamera() {
        const c = cam()
        for (const layer of [mainLayer, edgeLayer, trLayer]) {
          layer.position({ x: c.x, y: c.y }); layer.scale({ x: c.scale, y: c.scale })
        }
        stageDiv.style.backgroundPosition = `${c.x}px ${c.y}px`
        stageDiv.style.backgroundSize = `${24 * c.scale}px ${24 * c.scale}px`
        // 缩放百分比由 React 渲染（store.doc.camera.scale），viewHooks 触发 force 重渲染——不再写全局 id
        viewHooks.forEach((fn) => { try { fn() } catch { } })
      }

      function syncTransformer() {
        // Transformer 只挂 done 图（Group 的 width/height 不是 Konva 原生属性，变换会 NaN）；锁定节点不挂
        const sel = []
        store.sel.forEach((id) => {
          const k = kmap.get(id)
          const nn = store.node(id)
          if (k && k.getAttr('snxStatus') === 'done' && !(nn && nn.locked)) sel.push(k)
        })
        tr.nodes(sel)
        trLayer.batchDraw()
      }

      function bindNode(k, docNode) {
        k.setAttr('snxId', docNode.id)
        k.on('click tap', (e) => {
          e.cancelBubble = true
          if (e.evt.shiftKey) {
            if (store.sel.has(docNode.id)) store.sel.delete(docNode.id)
            else store.sel.add(docNode.id)
          } else if (!store.sel.has(docNode.id)) {
            store.sel = new Set([docNode.id])
          }
          syncTransformer(); store.emit()
        })
        // 成组：同 groupId 的成员随拖拽/变换平移（记录基线坐标，结束时套用位移）
        const groupBase = () => (docNode.groupId
          ? store.doc.nodes.filter((m) => m.groupId === docNode.groupId && m.id !== docNode.id)
            .map((m) => ({ id: m.id, x: m.x, y: m.y }))
          : [])
        const applyGroupDelta = (dx, dy) => {
          const base = k.getAttr('snxGroupBase') || []
          if (dx || dy) for (const m of base) store.updateNode(m.id, { x: Math.round(m.x + dx), y: Math.round(m.y + dy) })
          k.setAttr('snxGroupBase', null)
        }
        k.on('dragstart', () => { store.pushUndo(); k.setAttr('snxGroupBase', groupBase()) })
        k.on('dragend', () => {
          const nx = Math.round(k.x()), ny = Math.round(k.y())
          const dx = nx - docNode.x, dy = ny - docNode.y
          store.updateNode(docNode.id, { x: nx, y: ny })
          applyGroupDelta(dx, dy)
        })
        k.on('transformstart', () => { store.pushUndo(); k.setAttr('snxGroupBase', groupBase()) })
        k.on('transformend', () => {
          const sx = k.scaleX(), sy = k.scaleY()
          k.scaleX(1); k.scaleY(1)
          const w = Math.max(40, Math.round(k.width() * sx)), hh = Math.max(40, Math.round(k.height() * sy))
          k.width(w); k.height(hh)
          const nx = Math.round(k.x()), ny = Math.round(k.y())
          const dx = nx - docNode.x, dy = ny - docNode.y
          store.updateNode(docNode.id, { x: nx, y: ny, w, h: hh })
          applyGroupDelta(dx, dy)
        })
        k.on('dblclick dbltap', () => { if (docNode.src) window.open(docNode.src, '_blank') })
        k.on('contextmenu', (e) => {
          e.evt.preventDefault(); e.cancelBubble = true
          if (!store.sel.has(docNode.id)) { store.sel = new Set([docNode.id]); syncTransformer(); store.emit() }
          if (opts.onContext) opts.onContext(e.evt.clientX, e.evt.clientY, docNode.id)
        })
      }

      function renderNode(n) {
        if (n.status === 'pending') {
          const g = new Konva.Group({ x: n.x, y: n.y, draggable: !n.locked })
          g.add(new Konva.Rect({
            width: n.w, height: n.h, stroke: theme.accent, dash: [10, 7], strokeWidth: 1.5,
            cornerRadius: 8, fill: theme.tint(theme.accent, 0.06),
          }))
          g.add(new Konva.Text({
            width: n.w, y: n.h / 2 - 22, align: 'center', text: '⏳ 生成中…\n(20-60 秒)',
            fontSize: 14, fill: theme.accent, lineHeight: 1.8,
          }))
          g.add(new Konva.Text({
            width: n.w - 24, x: 12, y: n.h / 2 + 24, align: 'center',
            text: (n.prompt || '').slice(0, 60), fontSize: 11, fill: theme.label, lineHeight: 1.5,
          }))
          g.setAttr('snxStatus', 'pending')
          bindNode(g, n)
          mainLayer.add(g)
          kmap.set(n.id, g)
        } else if (n.status === 'error') {
          const g = new Konva.Group({ x: n.x, y: n.y, draggable: !n.locked })
          g.add(new Konva.Rect({
            width: n.w, height: n.h, stroke: theme.error, dash: [10, 7], strokeWidth: 1.5,
            cornerRadius: 8, fill: theme.tint(theme.error, 0.06),
          }))
          g.add(new Konva.Text({
            width: n.w, y: n.h / 2 - 30, align: 'center', text: '❌ 生成失败',
            fontSize: 15, fill: theme.error,
          }))
          g.add(new Konva.Text({
            width: n.w - 24, x: 12, y: n.h / 2 - 4, align: 'center',
            text: (n.error || '').slice(0, 120) + '\n\n右键 → 重试', fontSize: 11, fill: theme.label, lineHeight: 1.5,
          }))
          g.setAttr('snxStatus', 'error')
          bindNode(g, n)
          mainLayer.add(g)
          kmap.set(n.id, g)
        } else {
          const k = new Konva.Image({
            x: n.x, y: n.y, width: n.w, height: n.h, draggable: !n.locked,
            stroke: theme.border, strokeWidth: 1,
          })
          k.setAttr('snxStatus', 'done')
          // v8：图层属性
          if (n.blendMode) k.globalCompositeOperation(n.blendMode)
          if (n.opacity !== undefined) k.opacity(n.opacity)
          if (n.hidden) k.visible(false)
          bindNode(k, n)
          mainLayer.add(k)
          kmap.set(n.id, k)
          getImg(n.src, (im) => { if (!destroyed && k.getLayer()) { k.image(im); mainLayer.batchDraw() } })
        }
      }

      function drawEdges() {
        edgeLayer.destroyChildren()
        for (const n of store.doc.nodes) {
          if (!n.parentId) continue
          const p = store.node(n.parentId)
          if (!p) continue
          edgeLayer.add(new Konva.Line({
            points: [p.x + p.w, p.y + p.h / 2, n.x, n.y + n.h / 2],
            stroke: theme.tint(theme.accent, 0.3), strokeWidth: 1.5,
          }))
        }
        edgeLayer.batchDraw()
      }

      function renderAll() {
        mainLayer.destroyChildren()
        kmap.clear()
        for (const n of store.doc.nodes) renderNode(n)
        drawEdges()
        syncTransformer()
        mainLayer.batchDraw()
      }

      // ——— 视口交互 ———
      stage.on('mousedown', (e) => {
        const evt = e.evt
        if (evt.button === 1 || (spaceDown && evt.button === 0)) {
          panning = { px: evt.clientX, py: evt.clientY, cx: cam().x, cy: cam().y }
          stageDiv.style.cursor = 'grabbing'
          evt.preventDefault()
          return
        }
        if (evt.button !== undefined && evt.button !== 0) return
        if (e.target === stage) {
          const p = stage.getPointerPosition()
          const c = cam()
          marquee = {
            x0: (p.x - c.x) / c.scale, y0: (p.y - c.y) / c.scale,
            x1: (p.x - c.x) / c.scale, y1: (p.y - c.y) / c.scale,
          }
        }
      })
      stage.on('mousemove', (e) => {
        const evt = e.evt
        if (panning) {
          cam().x = panning.cx + (evt.clientX - panning.px)
          cam().y = panning.cy + (evt.clientY - panning.py)
          applyCamera()
          return
        }
        if (marquee) {
          const p = stage.getPointerPosition()
          const c = cam()
          marquee.x1 = (p.x - c.x) / c.scale; marquee.y1 = (p.y - c.y) / c.scale
          fxLayer.destroyChildren()
          fxLayer.position({ x: c.x, y: c.y }); fxLayer.scale({ x: c.scale, y: c.scale })
          fxLayer.add(new Konva.Rect({
            x: Math.min(marquee.x0, marquee.x1), y: Math.min(marquee.y0, marquee.y1),
            width: Math.abs(marquee.x1 - marquee.x0), height: Math.abs(marquee.y1 - marquee.y0),
            stroke: theme.accent, dash: [6, 4], strokeWidth: 1 / c.scale, fill: theme.tint(theme.accent, 0.06),
          }))
          fxLayer.batchDraw()
        }
      })
      stage.on('mouseup', () => {
        if (panning) {
          panning = null
          stageDiv.style.cursor = spaceDown ? 'grab' : 'default'
          autosave()
          return
        }
        if (marquee) {
          const m = marquee; marquee = null
          fxLayer.destroyChildren(); fxLayer.batchDraw()
          if (Math.abs(m.x1 - m.x0) > 6 || Math.abs(m.y1 - m.y0) > 6) {
            const rx = Math.min(m.x0, m.x1), ry = Math.min(m.y0, m.y1)
            const rw = Math.abs(m.x1 - m.x0), rh = Math.abs(m.y1 - m.y0)
            const hits = store.doc.nodes.filter((n) => {
              const nx = Math.max(n.x, rx), ny = Math.max(n.y, ry)
              return Math.min(n.x + n.w, rx + rw) - nx > 0 && Math.min(n.y + n.h, ry + rh) - ny > 0
            })
            store.sel = new Set(hits.map((n) => n.id))
          } else {
            store.sel = new Set()   // 点空处清除选择
          }
          syncTransformer(); store.emit()
        }
      })
      stage.on('wheel', (e) => {
        e.evt.preventDefault()
        const c = cam()
        const old = c.scale
        const ns = Math.min(8, Math.max(0.05, old * (e.evt.deltaY > 0 ? 0.9 : 1.1)))
        const p = stage.getPointerPosition()
        if (!p) return
        const wx = (p.x - c.x) / old, wy = (p.y - c.y) / old
        c.scale = ns; c.x = p.x - wx * ns; c.y = p.y - wy * ns
        applyCamera(); autosave()
      })
      stage.on('contextmenu', (e) => {
        if (e.target !== stage) return
        e.evt.preventDefault()
        if (opts.onContext) opts.onContext(e.evt.clientX, e.evt.clientY, null)
      })

      const onKeyDown = (e) => {
        if (e.code === 'Space' && !isTyping(e) && !spaceDown) {
          spaceDown = true
          stageDiv.style.cursor = 'grab'
          if (e.target === document.body) e.preventDefault()
        }
      }
      const onKeyUp = (e) => {
        if (e.code === 'Space') { spaceDown = false; stageDiv.style.cursor = 'default' }
      }
      window.addEventListener('keydown', onKeyDown)
      window.addEventListener('keyup', onKeyUp)

      const ro = new ResizeObserver(() => {
        if (destroyed) return
        stage.width(wrap.clientWidth); stage.height(wrap.clientHeight)
        stage.batchDraw()
      })
      ro.observe(wrap)

      return {
        opts,
        setOnContext(fn) { opts.onContext = fn },
        onViewChange(fn) { viewHooks.add(fn); return () => viewHooks.delete(fn) },
        renderAll,
        syncTransformer,
        // v8：轻量 refresh — 同步图层属性变化到 Konva（含 locked → draggable）
        refresh() {
          for (const n of store.doc.nodes) {
            const k = kmap.get(n.id)
            if (!k) continue
            if (k.globalCompositeOperation) k.globalCompositeOperation(n.blendMode || 'source-over')
            if (k.opacity) k.opacity(n.opacity !== undefined ? n.opacity : 1)
            if (k.visible) k.visible(!n.hidden)
            if (k.draggable) k.draggable(!n.locked)
          }
          syncTransformer()   // 锁定/解锁后变换框跟随
          mainLayer.batchDraw()
        },
        applyCamera,
        centerWorld() {
          const c = cam()
          return { x: (stage.width() / 2 - c.x) / c.scale, y: (stage.height() / 2 - c.y) / c.scale }
        },
        zoomBy(f) {
          const c = cam()
          const px = stage.width() / 2, py = stage.height() / 2
          const wx = (px - c.x) / c.scale, wy = (py - c.y) / c.scale
          const ns = Math.min(8, Math.max(0.05, c.scale * f))
          c.scale = ns; c.x = px - wx * ns; c.y = py - wy * ns
          applyCamera(); autosave()
        },
        fit() {
          const ns = store.doc.nodes
          if (!ns.length) { Object.assign(cam(), { x: 0, y: 0, scale: 1 }); applyCamera(); return }
          let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
          ns.forEach((n) => {
            x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y)
            x1 = Math.max(x1, n.x + n.w); y1 = Math.max(y1, n.y + n.h)
          })
          const pad = 80
          const sw = Math.max(100, stage.width() - pad * 2), sh = Math.max(100, stage.height() - pad * 2)
          const scale = Math.min(8, Math.max(0.05, Math.min(sw / (x1 - x0), sh / (y1 - y0))))
          const c = cam()
          c.scale = scale
          c.x = stage.width() / 2 - ((x0 + x1) / 2) * scale
          c.y = stage.height() / 2 - ((y0 + y1) / 2) * scale
          applyCamera(); autosave()
        },
        destroy() {
          destroyed = true
          window.removeEventListener('keydown', onKeyDown)
          window.removeEventListener('keyup', onKeyUp)
          ro.disconnect()
          stage.destroy()
          stageDiv.remove()
        },
      }
    }

    // ——— 右侧面板：生成 ———
    const genPrefs = { size: '2048x2048', model: '' }   // 面板/悬浮 bar 共享的生成偏好

    // ——— 提示词库（v8）：localStorage 星标 / 最近 / 模板 ———
    const PROMPT_LIB_KEY = 'snx-prompt-lib-v1'
    function loadPromptLib() {
      try {
        const raw = localStorage.getItem(PROMPT_LIB_KEY)
        if (!raw) return { stars: [], recents: [] }
        const o = JSON.parse(raw)
        return { stars: Array.isArray(o.stars) ? o.stars : [], recents: Array.isArray(o.recents) ? o.recents : [] }
      } catch { return { stars: [], recents: [] } }
    }
    function savePromptLib(lib) {
      try { localStorage.setItem(PROMPT_LIB_KEY, JSON.stringify(lib)) } catch { }
    }
    function addRecent(p) {
      if (!p || !p.trim()) return
      const lib = loadPromptLib()
      const np = p.trim()
      const before = lib.recents.length
      lib.recents = [np, ...lib.recents.filter((x) => x !== np)].slice(0, 10)
      if (lib.recents.length !== before) savePromptLib(lib)
    }
    function isStarred(p) {
      if (!p || !p.trim()) return false
      const lib = loadPromptLib()
      return lib.stars.some((s) => s.prompt === p.trim())
    }
    function toggleStar(p) {
      if (!p || !p.trim()) return false
      const lib = loadPromptLib()
      const np = p.trim()
      const has = lib.stars.some((s) => s.prompt === np)
      if (has) {
        lib.stars = lib.stars.filter((s) => s.prompt !== np)
      } else {
        lib.stars.unshift({ prompt: np, ts: Date.now() })
        if (lib.stars.length > 50) lib.stars = lib.stars.slice(0, 50)
      }
      savePromptLib(lib)
      return !has
    }

    // ——— 悬浮 prompt bar（画布顶部常驻；选中图时自动 i2i）———
    function GenBar({ engineRef, busy, setBusy, notify }) {
      const [text, setText] = useState('')
      // 选中 done 图 → i2i 编辑模式
      let selDone = null
      if (store.sel.size === 1) {
        const cand = store.node([...store.sel][0])
        if (cand && cand.status === 'done') selDone = cand
      }
      const go = async () => {
        const p = text.trim()
        if (!p || busy) return
        setBusy(true)
        try {
          const size = selDone ? sizeForAspect(selDone.w, selDone.h) : genPrefs.size
          await genToCanvas(engineRef.current, {
            prompt: p, size, model: genPrefs.model,
            reference: selDone ? selDone.src : undefined,
            anchorNode: selDone || null, n: 1,
          })
          setText('')
        } catch (e) { notify && notify('✗ 生成失败：' + String((e && e.message) || e)) }
        finally { setBusy(false) }
      }
      return h('div', { className: 'snx-pbar' },
        h('span', { className: 'tag' + (selDone ? '' : ' t2i') }, selDone ? '✏️ 编辑选中图' : '✦ 文生图'),
        h('input', {
          value: text,
          onChange: (e) => setText(e.target.value),
          onKeyDown: (e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) go() },
          placeholder: selDone ? '描述要怎么改这张图，Enter 生成到其右侧…' : '描述要生成的图，Enter 直接画…',
        }),
        h('button', { className: 'go', onClick: go, disabled: busy || !text.trim() }, busy ? '⏳' : '⚡'),
      )
    }

    // ——— 浮动操作条（选中单 done 图时跟随）———
    function ActionBar({ engineRef, busy, setBusy, notify, onInpaint, onErase, onOutpaint, viewTick }) {
      let node = null
      if (store.sel.size === 1) {
        const cand = store.node([...store.sel][0])
        if (cand && cand.status === 'done') node = cand
      }
      const wrapEl = engineRef.current ? engineRef.current.wrapEl : null
      if (!node || !wrapEl) return null
      const c = store.doc.camera
      const sx = node.x * c.scale + c.x
      const sy = node.y * c.scale + c.y
      const barW = 470
      const left = Math.min(Math.max(8, sx), Math.max(8, wrapEl.clientWidth - barW - 8))
      const top = sy > 70 ? sy - 48 : sy + node.h * c.scale + 12
      const act = (fn) => () => { if (!busy) fn(node) }
      return h('div', { className: 'snx-ab', style: { left, top } },
        h('button', {
          title: '以这张图为参考再生成一张变体', disabled: busy,
          onClick: act((n) => {
            setBusy(true)
            genToCanvas(engineRef.current, {
              prompt: n.prompt || '生成这张图的变化版本，保持风格与构图',
              reference: n.src, size: n.params && n.params.size ? n.params.size : sizeForAspect(n.w, n.h),
              model: (n.params && n.params.model) || '', anchorNode: n, n: 1,
            }).finally(() => setBusy(false))
          }),
        }, '🔀 变体'),
        h('button', {
          title: '清晰化/4K 增强（U1.5）', disabled: busy,
          onClick: act(async (n) => {
            setBusy(true)
            try {
              const r = await post('/api/sensenova/enhance', { image: n.src, model: (n.params && n.params.model) || undefined })
              if (!r.ok || !r.image) throw new Error(r.error || '增强失败')
              const value = r.image.kind === 'base64' ? 'data:image/png;base64,' + r.image.value : r.image.value
              const im = await loadImg(value)
              const fit = nodeFit(im, 480)
              store.addNode({
                id: nid(), type: 'image', status: 'done', src: value, parentId: n.id,
                x: n.x + n.w + 60, y: n.y, w: fit.w, h: fit.h,
                prompt: '[增强] ' + (n.prompt || ''), params: {}, ts: Date.now(),
              }, true)
            } catch (e) { notify(String((e && e.message) || e)) }
            finally { setBusy(false) }
          }),
        }, '✨ 增强'),
        h('button', { title: '画笔标注局部重绘', disabled: busy, onClick: act(onInpaint) }, '🖌 重绘'),
        h('button', { title: '消除笔：涂抹即删（预填清除指令，可改）', disabled: busy, onClick: act(onErase) }, '🧽 消除'),
        h('button', { title: '一键去背景：抠出主体，背景替换为纯白', disabled: busy,
          onClick: act((n) => {
            setBusy(true)
            genToCanvas(engineRef.current, {
              prompt: REMOVE_BG_PROMPT,
              reference: n.src,
              size: (n.params && n.params.size) ? n.params.size : sizeForAspect(n.w, n.h),
              model: (n.params && n.params.model) || '', anchorNode: n, n: 1,
            }).finally(() => setBusy(false))
          }),
        }, '🪄 抠图'),
        h('button', { title: '扩展画面（outpaint）', disabled: busy, onClick: act(onOutpaint) }, '⬛ 扩图'),
        h('button', {
          title: '把这张图和画布上下文发进当前会话，问 agent', disabled: busy,
          onClick: act((n) => {
            setBusy(true)
            askAgent(
              canvasContextText(n) + '\n请基于附图给出意见，或等我提出具体修改要求。',
              n.src,
            )
              .then(() => {
                try { if (bridge && bridge.sessions && bridge.sessions.open) bridge.sessions.open(currentSessionId()) } catch { }
                notify('✓ 已发送到会话，切回聊天看 agent 回复')
              })
              .catch((e) => notify('发送失败：' + String((e && e.message) || e)))
              .finally(() => setBusy(false))
          }),
        }, '🤖 问'),
        h('button', {
          title: '下载原图', disabled: busy,
          onClick: act((n) => {
            const a = document.createElement('a')
            a.href = n.src; a.download = (n.prompt || 'sensenova').slice(0, 30).replace(/[\\/:*?"<>|]/g, '') + '.png'
            a.target = '_blank'; a.click()
          }),
        }, '⬇'),
        h('button', { title: '删除', className: 'warn', disabled: busy, onClick: act(() => store.removeSelected()) }, '🗑'),
      )
    }

    // ——— 扩图比例弹层 ———
    function RatioPopup({ at, onPick, onClose }) {
      useEffect(() => {
        const close = () => onClose()
        window.addEventListener('click', close)
        return () => window.removeEventListener('click', close)
      })
      if (!at) return null
      const ratios = [['1:1', 1], ['3:4', 0.75], ['4:3', 4 / 3], ['16:9', 16 / 9], ['9:16', 9 / 16]]
      return h('div', { className: 'snx-ratio', style: { left: at.x, top: at.y } },
        ratios.map(([label, r]) => h('button', {
          key: label, title: '扩展到 ' + label,
          onClick: (e) => { e.stopPropagation(); onPick(r) },
        }, label)))
    }

    // ——— 右键菜单 ———
    function ContextMenu({ menu, engineRef, setMenu, busy, setBusy, onRestoreParams, onExportCanvas }) {
      useEffect(() => {
        if (!menu) return
        const close = () => setMenu(null)
        window.addEventListener('click', close)
        window.addEventListener('resize', close)
        return () => { window.removeEventListener('click', close); window.removeEventListener('resize', close) }
      }, [menu])
      if (!menu) return null
      const target = menu.nodeId ? store.node(menu.nodeId) : null
      const act = (fn) => () => { setMenu(null); fn() }
      const retry = async () => {
        const n = target; if (!n || busy) return
        setBusy(true); setMenu(null)
        store.updateNode(n.id, { status: 'pending', error: '' })
        const p = n.params || {}
        await runOne(n.id, {
          prompt: n.prompt,
          size: p.size || '2048x2048',
          model: p.model || '',
          reference: p.reference || undefined,
          negative: p.negative || undefined,
          seed: typeof p.seed === 'number' ? p.seed : undefined,
          refs: (Array.isArray(p.refs) ? p.refs : []).filter((r) => r && r.src),
        })
        setBusy(false)
      }
      return h('div', { className: 'snx-cv-menu', style: { left: menu.x, top: menu.y } },
        target && target.status === 'error' ? h('button', { onClick: retry, disabled: busy }, '🔄 重试生成') : null,
        target && target.status === 'done' ? h('button', { onClick: act(() => window.open(target.src, '_blank')) }, '🔍 新标签打开') : null,
        target && target.status === 'done' ? h('button', {
          onClick: act(() => {
            const a = document.createElement('a')
            a.href = target.src; a.download = (target.prompt || 'sensenova').slice(0, 30).replace(/[\\/:*?"<>|]/g, '') + '.png'
            a.target = '_blank'; a.click()
          }),
        }, '⬇ 下载') : null,
        target && target.status === 'done' ? h('button', {
          onClick: act(() => onRestoreParams && onRestoreParams(target)),
          title: '把这张图的提示词与全部生成参数回填到生图表单',
        }, '⤵ 回填参数') : null,
        target ? h('button', { onClick: act(() => { store.sel = new Set([target.id]); store.duplicateSelected() }) }, '⧉ 复制') : null,
        h('button', { onClick: act(() => store.removeSelected()), disabled: !target }, '🗑 删除'),
        // ── 多选：对齐 / 等距分布 / 成组（tldraw 基线）──
        store.sel.size >= 2 ? h('div', { className: 'sep' }) : null,
        store.sel.size >= 2 ? h('div', { style: { display: 'flex', gap: '3px', padding: '2px 8px' } },
          [['⇤', 'left', '左对齐'], ['⇔', 'hcenter', '水平居中'], ['⇥', 'right', '右对齐'],
            ['⇧', 'top', '顶对齐'], ['⇕', 'vcenter', '垂直居中'], ['⇩', 'bottom', '底对齐']].map(([ch, mode, tip]) =>
            h('button', { key: mode, style: { flex: '1' }, title: tip, onClick: act(() => alignSel(mode)) }, ch)),
        ) : null,
        store.sel.size >= 2 ? h('div', { style: { display: 'flex', gap: '3px', padding: '2px 8px' } },
          h('button', { style: { flex: '1' }, title: '水平等距分布', onClick: act(() => alignSel('dist-h')) }, '↔ 等距'),
          h('button', { style: { flex: '1' }, title: '垂直等距分布', onClick: act(() => alignSel('dist-v')) }, '↕ 等距'),
        ) : null,
        store.sel.size >= 2 ? h('button', { onClick: act(() => groupSel()), title: '成组：成员拖拽/变换时一起移动' }, '📦 成组') : null,
        selNodes().some((n) => n.groupId) ? h('button', { onClick: act(() => ungroupSel()), title: '解组：取消一起移动' }, '⛓ 解组') : null,
        h('div', { className: 'sep' }),
        h('button', { onClick: act(() => engineRef.current && engineRef.current.fit()) }, '⛶ 适应画面'),
        h('button', { onClick: act(() => onExportCanvas()), title: '全部可见图按布局合成一张 PNG' }, '🧾 导出画布 PNG'),
        !target ? h('button', {
          onClick: act(() => {
            store.pushUndo(); store.doc.nodes = []
            store.emit(); autosave()
          }),
        }, '🧹 清空画布') : null,
      )
    }

    // ——— Phase 2：聊天内生图工具卡片（tool.call.toolview keyed by sensenova_*_image）———
    // v9 对齐 dsh-agnes-multimodal 的做法：MessageImage 几何（240px 适配框、
    // 宽高比钳制 [0.25,4]、不放大）+ 点击全屏灯箱 + 下载。三个生图工具共用一张卡。
    function snxParseResult(block) {
      if (!block || block.kind !== 'tool-result' || block.isError) return null
      const names = ['sensenova_generate_image', 'sensenova_edit_image', 'sensenova_enhance_image']
      if (!block.call || names.indexOf(block.call.name) < 0) return null
      let info = null
      try { info = JSON.parse((block.content || []).map((c) => (c && c.text) || '').join('')) } catch { }
      const url = info && info.result_image
      if (!url) return null
      let prompt = (info && info.prompt) || ''
      if (!prompt && block.call.argsRaw) {
        try { prompt = JSON.parse(block.call.argsRaw).prompt || '' } catch { }
      }
      return { url: String(url), prompt: String(prompt || '') }
    }

    // shell MessageImage 的单图盒规则：240px 盒、比例钳制、永不放大
    function snxSingleFit(iw, ih) {
      const natural = iw / ih
      const ratio = Math.min(4, Math.max(0.25, natural))
      const box = ratio >= 1 ? { w: 240, h: 240 / ratio } : { w: 240 * ratio, h: 240 }
      const s = Math.min(1, iw / box.w, ih / box.h)
      return { width: Math.max(1, Math.round(box.w * s)), height: Math.max(1, Math.round(box.h * s)) }
    }

    function snxInsertToCanvas(url, prompt) {
      return fetch('/api/sensenova/canvas/nodes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ src: url, prompt: '💬 ' + String(prompt || '') }),
      })
    }

    // 会话内全屏灯箱：ESC / 点背景关闭，底部提示词 + 插入画布 + 下载
    function TvLightbox({ url, prompt, onClose }) {
      const [inserted, setInserted] = useState(false)
      useEffect(() => {
        const fn = (e) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', fn)
        return () => window.removeEventListener('keydown', fn)
      }, [onClose])
      return h('div', { className: 'snx-tvlb', onClick: onClose },
        h('button', { className: 'snx-tvlb-x', title: '关闭（Esc）', onClick: onClose }, '✕'),
        h('img', { src: url, alt: '', onClick: (e) => e.stopPropagation() }),
        h('div', { className: 'snx-tvlb-bar', onClick: (e) => e.stopPropagation() },
          prompt ? h('span', { className: 'snx-tvlb-prompt', title: prompt }, prompt) : null,
          h('button', {
            onClick: () => { snxInsertToCanvas(url, prompt).then(() => setInserted(true)) },
            title: '追加到生图工作台画布',
          }, inserted ? '✓ 已插入' : '📌 插入画布'),
          h('button', {
            onClick: () => { const a = document.createElement('a'); a.href = url; a.download = 'sensenova.png'; a.click() },
          }, '⬇ 下载'),
        ),
      )
    }

    function SnxToolCard(props) {
      const [lb, setLb] = useState(null)   // {url,prompt} | null
      const [inserted, setInserted] = useState(false)
      const block = props && props.block
      const settled = block && block.kind === 'tool-result'
      if (!settled) return h('div', { className: 'snx-tv' }, h('span', { className: 'snx-tv-run' }, '🎨 SenseNova 生成中…'))
      const info = snxParseResult(block)
      let prompt = (info && info.prompt) || ''
      if (!prompt && block.call && block.call.argsRaw) {
        try { prompt = JSON.parse(block.call.argsRaw).prompt || '' } catch { }
      }
      if (!info) {
        const text = (block.content || []).map((c) => (c && c.text) || '').join('')
        let errMsg = '生成失败或未返回图片'
        try { const j = JSON.parse(text); if (j && j.error) errMsg = '生成失败：' + String(j.error).slice(0, 120) } catch { }
        return h('div', { className: 'snx-tv' }, h('span', { className: 'snx-tv-err' }, errMsg))
      }
      const url = info.url
      const fit = h('button', {
        className: 'snx-tv-img', title: '点击查看原图',
        onClick: (e) => { e.stopPropagation(); setLb({ url, prompt }) },
      }, h('img', {
        src: url, alt: '', loading: 'lazy',
        onLoad: (e) => {
          const im = e.target
          const f = snxSingleFit(im.naturalWidth || 1024, im.naturalHeight || 1024)
          im.style.width = f.width + 'px'; im.style.height = f.height + 'px'
        },
      }))
      return h('div', { className: 'snx-tv' },
        fit,
        h('div', { className: 'snx-tv-row' },
          h('span', { className: 'snx-tv-prompt', title: prompt }, String(prompt || '').slice(0, 48)),
        ),
        h('div', { className: 'snx-tv-btns' },
          h('button', {
            onClick: (e) => { e.stopPropagation(); snxInsertToCanvas(url, prompt).then(() => setInserted(true)) },
            title: '追加到生图工作台画布',
          }, inserted ? '✓ 已插入画布' : '📌 插入画布'),
          h('button', {
            onClick: (e) => {
              e.stopPropagation()
              const a = document.createElement('a'); a.href = url; a.download = 'sensenova.png'; a.click()
            },
          }, '⬇ 下载'),
        ),
        lb ? h(TvLightbox, { url: lb.url, prompt: lb.prompt, onClose: () => setLb(null) }) : null,
      )
    }

    // ——— v9：回合尾投递（conversation.chat.turnTail）———
    // Turn 完成后过程区折叠，上面的工具卡就被收起来了。turnTail 是折叠线以下
    // 常开的座位（ui-deliverables/ui-plan 同款），把本回合三类生图工具的产出
    // 重新投到这里，图就直接落在回复下方——对齐 dsh-agnes-multimodal 的主体验。
    function SnxMediaTail(props) {
      const turn = props.turn
      if (!turn || typeof props.useTurnMedia !== 'function') return null
      const nodes = props.useTurnMedia(String(turn.turn))
      const hits = []
      if (Array.isArray(nodes)) {
        for (const n of nodes) {
          const root = n && n.root
          const info = snxParseResult(root)
          if (info) hits.push(info)
        }
      }
      if (!hits.length) return null
      return h('div', { className: 'snx-tail' },
        hits.map((it, i) => h(TailImage, { key: it.url + ':' + i, url: it.url, prompt: it.prompt })),
      )
    }

    // 回合尾里的单图：240px 适配框 + 点击复用会话灯箱
    function TailImage({ url, prompt }) {
      const [lb, setLb] = useState(false)
      return h(React.Fragment, null,
        h('button', {
          className: 'snx-tv-img', title: '点击查看原图',
          onClick: (e) => { e.stopPropagation(); setLb(true) },
        }, h('img', {
          src: url, alt: '', loading: 'lazy',
          onLoad: (e) => {
            const im = e.target
            const f = snxSingleFit(im.naturalWidth || 1024, im.naturalHeight || 1024)
            im.style.width = f.width + 'px'; im.style.height = f.height + 'px'
          },
        })),
        lb ? h(TvLightbox, { url, prompt, onClose: () => setLb(false) }) : null,
      )
    }

    // ——— 全屏工作台 ———
    class WBErrorBoundary extends React.Component {
      constructor(p){ super(p); this.state = { err: null } }
      static getDerivedStateFromError(err){ return { err } }
      componentDidCatch(err, info){ console.error('[sensenova-image] Workbench render failed:', err, info) }
      render(){
        if (this.state.err) {
          return h('div', { className: 'snx-cv' },
            h('div', { className: 'snx-cv-top' },
              h('div', { className: 'brand' }, '⚡ SENSENOVA ', h('b', null, '生图工作台')),
              h('span', { className: 'key no' }, '渲染异常'),
            ),
            h('div', { className: 'snx-cv-main' },
              h('div', { className: 'snx-cv-wrap', style: { display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' } },
                h('pre', { style: { whiteSpace:'pre-wrap', color:'var(--dsw-alias-state-error-primary,#f25a5a)', fontSize:'12px', maxWidth:'90%' } },
                  String((this.state.err && this.state.err.stack) || this.state.err))))
          )
        }
        return this.props.children
      }
    }

    function Workbench() {
      const [open, setOpenState] = useState(isOpen())
      const [ready, setReady] = useState(false)
      const [loadErr, setLoadErr] = useState('')
      const [busy, setBusy] = useState(false)
      const [keyOk, setKeyOk] = useState(null)
      const [mode, setMode] = useState('gen')  // gen | canvas | gallery | settings
      const [selId, setSelId] = useState(null)  // gallery selection
      const [lightbox, setLightbox] = useState(null)  // node | null
      const [fsCanvas, setFsCanvas] = useState(false)  // fullscreen canvas overlay
      const [tab, setTab] = useState('gen')
      const [menu, setMenu] = useState(null)
      const [maskId, setMaskId] = useState(null)
      const [brush, setBrush] = useState(40)  // 笔刷像素
      const [brushOpacity, setBrushOpacity] = useState(80)  // %
      const [brushHardness, setBrushHardness] = useState(70)  // %
      const [brushFeather, setBrushFeather] = useState(30)  // %
      const [brushCursor, setBrushCursor] = useState({ x: -100, y: -100, show: false })
      const [maskPrompt, setMaskPrompt] = useState('')
      const [ratioAt, setRatioAt] = useState(null)   // {x,y,nodeId}
      const [snack, setSnack] = useState('')
      const [cmpTouched, setCmpTouched] = useState(false)   // 用户动过对比选择后，不再自动补位（否则 ✕ 删掉又被补回）
      const [, force] = useState(0)
      // 画廊模式的状态提升：renderGalleryMode 是内联函数（非组件），其 hooks 会变成
      // Workbench 的条件性 hooks——首次切画廊时 hook 数变化触发 React #310 整面板崩。
      // 所以这四个 state 必须挂在顶层，renderGalleryMode 里只用别名引用。
      const [galQ, setGalQ] = useState('')
      const [galTag, setGalTag] = useState('')
      const [galSort, setGalSort] = useState('time')
      const [galFav, setGalFav] = useState(false)
      // 设置页：Key 内联配置（renderSettingsMode 是内联函数，状态必须挂在顶层）
      const [keyDraft, setKeyDraft] = useState('')
      const [keyVisible, setKeyVisible] = useState(false)
      const [keySaving, setKeySaving] = useState(false)
      const [keyTesting, setKeyTesting] = useState(false)
      const [pingResult, setPingResult] = useState(null)   // null | {ok, error?, models?}
      const wrapRef = useRef(null)
      const engineRef = useRef(null)
      const maskRef = useRef(null)   // {nodeId, strokes:[], canvas, redraw}
      const notify = (msg) => {
        setSnack(msg)
        setTimeout(() => setSnack(''), 5000)
      }
      // 设置页：Key 保存 / 真连接测试（走 /ping 实际访问 SenseNova /models）
      const saveKey = async () => {
        const k = keyDraft.trim()
        if (!k || keySaving) return
        setKeySaving(true)
        try {
          const r = await post(CONFIG_ROUTE, { apiKey: k })
          if (!r.ok) throw new Error(r.error || '保存失败')
          setKeyDraft('')
          const s = await get(STATUS_ROUTE).catch(() => ({}))
          setKeyOk(!!s.keyConfigured)
          notify('✓ Key 已保存并立即生效')
        } catch (e) { notify('保存失败：' + String((e && e.message) || e)) }
        finally { setKeySaving(false) }
      }
      const testKey = async () => {
        if (keyTesting) return
        setKeyTesting(true)
        try {
          const r = await get('/api/sensenova/ping')
          setPingResult(r)
          setKeyOk(!!r.ok)
          notify(r.ok ? '✓ 连接成功，当前可用模型 ' + (r.models || []).length + ' 个' : '✗ 连接失败：' + (r.error || '未知'))
        } catch (e) {
          setPingResult({ ok: false, error: String((e && e.message) || e) })
          notify('✗ 测试失败')
        } finally { setKeyTesting(false) }
      }

      useEffect(() => {
        // v4.2+ tab 架构：tab body 挂载即视为打开。v4.1 侧栏开关已废弃（setOpen 无处写 '0'），
        // 这里主动写 '1'，治愈旧浏览器残留 'dsh-sensenova-open'='0' 的僵尸门（否则引擎/文档 effect 全被挡）
        setOpen(true)
        setOpenState(isOpen())   // 立即同步 state，不等 1.2s 轮询（首开即载文档/建引擎）
        const fn = () => setOpenState(isOpen())
        window.addEventListener(EVT, fn)
        const poll = setInterval(fn, 1200)
        get(STATUS_ROUTE).then((s) => setKeyOk(!!s.keyConfigured)).catch(() => { })
        return () => { window.removeEventListener(EVT, fn); clearInterval(poll) }
      }, [])

      useEffect(() => {
        ensureKonva().then(() => setReady(true)).catch((e) => setLoadErr(String((e && e.message) || e)))
      }, [])

      // 全屏画布 Esc 退出
      useEffect(() => {
        if (!fsCanvas) return
        const onKey = (e) => { if (e.key === 'Escape') setFsCanvas(false) }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [fsCanvas])

      // v8：? 键打开快捷键速查 overlay
      const [showHelp, setShowHelp] = useState(false)
      useEffect(() => {
        const onKey = (e) => {
          if (isTyping(e)) return   // 输入框里的 ? 是字符，不抢（与画布快捷键同规矩）
          if (e.key === '?' && !lightbox) { setShowHelp((v) => !v); e.preventDefault() }
          else if (e.key === 'Escape' && showHelp) { setShowHelp(false); e.preventDefault() }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [showHelp, lightbox])

      // 打开时：载入画布文档 + SSE 订阅（与引擎解耦——文档/画廊/队列不依赖画布 DOM 挂载）
      useEffect(() => {
        if (!open) return
        let dead = false
        const applyDoc = (doc) => {
          store.doc = doc && Array.isArray(doc.nodes) ? doc : emptyDoc()
          if (!store.doc.camera) store.doc.camera = { x: 0, y: 0, scale: 1 }
          if (!Array.isArray(store.doc.nodes)) store.doc.nodes = []
          store.sel = new Set()
          if (activeEngine) { activeEngine.renderAll(); activeEngine.applyCamera() }
          force((n) => n + 1)
        }
        get(CANVAS_ROUTE).then((r) => { if (!dead) applyDoc(r.doc) }).catch(() => { })
        // Phase 2：SSE 订阅（agent → 画布实时通道）
        const es = new window.EventSource('/api/sensenova/events')
        es.onmessage = (m) => {
          let evt = null
          try { evt = JSON.parse(m.data) } catch { return }
          if (!evt || !evt.type) return
          if (evt.type === 'canvas:update') {
            // agent 生图/摆图 / 聊天卡片插入 → 服务端已写文档，这里重载
            get(CANVAS_ROUTE).then((r) => {
              if (dead || !r.doc || !Array.isArray(r.doc.nodes)) return
              store.doc.nodes = r.doc.nodes
              store.sel = new Set()
              if (activeEngine) activeEngine.renderAll()
              force((n) => n + 1)
            }).catch(() => { })
          }
        }
        return () => { dead = true; try { es.close() } catch { } }
      }, [open])

      // 画布容器挂载时（画布 tab 或全屏画布）：建引擎 + 快捷键 + 拖放/粘贴；卸载时销毁
      // 注意 mode 必须在依赖里：初始 mode='gen' 时容器不在 DOM，点「画布」tab 靠 mode 翻转触发本 effect
      useEffect(() => {
        if (!open || !ready || !wrapRef.current) return
        const wrap = wrapRef.current
        const engine = createEngine(wrap)
        engine.wrapEl = wrap
        engineRef.current = engine
        activeEngine = engine
        engine.renderAll()
        engine.applyCamera()
        // 相机还是出厂默认且有内容 → 首次打开自动适应视野（用户调过相机则尊重其保存值）
        try {
          const c0 = store.doc.camera
          if (store.doc.nodes.length && c0.x === 0 && c0.y === 0 && c0.scale === 1) engine.fit()
        } catch { }
        force((n) => n + 1)
        engine.setOnContext((x, y, nodeId) => {
          setMenu({ x: Math.min(x, window.innerWidth - 180), y: Math.min(y, window.innerHeight - 230), nodeId })
        })
        // 视口变化 → 重渲染（浮动操作条跟随节点/相机）
        const unView = engine.onViewChange(() => force((n) => n + 1))

        // 拖入图片即成节点（落点=投放位置）
        const onDragOver = (e) => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy' }
        const onDrop = (e) => {
          e.preventDefault()
          const files = [...((e.dataTransfer && e.dataTransfer.files) || [])].filter((f) => f.type.startsWith('image/'))
          if (!files.length) return
          const rect = wrap.getBoundingClientRect()
          const c = store.doc.camera
          const wx = (e.clientX - rect.left - c.x) / c.scale
          const wy = (e.clientY - rect.top - c.y) / c.scale
          files.forEach((f, idx) => {
            const r = new window.FileReader()
            r.onload = () => {
              loadImg(String(r.result)).then((im) => {
                const fit = nodeFit(im, 480)
                store.addNode({
                  id: nid(), type: 'image', status: 'done', src: String(r.result),
                  x: Math.round(wx - fit.w / 2 + idx * 24), y: Math.round(wy - fit.h / 2 + idx * 24),
                  w: fit.w, h: fit.h, prompt: '', params: {}, ts: Date.now(),
                }, true)
              }).catch(() => { })
            }
            r.readAsDataURL(f)
          })
        }
        // 粘贴图片 → 视口中心
        const onPaste = (e) => {
          if (!isOpen() || isTyping(e)) return
          const items = [...((e.clipboardData && e.clipboardData.items) || [])]
          const it = items.find((i) => i.type.startsWith('image/'))
          if (!it) return
          const f = it.getAsFile()
          if (!f) return
          e.preventDefault()
          const r = new window.FileReader()
          r.onload = () => {
            loadImg(String(r.result)).then((im) => {
              const fit = nodeFit(im, 480)
              const cc = engineRef.current ? engineRef.current.centerWorld() : { x: 0, y: 0 }
              store.addNode({
                id: nid(), type: 'image', status: 'done', src: String(r.result),
                x: Math.round(cc.x - fit.w / 2), y: Math.round(cc.y - fit.h / 2),
                w: fit.w, h: fit.h, prompt: '', params: {}, ts: Date.now(),
              }, true)
            }).catch(() => { })
          }
          r.readAsDataURL(f)
        }
        wrap.addEventListener('dragover', onDragOver)
        wrap.addEventListener('drop', onDrop)
        window.addEventListener('paste', onPaste)

        const onKey = (e) => {
          if (!isOpen() || isTyping(e)) return
          const ctrl = e.ctrlKey || e.metaKey
          if (e.key === 'Escape' && maskRef.current) { cancelMask(); return }
          if (maskRef.current) return   // 蒙版模式下其余快捷键让路
          if (ctrl && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); e.shiftKey ? store.redo() : store.undo() }
          else if (ctrl && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); store.redo() }
          else if (ctrl && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); store.duplicateSelected() }
          else if (e.key === 'Delete' || e.key === 'Backspace') { store.removeSelected() }
          else if (e.key === 'Escape') { store.sel.clear(); engine.syncTransformer(); store.emit() }
          else if ((e.key === 'f' || e.key === 'F') && !ctrl) { engine.fit() }
        }
        window.addEventListener('keydown', onKey)
        const unsub = store.subscribe(() => force((n) => n + 1))
        return () => {
          window.removeEventListener('keydown', onKey)
          wrap.removeEventListener('dragover', onDragOver)
          wrap.removeEventListener('drop', onDrop)
          window.removeEventListener('paste', onPaste)
          unView()
          unsub()
          engine.destroy()
          if (activeEngine === engine) activeEngine = null
          engineRef.current = null
        }
      }, [open, ready, fsCanvas, mode])

      // ——— 蒙版局部重绘 ———
      function cancelMask() {
        maskRef.current = null
        setMaskId(null)
        setMaskPrompt('')
      }
      function enterMask(node, erase) {
        maskRef.current = { nodeId: node.id, strokes: [], canvas: null, redraw: null, erase: !!erase }
        setMaskPrompt(erase ? ERASE_MASK_PROMPT : '')   // 消除笔：预填清除指令（用户可改），applyMask 会拼 MASK_PROMPT_SUFFIX
        setMaskId(node.id)
      }
      // 蒙模式覆盖层：画笔采集 + 视口同步重绘
      useEffect(() => {
        if (!maskId || !wrapRef.current || !engineRef.current) return
        const wrap = wrapRef.current
        const node = store.node(maskId)
        if (!node) { cancelMask(); return }
        const state = maskRef.current
        const cv = document.createElement('canvas')
        cv.className = 'snx-cv-mask'
        cv.width = wrap.clientWidth; cv.height = wrap.clientHeight
        wrap.appendChild(cv)
        state.canvas = cv
        const ctx = cv.getContext('2d')
        let drawing = null
        const cam = () => store.doc.camera
        const worldPt = (e) => {
          const rect = cv.getBoundingClientRect()
          const c = cam()
          return { x: (e.clientX - rect.left - c.x) / c.scale, y: (e.clientY - rect.top - c.y) / c.scale }
        }
        const redraw = () => {
          if (cv.width !== wrap.clientWidth || cv.height !== wrap.clientHeight) {
            cv.width = wrap.clientWidth; cv.height = wrap.clientHeight
          }
          const c = cam()
          ctx.setTransform(1, 0, 0, 1, 0, 0)
          ctx.clearRect(0, 0, cv.width, cv.height)
          const n = store.node(state.nodeId)
          if (!n) return
          ctx.setTransform(c.scale, 0, 0, c.scale, c.x, c.y)
          ctx.save()
          ctx.beginPath(); ctx.rect(n.x, n.y, n.w, n.h); ctx.clip()
          // v8 画笔属性：opacity / hardness / feather
          const op = brushOpacity / 100
          const hard = brushHardness / 100
          const feath = brushFeather / 100
          for (const st of state.strokes) {
            ctx.save()
            // 用双层 stroke 模拟硬度（内核实色 + 外围渐变）
            ctx.globalAlpha = op * 0.4
            ctx.strokeStyle = snxTheme().accent
            ctx.lineCap = ctx.lineJoin = 'round'
            ctx.lineWidth = st.brush * (1 + feath * 0.6)
            ctx.beginPath()
            st.pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))
            ctx.stroke()
            // 硬核层
            ctx.globalAlpha = op
            ctx.lineWidth = st.brush * hard
            ctx.beginPath()
            st.pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))
            ctx.stroke()
            ctx.restore()
          }
          ctx.restore()
        }
        state.redraw = redraw
        const onDown = (e) => {
          if (e.button !== 0) return
          const n = store.node(state.nodeId)
          if (!n) return
          const p = worldPt(e)
          if (p.x < n.x - 12 || p.y < n.y - 12 || p.x > n.x + n.w + 12 || p.y > n.y + n.h + 12) return
          const c = cam()
          drawing = { brush: Math.max(4, brush / c.scale), pts: [p] }
          state.strokes.push(drawing)
          redraw()
        }
        const onMove = (e) => {
          // 画笔预览圈（屏幕坐标，跟鼠标走）
          setBrushCursor({ x: e.clientX - wrap.getBoundingClientRect().left, y: e.clientY - wrap.getBoundingClientRect().top, show: true })
          if (!drawing) return
          const p = worldPt(e)
          const last = drawing.pts[drawing.pts.length - 1]
          const c = cam()
          if (Math.abs(p.x - last.x) * c.scale + Math.abs(p.y - last.y) * c.scale < 3) return
          drawing.pts.push(p)
          redraw()
        }
        const onUp = () => { drawing = null }
        const onLeave = () => { drawing = null; setBrushCursor({ x: -100, y: -100, show: false }) }
        cv.addEventListener('pointerdown', onDown)
        cv.addEventListener('pointermove', onMove)
        cv.addEventListener('pointerup', onUp)
        cv.addEventListener('pointerleave', onLeave)
        const unView = engineRef.current.onViewChange(redraw)
        // 覆盖层重建（调画笔参数/全屏切换）后立即重绘已有笔迹，避免标注「消失」错觉
        state.redraw()
        return () => {
          cv.removeEventListener('pointerdown', onDown)
          cv.removeEventListener('pointermove', onMove)
          cv.removeEventListener('pointerup', onUp)
          cv.removeEventListener('pointerleave', onLeave)
          unView()
          cv.remove()
        }
      }, [maskId, brush, brushOpacity, brushHardness, brushFeather, fsCanvas])

      const applyMask = async () => {
        const st = maskRef.current
        const node = st ? store.node(st.nodeId) : null
        if (!node || busy || !st.strokes.length) return
        setBusy(true)
        try {
          const board = await composeMaskBoard(node, st.strokes, { opacity: brushOpacity, hardness: brushHardness, feather: brushFeather })
          const text = maskPrompt.trim() || '重绘高亮区域'
          const id = nid()
          store.pushUndo()
          store.doc.nodes.push({
            id, type: 'image', status: 'pending', src: '', parentId: node.id,
            x: node.x + node.w + 60, y: node.y, w: 480, h: 480,
            prompt: text, params: { size: sizeForAspect(node.w, node.h), model: genPrefs.model }, ts: Date.now(),
          })
          store.emit(); autosave()
          cancelMask()
          await runOne(id, { prompt: text + MASK_PROMPT_SUFFIX, size: sizeForAspect(node.w, node.h), model: genPrefs.model, reference: board })
        } catch (e) {
          notify('重绘失败：' + String((e && e.message) || e))
        } finally { setBusy(false) }
      }

      // ——— 扩图 ———
      const applyOutpaint = async (ratio) => {
        const at = ratioAt
        setRatioAt(null)
        const node = at ? store.node(at.nodeId) : null
        if (!node || busy) return
        setBusy(true)
        try {
          const { dataUrl, size } = await composeOutpaint(node, ratio)
          const id = nid()
          store.pushUndo()
          store.doc.nodes.push({
            id, type: 'image', status: 'pending', src: '', parentId: node.id,
            x: node.x + node.w + 60, y: node.y, w: 480, h: 480,
            prompt: '[扩图]', params: { size, model: genPrefs.model }, ts: Date.now(),
          })
          store.emit(); autosave()
          await runOne(id, { prompt: OUTPAINT_PROMPT, size, model: genPrefs.model, reference: dataUrl })
        } catch (e) {
          notify('扩图失败：' + String((e && e.message) || e))
        } finally { setBusy(false) }
      }

      // ——— 参数回填：从任意画布图/历史图一键恢复 prompt+全部已记录生成参数 ———
      // （灯箱「⤵ 回填参数」与右键菜单共用；写 genPrefs + 广播 snx:restoreParams 给 GenForm）
      const onRestoreParams = (n) => {
        if (!n) return
        const p = n.params || {}
        const detail = {
          prompt: String(n.prompt || '').replace(/^💬\s*/, ''),
          negPrompt: p.negative || '',
          size: p.size || genPrefs.size || '2048x2048',
          model: p.model || '',
          seed: typeof p.seed === 'number' ? p.seed : -1,
          refs: (Array.isArray(p.refs) ? p.refs : [])
            .filter((r) => r && r.src)
            .map((r) => ({ src: r.src, role: r.role || 'reference', strength: r.strength ?? 0.7 })),
        }
        genPrefs.prompt = detail.prompt; genPrefs.negPrompt = detail.negPrompt
        genPrefs.size = detail.size; genPrefs.model = detail.model
        genPrefs.seed = detail.seed; genPrefs.refs = detail.refs
        window.dispatchEvent(new CustomEvent('snx:restoreParams', { detail }))
        setLightbox(null)
        setFsCanvas(false)   // 从全屏画布右键发起时退出全屏，否则盖住生图 tab
        setMode('gen')
        notify('✓ 已回填参数：提示词/负面/尺寸/模型/种子' + (detail.refs.length ? '/参考图×' + detail.refs.length : ''))
        force((x) => x + 1)
      }

      // ——— 整画布导出 PNG（全部可见 done 图按布局合成）———
      const onExportCanvas = async () => {
        setBusy(true)
        try {
          const r = await exportCanvasPng()
          const a = document.createElement('a')
          a.href = r.url
          a.download = 'snx-canvas-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.png'
          a.target = '_blank'; a.rel = 'noreferrer'; a.click()
          notify('✓ 已导出画布：' + r.count + ' 张图合成 ' + r.w + '×' + r.h + ' PNG')
        } catch (e) {
          notify('✗ 导出失败：' + String((e && e.message) || e))
        } finally { setBusy(false) }
      }

      // 右栏 tab 模式：直接渲染主界面，不再等 open=1
      // if (!open) return null

      // 操作条锚点节点（渲染期间从 store 现算，视口 tick 驱动跟随）
      let selDone = null
      if (store.sel.size === 1 && !maskId) {
        const cand = store.node([...store.sel][0])
        if (cand && cand.status === 'done') selDone = cand
      }
      // 队列长度（pending + running）
      let queueLen = 0
      for (const nn of store.doc.nodes) {
        if (nn.status === 'pending' || nn.status === 'running') queueLen++
      }
      // 错件数（用于设置 tab 提示）
      let errCount = 0
      for (const nn of store.doc.nodes) {
        if (nn.status === 'error') errCount++
      }

      return h('div', { className: 'snx-pro' + (mode === 'canvas' ? ' canvas-mode' : '') + (maskId ? ' mask-mode' : '') },
        // ─── 顶部品牌栏 ───
        h('header', { className: 'snx-pro-top' },
          h('div', { className: 'snx-pro-brand' },
            h('span', { className: 'snx-pro-ico' }, '✦'),
            h('span', { className: 'snx-pro-name' }, 'SenseNova'),
            h('span', { className: 'snx-pro-tag' }, '生图工作台'),
          ),
          h('div', { className: 'snx-pro-spacer' }),
          h('span', {
            className: 'snx-pro-key ' + (keyOk === false ? 'no' : (keyOk ? 'ok' : 'unk')),
            title: keyOk === null ? '检查中…' : keyOk ? 'SenseNova API Key 已配置' : '未配置 Key → 设置',
          }, keyOk === null ? '⌛' : keyOk ? 'Key ✓' : 'Key ✗'),
        ),
        // ─── 模式 tab ───
        h('nav', { className: 'snx-pro-tabs' },
          h('button', { className: mode === 'gen' ? 'on' : '', onClick: () => setMode('gen') },
            h('span', { className: 'ti' }, '✎'), '生图'),
          h('button', {
            className: mode === 'queue' ? 'on' : '',
            onClick: () => setMode('queue'),
            title: '生成队列',
          },
            h('span', { className: 'ti' }, '⚡'), '队列',
            queueLen > 0 ? h('span', { className: 'cnt pulse' }, queueLen) : null),
          h('button', { className: mode === 'canvas' ? 'on' : '', onClick: () => setMode('canvas') },
            h('span', { className: 'ti' }, '🎨'), '画布'),
          h('button', { className: mode === 'gallery' ? 'on' : '', onClick: () => setMode('gallery') },
            h('span', { className: 'ti' }, '🖼'), '画廊',
            store.doc.nodes.length ? h('span', { className: 'cnt' }, store.doc.nodes.length) : null,
          ),
          h('button', { className: mode === 'compare' ? 'on' : '', onClick: () => { setCmpTouched(false); setMode('compare') } },
            h('span', { className: 'ti' }, '⇄'), '对比'),
          h('button', { className: mode === 'settings' ? 'on' : '', onClick: () => setMode('settings') },
            h('span', { className: 'ti' }, '⚙'), ''),
        ),
        // ─── 主内容 ───
        h('main', { className: 'snx-pro-main' },
          mode === 'gen' ? renderGenMode() :
          mode === 'queue' ? renderQueueMode() :
          mode === 'canvas' ? renderCanvasMode() :
          mode === 'compare' ? renderCompareMode() :
          mode === 'settings' ? renderSettingsMode() :
          renderGalleryMode(),
        ),
        // ─── Lightbox 全屏预览 ───
        lightbox ? h(Lightbox, {
          node: lightbox,
          notify,
          store,
          onClose: () => setLightbox(null),
          onUseAsAnchor: () => {
            store.sel = new Set([lightbox.id])
            setSelId(lightbox.id)
            setLightbox(null)
            setMode('gen')   // 直接带到生图 tab，选中图即 i2i 锚点（GenForm 顶部出现锚点条）
            notify('✓ 已设为参考图，在提示词框输入修改指令即可')
            force((n) => n + 1)
          },
          onEdit: () => {
            store.sel = new Set([lightbox.id])
            setLightbox(null)
            setMode('canvas')
            force((n) => n + 1)
          },
          onDownload: () => {
            const a = document.createElement('a')
            a.href = lightbox.src; a.download = `sensenova-${lightbox.id}.png`
            a.target = '_blank'; a.rel = 'noreferrer'; a.click()
          },
          onCopyParams: () => {
            const n = lightbox
            const text = JSON.stringify({
              prompt: n.prompt, model: n.params && n.params.model,
              size: n.params && n.params.size, seed: n.params && n.params.seed,
              ts: n.ts,
            }, null, 2)
            navigator.clipboard && navigator.clipboard.writeText(text)
            notify && notify('✓ 参数已复制')
          },
          onRestoreParams,
          onDelete: async () => {
            if (!confirm('删除这张图？')) return
            store.doc.nodes = store.doc.nodes.filter((nn) => nn.id !== lightbox.id)
            store.sel = new Set()
            store.emit()   // 引擎在挂时才同步重绘
            setLightbox(null)
            force((n) => n + 1)
            try { await put(CANVAS_ROUTE, { doc: store.doc }) } catch {}
          },
          // v8：放大按钮
          onUpscale: async (n, factor) => {
            setLightbox(null)
            // 请求尺寸走已验证的 SIZES 线（≤2752，按锚点比例选档）——4096 对 SenseNova
            // images/generations 的支持无本地证据，失败时提示里带上请求尺寸便于定位
            const reqSize = sizeForAspect(n.w, n.h)
            try {
              // 用 i2i 但要求更高 size（anchorNode 是 done 图，genToCanvas 无需引擎也能落位）
              const ratio = factor === 4 ? 2 : 1.5
              await genToCanvas(engineRef.current, {
                prompt: n.prompt || '保持原构图，提高分辨率与细节',
                size: reqSize,
                reference: n.src,
                anchorNode: n,
                n: 1,
                upscale: factor,
              })
              notify && notify('✓ 已加入队列（' + factor + 'x 放大，' + reqSize + '）')
            } catch (e) { notify && notify('✗ 放大失败（请求尺寸 ' + reqSize + '）：' + String(e.message || e)) }
          },
          // v8：调整（保存为新节点）
          onAdjust: async (n, filters) => {
            const adjSrc = await applyFiltersAsync(n.src, filters.brightness, filters.contrast, filters.saturation)
            const id = nid()
            store.pushUndo()
            store.doc.nodes.push({
              id, type: 'image', status: 'done', src: adjSrc,
              parentId: n.id,
              x: n.x + n.w + 60, y: n.y,
              w: n.w, h: n.h,
              prompt: (n.prompt || '') + ' · 调整',
              params: Object.assign({}, n.params || {}, { adjusted: filters }),
              ts: Date.now(),
            })
            store.emit()   // 引擎在挂时才同步重绘（与 applyMask/applyOutpaint 同规矩）
            force((x) => x + 1)
            autosave()
            notify && notify('✓ 已生成调整版')
          },
          // v8：收藏 toggle
          onToggleFavorite: (n) => {
            n.favorite = !n.favorite
            force((x) => x + 1)
            autosave()
            notify && notify(n.favorite ? '★ 已收藏' : '已取消收藏')
          },
          // v8：版本树点击跳转
          onOpenVersion: (n) => {
            setLightbox(n)
            force((x) => x + 1)
          },
        }) : null,
        // ─── 全屏画布 overlay ───
        fsCanvas ? renderFsCanvas() : null,
        showHelp ? h(HelpOverlay, { onClose: () => setShowHelp(false) }) : null,
        // ─── 全局轻提示：非画布模式（生图/画廊/队列…）或全屏画布下，notify 也得看得见 ───
        snack && (mode !== 'canvas' || fsCanvas) ? h('div', { className: 'snx-snack' }, snack) : null,
        // ─── 状态栏（画布模式才显示）───
        mode === 'canvas' ? h('footer', { className: 'snx-pro-status' },
          h('span', null, `${store.doc.nodes.length} 张图 · 选中 ${store.sel.size}`),
          h('span', null, maskId ? '蒙版模式：在图上涂抹' : '滚轮缩放 / 空格平移'),
          h('div', { style: { flex: 1 } }),
          snack && !fsCanvas ? h('span', { style: { color: 'var(--dsw-alias-toast-label,#fff)' } }, snack) : null,
          h('span', { id: 'snx-cv-save' }, ''),
        ) : null,
        // ─── 上下文菜单 ───
        h(ContextMenu, { menu, engineRef, setMenu, busy, setBusy, onRestoreParams, onExportCanvas }),
      )

      // ====================================================
      // 子视图：GEN mode — 专业生图台
      // ====================================================
      function renderGenMode() {
        const lastNode = store.doc.nodes.length > 0
          ? store.doc.nodes[store.doc.nodes.length - 1]
          : null
        const selNode = store.sel.size === 1 ? store.node([...store.sel][0]) : null
        const heroNode = selNode || lastNode
        const anchorInfo = selNode && selNode.status === 'done' ? { node: selNode } : null
        return h('div', { className: 'snx-gen' },
          // ── 预览大图 ──
          h('div', { className: 'snx-gen-hero' + (heroNode ? '' : ' empty') },
            heroNode
              ? h(GenHero, {
                  node: heroNode,
                  onEdit: () => setMode('canvas'),
                  onRefresh: () => force((n) => n + 1),
                  onOpenLightbox: () => setLightbox(heroNode),
                  onUseAsAnchor: () => { /* anchor already set */ },
                })
              : h(GenHeroEmpty, { busy }),
            // 空状态/忙时叠层
            busy ? h('div', { className: 'snx-gen-hero-busy' },
              h('div', { className: 'spin' }),
              h('div', { className: 'lbl' }, 'SenseNova 生成中…'),
            ) : null,
          ),
          // ── 提示词 + 控制 ──
          h(GenForm, {
            engineRef, busy, setBusy, notify,
            anchorInfo,
            onClearAnchor: () => {
              store.sel = new Set()
              force((n) => n + 1)
            },
          }),
          // ── 最近画廊（横排缩略图）──
          h(GenRecent, {
            store, selId, setSelId,
            onOpen: () => setMode('gallery'),
            onOpenLightbox: (n) => setLightbox(n),
          }),
        )
      }

      // ====================================================
      // 子视图：CANVAS mode — 完整 Konva 画布
      // ====================================================
      function renderCanvasMode() {
        return h('div', { className: 'snx-canvas-wrap' },
          // 顶部：画布工具条（GenBar）+ 全屏展开按钮
          !maskId && ready && !loadErr ? h(GenBar, { engineRef, busy, setBusy, notify }) : null,
          h('button', {
            className: 'snx-canvas-fs',
            type: 'button',
            onClick: () => setFsCanvas(true),
            title: '展开全屏画布（Esc 退出）',
          }, '⛶ 展开'),
          // Konva 容器（全屏画布打开时让出 wrapRef，避免两个元素争抢同一 ref 导致 detach 死锁）
          !fsCanvas ? h('div', { className: 'snx-canvas-stage', ref: wrapRef },
            loadErr ? h('div', { className: 'snx-canvas-err' }, loadErr) : null,
            // 空画布提示
            ready && !loadErr && store.doc.nodes.length === 0 && !maskId ? h('div', { className: 'snx-canvas-empty' },
              h('div', { className: 'big' }, '✦'),
              h('div', { className: 't1' }, '画布为空'),
              h('div', { className: 't2' }, '在「生图」标签里输入提示词，或粘贴/拖入图像'),
            ) : null,
            // 蒙版工具条
            maskId ? h('div', { className: 'snx-maskbar v2' },
              // 画笔 4 滑块（v8）
              h('div', { className: 'snx-brush-controls' },
                h('span', { className: 'lb' }, '🖌 画笔'),
                h('label', { className: 'br-row' },
                  h('span', { className: 'br-k' }, '大小'),
                  h('input', { type: 'range', min: 8, max: 200, value: brush,
                    onChange: (e) => setBrush(parseInt(e.target.value, 10)) }),
                  h('span', { className: 'br-v' }, brush + 'px'),
                ),
                h('label', { className: 'br-row' },
                  h('span', { className: 'br-k' }, '不透明'),
                  h('input', { type: 'range', min: 10, max: 100, value: brushOpacity,
                    onChange: (e) => setBrushOpacity(parseInt(e.target.value, 10)) }),
                  h('span', { className: 'br-v' }, brushOpacity + '%'),
                ),
                h('label', { className: 'br-row' },
                  h('span', { className: 'br-k' }, '硬度'),
                  h('input', { type: 'range', min: 0, max: 100, value: brushHardness,
                    onChange: (e) => setBrushHardness(parseInt(e.target.value, 10)) }),
                  h('span', { className: 'br-v' }, brushHardness + '%'),
                ),
                h('label', { className: 'br-row' },
                  h('span', { className: 'br-k' }, '羽化'),
                  h('input', { type: 'range', min: 0, max: 100, value: brushFeather,
                    onChange: (e) => setBrushFeather(parseInt(e.target.value, 10)) }),
                  h('span', { className: 'br-v' }, brushFeather + '%'),
                ),
              ),
              h('input', { type: 'text', value: maskPrompt,
                onChange: (e) => setMaskPrompt(e.target.value),
                onKeyDown: (e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) applyMask() },
                placeholder: '这块区域要改成什么？' }),
              h('button', { onClick: () => { const st = maskRef.current; if (st) { st.strokes.pop(); if (st.redraw) st.redraw() } } }, '↩ 撤一笔'),
              h('button', { onClick: cancelMask }, '✕ 取消'),
              h('button', { className: 'go', onClick: applyMask, disabled: busy }, busy ? '⏳' : '✓ 应用生成'),
              // 画笔预览圈（跟鼠标走）
              brushCursor.show ? h('div', {
                className: 'snx-brush-cursor',
                style: {
                  left: brushCursor.x + 'px', top: brushCursor.y + 'px',
                  width: brush + 'px', height: brush + 'px',
                  marginLeft: -(brush / 2) + 'px', marginTop: -(brush / 2) + 'px',
                  opacity: brushOpacity / 100,
                },
              }) : null,
            ) : null,
            // 浮动操作条
            selDone && engineRef.current ? h(ActionBar, {
              engineRef, busy, setBusy, notify, viewTick: undefined,
              onInpaint: (n) => enterMask(n),
              onErase: (n) => enterMask(n, true),
              onOutpaint: (n) => {
                const c = store.doc.camera
                const sx = n.x * c.scale + c.x
                const sy = n.y * c.scale + c.y
                setRatioAt({
                  x: Math.min(Math.max(8, sx + 240), window.innerWidth - 400),
                  y: Math.min(sy + 40, window.innerHeight - 120),
                  nodeId: n.id, label: '',
                })
              },
            }) : null,
            ratioAt ? h(RatioPopup, {
              at: ratioAt, onPick: (r) => applyOutpaint(r), onClose: () => setRatioAt(null),
            }) : null,
            // 缩放控件
            h('div', { className: 'snx-cv-zoom' },
              h('button', { onClick: () => engineRef.current && engineRef.current.zoomBy(1 / 1.25), title: '缩小' }, '−'),
              h('div', { className: 'pct' }, Math.round(((store.doc.camera && store.doc.camera.scale) || 1) * 100) + '%'),
              h('button', { onClick: () => engineRef.current && engineRef.current.zoomBy(1.25), title: '放大' }, '+'),
              h('button', { onClick: () => engineRef.current && engineRef.current.fit(), title: '适应', style: { width: 'auto', padding: '0 8px' } }, '⛶'),
            ),
          ) : null,
        )
      }

      // ====================================================
      // 子视图：GALLERY mode — 全部生成历史
      // ====================================================
      function renderGalleryMode() {
        // v8：画廊检索 + 标签 + 收藏筛选（状态提升见 Workbench 顶部的 gal* 四件套）
        const [q, setQ] = [galQ, setGalQ]
        const [tagFilter, setTagFilter] = [galTag, setGalTag]
        const [sortBy, setSortBy] = [galSort, setGalSort]
        const [favOnly, setFavOnly] = [galFav, setGalFav]
        let nodes = store.doc.nodes.slice().reverse()
        // 提取全部 tags
        const allTags = Array.from(new Set(nodes.flatMap((n) => (n.tags || []))))
        // 过滤
        if (q.trim()) {
          const q2 = q.trim().toLowerCase()
          nodes = nodes.filter((n) => (n.prompt || '').toLowerCase().includes(q2) || (n.params && n.params.model || '').toLowerCase().includes(q2))
        }
        if (tagFilter) nodes = nodes.filter((n) => (n.tags || []).includes(tagFilter))
        if (favOnly) nodes = nodes.filter((n) => n.favorite)
        // 排序
        if (sortBy === 'size') nodes.sort((a, b) => ((b.w || 0) * (b.h || 0)) - ((a.w || 0) * (a.h || 0)))
        // 否则按时间倒序（默认）
        return h('div', { className: 'snx-gal' },
          h('div', { className: 'snx-gal-bar' },
            h('span', null, `共 ${nodes.length} / ${store.doc.nodes.length} 张`),
            h('div', { style: { flex: 1 } }),
            store.doc.nodes.length > 0 ? h('button', {
              className: 'snx-gal-btn',
              onClick: async () => {
                if (!confirm(`清空全部 ${store.doc.nodes.length} 张图？`)) return
                store.doc.nodes = []
                store.sel = new Set()
                force((n) => n + 1)
                try { await put(CANVAS_ROUTE, { doc: store.doc }) } catch {}
              },
            }, '🗑 清空') : null,
          ),
          // v8：搜索 + 标签 + 排序 + 收藏筛选
          store.doc.nodes.length > 0 ? h('div', { className: 'snx-gal-tools' },
            h('input', {
              className: 'snx-gal-q',
              placeholder: '搜索提示词 / 模型…',
              value: q,
              onChange: (e) => setQ(e.target.value),
            }),
            h('select', { className: 'snx-gal-sel', value: sortBy, onChange: (e) => setSortBy(e.target.value) },
              h('option', { value: 'time' }, '⏱ 时间'),
              h('option', { value: 'size' }, '⛶ 尺寸'),
            ),
            h('button', {
              className: 'snx-gal-fav' + (favOnly ? ' on' : ''),
              onClick: () => setFavOnly(!favOnly),
              type: 'button', title: '只看收藏',
            }, favOnly ? '★ 收藏' : '☆ 收藏'),
            allTags.length > 0 ? h('div', { className: 'snx-gal-tags' },
              h('button', {
                className: 'snx-gal-tag' + (!tagFilter ? ' on' : ''),
                onClick: () => setTagFilter(''), type: 'button',
              }, '全部'),
              allTags.map((t) => h('button', {
                key: t,
                className: 'snx-gal-tag' + (tagFilter === t ? ' on' : ''),
                onClick: () => setTagFilter(tagFilter === t ? '' : t), type: 'button',
              }, '#' + t)),
            ) : null,
          ) : null,
          nodes.length === 0 ? h('div', { className: 'snx-gal-empty' },
            h('div', { className: 'big' }, q || tagFilter || favOnly ? '🔍' : '🖼'),
            h('div', { className: 't1' }, q || tagFilter || favOnly ? '没有匹配的图' : '画廊为空'),
            h('div', { className: 't2' }, q || tagFilter || favOnly ? '试试清除筛选条件' : '「生图」里跑一张，或让 agent 帮你生成'),
          ) : h('div', { className: 'snx-gal-grid' },
            nodes.map((n) => h(GalleryItem, { key: n.id, node: n,
              onOpen: () => {
                // 切到画布模式并选中该节点
                setMode('canvas')
                store.sel = new Set([n.id])
                force((n) => n + 1)
              },
              onOpenLightbox: () => setLightbox(n),
            })),
          ),
        )
      }

      // ====================================================
      // 子视图：QUEUE — 并发生成队列（pending / running / done / error）
      // ====================================================
      function renderQueueMode() {
        const jobs = store.doc.nodes.slice().reverse()
          .filter((n) => n.status === 'pending' || n.status === 'running' || n.status === 'error' || (n.status === 'done' && Date.now() - (n.ts || 0) < 60_000))
        const running = jobs.filter((n) => n.status === 'running').length
        const pending = jobs.filter((n) => n.status === 'pending').length
        const done = jobs.filter((n) => n.status === 'done').length
        const error = jobs.filter((n) => n.status === 'error').length
        const allJobs = store.doc.nodes.filter((n) => n.status === 'pending' || n.status === 'running')
        // 完成进度 = done/(done+error+pending+running)——原为 running/allJobs 并发占用比（全部等待时恒 0%，语义不对）
        const finishedPct = Math.round(100 * done / Math.max(1, done + error + pending + running))
        return h('div', { className: 'snx-queue' },
          // 队列总览
          h('div', { className: 'snx-queue-summary' },
            h('div', { className: 'stat running' },
              h('div', { className: 'n' }, running),
              h('div', { className: 'lb' }, '运行中'),
              h('div', { className: 'dot' }),
            ),
            h('div', { className: 'stat pending' },
              h('div', { className: 'n' }, pending),
              h('div', { className: 'lb' }, '等待中'),
            ),
            h('div', { className: 'stat done' },
              h('div', { className: 'n' }, done),
              h('div', { className: 'lb' }, '已完成'),
            ),
            h('div', { className: 'stat error' },
              h('div', { className: 'n' }, error),
              h('div', { className: 'lb' }, '失败'),
            ),
            h('div', { style: { flex: 1 } }),
            allJobs.length > 0 ? h('button', {
              className: 'snx-queue-cancel',
              type: 'button',
              onClick: () => {
                if (!confirm(`取消全部 ${allJobs.length} 个未完成任务？\n（正在进行的请求会立即中断）`)) return
                for (const n of allJobs) cancelJob(n.id)
                force((x) => x + 1)
                autosave()
              },
            }, '⛔ 全部取消') : null,
          ),
          // 进度条（全局）
          allJobs.length > 0 ? h('div', { className: 'snx-queue-progress' },
            h('div', { className: 'bar' },
              h('div', {
                className: 'fill',
                style: {
                  width: finishedPct + '%',
                },
              }),
            ),
            h('div', { className: 'lbl' }, `${running} / ${allJobs.length} 并发 · ${finishedPct}% 完成`),
          ) : null,
          // 任务列表
          h('div', { className: 'snx-queue-list' },
            jobs.length === 0 ? h('div', { className: 'snx-queue-empty' },
              h('div', { className: 'big' }, '⚡'),
              h('div', { className: 't1' }, '队列空闲'),
              h('div', { className: 't2' }, '在「生图」里点生成会进队列'),
            ) : jobs.map((n) => h(QueueItem, {
              key: n.id,
              node: n,
              onCancel: () => {
                cancelJob(n.id)
                force((x) => x + 1)
              },
              onOpen: () => setLightbox(n),
              onRetry: async () => {
                n.status = 'pending'; n.errMsg = ''
                force((x) => x + 1); autosave()
                const p = n.params || {}
                try { await runOne(n.id, {
                  prompt: n.prompt, size: p.size, model: p.model,
                  reference: p.reference || undefined,
                  negative: p.negative || undefined,
                  seed: typeof p.seed === 'number' ? p.seed : undefined,
                  refs: (Array.isArray(p.refs) ? p.refs : []).filter((r) => r && r.src),
                }) }
                catch (e) { n.status = 'error'; n.errMsg = String(e && e.message || e) }
                force((x) => x + 1); autosave()
              },
            })),
          ),
        )
      }

      // ====================================================
      // 子视图：COMPARE — 2-4 张图并排对比 + overlay slider
      // ====================================================
      function renderCompareMode() {
        const allDone = store.doc.nodes.filter((n) => n.status === 'done')
        // 选中池：当前 store.sel 中的图，最多 4 张
        const selected = []
        for (const id of store.sel) {
          const n = store.node(id)
          if (n && n.status === 'done') selected.push(n)
        }
        // 默认：最后 2 张（写回 store.sel——否则补位槽的 ✕ 删的是不在 sel 里的 id，看似失灵；
        // 用户一旦手动增删（cmpTouched）就不再自动补位，否则删掉的图会被立即补回）
        if (!cmpTouched && selected.length < 2 && allDone.length >= 2) {
          const s = new Set(store.sel)
          const last = allDone[allDone.length - 1]
          const prev = allDone[allDone.length - 2]
          if (!selected.includes(last)) { selected.push(last); s.add(last.id) }
          if (!selected.includes(prev)) { selected.unshift(prev); s.add(prev.id) }
          store.sel = s
        }
        const canAdd = selected.length < 4 && allDone.length > selected.length
        return h('div', { className: 'snx-cmp' },
          // 顶部选择器
          h('div', { className: 'snx-cmp-bar' },
            h('div', { className: 'snx-cmp-picks' },
              [0, 1, 2, 3].map((slot) => {
                const node = selected[slot]
                return h('div', {
                  key: slot,
                  className: 'snx-cmp-slot' + (node ? ' filled' : ''),
                },
                  node ? h('img', { src: node.src, alt: '' }) : h('span', null, '＋'),
                  node ? h('button', {
                    className: 'snx-cmp-slot-x',
                    type: 'button',
                    onClick: () => {
                      const s = new Set(store.sel); s.delete(node.id); store.sel = s
                      setCmpTouched(true)
                      force((x) => x + 1)
                    },
                  }, '✕') : null,
                )
              }),
            ),
            h('div', { style: { flex: 1 } }),
            canAdd ? h('select', {
              className: 'snx-cmp-add',
              value: '',
              onChange: (e) => {
                const id = e.target.value
                if (!id) return
                const s = new Set(store.sel); s.add(id); store.sel = s
                setCmpTouched(true)
                force((x) => x + 1)
                e.target.value = ''
              },
            },
              h('option', { value: '' }, '＋ 添加…'),
              allDone.filter((n) => !store.sel.has(n.id)).slice(-20).reverse().map((n) =>
                h('option', { key: n.id, value: n.id }, (n.prompt || '—').replace(/^💬\s*/, '').slice(0, 36)),
              ),
            ) : null,
          ),
          // 对比视图
          selected.length < 2 ? h('div', { className: 'snx-cmp-empty' },
            h('div', { className: 'big' }, '⇄'),
            h('div', { className: 't1' }, '选中 2-4 张图开始对比'),
            h('div', { className: 't2' }, '在下方画廊池单击切换，或用 ＋ 添加'),
          ) : selected.length === 2 ? h(ComparePair, { a: selected[0], b: selected[1] }) :
            h(CompareGrid, { items: selected }),
          // 下方：选择池（点击 toggle）
          allDone.length > 0 ? h('div', { className: 'snx-cmp-pool' },
            h('div', { className: 'lb' }, '画廊池 · 单击切换对比'),
            h('div', { className: 'snx-cmp-pool-row' },
              allDone.slice().reverse().slice(0, 16).map((n) => h('button', {
                key: n.id,
                className: 'snx-cmp-pool-item' + (store.sel.has(n.id) ? ' on' : ''),
                onClick: () => {
                  const s = new Set(store.sel)
                  if (s.has(n.id)) s.delete(n.id)
                  else if (s.size < 4) s.add(n.id)
                  store.sel = s
                  setCmpTouched(true)
                  force((x) => x + 1)
                },
                type: 'button',
                title: n.prompt || '',
              },
                h('img', { src: n.src, alt: '', loading: 'lazy' }),
              )),
            ),
          ) : null,
        )
      }

      // ====================================================
      // 子视图：SETTINGS — 配置 Key / 模型默认 / 数据
      // ====================================================
      // ====================================================
      // 子视图：FULLSCREEN CANVAS — 展开到全屏的画布编辑器
      // ====================================================
      function renderFsCanvas() {
        // 派生 state：当前选中节点（用于左侧图层面板）
        const selNode = store.sel.size === 1 ? store.node([...store.sel][0]) : null
        return h('div', { className: 'snx-fs' },
          h('div', { className: 'snx-fs-top' },
            h('div', { className: 'snx-fs-brand' },
              h('span', { className: 'ti' }, '🎨'),
              h('span', null, '画布编辑'),
              h('span', { className: 'cnt' }, store.doc.nodes.length + ' 张'),
            ),
            h('div', { style: { flex: 1 } }),
            h('span', { className: 'snx-fs-hint' }, 'Esc 退出'),
            h('button', { className: 'snx-fs-x', type: 'button', onClick: onExportCanvas, title: '全部可见图按布局合成一张 PNG' }, '⬇ 导出画布'),
            h('button', { className: 'snx-fs-x', type: 'button', onClick: () => setFsCanvas(false) }, '✕ 退出全屏'),
          ),
          h('div', { className: 'snx-fs-body' },
            // 左侧图层面板
            h('aside', { className: 'snx-fs-layers' },
              h('div', { className: 'snx-fs-h' }, '🗂 图层'),
              h('div', { className: 'snx-fs-layers-list' },
                store.doc.nodes.slice().reverse().map((n) => h('div', {
                  key: n.id,
                  className: 'snx-fs-layer' + (store.sel.has(n.id) ? ' on' : ''),
                  onClick: () => {
                    store.sel = new Set([n.id]); force((x) => x + 1)
                    engineRef.current && engineRef.current.fit && engineRef.current.fit()
                  },
                  title: (n.prompt || '').slice(0, 60),
                },
                  h('div', { className: 'snx-fs-layer-img' },
                    n.src ? h('img', { src: n.src, alt: '' }) :
                      h('span', null, n.status === 'running' ? '⏳' : n.status === 'pending' ? '⌛' : n.status === 'error' ? '⚠' : '∅'),
                  ),
                  h('div', { className: 'snx-fs-layer-info' },
                    h('div', { className: 'snx-fs-layer-pr' }, (n.prompt || '—').slice(0, 32)),
                    h('div', { className: 'snx-fs-layer-sub' },
                      h('span', { className: 'snx-fs-layer-st st-' + n.status }, n.status),
                      n.w && n.h ? h('span', null, ' · ' + n.w + '×' + n.h) : null,
                    ),
                  ),
                )),
              ),
            ),
            // 中间画布
            h('div', { className: 'snx-fs-stage' },
              !maskId && ready && !loadErr ? h(GenBar, { engineRef, busy, setBusy, notify }) : null,
              h('div', { className: 'snx-fs-canvas', ref: wrapRef },
                loadErr ? h('div', { className: 'snx-canvas-err' }, loadErr) : null,
                ready && !loadErr && store.doc.nodes.length === 0 && !maskId ? h('div', { className: 'snx-canvas-empty' },
                  h('div', { className: 'big' }, '✦'),
                  h('div', { className: 't1' }, '画布为空'),
                  h('div', { className: 't2' }, '回到「生图」生成，或粘贴/拖入图像'),
                ) : null,
                maskId ? h('div', { className: 'snx-maskbar' },
                  h('span', { className: 'lb' }, '🖌 涂抹要修改的区域'),
                  h('input', { type: 'range', min: 12, max: 160, value: brush,
                    onChange: (e) => setBrush(parseInt(e.target.value, 10)), title: '笔刷大小' }),
                  h('input', { type: 'text', value: maskPrompt,
                    onChange: (e) => setMaskPrompt(e.target.value),
                    onKeyDown: (e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) applyMask() },
                    placeholder: '这块区域要改成什么？' }),
                  h('button', { onClick: () => { const st = maskRef.current; if (st) { st.strokes.pop(); if (st.redraw) st.redraw() } } }, '↩ 撤一笔'),
                  h('button', { onClick: cancelMask }, '✕ 取消'),
                  h('button', { className: 'go', onClick: applyMask, disabled: busy }, busy ? '⏳' : '✓ 应用生成'),
                ) : null,
                selDone && engineRef.current ? h(ActionBar, {
                  engineRef, busy, setBusy, notify, viewTick: undefined,
                  onInpaint: (n) => enterMask(n),
                  onErase: (n) => enterMask(n, true),
                  onOutpaint: (n) => {
                    const c = store.doc.camera
                    const sx = n.x * c.scale + c.x
                    const sy = n.y * c.scale + c.y
                    setRatioAt({
                      x: Math.min(Math.max(8, sx + 240), window.innerWidth - 400),
                      y: Math.min(sy + 40, window.innerHeight - 120),
                      nodeId: n.id, label: '',
                    })
                  },
                }) : null,
                ratioAt ? h(RatioPopup, {
                  at: ratioAt, onPick: (r) => applyOutpaint(r), onClose: () => setRatioAt(null),
                }) : null,
                h('div', { className: 'snx-cv-zoom' },
                  h('button', { onClick: () => engineRef.current && engineRef.current.zoomBy(1 / 1.25), title: '缩小' }, '−'),
                  h('div', { className: 'pct' }, Math.round(((store.doc.camera && store.doc.camera.scale) || 1) * 100) + '%'),
                  h('button', { onClick: () => engineRef.current && engineRef.current.zoomBy(1.25), title: '放大' }, '+'),
                  h('button', { onClick: () => engineRef.current && engineRef.current.fit(), title: '适应', style: { width: 'auto', padding: '0 8px' } }, '⛶'),
                ),
              ),
            ),
            // 右侧属性面板
            h('aside', { className: 'snx-fs-props' },
              h('div', { className: 'snx-fs-h' }, '🎛 属性'),
              selNode ? h('div', { className: 'snx-fs-props-body' },
                h('div', { className: 'snx-fs-prop' },
                  h('div', { className: 'lb' }, '提示词'),
                  h('div', { className: 'val' }, (selNode.prompt || '—').replace(/^💬\s*/, '')),
                ),
                h('div', { className: 'snx-fs-prop' },
                  h('div', { className: 'lb' }, '尺寸'),
                  h('div', { className: 'val' }, (selNode.w || 0) + ' × ' + (selNode.h || 0)),
                ),
                h('div', { className: 'snx-fs-prop' },
                  h('div', { className: 'lb' }, '位置'),
                  h('div', { className: 'val' }, Math.round(selNode.x || 0) + ', ' + Math.round(selNode.y || 0)),
                ),
                h('div', { className: 'snx-fs-prop' },
                  h('div', { className: 'lb' }, '状态'),
                  h('div', { className: 'val' },
                    h('span', { className: 'snx-fs-layer-st st-' + selNode.status }, selNode.status),
                  ),
                ),
                h('div', { className: 'snx-fs-prop' },
                  h('div', { className: 'lb' }, '操作'),
                  h('div', { className: 'snx-fs-prop-acts' },
                    h('button', {
                      type: 'button',
                      className: 'snx-fs-pa',
                      onClick: () => enterMask(selNode),
                    }, '🖌 重绘'),
                    h('button', {
                      type: 'button',
                      className: 'snx-fs-pa',
                      onClick: () => {
                        const c = store.doc.camera
                        const sx = selNode.x * c.scale + c.x
                        const sy = selNode.y * c.scale + c.y
                        setRatioAt({
                          x: Math.min(Math.max(8, sx + 240), window.innerWidth - 400),
                          y: Math.min(sy + 40, window.innerHeight - 120),
                          nodeId: selNode.id, label: '',
                        })
                      },
                    }, '⬛ 扩图'),
                    h('button', {
                      type: 'button',
                      className: 'snx-fs-pa',
                      onClick: () => { store.duplicateSelected(); force((x) => x + 1) },
                    }, '⧉ 复制'),
                    h('button', {
                      type: 'button',
                      className: 'snx-fs-pa danger',
                      onClick: () => {
                        store.doc.nodes = store.doc.nodes.filter((n) => !store.sel.has(n.id))
                        store.sel = new Set()
                        force((x) => x + 1)
                        autosave()
                      },
                    }, '🗑 删除'),
                  ),
                ),
                selNode.parentId ? h('div', { className: 'snx-fs-prop' },
                  h('div', { className: 'lb' }, '衍生自'),
                  h('div', { className: 'val mono' }, selNode.parentId.slice(0, 12)),
                ) : null,
                // v8：图层属性 — 混合模式 + 不透明度 + 锁定 + 可见性
                h('div', { className: 'snx-fs-prop' },
                  h('div', { className: 'lb' }, '图层属性'),
                  h('div', { className: 'snx-fs-prop-row' },
                    h('label', null, h('span', null, '混合'),
                      h('select', {
                        value: selNode.blendMode || 'normal',
                        onChange: (e) => {
                          selNode.blendMode = e.target.value
                          engineRef.current && engineRef.current.refresh && engineRef.current.refresh()
                          force((x) => x + 1); autosave()
                        },
                      },
                        ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten'].map((m) =>
                          h('option', { key: m, value: m }, m),
                        ),
                      ),
                    ),
                  ),
                  h('div', { className: 'snx-fs-prop-row' },
                    h('label', null,
                      h('span', null, '不透明'),
                      h('input', { type: 'range', min: 0, max: 100, value: Math.round((selNode.opacity ?? 1) * 100),
                        onChange: (e) => {
                          selNode.opacity = parseInt(e.target.value, 10) / 100
                          engineRef.current && engineRef.current.refresh && engineRef.current.refresh()
                          force((x) => x + 1); autosave()
                        } }),
                      h('span', { className: 'v' }, Math.round((selNode.opacity ?? 1) * 100) + '%'),
                    ),
                  ),
                  h('div', { className: 'snx-fs-prop-row btns' },
                    h('button', {
                      type: 'button',
                      className: 'snx-fs-pa2' + (selNode.hidden ? ' on' : ''),
                      onClick: () => {
                        selNode.hidden = !selNode.hidden
                        engineRef.current && engineRef.current.refresh && engineRef.current.refresh()
                        force((x) => x + 1); autosave()
                      },
                    }, selNode.hidden ? '👁‍🗨 隐藏中' : '👁 可见'),
                    h('button', {
                      type: 'button',
                      className: 'snx-fs-pa2' + (selNode.locked ? ' on' : ''),
                      onClick: () => {
                        selNode.locked = !selNode.locked
                        engineRef.current && engineRef.current.refresh && engineRef.current.refresh()
                        force((x) => x + 1); autosave()
                      },
                    }, selNode.locked ? '🔒 已锁' : '🔓 解锁'),
                  ),
                ),
              ) : h('div', { className: 'snx-fs-props-empty' },
                h('div', { className: 'big' }, '🎛'),
                h('div', null, '在画布上点一张图'),
              ),
            ),
          ),
          h(ContextMenu, { menu, engineRef, setMenu, busy, setBusy, onRestoreParams, onExportCanvas }),
        )
      }

      // ====================================================
      // 子视图：SETTINGS — 配置 Key / 模型默认 / 数据
      // ====================================================
      function renderSettingsMode() {
        const pingOk = pingResult && pingResult.ok
        const modelCount = pingOk && Array.isArray(pingResult.models) ? pingResult.models.length : null
        return h('div', { className: 'snx-set' },
          // v9：顶部状态卡（对齐 dsh 设置页的状态卡样式，一眼看全局）
          h('div', { className: 'snx-hero' },
            h('div', { className: 'snx-hero-tile' },
              h('span', { className: 'snx-hero-num' },
                h('span', { className: 'snx-hero-dot' + (keyOk === false ? ' off' : '') }),
                keyOk === null ? '…' : keyOk ? '已配置' : '未配置'),
              h('span', { className: 'snx-hero-lb' }, 'API Key'),
            ),
            h('div', { className: 'snx-hero-tile' },
              h('span', { className: 'snx-hero-num' },
                h('span', { className: 'snx-hero-dot' + (pingResult ? (pingOk ? '' : ' err') : ' off') }),
                pingResult ? (pingOk ? (modelCount + ' 个') : '失败') : '未测'),
              h('span', { className: 'snx-hero-lb' }, '连接测试'),
            ),
            h('div', { className: 'snx-hero-tile' },
              h('span', { className: 'snx-hero-num', title: genPrefs.model || 'sensenova-u1.5-lite' },
                genPrefs.model || 'sensenova-u1.5-lite'),
              h('span', { className: 'snx-hero-lb' }, '默认模型'),
            ),
            h('div', { className: 'snx-hero-tile' },
              h('span', { className: 'snx-hero-num' }, String(store.doc.nodes.length)),
              h('span', { className: 'snx-hero-lb' }, '画布图片'),
            ),
          ),
          h('div', { className: 'snx-set-section' },
            h('div', { className: 'snx-set-h' },
              h('span', { className: 'ti' }, '🔑'),
              h('span', null, 'SenseNova API Key'),
              h('div', { style: { flex: 1 } }),
              h('span', { className: 'snx-pro-key ' + (keyOk === false ? 'no' : (keyOk ? 'ok' : 'unk')) },
                keyOk === null ? '⌛' : keyOk ? '已配置' : '未配置'),
            ),
            h('div', { className: 'snx-cfg-row', style: { marginTop: '10px', marginBottom: '8px' } },
              h('div', { style: { display: 'flex', gap: '6px' } },
                h('input', {
                  className: 'snx-cfg-in',
                  style: { flex: 1, margin: '0' },
                  type: keyVisible ? 'text' : 'password',
                  placeholder: 'sk-…（留空保存 = 保留现有值/环境变量）',
                  value: keyDraft,
                  onChange: (e) => setKeyDraft(e.target.value),
                  onKeyDown: (e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) saveKey() },
                }),
                h('button', {
                  className: 'snx-set-btn', type: 'button', title: keyVisible ? '隐藏' : '显示',
                  onClick: () => setKeyVisible(!keyVisible),
                  style: { flexShrink: '0', color: 'var(--dsw-alias-label-secondary,#b3b6ba)', borderColor: 'var(--dsw-alias-border-l2,#ffffff1f)' },
                }, keyVisible ? '🙈 隐藏' : '👁 显示'),
              ),
            ),
            h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } },
              h('button', { className: 'snx-set-btn save', type: 'button', onClick: saveKey, disabled: keySaving || !keyDraft.trim() }, keySaving ? '保存中…' : '💾 保存 Key'),
              h('button', { className: 'snx-set-btn test', type: 'button', onClick: testKey, disabled: keyTesting }, keyTesting ? '测试中…' : '🔌 测试连接'),
              pingResult ? h('span', { className: 'snx-pro-key ' + (pingResult.ok ? 'ok' : 'no') },
                pingResult.ok ? '✓ 可用 · ' + (pingResult.models || []).length + ' 个模型' : '✗ ' + (pingResult.error || '失败').slice(0, 60)) : null,
            ),
            h('div', { className: 'snx-set-tip' },
              'Key 在 SenseNova 控制台 → ', h('b', null, '管理中心 → API-Key 管理'), ' 创建（sk-...）。保存后立即生效、优先级高于环境变量；测试连接会实际访问一次 SenseNova 并列出可用模型（当前图像模型：', h('code', null, 'sensenova-u1.5-lite'), '）。'),
          ),
          h('div', { className: 'snx-set-section' },
            h('div', { className: 'snx-set-h' },
              h('span', { className: 'ti' }, '🎨'),
              h('span', null, '模型 / 画质'),
            ),
            h('div', { className: 'snx-set-row' },
              h('div', null, h('span', { className: 'k' }, '默认模型'), h('span', { className: 'v' }, genPrefs.model || '配置默认')),
              h('div', null, h('span', { className: 'k' }, '默认画质'), h('span', { className: 'v' }, (genPrefs.quality || '2k').toUpperCase())),
              h('div', null, h('span', { className: 'k' }, '默认张数'), h('span', { className: 'v' }, String(genPrefs.count || 1))),
              h('div', null, h('span', { className: 'k' }, '默认尺寸'), h('span', { className: 'v' }, genPrefs.size || '2048×2048')),
            ),
          ),
          h('div', { className: 'snx-set-section' },
            h('div', { className: 'snx-set-h' },
              h('span', { className: 'ti' }, '💾'),
              h('span', null, '数据'),
              h('div', { style: { flex: 1 } }),
              h('button', {
                className: 'snx-set-btn',
                type: 'button',
                onClick: async () => {
                  if (!confirm(`清空全部 ${store.doc.nodes.length} 张画布图？\n文件本身保留在磁盘，仅清空文档索引。`)) return
                  store.doc.nodes = []
                  store.sel = new Set()
                  force((n) => n + 1)
                  try { await put(CANVAS_ROUTE, { doc: store.doc }) } catch {}
                  notify && notify('✓ 画布已清空')
                },
              }, '🗑 清空画布'),
            ),
            h('div', { className: 'snx-set-tip' },
              `当前画布共 ${store.doc.nodes.length} 张图，`,
              h('b', null, '已生成的文件保留在 '),
              h('code', null, '~/.dsh/storages/sensenova-images/'),
              '，清空画布只是清空文档索引，文件不丢。'),
          ),
          h('div', { className: 'snx-set-section' },
            h('div', { className: 'snx-set-h' },
              h('span', { className: 'ti' }, '⌨️'),
              h('span', null, '快捷键'),
            ),
            h('div', { className: 'snx-set-row' },
              h('div', null, h('span', { className: 'k' }, '⌘ / Ctrl + Enter'), h('span', { className: 'v' }, '生图')),
              h('div', null, h('span', { className: 'k' }, 'Esc'), h('span', { className: 'v' }, '关闭 lightbox / 全屏画布')),
              h('div', null, h('span', { className: 'k' }, '+ / - / 0'), h('span', { className: 'v' }, 'lightbox 缩放')),
              h('div', null, h('span', { className: 'k' }, 'F'), h('span', { className: 'v' }, '画布适应画面')),
              h('div', null, h('span', { className: 'k' }, 'Del'), h('span', { className: 'v' }, '删除选中节点')),
              h('div', null, h('span', { className: 'k' }, 'Ctrl + V'), h('span', { className: 'v' }, '粘贴图片为节点')),
              h('div', null, h('span', { className: 'k' }, '?'), h('span', { className: 'v' }, '打开快捷键速查')),
            ),
          ),
          // v8：提示词库 section
          h(PromptLibSection, { notify }),
        )
      }
    }

    // ─── v8：提示词库 section（设置页）───
    function PromptLibSection({ notify }) {
      const [lib, setLib] = useState(loadPromptLib())
      const refresh = () => setLib(loadPromptLib())
      const usePrompt = (p) => {
        // 同时写 genPrefs：GenForm 只在生图 tab 挂载，设置页里 dispatch 无人接收，
        // 等切回生图 tab 重新挂载时初值读 genPrefs.prompt，这样提示词才真正落地
        genPrefs.prompt = p
        window.dispatchEvent(new CustomEvent('snx:usePrompt', { detail: p }))
        notify && notify('✓ 提示词已加载（生图 tab 的提示词框已更新）')
      }
      return h('div', { className: 'snx-set-section' },
        h('div', { className: 'snx-set-h' },
          h('span', { className: 'ti' }, '📚'),
          h('span', null, '提示词库'),
          h('div', { style: { flex: 1 } }),
          h('span', { className: 'h' }, `${lib.stars.length} 收藏 / ${lib.recents.length} 最近`),
        ),
        h('div', { className: 'snx-promptlib' },
          lib.stars.length ? h('div', { className: 'snx-promptlib-h' }, '⭐ 收藏') : null,
          lib.stars.map((s) => h('div', { key: s.prompt, className: 'snx-promptlib-item star' },
            h('div', { className: 'snx-promptlib-pr', onClick: () => usePrompt(s.prompt), title: '点击填回提示词' }, s.prompt),
            h('span', { className: 'snx-promptlib-ts' }, s.ts ? new Date(s.ts).toLocaleDateString() : ''),
            h('button', { type: 'button', className: 'snx-promptlib-x', onClick: () => {
              const ll = loadPromptLib()
              ll.stars = ll.stars.filter((x) => x.prompt !== s.prompt)
              savePromptLib(ll); refresh()
            }, title: '删除收藏' }, '✕'),
          )),
          lib.recents.length ? h('div', { className: 'snx-promptlib-h' }, '🕐 最近') : null,
          lib.recents.slice(0, 10).map((p, i) => h('div', { key: i, className: 'snx-promptlib-item' },
            h('div', { className: 'snx-promptlib-pr', onClick: () => usePrompt(p), title: '点击填回提示词' }, p),
            h('button', { type: 'button', className: 'snx-promptlib-star', onClick: () => {
              toggleStar(p); refresh()
            }, title: '收藏' }, isStarred(p) ? '★' : '☆'),
          )),
          lib.stars.length === 0 && lib.recents.length === 0 ? h('div', { className: 'snx-promptlib-empty' }, '还没有提示词——去「生图」tab 用 ⭐ 收藏，或自动记录最近 10 条') : null,
        ),
      )
    }

    // ── 预览大图组件 ──
    function GenHero({ node, onEdit, onRefresh, onOpenLightbox }) {
      const [src, setSrc] = useState(node && node.src)
      const [hover, setHover] = useState(false)
      useEffect(() => { setSrc(node && node.src) }, [node && node.id])
      const prompt = (node && node.prompt) || ''
      const model = (node && node.params && node.params.model) || ''
      const w = node && node.w, hgt = node && node.h
      return h('div', { className: 'snx-gen-hero-inner' },
        h('div', {
          className: 'snx-gen-hero-imgbox',
          onMouseEnter: () => setHover(true),
          onMouseLeave: () => setHover(false),
          onClick: onOpenLightbox,
          title: '点击查看大图',
        },
          src ? h('img', { src: src, alt: '' }) :
            h('div', { className: 'snx-gen-hero-fail' }, '⚠ 加载失败'),
          hover ? h('div', { className: 'snx-gen-hero-overlay' },
            h('div', { className: 'snx-gen-hero-zoom' }, '⛶ 查看大图'),
          ) : null,
        ),
        h('div', { className: 'snx-gen-hero-cap' },
          h('div', { className: 'pr' }, prompt ? prompt.replace(/^💬\s*/, '') : '— 无提示词 —'),
          h('div', { className: 'meta' },
            w && hgt ? `${w}×${hgt}` : '',
            model ? ' · ' + model : '',
            node && node.ts ? ' · ' + new Date(node.ts).toLocaleString() : '',
          ),
          h('div', { className: 'acts' },
            h('button', { className: 'snx-gen-act', onClick: onEdit, title: '打开画布编辑器' }, '🎨 画布'),
            h('button', { className: 'snx-gen-act', onClick: onOpenLightbox, title: '全屏预览' }, '⛶ 大图'),
            src ? h('a', { className: 'snx-gen-act', href: src, download: '', target: '_blank', rel: 'noreferrer' }, '⬇ 下载') : null,
            h('button', { className: 'snx-gen-act', onClick: onRefresh }, '🔄'),
          ),
        ),
      )
    }

    function GenHeroEmpty({ busy }) {
      return h('div', { className: 'snx-gen-hero-empty' },
        h('div', { className: 'big' }, busy ? '🎨' : '✦'),
        h('div', { className: 't1' }, busy ? 'SenseNova 生成中…' : '还没有生成图'),
        h('div', { className: 't2' }, busy ? '请稍等几秒' : '在下方输入提示词，或让 agent 帮你画'),
      )
    }

    // ── 提示词 + 表单（v2：含风格预设 / i2i 提示 / 完整参数）──
    const STYLE_PRESETS = [
      { id: 'cinematic', label: '🎬 电影', suffix: ', cinematic lighting, film grain, depth of field, 8K, dramatic atmosphere' },
      { id: 'photo', label: '📷 摄影', suffix: ', photorealistic, sharp focus, natural lighting, high detail, DSLR quality' },
      { id: 'anime', label: '🎨 动漫', suffix: ', anime style, cel shading, vibrant colors, clean linework' },
      { id: 'oil', label: '🖌 油画', suffix: ', oil painting, visible brushstrokes, rich texture, classical composition' },
      { id: '3d', label: '🧊 3D', suffix: ', 3D render, octane render, volumetric lighting, hyperdetailed' },
      { id: 'ink', label: '✒️ 水墨', suffix: ', Chinese ink wash painting, xieyi style, flowing brushwork, minimalist' },
      { id: 'pixel', label: '👾 像素', suffix: ', pixel art, 16-bit, crisp pixels, retro game aesthetic' },
      { id: 'archi', label: '🏛 建筑', suffix: ', architectural visualization, clean lines, studio lighting, wide angle' },
    ]
    const SIZE_PRESETS = [
      { id: 'square', label: '1:1', w: 1024, h: 1024 },
      { id: 'portrait', label: '3:4', w: 1024, h: 1536 },
      { id: 'landscape', label: '4:3', w: 1536, h: 1024 },
      { id: 'wide', label: '2:1', w: 2048, h: 1024 },
      { id: 'ultra', label: '21:9', w: 2048, h: 880 },
      { id: 'mobile', label: '9:16', w: 768, h: 1280 },
      { id: 'photo', label: '3:2', w: 1536, h: 1024 },
      { id: 'std', label: '7:5', w: 1536, h: 1097 },
    ]
    const MODEL_PRESETS_FORM = [
      { id: '', label: '默认（配置中的模型）' },
      { id: 'sensenova-u1.5-lite', label: 'sensenova-u1.5-lite · 当前可用（文生图/图生图）' },
      { id: 'sensenova-u1.5', label: 'sensenova-u1.5 · 控制台已开通时可用' },
    ]
    function GenForm({ engineRef, busy, setBusy, notify, anchorInfo, onClearAnchor }) {
      const [prompt, setPrompt] = useState(genPrefs.prompt || '')
      const [negPrompt, setNegPrompt] = useState(genPrefs.negPrompt || '')
      const [size, setSize] = useState(genPrefs.size || '2048x2048')
      const [model, setModel] = useState(genPrefs.model || '')
      const [count, setCount] = useState(genPrefs.count || 1)
      const [seed, setSeed] = useState(genPrefs.seed ?? -1)
      const [quality, setQuality] = useState(genPrefs.quality || '2k')   // 2k | 4k
      const [styleId, setStyleId] = useState(genPrefs.styleId || '')
      const [showAdv, setShowAdv] = useState(false)
      const [err, setErr] = useState('')
      // 多参考图：refs = [{src, role, strength}] — 风格 / 角色 / 构图 / 参考
      const [refs, setRefs] = useState(genPrefs.refs || [])
      const [pickerOpen, setPickerOpen] = useState(false)
      const [starred, setStarred] = useState(isStarred(genPrefs.prompt || ''))
      // 当 prompt 变化时刷新 star 状态（同一提示词收藏态保持）
      useEffect(() => { setStarred(isStarred(prompt)) }, [prompt])
      // v8：从提示词库加载
      useEffect(() => {
        const onUse = (e) => {
          if (e && e.detail) setPrompt(e.detail)   // setPrompt 自身触发重渲染，无需 force（也避免引用未定义的 force）
        }
        window.addEventListener('snx:usePrompt', onUse)
        return () => window.removeEventListener('snx:usePrompt', onUse)
      }, [])
      // 参数回填（灯箱/右键菜单「⤵ 回填参数」）：恢复 prompt+负面+尺寸+模型+种子+参考图
      useEffect(() => {
        const onRestore = (e) => {
          const d = e && e.detail
          if (!d) return
          setPrompt(d.prompt || '')
          setNegPrompt(d.negPrompt || '')
          setSize(d.size || genPrefs.size || '2048x2048')
          setModel(d.model || '')
          setSeed(typeof d.seed === 'number' ? d.seed : -1)
          if (Array.isArray(d.refs)) setRefs(d.refs)
        }
        window.addEventListener('snx:restoreParams', onRestore)
        return () => window.removeEventListener('snx:restoreParams', onRestore)
      }, [])
      const pickRef = (node) => {
        if (refs.length >= 4) return
        setRefs([...refs, { src: node.src, role: 'reference', strength: 0.7, fromId: node.id }])
        setPickerOpen(false)
      }
      const removeRef = (i) => setRefs(refs.filter((_, j) => j !== i))
      const setRefRole = (i, role) => {
        const ns = refs.slice(); ns[i] = { ...ns[i], role }; setRefs(ns)
      }
      const setRefStrength = (i, strength) => {
        const ns = refs.slice(); ns[i] = { ...ns[i], strength }; setRefs(ns)
      }

      const anchor = anchorInfo && anchorInfo.node

      const applyStyle = (s) => {
        setStyleId(s.id)
        const base = prompt.replace(/,\s*(cinematic|photorealistic|anime|oil painting|3D render|Chinese ink|pixel art|architectural)[^,]*$/i, '').trim()
        setPrompt((base ? base : '') + s.suffix)
      }

      const onPreset = (s) => {
        setSize(s.w + 'x' + s.h)
      }

      const gen = async () => {
        const p = prompt.trim()
        if (!p || busy) return
        setErr(''); setBusy(true)
        try {
          const engine = engineRef.current
          genPrefs.prompt = p; genPrefs.negPrompt = negPrompt
          genPrefs.size = size; genPrefs.model = model; genPrefs.count = count
          genPrefs.seed = seed; genPrefs.quality = quality; genPrefs.styleId = styleId
          genPrefs.refs = refs
          addRecent(p)
          await genToCanvas(engine, {
            prompt: p, negative: negPrompt || undefined, size: applyQuality(size, quality), model,
            seed: seed >= 0 ? seed : undefined,
            reference: anchor ? anchor.src : undefined,
            refs: refs.length ? refs.map((r) => ({ src: r.src, role: r.role, strength: r.strength })) : undefined,
            anchorNode: anchor,
            n: count,
          })
          if (notify) notify('✓ 已生成到画布')
        } catch (e) { setErr(String((e && e.message) || e)) }
        finally { setBusy(false) }
      }

      const onKey = (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); gen() }
      }

      return h('div', { className: 'snx-gen-form' },
        // ── i2i 锚点提示 ──
        anchor ? h('div', { className: 'snx-gen-anchor' },
          h('img', { src: anchor.src, alt: '', className: 'snx-gen-anchor-thumb' }),
          h('div', { className: 'snx-gen-anchor-info' },
            h('div', { className: 'lb' }, '✏️ i2i 编辑模式'),
            h('div', { className: 'sub' }, (anchor.prompt || '').replace(/^💬\s*/, '').slice(0, 48) || '— 无提示词 —'),
          ),
          h('button', {
            className: 'snx-gen-anchor-x',
            type: 'button',
            onClick: onClearAnchor,
            title: '清除选中，改为文生图',
          }, '✕'),
        ) : null,
        // ── 提示词 ──
        h('div', { className: 'snx-gen-fprompt' },
          h('div', { className: 'lb' },
              h('span', { className: 'ti' }, '✎'),
              h('span', null, anchor ? '编辑指令' : '提示词'),
              h('div', { style: { flex: 1 } }),
              h('button', {
                type: 'button',
                className: 'snx-gen-star' + (starred ? ' on' : ''),
                onClick: () => { setStarred(toggleStar(prompt)) },
                title: starred ? '取消收藏' : '收藏到提示词库',
              }, starred ? '★' : '☆'),
              h('span', { className: 'cnt' }, String(prompt.length) + ' / 2000'),
              h('span', { className: 'hk' }, '⌘+Enter'),
            ),
          h('textarea', {
            className: 'snx-gen-ta',
            value: prompt,
            onChange: (e) => setPrompt(e.target.value),
            onKeyDown: onKey,
            placeholder: anchor
              ? '描述要怎么改这张图，例如：换成夜间背景，增加雪…'
              : '描述要生成的图…\n例如：戴墨镜的柴犬坐在月球表面，4K，电影感',
            rows: 3,
            maxLength: 2000,
            spellCheck: false,
          }),
          // ── 多参考图槽位（v8）──
          refs.length > 0 || pickerOpen ? h('div', { className: 'snx-gen-refs' },
            h('div', { className: 'lb' },
              h('span', { className: 'ti' }, '🖼'),
              h('span', null, `参考图（${refs.length}/4）`),
              h('div', { style: { flex: 1 } }),
              h('span', { className: 'h' }, '风格 / 角色 / 构图'),
            ),
            h('div', { className: 'snx-gen-refs-row' },
              refs.map((r, i) => h('div', { key: i, className: 'snx-gen-ref' },
                h('img', { src: r.src, alt: '', className: 'snx-gen-ref-img' }),
                h('div', { className: 'snx-gen-ref-meta' },
                  h('select', {
                    className: 'snx-gen-ref-role',
                    value: r.role,
                    onChange: (e) => setRefRole(i, e.target.value),
                    title: '参考角色',
                  },
                    h('option', { value: 'reference' }, '参考'),
                    h('option', { value: 'style' }, '风格'),
                    h('option', { value: 'character' }, '角色'),
                    h('option', { value: 'composition' }, '构图'),
                  ),
                  h('input', {
                    type: 'range',
                    min: 10, max: 100, value: Math.round((r.strength ?? 0.7) * 100),
                    onChange: (e) => setRefStrength(i, parseInt(e.target.value, 10) / 100),
                    className: 'snx-gen-ref-strength',
                    title: '强度 ' + Math.round((r.strength ?? 0.7) * 100) + '%',
                  }),
                ),
                h('button', {
                  type: 'button', className: 'snx-gen-ref-x',
                  onClick: () => removeRef(i), title: '移除',
                }, '✕'),
              )),
              refs.length < 4 ? h('button', {
                type: 'button', className: 'snx-gen-ref-add',
                onClick: () => setPickerOpen(!pickerOpen),
                title: '从画廊选择参考图',
              }, pickerOpen ? '✕ 收起' : '+ 参考图') : null,
            ),
            pickerOpen ? h('div', { className: 'snx-gen-ref-picker' },
              store.doc.nodes.filter((n) => n.status === 'done').slice().reverse().slice(0, 12).map((n) =>
                h('button', {
                  key: n.id, type: 'button', className: 'snx-gen-ref-pick',
                  onClick: () => pickRef(n), title: (n.prompt || '').slice(0, 30),
                }, h('img', { src: n.src, alt: '', loading: 'lazy' })),
              ),
            ) : null,
          ) : h('button', {
            type: 'button', className: 'snx-gen-refs-add',
            onClick: () => setPickerOpen(true),
            title: '添加参考图（Midjourney 风格 / 角色 / 构图）',
          }, '🖼 + 多参考图'),
          // ── 风格预设 ──
          h('div', { className: 'snx-gen-styles' },
            h('div', { className: 'lb' },
              h('span', { className: 'ti' }, '✨'),
              h('span', null, '风格'),
              h('div', { style: { flex: 1 } }),
              h('button', {
                type: 'button',
                className: 'snx-gen-styles-clr',
                onClick: () => { setStyleId('') },
                title: '清除风格后缀',
              }, styleId ? '清除' : ''),
            ),
            h('div', { className: 'snx-gen-styles-row' },
              STYLE_PRESETS.map((s) => h('button', {
                key: s.id,
                className: 'snx-gen-chip' + (styleId === s.id ? ' on' : ''),
                onClick: () => applyStyle(s),
                type: 'button',
                title: '点一下把风格后缀加进提示词',
              }, s.label)),
            ),
          ),
          // ── 负面提示词（折叠在高级里也展示）──
          h('div', { className: 'snx-gen-fneg' },
            h('button', {
              className: 'snx-gen-fneg-tg',
              onClick: () => setShowAdv(!showAdv),
              type: 'button',
            },
              h('span', null, showAdv ? '▾' : '▸'),
              h('span', null, '负面提示词 / 种子 / 高级')),
            showAdv ? h('div', { className: 'snx-gen-fneg-body' },
              h('div', { className: 'lb' },
                h('span', { className: 'ti' }, '🚫'),
                h('span', null, '负面提示词'),
              ),
              h('textarea', {
                className: 'snx-gen-ta sm',
                value: negPrompt,
                onChange: (e) => setNegPrompt(e.target.value),
                placeholder: '不要的元素：模糊、低质量、变形、错误手指数…',
                rows: 2,
                spellCheck: false,
              }),
              h('div', { className: 'snx-gen-advanced' },
                h('div', { className: 'snx-gen-seed' },
                  h('label', null, '种子'),
                  h('input', {
                    type: 'number', value: seed,
                    onChange: (e) => setSeed(parseInt(e.target.value || '-1', 10)),
                    min: -1,
                  }),
                  h('button', {
                    type: 'button',
                    onClick: () => setSeed(Math.floor(Math.random() * 1e9)),
                    title: '随机种子',
                  }, '🎲'),
                  h('span', { className: 'h' }, '-1 = 随机'),
                ),
              ),
            ) : null,
          ),
        ),
        // ── 比例 + 尺寸 ──
        h('div', { className: 'snx-gen-fsize' },
          h('div', { className: 'lb' },
            h('span', { className: 'ti' }, '⛶'),
            h('span', null, '比例'),
            h('div', { style: { flex: 1 } }),
            h('span', { className: 'now' }, size),
          ),
          h('div', { className: 'snx-gen-fsize-row' },
            SIZE_PRESETS.map((s) => h('button', {
              key: s.id,
              className: 'snx-gen-chip' + (size === (s.w + 'x' + s.h) ? ' on' : ''),
              onClick: () => onPreset(s),
              type: 'button',
              title: s.w + '×' + s.h,
            }, s.label)),
          ),
        ),
        // ── 模型 + 质量 + 张数 ──
        h('div', { className: 'snx-gen-frow3' },
          h('div', { className: 'snx-gen-ff' },
            h('div', { className: 'lb' },
              h('span', { className: 'ti' }, '🎛️'),
              h('span', null, '模型'),
            ),
            h('select', {
              className: 'snx-gen-sel',
              value: model,
              onChange: (e) => { setModel(e.target.value); genPrefs.model = e.target.value },
            }, MODEL_PRESETS_FORM.map((p) => h('option', { key: p.id, value: p.id }, p.label))),
          ),
          h('div', { className: 'snx-gen-ff tiny' },
            h('div', { className: 'lb' },
              h('span', { className: 'ti' }, '🎚'),
              h('span', null, '画质'),
            ),
            h('div', { className: 'snx-gen-seg' },
              ['2k', '4k'].map((q) => h('button', {
                key: q,
                className: quality === q ? 'on' : '',
                onClick: () => { setQuality(q); genPrefs.quality = q },
                type: 'button',
              }, q.toUpperCase())),
            ),
          ),
          h('div', { className: 'snx-gen-ff tiny2' },
            h('div', { className: 'lb' },
              h('span', { className: 'ti' }, '⊞'),
              h('span', null, '张数'),
            ),
            h('div', { className: 'snx-gen-stepper' },
              h('button', { type: 'button', onClick: () => setCount(Math.max(1, count - 1)), disabled: count <= 1 }, '−'),
              h('span', null, count),
              h('button', { type: 'button', onClick: () => setCount(Math.min(8, count + 1)), disabled: count >= 8 }, '+'),
            ),
          ),
        ),
        // ── 生成按钮 ──
        h('button', {
          className: 'snx-gen-go' + (busy ? ' busy' : '') + (!prompt.trim() ? ' disabled' : ''),
          onClick: gen,
          disabled: busy || !prompt.trim(),
          type: 'button',
        },
          h('span', { className: 'ti' }, busy ? '⏳' : '✦'),
          h('span', null, busy ? '生成中…' : (anchor ? '生成 i2i' : '生成到画布')),
        ),
        err ? h('div', { className: 'snx-gen-err' }, err) : null,
      )
    }

    // ── 最近画廊（横排缩略图）──
    function GenRecent({ store, selId, setSelId, onOpen, onOpenLightbox }) {
      const nodes = store.doc.nodes.slice().reverse().slice(0, 12)
      if (nodes.length === 0) {
        return h('div', { className: 'snx-gen-recent' },
          h('div', { className: 'lb' },
            h('span', { className: 'ti' }, '🖼'),
            h('span', null, '最近生成'),
            h('div', { style: { flex: 1 } }),
            h('span', { className: 'h' }, '还没有'),
          ),
          h('div', { className: 'snx-gen-recent-empty' },
            '生成出来的图会按时间倒序排在下面。点击图→「画布编辑」或「⛶ 大图」'),
        )
      }
      return h('div', { className: 'snx-gen-recent' },
        h('div', { className: 'lb' },
          h('span', { className: 'ti' }, '🖼'),
          h('span', null, `最近 ${nodes.length}`),
          h('div', { style: { flex: 1 } }),
          store.doc.nodes.length > nodes.length ? h('button', {
            className: 'snx-gen-more', type: 'button', onClick: onOpen,
          }, '查看全部 →') : null,
        ),
        h('div', { className: 'snx-gen-thumbs' },
          nodes.map((n) => h('button', {
            key: n.id,
            className: 'snx-gen-thumb' + (selId === n.id ? ' on' : ''),
            onClick: () => {
              setSelId(n.id)
              store.sel = new Set([n.id])
            },
            onDoubleClick: () => onOpenLightbox && onOpenLightbox(n),
            onContextMenu: (e) => { e.preventDefault(); onOpenLightbox && onOpenLightbox(n) },
            title: (n.prompt || '') + '（双击或右键看大图）',
            type: 'button',
          },
            h('img', { src: n.src, alt: '', loading: 'lazy' }),
          )),
        ),
      )
    }

    // ── 画廊单项 ──
    function GalleryItem({ node, onOpen, onOpenLightbox }) {
      const ts = node.ts ? new Date(node.ts) : null
      const date = ts ? `${ts.getMonth() + 1}/${ts.getDate()} ${String(ts.getHours()).padStart(2, '0')}:${String(ts.getMinutes()).padStart(2, '0')}` : ''
      return h('div', {
        className: 'snx-gal-item' + (node.favorite ? ' fav' : ''),
        onClick: onOpenLightbox || onOpen,
        title: (node.prompt || '') + '（点击看大图）',
      },
        h('div', { className: 'snx-gal-item-img' },
          h('img', { src: node.src, alt: '', loading: 'lazy' }),
          // v8：收藏角标
          node.favorite ? h('span', { className: 'snx-gal-item-fav' }, '★') : null,
          // v8：标签
          node.tags && node.tags.length ? h('div', { className: 'snx-gal-item-tags' },
            node.tags.slice(0, 3).map((t) => h('span', { key: t, className: 'snx-gal-item-tag' }, '#' + t)),
          ) : null,
        ),
        h('div', { className: 'snx-gal-item-meta' },
          h('div', { className: 'snx-gal-item-pr' }, (node.prompt || '—').replace(/^💬\s*/, '').slice(0, 64)),
          h('div', { className: 'snx-gal-item-sub' },
            node.w && node.h ? `${node.w}×${node.h}` : '',
            date ? ' · ' + date : '',
          ),
        ),
      )
    }

    // ── 队列单项 ──
    // ── v8.1：dsh-better-sidebar 文件预览器（接管 png/jpg/webp）──
    function ImagePreview({ path, src }) {
      const [scale, setScale] = useState(1)
      const [loading, setLoading] = useState(true)
      const [err, setErr] = useState('')
      const [info, setInfo] = useState(null)   // {w, h, size}
      useEffect(() => {
        setScale(1); setLoading(true); setErr(''); setInfo(null)
        const im = new Image()
        im.onload = () => {
          setLoading(false)
          // 计算适合容器的初始缩放
          const wrap = document.querySelector('.snx-bsb-preview')
          if (wrap) {
            const pad = 40
            const sw = wrap.clientWidth - pad
            const sh = wrap.clientHeight - pad
            const s = Math.min(1, sw / im.naturalWidth, sh / im.naturalHeight)
            setScale(s)
          }
          setInfo({ w: im.naturalWidth, h: im.naturalHeight })
        }
        im.onerror = () => { setLoading(false); setErr('图片加载失败：' + (src || path)) }
        im.src = src || path
      }, [src, path])
      const download = () => {
        const a = document.createElement('a')
        a.href = src || path
        a.download = (path || 'image').replace(/.*\//, '')
        a.click()
      }
      return h('div', { className: 'snx-bsb-preview' },
        h('div', { className: 'snx-bsb-toolbar' },
          h('span', { className: 'snx-bsb-path' }, path || src || ''),
          h('div', { style: { flex: 1 } }),
          info ? h('span', { className: 'snx-bsb-info' }, `${info.w}×${info.h}`) : null,
          h('button', { type: 'button', onClick: () => setScale(Math.max(0.05, scale * 0.8)) }, '−'),
          h('span', { className: 'snx-bsb-pct' }, Math.round(scale * 100) + '%'),
          h('button', { type: 'button', onClick: () => setScale(Math.min(8, scale * 1.25)) }, '+'),
          h('button', { type: 'button', onClick: () => setScale(1) }, '1:1'),
          h('button', { type: 'button', onClick: () => fit() }, '⛶ 适应'),
          h('button', { type: 'button', onClick: download, className: 'snx-bsb-dl' }, '⬇ 下载'),
        ),
        loading ? h('div', { className: 'snx-bsb-load' }, h('div', { className: 'spin' }), '加载中…') :
        err ? h('div', { className: 'snx-bsb-err' }, err) :
        h('div', { className: 'snx-bsb-canvas',
            onWheel: (e) => {
              e.preventDefault()
              setScale((s) => Math.max(0.05, Math.min(8, s * (e.deltaY > 0 ? 0.9 : 1.1))))
            },
          },
          h('img', {
            src: src || path,
            style: { transform: `scale(${scale})`, transformOrigin: 'center center' },
          }),
        ),
      )
      function fit() {
        const im = new Image()
        im.onload = () => {
          const wrap = document.querySelector('.snx-bsb-preview')
          if (!wrap) return
          const pad = 40
          setScale(Math.min(1, (wrap.clientWidth - pad) / im.naturalWidth, (wrap.clientHeight - pad) / im.naturalHeight))
        }
        im.src = src || path
      }
    }

    // ── v8：快捷键速查 overlay ──
    function HelpOverlay({ onClose }) {
      useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [onClose])
      const groups = [
        { title: '⚡ 生成', items: [
          ['⌘ / Ctrl + Enter', '生图'],
          ['⭐ (星标)', '收藏/取消收藏当前提示词'],
          ['🖼 + 按钮', '添加多参考图（风格/角色/构图）'],
        ] },
        { title: '🖼 画布编辑', items: [
          ['滚轮', '缩放'],
          ['Space + 拖动', '平移画布'],
          ['F', '适应画面'],
          ['Del', '删除选中节点'],
          ['Ctrl + V', '粘贴图片为节点'],
          ['双击节点', '打开 lightbox'],
          ['右键节点', '上下文菜单（重绘/扩图/复制/删除）'],
        ] },
        { title: '🖌 重绘模式', items: [
          ['涂抹', '标记要修改的区域'],
          ['大小滑块', '笔刷直径 8~200px'],
          ['不透明滑块', '标注透明度'],
          ['硬度滑块', '中心实色程度'],
          ['羽化滑块', '边缘虚化程度'],
        ] },
        { title: '🔍 lightbox / 全屏画布', items: [
          ['Esc', '关闭'],
          ['+ / −', '缩放'],
          ['0', '实际尺寸 1:1'],
          ['F', '适应窗口'],
          ['?', '打开本速查'],
        ] },
      ]
      return h('div', { className: 'snx-help-bg', onClick: onClose },
        h('div', { className: 'snx-help', onClick: (e) => e.stopPropagation() },
          h('div', { className: 'snx-help-top' },
            h('span', { className: 'ti' }, '⌨️'),
            h('span', null, '快捷键速查'),
            h('div', { style: { flex: 1 } }),
            h('span', { className: 'h' }, '按 ? 关闭 · Esc 退出'),
            h('button', { type: 'button', className: 'snx-help-x', onClick: onClose }, '✕'),
          ),
          h('div', { className: 'snx-help-body' },
            groups.map((g) => h('div', { key: g.title, className: 'snx-help-g' },
              h('div', { className: 'snx-help-gh' }, g.title),
              g.items.map((it, i) => h('div', { key: i, className: 'snx-help-row' },
                h('kbd', null, it[0]),
                h('span', null, it[1]),
              )),
            )),
          ),
          h('div', { className: 'snx-help-foot' },
            'SenseNova 生图工作台 · v8',
          ),
        ),
      )
    }

    // ── 队列单项 ──
    function QueueItem({ node, onCancel, onOpen, onRetry }) {
      const st = node.status
      // 运行中每秒自更新，让 elapsed 秒数跳动（否则渲染时算一次、刷新前冻结）
      const [, tickT] = useState(0)
      useEffect(() => {
        if (st !== 'running') return
        const t = setInterval(() => tickT((x) => x + 1), 1000)
        return () => clearInterval(t)
      }, [st])
      const elapsed = node.ts ? Math.floor((Date.now() - node.ts) / 1000) : null
      const cls = 'snx-qi snx-qi-' + st
      const meta = node.params || {}
      return h('div', { className: cls, onClick: st === 'done' ? onOpen : undefined },
        h('div', { className: 'snx-qi-img' },
          st === 'done' ? h('img', { src: node.src, alt: '' }) :
          st === 'error' ? h('span', { className: 'snx-qi-err-ico' }, '⚠') :
          h('div', { className: 'snx-qi-spin' },
            h('div', { className: 'spin' }),
            st === 'running' ? h('span', null, elapsed != null ? elapsed + 's' : '…') : h('span', null, '排队')),
        ),
        h('div', { className: 'snx-qi-body' },
          h('div', { className: 'snx-qi-pr' }, (node.prompt || '—').replace(/^💬\s*/, '').slice(0, 80)),
          h('div', { className: 'snx-qi-meta' },
            h('span', { className: 'snx-qi-st' }, st),
            meta.model ? h('span', null, ' · ' + meta.model) : null,
            meta.size ? h('span', null, ' · ' + meta.size) : null,
            node.errMsg ? h('span', { className: 'snx-qi-err-msg' }, ' · ' + node.errMsg.slice(0, 60)) : null,
          ),
        ),
        h('div', { className: 'snx-qi-acts' },
          st === 'done' ? h('button', { className: 'snx-qi-act', onClick: onOpen, type: 'button' }, '⛶') : null,
          (st === 'pending' || st === 'running') ? h('button', {
            className: 'snx-qi-act danger',
            onClick: (e) => { e.stopPropagation(); onCancel() },
            type: 'button',
            title: '取消',
          }, '✕') : null,
          st === 'error' ? h('button', {
            className: 'snx-qi-act',
            onClick: (e) => { e.stopPropagation(); onRetry() },
            type: 'button',
            title: '重试',
          }, '↻') : null,
        ),
      )
    }

    // ── 对比：2 张 overlay slider ──
    function ComparePair({ a, b }) {
      const [pos, setPos] = useState(50)
      return h('div', { className: 'snx-cmp-pair' },
        h('div', { className: 'snx-cmp-stage' },
          h('img', { className: 'snx-cmp-base', src: a.src, alt: 'A' }),
          h('div', { className: 'snx-cmp-clip', style: { width: pos + '%' } },
            h('img', { src: b.src, alt: 'B' }),
          ),
          h('div', {
            className: 'snx-cmp-handle',
            style: { left: pos + '%' },
            onMouseDown: startDrag,
            onTouchStart: startDrag,
          },
            h('div', { className: 'snx-cmp-handle-bar' }),
            h('div', { className: 'snx-cmp-handle-knob' }, '⇄'),
          ),
          h('div', { className: 'snx-cmp-tag l' }, 'A'),
          h('div', { className: 'snx-cmp-tag r' }, 'B'),
        ),
        h('div', { className: 'snx-cmp-info' },
          h('div', { className: 'snx-cmp-info-c' },
            h('div', { className: 'lb' }, 'A · 底'),
            h('div', { className: 'pr' }, (a.prompt || '').replace(/^💬\s*/, '').slice(0, 80)),
          ),
          h('div', { className: 'snx-cmp-info-c' },
            h('div', { className: 'lb' }, 'B · 上'),
            h('div', { className: 'pr' }, (b.prompt || '').replace(/^💬\s*/, '').slice(0, 80)),
          ),
        ),
      )
      function startDrag(e) {
        e.preventDefault()
        const stage = e.currentTarget.parentElement
        const onMove = (ev) => {
          const rect = stage.getBoundingClientRect()
          const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX
          const p = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100))
          setPos(p)
        }
        const onUp = () => {
          window.removeEventListener('mousemove', onMove)
          window.removeEventListener('mouseup', onUp)
          window.removeEventListener('touchmove', onMove)
          window.removeEventListener('touchend', onUp)
        }
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
        window.addEventListener('touchmove', onMove)
        window.addEventListener('touchend', onUp)
      }
    }

    // ── 对比：3-4 张网格 + 单击设大图 ──
    function CompareGrid({ items }) {
      const [focus, setFocus] = useState(items[0] && items[0].id)
      const big = items.find((n) => n.id === focus) || items[0]
      return h('div', { className: 'snx-cmp-grid' },
        h('div', { className: 'snx-cmp-grid-big' },
          h('img', { src: big.src, alt: '' }),
          h('div', { className: 'snx-cmp-tag l' }, big.id.slice(0, 6)),
          h('div', { className: 'snx-cmp-grid-big-pr' }, (big.prompt || '').replace(/^💬\s*/, '').slice(0, 80)),
        ),
        h('div', {
          className: 'snx-cmp-grid-row cols-' + Math.min(items.length, 4),
        },
          items.map((n) => h('button', {
            key: n.id,
            className: 'snx-cmp-grid-cell' + (n.id === focus ? ' on' : ''),
            onClick: () => setFocus(n.id),
            type: 'button',
          },
            h('img', { src: n.src, alt: '' }),
            h('span', { className: 'snx-cmp-grid-cell-tag' }, n.id.slice(0, 4)),
          )),
        ),
      )
    }

    // ── Lightbox 全屏预览组件 ──
    function Lightbox({ node, onClose, notify, onUseAsAnchor, onEdit, onDownload, onCopyParams, onRestoreParams, onDelete, onUpscale, onAdjust, onExport, onToggleFavorite, onOpenVersion }) {
      const [scale, setScale] = useState(1)
      // v8：调整（亮度/对比/饱和），实时预览
      const [adjB, setAdjB] = useState((node && node.filters && node.filters.brightness) || 0)
      const [adjC, setAdjC] = useState((node && node.filters && node.filters.contrast) || 0)
      const [adjS, setAdjS] = useState((node && node.filters && node.filters.saturation) || 0)
      const [exportOpen, setExportOpen] = useState(false)
      const [exportFmt, setExportFmt] = useState('png')
      const [exportQuality, setExportQuality] = useState(92)
      const [exportMeta, setExportMeta] = useState(true)
      useEffect(() => {
        const onKey = (e) => {
          if (e.key === 'Escape') onClose()
          else if (e.key === '+' || e.key === '=') setScale((s) => Math.min(4, s * 1.25))
          else if (e.key === '-') setScale((s) => Math.max(0.25, s / 1.25))
          else if (e.key === '0') setScale(1)
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [onClose])
      // 应用调整 → 异步 canvas 重绘
      const [adjustedSrc, setAdjustedSrc] = useState(node && node.src)
      useEffect(() => {
        let cancelled = false
        if (!adjB && !adjC && !adjS) { setAdjustedSrc(node && node.src); return }
        applyFiltersAsync(node && node.src, adjB, adjC, adjS).then((s) => { if (!cancelled) setAdjustedSrc(s) })
        return () => { cancelled = true }
      }, [node && node.src, adjB, adjC, adjS])
      const ts = node && node.ts ? new Date(node.ts) : null
      const date = ts ? `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, '0')}-${String(ts.getDate()).padStart(2, '0')} ${String(ts.getHours()).padStart(2, '0')}:${String(ts.getMinutes()).padStart(2, '0')}:${String(ts.getSeconds()).padStart(2, '0')}` : ''
      const params = node && node.params ? node.params : {}
      // v8：版本历史（parent / children / siblings）
      const tree = useMemo(() => buildVersionTree(node, store), [node, store.doc.nodes.length])
      // v8：fav 状态
      const fav = node && node.favorite
      // v8：导出（canvas 下载）
      const doExport = async () => {
        const blob = await imageToBlob(adjustedSrc, exportFmt, exportQuality, exportMeta ? node : null)
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = (node && node.id || 'snx') + '.' + exportFmt
        a.click(); URL.revokeObjectURL(url)
        setExportOpen(false)
        notify && notify('✓ 已导出 ' + a.download)
      }
      return h('div', { className: 'snx-lb-backdrop', onClick: onClose },
        h('div', { className: 'snx-lb', onClick: (e) => e.stopPropagation() },
          // 顶栏
          h('div', { className: 'snx-lb-top' },
            h('div', { className: 'snx-lb-info' },
              h('span', { className: 'snx-lb-id' }, node && node.id ? node.id.slice(0, 8) : ''),
              h('span', { className: 'snx-lb-time' }, date),
              h('button', {
                type: 'button',
                className: 'snx-lb-fav' + (fav ? ' on' : ''),
                onClick: () => onToggleFavorite && onToggleFavorite(node),
                title: fav ? '取消收藏' : '收藏到画廊',
              }, fav ? '★' : '☆'),
            ),
            h('div', { style: { flex: 1 } }),
            // v8：放大按钮
            h('button', { type: 'button', className: 'snx-lb-up', onClick: () => onUpscale && onUpscale(node, 2), title: '2x 放大重生成' }, '🔍 2x'),
            h('button', { type: 'button', className: 'snx-lb-up', onClick: () => onUpscale && onUpscale(node, 4), title: '4x 放大重生成' }, '🔍 4x'),
            h('div', { className: 'snx-lb-zoom' },
              h('button', { type: 'button', onClick: () => setScale((s) => Math.max(0.25, s / 1.25)), title: '缩小 (-)' }, '−'),
              h('span', null, Math.round(scale * 100) + '%'),
              h('button', { type: 'button', onClick: () => setScale((s) => Math.min(4, s * 1.25)), title: '放大 (+)' }, '+'),
              h('button', { type: 'button', onClick: () => setScale(1), title: '实际尺寸 (0)' }, '1:1'),
            ),
            h('button', { className: 'snx-lb-close', type: 'button', onClick: onClose, title: '关闭 (Esc)' }, '✕'),
          ),
          // v8：3 栏布局 - 左版本树 / 中图 / 右调整+导出
          h('div', { className: 'snx-lb-body' },
            // 左：版本树
            tree ? h('aside', { className: 'snx-lb-tree' },
              h('div', { className: 'snx-lb-tree-h' }, '🌳 衍生链'),
              h(VersionTree, { tree, currentId: node && node.id, onSelect: onOpenVersion }),
            ) : null,
            // 中：图片
            h('div', { className: 'snx-lb-stage' },
              h('div', { className: 'snx-lb-imgwrap', style: { transform: 'scale(' + scale + ')' } },
                h('img', { src: adjustedSrc, alt: '', className: 'snx-lb-img' }),
              ),
              // v8：调整滑块（浮在图上）
              h('div', { className: 'snx-lb-adj' },
                h('div', { className: 'snx-lb-adj-h' },
                  h('span', null, '🎛 调整'),
                  h('div', { style: { flex: 1 } }),
                  (adjB || adjC || adjS) ? h('button', {
                    type: 'button', className: 'snx-lb-adj-rst',
                    onClick: () => { setAdjB(0); setAdjC(0); setAdjS(0) },
                  }, '↺ 重置') : null,
                  h('button', {
                    type: 'button', className: 'snx-lb-adj-save',
                    onClick: () => onAdjust && onAdjust(node, { brightness: adjB, contrast: adjC, saturation: adjS }),
                    disabled: !adjB && !adjC && !adjS,
                  }, '💾 应用'),
                ),
                h('label', null, h('span', null, '亮度'), h('input', { type: 'range', min: -100, max: 100, value: adjB, onChange: (e) => setAdjB(parseInt(e.target.value, 10)) }), h('span', { className: 'v' }, adjB)),
                h('label', null, h('span', null, '对比'), h('input', { type: 'range', min: -100, max: 100, value: adjC, onChange: (e) => setAdjC(parseInt(e.target.value, 10)) }), h('span', { className: 'v' }, adjC)),
                h('label', null, h('span', null, '饱和'), h('input', { type: 'range', min: -100, max: 100, value: adjS, onChange: (e) => setAdjS(parseInt(e.target.value, 10)) }), h('span', { className: 'v' }, adjS)),
              ),
            ),
            // 右：详情
            h('aside', { className: 'snx-lb-side' },
              h('div', { className: 'snx-lb-meta' },
                h('div', { className: 'snx-lb-pr' },
                  h('div', { className: 'lb' }, '提示词'),
                  h('div', { className: 'val' }, (node && node.prompt || '—').replace(/^💬\s*/, '')),
                ),
                h('div', { className: 'snx-lb-params' },
                  h('div', null, h('span', { className: 'k' }, '模型'), h('span', { className: 'v' }, params.model || '—')),
                  h('div', null, h('span', { className: 'k' }, '尺寸'), h('span', { className: 'v' }, params.size || ((node && node.w) + '×' + (node && node.h)) || '—')),
                  params.seed !== undefined ? h('div', null, h('span', { className: 'k' }, '种子'), h('span', { className: 'v' }, String(params.seed))) : null,
                  node && node.parentId ? h('div', null, h('span', { className: 'k' }, '衍生自'), h('span', { className: 'v' }, node.parentId.slice(0, 8))) : null,
                  params.refs && params.refs.length ? h('div', null, h('span', { className: 'k' }, '参考'), h('span', { className: 'v' }, params.refs.length + ' 张')) : null,
                  node && node.params && node.params.fromChat ? h('div', null, h('span', { className: 'k' }, '来源'), h('span', { className: 'v' }, '聊天生成')) : null,
                ),
              ),
              h('div', { className: 'snx-lb-acts' },
                h('button', { className: 'snx-lb-act go', type: 'button', onClick: onUseAsAnchor }, '🎨 作为参考图'),
                h('button', { className: 'snx-lb-act', type: 'button', onClick: onEdit }, '✏️ 画布编辑'),
                h('button', { className: 'snx-lb-act', type: 'button', onClick: onCopyParams }, '📋 复制参数'),
                h('button', {
                  className: 'snx-lb-act', type: 'button', title: '把这张图的提示词与全部生成参数回填到生图表单',
                  onClick: () => onRestoreParams && onRestoreParams(node),
                }, '⤵ 回填参数'),
                h('button', { className: 'snx-lb-act', type: 'button', onClick: onDownload }, '⬇ 原始下载'),
                h('button', { className: 'snx-lb-act', type: 'button', onClick: () => setExportOpen(!exportOpen) }, '📦 导出…'),
                h('button', { className: 'snx-lb-act danger', type: 'button', onClick: onDelete }, '🗑 删除'),
              ),
              // v8：导出面板
              exportOpen ? h('div', { className: 'snx-lb-export' },
                h('div', { className: 'lb' }, '📦 导出设置'),
                h('label', null, h('span', null, '格式'),
                  h('select', { value: exportFmt, onChange: (e) => setExportFmt(e.target.value) },
                    h('option', { value: 'png' }, 'PNG（无损）'),
                    h('option', { value: 'jpg' }, 'JPG（压缩）'),
                    h('option', { value: 'webp' }, 'WebP（推荐）'),
                  ),
                ),
                exportFmt !== 'png' ? h('label', null, h('span', null, '质量'),
                  h('input', { type: 'range', min: 50, max: 100, value: exportQuality, onChange: (e) => setExportQuality(parseInt(e.target.value, 10)) }),
                  h('span', { className: 'v' }, exportQuality + '%'),
                ) : null,
                exportFmt === 'png' ? h('label', { className: 'snx-lb-export-chk' },
                  h('input', { type: 'checkbox', checked: exportMeta, onChange: (e) => setExportMeta(e.target.checked) }),
                  h('span', null, '嵌入元数据（提示词/参数到 PNG tEXt）'),
                ) : null,
                h('div', { className: 'snx-lb-export-acts' },
                  h('button', { type: 'button', className: 'snx-lb-act go', onClick: doExport }, '✓ 导出'),
                  h('button', {
                    type: 'button', className: 'snx-lb-act', title: '复制 PNG 到系统剪贴板（可粘贴到聊天/图像软件）',
                    onClick: async () => {
                      try {
                        if (!navigator.clipboard || !window.ClipboardItem) throw new Error('此浏览器不支持图像剪贴板')
                        const blob = await imageToBlob(node && node.src, 'png', 92, null)
                        await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })])
                        notify && notify('✓ 图像已复制到剪贴板')
                      } catch (e) { notify && notify('✗ 复制失败：' + String((e && e.message) || e)) }
                    },
                  }, '📋 复制图像'),
                  h('button', { type: 'button', className: 'snx-lb-act', onClick: () => setExportOpen(false) }, '取消'),
                ),
              ) : null,
            ),
          ),
        ),
      )
    }

    // ——— v8：版本树构建 ———
    function buildVersionTree(node, store) {
      if (!node) return null
      // 找根：追溯 parentId（visited 集合防文档数据成环 A↔B 时死循环，自引用同样被挡）
      let root = node
      const seen = new Set()
      while (root.parentId && !seen.has(root.id)) {
        seen.add(root.id)
        const p = store.node(root.parentId)
        if (!p) break
        root = p
      }
      // DFS 构建树（visited 防环：损坏数据成环时剪断回边，不再无限递归/渲染挂死）
      const visited = new Set()
      const build = (n, depth) => {
        visited.add(n.id)
        const children = store.doc.nodes
          .filter((c) => c.parentId === n.id && !visited.has(c.id))
          .map((c) => build(c, depth + 1))
        return { node: n, children, depth }
      }
      return build(root, 0)
    }

    // ——— v8：版本树渲染（递归）———
    function VersionTree({ tree, currentId, onSelect }) {
      const renderNode = (t) => h('div', { key: t.node.id, className: 'snx-tree-node' + (t.node.id === currentId ? ' on' : '') },
        h('button', {
          type: 'button', className: 'snx-tree-row', style: { paddingLeft: 8 + t.depth * 12 + 'px' },
          onClick: () => onSelect && onSelect(t.node),
        },
          h('div', { className: 'snx-tree-thumb' },
            t.node.src ? h('img', { src: t.node.src, alt: '', loading: 'lazy' }) : h('span', null, '∅'),
          ),
          h('div', { className: 'snx-tree-info' },
            h('div', { className: 'pr' }, (t.node.prompt || '—').slice(0, 32)),
            h('div', { className: 'sub' },
              t.node.id === currentId ? h('span', { className: 'snx-tree-curr' }, '当前') : null,
              t.node.status !== 'done' ? h('span', null, t.node.status) : null,
            ),
          ),
          t.children.length ? h('span', { className: 'snx-tree-cnt' }, t.children.length) : null,
        ),
        t.children.length ? h('div', { className: 'snx-tree-children' }, t.children.map(renderNode)) : null,
      )
      return h('div', { className: 'snx-tree' }, renderNode(tree))
    }

    // ——— v8：图片滤镜（亮度/对比/饱和）实时预览 ———
    // 异步版：lightbox 里实时显示 + 「应用」按钮 → 真出图
    function applyFiltersAsync(src, b, c, s) {
      return new Promise((resolve) => {
        if (!src || (!b && !c && !s)) { resolve(src); return }
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => {
          try {
            const cv = document.createElement('canvas')
            cv.width = img.naturalWidth; cv.height = img.naturalHeight
            const cx = cv.getContext('2d')
            cx.drawImage(img, 0, 0)
            const data = cx.getImageData(0, 0, cv.width, cv.height)
            const px = data.data
            // brightness: 加法；contrast: 缩放；saturation: 与灰度插值
            const bright = b / 100
            const contr = (c / 100 + 1)  // 0~2
            const sat = (s / 100 + 1)   // 0~2
            for (let i = 0; i < px.length; i += 4) {
              let r = px[i], g = px[i + 1], bl = px[i + 2]
              // brightness
              r += bright * 255; g += bright * 255; bl += bright * 255
              // contrast (around 128)
              r = (r - 128) * contr + 128
              g = (g - 128) * contr + 128
              bl = (bl - 128) * contr + 128
              // saturation (around gray = 0.299*r + 0.587*g + 0.114*bl)
              const gray = 0.299 * r + 0.587 * g + 0.114 * bl
              r = gray + (r - gray) * sat
              g = gray + (g - gray) * sat
              bl = gray + (bl - gray) * sat
              px[i] = Math.max(0, Math.min(255, r))
              px[i + 1] = Math.max(0, Math.min(255, g))
              px[i + 2] = Math.max(0, Math.min(255, bl))
            }
            cx.putImageData(data, 0, 0)
            resolve(cv.toDataURL('image/png'))
          } catch (e) { resolve(src) }
        }
        img.onerror = () => resolve(src)
        img.src = src
      })
    }

    // ——— v8：导出工具 ———
    async function imageToBlob(src, fmt, quality, meta) {
      const img = await new Promise((res, rej) => {
        const im = new Image(); im.crossOrigin = 'anonymous'
        im.onload = () => res(im); im.onerror = rej; im.src = src
      })
      const cv = document.createElement('canvas')
      cv.width = img.naturalWidth; cv.height = img.naturalHeight
      const cx = cv.getContext('2d')
      cx.drawImage(img, 0, 0)
      // PNG 元数据：meta 时把 prompt / params 写到 PNG iTXt / tEXt（简化：直接进 dataURL → 用 png-chunks 库）
      const mime = fmt === 'jpg' ? 'image/jpeg' : fmt === 'webp' ? 'image/webp' : 'image/png'
      const dataUrl = cv.toDataURL(mime, quality / 100)
      if (fmt === 'png' && meta && meta.prompt) {
        // 简化：用 fetch + 拼装 tEXt 块
        try {
          const buf = await (await fetch(dataUrl)).arrayBuffer()
          const bytes = new Uint8Array(buf)
          // 在 IDAT 之前插入 tEXt 块
          const txt = `${meta.prompt.slice(0, 500)} | model=${meta.params?.model || ''} | size=${meta.params?.size || ''} | seed=${meta.params?.seed ?? ''}`
          const textBytes = new TextEncoder().encode(txt)
          const len = textBytes.length
          const chunk = new Uint8Array(4 + 4 + len + 4)  // length(4) + type(4) + data + crc(4)
          const dv = new DataView(chunk.buffer)
          dv.setUint32(0, len)
          chunk[4] = 0x74; chunk[5] = 0x45; chunk[6] = 0x58; chunk[7] = 0x74  // tEXt
          // tEXt 格式：keyword\0text
          const k = new TextEncoder().encode('sensenova')
          const full = new Uint8Array(k.length + 1 + textBytes.length)
          full.set(k, 0); full[k.length] = 0; full.set(textBytes, k.length + 1)
          // 重新构造
          const realChunk = new Uint8Array(4 + 4 + full.length + 4)
          const dv2 = new DataView(realChunk.buffer)
          dv2.setUint32(0, full.length)
          realChunk[4] = 0x74; realChunk[5] = 0x45; realChunk[6] = 0x58; realChunk[7] = 0x74
          realChunk.set(full, 8)
          // CRC
          const crcVal = crc32(realChunk.subarray(4, 8 + full.length))
          dv2.setUint32(8 + full.length, crcVal >>> 0)
          // 找到 IHDR 后插入（PNG header 8B + IHDR chunk 25B）
          const out = new Uint8Array(bytes.length + realChunk.length)
          out.set(bytes.subarray(0, 33), 0)
          out.set(realChunk, 33)
          out.set(bytes.subarray(33), 33 + realChunk.length)
          return new Blob([out], { type: mime })
        } catch { return await (await fetch(dataUrl)).blob() }
      }
      return await (await fetch(dataUrl)).blob()
    }
    // ——— 整画布导出：全部可见 done 图按文档布局合成一张 PNG（2x 超采样）———
    async function exportCanvasPng() {
      const nodes = store.doc.nodes.filter((n) => n.status === 'done' && n.src && !n.hidden)
      if (!nodes.length) throw new Error('画布上没有可导出的图片（隐藏图不计入）')
      const x0 = Math.min(...nodes.map((n) => n.x))
      const y0 = Math.min(...nodes.map((n) => n.y))
      const x1 = Math.max(...nodes.map((n) => n.x + n.w))
      const y1 = Math.max(...nodes.map((n) => n.y + n.h))
      const scale = 2
      const cv = document.createElement('canvas')
      cv.width = Math.ceil((x1 - x0) * scale); cv.height = Math.ceil((y1 - y0) * scale)
      const cx = cv.getContext('2d')
      cx.fillStyle = snxTheme().surface   // 底色跟随主题（与画布观感一致）
      cx.fillRect(0, 0, cv.width, cv.height)
      for (const n of nodes) {   // z 序 = 文档顺序
        const im = await loadImg(n.src)
        cx.drawImage(im, Math.round((n.x - x0) * scale), Math.round((n.y - y0) * scale), Math.round(n.w * scale), Math.round(n.h * scale))
      }
      return { url: cv.toDataURL('image/png'), w: cv.width, h: cv.height, count: nodes.length }
    }
    // CRC32（PNG tEXt 用）
    const _crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c } return t })()
    function crc32(buf) { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = _crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0 }

    // ——— 设置卡片（插件配置页，v4.1：模型下拉 + 描述 + 测试连接）———
    const MODEL_PRESETS = [
      { id: '__keep__', label: '— 保留当前 —', desc: '不修改此项（保存时不发送）' },
      { id: 'sensenova-u1.5-lite', label: 'sensenova-u1.5-lite（当前可用·文生图/图生图）', desc: '2026-10 实测 /v1/models 可见；走 images/generations。旧的 u1-fast 已下线。' },
      { id: 'sensenova-u1.5', label: 'sensenova-u1.5（U1.5 多模态，已开通时）', desc: '走 chat/completions，支持图像编辑/增强/扩图（画布"增强"入口专用）。' },
      { id: '__custom__', label: '自定义…', desc: '手动填入控制台模型广场实际可见的 id。' },
    ]
    function ConfigCard() {
      const [apiKey, setApiKey] = useState('')
      const [showKey, setShowKey] = useState(false)
      const [baseUrl, setBaseUrl] = useState('')
      const [model, setModel] = useState('')
      const [modelPreset, setModelPreset] = useState('__keep__')
      const [msg, setMsg] = useState('')
      const [testMsg, setTestMsg] = useState('')
      const [testing, setTesting] = useState(false)
      const [presetsInited, setPresetsInited] = useState(false)
      useEffect(() => {
        get(CONFIG_ROUTE).then((r) => {
          const m = (r.config && r.config.model) || ''
          const b = (r.config && r.config.baseUrl) || ''
          setBaseUrl(b)
          setModel(m)
          const matched = MODEL_PRESETS.find((p) => p.id === m)
          setModelPreset(matched ? matched.id : (m ? '__custom__' : '__keep__'))
          setPresetsInited(true)
        })
      }, [])
      const save = async () => {
        setMsg('保存中…'); setTestMsg('')
        const finalModel = modelPreset === '__custom__' ? model.trim()
          : modelPreset === '__keep__' ? '' : modelPreset
        const payload = { apiKey: apiKey.trim(), baseUrl: baseUrl.trim() }
        if (finalModel) payload.model = finalModel
        const r = await post(CONFIG_ROUTE, payload)
        setMsg(r.ok ? '✓ 已保存（立即生效）' : '✗ 保存失败：' + (r.error || '未知错误'))
      }
      const test = async () => {
        setTesting(true); setTestMsg('测试中…')
        try {
          try {
            // 先查 GET /api/sensenova/status：keyConfigured=false 直接给结论，不空打上游
            const st = await get(STATUS_ROUTE)
            if (st && st.ok && st.keyConfigured === false) {
              setTestMsg('✗ 未检测到 API Key（keyConfigured=false）：上方填 Key 并「保存设置」，或设 SENSENOVA_API_KEY 环境变量后重试')
              return
            }
            const r = await post('/api/sensenova/test', {})
            if (r.ok) {
              const ms = Array.isArray(r.models) && r.models.length
                ? `（共 ${r.models.length} 个模型可见：${r.models.slice(0, 6).join(', ')}${r.models.length > 6 ? '…' : ''}）`
                : ''
              setTestMsg('✓ 连接成功 · Key 已配置 ' + ms)
            } else {
              setTestMsg('✗ ' + (r.error || '连接失败'))
            }
          } catch (e) {
            setTestMsg('✗ ' + (e instanceof Error ? e.message : String(e)))
          }
        } finally {
          setTesting(false)   // 任何分支（含 keyConfigured=false 的 early-return）都要解锁按钮
        }
      }
      const presetDesc = (MODEL_PRESETS.find((p) => p.id === modelPreset) || {}).desc || ''
      return h('div', { className: 'snx-cfg', style: { maxWidth: '640px' } },
        // ——— API Key ———
        h('div', { className: 'snx-cfg-row' },
          h('label', { className: 'snx-cfg-lb' }, '🔑 API Key'),
          h('span', { className: 'snx-cfg-hint' }, ' 商汤 SenseNova 控制台 → API Key 管理。留空 = 不修改（保留现有/环境变量）'),
          h('div', { className: 'snx-cfg-in-wrap' },
            h('input', {
              className: 'snx-cfg-in',
              type: showKey ? 'text' : 'password',
              value: apiKey,
              onChange: (e) => setApiKey(e.target.value),
              placeholder: 'sk-...（不修改则留空）',
              autoComplete: 'off',
              spellCheck: false,
            }),
            h('button', {
              className: 'snx-cfg-eye', type: 'button',
              onClick: () => setShowKey(!showKey),
              title: showKey ? '隐藏' : '显示',
            }, showKey ? '🙈' : '👁'),
          ),
        ),
        // ——— baseUrl ———
        h('div', { className: 'snx-cfg-row' },
          h('label', { className: 'snx-cfg-lb' }, '🌐 baseUrl'),
          h('span', { className: 'snx-cfg-hint' }, ' 一般无需改。默认 https://token.sensenova.cn/v1'),
          h('input', {
            className: 'snx-cfg-in', value: baseUrl,
            onChange: (e) => setBaseUrl(e.target.value),
            spellCheck: false,
          }),
        ),
        // ——— 模型 ———
        h('div', { className: 'snx-cfg-row' },
          h('label', { className: 'snx-cfg-lb' }, '🎛️ 模型'),
          h('span', { className: 'snx-cfg-hint' }, ' 选预设或自定义。控制台「模型广场」可查实际 id。'),
          h('select', {
            className: 'snx-cfg-sel',
            value: presetsInited ? modelPreset : '__keep__',
            onChange: (e) => {
              const v = e.target.value
              setModelPreset(v)
              if (v !== '__keep__' && v !== '__custom__') setModel(v)
            },
          }, MODEL_PRESETS.map((p) => h('option', { value: p.id }, p.label))),
          modelPreset === '__custom__'
            ? h('input', {
              className: 'snx-cfg-in', style: { marginTop: '8px', fontFamily: 'var(--mono, monospace)' },
              value: model,
              onChange: (e) => setModel(e.target.value),
              placeholder: '自定义模型 id（控制台模型广场可见的实际 id）',
              spellCheck: false,
            })
            : null,
          presetDesc ? h('span', { className: 'snx-cfg-help' }, presetDesc) : null,
        ),
        // ——— 按钮组 ———
        h('div', { className: 'snx-cfg-actions' },
          h('button', { className: 'snx-cfg-go', onClick: save }, '💾 保存设置'),
          h('button', { className: 'snx-cfg-test', onClick: test, disabled: testing },
            testing ? '⏳ 测试中…' : '🔌 测试连接'),
        ),
        msg ? h('div', { className: 'snx-cfg-msg ' + (msg.startsWith('✓') ? 'ok' : 'err') }, msg) : null,
        testMsg ? h('div', { className: 'snx-cfg-msg ' + (testMsg.startsWith('✓') ? 'ok' : 'err') }, testMsg) : null,
      )
    }

    // ——— 客户端生命周期 ———
    // v4.2：把工作台作为 rightbar tab 注入到 dsh 官方右栏（dsh-client-ui-sidebar-right），
    //       跟文件浏览器 tab 并排，不再替换左侧会话栏、不挡会话列表。
    //       侧栏底部"生图"按钮调用 ctx.layout.openRightbar() 把右栏滑出。
    const SNX_TAB_KEY = 'dsh-sensenova-image'
    const SNX_TAB_KIND = 'sensenova-image'
    window.__snxDebug = { step: 'init' }

    function apply(ctx) {
      const style = document.createElement('style')
      style.textContent = css
      document.head.appendChild(style)
      initBridge(ctx)
      window.__snxDebug = { step: 'init', errs: [] }
      try {
        window.__snxDebug.step = 'apply'
        window.__snxDebug.hasLayout = !!(ctx.layout && ctx.layout.openRightbar)
        window.__snxDebug.step = 'settings-section'
        ctx.effect(() => ctx.slots.inject('settings.section', () =>
          ctx.slots.register({ name: 'settings.section', id: 'sensenova-image', order: 45, label: 'SenseNova 生图' }, ConfigCard)
        ), 'sensenova-image: settings.section')
        window.__snxDebug.step = 'rb-tab-body'
        ctx.effect(() => {
          window.__snxDebug.tabBodyFired = true
          // 1) 注册 tab 类型（让右栏能识别这个 kind，能 openTab / 显示 chip）
          ctx.sidebarRightTabs.register({
            id: SNX_TAB_KEY,
            kind: SNX_TAB_KIND,
            priority: 'plugin',
            title: () => 'SenseNova 生图',
            icon: () => h('span', { className: 'snx-rb-ico' }, '✦'),
          })
          // 2) 注册 tab body 渲染组件
          ctx.slots.inject('sidebar.right.pane.tab', () =>
            ctx.slots.register({
              name: 'sidebar.right.pane.tab',
              key: SNX_TAB_KEY,
              inject: () => ({ hooks: {} }),
            }, function WorkbenchBoundary(props) { return h(WBErrorBoundary, null, h(Workbench, props)) }))
        }, 'sensenova-image: sidebar.right.pane.tab')
        window.__snxDebug.tabBodyInject = true
        window.__snxDebug.step = 'rb-tab-title'
        ctx.effect(() => {
          window.__snxDebug.tabTitleFired = true
          ctx.slots.inject('sidebar.right.pane.tab.title', () =>
            ctx.slots.register({ name: 'sidebar.right.pane.tab.title', key: SNX_TAB_KEY },
              () => h('span', { className: 'snx-rb-title' },
                h('span', { className: 'snx-rb-ico' }, '✦'),
                'SenseNova 生图',
              )))
        }, 'sensenova-image: sidebar.right.pane.tab.title')
        window.__snxDebug.tabTitleInject = true

        // ── v8.1：dsh-better-sidebar 兼容（可选软依赖）──
        // 如果用户装了 dsh-better-sidebar，再额外注册一个原生 tab + 文件预览器，
        // 这样在 better-sidebar 的「+」菜单里也能开到工作台，文件树里点 .png/.jpg/.webp 走我的预览
        if (hasBetterSidebar(ctx)) {
          window.__snxDebug.bsbAttempted = true
          const bsb = ctx.get('betterSidebar')
          if (bsb && typeof bsb.registerTab === 'function') {
            ctx.effect(() =>
              bsb.registerTab({
                id: 'dsh-sensenova-image:workbench',
                title: () => 'SenseNova 生图',
                description: () => '商汤 U1.5 多模态生图工作台：并发队列 / 多参考图 / 画笔 / 全屏画布',
                icon: () => h('span', { className: 'snx-rb-ico' }, '✦'),
                order: 60,
                single: true,
                component: function SenseNovaWorkbench() {
                  // better-sidebar 会把组件挂到自己的容器里，复用同一份 Workbench
                  return h('div', { className: 'snx-pro', style: { containerType: 'inline-size', containerName: 'snxpro', width: '100%', height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' } },
                    h(WBErrorBoundary, null, h(Workbench, { /* 由 bsb 注入 scope */ })),
                  )
                },
                onOpen: (ctx2, scope) => {
                  try {
                    if (window.__snxNotify) window.__snxNotify('✓ 已打开 SenseNova 生图工作台')
                  } catch {}
                },
              }), 'sensenova-image: bsb.tab'
            )
          }
          if (bsb && typeof bsb.registerFileViewer === 'function') {
            // 接管 .png / .jpg / .jpeg / .webp / .gif 文件（DSH 资源协议或文件路径）
            ctx.effect(() =>
              bsb.registerFileViewer({
                id: 'dsh-sensenova-image:image',
                exts: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'],
                fetchStrategy: 'url',   // 文件树一般已返回 URL，直接用
                component: ({ path, src }) => h(ImagePreview, { path, src }),
              }), 'sensenova-image: bsb.viewer'
            )
          }
        }
        window.__snxDebug.step = 'sidebar-footer'
        ctx.effect(() => {
          const Icon = h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' },
            h('rect', { x: 3, y: 3, width: 18, height: 18, rx: 3 }),
            h('circle', { cx: 8.5, cy: 8.5, r: 1.5, fill: 'currentColor', stroke: 'none' }),
            h('path', { d: 'M21 15l-5-5L5 21' }),
          )
          ctx.slots.inject('sidebar.footer.action', () =>
            ctx.slots.register({ name: 'sidebar.footer.action', id: 'dsh-sensenova-image', order: 25 },
              () => h('button', {
                className: 'snx-sidebtn',
                title: 'SenseNova 生图工作台（在 dsh 右栏打开）',
                onClick: () => {
                  try {
                    // 1) 打开/激活 sensenova-image tab（会自动展开右栏）
                    if (ctx.sidebarRight && typeof ctx.sidebarRight.openTab === 'function') {
                      ctx.sidebarRight.openTab(SNX_TAB_KIND)
                    } else if (ctx.layout && typeof ctx.layout.openRightbar === 'function') {
                      // 退路：仅打开右栏
                      ctx.layout.openRightbar(true, false)
                    }
                  } catch (e) { console.warn('[sensenova-image] openTab failed', e) }
                },
              }, Icon, '生图')))
        }, 'sensenova-image: sidebar.footer.action')
        window.__snxDebug.step = 'tool-call-toolview'
        // 三个生图工具共用同一张卡（v9：编辑/增强工具也有卡了）
        for (const toolKey of ['sensenova_generate_image', 'sensenova_edit_image', 'sensenova_enhance_image']) {
          ctx.slots.inject('tool.call.toolview', () =>
            ctx.slots.register({ name: 'tool.call.toolview', key: toolKey, id: 'dsh-sensenova-image', order: 10 }, SnxToolCard))
        }
        // v9：回合尾投递——Turn 折叠后生成的图仍直接落在回复下方。
        // sessions/uiConversation 缺任何一个就留空座位，只损失投递不损失卡片。
        ctx.slots.inject('conversation.chat.turnTail', () =>
          ctx.slots.register({
            name: 'conversation.chat.turnTail',
            id: 'dsh-sensenova-image',
            inject: function (sessionId) {
              try {
                const binding = ctx.sessions.binding(sessionId)
                if (binding === void 0) return {}
                const chat = ctx.uiConversation.binding(binding).target('chat')
                return {
                  keyedHooks: {
                    turnMedia: function (turn) {
                      const snapshot = chat.getSnapshot()
                      if (snapshot === void 0) return []
                      return snapshot.nodes.turnDataSource(Number(turn), 'tool-call')
                    },
                  },
                }
              } catch (e) { return {} }
            },
          }, SnxMediaTail))
        window.__snxDebug.step = 'done'
      } catch (e) {
        window.__snxDebug.errs.push(String((e && e.stack) || e))
      }
    }

    module.exports.apply = apply
    module.exports.inject = inject
    return module.exports
  },
})
