/**
 * dsh-sensenova-image — 商汤 SenseNova U1.5 生图插件
 *
 * 能力：
 *  - 图像清晰化（4K 超分、锐化）
 *  - 去水印（豆包等角标）
 *  - 通用重绘/编辑（prompt 驱动）
 *
 * 原理：
 *  - 兼容 OpenAI Chat Completions 协议，baseUrl = https://token.sensenova.cn/v1
 *  - 图像通过 image_url (data URL) 传入，prompt 描述"要改什么、保留什么"
 *  - U1.5 为原生统一多模态，单模型完成理解+重绘，无需外挂超分模型
 *
 * 鉴权：
 *  - config.apiKey 优先，其次 env.SENSENOVA_API_KEY
 *  - 未配置时工具会返回指引而非抛错，便于 agent 提示用户去 platform.sensenova.cn 建 key
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import schemastery from '@deepseek-ai/schemastery'

export const name = 'dsh-sensenova-image'
export const inject = ['tools', 'webServer', 'settings']

// v13.1：Config 必须是 schemastery——dsh 0.2.1 设置页从插件 Config schema 自动生成
// 表单并持久化到 profile 条目（zod schema 会被宿主当作"不可配置"直接忽略）
// .volatile() 链式方法只在 dsh 内嵌 fork 上存在;插件树的 schemastery 没有——
// 直接写 meta.volatile 标记(dsh-settings 的 volatileForm 只认这个标记,见其 lib/index.js:123)
const live = (s: schemastery.Schema): schemastery.Schema => {
  (s.meta ||= { description: '' });
  (s.meta as { volatile?: boolean }).volatile = true
  return s
}
export const Config = schemastery.object({
  apiKey: live(schemastery.string().role('secret').description('SenseNova API Key（platform.sensenova.cn → 控制台 → 管理中心 → API-Key 管理 → 创建，sk-...；留空=用环境变量 SENSENOVA_API_KEY）')),
  baseUrl: live(schemastery.string().default('https://token.sensenova.cn/v1').description('OpenAI-compatible baseUrl（固定 https://token.sensenova.cn/v1）')),
  model: live(schemastery.string().default('sensenova-u1.5-lite').description('模型 id（控制台模型广场确认，U1.5 可填 sensenova-u1.5 / sensenova-u1.5-lite）')),
  timeoutMs: live(schemastery.number().min(3000).max(120000).default(60000).description('单次请求超时 ms')),
})

export type Config = { apiKey?: string; baseUrl: string; model: string; timeoutMs: number }

// ——— 内部：OpenAI-compatible 调用 ———
async function callChatCompletions(opts: {
  baseUrl: string
  apiKey: string
  model: string
  timeoutMs: number
  messages: unknown[]
  extra?: Record<string, unknown>
}): Promise<any> {
  const url = `${opts.baseUrl.replace(/\/$/, '')}/chat/completions`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      ...opts.extra,
    }),
    signal: AbortSignal.timeout(opts.timeoutMs),
  })
  if (!res.ok) {
    const body = await res.text().then((t) => t.slice(0, 800)).catch(() => '')
    throw new Error(`SenseNova ${res.status} ${url}: ${body}`)
  }
  return res.json()
}

async function callImagesGenerations(opts: {
  baseUrl: string
  apiKey: string
  model: string
  timeoutMs: number
  prompt: string
  size?: string
  n?: number
  watermark?: boolean
  image?: string
  images?: string[]   // 多参考图（v8）：按 role 排序的 base64/dataURL 数组
  negativePrompt?: string   // 负面提示词（web 面板透传）
  seed?: number             // 固定种子（web 面板透传）
}): Promise<any> {
  const url = `${opts.baseUrl.replace(/\/$/, '')}/images/generations`
  const body: Record<string, unknown> = {
    model: opts.model,
    prompt: opts.prompt,
    size: opts.size ?? '2048x2048',
    n: opts.n ?? 1,
    watermark: opts.watermark ?? false,
  }
  // SenseNova 扩展字段（与 watermark 同族）：负面提示词 / 种子
  if (opts.negativePrompt && opts.negativePrompt.trim()) body.negative_prompt = opts.negativePrompt.trim()
  if (typeof opts.seed === 'number' && Number.isFinite(opts.seed)) body.seed = Math.floor(opts.seed)
  // 参考图生图：优先用 images 数组，否则回退单 image 字段
  if (opts.images && opts.images.length) {
    body.images = opts.images
    body.image = opts.images[0]   // 兼容老接口
  } else if (opts.image) {
    body.image = opts.image
  }
  const once = async (): Promise<{ ok: boolean; status: number; text: string; json: any }> => {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(opts.timeoutMs),
    })
    const text = await res.text().then((t) => t).catch(() => '')
    let json: any = null
    try { json = JSON.parse(text) } catch { }
    return { ok: res.ok, status: res.status, text, json }
  }
  // 网络层失败（代理掐断大上传等）与 code 18 间歇风控都自动重试：共 3 次机会，退避 2.5s/5s
  let r: { ok: boolean; status: number; text: string; json: any } | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, attempt === 1 ? 2500 : 5000))
    try {
      r = await once()
    } catch (e) {
      if (attempt === 2) throw new Error(`SenseNova images 网络失败（${e instanceof Error ? e.message : String(e)}；若本机走代理，建议把 token.sensenova.cn 加入直连规则）`)
      continue
    }
    if (r.ok) return r.json
    if (r.json?.error?.code !== 18) break
  }
  if (!r) throw new Error('SenseNova images 请求未发出')
  const keyFp = opts.apiKey ? `key=${opts.apiKey.slice(0, 6)}…${opts.apiKey.slice(-4)}` : 'key=none'
  throw new Error(`SenseNova images ${r.status} ${url}: ${r.text.slice(0, 800)} [${keyFp}]`)
}

function resolveKey(config: Config): string {
  return config.apiKey?.trim() || process.env.SENSENOVA_API_KEY?.trim() || process.env.SENSENOVA_TOKEN?.trim() || ''
}

function missingKeyHint(): string {
  return JSON.stringify(
    {
      error: 'SENSENOVA_API_KEY 未配置',
      how_to_fix: [
        '1. 访问 https://platform.sensenova.cn/console → 管理中心 → API-Key 管理 → 创建 API-Key',
        '2. 二选一配置：',
        '   a) 插件配置：dsh 配置页填 apiKey',
        '   b) 环境变量：export SENSENOVA_API_KEY=sk-...',
        '3. baseUrl 保持 https://token.sensenova.cn/v1，model 用 sensenova-u1.5-lite 或 sensenova-u1.5',
      ],
      docs: 'https://platform.sensenova.cn/docs',
    },
    null,
    2,
  )
}

function toDataUrl(maybeUrl: string): string {
  // 已是 data: 或 http(s):// 原样返回；否则假设是 base64
  if (maybeUrl.startsWith('data:') || maybeUrl.startsWith('http://') || maybeUrl.startsWith('https://')) return maybeUrl
  // 裸 base64 → 补前缀（默认 png）
  return `data:image/png;base64,${maybeUrl}`
}

// 从 chat/completions 响应里提取生成图 URL（string / array / data 字段多种形态）
function extractImageFromChat(data: any): string | undefined {
  const choice = data?.choices?.[0]?.message
  const content = choice?.content
  let out: string | undefined
  if (typeof content === 'string') {
    const m = content.match(/https?:\/\/[^\s"')]+/)
    if (m) out = m[0]
  } else if (Array.isArray(content)) {
    for (const p of content) {
      if (p?.type === 'image_url' && p.image_url?.url) out = p.image_url.url
      if (p?.type === 'text' && typeof p.text === 'string' && !out) {
        const m = p.text.match(/https?:\/\/[^\s"')]+/)
        if (m) out = m[0]
      }
    }
  }
  if (!out && Array.isArray(data?.data)) out = data.data[0]?.url
  if (!out && typeof data?.url === 'string') out = data.url
  return out
}

// 参考图 role + 强度 → 语言化提示词（API 无数值权重参数，用措辞档位表达 0~1 强度）。
// metas 与 images 数组按位对齐：null = 裸锚点图（不描述，保持 i2i 编辑语义）
function describeRefs(metas: Array<{ role?: string; strength?: number } | null>): string {
  const roleLabel: Record<string, string> = { style: '风格', character: '主体/角色', composition: '构图', reference: '内容' }
  const strengthWord = (s: unknown): string => {
    const v = typeof s === 'number' && Number.isFinite(s) ? Math.max(0, Math.min(1, s)) : 0.7
    if (v >= 0.85) return '严格遵循'
    if (v >= 0.6) return '重点遵循'
    if (v >= 0.35) return '适度参考'
    return '仅作轻微灵感'
  }
  const parts: string[] = []
  metas.forEach((m, i) => {
    if (!m) return
    const label = roleLabel[m.role || 'reference'] || '内容'
    parts.push(`第${i + 1}张图为${label}参考，${strengthWord(m.strength)}其${label}`)
  })
  return parts.length ? `。参考图说明：${parts.join('；')}。` : ''
}

// ——— 插件 ———
export function apply(ctx: Context, rawConfig: Config) {
  const config = (Config as unknown as (v: unknown) => Config)(rawConfig ?? {})

  // ——— 设置持久化（v16.1 重写）———
  // 0.2.1-alpha.2 的 settings 服务:configure(presentation, owner) 控制自动表单策略;
  // update(ns, patch) 写 profile 条目(真持久化,cordis 热重载回 apply())。
  // 本插件自带中文设置卡(snx-cfg)→ configure({auto:false}) 关闭宿主自动表单避免重复;
  // update 暴露给 POST /config 实现保存按钮真持久化。
  const SETTINGS_NS = 'sensenova-image'
  let settingsUpdate: ((patch: Record<string, unknown>) => Promise<unknown>) | null = null
  ctx.inject(['settings'], (scopedCtx: any) => {
    const svc = scopedCtx.settings
    if (!svc || typeof svc.update !== 'function') {
      console.log('[sensenova-image] settings service: no update method (legacy host)')
      return
    }
    settingsUpdate = (patch) => svc.update(SETTINGS_NS, patch)
    try { svc.configure({ auto: false }, scopedCtx.fiber) } catch (e) { console.warn('[sensenova-image] configure:', String(e).slice(0, 120)) }
    console.log('[sensenova-image] settings: persistence wired (update + auto-form suppressed)')
  })

  // ——— HTTP 路由：用户可见的生图面板（web 客户端模块调用）———
  const sendJson = (res: { writeHead: (c: number, h?: Record<string, string>) => void; end: (b?: string) => void }, code: number, payload: unknown): void => {
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(payload))
  }
  const readBody = (req: { on: (ev: string, cb: (c: string) => void) => void }): Promise<string> =>
    new Promise((resolve) => {
      let b = ''
      req.on('data', (c: string) => { b += c })
      req.on('end', () => resolve(b))
    })

  const reg = (path: string, handler: (req: { headers: Record<string, string | undefined>; method?: string; on: (ev: string, cb: (c: string) => void) => void }, res: { writeHead: (c: number, h?: Record<string, string>) => void; end: (b?: string) => void }) => void | Promise<void>): void => {
    ctx.effect(() => (ctx as { webServer?: { register?: (r: { kind: string; path: string; handler: unknown }) => void } }).webServer?.register?.({ kind: 'exact', path, handler }), `dsh-sensenova-image: ${path}`)
  }

  reg('/api/sensenova/config', (req, res) => {
    void (async () => {
      if (req.method === 'GET') {
        sendJson(res, 200, { ok: true, config: { apiKey: config.apiKey ?? '', baseUrl: config.baseUrl, model: config.model } })
        return
      }
      if (req.method !== 'POST') { sendJson(res, 405, { ok: false, error: 'POST only' }); return }
      try {
        const body = JSON.parse((await readBody(req)) || '{}')
        const patch: Record<string, unknown> = {}
        if (typeof body.apiKey === 'string' && body.apiKey.trim()) { config.apiKey = body.apiKey.trim(); patch.apiKey = body.apiKey.trim() }
        if (typeof body.baseUrl === 'string' && body.baseUrl.trim()) { config.baseUrl = body.baseUrl.trim(); patch.baseUrl = body.baseUrl.trim() }
        if (typeof body.model === 'string' && body.model.trim()) { config.model = body.model.trim(); patch.model = body.model.trim() }
        // v16.1：settingsUpdate 可用时写 profile 真持久化(cordis 热重载回 apply());不可用时降级为内存
        for (const [k, v] of Object.entries(patch)) (config as Record<string, unknown>)[k] = v
        let persisted = false
        if (settingsUpdate) {
          try { await settingsUpdate(patch); persisted = true } catch (e) { console.warn('[sensenova-image] settings update:', String(e).slice(0, 120)) }
        }
        sendJson(res, 200, { ok: true, persisted, note: persisted ? undefined : '已对本会话生效;持久化暂不可用' })
      } catch (e) {
        sendJson(res, 400, { ok: false, error: e instanceof Error ? e.message : String(e) })
      }
    })()
  })

  reg('/api/sensenova/generate', async (req, res) => {
    if (req.method !== 'POST') { sendJson(res, 405, { ok: false, error: 'POST only' }); return }
    // 同源校验：带 Origin 的跨源请求拒绝（无 Origin 的同源 fetch 放行）
    const origin = String(req.headers?.origin ?? '')
    if (origin) {
      try { if (new URL(origin).host !== req.headers?.host) { sendJson(res, 403, { ok: false, error: 'origin rejected' }); return } } catch { }
    }
    const key = resolveKey(config)
    if (!key) { sendJson(res, 400, { ok: false, error: 'SENSENOVA_API_KEY 未配置（设置页填 apiKey 或设 SENSENOVA_API_KEY 环境变量）' }); return }
    try {
      const body = JSON.parse((await readBody(req)) || '{}')
      const prompt = String(body.prompt ?? '').trim()
      if (!prompt) { sendJson(res, 400, { ok: false, error: 'prompt required' }); return }
      const ref = body.reference ? String(body.reference) : ''
      // v8 多参考图：refs = [{src, role, strength}]，合并到 images 数组
      const refs: Array<{ src: string; role?: string; strength?: number }> =
        Array.isArray(body.refs) ? body.refs : []
      const images: string[] = []
      const imageMeta: Array<{ role?: string; strength?: number } | null> = []
      if (ref) {
        try { images.push(resolveRefToImageInput(ref)); imageMeta.push(null) } catch { /* skip */ }
      }
      for (const r of refs) {
        if (r && r.src) {
          try { images.push(resolveRefToImageInput(String(r.src))); imageMeta.push({ role: r.role, strength: r.strength }) } catch { /* skip */ }
        }
      }
      const image = images.length ? images[0] : undefined
      const model = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : config.model
      // 负面提示词 / 种子（web 面板透传；客户端字段名 negative，兼容 negative_prompt）
      const negativePrompt = typeof (body.negative_prompt ?? body.negative) === 'string' ? String(body.negative_prompt ?? body.negative).trim() : ''
      const seedNum = Number(body.seed)
      const extraOpts = {
        negativePrompt: negativePrompt || undefined,
        seed: Number.isFinite(seedNum) && seedNum >= 0 ? Math.floor(seedNum) : undefined,
      }
      // 根据 refs 角色 + 强度增强 prompt（strength 滑块 0~1 → 语言化权重档位；裸锚点图不描述）
      let enrichedPrompt = prompt + describeRefs(imageMeta)
      const baseCall = {
        baseUrl: config.baseUrl, apiKey: key, model,
        timeoutMs: config.timeoutMs, prompt: enrichedPrompt,
        size: String(body.size || '2560x720'), n: 1, image, images: images.length ? images : undefined,
      }
      let data: any
      let degraded = false
      try {
        data = await callImagesGenerations({ ...baseCall, ...extraOpts })
      } catch (e) {
        // 上游若不认 negative_prompt/seed 扩展字段（400/422），去掉后重试一次，不让控件把生成弄挂
        const msg = e instanceof Error ? e.message : String(e)
        const rejected = /\b(400|422)\b/.test(msg)
        if (rejected && (extraOpts.negativePrompt !== undefined || extraOpts.seed !== undefined)) {
          console.warn('[sensenova-image] upstream rejected negative_prompt/seed, retrying without them:', msg.slice(0, 200))
          data = await callImagesGenerations(baseCall)
          degraded = true
        } else {
          throw e
        }
      }
      const item = data?.data?.[0] ?? {}
      const kind = item.url ? 'url' : item.b64_json ? 'base64' : ''
      if (!kind) { sendJson(res, 502, { ok: false, error: 'response had no image' }); return }
      // v4：默认落盘持久化（persist:false 保留旧行为），持久化成功则入历史并返回文件 URL
      let out: { kind: string; value: string; id?: string } = { kind, value: item.url ?? item.b64_json }
      if (body.persist !== false) {
        const saved = await persistImage(kind, out.value)
        if (saved) {
          out = { kind: 'url', value: saved.url, id: saved.id }
          const items = loadHistory()
          // reference 只存短引用（http/文件路径）；蒙版/扩图的 dataURL 标注板可达数 MB，丢弃防存储膨胀
          const refShort = ref && !ref.startsWith('data:') ? ref.slice(0, 500) : undefined
          items.unshift({ id: saved.id, ts: new Date().toISOString(), prompt: prompt.slice(0, 300), reference: refShort, kind: 'url', value: saved.url })
          saveHistory(items.slice(0, HISTORY_CAP))
        }
      }
      sendJson(res, 200, degraded ? { ok: true, image: out, degraded: ['negative_prompt/seed'] } : { ok: true, image: out })
    } catch (e) {
      sendJson(res, 502, { ok: false, error: e instanceof Error ? e.message : String(e) })
    }
  })

  // 增强放大：U1.5 chat/completions 清晰化（画布操作条入口），结果同样落盘
  reg('/api/sensenova/enhance', (req, res) => {
    if (req.method !== 'POST') { sendJson(res, 405, { ok: false, error: 'POST only' }); return }
    const origin = String(req.headers?.origin ?? '')
    if (origin) {
      try { if (new URL(origin).host !== req.headers?.host) { sendJson(res, 403, { ok: false, error: 'origin rejected' }); return } } catch { }
    }
    const key = resolveKey(config)
    if (!key) { sendJson(res, 400, { ok: false, error: 'SENSENOVA_API_KEY 未配置' }); return }
    void (async () => {
      try {
        const body = JSON.parse((await readBody(req)) || '{}')
        const image = body.image ? String(body.image) : ''
        if (!image) { sendJson(res, 400, { ok: false, error: 'image required' }); return }
        const prompt = String(body.prompt || '').trim() ||
          'Enhance this image to ultra-clear 4K quality, increase sharpness and detail, remove any watermark text without leaving artifacts, keep all original elements, composition, colors, lighting and style exactly unchanged.'
        const model = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : config.model
        const data: any = await callChatCompletions({
          baseUrl: config.baseUrl, apiKey: key, model, timeoutMs: config.timeoutMs,
          messages: [{
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: resolveRefToImageInput(image) } },
              { type: 'text', text: prompt },
            ],
          }],
        })
        const imageOut = extractImageFromChat(data)
        if (!imageOut) { sendJson(res, 502, { ok: false, error: 'response had no image（确认模型支持图像编辑，或换 sensenova-u1.5-lite）' }); return }
        const saved = await persistImage(imageOut.startsWith('http') ? 'url' : 'base64', imageOut)
        if (saved) { sendJson(res, 200, { ok: true, image: { kind: 'url', value: saved.url, id: saved.id } }); return }
        sendJson(res, 200, { ok: true, image: { kind: imageOut.startsWith('http') ? 'url' : 'base64', value: imageOut } })
      } catch (e) {
        sendJson(res, 502, { ok: false, error: e instanceof Error ? e.message : String(e) })
      }
    })()
  })

  // ——— 历史记录存储（cap 12 条防膨胀）———
  type HistoryItem = { id: string; ts: string; prompt: string; reference: string; kind: string; value: string }
  const HISTORY_CAP = 12
  const histPath = (): string => join(process.env.USERPROFILE || process.env.HOME || '', '.dsh', 'storages', 'dsh-sensenova-image.json')
  const loadHistory = (): HistoryItem[] => {
    try { return JSON.parse(readFileSync(histPath(), 'utf8')) as HistoryItem[] } catch { return [] }
  }
  const saveHistory = (items: HistoryItem[]): void => {
    try { mkdirSync(dirname(histPath()), { recursive: true }); writeFileSync(histPath(), JSON.stringify(items, null, 1)) } catch { }
  }

  reg('/api/sensenova/history', (req, res) => {
    if (req.method === 'GET') { sendJson(res, 200, { ok: true, items: loadHistory() }); return }
    if (req.method === 'DELETE') {
      // ?id=<id> 删单条；无 id 清空
      let delId = ''
      try { delId = new URL(req.url ?? '/', 'http://x').searchParams.get('id') ?? '' } catch { }
      if (delId) saveHistory(loadHistory().filter((it) => it.id !== delId))
      else saveHistory([])
      sendJson(res, 200, { ok: true })
      return
    }
    if (req.method !== 'POST') { sendJson(res, 405, { ok: false, error: 'method' }); return }
    void (async () => {
      try {
        const body = JSON.parse((await readBody(req)) || '{}')
        const item: HistoryItem = {
          id: Date.now().toString(36),
          ts: new Date().toISOString(),
          prompt: String(body.prompt ?? '').slice(0, 300),
          reference: String(body.reference ?? ''),
          kind: String(body.kind ?? 'url'),
          value: String(body.value ?? ''),
        }
        if (!item.value) { sendJson(res, 400, { ok: false, error: 'value required' }); return }
        const items = loadHistory()
        items.unshift(item)
        saveHistory(items.slice(0, HISTORY_CAP))
        sendJson(res, 200, { ok: true, id: item.id })
      } catch (e) {
        sendJson(res, 500, { ok: false, error: e instanceof Error ? e.message : String(e) })
      }
    })()
  })

  // ——— v4：图片落盘 + 画布文档持久化 + konva vendor ———
  const storDir = (): string => join(process.env.USERPROFILE || process.env.HOME || '', '.dsh', 'storages')
  const imgDir = (): string => join(storDir(), 'sensenova-images')
  const canvasFile = (): string => join(storDir(), 'dsh-sensenova-image-canvas.json')
  const IMAGE_MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }

  // 画布端会传回自家文件 URL（/api/sensenova/image/<id>），统一解析成可发往 SenseNova 的形态
  function resolveRefToImageInput(ref: string): string {
    const m = ref.match(/^\/api\/sensenova\/image\/([A-Za-z0-9]+\.(?:png|jpe?g|webp))$/)
    if (m) return toDataUrl(readFileSync(join(imgDir(), m[1])).toString('base64'))
    return toDataUrl(ref)
  }

  // 画布文档读取/追加（agent 工具与 toolview 按钮共用）
  function readCanvasDoc(): any {
    try { return JSON.parse(readFileSync(canvasFile(), 'utf8')) } catch { return null }
  }
  function appendCanvasNode(node: Record<string, unknown>): boolean {
    let doc = readCanvasDoc()
    if (!doc || !Array.isArray(doc.nodes)) {
      // 画布文档不存在（用户还没开过工作台），先初始化再追加
      doc = { nodes: [], camera: { x: 0, y: 0, scale: 1 } }
    }
    doc.nodes.push(node)
    if (doc.nodes.length > 300) doc.nodes = doc.nodes.slice(-300)
    atomicWriteFile(canvasFile(), JSON.stringify(doc))
    return true
  }

  // ——— Phase 2：SSE 事件总线（agent ↔ 画布实时通道；第三方插件进不了官方事件白名单）———
  const sseClients = new Set<{ write: (s: string) => void }>()
  const sseBuffer: string[] = []
  function emitCanvasEvent(evt: Record<string, unknown>): void {
    const line = `data: ${JSON.stringify({ ...evt, ts: Date.now() })}\n\n`
    sseBuffer.push(line)
    if (sseBuffer.length > 10) sseBuffer.shift()
    for (const res of sseClients) { try { res.write(line) } catch { sseClients.delete(res) } }
  }
  reg('/api/sensenova/events', (req, res) => {
    if (req.method !== 'GET') { sendJson(res, 405, { ok: false, error: 'GET only' }); return }
    const origin = String(req.headers?.origin ?? '')
    if (origin) {
      try { if (new URL(origin).host !== req.headers?.host) { sendJson(res, 403, { ok: false, error: 'origin rejected' }); return } } catch { }
    }
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    })
    res.write('retry: 3000\n\n')
    for (const b of sseBuffer) res.write(b)
    res.write(`data: ${JSON.stringify({ type: 'hello', ts: Date.now() })}\n\n`)
    const client = { write: (s: string) => res.write(s) }
    sseClients.add(client)
    const hb = setInterval(() => { try { res.write(`: hb ${Date.now()}\n\n`) } catch { } }, 25000)
    ;(req as unknown as { on: (ev: string, cb: () => void) => void }).on('close', () => {
      clearInterval(hb)
      sseClients.delete(client)
    })
  })

  // agent / 聊天卡片把图追加到画布（打开中的画布经 SSE canvas:update 实时刷新）
  reg('/api/sensenova/canvas/nodes', (req, res) => {
    if (req.method !== 'POST') { sendJson(res, 405, { ok: false, error: 'POST only' }); return }
    const origin = String(req.headers?.origin ?? '')
    if (origin) {
      try { if (new URL(origin).host !== req.headers?.host) { sendJson(res, 403, { ok: false, error: 'origin rejected' }); return } } catch { }
    }
    void (async () => {
      try {
        const body = JSON.parse((await readBody(req)) || '{}')
        const rawSrc = body.src ? String(body.src) : ''
        if (!rawSrc) { sendJson(res, 400, { ok: false, error: 'src required' }); return }
        // 已是画布自有文件引用就直接用；否则落盘（dataURL / http URL / 本地路径）
        let src = rawSrc
        if (!/^\/api\/sensenova\/image\//.test(rawSrc)) {
          const kind = rawSrc.startsWith('data:') ? 'base64' : rawSrc.startsWith('http') ? 'url' : 'path'
          const saved = await persistImage(kind, rawSrc)
          if (!saved) { sendJson(res, 502, { ok: false, error: '图片获取失败（本地路径不存在？）' }); return }
          src = saved.url
        }
        const doc = readCanvasDoc()
        let x = Number.isFinite(body.x) ? Math.round(body.x) : null as unknown as number
        let y = Number.isFinite(body.y) ? Math.round(body.y) : 0
        if (x === null) {
          x = 0
          if (doc && Array.isArray(doc.nodes) && doc.nodes.length) {
            x = Math.max(...doc.nodes.map((n: { x: number; w: number }) => (n.x || 0) + (n.w || 480))) + 60
          }
        }
        const node = {
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
          type: 'image', status: 'done', src, parentId: undefined,
          x, y, w: Number.isFinite(body.w) ? Math.round(body.w) : 480, h: Number.isFinite(body.h) ? Math.round(body.h) : 480,
          prompt: String(body.prompt || '📌 插入'), params: {}, ts: Date.now(),
        }
        if (!appendCanvasNode(node)) { sendJson(res, 500, { ok: false, error: '画布文档不存在（先在工作台生成一次以初始化）' }); return }
        emitCanvasEvent({ type: 'canvas:update' })
        sendJson(res, 200, { ok: true, id: node.id, src })
      } catch (e) {
        sendJson(res, 500, { ok: false, error: e instanceof Error ? e.message : String(e) })
      }
    })()
  })

  // P1-2：参考图落盘路由（无副作用，不进画布）——客户端在上传 dataURL 参考图入队前
  // 先换成本文件 URL，失败重试才有图可带（否则静默变文生图）
  reg('/api/sensenova/upload', (req, res) => {
    if (req.method !== 'POST') { sendJson(res, 405, { ok: false, error: 'POST only' }); return }
    const origin = String(req.headers?.origin ?? '')
    if (origin) {
      try { if (new URL(origin).host !== req.headers?.host) { sendJson(res, 403, { ok: false, error: 'origin rejected' }); return } } catch { }
    }
    void (async () => {
      try {
        const body = JSON.parse((await readBody(req)) || '{}')
        const src = body.src ? String(body.src) : ''
        if (!src) { sendJson(res, 400, { ok: false, error: 'src required' }); return }
        // 已是自家文件引用就原样返回（幂等，不重复落盘）
        if (src.startsWith('/api/sensenova/image/')) { sendJson(res, 200, { ok: true, url: src, persisted: false }); return }
        const kind = src.startsWith('data:') ? 'base64' : src.startsWith('http') ? 'url' : 'path'
        const saved = await persistImage(kind, src)
        if (!saved) { sendJson(res, 502, { ok: false, error: '参考图落盘失败（URL 不可达或非图片）' }); return }
        sendJson(res, 200, { ok: true, url: saved.url, id: saved.id })
      } catch (e) {
        sendJson(res, 500, { ok: false, error: e instanceof Error ? e.message : String(e) })
      }
    })()
  })

  function atomicWriteFile(file: string, data: string | Buffer): void {
    mkdirSync(dirname(file), { recursive: true })
    const tmp = `${file}.${Date.now()}.tmp`
    writeFileSync(tmp, data)
    renameSync(tmp, file)
  }

  // 生成结果落盘为本地文件，返回 /api/sensenova/image/<id><ext> 引用；远程 url 下载失败则回退原样返回
  async function persistImage(kind: string, value: string): Promise<{ id: string; url: string } | null> {
    try {
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
      let buf: Buffer | null = null
      let ext = '.png'
      if (kind === 'base64') {
        const m = value.match(/^data:image\/(png|jpeg|jpg|webp)/)
        if (m) ext = '.' + (m[1] === 'jpeg' ? 'jpg' : m[1])
        buf = Buffer.from(value.includes(',') ? value.slice(value.indexOf(',') + 1) : value, 'base64')
      } else if (kind === 'path') {
        const m = value.match(/\.(png|jpe?g|webp)$/i)
        if (!m) return null
        ext = '.' + (m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase())
        buf = readFileSync(value)
      } else {
        const r = await fetch(value, { signal: AbortSignal.timeout(30000) })
        if (!r.ok) return null
        const ct = r.headers.get('content-type') || ''
        if (ct.includes('jpeg')) ext = '.jpg'
        else if (ct.includes('webp')) ext = '.webp'
        buf = Buffer.from(await r.arrayBuffer())
      }
      if (!buf || buf.length < 64) return null
      atomicWriteFile(join(imgDir(), `${id}${ext}`), buf)
      return { id, url: `/api/sensenova/image/${id}${ext}` }
    } catch { return null }
  }

  // 画布文档 GET/PUT（整文档 JSON，原子写；8MB 上限）
  // SPEC-14 二.3 并发写保护：文档存 rev（整数，落在 doc.rev；旧文档缺省按 0，agent 的
  // appendCanvasNode 原样带过 rev 不自增——服务端追加不算会话写冲突）。GET 返回 { ok, doc, rev }
  // （rev 与 doc 同级）；PUT 校验 body.rev === 存储 rev：不匹配 → 409 + 服务端最新文档；
  // 匹配 → rev+1 落盘并在 200 响应里回带新 rev。body.rev 缺省视为旧客户端，不做冲突检测直接落盘
  // （保证升级窗口/异常路径下正常保存行为不变）。成功/409 响应都带 rev，客户端据此保持版本同步。
  reg('/api/sensenova/canvas', (req, res) => {
    void (async () => {
      if (req.method === 'GET') {
        try {
          const doc = JSON.parse(readFileSync(canvasFile(), 'utf8'))
          sendJson(res, 200, { ok: true, doc, rev: doc && typeof doc.rev === 'number' && Number.isFinite(doc.rev) ? Math.floor(doc.rev) : 0 })
        } catch { sendJson(res, 200, { ok: true, doc: null, rev: 0 }) }
        return
      }
      if (req.method === 'PUT') {
        try {
          const body = JSON.parse((await readBody(req)) || '{}')
          const doc = body?.doc
          if (!doc || typeof doc !== 'object' || !Array.isArray(doc.nodes)) { sendJson(res, 400, { ok: false, error: 'doc{nodes[]} required' }); return }
          const cur = readCanvasDoc()
          const storedRev = cur && typeof cur.rev === 'number' && Number.isFinite(cur.rev) ? Math.floor(cur.rev) : 0
          const clientRev = typeof body.rev === 'number' && Number.isFinite(body.rev) ? Math.floor(body.rev) : null
          if (clientRev !== null && clientRev !== storedRev) {
            const latest = cur && Array.isArray(cur.nodes) ? cur : null
            sendJson(res, 409, { ok: false, error: '画布已被其他会话修改', doc: latest, rev: storedRev })
            return
          }
          doc.rev = storedRev + 1
          const json = JSON.stringify(doc)
          if (json.length > 8 * 1024 * 1024) { sendJson(res, 413, { ok: false, error: 'doc too large (>8MB)' }); return }
          atomicWriteFile(canvasFile(), json)
          sendJson(res, 200, { ok: true, rev: doc.rev })
        } catch (e) { sendJson(res, 400, { ok: false, error: e instanceof Error ? e.message : String(e) }) }
        return
      }
      sendJson(res, 405, { ok: false, error: 'GET/PUT only' })
    })()
  })

  // 图片文件服务：id 白名单校验，长缓存（id 唯一）
  // 注意 path 不带尾斜杠：webserver 的前缀匹配是 pathname.startsWith(path + '/')，
  // 注册成 ".../image/" 会变成双斜杠永不命中，静默掉进 fallback 的 401 栅栏
  ctx.effect(() => (ctx as { webServer?: { register?: (r: { kind: string; path: string; handler: unknown }) => void } }).webServer?.register?.({
    kind: 'prefix',
    path: '/api/sensenova/image',
    handler: (req: { url?: string }, res: { writeHead: (c: number, h?: Record<string, string>) => void; end: (b?: Buffer | string) => void }) => {
      const raw = decodeURIComponent(String(req.url ?? '')).split('?')[0]
      const cut = raw.indexOf('/image/')
      const id = (cut >= 0 ? raw.slice(cut + 7) : raw).replace(/^\/+/, '')
      if (!/^[A-Za-z0-9]+\.(png|jpe?g|webp)$/.test(id)) { sendJson(res, 400, { ok: false, error: 'bad image id' }); return }
      try {
        const buf = readFileSync(join(imgDir(), id))
        res.writeHead(200, { 'content-type': IMAGE_MIME[id.slice(id.lastIndexOf('.'))] || 'application/octet-stream', 'cache-control': 'public, max-age=31536000, immutable' })
        res.end(buf)
      } catch { sendJson(res, 404, { ok: false, error: 'image not found' }) }
    },
  }), 'dsh-sensenova-image: /api/sensenova/image/')

  // konva 本体（本地 vendor，避免 CDN 依赖）
  reg('/sensenova/vendor/konva.js', (_req, res) => {
    try {
      const p = join(dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', 'konva', 'konva.min.js')
      res.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'public, max-age=86400' })
      res.end(readFileSync(p))
    } catch { sendJson(res, 500, { ok: false, error: 'konva 未安装：插件目录 npm i konva 后重启' }) }
  })

  // （v4 不再单独挂静态页面：工作台直接在 dsh 侧栏里打开）

  reg('/api/sensenova/status', (_req, res) => {
    sendJson(res, 200, { ok: true, keyConfigured: Boolean(resolveKey(config)) })
  })

  // 真连接测试：实际访问 SenseNova /models，返回可用模型清单（工作台设置页"测试连接"用）
  reg('/api/sensenova/ping', (req, res) => {
    if (req.method !== 'GET') { sendJson(res, 405, { ok: false, error: 'GET only' }); return }
    const origin = String(req.headers?.origin ?? '')
    if (origin) {
      try { if (new URL(origin).host !== req.headers?.host) { sendJson(res, 403, { ok: false, error: 'origin rejected' }); return } } catch { }
    }
    const key = resolveKey(config)
    if (!key) { sendJson(res, 200, { ok: false, error: '未配置 API Key（先保存或设置 SENSENOVA_API_KEY）' }); return }
    fetch(`${config.baseUrl.replace(/\/$/, '')}/models`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15000),
    })
      .then(async (r) => {
        if (!r.ok) { sendJson(res, 200, { ok: false, error: `HTTP ${r.status}（Key 无效或 baseUrl 不对）` }); return }
        const j: any = await r.json().catch(() => ({}))
        const models: string[] = (j?.data || []).map((m: any) => m?.id).filter((s: unknown): s is string => typeof s === 'string')
        sendJson(res, 200, { ok: true, models, hasImageModel: models.some((m) => m.includes('u1')) })
      })
      .catch((e) => sendJson(res, 200, { ok: false, error: e instanceof Error ? e.message : String(e) }))
  })

  // 测试连接：调 sensenova /v1/models 验证 key（不消耗配额）
  reg('/api/sensenova/test', async (req, res) => {
    if (req.method !== 'POST') { sendJson(res, 405, { ok: false, error: 'POST only' }); return }
    const origin = String(req.headers?.origin ?? '')
    if (origin) {
      try { if (new URL(origin).host !== req.headers?.host) { sendJson(res, 403, { ok: false, error: 'origin rejected' }); return } } catch { }
    }
    const key = resolveKey(config)
    if (!key) { sendJson(res, 400, { ok: false, error: 'API Key 未配置（先在「保存设置」里填 key，或设置 SENSENOVA_API_KEY 环境变量）' }); return }
    try {
      const base = String(config.baseUrl || '').replace(/\/+$/, '')
      const ac = new AbortController()
      const timer = setTimeout(() => ac.abort(), config.timeoutMs)
      const r = await fetch(`${base}/models`, {
        headers: { authorization: `Bearer ${key}` },
        signal: ac.signal,
      })
      clearTimeout(timer)
      const body = await r.text().catch(() => '')
      if (r.ok) {
        let models: string[] = []
        try {
          const j = JSON.parse(body)
          if (Array.isArray(j?.data)) models = j.data.map((m: any) => m?.id).filter(Boolean)
          else if (Array.isArray(j?.models)) models = j.models.map((m: any) => (typeof m === 'string' ? m : m?.id)).filter(Boolean)
        } catch { /* 解析失败也按 200 处理，只是不返回模型列表 */ }
        sendJson(res, 200, { ok: true, base, models, model: config.model })
        return
      }
      sendJson(res, r.status, { ok: false, error: `SenseNova ${r.status} ${r.statusText}：${body.slice(0, 240)}` })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      sendJson(res, 502, { ok: false, error: msg.includes('aborted') ? `请求超时（${config.timeoutMs}ms），检查 baseUrl 是否可达` : msg })
    }
  })

  // 工具1：图像增强（清晰化 + 去水印）— 你的 Kool 案例主入口
  ctx.effect(() =>
    ctx.tools.register(
      defineTool({
        name: 'sensenova_enhance_image',
        description:
          '商汤 U1.5 图像增强：清晰化/4K 超分 + 去水印。传入原图 URL 或 base64，指定是否去水印，返回新图 URL/base64。适合 Kool 海报这类豆包水印的锐化任务。',
        parameters: {
          image: { type: 'string', required: true, description: '原图：https URL 或 data:image/...;base64,... 或 裸 base64' },
          removeWatermark: { type: 'boolean', description: '是否去掉右下角豆包等水印（默认 true）' },
          prompt: { type: 'string', description: '附加编辑指令，覆盖默认。默认：清晰化+去水印并保留原风格' },
          model: { type: 'string', description: '覆盖默认模型，留空用配置项' },
        },
        output: { schema: { type: 'string' }, render: (a, v) => [{ type: 'text', text: String(v) }] },
        async execute(args: { image: string; removeWatermark?: boolean; prompt?: string; model?: string }) {
          const key = resolveKey(config)
          if (!key) return missingKeyHint()
          const model = args.model || config.model
          const rm = args.removeWatermark ?? true

          const defaultPrompt = rm
            ? 'Enhance this image to ultra-clear 4K quality, increase sharpness and detail, remove the watermark text "豆包" at the bottom right corner without leaving artifacts, keep the original Kool graffiti typography, colors (white/pink/cyan/purple), grunge splatter background and torn paper corners exactly unchanged. Preserve composition, lighting and style.'
            : 'Enhance this image to ultra-clear 4K quality, increase sharpness and detail, keep all original elements including Kool typography, colors, splatter background and torn paper corners exactly unchanged.'

          const prompt = args.prompt?.trim() || defaultPrompt
          const imageUrl = toDataUrl(args.image)

          // U1.5 多模态编辑走 chat/completions：image + text
          const messages = [
            {
              role: 'user',
              content: [
                { type: 'image_url', image_url: { url: imageUrl } },
                { type: 'text', text: prompt },
              ],
            },
          ]

          try {
            const data: any = await callChatCompletions({
              baseUrl: config.baseUrl,
              apiKey: key,
              model,
              timeoutMs: config.timeoutMs,
              messages,
            })
            // 兼容多种返回形态：choices[0].message.content 可能是 string / array / 含 image_url
            const choice = data.choices?.[0]?.message
            // 尝试提取生成图的 URL：content 中可能嵌 image_url 或直接返回 url 字段
            const content = choice?.content
            let imageOut: string | undefined
            if (typeof content === 'string') {
              // 文本中可能包含 ![...](url) 或裸 url
              const m = content.match(/https?:\/\/[^\s"')]+/)
              if (m) imageOut = m[0]
            } else if (Array.isArray(content)) {
              for (const p of content) {
                if (p?.type === 'image_url' && p.image_url?.url) imageOut = p.image_url.url
                if (p?.type === 'text' && typeof p.text === 'string') {
                  const m = p.text.match(/https?:\/\/[^\s"')]+/)
                  if (m && !imageOut) imageOut = m[0]
                }
              }
            }
            // 有些实现直接在 data.data[0].url
            if (!imageOut && Array.isArray((data as any).data)) imageOut = (data as any).data[0]?.url
            if (!imageOut && (data as any).url) imageOut = (data as any).url

            return JSON.stringify(
              {
                prompt,
                model,
                result_image: imageOut || null,
                raw: data,
                hint: imageOut ? 'enhance 成功，result_image 为新图' : '未直接返回图片，查看 raw.choices[0].message.content 或 data 字段',
              },
              null,
              2,
            )
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            // 回退：若 chat/completions 不支持图像，提示改用 images/generations 或检查 model
            return JSON.stringify({ error: msg, prompt, model, hint: '若 404/不支持图像，尝试 model=sensenova-u1.5-lite 或确认控制台已开通 U1.5 权限' }, null, 2)
          }
        },
      }),
    ),
  )

  // 工具2：纯文生图（U1 Fast 4K）
  ctx.effect(() =>
    ctx.tools.register(
      defineTool({
        name: 'sensenova_generate_image',
        description: '商汤 U1 文生图/图生图：prompt → 4K 图像。生成的图会自动落盘并实时出现在用户打开的"生图工作台"画布上。传 reference（本地路径/URL/dataURL）时走图生图；v8 起支持 refs 多参考图数组，每个 ref 含 src/role(strength)。',
        parameters: {
          prompt: { type: 'string', required: true, description: '生成提示词（支持中英文）' },
          reference: { type: 'string', description: '参考图（兼容旧接口）：本地文件路径 / https URL / data URL。' },
          refs: {
            type: 'array',
            description: 'v8 多参考图：[{src, role: "style"|"character"|"composition"|"reference", strength: 0~1}, ...]',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                src: { type: 'string', description: '本地路径/URL/dataURL' },
                role: { type: 'string', description: 'style / character / composition / reference' },
                strength: { type: 'number', description: '0~1' },
              },
            },
          },
          size: { type: 'string', description: '分辨率，如 2048x2048 / 2752x1536，默认 2048x2048' },
          model: { type: 'string', description: '覆盖默认模型' },
        },
        output: { schema: { type: 'string' }, render: (a, v) => [{ type: 'text', text: String(v) }] },
        async execute(args: { prompt: string; reference?: string; refs?: Array<{ src: string; role?: string; strength?: number }>; size?: string; model?: string }) {
          const key = resolveKey(config)
          if (!key) return missingKeyHint()
          const model = args.model || config.model
          try {
            // 合并 reference + refs 为 images 数组（meta 与位置对齐：null=裸 reference 不描述）
            const images: string[] = []
            const imageMeta: Array<{ role?: string; strength?: number } | null> = []
            if (args.reference) { images.push(resolveRefToImageInput(args.reference)); imageMeta.push(null) }
            if (args.refs && args.refs.length) {
              for (const r of args.refs) {
                if (r && r.src) {
                  try { images.push(resolveRefToImageInput(r.src)); imageMeta.push({ role: r.role, strength: r.strength }) } catch { /* 跳过无效 ref */ }
                }
              }
            }
            // prompt 拼参考图说明（角色 + 强度滑块 0~1 → 语言化权重；取代原死变量 roleOrder 与模糊角色前缀）
            const enrichedPrompt = args.prompt + describeRefs(imageMeta)
            const data: any = await callImagesGenerations({
              baseUrl: config.baseUrl,
              apiKey: key,
              model,
              timeoutMs: config.timeoutMs,
              prompt: enrichedPrompt,
              size: args.size,
              n: 1,
              images: images.length ? images : undefined,
              image: args.reference,
            })
            const item = data?.data?.[0] ?? {}
            let resultImage: string | null = null
            if (item.url || item.b64_json) {
              const saved = await persistImage(item.url ? 'url' : 'base64', item.url ?? item.b64_json)
              resultImage = saved ? saved.url : (item.url ?? null)
            }
            if (resultImage) {
              const doc = readCanvasDoc()
              let x = 0
              let y = 0
              if (doc && Array.isArray(doc.nodes) && doc.nodes.length) {
                x = Math.max(...doc.nodes.map((n: any) => (n.x || 0) + (n.w || 480))) + 60
                y = doc.nodes[doc.nodes.length - 1].y || 0
              }
              appendCanvasNode({
                id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
                type: 'image', status: 'done', src: resultImage, parentId: undefined,
                x, y, w: 480, h: 480, prompt: '💬 ' + String(args.prompt || '').slice(0, 120),
                params: {
                  fromChat: true,
                  refs: (args.refs || []).map((r) => ({ role: r.role || 'reference', strength: r.strength ?? 0.7 })),
                },
                ts: Date.now(),
              })
              emitCanvasEvent({ type: 'canvas:update' })
            }
            return JSON.stringify(
              {
                ok: Boolean(resultImage),
                prompt: args.prompt,
                model,
                size: args.size || '2048x2048',
                result_image: resultImage,
                refs: args.refs || [],
                hint: resultImage
                  ? `生成成功（${args.refs && args.refs.length ? `使用了 ${args.refs.length} 张参考图` : '纯文生图'}），result_image 为图片 URL（已落盘）`
                  : '未返回图片，查看 SenseNova 响应或确认模型权限',
              },
              null,
              2,
            )
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            return JSON.stringify({ ok: false, error: msg, hint: '确认 model 是否为 sensenova-u1.5-lite 且已开通' }, null, 2)
          }
        },
      }),
    ),
  )

  // 工具3：通用编辑（任意 prompt + 单/多图）
  ctx.effect(() =>
    ctx.tools.register(
      defineTool({
        name: 'sensenova_edit_image',
        description: '商汤 U1.5 通用图像编辑：传入 1 张或多张图 + 编辑指令，模型理解后重绘。适合换色、改字、增删元素等。结果自动落盘，并实时出现在用户打开的"生图工作台"画布上。',
        parameters: {
          images: {
            type: 'array',
            items: { type: 'string' },
            required: true,
            description: '1-3 张图，每张为 URL 或 data URL/base64',
          },
          prompt: { type: 'string', required: true, description: '编辑指令，例如 "将外套改为藏青色，保留人脸姿态背景"' },
          model: { type: 'string', description: '覆盖默认模型' },
        },
        output: { schema: { type: 'string' }, render: (a, v) => [{ type: 'text', text: String(v) }] },
        async execute(args: { images: string[]; prompt: string; model?: string }) {
          const key = resolveKey(config)
          if (!key) return missingKeyHint()
          const model = args.model || config.model
          const content: any[] = []
          for (const img of args.images) content.push({ type: 'image_url', image_url: { url: toDataUrl(img) } })
          content.push({ type: 'text', text: args.prompt })
          try {
            const data: any = await callChatCompletions({
              baseUrl: config.baseUrl,
              apiKey: key,
              model,
              timeoutMs: config.timeoutMs,
              messages: [{ role: 'user', content }],
            })
            // 提取结果图 → persistImage 落盘 → appendCanvasNode 落画布（与 generate/enhance 管线对齐）
            const imageOut = extractImageFromChat(data)
            let resultImage: string | null = null
            if (imageOut) {
              const isUrl = imageOut.startsWith('http')
              const saved = await persistImage(isUrl ? 'url' : 'base64', imageOut)
              // 落盘成功用本地文件 URL；落盘失败时 http 图仍可直接用，data URL 则不回传（太大）
              resultImage = saved ? saved.url : (isUrl ? imageOut : null)
            }
            if (resultImage) {
              const doc = readCanvasDoc()
              let x = 0
              let y = 0
              if (doc && Array.isArray(doc.nodes) && doc.nodes.length) {
                x = Math.max(...doc.nodes.map((n: any) => (n.x || 0) + (n.w || 480))) + 60
                y = doc.nodes[doc.nodes.length - 1].y || 0
              }
              appendCanvasNode({
                id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
                type: 'image', status: 'done', src: resultImage, parentId: undefined,
                x, y, w: 480, h: 480, prompt: '✏️ ' + String(args.prompt || '').slice(0, 120),
                params: { fromChat: true, editedImages: (args.images || []).length },
                ts: Date.now(),
              })
              emitCanvasEvent({ type: 'canvas:update' })
            }
            return JSON.stringify(
              {
                ok: Boolean(resultImage),
                prompt: args.prompt,
                model,
                result_image: resultImage,
                raw: data,
                hint: resultImage
                  ? '编辑成功，result_image 为图片 URL（已落盘，用户开着画布则实时可见）'
                  : '未提取到结果图，查看 raw.choices[0].message.content 或确认模型返回形态',
              },
              null,
              2,
            )
          } catch (e) {
            return JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e), hint: '确认 model 是否为 sensenova-u1.5-lite 且已开通' }, null, 2)
          }
        },
      }),
    ),
  )

  // ——— Phase 2：画布感知/操控工具 ———
  ctx.effect(() =>
    ctx.tools.register(
      defineTool({
        name: 'sensenova_canvas_get_state',
        description: '读取用户"生图工作台"画布当前状态：全部图片节点的 id/坐标/尺寸/来源提示词 + 相机。用户说"画布上那张/左边那张/刚才那张"等指代时先调它定位。',
        parameters: {},
        output: { schema: { type: 'string' }, render: (a, v) => [{ type: 'text', text: String(v) }] },
        async execute() {
          const doc = readCanvasDoc()
          if (!doc || !Array.isArray(doc.nodes) || !doc.nodes.length) {
            return JSON.stringify({ empty: true, hint: '画布为空或尚未初始化' }, null, 2)
          }
          const nodes = doc.nodes.map((n: any) => ({
            id: n.id, x: n.x, y: n.y, w: n.w, h: n.h, status: n.status,
            prompt: n.prompt, src: n.src, parentId: n.parentId,
          }))
          return JSON.stringify({ nodeCount: nodes.length, camera: doc.camera, nodes }, null, 2)
        },
      }),
    ),
  )

  ctx.effect(() =>
    ctx.tools.register(
      defineTool({
        name: 'sensenova_canvas_place_image',
        description: '把一张图摆到用户的生图画布上（用户开着画布时实时出现）。适合批量出图排版、拼贴素材。省略坐标时自动排到现有内容右侧。图片自动落盘为画布文件。',
        parameters: {
          src: { type: 'string', required: true, description: '图片来源：本地文件路径 / https URL / dataURL' },
          x: { type: 'number', description: '画布 x 坐标（省略则自动右移排版）' },
          y: { type: 'number', description: '画布 y 坐标（默认 0）' },
          w: { type: 'number', description: '显示宽度（默认 480，建议按图片比例给）' },
          h: { type: 'number', description: '显示高度（默认 480）' },
          prompt: { type: 'string', description: '这张图的说明/来源提示词' },
        },
        output: { schema: { type: 'string' }, render: (a, v) => [{ type: 'text', text: String(v) }] },
        async execute(args: { src: string; x?: number; y?: number; w?: number; h?: number; prompt?: string }) {
          const kind = args.src.startsWith('data:') ? 'base64' : args.src.startsWith('http') ? 'url' : 'path'
          const saved = await persistImage(kind, args.src)
          const src = saved ? saved.url : (args.src.startsWith('http') ? args.src : '')
          if (!src) return JSON.stringify({ ok: false, error: '图片获取失败（路径/URL 无效）' }, null, 2)
          const doc = readCanvasDoc()
          let x = Number.isFinite(args.x) ? Math.round(args.x as number) : 0
          if (!Number.isFinite(args.x) && doc && Array.isArray(doc.nodes) && doc.nodes.length) {
            x = Math.max(...doc.nodes.map((n: any) => (n.x || 0) + (n.w || 480))) + 60
          }
          const node = {
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
            type: 'image', status: 'done', src, parentId: undefined,
            x, y: Number.isFinite(args.y) ? Math.round(args.y as number) : 0,
            w: Number.isFinite(args.w) ? Math.round(args.w as number) : 480,
            h: Number.isFinite(args.h) ? Math.round(args.h as number) : 480,
            prompt: args.prompt || '🤖 agent 摆放', params: {}, ts: Date.now(),
          }
          if (!appendCanvasNode(node)) {
            return JSON.stringify({ ok: false, error: '画布文档不存在（先在工作台生成一次以初始化）' }, null, 2)
          }
          emitCanvasEvent({ type: 'canvas:update' })
          return JSON.stringify({ ok: true, id: node.id, src, note: '已放置，若用户开着画布则实时可见' }, null, 2)
        },
      }),
    ),
  )

  // 画布协议写入系统提示；text 用函数 → 每次组装提示时携带画布实时快照
  ctx.inject(['systemPrompt'], (sp: {
    systemPrompt: { section: (s: { name: string; order: number; text: () => string }) => void }
  }) => {
    sp.systemPrompt.section({
      name: 'sensenova-canvas',
      order: 50,
      text: () => {
        const doc = readCanvasDoc()
        let summary = '画布为空或尚未初始化（用户在工作台生成过一次即初始化）。'
        if (doc && Array.isArray(doc.nodes) && doc.nodes.length) {
          const rows = doc.nodes.slice(-20).map((n: any) =>
            `[${n.id}] (${n.x || 0},${n.y || 0}) ${n.w || 0}x${n.h || 0} ${n.status || '?'} "${String(n.prompt || '').slice(0, 40)}"`)
          summary = `当前 ${doc.nodes.length} 个节点（最多列最近 20）：\n${rows.join('\n')}`
        }
        return [
          '## SenseNova 生图画布',
          '用户可在浏览器打开"SenseNova 生图工作台"（无限画布）。约定：',
          '- sensenova_generate_image 生成的图自动落盘，并实时出现在打开的画布上（无需额外步骤）',
          '- 用户说"画布上那张/左边那张/刚才那张"等指代时，先用 sensenova_canvas_get_state 读节点清单定位',
          '- sensenova_canvas_place_image 可把本地图片/URL 摆到画布指定位置，适合批量排版、拼贴素材',
          '- 带【来自生图画布】前缀的消息 = 用户从画布发来的上下文，可能附画布选中图',
          '- 画布实时快照：' + summary,
        ].join('\n')
      }
    })
  })
}
