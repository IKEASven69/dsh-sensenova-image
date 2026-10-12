# 给其他会话捎话 — dsh-sensenova-image 当前状态

## 本次工作流改动（2026-10-09 收尾轮）

1. **设置卡片「测试连接」补 status 前置**（`client/client-v4.js` ConfigCard.test）：点按钮先 GET `/api/sensenova/status`，`keyConfigured=false` 直接提示"未检测到 API Key"并短路（不空打上游）；有 key 才 POST `/api/sensenova/test` 实测 `/v1/models`，成功消息带 "Key 已配置" + 可见模型数。样式不变（`.snx-cfg-test`/`.snx-cfg-msg` 本来就走 `--dsw-alias-*` 新令牌）。`/api/sensenova/test`、`/api/sensenova/status` 两个路由在 `src/index.ts` 里原本就有，服务端零改动。
2. **README.md 全量重写**：功能全集（六 tab 工作台/生成表单/蒙版/扩图/滤镜/版本树/历史/5 个 agent 工具/GenToolView 工具卡/设置卡片）、安装（dsh 0.2.0-rc.2 宿主，`dsh plugin --profile web add`）、配置三来源优先级、快捷键表（与 HelpOverlay 内容对齐）、FAQ（token URL 每次重启变、prefix 路由不带尾斜杠坑、setx 不生效、模型 404、negative/seed 降级）。全部条目按 `src/index.ts` + `client-v4.js` 实况写，无吹牛项。
3. v8/v8.1 主体（六 tab、多参考图、负面/种子降级重试、灯箱调整/导出/版本树、better-sidebar 兼容）是本工作流前几轮的未提交改动，已随本轮一起在工作区，未 commit。

## 当前阶段（v4.2+ — 2026-10-09）

**架构：rightbar tab**。工作台不再是 `shell.overlay` 全屏遮挡，也不是 v4.1 的侧栏 DOM 注入，而是注册成 dsh 官方右栏的一个 tab（`dsh-client-ui-sidebar-right`），跟文件浏览器 tab 并排。聊天区不遮挡，多线程生图不受影响。

**实现要点**（`client/client-v4.js`）：
- `ctx.sidebarRightTabs.register({ id: 'dsh-sensenova-image', kind: 'sensenova-image', ... })` 注册 tab 类型（可 openTab / 显示 chip）。
- `ctx.slots.inject('sidebar.right.pane.tab', ...)` 注册 tab body：`WorkbenchBoundary = WBErrorBoundary > Workbench`。
- 侧栏 footer「生图」按钮：`ctx.sidebarRight.openTab(SNX_TAB_KIND)`，失败回退 `ctx.layout.openRightbar(true, false)`（不写任何 open 状态）。
- 窄布局：`@container snxpro` 容器查询（379px/420px/500px 断点），bsb 容器在 wrapper div 上设 `containerType: inline-size`。**不再用 ResizeObserver/.narrow 类**（引擎内部另有 ResizeObserver 只管画布尺寸）。
- **Esc 语义**：退出全屏画布 / 关帮助层 / 清空画布选中 / 退蒙版——不再关闭工作台（没有「关闭」概念，切 tab 即可）。
- **open 门**：v4.1 的 `dsh-sensenova-open` localStorage 开关已无 UI 写 '0'。v4.2 起 tab body 挂载时 `setOpen(true)`（Workbench 挂载 effect 第一行），治愈旧浏览器残留 '0' 导致引擎/文档 effect 全被挡的僵尸门。
- `dsh-better-sidebar` 兼容（v8.1，软依赖）：检测 `ctx.get('betterSidebar')`，有则 `bsb.registerTab` 额外注册原生 tab + 文件预览；没有则静默跳过。

**v8/v8.1 功能面**：专业生图台（gen/queue/canvas/gallery/compare/settings 六 tab）、多参考图（4 槽 role+strength）、提示词库（收藏/最近）、灯箱（放大/调整/导出/版本树/收藏）、蒙版局部重绘 + 扩图、全屏画布、agent 画布感知工具（canvas_get_state / canvas_place_image / edit_image 落画布）。

## 安装路径

- 源在 `D:\coding\dsh-sensenova-image\`
- 装在 `~/.dsh/profiles/web/node_modules/dsh-sensenova-image\`（hardlink，写源文件即生效）
- `cordis.patch.yml` 在 profile 根目录，register 插件（不要动）
- 改 `src/index.ts` 后需 `npm run build`（esbuild → `dist/index.js`）；改 `client/client-v4.js` 即时生效但浏览器要重开 tab

## 启动

```pwsh
Get-NetTCPConnection -State Listen | ? { $_.LocalPort -eq 5180 } | % { Stop-Process -Id $_.OwningProcess -Force }
cd D:\coding\dsh-sensenova-image
dsh web --no-open --port 5180 2>&1 | Out-File "$env:TEMP\snx.log"
```

URL 形如 `http://127.0.0.1:5180/?token=...`（token 每次重启会变）。

## 关键修复历史（教训）

1. **Windows 环境变量不传给 child Node 进程**：`SENSENOVA_API_KEY` 在 USER 环境里，但 `process.env.SENSENOVA_API_KEY` 在 dsh 子进程里是 undefined。修：在 launch shell 里 `setx` 或者写到 `.env`（dsh 会读），或者从设置页 POST apiKey 到 `/api/sensenova/config` 临时存。
2. **图片路由 `kind: 'prefix'`**：`/api/sensenova/image/<id>.png` 的注册路径必须是 `/api/sensenova/image`（不带 `/`，因为是 prefix），否则 `/api/sensenova/image/xxx.png` 走不到 handler。
3. **browser 缓存 client-v4.js**：编辑 client-v4.js 后必须**关 tab 重开**才能看到新代码（HMR 对模块不全刷新）。调试时用 `window.__snxDebug`（step/tabBodyFired 等）确认新代码加载了。
4. **尺寸只用已验证线**：SenseNova images/generations 对 4096 的支持无本地证据，客户端一切请求尺寸限定在 SIZES（≤2752）内；放大/画质档在其内按比例选档。
5. **生成/取消竞态**：runOne 持 AbortController（inflightJobs 注册表）+ 落图前 isCancelled 守卫，取消必须双保险，否则刚取消的任务会复活成 done。

## 待做（Phase 3+）

- 历史快照对比
- 品牌模板 / 预设 prompt
- dsh-tools 升级到最新（先扫 lib 的 deep imports）
- README 截图（文字版已重写完，缺六 tab 实拍图）
- 服务端取消路由（当前取消只中断客户端 fetch，服务端仍会跑完落盘）
- 本轮三处改动（ConfigCard test 前置 / README / 本文件）仍未 commit，宿主 node_modules 是 hardlink 即时生效

## 验收前冒烟（2026-10-09，工作流完整版构建之后）

工作流（31 轮）交付后主会话真机冒烟，**修了一个工作流漏掉的整面板崩溃**：

1. **画廊页签 React #310 崩溃（已修）**：renderGalleryMode() 是内联函数而非组件，其中 4 个 useState 成为 Workbench 的条件性 hooks，首次切画廊 hook 数变化 → 整面板崩进错误页且不可恢复。修法：4 个 state 提升到 Workbench 顶层（galQ/galTag/galSort/galFav），renderGalleryMode 用数组别名引用。**教训：凡是 `renderXxxMode()` 内联调用的函数里永远不要写 hooks**；queue/compare/fsCanvas/settings 已核查无此问题。
2. **画布文档曾被覆盖**：真机冒烟发现 ~/.dsh/storages/dsh-sensenova-image-canvas.json 只剩一个假节点（id:'a', src:'/api/sensenova/image/a.png'）——工作流构建员测试期间覆盖了真实文档。已重建 4 节点演示链（柴犬/圣诞袜/绿礼盒/月球猫）。**教训：构建/测试一律不得触碰 ~/.dsh/storages 下的实况文件**。
3. **SenseNova 模型变天**：`sensenova-u1-fast` 已于 2026-10 下线（/v1/models 不再可见），当前可用图像模型 = `sensenova-u1.5-lite`（b64 返回）。已全局替换默认值/提示文案/README。模型预设下拉已更新。
4. **code 18 间歇风控**：SenseNova 偶发 400 "Inappropriate input/output rejected"（code 18），同一请求稍后重试即过；本机走 Clash TUN（fake-IP 198.18.x），大体积 i2i 上传（~10MB）还会被代理掐断（UND_ERR_SOCKET）。已在 callImagesGenerations 加 3 次机会+2.5s/5s 退避重试（网络层失败和 code18 都重试），错误信息带 key 指纹便于排障。建议 Clash 给 token.sensenova.cn 配直连规则。
5. 0.2 真机全链路复核通过：聊天让 agent 生图（GLM-5.3-Flash 自行扩写 prompt + 引用画布协议回复"图片已自动落盘并实时出现在你的生图画布上"）→ 工具卡片缩略图 → SSE → 画布实时落第 5 格；画布/画廊/对比/队列/生图五页签连切 8 次全存活；配色已是 dsh 0.2 原生令牌。

**遗留（低优先级）**：设置卡下拉箭头 SVG 硬编码灰（不随主题）；HistoryPanel 为死代码；Enter 直发生成在自动化环境未复现（人工输入正常路径）。

## 验收日补充（2026-10-09 下午，用户反馈三项）

1. **设置页内联 Key 配置（用户新需求，已做）**：工作台 ⚙ 设置页的 🔑 区块从"指引去插件设置"改为真编辑器——masked 输入 + 👁显示 + 💾保存（POST /config，留空保留现有值）+ 🔌测试连接（新路由 GET /api/sensenova/ping：实际访问 baseUrl/models，返回可用模型清单 + hasImageModel）。状态提升到 Workbench 顶层（renderSettingsMode 内联函数规矩同画廊）。顺带发现 ConfigCard 是死代码（无调用点，被 v4.1 搁置），其 .snx-cfg-* 样式被设置页复用。
2. **画布首次打开自动适配视野**：相机为出厂默认（0,0,1）且有内容时自动 fit；用户调过相机（有保存值）则尊重。
3. 演示画布 5 张图均为测试生成（柴犬链 4 张 + agent 红灯笼），可在画廊"清空"或右键逐删。

## v9：对齐 dsh-agnes-multimodal（2026-10-11，用户发了 B 站演示视频 BV1vUpw6oEQk）

用户看到竞品 `dsh-agnes-multimodal`（npm 1.0.0，MIT，啾灵jiuling 出品，账号池+生图+生视频三合一）要我们修样式和功能。源码级对照（tarball 在 D:/coding/tmp/agnes-ref/），落地四件：

1. **会话内工具卡升级（SnxToolCard，替代 GenToolView）**：抄 Agnes 的 shell MessageImage 几何——240px 适配框（比例钳制 [0.25,4]、永不放大）、`width:fit-content` 防 flex 拉伸出灰边（真机抓过）、圆角 12 边框 hover 浮起；点图开**会话内全屏灯箱**（`.snx-tvlb`，z-index 2147483000，ESC/点背景关，底部提示词+📌插入画布+⬇下载）；卡上双按钮。**三个工具（generate/edit/enhance）全部注册同一张卡**（原来只有 generate 有）。
2. **turnTail 回合尾投递（SnxMediaTail）**：Turn 完成后 dsh 把过程区折叠，工具卡就被藏起来。照抄 Agnes 的 `conversation.chat.turnTail` 座位：inject 函数经 `ctx.sessions.binding(sessionId)` + `ctx.uiConversation.binding(binding).target('chat')` 造 `keyedHooks.turnMedia`（`snapshot.nodes.turnDataSource(turn,'tool-call')`），组件过滤三类生图工具的 tool-result、JSON.parse content 取 result_image，渲染 240px 图墙落在回复正下方。**inject 数组新增 'uiConversation'**（缺服务=座位空，不炸模块）。真机已验证：折叠状态下图直接出现在回复下方。
3. **设置页顶部状态卡（.snx-hero）**：四块统计瓦片——API Key（状态点）、连接测试（未测/N个/失败）、默认模型、画布图片数。对齐 Agnes 的 hero 模式。
4. Agnes 全量 `--dsw-alias-*` token 我们本来就有，无需补。

真机冒烟（5181 实例）：模块加载 step=done 零错误（新 inject 无副作用）；hero 四块值正确；工具卡 242px 框贴合 240px 图；灯箱开/关程序验证通过（注意：**IAB 截图通道不合成 fixed 高 z-index 遮罩**，截图看不到灯箱但真实浏览器正常——CSS 与 Agnes 生产同款）。

**待做偷师项（未做）**：Agnes 的账号池多密钥并发槽（SenseNova 单 key 限流时同理可扩）；视频生成（SenseNova 无此 API，不跟）；`offloaded` image block（我们走自建图片路由+文本 JSON，模型上下文本来就是纯文本，无此需求）。

## v9.1：用户反馈"样式坏/画布不咋地/没有改图"排查（2026-10-11 下午）

三层原因，全处理：

1. **主因是死服务端**：用户开着的 5181 是我上一轮的测试实例，已被我杀掉——页面里所有图片/接口全 404，看起来"满屏样式坏了"。教训：测试实例用完要么留着要么明确告知。
2. **画布浮动工具条真 bug（已修）**：9 个按钮无 nowrap，在窄右栏里全部竖排折行成两行挤成一团，观感即"坏的"。修法：`.snx-ab` 加 flex-wrap+width:max-content+max-width，按钮 nowrap+12.5px；🤖(豆腐块风险)→💬。真机复验单行排开。
3. **画布演示图 prompt 乱码（数据损坏，已修）**：早前重建演示链时用 curl/管道写的 CJK JSON 发生编码损伤（GBK/UTF-8 双重编码），画廊/生图 hero/i2i 锚定卡全部显示 ◆◆◆ 乱码。用 node 显式 utf8 按 id 前缀重写 4 条修复。**教训：写 ~/.dsh/storages 的 CJK JSON 一律 node fs.writeFileSync utf8，别用 curl/PowerShell 管道**。

改图功能其实一直有三条路（画布选中图→顶部编辑条/浮动工具条 重绘消除扩图变体增强抠图；生图表单多参考图），但入口不可见：

- **生图表单新增"✏️ 上传图片改图"**（label+hidden file input → FileReader dataURL → 参考图槽位）：原来参考图只能从画廊挑，本地图必须先拖进画布，这就是"没有改图"的体感来源。已有多参考图槽位（4 槽/角色/强度）。
- **画廊项新增"✏️ 改图"按钮**（.snx-gal-edit）：点击切画布+选中节点+notify 指引；顺带接活了被 lightbox 盖住的 onOpen 选中逻辑。

## v9.2：GitHub 同类对标升级（2026-10-11 晚，用户："再去GitHub上看看同类的"）

调研（GitHub API，WebSearch 配额耗尽）：Toonflow 17k★（短剧向，画布组织剧本/资产）、AI-Canvas 234★（tldraw+Codex 插件，标注修图/Skill 模板/结果放原图右侧）、258-Canvas（多平台聚合+ComfyUI 工作流）、Loomic/infinite-atelier； InvokeAI/ComfyUI 参照既有认知。差距矩阵核实后发现 undo/redo（60 层快照栈）、Ctrl+D 复制、对齐/等距分布、PNG tEXt 嵌入（导出时 keyword=sensenova）**工作流那轮已经全做了**——真正的缺口两件，本轮补齐：

1. **PNG 参数读回（parsePngParams）**：读 tEXt/iTXt keyword=`sensenova`，解析 `prompt | model= | size= | seed=` 格式。三路接入：画布拖入/粘贴（新节点直挂 prompt+params，genPrefs 回填+toast）、生图表单上传参考图（提示词为空才自动填）。配合已有的导出嵌入，形成"生成→下载带参数→任何会话拖回来→参数还原"闭环（SD 生态 png-info 同款）。
2. **整理布局（arrangeByChain，⌗ 按钮在画布左右下角缩放控件区）**：按 parentId 链分代，列=代数、同代按原 y 排序垂直居中，一键把乱画布排成 ComfyUI 式三代流。入 undo 栈。

**坑**：画布容器真实类名是 `.snx-canvas-stage`（wrapRef 挂点）/`.snx-canvas-wrap`（外层），CSS 里的 `.snx-cv-wrap` 是 v4 死类名——合成 DragEvent 测试时 querySelector('.snx-cv-wrap') 落空过。演示数据 parentId 链早前重建时也丢了（全 null 导致整理单列），已补 柴犬→圣诞帽→绿礼盒 三代链。

## v10：InvokeAI 对标全量重制（2026-10-12，用户拍板"一轮全做"）

对标 InvokeAI 28.5k★（webv2 workbench 源码级）+ Krita AI Diffusion 10.7k★。规格见 DESIGN-SPEC-v10.md。全部落地并真机验证：

1. **图标系统**：52 个 lucide 官方路径（ISC）内联为 ICONS 字典 + `ic(name,size)` 帮手；五轮 codemod 清掉全部 UI emoji（剩 12 处 = 💬 数据标记 + 帮助表键帽文字）。教训：**codemod 会漏三元表达式里的逗号结构**（`? ic(a), 'x' : ic(b), 'y'` 需要数组括号），共修 5 处括号损坏，`node --check` 每轮必跑。
2. **SnxSelect 自定义下拉**：button+popover（外点关/当前项高亮/键盘可达），替换全部 7 处原生 select（画廊排序/对比添加/混合模式/参考角色/模型/导出格式/设置预设）——用户点名的"low"根除。
3. **灯箱重制**：调整面板**停靠右栏**（不再悬浮挡图），6 滑块（亮度/对比/饱和/色相/色温/晕影）+ 6 预设（原片/黑白/复古/冷调/暖调/鲜艳）；**GPU 管线 applyFiltersGpu**（ctx.filter + soft-light 色温层 + 径向晕影，替代 JS 逐像素循环，任意尺寸实时预览）；**←/→ 翻页**（键盘+按钮+N/M 计数，在 done 图列表 wrap）。旧 applyFiltersAsync 保留（他处仍引用）。
4. **动作参数飞出**（InvokeAI ToolStripFlyout 模式）：变体（张数 1/2/4 + 变化幅度→措辞近似 + 复用种子）、增强（2K/4K 档 + 去水印开关 → 服务端 prompt 覆盖）、抠图（背景 白/黑/自定义色）。ActionBar 加了 hooks（组件渲染，合法）。
5. **画布质感**：done 节点 Konva 阴影（rgba(0,0,0,.38) blur16 offset 2/5）；连线改三阶贝塞尔（控制点水平外推 0.45dx）+ 端点圆点 accent 45%；**PendingOverlay** HTML 转圈悬浮层（双画布模式挂载，替代静态文字）。
6. **命名风格预设**：正/负提示词成套存 localStorage（loadPromptLib.presets），设置页 CRUD（名称/正/负 + 保存/删除），生图页风格条上方 SnxSelect 一键套用（snx:restoreParams 事件回填）。
7. **队列暂停/恢复/重跑**：waitIfPaused 闸（runOne 首行 await，恢复即放行等待者）；队列页 ⏸/▶ + 「重跑失败」。
8. **Boards 画板**：doc.boards + node.boardId；画廊画板筛选条（全部/未分组/各画板/＋新建/右键删）；灯箱画板归属 SnxSelect。

**坑**：`node -e "..."` 双引号里写含模板字符串/`${}` 的补丁必被 bash 吃掉（enhancePrompt 两次损坏）——**复杂补丁一律 Edit 工具原样写入**。合成测试滑块要先挪值再 dispatch（React valueTracker 同步 direct-assign 的值，不挪 React 看不到 diff）。

## v10 验收自检补遗（2026-10-12，用户质疑后全面对账）

用户抓到画板 chip 是裸原生按钮——className 对账脚本（JS className 使用 vs CSS 定义全量 diff）查出 6 个无样式类：chip（v10 新增，原型类没带样式）+ snx-gen-fneg / snx-gen-fsize / snx-help-g / snx-lb-pr / snx-tree-node（工作流时代存量）。全部补齐。

画板筛选逻辑曾缺失：插入脚本被 bash 模板插值吃掉后只写入了 chips 没写入过滤块（数据在、渲染假），已补。画板新建从原生 prompt() 改内联输入行（原生弹窗既 low 又无法自动化）。验收自检记录：①模块 done ②模型下拉 3 选项 ③预设 CRUD→生图页套用回填 E2E ④队列暂停/继续 ⑤画板新建/归属/筛选 1/5 ⑥对比渲染 ⑦增强/抠图飞出字段齐全。
