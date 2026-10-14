# v11.2 修复清单(2026-10-14,双代理交叉复审合并,主代理已裁决)

来源:代理 A(InvokeAI 增量对标)+ 代理 B(敌意代码复审)。行号以 v11.1(c1f10bb)为基。
**主代理裁决**:A-P0-1/B-3 菜单错位在 Chromium 实测不成立(p01-menu-check.png 菜单精确落在右键点),但跨浏览器一致性仍要求 portal 化;A-P2-3 的"热区无补偿"是旧快照误报(v11.1 已有 1/scale 补偿),只采纳其 hidden 过滤与 dragmove churn 两半。

## 必修(实现代理逐条落地)

1. **linkDrag 兜底**(A-P1-1/B-1/B-5):启动拖线时 window 挂一次性 mouseup/pointercancel/blur → linkDragCancel();stage mousedown 在 linkDrag 期间直接 return(不得设 marquee);linkDragDrop 开头 `if (!from) { linkDragCancel(); return }`。
2. **模态栈 onEsc 分发器**(B-2):window keydown **capture** 阶段分发:Esc 且 modalTop().onEsc 存在 → stopPropagation + 调用之。四个注册点(ContextMenu/GalContextMenu/HelpOverlay/Lightbox)传真实 onEsc;全屏画布打开时 modalPush(onEsc=退出全屏)——顺带修 A-P2-9 全屏 Esc 双消费(画布 onKey 的 modalOpen 早退已保证不双发)。
3. **ContextMenu portal 化 + 去重**(B-3/B-12):照 GalContextMenu 模式 portal 到 body + 视口钳制;删除全屏画布里第二个 ContextMenu 实例(同一 menu state)。
4. **GalContextMenu 隐形活模态**(B-4):target 查不到直接 onClose+弹栈(或 close 无条件走 closeRef);外点/resize 关闭不再被 ref 门死。
5. **暂停期取消被复活**(A-P1-2):runOne 在 `await waitIfPaused()` 返回后先查 `isCancelled(id)` → 是则标 error/用户取消并 return,不发请求。
6. **粘贴/拖入大图上限**(A-P1-3):drop 与 paste 入口共用 overInlineLimit 检查,超限走 persistRef 落盘成文件 URL(上传路由已有),失败才拒绝并 notify。
7. **SnxConfirm 焦点安全**(A-P1-4):初始焦点放「取消」;window Enter 分发先查 `document.activeElement`(焦点在按钮上时让按钮原生激活,不强转 confirm)。
8. **画布→灯箱链路**(A-P1-5):画布节点双击=开灯箱(带该节点),右键菜单加「灯箱打开」;「新标签打开」保留为菜单次项。
9. **灯箱快捷键输入设防**(B-6):onKey 顶部 `if (isTyping(e)) return`(Escape 分支可自酌保留在 isTyping 检查外)。
10. **清空画布确认**(B-7/A-P2-4):走 askConfirm(文案含进行中任务数 N,N>0 时提示"将白费 N 个进行中任务"),补 `store.sel = new Set()`;askConfirm 开头加覆盖守卫 `if (cfm) return Promise.resolve(false)`(B-8)。
11. **边线过滤与节流**(B-9):边线循环加 `if (n.hidden) continue`;dragmove 的 drawEdges 加 ~50ms 节流(时间戳比较即可)。
12. **端口层抬高**(B-10):新建 portLayer 加在 mainLayer 之上(fxLayer 之下),drawEdges 把端口画到 portLayer,线留在 edgeLayer;applyCamera/ResizeObserver/销毁路径同步带上 portLayer。
13. **SnxSelect 弹层作用域**(B-11):`.snx-sel-pop` 补进文件头部 CSS 变量作用域清单(与 focus-visible 清单同款);删除被内联 fixed 覆盖的死规则(position:absolute;top:calc(100%+4px) 一段)。
14. **状态徽章中文**(A-P2-1):队列 QueueItem 徽章与灯箱版本树状态用 STATUS_ZH 映射(队列 CSS 的 uppercase 保留,内容中文)。
15. **连线编辑文档**(A-P2-2):帮助浮层加快捷键/操作段(拖输出端口改接/右键断开/Esc 取消);设置页快捷键表同步。
16. **对比角标 A/B/C/D**(A-P2-5 半):CompareGrid 角标改字母;模式循环/交换按钮本轮不做(记 deferred)。
17. **暂停全局告知**(A-P2-6):队列暂停期间生图按钮触发入队时 notify「队列已暂停,任务已入队等待恢复」(入口在 GenBar go 与画布 GenBar 共用路径)。
18. **bsb 图片预览缩放**(A-P2-7):`.snx-bsb-canvas` 的 transform:scale 改为按基准尺寸直写布局宽高(照灯箱 P0-3 同款)。
19. **混合模式中文 + 衍生自可读**(A-P2-8):混合模式下拉 label 中文(正片叠底/滤色/叠加…值保持英文);「衍生自」显示父图提示词前 14 字(title 带 id)。
20. **方向键 undo 合并**(A-P2-10):nudge 用 pushUndoMerge(800ms 先例)。
21. **锁定不可删**(A-P2-11):removeSelected 跳过 locked;全部锁定时 notify「锁定节点需先解锁再删除」。
22. **undo/emit/boards 零星**(B-13):新建画板 pushUndo;收藏/取消收藏 pushUndo+emit;标签增删 pushUndo;灯箱改画板补 store.emit;SSE canvas:update 补 `store.doc.boards = r.doc.boards || store.doc.boards`。

## 明确不做(记 deferred)

- 对比视图模式循环/交换按钮(功能级,下轮)
- 画廊拖拽归类自动滚边(P2 级)
- A-P2-3 热区补偿(已存在于 v11.1,误报)
- A-P0-1 实机位移(Chromium 证伪,本轮仅做 portal 一致化)

## 验收口径

每条改完跑 `node --check`;全部完成跑 `D:/coding/tmp/snx-audit/static-audit.js --suite=full` 必须 0 违规;不改 PUBLIC 行为契约(toolview/slot 注册);中文微文案;图标 ic();禁 emoji;禁止 bash 内联 node -e 补丁;不做 git 操作;不动 5181/5185 服务进程;浏览器验收由主会话负责。
