# v10 设计规格：对标 InvokeAI / Krita AI Diffusion 的质感与参数升级

对标：InvokeAI 28.5k★（webv2 workbench 重写，今天仍在推）、Krita AI Diffusion 10.7k★。
核心结论：两家的"高级感"= ①原生描边 SVG 图标（lucide 系）+ ②参数即规格（min/max/step/default 驱动 UI）+ ③工具按钮带活动态/热键/族飞出 + ④调整停靠面板而非悬浮。我们的差距不在功能数量，在这四点的做工。

## 1. 图标系统（P0）

内联 lucide 描边路径（24 viewBox，stroke 2，currentColor），建 `ICONS` 字典 + `ic(name, size)` 帮手，全量替换 76 处 emoji（50+ 处直视）。

| 位置 | 现状 | 换成（lucide 名） |
|---|---|---|
| 品牌 | ⚡ SENSENOVA | zap |
| 页签 生图/队列/画布/画廊/对比/设置 | ✎ ⚡ 🎨 🖼 ⇄ ⚙ | wand-sparkles / list-ordered / frame / images / columns-2 / settings |
| 工具条 变体/增强/重绘/消除/抠图/扩图/问 | ✨🖌🧽🪄⬛💬 | shuffle / sparkles / brush / eraser / scissors / expand / message-circle |
| 工具条 下载/删除 | ⬇ 🗑 | download / trash-2 |
| 缩放区 − + ⛶ ⌗ | 冷僻字形 | minus / plus / maximize / grid-2x2 |
| 生图表单 多参考图/上传改图/上传/风格 | 🖼 ✏️ 📂 ✨ | image-plus / wand-sparkles / upload / sparkles |
| 生成按钮 | ⚡ 生成到画布 | wand-sparkles（主按钮纯文字+图标） |
| 灯箱 作为参考图/画布编辑/复制参数/回填参数/原始下载/导出/删除 | 🎨✏️📋⤴⬇📦🗑 | image-plus / pen-tool / clipboard-copy / arrow-up-right / download / package / trash-2 |
| 灯箱调整 应用/重置 | 💾 ↺ | check / rotate-ccw |
| 画廊 改图 | ✏️ 改图 | pen-line |
| 工具卡 插入画布/下载 | 📌 ⬇ | pin / download |
| 会话工具卡等待 | 🎨 生成中… | wand-sparkles + CSS 转圈 |
| 设置分区 Key/模型/数据/快捷键/词库 | 🔑🎨💾⌨️📚 | key-round / palette / database / keyboard / library |
| 队列空态/对比空态/画布空态 | ⚡ ⇄ 🖼 大字 | 同页签图标放大 42px 低透明度 |
| 版本树标题 | 🌳 衍生链 | git-fork（或 git-branch） |

微动效：图标按钮 hover `transform: translateY(-1px)` + 描边亮度提升（transition .15s）；active 工具键 accent 底 + accent 描边；全部 `currentColor` 跟随主题。

## 2. 调整面板扩容（P1，停靠化）

灯箱"调整"从悬浮改**停靠右栏**（InvokeAI 式）。实现从 JS 逐像素循环改为 **Canvas2D `ctx.filter`**（GPU 加速，Chromium 全支持）+ 合成层，任意尺寸实时预览不卡。

滑块规格（default / range / step）：

| 参数 | 默认 | 范围 | ctx.filter 实现 |
|---|---|---|---|
| 亮度 | 0 | -100~100 | brightness(1+v/100) |
| 对比 | 0 | -100~100 | contrast(1+v/100) |
| 饱和 | 0 | -100~100 | saturate(1+v/100) |
| 色相 | 0 | -180~180 | hue-rotate(v deg) |
| 色温 | 0 | -100~100 | 暖:soft-light 橙层 α=v%；冷:soft-light 蓝层（composite，不入 filter） |
| 晕影 | 0 | 0~100 | radial-gradient 乘法合成层 α=v% |

预设行：原片 / 黑白(grayscale1) / 复古(sepia.4+sat.85) / 冷调(temp-45) / 暖调(temp+45) / 鲜艳(sat+40+contrast10)。
应用=写回 node.filters 并落图（现有 onAdjust 管线）；重置=全零。
清晰化/锐化：本轮不做（需 Worker/WebGL 卷积，大图卡顿风险），灯箱里不出现占位。

## 3. 生成后动作参数化（P1）

| 动作 | 现状 | 升级 |
|---|---|---|
| 变体 | 硬编码 1 张 | 工具条点变体弹**族飞出**：张数 1/2/4（分段）+ 变化幅度 slider（映射 prompt 后缀强度词）+ 复用种子 switch |
| 增强 | 无参数（服务端已支持 prompt 覆盖） | 飞出：档位 2K/4K 分段 + 去水印 switch → 拼 prompt 变体 |
| 抠图 | 硬编码纯白背景 | 飞出：背景 白/黑/自定义色（prompt 模板替换） |
| 重绘/消除 | 笔刷大小/透明度已有 | 保持；消除预填指令可改（已有） |
| 扩图 | 比例弹层已有 | 保持 |

飞出模式对齐 InvokeAI ToolStripFlyout：工具条按钮旁浮层，点外关闭，参数写 genPrefs。

## 4. 画布质感（P2）

1. 图片节点：`shadowColor rgba(0,0,0,.38) shadowBlur 18 shadowOffset {2,6}` + hover 边框 accent；圆角经 Group clip（半径 8，缩放无关）。
2. 连线：直线改三阶贝塞尔（控制点水平外推 0.45*dx），stroke accent 45%，宽 1.75，端头小圆点；hover 高亮（可选）。
3. pending 节点：Konva 静态占位 + **HTML overlay 转圈**（与 ActionBar 同定位机制），完成即摘；错误态红框+重试图标。
4. 灯箱调整面板停靠化（见 §2），悬浮面板废除。
5. 缩放控件字形全换图标（§1）。
6. 空态大 emoji 换图标（42px、25% 透明度）。

## 5. 明确不做（本轮）

- 锐化/卷积滤镜（Worker/WebGL，单独立项）
- ControlNet/深度/姿态类控制滤镜（SenseNova 后端无此能力）
- 多图层系统（Krita 级，架构级）
- InvokeAI 的 ScrubberField 拖拽数值（可下轮做，滑块+数字输入已够用）

## 6. 追加范围（用户拍板：一轮全做，视频除外）

- **自定义下拉 SnxSelect**：原生 `<select>` 的系统弹层与深色 UI 脱节（用户点名 low）。做 button+popover 列表（当前项高亮、外点关、键盘可达），替换：生图表单模型选择、参考图角色（4 槽）、设置模型预设。
- **灯箱 ←/→ 导航**：在已完成图列表中翻页（wrap），底部计数。
- **命名风格预设**：正/负提示词成套保存（设置页 CRUD），生图表单一键套用（风格条旁 SnxSelect）。
- **队列批量/暂停/恢复**：处理循环加暂停闸；批量=张数入队。
- **Boards 画板分组**：doc.boards + node.boardId；画廊画板筛选条 + 新建；灯箱里选画板。
- 视频：不做（SenseNova 无 API）。

---

## v11 全面优化附录（2026-10-13 ~ 10-14，五批工作流交付）

口径：本附录只记录已发生的改动（主体在 `client/client-v4.js`，服务端仅一处 `src/index.ts`），内容来自五批改动报告；文档会话对其中关键事实做过静态复核（见文末「检查记录」）。**浏览器渲染/交互验收未执行**，按分工归验收员。

### P0（阻断级修复）

- **P0-1 断链 CSS 变量正名**：21 处断层面变量全部修正（`var(--snx-ac)`→`var(--snx-accent)` 25 处、`var(--snx-acf)`→`var(--snx-accent-fill)` 3 处，含 CSS 与内联样式），残留为 0，全部引用指向令牌根定义。
- **P0-2 无 src 节点全链路防御**：renderGalleryMode 与 GenRecent 只渲染 done 节点；画廊对生成中/失败给占位卡，计数栏标明「完成 X / 共 Y · 生成中 N · 失败 M」；GenHero 对无 src 节点显示状态占位；灯箱对无 src 节点整体降级（阶段区显示状态信息，禁用缩放/重绘增强/调整/参考图/原始下载/导出），doExport 加 hasImg 守卫与错误 toast。
- **P0-3 灯箱缩放重做**：弃 `transform:scale`，改「适应窗口基准尺寸×scale」直写 imgwrap 布局宽高；`.snx-lb-stage` 改 `margin:auto` 居中使 `overflow:auto` 真正生效（flex 居中裁左上的老问题一并修掉）；滚轮以光标为锚点缩放（原生 `passive:false` 监听 + scrollLeft/Top 回拨锚点）、按住左键拖拽平移（pointer capture）、双击 / 0 键 / 复位按钮回适应、换图自动复位。
- **P0-4 模态栈**：模块级 modalPush/modalPop/modalTop/modalOpen（onEsc 注册口），灯箱与帮助入栈；画布 window keydown、引擎空格平移、粘贴入画布、全屏画布 Esc 在任一模态打开时让路；灯箱/帮助自身按键仅在栈顶时生效。

### P1

| 项 | 内容 |
|---|---|
| P1-1 | 灯箱 2x/4x 两按钮合并为单个「重绘增强」：title 与 toast 明示实际请求分辨率（sizeForAspect 同比例已验证档），注明非倍数放大；不再写 `params.upscale`，PendingOverlay 文案改「重绘增强中」 |
| P1-2 | 重试链路参考图持久化：服务端新增 `POST /api/sensenova/upload`（`src/index.ts:562`，复用 persistImage，无画布副作用，已 npm run build）；客户端 `persistRef()`（dataURL→文件 URL，同源引用幂等复用，FIFO 缓存 24 条）；genToCanvas 入队前先持久化全部 refs/锚点图，蒙版/扩图合成标注板先落盘再进 params.reference；失败时本次请求仍可用原 dataURL 但 params 不存——不再「看着带图、重试变文生图」 |
| P1-4 | SnxSelect 整体重写：触发钮 aria 语义（haspopup/expanded/activedescendant）、Enter/Space/↑↓/Home/End/typeahead 全键盘、role=listbox/option；弹层 portalToBody（useLayoutEffect 实测尺寸 fixed 定位、下方放不下自动翻转、无 react-dom 时降级换算）；外点/resize 排除触发钮与弹层；捕获阶段 scroll 即收起防 fixed 错位 |
| P1-5 | 比例芯片 SIZE_CHIPS 与已验证 SIZES 一一对应 5 档（1:1=2048² 默认 / 16:9=2048×1152 / 9:16=1536×2752 / 宽幕=2752×1536 / 32:9=2560×720），当前值为非预设档时行尾追加自定义值芯片 |
| P1-6 | 风格芯片单选互斥：只存 styleId、提交时 styleSuffix() 统一拼接（提示词框不再被塞/抠后缀），点当前芯片=清除 |
| P1-7 | 增强 doEnhance 重写为 genToCanvas 同款状态机：先落 pending 节点（队列可见）、params 全量随行、pending→done/error、AbortController 入 inflightJobs 可取消，PendingOverlay 区分「增强中…」 |
| P1-8 / P2-8 | 队列新增「清除已失败」（应用内确认 + pushUndo 可撤销）；重跑失败跳过用户主动取消项（isCancelled）且补传 params.refs；QueueItem 运行耗时改用 `_startedAt`（排队不计入） |
| P1-9 | SSE canvas:update 改为保留仍存在的选中项并重建 undo 基线（undoStack=[当前快照]、redoStack 清空；初始载入同样重建），相机保持本地不闪回 |
| P1-10 | 灯箱删除/画板归属/删画板（清归属）/混合模式/不透明度/隐藏/锁定/全屏属性面板删除全部入 undo（不透明度滑块用 800ms 合并式 pushUndoMerge）；顺带修全屏删除缺 store.emit 导致的 Konva 残影 |
| P1-11 | Konva pending 占位只留虚线几何框，文字/转圈归 HTML PendingOverlay；ETA 显示真实已耗时秒数（1s tick 自更新，覆盖 pending+running）；全屏画布补挂此前缺失的 PendingOverlay |
| P1-12 | GenBar 同步表单完整参数（负面词/参考图/张数/种子/画质经 genPrefs），文案如实区分 编辑选中图 / 参考图×N / 文生图 |
| P1-13 | 对比改独立集合 cmpSel+cmpBoard：不借用/不回写画布 store.sel、不自动抓最后两张；画廊池 16→60 张 + 画板筛选；cmpTouched 机制随自动补位一并移除 |
| P1-14 | 应用内确认弹窗 SnxConfirm（danger 配色复用 .snx-cfm-*、portalToBody、promise 化 askConfirm、入模态栈、Esc=取消/Enter=确认）替换全部 7 处原生 confirm；删图（灯箱+画廊批量）与删画板带被引用警告文案（parentId 子图计数 / 画板内受影响图数）；清画廊与清画布补 pushUndo 可撤销 |
| P1-15 | 图层面板点击改调 engine.focusNode（平移相机到节点中心，保持缩放，不再全局 fit）；行内显示/锁开关（入 undo）；状态徽章中文化（排队中/生成中/完成/失败，图层行与属性面板两处） |
| P1-16 | applyFiltersGpu 加 maxSide；灯箱预览 rAF 节流（一帧多次 tick 只渲染最后一次 + cancelled 竞态防护）+ 按显示尺寸×dpr 降采样（钳 320~2048）；doExport 不再用预览图，导出时才按原分辨率应用滤镜 |
| P1-17 | 设置页模型/画质区改可编辑 SnxSelect 直写 genPrefs.model/.quality（4K 档文案如实标注映射规则） |
| P1-18 | 帮助浮层按真实行为重写：生成/画布/画廊/蒙版重绘/灯箱/全屏画布/其他七组（含滚轮锚点缩放、拖拽平移、双击复位、双击节点=新标签打开原图等），页脚 v11 |
| P1-19 | UI 指定字形清零：⤵⇤⇔⇥⇧⇕⇩↔↕⛔⭐★☆❌⚠↻↩✕✓✗⬇∅⇄▾▸＋− 等全部换 lucide 图标（ICONS 补 12 个官方 path：8 个 align、chevron-left、chevrons-left-right、corner-right-down、shuffle——shuffle 同时修了变体按钮原本缺图渲染空 SVG 的存量 bug）或中文；✒️水墨、✏️i2i、💬写侧前缀、toast 30+ 处 ✓/✗、● 保存中全部转纯中文 |
| P1-20 | hero API Key 状态点三态（检查中=灰 / 已配置=绿 / 未配置=红），文案「…」改「检查中…」 |

### P2

- **P2-1** 生成按钮 idle 常驻扫光移除（渐变停 translateX(-100%) 不可见），仅 `.busy::after` 播放。
- **P2-2** notify 队列化 toast：单槽改数组（上限 4 条丢最旧），每条独立 5s 计时器、手动关闭、role=status；toastKindOf 按文案推断 ok/err/info 着色，可显式覆盖；CSS 长文案换行；画布状态栏显示最新一条。
- **P2-3** 灯箱「标签」块：输入+回车写 node.tags（去重/24 字上限/isComposing 防抖）、chip × 删除，store.emit+autosave 即时落盘；画廊标签筛选同链路，加 effTagFilter 守卫（被删空的过滤标签自动失效）。
- **P2-4** 提示词库模块级缓存（loadPromptLib 读缓存 / savePromptLib 写穿透并广播事件），GenForm 渲染期 3 次 localStorage 读取收敛为挂载时一次惰性初始化 + 事件刷新；星标改 useMemo 派生。
- **P2-5** snxInsertToCanvas 补 r.ok/服务端 ok 校验并抛错；TvLightbox/SnxToolCard 插入按钮三态 idle/ok/err，失败显「插入失败，点击重试」再点即重试。
- **P2-6** 全局 `:focus-visible` 三段式（通用 accent 描边、文本输入类排除、range 滑块单列），选择器覆盖各 portal 弹层根。
- **P2-7（部分）** 画布快捷键补 Ctrl+A 全选与方向键微调（1px，Shift=10px，跳过锁定节点，入 undo）；右键菜单新增置顶/上移一层/下移一层/置底（文档顺序即 z 序，与导出画布同序）。
- **P2-9** `SNX_MAX_INLINE_DATAURL=2MB`（约 1.5MB 原图，参照服务端 8MB 文档上限自定）：runOne 持久化兜底返回 base64 超阈值时节点转 error（中文 errMsg，可重试）+ err toast，不写 src 进文档；doEnhance 同类路径 throw 转失败态。
- **P2-10** 两处分叉的蒙版工具条收口为共享 renderMaskBar()（全屏版补齐画笔四滑块+预览圈）；预览圈坐标改按 `.snx-pro` 包含块偏移（该容器是 container-type 会收编 fixed 后代，原算法错位）。
- **P2-11** GenRecent 缩略图右键不再劫持为看大图，大图入口回归双击。
- **P2-12** 命名预设入口移出风格 chips 区独立成块（library 图标），空态也可见并指路设置页。
- **画廊 InvokeAI 化**（独立一批）：点击语义分层（galSel 与画布 store.sel 解耦，Ctrl 多选/Shift 按可见序范围选/双击灯箱）、底部 sticky 批量条（N 张已选 · 移入画板 SnxSelect 下拉/删除/一键清空）、缩略图 hover 轻操作组（参考图/下载/收藏/删除，重操作收右键）、右键菜单 GalContextMenu 单选/多选两套（多选作用整个选集，含 N 张计数头；多张下载 250ms 错峰）、拖图到画板 chip 归类（6px 阈值起拖、拖已选中项整组跟随、ghost 跟指针、elementFromPoint 命中高亮、松手 moveNodesToBoard、拖后吃掉误触 click）、批量删除先走应用内确认（promise 化、Esc=取消/Enter=确认、删除可撤销）、帮助浮层补「画廊」组。

### InvokeAI 对齐点

- **GalleryItem 点击语义分层**：单击轻选中 / Ctrl 多选 / Shift 范围选 / 双击灯箱——画廊选中与画布选中解耦（InvokeAI 画廊选择不污染 canvas 同思路）。
- **GalleryItemHoverIcons**：缩略图悬停轻操作组，重操作收进右键菜单。
- **底部批量条**：N 张已选 · 移入画板 / 删除 / 清空，重操作集中于此。
- **DeleteBoardModal 思路**：删除被引用图/画板时给被引用警告（parentId 子图计数、画板内受影响图数）。
- **CurrentImageButtons 键位集**：灯箱回填 R/P/S/D 四键对齐 InvokeAI 的 Remix/Prompt/Seed/Size。
- **undo 合并**：不透明度滑块 800ms pushUndoMerge（InvokeAI 同类参数滑块合并）。
- **z 序右键 + Ctrl+A + 方向键微调**：补齐 InvokeAI 式画布快捷键面。
- **PendingOverlay**：HTML 转圈悬浮层（v10 引入，本轮补真实耗时 ETA、增强态区分、全屏画布挂载）。
- **对比独立选择集合**：不借用画布选中（InvokeAI compare 独立选图同思路；同为组件会话态、不持久化）。

### 明确未做 / 缓办（如实）

- **手动连线编辑（P2-7 一部分）缓办**：edge 画在 listening:false 的 edgeLayer 无命中目标；手动改接 parentId 需要锚点把手/拖拽命中/悬停态整套新交互，且 parentId 同时是版本树（buildVersionTree）与衍生链的根链路，牵涉成环防护与 undo 语义，评估远超最小改动口径。
- **修复前已存在的旧 error 节点**：其 dataURL 参考图在当时已被 keepShortRef 丢弃，重试仍是文生图——数据不可逆，P1-2 只对新建节点生效。
- 对比选择集合为组件会话态（切 tab 保留、刷新丢失），未持久化（InvokeAI 同为会话态）。
- 回填单键只有 R/P/S/D（负面词/模型/参考图无单键，与 InvokeAI CurrentImageButtons 键位集一致）。
- isStarred 变量改派生后零引用，最小改动原则下保留（`client-v4.js:2909`）。
- SnxSelect 无 react-dom 降级坐标换算分支未经浏览器实测。
- 全屏属性面板「删除」与画布 ActionBar「删除」直接删但有 pushUndo，不在 7 处原生 confirm 清单内，按改动最小化未加确认。
- 灯箱标签编辑对 pending/error 节点也开放（标签属元数据，未做限制）。
- 拖拽归类为最小诚实版：无落点插入位置预览、无滚动容器自动滚边、无触屏长按语义。
- **浏览器渲染验收未执行**（纪律归验收员）；var 定义/className 对账均为静态 grep，非真浏览器验证。

### 检查记录

- **构建员五批自检**：node --check 每轮通过（最终 FINAL-SYNTAX-OK / SYNTAX-OK）；第三批 `npm run build` 成功且 dist/index.js 含 upload 路由；自写对账脚本（Write 落盘后运行）确认原生 confirm/prompt 调用 0 处、362 个 className 字面量全部有 CSS 定义、32 个 var() 引用全部有定义或 fallback；指定字形 grep=0；ic() 字面量与 ICONS 对账无缺失。
- **文档会话复核（2026-10-14，本附录写作时）**：
  - `node --check client/client-v4.js` → SYNTAX-OK；
  - `grep -c -- "--snx-ac\b\|--snx-acf\b"` → 0（`--snx-accent` 现有 185 处引用）；
  - 原生 confirm(/prompt( 全文仅剩 `session.prompt`（dsh 会话 API，非弹窗），`client-v4.js:259`；
  - `/api/sensenova/upload` 在 `src/index.ts:562`，dist/index.js 已含；
  - 帮助页脚「SenseNova 生图工作台 · v11」在 `client-v4.js:6367`；
  - SIZE_CHIPS 五档在 `client-v4.js:5699`；对比池 `slice(0, 60)` 在 `client-v4.js:5054`；「清除已失败」按钮在 `client-v4.js:4964`；灯箱标签块/回填全部(R) 在 `client-v4.js:6823`/`6860`。
