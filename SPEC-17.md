# SPEC-17:画布生产力轮(2026-10-21)

> 本轮=竞品调研驱动:批次0 调研 InvokeAI/ComfyUI/tldraw 无限画布的功能差距,产出可实现的候选清单;批次1-3 逐批实现(含已知项);验收全 E2E。

## 一、已知项(此前轮次 deferred)

1. **批量导出 zip**:画廊多选→「批量导出 zip」(客户端 zip 打包,已有逐张 tEXt 管线)。依赖:fflate 或手写 store-only zip(无压缩,PNG 已压缩)。不接受外部运行时依赖——手写 store-only zip(compact:local file header + central directory,~80 行)。
2. **种子一键复用**:灯箱参数清单「种子」行已可回填;补「锁定种子生成」按钮(点击→回填种子+同 prompt/尺寸/模型直接重生成,种子不变=可控变体)。入口:灯箱动作行「🔒同种子重生成」。
3. **画板多维排序**:目标画板下拉加「按名称排序」选项(最近使用/按名称二选一,偏好存 localStorage)。
4. **极小缩放短边端口抢占**:60px 间隔的边在 5% 缩放全长 3px,点击「边」实际抓端口。缓解:端口命中半径按缩放反比已有,但短边时两端端口覆盖整条边——改为端口命中优先于边线(Konva 图层内端口 z 序高于边线),用户点端口=拖线,点边线中间=菜单(已有),冲突面收窄。
5. **批量条跨筛选计数提示**:多选后切画板筛选→批量条仍在但所选图不可见。缓解:批量条加文案「N 张已选(部分不在当前筛选)」。
6. **E2E 脚本入库**:D:/coding/tmp/snx-audit/e2e.js 搬入仓库 scripts/e2e.spec.js(归档,不做 CI)。

## 二、竞品调研驱动项(批次0 产出后择优入批次1-3)

调研范围:InvokeAI canvas(controlLayers 456 文件的核心交互)、ComfyUI(连线/节点图)、tldraw(画布通用)。产出:我们缺的、用户可感知的、后端可支撑的交互候选(如:框选后批量拖拽、节点复制粘贴 Ctrl+C/V、画布小地图/minimap、节点对齐参考线吸附、右键快捷操作半径)。

## 三、明确不做

渐进预览(上游不回 step)、批量入队 prompts×iterations、图层/区域引导(后端边界)、驱动 agent(无 API)。

## 四、验收

E2E 50+ 项(旧 48 回归+新增);full 静态门禁 0 违规;第三方审计收口。

## 五、验收标注(2026-10-23 文档同步,静态交付口径)

> 口径:✅=已实现+静态复核(三批改动报告+文档同步会话 2026-10-23 命令复核;行号为当日 grep 实测,明细与验证命令见 `FOR-OTHER-SESSIONS.md` v17 章)。**§四 的 E2E 50+ 项与浏览器实测未跑(纪律归验收员),第三方审计收口未做**。本节为追加标注,上文各条原文未动;本批未预分配新 E2E 项号,验收员实编后回填。

- **一.1 批量导出 zip ✅**:storeOnlyZip(client-v4.js:9225,手写 store-only method=0,零依赖,CRC32 复用既有 crc32 :9218;zip64 边界未做已注明)+ batchExportZipNodes(:5002,≥2 张 done,与灯箱单张/既有批量导出同 imageToBlob 管线恒定嵌 tEXt,条目名=两位序号-提示词前 20 字.png 前导零保序,串行取图)+ 批量条「批量导出 zip」按钮(:6449-6456,与既有批量导出共用 galExpBusy)。**偏差如实:下载名无「画布名」字段可用,落地 snx-canvas-YYYYMMDD.zip**(onExportCanvas 同前缀)。zip 构造器已用真源码 Node 生成+Windows Expand-Archive 真解压逐字节比对替代验证(通过,批次自检)。
- **一.2 种子一键复用 ✅(范围:仅工作台灯箱)**:灯箱动作行首位「同种子重生成」(:8948-8962,四态防连点+canRegenSeed :8709,ic('lock'))→ onRegenSameSeed(:5751) 回填 种子+prompt/尺寸/模型 后共用 snxRerollDirect 直连 POST(body.seed=该图种子,opts :4335);无数字种子 reject;「种子」行回填按钮未动。**对话 TvLightbox 未加**(其结果 JSON/工具入参通常无 seed,且「同参数重抽」有 seed 时本就带)——如验收要求两处入口需追加。
- **一.3 画板多维排序 ✅**:localStorage snxBoardSort(:3557-3560,'recent' 缺省/异常回退='recent' 即原行为;'name' 拼音序)+ boardsByRecent() 唯一共享(:3570;画廊 chips :6224/表单目标下拉 :7892/灯箱下拉 :5868 及右键板列表 :6022/画板筛选下拉 :6685 自动同序)+ 目标画板下拉末项切换选项(BOARD_SORT_OPT :3541,:7894,只切偏好不动目标)+ snx:boardSortChanged 广播(:4834-4838)。
- **一.4 端口抢占 ✅(确认性,无功能性改动)**:portLayer 本就高于 edgeLayer(:2836-2845 stage.add 顺序即 z 序),结论已记注释;**残余 deferred:极小缩放时短边两端端口热区合拢覆盖整条边**(空间分配设计张力,注释 :2837-2842,热区半径已按 1/max(0.05,scale) 反比,再压伤正常缩放可点性)。
- **一.5 批量条跨筛选计数 ✅**:galSelInFilter(:6262)+ 计数 span(:6420-6429):部分选中图不可见时「N 张已选(M 张在当前筛选)」+ title「批量操作仍对全部 N 张生效」(批量操作确实全吃 galSelIds 不吃可见性,提示如实,不自动缩选);全部可见维持原文案。
- **一.6 E2E 脚本入库 ✅**:scripts/e2e.spec.js(48 个 tNN 测试函数原样归档,【手动运行,不做 CI】,URL 从 argv 传入;无参 usage+exit 2 已冒烟)+ scripts/static-audit.js(DEFAULT_FILE 改 __dirname 相对路径,不依赖 CWD)+ scripts/package.json {"type":"commonjs"}(仓库根 type:module 的 CJS 岛,构建不受影响)。**48 项断言未实跑**(纪律禁启服务/浏览器,归验收员)。
- **二 调研 3 条 ✅(全选,均纯客户端)**:①框选后批量拖拽(collectFollowers :2956/collectPeers :2979,pending/error 占位与 groupId 队友随动,同挂 Transformer 成员归 Konva proxy 管,locked 不动)②Ctrl+C/X/V 内部节点剪贴板(copySelected/pasteClipboard :2300/:2306,parentId 选集内重映射/groupId 剥离/运行态过滤,粘贴质心对齐指针;快捷键 :5466-5481,Ctrl+V 空则落回系统图片粘贴)③拖拽对齐参考线吸附(移动集包围盒 9 条候选线/6 屏幕像素阈值相机反算/参考线 fxLayer 拖完清线)。**未做(如实)**:调研清单中的 minimap 与右键半径快捷菜单(不在 3 条之列,小地图需第二 Konva stage 超 medium);变换(scale/rotate)期间不吸附(与 Figma/tldraw 同取舍)。
- **四 验收**:静态部分达成——`node --check client/client-v4.js` exit 0;`node scripts/static-audit.js --suite=full` **PASS 0 违规**(vars 0/emoji 0/classes 422:422 双向 0 孤儿/confirms 0,2026-10-23 实跑);**E2E 50+ 项未编写/未跑、浏览器实测未做、第三方审计收口未做——均归验收员**。
