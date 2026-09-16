/**
 * dsh-sensenova-image — 生图管理界面（客户端模块）
 *
 * 结构（deck 同款模式）：
 *  - sidebar.footer.action 槽：侧栏底部"生图"按钮（原生位置，不遮内容）
 *  - shell.overlay 槽：全屏管理界面 = 左 Rail（生成/历史）+ 主区
 *     · 生成：提示词 + 参考图路径 + 尺寸 → /api/sensenova/generate → 预览 + 入历史
 *     · 历史：最近 12 条（服务端存储），点击回看，单条可删
 * 样式全部走 shell 的 CSS 变量，跟随 dsh 主题，不引入突兀观感。
 *
 * 客户端生命周期：宿主调用本模块导出的 apply(ctx)，ctx.slots 可用。
 */
window.__ModuleLoader__.load({
  id: 'dsh-sensenova-image',
  factory: (require) => {
    const module = { exports: {} }
    // 客户端服务声明：slots（shell.overlay / sidebar.footer.action 两个槽位）
    const inject = ['slots']
    const React = require('react')
    const { useState, useEffect, createElement: h } = React

    // ——— 数据访问（同源 fetch）———
    function post(url, body) {
      return fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
        .then(async (r) => ({ ok: r.ok, ...(await r.json().catch(() => ({}))) }))
    }
    function get(url) { return fetch(url).then(async (r) => ({ ok: r.ok, ...(await r.json().catch(() => ({}))) })) }
    function del(url) { return fetch(url, { method: 'DELETE' }).then(async (r) => ({ ok: r.ok })) }
    function getConfig() { return get(CONFIG_ROUTE).then((r) => (r.config || {})) }
    function saveConfig(patch) { return post(CONFIG_ROUTE, patch) }

    const HISTORY_ROUTE = '/api/sensenova/history'
    const CONFIG_ROUTE = '/api/sensenova/config'

    // ——— 开关状态（localStorage + window 事件；跨模块实例共享）———
    // deck 的 listeners Set 模式在本加载器下会被实例化两份（侧栏按钮/overlay
    // 各持一份，互不通告）。改用 window CustomEvent：同页面所有实例都收到。
    const LS_OPEN = 'dsh-sensenova-open'
    const EVT = 'snx-open-changed'
    // 状态唯一事实源 = localStorage，每次直读不缓存（模块可能被加载器实例化多份，
    // 模块级缓存会造成按钮/面板状态不同步——实测踩坑）
    function isOpen() {
      try { return localStorage.getItem(LS_OPEN) === '1' } catch { return false }
    }
    function setOpen(v) {
      try { localStorage.setItem(LS_OPEN, v ? '1' : '0') } catch { }
      try { window.dispatchEvent(new CustomEvent(EVT)) } catch { }
    }
    function notify() { listeners.forEach((fn) => fn()) }

    // ——— 样式：全部走 shell 的 CSS 变量（跟随主题）———
    const css = `
.snx-fab{position:fixed;left:0;top:170px;z-index:60;background:linear-gradient(135deg,#D94AE8,#793791);
  color:#fff;border:none;border-radius:0 8px 8px 0;padding:12px 7px;cursor:pointer;
  writing-mode:vertical-rl;letter-spacing:.3em;font-size:12.5px;font-weight:700;font-family:inherit;
  box-shadow:2px 2px 0 #16081C, 0 6px 18px rgba(137,77,174,.45);transition:transform .15s}
.snx-fab:hover{transform:translateX(3px)}
.snx-fab::first-letter{color:var(--snx-cyan,#3EE8F0)}
.snx-panel{position:fixed;left:56px;top:110px;z-index:70;width:390px;
  background:#120816;border:1px solid rgba(217,74,232,.35);border-radius:12px;
  box-shadow:0 24px 60px rgba(10,4,20,.65), 0 0 0 1px rgba(62,232,240,.12);
  padding:18px 18px 16px;font-family:inherit;color:#F2EDF8;display:none}
.snx-panel.open{display:block;animation:snx-pop .18s ease-out}
@keyframes snx-pop{from{transform:scale(.96) translateY(-6px);opacity:0}to{transform:none;opacity:1}}
.snx-panel h3{margin:0 0 4px;font-family:"Arial Black","Microsoft YaHei",sans-serif;font-weight:900;
  font-size:16px;letter-spacing:.06em;color:#fff;
  text-shadow:2px 2px 0 #D94AE8}
.snx-panel .sub{font-size:11px;color:#B9A6CC;margin-bottom:6px;letter-spacing:.08em}
.snx-panel label{display:block;font-size:11px;color:#B9A6CC;margin:12px 0 4px;letter-spacing:.12em}
.snx-panel textarea,.snx-panel input{width:100%;box-sizing:border-box;background:#0C0611;
  border:1px solid rgba(217,74,232,.3);border-radius:7px;color:#F2EDF8;
  padding:8px 10px;font-size:13px;font-family:var(--snx-mono,"JetBrains Mono",Consolas,monospace);resize:vertical;
  transition:border-color .15s, box-shadow .15s}
.snx-panel textarea{min-height:64px}
.snx-panel textarea:focus,.snx-panel input:focus{outline:none;border-color:#3EE8F0;
  box-shadow:0 0 0 2px rgba(62,232,240,.25)}
.snx-panel .row{display:flex;gap:10px}
.snx-panel .row > *{flex:1}
.snx-panel .go{margin-top:16px;width:100%;padding:10px 0;border:none;border-radius:8px;cursor:pointer;
  background:linear-gradient(135deg,#D94AE8,#3EE8F0);color:#16081C;
  font-size:14px;font-weight:900;letter-spacing:.2em;font-family:inherit;
  box-shadow:0 4px 18px rgba(217,74,232,.4);transition:filter .15s, transform .1s}
.snx-panel .go:hover:not(:disabled){filter:brightness(1.15);transform:translateY(-1px)}
.snx-panel .go:disabled{opacity:.5;cursor:wait;transform:none}
.snx-status{margin-top:9px;font-size:12px;color:#B9A6CC;min-height:16px;font-family:var(--snx-mono,Consolas,monospace)}
.snx-result{margin-top:14px;border:1px solid rgba(217,74,232,.35);border-radius:10px;padding:10px;
  background:#0C0611}
.snx-result img{width:100%;border-radius:6px;display:block}
.snx-result .snx-dl{display:flex;gap:10px;margin-top:9px}
.snx-result a{font-size:12px;color:#3EE8F0;text-decoration:none;font-family:var(--snx-mono,Consolas,monospace)}
.snx-result a:hover{text-decoration:underline}
.snx-close{position:absolute;top:8px;right:10px;background:none;border:none;color:#B9A6CC;
  cursor:pointer;font-size:15px;padding:2px}
.snx-close:hover{color:#3EE8F0}
.snx-tag{display:inline-block;font-size:10px;letter-spacing:.22em;color:#3EE8F0;
  border:1px solid rgba(62,232,240,.4);border-radius:3px;padding:2px 8px;margin-bottom:8px}
`

    // ——— 生成页组件 ———
    function Gen({ onSaved }) {
      const [prompt, setPrompt] = useState('')
      const [ref, setRef] = useState('')
      const [size, setSize] = useState('2560x720')
      const [busy, setBusy] = useState(false)
      const [err, setErr] = useState('')
      const [img, setImg] = useState(null)
      const go = async () => {
        if (!prompt.trim() || busy) return
        setBusy(true); setErr(''); setImg(null)
        try {
          const r = await api.generate({ prompt: prompt.trim(), reference: ref.trim() || undefined, size })
          if (!r.ok) throw new Error(r.error || 'HTTP 失败')
          const kind = r.image.kind, value = r.image.value
          const src = kind === 'url' ? value : 'data:image/png;base64,' + value
          setImg({ src, kind, value })
          await api.historyAdd({ prompt: prompt.trim(), reference: ref.trim(), kind, value })
          if (onSaved) onSaved()
        } catch (e) { setErr(e && e.message ? e.message : String(e)) }
        finally { setBusy(false) }
      }
      return h('div', { className: 'snx-form' },
        h('label', null, '提示词'),
        h('textarea', { value: prompt, onChange: (e) => setPrompt(e.target.value), placeholder: '例：KOOL 街头涂鸦风 DEPLOYKIT 头图，紫场黑纸白泡泡字' }),
        h('label', null, '参考图（本地路径 / URL，选填——风格锚定）'),
        h('input', { value: ref, onChange: (e) => setRef(e.target.value), placeholder: 'C:\\path\\to\\ref.png（留空 = 纯文生图）' }),
        h('div', { className: 'row' },
          h('div', null, h('label', null, '尺寸'), h('input', { value: size, onChange: (e) => setSize(e.target.value) }))),
        h('button', { className: 'go', onClick: go, disabled: busy }, busy ? '生成中…（20-60 秒）' : '生成'),
        err ? h('div', { className: 'snx-err' }, err) : null,
        img ? h('div', { className: 'snx-preview' },
          h('img', { src: img.src }),
          h('a', { href: img.src, download: 'sensenova.png', target: '_blank' }, '下载原图')) : null,
      )
    }

    // ——— 历史页组件 ———
    function History({ onPick }) {
      const [items, setItems] = useState(null)
      const load = async () => {
        const r = await api.history()
        setItems(Array.isArray(r.items) ? r.items : [])
      }
      useEffect(() => { load() }, [])
      if (items === null) return h('div', { className: 'snx-empty' }, '加载中…')
      if (!items.length) return h('div', { className: 'snx-empty' }, '还没有生成记录。')
      return h('div', { className: 'snx-hist' },
        items.map((it, i) => h('div', {
          className: 'hi', key: it.id || i,
          onClick: () => onPick({ prompt: it.prompt, reference: it.reference, kind: it.kind, value: it.value }),
        },
          it.kind === 'base64' ? h('img', { src: 'data:image/png;base64,' + it.value })
            : it.kind === 'url' ? h('img', { src: it.value }) : null,
          h('div', { className: 'hp' },
            h('div', { className: 'p1' }, it.prompt || '(无提示词)'),
            h('div', { className: 'p2' }, it.ts.replace('T', ' ').slice(0, 16))),
          h('button', {
            className: 'del', title: '删除此条',
            onClick: (e) => {
              e.stopPropagation()
              if (!it.id) return
              del(HISTORY_ROUTE + '?id=' + encodeURIComponent(it.id)).then(load)
            },
          }, '✕'))),
      )
    }

    // ——— 全屏管理界面（shell.overlay 渲染的主体）———
    function App() {
      const [view, setView] = useState('gen')     // gen | hist
      const [pick, setPick] = useState(null)      // 历史点选 → 生成页回看
      const [keyOk, setKeyOk] = useState(null)    // null=查询中
      const [, force] = useState(0)
      useEffect(() => {
        const fn = () => force((n) => n + 1)
        window.addEventListener(EVT, fn)
        api.status().then((s) => setKeyOk(!!s.keyConfigured))
        const poll = setInterval(fn, 1200)   // 兜底：事件丢失时靠轮询自愈
        return () => { window.removeEventListener(EVT, fn); clearInterval(poll) }
      }, [])
      if (!isOpen()) return null                  // 关闭时由侧栏按钮承担入口

      const openGen = () => { setView('gen'); setPick(null) }
      return h('div', { className: 'snx-shell' },
        h('div', { className: 'snx-rail' },
          h('div', { className: 'brand' }, 'SENSENOVA 生图'),
          h('button', { className: view === 'gen' ? 'on' : '', onClick: openGen }, '🎨 生成'),
          h('button', { className: view === 'hist' ? 'on' : '', onClick: () => setView('hist') }, '🖼 历史'),
        ),
        h('div', { className: 'snx-main' },
          h('div', { className: 'snx-title' }, '生图管理',
            h('span', { className: 'snx-key ' + (keyOk === false ? 'no' : 'ok') },
              keyOk === null ? '' : keyOk ? 'API Key 已配置' : 'API Key 未配置')),
          view === 'gen'
            ? h(Gen, { key: pick ? 'pick' : 'fresh', onSaved: () => setView('hist') })
            : h(History, {
              onPick: (it) => { setPick(it); setView('gen') },
            }),
        ),
      )
    }

    // ——— 设置卡片（插件配置页的 sensenova-image 表单）———
    function ConfigCard() {
      const [apiKey, setApiKey] = useState('')
      const [baseUrl, setBaseUrl] = useState('')
      const [model, setModel] = useState('')
      const [loaded, setLoaded] = useState(false)
      const [msg, setMsg] = useState('')
      useEffect(() => {
        getConfig().then((cfg) => {
          setBaseUrl(cfg.baseUrl || '')
          setModel(cfg.model || '')
          setLoaded(true)
        })
      }, [])
      const save = async () => {
        setMsg('保存中…')
        const r = await saveConfig({ apiKey: apiKey.trim(), baseUrl: baseUrl.trim(), model: model.trim() })
        setMsg(r.ok ? '已保存 ✓（立即生效）' : '保存失败：' + (r.error || '未知错误'))
      }
      return h('div', { className: 'snx-form', style: { maxWidth: '560px' } },
        h('label', null, 'API Key（sk-...，留空 = 保留现有/环境变量）'),
        h('input', { type: 'password', value: apiKey, onChange: (e) => setApiKey(e.target.value), placeholder: '不修改则留空' }),
        h('label', null, 'baseUrl'),
        h('input', { value: baseUrl, onChange: (e) => setBaseUrl(e.target.value) }),
        h('label', null, '模型 id'),
        h('input', { value: model, onChange: (e) => setModel(e.target.value) }),
        h('div', { style: { marginTop: '14px' } },
          h('button', { className: 'go', onClick: save }, '保存设置')),
        msg ? h('div', { className: 'snx-empty', style: { marginTop: '8px' } }, msg) : null,
      )
    }

    // ——— 客户端生命周期：宿主调用 apply(ctx)，ctx.slots 可用 ———
    function apply(ctx) {
      injectStyle()
      ctx.slots.inject('settings.section', () =>
        ctx.slots.register({ name: 'settings.section', id: 'sensenova-image', order: 45, label: 'SenseNova 生图' }, ConfigCard))
      ctx.slots.inject('shell.overlay', () =>
        ctx.slots.register({ name: 'shell.overlay', id: 'dsh-sensenova-image', order: 85, label: '生图' }, App))
      ctx.slots.inject('sidebar.footer.action', () =>
        ctx.slots.register({ name: 'sidebar.footer.action', id: 'dsh-sensenova-image', order: 25 },
          () => h('button', {
            className: 'dk-sidebtn', title: 'SenseNova 生图',
            onClick: () => setOpen(!isOpen()),
          }, '生图')))
    }

    function injectStyle() {
      const style = document.createElement('style')
      style.textContent = css
      document.head.appendChild(style)
    }

    module.exports.apply = apply
    module.exports.inject = inject
    return module.exports
  },
})
