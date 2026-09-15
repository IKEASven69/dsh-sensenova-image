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

    // ——— 开关状态（模块级 + listeners，deck 同款）———
    const LS_OPEN = 'dsh-sensenova-open'
    let openState = null
    const listeners = new Set()
    function isOpen() {
      if (openState === null) { try { openState = localStorage.getItem(LS_OPEN) === '1' } catch { openState = false } }
      return openState === true
    }
    function setOpen(v) {
      openState = v
      try { localStorage.setItem(LS_OPEN, v ? '1' : '0') } catch { }
      listeners.forEach((fn) => fn())
    }
    function notify() { listeners.forEach((fn) => fn()) }

    // ——— 样式：全部走 shell 的 CSS 变量（跟随主题）———
    const css = `
.snx-shell{position:fixed;inset:0;z-index:80;display:flex;background:var(--color-bg,#16161c);
  color:var(--color-text,#e8e8ea);font-family:inherit}
.snx-rail{width:150px;border-right:1px solid var(--color-divider,rgba(255,255,255,.1));
  display:flex;flex-direction:column;padding:16px 10px;gap:4px}
.snx-rail .brand{font-size:12px;letter-spacing:.18em;color:var(--color-text-secondary,#9a9aa8);
  padding:0 10px 14px}
.snx-rail button{display:flex;align-items:center;gap:8px;background:none;border:none;color:var(--color-text,#e8e8ea);
  padding:8px 10px;border-radius:6px;cursor:pointer;font-size:13.5px;text-align:left;font-family:inherit}
.snx-rail button:hover{background:rgba(255,255,255,.06)}
.snx-rail button.on{background:rgba(255,255,255,.09);font-weight:700}
.snx-main{flex:1;padding:26px 32px;overflow:auto}
.snx-title{font-size:19px;font-weight:800;margin-bottom:18px;letter-spacing:.04em}
.snx-key{display:inline-block;font-size:11.5px;padding:2px 9px;border-radius:10px;margin-left:10px;vertical-align:2px}
.snx-key.ok{color:var(--color-primary,#6ea8ff);border:1px solid currentColor}
.snx-key.no{color:#ff8080;border:1px solid currentColor}
.snx-form{max-width:660px}
.snx-form label{display:block;font-size:12px;color:var(--color-text-secondary,#9a9aa8);margin:13px 0 4px}
.snx-form textarea,.snx-form input{width:100%;box-sizing:border-box;background:rgba(255,255,255,.05);
  border:1px solid var(--color-divider,rgba(255,255,255,.14));border-radius:7px;color:inherit;
  padding:8px 10px;font-size:13.5px;font-family:inherit;resize:vertical}
.snx-form textarea{min-height:68px}
.snx-form .row{display:flex;gap:10px}
.snx-form .row > *{flex:1}
.snx-form .go{margin-top:16px;padding:9px 26px;border:none;border-radius:7px;cursor:pointer;
  background:var(--color-primary,#6ea8ff);color:#10131a;font-size:13.5px;font-weight:700}
.snx-form .go:hover:not(:disabled){filter:brightness(1.1)}
.snx-form .go:disabled{opacity:.5;cursor:wait}
.snx-err{margin-top:10px;color:#ff8080;font-size:12.5px;white-space:pre-wrap}
.snx-preview{margin-top:18px;max-width:720px}
.snx-preview img{width:100%;border-radius:8px;display:block;box-shadow:0 12px 34px rgba(0,0,0,.45)}
.snx-preview a{display:inline-block;margin-top:8px;font-size:12.5px;color:var(--color-primary,#6ea8ff)}
.snx-hist{max-width:860px;display:flex;flex-direction:column;gap:10px}
.snx-hist .hi{display:flex;gap:14px;align-items:center;background:rgba(255,255,255,.04);
  border:1px solid var(--color-divider,rgba(255,255,255,.1));border-radius:8px;padding:10px 14px;cursor:pointer}
.snx-hist .hi:hover{background:rgba(255,255,255,.08)}
.snx-hist .hi img{width:86px;height:48px;object-fit:cover;border-radius:4px}
.snx-hist .hi .hp{flex:1;min-width:0}
.snx-hist .hi .hp .p1{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.snx-hist .hi .hp .p2{font-size:11.5px;color:var(--color-text-secondary,#9a9aa8);margin-top:2px}
.snx-hist .hi .del{background:none;border:none;color:var(--color-text-secondary,#9a9aa8);cursor:pointer;font-size:14px}
.snx-hist .hi .del:hover{color:#ff8080}
.snx-empty{color:var(--color-text-secondary,#9a9aa8);font-size:13px;padding:30px 0}
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
        listeners.add(fn)
        api.status().then((s) => setKeyOk(!!s.keyConfigured))
        return () => { listeners.delete(fn) }
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
