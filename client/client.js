/**
 * dsh-sensenova-image — 用户可见生图面板（客户端模块）
 *
 * 右缘"生图"悬浮按钮 → 面板：提示词 + 参考图路径 → POST /api/sensenova/generate
 * → 返回图片内嵌预览 + 下载。样式跟随 dsh 暗色（保守、不抢戏）。
 *
 * 数据全部走同源 fetch（/api/sensenova/*，服务端做同源校验）。
 */
window.__ModuleLoader__.load({
  id: 'dsh-sensenova-image',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports

    const API = '/api/sensenova/generate'

    // ——— 样式（跟随 dsh 暗色；CSS 变量优先，回退硬编码近似值）———
    const css = `
.snx-fab{position:fixed;left:0;top:170px;z-index:60;background:var(--color-bg-3,#232732);
  color:var(--color-text,#e8e8ea);border:1px solid var(--color-divider,rgba(255,255,255,.12));
  border-right:none;border-radius:6px 0 0 6px;padding:10px 8px;cursor:pointer;
  writing-mode:vertical-rl;letter-spacing:.2em;font-size:12.5px;font-family:inherit}
.snx-fab:hover{background:var(--color-bg-2,#2a2a33)}
.snx-panel{position:fixed;left:52px;top:120px;z-index:70;width:360px;
  background:var(--color-bg-2,#1f1f26);border:1px solid var(--color-divider,rgba(255,255,255,.12));
  border-radius:10px;box-shadow:0 18px 50px rgba(0,0,0,.5);padding:16px;
  font-family:inherit;color:var(--color-text,#e8e8ea);display:none}
.snx-panel.open{display:block}
.snx-panel h3{margin:0 0 12px;font-size:14.5px;font-weight:700;letter-spacing:.05em}
.snx-panel label{display:block;font-size:11.5px;color:var(--color-text-secondary,#9a9aa8);margin:10px 0 4px}
.snx-panel textarea,.snx-panel input{width:100%;box-sizing:border-box;background:rgba(255,255,255,.05);
  border:1px solid var(--color-divider,rgba(255,255,255,.14));border-radius:6px;color:inherit;
  padding:7px 9px;font-size:13px;font-family:inherit;resize:vertical}
.snx-panel textarea{min-height:64px}
.snx-panel .go{margin-top:14px;width:100%;padding:9px 0;border:none;border-radius:7px;cursor:pointer;
  background:var(--color-bg-3,#2f2f3a);color:inherit;font-size:13.5px;font-weight:700;letter-spacing:.1em}
.snx-panel .go:hover:not(:disabled){background:#34343f}
.snx-panel .go:disabled{opacity:.45;cursor:wait}
.snx-status{margin-top:9px;font-size:12px;color:var(--color-text-secondary,#9a9aa8);min-height:16px}
.snx-result{margin-top:12px}
.snx-result img{width:100%;border-radius:8px;display:block}
.snx-result a{display:inline-block;margin-top:7px;font-size:12px;color:var(--color-primary,#6ea8ff)}
.snx-close{position:absolute;top:8px;right:10px;background:none;border:none;color:var(--color-text-secondary,#9a9aa8);
  cursor:pointer;font-size:15px;padding:2px}
.snx-close:hover{color:var(--color-text,#fff)}
`

    // ——— DOM ———
    const fab = document.createElement('button')
    fab.className = 'snx-fab'
    fab.textContent = '生图'
    fab.title = 'SenseNova 生图'

    const panel = document.createElement('div')
    panel.className = 'snx-panel'
    panel.innerHTML = `
      <button class="snx-close" title="关闭">✕</button>
      <h3>SenseNova 生图</h3>
      <label>提示词（要画什么）</label>
      <textarea id="snx-prompt" placeholder="例：紫底黑卡街头涂鸦风 DEPLOYKIT 头图，白色泡泡字"></textarea>
      <label>参考图（本地路径 / URL，选填）</label>
      <input id="snx-ref" placeholder="C:\\path\\to\\reference.png（留空 = 纯文生图）">
      <label>尺寸</label>
      <input id="snx-size" value="2560x720">
      <button class="go" id="snx-go">生成</button>
      <div class="snx-status" id="snx-status"></div>
      <div class="snx-result" id="snx-result"></div>
    `

    const style = document.createElement('style')
    style.textContent = css
    document.head.appendChild(style)
    document.body.appendChild(fab)
    document.body.appendChild(panel)

    // ——— 交互 ———
    const status = (msg) => { panel.querySelector('#snx-status').textContent = msg || '' }
    const setBusy = (busy) => { panel.querySelector('#snx-go').disabled = busy }

    fab.addEventListener('click', () => panel.classList.toggle('open'))
    panel.querySelector('.snx-close').addEventListener('click', () => panel.classList.remove('open'))

    panel.querySelector('#snx-go').addEventListener('click', async () => {
      const prompt = panel.querySelector('#snx-prompt').value.trim()
      const reference = panel.querySelector('#snx-ref').value.trim()
      const size = panel.querySelector('#snx-size').value.trim() || '2560x720'
      const resultBox = panel.querySelector('#snx-result')
      resultBox.innerHTML = ''
      if (!prompt) { status('先写提示词'); return }
      setBusy(true); status('生成中…（通常 20-60 秒）')
      try {
        const res = await fetch(API, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ prompt, reference: reference || undefined, size }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.ok) throw new Error(data.error || ('HTTP ' + res.status))
        status('完成 ✓')
        const img = document.createElement('img')
        img.src = data.image.kind === 'url' ? data.image.value : 'data:image/png;base64,' + data.image.value
        const link = document.createElement('a')
        link.href = img.src
        link.textContent = '下载原图'
        link.download = 'sensenova.png'
        resultBox.appendChild(img)
        resultBox.appendChild(link)
      } catch (e) {
        status('失败：' + (e && e.message ? e.message : String(e)))
      } finally {
        setBusy(false)
      }
    })

    exports.apply = () => {}
    return module.exports
  },
})
