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

## 版本基准更新（2026-09-17）

- 实装 dsh CLI = **0.1.5-rc.1**（vfox 全局装），旧 pin（dsh-tools@0.1.1-rc.2 等）实测仍可加载：`dsh --profile web --dump-config` 可见 sensenova-image、无报错。
- 计划依赖的 API 已逐项对 0.1.5 bundle grep 核实，全部存续，仅一处改名：attachments 准入 `admitPromptContent` → **`admitEncodedImages` / `admitEncodedFile`**（dsh-attachment 导出）。slots（sidebar.footer.action / shell.overlay / tool.call.toolview / conversation.view / settings.section）、settings.register(ns,...)、systemPrompt.section、defineDomain、SSE（text/event-stream 白名单外放）、`API_REMOTE_FORWARDED_EVENTS`（第三方仍不可加事件）均在。
- 注意：本地 workspace 仓库落后（deepseek-harness HEAD=0.1.2-rc.1、dsh-fresh=0.1.3-alpha.1），**API 存疑时以安装目录 bundle 为准**：`~/.version-fox/sdks/nodejs/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/`（内含 dsh-tools@0.1.5-rc.2）。
- 卫生项（非阻塞）：dsh-tools pin 0.1.1-rc.2 → 0.1.5-rc.2，升级前按上文扫描法重扫运行时 `@deepseek-ai/*` import。详见 WORKBENCH-PLAN.md。

## Phase 0 完成 + 新踩坑（2026-09-17）

- **工作台 v4 已上线**：client-v4.js（Konva 无限画布，`exports["./client"]` 已切过去，client-v3.js 留档未删）。真机全流程验证通过（幽灵节点→出图→落盘→选中→历史）。进度勾选见 WORKBENCH-PLAN.md Phase 0。
- **webserver 前缀路由注册的坑**：`{kind:'prefix', path}` 的匹配是 `pathname.startsWith(path + '/')`——path 带尾斜杠会变成双斜杠**永不命中**，且静默掉进 fallback（表现为 401），极难排查。注册 `/api/sensenova/image`（无尾斜杠）才对。
- **dsh web 有 token 认证栅栏**：浏览器必须开启动日志打印的 `http://127.0.0.1:<port>/?token=...`，裸 curl 一律 401 unauthorized（SPA 首页也一样）。但**exact 注册的插件路由在栅栏之外**，curl 可直接测（status/canvas 都通）；前缀路由修好尾斜杠后也在栅栏外。用浏览器自动化验证时要从日志拿带 token 的 URL。
- **`dsh web` 不吃 `--profile`**（它本身就是 `--profile web` 的别名）；`dsh --profile web web` 也不行。正确用法 `dsh web --no-open --port <p>`。
- **TaskStop 杀不干净**：后台跑 `dsh web` 时停掉 shell 后 node 子进程会残留占端口（EADDRINUSE），要 `netstat -ano | grep LISTENING` 找 PID `taskkill //PID <pid> //F`。
- konva 已进 dependencies（9.3.22），服务端从插件 node_modules 供 `/sensenova/vendor/konva.js`，无 CDN。
- 生成图落盘 `~/.dsh/storages/sensenova-images/`，画布文档 `~/.dsh/storages/dsh-sensenova-image-canvas.json`；测试残留已清（假图删除、t1 测试节点移除，画布上留了张柴犬当开荒图）。

## Phase 1 完成（2026-09-17）

- 浮动操作条 / 悬浮 prompt bar（选中即 i2i）/ 蒙版局部重绘（标注板合成）/ 扩图 / 拖入粘贴 / 模型档 全部上线；`POST /api/sensenova/enhance` 新路由；generate 路由支持 `model` 覆盖 + reference 为自家文件 URL（读盘转 base64）。勾选明细见 WORKBENCH-PLAN.md Phase 1。
- 真机验证（dsh web 0.1.5-rc.1 + 真 key）：操作条跟随选中、prompt bar 编辑模式 Enter → 幽灵节点落源图右侧带派生边、蒙版涂抹 → "仅修改高亮区域"实测把圣诞袜改成绿色礼物盒且场景保留。变体/增强/扩图与已验证管线同路未重复跑。
- **浏览器自动化测试要点**（下次少走弯路）：
  - CUA 点击坐标要扣顶栏偏移（wrap 从 y=45 开始），且新回合后旧 tab 会释放——先 `tabs.list()` + `user.openTabs()` 双查再 `tabs.get`，空的就 `tabs.new()`；token 存 localStorage 后裸 `http://127.0.0.1:<port>/` 即可开。
  - 画布点击选中最稳的路子：evaluate 里对 `.snx-cv-stage canvas` 派发 `mousedown+mouseup+click`（MouseEvent, bubbles）；动作条/菜单按钮直接 `document.querySelectorAll('.snx-ab button')[n].click()`。
  - React 受控 input 填值要走原生 setter + `dispatchEvent(new Event('input',{bubbles:true}))`。
  - 后台 tab 的 setTimeout 被节流，异步断言别用短定时器链。
- 画布现有三张开荒图（柴犬 → 圣诞袜场景 → 绿色礼物盒），是条完整派生链，留作演示。

## Phase 2 完成（2026-09-17）— agent↔画布双向闭环

- **agent→画布**：`sensenova_generate_image` 工具生成后服务端直接 append 画布文档（`💬` 前缀+fromChat）+ SSE `canvas:update` → 打开中的画布实时刷新（真机验证：聊天让 agent 画月球橘猫，画布自动多第 4 格）。SSE 路由 `/api/sensenova/events`（hello+重放10条+25s心跳）。`sensenova_canvas_get_state` / `sensenova_canvas_place_image` 两个新工具 + `POST /api/sensenova/canvas/nodes` 路由（persistImage 支持 kind:'path'）。
- **画布→agent**：操作条"🤖 问"→ deck 式三级降级 askAgent（sendSession→session.prompt），图走 `conversation.createDraftImages([File])`→imageIds→sendSession；文本带【来自生图画布】前缀+画布摘要（真机验证：消息+附图落会话）。
- **systemPrompt.section**：inline 注入（web-app 同款），text 传**函数**——每次组装系统提示实时内联画布快照（最近20节点），agent 每轮自带画布感知。这是"动态系统提示"的关键技巧。
- **tool.call.toolview**：`{name:'tool.call.toolview', key:'sensenova_generate_image', id, order}` 注册，组件收 `props.block`（running 无 kind / settled `{kind:'tool-result', content, call:{argsRaw}}`），工具返回 compact JSON（ok/prompt/result_image）供卡片解析。真机：缩略图+插入画布按钮渲染正常。
- 工具卡片的"📌 插入画布"和 agent 摆图共用 `POST /api/sensenova/canvas/nodes`：src 为画布自有 URL 直接用，否则落盘（dataURL/http/本地路径三态），未给坐标自动排最右。
- 测试结论：双 tab 方案（A 开画布听 SSE、B 发聊天）验证 agent→画布最顺；生图工具结果从 dump raw 改成 compact JSON，上下文占用大幅下降。
