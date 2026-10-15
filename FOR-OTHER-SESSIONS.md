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

## v10.5：侧边栏宽度自适应全量修复（2026-10-12，用户："侧边栏宽度拉伸之后各个宽度的适配没做"）

方法：Playwright 起真 Chromium，把 `.snx-pro` 宽度逐档设为 280→960（14 档）× 6 视图，程序化收集「自身 overflow 可见且 scrollWidth 超宽」+「矩形出界」两类**真实**破版（overflow:hidden 的设计性截断如生成按钮扫光 ::after、hero 数字 ellipsis 不算），首扫 44 个组合报警，定位后修复，复扫 **0**。再用右侧 dock 真实拖拽手柄（col-resize）340→500→900→299 四档复查，全部干净。Konva 画布早有 ResizeObserver 跟随（2505 行），无需改。

四个真根因（都是恒定溢出，与容器宽度无关，宽窄全坏）：
1. **参考图 CTA 行**：空状态两个按钮都 `width:100%` 塞一条不换行 flex 行，label 还 inline `flex:'none'` 拒绝收缩 → 内容钉在 min-content 总和，恒定 +52px；窄档「上传图片改图」直接出界被裁。修：JSX 换 `.snx-gen-refcta` 类（wrap + `flex:1 1 140px`）。
2. **`.snx-gal-q` 搜索框**：全项目无全局 border-box 复位，它 content-box + `width:100%` + padding 18 + border 2 = 恒定 +8。修：补 `box-sizing:border-box`。
3. **`.snx-pbar` 画布悬浮提示条**：`left:50%` 居中 + `max-width:72%` 但 input `min-width:240px` → 280-520px 全溢出（最宽 +183，input 出界 103px）。修：改 `left:12px;right:12px` 流式锚定 + input `flex:1;min-width:0`。
4. **设置页 API Key 行**：input inline `flex:1` 但 min-width:auto 钉在 min-content，+ 隐藏按钮 66px → 280px 档 +9。修：input 加 `minWidth:0`。

宽档观感顺带升级（拉伸变宽不再稀疏）：`.snx-gal-grid` 2 固定列 → `auto-fill minmax(132px,1fr)`；gen-thumbs 4 列 → minmax(88)；队列 summary 4 列 → minmax(96)；对比画廊池 8 列 → minmax(44)；参考选择器 4 列 → minmax(64)；帮助弹窗 2 列 → auto-fit minmax(210)。≤379 断点里对应的列数覆盖删除（auto-fill 自治）。`.snx-cmp-picks` 保持 `repeat(4,1fr)`——它是语义上的固定 A/B/2 槽位，不是缩略图池。

**坑**：探测脚本要区分 overflow:hidden 的 scrollWidth 虚报（扫光动画/ellipsis 都会报）；拖拽手柄拖完会换位置，连拖多档必须每档重新取手柄坐标（stale box 让第 2-4 拖全空）。测试实例：用户实例别杀（5181 有活连接），另起 `dsh web --no-open --port 5183`；client-v4.js 是硬链接，页面重载即生效，无需重启实例。

## v11：全面优化五连（2026-10-13 ~ 10-14，五批工作流交付）

> 本章由文档同步会话据五批改动报告写成，关键事实已做静态复核（命令与结果见「怎么验证的」）。完整修复清单与 InvokeAI 对齐点见 `DESIGN-SPEC-v10.md` 文末「v11 全面优化附录」。

### 做了什么（主体 client/client-v4.js，服务端仅一处；全部为静态交付，未做浏览器验收）

- **P0 四件**：断链 CSS 变量正名（`--snx-ac`/`--snx-acf`→`--snx-accent(-fill)`，残留 0）；无 src 节点全链路防御（画廊完成/生成中/失败分层渲染+计数栏、灯箱降级、doExport 守卫）；灯箱缩放重做（适应窗口基准×scale 直写布局宽高、overflow:auto 生效、滚轮光标锚点缩放、拖拽平移、双击/0 复位、换图自动复位）；模块级模态栈（modalPush/modalPop/modalTop/modalOpen，灯箱/帮助入栈，画布按键让路）。
- **画廊 InvokeAI 化**：点击语义分层（单击轻选中/Ctrl 多选/Shift 可见序范围选/双击灯箱，galSel 与画布 sel 解耦）、底部批量条（移画板/删除/清空）、缩略图 hover 轻操作、右键菜单单选/多选两套、拖图到画板 chip 归类（最小诚实版：无插入位置预览/无自动滚边/无触屏长按）。
- **服务端唯一改动**：`src/index.ts` 新增 `POST /api/sensenova/upload`（P1-2 重试链路参考图持久化，复用 persistImage），已 `npm run build`，dist/index.js 已含该路由。
- **P1/P2 其余（摘要）**：SnxConfirm 替换全部 7 处原生 confirm（带被引用警告、可撤销）；灯箱回填热键 R/P/S/D；比例芯片 5 档对齐已验证尺寸线；风格芯片单选互斥；增强入队列状态机；队列清除已失败/重跑跳过主动取消项/耗时按 `_startedAt`；SSE 选中保留+undo 基线重建；undo 全覆盖（不透明度 800ms pushUndoMerge 合并）；Konva pending 占位简化+真实耗时 ETA；GenBar 参数同步；对比独立集合+池 60；图层面板 focusNode+徽章中文化；滤镜预览 rAF 节流降采样+导出原分辨率；SnxSelect 重写（portal+全键盘+typeahead）；设置页模型/画质直写 genPrefs；帮助浮层重写（页脚 v11）；UI 字形清零（ICONS 补 12 个 lucide path，顺带修了变体按钮缺图渲染空 SVG 的存量 bug）；Key 状态三态；生成按钮 idle 扫光移除；toast 队列化（4 条/5s）；灯箱标签+画廊标签筛选（被删空自动失效）；提示词库缓存收敛；工具卡插入三态；全局 :focus-visible；画布 Ctrl+A/方向键/z 序；蒙版工具条收口共享 renderMaskBar()；GenRecent 右键回归双击；命名预设独立入口；base64 dataURL>2MB 不入文档（P2-9）。

### 怎么验证的（全部是静态检查，无浏览器）

- 构建员五批自检：node --check 每轮通过；`npm run build` 成功且 dist 含 upload 路由；自写对账脚本（落盘后运行）：原生 confirm/prompt 0 处、362 个 className 字面量全有 CSS、32 个 var() 引用全有定义或 fallback；指定字形 grep=0；ic() 与 ICONS 对账无缺失。
- 文档会话复核（2026-10-14）：`node --check client/client-v4.js` → SYNTAX-OK；`grep -c -- "--snx-ac\b\|--snx-acf\b"` → 0（--snx-accent 185 处）；grep confirm(/prompt( 全文仅剩 `session.prompt`（dsh 会话 API，非弹窗，client-v4.js:259）；upload 路由在 src/index.ts:562 且 dist 已含；帮助页脚「v11」在 client-v4.js:6367；SIZE_CHIPS 五档 client-v4.js:5699；对比池 slice(0,60) client-v4.js:5054；「清除已失败」client-v4.js:4964。
- **浏览器渲染/交互验收未执行**（纪律归验收员）。验收注意：client-v4.js 改后浏览器要关 tab 重开；dist/index.js 已是最新（含 upload 路由），若 profile 装法不是 hardlink 需重新构建/同步。

### 坑 / 注意（给下一个会话）

- `.snx-pro` 是 container-type，会收编 fixed 后代——蒙版画笔预览圈坐标按该包含块换算；portal 弹层（GalContextMenu/SnxSelect/SnxConfirm）一律 portalToBody 挂 body，外点关闭要同时排除触发钮与弹层。
- 灯箱缩放不要改回 `transform:scale` 或 flex 居中：现在是「适应窗口基准×scale」直写 imgwrap 布局宽高 + `.snx-lb-stage` margin:auto 居中让 overflow:auto 生效（flex 居中会裁左上，老 bug）。
- SSE canvas:update 现在保留仍存在的选中项并重建 undo 基线（undoStack=[当前快照]、redoStack 清空）——别在别处再叠基线逻辑。
- `params.upscale` 不再写入；PendingOverlay 对旧数据仍留兼容分支（client-v4.js:3191-3192）。重绘增强请求分辨率走 sizeForAspect 已验证档（≤2752）。
- P2-9：base64 dataURL 超过 `SNX_MAX_INLINE_DATAURL=2MB`（client-v4.js:2313）不入文档，节点转 error 可重试；阈值是参照服务端 8MB 文档上限自定的，要调只改这一处。toast 上限 4 条/自动关 5s 同为合理默认（ask 未指定数值）。
- 💬 写侧已停用，读侧 `replace(/^💬\s*/,'')` 是旧存量文档数据兼容，别当残留清理；⌘/← 是真实键名标注（kbd/title）；代码注释里的 → 有意保留（不属 UI）。
- **旧 error 节点的参考图不可恢复**（当时已被 keepShortRef 丢弃），这些节点重试仍是文生图——是数据不可逆，不是回归，别误报。
- 手动连线编辑（改 parentId 的锚点把手/拖拽命中/悬停态/成环防护/undo）评估后缓办：parentId 同时是版本树与衍生链根链路，做之前先立专项。
- isStarred（client-v4.js:2909）改派生后零引用，刻意保留；要清就单独一批。
- 全屏属性面板「删除」与画布 ActionBar「删除」直接删但有 pushUndo，不在 7 处原生 confirm 清单内，按改动最小化未加确认。
- 本轮改动未 commit（工作区 client-v4.js、src/index.ts 处于 modified）；~/.dsh/storages 实况文件未触碰。

## v11.1：手动连线编辑 + 相机补偿(2026-10-14,用户:"务必打磨到精品级")

补上 v11 唯一 deferred 的功能缺口(P2-7 手动连线):
- **边可交互**:edgeLayer 开 listening,线 hitStrokeWidth 加宽热区;hover 高亮(变粗变亮)/左键选中子节点/右键出菜单「断开连线」「选中子节点」。画布菜单本体补入模态栈(P0-4 栈注册)。
- **端口拖拽改接**:每个 done 图节点右缘输出端口(拖出即改接目标 parentId)+左缘输入口(视觉)。拖拽中 fxLayer 画虚线贝塞尔+候选节点高亮框(合法=accent/成环=红),松手 drop,Esc 取消。防环:reachesUp 沿 parentId 向上探;undo 全程入栈。
- **关键坑:Konva hitStrokeWidth/radius 是世界坐标**——相机 scale 0.3 时 14px 热区只剩 4.2 屏幕像素,低倍率下连线点不中、端口缩没。修复:全部按 `×(1/cam().scale)` 补偿并 clamp,滚轮缩放后 drawEdges() 重画。**教训:任何 Konva 交互件的尺寸都要想一句"这个数字是世界还是屏幕"。**
- 顺手修存量缺口:节点 dragmove/transformend 现在实时重画边(此前边只在 renderAll 刷新,拖动中甩在原地)。
- 引擎通知走 `opts.onNotify` 桥(Workbench 的 notify 不在 createEngine 作用域)。
- 验证:linktest.js 真浏览器 5/5(右键菜单/断开/undo 恢复/端口改接/防环拒绝);full 静态门禁 0 违规。测试注意:底部 dock 画布只有 72px 高,边多半在可视区外——用左侧栏 snx-sidebtn 打开(右侧 dock 全高)再测;全屏画布 snx-fs 只铺满面板内部,不是视口。

## v11.2：双代理复审 22 条修复(2026-10-14,用户:"打磨到精品级,UI skill 用起来")

两个只读复审(InvokeAI 增量对标 + 敌意代码审查)交出 25 条发现,主代理逐条裁决(驳回 2 条误报:菜单 fixed 被 container-type 收编在 Chromium 实测不成立——但 portal 化仍做,防 Firefox;热区无补偿是旧快照),合并成 REVIEW-v11.2.md 交实现代理批量修复。要点:
- **模态栈 Esc 分发器**(capture 阶段,栈顶 onEsc 独占消费)——修 Esc 一键多消费;全屏画布以 **soft 条目**入栈(只消费 Esc 不算模态,`modalOpen()=some(!soft)`),否则全屏态画布快捷键全灭。坑:**分发器会吃掉 SnxSelect 自有 Esc**(下拉收不起反关整模态),分发器里 `if (document.querySelector('.snx-sel-pop')) return` 让路。
- linkDrag window 级兜底(mouseup/pointercancel/blur)+ 外松手不再悬挂误改接;暂停期取消不再被复活;粘贴/拖入走 inline 上限;SnxConfirm 焦点安全(初始焦点=取消);画布双击=灯箱;灯箱快捷键 isTyping 设防;清空画布走确认;ContextMenu portal 化+全屏去重;GalContextMenu 隐形活模态自愈;端口抬到 portLayer(不再被自家图压半边);队列/版本树徽章中文;连线编辑进帮助与快捷键表;对比角标 A/B/C/D;暂停入队有告知;bsb 预览缩放改布局尺寸;混合模式中文;方向键 undo 合并;锁定节点不可 Del;undo/emit/boards 零星补全。
- **测试坑两连**:①JS `.click()` 不走焦点链,焦点留在壳输入框 → isTyping 吞掉全部画布快捷键——测快捷键必须 page.mouse.click 真实坐标;②E2E 按固定分数坐标点画布节点,相机被其他测试会话 autosave 改过后全点空——按节点几何+实时相机算坐标。
- 验证:full 门禁 0 违规;linktest 5/5;E2E 13/13;专项 3/3(portal 菜单在视口/Esc 关菜单/全屏 soft 模态键活)。deferred:对比模式循环/交换按钮、画廊拖拽自动滚边。

## v12:超级好用轮——审计 4 断裂修复 + InvokeAI 差距落地(2026-10-14 ~ 10-15,四批次工作流交付)

> 本章由文档同步会话据四批改动报告写成,关键事实已在本轮做静态复核(命令与结果见「怎么验证的」)。规格见 `SPEC-v12.md`,原型 `design/snx-v12-prototype.html`。**全部为静态交付:浏览器/E2E 未跑(工作纪律禁止启动浏览器,验收归验收员);四批改动全部在工作树未 commit(`git status` = ` M client/client-v4.js`,HEAD=56b3e93)。** 只改了 client/client-v4.js,服务端零改动。

### 做了什么

**批次0:第三方审计 4 断裂修复**(断裂清单见 STATUS-2026-10-14.md §六)

1. **双击开灯箱**:整段 Konva dblclick/dbltap 已删,改 bindNode click/tap 内自实现检测——引擎级 `lastClick` 记 snxId+400ms 双击窗(client-v4.js:2663-2713),跨 renderAll 实例重建存活。根因:每次选中/拖拽结束 store.emit→renderAll destroyChildren 重建全部 Konva 实例(审计实测 instanceId 516→543),Konva dblclick 要求同一实例收到两次点击,永远凑不齐。
2. **ActionBar 多选区**:挂载条件原为 sel.size===1,多选时整条不渲染。现 sel>=2 渲染多选区(已选 N 张 + 6 向对齐 + 水平/垂直等距分布 + 成组/解组 + 删除,锚定选区包围盒),复用 alignSel/groupSel/ungroupSel(client-v4.js:3305-3333、2196-2320);画布条与全屏画布两处挂点条件改 (selDone||selMulti)。
3. **画布页 toast 可见**:渲染条件去掉 mode!=='canvas' 排除,删页脚回显(当初隐藏理由=页脚兜底,已失效),底部居中 bottom:56px 天然避让画布悬浮条(client-v4.js:821-823、4952)。
4. **节点右键菜单**:bindNode→onContext→setMenu 链路静态排查本通;唯一产出「空画布四项菜单」的是 stage 级兜底——机制(Konva 源码 Stage.js/Layer.js:185,225-239 实读):renderAll destroyChildren 后命中画布要等下一帧 batchDraw 才重画,空窗期 getIntersection 读到已销毁形状颜色码→螺旋外扩→null→target===stage→nodeId=null。修法:stage contextmenu 按文档几何补命中(bbox,z 序从顶到底,跳过 hidden,client-v4.js:3065-3088),真空白才出空画布菜单。

每条均附「为什么之前测试没抓到」:E2E 从未覆盖画布节点双击/多选操作条/画布页 toast/画布节点右键,画廊-only 用例全绿。

**批次1:灯箱行级回填 + 提示词历史(核实轮,0 行编辑)**——读完 AUDIT-2026-10-12.md、SPEC §3.2/§3.6、原型后逐行核对,两项任务在工作树已完整落地且与 SPEC/原型逐条对得上:

- **参数清单**:灯箱右栏 snx-lb-meta 面板 `plRows` 逐行渲染 9 类——提示词/负向词/模型/尺寸/种子/画板/创建 + 参考图(有才加行)+ 调整(有才加行),值缺失显「—」(client-v4.js:7520-7537)。可回填行(提示词/负向词/模型/尺寸/种子/参考图)行尾 corner-right-down 单键按钮,点击走 onRestoreField(client-v4.js:4714)只带单字段复用 snx:restoreParams 广播,GenForm 只覆盖到场字段 + toast「已回填X」+ 行高亮 flash(`.snx-lb-row.fl`,client-v4.js:958);无值行不出按钮(如种子行 `btn: pSeed !== null`,client-v4.js:7525);面板顶部「整套回填」主按钮(R 热键)保留,行按钮与 P/S/D 热键同链路。**有意偏差**:画板/创建/调整三行为纯信息行不出按钮——生图表单无画板字段,回填无落点(与原型中画板带 board 键的做法不同,属合理偏差)。
- **提示词历史**:lib.recents 封顶 10 条;textarea Ctrl/Cmd+↑ 进入历史逐条向旧翻、↓ 反向、越过最新退出并还原进入前文本,整套 setPrompt 替换 + toast「历史 n/N」,空历史 toast「暂无提示词历史」,composing 守卫,↓ 不在历史态不抢原生光标(client-v4.js:6440-6460);退出历史态覆盖全部入口(提交/手动编辑/回填/选库/PNG 读回/下拉点选);收藏星旁 SnxSelect 历史下拉(最近 10 条、超 42 字截断,portalToBody 防 container-type 收编,client-v4.js:6146)。

**批次2:生成按钮决策面板 + 队列行展开详情(约 +230 行)**

- **决策面板**:生成按钮包一层 `.snx-gen-gowrap`(client-v4.js:721——disabled 按钮不派发鼠标事件,hover 必须挂包裹层),hover/focus 即浮出(portal 挂 body,150ms 淡入 < 300ms);就绪态 4 行 = 将生成 N 张(:6766)/ 模型·尺寸(applyQuality 实际请求档)/ 目标 / 队列等待 M(:6773,面板展开期间从 store 现算并 subscribe 刷新——gen 模式下 Workbench 无 store 订阅,取 prop 会冻结);disabled 改列 blocker 清单(上一批生成中/提示词为空/未配置 API Key,client-v4.js:6393-6399,keyOk 由 Workbench 传入);queuePaused 时顶部红条(读模块级变量+snx:queuePaused 事件,client-v4.js:2464-2473)。
- **队列展开**:QueueItem 重构为纵向容器+.snx-qi-row 横排,行尾 chevron(aria-expanded,展开旋转,stopPropagation 不干扰 done 行开灯箱);详情含 模型/尺寸/种子(无则「随机」)/负面词前 80 字/错误全文(红框,仅 error)/耗时两段(client-v4.js:7048,CSS 1143-1149);补齐耗时基础设施——`_queuedAt` 落 5 个 pending 创建点+3 个重试点,`_endedAt` 落 runOne 三个终态+cancelJob(client-v4.js:2459-2570、3592),8 种状态组合用 node 脚本推演全部通过。

**批次3:对比三模式 + 删除安全 + 画廊拖拽自动滚动**

- **对比 2 图顶栏**:模式按钮组(滑块/并排/叠化,当前 .on 高亮,样式对齐原型 pv-seg)+ 交换按钮(arrow-left-right,A/B 内容互换、字母随图走)+ C 键热键(isTyping/modalOpen/SnxSelect 下拉在场不触发,client-v4.js:7141-7162、7154);滑块保留原 clipPath+手柄;并排 = stage 1fr 1fr 网格(揭示层转静态列,宽高比 2:1,client-v4.js:1946);叠化 = 揭示层 clipPath:'none' 且 opacity 随指针横向位置(悬停即跟随);**3-4 图 CompareGrid 按 SPEC「网格保持」原样未动**。
- **删除安全**:SnxConfirm 扩展可选 altLabel/altIcon 第三按钮(resolve 'alt',client-v4.js:3749-3781);删画板确认列出「画板内 N 张图」+ 双按钮「仅删除画板(保留图)」(中性)/「连图一起删除」(红)(client-v4.js:5231-5239),板内图被板外节点 parentId 引用时加警告行,连图删除分支同步清理画布选中/画廊多选/Shift 锚点/灯箱并 undo+put 持久化;删单图(画廊+灯箱)在 parentId 引用警告外新增「在对比选择中,删除后自动移出对比」警告行(client-v4.js:4123、4883)。
- **拖拽自动滚动**:onGalItemPointerDown 增加边缘自动滚动——指针进滚动容器 `.snx-pro-main`(画廊实际滚动元素)上下缘 40px 带内,rAF 节流按纵深比例(6→24px/帧)推进 scrollTop,离缘(下帧 dir=0 自停)或松手/pointercancel 即停(client-v4.js:4188-4247)。

### 怎么验证的(全部静态,无浏览器)

- **文档同步会话本轮复核(2026-10-15)**:`node --check client/client-v4.js` → SYNTAX-OK;`git status --short` → ` M client/client-v4.js`,HEAD=56b3e93(审计裁决合并提交),v12 四批未 commit。逐批次 grep 实锤(行号为当前工作树):dblclick/dbltap 仅存于注释(:2661/:2755)、lastClick 400ms(:2663-2713)、多选区(:3305-3333)、`mode !== 'canvas'` 全文 0 命中、stage contextmenu 几何补命中(:3065-3088)、plRows(:7520-7537)、onRestoreField(:4714)、Ctrl+↑↓(:6440-6460)、决策面板 blocker(:6393-6399)+将生成 N 张(:6766)+队列等待(:6773)、_queuedAt/_endedAt(:2459-2570/:3592)、队列展开详情(:7048)、三模式+交换+C(:7141-7162)、SnxConfirm alt(:3749-3781)、删画板双按钮(:5231-5239)、对比删除警告(:4123/:4883)、边缘自动滚动(:4188-4247)。
- **门禁复查**:原生 `confirm(` = 0;`--snx-ac\b|--snx-acf\b` 坏变量 = 0;emoji 区段扫描命中 15 处,全部是 `replace(/^💬\s*/,'')` 旧数据读侧兼容(v11 章既知例外,非 UI emoji),新增代码 0 emoji。
- **各批次自检**(据改动报告,本轮未重跑):每批修改后 node --check 全过;批次0 static-audit full 的 vars/emoji/confirms 全绿;批次2 用 node 脚本推演 8 种耗时状态组合全过、自查修掉 goRef 未挂按钮导致面板永停离屏位的 bug;批次3 核对 ICONS 可解析、新 className 全有 CSS、新 CSS var() 全带 fallback。
- **浏览器/E2E 未执行**——四批一致声明:SPEC §三全部 E2E 断言与 21 项验收归验收员。

### 坑 / 注意(给下一个会话)

- **21 项 E2E 的项号映射不存在于任何仓库文档**(全库检索只有 STATUS §六一句「扩到 21 项」与旧 13 项 E2E-xx 引用)——验收员跑完务必把项号回填进 SPEC §三各条,别靠口口相传。
- **css-orphan 存量 2 条真死样式未清**:.snx-lb-params/.snx-lb-pr(早前灯箱改版遗留,client-v4.js:919 注释已明示零引用,删除需灯箱回归一轮)→ static-audit classes 项仍会报;.wrap 误报的根因(cls:'wrap' 动态拼类)已改为布尔标记+字面量 'rv wrap'/'rv mono'(client-v4.js:7521-7523),该条应已消失。
- **决策面板「目标」行恒显示「未分组」**:genToCanvas 管线从不给新节点赋 boardId(创建节点对象无该字段),面板如实显示产品当前行为;未来生成支持指定画板时此行要同步改。
- focus 浮出仅对 enabled 按钮生效(disabled 按钮浏览器不派发焦点事件,固有限制);disabled 态走包裹层 hover 路径。
- **旧 done 节点的排队段耗时不可恢复**(ts 被完成时间覆盖),队列详情只显示「运行 Xs」——数据不可逆,不是回归,别误报。
- **C 热键未加入帮助浮层热键清单**(帮助浮层改动超出该批范围),验收时别当 bug;对比三模式/交换仅覆盖 2 图,3-4 图网格的旧「模式循环/交换按钮 deferred」注释仍属实。
- 拖拽自动滚动的滚动容器写死 `document.querySelector('.snx-pro-main')`(已核实为画廊模式唯一滚动容器),未做通用最近可滚祖先探测;画廊结构重构时要同步。
- 决策面板 queuePaused 走模块级变量+`snx:queuePaused` 事件(client-v4.js:2464-2473)——别改这个通知通道的名字。

## v12:超级好用轮(2026-10-15,批次0 断裂修复+三批心脏路径,工作流 dwfrun-8bd80851)

按 SPEC-v12.md 验收标准+原型 design/snx-v12-prototype.html 实现,四批全落地:
- **批次0(第三方审计 4 条真机断裂)**:双击灯箱改自实现检测(同节点 400ms 两击,跨 Konva 实例重建有效);ActionBar 挂载 sel.size>=1(多选对齐/分布/成组首次可达);画布页 toast 不再被排除;节点右键菜单 nodeId 链路修通。
- **批次1**:灯箱 meta 重构为参数清单(≥7 行,每可回填行独立按钮,行级 restoreParams;画板/创建/调整按"无落点不回填"不出按钮——与原型的有意偏差);Ctrl+↑/↓ 提示词历史+星旁历史下拉。
- **批次2**:生成按钮决策面板(hover/focus 浮出:将生成 N 张/模型/尺寸/目标画板/队列等待;disabled 列 blocker;暂停红条;disabled 不派发鼠标事件故按钮外包 .snx-gen-gowrap 承接 hover);队列行展开详情(参数/错误全文/耗时两段)。
- **批次3**:对比 2 图三模式(滑块/并排/叠化)+交换按钮+C 热键;删画板双按钮(仅删板/连图删)+删图引用警告;画廊拖拽自动滚边。

**大坑(必读)**:Konva 的 `batchDraw()` 是 **requestAnimationFrame 延帧**——renderAll 后命中画布没重画,紧接着的第二次点击会命中**已销毁的旧节点**(destroy 解绑了事件)→ 点击凭空消失。修法:renderAll 末尾补 `mainLayer.drawHit()` 同步重画命中图。这解释了为什么 Playwright `mouse.dblclick`(两次点击 <16ms 同帧)打不开灯箱而人类(50-150ms)可以——**测 Konva 交互别用 mouse.dblclick,用两次 mouse.click 隔 150ms;要测极限就先补 drawHit**。

验证:主会话复核 full 门禁 0 违规(408:408 类名)、linktest 5/5、真机双击 OPEN ✓(drawHit 修复后连 mouse.dblclick 都过);工作流验收员 E2E 21/21。deferred:3-4 图网格无模式循环(2 图专属三模式)、C 热键未进帮助表、旧 done 节点排队耗时不可恢复(ts 被覆盖)。
