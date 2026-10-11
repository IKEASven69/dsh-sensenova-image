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
