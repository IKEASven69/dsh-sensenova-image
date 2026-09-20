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
 *  - 拖入/粘贴图片即成节点；模型档位（默认/u1-fast/u1.5）
 *
 * 模式沿用 deck：window.__ModuleLoader__ + slots 注入。
 */
window.__ModuleLoader__.load({
  id: 'dsh-sensenova-image',
  factory: (require) => {
    const module = { exports: {} }
    const inject = ['slots', 'sessions', 'conversation']
    const React = require('react')
    const { useState, useEffect, useRef, createElement: h } = React

    // ——— 数据访问（同源 fetch）———
    function post(url, body) {
      return fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
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
.snx-cv{position:fixed;inset:0;z-index:200;background:#0A0A10;color:#EAEAF2;display:flex;flex-direction:column;
  font-family:"Segoe UI","Microsoft YaHei",sans-serif}
.snx-cv-top{height:44px;flex-shrink:0;display:flex;align-items:center;gap:14px;padding:0 16px;
  border-bottom:1px solid #1E1E2A}
.snx-cv-top .brand{font-weight:900;font-size:14px;letter-spacing:.06em}
.snx-cv-top .brand b{color:#3EE8F0}
.snx-cv-top .key{font-size:11px;padding:2px 9px;border-radius:9px;border:1px solid #2a2a36;color:#888}
.snx-cv-top .key.ok{color:#3EE8F0;border-color:rgba(62,232,240,.4)}
.snx-cv-top .key.no{color:#FF6070;border-color:rgba(255,96,112,.4)}
.snx-cv-top .sp{flex:1}
.snx-cv-top button{background:none;border:1px solid #2a2a36;color:#999;border-radius:6px;
  padding:4px 12px;cursor:pointer;font-size:12px;font-family:inherit}
.snx-cv-top button:hover{border-color:#3EE8F0;color:#3EE8F0}
.snx-cv-main{flex:1;display:flex;min-height:0}
.snx-cv-wrap{flex:1;position:relative;overflow:hidden;background-color:#0A0A10;
  background-image:radial-gradient(rgba(255,255,255,.06) 1px,transparent 1px)}
.snx-cv-stage{position:absolute;inset:0}
.snx-cv-right{width:320px;flex-shrink:0;border-left:1px solid #1E1E2A;display:flex;flex-direction:column;min-height:0}
.snx-cv-tabs{display:flex;border-bottom:1px solid #1E1E2A;flex-shrink:0}
.snx-cv-tabs button{flex:1;background:none;border:none;color:#888;padding:10px 0;cursor:pointer;font-size:12.5px;
  border-bottom:2px solid transparent;font-family:inherit}
.snx-cv-tabs button.on{color:#3EE8F0;border-bottom-color:#3EE8F0}
.snx-cv-body{flex:1;overflow-y:auto;padding:14px}
.snx-cv-body label{display:block;font-size:11px;color:#888;margin:10px 0 4px;letter-spacing:.05em}
.snx-cv-body textarea,.snx-cv-body input,.snx-cv-body select{width:100%;box-sizing:border-box;background:#111;
  border:1px solid #2a2a36;border-radius:6px;color:#ddd;padding:8px 10px;font-size:13px;font-family:inherit;resize:vertical}
.snx-cv-body textarea{min-height:88px}
.snx-cv-body textarea:focus,.snx-cv-body input:focus,.snx-cv-body select:focus{outline:none;border-color:#3EE8F0}
.snx-cv-body .row{display:flex;gap:8px}
.snx-cv-body .row>*{flex:1;min-width:0}
.snx-cv-gen{width:100%;margin-top:14px;padding:10px;border:none;border-radius:8px;cursor:pointer;
  background:linear-gradient(135deg,#D94AE8,#793791);color:#fff;font-size:14px;font-weight:700;font-family:inherit}
.snx-cv-gen:hover:not(:disabled){filter:brightness(1.15)}
.snx-cv-gen:disabled{opacity:.5;cursor:wait}
.snx-cv-hint{font-size:11px;color:#555;margin-top:12px;line-height:1.7}
.snx-cv-zoom{position:absolute;left:14px;bottom:14px;display:flex;gap:4px;z-index:5}
.snx-cv-zoom button{width:30px;height:28px;background:rgba(22,18,30,.9);border:1px solid #2a2a36;color:#aaa;
  border-radius:6px;cursor:pointer;font-size:13px}
.snx-cv-zoom button:hover{color:#3EE8F0;border-color:#3EE8F0}
.snx-cv-zoom .pct{min-width:52px;display:flex;align-items:center;justify-content:center;font-size:11px;
  color:#888;background:rgba(22,18,30,.9);border:1px solid #2a2a36;border-radius:6px}
.snx-cv-status{height:28px;flex-shrink:0;border-top:1px solid #1E1E2A;display:flex;align-items:center;gap:16px;
  padding:0 14px;font-size:11px;color:#666;font-family:Consolas,monospace}
.snx-cv-menu{position:fixed;z-index:400;background:#16121E;border:1px solid #2a2a36;border-radius:8px;
  padding:4px;min-width:150px;box-shadow:0 12px 32px rgba(0,0,0,.6)}
.snx-cv-menu button{display:block;width:100%;text-align:left;background:none;border:none;color:#ddd;
  padding:7px 12px;font-size:12.5px;cursor:pointer;border-radius:5px;font-family:inherit}
.snx-cv-menu button:hover:not(:disabled){background:#241C33;color:#3EE8F0}
.snx-cv-menu button:disabled{color:#444;cursor:default}
.snx-cv-menu .sep{height:1px;background:#2a2a36;margin:4px 6px}
.snx-cv-hist{display:flex;flex-direction:column;gap:8px}
.snx-cv-hist .hi{display:flex;gap:8px;border:1px solid #2a2a36;border-radius:8px;padding:6px;cursor:pointer}
.snx-cv-hist .hi:hover{border-color:#3EE8F0}
.snx-cv-hist .hi img{width:64px;height:64px;object-fit:cover;border-radius:5px;background:#000}
.snx-cv-hist .hp{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:space-between}
.snx-cv-hist .p1{font-size:11.5px;color:#bbb;line-height:1.4;display:-webkit-box;-webkit-line-clamp:3;
  -webkit-box-orient:vertical;overflow:hidden}
.snx-cv-hist .p2{font-size:10px;color:#555;font-family:Consolas,monospace}
.snx-cv-hist .del{background:none;border:none;color:#555;cursor:pointer;font-size:12px;align-self:flex-start;padding:0}
.snx-cv-hist .del:hover{color:#FF6070}
.snx-cv-err{font-size:12px;color:#FF6070;margin-top:8px;line-height:1.5}
.snx-form label{display:block;font-size:11px;color:#888;margin:12px 0 4px}
.snx-form input{width:100%;box-sizing:border-box;background:#111;border:1px solid #2a2a36;border-radius:6px;
  color:#ddd;padding:8px 10px;font-size:13px;font-family:inherit}
.snx-form input:focus{outline:none;border-color:#3EE8F0}
.snx-form .go{margin-top:14px;padding:9px 22px;border:none;border-radius:8px;cursor:pointer;
  background:linear-gradient(135deg,#D94AE8,#793791);color:#fff;font-size:13px;font-weight:700;font-family:inherit}
.snx-empty{font-size:12px;color:#777;padding:12px 0}
/* Phase 1：浮动操作条 / 悬浮 prompt bar / 蒙版工具条 / 比例弹层 */
.snx-ab{position:absolute;z-index:6;display:flex;gap:1px;background:rgba(22,18,30,.96);border:1px solid #2a2a36;
  border-radius:8px;padding:3px;box-shadow:0 8px 24px rgba(0,0,0,.5)}
.snx-ab button{background:none;border:none;color:#ccc;font-size:13px;padding:5px 8px;cursor:pointer;border-radius:5px;font-family:inherit}
.snx-ab button:hover{background:#241C33;color:#3EE8F0}
.snx-ab button.warn:hover{color:#FF6070}
.snx-pbar{position:absolute;top:12px;left:50%;transform:translateX(-50%);z-index:6;display:flex;align-items:center;gap:8px;
  background:rgba(22,18,30,.96);border:1px solid rgba(62,232,240,.3);border-radius:10px;padding:7px 9px;
  box-shadow:0 10px 30px rgba(0,0,0,.5);max-width:72%}
.snx-pbar input{flex:1;min-width:240px;width:320px;background:#0C0611;border:1px solid #2a2a36;border-radius:7px;
  color:#eee;padding:8px 12px;font-size:13px;font-family:inherit;outline:none}
.snx-pbar input:focus{border-color:#3EE8F0}
.snx-pbar .tag{font-size:10.5px;letter-spacing:.08em;color:#3EE8F0;border:1px solid rgba(62,232,240,.4);
  border-radius:4px;padding:3px 8px;white-space:nowrap}
.snx-pbar .tag.t2i{color:#B9A6CC;border-color:rgba(217,74,232,.4)}
.snx-pbar button.go{background:linear-gradient(135deg,#D94AE8,#793791);border:none;color:#fff;border-radius:7px;
  padding:8px 14px;cursor:pointer;font-weight:700;font-family:inherit}
.snx-pbar button.go:disabled{opacity:.5;cursor:default}
.snx-maskbar{position:absolute;top:12px;left:50%;transform:translateX(-50%);z-index:9;display:flex;align-items:center;gap:10px;
  background:rgba(22,18,30,.97);border:1px solid rgba(255,43,214,.45);border-radius:10px;padding:7px 12px;
  box-shadow:0 10px 30px rgba(0,0,0,.55);max-width:82%}
.snx-maskbar .lb{font-size:11px;color:#FF9BE8;white-space:nowrap}
.snx-maskbar input[type=text]{width:230px;background:#0C0611;border:1px solid #2a2a36;border-radius:7px;color:#eee;
  padding:7px 10px;font-size:12.5px;outline:none;font-family:inherit}
.snx-maskbar input[type=text]:focus{border-color:#FF2BD6}
.snx-maskbar input[type=range]{width:100px;accent-color:#FF2BD6}
.snx-maskbar button{background:none;border:1px solid #2a2a36;color:#ccc;border-radius:6px;padding:6px 10px;
  cursor:pointer;font-size:12px;font-family:inherit;white-space:nowrap}
.snx-maskbar button:hover:not(:disabled){border-color:#FF2BD6;color:#FF2BD6}
.snx-maskbar button.go{background:linear-gradient(135deg,#FF2BD6,#793791);border:none;color:#fff;font-weight:700}
.snx-maskbar button.go:disabled{opacity:.5;cursor:default}
.snx-maskbar button.go:hover:not(:disabled){color:#fff;filter:brightness(1.15)}
.snx-ratio{position:absolute;z-index:7;display:flex;gap:3px;background:rgba(22,18,30,.97);border:1px solid #2a2a36;
  border-radius:8px;padding:4px;box-shadow:0 10px 30px rgba(0,0,0,.55)}
.snx-ratio button{background:none;border:none;color:#ddd;padding:6px 10px;cursor:pointer;font-size:12px;
  border-radius:5px;font-family:inherit}
.snx-ratio button:hover{background:#241C33;color:#3EE8F0}
.snx-cv-mask{position:absolute;inset:0;z-index:8;cursor:crosshair}
/* Phase 2：聊天内生图工具卡片 */
.snx-tv{display:flex;flex-direction:column;gap:6px;padding:8px;border:1px solid rgba(62,232,240,.25);
  border-radius:8px;background:#0F0A16;margin:2px 0;max-width:340px}
.snx-tv img{max-width:280px;max-height:180px;border-radius:6px;display:block}
.snx-tv-run{font-size:12px;color:#3EE8F0}
.snx-tv-err{font-size:12px;color:#FF6070}
.snx-tv-row{display:flex;align-items:center;gap:8px;min-width:0}
.snx-tv-prompt{font-size:11px;color:#999;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.snx-tv-row button{background:#241C33;border:1px solid rgba(62,232,240,.4);color:#3EE8F0;border-radius:6px;
  padding:4px 10px;cursor:pointer;font-size:11.5px;font-family:inherit;white-space:nowrap}
.snx-tv-row button:hover{filter:brightness(1.2)}
`

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
    // dataURL 这类大引用不进文档（8MB 上限），重试时丢弃；文件/网络 URL 可以存
    function keepShortRef(ref) {
      return ref && !ref.startsWith('data:') ? ref : undefined
    }

    // ——— 生成流程（右面板 / 悬浮 bar / 操作条共用）———
    async function runOne(nodeId, o) {
      const { prompt, size = '2048x2048', model = '', reference } = o
      try {
        const r = await post('/api/sensenova/generate', {
          prompt, size, model: model || undefined, reference: reference || undefined, persist: true,
        })
        if (!r.ok || !r.image) throw new Error(r.error || '生成失败')
        const value = r.image.kind === 'base64' ? 'data:image/png;base64,' + r.image.value : r.image.value
        const im = await loadImg(value)
        const fit = nodeFit(im, 480)
        store.updateNode(nodeId, { status: 'done', src: value, w: fit.w, h: fit.h, error: '', ts: Date.now() })
      } catch (e) {
        store.updateNode(nodeId, { status: 'error', error: String((e && e.message) || e).slice(0, 200) })
      }
    }
    // anchorNode（done 图）存在 → 结果落其右侧挂 parentId（i2i 锚点）；否则视口中心
    async function genToCanvas(engine, opts) {
      const { prompt, size = '2048x2048', model = '', reference, anchorNode, n = 1 } = opts
      let bx, by, parentId
      if (anchorNode && anchorNode.status === 'done') {
        bx = anchorNode.x + anchorNode.w + 60; by = anchorNode.y; parentId = anchorNode.id
      } else {
        const c = engine.centerWorld(); bx = c.x - 240; by = c.y - 240
      }
      store.pushUndo()
      const ids = []
      for (let i = 0; i < n; i++) {
        const id = nid()
        ids.push(id)
        store.doc.nodes.push({
          id, type: 'image', status: 'pending', src: '', parentId,
          x: Math.round(bx + i * 540), y: Math.round(by), w: 480, h: 480,
          prompt, params: { size, model, reference: keepShortRef(reference) }, ts: Date.now(),
        })
      }
      store.emit(); autosave()
      await Promise.all(ids.map((id) => runOne(id, { prompt, size, model, reference })))
    }

    // ——— 蒙版/扩图合成（标注板模式：原图 + 高亮标注 → i2i）———
    async function composeMaskBoard(node, strokes) {
      const im = await loadImg(node.src)
      const cv = document.createElement('canvas')
      cv.width = Math.round(node.w); cv.height = Math.round(node.h)
      const cx = cv.getContext('2d')
      cx.drawImage(im, 0, 0, cv.width, cv.height)
      cx.save()
      cx.beginPath(); cx.rect(0, 0, cv.width, cv.height); cx.clip()
      cx.globalAlpha = 0.55
      cx.strokeStyle = '#FF2BD6'; cx.lineCap = 'round'; cx.lineJoin = 'round'
      for (const st of strokes) {
        cx.lineWidth = st.brush
        cx.beginPath()
        st.pts.forEach((p, i) => { const x = p.x - node.x, y = p.y - node.y; i ? cx.lineTo(x, y) : cx.moveTo(x, y) })
        cx.stroke()
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

    // ——— Konva 引擎 ———
    function createEngine(wrap) {
      const Konva = window.Konva
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
        rotateEnabled: true, anchorSize: 8, borderStroke: '#3EE8F0',
        anchorStroke: '#3EE8F0', anchorFill: '#16121E', keepRatio: false,
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
        const pct = document.getElementById('snx-cv-pct')
        if (pct) pct.textContent = Math.round(c.scale * 100) + '%'
        viewHooks.forEach((fn) => { try { fn() } catch { } })
      }

      function syncTransformer() {
        // Transformer 只挂 done 图（Group 的 width/height 不是 Konva 原生属性，变换会 NaN）
        const sel = []
        store.sel.forEach((id) => {
          const k = kmap.get(id)
          if (k && k.getAttr('snxStatus') === 'done') sel.push(k)
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
        k.on('dragstart', () => store.pushUndo())
        k.on('dragend', () => {
          store.updateNode(docNode.id, { x: Math.round(k.x()), y: Math.round(k.y()) })
        })
        k.on('transformstart', () => store.pushUndo())
        k.on('transformend', () => {
          const sx = k.scaleX(), sy = k.scaleY()
          k.scaleX(1); k.scaleY(1)
          const w = Math.max(40, Math.round(k.width() * sx)), hh = Math.max(40, Math.round(k.height() * sy))
          k.width(w); k.height(hh)
          store.updateNode(docNode.id, { x: Math.round(k.x()), y: Math.round(k.y()), w, h: hh })
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
          const g = new Konva.Group({ x: n.x, y: n.y, draggable: true })
          g.add(new Konva.Rect({
            width: n.w, height: n.h, stroke: '#3EE8F0', dash: [10, 7], strokeWidth: 1.5,
            cornerRadius: 8, fill: 'rgba(62,232,240,0.05)',
          }))
          g.add(new Konva.Text({
            width: n.w, y: n.h / 2 - 22, align: 'center', text: '⏳ 生成中…\n(20-60 秒)',
            fontSize: 14, fill: '#3EE8F0', lineHeight: 1.8,
          }))
          g.add(new Konva.Text({
            width: n.w - 24, x: 12, y: n.h / 2 + 24, align: 'center',
            text: (n.prompt || '').slice(0, 60), fontSize: 11, fill: '#667', lineHeight: 1.5,
          }))
          g.setAttr('snxStatus', 'pending')
          bindNode(g, n)
          mainLayer.add(g)
          kmap.set(n.id, g)
        } else if (n.status === 'error') {
          const g = new Konva.Group({ x: n.x, y: n.y, draggable: true })
          g.add(new Konva.Rect({
            width: n.w, height: n.h, stroke: '#FF6070', dash: [10, 7], strokeWidth: 1.5,
            cornerRadius: 8, fill: 'rgba(255,96,112,0.06)',
          }))
          g.add(new Konva.Text({
            width: n.w, y: n.h / 2 - 30, align: 'center', text: '❌ 生成失败',
            fontSize: 15, fill: '#FF6070',
          }))
          g.add(new Konva.Text({
            width: n.w - 24, x: 12, y: n.h / 2 - 4, align: 'center',
            text: (n.error || '').slice(0, 120) + '\n\n右键 → 重试', fontSize: 11, fill: '#a66', lineHeight: 1.5,
          }))
          g.setAttr('snxStatus', 'error')
          bindNode(g, n)
          mainLayer.add(g)
          kmap.set(n.id, g)
        } else {
          const k = new Konva.Image({
            x: n.x, y: n.y, width: n.w, height: n.h, draggable: true,
            stroke: 'rgba(255,255,255,0.07)', strokeWidth: 1,
          })
          k.setAttr('snxStatus', 'done')
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
            stroke: 'rgba(62,232,240,0.25)', strokeWidth: 1.5,
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
            stroke: '#3EE8F0', dash: [6, 4], strokeWidth: 1 / c.scale, fill: 'rgba(62,232,240,0.06)',
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
    function GenPanel({ engineRef, busy, setBusy, notify }) {
      const [prompt, setPrompt] = useState('')
      const [size, setSize] = useState(genPrefs.size)
      const [model, setModel] = useState(genPrefs.model)
      const [count, setCount] = useState('1')
      const [err, setErr] = useState('')

      const gen = async () => {
        const p = prompt.trim()
        if (!p || busy) return
        setErr(''); setBusy(true)
        try {
          const engine = engineRef.current
          // 恰好选中一个 done 图 → 自动 i2i（图作 reference），结果落其右侧
          let anchor = null
          if (store.sel.size === 1) {
            const cand = store.node([...store.sel][0])
            if (cand && cand.status === 'done') anchor = cand
          }
          genPrefs.size = size; genPrefs.model = model
          await genToCanvas(engine, {
            prompt: p, size, model,
            reference: anchor ? anchor.src : undefined,
            anchorNode: anchor,
            n: parseInt(count, 10) || 1,
          })
        } catch (e) { setErr(String((e && e.message) || e)) }
        finally { setBusy(false) }
      }

      return h('div', null,
        h('label', null, '提示词'),
        h('textarea', {
          value: prompt, onChange: (e) => setPrompt(e.target.value),
          placeholder: '描述要生成的图…\n选中画布上的图 → 自动变成编辑这张图（i2i）',
        }),
        h('label', null, '尺寸'),
        h('input', {
          list: 'snx-sizes', value: size,
          onChange: (e) => { setSize(e.target.value); genPrefs.size = e.target.value },
        }),
        h('datalist', { id: 'snx-sizes' },
          SIZES.map(([a, b]) => h('option', { key: a + 'x' + b, value: a + 'x' + b }))),
        h('div', { className: 'row' },
          h('div', null,
            h('label', null, '模型'),
            h('select', {
              value: model,
              onChange: (e) => { setModel(e.target.value); genPrefs.model = e.target.value },
            },
              h('option', { value: '' }, '默认（配置）'),
              h('option', { value: 'sensenova-u1-fast' }, 'u1-fast（快）'),
              h('option', { value: 'sensenova-u1.5' }, 'u1.5（质）'))),
          h('div', null,
            h('label', null, '张数'),
            h('select', { value: count, onChange: (e) => setCount(e.target.value) },
              ['1', '2', '4'].map((c) => h('option', { key: c, value: c }, c + ' 张')))),
        ),
        h('button', { className: 'snx-cv-gen', onClick: gen, disabled: busy || !prompt.trim() },
          busy ? '⏳ 生成中…' : '⚡ 生成到画布'),
        err ? h('div', { className: 'snx-cv-err' }, err) : null,
        h('div', { className: 'snx-cv-hint' },
          '🖱 滚轮缩放 · 空格/中键平移 · 框选多选 · 拖图进画布即素材', h('br'),
          '⌨️ Del 删除 · Ctrl+D 复制 · Ctrl+Z/Y 撤销重做 · F 适应画面', h('br'),
          '📋 选中单图出浮动操作条：变体/增强/重绘/扩图 · Ctrl+V 粘贴图', h('br'),
          notify ? h('span', null, '') : null),
      )
    }

    // ——— 悬浮 prompt bar（画布顶部常驻；选中图时自动 i2i）———
    function GenBar({ engineRef, busy, setBusy }) {
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
        } finally { setBusy(false) }
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
    function ActionBar({ engineRef, busy, setBusy, notify, onInpaint, onOutpaint, viewTick }) {
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
      const barW = 396
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

    // ——— 右侧面板：历史 ———
    function HistoryPanel({ engineRef }) {
      const [items, setItems] = useState(null)
      const load = () => get('/api/sensenova/history').then((r) => setItems(Array.isArray(r.items) ? r.items : []))
      useEffect(() => { load() }, [])
      const place = async (it) => {
        const src = it.kind === 'base64' ? 'data:image/png;base64,' + it.value : it.value
        try {
          const im = await loadImg(src)
          const fit = nodeFit(im, 480)
          const c = engineRef.current.centerWorld()
          store.addNode({
            id: nid(), type: 'image', status: 'done', src,
            x: Math.round(c.x - fit.w / 2), y: Math.round(c.y - fit.h / 2), w: fit.w, h: fit.h,
            prompt: it.prompt || '', params: {}, ts: Date.now(),
          }, true)
        } catch { /* 图片失效忽略 */ }
      }
      if (items === null) return h('div', { className: 'snx-empty' }, '加载中…')
      if (!items.length) return h('div', { className: 'snx-empty' }, '还没有生成记录。生成过的图会出现在这里，点击放回画布。')
      return h('div', { className: 'snx-cv-hist' },
        items.map((it, i) => h('div', { className: 'hi', key: it.id || i, onClick: () => place(it), title: '点击放回画布' },
          h('img', { src: it.kind === 'base64' ? 'data:image/png;base64,' + it.value : it.value, loading: 'lazy' }),
          h('div', { className: 'hp' },
            h('div', { className: 'p1' }, it.prompt || '(无提示词)'),
            h('div', null,
              h('span', { className: 'p2' }, (it.ts || '').replace('T', ' ').slice(0, 16)),
              it.id ? h('button', {
                className: 'del', title: '删除此条',
                onClick: (e) => { e.stopPropagation(); del('/api/sensenova/history?id=' + encodeURIComponent(it.id)).then(load) },
              }, ' ✕') : null)))))
    }

    // ——— 右键菜单 ———
    function ContextMenu({ menu, engineRef, setMenu, busy, setBusy }) {
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
        await runOne(n.id, {
          prompt: n.prompt,
          size: (n.params && n.params.size) || '2048x2048',
          model: (n.params && n.params.model) || '',
          reference: (n.params && n.params.reference) || undefined,
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
        target ? h('button', { onClick: act(() => { store.sel = new Set([target.id]); store.duplicateSelected() }) }, '⧉ 复制') : null,
        h('button', { onClick: act(() => store.removeSelected()), disabled: !target }, '🗑 删除'),
        h('div', { className: 'sep' }),
        h('button', { onClick: act(() => engineRef.current && engineRef.current.fit()) }, '⛶ 适应画面'),
        !target ? h('button', {
          onClick: act(() => {
            store.pushUndo(); store.doc.nodes = []
            store.emit(); autosave()
          }),
        }, '🧹 清空画布') : null,
      )
    }

    // ——— Phase 2：聊天内生图工具卡片（tool.call.toolview keyed by sensenova_generate_image）———
    function GenToolView(props) {
      const block = props && props.block
      const settled = block && block.kind === 'tool-result'
      if (!settled) return h('div', { className: 'snx-tv' }, h('span', { className: 'snx-tv-run' }, '🎨 SenseNova 生成中…'))
      const text = (block.content || []).map((c) => (c && c.text) || '').join('')
      let info = null
      try { info = JSON.parse(text) } catch { }
      const url = info && info.result_image
      let prompt = (info && info.prompt) || ''
      if (!prompt && block.call && block.call.argsRaw) {
        try { prompt = JSON.parse(block.call.argsRaw).prompt || '' } catch { }
      }
      const insert = (e) => {
        e.stopPropagation()
        fetch('/api/sensenova/canvas/nodes', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ src: url, prompt: '💬 ' + String(prompt || '') }),
        })
      }
      return h('div', { className: 'snx-tv' },
        url ? h('img', { src: url, alt: '' }) : h('span', { className: 'snx-tv-err' }, '生成失败或未返回图片'),
        h('div', { className: 'snx-tv-row' },
          h('span', { className: 'snx-tv-prompt' }, String(prompt || '').slice(0, 48)),
          url ? h('button', { onClick: insert, title: '追加到生图工作台画布' }, '📌 插入画布') : null,
        ),
      )
    }

    // ——— 全屏工作台 ———
    function Workbench() {
      const [open, setOpenState] = useState(isOpen())
      const [ready, setReady] = useState(false)
      const [loadErr, setLoadErr] = useState('')
      const [busy, setBusy] = useState(false)
      const [keyOk, setKeyOk] = useState(null)
      const [tab, setTab] = useState('gen')
      const [menu, setMenu] = useState(null)
      const [maskId, setMaskId] = useState(null)
      const [brush, setBrush] = useState(40)
      const [maskPrompt, setMaskPrompt] = useState('')
      const [ratioAt, setRatioAt] = useState(null)   // {x,y,nodeId}
      const [snack, setSnack] = useState('')
      const [, force] = useState(0)
      const wrapRef = useRef(null)
      const engineRef = useRef(null)
      const maskRef = useRef(null)   // {nodeId, strokes:[], canvas, redraw}
      const notify = (msg) => {
        setSnack(msg)
        setTimeout(() => setSnack(''), 5000)
      }

      useEffect(() => {
        const fn = () => setOpenState(isOpen())
        window.addEventListener(EVT, fn)
        const poll = setInterval(fn, 1200)
        get(STATUS_ROUTE).then((s) => setKeyOk(!!s.keyConfigured)).catch(() => { })
        return () => { window.removeEventListener(EVT, fn); clearInterval(poll) }
      }, [])

      useEffect(() => {
        ensureKonva().then(() => setReady(true)).catch((e) => setLoadErr(String((e && e.message) || e)))
      }, [])

      // 打开时：建引擎 + 载入文档 + 快捷键 + 拖放/粘贴；关闭时销毁
      useEffect(() => {
        if (!open || !ready || !wrapRef.current) return
        const wrap = wrapRef.current
        const engine = createEngine(wrap)
        engine.wrapEl = wrap
        engineRef.current = engine
        activeEngine = engine
        let dead = false
        get(CANVAS_ROUTE).then((r) => {
          if (dead) return
          const doc = r.doc
          store.doc = doc && Array.isArray(doc.nodes) ? doc : emptyDoc()
          if (!store.doc.camera) store.doc.camera = { x: 0, y: 0, scale: 1 }
          if (!Array.isArray(store.doc.nodes)) store.doc.nodes = []
          store.sel = new Set()
          engine.renderAll()
          engine.applyCamera()
          force((n) => n + 1)
        }).catch(() => { })
        engine.setOnContext((x, y, nodeId) => {
          setMenu({ x: Math.min(x, window.innerWidth - 180), y: Math.min(y, window.innerHeight - 230), nodeId })
        })
        // Phase 2：SSE 订阅（agent → 画布实时通道）
        const es = new window.EventSource('/api/sensenova/events')
        es.onmessage = (m) => {
          let evt = null
          try { evt = JSON.parse(m.data) } catch { return }
          if (!evt || !evt.type) return
          if (evt.type === 'canvas:update') {
            // agent 生图/摆图 / 聊天卡片插入 → 服务端已写文档，这里重载
            get(CANVAS_ROUTE).then((r) => {
              if (r.doc && Array.isArray(r.doc.nodes)) {
                store.doc.nodes = r.doc.nodes
                store.sel = new Set()
                if (activeEngine) activeEngine.renderAll()
                force((n) => n + 1)
              }
            }).catch(() => { })
          }
        }
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
          dead = true
          window.removeEventListener('keydown', onKey)
          wrap.removeEventListener('dragover', onDragOver)
          wrap.removeEventListener('drop', onDrop)
          window.removeEventListener('paste', onPaste)
          try { es.close() } catch { }
          unView()
          unsub()
          engine.destroy()
          if (activeEngine === engine) activeEngine = null
          engineRef.current = null
        }
      }, [open, ready])

      // ——— 蒙版局部重绘 ———
      function cancelMask() {
        maskRef.current = null
        setMaskId(null)
        setMaskPrompt('')
      }
      function enterMask(node) {
        maskRef.current = { nodeId: node.id, strokes: [], canvas: null, redraw: null }
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
          ctx.globalAlpha = 0.55
          ctx.strokeStyle = '#FF2BD6'; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
          for (const st of state.strokes) {
            ctx.lineWidth = st.brush
            ctx.beginPath()
            st.pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))
            ctx.stroke()
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
          if (!drawing) return
          const p = worldPt(e)
          const last = drawing.pts[drawing.pts.length - 1]
          const c = cam()
          if (Math.abs(p.x - last.x) * c.scale + Math.abs(p.y - last.y) * c.scale < 3) return
          drawing.pts.push(p)
          redraw()
        }
        const onUp = () => { drawing = null }
        cv.addEventListener('pointerdown', onDown)
        cv.addEventListener('pointermove', onMove)
        cv.addEventListener('pointerup', onUp)
        cv.addEventListener('pointerleave', onUp)
        const unView = engineRef.current.onViewChange(redraw)
        return () => {
          cv.removeEventListener('pointerdown', onDown)
          cv.removeEventListener('pointermove', onMove)
          cv.removeEventListener('pointerup', onUp)
          cv.removeEventListener('pointerleave', onUp)
          unView()
          cv.remove()
        }
      }, [maskId, brush])

      const applyMask = async () => {
        const st = maskRef.current
        const node = st ? store.node(st.nodeId) : null
        if (!node || busy || !st.strokes.length) return
        setBusy(true)
        try {
          const board = await composeMaskBoard(node, st.strokes)
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

      if (!open) return null

      // 操作条锚点节点（渲染期间从 store 现算，视口 tick 驱动跟随）
      let selDone = null
      if (store.sel.size === 1 && !maskId) {
        const cand = store.node([...store.sel][0])
        if (cand && cand.status === 'done') selDone = cand
      }

      return h('div', { className: 'snx-cv' },
        h('div', { className: 'snx-cv-top' },
          h('div', { className: 'brand' }, '⚡ SENSENOVA ', h('b', null, '生图工作台')),
          h('span', { className: 'key ' + (keyOk === false ? 'no' : 'ok') },
            keyOk === null ? '' : keyOk ? 'API Key 已配置' : 'API Key 未配置'),
          h('div', { className: 'sp' }),
          h('button', { onClick: () => engineRef.current && engineRef.current.fit(), title: '快捷键 F' }, '适应画面'),
          h('button', { onClick: () => setOpen(false) }, '✕ 关闭'),
        ),
        h('div', { className: 'snx-cv-main' },
          h('div', { className: 'snx-cv-wrap', ref: wrapRef },
            loadErr ? h('div', {
              style: {
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                justifyContent: 'center', color: '#FF6070', fontSize: 14,
              },
            }, loadErr) : null,
            // 悬浮 prompt bar（蒙版模式让位给工具条）
            !maskId && ready && !loadErr ? h(GenBar, { engineRef, busy, setBusy }) : null,
            // 蒙版工具条
            maskId ? h('div', { className: 'snx-maskbar' },
              h('span', { className: 'lb' }, '🖌 涂抹要修改的区域'),
              h('input', {
                type: 'range', min: 12, max: 160, value: brush,
                onChange: (e) => setBrush(parseInt(e.target.value, 10)),
                title: '笔刷大小',
              }),
              h('input', {
                type: 'text', value: maskPrompt,
                onChange: (e) => setMaskPrompt(e.target.value),
                onKeyDown: (e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) applyMask() },
                placeholder: '这块区域要改成什么？',
              }),
              h('button', {
                onClick: () => {
                  const st = maskRef.current
                  if (st) { st.strokes.pop(); if (st.redraw) st.redraw() }
                },
              }, '↩ 撤一笔'),
              h('button', { onClick: cancelMask }, '✕ 取消'),
              h('button', { className: 'go', onClick: applyMask, disabled: busy }, busy ? '⏳' : '✓ 应用生成'),
            ) : null,
            // 浮动操作条
            selDone && engineRef.current ? h(ActionBar, {
              engineRef, busy, setBusy, notify, viewTick: undefined,
              onInpaint: (n) => enterMask(n),
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
              at: ratioAt,
              onPick: (r) => applyOutpaint(r),
              onClose: () => setRatioAt(null),
            }) : null,
            h('div', { className: 'snx-cv-zoom' },
              h('button', { onClick: () => engineRef.current && engineRef.current.zoomBy(1 / 1.25), title: '缩小' }, '−'),
              h('div', { className: 'pct', id: 'snx-cv-pct' }, '100%'),
              h('button', { onClick: () => engineRef.current && engineRef.current.zoomBy(1.25), title: '放大' }, '+'),
              h('button', {
                onClick: () => engineRef.current && engineRef.current.fit(),
                title: '适应画面', style: { width: 'auto', padding: '0 8px' },
              }, '⛶'),
            ),
          ),
          h('div', { className: 'snx-cv-right' },
            h('div', { className: 'snx-cv-tabs' },
              h('button', { className: tab === 'gen' ? 'on' : '', onClick: () => setTab('gen') }, '⚡ 生成'),
              h('button', { className: tab === 'hist' ? 'on' : '', onClick: () => setTab('hist') }, '🕘 历史'),
            ),
            h('div', { className: 'snx-cv-body' },
              tab === 'gen'
                ? h(GenPanel, { engineRef, busy, setBusy, notify })
                : h(HistoryPanel, { engineRef }),
            ),
          ),
        ),
        h('div', { className: 'snx-cv-status' },
          h('span', null, `${store.doc.nodes.length} 张图 · 选中 ${store.sel.size}`),
          h('span', null, maskId ? '蒙版模式：在图上涂抹' : '滚轮缩放 / 空格平移'),
          h('div', { style: { flex: 1 } }),
          snack ? h('span', { style: { color: '#FF9BE8' } }, snack) : null,
          h('span', { id: 'snx-cv-save' }, ' '),
        ),
        h(ContextMenu, { menu, engineRef, setMenu, busy, setBusy }),
      )
    }

    // ——— 设置卡片（插件配置页）———
    function ConfigCard() {
      const [apiKey, setApiKey] = useState('')
      const [baseUrl, setBaseUrl] = useState('')
      const [model, setModel] = useState('')
      const [msg, setMsg] = useState('')
      useEffect(() => {
        get(CONFIG_ROUTE).then((r) => {
          setBaseUrl((r.config && r.config.baseUrl) || '')
          setModel((r.config && r.config.model) || '')
        })
      }, [])
      const save = async () => {
        setMsg('保存中…')
        const r = await post(CONFIG_ROUTE, { apiKey: apiKey.trim(), baseUrl: baseUrl.trim(), model: model.trim() })
        setMsg(r.ok ? '已保存 ✓（立即生效）' : '保存失败：' + (r.error || '未知错误'))
      }
      return h('div', { className: 'snx-form', style: { maxWidth: '560px' } },
        h('label', null, 'API Key（sk-...，留空 = 保留现有/环境变量）'),
        h('input', { type: 'password', value: apiKey, onChange: (e) => setApiKey(e.target.value), placeholder: '不修改则留空' }),
        h('label', null, 'baseUrl'),
        h('input', { value: baseUrl, onChange: (e) => setBaseUrl(e.target.value) }),
        h('label', null, '模型 id'),
        h('input', { value: model, onChange: (e) => setModel(e.target.value) }),
        h('div', null, h('button', { className: 'go', onClick: save }, '保存设置')),
        msg ? h('div', { className: 'snx-empty' }, msg) : null,
      )
    }

    // ——— 客户端生命周期 ———
    function apply(ctx) {
      const style = document.createElement('style')
      style.textContent = css
      document.head.appendChild(style)
      initBridge(ctx)
      ctx.slots.inject('settings.section', () =>
        ctx.slots.register({ name: 'settings.section', id: 'sensenova-image', order: 45, label: 'SenseNova 生图' }, ConfigCard))
      ctx.slots.inject('shell.overlay', () =>
        ctx.slots.register({ name: 'shell.overlay', id: 'dsh-sensenova-image', order: 85, label: '生图工作台' }, Workbench))
      ctx.slots.inject('sidebar.footer.action', () =>
        ctx.slots.register({ name: 'sidebar.footer.action', id: 'dsh-sensenova-image', order: 25 },
          () => h('button', {
            className: 'dk-sidebtn', title: 'SenseNova 生图工作台',
            onClick: () => setOpen(!isOpen()),
          }, '生图')))
      ctx.slots.inject('tool.call.toolview', () =>
        ctx.slots.register({ name: 'tool.call.toolview', key: 'sensenova_generate_image', id: 'dsh-sensenova-image', order: 10 }, GenToolView))
    }

    module.exports.apply = apply
    module.exports.inject = inject
    return module.exports
  },
})
