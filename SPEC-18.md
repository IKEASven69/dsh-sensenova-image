# SPEC-18 — 结构性候选清零轮（2026-10-25）

> 背景：第六~八任审计的「剩余差距 Top5」中四项标注"结构性"被长期搁置；用户拍板全部做掉，并点名补真实生图链路验证（此前审计纪律 0 配额 = 真实链路从未端到端验证过）。本轮把"结构性"全部落地 + 把真测立为常规验收项。

## §一 真实生图链路端到端验证（先行，立为常规项）
- 工作台真图 1 张：表单→POST 真上游→节点 done→记录真耗时/seed/响应原文/snxAvgDur 样本。
- 对话轴真图 1 次：dsh 对话发指令→agent 调工具→服务端 execute 直调上游→对话卡出图+画布 fromChat 节点。
- 前置守卫：config.baseUrl 非本机（mock 残留即中止）；脚本 `tmp/snx-audit/real-gen.js`（人工运行，消耗配额）。
- 验收：真图 PNG 存证 + 耗时/样本数据落报告；画布测后复原，产物存 tmp/snx-audit/realgen-*.png。

## §二 全局并发闸 + 队列重排/插队（client）
- 现状：无调度器，runOne 全部即发并行，"队列"只是状态视图，重排无处着力。
- 新增并发闸：全局信号量，默认并发 2（localStorage `snxGenConcurrency`，1–4），runOne 先过暂停闸→取消检查→并发闸；等待者 FIFO 等待表。
- 重排 API：`genQueueMove(nodeId, 'up'|'down'|'top')` 操作等待表；`cancelJob` 对等待中条目出队并放行（runOne 醒来即命中取消检查，槽位正常释放）。
- 队列 UI：QueueItem pending 行加 ↑ ↓ ⤒ 三按钮（插队=置顶），表头并发选择器（1–4），进度行文案「N / 总 并发」如实反映闸值。
- 验收：3 任务并发 1 时等待序可控（置顶者先跑）——mock 拦截计时序断言；取消等待项无槽位泄漏。

## §三 对话轴等待预估兜底（server+client）
- 现状：SnxToolPending 的「预计 ~Xs」只读客户端 POST 样本，对话路径（服务端 execute 直调）永远无样本。
- server：generate 路由 + generate/edit 两工具 execute 统一记时长到模块级环形 5 条；新增 GET `/api/sensenova/stats` → `{ avgSec, samples }`。
- client：SnxToolPending 与工作台 PendingOverlay——本地样本优先，无样本拉一次 /stats 兜底；已耗时秒表保持不变。
- 验收：清空 localStorage 后 pending 卡仍显示「预计 ~Xs」（样本来自服务端统计，真/图 mock 均可）。

## §四 画布 minimap（client）
- 右下角 160×110 2D canvas（非第二 Konva stage）：按状态着色画节点矩形+视口矩形；点击/拖拽移动相机；store.emit 节流重绘。
- 类名 `.snx-minimap`；避让缩放控件与状态栏；icon 关闭按钮（会话态记忆）。
- 验收：节点增删/移动后小地图同步；点小地图视口跳转；E2E 断言元素存在+点击后相机变化。

## §五 tiled 放大 2×（server+client）
- server：POST `/api/sensenova/edit`——{image, prompt, model?}→callChatCompletions 多模态→persistImage 落盘→{ok, url}（与 sensenova_edit_image 工具同管线）。
- client：灯箱动作行「放大 2×」——源图切 2×2 块（12% 重叠）→逐块 edit（超分重绘指令，串行）→2× 输出画布按位回贴+重叠羽化→upload→新 done 节点（parentId=源，params.tiled2x=true）；逐块进度 toast。
- 如实标注：质量依赖上游重绘保真，非专用放大模型（U1.5 无此能力，文档已注明）。
- 验收：mock edit 应答跑通全链（4 块串行、参数/落盘/新节点）；真图链路真测 1 次（真源图+4 块真 edit）。

## §六 边界与纪律
- E2E 套件续编：并发闸序/重排/stats 兜底/minimap/放大链 mock 链路 → 预分配 E2E-49..53；真测脚本（real-gen.js / tiled）人工运行不进 CI。
- 静态门禁：node --check、static-audit --suite=full PASS。
- 全部改动照例：client-v4.js + src/index.ts；画布 GET 备份→PUT 恢复；测后进程体检。
