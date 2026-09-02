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
import z from 'zod'

export const name = 'dsh-sensenova-image'
export const inject = ['tools']

export const Config = z.object({
  apiKey: z.string().optional().describe('SenseNova API Key（platform.sensenova.cn → 控制台 → 管理中心 → API-Key 管理 → 创建，sk-...）'),
  baseUrl: z.string().default('https://token.sensenova.cn/v1').describe('OpenAI-compatible baseUrl（固定 https://token.sensenova.cn/v1）'),
  model: z.string().default('sensenova-u1-fast').describe('模型 id（控制台模型广场确认，U1.5 可填 sensenova-u1.5 / sensenova-u1-fast）'),
  timeoutMs: z.number().min(3000).max(120000).default(60000).describe('单次请求超时 ms'),
})

export type Config = z.infer<typeof Config>

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
}): Promise<any> {
  const url = `${opts.baseUrl.replace(/\/$/, '')}/images/generations`
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model,
      prompt: opts.prompt,
      size: opts.size ?? '2048x2048',
      n: opts.n ?? 1,
      watermark: opts.watermark ?? false,
    }),
    signal: AbortSignal.timeout(opts.timeoutMs),
  })
  if (!res.ok) {
    const body = await res.text().then((t) => t.slice(0, 800)).catch(() => '')
    throw new Error(`SenseNova images ${res.status} ${url}: ${body}`)
  }
  return res.json()
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
        '3. baseUrl 保持 https://token.sensenova.cn/v1，model 用 sensenova-u1-fast 或 sensenova-u1.5',
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

// ——— 插件 ———
export function apply(ctx: Context, rawConfig: Config) {
  const config = Config.parse(rawConfig)

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
            return JSON.stringify({ error: msg, prompt, model, hint: '若 404/不支持图像，尝试 model=sensenova-u1-fast 或确认控制台已开通 U1.5 权限' }, null, 2)
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
        description: '商汤 U1 文生图：prompt → 4K 图像。走 /v1/images/generations，适合无参考图的全新生成。',
        parameters: {
          prompt: { type: 'string', required: true, description: '生成提示词（支持中英文）' },
          size: { type: 'string', description: '分辨率，如 2048x2048 / 2752x1536，默认 2048x2048' },
          model: { type: 'string', description: '覆盖默认模型' },
        },
        output: { schema: { type: 'string' }, render: (a, v) => [{ type: 'text', text: String(v) }] },
        async execute(args: { prompt: string; size?: string; model?: string }) {
          const key = resolveKey(config)
          if (!key) return missingKeyHint()
          const model = args.model || config.model
          try {
            const data: any = await callImagesGenerations({
              baseUrl: config.baseUrl,
              apiKey: key,
              model,
              timeoutMs: config.timeoutMs,
              prompt: args.prompt,
              size: args.size,
              n: 1,
            })
            return JSON.stringify({ prompt: args.prompt, model, data }, null, 2)
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            return JSON.stringify({ error: msg, hint: '确认 model 是否为 sensenova-u1-fast 且已开通' }, null, 2)
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
        description: '商汤 U1.5 通用图像编辑：传入 1 张或多张图 + 编辑指令，模型理解后重绘。适合换色、改字、增删元素等。',
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
            return JSON.stringify({ prompt: args.prompt, model, data }, null, 2)
          } catch (e) {
            return JSON.stringify({ error: e instanceof Error ? e.message : String(e) }, null, 2)
          }
        },
      }),
    ),
  )
}
