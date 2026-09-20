# 生图工作台计划 — dsh-sensenova-image v4

> 2026-09-16 调研定稿。结论先行：**不 fork、不嵌入现成工作台，在现有 Konva 底座上自建无限画布，合法抄 InvokeAI（Apache-2.0）的画布交互代码 + MIT 项目的 agent↔canvas 联动机制**。dsh 本体的扩展面（slots / sessions / conversation / systemPrompt / storage domain）足以做出"画布即 agent 的手和眼"的联动，这是所有市面工作台都没有的差异化。

---

## 一、选型结论（为什么抄这个、不抄那个）

| 方案 | 判定 | 理由 |
|------|------|------|
| fork ComfyUI 前端 | ❌ | **GPL-3.0 传染**（主仓+前端仓都是），抄一行代码整个插件必须 GPL；且节点流围绕本地 SD 管线（checkpoint/sampler/ControlNet）设计，SenseNova 单一 OpenAI 兼容 API 用不上其中 90% 复杂度 |
| 嵌入 tldraw / tldraw agent-template | ❌ | **非开源**：生产环境必须商业授权，内置技术措施强制水印 + 遥测合规检测，上线即触线 |
| 嵌入 InvokeAI Unified Canvas | ⚠️ 抄码不嵌入 | **Apache-2.0**（已核实 LICENSE 原文，无附加商用条款），可合法复制其 canvas 代码；但它是"本地 Python 推理 + React UI"一体架构，canvas 状态与自家节点系统深度耦合，剥离成本 > 自建 |
| Krita AI Diffusion | ❌ 只参考 | GPL-3.0 + 强绑 Krita/ComfyUI；但"选区即蒙版、图层即控制条件"的交互模型值得抄 |
| **自建（Konva 底座）** | ✅ | Konva **MIT** 无风险；场景图/Transformer 框选/拖拽/滤镜完全覆盖"图片节点+蒙版+浮动操作+参数面板"的核心交互面；已用 Konva 起头，沉没成本最低；插件要求小体积、无框架绑定，Konva 比 Fabric（偏版面设计）/PixiJS（交互全自建）/tldraw（React 生态+收费）都合适 |

**可合法抄代码的白名单**（均已核实 license）：
- InvokeAI（Apache-2.0）— 蒙版画笔、参数面板、画布状态管理
- Loomic（MIT）— 聊天驱动画布、agent 感知画布指代（"把左边的图调暖"）
- codex-canvas（MIT）— 标注即编辑指令、结果附加原图右侧保留历史
- AI-Canvas（MIT，只抄思路）— 把画布能力打包为 agent 工具（MCP 模式，我们用 dsh tools 实现）
- langchain open-canvas（MIT，已归档）— artifact 版本树 + quick actions

**红线**：tldraw（商业授权+水印）不能用；ComfyUI/Krita GPL 不能抄码只能看交互；无 license 项目（infinite-kanvas 等）默认保留所有权利；AGPL（vozeb）连网络服务使用都触发开源义务，避开；别用 "ComfyUI/Invoke/Krea" 等商标命名功能。

---

## 二、dsh 本体给我们的联动基础（已按实装版 0.1.5-rc.1 逐项核实）

> **版本基准（2026-09-17 核实）**：实装 CLI = **0.1.5-rc.1**（`dsh --version`），且 `--dump-config` 实测当前插件（pin dsh-tools@0.1.1-rc.2）在 0.1.5 上**加载正常**。本地 workspace 仓库落后：deepseek-harness HEAD=0.1.2-rc.1（tag 有 dsh-v0.1.3-alpha.1）、dsh-fresh=0.1.3-alpha.1——**API 引证以安装目录 bundle 为准**：`~/.version-fox/sdks/nodejs/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/`（含 dsh-tools@0.1.5-rc.2 全家桶）。逐项 grep 核实结果见下表"0.1.5 存续"列。

dsh（0.1.5-rc.1）第三方插件可用：

| 能力 | API | 0.1.5 存续 | 对工作台的意义 |
|------|-----|------------|----------------|
| 侧栏按钮 | `sidebar.footer.action` slot | ✅ grep 4 处 | ✅ 已在用（client-v3.js order 25 生图按钮） |
| 全屏浮层 | `shell.overlay` slot | ✅ 6 处 | ✅ 已注册（order 85），工作台的宿主容器 |
| 会话内标签页 | `conversation.view` slot | ✅ 9 处 | 可选：每个会话一个画布 tab |
| 聊天内工具渲染 | `tool.call.toolview` keyed slot，`key:'sensenova_generate_image'` | ✅ 5 处 | agent 生图调用在聊天里显示缩略图 + "在画布打开" |
| 画布→聊天发消息 | client inject 加 `sessions`/`conversation`，deck 的 `promptIntoSession()` 三级降级（dsh-deck client.js:971-990） | 🟡 包在（dsh-client-ui-conversation 实装），发消息前实测签名 | 选中图片直接问 agent |
| 图片进会话 | 图片附件走 `ctx.attachments`；⚠️ **0.1.5 已改名**：`admitPromptContent` → `admitEncodedImages` / `admitEncodedFile`（dsh-attachment 实导出） | ✅ 改名后存在 | agent 能"看见"画布上的图 |
| 聊天→画布推消息 | 服务端 `ctx.sessionController.prompt()` / `agent.followup()`；工具 execute 拿到 `exec.agent` | 🟡 包在（dsh-api-session-controller 实装），实现时实测 | 画布按钮触发 agent 任务 |
| 教 agent 画布协议 | `systemPrompt.section({name, order, text})`（web-app 同款） | ✅ section+register 均在 | agent 知道画布存在、坐标语义、操作协议 → "把左上角的图变清晰"可解析 |
| agent→画布实时推送 | 第三方插件**不能**加事件到官方转发白名单（`API_REMOTE_FORWARDED_EVENTS` 仍在），用自建 SSE 路由（webServer.register 允许长连接，gzip 显式跳过 text/event-stream） | ✅ 白名单+`text/event-stream` 均在 | 工具生成完 → SSE → 打开中的画布落图 |
| 持久化 | `defineDomain` + `ctx.storageDomain`（sqlite backend，版本化+变更事件） | ✅ 3 处 | 替换手写 `~/.dsh/storages/*.json`（12 条上限、无版本无校验） |
| 插件工具注册 | `defineTool` + `ctx.tools.register` | ✅ dsh-tools@0.1.5-rc.2 仍导出 | 现有 3 个工具不动 |
| 版本兼容 fence | dshmarket 1.44 的 inject 存在性守卫模式 | ✅ dshmarket 1.44 在跑 | 防 dsh 升级再次拖死 profile（FOR-OTHER-SESSIONS 的教训） |

---

## 三、分期计划

### Phase 0 — 画布底座重写（v4，约 2-3 天）✅ 已完成（2026-09-17，真机全流程验证通过）
把 client-v3.js 的"单图预览"升级为真正的无限画布。仍走 `shell.overlay`，单文件 vanilla JS + Konva（9.x，本地 vendor，服务端路由 `/sensenova/vendor/konva.js` 供给，无 CDN 依赖）。

- [x] 视口系统：滚轮缩放（以鼠标为锚）、空格/中键平移、缩放百分比控件、F/⛶ 适应画面
- [x] 图片节点：拖拽移动、Konva Transformer 框选缩放（done 图）、shift 点击多选、框选、对齐吸附（待 Phase 1 打磨，基础 drag 落位已通）
- [x] 文档模型：`{v, camera:{x,y,scale}, nodes[]}`；节点 = `{id, type:'image', src, x, y, w, h, prompt, params, parentId, status: done|pending|error}`；parentId 派生边已绘制（源图右→结果左）
- [x] 轻量 store：vanilla 观察者 + undo/redo 快照栈（cap 60）；`activeEngine` 钩子让 store.emit 驱动 Konva 重绘
- [x] 持久化：画布文档走 `GET/PUT /api/sensenova/canvas`（整文档 JSON、原子写 tmp+rename、8MB 上限、防抖 700ms 自动保存）；图片文件落 `~/.dsh/storages/sensenova-images/<id><ext>`，服务路由 `GET /api/sensenova/image/<id><ext>`（id 白名单正则防路径穿越，immutable 长缓存）。**偏差说明**：deck 同款 JSON 文件方案（原子写）替代了原计划的 sqlite storage domain——零新依赖、零 profile 风险，与参考插件 dsh-deck 一致；sqlite 迁移降级为远期卫生项
- [x] 生成中占位节点：幽灵节点（虚线框 + prompt 摘要）→ 完成原位替换；失败节点保留 prompt/params，右键重试
- [x] 右键菜单 + 快捷键：Del 删除、Ctrl+D 复制、Ctrl+Z/Y 撤销重做、Esc 取消选择、F 适应；菜单项：重试（错误节点）/新标签打开/下载/复制/删除/适应画面/清空画布
- [x] generate 路由默认 `persist:true`：结果落盘并自动入历史（base64 不再进 JSON）；`persist:false` 保留旧行为
- [x] 右侧面板：生成（prompt/尺寸 datalist/张数 1·2·4）+ 历史（点击放回画布、单条删除）

**验收记录（2026-09-17，dsh 0.1.5-rc.1 真机 + 真实 SenseNova key）**：curl 路由全绿（status/canvas PUT-GET 回环/konva 200/图片 200·404·400 防穿越）；浏览器实测：侧栏生图按钮 → 工作台渲染 → 幽灵节点 → 46s 出图原位替换（4.5MB PNG 落盘）→ 点选 Transformer → 历史面板含该条目；自动保存"✓ 已保存"两次触发。

### Phase 1 — 无限画布标配交互（约 3-5 天，抄 InvokeAI 交互 + codex-canvas 落位规则）✅ 主体完成（2026-09-17，真机验证）
- [x] **浮动操作条**（选中单图时跟随，视口联动、近顶自动翻到下方）：🔀 变体 / ✨ 增强（新路由 `/api/sensenova/enhance`，U1.5 chat 清晰化，结果同样落盘）/ 🖌 重绘 / ⬛ 扩图 / ⬇ 下载 / 🗑 删除。"在会话中打开"留到 Phase 2
- [x] **悬浮 prompt bar**（画布顶部常驻）：无选中 = 文生图；选中 done 图 = "✏️ 编辑选中图"（自动 i2i：图作 reference，尺寸按源图比例自选），Enter 生成落其右侧挂派生边。右侧面板同样逻辑（选中即 i2i）
- [x] **拖入即参考 + Ctrl+V 粘贴**：外部图片拖进画布/剪贴板粘贴 → 成节点（落点=投放位置/视口中心）。注意 dataURL 会进画布文档（8MB 上限内可用）
- [x] **结果落位**：源图右侧 60px + parentId 派生边（源图右中 → 结果左中）——真机截图确认
- [x] **批量变体**：1/2/4 张横排铺开（Phase 0 已有，接上新 reference 管线）
- [x] **参数面板**：尺寸 datalist 预设 + 模型档（默认/u1-fast/u1.5，generate 路由支持 body.model 覆盖）
- [x] **蒙版局部重绘**：操作条进蒙版模式（十字光标覆盖层、笔刷大小滑杆、撤一笔、Esc 取消）→ 合成"原图+55% 品红标注板"+ 指令"仅修改高亮区域"发 i2i → **真机验证通过**（涂圣诞袜 → 绿色礼物盒，场景上下文保留）。蒙版笔迹不持久化（编辑态）
- [x] **扩图 outpaint**：比例弹层（1:1/3:4/4:3/16:9/9:16）→ 原图居中合成白边画布（≤2752px）+ 固定扩展指令发 i2i
- [x] 历史面板保留（点击放回画布、单条删除）；服务端 reference 支持自家文件 URL（`/api/sensenova/image/...` → 读盘转 dataURL）
- [ ] 版本组折叠/展开 UI——**降级到 Phase 3**（派生边已可视化血缘，够用）
- [ ] 对齐吸附（拖拽时 snap）——降级到打磨期
- 注：变体/增强/扩图三个入口与已验证管线完全同路（genToCanvas reference / enhance 路由 / compose 合成），未逐一真机跑；蒙版/编辑两条最复杂链路已实测通过

### Phase 2 — agent↔canvas 双向联动（dsh 特色，约 2-3 天）★差异化核心 ✅ 主体完成（2026-09-17，真机全链路验证）

**方向 A：画布 → agent（画布是 agent 的眼）**
- [x] client inject 加回 `sessions`/`conversation`，deck 同款三级降级 `askAgent()`：`conversation.sendSession(session, text, imageIds, 'queue')` → `session.prompt([{type:'text',text}], 'queue')`；无当前会话时自动 create+open
- [x] 操作条"🤖 问"：选中图 fetch→File→`createDraftImages` 附图 + `canvasContextText()` 自动携带结构化上下文（选中图来源 prompt + 其他节点摘要，前缀【来自生图画布】）→ 真机验证：消息+附图落会话
- [x] `systemPrompt.section`（0.1.2 web-app 同款 inline 模式）：画布协议 + **动态实时快照**（text 为函数，每次组装系统提示时读画布文档内联最近 20 节点摘要——agent 每轮自带画布感知，不用先调工具）

**方向 B：agent → 画布（画布是 agent 的手）**
- [x] SSE 路由 `/api/sensenova/events`（exact 路由在 token 栅栏外）：hello 问候 + 重放最近 10 条 + 25s 心跳；`emitCanvasEvent()` 广播
- [x] `sensenova_generate_image` 工具：结果落盘后**服务端直接 append 进画布文档**（`💬` 前缀 + fromChat 标记，关着画布也不丢）+ SSE `canvas:update` 通知打开中的画布重载 → 真机验证：聊天里让 agent 画"月球橘猫"，agent 自己扩写了 prompt，图自动落画布第 4 格，打开中的画布实时刷新
- [x] `tool.call.toolview` 注册 `key:'sensenova_generate_image'`：聊天内工具调用渲染缩略图卡片（运行态"🎨 生成中…" / 完成态缩略图+prompt+📌插入画布按钮→`POST /api/sensenova/canvas/nodes`）→ 真机验证通过
- [x] 新工具 `sensenova_canvas_get_state`（读画布节点清单）/ `sensenova_canvas_place_image`（摆图：本地路径/URL/dataURL 均可，自动落盘+自动排版+SSE 推送）；配套 `POST /api/sensenova/canvas/nodes` 路由（toolview 按钮与工具共用；persistImage 新增 kind:'path' 支持本地路径）

**方向 C：闭环**
- [x] 聊天工具卡片"📌 插入画布"（反向落图的一部分）
- [x] 画布选中图带上下文发会话（🤖 问即此）
- [ ] 聊天内任意图片消息 → "送到画布"按钮（需 `conversation.chat.node`/`conversation.message.images` slot，二期）
- [ ] 会话级画布 tab（`conversation.view`）——评估后缓行，全局画布+文档共享已够

**架构说明**：agent 生图落画布走"服务端写文档 + SSE 通知刷新"而非客户端收图事件——画布关着也不丢图，打开即见。

### Phase 3 — 差异化功能（按需排期）
- [ ] **标注即编辑**：在图上画箭头/圈选/加文字 → 整张标注板 + 指令发 i2i（codex-canvas 已验证的机制，海报改字场景强需求）
- [ ] **风格/品牌套件**：参考图槽位（多图各占槽）+ 风格预设组（kool 海报场景：存一组参考+prompt 模板，一键出系列图）
- [ ] **实时低清快档**：低分辨率快速迭代构图，满意后一键满分辨率重生成（Krea Realtime 模式，用 u1-fast 低 size 实现）
- [ ] 图层拆分（背景/主体/文字分层重生成、PSD 导出）——大工程，放最后
- [ ] prompt 模板库 / 工作流模板分享（LiblibAI 生态位，远期）

### Phase 4 — 打磨
- [ ] **依赖 pin 升级到 0.1.5 线**：`@deepseek-ai/dsh-tools` 0.1.1-rc.2 → **0.1.5-rc.2**（npm 已发布、与实装 bundle 同版；版本线 0.1.4 被跳过，官方在 0.1.5-alpha 直接迭代）。升级前按 FOR-OTHER-SESSIONS 的扫描法重扫 dsh-tools lib 的运行时 `@deepseek-ai/*` import（旧清单 dsh-llm/dsh-session/dsh-scope/dsh-timeout 需复核）。注：当前 0.1.1-rc.2 pin 在 0.1.5 实测可加载（dump-config 通过），此升级是卫生项不是阻塞项
- [ ] 设置卡片完善（settings.section 已注册，补表单校验 + "测试连接"按钮）
- [ ] 版本兼容 fence（dshmarket 守卫模式）：inject 服务缺失时优雅降级，绝不让 profile 起不来（FOR-OTHER-SESSIONS 血泪教训）
- [ ] Konva 本地 vendor（去 unpkg CDN 依赖）
- [ ] 大画布性能：视口裁剪（只渲染可见节点）、缩略图金字塔（超 2048px 存预览版）
- [ ] README 重写 + 演示 GIF

---

## 四、联动机制总结（"无限的可能"到底指什么）

四种协议全部落地后，dsh 生图工作台和市面孤立工作台的本质区别：

1. **选中态共享**：画布选中对象（图/位置/源prompt/版本关系）序列化进聊天上下文 → 支持自然语言指代（"左边这张""刚才那版的变体"）
2. **工具调用驱动画布**：agent 的生图/编辑工具执行结果经 SSE 实时落画布，聊天和画布是同一份工作的两个视图（tldraw agent-template 的 parts+actions 架构，自研 MIT 实现）
3. **画布事件喂回 agent**：拖入素材、标注完成、选中变化都可作为上下文推给 agent → agent 变成画布的 copilot 而非外部工具
4. **结果落画布 + 版本树**：每次生成都是可继续指代、可继续派生的节点，"聊一句改一版"的迭代历史完整可视

由此长出的玩法：批量出海报系列（agent 规划排版直接铺画布）、聊天改图（选中→说话→落回原位）、agent 视觉审稿（读画布状态给意见）、故事板/漫画分镜工作流（逐帧生成+版本管理）、品牌资产一键系列化（风格套件+agent 排产）。

---

## 五、风险与对策

| 风险 | 对策 |
|------|------|
| dsh 版本升级破坏插件（0.1.1→0.1.2 已踩过） | 所有 inject 走优雅降级边界；客户端 slot 注册前判存在；pin 版本继续记录在 FOR-OTHER-SESSIONS.md。**现状**：0.1.5-rc.1 实装、旧 pin 实测可加载、计划 API 已逐项对新版 bundle 核实（见第二节），风险已显著低于 0.1.2 时期；本地 workspace 仓库落后于实装版，API 存疑时直接读安装目录 bundle |
| 第三方插件无官方推送通道 | 自建 SSE 路由（webServer 明确允许长连接）；画布未打开时事件缓存最近 N 条补发 |
| SenseNova 20-60s 延迟卡体验 | 幽灵节点+乐观 UI；批量变体并发控制（2 路并行）；实时档用低分辨率 |
| 大量图片内存/存储 | 图片落盘文件+URL 引用（不存 base64）；视口裁剪；缩略图金字塔 |
| Konva 无框架维护成本 | 文档模型与渲染分离（store 单一事实源），Konva 只做渲染层，将来换 PixiJS 不动模型 |
