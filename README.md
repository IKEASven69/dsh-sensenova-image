# dsh-sensenova-image

商汤 **SenseNova U1.5** 生图插件 for DeepSeek Harness (dsh)。

> 一键清晰化 + 去水印：把豆包水印的 Kool 海报这类图，变清晰并去掉右下角 `豆包`。

## 功能

| 工具 | 说明 |
|------|------|
| `sensenova_enhance_image` | **主入口**：传入原图 URL/base64，自动清晰化至 4K 并去掉水印（默认） |
| `sensenova_edit_image` | 通用编辑：1-3 张参考图 + 任意 prompt（换色/改字/增删元素） |
| `sensenova_generate_image` | 纯文生图：prompt → 4K 图（走 `/v1/images/generations`） |

## 配置（像 dsh 里设置模型那样，只填 apikey）

dsh 插件页 → `dsh-sensenova-image` → 设置：

| 项 | 必填 | 默认 | 说明 |
|----|------|------|------|
| `apiKey` | ✅ | — | `platform.sensenova.cn → 控制台 → API-Key 管理 → 创建`，`sk-...` |
| `baseUrl` | — | `https://token.sensenova.cn/v1` | OpenAI-compatible 地址 |
| `model` | — | `sensenova-u1-fast` | U1.5 推荐 `sensenova-u1.5` / `sensenova-u1-fast`，可在控制台 `模型广场` 确认 |
| `timeoutMs` | — | `60000` | 单次请求超时 |

也支持环境变量：`SENSENOVA_API_KEY`（或 `SENSENOVA_TOKEN`），插件配置优先。

> 未填 apikey 时工具不会抛错，会返回如何获取的指引，便于 agent 提示你。

## 安装

```sh
# 1. 构建
cd dsh-plugins/plugins/sensenova-image
npm install --legacy-peer-deps
npm run build

# 2. 安装到 dsh（任选其一）
# 方式 A：dsh 命令
dsh plugin --profile web add ./plugins/sensenova-image

# 方式 B：手动 link（参考 dsh-plugin/README）
# 在 ~/.dsh/profiles/web/package.json 加 "dsh-sensenova-image": "link:..."
# 然后 pnpm install
```

## 使用（agent 视角）

```
用户：把这张 Kool 海报变清晰并去掉豆包水印
→ agent 调 sensenova_enhance_image { image: "data:image/png;base64,...", removeWatermark: true }

用户：把外套改成藏青色，保留人脸姿态
→ agent 调 sensenova_edit_image { images: ["..."], prompt: "将外套改为藏青色，保留人脸、姿态、背景、光照和构图" }
```

**Kool 案例 prompt（默认）**：
```
Enhance this image to ultra-clear 4K quality, increase sharpness and detail,
remove the watermark text "豆包" at the bottom right corner without leaving artifacts,
keep the original Kool graffiti typography, colors (white/pink/cyan/purple),
grunge splatter background and torn paper corners exactly unchanged.
```

## 本地自测（不走 dsh）

```sh
export SENSENOVA_API_KEY=sk-...
node -e "
import('./dist/index.js').then(m=>{
  // 直接调 API 验证连通性
})
"
# 或用 curl 验证 key 有效：
curl https://token.sensenova.cn/v1/models -H \"Authorization: Bearer \$SENSENOVA_API_KEY\"
```

## 文档

- 平台：https://platform.sensenova.cn/docs
- U1.5 预览：https://github.com/OpenSenseNova/SenseNova-U1/blob/main/docs/u1.5_preview_CN.md
- BaseUrl 必须是 `https://token.sensenova.cn/v1`（不是 `api.sensenova.cn/compatible-mode/v1`，会 403）
