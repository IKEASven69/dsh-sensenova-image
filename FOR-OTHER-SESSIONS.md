# 给其他会话捎话 — dsh-sensenova-image 暂摘除说明

## 现状（2026-09-03）

- `dsh-sensenova-image` 已从 `~/.dsh/profiles/web` 临时摘除（dependencies + bundles 均移除）。
- 恢复用备份：`~/.dsh/profiles/web/package.json.bak-sensenova`（含 sensenova 的 dependencies + bundles）。
- 恢复后需跑 `pnpm install`，再 `dsh web` 重启验证。

## 为什么摘除

两个叠加问题，修好前它会阻塞整个 web profile 启动（`plugin tree failed to load` 直接退出）：

1. **`cordis.patch.yml` 是空的 `[]`** —— 插件从未向 profile 注册，面板里看不到是正常的。已修成本地改动（见下）。
2. **依赖版本错位** —— `package.json` 之前 pin `@deepseek-ai/dsh-tools@^0.1.0-rc.6`（实际装到 `0.1.0-rc.8`），其 `lib` 运行时 import `@deepseek-ai/dsh-scope`，但 npm 装不出该包（`ERR_MODULE_NOT_FOUND`，连锁拖死启动）。注意 `*` 也不能用：最新 `0.1.2-rc.1` 依赖 `dsh-type-meta` 等 workspace-only 包，npm 404。

## 本地已有的修复（未提交，需验证后 push）

- `cordis.patch.yml`：加了 `insert: [{id: sensenova-image, name: dsh-sensenova-image, config: {}}]`
- `package.json`：`@deepseek-ai/cordis` → `4.0.1`，`@deepseek-ai/dsh-tools` → `0.1.1-rc.2`（与能正常启动的 `dsh-hippo` 实测版本一致；`node_modules` 已装好该版本，`dist` 已重建）
- 用这套组合验证过：`--dump-config` 可见 `sensenova-image`，web 返回 200，**设置 → 插件列表页已出现 `sensenova-image，已挂载 已启用`**（:5180 实测）。
- 另需注意：`dsh-tools/lib` 运行时还会 import `@deepseek-ai/dsh-llm` / `dsh-session` / `dsh-scope`（上游只放 devDeps，npm 装不出），已把三者 `0.1.1-rc.2` + `@deepseek-ai/dsh-timeout@0.1.1-rc.2`（dsh-llm 的传递依赖）显式写进本包 `dependencies`。后续升级 dsh-tools 版本时，用「扫描 `node_modules/@deepseek-ai/*/lib/*.js` 里 `from "@deepseek-ai/..."` 是否可解析」的方法一次找齐，别打地鼠。

## 恢复检查清单

1. 还原备份 → `pnpm install`（profile 目录）
2. `dsh --profile web --dump-config | grep sensenova` 应有一行
3. 起 web，进 设置 → 插件列表，搜 `sensenova` 应出现；缺 apiKey 时工具应返回指引而非抛错
4. 配 `SENSENOVA_API_KEY=sk-...`（已在用户环境变量），调 `sensenova_generate_image` 出一张图即算通

## 关联

- 个人涂鸦 skill：`~/.config/opencode/skills/my-kool-beautify/`（`--palette kool/cold/cuez/custom`，`watermark: false` 铁律）依赖此插件生图，插件恢复前 skill 的出图步骤走不通。
- 测试头图：`D:\coding\dsh-opencli\assets\header-kool.png`（炸街紫）、`header-cold.png`（冷峻版）已出；`assets/header.svg` 为干净三卡片版，未定稿，均未提交。

## 恢复完成 + 新能力（2026-09-08）

- 插件已挂回 web/headless 两个 profile（headless 由本会话补挂，web 按上方检查清单恢复）
- **新增 `reference` 参数**（generate_image）：传参考图（本地路径/URL/base64）走图生图，风格锚定——零漂移出品牌图实测通过
- **新增设置区块**：内联 `settings.register`（0.1.2 删除了 installSettingsSection 包装，照 dshmarket settings.js 的内联模式），web 设置页出现 apiKey/baseUrl/model 表单；apiKey 为空不覆盖 env
- 构建：tsup 崩溃换 **esbuild**（package.json build 脚本）；schemastery 3.18.2 显式依赖（拷自 dsh 0.1.2 bundle）
- 兼容性：dsh 0.1.2-rc.1 实测通过（headless 出片 + web 设置区块）
