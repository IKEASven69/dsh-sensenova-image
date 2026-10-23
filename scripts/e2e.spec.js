#!/usr/bin/env node
// e2e.spec.js — SenseNova 生图工作台 端到端验收(Playwright)
//
// 【手动运行,不做 CI】SPEC-17 一.6 归档入库:原样搬自验收员工作目录
//   D:/coding/tmp/snx-audit/e2e.js(v16 版,48 项断言 t01-t48),除本头部与
//   usage 报错文案的文件名外,断言与逻辑零改动。
//   验收由验收员对自起实例执行,实例 URL 从 argv 传入;本脚本不进任何 CI 流水线。
//   依赖 playwright(仓库 package.json 未声明,由上层工作区 node_modules 提供,node
//   沿目录树向上解析可命中);截图写到 scripts/shots/(运行产物,不入库)。
//   仓库根 package.json 为 type:module,本目录经 scripts/package.json 声明 type:commonjs
//   保持归档脚本 CJS 原样(require 不改 import)。
//
// 用法(仓库根运行):
//   node scripts/e2e.spec.js <实例URL> [--headed] [--from=<起始序号>]
//   实例 URL 形如 http://127.0.0.1:5184/?token=xxxx
// 输出:JSON 数组 [{name, pass, evidence, domain}] 打到 stdout
// 截图:本目录 shots/<编号>-<slug>.png
//
// v2(2026-10-14 验收员校准):
//   - switchTab 改前缀匹配(画廊页签带计数「画廊7」)
//   - 灯箱由「双击卡片」打开(单击=选中,卡片 title 明示「双击看大图」)
//   - t03 的 done/pending/error 节点数取自 /api/sensenova/canvas(应用单一事实源持久层)
//   - t06 hover 检测改为 .snx-gal-item-ops computed opacity(按钮常驻 DOM,CSS 控制显隐)
//   - t06/t12 的删除确认断言 .snx-cfm-backdrop 应用内模态
//   - t12 需要至少 1 条 error 节点:若无,经 UI 点「生成到画布」并拦截
//     POST /api/sensenova/generate 返回 500(不触碰真实 SenseNova API/配额)造一条,
//     该记录随后被「清除已失败」移除,净数据变化为零
//   - t08 依 v10 设计(P1-6):风格后缀存 styleId 提交时拼接,不进 textarea;
//     「后缀只有一段」断言为「风格芯片 .on 态唯一」,textarea 断言不含任何风格后缀残段
// v12(2026-10-15 验收员校准):
//   - 新增 t14-t21 共 8 条(行级回填/决策面板/对比三模式/删除引用警告/历史翻阅/画布双击/多选操作条/画布 toast)
//   - 截图目录改 shots/v12/;实例为本验收员自起 dsh web --port 5189(测毕即杀,不碰 5181)
// v13(2026-10-17 验收员校准,SPEC-13 两轴并行轮):
//   - 新增 t23-t32 共 10 条:对话轴 5(等待生命感/回填参数/设为参考图/同参数重抽/复制提示词)
//     +对话灯箱 2(参数清单行级回填/回合尾 x/N 编号)+工作台轴 3(生成入板/队列全历史/对比 3 图)
//   - 截图目录改 shots/v13/;实例为本验收员自起 dsh web --no-open --port 5193(测毕即杀,不碰 5181)
//   - 对话轴纪律:generate 的对话路径在服务端执行、不经过浏览器,Playwright 无法在浏览器层拦截——
//     3s 延迟改在唯一可拦边界注入:本机 mock 上游(127.0.0.1:5299/v1/images/generations 延迟 3s 返图),
//     并把 sensenova config 原位换成 mock(apiKey=audit-mock-key;测毕恢复原值;实测 persisted:false
//     即内存态、不落盘)。全程 0 次触达真实 SenseNova API/配额;工作台轴的 generate 仍在浏览器层拦截 500/直连
//   - 剪贴板断言用 context.grantPermissions(['clipboard-read','clipboard-write'])
//   - 对话轴断言复用同一条真实 agent 回合产出(t23 造卡,t24-t28 复用;t29 另造一回合 2 图)
// v14(2026-10-18 验收员校准,SPEC-14 两轴并行第二轮):
//   - 新增 t33-t38 共 6 条:并发写保护(双 page 409→重载+toast→新 rev 写入成功)/队列「取消其他」/
//     对比 3 图「交换」倒序/画布右键新四项(定位·对比·复制图·提词)/多选「批量下载」/回合尾折叠直通可见
//   - 截图目录改 shots/v14/;实例为本验收员自起 dsh web --no-open --port 5197(测毕即杀,不碰 5181;
//     5196 被昨日遗留孤儿实例 PID 占用,本次未触碰该进程,依纪律只杀自起进程故改口 5197)
//   - 前置事实:仓库 dist/index.js 为陈旧 CJS 产物(ESM 包内 require,插件 failed to import 且无
//     SPEC-14 服务端 rev 逻辑)→起实例前跑 npm run build 重建(未改任何业务源码,重建后 import OK)
//   - t33 双 page:辅助会话 A 用 page.context().newPage()(同 context,PROBE 同注入),测毕即关;
//     收藏(favorite)作为无副作用写标记,不走 generate(0 次触达真实 API),测后取消收藏净变化为零
// v15(2026-10-19 验收员校准,SPEC-15 资产流轮):
//   - 新增 t39-t44 共 6 条:归板跟随(画廊筛选→决策面板目标行)/手动覆盖(选板→画廊再切不覆盖/
//     回到跟随)/归板落图(放行生成→节点 boardId=B)/批量变体拦截 500(2 请求·reference 对应·
//     串行·toast 进度汇总)/批量变体放行抽查(1 张 200→done 节点 reference 正确)/导出元数据默认勾选
//   - 截图目录改 shots/v15/;实例为本验收员自起 dsh web --no-open --port 5219(测毕即杀,不碰 5181)
//   - 前置事实:SPEC-15 提交(63be5c7)仅含文档,实现在工作区未提交的 client/client-v4.js(2026-10-19
//     21:07);已核实运行实例所服务插件 bundle 含「回到跟随画廊」×5/「批量变体」×9(新鲜),dist/index.js
//     与 v14 src 一致可 import,无需重建
//   - 测试画板 AUDIT-B/AUDIT-C 经画廊「新建」UI 造(t39),t41 测后经画板 chip 右键「仅删除画板」
//     UI 清场;t41 放行生成的节点经画廊右键删除清场;t42/t43 变体节点经「清除已失败」+右键删除清场
//   - t41 放行前提:mock 上游在位(config.baseUrl=:5299),否则如实 FAIL 不触真实 API(同 t23 纪律)
// v16(2026-10-21 验收员校准,SPEC-16 资产生产力轮):
//   - 新增 t45-t48 共 4 条:等待预估(拦截 generate 延迟 3s 放行→localStorage snxAvgDur 出现样本→
//     第二发 pending 悬浮卡「预计 ~3s」×wait)/乱码清理核验(只读 GET,画布含 ◆/U+FFFD 连续乱码的
//     done 节点应已清零;清理本体为实现侧批次1 的用户批准数据操作,验收员绝不代跑)×wait/
//     画板最近使用排序(未分组图右键移入新建板 AUDIT-A→lastUsed 刷新→chips+表单下拉 A 排首位,
//     测后图移回未分组+右键「仅删除画板」清板,确认弹层标题严格校验)×asset/
//     批量导出(多选 2 张→「批量导出」→2 次 download,逐文件验 PNG 签名/sensenova tEXt chunk/全 chunk CRC)×asset
//   - 截图目录改 shots/v16/;实例为本验收员自起 dsh web --no-open --port 5245(测毕即杀,不碰 5181);
//     共享画布起测前 GET 备份(canvas-5245-before.json),测毕 PUT 恢复并 GET 核验(历任审计纪律)

'use strict'
const fs = require('fs')
const path = require('path')
const http = require('http')
const zlib = require('zlib')
const { chromium } = require('playwright')

const SHOTS = path.join(__dirname, 'shots', 'v16')
const WIDTHS = [300, 480, 720, 960]
const STYLE_SIGS = ['cinematic lighting', 'photorealistic', 'anime style', 'oil painting', '3D render', 'ink wash', 'pixel art', 'architectural visualization']

// ── 原生弹窗探针:从文档起始就包一层,记录并拦截(confirm 返 false / prompt 返 null)──
const PROBE = `
(() => {
  const rec = { confirm: [], prompt: [], alert: [] };
  window.__nativeProbes = rec;
  window.confirm = function (...a) { rec.confirm.push(String(a[0]).slice(0, 60)); return false };
  window.prompt = function (...a) { rec.prompt.push(String(a[0]).slice(0, 60)); return null };
  window.alert = function (...a) { rec.alert.push(String(a[0]).slice(0, 60)); return undefined };
})()`

const results = []
const shot = async (page, name, tag) => {
  try { await page.screenshot({ path: path.join(SHOTS, `${name}-${tag}.png`) }) } catch (e) { /* 截图失败不拖垮用例 */ }
}
const rec = (n, name, domain, pass, ev) => { results.push({ name: `${n}. ${name}`, pass, evidence: ev, domain }) }
const evJoin = (steps) => steps.map((s) => typeof s === 'string' ? s : JSON.stringify(s)).join(' | ')

// ── 通用操作 ──
async function openWorkbench(page) {
  const deadline = Date.now() + 25000
  while (Date.now() < deadline) {
    await page.evaluate(() => {
      const t = [...document.querySelectorAll('button, [role=tab]')]
        .find((e) => /SenseNova 生图|生图/.test((e.textContent || '').trim()) && e.getBoundingClientRect().width > 0 && !e.closest('.snx-pro'))
      if (t) t.click()
    })
    try {
      await page.waitForSelector('.snx-pro', { timeout: 2500 })
      await page.waitForTimeout(1200)
      return true
    } catch (e) { /* 重试 */ }
  }
  return !!(await page.$('.snx-pro'))
}
async function ensureState(page) {
  try {
    if (await page.$('.snx-lb-close')) await page.click('.snx-lb-close', { timeout: 1500 }).catch(() => {})
    const cfm = await page.$('.snx-cfm-backdrop')
    if (cfm) { // 应用内确认弹层 → 点取消
      await page.evaluate(() => { const b = [...document.querySelectorAll('.snx-cfm-b')].find((x) => !x.className.includes('danger')); if (b) b.click() }).catch(() => {})
    }
    await page.keyboard.press('Escape').catch(() => {})
    if (!(await page.$('.snx-pro'))) await openWorkbench(page)
  } catch (e) { /* 后续用例各自给 evidence */ }
}
const tabNames = (page) => page.evaluate(() => [...document.querySelectorAll('.snx-pro-tabs button')].map((b) => b.textContent.trim()).filter((t) => t))
async function switchTab(page, tab) {
  await page.evaluate((tab) => {
    const btn = [...document.querySelectorAll('.snx-pro-tabs button')].find((b) => b.textContent.trim().startsWith(tab))
    if (btn) btn.click()
  }, tab)
  await page.waitForTimeout(500)
}
async function setProWidth(page, w) {
  await page.evaluate((w) => { const p = document.querySelector('.snx-pro'); if (p) p.style.width = w + 'px' }, w)
  await page.waitForTimeout(450)
}
// 节点事实源:/api/sensenova/canvas 的 doc.nodes
async function docInfo(page) {
  return page.evaluate(async () => {
    try {
      const r = await fetch('/api/sensenova/canvas')
      const j = await r.json()
      const ns = (j.doc && j.doc.nodes) || []
      return {
        total: ns.length,
        done: ns.filter((n) => n.status === 'done').length,
        pending: ns.filter((n) => n.status === 'pending').length,
        error: ns.filter((n) => n.status === 'error').length,
      }
    } catch (e) { return { total: -1, done: -1, pending: -1, error: -1, err: String(e).slice(0, 80) } }
  })
}
// 造 1 条 error 节点:UI 点「生成到画布」+ 拦截 generate 请求返回 500(不触真实 API)
async function seedErrorNode(page) {
  await switchTab(page, '生图')
  const ta = await page.$('.snx-gen-ta')
  if (!ta) return 'no ta'
  await ta.click(); await ta.fill(''); await page.keyboard.type('AUDIT-ERROR-SEED 请忽略', { delay: 8 })
  await page.waitForTimeout(300)
  const goEnabled = await page.evaluate(() => { const b = document.querySelector('.snx-gen-go'); return !!b && !b.className.includes('disabled') })
  if (!goEnabled) return '生成按钮未随输入启用'
  await page.route('**/api/sensenova/generate', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'audit: simulated failure' }) }))
  try {
    await page.evaluate(() => { const b = document.querySelector('.snx-gen-go'); if (b) b.click() })
    const deadline = Date.now() + 15000
    while (Date.now() < deadline) {
      await page.waitForTimeout(600)
      const d = await docInfo(page)
      if (d.error >= 1) return 'seeded'
    }
    return 'seed 未生效(error=0)'
  } finally { await page.unroute('**/api/sensenova/generate') }
}
const galCard = (page) => page.$('.snx-gal-grid .snx-gal-item:not(.ph)')
let LB_LAST_ERR = ''
async function openLightbox(page) { // 画廊首张 done 卡双击开灯箱
  // 灯箱入口是 React onDoubleClick——必须走 Playwright dblclick(带 clickCount=2,浏览器才派发 dblclick 事件);
  // 裸 mouse.click×2 不产生 dblclick(实测)。全套连跑时应用周期性重渲染会使元素句柄中途 detach,
  // 每次尝试都重新取句柄,重试 3 次。
  LB_LAST_ERR = ''
  for (let i = 1; i <= 3; i++) {
    const card = await galCard(page)
    if (!card) { LB_LAST_ERR = '画廊无卡片'; return false }
    try {
      await card.dblclick({ timeout: 4000 })
    } catch (e) {
      LB_LAST_ERR = `第${i}次 dblclick: ${String((e && e.message) || e).replace(/\s+/g, ' ').slice(0, 140)}`
    }
    if (await page.waitForSelector('.snx-lb', { timeout: 3500 }).catch(() => null)) return true
    await page.waitForTimeout(600)
  }
  LB_LAST_ERR = LB_LAST_ERR || 'dblclick 3 次尝试均未出现 .snx-lb'
  return false
}
// 关掉当前所有 toast(点 .snx-toast-x)——toast 自动消失如有问题,避免上一用例的残留污染基线
async function clearToasts(page) {
  await page.evaluate(() => { [...document.querySelectorAll('.snx-toast-x')].forEach((b) => { try { b.click() } catch (e) { } }) })
  await page.waitForTimeout(350)
  return page.evaluate(() => document.querySelectorAll('.snx-toast').length)
}
const readToasts = (page) => page.evaluate(() => [...document.querySelectorAll('.snx-toast')].map((t) => t.textContent.trim()))
async function closeLightbox(page) {
  const btn = await page.$('.snx-lb-close')
  if (btn) await btn.click().catch(() => {}); else await page.keyboard.press('Escape').catch(() => {})
  await page.waitForSelector('.snx-lb', { state: 'detached', timeout: 4000 }).catch(() => {})
  return !(await page.$('.snx-lb'))
}

// ══════════════ v13 对话轴环境:本机 mock 上游 + sensenova config 原位换/还 ══════════════
// 对话路径的 generate 在 dsh 服务端执行(工具 execute 直接调上游),不经过浏览器——Playwright
// route 拦不到;延迟注入在唯一可拦边界:mock 上游延迟 3s 应答。0 次触达真实 SenseNova API。
const MOCK_PORT = 5299
let MOCK_SRV = null
const MOCK_HITS = []
let CFG_ORIG = null
// 生成合法纯色 PNG 的 base64(服务端 persistImage 拒收 <64 字节的图,64×64 远超门槛)
function pngB64(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) {
    const off = y * (w * 3 + 1)
    raw[off] = 0
    for (let x = 0; x < w; x++) { raw[off + 1 + x * 3] = rgb[0]; raw[off + 2 + x * 3] = rgb[1]; raw[off + 3 + x * 3] = rgb[2] }
  }
  const crcTable = [...Array(256)].map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
  const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]).toString('base64')
}
async function chatEnvStart(origin) {
  MOCK_SRV = http.createServer((req, res) => {
    let b = ''
    req.on('data', (c) => { b += c })
    req.on('end', () => {
      MOCK_HITS.push({ path: req.url, at: Date.now() })
      setTimeout(() => {   // SPEC-13 ①验收口径:generate 响应延迟 3s
        res.writeHead(200, { 'content-type': 'application/json' })
        // 800×600:贴近真实生成图——64px 小图会让 t04 灯箱放大无从溢出(数据性伪失败)
        res.end(JSON.stringify({ created: Math.floor(Date.now() / 1000), data: [{ b64_json: pngB64(800, 600, [200, 96, 48]) }] }))
      }, 3000)
    })
  })
  await new Promise((res) => MOCK_SRV.listen(MOCK_PORT, '127.0.0.1', res))
  const r0 = await fetch(origin + '/api/sensenova/config').then((r) => r.json())
  CFG_ORIG = r0 && r0.config ? r0.config : { apiKey: '', baseUrl: '', model: '' }
  await fetch(origin + '/api/sensenova/config', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ apiKey: 'audit-mock-key', baseUrl: 'http://127.0.0.1:' + MOCK_PORT + '/v1' }) })
  process.stderr.write(`chatEnv: mock on :${MOCK_PORT}, config swapped (orig baseUrl=${CFG_ORIG.baseUrl})\n`)
}
async function chatEnvStop(origin) {
  try {
    if (CFG_ORIG) {
      await fetch(origin + '/api/sensenova/config', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ apiKey: CFG_ORIG.apiKey || '', baseUrl: CFG_ORIG.baseUrl, model: CFG_ORIG.model }) })
      process.stderr.write('chatEnv: config restored\n')
    }
  } catch (e) { process.stderr.write('chatEnv restore failed: ' + String(e) + '\n') }
  if (MOCK_SRV) { try { MOCK_SRV.close() } catch (e) { } }
}
// 对话回合产物(t23 造,24-28 复用;29 另造一回合 2 图)
const CHAT = { src: '', srcFile: '', prompt: '', size: '', model: '' }
let e2eOrigin = ''   // main() 记录实例 origin,FATAL 兜底还原 config 用
// 新会话 + 发一条消息(composer 是宿主 contenteditable;probe14/15 实测 execCommand+Enter 可靠)
async function chatSend(page, text) {
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /新会话/.test(x.textContent || '')); if (b) b.click() })
  await page.waitForTimeout(1500)
  const ok = await page.evaluate((text) => {
    const ed = document.querySelector('[contenteditable="true"]')
    if (!ed) return false
    ed.focus()
    document.execCommand('insertText', false, text)
    return true
  }, text)
  if (!ok) return false
  await page.keyboard.press('Enter')
  return true
}
// 找对话工具卡(带动作行;回合尾 TailImage 无 .snx-tv-acc,天然排除),按图 src 匹配
const chatCard = (page) => page.evaluate((srcFile) => {
  const card = [...document.querySelectorAll('.snx-tv')]
    .find((c) => c.querySelector('.snx-tv-acc') && [...c.querySelectorAll('.snx-tv-img img')].some((i) => (i.getAttribute('src') || '').includes(srcFile)))
  if (!card) return null
  const img = card.querySelector('.snx-tv-img img')
  const pr = card.querySelector('.snx-tv-prompt')
  return {
    src: img ? img.getAttribute('src') : '',
    promptFull: pr ? (pr.getAttribute('title') || '') : '',
    promptShown: pr ? pr.textContent.trim() : '',
    btns: [...card.querySelectorAll('.snx-tv-btns button')].map((b) => b.textContent.trim()),
    copyBtn: !!card.querySelector('.snx-tv-copy'),
  }
}, CHAT.srcFile)
const readWaitTimer = (page) => page.evaluate(() => {
  const w = document.querySelector('.snx-tv-wait')
  if (!w) return null
  const b = w.querySelector('b')
  const ring = w.querySelector('.ring')
  return { txt: (w.textContent || '').replace(/\s+/g, ' ').trim(), sec: b ? parseInt(b.textContent, 10) : null, ring: !!ring && ring.getBoundingClientRect().width > 4 }
})

// ══════════════ 13 条断言 ══════════════

// 1. 实例加载:window.__snxDebug.step==='done'(domain p0)
async function t01_load(page, url) {
  const steps = []
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
  let step = 'init', errs = []
  try {
    await page.waitForFunction(() => window.__snxDebug && window.__snxDebug.step === 'done', null, { timeout: 30000 })
    const d = await page.evaluate(() => ({ step: window.__snxDebug.step, errs: window.__snxDebug.errs || [] }))
    step = d.step; errs = d.errs
  } catch (e) {
    const d = await page.evaluate(() => (window.__snxDebug || {})).catch(() => ({}))
    step = d.step || '(no __snxDebug)'; errs = d.errs || []
  }
  steps.push(`__snxDebug.step=${step}`, errs.length ? `errs=${JSON.stringify(errs).slice(0, 200)}` : 'errs=0')
  await shot(page, '01', 'load')
  return { pass: step === 'done' && errs.length === 0, steps }
}

// 2. 宽度回归:全部视图 × 300/480/720/960,横向真实溢出=0(排除 overflow:hidden 设计性截断)(domain ui)
async function t02_width(page) {
  const steps = []
  const tabs = await tabNames(page)
  steps.push(`views=${JSON.stringify(tabs)}`)
  const bad = []
  for (const W of WIDTHS) {
    for (const tab of tabs) {
      await switchTab(page, tab)
      await setProWidth(page, W)
      const issues = await page.evaluate((W) => {
        const pro = document.querySelector('.snx-pro')
        if (!pro) return ['(no .snx-pro)']
        const out = []
        const seen = new Set()
        for (const el of pro.querySelectorAll('*')) {
          const r = el.getBoundingClientRect()
          if (r.width < 4 || r.height < 4) continue
          const cs = getComputedStyle(el)
          if (cs.display === 'none' || cs.visibility === 'hidden') continue
          const dx = el.scrollWidth - el.clientWidth
          if (dx > 3 && el.clientWidth > 0 && cs.overflowX !== 'hidden' && cs.overflowX !== 'clip') {
            const cls = (el.className || '').toString().split(' ')[0] || el.tagName
            const key = cls + ':' + Math.min(Math.round(dx / 10), 30)
            if (!seen.has(key)) { seen.add(key); out.push(`${cls}(w${W},+${Math.round(dx)}px,ovr=${cs.overflowX})`) }
          }
        }
        return out
      }, W)
      if (issues.length) bad.push(`${tab}@${W}: ${issues.slice(0, 3).join(', ')}`)
    }
  }
  await setProWidth(page, 300)
  await shot(page, '02', 'w300')
  await page.evaluate(() => { const p = document.querySelector('.snx-pro'); if (p) p.style.width = '' })
  steps.push(`溢出组合=${bad.length}/${tabs.length * WIDTHS.length}`, bad.length ? `最重=${bad.sort((a, b) => b.length - a.length).slice(0, 3).join(' ;; ')}` : '无真实溢出')
  if (!tabs.length) steps.push('工作台未打开,宽度回归空跑')
  return { pass: tabs.length > 0 && bad.length === 0, steps }
}

// 3. 画廊状态过滤:done 图卡数===done 节点数;pending/error 走占位卡;无破图(domain p0)
async function t03_gallery_filter(page) {
  const steps = []
  const doc = await docInfo(page)
  await switchTab(page, '画廊')
  const g = await page.evaluate(async () => {
    document.querySelectorAll('.snx-gal-grid img').forEach((i) => { i.loading = 'eager' })
    await new Promise((s) => setTimeout(s, 500))
    const all = [...document.querySelectorAll('.snx-gal-grid .snx-gal-item')]
    let broken = 0
    for (const img of document.querySelectorAll('.snx-gal-grid img')) {
      if (img.complete && img.naturalWidth === 0) broken++
    }
    return {
      cards: all.length,
      ph: all.filter((c) => c.className.includes('ph')).length,
      imgCards: all.filter((c) => !c.className.includes('ph')).length,
      broken,
    }
  })
  await shot(page, '03', 'gallery')
  steps.push(`节点(done/pending/error/总)=${doc.done}/${doc.pending}/${doc.error}/${doc.total}`,
    `画廊卡片=${g.cards}(图卡=${g.imgCards},占位卡=${g.ph})`, `破图=${g.broken}`)
  const match = g.imgCards === doc.done && g.ph === doc.pending + doc.error
  return { pass: match && g.broken === 0 && g.cards > 0, steps }
}

// 4. 灯箱缩放平移:双击开灯箱→滚轮放大两档→stage 出现滚动→按住拖拽平移生效→双击复位(domain p0)
// 注:.snx-lb-stage 为 display:flex + overflow:auto,.snx-lb-imgwrap 默认 flex-shrink:1
// —— 若实现有 flex 收缩缺陷,放大后 scrollWidth 恒等于 clientWidth,平移无效,本用例如实判 FAIL
async function t04_lightbox_zoom(page) {
  const steps = []
  await switchTab(page, '画廊')
  if (!await openLightbox(page)) return { pass: false, steps: ['双击卡片后灯箱(.snx-lb)未出现'] }
  steps.push('双击打开灯箱 ✓')
  const stage = await page.$('.snx-lb-stage')
  const bb = await stage.boundingBox()
  await shot(page, '04', 'open')

  const stageState = () => page.evaluate(() => {
    const s = document.querySelector('.snx-lb-stage')
    const w = document.querySelector('.snx-lb-imgwrap')
    const img = document.querySelector('.snx-lb-img')
    const pct = document.querySelector('.snx-lb-zoom span')
    return { sw: s.scrollWidth, cw: s.clientWidth, wrapW: w.style.width, wrapRect: Math.round(w.getBoundingClientRect().width), imgRect: Math.round(img.getBoundingClientRect().width), pct: pct ? pct.textContent : '' }
  })
  const base = await stageState()
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2)
  for (let i = 0; i < 2; i++) { await page.mouse.wheel(0, -240); await page.waitForTimeout(300) }
  const afterZoom = await stageState()
  steps.push(`放大两档:zoom指示 ${base.pct}→${afterZoom.pct},wrap.style=${afterZoom.wrapW} 但渲染宽=${afterZoom.wrapRect}(stage sw/cw=${afterZoom.sw}/${afterZoom.cw})`)
  await shot(page, '04', 'zoomed')

  let dragDx = 0, dragDy = 0
  if (afterZoom.sw > afterZoom.cw) {
    const before = await page.evaluate(() => { const s = document.querySelector('.snx-lb-stage'); return { l: s.scrollLeft, t: s.scrollTop } })
    await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2)
    await page.mouse.down()
    await page.mouse.move(bb.x + bb.width / 2 - 120, bb.y + bb.height / 2 - 60, { steps: 8 })
    await page.mouse.up()
    await page.waitForTimeout(300)
    const after = await page.evaluate(() => { const s = document.querySelector('.snx-lb-stage'); return { l: s.scrollLeft, t: s.scrollTop } })
    dragDx = after.l - before.l; dragDy = after.t - before.t
    steps.push(`拖拽平移 Δscroll=(${dragDx},${dragDy})`)
  } else {
    steps.push('stage 无真实滚动(scrollWidth<=clientWidth):放大未产生可平移溢出(wrap 被父级 display:flex 收缩,见 client-v4.js:1459-1460),平移不可用')
  }

  await page.mouse.dblclick(bb.x + bb.width / 2, bb.y + bb.height / 2)
  await page.waitForTimeout(450)
  const afterDbl = await stageState()
  const resetOk = afterDbl.sw <= afterDbl.cw + 3
  steps.push(`双击复位后 zoom=${afterDbl.pct},scroll=${afterDbl.sw}/${afterDbl.cw} reset=${resetOk}`)
  await shot(page, '04', 'reset')
  const closed = await closeLightbox(page)
  const pass = afterZoom.sw > afterZoom.cw && (Math.abs(dragDx) > 5 || Math.abs(dragDy) > 5) && resetOk && closed
  return { pass, steps }
}

// 5. 模态守卫:画布选中节点→开灯箱→Delete→关灯箱→节点仍在且选中未丢(domain p0)
async function t05_modal_guard(page) {
  const steps = []
  const before = await docInfo(page)
  await switchTab(page, '画廊')
  const beforeCards = await page.evaluate(() => document.querySelectorAll('.snx-gal-grid .snx-gal-item').length)
  steps.push(`删前:节点 total=${before.total},画廊卡片=${beforeCards}`)

  await switchTab(page, '画布')
  let selected = false
  // v11.2:按节点真实几何点选(相机可能被其他测试会话改过,固定分数坐标不再可靠)
  const pts = []
  try {
    const g = await page.evaluate(() => {
      const stages = window.Konva.stages.map((s) => ({ s, r: s.getContainer().getBoundingClientRect() }))
        .sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height)
      if (!stages.length) return null
      const { s: st, r } = stages[0]
      const l = st.getLayers()[1]
      const nodes = []
      for (const n of st.find((x) => x.getAttr && x.getAttr('snxId') && x.getAttr('snxStatus') === 'done')) {
        nodes.push({ x: n.x(), y: n.y(), w: n.width(), h: n.height() })
      }
      return { cam: { x: l.x(), y: l.y(), scale: l.scaleX() }, rect: { x: r.x, y: r.y, w: r.width, h: r.height }, nodes }
    })
    if (g && g.nodes.length) {
      for (const n of g.nodes) {
        const sx = g.rect.x + g.cam.x + (n.x + n.w / 2) * g.cam.scale
        const sy = g.rect.y + g.cam.y + (n.y + n.h / 2) * g.cam.scale
        if (sx > g.rect.x + 2 && sx < g.rect.x + g.rect.w - 2 && sy > g.rect.y + 2 && sy < g.rect.y + g.rect.h - 2) pts.push([sx, sy])
      }
    }
  } catch { }
  const box = await (await page.$('.snx-canvas-stage, .snx-cv-stage')).boundingBox().catch(() => null)
  if (box) {
    for (const [fx, fy] of [[0.5, 0.5], [0.45, 0.45], [0.55, 0.55], [0.5, 0.4], [0.6, 0.5], [0.4, 0.6]]) pts.push([box.x + box.width * fx, box.y + box.height * fy])
  }
  for (const [px, py] of pts) {
    await page.mouse.click(px, py)
    await page.waitForTimeout(250)
    if (await page.$('.snx-ab')) { selected = true; break }
  }
  if (!selected) { steps.push('画布点不出选中(.snx-ab 未出现)'); await shot(page, '05', 'noselect'); return { pass: false, steps } }
  steps.push('画布节点已选中(.snx-ab 可见)')

  await switchTab(page, '画廊')
  if (!await openLightbox(page)) { steps.push('灯箱未出现'); return { pass: false, steps } }
  steps.push('灯箱已打开')
  await page.keyboard.press('Delete')
  await page.waitForTimeout(500)
  steps.push('灯箱开启态已按 Delete')
  await shot(page, '05', 'guard')

  const closed = await closeLightbox(page)
  steps.push(`灯箱已关闭=${closed}`)
  const after = await docInfo(page)
  await switchTab(page, '画廊')
  const afterCards = await page.evaluate(() => document.querySelectorAll('.snx-gal-grid .snx-gal-item').length)
  await switchTab(page, '画布')
  const stillSel = await page.evaluate(() => {
    const ab = document.querySelector('.snx-ab')
    return ab ? getComputedStyle(ab).display !== 'none' : false
  })
  steps.push(`删后:节点 total=${after.total},画廊卡片=${afterCards},画布选中保持=${stillSel}`)
  return { pass: closed && after.total === before.total && afterCards === beforeCards && stillSel, steps }
}

// 6. 画廊交互:hover 轻操作组;Ctrl+点击计数标签;批量删除走应用内确认;删后撤销复原(domain gallery)
async function t06_gallery_interact(page) {
  const steps = []
  await switchTab(page, '画廊')
  const card = await galCard(page)
  if (!card) return { pass: false, steps: ['画廊无 done 卡片'] }
  const beforeDoc = await docInfo(page)

  // hover:ops 条 opacity 0→1(按钮常驻 DOM,CSS 控制显隐)。
  // 先清掉历史选择(此前用例的单/双击会留下「单选」态:.sel 卡 ops 常亮),再把鼠标停到中性位
  const opsOpacity = () => page.evaluate(() => {
    const o = document.querySelector('.snx-gal-grid .snx-gal-item:not(.ph) .snx-gal-item-ops')
    return o ? getComputedStyle(o).opacity : null
  })
  const preSel = await page.evaluate(() => document.querySelectorAll('.snx-gal-item.sel').length)
  if (preSel > 0) {
    await page.evaluate(() => { const b = [...document.querySelectorAll('.snx-gal-bulk button')].find((x) => /清空/.test(x.textContent || '')); if (b) b.click() })
    await page.waitForTimeout(400)
  }
  await page.mouse.move(5, 400)
  await page.waitForTimeout(450)
  const opBefore = await opsOpacity()
  const card1box = await (await galCard(page)).boundingBox()
  await page.mouse.move(card1box.x + card1box.width / 2, card1box.y + card1box.height / 2)
  await page.waitForTimeout(400)
  const opAfter = await opsOpacity()
  await shot(page, '06', 'hover')
  steps.push(`hover 后 ops opacity ${opBefore}→${opAfter}(测量前预选=${preSel}张,已清)`)
  const hoverOk = parseFloat(opAfter) > 0.9 && parseFloat(opBefore) < 0.1

  // Ctrl+点击两张 → 计数标签(显式 mouse down/up + Control,坐标现查)
  const ctrlClickCard = async (idx) => {
    const el = await page.evaluate((idx) => {
      const c = [...document.querySelectorAll('.snx-gal-grid .snx-gal-item:not(.ph)')][idx]
      if (!c) return null
      const r = c.getBoundingClientRect()
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    }, idx)
    if (!el) return false
    await page.mouse.move(el.x, el.y)
    await page.keyboard.down('Control')
    await page.mouse.down(); await page.mouse.up()
    await page.keyboard.up('Control')
    await page.waitForTimeout(400)
    return true
  }
  const selTag = () => page.evaluate(() => { const el = document.querySelector('.snx-gal-bulk .ct'); return el ? el.textContent.trim() : '' })
  const click1 = await ctrlClickCard(0)
  const tag1 = await selTag()
  const click2 = await ctrlClickCard(1)
  const tag = await selTag()
  await shot(page, '06', 'ctrlsel')
  steps.push(`Ctrl+点击第1张=${click1}→标签=${JSON.stringify(tag1)};第2张=${click2}→标签=${JSON.stringify(tag)}`)
  const tagOk = /^1\s*张已选$/.test(tag1) && /^2\s*张已选$/.test(tag)

  // 批量删除 → 应用内确认(.snx-cfm-backdrop),原生 confirm 不触发
  let confirmOk = false, deleted = false
  if (tagOk) {
    await page.evaluate(() => { const b = document.querySelector('.snx-gal-bulk .bt.danger'); if (b) b.click() })
    const cfm = await page.waitForSelector('.snx-cfm-backdrop', { timeout: 3000 }).catch(() => null)
    const native = await page.evaluate(() => window.__nativeProbes.confirm.length)
    steps.push(`批量删除弹层=${cfm ? '.snx-cfm-backdrop(应用内)' : '(未出现)'},原生confirm=${native}次`)
    if (cfm) {
      await page.evaluate(() => { const b = [...document.querySelectorAll('.snx-cfm-b')].find((x) => x.className.includes('danger')); if (b) b.click() })
      await page.waitForTimeout(700)
      const afterDoc = await docInfo(page)
      deleted = afterDoc.done === beforeDoc.done - 2
      steps.push(`确认后 done 节点 ${beforeDoc.done}→${afterDoc.done}(删 2 张=${deleted})`)
      confirmOk = deleted
      // 撤销复原:画布页 Ctrl+Z
      await switchTab(page, '画布')
      await page.keyboard.press('Control+z')
      await page.waitForTimeout(800)
      const restored = await docInfo(page)
      steps.push(`Ctrl+Z 撤销后 done=${restored.done}(复原=${restored.done === beforeDoc.done})`)
      await switchTab(page, '画廊')
    }
  } else {
    steps.push('计数标签未出现,批量删除路径未触发')
  }
  await page.keyboard.press('Escape').catch(() => {})
  return { pass: hoverOk && tagOk && confirmOk, steps }
}

// 7. 右键菜单:画廊卡片右键出现上下文菜单,含 移入画板/删除 等项(domain gallery)
async function t07_context_menu(page) {
  const steps = []
  await switchTab(page, '画廊')
  let card = await galCard(page)
  if (!card) return { pass: false, steps: ['画廊无卡片'] }
  const readMenu = () => page.evaluate(() => {
    const m = document.querySelector('.snx-gal-menu')
    if (!m) return null
    const cs = getComputedStyle(m)
    if (cs.display === 'none' || m.getBoundingClientRect().width < 30) return null
    return (m.textContent || '').replace(/\s+/g, ' ').slice(0, 150)
  })
  let bb = await card.boundingBox()
  await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2, { button: 'right' })
  await page.waitForTimeout(500)
  let items = await readMenu()
  if (!items || !/移入画板/.test(items)) {
    // 单卡菜单若无「移入画板」,Ctrl+选两张再右键(批量菜单)
    await page.keyboard.press('Escape').catch(() => {}); await page.mouse.click(5, 5); await page.waitForTimeout(300)
    const cards = await page.$$('.snx-gal-grid .snx-gal-item:not(.ph)')
    if (cards.length >= 2) {
      await page.keyboard.down('Control')
      await cards[0].click(); await page.waitForTimeout(120)
      await cards[1].click()
      await page.keyboard.up('Control'); await page.waitForTimeout(300)
    }
    card = await galCard(page)
    bb = await card.boundingBox()
    await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2, { button: 'right' })
    await page.waitForTimeout(500)
    items = await readMenu()
  }
  await shot(page, '07', 'ctxmenu')
  steps.push(items ? `菜单出现,项=${JSON.stringify(items)}` : '右键后未出现 .snx-gal-menu')
  await page.keyboard.press('Escape').catch(() => {})
  await page.mouse.click(5, 5)
  return { pass: !!items && /移入画板/.test(items) && /删除/.test(items), steps }
}

// 8. 风格芯片互斥:空提示词→点「电影」→点「动漫」→生效风格后缀唯一;再点当前芯片可清除(domain form)
// v10 设计:后缀存 styleId,提交时 p+styleSuffix() 统一拼接,不进 textarea。
// 「只有一段」⇔ 风格芯片 .on 唯一;textarea 断言不含任何风格后缀残段。
async function t08_style_chips(page) {
  const steps = []
  await switchTab(page, '生图')
  const ta = await page.$('.snx-gen-ta')
  if (!ta) return { pass: false, steps: ['找不到提示词输入框 .snx-gen-ta'] }
  await ta.click(); await ta.fill(''); await page.waitForTimeout(200)
  const onChips = () => page.evaluate(() => [...document.querySelectorAll('.snx-gen-styles .snx-gen-chip.on')].map((b) => b.textContent.trim()))
  const clickChip = (label) => page.evaluate((label) => {
    const b = [...document.querySelectorAll('.snx-gen-styles .snx-gen-chip')].find((x) => x.textContent.trim() === label)
    if (b) { b.click(); return true }
    return false
  }, label)
  const startOn = await onChips()
  if (!await clickChip('电影')) return { pass: false, steps: ['找不到「电影」风格芯片'] }
  await page.waitForTimeout(250)
  const on1 = await onChips()
  if (!await clickChip('动漫')) return { pass: false, steps: ['找不到「动漫」风格芯片'] }
  await page.waitForTimeout(250)
  const on2 = await onChips()
  const taMid = await page.evaluate(() => document.querySelector('.snx-gen-ta').value)
  const sigsInTa = STYLE_SIGS.filter((s) => taMid.includes(s))
  await clickChip('动漫')
  await page.waitForTimeout(250)
  const on3 = await onChips()
  const taEnd = await page.evaluate(() => document.querySelector('.snx-gen-ta').value)
  await shot(page, '08', 'styles')
  steps.push(`初始.on=${JSON.stringify(startOn)}`, `点电影→.on=${JSON.stringify(on1)}`,
    `再点动漫→.on=${JSON.stringify(on2)}(互斥=${on2.length === 1 && on2[0] === '动漫'})`,
    `textarea="${taMid.slice(0, 50)}"含后缀残段=${sigsInTa.length}段`,
    `再点动漫(清除)→.on=${JSON.stringify(on3)},textarea="${taEnd.slice(0, 30)}"`)
  const pass = on1.length === 1 && on1[0] === '电影' && on2.length === 1 && on2[0] === '动漫' && sigsInTa.length === 0 && on3.length === 0 && taEnd.trim() === ''
  return { pass, steps }
}

// 9. 尺寸芯片:默认有芯片常亮;点 16:9 后尺寸显示 2048x1152(domain form)
async function t09_size_chips(page) {
  const steps = []
  await switchTab(page, '生图')
  const def = await page.evaluate(() => {
    const on = [...document.querySelectorAll('.snx-gen-fsize-row .snx-gen-chip.on, .snx-gen-fsize .snx-gen-chip.on')]
    return on.map((b) => b.textContent.trim())
  })
  steps.push(`默认常亮芯片=${JSON.stringify(def)}`)
  const has169 = await page.evaluate(() => {
    const b = [...document.querySelectorAll('.snx-gen-fsize-row .snx-gen-chip, .snx-gen-fsize .snx-gen-chip')].find((x) => x.textContent.trim() === '16:9')
    if (!b) return false
    b.click()
    return true
  })
  await page.waitForTimeout(300)
  const shown = await page.evaluate(() => {
    const txt = (document.querySelector('.snx-gen-fsize, .snx-gen-form') || {}).textContent || ''
    const inputs = [...document.querySelectorAll('.snx-gen-form input')].map((i) => i.value).join(' ')
    return { txt: /2048\s*[x×]\s*1152/.test(txt), inputs: /2048\s*[x×]\s*1152/.test(inputs) }
  })
  steps.push(`16:9 芯片存在=${has169}`, `点后尺寸显示 2048x1152=${shown.txt || shown.inputs}`)
  await shot(page, '09', 'size')
  // 复位 1:1
  await page.evaluate(() => { const b = [...document.querySelectorAll('.snx-gen-fsize-row .snx-gen-chip, .snx-gen-fsize .snx-gen-chip')].find((x) => x.textContent.trim() === '1:1'); if (b) b.click() })
  return { pass: def.length >= 1 && has169 && (shown.txt || shown.inputs), steps }
}

// 10. 回填热键:灯箱工具条有 R/P/S/D 回填按钮组;R=整套回填后关灯箱跳生图,
//     P/S/D=v12 新语义:停留灯箱+对应行高亮,生图表单在灯箱背后同步更新(client-v4.js:7414)(domain form)
async function t10_backfill_hotkeys(page) {
  const steps = []
  await switchTab(page, '画廊')
  const card = await galCard(page)
  if (!card) return { pass: false, steps: ['画廊无卡片,无法开灯箱'] }
  const src = await card.evaluate((c) => { const i = c.querySelector('.snx-gal-item-img img'); return i ? i.getAttribute('src') : '' })
  const node = await page.evaluate(async (src) => {
    const j = await (await fetch('/api/sensenova/canvas')).json()
    return ((j.doc && j.doc.nodes) || []).find((n) => n.src === src) || null
  }, src)
  if (!node) return { pass: false, steps: [`画布 API 中找不到卡片节点(src=${src})`] }
  const nodePrompt = String(node.prompt || '').replace(/^💬\s*/, '')
  const nodeSeed = node.params && typeof node.params.seed === 'number' ? node.params.seed : -1
  // sizeForAspect(client-v4.js:2284):按宽高比吸附到已验证 SIZES=[[2048,2048],[2752,1536],[1536,2752],[2560,720],[2048,1152]]
  const SIZES = [[2048, 2048], [2752, 1536], [1536, 2752], [2560, 720], [2048, 1152]]
  const expSize = (() => {
    if (node.params && node.params.size) return node.params.size
    const a = (node.w || 1) / (node.h || 1)
    let best = SIZES[0], bd = Infinity
    for (const s of SIZES) { const d = Math.abs(s[0] / s[1] - a); if (d < bd) { bd = d; best = s } }
    return best[0] + 'x' + best[1]
  })()
  steps.push(`目标节点 prompt=${JSON.stringify(nodePrompt.slice(0, 30))},seed=${nodeSeed},期望回填尺寸=${expSize}(原图 ${node.w}x${node.h})`)

  const btns = await page.evaluate(() => { void 0; return [] })
  void btns
  // 先展开高级面板(种子输入),记录基线
  const readForm = () => page.evaluate(() => {
    const ta = document.querySelector('.snx-gen-ta')
    const seedEl = document.querySelector('.snx-gen-seed input')
    const sizeTxt = (document.querySelector('.snx-gen-fsize') || {}).textContent || ''
    const onChips = [...document.querySelectorAll('.snx-gen-fsize .snx-gen-chip.on')].map((b) => b.textContent.trim()).join('|')
    return { prompt: ta ? ta.value : null, seed: seedEl ? seedEl.value : null, sizeTxt: sizeTxt.slice(0, 120), onChips }
  })
  await switchTab(page, '生图')
  await page.evaluate(() => { const t = document.querySelector('.snx-gen-fneg-tg'); if (t && !document.querySelector('.snx-gen-seed input')) t.click() })
  await page.waitForTimeout(300)
  const base = await readForm()

  // v12 语义(client-v4.js:7414):R=整套回填,回填后关灯箱跳生图;P/S/D=行级回填,停留灯箱+对应行高亮,
  // 生图表单在灯箱背后同步更新(DOM 可读)。旧预期「P/S/D 回填后灯箱自动关」随 v12 失效,按新语义断言。
  const pressKey = async (key) => {
    await switchTab(page, '画廊')
    if (!await openLightbox(page)) return { opened: false, lbClosed: false }
    await page.keyboard.press(key)
    await page.waitForTimeout(600)
    return { opened: true, lbClosed: !(await page.$('.snx-lb')) }
  }

  // R:回填全部 → 灯箱自动关+跳生图,表单 prompt===node.prompt
  let rOk = false
  const rr = await pressKey('r')
  if (rr.opened && rr.lbClosed) {
    await switchTab(page, '生图')
    const f = await readForm()
    rOk = f.prompt === nodePrompt
    steps.push(`R 回填:灯箱自动关=${rr.lbClosed},prompt=${JSON.stringify((f.prompt || '').slice(0, 30))}(期望=${JSON.stringify(nodePrompt.slice(0, 30))})匹配=${rOk}`)
  } else steps.push('R:灯箱未开或按键后未关闭(v12 R 应关灯箱跳生图)', `openLightbox 失败原因=${LB_LAST_ERR}`)

  // P:仅提示词 → v12:停留灯箱;切到生图(灯箱保持打开)后 GenForm 按 genPrefs 挂载,读回填值
  await switchTab(page, '生图')
  await page.evaluate(() => { const ta = document.querySelector('.snx-gen-ta'); if (ta) { ta.focus() } })
  await page.fill('.snx-gen-ta', '')
  let pOk = false
  const pr = await pressKey('p')
  if (pr.opened && !pr.lbClosed) {
    await switchTab(page, '生图')
    const lbStill1 = !!(await page.$('.snx-lb'))
    const f = await readForm()
    pOk = f.prompt === nodePrompt && lbStill1
    steps.push(`P 回填(v12 停留灯箱):切生图后灯箱保持=${lbStill1},prompt=${JSON.stringify((f.prompt || '').slice(0, 30))}匹配=${pOk}`)
  } else steps.push(`P:opened=${pr.opened},lbClosed=${pr.lbClosed}(v12 P 应回填且不关灯箱)`, `openLightbox 失败原因=${LB_LAST_ERR}`)
  if (pr.opened) await closeLightbox(page)

  // S:仅种子 → 停留灯箱
  let sOk = false
  const sr = await pressKey('s')
  if (sr.opened && !sr.lbClosed) {
    await switchTab(page, '生图')
    const lbStill1 = !!(await page.$('.snx-lb'))
    await page.evaluate(() => { const t = document.querySelector('.snx-gen-fneg-tg'); if (t && !document.querySelector('.snx-gen-seed input')) t.click() })
    await page.waitForTimeout(300)
    const f = await readForm()
    sOk = f.seed !== null && parseInt(f.seed, 10) === nodeSeed && lbStill1
    steps.push(`S 回填(v12 停留灯箱):切生图后灯箱保持=${lbStill1},seed=${f.seed}(期望=${nodeSeed})匹配=${sOk}`)
  } else steps.push(`S:opened=${sr.opened},lbClosed=${sr.lbClosed}(v12 S 应回填且不关灯箱)`, `openLightbox 失败原因=${LB_LAST_ERR}`)
  if (sr.opened) await closeLightbox(page)

  // D:仅尺寸 → 停留灯箱
  let dOk = false
  const dr = await pressKey('d')
  if (dr.opened && !dr.lbClosed) {
    await switchTab(page, '生图')
    const lbStill1 = !!(await page.$('.snx-lb'))
    const f = await readForm()
    dOk = (f.sizeTxt + ' ' + f.onChips).includes(expSize) && lbStill1
    steps.push(`D 回填(v12 停留灯箱):切生图后灯箱保持=${lbStill1},尺寸显示含 ${expSize}=${dOk}(常亮芯片=${JSON.stringify(f.onChips)})`)
  } else steps.push(`D:opened=${dr.opened},lbClosed=${dr.lbClosed}(v12 D 应回填且不关灯箱)`, `openLightbox 失败原因=${LB_LAST_ERR}`)
  if (dr.opened) await closeLightbox(page)

  await shot(page, '10', 'hotkeys')
  // 清场:清提示词、尺寸回 1:1
  await page.evaluate(() => { const ta = document.querySelector('.snx-gen-ta'); if (ta) ta.focus() })
  await page.fill('.snx-gen-ta', '').catch(() => {})
  await page.evaluate(() => { const b = [...document.querySelectorAll('.snx-gen-fsize .snx-gen-chip')].find((x) => x.textContent.trim() === '1:1'); if (b) b.click() })
  return { pass: rOk && pOk && sOk && dOk, steps }
}

// 11. SnxSelect 键盘:模型下拉可聚焦,ArrowDown 展开、方向键移动高亮、Enter 选中(domain ui)
async function t11_snxselect_kbd(page) {
  const steps = []
  await switchTab(page, '生图')
  const btns = await page.$$('.snx-gen .snx-sel-btn')
  let btn = null, btnLabel = ''
  for (const b of btns) {
    const t = (await b.evaluate((x) => x.textContent.trim()))
    if (/模型|默认/.test(t)) { btn = b; btnLabel = t; break }
  }
  if (!btn) return { pass: false, steps: ['生图表单找不到模型下拉 .snx-sel-btn'] }
  await btn.focus()
  const focused = await page.evaluate(() => document.activeElement && document.activeElement.className.includes('snx-sel-btn'))
  steps.push(`可聚焦=${focused}(初始=${JSON.stringify(btnLabel)})`)
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(350)
  let open = !!(await page.$('.snx-sel-pop'))
  steps.push(`ArrowDown 展开=${open}`)
  let moved = false, enterSel = false, pickedLabel = ''
  if (open) {
    const hl = () => page.evaluate(() => {
      const o = [...document.querySelectorAll('.snx-sel-pop .snx-sel-opt')]
      return { n: o.length, hl: o.findIndex((x) => x.className.includes('hl')), labels: o.map((x) => x.textContent.trim().slice(0, 22)) }
    })
    const h0 = await hl()
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(250)
    const h1 = await hl()
    moved = h1.hl !== h0.hl
    steps.push(`选项=${h0.n},高亮 idx ${h0.hl}→${h1.hl}(移动=${moved}),目标项=${JSON.stringify(h1.labels[h1.hl] || '')}`)
    pickedLabel = h1.labels[h1.hl] || ''
    await page.keyboard.press('Enter')
    await page.waitForTimeout(350)
    open = !!(await page.$('.snx-sel-pop'))
    const nowLabel = await btn.evaluate((x) => x.textContent.trim())
    enterSel = !open && nowLabel !== btnLabel && pickedLabel && nowLabel.includes(pickedLabel.slice(0, 10))
    steps.push(`Enter 后收起=${!open},按钮标签 "${btnLabel}"→"${nowLabel}"(选中生效=${enterSel})`)
    // 复原:重开选第一项(默认)
    await btn.focus()
    await page.keyboard.press('ArrowDown'); await page.waitForTimeout(300)
    await page.evaluate(() => { const o = document.querySelector('.snx-sel-pop .snx-sel-opt'); if (o) o.click() })
    await page.waitForTimeout(300)
    steps.push(`复原后标签=${JSON.stringify(await btn.evaluate((x) => x.textContent.trim()))}`)
  } else {
    steps.push('下拉未展开,方向键/Enter 不可测')
  }
  await shot(page, '11', 'select')
  await page.keyboard.press('Escape').catch(() => {})
  return { pass: !!focused && open === false && moved && enterSel, steps }
}

// 12. 队列清理:「清除已失败」按钮存在(需 error>0),经应用内确认后 error 项消失(domain form)
async function t12_queue_clear_failed(page) {
  const steps = []
  let doc = await docInfo(page)
  if (doc.error === 0) {
    const seeded = await seedErrorNode(page)
    doc = await docInfo(page)
    steps.push(`无失败项→拦截 generate 返回500 造 1 条(不触真实API):${seeded},现 error=${doc.error}`)
  }
  await switchTab(page, '队列')
  const state = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => /清除已失败/.test(b.textContent || ''))
    const errStat = [...document.querySelectorAll('.snx-queue-summary .stat')].find((s) => /失败/.test(s.textContent || '') && !/重跑/.test(s.textContent || ''))
    return { hasBtn: !!btn, errN: errStat ? (errStat.querySelector('.n') || {}).textContent : null }
  })
  steps.push(`「清除已失败」按钮=${state.hasBtn},队列失败计数=${state.errN},API error=${doc.error}`)
  await shot(page, '12', 'queue')
  let cleared = false, inApp = false, native = -1
  if (state.hasBtn) {
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /清除已失败/.test(x.textContent || '')); if (b) b.click() })
    const cfm = await page.waitForSelector('.snx-cfm-backdrop', { timeout: 3000 }).catch(() => null)
    inApp = !!cfm
    native = await page.evaluate(() => window.__nativeProbes.confirm.length)
    if (cfm) await page.evaluate(() => { const b = [...document.querySelectorAll('.snx-cfm-b')].find((x) => x.className.includes('danger')); if (b) b.click() })
    await page.waitForTimeout(800)
    const after = await docInfo(page)
    cleared = after.error === 0
    steps.push(`应用内确认弹层=${inApp}(.snx-cfm-backdrop),原生confirm=${native}次`, `确认后 API error=${after.error}(消失=${cleared})`)
    await shot(page, '12', 'cleared')
  } else {
    steps.push('按钮未渲染(client 仅 error>0 时渲染,见 client-v4.js:4944)')
  }
  return { pass: state.hasBtn && inApp && native === 0 && cleared, steps }
}

// 13. 原生弹窗清零:全程探针,任何操作不触发 window.confirm/prompt/alert(domain form)
async function t13_native_dialogs(page) {
  const probes = await page.evaluate(() => window.__nativeProbes)
  const total = probes.confirm.length + probes.prompt.length + probes.alert.length
  return {
    pass: total === 0,
    steps: [`confirm=${probes.confirm.length}`, `prompt=${probes.prompt.length}`, `alert=${probes.alert.length}`,
      total ? `calls=${JSON.stringify([...probes.confirm, ...probes.prompt, ...probes.alert]).slice(0, 200)}` : '全程无原生弹窗'],
  }
}

// ══════════════ v12 新增 8 条断言 ══════════════

// 画布几何快照:Konva 大 stage 的相机 + done 节点屏幕坐标(端口=右缘中点/中心)
async function cvSnap(page) {
  return page.evaluate(() => {
    const stages = (window.Konva && window.Konva.stages || []).map((s) => ({ s, r: s.getContainer().getBoundingClientRect() }))
      .sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height)
    if (!stages.length) return null
    const { s: st, r } = stages[0]
    const l = st.getLayers()[1]
    const cam = { x: l.x(), y: l.y(), scale: l.scaleX() }
    const inVp = (x, y) => x > r.x + 4 && x < r.x + r.width - 4 && y > r.y + 4 && y < r.y + r.height - 4
    const nodes = []
    for (const k of st.find((x) => x.getAttr && x.getAttr('snxId') && x.getAttr('snxStatus') === 'done')) {
      const sx = (wx) => r.x + cam.x + (k.x() + wx) * cam.scale
      const sy = (wy) => r.y + cam.y + (k.y() + wy) * cam.scale
      nodes.push({
        id: k.getAttr('snxId'),
        port: { x: sx(k.width()), y: sy(k.height() / 2) },
        center: { x: sx(k.width() / 2), y: sy(k.height() / 2) },
        inVp: inVp(sx(k.width() / 2), sy(k.height() / 2)) && inVp(sx(k.width()), sy(k.height() / 2)),
      })
    }
    return { rect: { x: r.x, y: r.y, w: r.width, h: r.height }, cam, nodes }
  })
}
const fetchNodes = (page) => page.evaluate(async () => ((await (await fetch('/api/sensenova/canvas')).json()).doc.nodes) || [])

// 14. 行级回填:灯箱「参数清单」出现参数行且可回填行有按钮→点「尺寸」行按钮→生图表单尺寸变为该图尺寸(domain recall)
async function t14_row_backfill(page) {
  const steps = []
  await switchTab(page, '画廊')
  const card = await galCard(page)
  if (!card) return { pass: false, steps: ['画廊无卡片'] }
  const src = await card.evaluate((c) => { const i = c.querySelector('.snx-gal-item-img img'); return i ? i.getAttribute('src') : '' })
  const node = await page.evaluate(async (src) => {
    const j = await (await fetch('/api/sensenova/canvas')).json()
    return ((j.doc && j.doc.nodes) || []).find((n) => n.src === src) || null
  }, src)
  if (!node) return { pass: false, steps: [`画布 API 找不到卡片节点(src=${src})`] }
  // sizeForAspect(client-v4.js:2284):按宽高比吸附到已验证 SIZES;行级尺寸回填 detail.size=p.size||sizeForAspect(w,h)
  const SIZES = [[2048, 2048], [2752, 1536], [1536, 2752], [2560, 720], [2048, 1152]]
  const expSize = (() => {
    if (node.params && node.params.size) return node.params.size
    const a = (node.w || 1) / (node.h || 1)
    let best = SIZES[0], bd = Infinity
    for (const s of SIZES) { const d = Math.abs(s[0] / s[1] - a); if (d < bd) { bd = d; best = s } }
    return best[0] + 'x' + best[1]
  })()
  await switchTab(page, '生图')
  const baseSize = await page.evaluate(() => { const n = document.querySelector('.snx-gen-fsize .now'); return n ? n.textContent.trim() : '' })
  // v13:基线若与期望回填尺寸相同,先切到 16:9 制造差异——否则「尺寸回填」断言恒真不可证伪
  if (baseSize === expSize) {
    await page.evaluate(() => { const b = [...document.querySelectorAll('.snx-gen-fsize-row .snx-gen-chip, .snx-gen-fsize .snx-gen-chip')].find((x) => x.textContent.trim() === '16:9'); if (b) b.click() })
    await page.waitForTimeout(300)
    const shifted = await page.evaluate(() => { const n = document.querySelector('.snx-gen-fsize .now'); return n ? n.textContent.trim() : '' })
    steps.push(`基线 ${baseSize} 与期望相同→先切 16:9,现基线=${shifted}(差异制造=${shifted !== expSize})`)
  }
  steps.push(`目标节点 ${node.id.slice(0, 8)} 原图 ${node.w}×${node.h},期望回填尺寸=${expSize};表单基线尺寸=${baseSize}`)

  await switchTab(page, '画廊')
  if (!await openLightbox(page)) return { pass: false, steps: steps.concat('双击卡片灯箱未出现') }
  const meta = await page.evaluate(() => {
    const panel = document.querySelector('.snx-lb-side .snx-lb-meta')
    if (!panel) return null
    return {
      header: ((panel.querySelector('.snx-lb-plist-h .t') || {}).textContent || '').trim(),
      rows: [...panel.querySelectorAll('.snx-lb-row')].map((r) => ({
        label: ((r.querySelector('.rl') || {}).textContent || '').trim(),
        hasBtn: !!r.querySelector('button.rb'),
      })),
    }
  })
  if (!meta) { await shot(page, '14', 'nometa'); return { pass: false, steps: steps.concat('灯箱右侧无 .snx-lb-meta 参数清单') } }
  const withBtn = meta.rows.filter((r) => r.hasBtn).map((r) => r.label)
  const noBtn = meta.rows.filter((r) => !r.hasBtn).map((r) => r.label)
  await shot(page, '14', 'meta')
  steps.push(`参数清单「${meta.header}」${meta.rows.length} 行;可回填行=${JSON.stringify(withBtn)},纯信息行=${JSON.stringify(noBtn)}`)

  // 点「尺寸」行尾回填按钮(v12:停留灯箱,toast 确认)
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('.snx-lb-side .snx-lb-row')].find((r) => ((r.querySelector('.rl') || {}).textContent || '').trim() === '尺寸')
    const b = row && row.querySelector('button.rb')
    if (b) b.click()
    return !!b
  })
  await page.waitForTimeout(700)
  const lbStill = !!(await page.$('.snx-lb'))
  const toast = await page.evaluate(() => [...document.querySelectorAll('.snx-toast')].map((t) => t.textContent.trim()).join('§'))
  await shot(page, '14', 'clicked')
  steps.push(`点「尺寸」行按钮:灯箱保持打开=${lbStill},toast=${JSON.stringify(toast.slice(0, 60))}`)

  await switchTab(page, '生图')
  const now = await page.evaluate(() => ({
    now: ((document.querySelector('.snx-gen-fsize .now') || {}).textContent || '').trim(),
    onChips: [...document.querySelectorAll('.snx-gen-fsize .snx-gen-chip.on')].map((b) => b.textContent.trim()),
  }))
  await shot(page, '14', 'form')
  steps.push(`回填后表单尺寸 now=${JSON.stringify(now.now)}(期望=${expSize}),常亮芯片=${JSON.stringify(now.onChips)}`)
  const sizeOk = now.now === expSize
  // v13 语义(SPEC-13 ②,client-v4.js:5065-5067):灯箱「画板」行级回填=写目标画板偏好——
  // 画板行从 v12 的纯信息行变为可回填行;「创建」仍为纯信息行
  const metaOk = meta.rows.length >= 5 && withBtn.includes('尺寸') && withBtn.includes('提示词')
    && withBtn.includes('画板') && noBtn.includes('创建')
  // 复位:基线若是预设档点回该芯片,否则点 1:1
  await page.evaluate((baseSize) => {
    const want = baseSize.replace('x', '×')
    const chips = [...document.querySelectorAll('.snx-gen-fsize-row .snx-gen-chip')]
    const b = chips.find((c) => (c.title || '').startsWith(want)) || chips.find((c) => c.textContent.trim() === '1:1')
    if (b) b.click()
  }, baseSize)
  await page.waitForTimeout(250)
  return { pass: metaOk && lbStill && sizeOk, steps }
}

// 15. 决策面板:生成按钮 hover→浮出面板含「将生成」;清空提示词后面板出现 blocker 文案(domain panel)
async function t15_decide_panel(page) {
  const steps = []
  await switchTab(page, '生图')
  const ta = await page.$('.snx-gen-ta')
  if (!ta) return { pass: false, steps: ['找不到提示词输入框 .snx-gen-ta'] }
  const readPanel = () => page.evaluate(() => {
    const p = document.querySelector('.snx-gen-decide')
    if (!p) return null
    const cs = getComputedStyle(p)
    if (cs.display === 'none' || cs.visibility === 'hidden') return null
    return {
      text: (p.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160),
      blk: p.querySelectorAll('.snx-gen-decide-r.blk').length,
    }
  })
  // 有提示词:hover → 「将生成 N 张 · 模型 · 尺寸 · 目标 · 队列」
  await ta.click(); await ta.fill(''); await page.keyboard.type('AUDIT-DECIDE 决策面板验收', { delay: 6 })
  await page.hover('.snx-gen-go')
  await page.waitForSelector('.snx-gen-decide', { timeout: 3000 }).catch(() => {})
  await page.waitForTimeout(400)   // useLayoutEffect 定位就位
  const withPrompt = await readPanel()
  await shot(page, '15', 'willgen')
  steps.push(`有提示词 hover:面板=${withPrompt ? JSON.stringify(withPrompt.text) : '(未出现)'}`)
  // 清空提示词:hover → blocker(提示词为空)
  await page.evaluate(() => { const t = document.querySelector('.snx-gen-ta'); if (t) t.focus() })
  await page.fill('.snx-gen-ta', '')
  await page.waitForTimeout(300)
  await page.hover('.snx-gen-go')
  await page.waitForSelector('.snx-gen-decide', { timeout: 3000 }).catch(() => {})
  await page.waitForTimeout(400)
  const emptied = await readPanel()
  const goDisabled = await page.evaluate(() => { const b = document.querySelector('.snx-gen-go'); return b ? b.className.includes('disabled') : false })
  await shot(page, '15', 'blocker')
  steps.push(`清空后 hover:面板=${emptied ? JSON.stringify(emptied.text) : '(未出现)'},blocker 行=${emptied ? emptied.blk : 0},生成按钮 disabled=${goDisabled}`)
  // 移开鼠标 → 面板收起
  await page.mouse.move(8, 400)
  await page.waitForTimeout(450)
  const gone = await readPanel()
  steps.push(`鼠标移开:面板收起=${gone === null}`)
  return {
    pass: !!withPrompt && /将生成/.test(withPrompt.text) && withPrompt.blk === 0
      && !!emptied && emptied.blk >= 1 && /提示词为空/.test(emptied.text) && gone === null,
    steps,
  }
}

// 16. 对比三模式:选 2 张图进对比→滑块/并排/叠化按钮组→点「并排」布局变化→点交换→A/B 互换(domain compare)
async function t16_compare_modes(page) {
  const steps = []
  await switchTab(page, '对比')
  const pool = await page.$$('.snx-cmp-pool-item')
  if (pool.length < 2) {
    await shot(page, '16', 'nopool')
    return { pass: false, steps: [`对比池图不足(${pool.length} 张,需≥2)`] }
  }
  await pool[0].click(); await page.waitForTimeout(400)
  await pool[1].click(); await page.waitForTimeout(600)
  const modes = await page.evaluate(() => {
    const seg = document.querySelector('.snx-cmp-mseg')
    if (!seg) return null
    const btns = [...seg.querySelectorAll('.snx-cmp-mbtn')]
    return {
      n: btns.length,
      labels: btns.map((b) => b.textContent.trim()),
      onIdx: btns.findIndex((b) => b.className.includes('on')),
      swap: !!document.querySelector('.snx-cmp-mswap'),
    }
  })
  if (!modes) { await shot(page, '16', 'nomodes'); return { pass: false, steps: ['选 2 张后未出现模式按钮组(.snx-cmp-mseg)'] } }
  const stageState = () => page.evaluate(() => {
    const s = document.querySelector('.snx-cmp-stage')
    const base = document.querySelector('.snx-cmp-base')
    const clipImg = document.querySelector('.snx-cmp-clip img')
    return {
      cls: s ? s.className : '',
      base: base ? base.getAttribute('src') : '',
      clip: clipImg ? clipImg.getAttribute('src') : '',
      handle: !!document.querySelector('.snx-cmp-handle'),
      lbs: [...document.querySelectorAll('.snx-cmp-info .lb')].map((x) => x.textContent.trim()),
    }
  })
  const s0 = await stageState()
  await shot(page, '16', 'slider')
  steps.push(`选 2 张:模式按钮=${modes.n}个${JSON.stringify(modes.labels)}(默认高亮 idx=${modes.onIdx}),交换按钮=${modes.swap}`,
    `滑块态:stage类=${JSON.stringify(s0.cls)},分割手柄=${s0.handle},A层尾=${(s0.base || '').slice(-16)},B层尾=${(s0.clip || '').slice(-16)}`)
  // 点「并排」
  await page.evaluate(() => { const b = [...document.querySelectorAll('.snx-cmp-mbtn')].find((x) => x.textContent.trim() === '并排'); if (b) b.click() })
  await page.waitForTimeout(500)
  const s1 = await stageState()
  const sideOn = await page.evaluate(() => { const b = [...document.querySelectorAll('.snx-cmp-mbtn')].find((x) => x.textContent.trim() === '并排'); return b ? b.className.includes('on') : false })
  await shot(page, '16', 'side')
  steps.push(`点「并排」:按钮高亮=${sideOn},stage类=${JSON.stringify(s1.cls)},手柄消失=${!s1.handle},信息列标签=${JSON.stringify(s1.lbs)},布局变化=${s1.cls !== s0.cls && /m-side/.test(s1.cls)}`)
  // 点「交换」
  await page.evaluate(() => { const b = document.querySelector('.snx-cmp-mswap'); if (b) b.click() })
  await page.waitForTimeout(500)
  const s2 = await stageState()
  await shot(page, '16', 'swapped')
  const swappedOk = s2.base === s0.clip && s2.clip === s0.base && s0.base !== s0.clip
  steps.push(`点「交换」:A层尾=${(s2.base || '').slice(-16)},B层尾=${(s2.clip || '').slice(-16)},A/B 互换=${swappedOk}`)
  // 清空对比槽位(点池子已选项移出,恢复进入前状态)
  await page.evaluate(() => { [...document.querySelectorAll('.snx-cmp-pool-item.on')].forEach((b) => b.click()) })
  await page.waitForTimeout(300)
  return {
    pass: modes.n === 3 && modes.onIdx === 0 && modes.swap && sideOn && !s1.handle && /m-side/.test(s1.cls) && swappedOk,
    steps,
  }
}

// 17. 删除引用警告:对有衍生子图的节点触发删除→确认文案含引用警告字样;取消不真删(domain compare)
async function t17_delete_ref_warning(page) {
  const steps = []
  const findParent = () => page.evaluate(async () => {
    const ns = ((await (await fetch('/api/sensenova/canvas')).json()).doc.nodes) || []
    return ns.find((n) => ns.some((m) => m.parentId === n.id)) || null
  })
  let parent = await findParent()
  const totalBefore = (await fetchNodes(page)).length
  if (!parent) {
    // 无现成父子关系→灯箱「调整→应用」造衍生子图(本地 GPU 滤镜,不触生成 API)
    steps.push('现无父子关系→灯箱调整·应用造子图')
    await switchTab(page, '画廊')
    if (!await openLightbox(page)) return { pass: false, steps: steps.concat('灯箱未出现,无法造子图') }
    await page.evaluate(() => {
      const r = document.querySelector('.snx-lb-adj2 input[type=range]')
      if (!r) return
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(r, 25)
      r.dispatchEvent(new Event('input', { bubbles: true }))
      r.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await page.waitForTimeout(700)
    await page.evaluate(() => { const b = document.querySelector('.snx-lb-adj-save'); if (b && !b.disabled) b.click() })
    const deadline = Date.now() + 15000
    while (Date.now() < deadline && !parent) {
      await page.waitForTimeout(800)
      parent = await findParent()
    }
    await closeLightbox(page)
    if (!parent) return { pass: false, steps: steps.concat('调整应用后仍未出现父子关系') }
  }
  steps.push(`父节点=${parent.id.slice(0, 8)} prompt=${JSON.stringify(String(parent.prompt || '').slice(0, 24))},删前节点总数=${totalBefore}`)
  // 画廊右键父节点卡 → 删除 → 确认弹层(v13 数据量后旧卡可能滚出视口,先 scrollIntoView)
  await switchTab(page, '画廊')
  const box = await page.evaluate((src) => {
    const c = [...document.querySelectorAll('.snx-gal-grid .snx-gal-item:not(.ph)')]
      .find((x) => { const i = x.querySelector('.snx-gal-item-img img'); return i && i.getAttribute('src') === src })
    if (!c) return null
    c.scrollIntoView({ block: 'center' })
    const r = c.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, inVp: r.y >= 0 && r.bottom <= window.innerHeight }
  }, parent.src)
  if (!box) return { pass: false, steps: steps.concat('画廊找不到父节点卡片') }
  await page.mouse.click(box.x, box.y, { button: 'right' })
  await page.waitForTimeout(600)
  const menuDel = await page.evaluate(() => {
    const m = document.querySelector('.snx-gal-menu')
    if (!m) return false
    const b = [...m.querySelectorAll('button')].find((x) => /删除/.test(x.textContent || ''))
    if (b) { b.click(); return true }
    return false
  })
  if (!menuDel) { await shot(page, '17', 'nomenu'); return { pass: false, steps: steps.concat('右键菜单未出现或无「删除」项') } }
  const cfm = await page.waitForSelector('.snx-cfm-backdrop', { timeout: 3000 }).catch(() => null)
  if (!cfm) { await shot(page, '17', 'nocfm'); return { pass: false, steps: steps.concat('删除确认弹层(.snx-cfm-backdrop)未出现') } }
  const desc = await page.evaluate(() => { const d = document.querySelector('.snx-cfm-d'); return d ? d.textContent.trim() : '' })
  await shot(page, '17', 'confirm')
  const warn = /父图/.test(desc) && /衍生自/.test(desc) && /注意/.test(desc)
  steps.push(`确认文案=${JSON.stringify(desc.slice(0, 170))}`, `含引用警告(注意/父图/衍生自)=${warn}`)
  // 取消,不真删
  await page.evaluate(() => { const b = [...document.querySelectorAll('.snx-cfm-b')].find((x) => !x.className.includes('danger')); if (b) b.click() })
  await page.waitForTimeout(600)
  const totalAfter = (await fetchNodes(page)).length
  steps.push(`点取消后节点总数 ${totalBefore}→${totalAfter}(未真删=${totalAfter === totalBefore})`)
  return { pass: warn && totalAfter === totalBefore, steps }
}

// 18. 历史翻阅:textarea 内 Ctrl+↑ 翻出上一条历史(lib.recents 有数据前提下;无数据先制造一条)(domain recall)
async function t18_history_browse(page) {
  const steps = []
  const readRecents = () => page.evaluate(() => {
    try { return (JSON.parse(localStorage.getItem('snx-prompt-lib-v1') || '{}').recents) || [] } catch (e) { return [] }
  })
  let recents = await readRecents()
  steps.push(`lib.recents 现有 ${recents.length} 条`)
  if (!recents.length) {
    // 制造一条:拦截 generate 返回 500(addRecent 在请求前写库,不触真实 API);种子 error 节点随后「清除已失败」
    const seed = 'AUDIT-HIST-' + Date.now()
    await switchTab(page, '生图')
    const ta0 = await page.$('.snx-gen-ta')
    if (!ta0) return { pass: false, steps: steps.concat('找不到提示词输入框') }
    await ta0.click(); await ta0.fill(''); await page.keyboard.type(seed, { delay: 6 })
    await page.route('**/api/sensenova/generate', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'audit: simulated failure' }) }))
    try {
      await page.evaluate(() => { const b = document.querySelector('.snx-gen-go'); if (b) b.click() })
      const deadline = Date.now() + 10000
      while (Date.now() < deadline) {
        await page.waitForTimeout(500)
        recents = await readRecents()
        if (recents.length && recents[0] === seed) break
      }
    } finally { await page.unroute('**/api/sensenova/generate') }
    steps.push(`造历史:提交「${seed.slice(0, 26)}」(generate 拦截 500)→recents[0]命中=${recents[0] === seed}`)
    const d = await docInfo(page)
    if (d.error > 0) {
      await switchTab(page, '队列')
      await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /清除已失败/.test(x.textContent || '')); if (b) b.click() })
      const cfm = await page.waitForSelector('.snx-cfm-backdrop', { timeout: 3000 }).catch(() => null)
      if (cfm) await page.evaluate(() => { const b = [...document.querySelectorAll('.snx-cfm-b')].find((x) => x.className.includes('danger')); if (b) b.click() })
      await page.waitForTimeout(800)
      const d2 = await docInfo(page)
      steps.push(`清理种子 error 节点:${d.error}→${d2.error}`)
    }
    if (recents[0] !== seed) return { pass: false, steps: steps.concat('提交后 lib.recents 未入库') }
  }
  // textarea 内 Ctrl+↑ → 整套替换为 recents[0],toast「历史 1/N」
  await switchTab(page, '生图')
  const ta = await page.$('.snx-gen-ta')
  const baseText = 'AUDIT-HIST-BASE-' + Date.now()
  await ta.click(); await ta.fill(''); await page.keyboard.type(baseText, { delay: 4 })
  await page.focus('.snx-gen-ta')
  await page.keyboard.press('Control+ArrowUp')
  await page.waitForTimeout(700)
  const val = await page.evaluate(() => { const t = document.querySelector('.snx-gen-ta'); return t ? t.value : '' })
  const toasts = await page.evaluate(() => [...document.querySelectorAll('.snx-toast')].map((t) => t.textContent.trim()))
  await shot(page, '18', 'histup')
  const hit = val === recents[0]
  steps.push(`Ctrl+↑ 后 textarea=${JSON.stringify(val.slice(0, 32))}(期望 recents[0]=${JSON.stringify(recents[0].slice(0, 32))})命中=${hit}`,
    `toast=${JSON.stringify(toasts.join('§').slice(0, 60))}`)
  // Ctrl+↓ 越过最新条 → 退出历史还原进入前文本
  await page.keyboard.press('Control+ArrowDown')
  await page.waitForTimeout(500)
  const val2 = await page.evaluate(() => { const t = document.querySelector('.snx-gen-ta'); return t ? t.value : '' })
  steps.push(`Ctrl+↓ 退出历史:textarea 还原=${val2 === baseText}`)
  await page.fill('.snx-gen-ta', '').catch(() => {})
  return { pass: hit && val2 === baseText, steps }
}

// 19. 画布双击:双击画布节点→灯箱打开(第三方审计实测此路 0/4 断裂,真机复验)(domain cvfix)
// 实现:v11.2.1 自检测(Konva 实例重建后 dblclick 永不触发)——同一节点 400ms 内第二次 click 开灯箱(client-v4.js:2701)。
// 注:Playwright 默认双击两次 click 间隔 <60ms,落在第一次单击选中→renderAll 重建 Konva 实例→
// hit 画布 batchDraw 重绘完成前的窗口内(probe8 实测 34ms 时 getIntersection=null),第二次 click 落空——
// 自动化超速伪断裂。真机人速双击(150-380ms 间隔,仍在应用 400ms 判定窗内)为断言口径,超速对照如实记录。
async function t19_canvas_dblclick(page) {
  const steps = []
  await switchTab(page, '画布')
  await page.waitForTimeout(1000)
  // 取视口内与其他 done 节点中心隔离度最高的节点(避开重叠对)
  const target = await page.evaluate(() => {
    const stages = (window.Konva && window.Konva.stages || []).map((s) => ({ s, r: s.getContainer().getBoundingClientRect() })).sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height)
    if (!stages.length) return null
    const { s: st, r } = stages[0]
    const l = st.getLayers()[1]
    const cam = { x: l.x(), y: l.y(), scale: l.scaleX() }
    const cs = [...st.find((x) => x.getAttr && x.getAttr('snxId') && x.getAttr('snxStatus') === 'done')]
      .map((k) => ({ id: k.getAttr('snxId'), cx: r.x + cam.x + (k.x() + k.width() / 2) * cam.scale, cy: r.y + cam.y + (k.y() + k.height() / 2) * cam.scale }))
      .filter((c) => c.cx > r.x + 4 && c.cx < r.x + r.width - 4 && c.cy > r.y + 4 && c.cy < r.y + r.height - 4)
    if (!cs.length) return null
    let best = cs[0], bd = -1
    for (const c of cs) {
      const dmin = Math.min(...cs.filter((o) => o !== c).map((o) => Math.hypot(o.cx - c.cx, o.cy - c.cy)))
      if (dmin > bd) { bd = dmin; best = c }
    }
    return { id: best.id, cx: Math.round(best.cx), cy: Math.round(best.cy), isolation: Math.round(bd) }
  })
  if (!target) { await shot(page, '19', 'nonode'); return { pass: false, steps: ['画布视口内找不到 done 节点'] } }
  steps.push(`目标节点=${target.id.slice(0, 8)} 中心=(${target.cx},${target.cy}),与其他节点中心最近距离=${target.isolation}px`)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  // 超速对照(自动化默认节奏):两次 click 间隔实测,如实记录
  const t0 = Date.now()
  await page.mouse.click(target.cx, target.cy)
  await page.mouse.click(target.cx, target.cy)
  const fastGap = Date.now() - t0
  const lbFast = await page.waitForSelector('.snx-lb', { timeout: 1800 }).catch(() => null)
  steps.push(`超速双击(两次单击 ${fastGap}ms):灯箱=${lbFast ? '出现' : '未出现(命中重建窗口,自动化伪断裂)'}`)
  if (lbFast) await closeLightbox(page)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
  // 人速双击(真实用户节奏,间隔 150ms,在应用 400ms 判定窗内)
  await page.mouse.click(target.cx, target.cy)
  await page.waitForTimeout(150)
  await page.mouse.click(target.cx, target.cy)
  const lb = await page.waitForSelector('.snx-lb', { timeout: 3000 }).catch(() => null)
  let lbId = ''
  if (lb) lbId = await page.evaluate(() => { const e = document.querySelector('.snx-lb-id'); return e ? e.textContent.trim() : '' })
  await shot(page, '19', 'humangap')
  steps.push(`人速双击(间隔 150ms):灯箱=${lb ? '出现' : '未出现'}${lb ? `,lb-id=${lbId}(期望 ${target.id.slice(0, 8)})` : ''}`)
  if (lb) await closeLightbox(page)
  return { pass: !!lb && lbId === target.id.slice(0, 8), steps }
}

// 20. 多选操作条:Ctrl+A 全选→浮动操作条可见且含对齐入口;右键已选中节点→菜单含节点项(下载/回填参数)(domain cvfix)
async function t20_multiselect_bar(page) {
  const steps = []
  await switchTab(page, '画布')
  await page.waitForTimeout(1000)
  // 焦点移出输入框:点画布右下空白角清选择
  const corner = await page.evaluate(() => {
    const el = document.querySelector('.snx-canvas-stage, .snx-cv-stage')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.x + r.width - 12, y: r.y + r.height - 12 }
  })
  if (!corner) return { pass: false, steps: ['找不到画布 stage 容器'] }
  await page.mouse.click(corner.x, corner.y)
  await page.waitForTimeout(400)
  const total = (await fetchNodes(page)).length
  await page.keyboard.press('Control+a')
  await page.waitForTimeout(600)
  const bar = await page.evaluate(() => {
    const ab = document.querySelector('.snx-ab')
    if (!ab) return null
    const cs = getComputedStyle(ab)
    const r = ab.getBoundingClientRect()
    return {
      visible: cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 40,
      tag: ((ab.querySelector('.snx-ab-tag') || {}).textContent || '').trim(),
      aligns: [...ab.querySelectorAll('button')].map((b) => b.title || '').filter((t) => /对齐|分布/.test(t)),
    }
  })
  await shot(page, '20', 'ctrla')
  steps.push(`Ctrl+A(画布 ${total} 节点):多选操作条=${bar ? '出现' : '未出现'}${bar ? `,标签=${JSON.stringify(bar.tag)},对齐入口=${JSON.stringify(bar.aligns)}` : ''}`)
  // 右键已选中的节点(取视口内最顶部的 done 节点,避开锚在选区上方多选条)
  const topNode = await cvSnap(page).then((s) => {
    if (!s) return null
    const vis = s.nodes.filter((n) => n.inVp)
    if (!vis.length) return null
    return vis.reduce((a, b) => (b.center.y < a.center.y ? b : a))
  })
  let menuTxt = null
  if (topNode) {
    await page.mouse.click(topNode.center.x, topNode.center.y, { button: 'right' })
    await page.waitForTimeout(600)
    menuTxt = await page.evaluate(() => {
      const m = document.querySelector('.snx-cv-menu')
      if (!m) return null
      const cs = getComputedStyle(m)
      if (cs.display === 'none' || m.getBoundingClientRect().width < 30) return null
      return (m.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200)
    })
  }
  await shot(page, '20', 'ctxmenu')
  steps.push(`右键已选节点${topNode ? ' ' + topNode.id.slice(0, 8) : ''}:菜单=${menuTxt ? JSON.stringify(menuTxt) : '(未出现)'}`)
  await page.keyboard.press('Escape').catch(() => {})
  await page.waitForTimeout(300)
  await page.mouse.click(corner.x, corner.y)   // 清选择
  const pass = !!bar && bar.visible && /^已选 \d+ 张$/.test(bar.tag) && bar.aligns.length >= 2
    && !!menuTxt && /下载/.test(menuTxt) && /回填参数/.test(menuTxt)
  return { pass, steps }
}

// 21. 画布 toast:画布页触发一次端口改接→toasts 容器非空;测后 Ctrl+Z 复原(parentId 净变化为零)(domain cvfix)
// 22. 队列行展开(SPEC 三.5):造 1 条失败(拦截 500)→ 队列行点击展开 → 详情体含 错误全文/模型/耗时,徽章中文;测后清除失败恢复
async function t22_queue_expand(page) {
  const steps = []
  let doc = await docInfo(page)
  if (doc.error === 0) {
    const seeded = await seedErrorNode(page)
    doc = await docInfo(page)
    steps.push(`无失败项→拦截 generate 500 造 1 条(不触真实API):${seeded},error=${doc.error}`)
  }
  await switchTab(page, '队列')
  await page.waitForTimeout(500)
  const row = await page.$('.snx-qi-error')
  if (!row) { steps.push('队列无失败行'); return { pass: false, steps } }
  const badgeZh = await row.$eval('.snx-qi-st', (el) => el.textContent.trim() === '失败').catch(() => false)
  steps.push(`失败行徽章中文=${badgeZh}(徽章文本=失败)`)
  const before = await row.$('.snx-qi-detail')
  await page.evaluate(() => { const r = document.querySelector('.snx-qi-error'); const c = r && r.querySelector('.snx-qi-chev'); if (c) c.click() })
  await page.waitForTimeout(400)
  const detail = await row.$('.snx-qi-detail')
  const fields = detail ? await detail.evaluate((d) => {
    const txt = d.textContent || ''
    return { errFull: !!d.querySelector('.snx-qi-detail-err'), hasModel: /模型/.test(txt), hasSize: /尺寸/.test(txt), hasTime: /耗时/.test(txt) }
  }) : null
  steps.push(`展开前无详情=${!before},展开后详情体=${!!detail},含错误全文=${fields && fields.errFull},含 模型/尺寸/耗时=${fields && fields.hasModel && fields.hasSize && fields.hasTime}`)
  await shot(page, '22', 'expanded')
  // 清理:清除已失败恢复原状
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /清除已失败/.test(x.textContent || '')); if (b) b.click() })
  const cfm = await page.waitForSelector('.snx-cfm-backdrop', { timeout: 3000 }).catch(() => null)
  if (cfm) await page.evaluate(() => { const b = [...document.querySelectorAll('.snx-cfm-b')].find((x) => x.className.includes('danger')); if (b) b.click() })
  await page.waitForTimeout(800)
  const after = await docInfo(page)
  steps.push(`测后清除失败:API error=${after.error}`)
  return { pass: !before && !!detail && !!fields && fields.errFull && fields.hasModel && fields.hasSize && fields.hasTime && badgeZh && after.error === 0, steps }
}

async function t21_canvas_toast(page) {
  const steps = []
  await switchTab(page, '画布')
  await page.waitForTimeout(1000)
  const doc0 = await page.evaluate(async () => (await (await fetch('/api/sensenova/canvas')).json()).doc)
  let snap = await cvSnap(page)
  // 选改接对:A 的输出端口拖到 B 上→B.parentId=A.id(不能成环、不能已连)
  const pickPair = (s, doc) => {
    if (!s) return null
    const byId = new Map(doc.nodes.map((n) => [n.id, n]))
    const anc = (aId, bNode) => {
      let cur = bNode; const seen = new Set()
      while (cur && cur.parentId && !seen.has(cur.id)) {
        seen.add(cur.id)
        if (cur.parentId === aId) return true
        cur = byId.get(cur.parentId)
      }
      return false
    }
    const done = s.nodes.filter((n) => { const d = byId.get(n.id); return d && d.status === 'done' && !d.hidden })
    for (const A of done) for (const B of done) {
      if (A.id === B.id || !A.inVp || !B.inVp) continue
      const bd = byId.get(B.id)
      if (anc(A.id, bd) || bd.parentId === A.id) continue
      return { A, B, before: bd.parentId || null }
    }
    return null
  }
  let pair = pickPair(snap, doc0)
  if (!pair) { // 视口内凑不出对 → f 键适配后重取
    await page.keyboard.press('f')
    await page.waitForTimeout(900)
    snap = await cvSnap(page)
    pair = pickPair(snap, doc0)
  }
  let toastTxt = '', reLink = false
  if (pair) {
    steps.push(`改接对:A=${pair.A.id.slice(0, 8)} 端口(${Math.round(pair.A.port.x)},${Math.round(pair.A.port.y)}) → B=${pair.B.id.slice(0, 8)}(原 parentId=${pair.before || '无'})`)
    // 基线清场:关掉残留 toast(实测 toast 5 秒自动消失未生效——上一用例 toast 常驻,不清会污染断言)
    const leftAfterClear = await clearToasts(page)
    steps.push(`拖线前清残留 toast,清后 toasts 容器内=${leftAfterClear} 条`)
    await page.mouse.move(pair.A.port.x, pair.A.port.y)
    await page.mouse.down()
    await page.mouse.move(pair.B.center.x, pair.B.center.y, { steps: 12 })
    await page.waitForTimeout(120)
    await page.mouse.up()
    await page.waitForTimeout(600)
    const toasts = await readToasts(page)
    toastTxt = toasts.join('§')
    reLink = toasts.some((t) => /已改接/.test(t))
    steps.push(`拖线改接后 toasts=${JSON.stringify(toastTxt.slice(0, 80))},含「已改接」=${reLink}`)
    // 顺带实测:5 秒后 toast 是否自动消失(探针发现未消失,如实记录)
    await page.waitForTimeout(5500)
    const toasts6 = await readToasts(page)
    steps.push(`改接 toast 5.5 秒后仍在场=${toasts6.some((t) => /已改接/.test(t))}(toast 5 秒自动消失${toasts6.some((t) => /已改接/.test(t)) ? '未生效' : '生效'})`)
    await shot(page, '21', 'relink')
    // 复原:画布 Ctrl+Z(改接前有 pushUndo);失败则 PUT 原文档兜底
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(900)
    let after = await page.evaluate(async () => (await (await fetch('/api/sensenova/canvas')).json()).doc)
    const bNow = (after.nodes.find((n) => n.id === pair.B.id) || {}).parentId || null
    if (bNow !== pair.before) {
      await page.evaluate(async (doc) => { await fetch('/api/sensenova/canvas', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ doc }) }) }, doc0)
      after = await page.evaluate(async () => (await (await fetch('/api/sensenova/canvas')).json()).doc)
      steps.push('Ctrl+Z 未复原→已 PUT 原文档兜底')
    }
    const bRestored = ((after.nodes.find((n) => n.id === pair.B.id) || {}).parentId || null) === pair.before
    steps.push(`B.parentId 复原:${pair.before || '无'}→${bRestored ? pair.before || '无' : '未复原'}(净变化=${bRestored ? 0 : '非零'})`)
    reLink = reLink && bRestored
  } else {
    // 兜底:队列暂停 + 画布页 GenBar 入队 → toast「队列已暂停,任务已入队等待恢复」
    steps.push('视口内凑不出改接对→走队列暂停入队路径')
    await switchTab(page, '队列')
    const paused = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /暂停队列/.test(x.textContent || '')); if (b) { b.click(); return true } return false })
    await page.waitForTimeout(400)
    await switchTab(page, '画布')
    await page.waitForTimeout(600)
    const inp = await page.$('.snx-pbar input')
    if (!paused || !inp) return { pass: false, steps: steps.concat(`暂停按钮=${paused},画布 GenBar=${inp ? '有' : '无'}`) }
    await page.route('**/api/sensenova/generate', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'audit: simulated failure' }) }))
    let toasts = []
    try {
      await clearToasts(page)
      await inp.click(); await inp.type('AUDIT-PAUSE-ENQUEUE', { delay: 6 })
      await page.keyboard.press('Enter')
      await page.waitForTimeout(600)
      toasts = await readToasts(page)
    } finally { await page.unroute('**/api/sensenova/generate') }
    toastTxt = toasts.join('§')
    reLink = toasts.some((t) => /队列已暂停/.test(t))
    steps.push(`暂停期入队 toast=${JSON.stringify(toastTxt.slice(0, 60))},toasts 非空且含「队列已暂停」=${reLink}`)
    await shot(page, '21', 'pause')
    // 清理:恢复队列 + 清除已失败
    await switchTab(page, '队列')
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /继续队列/.test(x.textContent || '')); if (b) b.click() })
    await page.waitForTimeout(400)
    const d = await docInfo(page)
    if (d.error > 0) {
      await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /清除已失败/.test(x.textContent || '')); if (b) b.click() })
      const cfm = await page.waitForSelector('.snx-cfm-backdrop', { timeout: 3000 }).catch(() => null)
      if (cfm) await page.evaluate(() => { const b = [...document.querySelectorAll('.snx-cfm-b')].find((x) => x.className.includes('danger')); if (b) b.click() })
      await page.waitForTimeout(700)
      const d2 = await docInfo(page)
      steps.push(`清理种子 error 节点:${d.error}→${d2.error}`)
    }
  }
  return { pass: reLink, steps }
}

// ══════════════ v13 新增 10 条断言(SPEC-13 两轴并行轮) ══════════════

// 23. 等待生命感:generate 延迟 3s 应答(对话路径在服务端执行,延迟注入于本机 mock 上游——
//     浏览器层拦不到,见文件头 v13 纪律)→新会话发消息令 agent 调 sensenova_generate_image→
//     对话工具卡出现转圈+已耗时计时且 1.6s 后数值增长→响应落地后卡片变结果图(domain chat)
async function t23_chat_pending(page) {
  const steps = []
  const P1 = 'AUDIT-V13 回填与复制验证:一只戴贝雷帽的柴犬在雪夜里提着红灯笼走过京都的巷子,暖色灯光映在湿石板上'
  const cfg = await page.evaluate(async () => { try { return (await (await fetch('/api/sensenova/config')).json()).config } catch (e) { return null } })
  steps.push(`mock 前置:config.baseUrl=${cfg ? cfg.baseUrl : '(读取失败)'},mock 命中数=${MOCK_HITS.length}`)
  if (!cfg || !cfg.baseUrl.includes(':' + MOCK_PORT)) return { pass: false, steps: steps.concat('mock 上游未生效,为不触真实 API 放弃对话回合') }
  let pending = false, growth = -1, became = false, att = 0
  const instruct = `请调用 sensenova_generate_image 工具生成一张图。参数:prompt=「${P1}」(字面量原样传入,不要改写),size=「2752x1536」。直接调用工具,不要回复任何文字,不要请求确认。`
  while (att < 2 && !became) {
    att++
    const sent = await chatSend(page, instruct)
    steps.push(`第${att}次发消息:${sent ? '已提交' : 'composer 未找到'}`)
    if (!sent) break
    // 等 pending 工具卡(agent 首响可能 10-40s)
    const dl = Date.now() + 110000
    while (Date.now() < dl) {
      await page.waitForTimeout(1300)
      const w = await readWaitTimer(page)
      if (w) { pending = true; break }
      const err = await page.evaluate(() => { const e = document.querySelector('.snx-tv-err'); return e ? e.textContent.trim() : '' })
      if (err) { steps.push(`出现错误卡:${err.slice(0, 80)}`); break }
    }
    if (!pending) { steps.push('110s 内未出现 pending 工具卡'); continue }
    const w0 = await readWaitTimer(page)
    await page.waitForTimeout(1600)
    const w1 = (await readWaitTimer(page)) || w0
    growth = w1.sec - w0.sec
    await shot(page, '23', 'pending')
    steps.push(`pending 卡:ring=${w0.ring},文本=「${w0.txt}」(${w0.sec}s)→1.6s 后 ${w1.sec}s(增长=${growth >= 1})`)
    // 等响应落地:pending 卡被结果图卡替换
    const dl2 = Date.now() + 60000
    while (Date.now() < dl2) {
      await page.waitForTimeout(1200)
      became = await page.evaluate(() => !document.querySelector('.snx-tv-wait')
        && !!document.querySelector('.snx-tv .snx-tv-img img[src*="/api/sensenova/image/"]'))
      if (became) break
    }
    steps.push(`响应落地后 pending 消失且卡变结果图=${became}(mock 命中=${MOCK_HITS.length})`)
  }
  const card = became && await chatCard(page)
  if (card) {
    CHAT.src = card.src; CHAT.srcFile = (card.src.split('/').pop() || '').split('?')[0]
    CHAT.prompt = card.promptFull; CHAT.size = '2752x1536'; CHAT.model = 'sensenova-u1.5-lite'
    await shot(page, '23', 'card')
    steps.push(`结果卡:prompt ${card.promptShown.length}字(全文 ${CHAT.prompt.length}字,src=${CHAT.srcFile}),动作行=${JSON.stringify(card.btns)}`)
  }
  return { pass: pending && growth >= 1 && became && !!CHAT.srcFile, steps }
}

// 24. 回填参数:点对话完成卡「回填参数」→工作台打开在生图视图且 prompt/尺寸等于该卡参数(domain chat)
async function t24_chat_backfill(page) {
  const steps = []
  if (!CHAT.srcFile) return { pass: false, steps: ['t23 未产出对话卡,无法复用'] }
  const card = await chatCard(page)
  if (!card) return { pass: false, steps: ['对话工具卡不在场(回合尾图无动作行,不属本断言)'] }
  steps.push(`目标卡:prompt 全文 ${CHAT.prompt.length} 字,期望尺寸=${CHAT.size},动作行含「回填参数」=${card.btns.includes('回填参数')}`)
  const clicked = await page.evaluate(() => {
    const b = [...document.querySelectorAll('.snx-tv .snx-tv-acc')].find((x) => /回填参数/.test(x.textContent || ''))
    if (b) { b.click(); return true }
    return false
  })
  if (!clicked) return { pass: false, steps: steps.concat('未点到「回填参数」') }
  // 工作台打开在生图视图(prompt/尺寸=卡参数;GenForm 未挂载时由 genPrefs 首帧兜底,已挂载走广播)
  let form = null
  const dl = Date.now() + 8000
  while (Date.now() < dl) {
    await page.waitForTimeout(600)
    form = await page.evaluate(() => {
      const ta = document.querySelector('.snx-gen-ta')
      const now = document.querySelector('.snx-gen-fsize .now')
      return { pro: !!document.querySelector('.snx-pro'), prompt: ta ? ta.value : null, size: now ? now.textContent.trim() : null }
    })
    if (form.pro && form.prompt === CHAT.prompt) break
  }
  await shot(page, '24', 'backfill')
  const promptOk = form.prompt === CHAT.prompt
  const sizeOk = form.size === CHAT.size
  steps.push(`点「回填参数」后:工作台在=${form.pro},表单 prompt 匹配=${promptOk}(=${JSON.stringify((form.prompt || '').slice(0, 24))}),尺寸 ${form.size}=${sizeOk}`)
  return { pass: clicked && form.pro && promptOk && sizeOk, steps }
}

// 25. 设为参考图:点对话卡「设为参考图」→工作台生图表单参考图区含该卡图(src 匹配)(domain chat)
async function t25_chat_setref(page) {
  const steps = []
  if (!CHAT.srcFile) return { pass: false, steps: ['t23 未产出对话卡,无法复用'] }
  await clearToasts(page)
  const clicked = await page.evaluate(() => {
    const b = [...document.querySelectorAll('.snx-tv .snx-tv-btns button')].find((x) => /设为参考图/.test(x.textContent || ''))
    if (b) { b.click(); return true }
    return false
  })
  if (!clicked) return { pass: false, steps: ['未点到「设为参考图」'] }
  await page.waitForTimeout(900)
  const st = await page.evaluate((srcFile) => ({
    toast: [...document.querySelectorAll('.snx-toast')].map((t) => t.textContent.trim()).join('§'),
    refs: [...document.querySelectorAll('.snx-gen-refs .snx-gen-ref img')].map((i) => i.getAttribute('src') || ''),
    label: ((document.querySelector('.snx-gen-refs .lb span:nth-child(2)') || {}).textContent || '').trim(),
  }), CHAT.srcFile)
  await shot(page, '25', 'setref')
  const hasRef = st.refs.some((s) => s.includes(CHAT.srcFile))
  steps.push(`toast=${JSON.stringify(st.toast.slice(0, 50))},参考图区 ${st.label} 缩略图=${st.refs.length} 张,含本卡图(src 匹配)=${hasRef}`)
  // 清场:移除刚加的参考图,不污染后续用例的请求体
  const removed = await page.evaluate((srcFile) => {
    const ref = [...document.querySelectorAll('.snx-gen-ref')].find((r) => ((r.querySelector('img') || {}).getAttribute('src') || '').includes(srcFile))
    const x = ref && ref.querySelector('.snx-gen-ref-x')
    if (x) { x.click(); return true }
    return false
  }, CHAT.srcFile)
  await page.waitForTimeout(500)
  steps.push(`测后移除参考图=${removed}`)
  return { pass: clicked && /已设为参考图/.test(st.toast) && hasRef, steps }
}

// 26. 同参数重抽:拦截 generate(浏览器层;放行形态为 fulfill 成功应答——500 会先于节点创建被
//     client-v4.js snxRerollDirect abort,断言不了「新增节点」)→点「同参数重抽」→请求参数与原卡
//     一致、画布文档新增节点、toast 出现(domain chat)
async function t26_chat_reroll(page) {
  const steps = []
  if (!CHAT.srcFile) return { pass: false, steps: ['t23 未产出对话卡,无法复用'] }
  await clearToasts(page)
  const doc0 = await docInfo(page)
  let captured = null
  // t23 的 agent 回合已给画布落过同 prompt 的 fromChat 节点——按「新增 id」识别本轮重抽产物
  const sameP = (n) => (n.prompt || '') === ('💬 ' + CHAT.prompt).slice(0, 120)
  const preIds = (await fetchNodes(page)).filter(sameP).map((n) => n.id)
  await page.route('**/api/sensenova/generate', (route) => {
    try { captured = route.request().postData() } catch (e) { }
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, image: { kind: 'base64', value: pngB64(640, 480, [40, 120, 200]) } }) })
  })
  let clicked = false
  try {
    clicked = await page.evaluate(() => {
      const b = [...document.querySelectorAll('.snx-tv .snx-tv-btns button')].find((x) => /同参数重抽/.test(x.textContent || ''))
      if (b) { b.click(); return true }
      return false
    })
    if (!clicked) { steps.push('未点到「同参数重抽」'); return { pass: false, steps } }
    let newNode = null
    const dl = Date.now() + 12000
    while (Date.now() < dl && !newNode) {
      await page.waitForTimeout(700)
      newNode = (await fetchNodes(page)).find((n) => sameP(n) && !preIds.includes(n.id)) || null
    }
    const toasts = await readToasts(page)
    await shot(page, '26', 'reroll')
    const doc1 = await docInfo(page)
    const body = captured ? JSON.parse(captured) : null
    const reqOk = !!body && body.prompt === CHAT.prompt && body.size === CHAT.size
    steps.push(`请求体=${captured ? captured.slice(0, 140) : '(未捕获)'},与原卡一致(prompt+size)=${reqOk}`,
      `画布 done ${doc0.done}→${doc1.done}(新增=${doc1.done - doc0.done}),新节点=${newNode ? newNode.id.slice(0, 8) + ' src=' + String(newNode.src).slice(0, 40) : '(未落)'}`,
      `toast=${JSON.stringify(toasts.join('§').slice(0, 60))}`)
    const pass = reqOk && (doc1.done - doc0.done) === 1 && !!newNode && toasts.some((t) => /同参数重抽/.test(t))
    return { pass, steps }
  } finally { await page.unroute('**/api/sensenova/generate') }
}

// 27. 复制提示词:点对话卡尾部复制钮→剪贴板=完整提示词(卡面展示为 48 字截断,全文更长)(domain chat)
async function t27_chat_copy(page) {
  const steps = []
  if (!CHAT.srcFile) return { pass: false, steps: ['t23 未产出对话卡,无法复用'] }
  const card = await chatCard(page)
  if (!card) return { pass: false, steps: ['对话工具卡不在场'] }
  await page.evaluate(() => navigator.clipboard.writeText('AUDIT-CLIPBOARD-CLEARED').catch(() => {}))
  await page.waitForTimeout(300)
  const clicked = await page.evaluate(() => {
    const b = document.querySelector('.snx-tv .snx-tv-copy')
    if (b) { b.click(); return true }
    return false
  })
  await page.waitForTimeout(800)
  const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => '(read 失败)'))
  const toasts = await readToasts(page)
  await shot(page, '27', 'copy')
  const truncReal = CHAT.prompt.length > 48 && card.promptShown.length <= 48
  const full = clip === CHAT.prompt
  steps.push(`卡面展示 ${card.promptShown.length} 字(截断态)/全文 ${CHAT.prompt.length} 字(>48 截断前提成立=${truncReal})`,
    `剪贴板=${JSON.stringify(clip.slice(0, 40))}… 与全文相等=${full},toast=${JSON.stringify(toasts.join('§').slice(0, 30))}`)
  return { pass: clicked && truncReal && full, steps }
}

// 28. 对话灯箱:点开对话卡图→.snx-tvlb 参数清单行渲染(提示词/模型/尺寸带行级回填钮,工具结果
//     无种子则无种子行)→「尺寸」行按钮回填生效(工作台表单尺寸变为该卡尺寸)(domain chatlb)
async function t28_chat_lightbox(page) {
  const steps = []
  if (!CHAT.srcFile) return { pass: false, steps: ['t23 未产出对话卡,无法复用'] }
  // 先把表单尺寸打回 1:1,让「尺寸」行回填可证伪
  await switchTab(page, '生图')
  await page.evaluate(() => { const b = [...document.querySelectorAll('.snx-gen-fsize-row .snx-gen-chip')].find((x) => x.textContent.trim() === '1:1'); if (b) b.click() })
  await page.waitForTimeout(300)
  const baseSize = await page.evaluate(() => { const n = document.querySelector('.snx-gen-fsize .now'); return n ? n.textContent.trim() : '' })
  steps.push(`基线:表单尺寸打回=${baseSize}(期望与卡尺寸 ${CHAT.size} 不同)`)
  const opened = await page.evaluate((srcFile) => {
    const btn = [...document.querySelectorAll('.snx-tv .snx-tv-img')].find((b) => ((b.querySelector('img') || {}).getAttribute('src') || '').includes(srcFile))
    if (btn) { btn.click(); return true }
    return false
  }, CHAT.srcFile)
  const lb = await page.waitForSelector('.snx-tvlb', { timeout: 4000 }).catch(() => null)
  if (!opened || !lb) { await shot(page, '28', 'nolb'); return { pass: false, steps: steps.concat('点卡图后对话灯箱(.snx-tvlb)未出现') } }
  await page.waitForTimeout(400)
  const meta = await page.evaluate(() => {
    const h = document.querySelector('.snx-tvlb-h .t')
    return {
      header: h ? h.textContent.trim() : '',
      rows: [...document.querySelectorAll('.snx-tvlb-side .snx-lb-row')].map((r) => ({
        label: ((r.querySelector('.rl') || {}).textContent || '').trim(),
        val: (((r.querySelector('.rv') || {}).textContent || '')).trim().slice(0, 40),
        hasBtn: !!r.querySelector('button.rb'),
      })),
      acts: [...document.querySelectorAll('.snx-tvlb-acts button')].map((b) => b.textContent.trim()),
    }
  })
  await shot(page, '28', 'meta')
  const labels = meta.rows.map((r) => r.label)
  steps.push(`灯箱头=「${meta.header}」,参数行=${JSON.stringify(meta.rows.map((r) => r.label + (r.hasBtn ? '(可回填)' : '')))},动作行=${JSON.stringify(meta.acts)}`)
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('.snx-tvlb-side .snx-lb-row')].find((r) => ((r.querySelector('.rl') || {}).textContent || '').trim() === '尺寸')
    const b = row && row.querySelector('button.rb')
    if (b) b.click()
  })
  await page.waitForTimeout(800)
  const lbStill = !!(await page.$('.snx-tvlb'))
  const toast = await readToasts(page)
  steps.push(`点「尺寸」行回填:灯箱保持=${lbStill},toast=${JSON.stringify(toast.join('§').slice(0, 40))}`)
  await switchTab(page, '生图')
  const nowSize = await page.evaluate(() => { const n = document.querySelector('.snx-gen-fsize .now'); return n ? n.textContent.trim() : '' })
  steps.push(`回填后表单尺寸=${nowSize}(期望 ${CHAT.size})`)
  await shot(page, '28', 'form')
  const closed = await page.evaluate(() => { const b = document.querySelector('.snx-tvlb-x'); if (b) { b.click(); return true } return false })
  await page.waitForTimeout(500)
  const lbGone = !(await page.$('.snx-tvlb'))
  const rowsOk = labels.includes('提示词') && labels.includes('模型') && labels.includes('尺寸') && !labels.includes('种子')
    && meta.rows.every((r) => r.hasBtn) && meta.header === '参数清单'
  return { pass: opened && rowsOk && lbStill && nowSize === CHAT.size && closed && lbGone, steps }
}

// 29. 回合尾编号:一回合 2 张以上时 tail 图有 x/N 角标(agent 一回合连调两次生图工具;
//     单图回合不显示角标为回归项;顺带点 tail 图验证对话灯箱可开)(domain chatlb)
async function t29_turn_tail_badge(page) {
  const steps = []
  const instruct = '请在同一个回合内连续调用两次 sensenova_generate_image 工具,一共生成两张图:第一次 prompt=「AUDIT-V13 多图编号 A:雪夜灯笼」,第二次 prompt=「AUDIT-V13 多图编号 B:巷口狸猫」,两次 size 都传「1024x1024」。两次调用连续完成,中间不要回复文字,不要请求确认。'
  let ok = false, idxs = [], imgs = 0, att = 0
  while (att < 2 && !ok) {
    att++
    const sent = await chatSend(page, instruct)
    steps.push(`第${att}次发消息:${sent ? '已提交(等 agent 回合完成)' : 'composer 未找到'}`)
    if (!sent) break
    const dl = Date.now() + 170000
    while (Date.now() < dl) {
      await page.waitForTimeout(2000)
      const st = await page.evaluate(() => {
        const tails = [...document.querySelectorAll('.snx-tail')]
        return {
          n: tails.length,
          perTail: tails.map((t) => t.querySelectorAll('.snx-tail-img').length),
          idx: [...document.querySelectorAll('.snx-tail-idx')].map((x) => x.textContent.trim()),
        }
      })
      if (st.perTail.some((n) => n >= 2)) {
        imgs = Math.max(...st.perTail); idxs = st.idx; ok = true
        break
      }
    }
    if (ok) break
    steps.push(`第${att}次回合未产出多图 tail(现 tail 数/分布见下)`)
  }
  await shot(page, '29', 'tail')
  const expect = Array.from({ length: imgs }, (_, i) => (i + 1) + ' / ' + imgs)
  const idxOk = ok && idxs.length === imgs && expect.every((e) => idxs.includes(e))
  steps.push(`回合尾:tail 图=${imgs} 张,角标=${JSON.stringify(idxs)}(期望 ${JSON.stringify(expect)},匹配=${idxOk})`)
  // 回归项:单图回合无角标(t23 的回合 tail 若在场,不应有 .snx-tail-idx)——真实 DOM 如实记录
  const single = await page.evaluate(() => {
    const t = [...document.querySelectorAll('.snx-tail')].find((x) => x.querySelectorAll('.snx-tail-img').length === 1)
    return t ? { hasIdx: t.querySelectorAll('.snx-tail-idx').length > 0 } : null
  })
  if (single) steps.push(`单图 tail 角标不显示=${!single.hasIdx}(回归项)`)
  // tail 图点击开对话灯箱(domain chatlb 佐证)
  let lbOk = false
  if (ok) {
    await page.evaluate(() => { const b = document.querySelector('.snx-tail .snx-tail-img'); if (b) b.click() })
    await page.waitForSelector('.snx-tvlb', { timeout: 3500 }).catch(() => {})
    lbOk = !!(await page.$('.snx-tvlb'))
    steps.push(`点 tail 图开对话灯箱=${lbOk}`)
    if (lbOk) await page.evaluate(() => { const b = document.querySelector('.snx-tvlb-x'); if (b) b.click() })
    await page.waitForTimeout(400)
  }
  return { pass: ok && idxOk && lbOk, steps }
}

// 30. 生成入板:生图表单选画板→(拦截 500 前提下)发起生成→断言节点 boardId=所选、请求体如实;
//     决策面板目标行显示画板名(domain wb)
async function t30_gen_to_board(page) {
  const steps = []
  await switchTab(page, '生图')
  const boards = await page.evaluate(async () => { try { return ((await (await fetch('/api/sensenova/canvas')).json()).doc.boards) || [] } catch (e) { return [] } })
  if (!boards.length) return { pass: false, steps: ['画布文档无画板,入板断言无从谈起'] }
  const board = boards[0]
  const P = 'AUDIT-WB 入板断言 ' + Date.now()
  const ta = await page.$('.snx-gen-ta')
  if (!ta) return { pass: false, steps: ['找不到提示词输入框'] }
  await ta.click(); await ta.fill(''); await page.keyboard.type(P, { delay: 5 })
  // 选「目标画板」(SnxSelect 在 .snx-gen-styles 且标签为目标画板的块里)
  const sel = await page.evaluate(() => {
    const blk = [...document.querySelectorAll('.snx-gen-styles')].find((d) => /目标画板/.test((d.querySelector('.lb') || {}).textContent || ''))
    const btn = blk && blk.querySelector('.snx-sel-btn')
    if (btn) { btn.click(); return btn.textContent.trim() }
    return null
  })
  if (!sel) return { pass: false, steps: ['找不到「目标画板」下拉'] }
  await page.waitForTimeout(400)
  await page.evaluate((name) => {
    const o = [...document.querySelectorAll('.snx-sel-pop .snx-sel-opt')].find((x) => x.textContent.trim() === name)
    if (o) o.click()
  }, board.name)
  await page.waitForTimeout(400)
  const label = await page.evaluate(() => {
    const blk = [...document.querySelectorAll('.snx-gen-styles')].find((d) => /目标画板/.test((d.querySelector('.lb') || {}).textContent || ''))
    return blk && blk.querySelector('.snx-sel-btn') ? blk.querySelector('.snx-sel-btn').textContent.trim() : ''
  })
  await shot(page, '30', 'board')
  steps.push(`目标画板下拉 初始=${JSON.stringify(sel)} →选中「${board.name}」后=${JSON.stringify(label)}`)
  // 决策面板目标行
  await page.hover('.snx-gen-go')
  await page.waitForSelector('.snx-gen-decide', { timeout: 3000 }).catch(() => {})
  await page.waitForTimeout(400)
  const targetRow = await page.evaluate(() => {
    const p = document.querySelector('.snx-gen-decide')
    if (!p) return null
    const r = [...p.querySelectorAll('.snx-gen-decide-r')].find((x) => /目标/.test(x.textContent || ''))
    return r ? r.textContent.replace(/\s+/g, ' ').trim() : (p.textContent || '').slice(0, 120)
  })
  await shot(page, '30', 'decide')
  steps.push(`决策面板目标行=${JSON.stringify(targetRow)}(期望含 画板「${board.name}」)`)
  // 拦截 500 发起生成;节点由 genToCanvas 本地创建(boardId=所选),500 后转 error 但 boardId 保留
  const doc0 = await docInfo(page)
  let captured = null
  await page.route('**/api/sensenova/generate', (route) => {
    try { captured = route.request().postData() } catch (e) { }
    route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'audit: simulated failure' }) })
  })
  let node = null
  try {
    await page.evaluate(() => { const b = document.querySelector('.snx-gen-go'); if (b) b.click() })
    const dl = Date.now() + 12000
    while (Date.now() < dl && !node) {
      await page.waitForTimeout(700)
      node = (await fetchNodes(page)).find((n) => n.prompt === P) || null
    }
  } finally { await page.unroute('**/api/sensenova/generate') }
  const doc1 = await docInfo(page)
  const body = captured ? JSON.parse(captured) : null
  const boardOk = !!node && node.boardId === board.id
  await shot(page, '30', 'node')
  steps.push(`拦截 500:请求体 prompt 匹配=${!!body && body.prompt === P},节点 ${doc0.total}→${doc1.total},节点=${node ? node.id.slice(0, 8) + '/status=' + node.status + '/boardId=' + (node.boardId || '(无)') : '(未创建)'},boardId=所选=${boardOk}`)
  // 清场:清除已失败(应用内确认)+ 目标画板回未分组 + 清提示词
  await switchTab(page, '队列')
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /清除已失败/.test(x.textContent || '')); if (b) b.click() })
  const cfm = await page.waitForSelector('.snx-cfm-backdrop', { timeout: 3000 }).catch(() => null)
  if (cfm) await page.evaluate(() => { const b = [...document.querySelectorAll('.snx-cfm-b')].find((x) => x.className.includes('danger')); if (b) b.click() })
  await page.waitForTimeout(700)
  const doc2 = await docInfo(page)
  await switchTab(page, '生图')
  await page.evaluate(() => {
    const blk = [...document.querySelectorAll('.snx-gen-styles')].find((d) => /目标画板/.test((d.querySelector('.lb') || {}).textContent || ''))
    const btn = blk && blk.querySelector('.snx-sel-btn')
    if (btn) btn.click()
  })
  await page.waitForTimeout(350)
  await page.evaluate(() => {
    const o = [...document.querySelectorAll('.snx-sel-pop .snx-sel-opt')].find((x) => x.textContent.trim() === '未分组')
    if (o) o.click()
  })
  await page.evaluate(() => { const t = document.querySelector('.snx-gen-ta'); if (t) t.focus() })
  await page.fill('.snx-gen-ta', '').catch(() => {})
  steps.push(`测后清场:清除已失败 error=${doc2.error},目标画板已回「未分组」,提示词已清`)
  const targetOk = !!targetRow && targetRow.includes('画板「' + board.name + '」')
  return { pass: label.includes(board.name) && targetOk && boardOk && (doc1.total - doc0.total) === 1 && !!body && body.prompt === P, steps }
}

// 31. 队列全历史:开启「显示全部历史」→行数≥全部 done+error 节点数,旧行可展开且耗时=「未运行(历史)」;
//     关闭恢复 60s 窗口行为(domain wb)
async function t31_queue_history(page) {
  const steps = []
  await switchTab(page, '队列')
  await page.waitForTimeout(500)
  const doc = await docInfo(page)
  const countRows = () => page.evaluate(() => document.querySelectorAll('.snx-queue-list .snx-qi').length)
  const oldest = await page.evaluate(async () => {
    const ns = ((await (await fetch('/api/sensenova/canvas')).json()).doc.nodes) || []
    const done = ns.filter((n) => n.status === 'done')
    return done.sort((a, b) => (a.ts || 0) - (b.ts || 0))[0] || null
  })
  if (!oldest) return { pass: false, steps: ['画布无 done 节点,历史断言无从谈起'] }
  const oldKey = String(oldest.prompt || '').replace(/^💬\s*/, '').slice(0, 14)
  const rowsOff = await countRows()
  await page.evaluate(() => { const b = document.querySelector('.snx-queue-hist'); if (b) b.click() })
  await page.waitForTimeout(500)
  const histOn = await page.evaluate(() => { const b = document.querySelector('.snx-queue-hist'); return b ? { on: b.className.includes('on'), pressed: b.getAttribute('aria-pressed') } : null })
  const rowsOn = await countRows()
  // 旧行可展开:按 prompt 定位最老 done 节点行,点 chev 展开详情,耗时=「未运行(历史)」
  const ex = await page.evaluate((oldKey) => {
    const row = [...document.querySelectorAll('.snx-queue-list .snx-qi')]
      .find((r) => ((r.querySelector('.snx-qi-pr') || {}).textContent || '').includes(oldKey))
    if (!row) return { found: false }
    const badge = ((row.querySelector('.snx-qi-st') || {}).textContent || '').trim()
    const chev = row.querySelector('.snx-qi-chev')
    if (chev) chev.click()
    return { found: true, badge, rowCls: row.className }
  }, oldKey)
  await page.waitForTimeout(400)
  const dur = await page.evaluate((oldKey) => {
    const row = [...document.querySelectorAll('.snx-queue-list .snx-qi')]
      .find((r) => ((r.querySelector('.snx-qi-pr') || {}).textContent || '').includes(oldKey))
    if (!row) return null
    const d = row.querySelector('.snx-qi-detail')
    if (!d) return { hasDetail: false }
    const dt = [...d.querySelectorAll('dt')].find((x) => x.textContent.trim() === '耗时')
    const dd = dt && dt.nextElementSibling
    return { hasDetail: true, dur: dd ? dd.textContent.trim() : '' }
  }, oldKey)
  await shot(page, '31', 'allhist')
  await page.evaluate(() => { const b = document.querySelector('.snx-queue-hist'); if (b) b.click() })
  await page.waitForTimeout(500)
  const rowsOff2 = await countRows()
  const oldGone = await page.evaluate((oldKey) => {
    const row = [...document.querySelectorAll('.snx-queue-list .snx-qi')]
      .find((r) => ((r.querySelector('.snx-qi-pr') || {}).textContent || '').includes(oldKey))
    return !row
  }, oldKey)
  steps.push(`最老 done 节点=「${oldKey}」(ts=${oldest.ts}),done+error=${doc.done + doc.error}`,
    `toggle:off=${rowsOff} 行 → on=${histOn && histOn.on ? '开' : '关'}(aria-pressed=${histOn && histOn.pressed})${rowsOn} 行(≥done+error=${rowsOn >= doc.done + doc.error},增长=${rowsOn > rowsOff})`,
    `旧行:徽章=${JSON.stringify(ex.badge)},展开=${ex.found && dur && dur.hasDetail},耗时=${dur && dur.dur ? JSON.stringify(dur.dur) : '(无)'}`,
    `关回:rows=${rowsOff2}(窗口恢复=${rowsOff2 < rowsOn}),旧行消失=${oldGone}`)
  const durOk = !!dur && dur.hasDetail && dur.dur === '未运行(历史)'
  return { pass: rowsOn >= doc.done + doc.error && rowsOn > rowsOff && ex.found && durOk && rowsOff2 < rowsOn && oldGone, steps }
}

// 32. 对比 3 图:选 3 张→多图模式按钮组出现,滑块/叠化禁用带 tooltip,并排可用(网格焦点可切)(domain wb)
async function t32_compare_three(page) {
  const steps = []
  await switchTab(page, '对比')
  await page.waitForTimeout(500)
  let pool = await page.$$('.snx-cmp-pool-item')
  if (pool.length < 3) { await shot(page, '32', 'nopool'); return { pass: false, steps: [`对比池图不足(${pool.length} 张,需≥3)`] } }
  for (let i = 0; i < 3; i++) { await pool[i].click(); await page.waitForTimeout(450); pool = await page.$$('.snx-cmp-pool-item') }
  const modes = await page.evaluate(() => {
    const seg = document.querySelector('.snx-cmp-mseg[aria-label*="多图"]')
    if (!seg) return null
    const btns = [...seg.querySelectorAll('.snx-cmp-mbtn')]
    return {
      label: seg.getAttribute('aria-label'),
      btns: btns.map((b) => ({ t: b.textContent.trim(), disabled: b.disabled, title: b.title || '', on: b.className.includes('on') })),
    }
  })
  if (!modes) { await shot(page, '32', 'nomodes'); return { pass: false, steps: ['选 3 张后未出现多图模式按钮组(.snx-cmp-mseg[多图])'] } }
  const grid = await page.evaluate(() => {
    const row = document.querySelector('.snx-cmp-grid-row')
    return { cls: row ? row.className : '', cells: document.querySelectorAll('.snx-cmp-grid-cell').length, big: ((document.querySelector('.snx-cmp-grid-big img') || {}).getAttribute('src') || '') }
  })
  await shot(page, '32', 'grid')
  steps.push(`模式组=「${modes.label}」:${JSON.stringify(modes.btns)};网格=${grid.cls.replace('snx-cmp-grid-row', '').trim()}/${grid.cells} 格`)
  // 并排可用:点第 2 格,大图跟随(焦点切换)
  const cellSrc = await page.evaluate(() => { const c = document.querySelectorAll('.snx-cmp-grid-cell')[1]; const i = c && c.querySelector('img'); const r = { src: i ? i.getAttribute('src') : '' }; if (c) c.click(); return r })
  await page.waitForTimeout(450)
  const after = await page.evaluate(() => ({
    big: ((document.querySelector('.snx-cmp-grid-big img') || {}).getAttribute('src') || ''),
    cellOn: [...document.querySelectorAll('.snx-cmp-grid-cell')].findIndex((c) => c.className.includes('on')),
  }))
  steps.push(`点第 2 格:大图 src 跟随=${after.big === cellSrc.src && !!cellSrc.src},焦点格 idx=${after.cellOn}`)
  await shot(page, '32', 'focus')
  // 清场:移出 3 张,恢复空对比
  await page.evaluate(() => { [...document.querySelectorAll('.snx-cmp-slot-x')].forEach((b) => { try { b.click() } catch (e) { } }) })
  await page.waitForTimeout(400)
  const dis = modes.btns.filter((b) => b.t !== '并排')
  const pass = modes.btns.length === 3
    && dis.length === 2 && dis.every((b) => b.disabled && b.title === '仅支持 2 张对比')
    && modes.btns.find((b) => b.t === '并排') && !modes.btns.find((b) => b.t === '并排').disabled && modes.btns.find((b) => b.t === '并排').on
    && grid.cells === 3 && after.big === cellSrc.src && !!cellSrc.src
  return { pass, steps }
}

// ══════════════ v14 新增 6 条断言(SPEC-14 两轴并行第二轮) ══════════════

// 33. 并发写保护:双 page 各持文档;A 写入成功(rev+1)后,B 携旧 rev 写入→409→客户端自动重载
//     最新文档+toast「检测到其他会话修改」+保存指示「已加载最新画布」;B 携新 rev 写入→成功(domain wb)
//     写标记=画廊收藏(favorite):toggleGalFav 直改 node.favorite+autosave,无 generate 调用,
//     0 次触达真实 API;测后取消收藏,净变化为零。辅助会话 A 用 page.context().newPage(),测毕即关。
async function t33_concurrent_rev(page, url) {
  const steps = []
  const getRev = (p) => p.evaluate(async () => {
    try { const j = await (await fetch('/api/sensenova/canvas')).json(); return { rev: j.rev || 0, doc: j.doc } } catch (e) { return null }
  })
  const favOf = (g, id) => !!(((g || {}).doc || {}).nodes || []).filter((x) => x.id === id).map((x) => !!x.favorite)[0]
  // 取最新 3 张未收藏 done 卡做标记(A/B/C 互不重叠)
  const picks = await page.evaluate(async () => {
    const ns = ((await (await fetch('/api/sensenova/canvas')).json()).doc.nodes) || []
    return ns.filter((n) => n.status === 'done' && n.src && !n.favorite)
      .sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 3).map((n) => n.id)
  })
  if (picks.length < 3) return { pass: false, steps: [`未收藏 done 卡不足 3 张(${picks.length}),并发写断言无从谈起`] }
  const [idA, idB, idC] = picks
  const rev0 = (await getRev(page)).rev
  steps.push(`基线:server rev=${rev0},标记卡 A=${idA.slice(0, 8)} B=${idB.slice(0, 8)} C=${idC.slice(0, 8)}`)

  // 会话 A:独立浏览器实例打开工作台→收藏卡 A→autosave(700ms 防抖)→PUT 带 rev 成功→server rev+1
  // (Playwright 1.63 page.context().newPage() 抛 Please use browser.newContext(),双会话用第二浏览器)
  const browserA = await chromium.launch({ headless: true })
  const pageA = await browserA.newPage({ viewport: { width: 1600, height: 900 } })
  await pageA.addInitScript(PROBE)
  let aClick = false, revA = -1
  try {
    await pageA.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await pageA.waitForFunction(() => window.__snxDebug && window.__snxDebug.step === 'done', null, { timeout: 30000 }).catch(() => {})
    if (!await openWorkbench(pageA)) return { pass: false, steps: steps.concat('会话 A 工作台未打开') }
    await switchTab(pageA, '画廊')
    aClick = await pageA.evaluate((id) => {
      const c = document.querySelector('.snx-gal-item[data-gal-id="' + id + '"]')
      const b = c && [...c.querySelectorAll('.snx-gal-item-ops button')].find((x) => (x.title || '') === '收藏')
      if (!b) return false
      b.click(); return true
    }, idA)
    if (!aClick) return { pass: false, steps: steps.concat('会话 A 未点到「收藏」(卡片/ops 按钮未找到)') }
    const dl = Date.now() + 12000
    while (Date.now() < dl) {
      await page.waitForTimeout(700)
      const g = await getRev(page)
      if (g.rev > rev0 && favOf(g, idA)) { revA = g.rev; break }
    }
    steps.push(`A 写入:收藏卡 A → server rev ${rev0}→${revA}(+1=${revA === rev0 + 1}),doc.favorite(A)=${favOf(await getRev(page), idA)}`)
  } finally { await browserA.close().catch(() => {}) }
  if (!aClick || revA !== rev0 + 1) return { pass: false, steps: steps.concat('A 写入未成功(rev 未+1),后续 409 断言无从谈起') }

  // 会话 B:主 page(持旧 rev,无人通知它 rev 已变——服务端 PUT 不广播 SSE)→收藏卡 B→
  // autosave PUT 携旧 rev→409→reloadRemoteBaseline 重载远端基线+toast
  await switchTab(page, '画廊')
  await clearToasts(page)
  const bClick = await page.evaluate((id) => {
    const c = document.querySelector('.snx-gal-item[data-gal-id="' + id + '"]')
    const b = c && [...c.querySelectorAll('.snx-gal-item-ops button')].find((x) => (x.title || '') === '收藏')
    if (!b) return false
    b.click(); return true
  }, idB)
  if (!bClick) return { pass: false, steps: steps.concat('会话 B 未点到「收藏」') }
  let toast409 = ''
  const dl2 = Date.now() + 15000
  while (Date.now() < dl2) {
    await page.waitForTimeout(500)
    const ts = await readToasts(page)
    const hit = ts.find((t) => /检测到其他会话修改/.test(t))
    if (hit) { toast409 = hit; break }
  }
  const sv = await page.evaluate(() => { const el = document.getElementById('snx-cv-save'); return el ? { seen: true, txt: el.textContent.trim() } : { seen: false, txt: '' } })
  await shot(page, '33', 'conflict')
  const afterC = await getRev(page)
  const favA = favOf(afterC, idA), favB = favOf(afterC, idB)
  steps.push(`B 携旧 rev 写入:409 toast=「${toast409.slice(0, 42)}」(出现=${!!toast409}),保存指示=「${sv.txt}」(元素在场=${sv.seen})`,
    `409 后以远端为基线:rev=${afterC.rev}(未因失败写+1=${afterC.rev === revA}),A 的收藏在=${favA},B 未落盘的收藏被放弃(doc 内 B.favorite=${favB})`)

  // B 携新 rev 再写:收藏卡 C→autosave PUT 成功→server rev+1 且 C 落盘(正常路径保存不受影响)
  const cClick = await page.evaluate((id) => {
    const c = document.querySelector('.snx-gal-item[data-gal-id="' + id + '"]')
    const b = c && [...c.querySelectorAll('.snx-gal-item-ops button')].find((x) => (x.title || '') === '收藏')
    if (!b) return false
    b.click(); return true
  }, idC)
  let revB2 = -1, favC = false
  const dl3 = Date.now() + 12000
  while (Date.now() < dl3) {
    await page.waitForTimeout(700)
    const g = await getRev(page)
    if (g.rev > afterC.rev && favOf(g, idC)) { revB2 = g.rev; favC = true; break }
  }
  await shot(page, '33', 'rewrite')
  steps.push(`B 携新 rev 再写(收藏卡 C):点击=${cClick},落盘=${favC},server rev ${afterC.rev}→${revB2}(+1=${revB2 === afterC.rev + 1})`)
  // 清场:取消 A/C 收藏(B 卡从未落盘)——B 的 rev 现为最新,UI 直改落盘
  const unfav = await page.evaluate((ids) => {
    let n = 0
    for (const id of ids) {
      const c = document.querySelector('.snx-gal-item[data-gal-id="' + id + '"]')
      const b = c && [...c.querySelectorAll('.snx-gal-item-ops button')].find((x) => (x.title || '') === '取消收藏')
      if (b) { b.click(); n++ }
    }
    return n
  }, [idA, idC])
  await page.waitForTimeout(1500)
  const fin = await getRev(page)
  const favLeft = [idA, idB, idC].filter((id) => favOf(fin, id)).length
  steps.push(`清场:取消收藏 ${unfav}/2 处,三张标记卡残留 favorite=${favLeft}(净变化=${favLeft === 0 ? 0 : '非零'})`)
  const pass = !!toast409 && favA && !favB
    && cClick && favC && revB2 === afterC.rev + 1 && favLeft === 0
  return { pass, steps }
}

// 34. 队列「取消其他」:造 1 running+3 pending——GenBar 提交在 runOne 全程持有 busy(GenBar.go:
//     if(!p||busy) return),并发入队不可行;改走「重跑失败」forEach(不 await)路径:
//     3 条快速失败(拦截 500 立即返)→暂停队列→重跑失败(应用内确认)→3 条转 pending 停在
//     waitIfPaused→J1 换 14s 延迟拦截入队即 running→点「取消其他」→仅运行中保留,pending 清零;
//     测后等 J1 落 500、恢复队列(被取消的 parked 苏醒即退出)、清除已失败,净数据变化为零(domain wb)
async function t34_queue_cancel_others(page) {
  const steps = []
  const pause = async (on) => {
    await switchTab(page, '队列')
    return page.evaluate((on) => {
      const b = [...document.querySelectorAll('button')].find((x) => (on ? /暂停队列/ : /继续队列/).test(x.textContent || ''))
      if (b) { b.click(); return true }
      return false
    }, on)
  }
  const enqueue = async (text) => {
    await switchTab(page, '画布')
    await page.waitForTimeout(400)
    const inp = await page.$('.snx-pbar input')
    if (!inp) return false
    await inp.click(); await inp.fill(''); await page.keyboard.type(text, { delay: 5 })
    await page.keyboard.press('Enter')
    await page.waitForTimeout(600)
    return true
  }
  const stOf = () => page.evaluate(async () => {
    const ns = ((await (await fetch('/api/sensenova/canvas')).json()).doc.nodes) || []
    const jobs = ns.filter((n) => /^AUDIT-T34-J/.test(n.prompt || ''))
    return { n: jobs.length, running: jobs.filter((x) => x.status === 'running').length, pending: jobs.filter((x) => x.status === 'pending').length, error: jobs.filter((x) => x.status === 'error').length }
  })
  // 前置归零:历史 error 会混进「重跑失败」的原料;历史 AUDIT-T34* 标记(任何状态,含异常退出
  // 遗留的 running/pending 僵尸)先按 API 清掉——都是本验收自己制造的标记,净数据不变
  for (let i = 0; i < 3; i++) {
    const d = await docInfo(page)
    if (d.error === 0) break
    await switchTab(page, '队列')
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /清除已失败/.test(x.textContent || '')); if (b) b.click() })
    const cfm = await page.waitForSelector('.snx-cfm-backdrop', { timeout: 3000 }).catch(() => null)
    if (cfm) await page.evaluate(() => { const b = [...document.querySelectorAll('.snx-cfm-b')].find((x) => x.className.includes('danger')); if (b) b.click() })
    await page.waitForTimeout(800)
  }
  await page.evaluate(async () => {
    try {
      const g = await (await fetch('/api/sensenova/canvas')).json()
      const doc = g.doc
      const before = doc.nodes.length
      doc.nodes = doc.nodes.filter((n) => !/^AUDIT-T34/.test(n.prompt || ''))
      if (doc.nodes.length !== before) await fetch('/api/sensenova/canvas', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ doc, rev: g.rev }) })
    } catch (e) { }
  })
  await page.waitForTimeout(900)
  const Fulfill500 = (ms) => (route) => setTimeout(() => { try { route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'audit: simulated failure' }) }) } catch (e) { /* unroute 后迟到 fulfill 吞掉 */ } }, ms)
  let native0 = -1, rerunOk = false
  try {
    // 阶段1:J2-J4 快速失败(500 立即返),作为「重跑失败」原料
    await page.route('**/api/sensenova/generate', Fulfill500(0))
    for (const nm of ['J2', 'J3', 'J4']) {
      if (!await enqueue('AUDIT-T34-' + nm + ' 等待取消')) return { pass: false, steps: ['画布 GenBar 未找到,无法入队'] }
      const want = nm === 'J2' ? 1 : nm === 'J3' ? 2 : 3
      const dl = Date.now() + 10000
      while (Date.now() < dl) { await page.waitForTimeout(500); if ((await stOf()).error >= want) break }
    }
    const seed = await stOf()
    steps.push(`阶段1:J2-J4 拦截 500 快速失败 → J 节点=${seed.n},error=${seed.error}(需 3)`)
    if (seed.error < 3) { await shot(page, '34', 'badseed'); return { pass: false, steps: steps.concat('快速失败造态未达 3 条') } }
    // 阶段2:J1 换 14s 延迟拦截,入队即 running(busy 被 runOne 占满,故 J1 最后入队)
    await page.unroute('**/api/sensenova/generate')
    await page.route('**/api/sensenova/generate', Fulfill500(14000))
    if (!await enqueue('AUDIT-T34-J1 运行中保留')) return { pass: false, steps: ['画布 GenBar 未找到(J1)'] }
    const dl1 = Date.now() + 8000
    while (Date.now() < dl1) { await page.waitForTimeout(500); if ((await stOf()).running >= 1) break }
    // 阶段3:暂停队列→重跑失败(应用内确认)→J2-J4 转 pending 停在 waitIfPaused
    if (!await pause(true)) return { pass: false, steps: ['「暂停队列」按钮未找到'] }
    const rerun = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => /重跑失败/.test(x.textContent || ''))
      if (!b || b.disabled) return { hasBtn: false, disabled: !!b }
      b.click(); return { hasBtn: true, disabled: false }
    })
    const cfmR = await page.waitForSelector('.snx-cfm-backdrop', { timeout: 3000 }).catch(() => null)
    if (!rerun.hasBtn || !cfmR) { await shot(page, '34', 'norerun'); return { pass: false, steps: steps.concat(`「重跑失败」按钮=${rerun.hasBtn}(禁用=${!!rerun.disabled}),确认弹层=${!!cfmR}`) } }
    await page.evaluate(() => { const b = [...document.querySelectorAll('.snx-cfm-b')].find((x) => x.className.includes('danger')); if (b) b.click() })
    // 「重跑失败」的 pending 状态变更不即时 autosave,服务端 doc 滞后——以队列页 UI 概要为准
    const uiRerun = () => page.evaluate(() => {
      const s = [...document.querySelectorAll('.snx-queue-summary .stat')]
      const get = (lb) => { const st = s.find((x) => x.textContent.includes(lb)); return st ? parseInt((st.querySelector('.n') || {}).textContent, 10) || 0 : -1 }
      return { running: get('运行中'), pending: get('等待中'), error: get('失败') }
    })
    const dl3 = Date.now() + 6000
    let u3 = await uiRerun()
    while (Date.now() < dl3) { await page.waitForTimeout(500); u3 = await uiRerun(); if (u3.pending >= 3) { rerunOk = true; break } }
    const mid = await stOf()
    steps.push(`阶段3:暂停队列→「重跑失败」确认(应用内)→UI 运行中=${u3.running}/等待中=${u3.pending}/失败=${u3.error}(转 pending 成功=${rerunOk});server doc(rerun 不即时落盘,滞后如实记录)=running ${mid.running}/pending ${mid.pending}/error ${mid.error}`)
    // 阶段4:取消其他→应用内确认→仅运行中保留
    const nativeBefore = await page.evaluate(() => window.__nativeProbes.confirm.length)
    const ui = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => /取消其他/.test(x.textContent || ''))
      if (!b) return { hasBtn: false }
      const stats = [...document.querySelectorAll('.snx-queue-summary .stat')].map((s) => s.textContent.replace(/\s+/g, ''))
      if (b.disabled || b.getAttribute('aria-disabled') === 'true') return { hasBtn: true, disabled: true, stats }
      b.click(); return { hasBtn: true, disabled: false, stats }
    })
    steps.push(`队列页:概要=${JSON.stringify(ui.stats || [])},「取消其他」按钮=${ui.hasBtn}(禁用=${!!ui.disabled})`)
    if (!ui.hasBtn || ui.disabled) { await shot(page, '34', 'disabled'); return { pass: false, steps } }
    const cfm = await page.waitForSelector('.snx-cfm-backdrop', { timeout: 3000 }).catch(() => null)
    const cfmTxt = await page.evaluate(() => { const d = document.querySelector('.snx-cfm-backdrop'); return d ? d.textContent.replace(/\s+/g, ' ').slice(0, 120) : '' })
    await shot(page, '34', 'confirm')
    steps.push(`确认弹层=${cfm ? '.snx-cfm-backdrop(应用内)' : '(未出现)'},文案=${JSON.stringify(cfmTxt)}`)
    if (!cfm) return { pass: false, steps }
    await page.evaluate(() => { const b = [...document.querySelectorAll('.snx-cfm-b')].find((x) => x.className.includes('danger')); if (b) b.click() })
    await page.waitForTimeout(1200)
    const after = await stOf()
    native0 = (await page.evaluate(() => window.__nativeProbes.confirm.length)) - nativeBefore
    await shot(page, '34', 'after')
    steps.push(`确认后:running=${after.running}(仅运行中保留=${after.running === 1}),pending=${after.pending}(清零=${after.pending === 0}),error=${after.error}(3 条用户取消),原生confirm 增量=${native0}`)
    const keptOk = after.running === 1 && after.pending === 0 && after.error === 3
    // 收尾:等 J1 的 500 落地→恢复队列(被取消的 parked runOne 苏醒即退出,不复活)→清除已失败→净零
    const dl2 = Date.now() + 25000
    let fin = await stOf()
    while (Date.now() < dl2 && fin.error < 4) { await page.waitForTimeout(1000); fin = await stOf() }
    await pause(false)
    await page.waitForTimeout(500)
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /清除已失败/.test(x.textContent || '')); if (b) b.click() })
    const cfm2 = await page.waitForSelector('.snx-cfm-backdrop', { timeout: 3000 }).catch(() => null)
    if (cfm2) await page.evaluate(() => { const b = [...document.querySelectorAll('.snx-cfm-b')].find((x) => x.className.includes('danger')); if (b) b.click() })
    await page.waitForTimeout(1000)
    const end = await stOf()
    steps.push(`收尾:J1 落 500(error=${fin.error}/4),队列已恢复,清除已失败→J 残留=${end.n}(净变化=${end.n === 0 ? 0 : '非零'})`)
    return { pass: rerunOk && keptOk && cfm && native0 === 0 && end.n === 0, steps }
  } finally { await page.unroute('**/api/sensenova/generate') }
}

// 35. 对比 3 图「交换」:选 3 张进多图网格→点「交换」→网格顺序倒转(角标字母随位次)→
//     再点一次恢复;与 2 图交换按钮同款(.snx-cmp-mswap)(domain wb)
async function t35_compare_grid_swap(page) {
  const steps = []
  await switchTab(page, '对比')
  await page.waitForTimeout(500)
  let pool = await page.$$('.snx-cmp-pool-item')
  if (pool.length < 3) { await shot(page, '35', 'nopool'); return { pass: false, steps: [`对比池图不足(${pool.length} 张,需≥3)`] } }
  for (let i = 0; i < 3; i++) { await pool[i].click(); await page.waitForTimeout(450); pool = await page.$$('.snx-cmp-pool-item') }
  const readGrid = () => page.evaluate(() => ({
    cells: [...document.querySelectorAll('.snx-cmp-grid-cell')].map((c) => ({
      src: ((c.querySelector('img') || {}).getAttribute('src') || ''),
      tag: ((c.querySelector('.snx-cmp-grid-cell-tag') || {}).textContent || '').trim(),
    })),
    swapBtn: (() => { const b = document.querySelector('.snx-cmp-grid .snx-cmp-mswap'); return b ? { title: b.title } : null })(),
  }))
  const g0 = await readGrid()
  if (g0.cells.length !== 3) { await shot(page, '35', 'nogrid'); return { pass: false, steps: [`3 图网格未出现(现 ${g0.cells.length} 格)`] } }
  await shot(page, '35', 'before')
  const seq = (g) => JSON.stringify(g.cells.map((c) => c.src.slice(-12)))
  await page.evaluate(() => { const b = document.querySelector('.snx-cmp-grid .snx-cmp-mswap'); if (b) b.click() })
  await page.waitForTimeout(500)
  const g1 = await readGrid()
  await shot(page, '35', 'swapped')
  const reversed = g1.cells.map((c) => c.src).join('|') === g0.cells.map((c) => c.src).slice().reverse().join('|')
  // 角标字母随位次:交换前某图在位次 1(A),交换后同一图的角标应变为位次 3(C)
  const tagFlip = g0.cells.length === 3 && (() => {
    const a0 = g0.cells[0].src, c1 = g1.cells.find((c) => c.src === a0)
    return g0.cells[0].tag === 'A' && c1 && c1.tag === 'C'
  })()
  await page.evaluate(() => { const b = document.querySelector('.snx-cmp-grid .snx-cmp-mswap'); if (b) b.click() })
  await page.waitForTimeout(500)
  const g2 = await readGrid()
  const restored = g2.cells.map((c) => c.src).join('|') === g0.cells.map((c) => c.src).join('|')
  // 清场:移出 3 张,恢复空对比
  await page.evaluate(() => { [...document.querySelectorAll('.snx-cmp-slot-x')].forEach((b) => { try { b.click() } catch (e) { } }) })
  await page.waitForTimeout(400)
  steps.push(`交换前=${seq(g0)},角标=${JSON.stringify(g0.cells.map((c) => c.tag))},按钮title=${JSON.stringify(g0.swapBtn && g0.swapBtn.title)}`,
    `点「交换」后=${seq(g1)},角标=${JSON.stringify(g1.cells.map((c) => c.tag))},倒序=${reversed},首图角标 A→C=${tagFlip}`,
    `再点恢复=${restored}(=${seq(g2)})`)
  return { pass: reversed && tagFlip && restored && !!g0.swapBtn, steps }
}

// 36. 右键菜单新项:done 节点右键含 在画廊中定位/设为对比/复制图片/提取提示词,逐项动作落地:
//     定位→切画廊+目标卡带 .snx-locate 高亮且在视口内;设为对比→对比池选中计数+1;
//     复制图片→剪贴板含 image/png 位图;提取提示词→剪贴板文本=去 💬 前缀提示词(domain menu)
async function t36_ctx_menu_new_items(page) {
  const steps = []
  await switchTab(page, '画布')
  await page.waitForTimeout(1000)
  const corner = await page.evaluate(() => {
    const el = document.querySelector('.snx-canvas-stage, .snx-cv-stage')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.x + r.width - 12, y: r.y + r.height - 12 }
  })
  if (!corner) return { pass: false, steps: ['找不到画布 stage 容器'] }
  await page.mouse.click(corner.x, corner.y)   // 清历史选择,保证右键是单选菜单
  await page.waitForTimeout(400)
  // 目标=最新 done 节点——设为对比的画廊池只渲染最新 60 张(client-v4.js:6240 poolShown slice(0,60)),
  // 本套件多轮运行的对话产物使画布增至 60+,选旧图会落出池导致 .on 计数断言失真(r7 实测)
  const newest = (await fetchNodes(page))
    .filter((n) => n.status === 'done' && n.src && !/^基于这张图做变体/.test(n.prompt || ''))
    .sort((a, b) => (b.ts || 0) - (a.ts || 0))[0]
  if (!newest) { await shot(page, '36', 'nonode'); return { pass: false, steps: steps.concat('画布无 done 节点') } }
  // 程序化平移相机把目标居中(等效用户拖画布,不改 scale;f 适配在 70+ 节点下不可靠)。
  // tab 往返会按 doc 相机重挂载 Konva→每次回到画布页都要重新 pan(设为对比/在画廊中定位的前置)
  const panToTarget = async () => {
    const centerCam = (id) => page.evaluate((id) => {
      const stages = (window.Konva && window.Konva.stages || []).map((s) => ({ s, r: s.getContainer().getBoundingClientRect() })).sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height)
      if (!stages.length) return false
      const st = stages[0].s
      const l = st.getLayers()[1]
      const k = st.find((x) => x.getAttr && x.getAttr('snxId') === id)[0]
      if (!k) return false
      const scale = l.scaleX()
      l.position({ x: stages[0].r.width / 2 - (k.x() + k.width() / 2) * scale, y: stages[0].r.height / 2 - (k.y() + k.height() / 2) * scale })
      l.batchDraw()
      return true
    }, id)
    let s = await cvSnap(page)
    let e = s && s.nodes.find((n) => n.id === newest.id)
    if (e && e.inVp) return { id: e.id, center: e.center }
    if (!(await centerCam(newest.id))) return null
    await page.waitForTimeout(700)
    s = await cvSnap(page)
    e = s && s.nodes.find((n) => n.id === newest.id)
    return e && e.inVp ? { id: e.id, center: e.center } : null
  }
  const target = await panToTarget()
  if (!target) { await shot(page, '36', 'nonode'); return { pass: false, steps: steps.concat('平移后目标仍不在视口内 ' + newest.id.slice(0, 8)) } }
  const node = await page.evaluate(async (id) => {
    const ns = ((await (await fetch('/api/sensenova/canvas')).json()).doc.nodes) || []
    return ns.find((n) => n.id === id) || null
  }, target.id)
  if (!node) return { pass: false, steps: [`API 找不到节点 ${target.id.slice(0, 8)}`] }
  const expectPrompt = String(node.prompt || '').replace(/^💬\s*/, '')
  steps.push(`目标节点=${node.id.slice(0, 8)},提示词=${JSON.stringify(expectPrompt.slice(0, 24))}`)
  const openMenu = async (center) => {
    await page.keyboard.press('Escape').catch(() => {})   // 清选择/收菜单(pan 后角点可能落在节点上,改用 Esc)
    await page.waitForTimeout(300)
    await page.mouse.click(center.x, center.y, { button: 'right' })
    await page.waitForSelector('.snx-cv-menu', { timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(300)
  }
  const menuBtn = (label) => page.evaluate((label) => {
    const m = document.querySelector('.snx-cv-menu')
    if (!m) return null
    const b = [...m.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === label)
    if (b) { b.click(); return true }
    return false
  }, label)

  // 菜单清单
  await openMenu(target.center)
  const items = await page.evaluate(() => {
    const m = document.querySelector('.snx-cv-menu')
    if (!m || m.getBoundingClientRect().width < 30) return null
    return [...m.querySelectorAll('button')].map((b) => (b.textContent || '').trim()).filter((t) => t)
  })
  await shot(page, '36', 'menu')
  steps.push(`菜单项=${JSON.stringify(items)}`)
  const hasAll = !!items && ['在画廊中定位', '设为对比', '复制图片', '提取提示词'].every((k) => items.includes(k))
  if (!hasAll) { await page.keyboard.press('Escape').catch(() => {}); return { pass: false, steps: steps.concat('四个新菜单项未齐') } }

  // ① 复制图片→剪贴板含 image/png
  await page.evaluate(() => navigator.clipboard.writeText('AUDIT-CLIP-CLEARED').catch(() => {}))
  await menuBtn('复制图片')
  await page.waitForTimeout(1500)
  let clipTypes = []
  try { clipTypes = await page.evaluate(async () => { const its = await navigator.clipboard.read(); return its.map((i) => [...i.types]).flat() }) } catch (e) { clipTypes = ['(read 失败:' + String(e).slice(0, 40) + ')'] }
  const imgOk = clipTypes.includes('image/png')
  const toastCopy = (await readToasts(page)).join('§')
  steps.push(`复制图片:剪贴板 types=${JSON.stringify(clipTypes)},含 image/png=${imgOk},toast=${JSON.stringify(toastCopy.slice(0, 40))}`)

  // ② 提取提示词→剪贴板文本=去 💬 提示词
  await page.evaluate(() => navigator.clipboard.writeText('AUDIT-CLIP-CLEARED-2').catch(() => {}))
  await openMenu(target.center)
  await menuBtn('提取提示词')
  await page.waitForTimeout(1000)
  const clipTxt = await page.evaluate(() => navigator.clipboard.readText().catch(() => '(read 失败)'))
  const promptOk = clipTxt === expectPrompt
  steps.push(`提取提示词:剪贴板=${JSON.stringify(String(clipTxt).slice(0, 30))}…,与去💬提示词全等=${promptOk}`)

  // ③ 设为对比→对比池选中计数 +1(先看基线再回画布——tab 往返按 doc 相机重挂载,回画布先 panToTarget)
  await switchTab(page, '对比'); await page.waitForTimeout(600)
  const before = await page.evaluate(() => document.querySelectorAll('.snx-cmp-pool-item.on').length)
  await switchTab(page, '画布'); await page.waitForTimeout(600)
  const t3 = await panToTarget()
  if (!t3) { await shot(page, '36', 'nopan'); return { pass: false, steps: steps.concat('设为对比前 panToTarget 失败') } }
  await openMenu(t3.center)
  const menuHit = await menuBtn('设为对比')
  await page.waitForTimeout(900)
  const toastCmp = (await readToasts(page)).join('§')
  await switchTab(page, '对比')
  let afterN = -1, poolMounted = -1
  const dlC = Date.now() + 6000
  while (Date.now() < dlC) {
    await page.waitForTimeout(300)
    const s = await page.evaluate(() => ({ on: document.querySelectorAll('.snx-cmp-pool-item.on').length, pool: document.querySelectorAll('.snx-cmp-pool-item').length }))
    afterN = s.on; poolMounted = s.pool
    if (poolMounted > 0 && afterN >= before + 1) break
  }
  await shot(page, '36', 'compare')
  steps.push(`设为对比:菜单点击=${menuHit},对比池选中 ${before}→${afterN}(+1=${afterN === before + 1},池挂载卡数=${poolMounted}),toast=${JSON.stringify(toastCmp.slice(0, 46))}`)
  // 清场:移出全部对比选择
  await page.evaluate(() => { [...document.querySelectorAll('.snx-cmp-slot-x')].forEach((b) => { try { b.click() } catch (e) { } }) })
  await page.waitForTimeout(400)

  // ④ 在画廊中定位→切画廊+高亮卡在视口内(高亮窗=定位后 800ms 清 null,client-v4.js:4626-4636;
  //    负载下 Node 侧轮询会被 51 卡画廊首帧渲染饿死漏采——点菜单前先注入页内 MutationObserver+50ms 采样;
  //    本步放最后:locateInGallery 会切到画廊页,画布不再被右键)
  await switchTab(page, '画布'); await page.waitForTimeout(600)
  const t4 = await panToTarget()
  if (!t4) { await shot(page, '36', 'nopan'); return { pass: false, steps: steps.concat('定位前 panToTarget 失败') } }
  await page.evaluate((id) => {
    window.__locateSeen = null
    const check = () => {
      if (window.__locateSeen) return
      const c = document.querySelector('.snx-gal-item[data-gal-id="' + id + '"]')
      if (c && /(^| )snx-locate/.test(c.className)) {
        const r = c.getBoundingClientRect()
        window.__locateSeen = { h: Math.round(r.height), inVp: r.top >= 0 && r.bottom <= window.innerHeight && r.height > 20 }
      }
    }
    window.__locateCheck = check
    window.__locateMO = new MutationObserver(check)
    window.__locateMO.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] })
    window.__locateTimer = setInterval(check, 50)
  }, node.id)
  await openMenu(t4.center)
  await menuBtn('在画廊中定位')
  let loc = null
  const dl = Date.now() + 5000
  while (Date.now() < dl) {
    await page.waitForTimeout(150)
    loc = await page.evaluate(() => window.__locateSeen)
    if (loc) break
  }
  await page.evaluate(() => { try { window.__locateMO.disconnect() } catch (e) { } try { clearInterval(window.__locateTimer) } catch (e) { } })
  // 平滑滚动落点 settled 后卡在视口内(定位动作的持久性证据)
  await page.waitForTimeout(700)
  const loc2 = await page.evaluate((id) => {
    const c = document.querySelector('.snx-gal-item[data-gal-id="' + id + '"]')
    if (!c) return null
    const r = c.getBoundingClientRect()
    return {
      galVisible: !!document.querySelector('.snx-gal-grid'),
      h: Math.round(r.height),
      inVp: r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth && r.height > 20,
    }
  }, node.id)
  await shot(page, '36', 'locate')
  steps.push(`在画廊中定位:高亮(.snx-locate)页内捕获=${JSON.stringify(loc)}(800ms 窗,观测器抓拍),落点 settled:画廊视图在=${loc2 && loc2.galVisible},卡高=${loc2 && loc2.h}px,卡在视口内=${loc2 && loc2.inVp}`)

  const pass = hasAll && imgOk && promptOk && !!loc && !!loc2 && loc2.inVp && loc2.galVisible && afterN === before + 1
  return { pass, steps }
}

// 37. 批量下载:画布 Ctrl+A 全选→右键菜单「批量下载」→逐张触发 download 事件,
//     次数=选中集中 done 有 src 的节点数;toast 报数(domain menu)
async function t37_batch_download(page) {
  const steps = []
  await switchTab(page, '画布')
  await page.waitForTimeout(1000)
  const corner = await page.evaluate(() => {
    const el = document.querySelector('.snx-canvas-stage, .snx-cv-stage')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.x + r.width - 12, y: r.y + r.height - 12 }
  })
  if (!corner) return { pass: false, steps: ['找不到画布 stage 容器'] }
  await page.mouse.click(corner.x, corner.y)
  await page.waitForTimeout(400)
  const doneSrc = (await fetchNodes(page)).filter((n) => n.status === 'done' && n.src).length
  if (doneSrc < 2) return { pass: false, steps: [`done 有 src 节点不足(${doneSrc}),批量下载无从断言`] }
  await page.keyboard.press('Control+a')
  await page.waitForTimeout(600)
  const bar = await page.evaluate(() => { const ab = document.querySelector('.snx-ab'); return ab ? ((ab.querySelector('.snx-ab-tag') || {}).textContent || '').trim() : '' })
  steps.push(`Ctrl+A:多选条标签=${JSON.stringify(bar)},画布 done 有 src 节点=${doneSrc}(期望下载次数)`)
  const tgt = await cvSnap(page).then((s) => { if (!s) return null; const vis = s.nodes.filter((n) => n.inVp); return vis.length ? vis[0] : null })
  if (!tgt) return { pass: false, steps: steps.concat('视口内无节点可右键') }
  await page.mouse.click(tgt.center.x, tgt.center.y, { button: 'right' })
  await page.waitForSelector('.snx-cv-menu', { timeout: 3000 }).catch(() => {})
  await page.waitForTimeout(300)
  const menuHas = await page.evaluate(() => {
    const m = document.querySelector('.snx-cv-menu')
    const b = m && [...m.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === '批量下载')
    if (!b) return false
    return true
  })
  await shot(page, '37', 'menu')
  steps.push(`多选右键菜单含「批量下载」=${menuHas}`)
  if (!menuHas) { await page.keyboard.press('Escape').catch(() => {}); return { pass: false, steps } }
  let downloads = 0
  const onDl = () => { downloads++ }
  page.on('download', onDl)
  try {
    await page.evaluate(() => {
      const m = document.querySelector('.snx-cv-menu')
      const b = m && [...m.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === '批量下载')
      if (b) b.click()
    })
    await page.waitForTimeout(doneSrc * 250 + 3000)   // 逐张 250ms 间隔
  } finally { page.off('download', onDl) }
  const toast = (await readToasts(page)).join('§')
  await shot(page, '37', 'downloads')
  steps.push(`点「批量下载」后:download 事件=${downloads} 次(期望=${doneSrc}),toast=${JSON.stringify(toast.slice(0, 40))}`)
  // 清场:清选择
  await page.keyboard.press('Escape').catch(() => {})
  await page.mouse.click(corner.x, corner.y)
  const pass = menuHas && downloads === doneSrc && new RegExp('开始下载 ' + doneSrc + ' 张').test(toast)
  return { pass, steps }
}

// 38. 回合尾折叠:新回合完成后,不展开折叠区(全程不点「已完成」头)的状态下,回合尾座位的结果图
//     可见——scrollIntoView 后量得非 0 高度且在视口内(批次1 实现形态=宿主 deliverables 座位直通,
//     turnTail 不受回合折叠影响,client-v4.js:4341-4344;非 deferred 缓解,按直通形态断言)(domain fold)
async function t38_tail_visible_after_fold(page) {
  const steps = []
  const cfg = await page.evaluate(async () => { try { return (await (await fetch('/api/sensenova/config')).json()).config } catch (e) { return null } })
  steps.push(`mock 前置:config.baseUrl=${cfg ? cfg.baseUrl : '(读取失败)'}`)
  if (!cfg || !cfg.baseUrl.includes(':' + MOCK_PORT)) return { pass: false, steps: steps.concat('mock 上游未生效,为不触真实 API 放弃对话回合') }
  const P = 'AUDIT-V14 回合尾折叠验收:暮色湖面一叶小舟,远处灯塔亮起暖光'
  const sent = await chatSend(page, `请调用 sensenova_generate_image 工具生成一张图。参数:prompt=「${P}」(字面量原样传入,不要改写),size=「1024x1024」。直接调用工具,不要回复任何文字,不要请求确认。`)
  steps.push(`发消息:${sent ? '已提交' : 'composer 未找到'}`)
  if (!sent) return { pass: false, steps }
  // 等最新回合尾结果图就绪(全程不做任何展开操作)
  let tail = null
  const dl = Date.now() + 160000
  while (Date.now() < dl) {
    await page.waitForTimeout(2000)
    tail = await page.evaluate(() => {
      const ts = [...document.querySelectorAll('.snx-tail')]
      const t = ts[ts.length - 1]
      if (!t) return null
      const img = t.querySelector('.snx-tail-img img')
      if (!img) return null
      return { src: img.getAttribute('src') || '', complete: img.complete, nw: img.naturalWidth }
    })
    if (tail && tail.src.includes('/api/sensenova/image/') && tail.complete && tail.nw > 0) break
    const err = await page.evaluate(() => { const e = document.querySelector('.snx-tv-err'); return e ? e.textContent.trim() : '' })
    if (err) return { pass: false, steps: steps.concat('错误卡:' + err.slice(0, 80)) }
  }
  if (!tail || !(tail.src.includes('/api/sensenova/image/') && tail.nw > 0)) {
    await shot(page, '38', 'notail')
    return { pass: false, steps: steps.concat(`160s 内回合尾结果图未就绪(tail=${JSON.stringify(tail)})`) }
  }
  steps.push(`回合尾图已就绪:src=${tail.src.slice(-28)},natural=${tail.nw}px(等待期未做任何展开操作)`)
  // 滚动≠展开:仅 scrollIntoView,然后量可见性
  await page.evaluate(() => {
    const ts = [...document.querySelectorAll('.snx-tail')]
    const img = ts.length && ts[ts.length - 1].querySelector('.snx-tail-img img')
    if (img && img.scrollIntoView) img.scrollIntoView({ block: 'center' })
  })
  await page.waitForTimeout(700)
  const vis = await page.evaluate(() => {
    const ts = [...document.querySelectorAll('.snx-tail')]
    const t = ts[ts.length - 1]
    const img = t && t.querySelector('.snx-tail-img img')
    if (!img) return null
    const r = img.getBoundingClientRect()
    const cs = getComputedStyle(img)
    const foldedHeader = [...document.querySelectorAll('button,div[role="button"],summary')].filter((e) => /已完成/.test(e.textContent || '') && e.getBoundingClientRect().height > 0 && e.getBoundingClientRect().height < 60).length
    return {
      h: Math.round(r.height), w: Math.round(r.width), disp: cs.display, viss: cs.visibility,
      inVp: r.top < window.innerHeight && r.bottom > 0 && r.height > 20,
      foldedHeader,
    }
  })
  await shot(page, '38', 'tail-visible')
  steps.push(`不展开直接量:回合尾图渲染高=${vis && vis.h}px×${vis && vis.w}px,display=${vis && vis.disp},visibility=${vis && vis.viss},在视口内=${vis && vis.inVp}`,
    `对照:折叠头(「已完成…」)在场=${vis && vis.foldedHeader}(过程区被宿主折叠而尾图仍可见=直通形态成立)`)
  const pass = !!vis && vis.h > 30 && vis.disp !== 'none' && vis.viss !== 'hidden' && vis.inVp
  return { pass, steps }
}

// ══════════════ v15 新增 6 条断言(SPEC-15 资产流轮) ══════════════

// 测试画板(经画廊「新建」UI 造;created 标记跨用例共享,t41 测后仅删本验收新建的板)
const AUDIT_B_NAME = 'AUDIT-B'
const AUDIT_C_NAME = 'AUDIT-C'
const AUDIT_BOARD_CREATED = {}
// 画廊画板筛选 chips(client-v4.js:5839-5851):全部(text)/未分组(data-galboard=none)/画板(data-galboard=id)
const galBoardChipId = (page, name) => page.evaluate((name) => {
  const c = [...document.querySelectorAll('.snx-gal-bar button.chip[data-galboard]')].find((x) => x.textContent.trim() === name)
  return c ? c.getAttribute('data-galboard') : null
}, name)
const clickGalChipByBoard = (page, id) => page.evaluate((id) => {
  const c = [...document.querySelectorAll('.snx-gal-bar button.chip[data-galboard]')].find((x) => x.getAttribute('data-galboard') === id)
  if (!c) return false
  c.click(); return true
}, id)
const clickGalChipAll = (page) => page.evaluate(() => {
  const c = [...document.querySelectorAll('.snx-gal-bar button.chip')].find((x) => x.textContent.trim() === '全部')
  if (!c) return false
  c.click(); return true
})
const galChipOn = (page, id) => page.evaluate((id) => {
  const c = id === null
    ? [...document.querySelectorAll('.snx-gal-bar button.chip')].find((x) => x.textContent.trim() === '全部')
    : [...document.querySelectorAll('.snx-gal-bar button.chip[data-galboard]')].find((x) => x.getAttribute('data-galboard') === id)
  return c ? c.className.includes('on') : false
}, id)
// 画廊「新建」UI 造板(idempotent:先按名找 chip,找不到再走新建输入;须已在画廊页签)
async function ensureBoardUI(page, name) {
  let id = await galBoardChipId(page, name)
  if (id) return { id, created: false }
  const opened = await page.evaluate(() => {
    const b = [...document.querySelectorAll('.snx-gal-bar button.chip')].find((x) => /新建/.test(x.textContent || ''))
    if (!b) return false
    b.click(); return true
  })
  if (!opened) return null
  const inp = await page.waitForSelector('.snx-gal-bar input[placeholder="画板名称"]', { timeout: 3000 }).catch(() => null)
  if (!inp) return null
  await inp.click().catch(() => {})
  await page.keyboard.type(name, { delay: 12 })
  await page.keyboard.press('Enter')
  const dl = Date.now() + 5000
  while (Date.now() < dl) {
    await page.waitForTimeout(300)
    id = await galBoardChipId(page, name)
    if (id) { AUDIT_BOARD_CREATED[name] = true; return { id, created: true } }
  }
  return null
}
// 生图表单「目标画板」SnxSelect(client-v4.js:7406-7432,块 .snx-gen-styles 标签=目标画板)
const boardBtnLabel = (page) => page.evaluate(() => {
  const blk = [...document.querySelectorAll('.snx-gen-styles')].find((d) => /目标画板/.test((d.querySelector('.lb') || {}).textContent || ''))
  return blk && blk.querySelector('.snx-sel-btn') ? blk.querySelector('.snx-sel-btn').textContent.trim() : null
})
const openBoardSel = (page) => page.evaluate(() => {
  const blk = [...document.querySelectorAll('.snx-gen-styles')].find((d) => /目标画板/.test((d.querySelector('.lb') || {}).textContent || ''))
  const btn = blk && blk.querySelector('.snx-sel-btn')
  if (!btn) return false
  btn.click(); return true
})
const selOptions = (page) => page.evaluate(() => [...document.querySelectorAll('.snx-sel-pop .snx-sel-opt')].map((o) => o.textContent.trim()))
const pickBoardOpt = (page, label) => page.evaluate((label) => {
  const o = [...document.querySelectorAll('.snx-sel-pop .snx-sel-opt')].find((x) => x.textContent.trim() === label)
  if (!o) return false
  o.click(); return true
}, label)
// 决策面板「目标」行(client-v4.js:7510:h('span','目标：',h('b',decideTarget)))
async function readDecideTarget(page) {
  await page.hover('.snx-gen-go')
  await page.waitForSelector('.snx-gen-decide', { timeout: 3000 }).catch(() => {})
  await page.waitForTimeout(400)
  return page.evaluate(() => {
    const p = document.querySelector('.snx-gen-decide')
    if (!p) return null
    const cs = getComputedStyle(p)
    if (cs.display === 'none' || cs.visibility === 'hidden') return null
    const r = [...p.querySelectorAll('.snx-gen-decide-r')].find((x) => /目标/.test(x.textContent || ''))
    return r ? r.textContent.replace(/\s+/g, ' ').trim() : null
  })
}
async function typePrompt(page, text) {
  const ta = await page.$('.snx-gen-ta')
  if (!ta) return false
  await ta.click(); await ta.fill(''); if (text) await page.keyboard.type(text, { delay: 5 })
  return true
}
// 画廊卡片 Ctrl+点击单选(t06 同款;按 data-gal-id 定位,scrollIntoView 后取视口坐标)
async function ctrlClickCardById(page, id) {
  const el = await page.evaluate((id) => {
    const c = document.querySelector('.snx-gal-item[data-gal-id="' + id + '"]')
    if (!c) return null
    c.scrollIntoView({ block: 'center' })
    const r = c.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  }, id)
  if (!el) return false
  await page.mouse.move(el.x, el.y)
  await page.keyboard.down('Control')
  await page.mouse.down(); await page.mouse.up()
  await page.keyboard.up('Control')
  await page.waitForTimeout(450)
  return true
}
// 画廊右键删除一张卡(菜单删除项→应用内确认 danger),轮询 API 确认节点消失
async function deleteGalCard(page, id) {
  const box = await page.evaluate((id) => {
    const c = document.querySelector('.snx-gal-item[data-gal-id="' + id + '"]')
    if (!c) return null
    c.scrollIntoView({ block: 'center' })
    const r = c.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  }, id)
  if (!box) return 'card 不在画廊'
  await page.mouse.click(box.x, box.y, { button: 'right' })
  await page.waitForSelector('.snx-gal-menu', { timeout: 3000 }).catch(() => {})
  const clicked = await page.evaluate(() => {
    const m = document.querySelector('.snx-gal-menu')
    const b = m && [...m.querySelectorAll('button')].find((x) => /删除/.test(x.textContent || ''))
    if (!b) return false
    b.click(); return true
  })
  if (!clicked) { await page.keyboard.press('Escape').catch(() => {}); return '菜单无删除项' }
  const cfm = await page.waitForSelector('.snx-cfm-backdrop', { timeout: 3000 }).catch(() => null)
  if (!cfm) return '确认弹层未出现'
  await page.evaluate(() => { const b = [...document.querySelectorAll('.snx-cfm-b')].find((x) => x.className.includes('danger')); if (b) b.click() })
  const dl = Date.now() + 8000
  while (Date.now() < dl) {
    await page.waitForTimeout(500)
    if (!((await fetchNodes(page)).some((n) => n.id === id))) return 'deleted'
  }
  return '删除后节点仍在'
}
// 画板 chip 右键删除(alt=仅删除画板保留图,client-v4.js:3944-3948 三按钮;仅删本验收新建的板)
async function deleteBoardChip(page, name) {
  const box = await page.evaluate((name) => {
    const c = [...document.querySelectorAll('.snx-gal-bar button.chip[data-galboard]')].find((x) => x.textContent.trim() === name)
    if (!c) return null
    const r = c.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  }, name)
  if (!box) return 'chip 不在'
  await page.mouse.click(box.x, box.y, { button: 'right' })
  const cfm = await page.waitForSelector('.snx-cfm-backdrop', { timeout: 3000 }).catch(() => null)
  if (!cfm) { await page.keyboard.press('Escape').catch(() => {}); return '确认弹层未出现' }
  const txt = await page.evaluate(() => (document.querySelector('.snx-cfm-backdrop') || {}).textContent || '')
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.snx-cfm-b')].find((x) => !x.className.includes('danger') && /仅删除画板/.test(x.textContent || ''))
    if (b) b.click()
  })
  const dl = Date.now() + 6000
  while (Date.now() < dl) {
    await page.waitForTimeout(400)
    if ((await galBoardChipId(page, name)) === null) return 'deleted(alt 文案=' + /画板内 \d+ 张图/.test(txt) + ')'
  }
  return '删除后 chip 仍在'
}

// 39. 归板跟随:画廊筛选到画板 B→决策面板目标行=跟随画廊:画板「B」;画廊切全部→目标=跟随画廊:未分组
//     (SPEC-15 ①:galBoard 镜像进 genPrefs(client-v4.js:4487),decideTarget 跟随解析(7115-7120))(domain board)
//     前置恢复:followBoard 为模块级内存态(t14 画板行回填/t30 目标清理会置 false 且跨用例存留),
//     先经「回到跟随画廊」UI 路径恢复(与 fresh 会话默认跟随等效),再断言「筛选驱动目标」跟随性
async function t39_board_follow(page) {
  const steps = []
  await switchTab(page, '画廊')
  const bB = await ensureBoardUI(page, AUDIT_B_NAME)
  const bC = await ensureBoardUI(page, AUDIT_C_NAME)
  if (!bB || !bC) { await shot(page, '39', 'noboard'); return { pass: false, steps: steps.concat(`画板准备失败:B=${!!bB} C=${!!bC}`) } }
  steps.push(`画板就绪:B=「${AUDIT_B_NAME}」(${bB.created ? '本断言新建' : '既有'}),C=「${AUDIT_C_NAME}」(${bC.created ? '本断言新建' : '既有'})`)
  // 前置:画廊回「全部」+ 恢复跟随态
  await switchTab(page, '画廊')
  const cAll0 = await clickGalChipAll(page)
  await page.waitForTimeout(400)
  await switchTab(page, '生图')
  await typePrompt(page, 'AUDIT-T39 归板跟随')
  const label0 = await boardBtnLabel(page)
  let restored = null
  if (label0 && !label0.includes('跟随画廊')) {
    await openBoardSel(page)
    await page.waitForTimeout(400)
    restored = await pickBoardOpt(page, '回到跟随画廊')
    await page.waitForTimeout(500)
  }
  const label0b = await boardBtnLabel(page)
  const t0 = await readDecideTarget(page)
  await shot(page, '39', 'prefollow')
  steps.push(`前置:画廊回全部=${cAll0},目标按钮 ${JSON.stringify(label0)}${restored ? '→点「回到跟随画廊」' : ''}→${JSON.stringify(label0b)},基线目标行=${JSON.stringify(t0)}(期望 跟随画廊:未分组)`)
  // 筛选到画板 B
  await switchTab(page, '画廊')
  const c1 = await clickGalChipByBoard(page, bB.id)
  await page.waitForTimeout(500)
  const on1 = await galChipOn(page, bB.id)
  await shot(page, '39', 'filterB')
  steps.push(`画廊筛选 B:点击=${c1},chip 高亮=${on1}`)
  // 生图决策面板目标行=跟随画廊:画板「B」
  await switchTab(page, '生图')
  const t1 = await readDecideTarget(page)
  await shot(page, '39', 'follow')
  steps.push(`筛选 B 时目标行=${JSON.stringify(t1)}(期望含 跟随画廊:画板「${AUDIT_B_NAME}」)`)
  // 画廊切全部→目标=跟随画廊:未分组
  await switchTab(page, '画廊')
  const c2 = await clickGalChipAll(page)
  await page.waitForTimeout(500)
  const on2 = await galChipOn(page, null)
  await switchTab(page, '生图')
  const t2 = await readDecideTarget(page)
  await shot(page, '39', 'all')
  steps.push(`切「全部」:点击=${c2},chip 高亮=${on2},目标行=${JSON.stringify(t2)}(期望 跟随画廊:未分组)`)
  await typePrompt(page, '')
  const baseOk = !!t0 && t0.includes('跟随画廊:未分组')
  const followOk = !!t1 && t1.includes('跟随画廊:画板「' + AUDIT_B_NAME + '」')
  const allOk = !!t2 && t2.includes('跟随画廊:未分组')
  return { pass: cAll0 && baseOk && c1 && on1 && followOk && c2 && on2 && allOk, steps }
}

// 40. 手动覆盖:跟随时 gen form 手动选画板 C→目标=画板「C」且画廊切全部/切 B 均不覆盖;
//     下拉首项「回到跟随画廊」一键恢复跟随(SPEC-15 ①:onChange 脱离跟随(7417-7421),FOLLOW_BOARD
//     哨兵首项(7428))(domain board)
async function t40_board_manual(page) {
  const steps = []
  await switchTab(page, '画廊')
  const bB = await ensureBoardUI(page, AUDIT_B_NAME)
  const bC = await ensureBoardUI(page, AUDIT_C_NAME)
  if (!bB || !bC) return { pass: false, steps: steps.concat('画板 B/C 不在场(t39 应已备)') }
  await clickGalChipByBoard(page, bB.id)
  await page.waitForTimeout(400)
  await switchTab(page, '生图')
  await typePrompt(page, 'AUDIT-T40 手动覆盖')
  const label0 = await boardBtnLabel(page)
  steps.push(`基线(跟随态)按钮=${JSON.stringify(label0)}`)
  // 手动选 C
  await openBoardSel(page)
  await page.waitForTimeout(400)
  const opts = await selOptions(page)
  const picked = await pickBoardOpt(page, AUDIT_C_NAME)
  await page.waitForTimeout(500)
  const label1 = await boardBtnLabel(page)
  const t1 = await readDecideTarget(page)
  await shot(page, '40', 'manual')
  steps.push(`下拉选项=${JSON.stringify(opts)},点「${AUDIT_C_NAME}」=${picked},按钮→${JSON.stringify(label1)},目标行=${JSON.stringify(t1)}(期望 画板「${AUDIT_C_NAME}」无跟随前缀)`)
  // 画廊切全部/切 B→手动目标不被覆盖
  await switchTab(page, '画廊')
  await clickGalChipAll(page); await page.waitForTimeout(400)
  await switchTab(page, '生图')
  const t2 = await readDecideTarget(page)
  const label2 = await boardBtnLabel(page)
  await switchTab(page, '画廊')
  await clickGalChipByBoard(page, bB.id); await page.waitForTimeout(400)
  await switchTab(page, '生图')
  const t3 = await readDecideTarget(page)
  await shot(page, '40', 'nooverride')
  steps.push(`画廊切全部→按钮=${JSON.stringify(label2)},目标行=${JSON.stringify(t2)};切回 B→目标行=${JSON.stringify(t3)}(均应仍 画板「${AUDIT_C_NAME}」)`)
  // 回到跟随画廊
  await openBoardSel(page)
  await page.waitForTimeout(400)
  const first = await page.evaluate(() => { const o = document.querySelector('.snx-sel-pop .snx-sel-opt'); return o ? o.textContent.trim() : null })
  const back = await pickBoardOpt(page, '回到跟随画廊')
  await page.waitForTimeout(500)
  const label3 = await boardBtnLabel(page)
  const t4 = await readDecideTarget(page)
  await shot(page, '40', 'restore')
  steps.push(`手动态下拉首项=${JSON.stringify(first)},点「回到跟随画廊」=${back},按钮→${JSON.stringify(label3)},目标行=${JSON.stringify(t4)}(期望 跟随画廊:画板「${AUDIT_B_NAME}」)`)
  await typePrompt(page, '')
  const manualOk = picked && label1 === AUDIT_C_NAME && !!t1 && t1.includes('画板「' + AUDIT_C_NAME + '」') && !t1.includes('跟随画廊')
  const noOverrideOk = t2 === t1 && t3 === t1 && label2 === AUDIT_C_NAME
  const restoreOk = first === '回到跟随画廊' && back && !!label3 && label3.includes('跟随画廊:画板「' + AUDIT_B_NAME + '」')
    && !!t4 && t4.includes('跟随画廊:画板「' + AUDIT_B_NAME + '」')
  return { pass: manualOk && noOverrideOk && restoreOk, steps }
}

// 41. 归板落图:跟随 B 时放行一次生成(全程不拦截 generate;mock 上游在位时真实走 客户端→服务端→
//     mock 上游 回环,0 次触达真实 API)→新节点 status=done 且 boardId=B;画廊 B 筛选下新卡可见;
//     测后画廊右键删除该节点、右键仅删除本验收新建的画板(净变化为零)(domain board)
async function t41_board_passthrough(page) {
  const steps = []
  const cfg = await page.evaluate(async () => { try { return (await (await fetch('/api/sensenova/config')).json()).config } catch (e) { return null } })
  const mocked = !!cfg && String(cfg.baseUrl || '').includes(':' + MOCK_PORT)
  steps.push(`mock 上游=${mocked ? '在位(baseUrl=' + cfg.baseUrl + ')' : '不在位(' + (cfg ? cfg.baseUrl : '读取失败') + ')→为不触真实 API 放弃放行'}`)
  if (!mocked) { await shot(page, '41', 'nomock'); return { pass: false, steps } }
  await switchTab(page, '画廊')
  const bB = await ensureBoardUI(page, AUDIT_B_NAME)
  if (!bB) return { pass: false, steps: steps.concat('画板 B 不在场') }
  await clickGalChipByBoard(page, bB.id)
  await page.waitForTimeout(400)
  await switchTab(page, '生图')
  const P = 'AUDIT-T41 归板落图 ' + Date.now()
  await typePrompt(page, P)
  const t1 = await readDecideTarget(page)
  steps.push(`放行前:跟随目标行=${JSON.stringify(t1)}(应含 跟随画廊:画板「${AUDIT_B_NAME}」)`)
  // 放行:不 route/fulfill 任何 generate 请求
  await page.evaluate(() => { const b = document.querySelector('.snx-gen-go'); if (b) b.click() })
  let node = null
  const dl = Date.now() + 45000
  while (Date.now() < dl) {
    await page.waitForTimeout(1000)
    node = (await fetchNodes(page)).find((n) => n.prompt === P) || null
    if (node && (node.status === 'done' || node.status === 'error')) break
  }
  await shot(page, '41', 'node')
  const boardOk = !!node && node.status === 'done' && node.boardId === bB.id
  steps.push(`放行后:节点=${node ? node.id.slice(0, 8) + '/status=' + node.status + '/boardId=' + (node.boardId || '(无)') : '(未落)'}(期望 done+boardId=${bB.id}),src=${node ? String(node.src || '').slice(0, 44) : '-'}(服务端图 URL=真实回环)`)
  // 画廊 B 筛选下新卡可见(落板 UI 侧佐证)
  await switchTab(page, '画廊')
  await page.waitForTimeout(800)
  const card = node ? await page.evaluate((id) => {
    const c = document.querySelector('.snx-gal-item[data-gal-id="' + id + '"]')
    if (!c) return null
    c.scrollIntoView({ block: 'center' })
    const r = c.getBoundingClientRect()
    return { h: Math.round(r.height), img: !!c.querySelector('.snx-gal-item-img img'), inVp: r.top >= 0 && r.bottom <= window.innerHeight }
  }, node.id) : null
  await shot(page, '41', 'card')
  steps.push(`画廊 B 筛选下:新卡=${card ? '在场(高 ' + card.h + 'px,图=' + card.img + ',视口内=' + card.inVp + ')' : '(未出现)'}(期望被 B 筛选命中=归板 UI 佐证)`)
  // 清场:删放行节点 + 仅删除本验收新建的画板 + 筛选回全部
  const del = node ? await deleteGalCard(page, node.id) : '(无节点可删)'
  const cleanBoards = []
  for (const nm of [AUDIT_B_NAME, AUDIT_C_NAME]) {
    if (AUDIT_BOARD_CREATED[nm]) { cleanBoards.push(nm + '=' + await deleteBoardChip(page, nm)) }
  }
  await clickGalChipAll(page)
  await page.waitForTimeout(400)
  steps.push(`清场:放行节点删除=${del},新建画板清理=${cleanBoards.join(',') || '(无新建板)'},画廊筛选已回全部`)
  const followOk = !!t1 && t1.includes('跟随画廊:画板「' + AUDIT_B_NAME + '」')
  return { pass: mocked && followOk && boardOk && !!card && card.img && del === 'deleted', steps }
}

// 42. 批量变体(拦截 500):画廊多选 2 张 done→批量条「批量变体」→2 次 POST /generate、reference
//     分别为两张源图 src、prompt=「基于这张图做变体：」+源提示词、串行(第 2 请求在第 1 应答后)、
//     toast 进度「批量变体 1/2」「2/2」+汇总「批量变体全部失败(2 张)」(SPEC-15 ②:batchVariantNodes
//     client-v4.js:4675-4739;700ms 延迟拦截使进度 toast 可捕获、串行间隔可测)(domain batch)
async function t42_batch_variant_500(page) {
  const steps = []
  await switchTab(page, '画廊')
  await page.evaluate(() => { const b = [...document.querySelectorAll('.snx-gal-bulk button')].find((x) => /清空/.test(x.textContent || '')); if (b) b.click() })
  await page.waitForTimeout(400)
  const cands = (await fetchNodes(page))
    .filter((n) => n.status === 'done' && n.src && !/^基于这张图做变体/.test(n.prompt || ''))
    .sort((a, b) => (b.ts || 0) - (a.ts || 0))
  if (cands.length < 2) { await shot(page, '42', 'nocand'); return { pass: false, steps: steps.concat(`候选 done 卡不足(${cands.length})`) } }
  const [A, B2] = cands
  const cA = await ctrlClickCardById(page, A.id)
  const cB = await ctrlClickCardById(page, B2.id)
  const bulk = await page.evaluate(() => {
    const bar = document.querySelector('.snx-gal-bulk')
    if (!bar) return null
    const btn = [...bar.querySelectorAll('button.bt')].find((x) => /批量变体|变体中/.test(x.textContent || ''))
    return { ct: ((bar.querySelector('.ct') || {}).textContent || '').trim(), hasBtn: !!btn, btnText: btn ? btn.textContent.trim() : '', disabled: btn ? btn.disabled : true }
  })
  await shot(page, '42', 'selected')
  steps.push(`Ctrl+点选 A=${cA}(${String(A.prompt || '').slice(0, 16)}…/src=${String(A.src).slice(-20)}),B=${cB}(${String(B2.prompt || '').slice(0, 16)}…/src=${String(B2.src).slice(-20)})`,
    `批量条=${bulk ? JSON.stringify({ 计数: bulk.ct, 按钮: bulk.btnText, 禁用: bulk.disabled }) : '(未出现)'}`)
  if (!bulk || !bulk.hasBtn || bulk.disabled) return { pass: false, steps: steps.concat('「批量变体」按钮不在场或禁用') }
  const hits = []
  const seen = []
  await page.route('**/api/sensenova/generate', (route) => {
    let body = null
    try { body = JSON.parse(route.request().postData() || 'null') } catch (e) { }
    hits.push({ at: Date.now(), body })
    setTimeout(() => { try { route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'audit: simulated failure' }) }) } catch (e) { } }, 700)
  })
  try {
    await page.evaluate(() => { const b = [...document.querySelectorAll('.snx-gal-bulk button.bt')].find((x) => /批量变体/.test(x.textContent || '')); if (b) b.click() })
    const dl = Date.now() + 20000
    while (Date.now() < dl) {
      await page.waitForTimeout(200)
      for (const t of await readToasts(page)) if (!seen.includes(t)) seen.push(t)
      if (hits.length >= 2 && seen.some((x) => /变体完成|全部失败/.test(x))) break
    }
    await page.waitForTimeout(500)
    for (const t of await readToasts(page)) if (!seen.includes(t)) seen.push(t)
  } finally { await page.unroute('**/api/sensenova/generate') }
  const b0 = hits[0] && hits[0].body, b1 = hits[1] && hits[1].body
  const strip = (s) => String(s || '').replace(/^💬\s*/, '')
  const refOk = !!b0 && !!b1 && b0.reference === A.src && b1.reference === B2.src
  const pOk = !!b0 && !!b1 && b0.prompt === '基于这张图做变体：' + strip(A.prompt) && b1.prompt === '基于这张图做变体：' + strip(B2.prompt)
  const serialGap = hits.length === 2 ? hits[1].at - hits[0].at : -1
  const serialOk = serialGap >= 650
  const progOk = seen.some((x) => /批量变体 1\/2/.test(x)) && seen.some((x) => /批量变体 2\/2/.test(x))
  const sumOk = seen.some((x) => /批量变体全部失败（2 张）/.test(x))
  // 服务端 doc 由 autosave 700ms 防抖落盘(client-v4.js:2164-2184)——轮询等两条 error 都可读,不等会误报(上轮复验实测)
  let errVars = -1
  const dlErr = Date.now() + 8000
  while (Date.now() < dlErr) {
    await page.waitForTimeout(500)
    errVars = (await fetchNodes(page)).filter((n) => /^基于这张图做变体/.test(n.prompt || '') && n.status === 'error').length
    if (errVars >= 2) break
  }
  await shot(page, '42', 'toasts')
  steps.push(`请求数=${hits.length}(期望 2),reference 对应两张=${refOk}(req1=${b0 ? String(b0.reference || '').slice(-20) : '-'},req2=${b1 ? String(b1.reference || '').slice(-20) : '-'})`,
    `prompt 前缀+源词尾=${pOk},串行间隔=${serialGap}ms(≥650=第2请求在第1应答后)`,
    `toast 进度 1/2、2/2=${progOk},汇总「批量变体全部失败(2 张)」=${sumOk};toasts=${JSON.stringify(seen).slice(0, 160)}`,
    `变体 error 节点=${errVars}(期望 2,两张源图各 1 条,t43 清场)`)
  return { pass: hits.length === 2 && refOk && pOk && serialOk && progOk && sumOk && errVars === 2, steps }
}

// 43. 批量变体放行抽查:同款多选 2 张,第 1 请求放行 200(mock png,浏览器层 fulfill 成功应答)、
//     第 2 请求 500→画布新增 1 条 done 变体节点(parentId=源图、params.reference=源 src、
//     src=dataURL),另一条 error;汇总 toast「1 张变体完成,1 张失败」;测后清除已失败+右键删除
//     done 变体,净变化为零(domain batch)
async function t43_batch_variant_pass(page) {
  const steps = []
  await switchTab(page, '画廊')
  await page.evaluate(() => { const b = [...document.querySelectorAll('.snx-gal-bulk button')].find((x) => /清空/.test(x.textContent || '')); if (b) b.click() })
  await page.waitForTimeout(400)
  const cands = (await fetchNodes(page))
    .filter((n) => n.status === 'done' && n.src && !/^基于这张图做变体/.test(n.prompt || ''))
    .sort((a, b) => (b.ts || 0) - (a.ts || 0))
  if (cands.length < 2) return { pass: false, steps: steps.concat(`候选 done 卡不足(${cands.length})`) }
  const [A, B2] = cands
  const cA = await ctrlClickCardById(page, A.id)
  const cB = await ctrlClickCardById(page, B2.id)
  const preVar = (await fetchNodes(page)).filter((n) => /^基于这张图做变体/.test(n.prompt || '')).map((n) => n.id)
  const hits = []
  await page.route('**/api/sensenova/generate', (route) => {
    let body = null
    try { body = JSON.parse(route.request().postData() || 'null') } catch (e) { }
    const i = hits.push({ at: Date.now(), body }) - 1
    setTimeout(() => {
      try {
        if (i === 0) route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, image: { kind: 'base64', value: pngB64(320, 240, [36, 144, 220]) } }) })
        else route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'audit: simulated failure' }) })
      } catch (e) { }
    }, 300)
  })
  let doneVar = null, errVarB = null
  const seen = []
  try {
    await page.evaluate(() => { const b = [...document.querySelectorAll('.snx-gal-bulk button.bt')].find((x) => /批量变体/.test(x.textContent || '')); if (b) b.click() })
    const dl = Date.now() + 20000
    while (Date.now() < dl) {
      await page.waitForTimeout(300)
      for (const t of await readToasts(page)) if (!seen.includes(t)) seen.push(t)
      const vars = (await fetchNodes(page)).filter((n) => /^基于这张图做变体/.test(n.prompt || '') && !preVar.includes(n.id))
      doneVar = vars.find((n) => n.status === 'done') || null
      errVarB = vars.find((n) => n.status === 'error' && n.parentId === B2.id) || null
      if (doneVar && errVarB) break
    }
  } finally { await page.unroute('**/api/sensenova/generate') }
  await shot(page, '43', 'done')
  const strip = (s) => String(s || '').replace(/^💬\s*/, '')
  const refOk = !!doneVar && doneVar.params && doneVar.params.reference === A.src
  const parentOk = !!doneVar && doneVar.parentId === A.id
  const srcOk = !!doneVar && /^data:image\/png;base64,/.test(String(doneVar.src || ''))
  const promptOk = !!doneVar && doneVar.prompt === '基于这张图做变体：' + strip(A.prompt)
  const sumOk = seen.some((x) => /1 张变体完成，1 张失败/.test(x))
  const req0Ref = hits[0] && hits[0].body ? String(hits[0].body.reference || '').slice(-20) : '-'
  steps.push(`点选 A=${cA}/B=${cB};放行请求 reference=${req0Ref}(源 A=${String(A.src).slice(-20)})`,
    `done 变体=${doneVar ? doneVar.id.slice(0, 8) : '(未落)'}:parentId=源A=${parentOk},params.reference=源A.src=${refOk},src=dataURL=${srcOk},prompt 尾接源词=${promptOk}`,
    `B 的变体转 error=${!!errVarB},汇总 toast「1 张变体完成，1 张失败」=${sumOk};toasts=${JSON.stringify(seen).slice(0, 120)}`)
  // 清场:done 变体右键删除;error 变体(t42×2+本轮×1)走「清除已失败」
  const del = doneVar ? await deleteGalCard(page, doneVar.id) : '(无 done 变体)'
  await switchTab(page, '队列')
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /清除已失败/.test(x.textContent || '')); if (b) b.click() })
  const cfm = await page.waitForSelector('.snx-cfm-backdrop', { timeout: 3000 }).catch(() => null)
  if (cfm) await page.evaluate(() => { const b = [...document.querySelectorAll('.snx-cfm-b')].find((x) => x.className.includes('danger')); if (b) b.click() })
  await page.waitForTimeout(800)
  const leftVars = (await fetchNodes(page)).filter((n) => /^基于这张图做变体/.test(n.prompt || '')).length
  const doc = await docInfo(page)
  await switchTab(page, '画廊')
  await page.evaluate(() => { const b = [...document.querySelectorAll('.snx-gal-bulk button')].find((x) => /清空/.test(x.textContent || '')); if (b) b.click() })
  await page.waitForTimeout(300)
  steps.push(`清场:done 变体删除=${del},清除已失败后变体节点残留=${leftVars}(期望 0),画布 error=${doc.error}`)
  return { pass: !!doneVar && refOk && parentOk && srcOk && promptOk && !!errVarB && sumOk && leftVars === 0 && del === 'deleted', steps }
}

// 44. 导出元数据默认:画廊双击开灯箱→操作区「导出…」展开导出面板(PNG 格式)→「嵌入元数据
//     (提示词/参数到 PNG tEXt)」checkbox 默认勾选且可见(SPEC-15 三:exportMeta useState(true),
//     client-v4.js:8176/8492-8495)(domain export)
async function t44_export_meta_default(page) {
  const steps = []
  await switchTab(page, '画廊')
  if (!await openLightbox(page)) return { pass: false, steps: ['画廊无卡片/双击后灯箱未出现,' + LB_LAST_ERR] }
  const clicked = await page.evaluate(() => {
    const b = [...document.querySelectorAll('.snx-lb-acts button')].find((x) => /导出/.test(x.textContent || '') && /…/.test(x.textContent || ''))
    if (!b) return false
    b.click(); return true
  })
  const panel = await page.waitForSelector('.snx-lb-export', { timeout: 3000 }).catch(() => null)
  if (!panel) {
    await shot(page, '44', 'nopanel')
    await closeLightbox(page)
    return { pass: false, steps: steps.concat(`点「导出…」=${clicked},导出面板(.snx-lb-export)未出现`) }
  }
  await page.waitForTimeout(300)
  const st = await page.evaluate(() => {
    const p = document.querySelector('.snx-lb-export')
    const lbl = p.querySelector('label.snx-lb-export-chk')
    const cb = lbl && lbl.querySelector('input[type=checkbox]')
    if (!cb) return { has: false, fmt: (((p.querySelector('.snx-sel-btn') || {}).textContent) || '').trim() }
    const r = cb.getBoundingClientRect()
    const cs = getComputedStyle(cb)
    return {
      has: true, checked: cb.checked, lblText: (lbl.textContent || '').trim(),
      visible: r.width > 4 && r.height > 4 && cs.display !== 'none' && cs.visibility !== 'hidden' && r.bottom > 0 && r.top < window.innerHeight,
      fmt: (((p.querySelector('.snx-sel-btn') || {}).textContent) || '').trim(),
    }
  })
  await shot(page, '44', 'export')
  steps.push(`点「导出…」=${clicked},面板在,格式=${JSON.stringify(st.fmt)},「嵌入元数据」勾选=${st.checked}(期望 true),可见=${st.visible},标签=${JSON.stringify((st.lblText || '').slice(0, 30))}`)
  // 清场:取消导出面板+关灯箱(不点导出,不触发下载)
  await page.evaluate(() => { const b = [...document.querySelectorAll('.snx-lb-export button')].find((x) => /取消/.test(x.textContent || '')); if (b) b.click() })
  await page.waitForTimeout(300)
  const closed = await closeLightbox(page)
  steps.push(`清场:面板取消+灯箱关闭=${closed}`)
  return { pass: clicked && st.has && st.checked === true && st.visible && /嵌入元数据/.test(st.lblText || '') && closed, steps }
}

// ══════════════ v16 新增 4 条断言(SPEC-16 资产生产力轮) ══════════════

// 45. 等待预估:拦截 generate 延迟 3s 放行 200(mock png,浏览器层拦截,0 触真实 API)→完成一次
//     生成→localStorage snxAvgDur 出现均值样本(snxGenPost 唯一收口计 POST 墙钟 ms,环形 5 样本,
//     client-v4.js:2585-2611);再发起第二次生成(同样拦截 3s)→画布 pending 悬浮卡(.snx-pending-ov)
//     出现「预计 ~3s」文案(est=round(均值/1000)>0 才拼接,client-v4.js:3701-3713)(domain wait)
//     清场:A/B 两节点经画廊右键删除,净变化为零;snxAvgDur 为本实例 localStorage 原地清零起测
async function t45_wait_estimate(page) {
  const steps = []
  await switchTab(page, '生图')
  const dur0 = await page.evaluate(() => { const v = localStorage.getItem('snxAvgDur'); localStorage.removeItem('snxAvgDur'); return v })
  steps.push(`基线:localStorage snxAvgDur 旧值=${JSON.stringify(dur0)}(已清零;同套件 t41 放行生成可能已写入样本)`)
  const fulfillOk = (route) => setTimeout(() => { try { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, image: { kind: 'base64', value: pngB64(320, 240, [36, 144, 220]) } }) }) } catch (e) { } }, 3000)
  // 第一发:3s 拦截放行→样本落 localStorage
  const P1 = 'AUDIT-T45A 等待预估样本 ' + Date.now()
  await page.route('**/api/sensenova/generate', (route) => fulfillOk(route))
  let nodeA = null
  try {
    await typePrompt(page, P1)
    await page.evaluate(() => { const b = document.querySelector('.snx-gen-go'); if (b) b.click() })
    const dl = Date.now() + 25000
    while (Date.now() < dl) {
      await page.waitForTimeout(800)
      nodeA = (await fetchNodes(page)).find((n) => n.prompt === P1) || null
      if (nodeA && nodeA.status === 'done') break
    }
  } finally { await page.unroute('**/api/sensenova/generate') }
  const dur1 = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('snxAvgDur') || '[]') } catch (e) { return [] } })
  const sampleOk = Array.isArray(dur1) && dur1.length >= 1 && dur1.every((x) => Number.isFinite(x) && x >= 2500)
  await shot(page, '45', 'sample')
  steps.push(`第一发(拦截 3s 放行):节点=${nodeA ? nodeA.id.slice(0, 8) + '/' + nodeA.status : '(未落)'},snxAvgDur=${JSON.stringify(dur1)}(期望长度≥1 且样本≥2500ms≈3s 墙钟)`)
  // 第二发:同样拦截→pending 悬浮卡出现「预计 ~3s」
  const P2 = 'AUDIT-T45B 预计文案 ' + Date.now()
  await page.route('**/api/sensenova/generate', (route) => fulfillOk(route))
  let waitTxt = null, sawPending = false
  try {
    await typePrompt(page, P2)
    await page.evaluate(() => { const b = document.querySelector('.snx-gen-go'); if (b) b.click() })
    const dl = Date.now() + 12000
    while (Date.now() < dl) {
      await page.waitForTimeout(300)
      await switchTab(page, '画布')
      const ov = await page.evaluate(() => { const o = document.querySelector('.snx-pending-ov .txt'); return o ? o.textContent.replace(/\s+/g, ' ').trim() : null })
      if (ov) { sawPending = true; waitTxt = ov; if (/预计 ~\d+s/.test(ov)) break }
    }
    await shot(page, '45', 'pending')
    const dl2 = Date.now() + 25000
    while (Date.now() < dl2) {
      await page.waitForTimeout(800)
      const nb = (await fetchNodes(page)).find((n) => n.prompt === P2)
      if (nb && nb.status === 'done') break
    }
  } finally { await page.unroute('**/api/sensenova/generate') }
  const estOk = !!waitTxt && /预计 ~3s/.test(waitTxt)
  steps.push(`第二发:pending 悬浮卡出现=${sawPending},文案=${JSON.stringify(waitTxt)}(期望含「预计 ~3s」;均值≈3000ms→3s)`)
  // 清场:画廊右键删 A/B 两节点
  await switchTab(page, '画廊')
  const dels = []
  for (const n of (await fetchNodes(page)).filter((x) => /^AUDIT-T45[AB] /.test(x.prompt || ''))) {
    dels.push(n.id.slice(0, 8) + '=' + await deleteGalCard(page, n.id))
  }
  await page.evaluate(() => { const b = [...document.querySelectorAll('.snx-gal-bulk button')].find((x) => /清空/.test(x.textContent || '')); if (b) b.click() })
  const left45 = (await fetchNodes(page)).filter((x) => /^AUDIT-T45[AB] /.test(x.prompt || '')).length
  steps.push(`清场:A/B 删除=${dels.join(',') || '(无节点可删)'},残留=${left45}(期望 0)`)
  return { pass: sampleOk && sawPending && estOk && left45 === 0 && dels.length === 2 && dels.every((d) => d.endsWith('=deleted')), steps }
}

// 46. 乱码清理核验(SPEC-16 二,只读断言):GET canvas→不应再有 prompt 含 ◆(U+25C6)/�(U+FFFD)
//     连续乱码(≥2 连排)的 done 节点;1.5s 后复测节点数与首次一致(本断言自身零写入)。
//     清理本体为实现侧批次1 的用户批准数据操作(API+rev+改前备份)——若画布仍有乱码 done 节点
//     则如实 FAIL 并列出节点 id/片段,验收员绝不代跑清理、不碰共享数据(domain wait)
async function t46_garbled_clean(page) {
  const steps = []
  const scan = () => page.evaluate(() => fetch('/api/sensenova/canvas').then((r) => r.json()).then((j) => {
    const ns = (j.doc && j.doc.nodes) || []
    return {
      total: ns.length,
      garbled: ns.filter((n) => n.status === 'done' && /[\u25C6\uFFFD]{2,}/.test(n.prompt || ''))
        .map((n) => ({ id: n.id, prompt: String(n.prompt || '').replace(/[\u25C6\uFFFD]{2,}/g, '⟦乱码⟧').slice(0, 60) })),
    }
  }))
  const s0 = await scan()
  await page.waitForTimeout(1500)
  const s1 = await scan()
  await shot(page, '46', 'scan')
  const stable = s0.total === s1.total
  steps.push(
    `GET#1:total=${s0.total},乱码 done 节点=${s0.garbled.length}${s0.garbled.length ? ' ' + JSON.stringify(s0.garbled) : ''}`,
    `GET#2(1.5s 后):total=${s1.total}(与 #1 一致=${stable},本断言只读零写入),乱码 done 节点=${s1.garbled.length}`,
    `清理本体为实现侧批次1 数据操作(SPEC-16 二:走 API+rev,改前备份快照),此处只核验共享画布结果`)
  return { pass: s0.garbled.length === 0 && s1.garbled.length === 0 && stable, steps }
}

// 47. 画板按最近使用排序(SPEC-16 三):新建板 AUDIT-A(无 lastUsed 沉底)→未分组 done 图右键
//     「移入画板」入 A(moveNodesToBoard→touchBoard 刷 lastUsed,client-v4.js:3351-3363/4646)→
//     画廊 chips 与生图表单「目标画板」下拉(boardsByRecent() 倒序)把 A 排到画板首位;
//     测后图移回未分组、AUDIT-A chip 右键「仅删除画板」清板(确认弹层标题严格校验
//     「删除画板「AUDIT-A」」+三键文案)(domain asset)
async function t47_board_recent_sort(page) {
  const steps = []
  await switchTab(page, '画廊')
  const A = await ensureBoardUI(page, 'AUDIT-A')
  if (!A) { await shot(page, '47', 'noboard'); return { pass: false, steps: ['画板 AUDIT-A 准备失败'] } }
  steps.push(`画板 AUDIT-A 就绪(${A.created ? '本断言新建' : '既有'},id=${A.id})`)
  const chipOrder = () => page.evaluate(() => [...document.querySelectorAll('.snx-gal-bar button.chip[data-galboard]')]
    .filter((x) => x.getAttribute('data-galboard') !== 'none').map((x) => x.getAttribute('data-galboard')))
  const boardMeta = () => page.evaluate(async () => {
    const j = await (await fetch('/api/sensenova/canvas')).json()
    return { boards: ((j.doc && j.doc.boards) || []).map((b) => ({ id: b.id, name: b.name, lastUsed: b.lastUsed || 0 })), nodes: ((j.doc && j.doc.nodes) || []).map((n) => ({ id: n.id, boardId: n.boardId || null })) }
  })
  const bm0 = await boardMeta()
  const order0 = await chipOrder()
  const a0 = bm0.boards.find((b) => b.id === A.id) || {}
  const nm = (id) => ((bm0.boards.find((b) => b.id === id) || {}).name || id)
  await shot(page, '47', 'baseline')
  steps.push(`基线:chips 序=${JSON.stringify(order0.map(nm))},AUDIT-A lastUsed=${a0.lastUsed || 0}(新建无 lastUsed,应沉底=末位)`)
  // 选一张未分组 done 图,右键 → 移入画板 → AUDIT-A
  const cand = (await fetchNodes(page)).find((n) => n.status === 'done' && n.src && !n.boardId && !/^基于这张图做变体/.test(n.prompt || ''))
  if (!cand) return { pass: false, steps: steps.concat('无未分组 done 图可移入') }
  const galMenuClick = async (id, label, exact) => {
    const box = await page.evaluate(([nid]) => {
      const c = document.querySelector('.snx-gal-item[data-gal-id="' + nid + '"]')
      if (!c) return null
      c.scrollIntoView({ block: 'center' })
      const r = c.getBoundingClientRect()
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    }, [id])
    if (!box) return 'card 不在画廊'
    await page.mouse.click(box.x, box.y, { button: 'right' })
    await page.waitForSelector('.snx-gal-menu', { timeout: 3000 }).catch(() => {})
    const opened = await page.evaluate(() => {
      const m = document.querySelector('.snx-gal-menu')
      const b = m && [...m.querySelectorAll('button')].find((x) => /移入画板/.test(x.textContent || ''))
      if (!b) return false
      b.click(); return true
    })
    if (!opened) { await page.keyboard.press('Escape').catch(() => {}); return '菜单无「移入画板」' }
    await page.waitForTimeout(400)
    const picked = await page.evaluate(([lbl, ex]) => {
      const m = document.querySelector('.snx-gal-menu')
      const b = m && [...m.querySelectorAll('button')].find((x) => ex ? x.textContent.trim() === lbl : new RegExp(lbl).test(x.textContent || ''))
      if (!b) return false
      b.click(); return true
    }, [label, exact])
    return picked ? 'ok' : '板列表无「' + label + '」'
  }
  const mv1 = await galMenuClick(cand.id, 'AUDIT-A', true)
  let boardIdOk = false, lastUsed = 0
  const dl = Date.now() + 10000
  while (Date.now() < dl) {
    await page.waitForTimeout(600)
    const bm = await boardMeta()
    boardIdOk = ((bm.nodes.find((x) => x.id === cand.id) || {}).boardId) === A.id
    lastUsed = ((bm.boards.find((b) => b.id === A.id) || {}).lastUsed) || 0
    if (boardIdOk && lastUsed > 0) break
  }
  // 强制重渲染后再读 chips 序(A 应排首位)
  await switchTab(page, '生图')
  await switchTab(page, '画廊')
  const order1 = await chipOrder()
  const bm1 = await boardMeta()
  const nm1 = (id) => ((bm1.boards.find((b) => b.id === id) || {}).name || id)
  await shot(page, '47', 'after')
  steps.push(`移入:右键菜单路径=${mv1},节点 boardId=A=${boardIdOk},AUDIT-A lastUsed=${lastUsed}(期望 >0=「最近一次有节点落入」刷新)`,
    `移入后 chips 序=${JSON.stringify(order1.map(nm1))}(期望 AUDIT-A 首位)`)
  // 生图表单「目标画板」下拉:板选项自 index2 起(0=跟随哨兵,1=未分组),首位应=AUDIT-A
  await switchTab(page, '生图')
  await typePrompt(page, 'AUDIT-T47 排序断言')
  await openBoardSel(page)
  await page.waitForTimeout(400)
  const opts = await selOptions(page)
  await page.keyboard.press('Escape').catch(() => {})
  await page.waitForTimeout(300)
  await typePrompt(page, '')
  const formOk = opts.length >= 3 && opts[2] === 'AUDIT-A'
  steps.push(`表单「目标画板」下拉选项=${JSON.stringify(opts)}(期望 index2=AUDIT-A,即板选项首位)`)
  // 清场:图移回未分组 → 右键 AUDIT-A chip 仅删除画板(标题严格校验)
  await switchTab(page, '画廊')
  await page.waitForTimeout(400)
  const mv2 = await galMenuClick(cand.id, '未分组（移出画板）', true)
  let backOk = false
  const dl2 = Date.now() + 8000
  while (Date.now() < dl2) {
    await page.waitForTimeout(500)
    const bm = await boardMeta()
    backOk = ((bm.nodes.find((x) => x.id === cand.id) || {}).boardId) === null
    if (backOk) break
  }
  const chipBox = await page.evaluate(() => {
    const c = [...document.querySelectorAll('.snx-gal-bar button.chip[data-galboard]')].find((x) => x.textContent.trim() === 'AUDIT-A')
    if (!c) return null
    c.scrollIntoView({ block: 'center' })
    const r = c.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })
  let delMsg = 'chip 不在'
  let titleOk = false
  if (chipBox) {
    await page.mouse.click(chipBox.x, chipBox.y, { button: 'right' })
    const cfm = await page.waitForSelector('.snx-cfm-backdrop', { timeout: 3000 }).catch(() => null)
    const cfmTxt = cfm ? await page.evaluate(() => (document.querySelector('.snx-cfm-backdrop') || {}).textContent || '') : ''
    titleOk = cfmTxt.includes('删除画板「AUDIT-A」') && /仅删除画板/.test(cfmTxt) && /连图一起删除/.test(cfmTxt)
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('.snx-cfm-b')].find((x) => !x.className.includes('danger') && /仅删除画板/.test(x.textContent || ''))
      if (b) b.click()
    })
    const dl3 = Date.now() + 6000
    while (Date.now() < dl3) {
      await page.waitForTimeout(400)
      if ((await galBoardChipId(page, 'AUDIT-A')) === null) { delMsg = 'deleted'; break }
    }
    if (delMsg !== 'deleted') delMsg = '删除后 chip 仍在'
  }
  const bm2 = await boardMeta()
  steps.push(`清场:图移回未分组=${mv2}/${backOk ? 'boardId 已空' : 'boardId 未清'},AUDIT-A chip 右键确认弹层标题三键校验=${titleOk},删板=${delMsg},余板=${JSON.stringify(bm2.boards.map((b) => b.name))}`)
  const baseOk = order0.length >= 1 && order0[order0.length - 1] === A.id && (a0.lastUsed || 0) === 0
  const firstOk = order1.length >= 1 && order1[0] === A.id
  return { pass: baseOk && mv1 === 'ok' && boardIdOk && lastUsed > 0 && firstOk && formOk && mv2 === 'ok' && backOk && titleOk && delMsg === 'deleted', steps }
}

// 48. 批量导出(SPEC-16 四):画廊多选 2 张 done→批量条「批量导出」→逐张 2 次 download 事件,
//     每张走灯箱单张导出同一嵌入管线(imageToBlob meta=节点恒定嵌 tEXt,client-v4.js:4741-4772/
//     8779-8830),250ms 间隔;toast 进度「批量导出 1/2」「2/2」+汇总。逐文件验:PNG 签名、
//     type=tEXt 且 keyword=sensenova、全 chunk CRC 合法(domain asset)
async function t48_batch_export(page) {
  const steps = []
  await switchTab(page, '画廊')
  await page.evaluate(() => { const b = [...document.querySelectorAll('.snx-gal-bulk button')].find((x) => /清空/.test(x.textContent || '')); if (b) b.click() })
  await page.waitForTimeout(400)
  const cands = (await fetchNodes(page))
    .filter((n) => n.status === 'done' && n.src && !/^基于这张图做变体/.test(n.prompt || ''))
    .sort((a, b) => (b.ts || 0) - (a.ts || 0))
  if (cands.length < 2) { await shot(page, '48', 'nocand'); return { pass: false, steps: steps.concat(`候选 done 卡不足(${cands.length})`) } }
  const [A, B] = cands
  const cA = await ctrlClickCardById(page, A.id)
  const cB = await ctrlClickCardById(page, B.id)
  const bulk = await page.evaluate(() => {
    const bar = document.querySelector('.snx-gal-bulk')
    if (!bar) return null
    const btn = [...bar.querySelectorAll('button.bt')].find((x) => /批量导出|导出中/.test(x.textContent || ''))
    return { ct: ((bar.querySelector('.ct') || {}).textContent || '').trim(), hasBtn: !!btn, btnText: btn ? btn.textContent.trim() : '', disabled: btn ? btn.disabled : true }
  })
  await shot(page, '48', 'selected')
  steps.push(`Ctrl+点选 A=${cA}(${String(A.prompt || '').slice(0, 14)}…),B=${cB}(${String(B.prompt || '').slice(0, 14)}…);批量条=${bulk ? JSON.stringify({ 计数: bulk.ct, 按钮: bulk.btnText, 禁用: bulk.disabled }) : '(未出现)'}`)
  if (!bulk || !bulk.hasBtn || bulk.disabled) return { pass: false, steps: steps.concat('「批量导出」按钮不在场或禁用') }
  fs.mkdirSync(SHOTS, { recursive: true })
  const files = []
  const dlPromises = []
  const onDl = (d) => {
    const i = files.push({ name: d.suggestedFilename() }) - 1
    const fp = path.join(SHOTS, `48-dl-${i + 1}.png`)
    dlPromises.push(d.saveAs(fp).then(() => { files[i].file = fp }).catch((e) => { files[i].err = String(e).slice(0, 80) }))
  }
  page.on('download', onDl)
  const seen = []
  try {
    await page.evaluate(() => { const b = [...document.querySelectorAll('.snx-gal-bulk button.bt')].find((x) => /批量导出/.test(x.textContent || '')); if (b) b.click() })
    const dl = Date.now() + 20000
    while (Date.now() < dl) {
      await page.waitForTimeout(250)
      for (const t of await readToasts(page)) if (!seen.includes(t)) seen.push(t)
      if (dlPromises.length >= 2 && seen.some((x) => /批量导出完成|批量导出全部失败/.test(x))) break
    }
    await page.waitForTimeout(600)
    for (const t of await readToasts(page)) if (!seen.includes(t)) seen.push(t)
    await Promise.all(dlPromises)
  } finally { page.off('download', onDl) }
  const pngCheck = (buf) => {
    const sig = buf.length > 8 && buf[0] === 137 && buf[1] === 80 && buf[2] === 78 && buf[3] === 71
    const table = [...Array(256)].map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
    const crc32 = (b2, s, l) => { let c = 0xffffffff; for (let i = s; i < s + l; i++) c = table[(c ^ b2[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
    let off = 8, hasTxt = false, crcOk = true, idatOk = false
    while (off + 12 <= buf.length) {
      const len = buf.readUInt32BE(off)
      const type = buf.toString('ascii', off + 4, off + 8)
      if (off + 12 + len > buf.length) { crcOk = false; break }
      if (crc32(buf, off + 4, len + 4) !== buf.readUInt32BE(off + 8 + len)) crcOk = false
      if (type === 'tEXt' && buf.toString('latin1', off + 8, off + 17) === 'sensenova') hasTxt = true
      if (type === 'IDAT') idatOk = true
      off += 12 + len
      if (type === 'IEND') break
    }
    return { sig, hasTxt, crcOk, idatOk }
  }
  const checks = []
  for (const f of files) {
    if (!f.file) { checks.push({ name: f.name, err: f.err || '未落盘' }); continue }
    const buf = fs.readFileSync(f.file)
    checks.push(Object.assign({ name: f.name, bytes: buf.length }, pngCheck(buf)))
  }
  await shot(page, '48', 'toasts')
  const progOk = seen.some((x) => /批量导出 1\/2/.test(x)) && seen.some((x) => /批量导出 2\/2/.test(x))
  const sumOk = seen.some((x) => /批量导出完成：2 张/.test(x))
  const dlOk = files.length === 2
  const pngOk = checks.length === 2 && checks.every((c) => c.sig && c.hasTxt && c.crcOk && c.idatOk)
  steps.push(`download 事件=${files.length}(期望 2),文件名=${JSON.stringify(files.map((f) => f.name))}`,
    `PNG 校验=${JSON.stringify(checks)}(期望各张 sig/hasTxt(sensenova tEXt)/crcOk/idatOk 全 true)`,
    `toast 进度 1/2、2/2=${progOk},汇总「批量导出完成：2 张」=${sumOk};toasts=${JSON.stringify(seen).slice(0, 220)}`)
  // 清场:清空多选(导出的 2 个 PNG 留在 shots/v16 作证据)
  await page.evaluate(() => { const b = [...document.querySelectorAll('.snx-gal-bulk button')].find((x) => /清空/.test(x.textContent || '')); if (b) b.click() })
  await page.waitForTimeout(300)
  return { pass: dlOk && pngOk && progOk && sumOk, steps }
}

// ══════════════ 主流程 ══════════════
async function main() {
  const argv = process.argv.slice(2)
  const url = argv.find((a) => !a.startsWith('--'))
  const headed = argv.includes('--headed')
  const fromN = parseInt((argv.find((a) => a.startsWith('--from=')) || '').slice(7), 10) || 1   // 冒烟:--from=23 只跑第 23 条起
  if (!url) {
    console.error('usage: node scripts/e2e.spec.js <实例URL> [--headed]')
    process.exit(2)
  }
  fs.mkdirSync(SHOTS, { recursive: true })

  const browser = await chromium.launch({ headless: !headed })
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
  await page.addInitScript(PROBE)
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])   // v13 t27 剪贴板断言
  page.on('dialog', (d) => d.dismiss().catch(() => {}))

  // 前置:打开工作台 + 造 1 条 error 节点(t03 占位卡/t12 清理需要;全程不触真实生成 API)
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForFunction(() => window.__snxDebug && window.__snxDebug.step === 'done', null, { timeout: 30000 }).catch(() => {})
  if (await openWorkbench(page)) {
    const d0 = await docInfo(page)
    if (d0.error === 0) {
      const s = await seedErrorNode(page)
      process.stderr.write(`setup seedError: ${s}\n`)
    }
  }

  const tests = [
    ['实例加载', t01_load, 'p0'],
    ['宽度回归', t02_width, 'ui'],
    ['画廊状态过滤', t03_gallery_filter, 'p0'],
    ['灯箱缩放平移', t04_lightbox_zoom, 'p0'],
    ['模态守卫', t05_modal_guard, 'p0'],
    ['画廊交互', t06_gallery_interact, 'gallery'],
    ['右键菜单', t07_context_menu, 'gallery'],
    ['风格芯片互斥', t08_style_chips, 'form'],
    ['尺寸芯片', t09_size_chips, 'form'],
    ['回填热键', t10_backfill_hotkeys, 'form'],
    ['SnxSelect 键盘', t11_snxselect_kbd, 'ui'],
    ['队列清理', t12_queue_clear_failed, 'form'],
    ['原生弹窗清零', t13_native_dialogs, 'form'],
    ['行级回填', t14_row_backfill, 'recall'],
    ['决策面板', t15_decide_panel, 'panel'],
    ['对比三模式', t16_compare_modes, 'compare'],
    ['删除引用警告', t17_delete_ref_warning, 'compare'],
    ['历史翻阅', t18_history_browse, 'recall'],
    ['画布双击', t19_canvas_dblclick, 'cvfix'],
    ['多选操作条', t20_multiselect_bar, 'cvfix'],
    ['画布 toast', t21_canvas_toast, 'cvfix'],
    ['队列行展开', t22_queue_expand, 'panel'],
    // ── v13:对话轴 5 + 对话灯箱 2 + 工作台轴 3 ──
    ['对话等待生命感', t23_chat_pending, 'chat'],
    ['对话卡回填参数', t24_chat_backfill, 'chat'],
    ['对话卡设为参考图', t25_chat_setref, 'chat'],
    ['对话卡同参数重抽', t26_chat_reroll, 'chat'],
    ['对话卡复制提示词', t27_chat_copy, 'chat'],
    ['对话灯箱', t28_chat_lightbox, 'chatlb'],
    ['回合尾编号', t29_turn_tail_badge, 'chatlb'],
    ['生成入板', t30_gen_to_board, 'wb'],
    ['队列全历史', t31_queue_history, 'wb'],
    ['对比 3 图', t32_compare_three, 'wb'],
    // ── v14:工作台轴 3(并发写/取消其他/3 图交换)+ 菜单轴 2(右键新四项/批量下载)+ 折叠轴 1 ──
    ['并发写保护', t33_concurrent_rev, 'wb'],
    ['队列取消其他', t34_queue_cancel_others, 'wb'],
    ['对比网格交换', t35_compare_grid_swap, 'wb'],
    ['右键菜单新项', t36_ctx_menu_new_items, 'menu'],
    ['批量下载', t37_batch_download, 'menu'],
    ['回合尾折叠直通', t38_tail_visible_after_fold, 'fold'],
    // ── v15:资产流轴 6(归板跟随/手动覆盖/归板落图 ×board + 批量变体拦截/放行 ×batch + 导出默认 ×export) ──
    ['归板跟随', t39_board_follow, 'board'],
    ['手动覆盖目标板', t40_board_manual, 'board'],
    ['归板落图放行', t41_board_passthrough, 'board'],
    ['批量变体拦截', t42_batch_variant_500, 'batch'],
    ['批量变体放行抽查', t43_batch_variant_pass, 'batch'],
    ['导出元数据默认', t44_export_meta_default, 'export'],
    // ── v16:资产生产力轴(等待预估/乱码核验 ×wait + 画板最近使用排序/批量导出元数据 ×asset) ──
    ['等待预估均值样本', t45_wait_estimate, 'wait'],
    ['乱码清理核验', t46_garbled_clean, 'wait'],
    ['画板最近使用排序', t47_board_recent_sort, 'asset'],
    ['批量导出元数据', t48_batch_export, 'asset'],
  ]

  // v13:对话轴环境(mock 上游 + config 原位换/还)——整个测试期生效;finally 保证还原
  const origin = new URL(url).origin
  e2eOrigin = origin
  let envReady = false
  try {
    await chatEnvStart(origin)
    envReady = true
  } catch (e) {
    process.stderr.write(`chatEnv start FAILED: ${String(e).slice(0, 120)}(对话轴用例将如实失败)\n`)
  }
  try {
    for (let i = 0; i < tests.length; i++) {
      const [name, fn, domain] = tests[i]
      const n = String(i + 1).padStart(2, '0')
      if (i + 1 < fromN) continue
      if (i > 0) await ensureState(page)
      try {
        const { pass, steps } = await fn(page, url)
        rec(n, name, domain, !!pass, evJoin(steps))
      } catch (e) {
        rec(n, name, domain, false, `EXCEPTION: ${String((e && e.message) || e).slice(0, 200)}`)
      }
      process.stderr.write(`${n} ${name}: ${results[results.length - 1].pass ? 'PASS' : 'FAIL'}\n`)
      if (!results[results.length - 1].pass) process.stderr.write(`  └ ${results[results.length - 1].evidence.slice(0, 700)}\n`)
    }
    // 终局数据状态(如实报告)
    const fin = await docInfo(page)
    process.stderr.write(`final canvas nodes: total=${fin.total} done=${fin.done} pending=${fin.pending} error=${fin.error}\n`)
  } finally {
    if (envReady) await chatEnvStop(origin)
    await browser.close().catch(() => {})
  }
  console.log(JSON.stringify(results, null, 2))
  process.exit(results.every((r) => r.pass) ? 0 : 1)
}

main().catch(async (e) => {
  console.error('FATAL', e)
  // 兜底:任何崩溃路径都要把 sensenova config 还原(绝不让 mock 配置泄漏到测后)
  try { if (CFG_ORIG && typeof e2eOrigin === 'string') await chatEnvStop(e2eOrigin) } catch (e2) { }
  process.exit(2)
})
