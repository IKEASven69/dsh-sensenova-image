# SPEC-16:资产生产力轮(2026-10-20)

> 原型豁免:全部为既有表面小增量(计时文案/排序/批量按钮),复用既有词汇表;验收全 E2E。附带一项用户批准的数据清理(乱码节点)。

> **状态(2026-10-21 文档同步)**:批次1(等待预估+乱码节点)/批次2(画板排序+批量导出)交付,全部只改 client/client-v4.js,服务端零改动;改动在工作树未 commit(`git status --short` = ` M client/client-v4.js`,HEAD=20f267d=本 SPEC 规格提交)。各条 ✅ =**实现落地+静态核实**(文档同步会话 node --check exit 0 + 关键符号 grep 在位,见 `FOR-OTHER-SESSIONS.md` v16 章),**不是** E2E 真机通过——E2E 未跑,归验收员。「新 4」按 §六 预分配 **E2E-45..48**(旧 44+新 4=48,与 v15 已有 E2E-39..44 延续无计数冲突;仓库无项号映射文档,验收员实测后以实际为准回填)。第三方审计收口未做。

## 一、等待预估(对话轴)

pending 卡在转圈+已耗时 Ns 基础上加「预计 ~Xs」:X=历史生成平均耗时(客户端 localStorage 滚动累计,样本=最近 5 次 done 的 POST 墙钟时长;无样本时不显示预计)。每次生成完成更新均值。
**验收**:拦截延迟 3s 的首次生成后,localStorage 出现均值样本;第二次 pending 态断言「预计 ~」文本出现。

> **状态:✅ 实现落地(批次1)**——snxGenPost 唯一收口(client-v4.js:2613-2618;runOne 调用 :2632/snxRerollDirect 调用 :4128/batchVariantNodes 调用 :4813,grep 确认 :2615 为客户端唯一裸 post,无重复计数);样本=最近 5 次 done 的 POST 墙钟(snxRecordGenDur :2593,localStorage `snxAvgDur` 环形);均值 snxAvgGenDurSec :2605(取整秒,无样本 0);展示:SnxToolPending :4313 + PendingOverlay :3713,est=0 整段不显示。**偏差如实**:ask 原文写「done 或 error」,按本节定义只记 done(秒回 4xx/用户取消会拉失真,代码注释 :2588-2589 注明);**对话工具路径不覆盖**:工具在服务端 execute 直调上游(src/index.ts:848 起,callImagesGenerations :869),客户端无 POST 可采样,覆盖须改服务端(本轮禁区)或观测非 POST 墙钟,均超本轮范围。E2E 未跑:**E2E-45**(拦截 3s 首次生成→snxAvgDur 出样本;第二次 pending 断言「预计 ~」),预分配。

## 二、乱码历史节点清理(用户批准)

画布中提示词为乱码(早期编码事故、无可读信息)的 1 个 done 节点移除;其衍生子节点(若有)parentId 置空防断链。走 API+rev,改前备份快照。
**验收**:GET canvas 无该节点;其余节点数不变。

> **状态:✅ 判定+移交完成;删除已被执行(2026-10-21 文档同步复核)**——批次按「只删确定项」**未写自动清理代码**(ask 允许 deferred;自动清理有实测误伤风险),判定与 API+rev 移除步骤移交(GET 存全量备份→PUT 前 re-GET rev→PUT {doc,rev},服务端 src/index.ts:623-628 校验、不符 409 带最新 doc+rev 重试→验证 7→6 逐字节不变;详见 `FOR-OTHER-SESSIONS.md` v16 章)。判定:唯一确定项 **mv6mublabhbmv**(done/parentId 空/无子节点/37 个 U+FFFD/[�/◆] 最长连跑 7,残余仅 CP1252 型 mojibake+零散 ASCII 碎片);mv5fl7a3mo0zw 英文主体可读、21 U+FFFD/连跑 8,属部分损坏非「无可读信息」,原留主会话裁量。**复核实况**:备份快照 `~/.dsh/storages/dsh-sensenova-image-canvas.backup-spec16-20261021.json`(7 节点 rev=567,判定数字逐项吻合)在;实况(rev=612)已无 mv6mublabhbmv **且 mv5fl7a3mo0zw 亦已删(裁量结果=删,故节点数 7→5 非 7→6)**,其余 5 节点与备份逐字节一致、无新增——本条验收的存储层等价核验已过(文档会话直读 JSON,HTTP GET 未跑、未起服务)。**验收员勿重复执行删除**。E2E:**E2E-46**(GET canvas 无该节点;其余节点完整),预分配。

## 三、画板按最近使用排序

画板列表(画廊 chips/表单下拉/灯箱下拉)按「最近一次有节点落入」倒序:节点创建/移入时刷新该板 lastUsed。空板按其原有位置沉底。
**验收**:向板 A 入一张新图后,A 排到画板列表首位。

> **状态:✅ 实现落地(批次2)**——touchBoard/boardsByRecent 工厂级助手(client-v4.js:3354/:3361,紧邻 resolveTargetBoard);入板/移入四处刷新该板 boards[].lastUsed(genToCanvas 落板 :2723/批量变体建节点 :4808/moveNodesToBoard :4646(chips 拖拽/批量下拉/右键菜单三路共用)/灯箱 onChangeBoard :5561),随 doc.boards 经 autosave 整文档 PUT 持久化(rev 协议照走),undo/redo 快照天然覆盖;6 处列表(5 个代码点,chips 与批量移入下拉共用 :5911)统一 lastUsed 倒序稳定排序(缺 lastUsed 视为 0 沉底保持原相对序,渲染副本不改存储数组):画廊 chips+批量移入下拉(:5911)/右键「移入画板」子列表(:5709)/表单目标下拉(:7546)/灯箱画板下拉(:5556)/对比页画板筛选下拉(:6352)。E2E 未跑:**E2E-47**(向板 A 入新图→A 排首位),预分配。

## 四、批量导出(带元数据)

画廊多选(≥2 done)→动作区「批量导出」:逐张下载,每张走与单张导出相同的「嵌入元数据(tEXt)」管线(读回验证过的既有实现);间隔 250ms 防拦截;toast 进度+汇总。
**验收**:多选 2 张→2 次 download 事件且 PNG 含 sensenova tEXt chunk。

> **状态:✅ 实现落地(批次2)**——画廊批量条「批量导出」按钮(client-v4.js:6122-6126,≥2 张 done 出现,与批量变体/删除同排复用 .bt 样式,busy 态 disabled)+ batchExportNodes(:4746-4778):串行逐张走与灯箱单张导出同一 imageToBlob(src,'png',92,node) 嵌入元数据管线(sensenova tEXt 含 prompt/model/size/seed),**meta 恒定传节点本体、不读灯箱 exportMeta 开关**(本节明示恒定嵌入,注释 :4743);张间 250ms 间隔(batchDownload 同款);toast 进度 i/N+结尾汇总(部分失败 err 级,单张失败不中断批次);文件名=提示词前 30 字+序号;busy state+ref 双防连点。E2E 未跑:**E2E-48**(多选 2 张→2 次 download 且 PNG 含 sensenova tEXt chunk),预分配。

## 五、明确不做

渐进预览(上游不回 step)、批量入队 prompts×iterations、图层系统、驱动 agent。

## 六、流程

单工作流:批次1=等待预估+乱码清理、批次2=画板排序+批量导出;E2E 48 项(旧 44+新 4);第三方审计收口。

> **执行状态(2026-10-21)**:批次1/2 均交付(批次1 的 §二 为判定+移交,删除已由验收/主会话侧于 2026-10-21 晚执行——含裁量删除 mv5fl7a3mo0zw,节点数 7→5,见 §二 标注)。门禁:批次1 node --check ×2 SYNTAX-OK、批次2 SYNTAX-OK+FINAL-SYNTAX-OK(据改动报告);文档同步会话复核 node --check → exit 0 + 关键符号 grep 在位 + sensenova/generate 客户端唯一裸调用在 snxGenPost 内。**E2E 未跑**:新 4 项预分配 E2E-45..48——等待预估=45/乱码节点=46/画板排序=47/批量导出=48(「旧 44+新 4=48」与 v15 已有 E2E-39..44 延续,无计数冲突);**第三方审计收口未做**。均归验收员/审计员。
