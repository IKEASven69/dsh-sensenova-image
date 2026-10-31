/**
 * dsh-sensenova-image — 生图工作台 v4（客户端模块）
 *
 * Phase 0：无限画布底座（WORKBENCH-PLAN.md）
 *  - shell.overlay 全屏工作台：Konva 无限画布 + 右侧生成/历史面板
 *  - 视口：滚轮缩放（指针锚点）、空格/中键平移、缩放控件、F 适应画面
 *  - 节点：拖拽、Transformer、shift 多选/框选、右键菜单
 *  - 文档 {nodes, camera} 存服务端 JSON，防抖自动保存；undo/redo（cap 60）
 *  - 生成：幽灵节点原位替换；结果落盘 /api/sensenova/image/:id
 *
 * Phase 1：标配交互
 *  - 浮动操作条（选中单图）：变体 / 增强 / 局部重绘 / 扩图 / 下载 / 删除
 *  - 悬浮 prompt bar：无选中 = 文生图；选中图 = 编辑（i2i，图自动带上），Enter 生成
 *  - 蒙版局部重绘：画笔标注 → 合成"原图+高亮标注板"发 i2i（仅改高亮区）
 *  - 扩图 outpaint：比例预设 → 原图居中合成白边画布发 i2i
 *  - 拖入/粘贴图片即成节点；模型档位（默认/u1.5-lite/u1.5）
 *
 * 模式沿用 deck：window.__ModuleLoader__ + slots 注入。
 */
window.__snxDebug = window.__snxDebug || { step: 'init', src: 'client-v4' }
window.__ModuleLoader__.load({
  id: 'dsh-sensenova-image',
  factory: (require) => {
    const module = { exports: {} }
    const inject = ['slots', 'sessions', 'uiConversation', 'conversation', 'sidebarRightTabs', 'sidebarRight', 'layout']

    // ─── v10：内联 lucide 图标（ISC）——ic(name, size) 返回 currentColor 描边 SVG ───
    const ICONS = {"align-center-horizontal":"<path d=\"M2 12h20\" /><path d=\"M10 16v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4\" /><path d=\"M10 8V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v4\" /><path d=\"M20 16v1a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-1\" /><path d=\"M14 8V7c0-1.1.9-2 2-2h2a2 2 0 0 1 2 2v1\" />","align-center-vertical":"<path d=\"M12 2v20\" /><path d=\"M8 10H4a2 2 0 0 1-2-2V6c0-1.1.9-2 2-2h4\" /><path d=\"M16 10h4a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-4\" /><path d=\"M8 20H7a2 2 0 0 1-2-2v-2c0-1.1.9-2 2-2h1\" /><path d=\"M16 14h1a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-1\" />","align-end-horizontal":"<rect width=\"6\" height=\"16\" x=\"4\" y=\"2\" rx=\"2\" /><rect width=\"6\" height=\"9\" x=\"14\" y=\"9\" rx=\"2\" /><path d=\"M22 22H2\" />","align-end-vertical":"<rect width=\"16\" height=\"6\" x=\"2\" y=\"4\" rx=\"2\" /><rect width=\"9\" height=\"6\" x=\"9\" y=\"14\" rx=\"2\" /><path d=\"M22 22V2\" />","align-horizontal-distribute-center":"<rect width=\"6\" height=\"14\" x=\"4\" y=\"5\" rx=\"2\" /><rect width=\"6\" height=\"10\" x=\"14\" y=\"7\" rx=\"2\" /><path d=\"M17 22v-5\" /><path d=\"M17 7V2\" /><path d=\"M7 22v-3\" /><path d=\"M7 5V2\" />","align-start-horizontal":"<rect width=\"6\" height=\"16\" x=\"4\" y=\"6\" rx=\"2\" /><rect width=\"6\" height=\"9\" x=\"14\" y=\"6\" rx=\"2\" /><path d=\"M22 2H2\" />","align-start-vertical":"<rect width=\"9\" height=\"6\" x=\"6\" y=\"14\" rx=\"2\" /><rect width=\"16\" height=\"6\" x=\"6\" y=\"4\" rx=\"2\" /><path d=\"M2 2v20\" />","align-vertical-distribute-center":"<path d=\"M22 17h-3\" /><path d=\"M22 7h-5\" /><path d=\"M5 17H2\" /><path d=\"M7 7H2\" /><rect x=\"5\" y=\"14\" width=\"14\" height=\"6\" rx=\"2\" /><rect x=\"7\" y=\"4\" width=\"10\" height=\"6\" rx=\"2\" />","arrow-down":"<path d=\"M12 5v14\" /><path d=\"m19 12-7 7-7-7\" />","arrow-up":"<path d=\"m5 12 7-7 7 7\" /><path d=\"M12 19V5\" />","arrow-up-right":"<path d=\"M7 7h10v10\" /><path d=\"M7 17 17 7\" />","arrow-left-right":"<path d=\"M8 3 4 7l4 4\" /><path d=\"M4 7h16\" /><path d=\"m16 21 4-4-4-4\" /><path d=\"M20 17H4\" />","brush":"<path d=\"m9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08\" /><path d=\"M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z\" />","camera":"<path d=\"M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z\" /><circle cx=\"12\" cy=\"13\" r=\"3\" />","check":"<path d=\"M20 6 9 17l-5-5\" />","chevron-down":"<path d=\"m6 9 6 6 6-6\" />","chevron-left":"<path d=\"m15 18-6-6 6-6\" />","chevron-right":"<path d=\"m9 18 6-6-6-6\" />","chevrons-down":"<path d=\"m7 6 5 5 5-5\" /><path d=\"m7 13 5 5 5-5\" />","chevrons-left-right":"<path d=\"m9 7-5 5 5 5\" /><path d=\"m15 7 5 5-5 5\" />","chevrons-up":"<path d=\"m17 11-5-5-5 5\" /><path d=\"m17 18-5-5-5 5\" />","circle-x":"<circle cx=\"12\" cy=\"12\" r=\"10\" /><path d=\"m15 9-6 6\" /><path d=\"m9 9 6 6\" />","clipboard-copy":"<rect width=\"8\" height=\"4\" x=\"8\" y=\"2\" rx=\"1\" ry=\"1\" /><path d=\"M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2\" /><path d=\"M16 4h2a2 2 0 0 1 2 2v4\" /><path d=\"M21 14H11\" /><path d=\"m15 10-4 4 4 4\" />","clock":"<circle cx=\"12\" cy=\"12\" r=\"10\" /><polyline points=\"12 6 12 12 16 14\" />","columns-2":"<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" /><path d=\"M12 3v18\" />","copy":"<rect width=\"14\" height=\"14\" x=\"8\" y=\"8\" rx=\"2\" ry=\"2\" /><path d=\"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2\" />","corner-right-down":"<path d=\"m10 15 5 5 5-5\" /><path d=\"M4 4h7a4 4 0 0 1 4 4v12\" />","database":"<ellipse cx=\"12\" cy=\"5\" rx=\"9\" ry=\"3\" /><path d=\"M3 5V19A9 3 0 0 0 21 19V5\" /><path d=\"M3 12A9 3 0 0 0 21 12\" />","dices":"<rect width=\"12\" height=\"12\" x=\"2\" y=\"10\" rx=\"2\" ry=\"2\" /><path d=\"m17.92 14 3.5-3.5a2.24 2.24 0 0 0 0-3l-5-4.92a2.24 2.24 0 0 0-3 0L10 6\" /><path d=\"M6 18h.01\" /><path d=\"M10 14h.01\" /><path d=\"M15 6h.01\" /><path d=\"M18 9h.01\" />","download":"<path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\" /><polyline points=\"7 10 12 15 17 10\" /><line x1=\"12\" x2=\"12\" y1=\"15\" y2=\"3\" />","eraser":"<path d=\"m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21\" /><path d=\"M22 21H7\" /><path d=\"m5 11 9 9\" />","expand":"<path d=\"m21 21-6-6m6 6v-4.8m0 4.8h-4.8\" /><path d=\"M3 16.2V21m0 0h4.8M3 21l6-6\" /><path d=\"M21 7.8V3m0 0h-4.8M21 3l-6 6\" /><path d=\"M3 7.8V3m0 0h4.8M3 3l6 6\" />","eye-off":"<path d=\"M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49\" /><path d=\"M14.084 14.158a3 3 0 0 1-4.242-4.242\" /><path d=\"M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143\" /><path d=\"m2 2 20 20\" />","eye":"<path d=\"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0\" /><circle cx=\"12\" cy=\"12\" r=\"3\" />","film":"<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" /><path d=\"M7 3v18\" /><path d=\"M3 7.5h4\" /><path d=\"M3 12h18\" /><path d=\"M3 16.5h4\" /><path d=\"M17 3v18\" /><path d=\"M17 7.5h4\" /><path d=\"M17 16.5h4\" />","folder":"<path d=\"M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z\" />","folder-plus":"<path d=\"M12 10v6\" /><path d=\"M9 13h6\" /><path d=\"M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z\" />","frame":"<line x1=\"22\" x2=\"2\" y1=\"6\" y2=\"6\" /><line x1=\"22\" x2=\"2\" y1=\"18\" y2=\"18\" /><line x1=\"6\" x2=\"6\" y1=\"2\" y2=\"22\" /><line x1=\"18\" x2=\"18\" y1=\"2\" y2=\"22\" />","git-fork":"<circle cx=\"12\" cy=\"18\" r=\"3\" /><circle cx=\"6\" cy=\"6\" r=\"3\" /><circle cx=\"18\" cy=\"6\" r=\"3\" /><path d=\"M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9\" /><path d=\"M12 12v3\" />","grid-2x2":"<path d=\"M12 3v18\" /><path d=\"M3 12h18\" /><rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\" />","group":"<path d=\"M3 7V5c0-1.1.9-2 2-2h2\" /><path d=\"M17 3h2c1.1 0 2 .9 2 2v2\" /><path d=\"M21 17v2c0 1.1-.9 2-2 2h-2\" /><path d=\"M7 21H5c-1.1 0-2-.9-2-2v-2\" /><rect width=\"7\" height=\"5\" x=\"7\" y=\"7\" rx=\"1\" /><rect width=\"7\" height=\"5\" x=\"10\" y=\"12\" rx=\"1\" />","image-plus":"<path d=\"M16 5h6\" /><path d=\"M19 2v6\" /><path d=\"M21 11.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7.5\" /><path d=\"m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21\" /><circle cx=\"9\" cy=\"9\" r=\"2\" />","image":"<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" ry=\"2\" /><circle cx=\"9\" cy=\"9\" r=\"2\" /><path d=\"m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21\" />","images":"<path d=\"M18 22H4a2 2 0 0 1-2-2V6\" /><path d=\"m22 13-1.296-1.296a2.41 2.41 0 0 0-3.408 0L11 18\" /><circle cx=\"12\" cy=\"8\" r=\"2\" /><rect width=\"16\" height=\"16\" x=\"6\" y=\"2\" rx=\"2\" />","key-round":"<path d=\"M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z\" /><circle cx=\"16.5\" cy=\"7.5\" r=\".5\" fill=\"currentColor\" />","keyboard":"<path d=\"M10 8h.01\" /><path d=\"M12 12h.01\" /><path d=\"M14 8h.01\" /><path d=\"M16 12h.01\" /><path d=\"M18 8h.01\" /><path d=\"M6 8h.01\" /><path d=\"M7 16h10\" /><path d=\"M8 12h.01\" /><rect width=\"20\" height=\"16\" x=\"2\" y=\"4\" rx=\"2\" />","layers":"<path d=\"M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z\" /><path d=\"M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12\" /><path d=\"M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17\" />","library":"<path d=\"m16 6 4 14\" /><path d=\"M12 6v14\" /><path d=\"M8 8v12\" /><path d=\"M4 4v16\" />","list-ordered":"<path d=\"M10 12h11\" /><path d=\"M10 18h11\" /><path d=\"M10 6h11\" /><path d=\"M4 10h2\" /><path d=\"M4 6h1v4\" /><path d=\"M6 18H4c0-1 2-2 2-3s-1-1.5-2-1\" />","loader-circle":"<path d=\"M21 12a9 9 0 1 1-6.219-8.56\" />","lock-open":"<rect width=\"18\" height=\"11\" x=\"3\" y=\"11\" rx=\"2\" ry=\"2\" /><path d=\"M7 11V7a5 5 0 0 1 9.9-1\" />","lock":"<rect width=\"18\" height=\"11\" x=\"3\" y=\"11\" rx=\"2\" ry=\"2\" /><path d=\"M7 11V7a5 5 0 0 1 10 0v4\" />","map":"<path d=\"M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z\" /><path d=\"M15 5.764v15\" /><path d=\"M9 3.236v15\" />","maximize":"<path d=\"M8 3H5a2 2 0 0 0-2 2v3\" /><path d=\"M21 8V5a2 2 0 0 0-2-2h-3\" /><path d=\"M3 16v3a2 2 0 0 0 2 2h3\" /><path d=\"M16 21h3a2 2 0 0 0 2-2v-3\" />","message-circle":"<path d=\"M7.9 20A9 9 0 1 0 4 16.1L2 22Z\" />","minus":"<path d=\"M5 12h14\" />","package":"<path d=\"M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z\" /><path d=\"M12 22V12\" /><path d=\"m3.3 7 7.703 4.734a2 2 0 0 0 1.994 0L20.7 7\" /><path d=\"m7.5 4.27 9 5.15\" />","palette":"<circle cx=\"13.5\" cy=\"6.5\" r=\".5\" fill=\"currentColor\" /><circle cx=\"17.5\" cy=\"10.5\" r=\".5\" fill=\"currentColor\" /><circle cx=\"8.5\" cy=\"7.5\" r=\".5\" fill=\"currentColor\" /><circle cx=\"6.5\" cy=\"12.5\" r=\".5\" fill=\"currentColor\" /><path d=\"M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z\" />","pause":"<rect x=\"14\" y=\"4\" width=\"4\" height=\"16\" rx=\"1\" /><rect x=\"6\" y=\"4\" width=\"4\" height=\"16\" rx=\"1\" />","pen-line":"<path d=\"M12 20h9\" /><path d=\"M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z\" />","pen-tool":"<path d=\"M15.707 21.293a1 1 0 0 1-1.414 0l-1.586-1.586a1 1 0 0 1 0-1.414l5.586-5.586a1 1 0 0 1 1.414 0l1.586 1.586a1 1 0 0 1 0 1.414z\" /><path d=\"m18 13-1.375-6.874a1 1 0 0 0-.746-.776L3.235 2.028a1 1 0 0 0-1.207 1.207L5.35 15.879a1 1 0 0 0 .776.746L13 18\" /><path d=\"m2.3 2.3 7.286 7.286\" /><circle cx=\"11\" cy=\"11\" r=\"2\" />","pin":"<path d=\"M12 17v5\" /><path d=\"M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z\" />","play":"<polygon points=\"6 3 20 12 6 21 6 3\" />","plug":"<path d=\"M12 22v-5\" /><path d=\"M9 8V2\" /><path d=\"M15 8V2\" /><path d=\"M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z\" />","plus":"<path d=\"M5 12h14\" /><path d=\"M12 5v14\" />","rotate-ccw":"<path d=\"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8\" /><path d=\"M3 3v5h5\" />","save":"<path d=\"M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z\" /><path d=\"M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7\" /><path d=\"M7 3v4a1 1 0 0 0 1 1h7\" />","scissors":"<circle cx=\"6\" cy=\"6\" r=\"3\" /><path d=\"M8.12 8.12 12 12\" /><path d=\"M20 4 8.12 15.88\" /><circle cx=\"6\" cy=\"18\" r=\"3\" /><path d=\"M14.8 14.8 20 20\" />","settings":"<path d=\"M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z\" /><circle cx=\"12\" cy=\"12\" r=\"3\" />","shuffle":"<path d=\"m18 14 4 4-4 4\" /><path d=\"m18 2 4 4-4 4\" /><path d=\"M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22\" /><path d=\"M2 6h1.972a4 4 0 0 1 3.6 2.2\" /><path d=\"M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45\" />","sliders-horizontal":"<line x1=\"21\" x2=\"14\" y1=\"4\" y2=\"4\" /><line x1=\"10\" x2=\"3\" y1=\"4\" y2=\"4\" /><line x1=\"21\" x2=\"12\" y1=\"12\" y2=\"12\" /><line x1=\"8\" x2=\"3\" y1=\"12\" y2=\"12\" /><line x1=\"21\" x2=\"16\" y1=\"20\" y2=\"20\" /><line x1=\"12\" x2=\"3\" y1=\"20\" y2=\"20\" /><line x1=\"14\" x2=\"14\" y1=\"2\" y2=\"6\" /><line x1=\"8\" x2=\"8\" y1=\"10\" y2=\"14\" /><line x1=\"16\" x2=\"16\" y1=\"18\" y2=\"22\" />","sparkles":"<path d=\"M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z\" /><path d=\"M20 3v4\" /><path d=\"M22 5h-4\" /><path d=\"M4 17v2\" /><path d=\"M5 18H3\" />","star":"<path d=\"M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z\" />","tag":"<path d=\"M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z\" /><circle cx=\"7.5\" cy=\"7.5\" r=\".5\" fill=\"currentColor\" />","trash-2":"<path d=\"M3 6h18\" /><path d=\"M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6\" /><path d=\"M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2\" /><line x1=\"10\" x2=\"10\" y1=\"11\" y2=\"17\" /><line x1=\"14\" x2=\"14\" y1=\"11\" y2=\"17\" />","triangle-alert":"<path d=\"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3\" /><path d=\"M12 9v4\" /><path d=\"M12 17h.01\" />","type":"<polyline points=\"4 7 4 4 20 4 20 7\" /><line x1=\"9\" x2=\"15\" y1=\"20\" y2=\"20\" /><line x1=\"12\" x2=\"12\" y1=\"4\" y2=\"20\" />","ungroup":"<rect width=\"8\" height=\"6\" x=\"5\" y=\"4\" rx=\"1\" /><rect width=\"8\" height=\"6\" x=\"11\" y=\"14\" rx=\"1\" />","upload":"<path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\" /><polyline points=\"17 8 12 3 7 8\" /><line x1=\"12\" x2=\"12\" y1=\"3\" y2=\"15\" />","wand-sparkles":"<path d=\"m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72\" /><path d=\"m14 7 3 3\" /><path d=\"M5 6v4\" /><path d=\"M19 14v4\" /><path d=\"M10 2v2\" /><path d=\"M7 8H3\" /><path d=\"M21 16h-4\" /><path d=\"M11 3H9\" />","x":"<path d=\"M18 6 6 18\" /><path d=\"m6 6 12 12\" />","unlink":"<path d=\"m18.84 12.25 1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71\" /><path d=\"m5.17 11.75-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71\" /><line x1=\"8\" x2=\"8\" y1=\"2\" y2=\"5\" /><line x1=\"2\" x2=\"5\" y1=\"8\" y2=\"8\" /><line x1=\"16\" x2=\"16\" y1=\"19\" y2=\"22\" /><line x1=\"19\" x2=\"22\" y1=\"16\" y2=\"16\" />","mouse-pointer-click":"<path d=\"M14 4.1 12 6\" /><path d=\"m5.1 8-2.9-.8\" /><path d=\"m6 12-1.9 2\" /><path d=\"M7.2 2.2 8 5.1\" /><path d=\"M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z\" />","zap":"<path d=\"M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z\" />","history":"<path d=\"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8\" /><path d=\"M3 3v5h5\" /><path d=\"M12 7v5l4 2\" />"};
    function ic(name, size) {
      return h('svg', {
        viewBox: '0 0 24 24', width: size || 14, height: size || 14, fill: 'none',
        stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
        dangerouslySetInnerHTML: { __html: ICONS[name] || '' },
        'aria-hidden': true,
      })
    }
    // ─── v10：自定义下拉（替代原生 select：系统弹层与深色 UI 脱节）───
    // P1-4：键盘可达 + portal 防裁剪——Enter/Space 展开、↑↓/Home/End 移动高亮、Enter 选中、
    // Esc/Tab 关闭、首字母 typeahead；role=listbox/option + aria-expanded/activedescendant。
    // 弹层 portal 挂 body：fixed 定位在触发钮下方，下方视口放不下自动翻转到上方，
    // 不再被 overflow 滚动容器裁剪；宿主缺 react-dom 时降级原地渲染并按 .snx-pro 包含块换算坐标。
    let snxSelSeq = 0
    function SnxSelect(props) {
      const [open, setOpen] = useState(false)
      const [active, setActive] = useState(-1)   // 键盘高亮项下标（≠选中项）
      const [pos, setPos] = useState(null)       // 弹层 fixed 坐标；null=首帧离屏，测完尺寸再就位防闪跳
      const btnRef = useRef(null)
      const popRef = useRef(null)
      const idRef = useRef(null)
      if (idRef.current === null) idRef.current = 'snx-sel-' + (++snxSelSeq)
      const options = props.options || []
      const cur = options.find((o) => o.value === props.value) || options[0]
      // 键盘/定时回调里读最新值（避免闭包旧值）
      const optsRef = useRef(options)
      optsRef.current = options
      const valRef = useRef(props.value)
      valRef.current = props.value
      const changeRef = useRef(props.onChange)
      changeRef.current = props.onChange
      const pick = (o) => {
        setOpen(false)
        if (o && o.value !== valRef.current && changeRef.current) changeRef.current(o.value)
      }
      const labelOf = (o) => String((o && o.label) || '').trim().toLowerCase()
      const openMenu = () => {
        const os = optsRef.current
        const i = os.findIndex((o) => o.value === valRef.current)
        setActive(os.length ? (i >= 0 ? i : 0) : -1)
        setPos(null)
        setOpen(true)
      }
      const moveActive = (next) => {
        const n = optsRef.current.length
        if (!n) return
        setActive(((next % n) + n) % n)
      }
      // 高亮项跟随滚动到可视区
      useEffect(() => {
        if (!open || active < 0) return
        const el = popRef.current
        const node = el && el.children[active]
        if (node && node.scrollIntoView) node.scrollIntoView({ block: 'nearest' })
      }, [active, open])
      // 外点/窗口尺寸变化关闭（弹层在 portal 里，须同时排除触发钮与弹层自身）
      useEffect(() => {
        if (!open) return
        const close = (e) => {
          const t = e.target
          if (btnRef.current && btnRef.current.contains(t)) return
          if (popRef.current && popRef.current.contains(t)) return
          setOpen(false)
        }
        const onResize = () => setOpen(false)
        const onScroll = (e) => {
          // fixed 定位不随容器滚动，滚动即收起防错位；弹层自身列表滚动除外
          if (popRef.current && popRef.current.contains(e.target)) return
          setOpen(false)
        }
        window.addEventListener('mousedown', close)
        window.addEventListener('resize', onResize)
        window.addEventListener('scroll', onScroll, true)
        return () => {
          window.removeEventListener('mousedown', close)
          window.removeEventListener('resize', onResize)
          window.removeEventListener('scroll', onScroll, true)
        }
      }, [open])
      // 首帧实测弹层尺寸：贴触发钮下方；下方放不下且上方更宽裕 → 翻转到上方
      useLayoutEffect(() => {
        if (!open) return
        const btn = btnRef.current, el = popRef.current
        if (!btn || !el) return
        const br = btn.getBoundingClientRect()
        const pr = el.getBoundingClientRect()
        const popH = pr.height || 0
        const spaceBelow = window.innerHeight - br.bottom
        const up = spaceBelow < popH + 8 && br.top > spaceBelow
        const minW = Math.max(br.width, props.popWidth || 0)
        if (reactDomPortal) {
          setPos(Object.assign({
            left: Math.max(8, Math.min(br.left, window.innerWidth - pr.width - 8)),
            minWidth: minW,
          }, up ? { bottom: window.innerHeight - br.top + 4 } : { top: br.bottom + 4 }))
        } else {
          const hr = fixedOffsetHost()
          setPos(Object.assign({
            left: Math.max(8, Math.min(br.left - hr.left, hr.right - hr.left - pr.width - 8)),
            minWidth: minW,
          }, up ? { bottom: hr.bottom - br.top + 4 } : { top: br.bottom - hr.top + 4 }))
        }
      }, [open])
      const onBtnKeyDown = (e) => {
        const os = optsRef.current
        if (!open) {
          if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault(); openMenu()
          } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            // 关闭态 typeahead：首字母直接选中生效（对齐原生 select 语义）
            const hit = os.find((o) => labelOf(o).startsWith(e.key.toLowerCase()))
            if (hit && hit.value !== valRef.current && changeRef.current) { e.preventDefault(); changeRef.current(hit.value) }
          }
          return
        }
        if (e.key === 'ArrowDown') { e.preventDefault(); moveActive(active + 1) }
        else if (e.key === 'ArrowUp') { e.preventDefault(); moveActive(active - 1) }
        else if (e.key === 'Home') { e.preventDefault(); moveActive(0) }
        else if (e.key === 'End') { e.preventDefault(); moveActive(os.length - 1) }
        else if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); pick(os[active]) }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false) }
        else if (e.key === 'Tab') { setOpen(false) }
        else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          // 展开态 typeahead：跳到首个首字母匹配项；重复按键继续匹配下一个
          const idx = os.findIndex((o) => labelOf(o).startsWith(e.key.toLowerCase()))
          if (idx >= 0) {
            e.preventDefault()
            if (active === idx) {
              const nxt = os.slice(idx + 1).findIndex((o) => labelOf(o).startsWith(e.key.toLowerCase()))
              moveActive(nxt >= 0 ? idx + 1 + nxt : idx)
            } else moveActive(idx)
          }
        }
      }
      return h('div', { className: 'snx-sel', style: props.width ? { width: props.width } : null, title: props.title },
        h('button', {
          type: 'button', className: 'snx-sel-btn', ref: btnRef,
          onClick: () => (open ? setOpen(false) : openMenu()),
          onKeyDown: onBtnKeyDown,
          'aria-haspopup': 'listbox', 'aria-expanded': open,
          'aria-controls': open ? idRef.current : undefined,
          'aria-activedescendant': open && active >= 0 ? idRef.current + '-opt-' + active : undefined,
        },
          // v12.1：值不在选项集(如行级回填了历史模型名)时回显原始值——否则用户以为没填上(独立审计新发现 3)
          h('span', { className: 'lb' }, cur ? cur.label : (props.value ? String(props.value) : '—')),
          ic('chevron-down', 12)),
        open ? portalToBody(h('div', {
          className: 'snx-sel-pop', ref: popRef, id: idRef.current, role: 'listbox',
          style: Object.assign({
            position: 'fixed', left: ((pos && pos.left) || -9999) + 'px', top: ((pos && pos.top) || -9999) + 'px',
            minWidth: pos ? pos.minWidth : (props.popWidth || undefined),
          }, pos && pos.bottom !== undefined ? { top: 'auto', bottom: pos.bottom + 'px' } : null),
        },
          options.map((o, i) => h('div', {
            key: o.value, role: 'option', id: idRef.current + '-opt-' + i,
            'aria-selected': o.value === props.value,
            className: 'snx-sel-opt' + (o.value === props.value ? ' on' : '') + (i === active ? ' hl' : ''),
            onMouseDown: (e) => e.preventDefault(),   // 焦点保持在触发钮上，键盘链路不断
            onClick: () => pick(o),
          }, h('span', null, o.label), o.value === props.value ? h('span', { className: 'd' }, ic('check', 12)) : null)),
        )) : null)
    }

    // v8.1：可选支持 dsh-better-sidebar（软依赖 — ctx.betterSidebar 不存在时静默回退到原生右栏注册）
    const hasBetterSidebar = (ctx) => { try { return ctx && ctx.get && !!ctx.get('betterSidebar') } catch { return false } }
    const React = require('react')
    const { useState, useEffect, useLayoutEffect, useRef, useMemo, createElement: h } = React

    // ——— 数据访问（同源 fetch）———
    function post(url, body, signal) {
      return fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal })
        .then(async (r) => ({ ok: r.ok, ...(await r.json().catch(() => ({}))) }))
    }
    function get(url) { return fetch(url).then(async (r) => ({ ok: r.ok, ...(await r.json().catch(() => ({}))) })) }
    function put(url, body) {
      // SPEC-14 二.3：带回 status——画布 PUT 需要区分 409（其他会话已写入）与普通失败
      return fetch(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
        .then(async (r) => ({ ok: r.ok, status: r.status, ...(await r.json().catch(() => ({}))) }))
    }
    function del(url) { return fetch(url, { method: 'DELETE' }).then((r) => ({ ok: r.ok })) }

    const CANVAS_ROUTE = '/api/sensenova/canvas'
    const CONFIG_ROUTE = '/api/sensenova/config'
    const STATUS_ROUTE = '/api/sensenova/status'

    // ——— Phase 2：会话桥（deck 同款三级降级：sendSession → session.prompt → scoped send）———
    let bridge = null
    function initBridge(ctx) {
      bridge = { sessions: ctx.sessions || null, conversation: ctx.conversation || null }
    }
    function currentSessionId() {
      try {
        const snap = bridge && bridge.sessions && bridge.sessions.list ? bridge.sessions.list.getSnapshot() : null
        return snap && snap.current ? snap.current : null
      } catch { return null }
    }
    function canvasContextText(node) {
      const nodes = store.doc.nodes
      const others = nodes.filter((n) => !node || n.id !== node.id).slice(-8)
        .map((n) => `[${n.id}](${n.x},${n.y}) "${String(n.prompt || '').slice(0, 30)}"`)
      return [
        '【来自生图画布】附图 = 画布当前选中图' + (node && node.prompt ? `（其来源提示词：${String(node.prompt).slice(0, 80)}）` : '') + '。',
        `画布共 ${nodes.length} 张` + (others.length ? '；其他节点：' + others.join(' ') : '') + '。',
      ].join(' ')
    }
    async function askAgent(text, imageSrc) {
      if (!bridge || !bridge.sessions) throw new Error('此 dsh 版本不支持插件直发会话')
      let sid = currentSessionId()
      if (!sid && typeof bridge.sessions.create === 'function') {
        sid = await bridge.sessions.create({})
        try { bridge.sessions.open(sid) } catch { }
      }
      if (!sid) throw new Error('没有当前会话')
      let session = null
      for (let i = 0; i < 10; i++) {
        try { session = bridge.sessions.binding ? (bridge.sessions.binding(sid) || {}).session || null : null } catch { session = null }
        if (session) break
        await new Promise((r) => setTimeout(r, 200))
      }
      if (!session) throw new Error('会话绑定不可用')
      const imageIds = []
      if (imageSrc && bridge.conversation && typeof bridge.conversation.createDraftImages === 'function') {
        try {
          const blob = await (await fetch(imageSrc)).blob()
          const file = new window.File([blob], 'canvas.png', { type: blob.type || 'image/png' })
          const atts = bridge.conversation.createDraftImages([file])
          atts.forEach((a) => { if (a && a.id) imageIds.push(a.id) })
        } catch { /* 附图失败降级纯文本 */ }
      }
      if (bridge.conversation && typeof bridge.conversation.sendSession === 'function') {
        try { await bridge.conversation.sendSession(session, text, imageIds, 'queue'); return } catch { }
      }
      const r = await session.prompt([{ type: 'text', text }], 'queue')
      if (r && r.ok) return
      throw new Error('发送失败')
    }

    // ——— 开关状态（localStorage + window 事件；deck 同款）———
    const LS_OPEN = 'dsh-sensenova-open'
    const EVT = 'snx-open-changed'
    function isOpen() {
      try { return localStorage.getItem(LS_OPEN) === '1' } catch { return false }
    }
    function setOpen(v) {
      try { localStorage.setItem(LS_OPEN, v ? '1' : '0') } catch { }
      try { window.dispatchEvent(new CustomEvent(EVT)) } catch { }
    }

    function isTyping(e) {
      const t = e.target
      return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
    }

    // ── P2-2：toast 严重度推断——失败类红、完成类绿、其余中性（notify 可显式传 kind 覆盖）──
    function toastKindOf(msg) {
      if (/失败[:：（(]|错误|无法|不可用|超时|过大|已拒收|未配置/.test(msg)) return 'err'
      if (/已|成功|完成/.test(msg)) return 'ok'
      return 'info'
    }
    // 模块层（runOne/persistRef 等拿不到 notify 的地方）向 Workbench 投递 toast 的桥
    function toastBus(msg, kind) {
      try { window.dispatchEvent(new CustomEvent('snx:notify', { detail: { msg: String(msg || ''), kind } })) } catch { }
    }

    // ——— P0-4：模态栈（后进先出）———
    // 灯箱/帮助/应用内确认弹窗等打开时入栈：画布 window keydown 见 modalOpen() 让路，Esc 只归栈顶。
    // 后续应用内确认弹窗的注册口：const entry = modalPush(() => onCancel())；关闭/卸载时 modalPop(entry)。
    const modalStack = []
    function modalPush(onEsc, opts) { const entry = { onEsc: onEsc || null, soft: !!(opts && opts.soft) }; modalStack.push(entry); return entry }
    function modalPop(entry) { const i = modalStack.indexOf(entry); if (i >= 0) modalStack.splice(i, 1) }
    function modalTop() { return modalStack.length ? modalStack[modalStack.length - 1] : null }
    // soft 条目（全屏画布）只消费 Esc，不算模态：画布快捷键在全屏态照常工作
    function modalOpen() { return modalStack.some((e) => !e.soft) }
    // ─── v11.2：模态栈 Esc 分发器（capture 阶段统一分发）───
    // Esc 且栈顶带真实 onEsc → stopPropagation 独占消费：画布/灯箱/确认弹窗自带的 Esc 分支
    // 不再收到同一事件（其分支保留为死代码可接受），修复一键多消费/双触发。
    // 注册点：ContextMenu / GalContextMenu / HelpOverlay / Lightbox / 全屏画布(soft)。
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return
        if (document.querySelector('.snx-sel-pop')) return   // SnxSelect 下拉展开：让它自己的 Esc 收起，别放大成关掉整个模态
        const top = modalTop()
        if (top && typeof top.onEsc === 'function') { e.stopPropagation(); top.onEsc() }
      }, true)
    }

    // ——— P1-3：浮层 portal 挂 body（右键菜单/批量确认/拖拽 ghost）———
    // .snx-pro 是 container-type 容器：position:fixed 的后代会被它收编为包含块，
    // 挂 body 才能用视口坐标且不被画廊滚动容器裁剪。宿主 loader 没有 react-dom 时降级为
    // 原地渲染，坐标按 .snx-pro 矩形换算（fixedOffsetHost）。
    let reactDomPortal = null
    try {
      const rdm = require('react-dom')
      if (rdm && typeof rdm.createPortal === 'function') reactDomPortal = rdm.createPortal
    } catch { }
    function portalToBody(el) {
      if (reactDomPortal && typeof document !== 'undefined') return reactDomPortal(el, document.body)
      return el
    }
    // portal 降级时，视口坐标 → .snx-pro 包含块坐标 的偏移
    function fixedOffsetHost() {
      if (reactDomPortal || typeof document === 'undefined') return { left: 0, top: 0, right: 0, bottom: 0 }
      const host = document.querySelector('.snx-pro')
      const r = host ? host.getBoundingClientRect() : { left: 0, top: 0, right: 0, bottom: 0 }
      return r
    }

    // ——— 样式 ———
    const css = `
/* ── 主题令牌（跟随 dsh 亮/暗主题；每个 var 第二参为旧宿主回退色 = 暗色观感）──
   单一强调色：宿主主色（DeepSeek 蓝）；错误/成功/警示用宿主状态色 */
.snx-cv,.snx-pro,.snx-cfg,.snx-tv,.snx-lb,.snx-fs,.snx-help,.snx-bsb-preview,.snx-sidebtn,.snx-rb-title,
.snx-gal-menu,.snx-gal-drag-ghost,.snx-cfm-backdrop,.snx-cv-menu,.snx-sel-pop,.snx-gen-decide,.snx-tvlb{
  --snx-accent:var(--dsw-alias-link,#7aaaff);
  --snx-accent-fill:var(--dsw-alias-button-info-fill,#7aaaff);
  --snx-accent-fill-hover:var(--dsw-alias-button-info-hover,#4176e6);
  --snx-on-accent:var(--dsw-alias-label-primary-foreground,#fff);
  --snx-error:var(--dsw-alias-state-error-primary,#f25a5a);
  --snx-ok:var(--dsw-alias-state-success-primary,#22c55e);
  --snx-warn:var(--dsw-alias-state-warn-secondary,#f7ad31);
}
/* v4.2+：rightbar tab 模式（不再挂 sidebarCol DOM，也不是全屏遮挡/右侧抽屉）
   思路：ctx.sidebarRightTabs.register 注册 tab 类型 + slots.inject('sidebar.right.pane.tab')
   渲染 WorkbenchBoundary（WBErrorBoundary > Workbench），与文件浏览器 tab 并排。
   窄布局用 @container snxpro 容器查询自适应，不依赖宿主 DOM 选择器 */
.snx-cv{position:relative;display:flex;flex-direction:column;width:100%;height:100%;
  background:var(--dsw-alias-bg-layer-1,#232324);color:var(--dsw-alias-label-primary,#f9fafb);
  font-family:var(--dsw-font-family,"Segoe UI","Microsoft YaHei",sans-serif);overflow:hidden}
.snx-cv-top{height:44px;flex-shrink:0;display:flex;align-items:center;gap:14px;padding:0 16px;
  border-bottom:1px solid var(--dsw-alias-border-l2,#ffffff1f);background:var(--dsw-alias-bg-layer-2,#2c2c2e)}
.snx-cv-top .brand{font-weight:900;font-size:14px;letter-spacing:.06em;color:var(--dsw-alias-label-primary,#f9fafb)}
.snx-cv-top .brand b{color:var(--snx-accent)}
.snx-cv-top .key{font-size:11px;padding:2px 9px;border-radius:9px;border:1px solid var(--dsw-alias-border-l2,#ffffff1f);color:var(--dsw-alias-label-tertiary,#adb2b8)}
.snx-cv-top .key.ok{color:var(--snx-accent);border-color:color-mix(in srgb,var(--snx-accent) 40%,transparent)}
.snx-cv-top .key.no{color:var(--snx-error);border-color:color-mix(in srgb,var(--snx-error) 40%,transparent)}
.snx-cv-top button{background:none;border:1px solid var(--dsw-alias-border-l2,#ffffff1f);color:var(--dsw-alias-label-secondary,#cfd3d6);padding:4px 10px;border-radius:6px;
  cursor:pointer;font-size:12px;font-family:inherit;transition:all .15s}
.snx-cv-top button:hover{border-color:var(--snx-accent);color:var(--dsw-alias-label-primary,#f9fafb);background:color-mix(in srgb,var(--snx-accent) 10%,transparent)}
.snx-cv-main{flex:1;display:flex;flex-direction:row;min-height:0;min-width:0}
.snx-cv-wrap{flex:1;position:relative;overflow:hidden;background-color:var(--dsw-alias-bg-layer-1,#232324);
  background-image:radial-gradient(var(--dsw-alias-interactive-bg-hover,#ffffff14) 1px,transparent 1px);min-width:0}
[data-snx-stage]{position:absolute;inset:0}
/* 容器查询：rightbar < 720px 时改为竖排（画布在上，参数面板在下）
   rightbar 通常在 ~360-420px，所以默认就是窄布局 */
.snx-cv{container-type:inline-size;container-name:snx}
@container snx (max-width:719px){
  .snx-cv{flex-direction:column}
  .snx-cv-main{flex-direction:column}
  .snx-cv-top{height:38px;padding:0 10px;gap:8px;font-size:12px}
  .snx-cv-top .brand{font-size:12px}
  .snx-cv-top .key{display:none}
  .snx-cv-top button{padding:3px 8px;font-size:11px}
}
.snx-cv-zoom{position:absolute;left:14px;bottom:14px;display:flex;gap:4px;z-index:5}
.snx-cv-zoom button{width:30px;height:28px;background:var(--dsw-alias-button-floating-fill,#2c2c2e);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);color:var(--dsw-alias-label-secondary,#cfd3d6);
  border-radius:6px;cursor:pointer;font-size:13px}
.snx-cv-zoom button:hover{color:var(--snx-accent);border-color:var(--snx-accent)}
.snx-cv-zoom .pct{min-width:52px;display:flex;align-items:center;justify-content:center;font-size:11px;
  color:var(--dsw-alias-label-tertiary,#adb2b8);background:var(--dsw-alias-button-floating-fill,#2c2c2e);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:6px}
/* v11.2：portal 挂 body——z-index 抬到全屏画布(9998)/灯箱(9999)/帮助(10000)之上，
   画布菜单在全屏态也能盖住（画廊菜单 10020 / 确认弹窗 10040 仍在其上）*/
.snx-cv-menu{position:fixed;z-index:10010;background:var(--dsw-alias-bg-layer-3,#353638);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:8px;
  padding:4px;min-width:150px;box-shadow:0 12px 32px rgba(0,0,0,.28)}
.snx-cv-menu button{display:block;width:100%;text-align:left;background:none;border:none;color:var(--dsw-alias-label-primary,#f9fafb);
  padding:7px 12px;font-size:12.5px;cursor:pointer;border-radius:5px;font-family:inherit}
.snx-cv-menu button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,#ffffff14);color:var(--snx-accent)}
.snx-cv-menu button:disabled{color:var(--dsw-alias-label-caption,#81858c);cursor:default}
.snx-cv-menu .sep{height:1px;background:var(--dsw-alias-border-l2,#ffffff1f);margin:4px 6px}
/* 设置卡片（v4.1 重排版：强样式覆盖，避开宿主 settings 页的影响） */
.snx-cfg{padding:4px 0;color:var(--dsw-alias-label-primary,#f9fafb)}
.snx-cfg-row{margin-bottom:20px}
.snx-cfg-row>label.snx-cfg-lb{display:block;font-size:13px;color:var(--dsw-alias-label-primary,#f9fafb)!important;font-weight:600;
  margin:0 0 4px;letter-spacing:.02em}
.snx-cfg-hint{display:block;font-size:11.5px;color:var(--dsw-alias-label-tertiary,#adb2b8);margin:0 0 8px;line-height:1.5}
.snx-cfg-row>input.snx-cfg-in{display:block;width:100%;box-sizing:border-box;
  background:var(--dsw-alias-bg-module-platform,#353638)!important;border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:7px;color:var(--dsw-alias-label-primary,#f9fafb)!important;
  padding:9px 12px;font-size:13px;font-family:inherit;outline:none;line-height:1.4;min-height:36px}
.snx-cfg-row>input.snx-cfg-in:focus{border-color:var(--snx-accent);background:var(--dsw-alias-bg-layer-3,#353638)!important}
.snx-cfg-in-wrap{position:relative}
.snx-cfg-in-wrap input.snx-cfg-in{padding-right:42px}
.snx-cfg-eye{position:absolute;right:4px;top:50%;transform:translateY(-50%);
  background:none;border:none;color:var(--dsw-alias-label-tertiary,#adb2b8);cursor:pointer;font-size:14px;padding:6px 10px;border-radius:4px}
.snx-cfg-eye:hover{color:var(--dsw-alias-label-primary,#f9fafb);background:var(--dsw-alias-interactive-bg-hover,#ffffff14)}
.snx-cfg-help{display:block;font-size:11.5px;color:var(--dsw-alias-label-tertiary,#adb2b8);margin:8px 0 0;line-height:1.5;font-style:italic}
.snx-cfg-help b{color:var(--snx-accent);font-style:normal;font-weight:600}
.snx-cfg-actions{display:flex;gap:10px;margin-top:8px;flex-wrap:wrap}
.snx-cfg-go{padding:9px 22px;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:700;
  background:var(--snx-accent-fill)!important;color:var(--dsw-alias-label-primary-foreground,#fff)!important;font-family:inherit;
  transition:filter .15s}
.snx-cfg-go:hover{filter:brightness(1.15)}
.snx-cfg-test{padding:9px 18px;border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:8px;cursor:pointer;
  background:transparent!important;color:var(--dsw-alias-label-primary,#f9fafb)!important;font-size:13px;font-weight:600;font-family:inherit;
  transition:all .15s}
.snx-cfg-test:hover:not(:disabled){border-color:var(--snx-accent);color:var(--snx-accent)!important}
.snx-cfg-test:disabled{opacity:.5;cursor:default}
.snx-cfg-msg{margin-top:14px;padding:10px 14px;border-radius:7px;font-size:12px;
  background:var(--dsw-alias-bg-layer-3,#353638);color:var(--dsw-alias-label-tertiary,#adb2b8);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);line-height:1.5}
.snx-cfg-msg.ok{color:var(--snx-accent);border-color:color-mix(in srgb,var(--snx-accent) 35%,transparent);background:color-mix(in srgb,var(--snx-accent) 7%,transparent)}
.snx-cfg-msg.err{color:var(--snx-error);border-color:color-mix(in srgb,var(--snx-error) 35%,transparent);background:color-mix(in srgb,var(--snx-error) 7%,transparent)}
/* 侧栏按钮（自包含样式 — dsh 左下角小工具按钮） */
/* v15.1:对齐宿主侧栏原触发行样式(VOzbGW_trigger:无边框/透明底/42px 高/hover 浅底)——旧版带框样式与相邻的「设置」原生行割裂(用户点名) */
.snx-sidebtn{display:flex;align-items:center;gap:8px;width:calc(100% + 4px);
  margin:4px -2px;padding:0 10px 0 8px;height:42px;border:none;border-radius:var(--dsw-radius-md,8px);
  background:none;color:var(--dsw-alias-label-primary,#f9fafb);font-family:inherit;font-size:14px;
  line-height:22px;font-weight:inherit;cursor:pointer;overflow:hidden;text-align:left}
.snx-sidebtn:hover{background:var(--dsw-alias-interactive-bg-hover,#ffffff14)}
.snx-sidebtn:active{background:var(--dsw-alias-interactive-bg-active,#ffffff1f)}
.snx-sidebtn svg{width:16px;height:16px;flex-shrink:0;stroke:currentColor}
/* rightbar tab 标题（在 dsh 右栏 tab 标签里显示） */
.snx-rb-title{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600}
.snx-rb-ico{color:var(--snx-accent);font-size:14px;line-height:1}
/* Phase 1：浮动操作条 / 悬浮 prompt bar / 蒙版工具条 / 比例弹层 */
.snx-ab{position:absolute;z-index:6;display:flex;flex-wrap:wrap;justify-content:center;width:max-content;max-width:calc(100% - 16px);gap:1px;background:var(--dsw-alias-button-floating-fill,#2c2c2e);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);
  border-radius:8px;padding:3px;box-shadow:0 8px 24px rgba(0,0,0,.22)}
.snx-ab button{background:none;border:none;color:var(--dsw-alias-label-secondary,#cfd3d6);font-size:12.5px;padding:5px 7px;cursor:pointer;border-radius:5px;font-family:inherit;white-space:nowrap}
.snx-ab button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,#ffffff14);color:var(--snx-accent)}
.snx-ab button:disabled{opacity:.45;cursor:default}
.snx-ab button.warn:hover:not(:disabled){color:var(--snx-error)}
/* v11.2.1：多选操作条左侧计数标签 */
.snx-ab-tag{display:inline-flex;align-items:center;font-size:11px;color:var(--dsw-alias-label-caption,#81858c);padding:0 7px;white-space:nowrap}
.snx-pbar{position:absolute;top:12px;left:12px;right:12px;z-index:6;display:flex;align-items:center;gap:8px;
  background:var(--dsw-alias-button-floating-fill,#2c2c2e);border:1px solid color-mix(in srgb,var(--snx-accent) 30%,transparent);border-radius:10px;padding:7px 9px;
  box-shadow:0 10px 30px rgba(0,0,0,.22)}
.snx-pbar input{flex:1;min-width:0;width:auto;background:var(--dsw-alias-bg-layer-1,#232324);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:7px;
  color:var(--dsw-alias-label-primary,#f9fafb);padding:8px 12px;font-size:13px;font-family:inherit;outline:none}
.snx-pbar input:focus{border-color:var(--snx-accent)}
.snx-pbar .tag{font-size:10.5px;letter-spacing:.08em;color:var(--snx-accent);border:1px solid color-mix(in srgb,var(--snx-accent) 40%,transparent);
  border-radius:4px;padding:3px 8px;white-space:nowrap}
.snx-pbar .tag.t2i{color:var(--snx-accent);border-color:color-mix(in srgb,var(--snx-accent) 40%,transparent)}
.snx-pbar button.go{background:var(--snx-accent-fill);border:none;color:var(--dsw-alias-label-primary-foreground,#fff);border-radius:7px;
  padding:8px 14px;cursor:pointer;font-weight:700;font-family:inherit}
.snx-pbar button.go:disabled{opacity:.5;cursor:default}
.snx-maskbar{position:absolute;top:12px;left:50%;transform:translateX(-50%);z-index:9;display:flex;align-items:center;gap:10px;
  background:var(--dsw-alias-button-floating-fill,#2c2c2e);border:1px solid color-mix(in srgb,var(--snx-accent) 45%,transparent);border-radius:10px;padding:7px 12px;
  box-shadow:0 10px 30px rgba(0,0,0,.24);max-width:82%}
.snx-maskbar .lb{font-size:11px;color:var(--snx-accent);white-space:nowrap}
.snx-maskbar input[type=text]{width:230px;background:var(--dsw-alias-bg-layer-1,#232324);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:7px;color:var(--dsw-alias-label-primary,#f9fafb);
  padding:7px 10px;font-size:12.5px;outline:none;font-family:inherit}
.snx-maskbar input[type=text]:focus{border-color:var(--snx-accent)}
.snx-maskbar input[type=range]{width:100px;accent-color:var(--snx-accent)}
.snx-maskbar button{background:none;border:1px solid var(--dsw-alias-border-l2,#ffffff1f);color:var(--dsw-alias-label-secondary,#cfd3d6);border-radius:6px;padding:6px 10px;
  cursor:pointer;font-size:12px;font-family:inherit;white-space:nowrap}
.snx-maskbar button:hover:not(:disabled){border-color:var(--snx-accent);color:var(--snx-accent)}
.snx-maskbar button.go{background:var(--snx-accent-fill);border:none;color:var(--dsw-alias-label-primary-foreground,#fff);font-weight:700}
.snx-maskbar button.go:disabled{opacity:.5;cursor:default}
.snx-maskbar button.go:hover:not(:disabled){color:var(--dsw-alias-label-primary-foreground,#fff);filter:brightness(1.15)}
.snx-ratio{position:absolute;z-index:7;display:flex;gap:3px;background:var(--dsw-alias-button-floating-fill,#2c2c2e);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);
  border-radius:8px;padding:4px;box-shadow:0 10px 30px rgba(0,0,0,.24)}
.snx-ratio button{background:none;border:none;color:var(--dsw-alias-label-primary,#f9fafb);padding:6px 10px;cursor:pointer;font-size:12px;
  border-radius:5px;font-family:inherit}
.snx-ratio button:hover{background:var(--dsw-alias-interactive-bg-hover,#ffffff14);color:var(--snx-accent)}
canvas[data-snx-mask]{position:absolute;inset:0;z-index:8;cursor:crosshair}
/* Phase 2：聊天内生图工具卡片 */
.snx-tv{display:flex;flex-direction:column;gap:6px;padding:8px;border:1px solid color-mix(in srgb,var(--snx-accent) 25%,transparent);
  border-radius:8px;background:var(--dsw-alias-bg-layer-2,#2c2c2e);margin:2px 0;max-width:340px}
.snx-tv-img{display:block;width:fit-content;border:.5px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:12px;overflow:hidden;cursor:zoom-in;
  background:var(--dsw-alias-interactive-bg-hover,#ffffff14);padding:0;line-height:0;flex:none;
  transition:transform .15s ease, box-shadow .15s ease}
.snx-tv-img:hover{transform:translateY(-1px);box-shadow:0 6px 20px rgba(0,0,0,.35)}
.snx-tv-img img{display:block;object-fit:cover}
.snx-tv-run{font-size:12px;color:var(--snx-accent)}
.snx-tv-err{font-size:12px;color:var(--snx-error)}
.snx-tv-row{display:flex;align-items:center;gap:8px;min-width:0}
.snx-tv-prompt{font-size:11px;color:var(--dsw-alias-label-tertiary,#adb2b8);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.snx-tv-row button,.snx-tv-btns button{background:var(--dsw-alias-interactive-bg-hover,#ffffff14);border:1px solid color-mix(in srgb,var(--snx-accent) 40%,transparent);color:var(--snx-accent);border-radius:6px;
  padding:4px 10px;cursor:pointer;font-size:11.5px;font-family:inherit;white-space:nowrap}
.snx-tv-row button:hover,.snx-tv-btns button:hover{filter:brightness(1.2)}
.snx-tv-btns{display:flex;gap:6px;flex-wrap:wrap}
/* P2-5：插入画布失败态（工具卡按钮与灯箱底栏按钮共用；红描边+警示色文字，再点即重试）*/
.snx-tv-row button.snx-ins-btn.err,.snx-tv-btns button.snx-ins-btn.err{border-color:var(--snx-error);color:var(--snx-error);white-space:normal;text-align:left}
/* SPEC-13 ①：pending 生命感——.snx-tv-run 内转圈 ring + 已耗时（复用既有 snx-spin keyframes）*/
.snx-tv-wait{display:flex;align-items:center;gap:8px}
.snx-tv-wait .ring{width:16px;height:16px;border-radius:50%;border:2.5px solid color-mix(in srgb,var(--snx-accent) 22%,transparent);border-top-color:var(--snx-accent);animation:snx-spin .8s linear infinite;flex:none}
.snx-tv-wait b{color:var(--snx-accent);font-variant-numeric:tabular-nums}
.snx-tv-ws{font-size:11px;color:var(--dsw-alias-label-tertiary,#adb2b8)}
/* SPEC-13 ②：完成卡动作行扩容——按钮复用 .snx-tv-btns 基础样式，只补主行动高亮/禁用态/截断尾部复制钮 */
.snx-tv-btns button.snx-tv-acc{border-color:color-mix(in srgb,var(--snx-accent) 55%,transparent);background:color-mix(in srgb,var(--snx-accent) 12%,transparent)}
.snx-tv-btns button[disabled]{opacity:.55;cursor:default}
.snx-tv-copy{flex:none;display:inline-flex;align-items:center;justify-content:center;border:1px solid color-mix(in srgb,var(--snx-accent) 40%,transparent);background:var(--dsw-alias-interactive-bg-hover,#ffffff14);color:var(--snx-accent);border-radius:6px;padding:3px 5px;cursor:pointer;line-height:0}
.snx-tv-copy:hover{filter:brightness(1.2)}

/* ════════════════════════════════════════════════════════════════
   v5 专业生图台（snx-pro / snx-gen / snx-canvas-wrap / snx-gal）
   颜色基调：宿主 dsh 0.2 设计令牌（--dsw-alias-*），单强调色 = 宿主主色 DeepSeek 蓝，自动跟随亮/暗主题
   ════════════════════════════════════════════════════════════════ */

/* ─── 根容器 ─── */
.snx-pro{
  position:relative;display:flex;flex-direction:column;width:100%;height:100%;
  background:var(--dsw-alias-bg-layer-1,#232324);
  color:var(--dsw-alias-label-primary,#f9fafb);font-family:var(--dsw-font-family,"Segoe UI","Microsoft YaHei",sans-serif);
  overflow:hidden;container-type:inline-size;container-name:snxpro;
}
.snx-pro.canvas-mode{background:var(--dsw-alias-bg-layer-1,#232324)}

/* ─── 顶部品牌栏 ─── */
.snx-pro-top{
  height:46px;flex-shrink:0;display:flex;align-items:center;gap:10px;
  padding:0 14px;border-bottom:1px solid var(--dsw-alias-border-l2,#ffffff1f);
  background:var(--dsw-alias-bg-layer-2,#2c2c2e);
}
.snx-pro-brand{display:flex;align-items:center;gap:8px;font-weight:800;font-size:14px;letter-spacing:.02em}
.snx-pro-ico{
  display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:6px;
  background:var(--snx-accent-fill);color:var(--dsw-alias-label-primary-foreground,#fff);font-size:14px;line-height:1;
  box-shadow:0 0 12px color-mix(in srgb,var(--snx-accent) 35%,transparent);
}
.snx-pro-name{color:var(--dsw-alias-label-primary,#f9fafb);font-weight:900}
.snx-pro-tag{
  font-size:10.5px;color:var(--dsw-alias-label-tertiary,#adb2b8);letter-spacing:.08em;padding:2px 7px;border-radius:4px;
  border:1px solid var(--dsw-alias-border-l2,#ffffff1f);background:var(--dsw-alias-bg-module-platform,#353638);
}
.snx-pro-spacer{flex:1}
.snx-pro-key{
  font-size:11px;padding:3px 9px;border-radius:10px;border:1px solid var(--dsw-alias-border-l2,#ffffff1f);color:var(--dsw-alias-label-tertiary,#adb2b8);
  display:inline-flex;align-items:center;gap:4px;
}
.snx-pro-key.ok{color:var(--snx-accent);border-color:color-mix(in srgb,var(--snx-accent) 35%,transparent);background:color-mix(in srgb,var(--snx-accent) 6%,transparent)}
.snx-pro-key.no{color:var(--snx-error);border-color:color-mix(in srgb,var(--snx-error) 40%,transparent);background:color-mix(in srgb,var(--snx-error) 6%,transparent)}
.snx-pro-key.unk{color:var(--dsw-alias-label-tertiary,#adb2b8)}

/* ─── 模式 tab ─── */
.snx-pro-tabs{
  display:flex;flex-shrink:0;border-bottom:1px solid var(--dsw-alias-border-l2,#ffffff1f);background:var(--dsw-alias-bg-layer-2,#2c2c2e);
  padding:0 6px;gap:2px;
}
.snx-pro-tabs button{
  flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;
  background:none;border:none;color:var(--dsw-alias-label-caption,#81858c);padding:9px 0;cursor:pointer;
  font-size:12.5px;font-weight:600;font-family:inherit;
  border-bottom:2px solid transparent;transition:all .15s;position:relative;
}
.snx-pro-tabs button .ti{font-size:14px;line-height:1}
.snx-pro-tabs button .cnt{
  font-size:10px;background:var(--dsw-alias-border-l2,#ffffff1f);color:var(--dsw-alias-label-secondary,#cfd3d6);padding:1px 6px;border-radius:8px;margin-left:2px;
}
.snx-pro-tabs button:hover{color:var(--dsw-alias-label-secondary,#cfd3d6);background:var(--dsw-alias-interactive-bg-hover,#ffffff14)}
.snx-pro-tabs button.on{
  color:var(--snx-accent);border-bottom-color:var(--snx-accent);
}
.snx-pro-tabs button.on .cnt{background:color-mix(in srgb,var(--snx-accent) 20%,transparent);color:var(--snx-accent)}

/* ─── 主内容 ─── */
.snx-pro-main{
  flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;
  background:var(--dsw-alias-bg-layer-2,#2c2c2e);
}
.snx-pro-main::-webkit-scrollbar{width:6px}
.snx-pro-main::-webkit-scrollbar-track{background:transparent}
.snx-pro-main::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l2,#ffffff1f);border-radius:3px}
.snx-pro-main::-webkit-scrollbar-thumb:hover{background:var(--dsw-alias-border-l3,#ffffff29)}

/* ═══════ GEN mode ═══════ */
.snx-gen{display:flex;flex-direction:column;padding:14px;gap:16px}

/* ── 预览大图 ── */
.snx-gen-hero{
  position:relative;border-radius:10px;overflow:hidden;
  background:var(--dsw-alias-bg-layer-2,#2c2c2e);
  border:1px solid var(--dsw-alias-border-l2,#ffffff1f);box-shadow:0 4px 18px rgba(0,0,0,.16);
}
.snx-gen-hero.empty{padding:0}
.snx-gen-hero-inner{padding:12px}
.snx-gen-hero-imgbox{
  position:relative;aspect-ratio:1;width:100%;overflow:hidden;border-radius:8px;
  background:var(--dsw-alias-bg-document-preview,#151517);display:flex;align-items:center;justify-content:center;
}
.snx-gen-hero-imgbox img{
  display:block;width:100%;height:100%;object-fit:contain;background:var(--dsw-alias-bg-document-preview,#151517);
}
.snx-gen-hero-fail{color:var(--snx-error);font-size:12px}
.snx-gen-hero-cap{padding-top:10px}
.snx-gen-hero-cap .pr{
  font-size:12.5px;color:var(--dsw-alias-label-primary,#f9fafb);line-height:1.5;font-weight:500;
  display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;
}
.snx-gen-hero-cap .meta{font-size:11px;color:var(--dsw-alias-label-caption,#81858c);margin-top:4px;letter-spacing:.04em}
.snx-gen-hero-cap .acts{display:flex;gap:6px;margin-top:10px;flex-wrap:wrap}
.snx-gen-act{
  background:var(--dsw-alias-bg-layer-3,#353638);color:var(--dsw-alias-label-secondary,#cfd3d6);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:6px;
  padding:5px 10px;font-size:11.5px;cursor:pointer;font-family:inherit;text-decoration:none;
  display:inline-flex;align-items:center;gap:4px;transition:all .15s;
}
.snx-gen-act:hover{background:var(--dsw-alias-interactive-bg-hover,#ffffff14);color:var(--dsw-alias-label-primary,#f9fafb);border-color:var(--dsw-alias-border-l3,#ffffff29)}

/* 空状态 */
.snx-gen-hero-empty{
  padding:48px 20px;text-align:center;color:var(--dsw-alias-label-caption,#81858c);
}
.snx-gen-hero-empty .big{font-size:42px;opacity:.25;line-height:1;margin-bottom:8px}
.snx-gen-hero-empty .t1{font-size:13px;color:var(--dsw-alias-label-tertiary,#adb2b8);font-weight:600;margin-bottom:4px}
.snx-gen-hero-empty .t2{font-size:11px;color:var(--dsw-alias-label-caption,#81858c)}

/* 忙时遮罩 */
.snx-gen-hero-busy{
  position:absolute;inset:0;background:var(--dsw-alias-bg-mask-1,#00000080);backdrop-filter:blur(6px);
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;z-index:5;
}
.snx-gen-hero-busy .spin{
  width:36px;height:36px;border-radius:50%;
  border:3px solid color-mix(in srgb,var(--snx-accent) 20%,transparent);border-top-color:var(--snx-accent);
  animation:snx-spin .8s linear infinite;
}
.snx-gen-hero-busy .lbl{font-size:13px;color:var(--snx-accent);font-weight:600;letter-spacing:.04em}
@keyframes snx-spin{to{transform:rotate(360deg)}}

/* ── 表单 ── */
.snx-gen-form{display:flex;flex-direction:column;gap:14px}
.snx-gen-fprompt{display:flex;flex-direction:column;gap:8px}
.snx-gen-fprompt .lb,.snx-gen-fsize .lb,.snx-gen-ff .lb{
  display:flex;align-items:center;gap:6px;font-size:11px;color:var(--dsw-alias-label-tertiary,#adb2b8);
  font-weight:600;letter-spacing:.06em;text-transform:uppercase;
}
.snx-gen-fprompt .lb .ti,.snx-gen-fsize .lb .ti,.snx-gen-ff .lb .ti{font-size:13px;line-height:1;color:var(--snx-accent)}
.snx-gen-fprompt .lb .hk{margin-left:auto;font-size:10px;color:var(--dsw-alias-label-caption,#81858c);font-weight:500;letter-spacing:.04em;text-transform:none}
.snx-gen-ta{
  width:100%;box-sizing:border-box;background:var(--dsw-alias-bg-module-platform,#353638);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:8px;
  color:var(--dsw-alias-label-primary,#f9fafb);padding:10px 12px;font-size:13px;font-family:inherit;resize:vertical;
  min-height:70px;line-height:1.55;transition:border-color .15s;
}
.snx-gen-ta.sm{min-height:48px;font-size:12px}
.snx-gen-ta:focus{outline:none;border-color:var(--snx-accent);background:var(--dsw-alias-bg-layer-3,#353638)}

/* 高级折叠 */
.snx-gen-fneg-tg{
  background:none;border:none;color:var(--dsw-alias-label-tertiary,#adb2b8);font-size:11px;cursor:pointer;font-family:inherit;
  padding:4px 0;display:inline-flex;align-items:center;gap:6px;
}
.snx-gen-fneg-tg:hover{color:var(--dsw-alias-label-secondary,#cfd3d6)}
.snx-gen-fneg-body{margin-top:8px;display:flex;flex-direction:column;gap:10px}
.snx-gen-seed{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--dsw-alias-label-tertiary,#adb2b8)}
.snx-gen-seed input{
  width:90px;background:var(--dsw-alias-bg-module-platform,#353638);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:6px;
  color:var(--dsw-alias-label-primary,#f9fafb);padding:5px 8px;font-size:12px;
}
.snx-gen-seed input:focus{outline:none;border-color:var(--snx-accent)}
.snx-gen-seed button{
  background:var(--dsw-alias-bg-layer-3,#353638);color:var(--dsw-alias-label-secondary,#cfd3d6);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:6px;
  padding:5px 8px;cursor:pointer;font-size:12px;
}
.snx-gen-seed button:hover{background:var(--dsw-alias-interactive-bg-hover,#ffffff14);color:var(--dsw-alias-label-primary,#f9fafb)}
.snx-gen-seed .h{margin-left:auto;color:var(--dsw-alias-label-caption,#81858c);font-size:10.5px}

/* 比例快选 */
.snx-gen-fsize-row{display:flex;gap:6px;flex-wrap:wrap}
.snx-gen-chip{
  background:var(--dsw-alias-bg-module-platform,#353638);color:var(--dsw-alias-label-secondary,#cfd3d6);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:6px;
  padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;
  transition:all .15s;
}
.snx-gen-chip:hover{background:var(--dsw-alias-bg-layer-3,#353638);color:var(--dsw-alias-label-primary,#f9fafb);border-color:var(--dsw-alias-border-l3,#ffffff29)}
.snx-gen-chip.on{
  background:color-mix(in srgb,var(--snx-accent) 15%,transparent);
  border-color:var(--snx-accent);color:var(--snx-accent);
}

/* 模型+张数行 */
.snx-gen-ff{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px}

/* 张数 stepper */
.snx-gen-stepper{
  display:inline-flex;align-items:center;border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:6px;
  background:var(--dsw-alias-bg-module-platform,#353638);overflow:hidden;
}
.snx-gen-stepper button{
  width:30px;height:32px;background:none;border:none;color:var(--dsw-alias-label-secondary,#cfd3d6);cursor:pointer;font-size:14px;font-family:inherit;
}
.snx-gen-stepper button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,#ffffff14);color:var(--dsw-alias-label-primary,#f9fafb)}
.snx-gen-stepper button:disabled{opacity:.35;cursor:not-allowed}
.snx-gen-stepper span{
  display:inline-flex;align-items:center;justify-content:center;min-width:32px;height:32px;
  color:var(--dsw-alias-label-primary,#f9fafb);font-size:13px;font-weight:700;
}

/* 生成按钮 */
.snx-gen-go{
  display:flex;align-items:center;justify-content:center;gap:10px;width:100%;
  padding:14px;border:none;border-radius:10px;cursor:pointer;
  background:var(--snx-accent-fill);
  color:var(--dsw-alias-label-primary-foreground,#fff);font-size:14.5px;font-weight:800;font-family:inherit;letter-spacing:.04em;
  box-shadow:0 4px 16px color-mix(in srgb,var(--snx-accent) 30%,transparent),inset 0 1px 0 color-mix(in srgb,var(--dsw-alias-label-primary-foreground,#fff) 15%,transparent);
  transition:all .15s;position:relative;overflow:hidden;
}
.snx-gen-go:hover:not(:disabled){
  transform:translateY(-1px);box-shadow:0 6px 22px color-mix(in srgb,var(--snx-accent) 45%,transparent),inset 0 1px 0 color-mix(in srgb,var(--dsw-alias-label-primary-foreground,#fff) 20%,transparent);
}
.snx-gen-go:active:not(:disabled){transform:translateY(0)}
.snx-gen-go:disabled,.snx-gen-go.disabled{opacity:.45;cursor:not-allowed}
.snx-gen-go.busy{background:var(--snx-accent-fill-hover);cursor:wait}
.snx-gen-go .ti{font-size:18px;line-height:1}
.snx-gen-go::after{
  content:'';position:absolute;inset:0;
  background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--dsw-alias-label-primary-foreground,#fff) 18%,transparent),transparent);
  transform:translateX(-100%);   /* P2-1：扫光只在 busy 态播放，idle 时停在左侧不可见 */
}
.snx-gen-go.busy::after{animation:snx-shimmer 1.2s infinite}
@keyframes snx-shimmer{to{transform:translateX(100%)}}

.snx-gen-err{
  font-size:12px;color:var(--snx-error);background:color-mix(in srgb,var(--snx-error) 8%,transparent);border:1px solid color-mix(in srgb,var(--snx-error) 30%,transparent);
  border-radius:6px;padding:8px 10px;line-height:1.5;
}

/* ── v12：生成按钮决策面板（SPEC ①：按下之前就知道一切；portal 挂 body 防 container-type 收编）─── */
.snx-gen-gowrap{position:relative}
.snx-gen-decide{
  position:fixed;z-index:330;width:320px;pointer-events:none;
  background:var(--dsw-alias-bg-layer-3,#353638);
  border:1px solid color-mix(in srgb,var(--snx-accent) 30%,var(--dsw-alias-border-l2,#ffffff1f));
  border-radius:10px;box-shadow:0 14px 40px rgba(0,0,0,.45);padding:10px 12px;
  animation:snx-decide-in .15s ease-out;
}
@keyframes snx-decide-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
.snx-gen-decide-strip{
  margin:-10px -12px 8px;padding:5px 12px;border-radius:9px 9px 0 0;
  background:color-mix(in srgb,var(--snx-error) 16%,transparent);color:var(--snx-error);
  font-size:11px;font-weight:600;
}
.snx-gen-decide-r{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--dsw-alias-label-secondary,#cfd3d6);padding:3px 0;line-height:1.5}
.snx-gen-decide-r svg{flex:none;color:var(--snx-accent)}
.snx-gen-decide-r b{color:var(--dsw-alias-label-primary,#f9fafb);font-weight:600;word-break:break-all}
.snx-gen-decide-r.blk svg{color:var(--snx-error)}
.snx-gen-decide-r.blk span{color:var(--dsw-alias-label-tertiary,#adb2b8)}

/* 最近画廊 */
.snx-gen-recent{display:flex;flex-direction:column;gap:8px;padding-top:6px;border-top:1px solid var(--dsw-alias-border-l2,#ffffff1f)}
.snx-gen-recent .lb{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--dsw-alias-label-tertiary,#adb2b8);font-weight:600;letter-spacing:.06em;text-transform:uppercase}
.snx-gen-recent .lb .ti{font-size:13px;color:var(--snx-accent)}
.snx-gen-recent .lb .h{margin-left:auto;color:var(--dsw-alias-label-caption,#81858c);text-transform:none;letter-spacing:0;font-weight:500}
.snx-gen-more{
  margin-left:auto;background:none;border:none;color:var(--snx-accent);cursor:pointer;font-size:11.5px;
  font-family:inherit;font-weight:600;
}
.snx-gen-more:hover{color:var(--snx-accent)}
.snx-gen-thumbs{display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:6px}
.snx-gen-thumb{
  position:relative;aspect-ratio:1;overflow:hidden;border-radius:6px;
  border:1px solid var(--dsw-alias-border-l2,#ffffff1f);background:var(--dsw-alias-bg-layer-2,#2c2c2e);cursor:pointer;padding:0;
  transition:all .15s;
}
.snx-gen-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.snx-gen-thumb:hover{border-color:var(--snx-accent);transform:translateY(-1px);box-shadow:0 4px 12px color-mix(in srgb,var(--snx-accent) 25%,transparent)}
.snx-gen-thumb.on{border-color:var(--snx-accent);box-shadow:0 0 0 2px color-mix(in srgb,var(--snx-accent) 25%,transparent)}

/* ═══════ CANVAS mode ═══════ */
.snx-canvas-wrap{
  position:relative;width:100%;height:100%;background:var(--dsw-alias-bg-layer-1,#232324);overflow:hidden;
}
.snx-canvas-stage{position:absolute;inset:0;overflow:hidden}
.snx-canvas-err{
  position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  color:var(--snx-error);font-size:13px;
}
.snx-canvas-empty{
  position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
  pointer-events:none;gap:8px;user-select:none;
}
.snx-canvas-empty .big{font-size:48px;opacity:.3;line-height:1;color:var(--snx-accent)}
.snx-canvas-empty .t1{font-size:13px;color:var(--dsw-alias-label-tertiary,#adb2b8);font-weight:600}
.snx-canvas-empty .t2{font-size:11px;color:var(--dsw-alias-label-caption,#81858c)}

/* 画布模式下的 prompt 浮动条（顶部居中）*/
.snx-pro.canvas-mode .snx-pbar{top:8px}

/* ═══════ GALLERY mode ═══════ */
.snx-gal{padding:14px;display:flex;flex-direction:column;gap:14px;min-height:100%}
.snx-gal-bar{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--dsw-alias-label-tertiary,#adb2b8);font-weight:600}
.snx-gal-btn{
  background:var(--dsw-alias-bg-layer-3,#353638);color:var(--snx-error);border:1px solid color-mix(in srgb,var(--snx-error) 30%,transparent);border-radius:6px;
  padding:5px 10px;font-size:11.5px;cursor:pointer;font-family:inherit;
}
.snx-gal-btn:hover{background:var(--dsw-alias-interactive-bg-hover,#ffffff14);color:var(--snx-error)}
.snx-gal-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:8px}
.snx-gal-item{
  background:var(--dsw-alias-bg-module-platform,#353638);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:8px;overflow:hidden;
  cursor:pointer;transition:all .15s;
}
.snx-gal-item:hover{border-color:var(--snx-accent);transform:translateY(-1px);box-shadow:0 4px 14px color-mix(in srgb,var(--snx-accent) 20%,transparent)}
.snx-gal-item-img{aspect-ratio:1;background:var(--dsw-alias-bg-document-preview,#151517);overflow:hidden}
.snx-gal-item-img img{width:100%;height:100%;object-fit:cover;display:block}
.snx-gal-item-meta{padding:8px 10px}
.snx-gal-item-pr{
  font-size:11.5px;color:var(--dsw-alias-label-primary,#f9fafb);line-height:1.4;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;
}
.snx-gal-item-sub{font-size:10.5px;color:var(--dsw-alias-label-caption,#81858c);margin-top:4px;letter-spacing:.04em}
.snx-gal-empty{
  flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;
  padding:60px 20px;text-align:center;color:var(--dsw-alias-label-caption,#81858c);gap:6px;
}
.snx-gal-empty .big{font-size:42px;opacity:.25;line-height:1;margin-bottom:8px}
.snx-gal-empty .t1{font-size:13px;color:var(--dsw-alias-label-tertiary,#adb2b8);font-weight:600}
.snx-gal-empty .t2{font-size:11px;color:var(--dsw-alias-label-caption,#81858c)}

/* ═══════ 状态栏 ═══════ */
.snx-pro-status{
  flex-shrink:0;display:flex;align-items:center;gap:12px;
  height:28px;padding:0 14px;border-top:1px solid var(--dsw-alias-border-l2,#ffffff1f);
  background:var(--dsw-alias-bg-layer-2,#2c2c2e);font-size:11px;color:var(--dsw-alias-label-caption,#81858c);letter-spacing:.03em;
}
.snx-pro-status span{display:inline-flex;align-items:center}

/* ═══════ 全局轻提示（v11.2.1：全模式统一渲染，画布页不再例外；P2-2 队列化）═══════
   容器底部居中固定；内部多槽堆叠（上限 4），每条独立着色/计时/手关。
   bottom:56px 避让画布状态栏(28px)与左下缩放控件，顶部让给 GenBar/操作条。 */
.snx-toasts{
  position:fixed;bottom:56px;left:50%;transform:translateX(-50%);z-index:10000;
  display:flex;flex-direction:column;align-items:center;gap:8px;
  width:max-content;max-width:min(72%,520px);pointer-events:none;
}
.snx-toast{
  pointer-events:auto;display:flex;align-items:flex-start;gap:8px;max-width:100%;
  padding:8px 10px 8px 12px;border-radius:8px;
  background:var(--dsw-alias-toast-bg,#43454a);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);color:var(--dsw-alias-toast-label,#fff);
  font-size:12px;box-shadow:0 8px 24px rgba(0,0,0,.22);
  animation:snx-snack-in .18s ease-out;
}
/* P2-2：长文案可换行（不再省略号截断）*/
.snx-toast-msg{white-space:normal;word-break:break-word;line-height:1.55;min-width:0}
.snx-toast-x{flex:none;display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;margin:-1px -2px 0 0;
  background:none;border:none;border-radius:5px;color:var(--dsw-alias-toast-label,#fff);opacity:.62;cursor:pointer;font-family:inherit}
.snx-toast-x:hover{opacity:1;background:var(--dsw-alias-interactive-bg-hover,#ffffff14)}
/* P2-2：按严重度着色（左条；kind 由 JS 以 data-kind 下发——
   不用 .ok/.err/.info 复合类，避免动态拼出的类名过不了静态类名对账）*/
.snx-toast[data-kind="ok"]{border-left:3px solid var(--snx-ok)}
.snx-toast[data-kind="err"]{border-left:3px solid var(--snx-error)}
.snx-toast[data-kind="info"]{border-left:3px solid var(--snx-accent)}
@keyframes snx-snack-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}

/* ═══════ 窄布局适配（rightbar < 380px）═══ */
@container snxpro (max-width:379px){
  .snx-gen{padding:10px;gap:12px}
  .snx-pro-top{height:42px;padding:0 10px}
  .snx-pro-tag{display:none}
  .snx-gen-frow3{flex-direction:column;gap:8px}
  .snx-gen-ff.tiny,.snx-gen-ff.tiny2{flex:1}
}

/* ═══════ v5 增量：Lightbox + Settings + i2i 锚点 + 风格预设 ═══════ */

/* ─── Lightbox 全屏预览 ─── */
.snx-lb-backdrop{
  position:fixed;inset:0;background:var(--dsw-alias-bg-mask-photo,#000000e0);backdrop-filter:blur(10px);
  z-index:9999;display:flex;align-items:center;justify-content:center;
  animation:snx-lb-in .2s ease-out;
}
@keyframes snx-lb-in{from{opacity:0}to{opacity:1}}
.snx-lb{
  display:flex;flex-direction:column;width:min(96vw,1100px);height:min(96vh,860px);
  background:var(--dsw-alias-bg-layer-1,#232324);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:12px;overflow:hidden;
  box-shadow:0 30px 80px rgba(0,0,0,.28),0 0 0 1px color-mix(in srgb,var(--snx-accent) 8%,transparent);
}
.snx-lb-top{
  height:48px;flex-shrink:0;display:flex;align-items:center;gap:12px;
  padding:0 16px;border-bottom:1px solid var(--dsw-alias-border-l2,#ffffff1f);background:var(--dsw-alias-bg-layer-2,#2c2c2e);
}
.snx-lb-info{display:flex;align-items:center;gap:10px;font-size:11.5px;color:var(--dsw-alias-label-tertiary,#adb2b8)}
.snx-lb-id{font-family:ui-monospace,Consolas,monospace;color:var(--snx-accent);background:color-mix(in srgb,var(--snx-accent) 10%,transparent);padding:2px 8px;border-radius:4px;font-size:10.5px}
.snx-lb-time{color:var(--dsw-alias-label-caption,#81858c);font-variant-numeric:tabular-nums}
.snx-lb-zoom{display:flex;align-items:center;gap:4px;background:var(--dsw-alias-bg-module-platform,#353638);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:6px;padding:2px}
.snx-lb-zoom button{width:26px;height:26px;background:none;border:none;color:var(--dsw-alias-label-secondary,#cfd3d6);cursor:pointer;border-radius:4px;font-family:inherit;font-size:14px}
.snx-lb-zoom button:hover{background:var(--dsw-alias-interactive-bg-hover,#ffffff14);color:var(--dsw-alias-label-primary,#f9fafb)}
.snx-lb-zoom button.snx-lb-zoom-txt{width:auto;min-width:0;padding:0 8px;font-size:11.5px;white-space:nowrap}
.snx-lb-zoom span{display:inline-flex;align-items:center;justify-content:center;min-width:46px;font-size:11px;color:var(--dsw-alias-label-tertiary,#adb2b8);font-variant-numeric:tabular-nums}
.snx-lb-close{
  width:32px;height:32px;background:var(--dsw-alias-bg-layer-3,#353638);color:var(--dsw-alias-label-secondary,#cfd3d6);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);
  border-radius:6px;cursor:pointer;font-size:14px;
}
.snx-lb-close:hover{background:var(--dsw-alias-interactive-bg-hover,#ffffff14);color:var(--snx-error);border-color:color-mix(in srgb,var(--snx-error) 30%,transparent)}

.snx-lb-stage{
  flex:1;min-height:0;overflow:auto;display:flex;cursor:grab;user-select:none;
  background:
    radial-gradient(circle at 25% 25%,color-mix(in srgb,var(--snx-accent) 4%,transparent) 0%,transparent 50%),
    radial-gradient(circle at 75% 75%,color-mix(in srgb,var(--snx-accent) 4%,transparent) 0%,transparent 50%),
    var(--dsw-alias-bg-layer-1,#232324);
  background-image:
    linear-gradient(45deg,color-mix(in srgb,var(--dsw-alias-label-primary,#f9fafb) 4%,transparent) 25%,transparent 25%),
    linear-gradient(-45deg,color-mix(in srgb,var(--dsw-alias-label-primary,#f9fafb) 4%,transparent) 25%,transparent 25%),
    linear-gradient(45deg,transparent 75%,color-mix(in srgb,var(--dsw-alias-label-primary,#f9fafb) 4%,transparent) 75%),
    linear-gradient(-45deg,transparent 75%,color-mix(in srgb,var(--dsw-alias-label-primary,#f9fafb) 4%,transparent) 75%);
  background-size:24px 24px;background-position:0 0,0 12px,12px -12px,-12px 0;
}
/* P0-3：缩放改写布局尺寸（width/height），overflow:auto 真正生效；
   margin:auto 居中——内容超出一屏时也能滚到四边（flex center 会裁掉左上）。
   flex:none 必须加：stage 是 display:flex，imgwrap 默认 flex-shrink:1 会把
   放大后的宽度收缩回容器宽（E2E 实测 721px 被吞成 620px，滚动/平移永不出现） */
.snx-lb-imgwrap{
  display:block;margin:auto;flex:none;
}
.snx-lb-img{
  display:block;width:100%;height:100%;max-width:none;max-height:none;
  box-shadow:0 8px 40px rgba(0,0,0,.22);
  border-radius:4px;
}
.snx-lb-stage[data-dragging]{cursor:grabbing}
.snx-lb-stage[data-dragging] .snx-lb-img{pointer-events:none}
.snx-lb-empty{margin:auto;flex:none;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;
  color:var(--dsw-alias-label-tertiary,#adb2b8);font-size:12.5px;max-width:70%;text-align:center}
.snx-lb-empty-t{line-height:1.6;word-break:break-word}

.snx-lb-meta{display:flex;flex-direction:column;gap:10px;min-height:0;overflow-y:auto}
/* v12 清理（静态对账）：删除 .snx-lb-pr / .snx-lb-params 死样式——旧灯箱右栏「提示词/参数块」
   已被 v12 参数清单（.snx-lb-rows / .snx-lb-row，JS :7324 起渲染）取代，全文件 JS 零引用 */
.snx-lb-acts{
  display:flex;gap:6px;flex-wrap:wrap;padding-top:10px;border-top:1px solid var(--dsw-alias-border-l2,#ffffff1f);
}
.snx-lb-act{
  background:var(--dsw-alias-bg-layer-3,#353638);color:var(--dsw-alias-label-secondary,#cfd3d6);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:6px;
  padding:7px 12px;font-size:12px;cursor:pointer;font-family:inherit;font-weight:500;
  display:inline-flex;align-items:center;gap:5px;
}
.snx-lb-act:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,#ffffff14);color:var(--dsw-alias-label-primary,#f9fafb);border-color:var(--dsw-alias-border-l3,#ffffff29)}
.snx-lb-act.go{background:color-mix(in srgb,var(--snx-accent) 15%,transparent);border-color:var(--snx-accent);color:var(--snx-accent)}
.snx-lb-act.go:hover:not(:disabled){background:color-mix(in srgb,var(--snx-accent) 25%,transparent)}
/* SPEC-17 二：同种子重生成 busy 态（四态防连点）——禁用期降透明度并锁 hover */
.snx-lb-act:disabled{opacity:.55;cursor:default}
.snx-lb-act.danger{color:var(--snx-error);border-color:color-mix(in srgb,var(--snx-error) 30%,transparent)}
.snx-lb-act.danger:hover{background:color-mix(in srgb,var(--snx-error) 10%,transparent);color:var(--snx-error)}

/* ─── v12:灯箱「参数清单」——InvokeAI ImageMetadataActions 式逐行参数 + 行级单键回填 ─── */
.snx-lb-plist-h{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.snx-lb-plist-h .t{flex:1;font-size:11px;font-weight:700;letter-spacing:.08em;color:var(--dsw-alias-label-tertiary,#adb2b8);text-transform:uppercase}
.snx-lb-plist-go{
  display:inline-flex;align-items:center;gap:5px;background:color-mix(in srgb,var(--snx-accent) 15%,transparent);
  border:1px solid var(--snx-accent);color:var(--snx-accent);border-radius:6px;padding:5px 10px;
  font-size:11.5px;font-weight:600;cursor:pointer;font-family:inherit;
}
.snx-lb-plist-go:hover{background:color-mix(in srgb,var(--snx-accent) 25%,transparent)}
.snx-lb-rows{display:flex;flex-direction:column;min-width:0}
.snx-lb-row{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;
  border-bottom:1px solid color-mix(in srgb,var(--dsw-alias-border-l2,#ffffff1f) 55%,transparent)}
.snx-lb-row:last-child{border-bottom:none}
.snx-lb-row .rl{flex:none;width:46px;font-size:11px;color:var(--dsw-alias-label-caption,#81858c)}
.snx-lb-row .rv{flex:1;min-width:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary,#cfd3d6);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-variant-numeric:tabular-nums}
.snx-lb-row .rv.wrap{white-space:normal;max-height:72px;overflow-y:auto;word-break:break-word}
.snx-lb-row .rv.mono{font-family:ui-monospace,Consolas,monospace;font-size:11px}
.snx-lb-row .rb{
  flex:none;display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;
  border-radius:6px;border:1px solid color-mix(in srgb,var(--snx-accent) 35%,transparent);
  background:transparent;color:var(--snx-accent);cursor:pointer;
}
.snx-lb-row .rb:hover{background:color-mix(in srgb,var(--snx-accent) 15%,transparent);border-color:var(--snx-accent)}
.snx-lb-row.fl{animation:snx-row-flash .55s ease-out}
@keyframes snx-row-flash{from{background:color-mix(in srgb,var(--snx-accent) 22%,transparent)}to{background:transparent}}

/* ─── i2i 锚点提示（GenForm 顶部）── */
.snx-gen-anchor{
  display:flex;align-items:center;gap:10px;padding:8px;
  background:color-mix(in srgb,var(--snx-accent) 9%,transparent);
  border:1px solid color-mix(in srgb,var(--snx-accent) 40%,transparent);border-radius:8px;
  box-shadow:0 0 0 1px color-mix(in srgb,var(--snx-accent) 8%,transparent),0 4px 12px color-mix(in srgb,var(--snx-accent) 10%,transparent);
}
.snx-gen-anchor-thumb{
  width:48px;height:48px;border-radius:6px;object-fit:cover;flex-shrink:0;
  border:1px solid color-mix(in srgb,var(--snx-accent) 40%,transparent);
}
.snx-gen-anchor-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.snx-gen-anchor-info .lb{font-size:10.5px;color:var(--snx-accent);font-weight:700;letter-spacing:.08em;text-transform:uppercase}
.snx-gen-anchor-info .sub{
  font-size:11.5px;color:var(--dsw-alias-label-secondary,#cfd3d6);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
}
.snx-gen-anchor-x{
  width:24px;height:24px;background:none;border:1px solid color-mix(in srgb,var(--snx-accent) 30%,transparent);color:var(--snx-accent);
  border-radius:6px;cursor:pointer;font-size:12px;flex-shrink:0;
}
.snx-gen-anchor-x:hover{background:color-mix(in srgb,var(--snx-accent) 15%,transparent)}

/* ─── 风格预设 chips ─── */
.snx-gen-styles{display:flex;flex-direction:column;gap:6px;margin-top:8px}
.snx-gen-styles .lb{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--dsw-alias-label-tertiary,#adb2b8);font-weight:600;letter-spacing:.06em;text-transform:uppercase}
.snx-gen-styles .lb .ti{font-size:13px;color:var(--snx-accent)}
.snx-gen-styles-clr{
  margin-left:auto;background:none;border:none;color:var(--dsw-alias-label-tertiary,#adb2b8);cursor:pointer;
  font-size:11px;font-family:inherit;
}
.snx-gen-styles-clr:hover{color:var(--snx-error)}
.snx-gen-styles-row{display:flex;flex-wrap:wrap;gap:5px}
.snx-gen-styles-row .snx-gen-chip{font-size:11px;padding:4px 9px}

/* ─── 字符计数 + 高级标签 ─── */
.snx-gen-fprompt .lb .cnt{
  font-size:10px;color:var(--dsw-alias-label-caption,#81858c);font-weight:500;letter-spacing:0;text-transform:none;
  font-variant-numeric:tabular-nums;padding:2px 6px;background:var(--dsw-alias-bg-module-platform,#353638);border-radius:8px;
}

/* ─── 3 列参数行（模型/画质/张数）── */
.snx-gen-frow3{display:flex;gap:8px}
.snx-gen-ff.tiny{flex:0 0 70px}
.snx-gen-ff.tiny2{flex:0 0 90px}

/* ─── Segmented control（2K/4K）── */
.snx-gen-seg{
  display:inline-flex;border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:6px;background:var(--dsw-alias-bg-module-platform,#353638);overflow:hidden;
}
.snx-gen-seg button{
  flex:1;background:none;border:none;color:var(--dsw-alias-label-tertiary,#adb2b8);cursor:pointer;padding:6px 10px;
  font-size:11px;font-family:inherit;font-weight:700;letter-spacing:.05em;
}
.snx-gen-seg button:hover{color:var(--dsw-alias-label-primary,#f9fafb);background:var(--dsw-alias-interactive-bg-hover,#ffffff14)}
.snx-gen-seg button.on{
  background:color-mix(in srgb,var(--snx-accent) 16%,transparent);
  color:var(--snx-accent);
}

/* ─── 比例当前值 ─── */
.snx-gen-fsize .lb .now{
  margin-left:auto;font-size:10.5px;color:var(--dsw-alias-label-secondary,#cfd3d6);font-variant-numeric:tabular-nums;
  padding:2px 6px;background:var(--dsw-alias-bg-module-platform,#353638);border-radius:8px;
}

/* ─── 高级展开（种子）── */
.snx-gen-advanced{display:flex;flex-direction:column;gap:8px;margin-top:6px}

/* ─── Hero hover overlay ─── */
.snx-gen-hero-imgbox{cursor:zoom-in;position:relative}
.snx-gen-hero-overlay{
  position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  background:var(--dsw-alias-bg-mask-2,#0003);backdrop-filter:blur(2px);
  opacity:0;transition:opacity .15s;pointer-events:none;border-radius:8px;
}
.snx-gen-hero-imgbox:hover .snx-gen-hero-overlay{opacity:1}
.snx-gen-hero-zoom{
  padding:8px 14px;background:var(--snx-accent-fill);color:var(--dsw-alias-label-primary-foreground,#fff);border-radius:20px;
  font-size:12px;font-weight:700;letter-spacing:.04em;
  box-shadow:0 4px 16px color-mix(in srgb,var(--snx-accent) 50%,transparent);
}

/* ─── 最近画廊空状态 ─── */
.snx-gen-recent-empty{
  font-size:11.5px;color:var(--dsw-alias-label-caption,#81858c);line-height:1.55;padding:8px 4px;
  border:1px dashed var(--dsw-alias-border-l2,#ffffff1f);border-radius:6px;
}

/* ═══════ Settings tab ═══════ */
.snx-set{padding:14px;display:flex;flex-direction:column;gap:14px}
.snx-set-section{
  background:var(--dsw-alias-bg-module-platform,#353638);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:8px;padding:14px;
}
.snx-set-h{
  display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--dsw-alias-label-primary,#f9fafb);
  font-weight:700;letter-spacing:.02em;
}
.snx-set-h .ti{font-size:14px;line-height:1;color:var(--snx-accent)}
.snx-set-tip{
  font-size:11.5px;color:var(--dsw-alias-label-tertiary,#adb2b8);line-height:1.6;margin-top:10px;
}
.snx-set-tip code{
  background:var(--dsw-alias-bg-layer-2,#2c2c2e);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:4px;padding:1px 6px;
  font-size:10.5px;color:var(--snx-accent);font-family:ui-monospace,Consolas,monospace;
}
.snx-set-row{display:flex;flex-direction:column;gap:8px;margin-top:10px}
.snx-set-row>div{
  display:flex;align-items:center;justify-content:space-between;gap:10px;
  font-size:12px;padding:6px 10px;background:var(--dsw-alias-bg-layer-2,#2c2c2e);border-radius:6px;
  border:1px solid var(--dsw-alias-border-l2,#ffffff1f);
}
.snx-set-row .k{color:var(--dsw-alias-label-tertiary,#adb2b8);letter-spacing:.04em}
.snx-set-row .v{color:var(--dsw-alias-label-primary,#f9fafb);font-weight:600;font-variant-numeric:tabular-nums}
.snx-set-btn{
  background:var(--dsw-alias-bg-layer-3,#353638);color:var(--snx-error);border:1px solid color-mix(in srgb,var(--snx-error) 30%,transparent);border-radius:6px;
  padding:5px 12px;font-size:11.5px;cursor:pointer;font-family:inherit;font-weight:500;
}
.snx-set-btn:hover{background:color-mix(in srgb,var(--snx-error) 12%,transparent);color:var(--snx-error)}
.snx-set-btn:disabled{opacity:.5;cursor:default}
.snx-set-btn.save{color:var(--snx-accent);border-color:color-mix(in srgb,var(--snx-accent) 35%,transparent)}
.snx-set-btn.save:hover:not(:disabled){background:color-mix(in srgb,var(--snx-accent) 12%,transparent);color:var(--snx-accent)}
.snx-set-btn.test{color:var(--dsw-alias-label-primary,#f9fafb);border-color:var(--dsw-alias-border-l2,#ffffff1f)}
.snx-set-btn.test:hover:not(:disabled){background:var(--dsw-alias-bg-layer-3,#353638);color:var(--dsw-alias-label-primary,#f9fafb)}

/* ═══════ v6 增量：QUEUE 队列 + COMPARE 对比 ═══════ */

/* ─── 队列 tab ─── */
.snx-queue{display:flex;flex-direction:column;gap:14px;padding:14px;min-height:100%}
.snx-queue-summary{
  display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px;
}
.snx-queue-summary .stat{
  position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;
  padding:10px 6px;background:var(--dsw-alias-bg-module-platform,#353638);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:8px;
  transition:all .15s;
}
.snx-queue-summary .stat .n{font-size:18px;font-weight:900;letter-spacing:.04em;color:var(--dsw-alias-label-tertiary,#adb2b8);font-variant-numeric:tabular-nums}
.snx-queue-summary .stat .lb{font-size:10px;color:var(--dsw-alias-label-caption,#81858c);letter-spacing:.06em;text-transform:uppercase}
.snx-queue-summary .stat.running .n{color:var(--snx-accent)}
.snx-queue-summary .stat.running{border-color:color-mix(in srgb,var(--snx-accent) 40%,transparent);background:color-mix(in srgb,var(--snx-accent) 8%,transparent)}
.snx-queue-summary .stat.running .dot{
  position:absolute;top:8px;right:8px;width:6px;height:6px;border-radius:50%;
  background:var(--snx-accent);box-shadow:0 0 0 0 color-mix(in srgb,var(--snx-accent) 60%,transparent);
  animation:snx-pulse 1.4s infinite;
}
@keyframes snx-pulse{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--snx-accent) 60%,transparent)}70%{box-shadow:0 0 0 8px color-mix(in srgb,var(--snx-accent) 0%,transparent)}100%{box-shadow:0 0 0 0 color-mix(in srgb,var(--snx-accent) 0%,transparent)}}
.snx-queue-summary .stat.pending .n{color:var(--dsw-alias-label-secondary,#cfd3d6)}
.snx-queue-summary .stat.done .n{color:var(--snx-ok)}
.snx-queue-summary .stat.error .n{color:var(--snx-error)}
.snx-queue-cancel{
  align-self:flex-end;background:color-mix(in srgb,var(--snx-error) 12%,transparent);color:var(--snx-error);
  border:1px solid color-mix(in srgb,var(--snx-error) 30%,transparent);border-radius:6px;padding:6px 12px;
  font-size:11.5px;cursor:pointer;font-family:inherit;font-weight:600;
}
.snx-queue-cancel:hover:not(:disabled){background:color-mix(in srgb,var(--snx-error) 20%,transparent);color:var(--snx-error)}
/* SPEC-14 二.4：「取消其他」在无运行中任务或无等待任务时禁用（灰化，不给 hover 反馈） */
.snx-queue-cancel:disabled{opacity:.4;cursor:default;background:var(--dsw-alias-interactive-bg-hover,#ffffff14);color:var(--dsw-alias-label-caption,#81858c)}
/* SPEC-13 ②：队列「显示全部历史」toggle——中性色，开启 accent 亮起（aria-pressed 同步） */
.snx-queue-hist{
  align-self:flex-end;background:var(--dsw-alias-bg-module-platform,#353638);color:var(--dsw-alias-label-secondary,#cfd3d6);
  border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:6px;padding:6px 12px;
  font-size:11.5px;cursor:pointer;font-family:inherit;font-weight:600;
  display:inline-flex;align-items:center;gap:5px;
}
.snx-queue-hist:hover{color:var(--snx-accent);border-color:color-mix(in srgb,var(--snx-accent) 40%,transparent)}
.snx-queue-hist.on{background:color-mix(in srgb,var(--snx-accent) 12%,transparent);color:var(--snx-accent);border-color:color-mix(in srgb,var(--snx-accent) 45%,transparent)}

.snx-queue-progress{
  display:flex;flex-direction:column;gap:6px;padding:10px;
  background:color-mix(in srgb,var(--snx-accent) 5%,transparent);
  border:1px solid color-mix(in srgb,var(--snx-accent) 20%,transparent);border-radius:8px;
}
.snx-queue-progress .bar{
  height:6px;background:var(--dsw-alias-bg-layer-2,#2c2c2e);border-radius:3px;overflow:hidden;
  border:1px solid var(--dsw-alias-border-l2,#ffffff1f);
}
.snx-queue-progress .fill{
  height:100%;background:var(--snx-accent-fill);
  transition:width .3s ease-out;
  box-shadow:0 0 10px color-mix(in srgb,var(--snx-accent) 50%,transparent);
}
.snx-queue-progress .lbl{font-size:11px;color:var(--dsw-alias-label-tertiary,#adb2b8);letter-spacing:.04em;font-variant-numeric:tabular-nums}

.snx-queue-list{display:flex;flex-direction:column;gap:6px}
.snx-queue-empty{
  flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;
  padding:60px 20px;text-align:center;color:var(--dsw-alias-label-caption,#81858c);gap:6px;
}
.snx-queue-empty .big{font-size:42px;opacity:.25;line-height:1;color:var(--snx-accent);margin-bottom:8px}
.snx-queue-empty .t1{font-size:13px;color:var(--dsw-alias-label-tertiary,#adb2b8);font-weight:600}
.snx-queue-empty .t2{font-size:11px;color:var(--dsw-alias-label-caption,#81858c)}

/* ─── 队列单项 ─── */
/* v12：根改纵向容器（行 + 可展开详情），原横排样式挪到 .snx-qi-row */
.snx-qi{
  display:flex;flex-direction:column;
  background:var(--dsw-alias-bg-module-platform,#353638);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:8px;
  cursor:default;transition:all .15s;
}
.snx-qi-row{display:flex;align-items:center;gap:10px;padding:8px 10px}
.snx-qi-done{cursor:pointer}
.snx-qi-done:hover{border-color:var(--snx-accent);background:var(--dsw-alias-bg-layer-3,#353638)}
.snx-qi-error{border-color:color-mix(in srgb,var(--snx-error) 30%,transparent);background:color-mix(in srgb,var(--snx-error) 4%,transparent)}
.snx-qi-running{border-color:color-mix(in srgb,var(--snx-accent) 30%,transparent);background:color-mix(in srgb,var(--snx-accent) 5%,transparent)}
.snx-qi-pending{opacity:.85}
.snx-qi-img{
  width:54px;height:54px;border-radius:6px;flex-shrink:0;
  background:var(--dsw-alias-bg-layer-2,#2c2c2e);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);overflow:hidden;
  display:flex;align-items:center;justify-content:center;position:relative;
}
.snx-qi-img img{width:100%;height:100%;object-fit:cover}
.snx-qi-spin{display:flex;flex-direction:column;align-items:center;gap:4px;font-size:9.5px;color:var(--dsw-alias-label-tertiary,#adb2b8)}
.snx-qi-spin .spin{
  width:18px;height:18px;border-radius:50%;
  border:2px solid color-mix(in srgb,var(--snx-accent) 20%,transparent);border-top-color:var(--snx-accent);
  animation:snx-spin .8s linear infinite;
}
.snx-qi-err-ico{color:var(--snx-error);font-size:22px}
.snx-qi-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.snx-qi-pr{
  font-size:12px;color:var(--dsw-alias-label-primary,#f9fafb);line-height:1.4;
  display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden;
}
.snx-qi-meta{font-size:10.5px;color:var(--dsw-alias-label-caption,#81858c);display:flex;flex-wrap:wrap;gap:0;letter-spacing:.03em}
.snx-qi-st{
  display:inline-block;padding:1px 6px;border-radius:3px;
  font-size:9.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
}
.snx-qi-running .snx-qi-st{background:color-mix(in srgb,var(--snx-accent) 20%,transparent);color:var(--snx-accent)}
.snx-qi-pending .snx-qi-st{background:var(--dsw-alias-interactive-bg-hover,#ffffff14);color:var(--dsw-alias-label-secondary,#cfd3d6)}
.snx-qi-done .snx-qi-st{background:color-mix(in srgb,var(--snx-ok) 15%,transparent);color:var(--snx-ok)}
.snx-qi-error .snx-qi-st{background:color-mix(in srgb,var(--snx-error) 20%,transparent);color:var(--snx-error)}
.snx-qi-err-msg{color:var(--snx-error)}
.snx-qi-acts{display:flex;gap:4px;flex-shrink:0}
.snx-qi-act{
  width:26px;height:26px;background:var(--dsw-alias-bg-layer-3,#353638);color:var(--dsw-alias-label-secondary,#cfd3d6);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);
  border-radius:5px;cursor:pointer;font-size:12px;font-family:inherit;
}
.snx-qi-act:hover{background:var(--dsw-alias-interactive-bg-hover,#ffffff14);color:var(--dsw-alias-label-primary,#f9fafb)}
.snx-qi-act.danger{color:var(--snx-error);border-color:color-mix(in srgb,var(--snx-error) 30%,transparent)}
.snx-qi-act.danger:hover{background:color-mix(in srgb,var(--snx-error) 12%,transparent);color:var(--snx-error)}
/* SPEC-18 二：重排按钮 disabled（队首上移/队尾下移不可用）与并发上限选择器 */
.snx-qi-act:disabled{opacity:.35;cursor:default}
.snx-qi-act:disabled:hover{background:transparent;color:inherit}
.snx-queue-conc{display:flex;align-items:center;gap:6px;color:var(--dsw-alias-label-caption,#81858c);font-size:12px}
.snx-queue-conc select{
  background:var(--dsw-alias-bg-layer-2,#2c2c2e);color:var(--dsw-alias-label-primary,#f9fafb);
  border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:6px;
  padding:4px 6px;font-size:12px;cursor:pointer;
}
/* ── v12：行展开详情（SPEC ⑤：审讯队列——模型/尺寸/种子/负面词/错误全文/耗时两段）─── */
.snx-qi-chev{
  flex:none;display:inline-flex;align-items:center;justify-content:center;
  width:24px;height:24px;padding:0;background:none;border:none;border-radius:5px;
  color:var(--dsw-alias-label-caption,#81858c);cursor:pointer;
}
.snx-qi-chev:hover{background:var(--dsw-alias-interactive-bg-hover,#ffffff14);color:var(--dsw-alias-label-primary,#f9fafb)}
.snx-qi-chev svg{transition:transform .15s ease-out}
.snx-qi-chev.on svg{transform:rotate(180deg)}
.snx-qi-detail{padding:2px 10px 10px;border-top:1px solid var(--dsw-alias-border-l2,#ffffff1f);cursor:default}
.snx-qi-detail dl{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;margin:8px 0 0;font-size:11.5px}
.snx-qi-detail dt{color:var(--dsw-alias-label-caption,#81858c)}
.snx-qi-detail dd{margin:0;color:var(--dsw-alias-label-secondary,#cfd3d6);word-break:break-all;line-height:1.5}
.snx-qi-detail-err{
  margin-top:8px;font-size:11.5px;line-height:1.55;color:var(--snx-error);
  background:color-mix(in srgb,var(--snx-error) 8%,transparent);
  border:1px solid color-mix(in srgb,var(--snx-error) 25%,transparent);border-radius:7px;padding:7px 10px;word-break:break-all;
}

/* ─── 队列 tab 角标（pulse 动画）── */
.snx-pro-tabs button .cnt.pulse{
  background:var(--snx-accent-fill);color:var(--dsw-alias-label-primary-foreground,#fff);
  box-shadow:0 0 0 0 color-mix(in srgb,var(--snx-accent) 60%,transparent);
  animation:snx-pulse 1.4s infinite;
}

/* ═══════ COMPARE 对比视图 ═══════ */
.snx-cmp{display:flex;flex-direction:column;gap:12px;padding:14px;min-height:100%}
.snx-cmp-bar{display:flex;align-items:center;gap:8px}
.snx-cmp-picks{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;flex:1}
.snx-cmp-slot{
  position:relative;aspect-ratio:1;background:var(--dsw-alias-bg-layer-2,#2c2c2e);border:1px dashed var(--dsw-alias-border-l2,#ffffff1f);
  border-radius:6px;display:flex;align-items:center;justify-content:center;
  color:var(--dsw-alias-label-caption,#81858c);font-size:18px;
}
.snx-cmp-slot.filled{border-style:solid;border-color:var(--snx-accent)}
.snx-cmp-slot img{width:100%;height:100%;object-fit:cover;border-radius:5px}
.snx-cmp-slot-x{
  position:absolute;top:2px;right:2px;width:18px;height:18px;
  background:var(--dsw-alias-bg-mask-1,#00000080);color:var(--dsw-alias-label-primary-foreground,#fff);border:none;border-radius:50%;cursor:pointer;
  font-size:10px;line-height:1;
}
.snx-cmp-empty{
  flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;
  padding:40px 20px;text-align:center;color:var(--dsw-alias-label-caption,#81858c);gap:6px;
}
.snx-cmp-empty .big{font-size:42px;opacity:.25;line-height:1;color:var(--snx-accent);margin-bottom:8px}
.snx-cmp-empty .t1{font-size:13px;color:var(--dsw-alias-label-tertiary,#adb2b8);font-weight:600}
.snx-cmp-empty .t2{font-size:11px;color:var(--dsw-alias-label-caption,#81858c)}

/* ─── 两图三模式对比（滑块/并排/叠化；模式按钮组 CSS 见 v12 块）─── */
.snx-cmp-pair{display:flex;flex-direction:column;gap:10px}
.snx-cmp-stage{
  position:relative;background:var(--dsw-alias-bg-document-preview,#151517);border-radius:8px;overflow:hidden;
  aspect-ratio:1;cursor:ew-resize;user-select:none;
  width:100%;max-width:460px;margin:0 auto;
  border:1px solid var(--dsw-alias-border-l2,#ffffff1f);
}
.snx-cmp-base,.snx-cmp-clip img{display:block;width:100%;height:100%;object-fit:contain}
.snx-cmp-clip{
  position:absolute;inset:0;overflow:hidden;pointer-events:none;
}
.snx-cmp-handle{
  position:absolute;top:0;bottom:0;width:2px;transform:translateX(-50%);
  cursor:ew-resize;display:flex;align-items:center;justify-content:center;
}
.snx-cmp-handle-bar{
  position:absolute;inset:0;background:var(--snx-accent-fill);
  box-shadow:0 0 12px color-mix(in srgb,var(--snx-accent) 50%,transparent);
}
.snx-cmp-handle-knob{
  position:relative;width:36px;height:36px;border-radius:50%;
  background:var(--snx-accent-fill);color:var(--dsw-alias-label-primary-foreground,#fff);
  display:flex;align-items:center;justify-content:center;font-size:14px;
  box-shadow:0 4px 12px color-mix(in srgb,var(--snx-accent) 50%,transparent);
}
.snx-cmp-tag{
  position:absolute;top:8px;padding:3px 8px;background:var(--dsw-alias-bg-mask-1,#00000080);
  color:var(--dsw-alias-label-primary-foreground,#fff);font-size:10.5px;font-weight:700;letter-spacing:.06em;border-radius:4px;
}
.snx-cmp-tag.l{left:8px}
.snx-cmp-tag.r{right:8px;background:var(--snx-accent-fill)}
.snx-cmp-info{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.snx-cmp-info-c{
  background:var(--dsw-alias-bg-module-platform,#353638);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:6px;padding:8px 10px;
}
.snx-cmp-info-c .lb{font-size:10px;color:var(--dsw-alias-label-tertiary,#adb2b8);letter-spacing:.06em;text-transform:uppercase;font-weight:700;margin-bottom:4px}
.snx-cmp-info-c .pr{
  font-size:11.5px;color:var(--dsw-alias-label-primary,#f9fafb);line-height:1.4;
  display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;
}

/* ─── 3-4 图网格 ─── */
.snx-cmp-grid{display:flex;flex-direction:column;gap:8px}
.snx-cmp-grid-big{
  position:relative;background:var(--dsw-alias-bg-document-preview,#151517);border-radius:8px;overflow:hidden;
  aspect-ratio:1;border:1px solid var(--dsw-alias-border-l2,#ffffff1f);
}
.snx-cmp-grid-big img{width:100%;height:100%;object-fit:contain}
.snx-cmp-grid-big-pr{
  position:absolute;left:0;right:0;bottom:0;padding:8px 12px;
  background:linear-gradient(transparent,var(--dsw-alias-bg-mask-photo,#000000e0));color:var(--dsw-alias-label-primary-foreground,#fff);
  font-size:11.5px;line-height:1.4;
}
.snx-cmp-grid-row{display:grid;gap:6px}
.snx-cmp-grid-row.cols-2{grid-template-columns:repeat(2,1fr)}
.snx-cmp-grid-row.cols-3{grid-template-columns:repeat(3,1fr)}
.snx-cmp-grid-row.cols-4{grid-template-columns:repeat(4,1fr)}
.snx-cmp-grid-cell{
  position:relative;aspect-ratio:1;background:var(--dsw-alias-bg-layer-2,#2c2c2e);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);
  border-radius:6px;overflow:hidden;cursor:pointer;padding:0;
  transition:all .15s;
}
.snx-cmp-grid-cell img{width:100%;height:100%;object-fit:cover;display:block}
.snx-cmp-grid-cell:hover{border-color:var(--snx-accent)}
.snx-cmp-grid-cell.on{border-color:var(--snx-accent);box-shadow:0 0 0 2px color-mix(in srgb,var(--snx-accent) 30%,transparent)}
.snx-cmp-grid-cell-tag{
  position:absolute;top:4px;left:4px;padding:1px 6px;
  background:var(--dsw-alias-bg-mask-1,#00000080);color:var(--dsw-alias-label-primary-foreground,#fff);font-size:9.5px;
  font-family:ui-monospace,Consolas,monospace;border-radius:3px;
}

/* ─── 对比池 ─── */
.snx-cmp-pool{display:flex;flex-direction:column;gap:8px;margin-top:6px}
.snx-cmp-pool .lb{font-size:10.5px;color:var(--dsw-alias-label-tertiary,#adb2b8);letter-spacing:.06em;text-transform:uppercase;font-weight:700}
.snx-cmp-pool-row{
  display:grid;grid-template-columns:repeat(auto-fill,minmax(44px,1fr));gap:4px;
}
.snx-cmp-pool-item{
  position:relative;aspect-ratio:1;background:var(--dsw-alias-bg-layer-2,#2c2c2e);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);
  border-radius:5px;overflow:hidden;cursor:pointer;padding:0;
  transition:all .15s;
}
.snx-cmp-pool-item img{width:100%;height:100%;object-fit:cover;display:block}
.snx-cmp-pool-item:hover{border-color:var(--snx-accent)}
.snx-cmp-pool-item.on{border-color:var(--snx-accent);box-shadow:0 0 0 2px color-mix(in srgb,var(--snx-accent) 30%,transparent)}

/* ═══════ v7 增量：FULLSCREEN CANVAS 全屏画布 ═══════ */

/* 画布模式下的「展开」按钮 */
.snx-canvas-fs{
  position:absolute;top:8px;right:8px;z-index:10;
  background:var(--dsw-alias-button-floating-fill,#2c2c2e);color:var(--dsw-alias-label-secondary,#cfd3d6);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);
  border-radius:6px;padding:4px 9px;font-size:11px;cursor:pointer;
  font-family:inherit;font-weight:500;backdrop-filter:blur(4px);
}
.snx-canvas-fs:hover{background:color-mix(in srgb,var(--snx-accent) 15%,transparent);color:var(--snx-accent);border-color:var(--snx-accent)}

/* SPEC-18 四：画布 minimap（右下角，避让底部状态栏 28px 与左下缩放控件） */
.snx-minimap{
  position:absolute;right:12px;bottom:36px;z-index:9;
  background:var(--dsw-alias-button-floating-fill,#2c2c2ecc);backdrop-filter:blur(4px);
  border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:8px;
  padding:3px;line-height:0;
}
.snx-minimap-cv{display:block;border-radius:5px;cursor:crosshair;touch-action:none}
.snx-minimap-x{
  position:absolute;top:3px;right:3px;width:16px;height:16px;padding:0;
  display:inline-flex;align-items:center;justify-content:center;
  background:var(--dsw-alias-button-floating-fill,#2c2c2e);color:var(--dsw-alias-label-secondary,#cfd3d6);
  border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:50%;
  cursor:pointer;font-family:inherit;
}
.snx-minimap-x:hover{color:var(--snx-accent);border-color:var(--snx-accent)}
.snx-minimap-reopen{
  position:absolute;right:12px;bottom:36px;z-index:9;width:28px;height:28px;padding:0;
  display:inline-flex;align-items:center;justify-content:center;
  background:var(--dsw-alias-button-floating-fill,#2c2c2ecc);backdrop-filter:blur(4px);
  color:var(--dsw-alias-label-secondary,#cfd3d6);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);
  border-radius:8px;cursor:pointer;font-family:inherit;
}
.snx-minimap-reopen:hover{color:var(--snx-accent);border-color:var(--snx-accent)}

/* 全屏画布 overlay */
.snx-fs{
  position:fixed;inset:0;z-index:9998;
  background:var(--dsw-alias-bg-layer-1,#232324);display:flex;flex-direction:column;
  animation:snx-fs-in .2s ease-out;
}
@keyframes snx-fs-in{from{opacity:0;transform:scale(.98)}to{opacity:1;transform:scale(1)}}
.snx-fs-top{
  height:48px;flex-shrink:0;display:flex;align-items:center;gap:12px;
  padding:0 16px;border-bottom:1px solid var(--dsw-alias-border-l2,#ffffff1f);
  background:var(--dsw-alias-bg-layer-2,#2c2c2e);
}
.snx-fs-brand{display:flex;align-items:center;gap:8px;font-weight:700;font-size:13px;color:var(--dsw-alias-label-primary,#f9fafb)}
.snx-fs-brand .ti{font-size:15px;color:var(--snx-accent)}
.snx-fs-brand .cnt{
  font-size:10px;color:var(--dsw-alias-label-tertiary,#adb2b8);padding:2px 7px;background:var(--dsw-alias-bg-module-platform,#353638);border-radius:8px;
  border:1px solid var(--dsw-alias-border-l2,#ffffff1f);letter-spacing:.04em;
}
.snx-fs-hint{font-size:11px;color:var(--dsw-alias-label-caption,#81858c);letter-spacing:.04em;padding:2px 8px;border:1px dashed var(--dsw-alias-border-l2,#ffffff1f);border-radius:4px}
.snx-fs-x{
  background:color-mix(in srgb,var(--snx-error) 10%,transparent);color:var(--snx-error);border:1px solid color-mix(in srgb,var(--snx-error) 30%,transparent);
  border-radius:6px;padding:6px 12px;font-size:12px;cursor:pointer;
  font-family:inherit;font-weight:600;
}
.snx-fs-x:hover{background:color-mix(in srgb,var(--snx-error) 20%,transparent);color:var(--snx-error)}

.snx-fs-body{flex:1;min-height:0;display:flex}

/* 左右侧栏 */
.snx-fs-layers,.snx-fs-props{
  width:240px;flex-shrink:0;background:var(--dsw-alias-bg-layer-2,#2c2c2e);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);
  display:flex;flex-direction:column;min-height:0;
}
.snx-fs-layers{border-right:1px solid var(--dsw-alias-border-l2,#ffffff1f)}
.snx-fs-props{border-left:1px solid var(--dsw-alias-border-l2,#ffffff1f)}
.snx-fs-h{
  flex-shrink:0;height:36px;display:flex;align-items:center;
  padding:0 14px;font-size:11.5px;color:var(--dsw-alias-label-tertiary,#adb2b8);font-weight:700;
  letter-spacing:.08em;text-transform:uppercase;border-bottom:1px solid var(--dsw-alias-border-l2,#ffffff1f);
}
.snx-fs-layers-list{
  flex:1;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:5px;
}
.snx-fs-layer{
  display:flex;align-items:center;gap:8px;padding:6px 8px;
  background:var(--dsw-alias-bg-module-platform,#353638);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:6px;
  cursor:pointer;transition:all .12s;
}
.snx-fs-layer:hover{border-color:var(--dsw-alias-border-l3,#ffffff29);background:var(--dsw-alias-bg-layer-3,#353638)}
.snx-fs-layer.on{border-color:var(--snx-accent);background:color-mix(in srgb,var(--snx-accent) 8%,transparent)}
.snx-fs-layer-img{
  width:42px;height:42px;flex-shrink:0;border-radius:4px;
  background:var(--dsw-alias-bg-document-preview,#151517);overflow:hidden;display:flex;align-items:center;justify-content:center;
  font-size:14px;color:var(--dsw-alias-label-caption,#81858c);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);
}
.snx-fs-layer-img img{width:100%;height:100%;object-fit:cover}
.snx-fs-layer-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.snx-fs-layer-pr{
  font-size:11.5px;color:var(--dsw-alias-label-primary,#f9fafb);line-height:1.3;
  display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden;
}
.snx-fs-layer-sub{font-size:10px;color:var(--dsw-alias-label-caption,#81858c);display:flex;align-items:center;gap:4px}
.snx-fs-layer-st{
  padding:1px 5px;border-radius:3px;font-size:9px;font-weight:700;
  letter-spacing:.06em;text-transform:uppercase;
}
.st-pending{background:var(--dsw-alias-interactive-bg-hover,#ffffff14);color:var(--dsw-alias-label-secondary,#cfd3d6)}
.st-running{background:color-mix(in srgb,var(--snx-accent) 20%,transparent);color:var(--snx-accent)}
.st-done{background:color-mix(in srgb,var(--snx-ok) 15%,transparent);color:var(--snx-ok)}
.st-error{background:color-mix(in srgb,var(--snx-error) 20%,transparent);color:var(--snx-error)}
/* P1-15：图层面板行内 显示/锁 开关；隐藏图层整行降透明 */
.snx-fs-layer-acts{display:flex;gap:3px;flex-shrink:0}
.snx-fs-layer-acts button{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;padding:0;
  background:var(--dsw-alias-bg-layer-2,#2c2c2e);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:5px;
  color:var(--dsw-alias-label-tertiary,#adb2b8);cursor:pointer}
.snx-fs-layer-acts button:hover{color:var(--snx-accent);border-color:var(--snx-accent)}
.snx-fs-layer-acts button.on{color:var(--snx-warn);border-color:color-mix(in srgb,var(--snx-warn) 55%,transparent);
  background:color-mix(in srgb,var(--snx-warn) 10%,transparent)}
.snx-fs-layer.off{opacity:.5}

/* 中央画布区 */
.snx-fs-stage{
  flex:1;min-width:0;position:relative;
  background:
    radial-gradient(circle at 25% 25%,color-mix(in srgb,var(--snx-accent) 4%,transparent) 0%,transparent 50%),
    radial-gradient(circle at 75% 75%,color-mix(in srgb,var(--snx-accent) 4%,transparent) 0%,transparent 50%),
    var(--dsw-alias-bg-layer-1,#232324);
  display:flex;flex-direction:column;
}
.snx-fs-canvas{position:relative;flex:1;overflow:hidden}
.snx-fs-stage .snx-pbar{top:8px}

/* 右侧属性面板 */
.snx-fs-props-body{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:12px}
.snx-fs-prop{
  background:var(--dsw-alias-bg-module-platform,#353638);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:6px;padding:10px 12px;
}
.snx-fs-prop .lb{font-size:10px;color:var(--dsw-alias-label-tertiary,#adb2b8);letter-spacing:.06em;text-transform:uppercase;font-weight:700;margin-bottom:5px}
.snx-fs-prop .val{
  font-size:12px;color:var(--dsw-alias-label-primary,#f9fafb);line-height:1.5;
  background:var(--dsw-alias-bg-layer-2,#2c2c2e);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:4px;padding:6px 8px;
}
.snx-fs-prop .val.mono{font-family:ui-monospace,Consolas,monospace;font-size:11px;color:var(--snx-accent)}
.snx-fs-prop-acts{display:flex;flex-direction:column;gap:6px}
.snx-fs-pa{
  background:var(--dsw-alias-bg-layer-3,#353638);color:var(--dsw-alias-label-secondary,#cfd3d6);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:5px;
  padding:7px 10px;font-size:11.5px;cursor:pointer;font-family:inherit;
  text-align:left;display:flex;align-items:center;gap:6px;
}
.snx-fs-pa:hover{background:var(--dsw-alias-interactive-bg-hover,#ffffff14);color:var(--dsw-alias-label-primary,#f9fafb);border-color:var(--dsw-alias-border-l3,#ffffff29)}
.snx-fs-pa.danger{color:var(--snx-error);border-color:color-mix(in srgb,var(--snx-error) 30%,transparent)}
.snx-fs-pa.danger:hover{background:color-mix(in srgb,var(--snx-error) 10%,transparent);color:var(--snx-error)}
.snx-fs-props-empty{
  flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:8px;color:var(--dsw-alias-label-caption,#81858c);font-size:11px;padding:40px 20px;text-align:center;
}
.snx-fs-props-empty .big{font-size:36px;opacity:.25}

/* 窄屏适配：右栏宽度小时折叠侧栏 */
@container snxpro (max-width:500px){
  .snx-pro-tabs button span.ti+*{display:none}
  .snx-fs-layers,.snx-fs-props{width:160px}
  .snx-fs-layers-list{padding:4px}
}

/* ═══════ v8 增量：多参考图 / 画笔v2 / 画布工具 / 提示词库 / 快捷键 overlay / 调整 / 导出 ═══════ */

/* ── 多参考图槽位 ── */
.snx-gen-refs-add{
  width:100%;padding:7px;background:var(--dsw-alias-bg-layer-2,#2c2c2e);border:1px dashed var(--dsw-alias-border-l2,#ffffff1f);
  border-radius:6px;color:var(--dsw-alias-label-tertiary,#adb2b8);font-size:11.5px;cursor:pointer;font-family:inherit;
  margin-top:-2px;
}
.snx-gen-refs-add:hover{border-color:var(--snx-accent);color:var(--snx-accent)}
.snx-gen-refcta{display:flex;gap:6px;flex-wrap:wrap}
.snx-gen-refcta>.snx-gen-refs-add{width:auto;flex:1 1 140px;min-width:0}
.snx-gen-refs{
  background:var(--dsw-alias-bg-layer-2,#2c2c2e);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:6px;padding:8px 10px;
  margin-top:-2px;
}
.snx-gen-refs>.lb{display:flex;align-items:center;gap:5px;font-size:10.5px;color:var(--dsw-alias-label-tertiary,#adb2b8);
  letter-spacing:.06em;text-transform:uppercase;font-weight:700;margin-bottom:6px}
.snx-gen-refs>.lb .h{color:var(--dsw-alias-label-caption,#81858c);font-weight:400;text-transform:none;font-size:10px}
.snx-gen-refs-row{display:flex;flex-wrap:wrap;gap:6px}
.snx-gen-ref{
  display:flex;flex-direction:column;background:var(--dsw-alias-bg-module-platform,#353638);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);
  border-radius:5px;overflow:hidden;width:84px;
}
.snx-gen-ref-img{width:84px;height:54px;object-fit:cover;display:block}
.snx-gen-ref-meta{padding:3px 4px;display:flex;flex-direction:column;gap:2px}
.snx-gen-ref-strength{width:100%;height:3px;accent-color:var(--snx-accent)}
.snx-gen-ref-x{
  position:absolute;margin-left:-14px;margin-top:2px;width:14px;height:14px;
  background:var(--dsw-alias-bg-mask-1,#00000080);color:var(--dsw-alias-label-primary-foreground,#fff);border:none;border-radius:50%;font-size:9px;cursor:pointer;line-height:1;
}
.snx-gen-ref-add{
  display:flex;align-items:center;justify-content:center;width:84px;height:84px;
  background:var(--dsw-alias-bg-layer-2,#2c2c2e);border:1px dashed var(--dsw-alias-border-l2,#ffffff1f);border-radius:5px;
  color:var(--dsw-alias-label-tertiary,#adb2b8);font-size:11px;cursor:pointer;font-family:inherit;
}
.snx-gen-ref-add:hover{border-color:var(--snx-accent);color:var(--snx-accent)}
.snx-gen-ref-picker{
  margin-top:6px;display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:4px;
  max-height:140px;overflow-y:auto;background:var(--dsw-alias-bg-layer-2,#2c2c2e);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);
  border-radius:5px;padding:5px;
}
.snx-gen-ref-pick{
  aspect-ratio:1;background:var(--dsw-alias-bg-document-preview,#151517);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:3px;
  overflow:hidden;cursor:pointer;padding:0;
}
.snx-gen-ref-pick:hover{border-color:var(--snx-accent)}
.snx-gen-ref-pick img{width:100%;height:100%;object-fit:cover;display:block}

/* ── 提示词星标按钮 ── */
.snx-gen-star{
  background:none;border:1px solid var(--dsw-alias-border-l2,#ffffff1f);color:var(--dsw-alias-label-tertiary,#adb2b8);width:22px;height:22px;
  border-radius:4px;font-size:13px;cursor:pointer;padding:0;line-height:1;
}
.snx-gen-star.on{color:var(--snx-warn);border-color:var(--snx-warn);background:color-mix(in srgb,var(--snx-warn) 10%,transparent)}

/* ── 画笔 v2 控件 ── */
.snx-maskbar.v2{flex-wrap:wrap;max-width:520px}
.snx-brush-controls{
  display:flex;flex-direction:column;gap:4px;padding:5px 9px;
  background:var(--dsw-alias-bg-layer-1,#232324);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:6px;
}
.snx-brush-controls .lb{font-size:10.5px;color:var(--snx-accent);letter-spacing:.04em;font-weight:700}
.br-row{display:flex;align-items:center;gap:5px;font-size:10px;color:var(--dsw-alias-label-tertiary,#adb2b8)}
.br-row .br-k{width:42px;color:var(--dsw-alias-label-secondary,#cfd3d6);font-weight:500}
.br-row input[type=range]{flex:1;height:3px;accent-color:var(--snx-accent)}
.br-row .br-v{width:36px;color:var(--snx-accent);text-align:right;font-variant-numeric:tabular-nums}
.snx-brush-cursor{
  position:fixed;pointer-events:none;z-index:9999;
  border:1.5px solid var(--snx-accent);border-radius:50%;
  background:color-mix(in srgb,var(--snx-accent) 15%,transparent);mix-blend-mode:multiply;
}

/* ── Lightbox v8：3 栏 + 版本树 + 调整 + 导出 ── */
.snx-lb-body{display:grid;grid-template-columns:200px 1fr 280px;flex:1;min-height:0}
.snx-lb-stage{overflow:auto;background:var(--dsw-alias-bg-document-preview,#151517);display:flex;position:relative}
.snx-lb-imgwrap{margin:auto;flex:none}
.snx-lb-img{display:block}

.snx-lb-tree{
  background:var(--dsw-alias-bg-layer-2,#2c2c2e);border-right:1px solid var(--dsw-alias-border-l2,#ffffff1f);overflow-y:auto;
  display:flex;flex-direction:column;
}
.snx-lb-tree-h{
  flex-shrink:0;height:36px;display:flex;align-items:center;
  padding:0 12px;font-size:11.5px;color:var(--dsw-alias-label-tertiary,#adb2b8);font-weight:700;
  letter-spacing:.08em;text-transform:uppercase;border-bottom:1px solid var(--dsw-alias-border-l2,#ffffff1f);
}
.snx-tree{flex:1;overflow-y:auto;padding:6px}
.snx-tree-row{
  display:flex;align-items:center;gap:6px;width:100%;padding:4px 6px;
  background:var(--dsw-alias-bg-module-platform,#353638);border:1px solid transparent;border-radius:4px;
  cursor:pointer;font-family:inherit;text-align:left;
}
.snx-tree-row:hover{background:var(--dsw-alias-bg-layer-3,#353638)}
.snx-tree-node.on>.snx-tree-row{border-color:var(--snx-accent);background:color-mix(in srgb,var(--snx-accent) 8%,transparent)}
.snx-tree-thumb{width:30px;height:30px;border-radius:3px;background:var(--dsw-alias-bg-document-preview,#151517);overflow:hidden;flex-shrink:0;
  display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--dsw-alias-label-caption,#81858c)}
.snx-tree-thumb img{width:100%;height:100%;object-fit:cover}
.snx-tree-info{flex:1;min-width:0}
.snx-tree-info .pr{font-size:10.5px;color:var(--dsw-alias-label-primary,#f9fafb);line-height:1.3;
  display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}
.snx-tree-info .sub{font-size:9px;color:var(--dsw-alias-label-caption,#81858c);display:flex;gap:3px;align-items:center}
.snx-tree-curr{color:var(--snx-accent);font-weight:700}
.snx-tree-cnt{
  background:var(--dsw-alias-interactive-bg-hover,#ffffff14);color:var(--dsw-alias-label-tertiary,#adb2b8);font-size:9px;padding:1px 5px;
  border-radius:8px;font-weight:700;
}
.snx-tree-children{border-left:1px dashed var(--dsw-alias-border-l2,#ffffff1f);margin-left:14px}

.snx-lb-side{
  background:var(--dsw-alias-bg-layer-2,#2c2c2e);border-left:1px solid var(--dsw-alias-border-l2,#ffffff1f);overflow-y:auto;
  display:flex;flex-direction:column;
}
.snx-lb-side>.snx-lb-meta{padding:12px;border-bottom:1px solid var(--dsw-alias-border-l2,#ffffff1f)}
.snx-lb-side>.snx-lb-acts{flex-shrink:0;padding:10px;border-bottom:1px solid var(--dsw-alias-border-l2,#ffffff1f)}

.snx-lb-up{
  background:color-mix(in srgb,var(--snx-accent) 10%,transparent);color:var(--snx-accent);border:1px solid color-mix(in srgb,var(--snx-accent) 30%,transparent);
  border-radius:5px;padding:4px 8px;font-size:10.5px;cursor:pointer;font-family:inherit;font-weight:600;
  margin-right:6px;
}
.snx-lb-up:hover{background:color-mix(in srgb,var(--snx-accent) 20%,transparent);color:var(--dsw-alias-label-primary,#f9fafb)}

.snx-lb-fav{
  background:none;border:1px solid var(--dsw-alias-border-l2,#ffffff1f);color:var(--dsw-alias-label-tertiary,#adb2b8);width:26px;height:26px;
  border-radius:4px;font-size:14px;cursor:pointer;line-height:1;
}
.snx-lb-fav.on{color:var(--snx-warn);border-color:var(--snx-warn);background:color-mix(in srgb,var(--snx-warn) 10%,transparent)}

/* 调整浮窗 */
.snx-lb-adj-h{display:flex;align-items:center;gap:6px;margin-bottom:8px;font-size:11px;color:var(--snx-accent);font-weight:700}
.snx-lb-adj-h button{background:none;border:1px solid var(--dsw-alias-border-l2,#ffffff1f);color:var(--dsw-alias-label-secondary,#cfd3d6);
  border-radius:4px;padding:3px 7px;font-size:10px;cursor:pointer;font-family:inherit}
.snx-lb-adj-h button.save{background:var(--snx-accent-fill);border:none;color:var(--dsw-alias-label-primary-foreground,#fff);font-weight:700}
.snx-lb-adj-h button.save:disabled{opacity:.5;cursor:default}

/* 导出面板 */
.snx-lb-export{
  margin:0 10px 10px;background:var(--dsw-alias-bg-module-platform,#353638);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);
  border-radius:6px;padding:10px 12px;
}
.snx-lb-export .lb{font-size:10.5px;color:var(--snx-accent);font-weight:700;margin-bottom:6px;
  letter-spacing:.04em}
.snx-lb-export label{display:grid;grid-template-columns:42px 1fr 36px;gap:6px;
  align-items:center;font-size:10.5px;color:var(--dsw-alias-label-secondary,#cfd3d6);margin-bottom:5px}
.snx-lb-export label input[type=range]{height:3px;accent-color:var(--snx-accent)}
.snx-lb-export label .v{text-align:right;color:var(--snx-accent);font-variant-numeric:tabular-nums}
.snx-lb-export select{
  background:var(--dsw-alias-bg-layer-2,#2c2c2e);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);color:var(--dsw-alias-label-primary,#f9fafb);
  border-radius:4px;padding:4px 6px;font-family:inherit;font-size:10.5px;
}
.snx-lb-export-chk{display:flex!important;grid-template-columns:auto 1fr!important;
  gap:6px;cursor:pointer}
.snx-lb-export-chk input[type=checkbox]{accent-color:var(--snx-accent)}
.snx-lb-export-acts{display:flex;gap:5px;margin-top:8px}
.snx-lb-export-acts .snx-lb-act{font-size:10.5px;padding:5px 9px}

/* ── 画廊工具栏（搜索/标签/排序/收藏筛选）── */
.snx-gal-tools{
  display:flex;flex-direction:column;gap:6px;padding:8px 12px;
  background:var(--dsw-alias-bg-layer-2,#2c2c2e);border-bottom:1px solid var(--dsw-alias-border-l2,#ffffff1f);
}
.snx-gal-q{
  width:100%;box-sizing:border-box;padding:6px 9px;background:var(--dsw-alias-bg-layer-2,#2c2c2e);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);
  border-radius:5px;color:var(--dsw-alias-label-primary,#f9fafb);font-size:11.5px;font-family:inherit;
}
.snx-gal-q:focus{outline:none;border-color:var(--snx-accent)}
.snx-gal-tools>div:not(.snx-gal-tags){
  display:flex;align-items:center;gap:6px;
}
.snx-gal-fav{
  background:var(--dsw-alias-bg-module-platform,#353638);color:var(--dsw-alias-label-tertiary,#adb2b8);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:5px;
  padding:4px 9px;font-size:10.5px;cursor:pointer;font-family:inherit;
}
.snx-gal-fav.on{color:var(--snx-warn);border-color:var(--snx-warn);background:color-mix(in srgb,var(--snx-warn) 10%,transparent)}
.snx-gal-tags{display:flex;flex-wrap:wrap;gap:4px}
.snx-gal-tag{
  background:var(--dsw-alias-bg-module-platform,#353638);color:var(--dsw-alias-label-tertiary,#adb2b8);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:3px;
  padding:3px 7px;font-size:10px;cursor:pointer;font-family:inherit;font-weight:500;
}
.snx-gal-tag:hover{color:var(--snx-accent);border-color:var(--snx-accent)}
.snx-gal-tag.on{background:color-mix(in srgb,var(--snx-accent) 15%,transparent);color:var(--snx-accent);border-color:var(--snx-accent)}

/* 画廊项的收藏 + 标签标记 */
.snx-gal-item{position:relative}
.snx-gal-item.fav .snx-gal-item-img{outline:2px solid color-mix(in srgb,var(--snx-warn) 50%,transparent);outline-offset:-2px}
.snx-gal-item-fav{
  position:absolute;top:4px;left:4px;width:22px;height:22px;
  background:var(--dsw-alias-bg-mask-1,#00000080);color:var(--snx-warn);font-size:13px;
  display:flex;align-items:center;justify-content:center;border-radius:50%;
  border:1px solid color-mix(in srgb,var(--snx-warn) 30%,transparent);
}
.snx-gal-item-tags{
  position:absolute;bottom:4px;left:4px;right:4px;
  display:flex;flex-wrap:wrap;gap:3px;
}
.snx-gal-item-tag{
  background:var(--dsw-alias-bg-mask-1,#00000080);color:var(--snx-accent);font-size:9px;
  padding:1px 5px;border-radius:3px;
}

/* ── P0-2：画廊 pending / error 占位卡（不再渲染破图块）── */
.snx-gal-item.ph{cursor:default}
.snx-gal-item.ph:hover{transform:none;border-color:var(--dsw-alias-border-l2,#ffffff1f);box-shadow:none}
.snx-gal-item.ph-err{border-color:color-mix(in srgb,var(--snx-error) 30%,transparent)}
.snx-gal-ph-img{display:flex;align-items:center;justify-content:center;color:var(--snx-accent)}
.snx-gal-item.ph-err .snx-gal-ph-img{color:var(--snx-error)}

/* ── 提示词库 section ── */
.snx-promptlib{display:flex;flex-direction:column;gap:6px}
.snx-promptlib-h{
  font-size:10px;color:var(--dsw-alias-label-tertiary,#adb2b8);font-weight:700;letter-spacing:.06em;
  text-transform:uppercase;margin-top:6px;margin-bottom:2px;
}
.snx-promptlib-item{
  display:flex;align-items:center;gap:6px;padding:5px 8px;
  background:var(--dsw-alias-bg-module-platform,#353638);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:5px;
}
.snx-promptlib-item.star{border-color:color-mix(in srgb,var(--snx-warn) 30%,transparent);background:color-mix(in srgb,var(--snx-warn) 4%,transparent)}
.snx-promptlib-pr{
  flex:1;min-width:0;font-size:11px;color:var(--dsw-alias-label-primary,#f9fafb);cursor:pointer;line-height:1.4;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;
}
.snx-promptlib-pr:hover{color:var(--snx-accent)}
.snx-promptlib-ts{font-size:9.5px;color:var(--dsw-alias-label-caption,#81858c);font-weight:400;flex-shrink:0}
.snx-promptlib-star,.snx-promptlib-x{
  background:none;border:none;color:var(--dsw-alias-label-tertiary,#adb2b8);cursor:pointer;font-size:14px;
  padding:0 4px;line-height:1;flex-shrink:0;
}
.snx-promptlib-star:hover,.snx-promptlib-x:hover{color:var(--snx-warn)}
.snx-promptlib-empty{font-size:11px;color:var(--dsw-alias-label-caption,#81858c);text-align:center;padding:14px 4px}

/* ── 快捷键速查 overlay ── */
.snx-help-bg{
  position:fixed;inset:0;z-index:10000;
  background:var(--dsw-alias-bg-mask-1,#00000080);display:flex;align-items:center;justify-content:center;
  backdrop-filter:blur(4px);animation:snx-fs-in .2s ease-out;
}
.snx-help{
  width:680px;max-width:92vw;max-height:88vh;
  background:var(--dsw-alias-bg-layer-2,#2c2c2e);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);
  border-radius:12px;display:flex;flex-direction:column;
  box-shadow:0 16px 64px rgba(0,0,0,.22);
}
.snx-help-top{
  display:flex;align-items:center;gap:8px;padding:14px 18px;
  border-bottom:1px solid var(--dsw-alias-border-l2,#ffffff1f);font-size:14px;font-weight:700;color:var(--dsw-alias-label-primary,#f9fafb);
}
.snx-help-top .ti{font-size:18px;color:var(--snx-accent)}
.snx-help-top .h{font-size:10.5px;color:var(--dsw-alias-label-caption,#81858c);letter-spacing:.04em}
.snx-help-top .snx-help-x{
  background:var(--dsw-alias-bg-layer-3,#353638);color:var(--dsw-alias-label-secondary,#cfd3d6);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);
  border-radius:5px;width:30px;height:30px;cursor:pointer;font-size:13px;
}
.snx-help-top .snx-help-x:hover{background:var(--dsw-alias-interactive-bg-hover,#ffffff14);color:var(--dsw-alias-label-primary,#f9fafb)}
.snx-help-body{
  padding:16px;overflow-y:auto;display:grid;
  grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px;
}
.snx-help-gh{
  font-size:11px;color:var(--dsw-alias-label-tertiary,#adb2b8);font-weight:700;letter-spacing:.06em;
  text-transform:uppercase;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid var(--dsw-alias-border-l2,#ffffff1f);
}
.snx-help-row{
  display:flex;align-items:center;gap:8px;font-size:11.5px;color:var(--dsw-alias-label-secondary,#cfd3d6);
  padding:4px 0;line-height:1.5;
}
.snx-help-row kbd{
  display:inline-block;min-width:110px;padding:3px 8px;
  background:var(--dsw-alias-bg-layer-3,#353638);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);
  border-radius:4px;font-family:ui-monospace,Consolas,monospace;
  font-size:10.5px;color:var(--snx-accent);text-align:center;flex-shrink:0;
  box-shadow:0 1px 0 var(--dsw-alias-bg-layer-2,#2c2c2e) inset;
}
.snx-help-foot{
  padding:10px 18px;border-top:1px solid var(--dsw-alias-border-l2,#ffffff1f);font-size:10.5px;color:var(--dsw-alias-label-caption,#81858c);
  text-align:center;letter-spacing:.06em;
}

/* ── 图层属性（v8）── */
.snx-fs-prop-row{margin-bottom:6px}
.snx-fs-prop-row label{display:grid;grid-template-columns:48px 1fr 36px;gap:6px;
  align-items:center;font-size:10.5px;color:var(--dsw-alias-label-secondary,#cfd3d6)}
.snx-fs-prop-row input[type=range]{height:3px;accent-color:var(--snx-accent)}
.snx-fs-prop-row .v{text-align:right;color:var(--snx-accent);font-variant-numeric:tabular-nums;font-size:10px}
.snx-fs-prop-row select{
  width:100%;background:var(--dsw-alias-bg-layer-2,#2c2c2e);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);color:var(--dsw-alias-label-primary,#f9fafb);
  border-radius:4px;padding:4px 6px;font-size:10.5px;font-family:inherit;
}
.snx-fs-prop-row.btns{display:flex;gap:5px}
.snx-fs-pa2{
  flex:1;background:var(--dsw-alias-bg-layer-3,#353638);color:var(--dsw-alias-label-secondary,#cfd3d6);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:5px;
  padding:6px;font-size:11px;cursor:pointer;font-family:inherit;
}
.snx-fs-pa2:hover{background:var(--dsw-alias-interactive-bg-hover,#ffffff14);color:var(--dsw-alias-label-primary,#f9fafb)}
.snx-fs-pa2.on{background:color-mix(in srgb,var(--snx-accent) 15%,transparent);color:var(--snx-accent);border-color:var(--snx-accent)}

/* ── 窄屏适应：版树/调整/导出在 360px 内自动折叠 ── */
@container snxpro (max-width:420px){
  .snx-lb-body{grid-template-columns:1fr 200px}
  .snx-lb-tree{display:none}
}

/* ═══════ v8.1：dsh-better-sidebar 文件预览器样式 ═══════ */
.snx-bsb-preview{
  display:flex;flex-direction:column;width:100%;height:100%;
  background:var(--dsw-alias-bg-layer-2,#2c2c2e);color:var(--dsw-alias-label-primary,#f9fafb);
  font-family:inherit;
}
.snx-bsb-toolbar{
  display:flex;align-items:center;gap:6px;
  padding:6px 10px;background:var(--dsw-alias-bg-layer-3,#353638);border-bottom:1px solid var(--dsw-alias-border-l2,#ffffff1f);
  font-size:11px;flex-shrink:0;
}
.snx-bsb-path{
  max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  color:var(--dsw-alias-label-tertiary,#adb2b8);font-family:ui-monospace,Consolas,monospace;font-size:10.5px;
}
.snx-bsb-info{color:var(--snx-accent);font-variant-numeric:tabular-nums}
.snx-bsb-toolbar button{
  background:var(--dsw-alias-bg-layer-3,#353638);color:var(--dsw-alias-label-secondary,#cfd3d6);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:4px;
  padding:3px 8px;font-size:11px;cursor:pointer;font-family:inherit;
}
.snx-bsb-toolbar button:hover{background:var(--dsw-alias-interactive-bg-hover,#ffffff14);color:var(--dsw-alias-label-primary,#f9fafb)}
.snx-bsb-toolbar button.snx-bsb-dl{
  background:var(--snx-accent-fill);border:none;color:var(--dsw-alias-label-primary-foreground,#fff);font-weight:600;
}
.snx-bsb-pct{
  display:inline-block;min-width:42px;text-align:center;color:var(--snx-accent);
  font-variant-numeric:tabular-nums;font-size:10.5px;
}
.snx-bsb-canvas{
  flex:1;overflow:auto;display:flex;align-items:center;justify-content:center;
  background:
    linear-gradient(45deg,color-mix(in srgb,var(--dsw-alias-label-primary,#f9fafb) 4%,transparent) 25%,transparent 25%) 0 0/16px 16px,
    linear-gradient(-45deg,color-mix(in srgb,var(--dsw-alias-label-primary,#f9fafb) 4%,transparent) 25%,transparent 25%) 0 8px/16px 16px,
    linear-gradient(45deg,transparent 75%,color-mix(in srgb,var(--dsw-alias-label-primary,#f9fafb) 4%,transparent) 75%) 8px -8px/16px 16px,
    linear-gradient(-45deg,transparent 75%,color-mix(in srgb,var(--dsw-alias-label-primary,#f9fafb) 4%,transparent) 75%) -8px 0/16px 16px,
    var(--dsw-alias-bg-layer-2,#2c2c2e);
  padding:20px;min-height:0;
}
.snx-bsb-canvas img{
  display:block;max-width:none;transition:width .12s ease-out,height .12s ease-out;
  box-shadow:0 8px 32px rgba(0,0,0,.28);
}
.snx-bsb-load,.snx-bsb-err{
  flex:1;display:flex;align-items:center;justify-content:center;gap:10px;
  color:var(--dsw-alias-label-tertiary,#adb2b8);font-size:13px;
}
.snx-bsb-err{color:var(--snx-error)}

/* ── v9：会话内灯箱（聊天页全屏预览，独立于工作台 lightbox；portal 挂 body）──
   SPEC-13 ③：升级为 左图右「参数清单」——右栏复用工作台灯箱行级回填组件与样式
   （.snx-lb-rows / .snx-lb-row / .snx-lb-plist-go，含 snx-row-flash 行高亮），底部动作行 */
.snx-tvlb{position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.82);
  display:flex;align-items:center;justify-content:center;cursor:zoom-out;
  animation:snx-tvlb-in .14s ease-out}
@keyframes snx-tvlb-in{from{opacity:0}to{opacity:1}}
.snx-tvlb-x{position:fixed;top:14px;right:18px;background:none;border:none;color:#cfd3d6;
  font-size:22px;cursor:pointer;line-height:1}
.snx-tvlb-x:hover{color:#fff}
.snx-tvlb-frame{display:flex;max-width:92vw;max-height:86vh;min-height:280px;border-radius:10px;overflow:hidden;
  box-shadow:0 18px 60px rgba(0,0,0,.5);cursor:default}
.snx-tvlb-stage{flex:1;min-width:0;display:flex;align-items:center;justify-content:center;
  background:var(--dsw-alias-bg-document-preview,#151517)}
.snx-tvlb-stage img{display:block;max-width:min(62vw,100%);max-height:86vh;object-fit:contain;cursor:default}
.snx-tvlb-side{width:330px;flex:none;display:flex;flex-direction:column;min-height:0;
  border-left:1px solid var(--dsw-alias-border-l2,#ffffff1f);
  background:var(--dsw-alias-bg-layer-2,#2c2c2e)}
.snx-tvlb-h{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;
  border-bottom:1px solid var(--dsw-alias-border-l2,#ffffff1f);
  font-size:12px;font-weight:600;color:var(--dsw-alias-label-tertiary,#adb2b8)}
.snx-tvlb-side .snx-lb-rows{flex:1;min-height:0;overflow-y:auto;padding:4px}
.snx-tvlb-acts{display:flex;gap:6px;padding:10px 12px;border-top:1px solid var(--dsw-alias-border-l2,#ffffff1f);flex-wrap:wrap}
.snx-tvlb-acts button{display:inline-flex;align-items:center;gap:5px;font-family:inherit;font-size:11.5px;
  color:var(--dsw-alias-label-secondary,#cfd3d6);background:var(--dsw-alias-interactive-bg-hover,#ffffff14);
  border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:7px;padding:5px 10px;cursor:pointer}
.snx-tvlb-acts button:hover{color:var(--snx-accent);border-color:color-mix(in srgb,var(--snx-accent) 40%,transparent)}
.snx-tvlb-acts button.snx-ins-btn.err{border-color:var(--snx-error);color:var(--snx-error);white-space:normal;text-align:left}
.snx-tvlb-acts button[disabled]{opacity:.55;cursor:default}

/* ── v9：回合尾投递（turnTail：生成的图直接落在回复下方）── */
.snx-tail{display:flex;flex-wrap:wrap;gap:10px;min-width:0;padding:2px 0}
/* SPEC-13 ④：回合尾多图 x/N 角标——样式对齐 v11 对比视图 .snx-cmp-tag（黑底白字圆角）*/
.snx-tail-img{position:relative}
.snx-tail-idx{position:absolute;top:8px;left:8px;padding:3px 8px;pointer-events:none;
  background:var(--dsw-alias-bg-mask-1,#00000080);color:var(--dsw-alias-label-primary-foreground,#fff);
  font-size:10.5px;font-weight:700;letter-spacing:.06em;border-radius:4px}
/* SPEC-14 ①：图未加载完时保留占位框（否则 img 0×0，整行塌成 0 高度）；加载失败给错误文案 */
.snx-tv-img img.snx-img-wait{min-width:160px;min-height:120px;
  background:color-mix(in srgb,var(--snx-accent) 8%,transparent)}
.snx-tv-img img.snx-img-err{min-width:120px;min-height:40px;object-fit:contain;opacity:.4}
.snx-tail-err{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
  font-size:12px;color:var(--snx-error);white-space:nowrap;pointer-events:none}

/* ── v9：设置页顶部状态卡（对齐 dsh 设置页样式）── */
.snx-hero{display:flex;gap:8px;flex-wrap:wrap;margin:2px 0 6px}
.snx-hero-tile{flex:1;min-width:96px;border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:10px;
  padding:9px 12px;background:color-mix(in srgb,var(--dsw-alias-label-primary,#f9fafb) 4%,transparent);
  display:flex;flex-direction:column;gap:1px}
.snx-hero-num{font-size:16px;font-weight:600;line-height:1.2;color:var(--dsw-alias-label-primary,#f9fafb);
  font-variant-numeric:tabular-nums;display:flex;align-items:center;gap:6px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.snx-hero-dot{width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-state-success-primary,#22c55e);flex:none}
.snx-hero-dot.off{background:var(--dsw-alias-label-caption,#81858c)}
.snx-hero-dot.err{background:var(--dsw-alias-state-error-primary,#f25a5a)}
.snx-hero-lb{font-size:11px;color:var(--dsw-alias-label-tertiary,#adb2b8)}

/* ── v10：图标微动效 / 自定义下拉 / 飞出 / 开关 / 转圈 ── */
.snx-spinring{display:inline-block;width:12px;height:12px;border-radius:50%;border:2px solid color-mix(in srgb,var(--snx-accent) 35%,transparent);border-top-color:var(--snx-accent);animation:snx-spin .8s linear infinite;vertical-align:-2px}
@keyframes snx-spin{to{transform:rotate(360deg)}}
.snx-pending-ov{position:absolute;z-index:7;display:grid;place-items:center;pointer-events:none;background:color-mix(in srgb,var(--snx-accent) 7%,transparent);border:1.5px dashed color-mix(in srgb,var(--snx-accent) 55%,transparent);border-radius:9px}
.snx-pending-ov .ring{width:26px;height:26px;border-radius:50%;border:2.5px solid color-mix(in srgb,var(--snx-accent) 30%,transparent);border-top-color:var(--snx-accent);animation:snx-spin 1s linear infinite}
.snx-pending-ov .txt{position:absolute;bottom:-18px;left:50%;transform:translateX(-50%);font-size:10.5px;color:var(--snx-accent);white-space:nowrap}
.snx-sel{position:relative;display:inline-block;min-width:0}
.snx-sel-btn{display:inline-flex;align-items:center;gap:6px;width:100%;box-sizing:border-box;background:var(--dsw-alias-bg-module-platform,#353638);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:6px;color:var(--dsw-alias-label-primary,#f9fafb);font-size:11.5px;font-family:inherit;padding:5px 9px;cursor:pointer;justify-content:space-between}
.snx-sel-btn:hover{border-color:var(--snx-accent)}
.snx-sel-btn .lb{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* v11.2：定位(position/left/top/min-width)由组件内联 fixed 样式接管，这里只留观感与变量作用域
   （弹层 portal 挂 body，脱离 .snx-pro，故已加入文件头部的主题令牌清单）*/
.snx-sel-pop{z-index:320;max-height:220px;overflow-y:auto;background:var(--dsw-alias-bg-layer-3,#353638);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:8px;box-shadow:0 12px 32px rgba(0,0,0,.4);padding:4px}
.snx-sel-opt{display:flex;align-items:center;gap:6px;width:100%;text-align:left;background:none;border:none;color:var(--dsw-alias-label-secondary,#cfd3d6);font-size:11.5px;font-family:inherit;padding:6px 9px;border-radius:5px;cursor:pointer;white-space:nowrap}
.snx-sel-opt:hover{background:var(--dsw-alias-interactive-bg-hover,#ffffff14);color:var(--dsw-alias-label-primary,#f9fafb)}
/* P1-4：键盘高亮项（aria-activedescendant 对应项，与 hover 同观感）*/
.snx-sel-opt.hl{background:var(--dsw-alias-interactive-bg-hover,#ffffff14);color:var(--dsw-alias-label-primary,#f9fafb)}
.snx-sel-opt.on{color:var(--snx-accent)}
.snx-sel-opt .d{margin-left:auto;opacity:.9;display:inline-flex}
.snx-flyout{position:absolute;z-index:70;background:var(--dsw-alias-bg-layer-3,#353638);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:10px;box-shadow:0 14px 40px rgba(0,0,0,.45);padding:12px;width:236px}
.snx-flyout h4{margin:0 0 10px;font-size:12px;color:var(--dsw-alias-label-primary,#f9fafb);display:flex;align-items:center;gap:6px}
.snx-flyout h4 svg{flex:none}
.snx-frow{display:flex;align-items:center;gap:8px;margin-bottom:10px}
.snx-frow label{font-size:11.5px;color:var(--dsw-alias-label-tertiary,#adb2b8);width:58px;flex:none}
.snx-frow input[type=range]{flex:1;accent-color:var(--snx-accent)}
.snx-frow .val{font-size:11px;color:var(--dsw-alias-label-secondary,#cfd3d6);width:34px;text-align:right;font-variant-numeric:tabular-nums}
.snx-swrow{display:flex;align-items:center;justify-content:space-between;font-size:11.5px;color:var(--dsw-alias-label-tertiary,#adb2b8)}
.snx-sw{width:30px;height:17px;border-radius:9px;background:rgba(255,255,255,.16);position:relative;cursor:pointer;transition:background .15s;flex:none;border:none;padding:0}
.snx-sw.on{background:var(--snx-accent-fill)}
.snx-sw::after{content:"";position:absolute;top:2px;left:2px;width:13px;height:13px;border-radius:50%;background:#fff;transition:left .15s}
.snx-sw.on::after{left:15px}
.snx-seg2{display:inline-flex;border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:7px;overflow:hidden}
.snx-seg2 button{background:none;border:none;color:var(--dsw-alias-label-tertiary,#adb2b8);font-size:11.5px;font-family:inherit;padding:4px 11px;cursor:pointer}
.snx-seg2 button.on{background:var(--snx-accent-fill);color:var(--dsw-alias-label-primary-foreground,#fff)}
.snx-adjrow{display:flex;align-items:center;gap:8px;margin-bottom:7px}
.snx-adjrow label{font-size:11.5px;color:var(--dsw-alias-label-tertiary,#adb2b8);width:32px;flex:none}
.snx-adjrow input[type=range]{flex:1;height:3px;accent-color:var(--snx-accent)}
.snx-adjrow .v{width:34px;text-align:right;font-size:11px;color:var(--dsw-alias-label-secondary,#cfd3d6);font-variant-numeric:tabular-nums}

/* ── v10：灯箱停靠调整面板 + 翻页 ── */
.snx-lb-side{overflow-y:auto}
.snx-lb-adj2{background:var(--dsw-alias-bg-layer-2,#2c2c2e);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:10px;padding:10px 11px;margin-bottom:10px}
.snx-lb-adj2 .snx-adjrow span:first-child{font-size:11.5px;color:var(--dsw-alias-label-tertiary,#adb2b8)}
.snx-lb-adj-h{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-primary,#f9fafb);margin-bottom:9px}
.snx-lb-adj-live{font-size:10px;color:var(--dsw-alias-label-caption,#81858c);font-weight:400}
.snx-lb-presets{display:flex;gap:5px;flex-wrap:wrap;margin:8px 0 10px}
.snx-lb-preset{background:none;border:1px solid var(--dsw-alias-border-l2,#ffffff1f);color:var(--dsw-alias-label-tertiary,#adb2b8);font-size:11px;font-family:inherit;border-radius:999px;padding:3px 10px;cursor:pointer;transition:all .15s}
.snx-lb-preset:hover{color:var(--dsw-alias-label-primary,#f9fafb);border-color:var(--dsw-alias-label-caption,#81858c)}
.snx-lb-nav{display:flex;align-items:center;gap:6px}
.snx-lb-nav button{background:var(--dsw-alias-button-floating-fill,#2c2c2e);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);color:var(--dsw-alias-label-secondary,#cfd3d6);border-radius:6px;padding:3px 10px;cursor:pointer;font-size:12px;font-family:inherit}
.snx-lb-nav button:hover{color:var(--snx-accent);border-color:var(--snx-accent)}
.snx-lb-navct{font-size:11px;color:var(--dsw-alias-label-tertiary,#adb2b8);font-variant-numeric:tabular-nums;min-width:44px;text-align:center}
.snx-lb-adj-rst,.snx-lb-adj-save{display:inline-flex;align-items:center;justify-content:center;gap:5px;border-radius:7px;padding:6px 0;font-size:11.5px;font-family:inherit;cursor:pointer}
.snx-lb-adj-rst{background:rgba(255,255,255,.07);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);color:var(--dsw-alias-label-secondary,#cfd3d6)}
.snx-lb-adj-rst:hover:not(:disabled){color:var(--dsw-alias-label-primary,#f9fafb)}
.snx-lb-adj-save{background:var(--snx-accent-fill);border:none;color:var(--dsw-alias-label-primary-foreground,#fff);font-weight:600}
.snx-lb-adj-save:hover:not(:disabled){filter:brightness(1.15)}
.snx-lb-adj-rst:disabled,.snx-lb-adj-save:disabled{opacity:.45;cursor:default}

/* ── v10.1：对账补漏（无样式类全修）─── */
.snx-gal-bar .chip{background:none;border:1px solid var(--dsw-alias-border-l2,#ffffff1f);color:var(--dsw-alias-label-tertiary,#adb2b8);
  font-size:11.5px;font-family:inherit;border-radius:999px;padding:3px 12px;cursor:pointer;transition:all .15s}
.snx-gal-bar .chip:hover{color:var(--dsw-alias-label-primary,#f9fafb);border-color:var(--dsw-alias-label-caption,#81858c)}
.snx-gal-bar .chip.on{border-color:var(--snx-accent);color:var(--snx-accent);background:color-mix(in srgb,var(--snx-accent) 12%,transparent)}
.snx-gal-bar .lbl{display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--dsw-alias-label-tertiary,#adb2b8);letter-spacing:.04em}
.snx-gal-bar .lbl svg{flex:none}
.snx-gen-fneg{margin-top:10px;border-top:1px dashed var(--dsw-alias-border-l2,#ffffff1f);padding-top:8px}
.snx-gen-fsize{margin-top:8px}
.snx-help-g{font-size:11px;color:var(--snx-accent);letter-spacing:.08em;margin:12px 0 6px;font-weight:600}
/* v12 清理（静态对账）：此处旧版 .snx-lb-pr 三行随上一处一并删除，JS 零引用 */
.snx-tree-node{margin:2px 0}

/* ── v10.2：质感补课（品牌/主按钮/页签/对比手柄）─── */
.snx-pro-ico{background:linear-gradient(135deg,#4176e6,#22d3ee);color:var(--dsw-alias-label-primary-foreground,#fff);border-radius:6px}
.snx-cv-top .brand::before{content:"";display:inline-block;width:18px;height:18px;margin-right:8px;vertical-align:-4px;border-radius:5px;
  background:linear-gradient(135deg,#4176e6,#22d3ee) ;box-shadow:0 2px 8px color-mix(in srgb,var(--snx-accent) 40%,transparent)}
.snx-gen-go{background:linear-gradient(135deg,var(--snx-accent-fill),color-mix(in srgb,var(--snx-accent) 55%,#22d3ee))!important;
  box-shadow:0 4px 16px color-mix(in srgb,var(--snx-accent) 32%,transparent);transition:box-shadow .15s,filter .15s}
.snx-gen-go:hover:not(.disabled):not(.busy){box-shadow:0 6px 24px color-mix(in srgb,var(--snx-accent) 52%,transparent);filter:brightness(1.08)}
.snx-pro-tabs button{border-radius:8px 8px 0 0;transition:color .15s,background .15s}
.snx-pro-tabs button.on{background:color-mix(in srgb,var(--snx-accent) 9%,transparent)}
.snx-cmp-handle-bar{width:3px;border-radius:2px}
.snx-cmp-handle-knob{width:40px;height:40px;font-size:15px;letter-spacing:-1px}
.snx-cmp-tag{padding:4px 10px;border-radius:6px;font-size:11px;backdrop-filter:blur(4px)}
.snx-cmp-tag.l{border:1px solid rgba(255,255,255,.4);background:rgba(10,10,14,.6)}
.snx-cmp-tag.r{border:1px solid color-mix(in srgb,var(--snx-accent) 60%,transparent)}
/* v12：对比三模式顶栏（滑块/并排/叠化，当前高亮）+ 交换按钮（SPEC 三.3，对齐原型 pv-seg/pv-swap）*/
.snx-cmp-modes{display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap}
.snx-cmp-mseg{display:inline-flex;border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:8px;overflow:hidden;
  background:var(--dsw-alias-bg-layer-1,#232324)}
.snx-cmp-mbtn{font-family:inherit;font-size:12px;padding:5px 14px;border:none;background:transparent;
  color:var(--dsw-alias-label-caption,#81858c);cursor:pointer;transition:color .15s,background .15s}
.snx-cmp-mbtn + .snx-cmp-mbtn{border-left:1px solid var(--dsw-alias-border-l2,#ffffff1f)}
.snx-cmp-mbtn:hover{color:var(--dsw-alias-label-secondary,#cfd3d6);background:var(--dsw-alias-interactive-bg-hover,#ffffff14)}
.snx-cmp-mbtn.on{background:color-mix(in srgb,var(--snx-accent) 18%,transparent);color:var(--snx-accent);font-weight:600}
/* SPEC-13 ②：3-4 图网格顶栏——滑块/叠化仅 2 图可用，禁用态不给 hover 反馈、光标 not-allowed（tooltip 说明） */
.snx-cmp-mbtn:disabled{cursor:not-allowed;color:var(--dsw-alias-label-caption,#81858c);opacity:.55}
.snx-cmp-mbtn:disabled:hover{background:transparent;color:var(--dsw-alias-label-caption,#81858c)}
.snx-cmp-mswap{display:inline-flex;align-items:center;gap:5px;font-family:inherit;font-size:12px;padding:5px 12px;
  border:1px dashed var(--dsw-alias-border-l2,#ffffff1f);border-radius:8px;background:transparent;
  color:var(--dsw-alias-label-secondary,#cfd3d6);cursor:pointer;transition:color .15s,border-color .15s}
.snx-cmp-mswap:hover{color:var(--snx-accent);border-color:var(--snx-accent);border-style:solid}
/* 并排模式：stage 变左右五五开网格，揭示层取消 clip 转静态列（宽高比改 2:1 让两半各自近方）*/
.snx-cmp-stage.m-side{display:grid;grid-template-columns:1fr 1fr;aspect-ratio:2/1;cursor:default}
.snx-cmp-stage.m-side .snx-cmp-base{border-right:1px solid var(--dsw-alias-border-l2,#ffffff1f)}
.snx-cmp-stage.m-side .snx-cmp-clip{position:static;height:100%}

/* ═══════ P1-3/P2-3：画廊点击语义分层 + hover 轻操作 + 批量条 + 右键菜单 + 拖拽归类 + 灯箱标签 ═══════ */
/* 选中轻态（与 hover 区分：accent 描边环）*/
.snx-gal-item.sel{border-color:var(--snx-accent);box-shadow:0 0 0 2px color-mix(in srgb,var(--snx-accent) 30%,transparent)}
/* SPEC-14 ②：画布右键「在画廊中定位」——滚动到卡后高亮闪 800ms（locateId state 驱动 GalleryItem
   className 拼 ' snx-locate'，800ms 后清 null，与动画时长同长）*/
.snx-gal-item.snx-locate{animation:snxLocateFlash .8s ease-out 1}
@keyframes snxLocateFlash{
  0%,55%{border-color:var(--snx-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--snx-accent) 45%,transparent)}
  100%{border-color:var(--dsw-alias-border-l2,#ffffff1f);box-shadow:none}
}
/* hover 轻操作组（InvokeAI GalleryItemHoverIcons：只放轻操作，重操作收右键菜单）*/
.snx-gal-item-img{position:relative}
.snx-gal-item-ops{position:absolute;top:5px;right:5px;display:flex;gap:3px;z-index:2;
  opacity:0;transform:translateY(-3px);transition:opacity .12s ease,transform .12s ease}
.snx-gal-item:hover .snx-gal-item-ops,.snx-gal-item.sel .snx-gal-item-ops{opacity:1;transform:none}
.snx-gal-item-ops button{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;
  border:1px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:6px;cursor:pointer;font-family:inherit;
  background:color-mix(in srgb,var(--dsw-alias-bg-layer-1,#232324) 82%,transparent);color:var(--dsw-alias-label-secondary,#cfd3d6);
  backdrop-filter:blur(4px)}
.snx-gal-item-ops button:hover{color:var(--snx-accent);border-color:var(--snx-accent);background:var(--dsw-alias-bg-layer-2,#2c2c2e)}
.snx-gal-item-ops button.fav-on{color:var(--snx-warn);border-color:color-mix(in srgb,var(--snx-warn) 55%,transparent)}
.snx-gal-item-ops button.warn:hover{color:var(--snx-error);border-color:var(--snx-error)}
/* 浮动已选计数 + 批量条（sticky 贴画廊底部，不吃布局高度）*/
.snx-gal-bulk{position:sticky;bottom:10px;align-self:center;z-index:20;display:flex;align-items:center;gap:8px;margin-top:auto;
  padding:7px 10px;border-radius:10px;border:1px solid color-mix(in srgb,var(--snx-accent) 35%,transparent);
  background:var(--dsw-alias-bg-layer-2,#2c2c2e);box-shadow:0 10px 28px rgba(0,0,0,.3);
  font-size:12px;color:var(--dsw-alias-label-primary,#f9fafb)}
.snx-gal-bulk .ct{font-weight:700;color:var(--snx-accent);white-space:nowrap}
.snx-gal-bulk .bt{display:inline-flex;align-items:center;gap:4px;background:none;border:1px solid var(--dsw-alias-border-l2,#ffffff1f);
  color:var(--dsw-alias-label-secondary,#cfd3d6);border-radius:6px;padding:4px 9px;font-size:11.5px;cursor:pointer;font-family:inherit;white-space:nowrap}
.snx-gal-bulk .bt:hover{color:var(--snx-accent);border-color:var(--snx-accent)}
.snx-gal-bulk .bt.danger:hover{color:var(--snx-error);border-color:var(--snx-error)}
.snx-gal-bulk .bt:disabled{opacity:.5;cursor:default;pointer-events:none}   /* SPEC-15 ②：批量变体 busy 态 */
/* 画廊右键菜单（portal 挂 body）*/
.snx-gal-menu{position:fixed;z-index:10020;background:var(--dsw-alias-bg-layer-3,#353638);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);
  border-radius:8px;padding:4px;min-width:172px;max-width:240px;box-shadow:0 12px 32px rgba(0,0,0,.32)}
.snx-gal-menu .mh{font-size:10.5px;color:var(--dsw-alias-label-caption,#81858c);padding:4px 11px 3px;letter-spacing:.04em;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.snx-gal-menu button{display:flex;align-items:center;gap:7px;width:100%;text-align:left;background:none;border:none;
  color:var(--dsw-alias-label-primary,#f9fafb);padding:7px 11px;font-size:12.5px;cursor:pointer;border-radius:5px;font-family:inherit;white-space:nowrap}
.snx-gal-menu button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,#ffffff14);color:var(--snx-accent)}
.snx-gal-menu button.danger{color:var(--snx-error)}
.snx-gal-menu button.danger:hover{background:color-mix(in srgb,var(--snx-error) 10%,transparent);color:var(--snx-error)}
.snx-gal-menu .sep{height:1px;background:var(--dsw-alias-border-l2,#ffffff1f);margin:4px 6px}
/* 拖图到画板 chip 归类：ghost + chip 落点高亮 */
.snx-gal-drag-ghost{position:fixed;z-index:10030;display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:8px;pointer-events:none;
  background:var(--dsw-alias-bg-layer-3,#353638);border:1px solid var(--snx-accent);color:var(--snx-accent);
  font-size:12px;font-weight:600;box-shadow:0 8px 22px rgba(0,0,0,.35);white-space:nowrap}
.snx-gal-bar .chip.droptgt{border-color:var(--snx-accent);color:var(--snx-accent);
  background:color-mix(in srgb,var(--snx-accent) 22%,transparent);transform:scale(1.06)}
/* 批量删除应用内确认（模态栈注册口；通用确认组件下批收口其余原生 confirm）*/
.snx-cfm-backdrop{position:fixed;inset:0;z-index:10040;background:var(--dsw-alias-bg-mask-photo,#000000e0);backdrop-filter:blur(6px);
  display:flex;align-items:center;justify-content:center;animation:snx-lb-in .15s ease-out}
.snx-cfm{width:min(92vw,360px);background:var(--dsw-alias-bg-layer-2,#2c2c2e);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);
  border-radius:12px;padding:18px;box-shadow:0 24px 64px rgba(0,0,0,.4)}
.snx-cfm-t{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:700;color:var(--dsw-alias-label-primary,#f9fafb);margin-bottom:8px}
.snx-cfm-t svg{color:var(--snx-warn);flex:none}
.snx-cfm-d{font-size:12px;line-height:1.7;color:var(--dsw-alias-label-tertiary,#adb2b8);margin-bottom:16px}
.snx-cfm-btns{display:flex;gap:8px;justify-content:flex-end}
.snx-cfm-b{display:inline-flex;align-items:center;gap:5px;padding:7px 14px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2,#ffffff1f);
  background:none;color:var(--dsw-alias-label-secondary,#cfd3d6);font-size:12.5px;cursor:pointer;font-family:inherit}
.snx-cfm-b:hover{color:var(--dsw-alias-label-primary,#f9fafb);background:var(--dsw-alias-interactive-bg-hover,#ffffff14)}
.snx-cfm-b.danger{background:var(--snx-error);border-color:var(--snx-error);color:var(--dsw-alias-label-primary-foreground,#fff);font-weight:700}
.snx-cfm-b.danger:hover{filter:brightness(1.12);color:var(--dsw-alias-label-primary-foreground,#fff);background:var(--snx-error)}
/* 灯箱标签编辑（P2-3：写 node.tags，画廊标签筛选同链路）*/
.snx-lb-tags{display:flex;flex-wrap:wrap;gap:5px;align-items:center}
.snx-lb-tag{display:inline-flex;align-items:center;gap:2px;font-size:11px;color:var(--snx-accent);
  border:1px solid color-mix(in srgb,var(--snx-accent) 35%,transparent);border-radius:999px;padding:2px 4px 2px 9px;
  background:color-mix(in srgb,var(--snx-accent) 8%,transparent)}
.snx-lb-tag .x{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border:none;border-radius:50%;
  background:none;color:inherit;cursor:pointer;padding:0}
.snx-lb-tag .x:hover{background:color-mix(in srgb,var(--snx-error) 22%,transparent);color:var(--snx-error)}
.snx-lb-tag-in{flex:1;min-width:96px;background:none;border:none;outline:none;color:var(--dsw-alias-label-primary,#f9fafb);
  font-size:11.5px;font-family:inherit;padding:3px 2px;border-bottom:1px dashed var(--dsw-alias-border-l2,#ffffff1f)}
.snx-lb-tag-in:focus{border-bottom-color:var(--snx-accent)}
.snx-lb-tag-in::placeholder{color:var(--dsw-alias-label-caption,#81858c)}

/* ═══════ P2-6：全局键盘焦点态 ═══════
   Tab 导航可见（鼠标点击不触发 :focus-visible）；文本输入类已有 :focus 描边样式故排除，
   range 滑块单列回来（无其他可见焦点指示）。选择器对齐顶部令牌根列表 + 各 portal 弹层根。 */
:is(.snx-cv,.snx-pro,.snx-cfg,.snx-tv,.snx-lb,.snx-fs,.snx-help,.snx-bsb-preview,.snx-sidebtn,.snx-rb-title,
.snx-gal-menu,.snx-gal-drag-ghost,.snx-cfm-backdrop,.snx-toasts,.snx-sel-pop,.snx-cv-menu) :focus-visible{
  outline:2px solid var(--snx-accent);outline-offset:1px;
}
:is(.snx-cv,.snx-pro,.snx-cfg,.snx-tv,.snx-lb,.snx-fs,.snx-help,.snx-bsb-preview,.snx-sidebtn,.snx-rb-title,
.snx-gal-menu,.snx-gal-drag-ghost,.snx-cfm-backdrop,.snx-toasts,.snx-sel-pop,.snx-cv-menu) :is(input,textarea,select,[contenteditable]):focus-visible{
  outline:none;
}
:is(.snx-cv,.snx-pro,.snx-cfg,.snx-tv,.snx-lb,.snx-fs,.snx-help,.snx-bsb-preview,.snx-sidebtn,.snx-rb-title,
.snx-gal-menu,.snx-gal-drag-ghost,.snx-cfm-backdrop,.snx-toasts,.snx-sel-pop,.snx-cv-menu) input[type="range"]:focus-visible{
  outline:2px solid var(--snx-accent);outline-offset:1px;
}
`


    // ——— 主题令牌桥（Konva/Canvas 需要真实色值：getComputedStyle 读一次并缓存；读不到 → 中性回退）———
    let snxThemeCache = null
    function snxTheme() {
      if (snxThemeCache) return snxThemeCache
      const mk = (r, g, b, a) => `rgba(${r},${g},${b},${a})`
      const fb = {
        accent: [122, 170, 255],        // dsh deepseek-400（暗色主色）
        error: [242, 90, 90],           // dsh red-400
        ok: [34, 197, 94],              // dsh green-500
        surface: [35, 35, 36],          // dsh bg-layer-1 暗色值
        label: [173, 178, 184],         // dsh label-tertiary 暗色值
        border: [255, 255, 255, 0.12],  // dsh border-l2 暗色值
      }
      const t = {
        accent: mk(...fb.accent, 1),
        error: mk(...fb.error, 1),
        ok: mk(...fb.ok, 1),
        surface: mk(...fb.surface, 1),
        label: mk(...fb.label, 1),
        border: mk(...fb.border),
      }
      try {
        const probe = document.createElement('span')
        probe.style.display = 'none'
        document.body.appendChild(probe)
        const read = (name, fallback) => {
          try {
            probe.style.color = `var(${name}, transparent)`
            const m = getComputedStyle(probe).color.replace(/\s+/g, '')
              .match(/^rgba?\(([\d.]+),([\d.]+),([\d.]+)(?:,([\d.]+))?\)$/)
            if (m && (m[4] === undefined || parseFloat(m[4]) > 0)) {
              const a = m[4] === undefined ? 1 : parseFloat(m[4])
              return [+m[1], +m[2], +m[3], a]
            }
          } catch { /* 令牌缺失 → 回退 */ }
          return fallback
        }
        const solid = (p) => mk(p[0], p[1], p[2], 1)
        t.accent = solid(read('--dsw-alias-link', fb.accent))
        t.error = solid(read('--dsw-alias-state-error-primary', fb.error))
        t.ok = solid(read('--dsw-alias-state-success-primary', fb.ok))
        t.surface = solid(read('--dsw-alias-bg-layer-1', fb.surface))
        t.label = solid(read('--dsw-alias-label-tertiary', fb.label))
        t.border = mk(...read('--dsw-alias-border-l2', fb.border))
        probe.remove()
      } catch { /* DOM 不可用 → 全部用回退 */ }
      t.tint = (rgbStr, a) => {
        const m = String(rgbStr).match(/(\d+),(\d+),(\d+)/)
        return m ? mk(+m[1], +m[2], +m[3], a) : mk(fb.accent[0], fb.accent[1], fb.accent[2], a)
      }
      snxThemeCache = t
      return t
    }

    // ——— Konva 按需加载（本地 vendor，不走 CDN）———
    let konvaPromise = null
    function ensureKonva() {
      if (window.Konva) return Promise.resolve()
      if (konvaPromise) return konvaPromise
      konvaPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script')
        s.src = '/sensenova/vendor/konva.js'
        s.onload = () => window.Konva ? resolve() : reject(new Error('konva 加载异常'))
        s.onerror = () => { konvaPromise = null; reject(new Error('konva.js 加载失败')) }
        document.head.appendChild(s)
      })
      return konvaPromise
    }

    // ——— 自动保存（防抖 700ms → PUT 整文档；携带 rev 做并发写保护，SPEC-14 二.3）———
    let saveTimer = null
    function setSaveState(t) {
      const el = document.getElementById('snx-cv-save')
      if (el) el.textContent = t
    }
    function autosave() {
      if (!isOpen()) return
      setSaveState('保存中…')
      clearTimeout(saveTimer)
      saveTimer = setTimeout(() => {
        put(CANVAS_ROUTE, { doc: store.doc, rev: store.rev }).then((r) => {
          if (r.ok) {
            if (typeof r.rev === 'number') store.rev = r.rev   // 同步服务端新版本号，下次保存不误判冲突
            setSaveState('已保存 ' + new Date().toTimeString().slice(0, 8))
            return
          }
          if (r.status === 409) { setSaveState('已加载最新画布'); reloadRemoteBaseline() }
          else setSaveState('保存失败')
        }).catch(() => setSaveState('保存失败'))
      }, 700)
    }

    // ——— SPEC-14 二.3：409 冲突恢复——重新 GET 最新文档，节点集合以远端为准；
    // 本地 sel/camera 保留（sel 里远端已不存在的剔除），相机是本地属性不抢视口，
    // 与 SSE canvas:update 外部写入的处理先例一致。本地未保存的节点改动按约定放弃
    // （只 toast 告知，不自动重发旧内容——重发会再撞 409 打乒乓）。conflictReloading
    // 去重连续 409，避免 toast 刷屏。
    let conflictReloading = false
    function reloadRemoteBaseline() {
      if (conflictReloading) return
      conflictReloading = true
      get(CANVAS_ROUTE).then((r) => {
        if (r && r.doc && Array.isArray(r.doc.nodes)) {
          if (typeof r.rev === 'number') store.rev = r.rev
          const cam = store.doc.camera || { x: 0, y: 0, scale: 1 }
          store.doc = r.doc
          store.doc.camera = { x: cam.x || 0, y: cam.y || 0, scale: cam.scale || 1 }
          store.sel = new Set([...store.sel].filter((id) => store.node(id)))
          store.undoStack = [store.snapshot()]; store.redoStack = []   // 重建 undo 基线（旧栈全是外部写入前的文档）
          store.emit()
          toastBus('检测到其他会话修改,已加载最新画布', 'info')
        }
      }).catch(() => { }).then(() => { conflictReloading = false })
    }
    // SPEC-14 二.3：绕过防抖的直存（画廊删除/清空等）统一走这里——带 rev 保存，成功同步
    // 新版本号（否则下一次 autosave 必撞 409），撞 409 以远端为基线重载+toast。返回是否落盘成功。
    async function saveNow() {
      try {
        const r = await put(CANVAS_ROUTE, { doc: store.doc, rev: store.rev })
        if (r.ok) {
          if (typeof r.rev === 'number') store.rev = r.rev
          return true
        }
        if (r.status === 409) reloadRemoteBaseline()
      } catch { }
      return false
    }

    // ——— 画布文档 store（vanilla，单一事实源）———
    let activeEngine = null   // 打开中的引擎实例；store.emit 时驱动重绘
    function nid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7) }
    function emptyDoc() { return { v: 1, camera: { x: 0, y: 0, scale: 1 }, nodes: [], boards: [] } }

    const store = {
      doc: emptyDoc(),
      rev: 0,                  // SPEC-14 二.3：服务端文档版本号（GET/PUT 响应同步；409 时以远端为准）
      sel: new Set(),          // 选中节点 id（运行态，不持久化）
      undoStack: [], redoStack: [],
      _listeners: new Set(),
      subscribe(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn) },
      emit() {
        if (activeEngine) activeEngine.renderAll()
        this._listeners.forEach((fn) => { try { fn() } catch { } })
      },
      // v15.1：选中类变更专用——不重建 Konva 节点（选中不改文档,renderAll 的全量销毁重建
      // 是双击检测在高负载画布下失稳的根源）
      emitLight() {
        this._listeners.forEach((fn) => { try { fn() } catch { } })
      },
      snapshot() { return JSON.stringify(this.doc) },
      pushUndo() {
        this.undoStack.push(this.snapshot())
        if (this.undoStack.length > 60) this.undoStack.shift()
        this.redoStack.length = 0
      },
      undo() {
        const s = this.undoStack.pop(); if (!s) return
        this.redoStack.push(this.snapshot())
        this.doc = JSON.parse(s); this.sel.clear()
        this.emit(); autosave()
      },
      redo() {
        const s = this.redoStack.pop(); if (!s) return
        this.undoStack.push(this.snapshot())
        this.doc = JSON.parse(s); this.sel.clear()
        this.emit(); autosave()
      },
      node(id) { return this.doc.nodes.find((n) => n.id === id) },
      addNode(n, withUndo) { if (withUndo) this.pushUndo(); this.doc.nodes.push(n); this.emit(); autosave() },
      updateNode(id, patch) {
        const n = this.node(id); if (!n) return
        Object.assign(n, patch); this.emit(); autosave()
      },
      removeSelected() {
        if (!this.sel.size) return
        // v11.2：锁定节点不可删——从删除集合跳过 locked；全部锁定时提示而非静默不动
        const removable = [...this.sel].filter((id) => { const n = this.node(id); return n && !n.locked })
        if (!removable.length) { toastBus('锁定节点需先解锁再删除'); return }
        this.pushUndo()
        const rm = new Set(removable)
        this.doc.nodes = this.doc.nodes.filter((n) => !rm.has(n.id))
        this.sel = new Set([...this.sel].filter((id) => !rm.has(id)))
        this.emit(); autosave()
      },
      duplicateSelected() {
        if (!this.sel.size) return
        this.pushUndo()
        const clones = this.doc.nodes.filter((n) => this.sel.has(n.id)).map((n) => ({
          ...JSON.parse(JSON.stringify(n)), id: nid(), x: n.x + 24, y: n.y + 24,
        }))
        clones.forEach((c) => this.doc.nodes.push(c))
        this.sel = new Set(clones.map((c) => c.id))
        this.emit(); autosave()
      },
      // ── SPEC-17 批次2：内部节点剪贴板（Ctrl+C / Ctrl+X / Ctrl+V，与已有 Ctrl+D 互补：
      // 可跨位置/跨时刻粘贴）──克隆逻辑与 duplicateSelected 同款深拷贝。约束：
      //  - pending/running 是在途任务不参与复制——贴出去没有生成过程，只会永远停在幽灵占位；
      //  - 选中集内 parentId 粘贴时重映射到新 id（派生链保持）；选集外的父引用原样保留
      //   （drawEdges 查不到父节点时自动不画，不会报错）；
      //  - groupId 不随粘贴带走（副本与原组脱钩，避免拖原图把副本拽走）；
      //  - _queuedAt/_startedAt 等运行态字段一律不复制。剪贴板是运行态，不持久化。
      clipboard: null,   // { nodes: [{...node 深拷贝, cpId: 原id}] }
      copySelected() {
        const ns = selNodes().filter((n) => n.status !== 'pending' && n.status !== 'running')
        if (!ns.length) return 0
        this.clipboard = { nodes: ns.map((n) => { const c = JSON.parse(JSON.stringify(n)); c.cpId = n.id; return c }) }
        return ns.length
      },
      pasteClipboard(at) {
        const src = this.clipboard
        if (!src || !src.nodes.length) return 0
        this.pushUndo()
        // 落点：复制时包围盒质心对齐目标点，成员相对位置保持
        const cx = src.nodes.reduce((a, n) => a + n.x + n.w / 2, 0) / src.nodes.length
        const cy = src.nodes.reduce((a, n) => a + n.y + n.h / 2, 0) / src.nodes.length
        const idMap = new Map()
        const clones = src.nodes.map((n) => {
          const id = nid()
          idMap.set(n.cpId, id)
          const c = { id, x: Math.round(n.x + at.x - cx), y: Math.round(n.y + at.y - cy) }
          for (const key of Object.keys(n)) {
            if (key === 'cpId' || key === 'id' || key === 'x' || key === 'y' || key === 'groupId') continue
            if (key.charAt(0) === '_') continue
            c[key] = n[key]
          }
          return c
        })
        for (const c of clones) {
          if (c.parentId && idMap.has(c.parentId)) c.parentId = idMap.get(c.parentId)
        }
        clones.forEach((c) => this.doc.nodes.push(c))
        this.sel = new Set(clones.map((c) => c.id))
        this.emit(); autosave()
        return clones.length
      },
    }

    // ——— P1-10：滑块/连发类操作的 undo 合并（InvokeAI canvasSlice：同类操作 1 秒内并成一步）———
    // 滑块每个 tick 都 pushUndo 会把撤销栈灌满中间值；800ms 窗口内的连续 tick 共用第一次的基线
    let _lastMergeUndoAt = 0
    function pushUndoMerge() {
      const now = Date.now()
      if (now - _lastMergeUndoAt < 800) return
      _lastMergeUndoAt = now
      store.pushUndo()
    }

    // ——— 多选对齐 / 等距分布 / 成组（tldraw 基线）———
    // ── PNG 参数读回（拖入/上传带 sensenova tEXt 的 PNG → 还原 prompt/model/size/seed）──
    async function parsePngParams(file) {
      try {
        const isPng = /png/i.test(file.type || '') || /\.png$/i.test(file.name || '')
        if (!file || !isPng) return null
        const bytes = new Uint8Array(await file.arrayBuffer())
        const dv = new DataView(bytes.buffer)
        let off = 8
        while (off + 12 <= bytes.length) {
          const len = dv.getUint32(off)
          const type = String.fromCharCode(bytes[off + 4], bytes[off + 5], bytes[off + 6], bytes[off + 7])
          if (type === 'IDAT' || type === 'IEND') break
          if (type === 'tEXt' || type === 'iTXt') {
            const data = bytes.subarray(off + 8, off + 8 + len)
            const z = data.indexOf(0)
            if (z > 0) {
              const kw = new TextDecoder().decode(data.subarray(0, z))
              if (kw === 'sensenova') {
                let tb = data.subarray(z + 1)
                if (type === 'iTXt') {   // iTXt: 压缩标志+方法、语言标签、翻译关键字三个 \0 分段后才进正文
                  let p = z + 3, nulls = 0
                  while (p < data.length && nulls < 2) { if (data[p] === 0) nulls++; p++ }
                  tb = data.subarray(p)
                }
                const parts = new TextDecoder().decode(tb).split('|').map((s) => s.trim())
                const kv = {}
                parts.slice(1).forEach((s) => { const i = s.indexOf('='); if (i > 0) kv[s.slice(0, i).trim()] = s.slice(i + 1).trim() })
                return {
                  prompt: parts[0] || '',
                  model: kv.model || '',
                  size: kv.size || '',
                  seed: kv.seed !== undefined && kv.seed !== '' && !isNaN(Number(kv.seed)) ? Number(kv.seed) : undefined,
                }
              }
            }
          }
          off += 12 + len
        }
      } catch { }
      return null
    }

    // ── 按生成链整理布局：parentId 链分层（列=代数），同代按原 y 排序，列内垂直居中 ──
    function arrangeByChain() {
      const nodes = store.doc.nodes.filter((n) => n.type === 'image' && n.status === 'done')
      if (!nodes.length) return
      store.pushUndo()
      const byId = new Map(nodes.map((n) => [n.id, n]))
      const depth = new Map()
      const getDepth = (n) => {
        if (depth.has(n.id)) return depth.get(n.id)
        let d = 0
        if (n.parentId && byId.has(n.parentId) && n.parentId !== n.id) d = getDepth(byId.get(n.parentId)) + 1
        depth.set(n.id, d)
        return d
      }
      nodes.forEach(getDepth)
      const cols = new Map()
      nodes.slice().sort((a, b) => a.y - b.y).forEach((n) => {
        const d = depth.get(n.id)
        if (!cols.has(d)) cols.set(d, [])
        cols.get(d).push(n)
      })
      const CW = 560, CH = 560
      let maxRows = 1
      cols.forEach((a) => { maxRows = Math.max(maxRows, a.length) })
      for (const [d, col] of [...cols.entries()].sort((a, b) => a[0] - b[0])) {
        col.forEach((n, i) => {
          Object.assign(n, { x: Math.round(d * CW), y: Math.round(((maxRows - col.length) * CH) / 2 + i * CH) })
        })
      }
      store.emit(); autosave()
      try { if (activeEngine) activeEngine.fit() } catch { }
    }

    function selNodes() {
      const arr = []
      for (const id of store.sel) { const n = store.node(id); if (n) arr.push(n) }
      return arr
    }
    function alignSel(mode) {
      const ns = selNodes()
      if (ns.length < 2) return
      const x0 = Math.min(...ns.map((n) => n.x))
      const x1 = Math.max(...ns.map((n) => n.x + n.w))
      const y0 = Math.min(...ns.map((n) => n.y))
      const y1 = Math.max(...ns.map((n) => n.y + n.h))
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
      store.pushUndo()
      if (mode === 'dist-h' || mode === 'dist-v') {
        const horiz = mode === 'dist-h'
        const sorted = ns.slice().sort((a, b) => horiz ? a.x - b.x : a.y - b.y)
        const total = horiz ? x1 - x0 : y1 - y0
        const sum = sorted.reduce((acc, n) => acc + (horiz ? n.w : n.h), 0)
        const gap = sorted.length > 1 ? (total - sum) / (sorted.length - 1) : 0
        let cur = horiz ? x0 : y0
        for (const n of sorted) {
          const v = Math.round(cur)
          if (horiz) { if (n.x !== v) store.updateNode(n.id, { x: v }); cur += n.w + gap }
          else { if (n.y !== v) store.updateNode(n.id, { y: v }); cur += n.h + gap }
        }
      } else {
        for (const n of ns) {
          let x = n.x, y = n.y
          if (mode === 'left') x = x0
          else if (mode === 'hcenter') x = Math.round(cx - n.w / 2)
          else if (mode === 'right') x = x1 - n.w
          else if (mode === 'top') y = y0
          else if (mode === 'vcenter') y = Math.round(cy - n.h / 2)
          else if (mode === 'bottom') y = y1 - n.h
          if (x !== n.x || y !== n.y) store.updateNode(n.id, { x: Math.round(x), y: Math.round(y) })
        }
      }
      store.emit(); autosave()
    }
    function groupSel() {
      const ns = selNodes()
      if (ns.length < 2) return
      store.pushUndo()
      const gid = nid()
      for (const n of ns) store.updateNode(n.id, { groupId: gid })
      store.emit(); autosave()
    }
    function ungroupSel() {
      const ns = selNodes().filter((n) => n.groupId)
      if (!ns.length) return
      store.pushUndo()
      for (const n of ns) store.updateNode(n.id, { groupId: undefined })
      store.emit(); autosave()
    }

    // ——— P1-15：节点状态徽章中文化（全屏图层面板/属性面板共用）———
    const STATUS_ZH = { pending: '排队中', running: '生成中', done: '完成', error: '失败' }

    // ——— P2-7：z 序命令（置顶/上移一层/下移一层/置底）。文档顺序即 z 序（导出画布同序绘制）———
    function zOrderSel(op) {
      const ns = selNodes()
      if (!ns.length) return
      store.pushUndo()
      const sel = new Set(ns.map((n) => n.id))
      const arr = store.doc.nodes
      if (op === 'front' || op === 'back') {
        const picked = arr.filter((n) => sel.has(n.id))
        const rest = arr.filter((n) => !sel.has(n.id))
        store.doc.nodes = op === 'front' ? rest.concat(picked) : picked.concat(rest)
      } else if (op === 'raise') {
        for (let i = arr.length - 2; i >= 0; i--) {
          if (sel.has(arr[i].id) && !sel.has(arr[i + 1].id)) { const t = arr[i]; arr[i] = arr[i + 1]; arr[i + 1] = t }
        }
      } else if (op === 'lower') {
        for (let i = 1; i < arr.length; i++) {
          if (sel.has(arr[i].id) && !sel.has(arr[i - 1].id)) { const t = arr[i]; arr[i] = arr[i - 1]; arr[i - 1] = t }
        }
      }
      store.emit(); autosave()
    }

    // ——— 图片加载 / 尺寸工具 ———
    const imgCache = new Map()
    function getImg(src, cb) {
      let im = imgCache.get(src)
      if (im) {
        if (im.complete && im.naturalWidth) cb(im)
        else {
          const prev = im.onload
          im.onload = () => { if (prev) prev(); cb(im) }
        }
        return im
      }
      im = new window.Image()
      im.onload = () => cb(im)
      im.src = src
      imgCache.set(src, im)
      return im
    }
    function loadImg(src) {
      return new window.Promise((resolve, reject) => {
        const im = new window.Image()
        im.onload = () => resolve(im)
        im.onerror = () => reject(new Error('图片加载失败: ' + src.slice(0, 80)))
        im.src = src
      })
    }
    function nodeFit(im, maxSide) {
      const s = Math.min(maxSide / im.naturalWidth, maxSide / im.naturalHeight, 1)
      return { w: Math.max(40, Math.round(im.naturalWidth * s)), h: Math.max(40, Math.round(im.naturalHeight * s)) }
    }
    const SIZES = [[2048, 2048], [2752, 1536], [1536, 2752], [2560, 720], [2048, 1152]]
    function sizeForAspect(w, h) {
      const a = w / h
      let best = SIZES[0], bd = Infinity
      for (const s of SIZES) {
        const d = Math.abs(s[0] / s[1] - a)
        if (d < bd) { bd = d; best = s }
      }
      return best[0] + 'x' + best[1]
    }
    // 画质档位 → 实际请求尺寸：限定在已验证的 SIZES 线内（4096 对 SenseNova images/generations
    // 的支持无本地证据）——4K 取同比例的最大已验证预设，像素数不超过原尺寸时维持原值
    function applyQuality(size, quality) {
      if (quality !== '4k') return size
      const parts = String(size).split('x').map((x) => parseInt(x, 10) || 0)
      const w = parts[0], h = parts[1]
      if (!w || !h) return size
      const cand = sizeForAspect(w, h)
      const cp = cand.split('x').map((x) => parseInt(x, 10) || 0)
      return (cp[0] * cp[1] > w * h) ? cand : size
    }
    // dataURL 这类大引用不进文档（8MB 上限），重试时丢弃；文件/网络 URL 可以存
    function keepShortRef(ref) {
      return ref && !ref.startsWith('data:') ? ref : undefined
    }
    // ── P2-9：persist 落盘失败时服务端会把结果图以 base64 兜底返回。巨型 dataURL 一旦写进
    // 节点 src，autosave 全量 PUT 必超服务端 8MB 文档上限（413），之后每次拖拽都在重复失败。
    // 超过阈值的内联结果直接拒收：节点转失败态、toast 提示，不塞进文档。
    const SNX_MAX_INLINE_DATAURL = 2 * 1024 * 1024   // dataURL 字符串长度上限（≈1.5MB 原图）
    function overInlineLimit(kind, value) {
      return kind === 'base64' && String(value || '').length > SNX_MAX_INLINE_DATAURL
    }
    // ── P1-2：参考图持久化（dataURL → 服务端文件 URL）──
    // 上传的 dataURL 参考图若只活在内存里，节点 params 里存不进去（keepShortRef 丢弃），
    // 失败重试就静默变文生图。入队前先落成 /api/sensenova/image/<id> 文件 URL，
    // 重试链路（右键重试/队列重试/重跑失败）才有图可带。命中同源文件引用直接复用。
    const refPersistCache = new Map()   // dataURL → 文件 URL（FIFO cap 24，避免变体/抠图反复落同一锚点图）
    async function persistRef(src) {
      if (!src) return undefined
      if (!src.startsWith('data:')) return src   // http(s) / 同源文件 URL 本来就可持久
      if (refPersistCache.has(src)) return refPersistCache.get(src)
      try {
        const r = await post('/api/sensenova/upload', { src })
        if (r && r.ok && r.url) {
          if (refPersistCache.size >= 24) refPersistCache.delete(refPersistCache.keys().next().value)
          refPersistCache.set(src, r.url)
          return r.url
        }
      } catch { /* 服务端不可达 → 调用方兜底 */ }
      return undefined
    }
    // ── v11.2：拖入/粘贴入口的大图收口——超内联上限的 dataURL 先 persistRef 落盘成文件 URL
    // （上传路由已有），失败才拒绝并提示。与 runOne 的 P2-9 拒收同思路：巨型内联数据不进文档，
    // 否则 autosave 全量 PUT 必超 8MB 上限。
    async function ingestDroppedImageSrc(src) {
      if (!overInlineLimit('base64', src)) return src
      const persisted = await persistRef(src)
      if (persisted) return persisted
      const mb = (String(src).length / 1024 / 1024).toFixed(1)
      toastBus('图片约 ' + mb + 'MB 过大且落盘失败，已拒绝加入画布（请检查服务端存储后重试）', 'err')
      return null
    }

    // ——— 生成流程（右面板 / 悬浮 bar / 操作条共用）———
    // 在途任务注册表：nodeId -> AbortController（队列「取消」真正中断请求）
    const inflightJobs = new Map()
    function isCancelled(nodeId) {
      const n = store.node(nodeId)
      return !!(n && n.status === 'error' && n.errMsg === '用户取消')
    }
    function cancelJob(nodeId) {
      const ac = inflightJobs.get(nodeId)
      if (ac) { try { ac.abort() } catch { } }
      genQueueRemove(nodeId)   // SPEC-18 二：等待并发槽位中的任务出队放行（醒来命中取消检查还槽）
      const n = store.node(nodeId)
      if (n && (n.status === 'pending' || n.status === 'running')) {
        n.status = 'error'; n.errMsg = '用户取消'; n._endedAt = Date.now()   // v12：运行段停表（队列详情耗时两段）
        store.emit(); autosave()
      }
    }
    // ─── v10：队列暂停闸（pending 在暂停期不入跑，恢复即放行）───
    let queuePaused = false
    // SPEC-13 ②：队列「显示全部历史」开关——false=现行为（进行中/失败/60 秒内完成），
    // true=进行中之外再列全部 done/error 节点按完成时间倒序（旧节点可展开审讯）
    let queueShowAllHist = false
    const queueWaiters = new Set()
    function waitIfPaused() {
      if (!queuePaused) return Promise.resolve()
      return new Promise((res) => queueWaiters.add(res))
    }
    function setQueuePaused(v) {
      queuePaused = v
      if (!v) { queueWaiters.forEach((r) => r()); queueWaiters.clear() }
      try { window.dispatchEvent(new CustomEvent('snx:queuePaused', { detail: v })) } catch { }
    }

    // ——— SPEC-18 二：全局并发闸 + 队列重排/插队 ———
    // 此前 runOne 全部即发并行（Promise.allSettled），「队列」只是状态视图，重排无处着力。
    // 现在生成先过并发闸：最多 N 个同时在跑（localStorage snxGenConcurrency，1–4，默认 2），
    // 其余进 FIFO 等待表；等待表可重排（↑↓ 上/下移、置顶=插队），队列 tab 可视重排结果。
    // 边界：批量变体自串行（不入闸）；增强/蒙版/扩图/重抽走 runOne 全部入闸。
    const genWaitQueue = []   // [{ nodeId, res }] — FIFO，等待并发槽位的 runOne
    function genConcLimit() {
      try {
        const v = parseInt(localStorage.getItem('snxGenConcurrency') || '', 10)
        // 默认 1:SenseNova 个人 key 有 RPS 限流,并发 2 实测第二个请求即 429 rps exhausted
        // (2026-10-31 真机复核实证);>1 留给不限流的兼容上游,失败任务可「重跑失败」一键恢复
        return Number.isFinite(v) && v >= 1 && v <= 4 ? v : 1
      } catch { return 1 }
    }
    function genConcSet(v) {
      try { localStorage.setItem('snxGenConcurrency', String(Math.min(4, Math.max(1, v | 0)))) } catch { }
      genTryNext()
    }
    let genActive = 0
    function genAcquire(nodeId) {
      // 队头公平：等待表非空时后来者不得越队（上限调大后的补跑统一由 genTryNext 放行）
      if (!genWaitQueue.length && genActive < genConcLimit()) { genActive++; return Promise.resolve() }
      return new Promise((res) => { genWaitQueue.push({ nodeId, res }); genTryNext() })
    }
    function genTryNext() {
      while (genWaitQueue.length && genActive < genConcLimit()) {
        const nxt = genWaitQueue.shift()
        genActive++
        try { nxt.res() } catch { }
      }
    }
    function genRelease() {
      genActive = Math.max(0, genActive - 1)
      genTryNext()
    }
    function genQueuePos(nodeId) { return genWaitQueue.findIndex((w) => w.nodeId === nodeId) }
    function genQueueMove(nodeId, dir) {
      const i = genQueuePos(nodeId)
      if (i < 0) return false
      const j = dir === 'top' ? 0 : (dir === 'up' ? Math.max(0, i - 1) : Math.min(genWaitQueue.length - 1, i + 1))
      if (i === j) return false
      const [w] = genWaitQueue.splice(i, 1)
      genWaitQueue.splice(j, 0, w)
      try { window.dispatchEvent(new CustomEvent('snx:queueOrderChanged')) } catch { }
      return true
    }
    function genQueueRemove(nodeId) {
      const i = genQueuePos(nodeId)
      if (i >= 0) {
        const [w] = genWaitQueue.splice(i, 1)
        try { w.res() } catch { }   // 放行：runOne 醒来命中取消检查，走 finally 的 genRelease 正常还槽
      }
    }

    // ——— SPEC-18 五：tiled 放大 2×（分块重绘 + 羽化缝合）———
    // 上游无专用放大模型（PRODUCT 边界注明后端不可能），用 images/generations 的 i2i 管线做
    // 2×2 分块超分重绘：每块带 12% 重叠发 /api/sensenova/generate(reference=块图)，应答贴回
    // 2× 输出画布，重叠侧线性羽化消缝（图像外边界不渐隐）。质量依赖上游重绘保真，非专用放大
    // 模型——如实标注。（初版走 chat/completions，真测 404 model is not found 后改 i2i。）
    const TILE_UPSCALE_PROMPT = '超分辨率重绘：将这张图片放大为 2 倍分辨率的清晰版本。严格保持画面内容、构图、颜色、光影与原图完全一致，只提升细节与清晰度、重建锐利边缘与纹理；不要改变、添加或删除任何内容。'
    async function tiledUpscale2x(node, onProgress, notify) {
      if (!node || !node.src) throw new Error('没有源图')
      const im = await loadImg(node.src)
      const W = im.naturalWidth, H = im.naturalHeight
      if (!W || !H) throw new Error('源图未加载')
      const outW = W * 2, outH = H * 2
      const ovX = Math.max(8, Math.round(W * 0.12)), ovY = Math.max(8, Math.round(H * 0.12))
      const hx = Math.round(W / 2), hy = Math.round(H / 2)
      const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(v)))
      // 四块：[sx,sy,ex,ey] 源图坐标 + 重叠侧羽化标记（外边界侧不羽化）
      const tiles = [
        { sx: 0, sy: 0, ex: clamp(hx + ovX, 1, W), ey: clamp(hy + ovY, 1, H), fL: false, fT: false, fR: true, fB: true },
        { sx: clamp(hx - ovX, 0, W - 1), sy: 0, ex: W, ey: clamp(hy + ovY, 1, H), fL: true, fT: false, fR: false, fB: true },
        { sx: 0, sy: clamp(hy - ovY, 0, H - 1), ex: clamp(hx + ovX, 1, W), ey: H, fL: false, fT: true, fR: true, fB: false },
        { sx: clamp(hx - ovX, 0, W - 1), sy: clamp(hy - ovY, 0, H - 1), ex: W, ey: H, fL: true, fT: true, fR: false, fB: false },
      ]
      const out = document.createElement('canvas')
      out.width = outW; out.height = outH
      const octx = out.getContext('2d')
      const FEATHER = 24
      for (let i = 0; i < tiles.length; i++) {
        const t = tiles[i]
        const tw = t.ex - t.sx, th = t.ey - t.sy
        if (onProgress) onProgress((i + 1) + '/4')
        // 切块 → 编辑管线
        const tc = document.createElement('canvas')
        tc.width = tw; tc.height = th
        tc.getContext('2d').drawImage(im, t.sx, t.sy, tw, th, 0, 0, tw, th)
        // SPEC-18 五真测修正：编辑管线走 /generate 的 i2i 通道（chat/completions 对生图模型 404，
        // 真上游实测 model is not found）；尺寸先请求精确 2× 块尺寸,上游不认该尺寸桶时退 1024 标准方图
        const tileRef = tc.toDataURL('image/png')
        const tileModel = (node.params && node.params.model) || undefined
        let r = await post('/api/sensenova/generate', { prompt: TILE_UPSCALE_PROMPT, size: (tw * 2) + 'x' + (th * 2), reference: tileRef, model: tileModel })
        let imgUrl = r && r.ok && r.image ? (r.image.kind === 'url' ? r.image.value : 'data:image/png;base64,' + r.image.value) : null
        if (!imgUrl) {
          r = await post('/api/sensenova/generate', { prompt: TILE_UPSCALE_PROMPT, size: '1024x1024', reference: tileRef, model: tileModel })
          imgUrl = r && r.ok && r.image ? (r.image.kind === 'url' ? r.image.value : 'data:image/png;base64,' + r.image.value) : null
        }
        if (!imgUrl) throw new Error('第 ' + (i + 1) + ' 块重绘失败' + (r && r.error ? ('：' + String(r.error).slice(0, 120)) : '（无图返回）'))
        const rim = await loadImg(imgUrl)
        const dw = tw * 2, dh = th * 2
        // 贴回 + 重叠侧羽化：destination-in 纵横两遍线性渐变（依次相乘）
        const ft = document.createElement('canvas')
        ft.width = dw; ft.height = dh
        const fc = ft.getContext('2d')
        fc.drawImage(rim, 0, 0, rim.naturalWidth || rim.width, rim.naturalHeight || rim.height, 0, 0, dw, dh)
        fc.globalCompositeOperation = 'destination-in'
        const maskAxis = (horizontal, fLo, fHi) => {
          const len = horizontal ? dw : dh
          const g = horizontal ? fc.createLinearGradient(0, 0, dw, 0) : fc.createLinearGradient(0, 0, 0, dh)
          const fstop = Math.min(0.5, FEATHER / len)
          if (fLo) { g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(fstop, 'rgba(0,0,0,1)') } else g.addColorStop(0, 'rgba(0,0,0,1)')
          if (fHi) { g.addColorStop(Math.max(0.5, 1 - fstop), 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)') } else g.addColorStop(1, 'rgba(0,0,0,1)')
          fc.fillStyle = g
          fc.fillRect(0, 0, dw, dh)
        }
        if (t.fL || t.fR) maskAxis(true, t.fL, t.fR)
        if (t.fT || t.fB) maskAxis(false, t.fT, t.fB)
        octx.drawImage(ft, t.sx * 2, t.sy * 2)
      }
      // 缝合完成 → 落盘（JPEG 0.92：4K 输出的 PNG dataURL 可达 20MB+，JPEG 控制在几 MB）
      if (onProgress) onProgress('落盘')
      const dataUrl = out.toDataURL('image/jpeg', 0.92)
      const url = await persistRef(dataUrl)
      if (!url) throw new Error('放大结果落盘失败')
      // 新 done 节点挂源图右侧，同画板（刷新最近使用）；undo 快照覆盖
      store.pushUndo()
      const id = nid()
      const fit = nodeFit(out, 480 * 2)
      store.doc.nodes.push({
        id, type: 'image', status: 'done', src: url, parentId: node.id,
        boardId: node.boardId,
        x: Math.round(node.x + node.w + 60), y: node.y, w: fit.w, h: fit.h,
        prompt: String(node.prompt || '') + '（放大 2×）',
        params: Object.assign({}, node.params, { tiled2x: true, srcSize: W + 'x' + H }),
        ts: Date.now(), _endedAt: Date.now(),
      })
      if (node.boardId) touchBoard(node.boardId)
      store.emit(); autosave()
      notify && notify('已放大 2×：' + W + '×' + H + ' 变为 ' + outW + '×' + outH + '，已落到源图右侧')
      return id
    }

    // ——— SPEC-16 一：生成耗时样本与「预计 ~Xs」———
    // snxGenPost = 客户端直连 POST /api/sensenova/generate 的唯一收口（工作台生成 runOne、
    // 卡片同参数重抽 snxRerollDirect、画廊批量变体 batchVariantNodes 三处共用）：计一次墙钟
    // 时长，HTTP ok（=服务端已落盘、节点将落 done）才计样本。错误/取消不计——SPEC-16 §一
    // 定义「样本=最近 5 次 done 的 POST 墙钟时长」，秒回的 4xx 与用户中途取消会把均值拉到失真。
    // 注意：对话工具路径（sensenova_generate_image）在服务端 execute 直调上游、不经任何客户端
    // POST，该路径的耗时客户端采不到样本（本插件客户端侧无共通收口，见本轮报告）。
    const SNX_DUR_KEY = 'snxAvgDur'
    function snxRecordGenDur(ms) {
      try {
        if (!Number.isFinite(ms) || ms <= 0) return
        let arr = []
        try { arr = JSON.parse(localStorage.getItem(SNX_DUR_KEY) || '[]') } catch { }
        if (!Array.isArray(arr)) arr = []
        arr.push(Math.round(ms))
        while (arr.length > 5) arr.shift()   // 环形：只留最近 5 次
        localStorage.setItem(SNX_DUR_KEY, JSON.stringify(arr))
      } catch { }   // localStorage 不可用（隐私模式等）静默跳过，不碰生成主流程
    }
    // 历史均值（秒，取整）；无有效样本返回 0，展示层据此不显示「预计」行
    function snxAvgGenDurSec() {
      try {
        const arr = JSON.parse(localStorage.getItem(SNX_DUR_KEY) || '[]')
        const nums = Array.isArray(arr) ? arr.filter((n) => Number.isFinite(n) && n > 0) : []
        if (!nums.length) return 0
        return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length / 1000)
      } catch { return 0 }
    }
    function snxGenPost(body, signal) {
      const t0 = Date.now()
      return post('/api/sensenova/generate', body, signal).then((r) => {
        if (r && r.ok) snxRecordGenDur(Date.now() - t0)
        return r
      })
        .catch((e) => { clearTimeout(tm); throw e })
    }

    async function runOne(nodeId, o) {
      await waitIfPaused()
      // v11.2：暂停苏醒后先查取消——等待期间被用户取消（error/用户取消）的任务不再复活成 running，不发请求
      if (isCancelled(nodeId)) return
      // SPEC-18 二：并发闸——排队等待期间被取消的由 genQueueRemove 唤醒，醒来即命中下方取消检查
      await genAcquire(nodeId)
      if (isCancelled(nodeId)) { genRelease(); return }
      const { prompt, size = '2048x2048', model = '', reference, refs, upscale, negative, seed } = o
      store.updateNode(nodeId, { status: 'running', _startedAt: Date.now(), errMsg: '' })
      const ac = new AbortController()
      inflightJobs.set(nodeId, ac)
      try {
        // 构造要发送的 refs：dataURL/内联直接传，远程 URL 简化只传 refs 数组（服务端会解析）
        const refsPayload = (refs || []).map((r) => ({ src: r.src, role: r.role || 'reference', strength: r.strength ?? 0.7 }))
        const r = await snxGenPost({
          prompt, size, model: model || undefined,
          negative: negative || undefined,
          seed: typeof seed === 'number' && seed >= 0 ? seed : undefined,
          reference: reference || undefined,
          refs: refsPayload.length ? refsPayload : undefined,
          persist: true,
        }, ac.signal)
        if (!r.ok || !r.image) throw new Error(r.error || '生成失败')
        const value = r.image.kind === 'base64' ? 'data:image/png;base64,' + r.image.value : r.image.value
        // P2-9：落盘失败且返回图过大 → 拒收，不把巨型 dataURL 塞进文档（autosave 会超 8MB 上限 413）
        if (overInlineLimit(r.image.kind, value)) {
          const mb = (value.length / 1024 / 1024).toFixed(1)
          store.updateNode(nodeId, {
            status: 'error', error: '落盘失败：返回图过大（' + mb + 'MB）已拒收',
            errMsg: '图片生成成功但服务端落盘失败，返回了 ' + mb + 'MB 的内联数据；为避免撑爆画布文档已拒收，请检查服务端存储后重试。',
            _endedAt: Date.now(),   // v12：队列详情耗时两段（运行段止点）
          })
          toastBus('生成结果 ' + mb + 'MB 落盘失败已拒收，未写入画布（可检查服务端存储后重试）', 'err')
          return
        }
        const im = await loadImg(value)
        // 落图前最后检查：已被用户取消就不复活成 done（竞态窗口：响应刚回来时点了取消）
        if (isCancelled(nodeId)) { inflightJobs.delete(nodeId); return }
        // upscale 倍数 → 节点初始尺寸放大（与原图一致便于构图）
        const baseSize = upscale ? 480 * (upscale === 4 ? 2 : 1.5) : 480
        const fit = nodeFit(im, baseSize)
        // SPEC-18 五前置：服务端透传的上游 seed 写进 params——真实生成的图从此有种子，
        // 灯箱「同种子重生成」对真图可用（此前 seed 在服务端 {ok,image} 包装时被丢弃）
        const donePatch = { status: 'done', src: value, w: fit.w, h: fit.h, error: '', errMsg: '', ts: Date.now(), _endedAt: Date.now() }
        if (typeof r.seed === 'number' && r.seed >= 0) donePatch.params = Object.assign({}, store.node(nodeId).params, { seed: r.seed })
        store.updateNode(nodeId, donePatch)   // v12：_endedAt 供队列详情耗时两段
      } catch (e) {
        const aborted = !!(e && (e.name === 'AbortError' || /abort/i.test(String((e && e.message) || e))))
        if (aborted || isCancelled(nodeId)) {
          store.updateNode(nodeId, { status: 'error', error: '用户取消', errMsg: '用户取消', _endedAt: Date.now() })
        } else {
          store.updateNode(nodeId, { status: 'error', error: String((e && e.message) || e).slice(0, 200), _endedAt: Date.now() })
        }
      } finally {
        if (inflightJobs.get(nodeId) === ac) inflightJobs.delete(nodeId)
        genRelease()   // SPEC-18 二：还并发槽位并放行等待表队首
      }
    }
    // 无引擎兜底：按整窗视口 + 当前相机估算世界中心（生图 tab 落图时画布 DOM 未挂载、engineRef 为 null）
    function fallbackCenter() {
      const c = (store.doc && store.doc.camera) || { x: 0, y: 0, scale: 1 }
      const s = c.scale || 1
      return { x: (window.innerWidth / 2 - (c.x || 0)) / s, y: (window.innerHeight / 2 - (c.y || 0)) / s }
    }
    // anchorNode（done 图）存在 → 结果落其右侧挂 parentId（i2i 锚点）；否则视口中心
    async function genToCanvas(engine, opts) {
      const { prompt, size = '2048x2048', model = '', reference, anchorNode, n = 1, refs, upscale, negative, seed } = opts
      let bx, by, parentId
      if (anchorNode && anchorNode.status === 'done') {
        bx = anchorNode.x + anchorNode.w + 60; by = anchorNode.y; parentId = anchorNode.id
      } else {
        const c = engine && engine.centerWorld ? engine.centerWorld() : fallbackCenter()
        bx = c.x - 240; by = c.y - 240
      }
      // P1-2：入队前把 dataURL 参考图（上传改图/画布粘贴锚点）落成可持久文件 URL。
      // 落盘失败时本次请求仍用原 src（dataURL 服务端也能收），但不进 params——重试明确无图，
      // 不再出现"看起来带图、重试变文生图"的静默降级。
      const effRefsRaw = (refs && refs.length) ? refs : (reference ? [{ src: reference, role: 'reference', strength: 0.7 }] : [])
      const effRefs = []
      for (const r of effRefsRaw) {
        const psrc = await persistRef(r.src)
        effRefs.push({ src: psrc || r.src, role: r.role || 'reference', strength: r.strength ?? 0.7 })
      }
      store.pushUndo()
      const ids = []
      // 并发布局：n>4 时改用 4 列网格，避免画布太宽
      const cols = Math.min(n, 4)
      const cellW = 540, cellH = 540
      // SPEC-13 ②/SPEC-15 ①：生成入板路由按「当前解析目标」落板——跟随画廊=画廊筛选画板，
      // 手动=表单所选；未分组（''）不赋值。表单/悬浮条/重绘增强/蒙版重绘等所有 genToCanvas 入口同路生效。
      // SPEC-16 三：入板即刷新该板 lastUsed（画板列表按最近使用倒序渲染）
      const targetB = resolveTargetBoard() || undefined
      for (let i = 0; i < n; i++) {
        const id = nid()
        ids.push(id)
        const col = i % cols, row = Math.floor(i / cols)
        store.doc.nodes.push({
          id, type: 'image', status: 'pending', src: '', parentId,
          boardId: targetB,
          x: Math.round(bx + col * cellW), y: Math.round(by + row * cellH), w: 480, h: 480,
          prompt, params: {
            size, model,
            negative: negative || undefined,
            seed: typeof seed === 'number' && seed >= 0 ? seed : undefined,
            reference: keepShortRef(effRefs[0] && effRefs[0].src),
            refs: effRefs.map((r) => ({ src: keepShortRef(r.src), role: r.role || 'reference', strength: r.strength ?? 0.7 })),
            upscale,
          }, ts: Date.now(), _queuedAt: Date.now(),   // v12：入队时刻（队列详情耗时两段，ts 在 done 时会被完成时间覆盖）
        })
      }
      if (targetB) touchBoard(targetB)   // SPEC-16 三：入板即刷新该板最近使用（随下方 autosave 持久化）
      store.emit(); autosave()
      // 并发跑（已 Promise.allSettled），但单图失败不再拖垮其他
      await Promise.allSettled(ids.map((id) => runOne(id, { prompt, size, model, reference, refs: effRefs, upscale, negative, seed })))
    }

    // ——— 蒙版/扩图合成（标注板模式：原图 + 高亮标注 → i2i）———
    // brush: {opacity, hardness, feather} 可选（0~100 滑块值）；不传用默认 70/70/30，与蒙版预览双层描边算法一致
    async function composeMaskBoard(node, strokes, brush) {
      const im = await loadImg(node.src)
      // 按原图 natural 分辨率合成标注板（原先用画布显示尺寸 ~480px，2048px 原图清晰度被压到约 1/4）
      const sx = im.naturalWidth / node.w, sy = im.naturalHeight / node.h
      const op = brush ? Math.max(0, Math.min(1, brush.opacity / 100)) : 0.7
      const hard = brush ? Math.max(0, Math.min(1, brush.hardness / 100)) : 0.7
      const feath = brush ? Math.max(0, Math.min(1, brush.feather / 100)) : 0.3
      const cv = document.createElement('canvas')
      cv.width = im.naturalWidth; cv.height = im.naturalHeight
      const cx = cv.getContext('2d')
      cx.drawImage(im, 0, 0, cv.width, cv.height)
      cx.save()
      cx.beginPath(); cx.rect(0, 0, cv.width, cv.height); cx.clip()
      cx.strokeStyle = snxTheme().accent; cx.lineCap = 'round'; cx.lineJoin = 'round'
      for (const st of strokes) {
        // 双层 stroke 模拟硬度（外围渐变 + 内核实色），与蒙版预览层同参——发出的标注板与用户所见一致
        const trace = () => { cx.beginPath(); st.pts.forEach((p, i) => { const x = (p.x - node.x) * sx, y = (p.y - node.y) * sy; i ? cx.lineTo(x, y) : cx.moveTo(x, y) }); cx.stroke() }
        cx.save()
        cx.globalAlpha = op * 0.4
        cx.lineWidth = st.brush * (1 + feath * 0.6) * sx
        trace()
        cx.globalAlpha = op
        cx.lineWidth = st.brush * hard * sx
        trace()
        cx.restore()
      }
      cx.restore()
      return cv.toDataURL('image/png')
    }
    async function composeOutpaint(node, ratio) {
      const im = await loadImg(node.src)
      const iw = im.naturalWidth, ih = im.naturalHeight
      let cw = iw / 0.62, ch = cw / ratio
      if (ch < ih / 0.62) { ch = ih / 0.62; cw = ch * ratio }
      const s = Math.min(1, 2752 / cw, 2752 / ch)
      cw = Math.round(cw * s); ch = Math.round(ch * s)
      const cv = document.createElement('canvas')
      cv.width = cw; cv.height = ch
      const cx = cv.getContext('2d')
      cx.fillStyle = '#FFFFFF'; cx.fillRect(0, 0, cw, ch)
      cx.drawImage(im, Math.round((cw - iw * s) / 2), Math.round((ch - ih * s) / 2), Math.round(iw * s), Math.round(ih * s))
      return { dataUrl: cv.toDataURL('image/png'), size: sizeForAspect(cw, ch) }
    }
    const OUTPAINT_PROMPT = '扩展图片：将画面自然延伸填满整个画幅，白色区域全部补全，原图内容保持不变，扩展区域与原图风格、光照、透视自然衔接。'
    const MASK_PROMPT_SUFFIX = '；仅修改图中高亮标注的区域，未标注部分严格保持原样。'
    // 消除笔：进入蒙版模式时预填的指令（配合标注板发 i2i，applyMask 会再拼 MASK_PROMPT_SUFFIX）
    const ERASE_MASK_PROMPT = '清除图中高亮标注区域的内容（删除该区域内的物体/文字/水印），用周围背景自然延伸填补'
    // 一键去背景（抠图）：U1.5 i2i 无透明通道，落地为纯白背景抠图
    const REMOVE_BG_PROMPT = '抠图：完全去除背景，只保留画面主体；背景替换为纯白色，主体边缘干净利落，不要裁切或变形主体。'

    // ——— Konva 引擎 ———
    function createEngine(wrap) {
      const Konva = window.Konva
      const theme = snxTheme()   // Konva 需真实色值：getComputedStyle 读一次并缓存
      const stageDiv = document.createElement('div')
      stageDiv.setAttribute('data-snx-stage', '')   // 定位容器:用属性选择器(CSS 类对账只认 className: 字面量)
      wrap.appendChild(stageDiv)

      const stage = new Konva.Stage({ container: stageDiv, width: wrap.clientWidth, height: wrap.clientHeight })
      // v11.1：edgeLayer 开启命中——连线可 hover 高亮/右键断开/点击选中子节点
      const edgeLayer = new Konva.Layer({ listening: true })
      const mainLayer = new Konva.Layer()
      // v11.2：portLayer 端口层——节点之上、框选矩形之下（此前端口混在 edgeLayer 里被节点图盖住半截）
      // SPEC-17 一.4 确认：下方 stage.add 顺序即 z 序，portLayer(第3) 在 edgeLayer(第1) 之上，
      // Konva 命中检测自顶层向下 → 端口命中恒优先于边线：点端口=拖线，点边线中部=选中/右键菜单。
      // 残余张力 deferred（SPEC-17 一.4）：极小缩放时短边的两端端口热区(12*inv)合拢覆盖整条边，
      // 「点边线中部」无处落脚——空间分配设计张力本轮不改（热区半径已按缩放反比 1/max(0.05,scale)，
      // 再压会伤正常缩放下的可点性）。
      const portLayer = new Konva.Layer({ listening: true })
      const fxLayer = new Konva.Layer({ listening: false })   // 框选矩形
      const trLayer = new Konva.Layer()
      stage.add(edgeLayer); stage.add(mainLayer); stage.add(portLayer); stage.add(fxLayer); stage.add(trLayer)

      const tr = new Konva.Transformer({
        rotateEnabled: true, anchorSize: 8, borderStroke: theme.accent,
        anchorStroke: theme.accent, anchorFill: theme.surface, keepRatio: false,
        boundBoxFunc: (oldB, newB) => (newB.width < 40 || newB.height < 40) ? oldB : newB,
      })
      trLayer.add(tr)

      const kmap = new Map()   // docNodeId -> Konva node
      let spaceDown = false
      let destroyed = false
      let marquee = null
      let panning = null
      // v11.2.1：自实现双击检测（断裂 #1）——单击选中即 store.emit→renderAll 销毁重建全部
      // Konva 实例（审计实测 instanceId 516→543），Konva dblclick 要求同一实例收到两次点击，
      // 永远凑不齐。改记「上次点击的 snxId + 时间戳」，跨实例重建仍然有效。
      let lastClick = { id: null, at: 0 }
      const opts = {}
      const viewHooks = new Set()   // 视口变化回调（操作条定位 / 蒙版重绘）

      const cam = () => store.doc.camera
      function applyCamera() {
        const c = cam()
        for (const layer of [mainLayer, edgeLayer, portLayer, trLayer]) {
          layer.position({ x: c.x, y: c.y }); layer.scale({ x: c.scale, y: c.scale })
        }
        stageDiv.style.backgroundPosition = `${c.x}px ${c.y}px`
        stageDiv.style.backgroundSize = `${24 * c.scale}px ${24 * c.scale}px`
        // 缩放百分比由 React 渲染（store.doc.camera.scale），viewHooks 触发 force 重渲染——不再写全局 id
        viewHooks.forEach((fn) => { try { fn() } catch { } })
      }

      function syncTransformer() {
        // Transformer 只挂 done 图（Group 的 width/height 不是 Konva 原生属性，变换会 NaN）；锁定节点不挂
        const sel = []
        store.sel.forEach((id) => {
          const k = kmap.get(id)
          const nn = store.node(id)
          if (k && k.getAttr('snxStatus') === 'done' && !(nn && nn.locked)) sel.push(k)
        })
        tr.nodes(sel)
        trLayer.batchDraw()
      }

      // ── SPEC-17 批次2：拖拽对齐参考线吸附（tldraw/InvokeAI 同款）──
      // 移动集与其他节点的边/中心在 ~6 屏幕像素内吸附；参考线画在 fxLayer（与框选矩形同层，
      // 盖在节点之上）。纯本地几何计算，不碰 store 文档与后端；dragend 落库后清线。
      const SNAP_PX = 6   // 屏幕像素吸附半径
      function snapTargets(movingIds) {
        const arr = []
        for (const n of store.doc.nodes) {
          if (n.hidden || movingIds.has(n.id)) continue   // 隐藏节点不作吸附目标
          arr.push(n)
        }
        return arr
      }
      function drawSnapGuides(guides) {
        const c = cam()
        fxLayer.destroyChildren()
        fxLayer.position({ x: c.x, y: c.y }); fxLayer.scale({ x: c.scale, y: c.scale })
        const sw = 1 / Math.max(0.05, c.scale)
        for (const g of guides) {
          fxLayer.add(new Konva.Line({
            points: g.axis === 'v' ? [g.at, g.from, g.at, g.to] : [g.from, g.at, g.to, g.at],
            stroke: theme.accent, strokeWidth: sw, dash: [6 * sw, 4 * sw], opacity: 0.85, listening: false,
          }))
        }
        fxLayer.batchDraw()
      }
      function clearSnapGuides() {
        if (!fxLayer.getChildren().length) return
        fxLayer.destroyChildren(); fxLayer.batchDraw()
      }

      function bindNode(k, docNode) {
        k.setAttr('snxId', docNode.id)
        k.on('click tap', (e) => {
          e.cancelBubble = true
          if (e.evt.shiftKey) {
            if (store.sel.has(docNode.id)) store.sel.delete(docNode.id)
            else store.sel.add(docNode.id)
          } else if (!store.sel.has(docNode.id)) {
            store.sel = new Set([docNode.id])
          }
          // v11.2.1：双击=打开灯箱（带该节点）——自实现检测：同一节点 400ms 内第二次左击/轻点。
          // 右键也会触发 Konva click（Konva 不按 button 过滤），这里只认非右键。
          // 「新标签打开」保留在右键菜单；done 且有图才开。
          if (!(e.evt && e.evt.button === 2)) {
            const now = Date.now()
            if (lastClick.id === docNode.id && now - lastClick.at < 400) {
              lastClick = { id: null, at: 0 }
              if (docNode.status === 'done' && docNode.src) {
                if (opts.onLightbox) opts.onLightbox(docNode.id)
                else window.open(docNode.src, '_blank')
              }
            } else {
              lastClick = { id: docNode.id, at: now }
            }
          }
          syncTransformer(); store.emitLight()
        })
        // ── SPEC-17 批次2：批量拖拽（框选/Shift 多选后拖任一成员整组跟随）+ 成组语义合一 ──
        // 随动成员 = 其余选中成员 ∪ 相关 groupId 队友，dragstart 记基线、拖动中实时同位移
        //（直接改 Konva 坐标，不触发 emit/renderAll——会销毁正在拖拽的实例）、dragend 一次性
        // 套位移落库。去重规则：
        //  - 与被拖节点同挂 Transformer 的选中 done 成员：Konva Transformer._proxyDrag 已同步
        //    移动它们且各自 dragend 落库——不进 followers，防二次位移（被拖节点自身非 done 挂载
        //    时，这些成员不随动，须进 followers）；
        //  - locked 成员一律不动（与删除/方向键微调同规矩）；
        //  - 幂等：同手势多个挂载节点各自捕获同一基线、各自套同一位移，写同一终值，无需手势属主。
        const collectFollowers = () => {
          const selfMounted = docNode.status === 'done' && store.sel.has(docNode.id)
          const out = new Map()
          const add = (n) => {
            if (!n || n.id === docNode.id || out.has(n.id) || n.locked) return
            if (selfMounted && n.status === 'done' && store.sel.has(n.id)) return   // Konva proxy 代管
            out.set(n.id, { id: n.id, x: n.x, y: n.y, w: n.w, h: n.h })
          }
          const gids = new Set()
          if (docNode.groupId) gids.add(docNode.groupId)
          if (store.sel.has(docNode.id)) {
            for (const id of store.sel) {
              const m = store.node(id)
              if (!m) continue
              add(m)   // pending/error 等其余选中成员整组跟随（此前批量移动只覆盖 done 图）
              if (m.groupId) gids.add(m.groupId)
            }
          }
          if (gids.size) for (const m of store.doc.nodes) if (m.groupId && gids.has(m.groupId)) add(m)
          return [...out.values()]
        }
        // 与被拖节点同挂 Transformer 的其余选中 done 成员（Konva proxy 代管落库，但它们跟随
        // 指针原位移、不带吸附修正）——拖动中随吸附一并视觉平移，落库仍由各自 dragend 负责
        const collectPeers = () => {
          if (docNode.status !== 'done' || !store.sel.has(docNode.id)) return []
          const arr = []
          for (const id of store.sel) {
            if (id === docNode.id) continue
            const n = store.node(id)
            if (!n || n.locked || n.status !== 'done') continue
            arr.push({ id: n.id, x: n.x, y: n.y, w: n.w, h: n.h })
          }
          return arr
        }
        // 拖动中：参考线吸附 + 随动成员实时跟随（每帧重算，未被吸附时 adj=0）
        const moveFollowersVisual = () => {
          const base = k.getAttr('snxMoveFollowers')
          if (!base) return
          const peers = k.getAttr('snxMovePeers') || []
          const origin = k.getAttr('snxMoveOrigin') || { x: docNode.x, y: docNode.y }
          const rawDx = k.x() - origin.x, rawDy = k.y() - origin.y
          let x0 = origin.x + rawDx, y0 = origin.y + rawDy, x1 = x0 + docNode.w, y1 = y0 + docNode.h
          for (const m of base) {
            x0 = Math.min(x0, m.x + rawDx); y0 = Math.min(y0, m.y + rawDy)
            x1 = Math.max(x1, m.x + rawDx + m.w); y1 = Math.max(y1, m.y + rawDy + m.h)
          }
          for (const p of peers) {
            x0 = Math.min(x0, p.x + rawDx); y0 = Math.min(y0, p.y + rawDy)
            x1 = Math.max(x1, p.x + rawDx + p.w); y1 = Math.max(y1, p.y + rawDy + p.h)
          }
          const movingIds = new Set(base.map((m) => m.id)); movingIds.add(docNode.id)
          for (const p of peers) movingIds.add(p.id)
          const thr = SNAP_PX / Math.max(0.05, cam().scale)
          let bx = null, by = null
          for (const o of snapTargets(movingIds)) {
            for (const L of [o.x, o.x + o.w / 2, o.x + o.w]) {
              for (const e of [x0, (x0 + x1) / 2, x1]) {
                const d = L - e
                if (Math.abs(d) <= thr && (!bx || Math.abs(d) < Math.abs(bx.d))) {
                  bx = { d, L, from: Math.min(y0, o.y), to: Math.max(y1, o.y + o.h) }
                }
              }
            }
            for (const L of [o.y, o.y + o.h / 2, o.y + o.h]) {
              for (const e of [y0, (y0 + y1) / 2, y1]) {
                const d = L - e
                if (Math.abs(d) <= thr && (!by || Math.abs(d) < Math.abs(by.d))) {
                  by = { d, L, from: Math.min(x0, o.x), to: Math.max(x1, o.x + o.w) }
                }
              }
            }
          }
          const dx = rawDx + (bx ? bx.d : 0), dy = rawDy + (by ? by.d : 0)
          k.position({ x: origin.x + dx, y: origin.y + dy })
          for (const m of base) {
            const fk = kmap.get(m.id)
            if (fk) fk.position({ x: m.x + dx, y: m.y + dy })
          }
          for (const p of peers) {
            const pk = kmap.get(p.id)
            if (pk) pk.position({ x: p.x + dx, y: p.y + dy })
          }
          const guides = []
          if (bx) guides.push({ axis: 'v', at: bx.L, from: bx.from, to: bx.to })
          if (by) guides.push({ axis: 'h', at: by.L, from: by.from, to: by.to })
          drawSnapGuides(guides)
          mainLayer.batchDraw()
        }
        // dragend/transformend 落库：随动成员直接写文档坐标，最后一次 updateNode 的 emit 一并重绘
        const applyFollowerDelta = (dx, dy) => {
          const base = k.getAttr('snxMoveFollowers') || []
          k.setAttr('snxMoveFollowers', null)
          clearSnapGuides()
          if (!dx && !dy) return
          for (const m of base) {
            const n = store.node(m.id)
            if (n) { n.x = Math.round(m.x + dx); n.y = Math.round(m.y + dy) }
          }
        }
        k.on('dragstart', () => {
          store.pushUndo()
          k.setAttr('snxMoveFollowers', collectFollowers())
          k.setAttr('snxMovePeers', collectPeers())
          k.setAttr('snxMoveOrigin', { x: docNode.x, y: docNode.y })
        })
        // v11.1：拖动/变换时连线实时跟随（此前边只在 renderAll 时重画，拖动中甩在原地）
        // v11.2：dragmove 重画 50ms 节流（时间戳比较）；dragend 后 updateNode→emit→renderAll 兜底全量重画
        k.on('dragmove', () => {
          moveFollowersVisual()
          const now = Date.now()
          if (now - lastEdgeDrawAt < 50) return
          lastEdgeDrawAt = now
          drawEdges()
        })
        k.on('transformend', () => drawEdges())
        k.on('dragend', () => {
          const nx = Math.round(k.x()), ny = Math.round(k.y())
          const dx = nx - docNode.x, dy = ny - docNode.y
          applyFollowerDelta(dx, dy)
          // v17.1：多选拖拽落库——Transformer._proxyDrag 对同挂节点 startDrag 但 mouseup
          // 只给指针节点发 dragend，其余选中节点的 Konva x/y 已被移动但文档坐标未更新。
          // 遍历选中集，从 kmap 读 Konva 坐标写回 doc。
          for (const selId of store.sel) {
            if (selId === docNode.id) continue
            const peerK = kmap.get(selId)
            const peerN = store.node(selId)
            if (peerK && peerN && peerN.status === 'done' && !peerN.locked) {
              const px = Math.round(peerK.x()), py = Math.round(peerK.y())
              if (px !== peerN.x || py !== peerN.y) { peerN.x = px; peerN.y = py }
            }
          }
          store.updateNode(docNode.id, { x: nx, y: ny })
        })
        k.on('transformstart', () => {
          store.pushUndo()
          k.setAttr('snxMoveFollowers', collectFollowers())
          k.setAttr('snxMovePeers', collectPeers())
          k.setAttr('snxMoveOrigin', { x: docNode.x, y: docNode.y })
        })
        k.on('transformend', () => {
          const sx = k.scaleX(), sy = k.scaleY()
          k.scaleX(1); k.scaleY(1)
          const w = Math.max(40, Math.round(k.width() * sx)), hh = Math.max(40, Math.round(k.height() * sy))
          k.width(w); k.height(hh)
          const nx = Math.round(k.x()), ny = Math.round(k.y())
          const dx = nx - docNode.x, dy = ny - docNode.y
          applyFollowerDelta(dx, dy)
          store.updateNode(docNode.id, { x: nx, y: ny, w, h: hh })
        })
        // v11.2.1：Konva dblclick 处理已删除——双击开灯箱改由 click/tap 内自实现检测（见上），
        // 不再依赖「同一 Konva 实例收到两次点击」（renderAll 重建后该前提永不成立）。
        k.on('contextmenu', (e) => {
          e.evt.preventDefault(); e.cancelBubble = true
          if (!store.sel.has(docNode.id)) { store.sel = new Set([docNode.id]); syncTransformer(); store.emitLight() }
          if (opts.onContext) opts.onContext(e.evt.clientX, e.evt.clientY, docNode.id)
        })
      }

      function renderNode(n) {
        if (n.status === 'pending' || n.status === 'running') {
          // P1-11：占位只画几何框；文字与转圈全交给 HTML PendingOverlay（此前 Konva 文字与
          // overlay 双重叠加，且写死"20-60 秒"拍脑袋 ETA）。running 同样落这里——原先 running
          // 掉进 Image 分支渲染 src='' 的空图节点。
          const g = new Konva.Group({ x: n.x, y: n.y, draggable: !n.locked })
          g.add(new Konva.Rect({
            width: n.w, height: n.h, stroke: theme.accent, dash: [10, 7], strokeWidth: 1.5,
            cornerRadius: 8, fill: theme.tint(theme.accent, 0.06),
          }))
          g.setAttr('snxStatus', 'pending')
          bindNode(g, n)
          mainLayer.add(g)
          kmap.set(n.id, g)
        } else if (n.status === 'error') {
          const g = new Konva.Group({ x: n.x, y: n.y, draggable: !n.locked })
          g.add(new Konva.Rect({
            width: n.w, height: n.h, stroke: theme.error, dash: [10, 7], strokeWidth: 1.5,
            cornerRadius: 8, fill: theme.tint(theme.error, 0.06),
          }))
          g.add(new Konva.Text({
            width: n.w, y: n.h / 2 - 30, align: 'center', text: '生成失败',
            fontSize: 15, fill: theme.error,
          }))
          g.add(new Konva.Text({
            width: n.w - 24, x: 12, y: n.h / 2 - 4, align: 'center',
            text: (n.error || '').slice(0, 120) + '\n\n右键可重试', fontSize: 11, fill: theme.label, lineHeight: 1.5,
          }))
          g.setAttr('snxStatus', 'error')
          bindNode(g, n)
          mainLayer.add(g)
          kmap.set(n.id, g)
        } else {
          const k = new Konva.Image({
            x: n.x, y: n.y, width: n.w, height: n.h, draggable: !n.locked,
            stroke: theme.border, strokeWidth: 1,
            shadowColor: 'rgba(0,0,0,0.38)', shadowBlur: 16, shadowOffset: { x: 2, y: 5 },
          })
          k.setAttr('snxStatus', 'done')
          // v8：图层属性
          if (n.blendMode) k.globalCompositeOperation(n.blendMode)
          if (n.opacity !== undefined) k.opacity(n.opacity)
          if (n.hidden) k.visible(false)
          bindNode(k, n)
          mainLayer.add(k)
          kmap.set(n.id, k)
          getImg(n.src, (im) => { if (!destroyed && k.getLayer()) { k.image(im); mainLayer.batchDraw() } })
        }
      }

      // ── v11.1：手动连线编辑 ──
      // 树语义：子节点.parentId 指向父。连线可 hover 高亮/点击选中子节点/右键断开；
      // 每个 done 图节点右缘有输出端口，拖出→落到另一节点即改接其 parentId（防环 + undo）。
      let linkDrag = null   // { fromId } 拖拽改接进行中
      let lastEdgeDrawAt = 0   // v11.2：dragmove 连线重画节流时间戳
      function reachesUp(fromId, ancestorId) {
        // 从 fromId 沿 parentId 向上走，能否到达 ancestorId（用于防环：新父在子的子树里则拒绝）
        let cur = store.node(fromId)
        const seen = new Set()
        while (cur && cur.parentId && !seen.has(cur.id)) {
          seen.add(cur.id)
          if (cur.parentId === ancestorId) return true
          cur = store.node(cur.parentId)
        }
        return false
      }
      function linkDragDraw(wx, wy, cand, candOk) {
        const from = store.node(linkDrag.fromId)
        const c = cam()
        fxLayer.destroyChildren()
        fxLayer.position({ x: c.x, y: c.y }); fxLayer.scale({ x: c.scale, y: c.scale })
        if (from) {
          const x0 = from.x + from.w, y0 = from.y + from.h / 2
          const dx = Math.max(24, Math.abs(wx - x0) * 0.45)
          fxLayer.add(new Konva.Line({
            points: [x0, y0, x0 + dx, y0, wx - dx, wy, wx, wy], bezier: true,
            stroke: theme.accent, strokeWidth: 2, dash: [7, 5], opacity: 0.9,
          }))
        }
        if (cand) {
          fxLayer.add(new Konva.Rect({
            x: cand.x - 3, y: cand.y - 3, width: cand.w + 6, height: cand.h + 6, cornerRadius: 10,
            stroke: candOk ? theme.accent : theme.error, strokeWidth: 2, dash: [8, 6],
            fill: candOk ? theme.tint(theme.accent, 0.07) : theme.tint(theme.error, 0.07),
          }))
        }
        fxLayer.batchDraw()
      }
      function linkDragCancel() {
        linkDrag = null
        fxLayer.destroyChildren(); fxLayer.batchDraw()
        stageDiv.style.cursor = 'default'
      }
      function linkDragDrop(wx, wy) {
        // v11.2：兜底守卫——拖拽态已被取消/源节点已删时直接收线，不做任何改接
        const from = store.node(linkDrag && linkDrag.fromId)
        if (!from) { linkDragCancel(); return }
        let hit = null
        for (let i = store.doc.nodes.length - 1; i >= 0; i--) {
          const n = store.doc.nodes[i]
          if (n.status !== 'done' || n.hidden) continue
          if (wx >= n.x && wx <= n.x + n.w && wy >= n.y && wy <= n.y + n.h) { hit = n; break }
        }
        if (hit && hit.id !== linkDrag.fromId) {
          if (reachesUp(linkDrag.fromId, hit.id)) {
            if (opts.onNotify) opts.onNotify('不能连接：会形成环（' + (hit.prompt || '图').slice(0, 14) + ' 是源图的祖先）')
          } else if (hit.parentId === linkDrag.fromId) {
            // 已连着，无需动
          } else {
            store.pushUndo()
            store.updateNode(hit.id, { parentId: linkDrag.fromId })
            store.emit(); autosave()
            if (opts.onNotify) opts.onNotify('已改接：现在衍生自 ' + (from.prompt || '图').slice(0, 14))
          }
        }
        linkDragCancel()
      }

      function drawEdges() {
        edgeLayer.destroyChildren()
        portLayer.destroyChildren()   // v11.2：端口移到独立 portLayer，同步重建
        // v11.1：交互件尺寸按相机倒数补偿——热区/端口在任何缩放下保持恒定屏幕大小
        const inv = 1 / Math.max(0.05, cam().scale)
        for (const n of store.doc.nodes) {
          if (!n.parentId) continue
          if (n.hidden) continue   // v11.2：隐藏节点不画入边
          const p = store.node(n.parentId)
          if (!p) continue
          // v10：三阶贝塞尔（控制点水平外推），端点小圆点
          const x0 = p.x + p.w, y0 = p.y + p.h / 2
          const x1 = n.x, y1 = n.y + n.h / 2
          const dx = Math.max(24, (x1 - x0) * 0.45)
          const line = new Konva.Line({
            points: [x0, y0, x0 + dx, y0, x1 - dx, y1, x1, y1],
            bezier: true,
            stroke: theme.tint(theme.accent, 0.45), strokeWidth: 1.75,
            hitStrokeWidth: 14 * inv,   // 恒定 ≈14 屏幕像素的隐形热区(纯倒数,无上限——上限会在极低缩放时把热区压回像素级)
          })
          line.on('mouseenter', () => { line.stroke(theme.accent); line.strokeWidth(2.75); edgeLayer.batchDraw() })
          line.on('mouseleave', () => { line.stroke(theme.tint(theme.accent, 0.45)); line.strokeWidth(1.75); edgeLayer.batchDraw() })
          line.on('mousedown', (e) => {
            if (e.evt.button !== 0) return
            e.cancelBubble = true
            store.sel = new Set([n.id]); syncTransformer(); store.emitLight()
          })
          line.on('contextmenu', (e) => {
            e.evt.preventDefault(); e.cancelBubble = true
            if (opts.onContext) opts.onContext(e.evt.clientX, e.evt.clientY, null, { edgeChild: n.id })
          })
          edgeLayer.add(line)
          edgeLayer.add(new Konva.Circle({ x: x0, y: y0, radius: 2.5 * inv, fill: theme.tint(theme.accent, 0.6) }))
          edgeLayer.add(new Konva.Circle({ x: x1, y: y1, radius: 2.5 * inv, fill: theme.tint(theme.accent, 0.6) }))
        }
        // 输出/输入端口：拖输出端口到目标节点=改接其 parentId
        for (const n of store.doc.nodes) {
          if (n.status !== 'done' || n.hidden) continue
          const out = new Konva.Circle({
            x: n.x + n.w, y: n.y + n.h / 2, radius: 4.5 * inv,
            fill: theme.tint(theme.accent, 0.8), stroke: theme.accent, strokeWidth: 1.5 * inv,
            hitStrokeWidth: 12 * inv,
          })
          out.on('mousedown', (e) => {
            if (e.evt.button !== 0 || linkDrag) return
            e.cancelBubble = true
            linkDrag = { fromId: n.id }
            stageDiv.style.cursor = 'crosshair'
            // v11.2：兜底——指针在画布外松开/系统取消拖拽/窗口失焦都要收线，
            // 不再依赖 stage mouseup（落到画布外就永远收不了线）。drop 先行时此处 no-op。
            const cancel = () => { if (linkDrag) linkDragCancel() }
            window.addEventListener('mouseup', cancel, { once: true })
            window.addEventListener('pointercancel', cancel, { once: true })
            window.addEventListener('blur', cancel, { once: true })
          })
          out.on('mouseenter', () => { stageDiv.style.cursor = 'crosshair' })
          out.on('mouseleave', () => { if (!linkDrag) stageDiv.style.cursor = 'default' })
          out.on('contextmenu', (e) => {
            e.evt.preventDefault(); e.cancelBubble = true
            if (opts.onContext) opts.onContext(e.evt.clientX, e.evt.clientY, n.id)
          })
          portLayer.add(out)
          portLayer.add(new Konva.Circle({
            x: n.x, y: n.y + n.h / 2, radius: 3.5 * inv, listening: false,
            stroke: theme.accent, strokeWidth: 1.2 * inv, opacity: 0.55,
          }))
        }
        edgeLayer.batchDraw()
        portLayer.batchDraw()
      }

      function renderAll() {
        mainLayer.destroyChildren()
        kmap.clear()
        for (const n of store.doc.nodes) renderNode(n)
        drawEdges()
        syncTransformer()
        // SPEC-17 批次2：文档重建时清掉吸附参考线（fxLayer 是纯瞬态层——框选矩形/拖线预览
        // 各自在的交互里重画，这里清掉手势中断后的残线即可，不影响它们）
        fxLayer.destroyChildren()
        mainLayer.batchDraw()
        mainLayer.drawHit()   // v12：同步重画命中图——batchDraw 是 rAF 延帧的,紧接着的第二次点击
      }                        // 会命中已销毁的旧节点(事件已解绑),双击检测因此对快速双击失效

      // ——— 视口交互 ———
      stage.on('mousedown', (e) => {
        const evt = e.evt
        if (linkDrag) return   // v11.2：拖线期间不再起框选/平移（窗口级 mouseup 兜底收线）
        if (evt.button === 1 || (spaceDown && evt.button === 0)) {
          panning = { px: evt.clientX, py: evt.clientY, cx: cam().x, cy: cam().y }
          stageDiv.style.cursor = 'grabbing'
          evt.preventDefault()
          return
        }
        if (evt.button !== undefined && evt.button !== 0) return
        if (e.target === stage) {
          const p = stage.getPointerPosition()
          const c = cam()
          marquee = {
            x0: (p.x - c.x) / c.scale, y0: (p.y - c.y) / c.scale,
            x1: (p.x - c.x) / c.scale, y1: (p.y - c.y) / c.scale,
          }
        }
      })
      stage.on('mousemove', (e) => {
        const evt = e.evt
        if (linkDrag) {
          const p = stage.getPointerPosition()
          if (!p) return
          const c = cam()
          const wx = (p.x - c.x) / c.scale, wy = (p.y - c.y) / c.scale
          let cand = null, candOk = false
          for (let i = store.doc.nodes.length - 1; i >= 0; i--) {
            const n = store.doc.nodes[i]
            if (n.status !== 'done' || n.hidden) continue
            if (wx >= n.x && wx <= n.x + n.w && wy >= n.y && wy <= n.y + n.h) {
              cand = n
              candOk = n.id !== linkDrag.fromId && !reachesUp(linkDrag.fromId, n.id)
              break
            }
          }
          linkDragDraw(wx, wy, cand && cand.id !== linkDrag.fromId ? cand : null, candOk)
          return
        }
        if (panning) {
          cam().x = panning.cx + (evt.clientX - panning.px)
          cam().y = panning.cy + (evt.clientY - panning.py)
          applyCamera()
          return
        }
        if (marquee) {
          const p = stage.getPointerPosition()
          const c = cam()
          marquee.x1 = (p.x - c.x) / c.scale; marquee.y1 = (p.y - c.y) / c.scale
          fxLayer.destroyChildren()
          fxLayer.position({ x: c.x, y: c.y }); fxLayer.scale({ x: c.scale, y: c.scale })
          fxLayer.add(new Konva.Rect({
            x: Math.min(marquee.x0, marquee.x1), y: Math.min(marquee.y0, marquee.y1),
            width: Math.abs(marquee.x1 - marquee.x0), height: Math.abs(marquee.y1 - marquee.y0),
            stroke: theme.accent, dash: [6, 4], strokeWidth: 1 / c.scale, fill: theme.tint(theme.accent, 0.06),
          }))
          fxLayer.batchDraw()
        }
      })
      stage.on('mouseup', () => {
        if (linkDrag) {
          const p = stage.getPointerPosition()
          if (p) {
            const c = cam()
            linkDragDrop((p.x - c.x) / c.scale, (p.y - c.y) / c.scale)
          } else linkDragCancel()
          return
        }
        if (panning) {
          panning = null
          stageDiv.style.cursor = spaceDown ? 'grab' : 'default'
          autosave()
          return
        }
        if (marquee) {
          const m = marquee; marquee = null
          fxLayer.destroyChildren(); fxLayer.batchDraw()
          if (Math.abs(m.x1 - m.x0) > 6 || Math.abs(m.y1 - m.y0) > 6) {
            const rx = Math.min(m.x0, m.x1), ry = Math.min(m.y0, m.y1)
            const rw = Math.abs(m.x1 - m.x0), rh = Math.abs(m.y1 - m.y0)
            const hits = store.doc.nodes.filter((n) => {
              const nx = Math.max(n.x, rx), ny = Math.max(n.y, ry)
              return Math.min(n.x + n.w, rx + rw) - nx > 0 && Math.min(n.y + n.h, ry + rh) - ny > 0
            })
            store.sel = new Set(hits.map((n) => n.id))
          } else {
            store.sel = new Set()   // 点空处清除选择
          }
          syncTransformer(); store.emitLight()
        }
      })
      stage.on('wheel', (e) => {
        e.evt.preventDefault()
        const c = cam()
        const old = c.scale
        const ns = Math.min(8, Math.max(0.05, old * (e.evt.deltaY > 0 ? 0.9 : 1.1)))
        const p = stage.getPointerPosition()
        if (!p) return
        const wx = (p.x - c.x) / old, wy = (p.y - c.y) / old
        c.scale = ns; c.x = p.x - wx * ns; c.y = p.y - wy * ns
        applyCamera(); drawEdges(); autosave()   // v11.1：缩放后重画边——热区/端口尺寸随相机补偿
      })
      stage.on('contextmenu', (e) => {
        if (e.target !== stage) return
        e.evt.preventDefault()
        // v11.2.1（断裂 #4）：右键节点却退化成空画布菜单（删除/适应画面/导出/清空四项）——
        // menu.nodeId 没到达。机制：每次选中/拖拽结束都 store.emit→renderAll destroyChildren
        // 重建全部实例（审计实测 instanceId 516→543），Konva 命中画布要等下一帧 batchDraw 才
        // 重画；紧跟着的右键落在空窗期时，Stage._contextmenu 的 getIntersection 读到已销毁实例
        // 的颜色码（Konva 源码 Layer._getIntersection：查无注册形状→按抗锯齿继续螺旋外扩→
        // 出界返回 null）→ 走 stage 级分支 target===stage，onContext 收到 null，节点项永不出现。
        // 这里按文档几何补一次命中（与 linkDragDrop 同款 bbox 判定，文档顺序即 z 序从顶到底），
        // 指针确实落在可见节点上就补选中并带 nodeId，只有真空白才出空画布菜单。
        let hitId = null
        const p = stage.getPointerPosition()
        if (p) {
          const c = cam()
          const wx = (p.x - c.x) / c.scale, wy = (p.y - c.y) / c.scale
          for (let i = store.doc.nodes.length - 1; i >= 0; i--) {
            const n = store.doc.nodes[i]
            if (n.hidden) continue
            if (wx >= n.x && wx <= n.x + n.w && wy >= n.y && wy <= n.y + n.h) { hitId = n.id; break }
          }
        }
        if (hitId && !store.sel.has(hitId)) { store.sel = new Set([hitId]); syncTransformer(); store.emitLight() }
        if (opts.onContext) opts.onContext(e.evt.clientX, e.evt.clientY, hitId)
      })

      const onKeyDown = (e) => {
        if (modalOpen()) return   // P0-4：灯箱/帮助等模态打开时空格平移让路
        if (e.key === 'Escape' && linkDrag) { linkDragCancel(); return }   // v11.1：拖线中 Esc 取消
        if (e.code === 'Space' && !isTyping(e) && !spaceDown) {
          spaceDown = true
          stageDiv.style.cursor = 'grab'
          if (e.target === document.body) e.preventDefault()
        }
      }
      const onKeyUp = (e) => {
        if (e.code === 'Space') { spaceDown = false; stageDiv.style.cursor = 'default' }
      }
      window.addEventListener('keydown', onKeyDown)
      window.addEventListener('keyup', onKeyUp)

      const ro = new ResizeObserver(() => {
        if (destroyed) return
        stage.width(wrap.clientWidth); stage.height(wrap.clientHeight)
        stage.batchDraw()
      })
      ro.observe(wrap)

      return {
        opts,
        drawEdges,
        setOnContext(fn) { opts.onContext = fn },
        onViewChange(fn) { viewHooks.add(fn); return () => viewHooks.delete(fn) },
        renderAll,
        syncTransformer,
        // v8：轻量 refresh — 同步图层属性变化到 Konva（含 locked → draggable）
        refresh() {
          for (const n of store.doc.nodes) {
            const k = kmap.get(n.id)
            if (!k) continue
            if (k.globalCompositeOperation) k.globalCompositeOperation(n.blendMode || 'source-over')
            if (k.opacity) k.opacity(n.opacity !== undefined ? n.opacity : 1)
            if (k.visible) k.visible(!n.hidden)
            if (k.draggable) k.draggable(!n.locked)
          }
          syncTransformer()   // 锁定/解锁后变换框跟随
          mainLayer.batchDraw()
        },
        applyCamera,
        centerWorld() {
          const c = cam()
          return { x: (stage.width() / 2 - c.x) / c.scale, y: (stage.height() / 2 - c.y) / c.scale }
        },
        // SPEC-17 批次2：Ctrl+V 粘贴落点 = 指针当前所在的画布坐标（指针不在画布上时为 null）
        pointerWorld() {
          const p = stage.getPointerPosition()
          if (!p) return null
          const c = cam()
          return { x: (p.x - c.x) / c.scale, y: (p.y - c.y) / c.scale }
        },
        // P1-15：图层面板点击=定位——平移相机把节点中心带到视口中心，保持当前缩放（不全局 fit 重置）
        focusNode(id) {
          const n = store.node(id)
          if (!n) return
          const c = cam()
          c.x = stage.width() / 2 - (n.x + n.w / 2) * c.scale
          c.y = stage.height() / 2 - (n.y + n.h / 2) * c.scale
          applyCamera(); autosave()
        },
        zoomBy(f) {
          const c = cam()
          const px = stage.width() / 2, py = stage.height() / 2
          const wx = (px - c.x) / c.scale, wy = (py - c.y) / c.scale
          const ns = Math.min(8, Math.max(0.05, c.scale * f))
          c.scale = ns; c.x = px - wx * ns; c.y = py - wy * ns
          applyCamera(); autosave()
        },
        fit() {
          const ns = store.doc.nodes
          if (!ns.length) { Object.assign(cam(), { x: 0, y: 0, scale: 1 }); applyCamera(); return }
          let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
          ns.forEach((n) => {
            x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y)
            x1 = Math.max(x1, n.x + n.w); y1 = Math.max(y1, n.y + n.h)
          })
          const pad = 80
          const sw = Math.max(100, stage.width() - pad * 2), sh = Math.max(100, stage.height() - pad * 2)
          const scale = Math.min(8, Math.max(0.05, Math.min(sw / (x1 - x0), sh / (y1 - y0))))
          const c = cam()
          c.scale = scale
          c.x = stage.width() / 2 - ((x0 + x1) / 2) * scale
          c.y = stage.height() / 2 - ((y0 + y1) / 2) * scale
          applyCamera(); autosave()
        },
        destroy() {
          destroyed = true
          window.removeEventListener('keydown', onKeyDown)
          window.removeEventListener('keyup', onKeyUp)
          ro.disconnect()
          stage.destroy()
          stageDiv.remove()
        },
      }
    }

    // ——— 右侧面板：生成 ———
    // targetBoard：生成入板路由（SPEC-13 ②）——'' = 未分组（生成节点不归板）；否则为 boards[].id。
    // galBoard：画廊画板筛选镜像（Workbench useEffect 同步进 genPrefs）——「跟随画廊」解析用（SPEC-15 ①）
    const genPrefs = { size: '2048x2048', model: '', targetBoard: '', galBoard: '' }   // 面板/悬浮 bar 共享的生成偏好
    // SPEC-15 ①「跟随画廊」（默认开）：画廊画板筛选为具体画板时，生成入板=该画板；
    // 筛选「全部('')/未分组('none')」→ 未分组（不赋板）。用户在 gen form 手动选了画板 →
    // 脱离跟随（手动优先，画廊再切不覆盖），下拉首项「回到跟随画廊」一键返回跟随。
    // followBoard/genPrefs 均为内存态，刷新后恢复默认跟随
    const FOLLOW_BOARD = '__follow__'   // 目标画板下拉首项哨兵值（画板 id 由 nid() 生成，不会撞）
    const BOARD_SORT_OPT = '__boardsort__'   // SPEC-17 三：目标画板下拉「排序」切换项哨兵值（同为 id 不会撞）
    let followBoard = true              // 当前是否跟随画廊（gen form 手动选择时置 false）
    // 跟随解析：画廊筛选为具体画板 id → 该板；'' 全部 / 'none' 未分组 → ''（未分组，不赋板）
    function followTargetOf(gb) { return gb && gb !== 'none' ? gb : '' }
    // 生成入板的最终解析目标——genToCanvas 落板与决策面板目标行统一走这里（手动优先）
    function resolveTargetBoard() {
      return followBoard ? followTargetOf(genPrefs.galBoard) : (genPrefs.targetBoard || '')
    }
    // SPEC-16 三：画板最近使用——节点创建入板/移入时刷新该板 lastUsed（存 boards[].lastUsed，
    // 随 doc.boards 走 autosave 整文档持久化，snapshot JSON.stringify 同样覆盖撤销）；
    // 画板列表渲染统一按它倒序，无 lastUsed 的板沉底保持原相对序
    function touchBoard(boardId) {
      if (!boardId) return
      const b = (store.doc.boards || []).find((x) => x.id === boardId)
      if (b) b.lastUsed = Date.now()
    }
    // SPEC-17 三：画板多维排序——偏好存 localStorage 键 snxBoardSort（'recent' 最近使用 | 'name' 按名称，
    // 缺省/读写失败回退 'recent' 保持原行为）；画廊画板 chips / gen form 目标画板下拉 / 灯箱画板下拉
    // 三处共用 boardsByRecent() 这同一排序函数（批量条移入下拉/右键菜单/画板筛选下拉等其余消费方随之同序）
    const BOARD_SORT_KEY = 'snxBoardSort'
    function boardSortPref() {
      try { return localStorage.getItem(BOARD_SORT_KEY) === 'name' ? 'name' : 'recent' } catch { return 'recent' }
    }
    function setBoardSortPref(v) {
      try { localStorage.setItem(BOARD_SORT_KEY, v === 'name' ? 'name' : 'recent') } catch { }
    }
    // 渲染专用：按偏好排序的副本（Array.sort 稳定排序，不改 store.doc.boards 原数组顺序）——
    // 'recent'=lastUsed 倒序（SPEC-16 三，缺失视为 0 沉底保持原相对序）；
    // 'name'=localeCompare zh-Hans-CN 拼音序（同名板排序稳定保持原序）
    function boardsByRecent() {
      const list = (store.doc.boards || []).slice()
      if (boardSortPref() === 'name') list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hans-CN'))
      else list.sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0))
      return list
    }

    // ——— 提示词库（v8）：localStorage 星标 / 最近 / 模板 ———
    // P2-4：模块级内存缓存——GenForm 等组件渲染期不再同步读 localStorage（每次渲染 3 次 → 0 次），
    // 读走缓存、写穿透落盘并广播 snx:promptLibChanged，订阅方刷新各自的 state。
    const PROMPT_LIB_KEY = 'snx-prompt-lib-v1'
    let promptLibCache = null
    function loadPromptLib() {
      if (promptLibCache) return promptLibCache
      let lib = { stars: [], recents: [], presets: [] }
      try {
        const raw = localStorage.getItem(PROMPT_LIB_KEY)
        if (raw) {
          const o = JSON.parse(raw)
          lib = {
            stars: Array.isArray(o.stars) ? o.stars : [],
            recents: Array.isArray(o.recents) ? o.recents : [],
            presets: Array.isArray(o.presets) ? o.presets : [],
          }
        }
      } catch { /* 损坏/不可用 → 空库 */ }
      promptLibCache = lib
      return lib
    }
    function savePromptLib(lib) {
      promptLibCache = lib   // 写入即刷新缓存，读方零 localStorage 往返
      try { localStorage.setItem(PROMPT_LIB_KEY, JSON.stringify(lib)) } catch { }
      try { window.dispatchEvent(new CustomEvent('snx:promptLibChanged')) } catch { }
    }
    function addRecent(p) {
      if (!p || !p.trim()) return
      const lib = loadPromptLib()
      const np = p.trim()
      const before = lib.recents.length
      lib.recents = [np, ...lib.recents.filter((x) => x !== np)].slice(0, 10)
      if (lib.recents.length !== before) savePromptLib(lib)
    }
    function isStarred(p) {
      if (!p || !p.trim()) return false
      const lib = loadPromptLib()
      return lib.stars.some((s) => s.prompt === p.trim())
    }
    function toggleStar(p) {
      if (!p || !p.trim()) return false
      const lib = loadPromptLib()
      const np = p.trim()
      const has = lib.stars.some((s) => s.prompt === np)
      if (has) {
        lib.stars = lib.stars.filter((s) => s.prompt !== np)
      } else {
        lib.stars.unshift({ prompt: np, ts: Date.now() })
        if (lib.stars.length > 50) lib.stars = lib.stars.slice(0, 50)
      }
      savePromptLib(lib)
      return !has
    }

    // ——— 悬浮 prompt bar（画布顶部常驻；选中图时自动 i2i）———
    // P1-12：与生图表单共享同一份 genPrefs——负面词/参考图/张数/种子/画质全量随行，
    // 不再"悬浮条只带 model/size，表单里其余参数静默失效"。
    function GenBar({ engineRef, busy, setBusy, notify }) {
      const [text, setText] = useState('')
      // 选中 done 图 → i2i 编辑模式
      let selDone = null
      if (store.sel.size === 1) {
        const cand = store.node([...store.sel][0])
        if (cand && cand.status === 'done') selDone = cand
      }
      const refCount = Array.isArray(genPrefs.refs) ? genPrefs.refs.filter((r) => r && r.src).length : 0
      const go = async () => {
        const p = text.trim()
        if (!p || busy) return
        if (queuePaused) notify('队列已暂停，任务已入队等待恢复')   // v11.2：暂停期入队全局告知
        setBusy(true)
        try {
          const size = selDone ? sizeForAspect(selDone.w, selDone.h) : applyQuality(genPrefs.size || '2048x2048', genPrefs.quality || '2k')
          await genToCanvas(engineRef.current, {
            prompt: p, size, model: genPrefs.model || '',
            negative: genPrefs.negPrompt || undefined,
            seed: typeof genPrefs.seed === 'number' && genPrefs.seed >= 0 ? genPrefs.seed : undefined,
            reference: selDone ? selDone.src : undefined,
            refs: (!selDone && refCount) ? genPrefs.refs.map((r) => ({ src: r.src, role: r.role, strength: r.strength })) : undefined,
            anchorNode: selDone || null,
            n: Math.max(1, genPrefs.count || 1),
          })
          setText('')
        } catch (e) { notify && notify('生成失败：' + String((e && e.message) || e)) }
        finally { setBusy(false) }
      }
      // tag 文案如实：有选中图=编辑；无选中但带了参考图=参考图生图；否则才是文生图
      const tagLabel = selDone ? [ic('brush'), ' 编辑选中图']
        : refCount ? [ic('images'), ' 参考图 ×' + refCount]
          : [ic('wand-sparkles'), ' 文生图']
      return h('div', { className: 'snx-pbar' },
        h('span', { className: 'tag' + (selDone ? '' : ' t2i') }, tagLabel),
        h('input', {
          value: text,
          onChange: (e) => setText(e.target.value),
          onKeyDown: (e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) go() },
          placeholder: selDone ? '描述要怎么改这张图，Enter 生成到其右侧…'
            : refCount ? '描述要生成的图（将带上表单里的 ' + refCount + ' 张参考图），Enter 生成…'
              : '描述要生成的图，Enter 直接画…',
        }),
        h('button', { className: 'go', onClick: go, disabled: busy || !text.trim() }, busy ? h('span', { className: 'snx-spinring' }) : ic('wand-sparkles')),
      )
    }

    // ——— 浮动操作条（选中时跟随；v11.2.1：sel.size>=2 渲染为多选操作条）———
    function ActionBar({ engineRef, busy, setBusy, notify, multi: multiProp, onInpaint, onErase, onOutpaint, viewTick }) {
      const [fly, setFly] = useState(null)   // 'variant' | 'enhance' | 'cutout' | null
      const [vCount, setVCount] = useState(1)
      const [vAmp, setVAmp] = useState(45)
      const [vSeed, setVSeed] = useState(true)
      const [eQ, setEQ] = useState('2k')
      const [eWm, setEWm] = useState(true)
      const [cBg, setCBg] = useState('#ffffff')
      let node = null
      if (store.sel.size === 1) {
        const cand = store.node([...store.sel][0])
        if (cand && cand.status === 'done') node = cand
      }
      // v11.2.1（断裂 #2）：挂载条件原为 sel.size===1，多选时整条不渲染——对齐/等距分布/
      // 成组/解组用户从未见过。现 sel>=2 时渲染多选区；单选行为不变。
      const multi = multiProp && multiProp.length >= 2 ? multiProp : null
      const wrapEl = engineRef.current ? engineRef.current.wrapEl : null
      if ((!node && !multi) || !wrapEl) return null
      const c = store.doc.camera
      // 锚点：单选=节点左上；多选=选区包围盒左上（放不下时翻到包围盒下方）
      let sx, sy, anchorH
      if (node) { sx = node.x * c.scale + c.x; sy = node.y * c.scale + c.y; anchorH = node.h * c.scale }
      else {
        let bx0 = Infinity, by0 = Infinity, by1 = -Infinity
        for (const n of multi) { bx0 = Math.min(bx0, n.x); by0 = Math.min(by0, n.y); by1 = Math.max(by1, n.y + n.h) }
        sx = bx0 * c.scale + c.x; sy = by0 * c.scale + c.y; anchorH = (by1 - by0) * c.scale
      }
      const barW = multi ? 560 : 520
      const left = Math.min(Math.max(8, sx), Math.max(8, wrapEl.clientWidth - barW - 8))
      const top = sy > 70 ? sy - 48 : sy + anchorH + 12
      const act = (fn) => () => { if (!busy) fn(node) }
      // v11.2.1：多选区——复用 ContextMenu 同款词汇（对齐/等距分布/成组/解组），锁定节点由
      // removeSelected 跳过。锚定在选区包围盒上，与单选条同一套 .snx-ab 定位。
      const actM = (fn) => () => { if (!busy) fn() }
      const MULTI_ALIGNS = [['align-start-vertical', 'left', '左对齐'], ['align-center-vertical', 'hcenter', '水平居中'], ['align-end-vertical', 'right', '右对齐'],
        ['align-start-horizontal', 'top', '顶对齐'], ['align-center-horizontal', 'vcenter', '垂直居中'], ['align-end-horizontal', 'bottom', '底对齐']]
      if (multi) return h('div', { className: 'snx-ab', style: { left, top } },
        h('span', { className: 'snx-ab-tag' }, '已选 ' + multi.length + ' 张'),
        MULTI_ALIGNS.map(([icn, mode, tip]) => h('button', { key: mode, title: tip, disabled: busy, onClick: actM(() => alignSel(mode)) }, ic(icn, 14))),
        h('button', { title: '水平等距分布', disabled: busy, onClick: actM(() => alignSel('dist-h')) }, ic('align-horizontal-distribute-center', 14)),
        h('button', { title: '垂直等距分布', disabled: busy, onClick: actM(() => alignSel('dist-v')) }, ic('align-vertical-distribute-center', 14)),
        h('button', { title: '成组：成员拖拽/变换时一起移动', disabled: busy, onClick: actM(() => groupSel()) }, ic('group'), ' 成组'),
        multi.some((n) => n.groupId) ? h('button', { title: '解组：取消一起移动', disabled: busy, onClick: actM(() => ungroupSel()) }, ic('ungroup'), ' 解组') : null,
        h('button', { title: '删除（锁定节点会跳过）', className: 'warn', disabled: busy, onClick: actM(() => store.removeSelected()) }, ic('trash-2')),
      )
      // v10：变化幅度 → 提示词强度词（SenseNova 无 denoise，用措辞近似）
      const ampSuffix = (amp) => amp <= 30 ? '，轻微变化，保持构图与色调基本不变'
        : amp <= 60 ? '，生成这张图的变化版本，保持主体与风格'
          : '，大胆变化构图与配色，保留主体特征'
      const enhancePrompt = (q, wm) => `Enhance this image to ${q === '4k' ? 'ultra-clear 4K' : 'clear 2K'} quality, increase sharpness and detail${wm ? ', remove any watermark text without leaving artifacts' : ''}, keep all original elements, composition, colors, lighting and style exactly unchanged.`
      const bgName = (hex) => hex.toLowerCase() === '#ffffff' ? '纯白色' : hex.toLowerCase() === '#111111' ? '纯黑色' : `纯色（${hex}）`
      const doVariant = (n) => {
        setBusy(true); setFly(null)
        const base = n.prompt || '生成这张图的变化版本，保持风格与构图'
        genToCanvas(engineRef.current, {
          prompt: base + ampSuffix(vAmp),
          reference: n.src, size: n.params && n.params.size ? n.params.size : sizeForAspect(n.w, n.h),
          model: (n.params && n.params.model) || '', anchorNode: n, n: vCount,
          seed: vSeed && n.params && typeof n.params.seed === 'number' ? n.params.seed : undefined,
        }).finally(() => setBusy(false))
      }
      // P1-7：增强对齐 genToCanvas 管线——先落 pending 节点（队列可见/可取消），
      // params 全量随行（模型/档位/去水印/完整增强指令/来源图），完成后 pending→done；
      // 失败 pending→error（不静默消失），取消走 inflightJobs 与生成同链路。
      const doEnhance = async (n) => {
        setBusy(true); setFly(null)
        const id = nid()
        const ep = enhancePrompt(eQ, eWm)
        const srcRef = await persistRef(n.src)
        store.pushUndo()
        store.doc.nodes.push({
          id, type: 'image', status: 'pending', src: '', parentId: n.id,
          x: n.x + n.w + 60, y: n.y, w: 480, h: 480,
          prompt: '[增强·' + eQ.toUpperCase() + '] ' + (n.prompt || ''),
          params: {
            model: (n.params && n.params.model) || genPrefs.model || '',
            quality: eQ, watermark: eWm, enhancePrompt: ep,
            reference: srcRef, upscale: eQ === '4k' ? 2 : 1.5,
          }, ts: Date.now(), _queuedAt: Date.now(),
        })
        store.emit(); autosave()
        const ac = new AbortController()
        inflightJobs.set(id, ac)
        try {
          const r = await post('/api/sensenova/enhance', { image: n.src, model: (n.params && n.params.model) || undefined, prompt: ep }, ac.signal)
          if (isCancelled(id)) { inflightJobs.delete(id); return }
          if (!r.ok || !r.image) throw new Error(r.error || '增强失败')
          const value = r.image.kind === 'base64' ? 'data:image/png;base64,' + r.image.value : r.image.value
          // P2-9：落盘失败且返回图过大 → 拒收（走 catch 转失败态），巨型 dataURL 不进文档
          if (overInlineLimit(r.image.kind, value)) {
            throw new Error('返回图 ' + (value.length / 1024 / 1024).toFixed(1) + 'MB 过大且落盘失败，已拒收以免撑爆画布文档')
          }
          const im = await loadImg(value)
          const fit = nodeFit(im, 480)
          store.updateNode(id, { status: 'done', src: value, w: fit.w, h: fit.h, error: '', errMsg: '', ts: Date.now() })
        } catch (e) {
          const aborted = !!(e && (e.name === 'AbortError' || /abort/i.test(String((e && e.message) || e))))
          if (aborted || isCancelled(id)) store.updateNode(id, { status: 'error', error: '用户取消', errMsg: '用户取消' })
          else {
            store.updateNode(id, { status: 'error', error: String((e && e.message) || e).slice(0, 200) })
            notify('增强失败：' + String((e && e.message) || e))
          }
        } finally {
          if (inflightJobs.get(id) === ac) inflightJobs.delete(id)
          setBusy(false)
        }
      }
      const doCutout = (n) => {
        setBusy(true); setFly(null)
        genToCanvas(engineRef.current, {
          prompt: `抠图：完全去除背景，只保留画面主体；背景替换为${bgName(cBg)}，主体边缘干净利落，不要裁切或变形主体。`,
          reference: n.src,
          size: (n.params && n.params.size) ? n.params.size : sizeForAspect(n.w, n.h),
          model: (n.params && n.params.model) || '', anchorNode: n, n: 1,
        }).finally(() => setBusy(false))
      }
      return h('div', { className: 'snx-ab', style: { left, top } },
        h('button', {
          title: '以这张图为参考再生成变化版本（张数/幅度/种子可调）', disabled: busy,
          onClick: () => setFly(fly === 'variant' ? null : 'variant'),
          style: fly === 'variant' ? { background: 'color-mix(in srgb,var(--snx-accent) 18%,transparent)', color: 'var(--snx-accent)' } : null,
        }, ic('shuffle'), ' 变体'),
        h('button', {
          title: '清晰化增强（档位/去水印可调）', disabled: busy,
          onClick: () => setFly(fly === 'enhance' ? null : 'enhance'),
          style: fly === 'enhance' ? { background: 'color-mix(in srgb,var(--snx-accent) 18%,transparent)', color: 'var(--snx-accent)' } : null,
        }, ic('sparkles'), ' 增强'),
        h('button', { title: '画笔标注局部重绘', disabled: busy, onClick: act(onInpaint) }, ic('brush'), ' 重绘'),
        h('button', { title: '消除笔：涂抹即删（预填清除指令，可改）', disabled: busy, onClick: act(onErase) }, ic('eraser'), ' 消除'),
        h('button', { title: '一键去背景（背景色可调）', disabled: busy,
          onClick: () => setFly(fly === 'cutout' ? null : 'cutout'),
          style: fly === 'cutout' ? { background: 'color-mix(in srgb,var(--snx-accent) 18%,transparent)', color: 'var(--snx-accent)' } : null,
        }, ic('scissors'), ' 抠图'),
        h('button', { title: '扩展画面（outpaint）', disabled: busy, onClick: act(onOutpaint) }, ic('expand'), ' 扩图'),
        h('button', {
          title: '把这张图和画布上下文发进当前会话，问 agent', disabled: busy,
          onClick: act((n) => {
            setBusy(true)
            askAgent(
              canvasContextText(n) + '\n请基于附图给出意见，或等我提出具体修改要求。',
              n.src,
            )
              .then(() => {
                try { if (bridge && bridge.sessions && bridge.sessions.open) bridge.sessions.open(currentSessionId()) } catch { }
                notify('已发送到会话，切回聊天看 agent 回复')
              })
              .catch((e) => notify('发送失败：' + String((e && e.message) || e)))
              .finally(() => setBusy(false))
          }),
        }, ic('message-circle'), ' 问'),
        h('button', {
          title: '下载原图', disabled: busy,
          onClick: act((n) => {
            const a = document.createElement('a')
            a.href = n.src; a.download = (n.prompt || 'sensenova').slice(0, 30).replace(/[\\/:*?"<>|]/g, '') + '.png'
            a.target = '_blank'; a.click()
          }),
        }, ic('download')),
        h('button', { title: '删除', className: 'warn', disabled: busy, onClick: act(() => store.removeSelected()) }, ic('trash-2')),
        // v10：动作参数飞出（对齐 InvokeAI ToolStripFlyout）
        fly === 'variant' ? h('div', { className: 'snx-flyout', style: { left: 4, top: 'calc(100% + 6px)' }, onClick: (e) => e.stopPropagation() },
          h('h4', null, ic('shuffle'), '变体参数'),
          h('div', { className: 'snx-frow' },
            h('label', null, '张数'),
            h('div', { className: 'snx-seg2' },
              [1, 2, 4].map((c) => h('button', { key: c, type: 'button', className: vCount === c ? 'on' : '', onClick: () => setVCount(c) }, c)),
            ),
          ),
          h('div', { className: 'snx-frow' },
            h('label', null, '变化幅度'),
            h('input', { type: 'range', min: 10, max: 90, value: vAmp, onChange: (e) => setVAmp(parseInt(e.target.value, 10)) }),
            h('span', { className: 'val' }, vAmp + '%'),
          ),
          h('div', { className: 'snx-swrow' }, '复用原图种子',
            h('button', { type: 'button', className: 'snx-sw' + (vSeed ? ' on' : ''), onClick: () => setVSeed(!vSeed), 'aria-checked': !!vSeed, role: 'switch' }),
          ),
          h('div', { style: { marginTop: '10px' } },
            h('button', { type: 'button', className: 'snx-lb-adj-save', style: { width: '100%' }, disabled: busy, onClick: () => doVariant(node) },
              ic('wand-sparkles'), '生成 ' + vCount + ' 张变体'),
          ),
        ) : null,
        fly === 'enhance' ? h('div', { className: 'snx-flyout', style: { left: 4, top: 'calc(100% + 6px)' }, onClick: (e) => e.stopPropagation() },
          h('h4', null, ic('sparkles'), '增强参数'),
          h('div', { className: 'snx-frow' },
            h('label', null, '档位'),
            h('div', { className: 'snx-seg2' },
              h('button', { type: 'button', className: eQ === '2k' ? 'on' : '', onClick: () => setEQ('2k') }, '2K'),
              h('button', { type: 'button', className: eQ === '4k' ? 'on' : '', onClick: () => setEQ('4k') }, '4K'),
            ),
            h('div', { className: 'snx-swrow', style: { marginLeft: 'auto' } }, '去水印',
              h('button', { type: 'button', className: 'snx-sw' + (eWm ? ' on' : ''), onClick: () => setEWm(!eWm), 'aria-checked': !!eWm, role: 'switch' }),
            ),
          ),
          h('div', { style: { marginTop: '10px' } },
            h('button', { type: 'button', className: 'snx-lb-adj-save', style: { width: '100%' }, disabled: busy, onClick: () => doEnhance(node) },
              ic('sparkles'), '开始增强'),
          ),
        ) : null,
        fly === 'cutout' ? h('div', { className: 'snx-flyout', style: { left: 4, top: 'calc(100% + 6px)' }, onClick: (e) => e.stopPropagation() },
          h('h4', null, ic('scissors'), '抠图 · 背景色'),
          h('div', { className: 'snx-frow' },
            h('label', null, '背景'),
            h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } },
              h('button', { type: 'button', className: 'snx-sw', style: { background: '#ffffff', outline: cBg === '#ffffff' ? '2px solid var(--snx-accent)' : 'none', outlineOffset: '1px' }, onClick: () => setCBg('#ffffff'), 'aria-label': '白色背景' }),
              h('button', { type: 'button', className: 'snx-sw', style: { background: '#111111', outline: cBg === '#111111' ? '2px solid var(--snx-accent)' : 'none', outlineOffset: '1px' }, onClick: () => setCBg('#111111'), 'aria-label': '黑色背景' }),
              h('input', { type: 'color', value: cBg, onChange: (e) => setCBg(e.target.value), style: { width: '24px', height: '24px', border: '1px solid var(--dsw-alias-border-l2,#ffffff1f)', borderRadius: '6px', background: 'none', padding: '1px', cursor: 'pointer' } }),
            ),
          ),
          h('div', { style: { marginTop: '10px' } },
            h('button', { type: 'button', className: 'snx-lb-adj-save', style: { width: '100%' }, disabled: busy, onClick: () => doCutout(node) },
              ic('scissors'), '开始抠图'),
          ),
        ) : null,
      )
    }

    // ——— v10：pending 节点悬浮层（HTML 转圈，跟随相机变换）———
    // P1-11：覆盖 pending+running 两态；ETA 不再拍脑袋写"20-60 秒"，显示真实已耗时秒数
    // （_startedAt=真正开跑时刻，排队等待一并计入 ts 起算），每秒自更新。
    // ——— SPEC-18 四：画布 minimap（右下角 2D canvas，有意不用第二 Konva stage）———
    // 按状态着色画节点矩形 + 视口矩形；点击/拖拽 = 把该点带到视口中心。重绘双通道：
    // store.subscribe（emit 与 emitLight 都通知，节点增删/移动）+ engine.onViewChange（相机/尺寸）。
    // 隐藏态记忆在 localStorage snxMinimapOff（会话级偏好）。
    function Minimap({ engineRef }) {
      const ref = useRef(null)
      const [hidden, setHidden] = useState(() => { try { return localStorage.getItem('snxMinimapOff') === '1' } catch { return false } })
      const [narrow, setNarrow] = useState(false)   // 容器过窄时整个隐藏（宽度回归:窄面板不再出界）
      const geoRef = useRef(null)   // 最近一次绘制的世界→小地图映射（导航换算用）
      const roRef = useRef(null)
      useEffect(() => {
        let raf = 0
        const draw = () => {
          cancelAnimationFrame(raf)
          raf = requestAnimationFrame(() => {
            const cv = ref.current
            const eng = engineRef.current
            if (!cv || !eng || !eng.wrapEl) return
            // 引擎晚于本组件挂载(React 子 effect 先跑)——首次拿到引擎时懒挂尺寸观察,narrow 检测才成立
            if (!roRef.current) {
              const wrap = eng.wrapEl
              roRef.current = new ResizeObserver(() => { draw(); setNarrow(wrap.clientWidth < 560) })
              roRef.current.observe(wrap)
              setNarrow(wrap.clientWidth < 560)
            }
            const ctx = cv.getContext('2d')
            if (!ctx) return
            const W = cv.width, H = cv.height
            ctx.clearRect(0, 0, W, H)
            const ns = store.doc.nodes.filter((n) => !n.hidden && (n.status === 'done' || n.status === 'pending' || n.status === 'running' || n.status === 'error'))
            if (!ns.length) { geoRef.current = null; return }
            let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity
            for (const n of ns) { bx0 = Math.min(bx0, n.x); by0 = Math.min(by0, n.y); bx1 = Math.max(bx1, n.x + n.w); by1 = Math.max(by1, n.y + n.h) }
            const pad = Math.max(bx1 - bx0, by1 - by0, 1) * 0.08
            bx0 -= pad; by0 -= pad; bx1 += pad; by1 += pad
            const s = Math.min(W / (bx1 - bx0), H / (by1 - by0))
            const ox = (W - (bx1 - bx0) * s) / 2, oy = (H - (by1 - by0) * s) / 2
            geoRef.current = { bx0, by0, s, ox, oy }
            for (const n of ns) {
              // v18.3:中性灰填充——白色在浅色主题下与底同色隐形(用户复核实抓);蓝/红状态色深浅底均可见
              ctx.fillStyle = n.status === 'done' ? 'rgba(127,127,128,.55)'
                : n.status === 'error' ? 'rgba(220,70,70,.6)'
                  : 'rgba(59,130,246,.55)'   // pending/running 同色：都是进行中
              ctx.fillRect(ox + (n.x - bx0) * s, oy + (n.y - by0) * s, Math.max(2, n.w * s), Math.max(2, n.h * s))
            }
            // 视口矩形（相机反算 wrap 尺寸）
            const c = store.doc.camera
            const cs = c.scale || 1
            const vw = eng.wrapEl.clientWidth / cs, vh = eng.wrapEl.clientHeight / cs
            const vx = -(c.x || 0) / cs, vy = -(c.y || 0) / cs
            ctx.strokeStyle = 'rgba(37,99,235,.9)'   // v18.3:加深,浅底可辨
            ctx.lineWidth = 1.5
            ctx.strokeRect(ox + (vx - bx0) * s, oy + (vy - by0) * s, vw * s, vh * s)
          })
        }
        draw()
        const unSub = store.subscribe(draw)
        const eng0 = engineRef.current
        const unView = eng0 && eng0.onViewChange ? eng0.onViewChange(draw) : null
        return () => { cancelAnimationFrame(raf); unSub(); if (unView) unView(); if (roRef.current) { roRef.current.disconnect(); roRef.current = null } }
      }, [hidden])
      if (hidden || narrow) return narrow ? null : h('button', {
        className: 'snx-minimap-reopen', type: 'button',
        title: '显示小地图',
        onClick: () => { setHidden(false); try { localStorage.removeItem('snxMinimapOff') } catch { } },
      }, ic('map', 14))
      const nav = (e) => {
        const cv = ref.current
        const eng = engineRef.current
        const g = geoRef.current
        if (!cv || !eng || !eng.wrapEl || !g) return
        const r = cv.getBoundingClientRect()
        const wx = (e.clientX - r.left - g.ox) / g.s + g.bx0
        const wy = (e.clientY - r.top - g.oy) / g.s + g.by0
        const c = store.doc.camera
        const cs = c.scale || 1
        c.x = eng.wrapEl.clientWidth / 2 - wx * cs
        c.y = eng.wrapEl.clientHeight / 2 - wy * cs
        eng.applyCamera(); eng.drawEdges(); autosave()
      }
      return h('div', { className: 'snx-minimap' },
        h('canvas', {
          ref, width: 168, height: 116, className: 'snx-minimap-cv',
          onPointerDown: (e) => { try { e.currentTarget.setPointerCapture(e.pointerId) } catch { } nav(e) },
          onPointerMove: (e) => { if (e.buttons & 1) nav(e) },
        }),
        h('button', {
          className: 'snx-minimap-x', type: 'button', title: '隐藏小地图',
          onClick: () => { setHidden(true); try { localStorage.setItem('snxMinimapOff', '1') } catch { } },
        }, ic('x', 11)),
      )
    }

    function PendingOverlay({ engineRef }) {
      const wrapEl = engineRef.current ? engineRef.current.wrapEl : null
      const pend = store.doc.nodes.filter((n) => n.status === 'pending' || n.status === 'running')
      const [, tickT] = useState(0)
      // SPEC-18 三：本地无样本时服务端统计兜底（与 SnxToolPending 同源）
      const [srvEst, setSrvEst] = useState(0)
      useEffect(() => {
        if (!pend.length) return
        const t = setInterval(() => tickT((x) => x + 1), 1000)
        return () => clearInterval(t)
      }, [pend.length])
      useEffect(() => {
        if (snxAvgGenDurSec() > 0) return
        let alive = true
        fetch('/api/sensenova/stats').then((r) => r.json()).then((j) => {
          if (alive && j && j.ok && Number(j.avgSec) > 0) setSrvEst(Math.round(Number(j.avgSec)))
        }).catch(() => { })
        return () => { alive = false }
      }, [])
      if (!wrapEl || !pend.length) return null
      const c = store.doc.camera
      // SPEC-16 一（顺手项）：工作台 pending 悬浮层同加「预计 ~Xs」，数据源与对话卡同一份样本
      const est = snxAvgGenDurSec() || srvEst
      return h('div', null, pend.map((n) => {
        const sx = n.x * c.scale + c.x
        const sy = n.y * c.scale + c.y
        const startedAt = n._startedAt || n.ts || Date.now()
        const elapsed = Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
        const label = (n.params && n.params.enhancePrompt) ? '增强中'
          : (n.params && n.params.upscale) ? '重绘增强中'
            : n.status === 'running' ? '生成中' : '排队中'
        return h('div', { className: 'snx-pending-ov', key: n.id, style: { left: sx, top: sy, width: Math.max(40, n.w * c.scale), height: Math.max(40, n.h * c.scale) } },
          h('div', { className: 'ring' }),
          h('span', { className: 'txt' }, label + ' · ' + elapsed + 's' + (est > 0 ? ' · 预计 ~' + est + 's' : '')),
        )
      }))
    }

    // ——— 扩图比例弹层 ———
    function RatioPopup({ at, onPick, onClose }) {
      useEffect(() => {
        const close = () => onClose()
        window.addEventListener('click', close)
        return () => window.removeEventListener('click', close)
      })
      if (!at) return null
      const ratios = [['1:1', 1], ['3:4', 0.75], ['4:3', 4 / 3], ['16:9', 16 / 9], ['9:16', 9 / 16]]
      return h('div', { className: 'snx-ratio', style: { left: at.x, top: at.y } },
        ratios.map(([label, r]) => h('button', {
          key: label, title: '扩展到 ' + label,
          onClick: (e) => { e.stopPropagation(); onPick(r) },
        }, label)))
    }

    // ——— 右键菜单 ———
    // v11.2：照 GalContextMenu 模式 portal 挂 body + 实测尺寸钳到视口（fixed 在 .snx-pro
    // container-type 里会被收编为包含块，portal 后不再被画布容器裁剪）
    function ContextMenu({ menu, engineRef, setMenu, busy, setBusy, onRestoreParams, onExportCanvas, onOpenLightbox, onClearAll,
      notify, onLocateInGallery, onAddCompare, onBatchDownload }) {
      const ref = useRef(null)
      const [pos, setPos] = useState(null)   // null=首帧离屏，测完尺寸再就位防闪跳
      useEffect(() => {
        if (!menu) return
        const close = () => setMenu(null)
        const entry = modalPush(() => close())   // v11.1：画布菜单入模态栈，Esc 归栈顶
        window.addEventListener('click', close)
        window.addEventListener('resize', close)
        return () => { modalPop(entry); window.removeEventListener('click', close); window.removeEventListener('resize', close) }
      }, [menu])
      // 挂载后实测菜单尺寸，钳到视口（portal 降级时钳到 .snx-pro 容器）
      useLayoutEffect(() => {
        const el = ref.current
        if (!menu || !el) return
        const r = el.getBoundingClientRect()
        if (reactDomPortal) {
          setPos({
            x: Math.max(8, Math.min(menu.x, window.innerWidth - r.width - 8)),
            y: Math.max(8, Math.min(menu.y, window.innerHeight - r.height - 8)),
          })
        } else {
          const hr = fixedOffsetHost()
          setPos({
            x: Math.max(8, Math.min(menu.x - hr.left, hr.right - hr.left - r.width - 8)),
            y: Math.max(8, Math.min(menu.y - hr.top, hr.bottom - hr.top - r.height - 8)),
          })
        }
      }, [menu])
      if (!menu) return null
      const target = menu.nodeId ? store.node(menu.nodeId) : null
      const edgeChild = menu.edgeChild ? store.node(menu.edgeChild) : null   // v11.1：右键落在连线上
      const act = (fn) => () => { setMenu(null); fn() }
      const retry = async () => {
        const n = target; if (!n || busy) return
        setBusy(true); setMenu(null)
        store.updateNode(n.id, { status: 'pending', error: '', _queuedAt: Date.now() })   // v12：重试重新计时（队列详情耗时两段）
        const p = n.params || {}
        await runOne(n.id, {
          prompt: n.prompt,
          size: p.size || '2048x2048',
          model: p.model || '',
          reference: p.reference || undefined,
          negative: p.negative || undefined,
          seed: typeof p.seed === 'number' ? p.seed : undefined,
          refs: (Array.isArray(p.refs) ? p.refs : []).filter((r) => r && r.src),
        })
        setBusy(false)
      }
      // ── SPEC-14 ②：菜单补四项的本地实现 ——
      // 复制图片：imageToBlob（工厂闭包内既有 Image→canvas→PNG Blob 管线，灯箱导出同源）
      // → navigator.clipboard.write(ClipboardItem image/png)；不支持位图剪贴板的浏览器如实报错
      const copyNodeImage = async (n) => {
        try {
          if (!navigator.clipboard || typeof navigator.clipboard.write !== 'function' || typeof window.ClipboardItem !== 'function') {
            throw new Error('浏览器不支持位图剪贴板')
          }
          const blob = await imageToBlob(n.src, 'png', 92, null)
          await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })])
          notify && notify('已复制图片到剪贴板')
        } catch (e) {
          notify && notify('复制图片失败：' + String((e && e.message) || e))
        }
      }
      // 提取提示词：复制该图完整提示词（去 💬 前缀，与行级回填同一定义）；走既有 copyTextToClipboard（含降级）
      const copyNodePrompt = (n) => {
        const p = String(n.prompt || '').replace(/^💬\s*/, '')
        if (!p) { notify && notify('这张图没有记录提示词'); return }
        copyTextToClipboard(p).then((ok) => notify && notify(ok ? '已复制完整提示词' : '复制失败：浏览器拒绝了剪贴板访问'))
      }
      return portalToBody(h('div', { className: 'snx-cv-menu', ref,
        style: { left: (pos ? pos.x : -9999) + 'px', top: (pos ? pos.y : -9999) + 'px' } },
        // ── v11.1：连线右键——断开 / 选中子节点 ──
        edgeChild ? h('button', {
          onClick: act(() => {
            store.pushUndo()
            store.updateNode(edgeChild.id, { parentId: null })
            store.emit(); autosave()
          }),
          title: '断开后这张图不再衍生自父图（可 Ctrl+Z 撤销）',
        }, ic('unlink'), ' 断开连线') : null,
        edgeChild ? h('button', {
          onClick: act(() => { store.sel = new Set([edgeChild.id]); if (engineRef.current) engineRef.current.syncTransformer(); store.emitLight() }),
        }, ic('mouse-pointer-click'), ' 选中子节点') : null,
        target && target.status === 'error' ? h('button', { onClick: retry, disabled: busy }, ic('rotate-ccw'), ' 重试生成') : null,
        // v11.2：灯箱打开为主项，「新标签打开」保留为次项（A-P1-5：画布→灯箱链路）
        target && target.status === 'done' ? h('button', { onClick: act(() => onOpenLightbox && onOpenLightbox(target)) }, ic('expand'), ' 灯箱打开') : null,
        target && target.status === 'done' ? h('button', { onClick: act(() => window.open(target.src, '_blank')) }, '新标签打开') : null,
        target && target.status === 'done' ? h('button', {
          onClick: act(() => {
            const a = document.createElement('a')
            a.href = target.src; a.download = (target.prompt || 'sensenova').slice(0, 30).replace(/[\\/:*?"<>|]/g, '') + '.png'
            a.target = '_blank'; a.click()
          }),
        }, ic('download'), ' 下载') : null,
        // ── SPEC-14 ②：单选 done 图补四项（对齐 InvokeAI 右键菜单动作面）──
        target && target.status === 'done' ? h('button', {
          onClick: act(() => onLocateInGallery && onLocateInGallery(target)),
          title: '切到画廊 tab，滚动到这张图并高亮一下',
        }, ic('images'), ' 在画廊中定位') : null,
        target && target.status === 'done' ? h('button', {
          onClick: act(() => onAddCompare && onAddCompare(target)),
          title: '加入对比选择集合（「对比」tab 消费，最多 4 张）',
        }, ic('columns-2'), ' 设为对比') : null,
        target && target.status === 'done' ? h('button', {
          onClick: act(() => copyNodeImage(target)),
          title: '把位图复制到系统剪贴板（PNG）',
        }, ic('clipboard-copy'), ' 复制图片') : null,
        target && target.status === 'done' ? h('button', {
          onClick: act(() => copyNodePrompt(target)),
          title: '复制这张图的完整提示词',
        }, ic('type'), ' 提取提示词') : null,
        target && target.status === 'done' ? h('button', {
          onClick: act(() => onRestoreParams && onRestoreParams(target)),
          title: '把这张图的提示词与全部生成参数回填到生图表单',
        }, ic('corner-right-down'), ' 回填参数') : null,
        target ? h('button', { onClick: act(() => { store.sel = new Set([target.id]); store.duplicateSelected() }) }, ic('copy'), ' 复制') : null,
        // ── P2-7：z 序命令（作用于当前选中集合；文档顺序即 z 序）──
        target ? h('div', { style: { display: 'flex', gap: '3px', padding: '2px 8px' } },
          h('button', { style: { flex: '1' }, title: '置顶', onClick: act(() => zOrderSel('front')) }, ic('chevrons-up', 14)),
          h('button', { style: { flex: '1' }, title: '上移一层', onClick: act(() => zOrderSel('raise')) }, ic('arrow-up', 14)),
          h('button', { style: { flex: '1' }, title: '下移一层', onClick: act(() => zOrderSel('lower')) }, ic('arrow-down', 14)),
          h('button', { style: { flex: '1' }, title: '置底', onClick: act(() => zOrderSel('back')) }, ic('chevrons-down', 14)),
        ) : null,
        h('button', { onClick: act(() => store.removeSelected()), disabled: !target }, ic('trash-2'), ' 删除'),
        // ── 多选：对齐 / 等距分布 / 成组（tldraw 基线；图标为 lucide align 系列）──
        store.sel.size >= 2 ? h('div', { className: 'sep' }) : null,
        store.sel.size >= 2 ? h('div', { style: { display: 'flex', gap: '3px', padding: '2px 8px' } },
          [['align-start-vertical', 'left', '左对齐'], ['align-center-vertical', 'hcenter', '水平居中'], ['align-end-vertical', 'right', '右对齐'],
            ['align-start-horizontal', 'top', '顶对齐'], ['align-center-horizontal', 'vcenter', '垂直居中'], ['align-end-horizontal', 'bottom', '底对齐']].map(([icn, mode, tip]) =>
            h('button', { key: mode, style: { flex: '1' }, title: tip, onClick: act(() => alignSel(mode)) }, ic(icn, 14))),
        ) : null,
        store.sel.size >= 2 ? h('div', { style: { display: 'flex', gap: '3px', padding: '2px 8px' } },
          h('button', { style: { flex: '1' }, title: '水平等距分布', onClick: act(() => alignSel('dist-h')) }, ic('align-horizontal-distribute-center', 14)),
          h('button', { style: { flex: '1' }, title: '垂直等距分布', onClick: act(() => alignSel('dist-v')) }, ic('align-vertical-distribute-center', 14)),
        ) : null,
        store.sel.size >= 2 ? h('button', { onClick: act(() => groupSel()), title: '成组：成员拖拽/变换时一起移动' }, '成组') : null,
        selNodes().some((n) => n.groupId) ? h('button', { onClick: act(() => ungroupSel()), title: '解组：取消一起移动' }, '解组') : null,
        // SPEC-14 ②：多选补「批量下载」——只下完成图，逐张触发（250ms 间隔防拦截），文件名=提示词前 30 字+序号
        store.sel.size >= 2 ? h('button', {
          onClick: act(() => onBatchDownload && onBatchDownload(selNodes().filter((n) => n.status === 'done' && n.src))),
          title: '逐张下载选中的完成图（文件名 = 提示词前 30 字 + 序号）',
        }, ic('download'), ' 批量下载') : null,
        h('div', { className: 'sep' }),
        h('button', { onClick: act(() => engineRef.current && engineRef.current.fit()) }, ic('maximize'), ' 适应画面'),
        h('button', { onClick: act(() => onExportCanvas()), title: '全部可见图按布局合成一张 PNG' }, ic('image'), ' 导出画布 PNG'),
        !target && !edgeChild ? h('button', {
          onClick: act(() => onClearAll && onClearAll()),
        }, ic('trash-2'), ' 清空画布') : null,
      ))
    }

    // ── P1-3：画廊右键菜单（单选/多选两套）──
    // portal 挂 body 防裁剪；外点/resize 关闭；入模态栈，Esc 归栈顶。
    // 单选：灯箱/下载/收藏/移入画板/画布编辑/删除；多选：同样条目但作用于整个多选集合。
    function GalContextMenu({ menu, boards, selIds, onClose, onOpenBoardList, onBackBoardList, onLightbox, onDownload, onFav, onMove, onDelete, onEdit }) {
      const ref = useRef(null)
      const closeRef = useRef(onClose)
      closeRef.current = onClose
      const [pos, setPos] = useState(null)   // null=首帧离屏，定位完成前不闪跳
      useEffect(() => {
        const self = modalPush(() => closeRef.current())
        // v11.2：外点/resize 关闭不再被 ref 门死——菜单隐形（target 失效返回 null）时也必须能关
        const close = (e) => { if (!ref.current || !ref.current.contains(e.target)) closeRef.current() }
        window.addEventListener('mousedown', close)
        window.addEventListener('resize', close)
        return () => {
          modalPop(self)
          window.removeEventListener('mousedown', close)
          window.removeEventListener('resize', close)
        }
      }, [])
      // v11.2：target 失效（节点被删/文档重载）→ 立即关闭，不留隐形活模态（占着 Esc 与外点通道）
      useEffect(() => {
        const t = menu && menu.nodeId ? store.node(menu.nodeId) : null
        if (!t) closeRef.current()
      })
      // 挂载后实测菜单尺寸，钳到视口（portal 降级时钳到 .snx-pro 容器）
      useLayoutEffect(() => {
        const el = ref.current
        if (!el) return
        const r = el.getBoundingClientRect()
        if (reactDomPortal) {
          setPos({
            x: Math.max(8, Math.min(menu.x, window.innerWidth - r.width - 8)),
            y: Math.max(8, Math.min(menu.y, window.innerHeight - r.height - 8)),
          })
        } else {
          const hr = fixedOffsetHost()
          setPos({
            x: Math.max(8, Math.min(menu.x - hr.left, hr.right - hr.left - r.width - 8)),
            y: Math.max(8, Math.min(menu.y - hr.top, hr.bottom - hr.top - r.height - 8)),
          })
        }
      }, [menu])
      if (!menu) return null
      const target = menu.nodeId ? store.node(menu.nodeId) : null
      if (!target) return null
      const multi = selIds.length > 1 && selIds.includes(target.id)
      const ids = multi ? selIds.slice() : [target.id]
      const favOn = !target.favorite
      const mi = (key, icon, label, fn, danger) => h('button', {
        key, type: 'button', className: danger ? 'danger' : '', onClick: fn,
      }, icon ? ic(icon, 14) : null, h('span', null, label))
      const header = menu.boardList
        ? null
        : h('div', { className: 'mh' }, multi
          ? '已选 ' + ids.length + ' 张'
          : ((target.prompt || '').replace(/^💬\s*/, '').slice(0, 26) || '图片'))
      let body
      if (menu.boardList) {
        body = [
          mi('back', 'chevron-left', '选择画板（' + ids.length + ' 张）', onBackBoardList),
          h('div', { key: 'sep0', className: 'sep' }),
          mi('bd-none', 'circle-x', '未分组（移出画板）', () => onMove(ids, 'none')),
        ].concat(boards.map((b) => mi('bd-' + b.id, 'folder-plus', b.name, () => onMove(ids, b.id))))
      } else {
        body = [
          mi('lb', 'expand', '打开灯箱', () => onLightbox(target)),
          mi('dl', 'download', multi ? '下载 ' + ids.length + ' 张' : '下载', () => onDownload(ids)),
          mi('fav', 'star', multi ? (favOn ? '全部收藏' : '全部取消收藏') : (favOn ? '收藏' : '取消收藏'), () => onFav(ids, favOn)),
          mi('mv', 'folder-plus', '移入画板', onOpenBoardList),
          !multi && onEdit ? mi('ed', 'pen-tool', '画布编辑', () => onEdit(target)) : null,
          h('div', { key: 'sep', className: 'sep' }),
          mi('del', 'trash-2', multi ? '删除 ' + ids.length + ' 张' : '删除', () => onDelete(ids), true),
        ].filter(Boolean)
      }
      return portalToBody(h('div', {
        className: 'snx-gal-menu', ref,
        style: { left: (pos ? pos.x : -9999) + 'px', top: (pos ? pos.y : -9999) + 'px' },
      }, header, body))
    }

    // ── P1-14：应用内确认弹窗 SnxConfirm（替代全部原生 confirm）──
    // portal 挂 body 防裁剪；入模态栈（打开时画布快捷键让路，Esc=取消、Enter=确认）；
    // danger 配色确认键。promise 化：Workbench 的 askConfirm(opts) 返回 Promise<boolean|'alt'>。
    // v12：可选 altLabel/altIcon 渲染第三个按钮（中性色）——删画板双按钮
    // 「仅删除画板(保留图)」/「连图一起删除(红)」（InvokeAI DeleteBoardModal 同款）；onAlt resolve 'alt'。
    function SnxConfirm({ title, desc, confirmLabel, cancelLabel, confirmIcon, altLabel, altIcon, onConfirm, onAlt, onCancel }) {
      const cancelRef = useRef(onCancel)
      cancelRef.current = onCancel
      const confirmRef = useRef(onConfirm)
      confirmRef.current = onConfirm
      const altRef = useRef(onAlt)
      altRef.current = onAlt
      useEffect(() => {
        const self = modalPush(() => cancelRef.current())
        const onKey = (e) => {
          if (modalTop() !== self) return
          if (e.key === 'Escape') { e.preventDefault(); cancelRef.current() }   // v11.2：分发器独占 Esc，此分支保留为死代码
          else if (e.key === 'Enter') {
            // v11.2（A-P1-4）：焦点在按钮上时让按钮原生激活（初始焦点在「取消」），
            // 不强转 confirm——Enter 默认=取消，破坏性操作必须显式点击
            const ae = document.activeElement
            if (ae && ae.tagName === 'BUTTON') return
            e.preventDefault(); confirmRef.current()
          }
        }
        window.addEventListener('keydown', onKey)
        return () => { modalPop(self); window.removeEventListener('keydown', onKey) }
      }, [])
      return portalToBody(h('div', { className: 'snx-cfm-backdrop', onClick: onCancel },
        h('div', { className: 'snx-cfm', role: 'alertdialog', 'aria-modal': 'true', onClick: (e) => e.stopPropagation() },
          h('div', { className: 'snx-cfm-t' }, ic('triangle-alert', 16), title),
          h('div', { className: 'snx-cfm-d' }, desc),
          h('div', { className: 'snx-cfm-btns' },
            h('button', { type: 'button', className: 'snx-cfm-b', onClick: () => cancelRef.current(), autoFocus: true }, cancelLabel || '取消'),
            altLabel ? h('button', { type: 'button', className: 'snx-cfm-b', onClick: () => altRef.current() },
              altIcon ? ic(altIcon, 13) : null, altLabel) : null,
            h('button', { type: 'button', className: 'snx-cfm-b danger', onClick: () => confirmRef.current() },
              confirmIcon ? ic(confirmIcon, 13) : null, confirmLabel || '确认'),
          ),
        ),
      ))
    }

    // ——— Phase 2：聊天内生图工具卡片（tool.call.toolview keyed by sensenova_*_image）———
    // v9 对齐 dsh-agnes-multimodal 的做法：MessageImage 几何（240px 适配框、
    // 宽高比钳制 [0.25,4]、不放大）+ 点击全屏灯箱 + 下载。三个生图工具共用一张卡。
    function snxParseResult(block) {
      if (!block || block.kind !== 'tool-result' || block.isError) return null
      const names = ['sensenova_generate_image', 'sensenova_edit_image', 'sensenova_enhance_image']
      if (!block.call || names.indexOf(block.call.name) < 0) return null
      let info = null
      try { info = JSON.parse((block.content || []).map((c) => (c && c.text) || '').join('')) } catch { }
      const url = info && info.result_image
      if (!url) return null
      let prompt = (info && info.prompt) || ''
      let args = null
      try { args = block.call.argsRaw ? JSON.parse(block.call.argsRaw) : null } catch { }
      if (!prompt && args) prompt = args.prompt || ''
      // SPEC-13 ②：卡片动作行（回填参数/同参数重抽）要带原参数——结果 JSON 含 model/size，
      // 缺失时退回工具入参；工具入参与结果都没有 seed（服务端工具定义无此参数），有才带、没有为 null
      return {
        url: String(url), prompt: String(prompt || ''),
        model: String((info && info.model) || (args && args.model) || ''),
        size: String((info && info.size) || (args && args.size) || ''),
        seed: info && typeof info.seed === 'number' ? info.seed : (args && typeof args.seed === 'number' ? args.seed : null),
      }
    }

    // shell MessageImage 的单图盒规则：240px 盒、比例钳制、永不放大
    function snxSingleFit(iw, ih) {
      const natural = iw / ih
      const ratio = Math.min(4, Math.max(0.25, natural))
      const box = ratio >= 1 ? { w: 240, h: 240 / ratio } : { w: 240 * ratio, h: 240 }
      const s = Math.min(1, iw / box.w, ih / box.h)
      return { width: Math.max(1, Math.round(box.w * s)), height: Math.max(1, Math.round(box.h * s)) }
    }

    // P2-5：检查 HTTP 状态与服务端 ok 字段，失败抛错（此前裸 fetch，网络/服务端错误被静默吞掉，
    // 调用方 .then 一律显示「已插入」假成功）
    function snxInsertToCanvas(url, prompt) {
      return fetch('/api/sensenova/canvas/nodes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ src: url, prompt: String(prompt || '') }),
      }).then(async (r) => {
        const body = await r.json().catch(() => ({}))
        if (!r.ok || body.ok === false) throw new Error(body.error || ('HTTP ' + r.status))
        return body
      })
    }

    // ── SPEC-13 ③：卡片动作行与对话灯箱共用的一组动作（网络与广播只留这一份实现，
    // 两处 UI 各自持有按钮三/四态 state）───
    // 行级回填字段的中文名（toast 用，与工作台 onRestoreField 文案一致）
    function snxFieldLabel(field) {
      return { prompt: '提示词', model: '模型', size: '尺寸', seed: '种子', board: '目标画板' }[field] || '参数'
    }
    // 对话灯箱参数清单行级回填——与工作台灯箱行级回填（Workbench onRestoreField）同语义：
    // 只带对应字段的 detail 广播 snx:restoreParams，GenForm 侧只覆盖到场字段、不动其余表单项；
    // genPrefs 先写兜底冷启动（工作台没开过时广播无人接，GenForm 首帧 useState(genPrefs.*) 即见）。
    // 停留在灯箱（行高亮 flash 即确认），不跳工作台——与 v12 工作台行级回填「停留」行为一致
    function snxRestoreField(field, val) {
      const detail = {}
      if (field === 'prompt') detail.prompt = String(val || '')
      else if (field === 'model') detail.model = String(val || '')
      else if (field === 'size') detail.size = String(val || '')
      else if (field === 'seed') detail.seed = val
      else if (field === 'board') detail.board = String(val || '')
      if (detail.prompt !== undefined) genPrefs.prompt = detail.prompt
      if (detail.model !== undefined) genPrefs.model = detail.model
      if (detail.size !== undefined) genPrefs.size = detail.size
      if (detail.seed !== undefined) genPrefs.seed = detail.seed
      // v15.1：画板行级回填——写 genPrefs.targetBoard 且脱离跟随画廊（followBoard 是模块级内存态,
      // 不置 false 则 GenForm 挂载时跟随语义会覆盖刚回填的画板——第五任审计「跨面回填丢画板」根因）
      if (detail.board !== undefined) { genPrefs.targetBoard = detail.board; followBoard = false }
      try { window.dispatchEvent(new CustomEvent('snx:restoreParams', { detail })) } catch { }
      return snxFieldLabel(field)
    }
    // 整套回填（卡片「回填参数」与对话灯箱「整套回填」共用）：全部已解析字段一次填回生图表单
    // 并切到工作台（focusWorkbenchGen），与工作台灯箱「整套回填」同一广播语义
    function snxRestoreAllParams(info, prompt) {
      // 工具入参与结果 JSON 都没有 seed（服务端工具定义无此参数）：卡上没有的种子不谎称回填，
      // 按工作台全量回填同一语义落 -1（=随机），toast 如实注明
      const seed = typeof info.seed === 'number' && info.seed >= 0 ? info.seed : -1
      const detail = { prompt: String(prompt || ''), seed }
      if (info.size) detail.size = String(info.size)
      if (info.model) detail.model = String(info.model)
      // 先写 genPrefs 兜底冷启动（GenForm 首帧 useState(genPrefs.*)），已挂载时 snx:restoreParams 到场字段才覆盖
      genPrefs.prompt = detail.prompt
      if (detail.size) genPrefs.size = detail.size
      if (detail.model) genPrefs.model = detail.model
      genPrefs.seed = seed
      try { window.dispatchEvent(new CustomEvent('snx:restoreParams', { detail })) } catch { }
      focusWorkbenchGen('已回填参数：提示词' + (detail.size ? '/尺寸' : '') + (detail.model ? '/模型' : '') + (seed >= 0 ? '/种子' : '/种子（随机）'))
    }
    // 设为参考图（卡片动作行与对话灯箱动作行共用）：走 snx:setRef 链路
    function snxSetReference(url) {
      const src = String(url || '')
      if (!src) return
      // ≤4 张上限与 GenForm pickRef/uploadRef 同一逻辑；冷启动时 snx:setRef 无人接，
      // 先写 genPrefs.refs 兜底（GenForm 首帧 useState(genPrefs.refs) 即见）；已满 4 张则如实不追加
      const base = (Array.isArray(genPrefs.refs) ? genPrefs.refs : []).filter((r) => r && r.src)
      if (base.length >= 4) { focusWorkbenchGen('已切到生图表单：参考图已满 4 张，未追加'); return }
      genPrefs.refs = base.concat([{ src, role: 'reference', strength: 0.7 }])
      try { window.dispatchEvent(new CustomEvent('snx:setRef', { detail: { src } })) } catch { }
      focusWorkbenchGen('已设为参考图，已切到生图表单')
    }
    // 同参数重抽（卡片动作行与对话灯箱动作行共用）：参照 doEnhance 直连模式，
    // POST /api/sensenova/generate 用该卡原参数；工具卡未记录种子 → 不带 seed，服务端按随机种子
    // 重抽（同参数 = 提示词/尺寸/模型）。done 节点落工作台画布文档：走服务端追加路由（SSE
    // canvas:update 实时刷新），与 agent 生图管线同源；工作台没开过服务端也会先初始化文档再追加。
    // 成功/失败的 toast 在此统一发，再 rethrow 让调用方归位各自按钮 state。
    // SPEC-17 二：opts 可选 { okMsg, errPrefix }——灯箱「同种子重生成」共用本直连 POST，
    // 但 toast 文案要如实区分（种子锁定 vs 随机）；不传 opts 时维持原「同参数重抽」文案。
    function snxRerollDirect(info, prompt, opts) {
      const okMsg = (opts && opts.okMsg) || '已按同参数重抽，结果见工作台'
      const errPrefix = (opts && opts.errPrefix) || '同参数重抽失败'
      const body = { prompt: String(prompt || '') }
      if (info.size) body.size = String(info.size)
      if (info.model) body.model = String(info.model)
      if (typeof info.seed === 'number' && info.seed >= 0) body.seed = info.seed
      return snxGenPost(body)
        .then((r) => {
          if (!r.ok || !r.image || !r.image.value) throw new Error(r.error || '服务端未返回图片')
          const value = r.image.kind === 'base64' ? 'data:image/png;base64,' + r.image.value : r.image.value
          if (overInlineLimit(r.image.kind, value)) throw new Error('返回图过大且落盘失败，已拒收以免撑爆画布文档')
          return fetch('/api/sensenova/canvas/nodes', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ src: value, prompt: '💬 ' + String(prompt || '').slice(0, 120) }),
          }).then(async (r2) => {
            const b2 = await r2.json().catch(() => ({}))
            if (!r2.ok || b2.ok === false) throw new Error(b2.error || ('HTTP ' + r2.status))
          })
        })
        .then(() => { toastBus(okMsg) })
        .catch((e) => { toastBus(errPrefix + '：' + String((e && e.message) || e)); throw e })
    }

    // ── SPEC-13 ②：对话卡 → 工作台 跨树通道（卡片在工作台 React 树之外，全部走 window 事件总线）───
    // 打开工作台 tab 的宿主通道（ctx.sidebarRight.openTab，退路 layout.openRightbar——与侧栏底部
    // 「生图」按钮同一套）只在 apply(ctx) 闭包里，apply 时注入成模块级函数给卡片用。
    let openWbTab = null
    // 冷启动竞态兜底：openTab 拉起 tab 后 Workbench/GenForm 尚未挂载，此刻广播的 snx:genFocus /
    // snx:restoreParams / snx:setRef / snx:notify 会无人接听。pendingGenFocus 由 Workbench 挂载时
    // 消费（切生图视图 + 补发 toast）；已挂载时事件监听器当场消费并清空，两路只走其一。
    let pendingGenFocus = null   // { gen: bool, toast: string }
    function focusWorkbenchGen(toastMsg) {
      pendingGenFocus = { gen: true, toast: String(toastMsg || '') }
      try { window.dispatchEvent(new CustomEvent('snx:genFocus', { detail: { toast: pendingGenFocus.toast } })) } catch { }
      if (typeof openWbTab === 'function') { try { openWbTab() } catch { } }
    }
    // 提示词全文复制：navigator.clipboard 失败降级为「选中弹层复制」（隐藏 textarea + 选区 + execCommand）
    function copyTextToClipboard(text) {
      const s = String(text || '')
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        return navigator.clipboard.writeText(s).then(() => true).catch(() => copyTextViaSelection(s))
      }
      return window.Promise.resolve(copyTextViaSelection(s))
    }
    function copyTextViaSelection(text) {
      try {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.setAttribute('readonly', '')
        ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0'
        document.body.appendChild(ta)
        ta.select()
        ta.setSelectionRange(0, text.length)
        const ok = document.execCommand('copy')
        document.body.removeChild(ta)
        return ok
      } catch { return false }
    }

    // SPEC-13 ③：会话内全屏灯箱升级——左图右「参数清单」：右栏复用工作台灯箱行级回填组件与样式
    // （.snx-lb-rows/.snx-lb-row/.rb 行级单键回填 + snx-row-flash 行高亮，行为一致：停留灯箱、
    // 只覆盖该字段），头部「整套回填」，底部动作行 设为参考图/同参数重抽/下载/插入画布（与卡片
    // 动作行共用 snxSetReference/snxRerollDirect/snxInsertToCanvas）。参数清单行集如实：
    // snxParseResult 解析不到的行不渲染（不造假行）——prompt/model/size 走结果 JSON+工具入参回退
    // 链，seed 只有结果/入参里确实是数字才出行；一行都没有时右栏只剩动作行、不出「参数清单」头。
    // 浮层 portal 挂 body（对话轴浮层纪律，同 SnxConfirm）
    function TvLightbox({ info, onClose }) {
      // P2-5：插入三态 idle/ok/err——失败不再假显「已插入」，按钮变失败态、再点即重试
      const [insState, setInsState] = useState('idle')
      // SPEC-13 ②：同参数重抽四态防连点（idle/busy/ok/err，与卡片动作行同一套词汇）
      const [reroll, setReroll] = useState('idle')
      // v12 行级回填同款行高亮：flash {field,n}，n 递增换行 key 强制重放动画
      const [flash, setFlash] = useState(null)
      const flashSeq = useRef(0)
      useEffect(() => {
        const fn = (e) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', fn)
        return () => window.removeEventListener('keydown', fn)
      }, [onClose])
      const url = info && info.url
      const prompt = (info && info.prompt) || ''
      if (!url) return null
      const plRows = [
        prompt ? { k: 'prompt', label: '提示词', val: prompt, raw: prompt, btn: true, wrap: true } : null,
        info.model ? { k: 'model', label: '模型', val: String(info.model), raw: String(info.model), btn: true, mono: true } : null,
        // 展示用 ×（与工作台尺寸行一致），回填用原始 2048x1152 形态（raw）
        info.size ? { k: 'size', label: '尺寸', val: String(info.size).replace('x', '×'), raw: String(info.size), btn: true, mono: true } : null,
        typeof info.seed === 'number' && info.seed >= 0 ? { k: 'seed', label: '种子', val: String(info.seed), raw: info.seed, btn: true, mono: true } : null,
      ].filter(Boolean)
      const doField = (r) => {
        const label = snxRestoreField(r.k, r.raw)
        flashSeq.current += 1
        setFlash({ field: r.k, n: flashSeq.current })
        // 停留灯箱不跳工作台（行高亮即确认）；广播无人接时 genPrefs 已兜底，故注明「打开生图表单可见」
        toastBus('已回填' + label + '，打开工作台生图表单可见')
      }
      return portalToBody(h('div', { className: 'snx-tvlb', onClick: onClose },
        h('button', { className: 'snx-tvlb-x', title: '关闭（Esc）', onClick: onClose }, ic('x', 20)),
        h('div', { className: 'snx-tvlb-frame', onClick: (e) => e.stopPropagation() },
          h('div', { className: 'snx-tvlb-stage' },
            h('img', { src: url, alt: '' }),
          ),
          h('aside', { className: 'snx-tvlb-side' },
            plRows.length ? h('div', { className: 'snx-tvlb-h' },
              h('span', { className: 't' }, '参数清单'),
              h('button', {
                type: 'button', className: 'snx-lb-plist-go',
                title: '整套回填：已解析的 提示词/尺寸/模型/种子 一次填回生图表单，并切到工作台',
                onClick: () => { snxRestoreAllParams(info, prompt); onClose() },
              }, ic('wand-sparkles', 12), '整套回填'),
            ) : null,
            plRows.length ? h('div', { className: 'snx-lb-rows' },
              plRows.map((r) => {
                const flashing = flash && flash.field === r.k
                return h('div', {
                  key: r.k + (flashing ? ':' + flash.n : ''),
                  className: 'snx-lb-row' + (flashing ? ' fl' : ''),
                  onAnimationEnd: () => setFlash((f) => (f && f.field === r.k ? null : f)),
                },
                  h('span', { className: 'rl' }, r.label),
                  h('span', { className: r.wrap ? 'rv wrap' : r.mono ? 'rv mono' : 'rv', title: r.wrap ? undefined : r.val }, r.val),
                  h('button', {
                    type: 'button', className: 'rb',
                    title: '只回填「' + r.label + '」到生图表单，其余不动',
                    onClick: () => doField(r),
                  }, ic('corner-right-down', 13)),
                )
              }),
            ) : null,
            h('div', { className: 'snx-tvlb-acts' },
              h('button', {
                type: 'button',
                title: '把这张图加进生图表单参考图区（上限 4 张），并切到工作台生图',
                onClick: () => { snxSetReference(url); onClose() },
              }, ic('image-plus'), ' 设为参考图'),
              h('button', {
                type: 'button',
                disabled: reroll === 'busy',
                className: reroll === 'err' ? 'snx-ins-btn err' : undefined,
                title: reroll === 'busy' ? '正在按同参数重抽…' : reroll === 'err' ? '重抽失败，点击重试' : '按该图 提示词/尺寸/模型 再抽一张（种子随机），结果落工作台画布',
                onClick: () => {
                  if (reroll === 'busy') return
                  setReroll('busy')
                  snxRerollDirect(info, prompt)
                    .then(() => setReroll('ok'))
                    .catch(() => setReroll('err'))
                },
              },
                reroll === 'busy' ? [h('span', { className: 'snx-spinring', key: 'r' }), ' 重抽中']
                  : reroll === 'ok' ? [ic('check', 12), ' 已重抽']
                    : reroll === 'err' ? [ic('triangle-alert', 12), ' 重抽失败，点击重试']
                      : [ic('dices'), ' 同参数重抽']),
              h('button', {
                type: 'button',
                onClick: () => { const a = document.createElement('a'); a.href = url; a.download = 'sensenova.png'; a.click() },
              }, ic('download'), ' 下载'),
              h('button', {
                type: 'button',
                className: insState === 'err' ? 'snx-ins-btn err' : undefined,
                onClick: () => {
                  setInsState('idle')
                  snxInsertToCanvas(url, prompt)
                    .then(() => setInsState('ok'))
                    .catch(() => setInsState('err'))
                },
                title: insState === 'err' ? '插入失败，点击重试' : '追加到生图工作台画布',
              },
                insState === 'ok' ? [ic('check', 12), ' 已插入画布'] : insState === 'err' ? [ic('triangle-alert', 12), ' 插入失败，点击重试'] : [ic('pin'), ' 插入画布']),
            ),
          ),
        ),
      ))
    }

    // SPEC-13 ①：pending 生命感——转圈 + 「已耗时 Ns」实时跳动（setInterval 500ms，卸载即清）。
    // 独立小组件：工具一 settle 整卡被结果替换、本组件卸载，计时器随 useEffect 清理函数回收
    function SnxToolPending() {
      const [sec, setSec] = useState(0)
      // SPEC-18 三：本地无样本时拉服务端统计兜底——对话工具路径在服务端 execute 直调上游、
      // 不经客户端 POST，localStorage 永远没有该路径样本；服务端环形统计（generate 路由+两工具
      // 成功应答墙钟）覆盖全链路。只在挂载时拉一次（生成期间样本不会变化）。
      const [srvEst, setSrvEst] = useState(0)
      useEffect(() => {
        const t0 = Date.now()
        const timer = setInterval(() => setSec(Math.floor((Date.now() - t0) / 1000)), 500)
        return () => clearInterval(timer)
      }, [])
      useEffect(() => {
        if (snxAvgGenDurSec() > 0) return
        let alive = true
        fetch('/api/sensenova/stats').then((r) => r.json()).then((j) => {
          if (alive && j && j.ok && Number(j.avgSec) > 0) setSrvEst(Math.round(Number(j.avgSec)))
        }).catch(() => { })
        return () => { alive = false }
      }, [])
      // SPEC-16 一：「预计 ~Xs」=本地样本均值，缺则服务端统计兜底；两者皆无（全新安装且
      // 服务端也没跑过一次）时不显示预计，只显示已耗时
      const est = snxAvgGenDurSec() || srvEst
      return h('div', { className: 'snx-tv' },
        h('div', { className: 'snx-tv-run snx-tv-wait' },
          h('span', { className: 'ring', 'aria-hidden': true }),
          h('span', null, 'SenseNova 生成中 · 已 ', h('b', null, sec + 's'),
            est > 0 ? ' · 预计 ~' + est + 's' : null),
        ),
        h('div', { className: 'snx-tv-ws' }, '完成后图片直接显示在这里，可回填参数 / 设为参考图 / 同参数重抽'),
      )
    }

    function SnxToolCard(props) {
      const [lb, setLb] = useState(null)   // snxParseResult 结果（url/prompt/model/size/seed）| null，整包传 TvLightbox
      // P2-5：插入三态 idle/ok/err——失败不再假显「已插入画布」，按钮变失败态、再点即重试
      const [insState, setInsState] = useState('idle')
      // SPEC-13 ②：同参数重抽四态防连点（idle/busy/ok/err，与 insState 同一套词汇）
      const [reroll, setReroll] = useState('idle')
      const [fitState, setFitState] = useState('wait') // SPEC-14 ③：卡内 done 态结果图的加载三态（wait/ok/err，须在早退 return 前声明）
      const block = props && props.block
      const settled = block && block.kind === 'tool-result'
      if (!settled) return h(SnxToolPending)
      const info = snxParseResult(block)
      let prompt = (info && info.prompt) || ''
      if (!prompt && block.call && block.call.argsRaw) {
        try { prompt = JSON.parse(block.call.argsRaw).prompt || '' } catch { }
      }
      if (!info) {
        const text = (block.content || []).map((c) => (c && c.text) || '').join('')
        let errMsg = '生成失败或未返回图片'
        try { const j = JSON.parse(text); if (j && j.error) errMsg = '生成失败：' + String(j.error).slice(0, 120) } catch { }
        return h('div', { className: 'snx-tv' }, h('span', { className: 'snx-tv-err' }, errMsg))
      }
      const url = info.url
      // ── SPEC-13 ②：卡片动作行（回填参数/设为参考图/同参数重抽/复制提示词）───
      // 三个动作的实现抽到模块级 snxRestoreAllParams/snxSetReference/snxRerollDirect
      // （SPEC-13 ③ 对话灯箱动作行复用同一份），这里只保留防连点与按钮 state 归位
      const doRestoreParams = () => snxRestoreAllParams(info, prompt)
      const doSetReference = () => snxSetReference(url)
      const doReroll = () => {
        if (reroll === 'busy') return
        setReroll('busy')
        snxRerollDirect(info, prompt)
          .then(() => setReroll('ok'))
          .catch(() => setReroll('err'))
      }
      const doCopyPrompt = () => {
        copyTextToClipboard(prompt).then((ok) => toastBus(ok ? '已复制' : '复制失败：剪贴板不可用，可在灯箱手动选择复制'))
      }
      const fit = h('button', {
        className: 'snx-tv-img', title: '点击查看原图',
        onClick: (e) => { e.stopPropagation(); setLb(info) },
      }, h('img', {
        src: url, alt: '',
        className: fitState === 'ok' ? undefined : (fitState === 'err' ? 'snx-img-err' : 'snx-img-wait'),
        onLoad: (e) => {
          setFitState('ok')
          const im = e.target
          const f = snxSingleFit(im.naturalWidth || 1024, im.naturalHeight || 1024)
          im.style.width = f.width + 'px'; im.style.height = f.height + 'px'
        },
        onError: () => setFitState('err'),
      }))
      return h('div', { className: 'snx-tv' },
        fit,
        h('div', { className: 'snx-tv-row' },
          h('span', { className: 'snx-tv-prompt', title: prompt }, String(prompt || '').slice(0, 48)),
          // SPEC-13 ③：复制钮放截断文本尾部，title 已有全文 hover
          prompt ? h('button', {
            className: 'snx-tv-copy', title: '复制完整提示词',
            onClick: (e) => { e.stopPropagation(); doCopyPrompt() },
          }, ic('clipboard-copy', 12)) : null,
        ),
        h('div', { className: 'snx-tv-btns' },
          h('button', {
            className: 'snx-tv-acc', title: '把该卡 提示词/尺寸/模型/种子 回填到生图表单，并切到工作台生图',
            onClick: (e) => { e.stopPropagation(); doRestoreParams() },
          }, ic('corner-right-down'), ' 回填参数'),
          h('button', {
            title: '把这张图加进生图表单参考图区（上限 4 张），并切到工作台生图',
            onClick: (e) => { e.stopPropagation(); doSetReference() },
          }, ic('image-plus'), ' 设为参考图'),
          h('button', {
            disabled: reroll === 'busy',
            className: reroll === 'err' ? 'snx-ins-btn err' : undefined,
            title: reroll === 'busy' ? '正在按同参数重抽…' : reroll === 'err' ? '重抽失败，点击重试' : '按该卡 提示词/尺寸/模型 再抽一张（种子随机），结果落工作台画布',
            onClick: (e) => { e.stopPropagation(); doReroll() },
          },
            reroll === 'busy' ? [h('span', { className: 'snx-spinring', key: 'r' }), ' 重抽中']
              : reroll === 'ok' ? [ic('check', 12), ' 已重抽']
                : reroll === 'err' ? [ic('triangle-alert', 12), ' 重抽失败，点击重试']
                  : [ic('dices'), ' 同参数重抽']),
          h('button', {
            className: insState === 'err' ? 'snx-ins-btn err' : undefined,
            onClick: (e) => {
              e.stopPropagation()
              setInsState('idle')
              snxInsertToCanvas(url, prompt)
                .then(() => setInsState('ok'))
                .catch(() => setInsState('err'))
            },
            title: insState === 'err' ? '插入失败，点击重试' : '追加到生图工作台画布',
          },
            insState === 'ok' ? [ic('check', 12), ' 已插入画布'] : insState === 'err' ? [ic('triangle-alert', 12), ' 插入失败，点击重试'] : [ic('pin'), ' 插入画布']),
          h('button', {
            onClick: (e) => {
              e.stopPropagation()
              const a = document.createElement('a'); a.href = url; a.download = 'sensenova.png'; a.click()
            },
          }, ic('download'), ' 下载'),
        ),
        lb ? h(TvLightbox, { info: lb, onClose: () => setLb(null) }) : null,
      )
    }

    // ——— v9：回合尾投递（conversation.chat.turnTail）———
    // SPEC-14 调研结论（宿主 0.2.1-alpha.2 源码核对）：turnTail 座位在折叠线以下、不受回合折叠影响——
    // dsh-client-ui-chat/lib/client.js:4356 的 TURN_PROCESS_INDEPENDENT_KINDS 明确含 "turn-tail"，
    // ChatNodeSeat 只对过程成员打 hidden（同文件 4478/4498），官方 ui-deliverables/ui-plan 也注册在这一
    // 座位（dsh-client-ui-deliverables/lib/client.js:2273）。上方工具卡会被收进「已完成,用时 Ns」，本座位不会。
    // 此前审计看到的「尾图 0 高度」实为 img 未加载时无预留尺寸（0×0）——已在 TailImage 用占位框修复。
    function SnxMediaTail(props) {
      const turn = props.turn
      if (!turn || typeof props.useTurnMedia !== 'function') return null
      const nodes = props.useTurnMedia(String(turn.turn))
      const hits = []
      if (Array.isArray(nodes)) {
        for (const n of nodes) {
          const root = n && n.root
          const info = snxParseResult(root)
          if (info) hits.push(info)
        }
      }
      if (!hits.length) return null
      return h('div', { className: 'snx-tail' },
        // SPEC-13 ④：多图时传 idx/total 给 TailImage 渲染 x/N 角标（单图不显示）；
        // 整包 parsed info 传下去，灯箱参数清单才有 model/size/seed 可用
        hits.map((it, i) => h(TailImage, { key: it.url + ':' + i, info: it, idx: i + 1, total: hits.length })),
      )
    }

    // 回合尾里的单图：240px 适配框 + 多图 x/N 角标（SPEC-13 ④，样式对齐 v11 对比角标）+ 点击复用会话灯箱
    // SPEC-14 ①：尾图就是交付物——加载中用 .snx-img-wait 预留占位框（否则 img 未加载完整行 0 高度，
    // 第三方审计把这一幕误报成「宿主折叠吞了尾图」），加载失败给出 .snx-tail-err 文案，不再静默塌陷
    function TailImage({ info, idx, total }) {
      const [lb, setLb] = useState(false)
      const [imgState, setImgState] = useState('wait') // wait/ok/err，与 insState 同一套三态词汇
      const url = info && info.url
      const prompt = (info && info.prompt) || ''
      return h(React.Fragment, null,
        h('button', {
          className: 'snx-tv-img snx-tail-img', title: '点击查看原图',
          onClick: (e) => { e.stopPropagation(); setLb(true) },
        },
          h('img', {
            src: url, alt: '',
            className: imgState === 'ok' ? undefined : (imgState === 'err' ? 'snx-img-err' : 'snx-img-wait'),
            onLoad: (e) => {
              setImgState('ok')
              const im = e.target
              const f = snxSingleFit(im.naturalWidth || 1024, im.naturalHeight || 1024)
              im.style.width = f.width + 'px'; im.style.height = f.height + 'px'
            },
            onError: () => setImgState('err'),
          }),
          imgState === 'err' ? h('span', { className: 'snx-tail-err' }, '图片加载失败') : null,
          total > 1 ? h('span', { className: 'snx-tail-idx' }, (idx || 1) + ' / ' + total) : null,
        ),
        lb ? h(TvLightbox, { info, onClose: () => setLb(false) }) : null,
      )
    }

    // ——— 全屏工作台 ———
    class WBErrorBoundary extends React.Component {
      constructor(p){ super(p); this.state = { err: null } }
      static getDerivedStateFromError(err){ return { err } }
      componentDidCatch(err, info){ console.error('[sensenova-image] Workbench render failed:', err, info) }
      render(){
        if (this.state.err) {
          return h('div', { className: 'snx-cv' },
            h('div', { className: 'snx-cv-top' },
              h('div', { className: 'brand' }, ic('zap'), ' SENSENOVA ', h('b', null, '生图工作台')),
              h('span', { className: 'key no' }, '渲染异常'),
            ),
            h('div', { className: 'snx-cv-main' },
              h('div', { className: 'snx-cv-wrap', style: { display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' } },
                h('pre', { style: { whiteSpace:'pre-wrap', color:'var(--dsw-alias-state-error-primary,#f25a5a)', fontSize:'12px', maxWidth:'90%' } },
                  String((this.state.err && this.state.err.stack) || this.state.err))))
          )
        }
        return this.props.children
      }
    }

    function Workbench() {
      const [open, setOpenState] = useState(isOpen())
      const [ready, setReady] = useState(false)
      const [loadErr, setLoadErr] = useState('')
      const [busy, setBusy] = useState(false)
      const [keyOk, setKeyOk] = useState(null)
      const [mode, setMode] = useState('gen')  // gen | canvas | gallery | settings
      const [selId, setSelId] = useState(null)  // gallery selection
      const [lightbox, setLightbox] = useState(null)  // node | null
      const [fsCanvas, setFsCanvas] = useState(false)  // fullscreen canvas overlay
      const [tab, setTab] = useState('gen')
      const [menu, setMenu] = useState(null)
      const [maskId, setMaskId] = useState(null)
      const [brush, setBrush] = useState(40)  // 笔刷像素
      const [brushOpacity, setBrushOpacity] = useState(80)  // %
      const [brushHardness, setBrushHardness] = useState(70)  // %
      const [brushFeather, setBrushFeather] = useState(30)  // %
      const [brushCursor, setBrushCursor] = useState({ x: -100, y: -100, show: false })
      const [maskPrompt, setMaskPrompt] = useState('')
      const [ratioAt, setRatioAt] = useState(null)   // {x,y,nodeId}
      // P2-2：toast 队列化——多槽不互相覆盖、每条独立计时（手关/超限时同步清旧计时器）、
      // 按严重度着色（ok/err/info，notify 可显式传，缺省按文案推断）、长文案可换行、可手动关闭
      const [toasts, setToasts] = useState([])   // [{id,msg,kind}] kind: 'ok'|'err'|'info'
      const toastSeq = useRef(0)
      const toastTimers = useRef({})
      const dismissToast = (id) => {
        if (toastTimers.current[id]) { clearTimeout(toastTimers.current[id]); delete toastTimers.current[id] }
        setToasts((list) => list.filter((t) => t.id !== id))
      }
      // 消失后/被挤出后清掉残留计时器，防旧计时器误清新 toast
      useEffect(() => {
        const alive = new Set(toasts.map((t) => t.id))
        Object.keys(toastTimers.current).forEach((id) => {
          if (!alive.has(id)) { clearTimeout(toastTimers.current[id]); delete toastTimers.current[id] }
        })
      }, [toasts])
      useEffect(() => () => {   // 卸载时清空全部计时器
        Object.values(toastTimers.current).forEach((t) => clearTimeout(t))
        toastTimers.current = {}
      }, [])
      // P1-13：对比独立选择集合——不再借用/污染画布 store.sel，也不自动抓最后两张
      const [cmpSel, setCmpSel] = useState(() => new Set())
      const [cmpBoard, setCmpBoard] = useState('')            // 对比画廊池画板筛选：'' 全部 / 'none' 未分组 / boardId
      const [, force] = useState(0)
      // 画廊模式的状态提升：renderGalleryMode 是内联函数（非组件），其 hooks 会变成
      // Workbench 的条件性 hooks——首次切画廊时 hook 数变化触发 React #310 整面板崩。
      // 所以这四个 state 必须挂在顶层，renderGalleryMode 里只用别名引用。
      const [galQ, setGalQ] = useState('')
      const [galTag, setGalTag] = useState('')
      const [galSort, setGalSort] = useState('time')
      const [galFav, setGalFav] = useState(false)
      const [galBoard, setGalBoard] = useState('')   // v10：'' 全部 / 'none' 未分组 / boardId
      // SPEC-15 ①：画廊画板筛选镜像进 genPrefs——「跟随画廊」的入板解析读这份模块级镜像。
      // GenForm 只在生图 tab 挂载，画廊 tab 里切筛选时它收不到，必须走这里同步
      useEffect(() => { genPrefs.galBoard = galBoard }, [galBoard])
      const [galBdCreating, setGalBdCreating] = useState(false)
      const [galBdName, setGalBdName] = useState('')
      // P1-3：画廊多选（InvokeAI 点击语义分层）。galSel 与画布 store.sel 解耦，不污染画布/对比选择
      const [galSel, setGalSel] = useState(() => new Set())
      const [galAnchor, setGalAnchor] = useState(null)      // Shift 范围选起点
      const [galMenu, setGalMenu] = useState(null)          // 画廊右键菜单 {x,y,nodeId,boardList}
      // SPEC-14 ②：「在画廊中定位」高亮闪——state 驱动（className 字面量 ' snx-locate' 供静态
      // 门禁 classes 对账；classList.add 扫不到）。800ms 后清 null，与 CSS 动画时长同长
      const [locateId, setLocateId] = useState(null)
      // P1-14：应用内确认弹窗状态（SnxConfirm，promise 化）
      const [cfm, setCfm] = useState(null)   // {title, desc, confirmLabel?, confirmIcon?, resolve}
      const [galDragActive, setGalDragActive] = useState(null)  // 拖拽归类进行中 {count}
      const [galDragOver, setGalDragOver] = useState(null)      // 拖拽悬停的画板 id / 'none' / null
      const galDragRef = useRef(null)
      const galGhostRef = useRef(null)
      const galClickSuppressRef = useRef(false)   // 拖拽结束后吃掉紧跟的 click，避免误选中
      const galVisIdsRef = useRef([])             // 画廊当前可见完成图的有序 id（Shift 范围选基准）
      // SPEC-15 ②：批量变体进行中——按钮 busy 态防连点；ref 兜底 setState 异步窗口内的重入
      const [galVarBusy, setGalVarBusy] = useState(false)
      const galVarBusyRef = useRef(false)
      // SPEC-16 四：批量导出进行中——同批量变体的 busy 态防连点经验
      const [galExpBusy, setGalExpBusy] = useState(false)
      const galExpBusyRef = useRef(false)
      // 设置页：Key 内联配置（renderSettingsMode 是内联函数，状态必须挂在顶层）
      const [keyDraft, setKeyDraft] = useState('')
      const [keyVisible, setKeyVisible] = useState(false)
      const [keySaving, setKeySaving] = useState(false)
      const [keyTesting, setKeyTesting] = useState(false)
      const [pingResult, setPingResult] = useState(null)   // null | {ok, error?, models?}
      const wrapRef = useRef(null)
      const engineRef = useRef(null)
      const maskRef = useRef(null)   // {nodeId, strokes:[], canvas, redraw}
      const notify = (msg, kind) => {
        const text = String(msg || '')
        if (!text) return
        const k = kind || toastKindOf(text)
        const id = ++toastSeq.current
        setToasts((list) => {
          const next = list.concat([{ id, msg: text, kind: k }])
          return next.length > 4 ? next.slice(next.length - 4) : next   // 队列上限 4，超限丢最旧
        })
        toastTimers.current[id] = setTimeout(() => dismissToast(id), 5000)
      }
      // P2-9：模块层（runOne 的 persist 兜底等）通过 snx:notify 投递 toast
      useEffect(() => {
        const onNotify = (e) => { const d = e && e.detail; if (d && d.msg) notify(d.msg, d.kind) }
        window.addEventListener('snx:notify', onNotify)
        return () => window.removeEventListener('snx:notify', onNotify)
      }, [])
      // SPEC-13 ②：对话卡「回填参数/设为参考图」请求切到生图视图（卡片在会话树，走事件总线）。
      // 已挂载时当场消费 pendingGenFocus；冷启动竞态由下方挂载 effect 消费，两路只走其一
      useEffect(() => {
        const onGenFocus = (e) => {
          pendingGenFocus = null
          setLightbox(null); setFsCanvas(false); setMode('gen')
          const d = e && e.detail
          if (d && d.toast) notify(d.toast)
        }
        window.addEventListener('snx:genFocus', onGenFocus)
        return () => window.removeEventListener('snx:genFocus', onGenFocus)
      }, [])
      // SPEC-17 三：画板排序偏好变更（gen form 目标画板下拉末项切换）——画廊画板 chips/批量条移入
      // 下拉/右键菜单板列表/画板筛选下拉等 Workbench 渲染期消费 boardsByRecent() 的地方强制重渲染同序
      useEffect(() => {
        const onBoardSort = () => force((x) => x + 1)
        window.addEventListener('snx:boardSortChanged', onBoardSort)
        return () => window.removeEventListener('snx:boardSortChanged', onBoardSort)
      }, [])
      // ── P1-14：promise 化应用内确认（SnxConfirm 渲染在 return 末尾）──
      // v11.2（B-8）：覆盖守卫——已有确认弹窗在场时，后来的请求直接按取消返回，不静默顶掉前一个
      const askConfirm = (opts) => new Promise((resolve) => {
        if (cfm) { resolve(false); return }
        setCfm(Object.assign({}, opts, { resolve }))
      })
      // v11.2（B-7/A-P2-4）：清空画布走应用内确认；有进行中任务时明示代价
      const askClearCanvas = async () => {
        const running = store.doc.nodes.filter((n) => n.status === 'pending' || n.status === 'running').length
        const ok = await askConfirm({
          title: '清空画布？',
          confirmLabel: '清空画布', confirmIcon: 'trash-2',
          desc: '将移除画布上全部 ' + store.doc.nodes.length + ' 个节点，可按 Ctrl+Z 撤销。'
            + (running > 0 ? '注意：当前有 ' + running + ' 个进行中任务，清空后将白费 ' + running + ' 个进行中任务。' : ''),
        })
        if (!ok) return
        store.pushUndo()
        store.doc.nodes = []
        store.sel = new Set()
        store.emit(); autosave()
        notify('画布已清空')
      }
      const closeConfirm = (v) => setCfm((s) => { if (s) { try { s.resolve(v) } catch { } } return null })
      // ——— P1-3：画廊批量操作（批量条 / 右键菜单 / 拖拽归类共用；路径与灯箱删除/画板归属一致）———
      const moveNodesToBoard = (ids, boardId) => {
        const real = (ids || []).map((id) => store.node(id)).filter(Boolean)
        if (!real.length) return
        store.pushUndo()
        real.forEach((n) => { if (boardId === 'none') delete n.boardId; else n.boardId = boardId })
        if (boardId && boardId !== 'none') touchBoard(boardId)   // SPEC-16 三：移入即刷新该板最近使用（拖拽/批量/右键菜单同路）
        store.emit(); autosave(); force((x) => x + 1)
        const b = (store.doc.boards || []).find((x) => x.id === boardId)
        notify(boardId === 'none'
          ? '已把 ' + real.length + ' 张移出画板'
          : '已把 ' + real.length + ' 张移入画板「' + (b ? b.name : '?') + '」')
      }
      // P1-14：画廊删除收口到 SnxConfirm；被其他节点作父图引用时给警告文案（InvokeAI DeleteBoardModal 同思路）
      // v12：被引用检查加一路——在对比选择（cmpSel）中的图也给警告行（删除后自动移出对比槽位）
      const askGalDelete = async (ids) => {
        if (!ids || !ids.length) return
        const idSet = new Set(ids)
        const parents = ids.filter((id) => store.doc.nodes.some((n) => n.parentId === id)).length
        const inCmp = ids.filter((id) => cmpSel.has(id)).length
        const ok = await askConfirm({
          title: '删除 ' + ids.length + ' 张图？',
          confirmLabel: '删除', confirmIcon: 'trash-2',
          desc: '将从画廊与画布移除这些图，可回画布页按 Ctrl+Z 撤销。'
            + (parents ? '注意：其中 ' + parents + ' 张是其他图的父图（衍生链起点），删除后对应「衍生自」链会断开，子图本身不受影响。' : '')
            + (inCmp ? '注意：其中 ' + inCmp + ' 张在对比选择中，删除后将自动移出对比。' : ''),
        })
        if (!ok) return
        store.pushUndo()
        store.doc.nodes = store.doc.nodes.filter((n) => !idSet.has(n.id))
        store.sel = new Set([...store.sel].filter((id) => !idSet.has(id)))
        setGalSel((prev) => new Set([...prev].filter((id) => !idSet.has(id))))
        if (galAnchor && idSet.has(galAnchor)) setGalAnchor(null)
        store.emit(); force((n) => n + 1)
        // SPEC-14 二.3：直存带 rev；未落盘（409 已重载远端基线+toast，删除可能被远端回滚）不再报「已删除」
        if (!(await saveNow())) return
        notify('已删除 ' + idSet.size + ' 张')
      }
      const downloadNodes = (ids) => {
        const real = (ids || []).map((id) => store.node(id)).filter((n) => n && n.src)
        real.forEach((n, i) => {
          setTimeout(() => {
            const a = document.createElement('a')
            a.href = n.src; a.download = 'sensenova-' + n.id + '.png'
            a.target = '_blank'; a.rel = 'noreferrer'; a.click()
          }, i * 250)
        })
        if (real.length) notify('开始下载 ' + real.length + ' 张')
      }
      // ── SPEC-14 ②：画布右键菜单补项的 Workbench 侧动作（ContextMenu 只发起，状态都在这层）───
      // 在画廊中定位：切画廊 tab + 清掉会遮住目标卡的筛选（搜索/标签/收藏/画板→全部），
      // 等画廊重渲染完成后滚动 .snx-pro-main 到该卡；高亮闪由 locateId state 驱动
      // （GalleryItem className 拼 ' snx-locate'，800ms 后清 null，动画同长）
      const locateInGallery = (n) => {
        if (!n) return
        setGalQ(''); setGalTag(''); setGalFav(false); setGalBoard('')
        setMode('gallery')
        setFsCanvas(false)   // 全屏画布里右键发起时退出全屏，否则盖住画廊（与 onRestoreParams 同规矩）
        setLocateId(n.id)
        notify('正在画廊中定位这张图…')
        requestAnimationFrame(() => requestAnimationFrame(() => {
          const card = document.querySelector('.snx-gal-item[data-gal-id="' + n.id + '"]')
          if (!card) { notify('画廊里没有这张图（可能已删除或未完成）'); setLocateId(null); return }
          if (typeof card.scrollIntoView === 'function') card.scrollIntoView({ block: 'center', behavior: 'smooth' })
          else {
            const main = document.querySelector('.snx-pro-main')
            if (main) main.scrollTop = Math.max(0, card.offsetTop - main.clientHeight / 2)
          }
          setTimeout(() => setLocateId(null), 800)
        }))
      }
      // 设为对比：复用 v12 独立对比选择集合 cmpSel 的 add 语义（≤4 张、不自动抓图、不碰画布选择）
      const addNodeToCompare = (n) => {
        if (!n) return
        let outcome = 'added'
        setCmpSel((prev) => {
          const nx = new Set(prev)
          if (nx.has(n.id)) { outcome = 'dup'; return nx }
          if (nx.size >= 4) { outcome = 'full'; return nx }
          nx.add(n.id)
          return nx
        })
        force((x) => x + 1)
        notify(outcome === 'added' ? '已加入对比选择（' + (cmpSel.size + 1) + '/4），切「对比」tab 查看'
          : outcome === 'full' ? '对比选择已满 4 张，未加入（先在对比页移出一张）'
            : '这张图已在对比选择中')
      }
      // 批量下载（多选）：逐张触发，文件名 = 提示词前 30 字（去非法字符）+ 序号；与画廊下载同 250ms 间隔
      const batchDownloadNodes = (nodes) => {
        const real = (nodes || []).filter((n) => n && n.src)
        if (!real.length) { notify('选中里没有可下载的完成图'); return }
        real.forEach((n, i) => {
          setTimeout(() => {
            const a = document.createElement('a')
            a.href = n.src
            a.download = ((String(n.prompt || '').replace(/^💬\s*/, '').slice(0, 30).replace(/[\\/:*?"<>|]/g, '')) || 'sensenova') + '-' + (i + 1) + '.png'
            a.target = '_blank'; a.rel = 'noreferrer'; a.click()
          }, i * 250)
        })
        notify('开始下载 ' + real.length + ' 张')
      }
      // ── SPEC-16 四：批量导出（画廊多选 ≥2 done）——逐张下载，每张走与灯箱单张导出相同的
      // 嵌入元数据管线（imageToBlob PNG + sensenova tEXt：提示词/模型/尺寸/种子，读回验证过的既有实现）。
      // 恒定嵌入：meta 固定传节点本体，不读灯箱导出面板的「嵌入元数据」开关（exportMeta 只是单张的偏好）。
      // 串行 + 张间 250ms 间隔（batchDownload 防拦截同款经验）；文件名同批量下载=提示词前 30 字+序号；
      // 单张失败不中断批次计入结尾汇总；toast 进度（i/N）+ 结尾汇总；busy 态防连点。
      const batchExportNodes = async (ids) => {
        if (galExpBusyRef.current) return
        const real = (ids || []).map((id) => store.node(id)).filter((n) => n && n.status === 'done' && n.src)
        if (real.length < 2) { notify('批量导出至少选 2 张完成图'); return }
        galExpBusyRef.current = true; setGalExpBusy(true)
        const N = real.length
        let ok = 0, fail = 0
        for (let i = 0; i < N; i++) {
          const n = real[i]
          notify('批量导出 ' + (i + 1) + '/' + N)
          if (i > 0) await new Promise((res) => setTimeout(res, 250))   // batchDownload 同款间隔防拦截
          try {
            // 与灯箱单张导出 doExport 同管线：imageToBlob(src,'png',…,meta=节点)——meta 传节点即恒定嵌入 tEXt
            const blob = await imageToBlob(n.src, 'png', 92, n)
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = ((String(n.prompt || '').replace(/^💬\s*/, '').slice(0, 30).replace(/[\\/:*?"<>|]/g, '')) || 'sensenova') + '-' + (i + 1) + '.png'
            a.click(); setTimeout(() => URL.revokeObjectURL(url), 400)   // v16.1:立即 revoke 偶发触发 Chromium 重启下载(第六任审计发现 1)
            ok++
          } catch { fail++ }
        }
        notify(ok
          ? (fail ? '批量导出完成：' + ok + ' 张成功（含元数据），' + fail + ' 张失败' : '批量导出完成：' + ok + ' 张（均含元数据）')
          : '批量导出全部失败（' + fail + ' 张）', fail ? 'err' : undefined)
        galExpBusyRef.current = false; setGalExpBusy(false)
      }
      // ── SPEC-17 一：批量导出 zip（画廊多选 ≥2 done）——客户端 store-only zip 打包（storeOnlyZip，
      // 无外部依赖），每张 PNG 仍走与灯箱单张导出相同的嵌入元数据管线（imageToBlob PNG + meta=节点
      // 恒定嵌入 tEXt）。条目名=序号-提示词前 20 字.png（去 Windows 非法字符；序号前导零使解压后
      // 资源管理器按名排序与打包顺序一致）。下载名=snx-canvas-日期.zip——文档没有「画布名」字段，
      // 沿用整画布导出 onExportCanvas 的 snx-canvas- 前缀同词汇。串行取 PNG（imageToBlob 解码+编码
      // 是重活，防内存尖峰）；busy 与「批量导出」共用 galExpBusy（ref 判重入 + state 渲染）防并跑。
      const batchExportZipNodes = async (ids) => {
        if (galExpBusyRef.current) return
        const real = (ids || []).map((id) => store.node(id)).filter((n) => n && n.status === 'done' && n.src)
        if (real.length < 2) { notify('批量导出 zip 至少选 2 张完成图'); return }
        galExpBusyRef.current = true; setGalExpBusy(true)
        try {
          const N = real.length
          const entries = []
          for (let i = 0; i < N; i++) {
            const n = real[i]
            notify('打包 zip ' + (i + 1) + '/' + N)
            // 与灯箱单张导出 doExport 同管线：imageToBlob(src,'png',…,meta=节点)——meta 传节点即恒定嵌入 tEXt
            const blob = await imageToBlob(n.src, 'png', 92, n)
            const slug = String(n.prompt || '').replace(/^💬\s*/, '').replace(/\s+/g, ' ').slice(0, 20)
              .replace(/[\\/:*?"<>|\x00-\x1f]/g, '').trim()
            entries.push({
              name: String(i + 1).padStart(2, '0') + '-' + (slug || 'sensenova') + '.png',
              data: new Uint8Array(await blob.arrayBuffer()),
            })
          }
          const d = new Date()
          const ds = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0')
          const url = URL.createObjectURL(storeOnlyZip(entries))
          const a = document.createElement('a')
          a.href = url; a.download = 'snx-canvas-' + ds + '.zip'
          a.click(); setTimeout(() => URL.revokeObjectURL(url), 400)   // v16.1:立即 revoke 偶发触发 Chromium 重启下载(第六任审计发现 1)
          notify('批量导出 zip 完成：' + N + ' 张已打包（均含元数据）——' + a.download)
        } catch (e) {
          notify('批量导出 zip 失败：' + String((e && e.message) || e), 'err')
        } finally {
          galExpBusyRef.current = false; setGalExpBusy(false)
        }
      }
      // ── SPEC-15 ②：批量变体（画廊多选）——对每张选中完成图串行入队一条变体任务。
      // 节点创建参照 doEnhance 直连模式：先落 pending（队列可见/可取消），直连 POST /api/sensenova/generate，
      // reference=该图 src（dataURL 先 persistRef 落盘，失败仍用原 src），prompt=「基于这张图做变体：」+该图提示词，
      // size/model 沿用该图 params；成功 pending→done 落在原图右侧挂 parentId。单张失败 pending→error 不中断批次，
      // 计入结尾汇总；进度 toast「批量变体 i/N」。串行 + 张间 250ms 间隔（batchDownload 防拦截同款经验）防限流；
      // 整批一个撤销步，按钮 busy 态防连点（state 渲染 + ref 判重入）。
      const batchVariantNodes = async (ids) => {
        if (galVarBusyRef.current) return
        const real = (ids || []).map((id) => store.node(id)).filter((n) => n && n.status === 'done' && n.src)
        if (real.length < 2) { notify('批量变体至少选 2 张完成图'); return }
        galVarBusyRef.current = true; setGalVarBusy(true)
        store.pushUndo()
        const N = real.length
        let ok = 0, fail = 0
        for (let i = 0; i < N; i++) {
          const n = real[i]
          notify('批量变体 ' + (i + 1) + '/' + N)
          if (i > 0) await new Promise((res) => setTimeout(res, 250))   // batchDownload 同款间隔防限流
          const id = nid()
          const base = String(n.prompt || '').replace(/^💬\s*/, '') || '生成这张图的变化版本，保持风格与构图'
          const vprompt = '基于这张图做变体：' + base
          const vsize = (n.params && n.params.size) || sizeForAspect(n.w, n.h)
          const srcRef = await persistRef(n.src)
          const targetB = resolveTargetBoard() || undefined
          store.doc.nodes.push({
            id, type: 'image', status: 'pending', src: '', parentId: n.id,
            boardId: targetB,   // v15.1：变体也跟随归板(与生成同语义)；SPEC-16 三：入板同刷新最近使用
            x: n.x + n.w + 60, y: n.y, w: 480, h: 480,
            prompt: vprompt,
            params: {
              model: (n.params && n.params.model) || '',
              size: vsize,
              reference: keepShortRef(srcRef || n.src),
            }, ts: Date.now(), _queuedAt: Date.now(),
          })
          if (targetB) touchBoard(targetB)   // SPEC-16 三：入板即刷新该板最近使用
          store.emit(); autosave()
          const ac = new AbortController()
          inflightJobs.set(id, ac)
          try {
            const r = await snxGenPost({
              prompt: vprompt, size: vsize,
              model: (n.params && n.params.model) || undefined,
              reference: srcRef || n.src, persist: true,
            }, ac.signal)
            if (isCancelled(id)) { fail++; continue }
            if (!r.ok || !r.image) throw new Error(r.error || '生成失败')
            const value = r.image.kind === 'base64' ? 'data:image/png;base64,' + r.image.value : r.image.value
            if (overInlineLimit(r.image.kind, value)) {
              throw new Error('返回图 ' + (value.length / 1024 / 1024).toFixed(1) + 'MB 过大且落盘失败，已拒收以免撑爆画布文档')
            }
            const im = await loadImg(value)
            if (isCancelled(id)) { fail++; continue }
            const fit = nodeFit(im, 480)
            store.updateNode(id, { status: 'done', src: value, w: fit.w, h: fit.h, error: '', errMsg: '', ts: Date.now() })
            ok++
          } catch (e) {
            const aborted = !!(e && (e.name === 'AbortError' || /abort/i.test(String((e && e.message) || e))))
            if (aborted || isCancelled(id)) store.updateNode(id, { status: 'error', error: '用户取消', errMsg: '用户取消', _endedAt: Date.now() })
            else {
              const msg = String((e && e.message) || e).slice(0, 200)
              store.updateNode(id, { status: 'error', error: msg, errMsg: msg, _endedAt: Date.now() })
            }
            fail++
          } finally {
            if (inflightJobs.get(id) === ac) inflightJobs.delete(id)
          }
        }
        notify(ok
          ? (fail ? ok + ' 张变体完成，' + fail + ' 张失败' : ok + ' 张变体完成')
          : '批量变体全部失败（' + fail + ' 张）', fail ? 'err' : undefined)
        galVarBusyRef.current = false; setGalVarBusy(false)
        force((x) => x + 1)
      }
      const toggleGalFav = (ids, on) => {
        const real = (ids || []).map((id) => store.node(id)).filter(Boolean)
        store.pushUndo()   // v11.2：收藏/取消收藏入撤销栈
        real.forEach((n) => { n.favorite = !!on })
        store.emit(); autosave(); force((x) => x + 1)
        notify(on ? '已收藏 ' + real.length + ' 张' : '已取消收藏 ' + real.length + ' 张')
      }
      // 与灯箱「作为参考图」同语义：选中即 i2i 锚点，带回生图页
      const useGalAsRef = (n) => {
        store.sel = new Set([n.id])
        setSelId(n.id)
        setMode('gen')
        notify('已设为参考图，在提示词框输入修改指令即可')
        force((x) => x + 1)
      }
      // P1-3：点击语义分层（InvokeAI buildOnClick）：单击选中轻态 / Ctrl 切换 / Shift 范围 / 双击灯箱
      const onGalItemClick = (e, node) => {
        if (galClickSuppressRef.current) { galClickSuppressRef.current = false; return }
        const visIds = galVisIdsRef.current
        if (e.shiftKey && galAnchor && visIds.includes(galAnchor) && visIds.includes(node.id)) {
          const a = visIds.indexOf(galAnchor)
          const bi = visIds.indexOf(node.id)
          const range = visIds.slice(Math.min(a, bi), Math.max(a, bi) + 1)
          setGalSel((prev) => { const nx = new Set(prev); range.forEach((id) => nx.add(id)); return nx })
          return
        }
        if (e.ctrlKey || e.metaKey) {
          setGalSel((prev) => { const nx = new Set(prev); if (nx.has(node.id)) nx.delete(node.id); else nx.add(node.id); return nx })
          setGalAnchor(node.id)
          return
        }
        setGalSel(new Set([node.id]))
        setGalAnchor(node.id)
      }
      const onGalItemContext = (e, node) => {
        e.preventDefault()
        // 右键未选中的图：先把它变成唯一选中（文件管理器惯例）
        if (!galSel.has(node.id)) { setGalSel(new Set([node.id])); setGalAnchor(node.id) }
        setGalMenu({ x: e.clientX, y: e.clientY, nodeId: node.id, boardList: false })
      }
      // P1-3：拖图到画板 chip 归类（pointer 最小版：拖起 → chip 高亮 → 松手归类）
      // v12：拖拽接近滚动容器（.snx-pro-main，画廊模式的实际滚动元素）上下缘 40px 内自动滚动——
      // rAF 节流循环按纵深比例推进 scrollTop，指针离缘或松手（finish）即停
      const onGalItemPointerDown = (e, node) => {
        if (e.button !== 0) return
        const sx = e.clientX, sy = e.clientY
        const off = fixedOffsetHost()
        const st = { ids: null, over: null, moved: false, dir: 0, raf: 0 }
        // —— 边缘自动滚动（rAF 节流）——
        const scrollHost = () => document.querySelector('.snx-pro-main')
        const EDGE = 40
        const step = () => {
          st.raf = 0
          if (!st.dir) return
          const el = scrollHost()
          if (el) el.scrollTop += st.dir * st.speed
          st.raf = requestAnimationFrame(step)
        }
        const kick = () => { if (st.dir && !st.raf) st.raf = requestAnimationFrame(step) }
        const trackEdge = (y) => {
          const el = scrollHost()
          if (!el) { st.dir = 0; return }
          const r = el.getBoundingClientRect()
          let d = 0
          let depth = 0
          if (y < r.top + EDGE) { d = -1; depth = (r.top + EDGE - y) / EDGE }
          else if (y > r.bottom - EDGE) { d = 1; depth = (y - (r.bottom - EDGE)) / EDGE }
          st.dir = d
          st.speed = 6 + 18 * Math.min(1, Math.max(0, depth))   // 6→24 px/帧，越贴近边缘越快
          kick()
        }
        const stopEdge = () => {
          st.dir = 0
          if (st.raf) { cancelAnimationFrame(st.raf); st.raf = 0 }
        }
        const onMove = (ev) => {
          if (ev.buttons !== 1) return
          if (!st.moved && Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 6) return
          if (!st.moved) {
            st.moved = true
            st.ids = galSel.has(node.id)
              ? [...galSel].filter((id) => { const n = store.node(id); return n && n.status === 'done' && n.src })
              : [node.id]
            galClickSuppressRef.current = true
            setGalDragActive({ count: st.ids.length })
          }
          if (galGhostRef.current) {
            galGhostRef.current.style.left = (ev.clientX - off.left + 14) + 'px'
            galGhostRef.current.style.top = (ev.clientY - off.top + 14) + 'px'
          }
          let over = null
          const el = document.elementFromPoint(ev.clientX, ev.clientY)
          const chip = el && el.closest ? el.closest('[data-galboard]') : null
          if (chip) over = chip.getAttribute('data-galboard')
          if (over !== st.over) { st.over = over; setGalDragOver(over) }
          trackEdge(ev.clientY)
        }
        const finish = () => {
          window.removeEventListener('pointermove', onMove)
          window.removeEventListener('pointerup', finish)
          window.removeEventListener('pointercancel', finish)
          stopEdge()   // 松手停止自动滚动
          galDragRef.current = null
          if (st.moved && st.over) moveNodesToBoard(st.ids || [node.id], st.over)
          if (st.moved) {
            // click 事件若派发在别处（松手点不在原缩略图上），条目自己的 onClick 吃不到
            // suppress 标记 → 这里兜底清掉，防吞掉下一次正常点击
            setTimeout(() => { galClickSuppressRef.current = false }, 0)
          }
          setGalDragActive(null)
          setGalDragOver(null)
        }
        galDragRef.current = st
        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', finish)
        window.addEventListener('pointercancel', finish)
      }
      // 设置页：Key 保存 / 真连接测试（走 /ping 实际访问 SenseNova /models）
      const saveKey = async () => {
        const k = keyDraft.trim()
        if (!k || keySaving) return
        setKeySaving(true)
        try {
          const r = await post(CONFIG_ROUTE, { apiKey: k })
          if (!r.ok) throw new Error(r.error || '保存失败')
          setKeyDraft('')
          const s = await get(STATUS_ROUTE).catch(() => ({}))
          setKeyOk(!!s.keyConfigured)
          // v13.1：POST 只对本会话生效;持久化已迁移到宿主设置页（profile 条目）
          notify(r.persisted === false ? 'Key 已生效（本会话）；跨重启持久化请在宿主设置页的「SenseNova 生图」条目修改并保存' : 'Key 已保存并立即生效')
        } catch (e) { notify('保存失败：' + String((e && e.message) || e)) }
        finally { setKeySaving(false) }
      }
      const testKey = async () => {
        if (keyTesting) return
        setKeyTesting(true)
        try {
          const r = await get('/api/sensenova/ping')
          setPingResult(r)
          setKeyOk(!!r.ok)
          notify(r.ok ? '连接成功，当前可用模型 ' + (r.models || []).length + ' 个' : '连接失败：' + (r.error || '未知'))
        } catch (e) {
          setPingResult({ ok: false, error: String((e && e.message) || e) })
          notify('测试失败')
        } finally { setKeyTesting(false) }
      }

      useEffect(() => {
        // v4.2+ tab 架构：tab body 挂载即视为打开。v4.1 侧栏开关已废弃（setOpen 无处写 '0'），
        // 这里主动写 '1'，治愈旧浏览器残留 'dsh-sensenova-open'='0' 的僵尸门（否则引擎/文档 effect 全被挡）
        setOpen(true)
        setOpenState(isOpen())   // 立即同步 state，不等 1.2s 轮询（首开即载文档/建引擎）
        // SPEC-13 ②：冷启动竞态兜底——对话卡先 focusWorkbenchGen 再 openTab 时，snx:genFocus
        // 广播时本组件还没挂上监听，pending 在这里补消费（切生图视图 + 补发 toast）
        if (pendingGenFocus) {
          const p = pendingGenFocus
          pendingGenFocus = null
          if (p.gen) { setLightbox(null); setFsCanvas(false); setMode('gen') }
          if (p.toast) notify(p.toast)
        }
        const fn = () => setOpenState(isOpen())
        window.addEventListener(EVT, fn)
        const poll = setInterval(fn, 1200)
        get(STATUS_ROUTE).then((s) => setKeyOk(!!s.keyConfigured)).catch(() => { })
        return () => { window.removeEventListener(EVT, fn); clearInterval(poll) }
      }, [])

      useEffect(() => {
        ensureKonva().then(() => setReady(true)).catch((e) => setLoadErr(String((e && e.message) || e)))
      }, [])

      // 全屏画布入模态栈（v11.2：onEsc 分发器统一处理 Esc 退出；soft 条目不算模态——
      // modalOpen() 为假，画布快捷键（空格平移/Ctrl+Z/方向键/Del）在全屏态照常响应，
      // 而 Esc 经分发器只退出全屏、不再同时清空选择——修复全屏 Esc 双消费）
      useEffect(() => {
        if (!fsCanvas) return
        const self = modalPush(() => setFsCanvas(false), { soft: true })
        return () => modalPop(self)
      }, [fsCanvas])

      // v8：? 键打开快捷键速查 overlay
      const [showHelp, setShowHelp] = useState(false)
      useEffect(() => {
        const onKey = (e) => {
          if (isTyping(e)) return   // 输入框里的 ? 是字符，不抢（与画布快捷键同规矩）
          if (e.key === '?' && (!modalOpen() || showHelp)) { setShowHelp((v) => !v); e.preventDefault() }
          else if (e.key === 'Escape' && showHelp) { setShowHelp(false); e.preventDefault() }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [showHelp])

      // 打开时：载入画布文档 + SSE 订阅（与引擎解耦——文档/画廊/队列不依赖画布 DOM 挂载）
      useEffect(() => {
        if (!open) return
        let dead = false
        const applyDoc = (doc) => {
          store.doc = doc && Array.isArray(doc.nodes) ? doc : emptyDoc()
          if (!store.doc.camera) store.doc.camera = { x: 0, y: 0, scale: 1 }
          if (!Array.isArray(store.doc.nodes)) store.doc.nodes = []
          // v18.3:孤儿 running 清扫——客户端会话中断(关页签/浏览器关闭)后,running 节点无人认领
          // 会永远卡「生成中」(真机复核实证:脚本中途关浏览器留下 2 个永久 running)。打开画布时把
          // startedAt 超 3 分钟的 running 标为可重跑;阈值>单次生成实际耗时(≤90s)+看门狗 90s,
          // 不误伤其他活会话正在跑的任务。
          const orphanNow = Date.now()
          let orphanSwept = false
          for (const n of store.doc.nodes) {
            if (n.status === 'running' && orphanNow - (n._startedAt || n.ts || 0) > 180000) {
              n.status = 'error'
              n.errMsg = '上次会话中断，任务没有跑完——可重跑'
              n._endedAt = orphanNow
              orphanSwept = true
            }
          }
          if (orphanSwept) autosave()   // v18.3:清扫要落盘,否则服务端仍是 running、跨会话可见不一致
          store.undoStack = [store.snapshot()]; store.redoStack = []   // P1-9：载入即重建 undo 基线
          if (activeEngine) { activeEngine.renderAll(); activeEngine.applyCamera() }
          force((n) => n + 1)
        }
        get(CANVAS_ROUTE).then((r) => {
          if (dead) return
          if (typeof r.rev === 'number') store.rev = r.rev   // SPEC-14 二.3：打开时同步文档版本号
          applyDoc(r.doc)
        }).catch(() => { })
        // Phase 2：SSE 订阅（agent → 画布实时通道）
        const es = new window.EventSource('/api/sensenova/events')
        es.onmessage = (m) => {
          let evt = null
          try { evt = JSON.parse(m.data) } catch { return }
          if (!evt || !evt.type) return
          if (evt.type === 'canvas:update') {
            // agent 生图/摆图 / 聊天卡片插入 → 服务端已写文档，这里重载。
            // P1-9：外部替换不再清空用户选择——只过滤掉已不存在的选中项；
            // 并重建 undo 基线（旧栈快照全是外部写入前的文档，Ctrl+Z 会闪回把外部写入"撤没了"）。
            // 相机保持本地不动，外部写入不抢用户视口。
            get(CANVAS_ROUTE).then((r) => {
              if (dead || !r.doc || !Array.isArray(r.doc.nodes)) return
              if (typeof r.rev === 'number') store.rev = r.rev   // SPEC-14 二.3：外部写入后以服务端版本为准，避免下次保存误判 409
              store.doc.nodes = r.doc.nodes
              store.doc.boards = r.doc.boards || store.doc.boards   // v11.2：画板列表一并跟随外部写入
              store.sel = new Set([...store.sel].filter((id) => store.node(id)))
              store.undoStack = [store.snapshot()]; store.redoStack = []
              if (activeEngine) activeEngine.renderAll()
              force((n) => n + 1)
            }).catch(() => { })
          }
        }
        return () => { dead = true; try { es.close() } catch { } }
      }, [open])

      // 画布容器挂载时（画布 tab 或全屏画布）：建引擎 + 快捷键 + 拖放/粘贴；卸载时销毁
      // 注意 mode 必须在依赖里：初始 mode='gen' 时容器不在 DOM，点「画布」tab 靠 mode 翻转触发本 effect
      useEffect(() => {
        if (!open || !ready || !wrapRef.current) return
        const wrap = wrapRef.current
        const engine = createEngine(wrap)
        engine.wrapEl = wrap
        engineRef.current = engine
        activeEngine = engine
        engine.renderAll()
        engine.applyCamera()
        // 相机还是出厂默认且有内容 → 首次打开自动适应视野（用户调过相机则尊重其保存值）
        try {
          const c0 = store.doc.camera
          if (store.doc.nodes.length && c0.x === 0 && c0.y === 0 && c0.scale === 1) engine.fit()
        } catch { }
        force((n) => n + 1)
        engine.setOnContext((x, y, nodeId, extra) => {
          setMenu({
            x: Math.min(x, window.innerWidth - 180), y: Math.min(y, window.innerHeight - 230),
            nodeId, edgeChild: extra && extra.edgeChild || null,
          })
        })
        engine.opts.onNotify = notify   // v11.1：连线改接/防环提示走引擎 → toast
        engine.opts.onLightbox = (id) => {   // v11.2：画布节点双击 → 灯箱（带该节点）
          const n = store.node(id)
          if (n && n.src) setLightbox(n)
        }
        // 视口变化 → 重渲染（浮动操作条跟随节点/相机）
        const unView = engine.onViewChange(() => force((n) => n + 1))

        // 拖入图片即成节点（落点=投放位置）
        const onDragOver = (e) => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy' }
        const onDrop = (e) => {
          e.preventDefault()
          const files = [...((e.dataTransfer && e.dataTransfer.files) || [])].filter((f) => f.type.startsWith('image/'))
          if (!files.length) return
          const rect = wrap.getBoundingClientRect()
          const c = store.doc.camera
          const wx = (e.clientX - rect.left - c.x) / c.scale
          const wy = (e.clientY - rect.top - c.y) / c.scale
          files.forEach((f, idx) => {
            const r = new window.FileReader()
            r.onload = async () => {
              const pp = await parsePngParams(f)
              // v11.2：大图先落盘成文件 URL，失败拒绝入画布
              const src = await ingestDroppedImageSrc(String(r.result))
              if (!src) return
              loadImg(src).then((im) => {
                const fit = nodeFit(im, 480)
                store.addNode({
                  id: nid(), type: 'image', status: 'done', src,
                  x: Math.round(wx - fit.w / 2 + idx * 24), y: Math.round(wy - fit.h / 2 + idx * 24),
                  w: fit.w, h: fit.h,
                  prompt: pp ? pp.prompt : '', params: pp ? { model: pp.model, size: pp.size, seed: pp.seed } : {},
                  ts: Date.now(),
                }, true)
                if (pp) {
                  genPrefs.prompt = pp.prompt
                  if (pp.model) genPrefs.model = pp.model
                  if (pp.size) genPrefs.size = pp.size
                  if (typeof pp.seed === 'number') genPrefs.seed = pp.seed
                  notify && notify('已从 PNG 读回生成参数（生图表单已填入）')
                }
              }).catch(() => { })
            }
            r.readAsDataURL(f)
          })
        }
        // 粘贴图片 → 视口中心
        const onPaste = (e) => {
          if (!isOpen() || isTyping(e) || modalOpen()) return   // P0-4：模态打开时粘贴不入画布
          const items = [...((e.clipboardData && e.clipboardData.items) || [])]
          const it = items.find((i) => i.type.startsWith('image/'))
          if (!it) return
          const f = it.getAsFile()
          if (!f) return
          e.preventDefault()
          const r = new window.FileReader()
          r.onload = async () => {
            const pp = await parsePngParams(f)
            // v11.2：大图先落盘成文件 URL，失败拒绝入画布
            const src = await ingestDroppedImageSrc(String(r.result))
            if (!src) return
            loadImg(src).then((im) => {
              const fit = nodeFit(im, 480)
              const cc = engineRef.current ? engineRef.current.centerWorld() : { x: 0, y: 0 }
              store.addNode({
                id: nid(), type: 'image', status: 'done', src,
                x: Math.round(cc.x - fit.w / 2), y: Math.round(cc.y - fit.h / 2),
                w: fit.w, h: fit.h,
                prompt: pp ? pp.prompt : '', params: pp ? { model: pp.model, size: pp.size, seed: pp.seed } : {},
                ts: Date.now(),
              }, true)
              if (pp) {
                genPrefs.prompt = pp.prompt
                if (pp.model) genPrefs.model = pp.model
                if (pp.size) genPrefs.size = pp.size
                if (typeof pp.seed === 'number') genPrefs.seed = pp.seed
                notify && notify('已从 PNG 读回生成参数（生图表单已填入）')
              }
            }).catch(() => { })
          }
          r.readAsDataURL(f)
        }
        wrap.addEventListener('dragover', onDragOver)
        wrap.addEventListener('drop', onDrop)
        window.addEventListener('paste', onPaste)

        const onKey = (e) => {
          if (!isOpen() || isTyping(e)) return
          if (modalOpen()) return   // P0-4：灯箱/帮助/确认弹窗任一打开时，画布快捷键全部让路（Esc 归栈顶）
          const ctrl = e.ctrlKey || e.metaKey
          if (e.key === 'Escape' && maskRef.current) { cancelMask(); return }
          if (maskRef.current) return   // 蒙版模式下其余快捷键让路
          if (ctrl && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); e.shiftKey ? store.redo() : store.undo() }
          else if (ctrl && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); store.redo() }
          else if (ctrl && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); store.duplicateSelected() }
          else if (ctrl && (e.key === 'c' || e.key === 'C')) {
            // SPEC-17 批次2：内部节点剪贴板。只在实际复制到内容时拦截默认行为
            // （无选中时不 preventDefault，浏览器原生复制照常）；选中里的排队/生成中节点跳过
            const n = store.copySelected()
            if (n) { e.preventDefault(); notify && notify('已复制 ' + n + ' 个节点，Ctrl+V 粘贴到指针处') }
          }
          else if (ctrl && (e.key === 'x' || e.key === 'X')) {
            // 剪切 = 复制 + 删除（removeSelected 自带锁定节点保护与提示）
            const n = store.copySelected()
            if (n) { e.preventDefault(); store.removeSelected() }
          }
          else if (ctrl && (e.key === 'v' || e.key === 'V')) {
            // 内部剪贴板有货时优先贴节点（不落下方的系统图片粘贴）；落点=指针所在画布坐标，
            // 指针不在画布上时退回视口中心
            if (store.clipboard && store.clipboard.nodes.length) {
              e.preventDefault()
              const eng = engineRef.current
              const at = (eng && eng.pointerWorld()) || (eng ? eng.centerWorld() : { x: 0, y: 0 })
              const n = store.pasteClipboard(at)
              if (n) notify && notify('已粘贴 ' + n + ' 个节点')
            }
          }
          else if (ctrl && (e.key === 'a' || e.key === 'A')) {
            // P2-7：全选（对齐 tldraw/InvokeAI；隐藏节点一并选，可见性不受选中影响）
            e.preventDefault()
            store.sel = new Set(store.doc.nodes.map((n) => n.id))
            engine.syncTransformer(); store.emitLight()
          }
          else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            // P2-7：方向键微调选中节点（1px，Shift=10px）；锁定节点跳过
            const ns = selNodes().filter((n) => !n.locked)
            if (!ns.length) return
            e.preventDefault()
            const d = e.shiftKey ? 10 : 1
            const dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0
            const dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0
            pushUndoMerge()   // v11.2：方向键连按合并为一步 undo（800ms 窗口，同滑块先例）
            ns.forEach((n) => store.updateNode(n.id, { x: n.x + dx, y: n.y + dy }))
          }
          else if (e.key === 'Delete' || e.key === 'Backspace') { store.removeSelected() }
          else if (e.key === 'Escape') { store.sel.clear(); engine.syncTransformer(); store.emitLight() }
          else if ((e.key === 'f' || e.key === 'F') && !ctrl) { engine.fit() }
        }
        window.addEventListener('keydown', onKey)
        const unsub = store.subscribe(() => force((n) => n + 1))
        return () => {
          window.removeEventListener('keydown', onKey)
          wrap.removeEventListener('dragover', onDragOver)
          wrap.removeEventListener('drop', onDrop)
          window.removeEventListener('paste', onPaste)
          unView()
          unsub()
          engine.destroy()
          if (activeEngine === engine) activeEngine = null
          engineRef.current = null
        }
      }, [open, ready, fsCanvas, mode])

      // ——— 蒙版局部重绘 ———
      function cancelMask() {
        maskRef.current = null
        setMaskId(null)
        setMaskPrompt('')
      }
      function enterMask(node, erase) {
        maskRef.current = { nodeId: node.id, strokes: [], canvas: null, redraw: null, erase: !!erase }
        setMaskPrompt(erase ? ERASE_MASK_PROMPT : '')   // 消除笔：预填清除指令（用户可改），applyMask 会拼 MASK_PROMPT_SUFFIX
        setMaskId(node.id)
      }
      // 蒙模式覆盖层：画笔采集 + 视口同步重绘
      useEffect(() => {
        if (!maskId || !wrapRef.current || !engineRef.current) return
        const wrap = wrapRef.current
        const node = store.node(maskId)
        if (!node) { cancelMask(); return }
        const state = maskRef.current
        const cv = document.createElement('canvas')
        cv.setAttribute('data-snx-mask', '')   // 蒙版画布:同上,属性选择器替代类名
        cv.width = wrap.clientWidth; cv.height = wrap.clientHeight
        wrap.appendChild(cv)
        state.canvas = cv
        const ctx = cv.getContext('2d')
        let drawing = null
        const cam = () => store.doc.camera
        const worldPt = (e) => {
          const rect = cv.getBoundingClientRect()
          const c = cam()
          return { x: (e.clientX - rect.left - c.x) / c.scale, y: (e.clientY - rect.top - c.y) / c.scale }
        }
        const redraw = () => {
          if (cv.width !== wrap.clientWidth || cv.height !== wrap.clientHeight) {
            cv.width = wrap.clientWidth; cv.height = wrap.clientHeight
          }
          const c = cam()
          ctx.setTransform(1, 0, 0, 1, 0, 0)
          ctx.clearRect(0, 0, cv.width, cv.height)
          const n = store.node(state.nodeId)
          if (!n) return
          ctx.setTransform(c.scale, 0, 0, c.scale, c.x, c.y)
          ctx.save()
          ctx.beginPath(); ctx.rect(n.x, n.y, n.w, n.h); ctx.clip()
          // v8 画笔属性：opacity / hardness / feather
          const op = brushOpacity / 100
          const hard = brushHardness / 100
          const feath = brushFeather / 100
          for (const st of state.strokes) {
            ctx.save()
            // 用双层 stroke 模拟硬度（内核实色 + 外围渐变）
            ctx.globalAlpha = op * 0.4
            ctx.strokeStyle = snxTheme().accent
            ctx.lineCap = ctx.lineJoin = 'round'
            ctx.lineWidth = st.brush * (1 + feath * 0.6)
            ctx.beginPath()
            st.pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))
            ctx.stroke()
            // 硬核层
            ctx.globalAlpha = op
            ctx.lineWidth = st.brush * hard
            ctx.beginPath()
            st.pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))
            ctx.stroke()
            ctx.restore()
          }
          ctx.restore()
        }
        state.redraw = redraw
        const onDown = (e) => {
          if (e.button !== 0) return
          const n = store.node(state.nodeId)
          if (!n) return
          const p = worldPt(e)
          if (p.x < n.x - 12 || p.y < n.y - 12 || p.x > n.x + n.w + 12 || p.y > n.y + n.h + 12) return
          const c = cam()
          drawing = { brush: Math.max(4, brush / c.scale), pts: [p] }
          state.strokes.push(drawing)
          redraw()
        }
        const onMove = (e) => {
          // 画笔预览圈（跟鼠标走）。.snx-brush-cursor 是 position:fixed，但 .snx-pro 是
          // container-type 容器会收编 fixed 后代为包含块——所以按 .snx-pro 矩形换算，
          // 不能按 wrap 偏移（此前预览圈相对指针错位）
          const host = document.querySelector('.snx-pro')
          const hr = host ? host.getBoundingClientRect() : { left: 0, top: 0 }
          setBrushCursor({ x: e.clientX - hr.left, y: e.clientY - hr.top, show: true })
          if (!drawing) return
          const p = worldPt(e)
          const last = drawing.pts[drawing.pts.length - 1]
          const c = cam()
          if (Math.abs(p.x - last.x) * c.scale + Math.abs(p.y - last.y) * c.scale < 3) return
          drawing.pts.push(p)
          redraw()
        }
        const onUp = () => { drawing = null }
        const onLeave = () => { drawing = null; setBrushCursor({ x: -100, y: -100, show: false }) }
        cv.addEventListener('pointerdown', onDown)
        cv.addEventListener('pointermove', onMove)
        cv.addEventListener('pointerup', onUp)
        cv.addEventListener('pointerleave', onLeave)
        const unView = engineRef.current.onViewChange(redraw)
        // 覆盖层重建（调画笔参数/全屏切换）后立即重绘已有笔迹，避免标注「消失」错觉
        state.redraw()
        return () => {
          cv.removeEventListener('pointerdown', onDown)
          cv.removeEventListener('pointermove', onMove)
          cv.removeEventListener('pointerup', onUp)
          cv.removeEventListener('pointerleave', onLeave)
          unView()
          cv.remove()
        }
      }, [maskId, brush, brushOpacity, brushHardness, brushFeather, fsCanvas])

      const applyMask = async () => {
        const st = maskRef.current
        const node = st ? store.node(st.nodeId) : null
        if (!node || busy || !st.strokes.length) return
        setBusy(true)
        try {
          const board = await composeMaskBoard(node, st.strokes, { opacity: brushOpacity, hardness: brushHardness, feather: brushFeather })
          const text = maskPrompt.trim() || '重绘高亮区域'
          // P1-2：标注板 dataURL 先落成文件 URL 再入 params——失败重试才有原标注板可带
          const boardRef = await persistRef(board)
          const id = nid()
          store.pushUndo()
          store.doc.nodes.push({
            id, type: 'image', status: 'pending', src: '', parentId: node.id,
            x: node.x + node.w + 60, y: node.y, w: 480, h: 480,
            prompt: text, params: { size: sizeForAspect(node.w, node.h), model: genPrefs.model, reference: boardRef }, ts: Date.now(), _queuedAt: Date.now(),
          })
          store.emit(); autosave()
          cancelMask()
          await runOne(id, { prompt: text + MASK_PROMPT_SUFFIX, size: sizeForAspect(node.w, node.h), model: genPrefs.model, reference: boardRef || board })
        } catch (e) {
          notify('重绘失败：' + String((e && e.message) || e))
        } finally { setBusy(false) }
      }

      // ——— 扩图 ———
      const applyOutpaint = async (ratio) => {
        const at = ratioAt
        setRatioAt(null)
        const node = at ? store.node(at.nodeId) : null
        if (!node || busy) return
        setBusy(true)
        try {
          const { dataUrl, size } = await composeOutpaint(node, ratio)
          // P1-2：扩图合成板同样先落成文件 URL 再入 params（失败重试可带原板）
          const boardRef = await persistRef(dataUrl)
          const id = nid()
          store.pushUndo()
          store.doc.nodes.push({
            id, type: 'image', status: 'pending', src: '', parentId: node.id,
            x: node.x + node.w + 60, y: node.y, w: 480, h: 480,
            prompt: '[扩图]', params: { size, model: genPrefs.model, reference: boardRef }, ts: Date.now(), _queuedAt: Date.now(),
          })
          store.emit(); autosave()
          await runOne(id, { prompt: OUTPAINT_PROMPT, size, model: genPrefs.model, reference: boardRef || dataUrl })
        } catch (e) {
          notify('扩图失败：' + String((e && e.message) || e))
        } finally { setBusy(false) }
      }

      // ——— 参数回填：从任意画布图/历史图一键恢复 prompt+全部已记录生成参数 ———
      // （灯箱「回填参数」与右键菜单共用；写 genPrefs + 广播 snx:restoreParams 给 GenForm）
      const onRestoreParams = (n) => {
        if (!n) return
        const p = n.params || {}
        const detail = {
          prompt: String(n.prompt || '').replace(/^💬\s*/, ''),
          negPrompt: p.negative || '',
          size: p.size || genPrefs.size || '2048x2048',
          model: p.model || '',
          seed: typeof p.seed === 'number' ? p.seed : -1,
          refs: (Array.isArray(p.refs) ? p.refs : [])
            .filter((r) => r && r.src)
            .map((r) => ({ src: r.src, role: r.role || 'reference', strength: r.strength ?? 0.7 })),
        }
        // SPEC-14 二.5：整套回填纳入画板行——该图已归画板时同时回填「目标画板」
        // （与行级「画板」按钮同一 targetBoard 语义，形成回填→生成回同一画板闭环）；
        // 未归板图不动当前目标画板（行级按钮才会显式回填「未分组」）
        if (n.boardId) detail.board = n.boardId
        genPrefs.prompt = detail.prompt; genPrefs.negPrompt = detail.negPrompt
        genPrefs.size = detail.size; genPrefs.model = detail.model
        genPrefs.seed = detail.seed; genPrefs.refs = detail.refs
        if (detail.board !== undefined) { genPrefs.targetBoard = detail.board; followBoard = false }
        window.dispatchEvent(new CustomEvent('snx:restoreParams', { detail }))
        setLightbox(null)
        setFsCanvas(false)   // 从全屏画布右键发起时退出全屏，否则盖住生图 tab
        setMode('gen')
        notify('已回填参数：提示词/负面/尺寸/模型/种子' + (detail.refs.length ? '/参考图×' + detail.refs.length : '')
          + (detail.board !== undefined ? '/目标画板' : ''))
        force((x) => x + 1)
      }
      // ── InvokeAI CurrentImageButtons 灵魂：行级单参数回填（Prompt/Negative/Model/Seed/Size/Refs/Board）──
      // 只带对应字段的 detail，GenForm 侧只覆盖到场的字段，不动其余表单项。
      // v12：行级回填改为停留灯箱（配合参数清单行高亮），不再关灯箱跳生图 tab——
      // "看图偷参数"的主工作流是连续翻图逐项取用，回填结果以 toast 确认
      const onRestoreField = (n, field) => {
        if (!n || !field) return
        const p = n.params || {}
        const detail = {}
        if (field === 'prompt') detail.prompt = String(n.prompt || '').replace(/^💬\s*/, '')
        else if (field === 'negPrompt') detail.negPrompt = p.negative || ''
        else if (field === 'model') detail.model = p.model || ''
        else if (field === 'seed') detail.seed = typeof p.seed === 'number' ? p.seed : -1
        else if (field === 'size') detail.size = p.size || sizeForAspect(n.w || 1, n.h || 1)
        else if (field === 'refs') detail.refs = (Array.isArray(p.refs) ? p.refs : [])
          .filter((r) => r && r.src)
          .map((r) => ({ src: r.src, role: r.role || 'reference', strength: r.strength ?? 0.7 }))
        // SPEC-13 ②：画板行回填 = 写「目标画板」偏好（该图未归板则回填为未分组）——
        // 回填参数→生成回同一画板的闭环；v12 无落点时不加按钮，本轮 genToCanvas 已按 targetBoard 落板
        else if (field === 'board') detail.board = n.boardId || ''
        if (detail.prompt !== undefined) genPrefs.prompt = detail.prompt
        if (detail.negPrompt !== undefined) genPrefs.negPrompt = detail.negPrompt
        if (detail.model !== undefined) genPrefs.model = detail.model
        if (detail.size !== undefined) genPrefs.size = detail.size
        if (detail.seed !== undefined) genPrefs.seed = detail.seed
        if (detail.refs !== undefined) genPrefs.refs = detail.refs
        if (detail.board !== undefined) genPrefs.targetBoard = detail.board
        window.dispatchEvent(new CustomEvent('snx:restoreParams', { detail }))
        notify('已回填' + ({ prompt: '提示词', negPrompt: '负向词', model: '模型', size: '尺寸', seed: '种子', refs: '参考图', board: '目标画板' }[field] || '参数'))
        force((x) => x + 1)
      }
      // ── SPEC-17 二：同种子重生成（灯箱动作行）——点击=回填该图 种子+提示词/尺寸/模型 到生图表单
      // （只覆盖这四项，GenForm 按 snx:restoreParams 到场字段覆盖，其余表单项不动；参数清单「种子」
      // 行的单键回填按钮不受影响、仍只回填字段），随即与「同参数重抽」共用直连 POST（snxRerollDirect），
      // 但 body.seed=该图种子（种子不变=可控变体），结果落工作台画布。该图没有数字种子（当初按随机
      // 种子生成/未记录）时无种子可锁——不给入口，调用方（Lightbox）按 params.seed 有无渲染按钮。
      // 返回 promise 供按钮四态防连点（idle/busy/ok/err，与同参数重抽同一套词汇）
      const onRegenSameSeed = (n) => {
        if (!n) return Promise.reject(new Error('没有节点'))
        const p = n.params || {}
        if (typeof p.seed !== 'number' || p.seed < 0) return Promise.reject(new Error('该图没有可复用的种子'))
        const prompt = String(n.prompt || '').replace(/^💬\s*/, '')
        const detail = {
          prompt,
          size: p.size || sizeForAspect(n.w || 1, n.h || 1),
          model: p.model || '',
          seed: p.seed,
        }
        genPrefs.prompt = detail.prompt
        genPrefs.size = detail.size
        genPrefs.model = detail.model
        genPrefs.seed = detail.seed
        try { window.dispatchEvent(new CustomEvent('snx:restoreParams', { detail })) } catch { }
        return snxRerollDirect(
          { size: detail.size, model: detail.model, seed: p.seed },
          prompt,
          { okMsg: '已按同种子重生成（种子 ' + p.seed + '），结果见画布', errPrefix: '同种子重生成失败' },
        )
      }

      // ── SPEC-18 五：tiled 放大 2×（灯箱动作行）——点击=2×2 分块重绘+羽化缝合，结果落画布。
      // onProgress(txt) 驱动按钮进度文案；四态防连点在 Lightbox 侧（与同种子重生成同一套词汇）
      const onTiledUpscale = (n, onProgress) => {
        if (!n || !n.src) return Promise.reject(new Error('没有图'))
        return tiledUpscale2x(n, onProgress, notify)
      }

      // ——— 整画布导出 PNG（全部可见 done 图按布局合成）———
      const onExportCanvas = async () => {
        setBusy(true)
        try {
          const r = await exportCanvasPng()
          const a = document.createElement('a')
          a.href = r.url
          a.download = 'snx-canvas-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.png'
          a.target = '_blank'; a.rel = 'noreferrer'; a.click()
          notify('已导出画布：' + r.count + ' 张图合成 ' + r.w + '×' + r.h + ' PNG')
        } catch (e) {
          notify('导出失败：' + String((e && e.message) || e))
        } finally { setBusy(false) }
      }

      // 右栏 tab 模式：直接渲染主界面，不再等 open=1
      // if (!open) return null

      // 操作条锚点节点（渲染期间从 store 现算，视口 tick 驱动跟随）
      let selDone = null
      if (store.sel.size === 1 && !maskId) {
        const cand = store.node([...store.sel][0])
        if (cand && cand.status === 'done') selDone = cand
      }
      // v11.2.1（断裂 #2）：多选集合——sel>=2 时画布条与全屏画布两处挂点都渲染多选操作条
      const selMulti = (!maskId && store.sel.size >= 2) ? selNodes() : null
      // 队列长度（pending + running）
      let queueLen = 0
      for (const nn of store.doc.nodes) {
        if (nn.status === 'pending' || nn.status === 'running') queueLen++
      }
      // 错件数（用于设置 tab 提示）
      let errCount = 0
      for (const nn of store.doc.nodes) {
        if (nn.status === 'error') errCount++
      }

      return h('div', { className: 'snx-pro' + (mode === 'canvas' ? ' canvas-mode' : '') },
        // ─── 顶部品牌栏 ───
        h('header', { className: 'snx-pro-top' },
          h('div', { className: 'snx-pro-brand' },
            h('span', { className: 'snx-pro-ico' }, ic('zap')),
            h('span', { className: 'snx-pro-name' }, 'SenseNova'),
            h('span', { className: 'snx-pro-tag' }, '生图工作台'),
          ),
          h('div', { className: 'snx-pro-spacer' }),
          h('span', {
            className: 'snx-pro-key ' + (keyOk === false ? 'no' : (keyOk ? 'ok' : 'unk')),
            title: keyOk === null ? '检查中…' : keyOk ? 'SenseNova API Key 已配置' : '未配置 Key，到设置页配置',
          }, keyOk === null ? ic('clock', 12) : keyOk ? 'Key 已配置' : 'Key 未配置'),
        ),
        // ─── 模式 tab ───
        h('nav', { className: 'snx-pro-tabs' },
          h('button', { className: mode === 'gen' ? 'on' : '', onClick: () => setMode('gen') },
            h('span', { className: 'ti' }, ic('wand-sparkles')), '生图'),
          h('button', {
            className: mode === 'queue' ? 'on' : '',
            onClick: () => setMode('queue'),
            title: '生成队列',
          },
            h('span', { className: 'ti' }, ic('list-ordered')), '队列',
            queueLen > 0 ? h('span', { className: 'cnt pulse' }, queueLen) : null),
          h('button', { className: mode === 'canvas' ? 'on' : '', onClick: () => setMode('canvas') },
            h('span', { className: 'ti' }, ic('frame')), '画布'),
          h('button', { className: mode === 'gallery' ? 'on' : '', onClick: () => setMode('gallery') },
            h('span', { className: 'ti' }, ic('images')), '画廊',
            store.doc.nodes.length ? h('span', { className: 'cnt' }, store.doc.nodes.length) : null,
          ),
          h('button', { className: mode === 'compare' ? 'on' : '', onClick: () => setMode('compare') },
            h('span', { className: 'ti' }, ic('columns-2')), '对比'),
          h('button', { className: mode === 'settings' ? 'on' : '', onClick: () => setMode('settings') },
            h('span', { className: 'ti' }, ic('settings')), ''),
        ),
        // ─── 主内容 ───
        h('main', { className: 'snx-pro-main' },
          mode === 'gen' ? renderGenMode() :
          mode === 'queue' ? renderQueueMode() :
          mode === 'canvas' ? renderCanvasMode() :
          mode === 'compare' ? renderCompareMode() :
          mode === 'settings' ? renderSettingsMode() :
          renderGalleryMode(),
        ),
        // ─── Lightbox 全屏预览 ───
        lightbox ? h(Lightbox, {
          node: lightbox,
          notify,
          store,
          onNav: (dir) => {
            const list = store.doc.nodes.filter((nn) => nn.status === 'done' && nn.src)
            const i = list.findIndex((nn) => nn.id === lightbox.id)
            if (i < 0 || !list.length) return
            setLightbox(list[(i + dir + list.length) % list.length])
          },
          nav: { idx: store.doc.nodes.filter((nn) => nn.status === 'done' && nn.src).findIndex((nn) => nn.id === lightbox.id), total: store.doc.nodes.filter((nn) => nn.status === 'done' && nn.src).length },
          boards: boardsByRecent(),   // SPEC-16 三：灯箱画板下拉按最近使用倒序
          onChangeBoard: (n, boardId) => {
            store.pushUndo()   // P1-10：画板归属可撤销（此前绕过 undo）
            if (boardId) n.boardId = boardId
            else delete n.boardId
            if (boardId) touchBoard(boardId)   // SPEC-16 三：灯箱移入即刷新该板最近使用
            store.emit()   // v11.2：补 emit——画廊/画布同步重渲染
            autosave(); force((x) => x + 1)
            const b = (store.doc.boards || []).find((x) => x.id === boardId)
            notify && notify(boardId ? '已移入画板「' + b.name + '」' : '已移出画板')
          },
          onClose: () => setLightbox(null),
          onUseAsAnchor: () => {
            store.sel = new Set([lightbox.id])
            setSelId(lightbox.id)
            setLightbox(null)
            setMode('gen')   // 直接带到生图 tab，选中图即 i2i 锚点（GenForm 顶部出现锚点条）
            notify('已设为参考图，在提示词框输入修改指令即可')
            force((n) => n + 1)
          },
          onEdit: () => {
            store.sel = new Set([lightbox.id])
            setLightbox(null)
            setMode('canvas')
            force((n) => n + 1)
          },
          onDownload: () => {
            const a = document.createElement('a')
            a.href = lightbox.src; a.download = `sensenova-${lightbox.id}.png`
            a.target = '_blank'; a.rel = 'noreferrer'; a.click()
          },
          onCopyParams: () => {
            const n = lightbox
            const text = JSON.stringify({
              prompt: n.prompt, model: n.params && n.params.model,
              size: n.params && n.params.size, seed: n.params && n.params.seed,
              ts: n.ts,
            }, null, 2)
            navigator.clipboard && navigator.clipboard.writeText(text)
            notify && notify('参数已复制')
          },
          onRestoreParams,
          onRestoreField,
          onRegenSameSeed,   // SPEC-17 二：灯箱动作行「同种子重生成」（回填+直连重生成，seed=该图种子）
          onTiledUpscale,   // SPEC-18 五：灯箱动作行「放大 2×」（分块重绘+羽化缝合，结果落画布）
          onDelete: async () => {
            // P1-14：原生 confirm → SnxConfirm；被其他节点作父图引用时给警告文案
            // v12：在对比选择中时也加引用警告行（删除后自动移出对比槽位）
            const children = store.doc.nodes.filter((nn) => nn.parentId === lightbox.id).length
            const inCmp = cmpSel.has(lightbox.id)
            const ok = await askConfirm({
              title: '删除这张图？',
              confirmLabel: '删除', confirmIcon: 'trash-2',
              desc: '将从画布与画廊移除这张图，可按 Ctrl+Z 撤销。'
                + (children ? '注意：有 ' + children + ' 张图以它为父图（衍生链起点），删除后对应「衍生自」链会断开，子图本身不受影响。' : '')
                + (inCmp ? '注意：这张图在对比选择中，删除后将自动移出对比。' : ''),
            })
            if (!ok) return
            store.pushUndo()   // P1-10：灯箱删除入撤销栈（此前绕过 undo）
            store.doc.nodes = store.doc.nodes.filter((nn) => nn.id !== lightbox.id)
            store.sel = new Set()
            store.emit()   // 引擎在挂时才同步重绘
            setLightbox(null)
            force((n) => n + 1)
            await saveNow()   // SPEC-14 二.3：直存带 rev，409 时重载远端基线
          },
          // P1-1：「重绘增强」（原 2x/4x 放大）——请求尺寸走已验证的 SIZES 线（≤2752，按锚点比例选档），
          // 与原图同分辨率重绘，不存在倍数放大；toast/tooltip 明示实际请求分辨率
          onUpscale: async (n) => {
            setLightbox(null)
            const reqSize = sizeForAspect(n.w, n.h)
            try {
              // 用 i2i 重绘增强（anchorNode 是 done 图，genToCanvas 无需引擎也能落位）
              await genToCanvas(engineRef.current, {
                prompt: (n.prompt ? n.prompt + '；' : '') + '重绘增强：保持构图与内容不变，提升清晰度、锐度与细节',
                size: reqSize,
                reference: n.src,
                anchorNode: n,
                n: 1,
              })
              notify && notify('已加入队列：重绘增强（实际请求分辨率 ' + reqSize + '）')
            } catch (e) { notify && notify('重绘增强失败（请求尺寸 ' + reqSize + '）：' + String((e && e.message) || e)) }
          },
          // v8：调整（保存为新节点）
          onAdjust: async (n, filters) => {
            const adjSrc = await applyFiltersGpu(n.src, filters)
            const id = nid()
            store.pushUndo()
            store.doc.nodes.push({
              id, type: 'image', status: 'done', src: adjSrc,
              parentId: n.id,
              x: n.x + n.w + 60, y: n.y,
              w: n.w, h: n.h,
              prompt: (n.prompt || '') + ' · 调整',
              params: Object.assign({}, n.params || {}, { adjusted: filters }),
              ts: Date.now(),
            })
            store.emit()   // 引擎在挂时才同步重绘（与 applyMask/applyOutpaint 同规矩）
            force((x) => x + 1)
            autosave()
            notify && notify('已生成调整版')
          },
          // v8：收藏 toggle（v11.2：补 pushUndo + emit，与画廊收藏同链路）
          onToggleFavorite: (n) => {
            store.pushUndo()
            n.favorite = !n.favorite
            store.emit()
            force((x) => x + 1)
            autosave()
            notify && notify(n.favorite ? '已收藏' : '已取消收藏')
          },
          // v8：版本树点击跳转
          onOpenVersion: (n) => {
            setLightbox(n)
            force((x) => x + 1)
          },
        }) : null,
        // ─── 全屏画布 overlay ───
        fsCanvas ? renderFsCanvas() : null,
        showHelp ? h(HelpOverlay, { onClose: () => setShowHelp(false) }) : null,
        // ─── 全局轻提示（v11.2.1：画布页也渲染）───
        // 当初排除画布页的理由：画布模式把最后一条 toast 写进底部状态栏兜底。实测等于不可见——
        // 状态栏只有最后一条、无着色无关闭、5 秒即逝，连线「已改接」「会形成环」反馈用户从未
        // 看到，防环拒绝=无声无效（第三方审计断裂 #3）。理由已失效：两处统一为浮动堆叠，
        // 删除页脚回显。底部居中(bottom:56px)天然避让画布悬浮条（GenBar 顶部/缩放控件左下/
        // 状态栏高 28px）。
        // P2-2：队列化多槽堆叠（上限 4），严重度着色，长文案换行，可手动关闭
        toasts.length ? h('div', { className: 'snx-toasts' },
          toasts.map((t) => h('div', { key: t.id, className: 'snx-toast', 'data-kind': t.kind, role: 'status' },
            h('span', { className: 'snx-toast-msg' }, t.msg),
            h('button', { type: 'button', className: 'snx-toast-x', title: '关闭', onClick: () => dismissToast(t.id) }, ic('x', 12)),
          )),
        ) : null,
        // ─── 状态栏（画布模式才显示）───
        mode === 'canvas' ? h('footer', { className: 'snx-pro-status' },
          h('span', null, `${store.doc.nodes.length} 张图 · 选中 ${store.sel.size}`),
          h('span', null, maskId ? '蒙版模式：在图上涂抹' : '滚轮缩放 / 空格平移'),
          h('div', { style: { flex: 1 } }),
          // v11.2.1：页脚 toast 回显已删——浮动堆叠全模式统一渲染，不再两处显示
          h('span', { id: 'snx-cv-save' }, ''),
        ) : null,
        // ─── 上下文菜单（v11.2：portal 挂 body，全屏画布共用同一实例——删除 renderFsCanvas 里的第二个）───
        h(ContextMenu, {
          menu, engineRef, setMenu, busy, setBusy, onRestoreParams, onExportCanvas,
          onOpenLightbox: (n) => setLightbox(n),
          onClearAll: askClearCanvas,
          // SPEC-14 ②：菜单补项——画廊定位 / 设为对比 / 批量下载的动作都在 Workbench 层
          notify,
          onLocateInGallery: locateInGallery,
          onAddCompare: addNodeToCompare,
          onBatchDownload: batchDownloadNodes,
        }),
        // ─── P1-3：画廊右键菜单（单选/多选两套，portal 挂 body，外点关闭）───
        galMenu ? h(GalContextMenu, {
          menu: galMenu,
          boards: boardsByRecent(),   // SPEC-16 三：右键「移入画板」子列表按最近使用倒序
          selIds: [...galSel],
          onClose: () => setGalMenu(null),
          onOpenBoardList: () => setGalMenu((m) => (m ? Object.assign({}, m, { boardList: true }) : m)),
          onBackBoardList: () => setGalMenu((m) => (m ? Object.assign({}, m, { boardList: false }) : m)),
          onLightbox: (n) => { setGalMenu(null); setLightbox(n) },
          onDownload: (ids) => { setGalMenu(null); downloadNodes(ids) },
          onFav: (ids, on) => { setGalMenu(null); toggleGalFav(ids, on) },
          onMove: (ids, boardId) => { setGalMenu(null); moveNodesToBoard(ids, boardId) },
          onDelete: (ids) => { setGalMenu(null); askGalDelete(ids) },
          onEdit: (n) => {
            setGalMenu(null)
            store.sel = new Set([n.id])
            setMode('canvas')
            force((x) => x + 1)
            notify('已在画布选中这张图')
          },
        }) : null,
        // ─── P1-14：应用内确认弹窗（promise 化，替换全部 7 处原生 confirm）───
        // v12：altLabel/altIcon → 第三按钮（删画板「仅删除画板(保留图)」），onAlt resolve 'alt'
        cfm ? h(SnxConfirm, {
          title: cfm.title, desc: cfm.desc,
          confirmLabel: cfm.confirmLabel, confirmIcon: cfm.confirmIcon,
          altLabel: cfm.altLabel, altIcon: cfm.altIcon,
          onConfirm: () => closeConfirm(true),
          onAlt: () => closeConfirm('alt'),
          onCancel: () => closeConfirm(false),
        }) : null,
        // ─── P1-3：拖拽归类 ghost（跟随指针，portal 挂 body）───
        galDragActive ? portalToBody(h('div', {
          className: 'snx-gal-drag-ghost', ref: galGhostRef,
          style: { left: '-9999px', top: '-9999px' },
        }, ic('images', 12), galDragActive.count + ' 张 · 拖到画板归类')) : null,
      )

      // ====================================================
      // 子视图：GEN mode — 专业生图台
      // ====================================================
      function renderGenMode() {
        const lastNode = store.doc.nodes.length > 0
          ? store.doc.nodes[store.doc.nodes.length - 1]
          : null
        const selNode = store.sel.size === 1 ? store.node([...store.sel][0]) : null
        const heroNode = selNode || lastNode
        const anchorInfo = selNode && selNode.status === 'done' ? { node: selNode } : null
        return h('div', { className: 'snx-gen' },
          // ── 预览大图 ──
          h('div', { className: 'snx-gen-hero' + (heroNode ? '' : ' empty') },
            heroNode
              ? h(GenHero, {
                  node: heroNode,
                  onEdit: () => setMode('canvas'),
                  onRefresh: () => force((n) => n + 1),
                  onOpenLightbox: () => setLightbox(heroNode),
                  onUseAsAnchor: () => { /* anchor already set */ },
                })
              : h(GenHeroEmpty, { busy }),
            // 空状态/忙时叠层
            busy ? h('div', { className: 'snx-gen-hero-busy' },
              h('div', { className: 'spin' }),
              h('div', { className: 'lbl' }, 'SenseNova 生成中…'),
            ) : null,
          ),
          // ── 提示词 + 控制 ──
          h(GenForm, {
            engineRef, busy, setBusy, notify,
            anchorInfo,
            keyOk,   // v12：决策面板 blocker 清单（SPEC ①）；队列等待数由 GenForm 面板展开期间从 store 现算
            galBoard,   // SPEC-15 ①：跟随画廊解析 + 决策面板目标行如实显示（画廊切筛选时 GenForm 重渲染）
            onClearAnchor: () => {
              store.sel = new Set()
              force((n) => n + 1)
            },
          }),
          // ── 最近画廊（横排缩略图）──
          h(GenRecent, {
            store, selId, setSelId,
            onOpen: () => setMode('gallery'),
            onOpenLightbox: (n) => setLightbox(n),
          }),
        )
      }

      // ====================================================
      // 子视图：CANVAS mode — 完整 Konva 画布
      // ====================================================
      // ── P2-10：蒙版工具条共享渲染（画布模式与全屏画布此前两处复制粘贴已分叉：
      // 全屏版缺画笔四滑块与预览圈）——收口成一份，两处同 UI 同行为 ──
      function renderMaskBar() {
        return h('div', { className: 'snx-maskbar v2' },
          // 画笔 4 滑块（v8）
          h('div', { className: 'snx-brush-controls' },
            h('span', { className: 'lb' }, ic('brush'), ' 画笔'),
            h('label', { className: 'br-row' },
              h('span', { className: 'br-k' }, '大小'),
              h('input', { type: 'range', min: 8, max: 200, value: brush,
                onChange: (e) => setBrush(parseInt(e.target.value, 10)) }),
              h('span', { className: 'br-v' }, brush + 'px'),
            ),
            h('label', { className: 'br-row' },
              h('span', { className: 'br-k' }, '不透明'),
              h('input', { type: 'range', min: 10, max: 100, value: brushOpacity,
                onChange: (e) => setBrushOpacity(parseInt(e.target.value, 10)) }),
              h('span', { className: 'br-v' }, brushOpacity + '%'),
            ),
            h('label', { className: 'br-row' },
              h('span', { className: 'br-k' }, '硬度'),
              h('input', { type: 'range', min: 0, max: 100, value: brushHardness,
                onChange: (e) => setBrushHardness(parseInt(e.target.value, 10)) }),
              h('span', { className: 'br-v' }, brushHardness + '%'),
            ),
            h('label', { className: 'br-row' },
              h('span', { className: 'br-k' }, '羽化'),
              h('input', { type: 'range', min: 0, max: 100, value: brushFeather,
                onChange: (e) => setBrushFeather(parseInt(e.target.value, 10)) }),
              h('span', { className: 'br-v' }, brushFeather + '%'),
            ),
          ),
          h('input', { type: 'text', value: maskPrompt,
            onChange: (e) => setMaskPrompt(e.target.value),
            onKeyDown: (e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) applyMask() },
            placeholder: '这块区域要改成什么？' }),
          h('button', { onClick: () => { const st = maskRef.current; if (st) { st.strokes.pop(); if (st.redraw) st.redraw() } } }, ic('rotate-ccw', 12), ' 撤一笔'),
          h('button', { onClick: cancelMask }, ic('x', 12), ' 取消'),
          h('button', { className: 'go', onClick: applyMask, disabled: busy }, busy ? h('span', { className: 'snx-spinring' }) : ic('check'), ' 应用生成'),
          // 画笔预览圈（跟鼠标走）
          brushCursor.show ? h('div', {
            className: 'snx-brush-cursor',
            style: {
              left: brushCursor.x + 'px', top: brushCursor.y + 'px',
              width: brush + 'px', height: brush + 'px',
              marginLeft: -(brush / 2) + 'px', marginTop: -(brush / 2) + 'px',
              opacity: brushOpacity / 100,
            },
          }) : null,
        )
      }

      function renderCanvasMode() {
        return h('div', { className: 'snx-canvas-wrap' },
          // 顶部：画布工具条（GenBar）+ 全屏展开按钮
          !maskId && ready && !loadErr ? h(GenBar, { engineRef, busy, setBusy, notify }) : null,
          h('button', {
            className: 'snx-canvas-fs',
            type: 'button',
            onClick: () => setFsCanvas(true),
            title: '展开全屏画布（Esc 退出）',
          }, ic('maximize'), ' 展开'),
          // Konva 容器（全屏画布打开时让出 wrapRef，避免两个元素争抢同一 ref 导致 detach 死锁）
          !fsCanvas ? h('div', { className: 'snx-canvas-stage', ref: wrapRef },
            loadErr ? h('div', { className: 'snx-canvas-err' }, loadErr) : null,
            // 空画布提示
            ready && !loadErr && store.doc.nodes.length === 0 && !maskId ? h('div', { className: 'snx-canvas-empty' },
              h('div', { className: 'big' }, ic('wand-sparkles', 42)),
              h('div', { className: 't1' }, '画布为空'),
              h('div', { className: 't2' }, '在「生图」标签里输入提示词，或粘贴/拖入图像'),
            ) : null,
            // 蒙版工具条（P2-10：与全屏画布共用 renderMaskBar）
            maskId ? renderMaskBar() : null,
            // SPEC-18 四：minimap（挂画布容器内=正确定位上下文;组件自订阅 store+viewHooks）
            !maskId && ready && !loadErr ? h(Minimap, { engineRef }) : null,
            // 浮动操作条（v11.2.1：单选 done 图或多选 ≥2 时都渲染）
            (selDone || selMulti) && engineRef.current ? h(ActionBar, {
              engineRef, busy, setBusy, notify, multi: selMulti, viewTick: undefined,
              onInpaint: (n) => enterMask(n),
              onErase: (n) => enterMask(n, true),
              onOutpaint: (n) => {
                const c = store.doc.camera
                const sx = n.x * c.scale + c.x
                const sy = n.y * c.scale + c.y
                setRatioAt({
                  x: Math.min(Math.max(8, sx + 240), window.innerWidth - 400),
                  y: Math.min(sy + 40, window.innerHeight - 120),
                  nodeId: n.id, label: '',
                })
              },
            }) : null,
            h(PendingOverlay, { engineRef }),
            ratioAt ? h(RatioPopup, {
              at: ratioAt, onPick: (r) => applyOutpaint(r), onClose: () => setRatioAt(null),
            }) : null,
            // 缩放控件
            h('div', { className: 'snx-cv-zoom' },
              h('button', { onClick: () => engineRef.current && engineRef.current.zoomBy(1 / 1.25), title: '缩小' }, ic('minus', 13)),
              h('div', { className: 'pct' }, Math.round(((store.doc.camera && store.doc.camera.scale) || 1) * 100) + '%'),
              h('button', { onClick: () => engineRef.current && engineRef.current.zoomBy(1.25), title: '放大' }, ic('plus', 13)),
              h('button', { onClick: () => engineRef.current && engineRef.current.fit(), title: '适应', style: { width: 'auto', padding: '0 8px' } }, ic('maximize')),
              h('button', { onClick: () => { arrangeByChain(); notify && notify('已按生成链整理布局') }, title: '整理布局：按生成链分层排列', style: { width: 'auto', padding: '0 8px' } }, ic('grid-2x2')),
            ),
          ) : null,
        )
      }

      // ====================================================
      // 子视图：GALLERY mode — 全部生成历史
      // ====================================================
      function renderGalleryMode() {
        // v8：画廊检索 + 标签 + 收藏筛选（状态提升见 Workbench 顶部的 gal* 四件套）
        const [q, setQ] = [galQ, setGalQ]
        const [tagFilter, setTagFilter] = [galTag, setGalTag]
        const [sortBy, setSortBy] = [galSort, setGalSort]
        const [favOnly, setFavOnly] = [galFav, setGalFav]
        const [boardFilter, setBoardFilter] = [galBoard, setGalBoard]
        const boards = store.doc.boards || (store.doc.boards = [])
        const boardsRecent = boardsByRecent()   // SPEC-16 三：chips/移入下拉按最近使用倒序渲染（无 lastUsed 沉底保持原序）
        const [bdCreating, setBdCreating] = [galBdCreating, setGalBdCreating]
        const [bdName, setBdName] = [galBdName, setGalBdName]
        const createBoard = () => {
          const name = bdName.trim()
          if (!name) return
          store.pushUndo()   // v11.2：新建画板入撤销栈
          store.doc.boards = (store.doc.boards || []).concat([{ id: nid(), name }])
          autosave(); setGalBdName(''); setGalBdCreating(false); force((x) => x + 1)
        }
        // P0-2：画廊只渲染完成图；生成中/失败给占位卡，不再渲染 src='' 的破图块
        let nodes = store.doc.nodes.slice().reverse()
        // v10：画板筛选（空=全部；none=未分组）
        if (boardFilter === 'none') nodes = nodes.filter((n) => !n.boardId)
        else if (boardFilter) nodes = nodes.filter((n) => n.boardId === boardFilter)
        const pendingCards = nodes.filter((n) => n.status === 'pending' || n.status === 'running')
        const errorCards = nodes.filter((n) => n.status === 'error')
        nodes = nodes.filter((n) => n.status === 'done')
        // 提取全部 tags
        const allTags = Array.from(new Set(nodes.flatMap((n) => (n.tags || []))))
        // P2-3：标签现在可写（灯箱编辑），被删干净的过滤标签自动失效，避免静默空结果
        const effTagFilter = tagFilter && allTags.includes(tagFilter) ? tagFilter : ''
        // 过滤
        if (q.trim()) {
          const q2 = q.trim().toLowerCase()
          nodes = nodes.filter((n) => (n.prompt || '').toLowerCase().includes(q2) || (n.params && n.params.model || '').toLowerCase().includes(q2))
        }
        if (effTagFilter) nodes = nodes.filter((n) => (n.tags || []).includes(effTagFilter))
        if (favOnly) nodes = nodes.filter((n) => n.favorite)
        // 排序
        if (sortBy === 'size') nodes.sort((a, b) => ((b.w || 0) * (b.h || 0)) - ((a.w || 0) * (a.h || 0)))
        // 否则按时间倒序（默认）
        // P1-3：Shift 范围选基准 = 当前可见完成图的顺序；多选集合过滤出仍存在的
        galVisIdsRef.current = nodes.map((m) => m.id)
        const galSelIds = [...galSel].filter((id) => { const n = store.node(id); return n && n.status === 'done' && n.src })
        // SPEC-17 一.5：跨筛选计数——多选后切筛选（画板/搜索/标签/收藏），所选图可能不可见。
        // 批量操作仍对全部选中生效，故只做文案提示、不自动缩选
        const galSelVisSet = new Set(galVisIdsRef.current)
        const galSelInFilter = galSelIds.filter((id) => galSelVisSet.has(id)).length
        return h('div', { className: 'snx-gal' },
          // v10：画板筛选条
          h('div', { className: 'snx-gal-bar' },
            h('span', { className: 'lbl', style: { margin: 0 } }, ic('folder-plus'), '画板'),
            h('button', { className: 'chip' + (boardFilter === '' ? ' on' : ''), type: 'button', onClick: () => setGalBoard('') }, '全部'),
            h('button', {
              className: 'chip' + (boardFilter === 'none' ? ' on' : '') + (galDragOver === 'none' ? ' droptgt' : ''), type: 'button',
              'data-galboard': 'none',
              onClick: () => setGalBoard('none'),
              title: '拖图到这里移出画板',
            }, '未分组'),
            boardsRecent.map((b) => h('button', {
              key: b.id, className: 'chip' + (boardFilter === b.id ? ' on' : '') + (galDragOver === b.id ? ' droptgt' : ''), type: 'button',
              'data-galboard': b.id,
              onClick: () => setGalBoard(b.id),
              title: '拖图到这里归入画板；右键删除画板（可选仅删板保留图，或连图一起删除）',
              onContextMenu: async (e) => {
                e.preventDefault()
                // v12（SPEC 三.4，对标 InvokeAI DeleteBoardModal）：确认列出「画板内 N 张图」+
                // 双按钮「仅删除画板(保留图)」/「连图一起删除」(红)；板内图被板外节点作父图
                // 引用时给警告行（连图删除会断衍生链）
                const inNodes = store.doc.nodes.filter((nn) => nn.boardId === b.id)
                const outsideRef = inNodes.filter((nn) => store.doc.nodes.some((m) => m.parentId === nn.id && m.boardId !== b.id)).length
                const r = await askConfirm({
                  title: '删除画板「' + b.name + '」？',
                  confirmLabel: '连图一起删除', confirmIcon: 'trash-2',
                  altLabel: '仅删除画板（保留图）', altIcon: 'folder',
                  desc: '画板内 ' + inNodes.length + ' 张图。'
                    + (outsideRef ? '注意：其中 ' + outsideRef + ' 张被画板外的图作父图引用，「连图一起删除」会断开对应「衍生自」链。' : ''),
                })
                if (!r) return
                store.pushUndo()   // P1-10：删画板（两种方式都动归属/节点）入撤销栈
                store.doc.boards = boards.filter((x) => x.id !== b.id)
                if (r === true) {
                  // 连图一起删除：板内图一并移除，画布选中/画廊多选/灯箱同步清理
                  const idSet = new Set(inNodes.map((nn) => nn.id))
                  store.doc.nodes = store.doc.nodes.filter((nn) => !idSet.has(nn.id))
                  store.sel = new Set([...store.sel].filter((id) => !idSet.has(id)))
                  setGalSel((prev) => new Set([...prev].filter((id) => !idSet.has(id))))
                  if (galAnchor && idSet.has(galAnchor)) setGalAnchor(null)
                  setLightbox((lb) => (lb && idSet.has(lb.id) ? null : lb))
                  notify('已删除画板「' + b.name + '」及其中 ' + idSet.size + ' 张图')
                  await saveNow()   // SPEC-14 二.3：直存带 rev，409 时重载远端基线
                } else {
                  // 仅删除画板：图保留，回到未分组
                  store.doc.nodes.forEach((nn) => { if (nn.boardId === b.id) delete nn.boardId })
                  notify('已删除画板「' + b.name + '」，' + inNodes.length + ' 张图回到未分组')
                }
                if (galBoard === b.id) setGalBoard('')
                // SPEC-13 ②/SPEC-15 ①：被删画板若是当前「目标画板」/跟随画板，同步回未分组——
                // 手动路径清 targetBoard；跟随路径 setGalBoard('') 经镜像进 genPrefs.galBoard，防落悬空 id
                if (genPrefs.targetBoard === b.id) genPrefs.targetBoard = ''
                autosave(); force((x) => x + 1)
              },
            }, b.name)),
            bdCreating ? h('span', { style: { display: 'inline-flex', gap: '4px', alignItems: 'center' } },
              h('input', {
                placeholder: '画板名称', value: bdName, autoFocus: true,
                onChange: (e) => setBdName(e.target.value),
                onKeyDown: (e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) createBoard(); if (e.key === 'Escape') { setBdCreating(false); setBdName('') } },
                style: { background: 'var(--dsw-alias-bg-module-platform,#353638)', border: '1px solid var(--snx-accent)', borderRadius: '6px', color: 'var(--dsw-alias-label-primary,#f9fafb)', padding: '3px 8px', fontSize: '11.5px', fontFamily: 'inherit', width: '120px', outline: 'none' },
              }),
              h('button', { className: 'chip on', type: 'button', onClick: createBoard, disabled: !bdName.trim(), style: { opacity: bdName.trim() ? 1 : 0.5 } }, ic('check', 12)),
              h('button', { className: 'chip', type: 'button', onClick: () => { setBdCreating(false); setBdName('') } }, ic('x', 12)),
            ) : h('button', { className: 'chip', type: 'button', title: '新建画板', onClick: () => setGalBdCreating(true) }, ic('plus', 12), ' 新建'),
            h('div', { style: { flex: 1 } }),
          ),
          h('div', { className: 'snx-gal-bar' },
            h('span', null, `完成 ${nodes.length} 张 / 共 ${store.doc.nodes.length} 张`
              + (pendingCards.length ? ` · 生成中 ${pendingCards.length}` : '')
              + (errorCards.length ? ` · 失败 ${errorCards.length}` : '')),
            h('div', { style: { flex: 1 } }),
            store.doc.nodes.length > 0 ? h('button', {
              className: 'snx-gal-btn',
              onClick: async () => {
                // P1-14：原生 confirm → SnxConfirm；入 undo 栈让清空可撤销（与删除同链路）
                const ok = await askConfirm({
                  title: '清空画廊？',
                  confirmLabel: '清空', confirmIcon: 'trash-2',
                  desc: '将移除全部 ' + store.doc.nodes.length + ' 张图（画布与画廊同时清空）。已生成的文件保留在磁盘；可回画布页按 Ctrl+Z 撤销。',
                })
                if (!ok) return
                store.pushUndo()
                store.doc.nodes = []
                store.sel = new Set()
                setGalSel(new Set()); setGalAnchor(null)
                force((n) => n + 1)
                await saveNow()   // SPEC-14 二.3：直存带 rev，409 时重载远端基线
              },
            }, ic('trash-2'), ' 清空') : null,
          ),
          // v8：搜索 + 标签 + 排序 + 收藏筛选
          store.doc.nodes.length > 0 ? h('div', { className: 'snx-gal-tools' },
            h('input', {
              className: 'snx-gal-q',
              placeholder: '搜索提示词 / 模型…',
              value: q,
              onChange: (e) => setQ(e.target.value),
            }),
            h(SnxSelect, { value: sortBy, onChange: (v) => setSortBy(v), width: 108, options: [
              { value: 'time', label: '时间' }, { value: 'size', label: '尺寸' },
            ] }),
            h('button', {
              className: 'snx-gal-fav' + (favOnly ? ' on' : ''),
              onClick: () => setFavOnly(!favOnly),
              type: 'button', title: '只看收藏',
            }, [ic('star', 12), ' 收藏']),
            allTags.length > 0 ? h('div', { className: 'snx-gal-tags' },
              h('button', {
                className: 'snx-gal-tag' + (!effTagFilter ? ' on' : ''),
                onClick: () => setTagFilter(''), type: 'button',
              }, '全部'),
              allTags.map((t) => h('button', {
                key: t,
                className: 'snx-gal-tag' + (effTagFilter === t ? ' on' : ''),
                onClick: () => setTagFilter(effTagFilter === t ? '' : t), type: 'button',
              }, '#' + t)),
            ) : null,
          ) : null,
          (nodes.length === 0 && !pendingCards.length && !errorCards.length) ? h('div', { className: 'snx-gal-empty' },
            h('div', { className: 'big' }, ic('images', 42)),
            h('div', { className: 't1' }, q || effTagFilter || favOnly ? '没有匹配的图' : '画廊为空'),
            h('div', { className: 't2' }, q || effTagFilter || favOnly ? '试试清除筛选条件' : '「生图」里跑一张，或让 agent 帮你生成'),
          ) : h('div', { className: 'snx-gal-grid' },
            // P0-2：生成中/失败占位卡（无 src 不渲染破图）；失败详情进队列或灯箱看
            pendingCards.map((n) => h('div', { key: n.id, className: 'snx-gal-item ph', title: (n.prompt || '') + '（生成中）' },
              h('div', { className: 'snx-gal-item-img snx-gal-ph-img' }, h('span', { className: 'snx-spinring' })),
              h('div', { className: 'snx-gal-item-meta' },
                h('div', { className: 'snx-gal-item-pr' }, '生成中…'),
                h('div', { className: 'snx-gal-item-sub' }, (n.prompt || '').slice(0, 40)),
              ),
            )),
            errorCards.map((n) => h('div', { key: n.id, className: 'snx-gal-item ph ph-err', title: (n.errMsg || n.error || '生成失败') },
              h('div', { className: 'snx-gal-item-img snx-gal-ph-img' }, ic('triangle-alert', 22)),
              h('div', { className: 'snx-gal-item-meta' },
                h('div', { className: 'snx-gal-item-pr' }, '生成失败'),
                h('div', { className: 'snx-gal-item-sub' }, String(n.errMsg || n.error || '').slice(0, 40)),
              ),
            )),
            // P1-3：点击语义分层——单击选中 / Ctrl 切换多选 / Shift 范围 / 双击灯箱 / 右键菜单
            nodes.map((n) => h(GalleryItem, {
              key: n.id, node: n,
              selected: galSel.has(n.id),
              locateFlash: locateId === n.id,   // SPEC-14 ②：画布右键「在画廊中定位」高亮闪
              onItemClick: onGalItemClick,
              onItemDoubleClick: () => setLightbox(n),
              onItemContext: onGalItemContext,
              onItemPointerDown: onGalItemPointerDown,
              ops: [
                { key: 'ref', icon: 'image-plus', title: '设为参考图（去生图表单改这张图）', onClick: () => useGalAsRef(n) },
                { key: 'dl', icon: 'download', title: '下载', onClick: () => downloadNodes([n.id]) },
                { key: 'fav', icon: 'star', title: n.favorite ? '取消收藏' : '收藏', active: !!n.favorite, onClick: () => toggleGalFav([n.id], !n.favorite) },
                { key: 'del', icon: 'trash-2', title: '删除（应用内确认）', danger: true, onClick: () => askGalDelete([n.id]) },
              ],
            })),
          ),
          // P1-3：浮动已选计数 + 批量条（重操作集中在此；删除走应用内确认，不用原生 confirm）
          // SPEC-17 一.5：跨筛选计数提示——部分选中图不在当前筛选时，计数后追加「(M 张在当前筛选)」，
          // 悬浮 title 说明批量操作仍对全部选中生效（操作本身不吃可见性过滤）
          galSelIds.length ? h('div', { className: 'snx-gal-bulk' },
            h('span', {
              className: 'ct',
              title: galSelInFilter < galSelIds.length
                ? '部分选中图不在当前筛选（画板/搜索/标签/收藏）内不可见；批量操作仍对全部 ' + galSelIds.length + ' 张生效'
                : '批量操作对选中的全部完成图生效',
            }, galSelIds.length + ' 张已选'
              + (galSelInFilter < galSelIds.length ? '（' + galSelInFilter + ' 张在当前筛选）' : '')),
            h(SnxSelect, {
              value: '', width: 132,
              onChange: (v) => moveNodesToBoard(galSelIds, v),
              options: [{ value: '', label: '移入画板…' }, { value: 'none', label: '未分组（移出）' }]
                .concat(boardsRecent.map((b) => ({ value: b.id, label: b.name }))),
            }),
            // SPEC-15 ②：多选 ≥2 张完成图 →「批量变体」（与批量下载动作同排复用 .bt 样式；busy 态防连点）
            galSelIds.length >= 2 ? h('button', {
              type: 'button', className: 'bt', disabled: galVarBusy,
              title: '对选中的完成图逐张入队变体任务（串行防限流，变体图落在各自原图旁）',
              onClick: () => batchVariantNodes(galSelIds),
            }, ic('shuffle', 13), galVarBusy ? '变体中…' : '批量变体') : null,
            // SPEC-16 四：多选 ≥2 张完成图 →「批量导出」（与批量变体/删除同排复用 .bt 样式；busy 态防连点）——
            // 逐张走灯箱单张导出的嵌入元数据管线（PNG tEXt 恒定嵌入），250ms 间隔防拦截
            galSelIds.length >= 2 ? h('button', {
              type: 'button', className: 'bt', disabled: galExpBusy,
              title: '逐张导出选中的完成图为 PNG，每张嵌入提示词/参数元数据（tEXt），间隔 250ms 防拦截',
              onClick: () => batchExportNodes(galSelIds),
            }, ic('package', 13), galExpBusy ? '导出中…' : '批量导出') : null,
            // SPEC-17 一：多选 ≥2 张完成图 →「批量导出 zip」——客户端 store-only zip 打包成单个文件下载
            // （无外部依赖），每张同上嵌入 tEXt；条目名=序号-提示词前 20 字.png；下载名=snx-canvas-日期.zip。
            // busy 与「批量导出」共用 galExpBusy（两者都是重导出动作，不并跑）
            galSelIds.length >= 2 ? h('button', {
              type: 'button', className: 'bt', disabled: galExpBusy,
              title: '把选中的完成图打包成一个 zip 下载：每张嵌入提示词/参数元数据（tEXt，与单张导出同管线），条目名=序号-提示词前 20 字.png',
              onClick: () => batchExportZipNodes(galSelIds),
            }, ic('download', 13), galExpBusy ? '打包中…' : '批量导出 zip') : null,
            h('button', { type: 'button', className: 'bt danger', onClick: () => askGalDelete(galSelIds) }, ic('trash-2', 13), '删除'),
            h('button', {
              type: 'button', className: 'bt', title: '清空选择',
              onClick: () => { setGalSel(new Set()); setGalAnchor(null) },
            }, ic('x', 13), '清空'),
          ) : null,
        )
      }

      // ====================================================
      // 子视图：QUEUE — 并发生成队列（pending / running / done / error）
      // ====================================================
      function renderQueueMode() {
        // SPEC-13 ②：显示全部历史=关 → 现行为原样（进行中+失败+60 秒内完成，单遍倒序）；
        // 开 → 进行中之外再列全部 done/error 节点，按完成时间戳倒序（旧行可展开审讯）
        const jobs = (() => {
          if (!queueShowAllHist) return store.doc.nodes.slice().reverse()
            .filter((n) => n.status === 'pending' || n.status === 'running' || n.status === 'error' || (n.status === 'done' && Date.now() - (n.ts || 0) < 60_000))
          return store.doc.nodes.slice().reverse()
            .filter((n) => n.status === 'pending' || n.status === 'running')
            .concat(store.doc.nodes
              .filter((n) => n.status === 'done' || n.status === 'error')
              .sort((a, b) => (b.ts || 0) - (a.ts || 0)))
        })()
        const running = jobs.filter((n) => n.status === 'running').length
        const pending = jobs.filter((n) => n.status === 'pending').length
        const done = jobs.filter((n) => n.status === 'done').length
        const error = jobs.filter((n) => n.status === 'error').length
        const allJobs = store.doc.nodes.filter((n) => n.status === 'pending' || n.status === 'running')
        // 完成进度 = done/(done+error+pending+running)——原为 running/allJobs 并发占用比（全部等待时恒 0%，语义不对）
        const finishedPct = Math.round(100 * done / Math.max(1, done + error + pending + running))
        return h('div', { className: 'snx-queue' },
          // 队列总览
          h('div', { className: 'snx-queue-summary' },
            h('div', { className: 'stat running' },
              h('div', { className: 'n' }, running),
              h('div', { className: 'lb' }, '运行中'),
              h('div', { className: 'dot' }),
            ),
            h('div', { className: 'stat pending' },
              h('div', { className: 'n' }, pending),
              h('div', { className: 'lb' }, '等待中'),
            ),
            h('div', { className: 'stat done' },
              h('div', { className: 'n' }, done),
              h('div', { className: 'lb' }, '已完成'),
            ),
            h('div', { className: 'stat error' },
              h('div', { className: 'n' }, error),
              h('div', { className: 'lb' }, '失败'),
            ),
            h('div', { style: { flex: 1 } }),
            // SPEC-18 二：并发上限选择器——闸值即「同时在跑的生成数」，等待表顺序=执行顺序
            h('label', { className: 'snx-queue-conc', title: '全局并发生成上限。等待中的任务按等待表顺序补位，可在任务行用上移/下移/置顶（插队）按钮重排。注意：SenseNova 官方上游有 RPS 限流，并发 >1 可能撞 429（rps exhausted），失败任务可「重跑失败」恢复' },
              ic('layers', 13),
              h('select', {
                value: String(genConcLimit()),
                onChange: (e) => {
                  genConcSet(parseInt(e.target.value, 10))
                  force((x) => x + 1)
                  try { notify && notify('并发上限已设为 ' + e.target.value + '（立即生效）') } catch { }
                },
              },
                [1, 2, 3, 4].map((v) => h('option', { key: v, value: String(v) }, '并发 ' + v)),
              ),
            ),
            // SPEC-13 ②：队列「显示全部历史」toggle——关=现行为；开=全部 done/error 按时间倒序可展开审讯
            h('button', {
              className: 'snx-queue-hist' + (queueShowAllHist ? ' on' : ''),
              type: 'button',
              'aria-pressed': queueShowAllHist,
              onClick: () => { queueShowAllHist = !queueShowAllHist; force((x) => x + 1) },
              title: queueShowAllHist
                ? '已开启：列出全部已完成/失败任务（按时间倒序）。点击关闭回到只看进行中/失败/最近完成（60 秒内）'
                : '已关闭：只显示进行中/失败/最近完成（60 秒内）。点击开启列出全部已完成/失败任务（按时间倒序）',
            }, [ic('history'), ' 显示全部历史']),
            h('button', {
              className: 'snx-queue-cancel',
              type: 'button',
              onClick: () => { setQueuePaused(!queuePaused); force((x) => x + 1) },
              title: queuePaused ? '恢复队列（等待中的任务继续跑）' : '暂停队列（等待中的任务先不跑，进行中的不打断）',
            }, queuePaused ? [ic('play'), ' 继续队列'] : [ic('pause'), ' 暂停队列']),
            error > 0 ? h('button', {
              className: 'snx-queue-cancel',
              type: 'button',
              title: '重跑失败任务（用户主动取消的不在列）',
              onClick: async () => {
                // P1-8：重跑失败跳过用户主动取消的项（errMsg=用户取消），只重跑真失败的
                const errs = store.doc.nodes.filter((n) => n.status === 'error' && !isCancelled(n.id))
                if (!errs.length) { notify('没有可重跑的失败任务（主动取消的不自动重跑）'); return }
                const ok = await askConfirm({
                  title: '重跑 ' + errs.length + ' 个失败任务？',
                  confirmLabel: '重跑', confirmIcon: 'rotate-ccw',
                  desc: '按原参数重新生成这 ' + errs.length + ' 张；用户主动取消的任务不会重跑。',
                })
                if (!ok) return
                errs.forEach((n) => {
                  n.status = 'pending'; n.errMsg = ''; n._queuedAt = Date.now()   // v12：重跑重新计时
                  runOne(n.id, {
                    prompt: n.prompt, size: (n.params && n.params.size) || '2048x2048',
                    model: (n.params && n.params.model) || '',
                    reference: (n.params && n.params.reference) || undefined,
                    negative: (n.params && n.params.negative) || undefined,
                    seed: (n.params && typeof n.params.seed === 'number') ? n.params.seed : undefined,
                    refs: (Array.isArray(n.params && n.params.refs) ? n.params.refs : []).filter((r) => r && r.src),
                  })
                })
                force((x) => x + 1)
              },
            }, ic('rotate-ccw'), ' 重跑失败') : null,
            error > 0 ? h('button', {
              className: 'snx-queue-cancel',
              type: 'button',
              title: '从文档移除全部失败记录（含主动取消的），腾出队列视图',
              onClick: async () => {
                const errs = store.doc.nodes.filter((n) => n.status === 'error')
                if (!errs.length) return
                const ok = await askConfirm({
                  title: '清除 ' + errs.length + ' 条失败记录？',
                  confirmLabel: '清除', confirmIcon: 'trash-2',
                  desc: '将从画布移除这些失败/已取消的占位节点；不影响已完成与进行中的任务。可回画布页按 Ctrl+Z 撤销。',
                })
                if (!ok) return
                store.pushUndo()
                const ids = new Set(errs.map((n) => n.id))
                store.doc.nodes = store.doc.nodes.filter((n) => !ids.has(n.id))
                store.sel = new Set([...store.sel].filter((id) => !ids.has(id)))
                store.emit(); force((x) => x + 1)
                autosave()
                notify('已清除 ' + ids.size + ' 条失败记录')
              },
            }, ic('circle-x'), ' 清除已失败') : null,
            allJobs.length > 0 ? h('button', {
              className: 'snx-queue-cancel',
              type: 'button',
              onClick: async () => {
                const ok = await askConfirm({
                  title: '取消全部 ' + allJobs.length + ' 个未完成任务？',
                  confirmLabel: '全部取消', confirmIcon: 'circle-x',
                  desc: '等待中的任务不再开跑；正在进行的请求会立即中断（记为「用户取消」，重跑失败时不会自动复活它们）。',
                })
                if (!ok) return
                for (const n of allJobs) cancelJob(n.id)
                force((x) => x + 1)
                autosave()
              },
            }, ic('circle-x'), ' 全部取消') : null,
            // SPEC-14 二.4：「取消其他」=只取消全部 pending、保留当前 running（区别于「全部取消」）。
            // 有未完成任务时出现在操作区，仅在「存在运行中任务且 pending>0」时可用
            allJobs.length > 0 ? h('button', {
              className: 'snx-queue-cancel',
              type: 'button',
              disabled: !(running > 0 && pending > 0),
              'aria-disabled': !(running > 0 && pending > 0),
              title: (running > 0 && pending > 0)
                ? '取消全部等待中的任务，保留正在运行的任务'
                : '需要同时有运行中和等待中的任务（当前运行 ' + running + ' 个 / 等待 ' + pending + ' 个）',
              onClick: async () => {
                const pends = store.doc.nodes.filter((n) => n.status === 'pending')
                if (!pends.length) return
                const ok = await askConfirm({
                  title: '取消其他 ' + pends.length + ' 个等待中任务？',
                  confirmLabel: '取消其他', confirmIcon: 'circle-x',
                  desc: '将取消 ' + pends.length + ' 个等待中的任务（不再开跑）；正在运行的 ' + running + ' 个任务保持不变。被取消任务记为「用户取消」，重跑失败时不会自动复活。',
                })
                if (!ok) return
                for (const n of pends) cancelJob(n.id)
                force((x) => x + 1)
                autosave()
              },
            }, ic('circle-x'), ' 取消其他') : null,
          ),
          // 进度条（全局）
          allJobs.length > 0 ? h('div', { className: 'snx-queue-progress' },
            h('div', { className: 'bar' },
              h('div', {
                className: 'fill',
                style: {
                  width: finishedPct + '%',
                },
              }),
            ),
            h('div', { className: 'lbl' }, `${running} 在跑 · ${pending} 等待 · 限并发 ${genConcLimit()} · ${finishedPct}% 完成`),
          ) : null,
          // 任务列表
          h('div', { className: 'snx-queue-list' },
            jobs.length === 0 ? h('div', { className: 'snx-queue-empty' },
              h('div', { className: 'big' }, ic('list-ordered', 42)),
              h('div', { className: 't1' }, '队列空闲'),
              h('div', { className: 't2' }, '在「生图」里点生成会进队列'),
            ) : jobs.map((n) => h(QueueItem, {
              key: n.id,
              node: n,
              hist: queueShowAllHist,   // SPEC-13 ②：全历史态下旧 done 节点耗时如实显示「未运行(历史)」
              onMove: (dir) => { genQueueMove(n.id, dir); force((x) => x + 1) },   // SPEC-18 二：等待表重排
              onCancel: () => {
                cancelJob(n.id)
                force((x) => x + 1)
              },
              onOpen: () => setLightbox(n),
              onRetry: async () => {
                n.status = 'pending'; n.errMsg = ''; n._queuedAt = Date.now()   // v12：重试重新计时
                force((x) => x + 1); autosave()
                const p = n.params || {}
                try { await runOne(n.id, {
                  prompt: n.prompt, size: p.size, model: p.model,
                  reference: p.reference || undefined,
                  negative: p.negative || undefined,
                  seed: typeof p.seed === 'number' ? p.seed : undefined,
                  refs: (Array.isArray(p.refs) ? p.refs : []).filter((r) => r && r.src),
                }) }
                catch (e) { n.status = 'error'; n.errMsg = String(e && e.message || e) }
                force((x) => x + 1); autosave()
              },
            })),
          ),
        )
      }

      // ====================================================
      // 子视图：COMPARE — 2 图三模式对比（滑块/并排/叠化+交换，v12）+ 3-4 图网格
      // ====================================================
      function renderCompareMode() {
        // P1-13：对比独立选择集合 cmpSel——不借用/不回写画布 store.sel，也不自动抓最后两张；
        // 画布选中变化与对比槽位完全解耦（进入 tab 不再重置选择）
        const allDone = store.doc.nodes.filter((n) => n.status === 'done')
        const selected = []
        for (const id of cmpSel) {
          const n = store.node(id)
          if (n && n.status === 'done') selected.push(n)
          else cmpSel.delete(id)   // 被删除的图自动出槽
        }
        const canAdd = selected.length < 4 && allDone.length > selected.length
        const toggleSel = (id) => {
          setCmpSel((prev) => {
            const nx = new Set(prev)
            if (nx.has(id)) nx.delete(id)
            else if (nx.size < 4) nx.add(id)
            return nx
          })
          force((x) => x + 1)
        }
        // 画廊池：画板筛选（'' 全部 / 'none' 未分组 / boardId）+ 池子扩大到 60 张
        const boards = boardsByRecent()   // SPEC-16 三：画板筛选下拉按最近使用倒序（本函数仅渲染消费）
        let pool = allDone
        if (cmpBoard === 'none') pool = pool.filter((n) => !n.boardId)
        else if (cmpBoard) pool = pool.filter((n) => n.boardId === cmpBoard)
        const poolShown = pool.slice().reverse().slice(0, 60)
        return h('div', { className: 'snx-cmp' },
          // 顶部选择器
          h('div', { className: 'snx-cmp-bar' },
            h('div', { className: 'snx-cmp-picks' },
              [0, 1, 2, 3].map((slot) => {
                const node = selected[slot]
                return h('div', {
                  key: slot,
                  className: 'snx-cmp-slot' + (node ? ' filled' : ''),
                },
                  node ? h('img', { src: node.src, alt: '' }) : ic('plus', 16),
                  node ? h('button', {
                    className: 'snx-cmp-slot-x',
                    type: 'button',
                    title: '移出对比',
                    onClick: () => toggleSel(node.id),
                  }, ic('x', 10)) : null,
                )
              }),
            ),
            h('div', { style: { flex: 1 } }),
            canAdd ? h(SnxSelect, {
              value: '', width: 150,
              onChange: (id) => {
                if (!id) return
                setCmpSel((prev) => {
                  const nx = new Set(prev)
                  if (nx.size < 4) nx.add(id)
                  return nx
                })
                force((x) => x + 1)
              },
              options: [{ value: '', label: '添加…' }].concat(
                allDone.filter((n) => !cmpSel.has(n.id)).slice(-40).reverse().map((n) =>
                  ({ value: n.id, label: (n.prompt || '—').replace(/^💬\s*/, '').slice(0, 36) })),
              ),
            }) : null,
          ),
          // 对比视图
          selected.length < 2 ? h('div', { className: 'snx-cmp-empty' },
            h('div', { className: 'big' }, ic('columns-2', 42)),
            h('div', { className: 't1' }, '选中 2-4 张图开始对比'),
            h('div', { className: 't2' }, '在下方画廊池单击加入对比（再点移出），画布选择不受影响'),
          ) : selected.length === 2 ? h(ComparePair, { a: selected[0], b: selected[1] }) :
            h(CompareGrid, { items: selected }),
          // 下方：选择池（点击 toggle；支持画板筛选）
          allDone.length > 0 ? h('div', { className: 'snx-cmp-pool' },
            h('div', { className: 'lb' },
              '画廊池 · 单击加入对比（' + poolShown.length + ' 张）',
              h(SnxSelect, {
                value: cmpBoard, width: 120,
                onChange: (v) => { setCmpBoard(v); force((x) => x + 1) },
                options: [{ value: '', label: '全部画板' }, { value: 'none', label: '未分组' }]
                  .concat(boards.map((b) => ({ value: b.id, label: b.name }))),
              }),
            ),
            poolShown.length ? h('div', { className: 'snx-cmp-pool-row' },
              poolShown.map((n) => h('button', {
                key: n.id,
                className: 'snx-cmp-pool-item' + (cmpSel.has(n.id) ? ' on' : ''),
                onClick: () => toggleSel(n.id),
                type: 'button',
                title: (n.prompt || '') + (cmpSel.has(n.id) ? '（点击移出对比）' : ''),
              },
                h('img', { src: n.src, alt: '', loading: 'lazy' }),
              )),
            ) : h('div', { className: 'snx-cmp-empty', style: { padding: '16px 20px' } },
              h('div', { className: 't2' }, '这个画板筛选下没有完成图'),
            ),
          ) : null,
        )
      }

      // ====================================================
      // 子视图：SETTINGS — 配置 Key / 模型默认 / 数据
      // ====================================================
      // ====================================================
      // 子视图：FULLSCREEN CANVAS — 展开到全屏的画布编辑器
      // ====================================================
      function renderFsCanvas() {
        // 派生 state：当前选中节点（用于左侧图层面板）
        const selNode = store.sel.size === 1 ? store.node([...store.sel][0]) : null
        return h('div', { className: 'snx-fs' },
          h('div', { className: 'snx-fs-top' },
            h('div', { className: 'snx-fs-brand' },
              h('span', { className: 'ti' }, ic('palette')),
              h('span', null, '画布编辑'),
              h('span', { className: 'cnt' }, store.doc.nodes.length + ' 张'),
            ),
            h('div', { style: { flex: 1 } }),
            h('span', { className: 'snx-fs-hint' }, 'Esc 退出'),
            h('button', { className: 'snx-fs-x', type: 'button', onClick: onExportCanvas, title: '全部可见图按布局合成一张 PNG' }, ic('download'), ' 导出画布'),
            h('button', { className: 'snx-fs-x', type: 'button', onClick: () => setFsCanvas(false) }, ic('x', 12), ' 退出全屏'),
          ),
          h('div', { className: 'snx-fs-body' },
            // 左侧图层面板
            h('aside', { className: 'snx-fs-layers' },
              h('div', { className: 'snx-fs-h' }, ic('layers'), ' 图层'),
              h('div', { className: 'snx-fs-layers-list' },
                store.doc.nodes.slice().reverse().map((n) => h('div', {
                  key: n.id,
                  className: 'snx-fs-layer' + (store.sel.has(n.id) ? ' on' : '') + (n.hidden ? ' off' : ''),
                  onClick: () => {
                    store.sel = new Set([n.id]); force((x) => x + 1)
                    // P1-15：点击=定位——平移相机把节点带到视口中心，保持缩放（此前全局 fit 重置视口）
                    engineRef.current && engineRef.current.focusNode && engineRef.current.focusNode(n.id)
                  },
                  title: (n.prompt || '').slice(0, 60),
                },
                  h('div', { className: 'snx-fs-layer-img' },
                    n.src ? h('img', { src: n.src, alt: '' }) :
                      h('span', null, n.status === 'running' ? h('span', { className: 'snx-spinring' }) : n.status === 'pending' ? ic('clock', 12) : n.status === 'error' ? ic('circle-x', 12) : ic('minus', 12)),
                  ),
                  h('div', { className: 'snx-fs-layer-info' },
                    h('div', { className: 'snx-fs-layer-pr' }, (n.prompt || '—').slice(0, 32)),
                    h('div', { className: 'snx-fs-layer-sub' },
                      h('span', { className: 'snx-fs-layer-st ' + ({ pending: 'st-pending', running: 'st-running', done: 'st-done', error: 'st-error' }[n.status] || '') }, STATUS_ZH[n.status] || n.status),
                      n.w && n.h ? h('span', null, ' · ' + n.w + '×' + n.h) : null,
                    ),
                  ),
                  // P1-15：行内 显示 / 锁 开关（stopPropagation 不触发选中/定位；入 undo 栈）
                  h('div', { className: 'snx-fs-layer-acts' },
                    h('button', {
                      type: 'button',
                      className: n.hidden ? 'on' : '',
                      title: n.hidden ? '显示图层' : '隐藏图层',
                      onClick: (e) => {
                        e.stopPropagation()
                        store.pushUndo()
                        n.hidden = !n.hidden
                        engineRef.current && engineRef.current.refresh && engineRef.current.refresh()
                        autosave(); force((x) => x + 1)
                      },
                    }, ic(n.hidden ? 'eye-off' : 'eye', 12)),
                    h('button', {
                      type: 'button',
                      className: n.locked ? 'on' : '',
                      title: n.locked ? '解锁图层' : '锁定图层',
                      onClick: (e) => {
                        e.stopPropagation()
                        store.pushUndo()
                        n.locked = !n.locked
                        engineRef.current && engineRef.current.refresh && engineRef.current.refresh()
                        autosave(); force((x) => x + 1)
                      },
                    }, ic(n.locked ? 'lock' : 'lock-open', 12)),
                  ),
                )),
              ),
            ),
            // 中间画布
            h('div', { className: 'snx-fs-stage' },
              !maskId && ready && !loadErr ? h(GenBar, { engineRef, busy, setBusy, notify }) : null,
              h('div', { className: 'snx-fs-canvas', ref: wrapRef },
                loadErr ? h('div', { className: 'snx-canvas-err' }, loadErr) : null,
                // SPEC-18 四：minimap（全屏画布同挂,容器内=正确定位上下文）
                !maskId && ready && !loadErr ? h(Minimap, { engineRef }) : null,
                ready && !loadErr && store.doc.nodes.length === 0 && !maskId ? h('div', { className: 'snx-canvas-empty' },
                  h('div', { className: 'big' }, ic('wand-sparkles', 42)),
                  h('div', { className: 't1' }, '画布为空'),
                  h('div', { className: 't2' }, '回到「生图」生成，或粘贴/拖入图像'),
                ) : null,
                // 蒙版工具条（P2-10：与画布模式共用 renderMaskBar，全屏版此前缺画笔四滑块）
                maskId ? renderMaskBar() : null,
                // v11.2.1（断裂 #2）：全屏画布挂点同画布条——sel>=2 也渲染多选操作条
                (selDone || selMulti) && engineRef.current ? h(ActionBar, {
                  engineRef, busy, setBusy, notify, multi: selMulti, viewTick: undefined,
                  onInpaint: (n) => enterMask(n),
                  onErase: (n) => enterMask(n, true),
                  onOutpaint: (n) => {
                    const c = store.doc.camera
                    const sx = n.x * c.scale + c.x
                    const sy = n.y * c.scale + c.y
                    setRatioAt({
                      x: Math.min(Math.max(8, sx + 240), window.innerWidth - 400),
                      y: Math.min(sy + 40, window.innerHeight - 120),
                      nodeId: n.id, label: '',
                    })
                  },
                }) : null,
                // P1-11：全屏画布同样挂 HTML PendingOverlay（Konva 占位已无文字，这里是唯一进度来源）
                h(PendingOverlay, { engineRef }),
                ratioAt ? h(RatioPopup, {
                  at: ratioAt, onPick: (r) => applyOutpaint(r), onClose: () => setRatioAt(null),
                }) : null,
                h('div', { className: 'snx-cv-zoom' },
                  h('button', { onClick: () => engineRef.current && engineRef.current.zoomBy(1 / 1.25), title: '缩小' }, ic('minus', 13)),
                  h('div', { className: 'pct' }, Math.round(((store.doc.camera && store.doc.camera.scale) || 1) * 100) + '%'),
                  h('button', { onClick: () => engineRef.current && engineRef.current.zoomBy(1.25), title: '放大' }, ic('plus', 13)),
                  h('button', { onClick: () => engineRef.current && engineRef.current.fit(), title: '适应', style: { width: 'auto', padding: '0 8px' } }, ic('maximize')),
                  h('button', { onClick: () => { arrangeByChain(); notify && notify('已按生成链整理布局') }, title: '整理布局：按生成链分层排列', style: { width: 'auto', padding: '0 8px' } }, ic('grid-2x2')),
                ),
              ),
            ),
            // 右侧属性面板
            h('aside', { className: 'snx-fs-props' },
              h('div', { className: 'snx-fs-h' }, ic('sliders-horizontal'), ' 属性'),
              selNode ? h('div', { className: 'snx-fs-props-body' },
                h('div', { className: 'snx-fs-prop' },
                  h('div', { className: 'lb' }, '提示词'),
                  h('div', { className: 'val' }, (selNode.prompt || '—').replace(/^💬\s*/, '')),
                ),
                h('div', { className: 'snx-fs-prop' },
                  h('div', { className: 'lb' }, '尺寸'),
                  h('div', { className: 'val' }, (selNode.w || 0) + ' × ' + (selNode.h || 0)),
                ),
                h('div', { className: 'snx-fs-prop' },
                  h('div', { className: 'lb' }, '位置'),
                  h('div', { className: 'val' }, Math.round(selNode.x || 0) + ', ' + Math.round(selNode.y || 0)),
                ),
                h('div', { className: 'snx-fs-prop' },
                  h('div', { className: 'lb' }, '状态'),
                  h('div', { className: 'val' },
                      h('span', { className: 'snx-fs-layer-st ' + ({ pending: 'st-pending', running: 'st-running', done: 'st-done', error: 'st-error' }[selNode.status] || '') }, STATUS_ZH[selNode.status] || selNode.status),
                  ),
                ),
                h('div', { className: 'snx-fs-prop' },
                  h('div', { className: 'lb' }, '操作'),
                  h('div', { className: 'snx-fs-prop-acts' },
                    h('button', {
                      type: 'button',
                      className: 'snx-fs-pa',
                      onClick: () => enterMask(selNode),
                    }, ic('brush'), ' 重绘'),
                    h('button', {
                      type: 'button',
                      className: 'snx-fs-pa',
                      onClick: () => {
                        const c = store.doc.camera
                        const sx = selNode.x * c.scale + c.x
                        const sy = selNode.y * c.scale + c.y
                        setRatioAt({
                          x: Math.min(Math.max(8, sx + 240), window.innerWidth - 400),
                          y: Math.min(sy + 40, window.innerHeight - 120),
                          nodeId: selNode.id, label: '',
                        })
                      },
                    }, ic('expand'), ' 扩图'),
                    h('button', {
                      type: 'button',
                      className: 'snx-fs-pa',
                      onClick: () => { store.duplicateSelected(); force((x) => x + 1) },
                    }, ic('copy'), ' 复制'),
                    h('button', {
                      type: 'button',
                      className: 'snx-fs-pa danger',
                      onClick: () => {
                        if (!store.sel.size) return
                        store.pushUndo()   // P1-10：删除入撤销栈（此前绕过 undo）
                        store.doc.nodes = store.doc.nodes.filter((n) => !store.sel.has(n.id))
                        store.sel = new Set()
                        store.emit()   // 驱动 Konva 重绘（此前只 force，画布上的残影不清）
                        autosave()
                      },
                    }, ic('trash-2'), ' 删除'),
                  ),
                ),
                selNode.parentId ? h('div', { className: 'snx-fs-prop' },
                  h('div', { className: 'lb' }, '衍生自'),
                  // v11.2（A-P2-8）：显示父图提示词前 14 字（title 带完整 id），不再只给一串不可读 id
                  h('div', { className: 'val mono', title: selNode.parentId }, (() => {
                    const p = store.node(selNode.parentId)
                    return (p && p.prompt) ? String(p.prompt).replace(/^💬\s*/, '').slice(0, 14) : selNode.parentId.slice(0, 12)
                  })()),
                ) : null,
                // v8：图层属性 — 混合模式 + 不透明度 + 锁定 + 可见性
                h('div', { className: 'snx-fs-prop' },
                  h('div', { className: 'lb' }, '图层属性'),
                  h('div', { className: 'snx-fs-prop-row' },
                    h('label', null, h('span', null, '混合'),
                      h(SnxSelect, {
                        value: selNode.blendMode || 'normal',
                        onChange: (v) => {
                          store.pushUndo()   // P1-10：混合模式可撤销（此前绕过 undo）
                          selNode.blendMode = v
                          engineRef.current && engineRef.current.refresh && engineRef.current.refresh()
                          force((x) => x + 1); autosave()
                        },
                        options: [
                          // v11.2（A-P2-8）：label 中文，value 保持英文
                          { value: 'normal', label: '正常' },
                          { value: 'multiply', label: '正片叠底' },
                          { value: 'screen', label: '滤色' },
                          { value: 'overlay', label: '叠加' },
                          { value: 'darken', label: '变暗' },
                          { value: 'lighten', label: '变亮' },
                        ],
                      }),
                    ),
                  ),
                  h('div', { className: 'snx-fs-prop-row' },
                    h('label', null,
                      h('span', null, '不透明'),
                      h('input', { type: 'range', min: 0, max: 100, value: Math.round((selNode.opacity ?? 1) * 100),
                        // P1-10：滑块 undo 合并（按下/键盘起意时记一步，800ms 内连续 tick 共用基线）
                        onPointerDown: () => pushUndoMerge(),
                        onKeyDown: () => pushUndoMerge(),
                        onChange: (e) => {
                          selNode.opacity = parseInt(e.target.value, 10) / 100
                          engineRef.current && engineRef.current.refresh && engineRef.current.refresh()
                          force((x) => x + 1); autosave()
                        } }),
                      h('span', { className: 'v' }, Math.round((selNode.opacity ?? 1) * 100) + '%'),
                    ),
                  ),
                  h('div', { className: 'snx-fs-prop-row btns' },
                    h('button', {
                      type: 'button',
                      className: 'snx-fs-pa2' + (selNode.hidden ? ' on' : ''),
                      onClick: () => {
                        store.pushUndo()   // P1-10：隐藏/显示可撤销（此前绕过 undo）
                        selNode.hidden = !selNode.hidden
                        engineRef.current && engineRef.current.refresh && engineRef.current.refresh()
                        force((x) => x + 1); autosave()
                      },
                    }, selNode.hidden ? [ic('eye-off'), ' 隐藏中'] : [ic('eye'), ' 可见']),
                    h('button', {
                      type: 'button',
                      className: 'snx-fs-pa2' + (selNode.locked ? ' on' : ''),
                      onClick: () => {
                        store.pushUndo()   // P1-10：锁定/解锁可撤销（此前绕过 undo）
                        selNode.locked = !selNode.locked
                        engineRef.current && engineRef.current.refresh && engineRef.current.refresh()
                        force((x) => x + 1); autosave()
                      },
                    }, selNode.locked ? [ic('lock'), ' 已锁'] : [ic('lock-open'), ' 解锁']),
                  ),
                ),
              ) : h('div', { className: 'snx-fs-props-empty' },
                h('div', { className: 'big' }, ic('sliders-horizontal', 42)),
                h('div', null, '在画布上点一张图'),
              ),
            ),
          ),
        )
      }

      // ====================================================
      // 子视图：SETTINGS — 配置 Key / 模型默认 / 数据
      // ====================================================
      function renderSettingsMode() {
        const pingOk = pingResult && pingResult.ok
        const modelCount = pingOk && Array.isArray(pingResult.models) ? pingResult.models.length : null
        return h('div', { className: 'snx-set' },
          // v9：顶部状态卡（对齐 dsh 设置页的状态卡样式，一眼看全局）
          h('div', { className: 'snx-hero' },
            h('div', { className: 'snx-hero-tile' },
              h('span', { className: 'snx-hero-num' },
                // P1-20：三态——检查中=灰、已配置=绿、未配置=红（未知态不伪装健康）
                h('span', { className: 'snx-hero-dot' + (keyOk === null ? ' off' : keyOk ? '' : ' err') }),
                keyOk === null ? '检查中…' : keyOk ? '已配置' : '未配置'),
              h('span', { className: 'snx-hero-lb' }, 'API Key'),
            ),
            h('div', { className: 'snx-hero-tile' },
              h('span', { className: 'snx-hero-num' },
                h('span', { className: 'snx-hero-dot' + (pingResult ? (pingOk ? '' : ' err') : ' off') }),
                pingResult ? (pingOk ? (modelCount + ' 个') : '失败') : '未测'),
              h('span', { className: 'snx-hero-lb' }, '连接测试'),
            ),
            h('div', { className: 'snx-hero-tile' },
              h('span', { className: 'snx-hero-num', title: genPrefs.model || 'sensenova-u1.5-lite' },
                genPrefs.model || 'sensenova-u1.5-lite'),
              h('span', { className: 'snx-hero-lb' }, '默认模型'),
            ),
            h('div', { className: 'snx-hero-tile' },
              h('span', { className: 'snx-hero-num' }, String(store.doc.nodes.length)),
              h('span', { className: 'snx-hero-lb' }, '画布图片'),
            ),
          ),
          h('div', { className: 'snx-set-section' },
            h('div', { className: 'snx-set-h' },
              h('span', { className: 'ti' }, ic('key-round')),
              h('span', null, 'SenseNova API Key'),
              h('div', { style: { flex: 1 } }),
              h('span', { className: 'snx-pro-key ' + (keyOk === false ? 'no' : (keyOk ? 'ok' : 'unk')) },
                keyOk === null ? [ic('clock'), ' …'] : keyOk ? '已配置' : '未配置'),
            ),
            h('div', { className: 'snx-cfg-row', style: { marginTop: '10px', marginBottom: '8px' } },
              h('div', { style: { display: 'flex', gap: '6px' } },
                h('input', {
                  className: 'snx-cfg-in',
                  style: { flex: 1, minWidth: '0', margin: '0' },
                  type: keyVisible ? 'text' : 'password',
                  placeholder: 'sk-…（留空保存 = 保留现有值/环境变量）',
                  value: keyDraft,
                  onChange: (e) => setKeyDraft(e.target.value),
                  onKeyDown: (e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) saveKey() },
                }),
                h('button', {
                  className: 'snx-set-btn', type: 'button', title: keyVisible ? '隐藏' : '显示',
                  onClick: () => setKeyVisible(!keyVisible),
                  style: { flexShrink: '0', color: 'var(--dsw-alias-label-secondary,#b3b6ba)', borderColor: 'var(--dsw-alias-border-l2,#ffffff1f)' },
                }, keyVisible ? [ic('eye-off'), ' 隐藏'] : [ic('eye'), ' 显示']),
              ),
            ),
            h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } },
              h('button', { className: 'snx-set-btn save', type: 'button', onClick: saveKey, disabled: keySaving || !keyDraft.trim() }, keySaving ? '保存中…' : ic('save'), ' 保存 Key'),
              h('button', { className: 'snx-set-btn test', type: 'button', onClick: testKey, disabled: keyTesting }, keyTesting ? '测试中…' : ic('plug'), ' 测试连接'),
              pingResult ? h('span', { className: 'snx-pro-key ' + (pingResult.ok ? 'ok' : 'no') },
                pingResult.ok ? '可用 · ' + (pingResult.models || []).length + ' 个模型' : String(pingResult.error || '连接失败').slice(0, 60)) : null,
            ),
            h('div', { className: 'snx-set-tip' },
              'Key 在 SenseNova 控制台「管理中心 - API-Key 管理」创建（sk-...）。保存后立即生效、优先级高于环境变量；测试连接会实际访问一次 SenseNova 并列出可用模型（当前图像模型：', h('code', null, 'sensenova-u1.5-lite'), '）。'),
          ),
          h('div', { className: 'snx-set-section' },
            h('div', { className: 'snx-set-h' },
              h('span', { className: 'ti' }, ic('palette')),
              h('span', null, '模型 / 画质'),
            ),
            // P1-17：从只读摆设改为可编辑——下拉直接写 genPrefs，生图表单/画布悬浮条即时跟随
            h('div', { className: 'snx-set-row' },
              h('div', null,
                h('span', { className: 'k' }, '默认模型'),
                h(SnxSelect, {
                  value: genPrefs.model || '',
                  width: 220,
                  onChange: (v) => { genPrefs.model = v; force((x) => x + 1) },
                  options: MODEL_PRESETS_FORM.map((p) => ({ value: p.id, label: p.label })),
                }),
              ),
              h('div', null,
                h('span', { className: 'k' }, '默认画质'),
                h(SnxSelect, {
                  value: genPrefs.quality || '2k',
                  width: 150,
                  onChange: (v) => { genPrefs.quality = v; force((x) => x + 1) },
                  options: [
                    { value: '2k', label: '2K（按所选尺寸）' },
                    { value: '4k', label: '4K（同比例最大已验证档）' },
                  ],
                }),
              ),
              h('div', null, h('span', { className: 'k' }, '默认张数'), h('span', { className: 'v' }, String(genPrefs.count || 1) + '（生图表单可调）')),
              h('div', null, h('span', { className: 'k' }, '默认尺寸'), h('span', { className: 'v' }, genPrefs.size || '2048x2048')),
            ),
            h('div', { className: 'snx-set-tip' },
              '改动即时生效，写入生成偏好（genPrefs）；生图表单与画布悬浮条共享这份偏好。4K 档按所选比例映射到已验证尺寸线内的最大档，不虚标。'),
          ),
          h('div', { className: 'snx-set-section' },
            h('div', { className: 'snx-set-h' },
              h('span', { className: 'ti' }, ic('database')),
              h('span', null, '数据'),
              h('div', { style: { flex: 1 } }),
              h('button', {
                className: 'snx-set-btn',
                type: 'button',
                onClick: async () => {
                  // P1-14：原生 confirm → SnxConfirm
                  const ok = await askConfirm({
                    title: '清空画布？',
                    confirmLabel: '清空画布', confirmIcon: 'trash-2',
                    desc: '将移除全部 ' + store.doc.nodes.length + ' 张画布图。文件本身保留在磁盘，仅清空文档索引；可按 Ctrl+Z 撤销。',
                  })
                  if (!ok) return
                  store.pushUndo()
                  store.doc.nodes = []
                  store.sel = new Set()
                  setGalSel(new Set()); setGalAnchor(null)
                  force((n) => n + 1)
                  await saveNow()   // SPEC-14 二.3：直存带 rev，409 时重载远端基线
                  notify && notify('画布已清空')
                },
              }, ic('trash-2'), ' 清空画布'),
            ),
            h('div', { className: 'snx-set-tip' },
              `当前画布共 ${store.doc.nodes.length} 张图，`,
              h('b', null, '已生成的文件保留在 '),
              h('code', null, '~/.dsh/storages/sensenova-images/'),
              '，清空画布只是清空文档索引，文件不丢。'),
          ),
          h('div', { className: 'snx-set-section' },
            h('div', { className: 'snx-set-h' },
              h('span', { className: 'ti' }, ic('keyboard')),
              h('span', null, '快捷键'),
            ),
            h('div', { className: 'snx-set-row' },
              h('div', null, h('span', { className: 'k' }, 'Ctrl / Cmd + Enter'), h('span', { className: 'v' }, '生图')),
              h('div', null, h('span', { className: 'k' }, 'Esc'), h('span', { className: 'v' }, '关闭灯箱 / 退出全屏画布')),
              h('div', null, h('span', { className: 'k' }, '+ / - / 0'), h('span', { className: 'v' }, '灯箱缩放 / 复位')),
              h('div', null, h('span', { className: 'k' }, 'F'), h('span', { className: 'v' }, '画布适应画面')),
              h('div', null, h('span', { className: 'k' }, 'Del'), h('span', { className: 'v' }, '删除选中节点')),
              h('div', null, h('span', { className: 'k' }, 'Ctrl + Z / Shift+Z'), h('span', { className: 'v' }, '画布撤销 / 重做')),
              h('div', null, h('span', { className: 'k' }, 'Ctrl + D'), h('span', { className: 'v' }, '复制选中节点')),
              h('div', null, h('span', { className: 'k' }, 'Ctrl + A'), h('span', { className: 'v' }, '画布全选')),
              h('div', null, h('span', { className: 'k' }, '方向键'), h('span', { className: 'v' }, '微调选中节点（Shift = 10px）')),
              h('div', null, h('span', { className: 'k' }, '拖输出端口'), h('span', { className: 'v' }, '改接父图（拖到目标节点）')),
              h('div', null, h('span', { className: 'k' }, '右键连线'), h('span', { className: 'v' }, '断开衍生关系 / 选中子节点')),
              h('div', null, h('span', { className: 'k' }, 'Esc（拖线中）'), h('span', { className: 'v' }, '取消拖线')),
              h('div', null, h('span', { className: 'k' }, 'Ctrl + V / 拖入 PNG'), h('span', { className: 'v' }, '成节点，带参数自动读回')),
              h('div', null, h('span', { className: 'k' }, '?'), h('span', { className: 'v' }, '打开快捷键速查')),
            ),
          ),
          // v8：提示词库 section（P1-14：注入应用内确认）
          h(PromptLibSection, { notify, confirm: askConfirm }),
        )
      }
    }

    // ─── v8：提示词库 section（设置页）───
    function PromptLibSection({ notify, confirm }) {
      const [lib, setLib] = useState(() => loadPromptLib())
      const refresh = () => setLib(Object.assign({}, loadPromptLib()))   // P2-4：浅拷贝防同引用跳渲染
      const [npName, setNpName] = useState('')
      const [npP, setNpP] = useState('')
      const [npN, setNpN] = useState('')
      const ask = confirm || (async (opts) => { notify && notify('确认弹窗不可用，已取消操作'); return false })   // P1-14：正常路径由 Workbench 注入 SnxConfirm
      const usePrompt = (p) => {
        // 同时写 genPrefs：GenForm 只在生图 tab 挂载，设置页里 dispatch 无人接收，
        // 等切回生图 tab 重新挂载时初值读 genPrefs.prompt，这样提示词才真正落地
        genPrefs.prompt = p
        window.dispatchEvent(new CustomEvent('snx:usePrompt', { detail: p }))
        notify && notify('提示词已加载（生图 tab 的提示词框已更新）')
      }
      return h('div', { className: 'snx-set-section' },
        h('div', { className: 'snx-set-h' },
          h('span', { className: 'ti' }, ic('library')),
          h('span', null, '提示词库'),
          h('div', { style: { flex: 1 } }),
          h('span', { className: 'h' }, `${lib.stars.length} 收藏 / ${lib.recents.length} 最近`),
        ),
        h('div', { className: 'snx-promptlib' },
          h('div', { className: 'snx-promptlib-h' }, ic('sparkles'), ' 命名预设（正/负成套）'),
          lib.presets.map((ps) => h('div', { key: ps.name, className: 'snx-promptlib-item' },
            h('div', { className: 'snx-promptlib-pr', onClick: () => {
              genPrefs.prompt = ps.prompt || ''
              genPrefs.negPrompt = ps.negative || ''
              window.dispatchEvent(new CustomEvent('snx:restoreParams', { detail: { prompt: ps.prompt || '', negPrompt: ps.negative || '' } }))
              notify && notify('已套用预设「' + ps.name + '」（切到生图 tab 可见）')
            }, title: '点击套用（正/负提示词一起回填）' },
              (ps.name || '未命名') + ' ｜ ' + (ps.prompt || '').slice(0, 40) + (ps.negative ? ' ｜ 负:' + ps.negative.slice(0, 20) : '')),
            h('button', { type: 'button', className: 'snx-promptlib-x', onClick: async () => {
              // P1-14：原生 confirm → SnxConfirm（由设置页注入）
              const ok = await ask({
                title: '删除预设「' + ps.name + '」？',
                confirmLabel: '删除', confirmIcon: 'trash-2',
                desc: '删除后生图表单的「命名预设」下拉不再提供它；收藏与最近提示词不受影响。',
              })
              if (!ok) return
              const ll = loadPromptLib()
              ll.presets = ll.presets.filter((x) => x.name !== ps.name)
              savePromptLib(ll); refresh()
            }, title: '删除预设' }, ic('x', 12)),
          )),
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' } },
            h('input', {
              placeholder: '预设名称（如：雪夜电影感）', value: npName,
              onChange: (e) => setNpName(e.target.value),
              style: { background: 'var(--dsw-alias-bg-module-platform,#353638)', border: '1px solid var(--dsw-alias-border-l2,#ffffff1f)', borderRadius: '6px', color: 'var(--dsw-alias-label-primary,#f9fafb)', padding: '6px 9px', fontSize: '11.5px', fontFamily: 'inherit' },
            }),
            h('input', {
              placeholder: '正向提示词（从生图页或历史里粘贴）', value: npP,
              onChange: (e) => setNpP(e.target.value),
              style: { background: 'var(--dsw-alias-bg-module-platform,#353638)', border: '1px solid var(--dsw-alias-border-l2,#ffffff1f)', borderRadius: '6px', color: 'var(--dsw-alias-label-primary,#f9fafb)', padding: '6px 9px', fontSize: '11.5px', fontFamily: 'inherit' },
            }),
            h('input', {
              placeholder: '负向提示词（选填）', value: npN,
              onChange: (e) => setNpN(e.target.value),
              style: { background: 'var(--dsw-alias-bg-module-platform,#353638)', border: '1px solid var(--dsw-alias-border-l2,#ffffff1f)', borderRadius: '6px', color: 'var(--dsw-alias-label-primary,#f9fafb)', padding: '6px 9px', fontSize: '11.5px', fontFamily: 'inherit' },
            }),
            h('button', {
              type: 'button',
              className: 'snx-lb-adj-save',
              disabled: !npName.trim() || !npP.trim(),
              onClick: () => {
                const ll = loadPromptLib()
                ll.presets = (ll.presets || []).filter((x) => x.name !== npName.trim())
                ll.presets.push({ name: npName.trim(), prompt: npP.trim(), negative: npN.trim(), ts: Date.now() })
                savePromptLib(ll); refresh()
                setNpName(''); setNpP(''); setNpN('')
                notify && notify('预设已保存，生图页「套用命名预设」可选')
              },
              style: { justifyContent: 'center' },
            }, ic('save'), ' 保存预设'),
          ),
          lib.stars.length ? h('div', { className: 'snx-promptlib-h' }, ic('star', 12), ' 收藏') : null,
          lib.stars.map((s) => h('div', { key: s.prompt, className: 'snx-promptlib-item star' },
            h('div', { className: 'snx-promptlib-pr', onClick: () => usePrompt(s.prompt), title: '点击填回提示词' }, s.prompt),
            h('span', { className: 'snx-promptlib-ts' }, s.ts ? new Date(s.ts).toLocaleDateString() : ''),
            h('button', { type: 'button', className: 'snx-promptlib-x', onClick: () => {
              const ll = loadPromptLib()
              ll.stars = ll.stars.filter((x) => x.prompt !== s.prompt)
              savePromptLib(ll); refresh()
            }, title: '删除收藏' }, ic('x', 12)),
          )),
          lib.recents.length ? h('div', { className: 'snx-promptlib-h' }, ic('clock'), ' 最近') : null,
          lib.recents.slice(0, 10).map((p, i) => h('div', { key: i, className: 'snx-promptlib-item' },
            h('div', { className: 'snx-promptlib-pr', onClick: () => usePrompt(p), title: '点击填回提示词' }, p),
            h('button', { type: 'button', className: 'snx-promptlib-star', onClick: () => {
              toggleStar(p); refresh()
            }, title: '收藏' }, ic('star', 12)),
          )),
          lib.stars.length === 0 && lib.recents.length === 0 ? h('div', { className: 'snx-promptlib-empty' }, '还没有提示词——去「生图」tab 点星标收藏，或自动记录最近 10 条') : null,
        ),
      )
    }

    // ── 预览大图组件 ──
    function GenHero({ node, onEdit, onRefresh, onOpenLightbox }) {
      const [src, setSrc] = useState(node && node.src)
      const [hover, setHover] = useState(false)
      useEffect(() => { setSrc(node && node.src) }, [node && node.id])
      const prompt = (node && node.prompt) || ''
      const model = (node && node.params && node.params.model) || ''
      const w = node && node.w, hgt = node && node.h
      const st = node && node.status
      const busyNode = st === 'pending' || st === 'running'
      return h('div', { className: 'snx-gen-hero-inner' },
        h('div', {
          className: 'snx-gen-hero-imgbox',
          onMouseEnter: () => setHover(true),
          onMouseLeave: () => setHover(false),
          // P0-2：无 src（生成中/失败）不进灯箱出白屏，降级为状态占位
          onClick: src ? onOpenLightbox : undefined,
          title: src ? '点击查看大图' : (st === 'error' ? '生成失败：' + String((node && (node.errMsg || node.error)) || '').slice(0, 120) : '生成中…'),
        },
          src ? h('img', { src: src, alt: '' })
            : busyNode ? h('span', { className: 'snx-spinring', style: { width: '28px', height: '28px' } })
              : h('div', { className: 'snx-gen-hero-fail' }, ic('triangle-alert', 14), ' 生成失败'),
          src && hover ? h('div', { className: 'snx-gen-hero-overlay' },
            h('div', { className: 'snx-gen-hero-zoom' }, ic('maximize'), ' 查看大图'),
          ) : null,
        ),
        h('div', { className: 'snx-gen-hero-cap' },
          h('div', { className: 'pr' }, prompt ? prompt.replace(/^💬\s*/, '') : '— 无提示词 —'),
          h('div', { className: 'meta' },
            w && hgt ? `${w}×${hgt}` : '',
            model ? ' · ' + model : '',
            node && node.ts ? ' · ' + new Date(node.ts).toLocaleString() : '',
          ),
          h('div', { className: 'acts' },
            h('button', { className: 'snx-gen-act', onClick: onEdit, title: '打开画布编辑器' }, ic('frame'), ' 画布'),
            src ? h('button', { className: 'snx-gen-act', onClick: onOpenLightbox, title: '全屏预览' }, ic('maximize'), ' 大图') : null,
            src ? h('a', { className: 'snx-gen-act', href: src, download: '', target: '_blank', rel: 'noreferrer' }, ic('download'), ' 下载') : null,
            h('button', { className: 'snx-gen-act', onClick: onRefresh }, ic('rotate-ccw')),
          ),
        ),
      )
    }

    function GenHeroEmpty({ busy }) {
      return h('div', { className: 'snx-gen-hero-empty' },
        h('div', { className: 'big' }, busy ? h('span', { className: 'snx-spinring' }) : ic('images')),
        h('div', { className: 't1' }, busy ? 'SenseNova 生成中…' : '还没有生成图'),
        h('div', { className: 't2' }, busy ? '请稍等几秒' : '在下方输入提示词，或让 agent 帮你画'),
      )
    }

    // ── 提示词 + 表单（v2：含风格预设 / i2i 提示 / 完整参数）──
    const STYLE_PRESETS = [
      { id: 'cinematic', label: '电影', suffix: ', cinematic lighting, film grain, depth of field, 8K, dramatic atmosphere' },
      { id: 'photo', label: '摄影', suffix: ', photorealistic, sharp focus, natural lighting, high detail, DSLR quality' },
      { id: 'anime', label: '动漫', suffix: ', anime style, cel shading, vibrant colors, clean linework' },
      { id: 'oil', label: '油画', suffix: ', oil painting, visible brushstrokes, rich texture, classical composition' },
      { id: '3d', label: '3D', suffix: ', 3D render, octane render, volumetric lighting, hyperdetailed' },
      { id: 'ink', label: '水墨', suffix: ', Chinese ink wash painting, xieyi style, flowing brushwork, minimalist' },
      { id: 'pixel', label: '像素', suffix: ', pixel art, 16-bit, crisp pixels, retro game aesthetic' },
      { id: 'archi', label: '建筑', suffix: ', architectural visualization, clean lines, studio lighting, wide angle' },
    ]
    // P1-5：比例芯片与已验证 SIZES 一一对应（此前芯片集与 SIZES 不相交，默认 2048² 不点亮任何芯片）：
    // 1:1=2048×2048（默认值，入集且常亮）；16:9=2048×1152（已验证档）；9:16=1536×2752；宽幕=2752×1536；32:9=2560×720。
    // 非预设档的当前值（如从历史图回填的自定义尺寸）走行尾的「当前值」芯片，保证任何时刻都有 active 态。
    const SIZE_CHIPS = [
      { id: 'sq', label: '1:1', w: 2048, h: 2048 },
      { id: 'w169', label: '16:9', w: 2048, h: 1152 },
      { id: 'p916', label: '9:16', w: 1536, h: 2752 },
      { id: 'wide', label: '宽幕', w: 2752, h: 1536 },
      { id: 'pan', label: '32:9', w: 2560, h: 720 },
    ]
    const MODEL_PRESETS_FORM = [
      { id: '', label: '默认（配置中的模型）' },
      { id: 'sensenova-u1.5-lite', label: 'sensenova-u1.5-lite · 当前可用（文生图/图生图）' },
      { id: 'sensenova-u1.5-fast', label: 'sensenova-u1.5-fast · 真机已验证（文生图/图生图）' },
      { id: 'sensenova-u1.5', label: 'sensenova-u1.5 · 控制台已开通时可用' },
    ]
    function GenForm({ engineRef, busy, setBusy, notify, anchorInfo, keyOk, galBoard, onClearAnchor }) {
      const [prompt, setPrompt] = useState(genPrefs.prompt || '')
      const [negPrompt, setNegPrompt] = useState(genPrefs.negPrompt || '')
      const [size, setSize] = useState(genPrefs.size || '2048x2048')
      const [model, setModel] = useState(genPrefs.model || '')
      const [count, setCount] = useState(genPrefs.count || 1)
      const [seed, setSeed] = useState(genPrefs.seed ?? -1)
      const [quality, setQuality] = useState(genPrefs.quality || '2k')   // 2k | 4k
      const [styleId, setStyleId] = useState(genPrefs.styleId || '')
      const [showAdv, setShowAdv] = useState(false)
      const [err, setErr] = useState('')
      // 多参考图：refs = [{src, role, strength}] — 风格 / 角色 / 构图 / 参考
      const [refs, setRefs] = useState(genPrefs.refs || [])
      const [pickerOpen, setPickerOpen] = useState(false)
      // SPEC-13 ②：目标画板（生成入板路由）——'' = 未分组；genToCanvas 创建节点按它赋 boardId。
      // SPEC-15 ①：targetBoard 现在是「手动选择」的存底值——默认跟随画廊（follow=true）时，
      // 实际入板走 resolveTargetBoard()（画廊筛选画板/未分组），targetBoard 不参与解析
      const [targetBoard, setTargetBoard] = useState(genPrefs.targetBoard || '')
      const [follow, setFollow] = useState(followBoard)   // 跟随画廊态；翻转时同步写回模块级 followBoard（重挂载不丢）
      // SPEC-17 三：画板排序偏好（localStorage 键 snxBoardSort）——本地 state 只为让「排序」选项的
      // 文案随切换重渲染；真实偏好走模块级 setBoardSortPref 写穿透，其他面板经 snx:boardSortChanged 刷新
      const [boardSort, setBoardSort] = useState(boardSortPref())
      // ── v12：生成按钮决策面板（SPEC ①：按下之前就知道一切）───
      // hover/focus 按钮包裹层即浮出（无延时+150ms 淡入，<300ms）；disabled 改列 blocker 清单；
      // 队列暂停顶部红条。portal 挂 body 防 .snx-pro container-type 收编与滚动容器裁剪；面板只读。
      const goRef = useRef(null)
      const decideRef = useRef(null)
      const [goShow, setGoShow] = useState(false)
      const [goPos, setGoPos] = useState(null)   // {left,top} fixed 坐标；null=首帧离屏，实测尺寸再就位（SnxSelect 同款）
      const [, setDecideTick] = useState(0)      // 队列暂停态 / store 变化时强制重渲染（重读模块级 queuePaused 与队列数）
      const showDecide = () => { setGoPos(null); setGoShow(true) }
      const hideDecide = () => setGoShow(false)
      useEffect(() => {
        const onP = () => setDecideTick((x) => x + 1)
        window.addEventListener('snx:queuePaused', onP)
        return () => window.removeEventListener('snx:queuePaused', onP)
      }, [])
      // 面板展开期间：store 变化（入队/完成/暂停）实时刷新内容；滚动/resize 使 fixed 坐标失效即收起
      useEffect(() => {
        if (!goShow) return
        const close = () => setGoShow(false)
        window.addEventListener('resize', close)
        window.addEventListener('scroll', close, true)
        return () => {
          window.removeEventListener('resize', close)
          window.removeEventListener('scroll', close, true)
        }
      }, [goShow])
      useEffect(() => {
        if (!goShow) return
        return store.subscribe(() => setDecideTick((x) => x + 1))
      }, [goShow])
      useLayoutEffect(() => {
        if (!goShow) return
        const btn = goRef.current, el = decideRef.current
        if (!btn || !el) return
        const br = btn.getBoundingClientRect()
        const pr = el.getBoundingClientRect()
        const w = pr.width || 320, ph = pr.height || 120
        const left = Math.max(8, Math.min(br.left + br.width / 2 - w / 2, window.innerWidth - w - 8))
        const above = br.top - ph - 8
        let top = above >= 8 ? above : Math.min(br.bottom + 8, window.innerHeight - ph - 8)
        top = Math.max(8, top)
        if (reactDomPortal) setGoPos({ left, top })
        else {
          const hr = fixedOffsetHost()   // portal 降级：换算 .snx-pro 包含块坐标（SnxSelect 同款）
          setGoPos({ left: left - hr.left, top: top - hr.top })
        }
      }, [goShow])
      // P2-4：提示词库只在挂载时读一次 localStorage 进 state（此前每次渲染同步读 3 次：
      // isStarred 初值 + loadPromptLib().presets + prompt 变化时的 isStarred），
      // 之后任何写库（收藏/最近/设置页预设）经 snx:promptLibChanged 广播刷新这份 state。
      // 浅拷贝出新对象，避免与模块缓存同引用被 React setState 判等而跳过重渲染
      const [lib, setLib] = useState(() => loadPromptLib())
      useEffect(() => {
        const refresh = () => setLib(Object.assign({}, loadPromptLib()))
        window.addEventListener('snx:promptLibChanged', refresh)
        return () => window.removeEventListener('snx:promptLibChanged', refresh)
      }, [])
      const presets = lib.presets   // 命名预设（设置页维护；P2-12：空态也渲染入口）
      // 星标从缓存库按当前 prompt 派生，不再单独维护 state（同一提示词收藏态保持）
      const starred = useMemo(() => lib.stars.some((s) => s.prompt === String(prompt || '').trim()), [lib, prompt])
      // v8：从提示词库加载
      useEffect(() => {
        const onUse = (e) => {
          histExit()
          if (e && e.detail) setPrompt(e.detail)   // setPrompt 自身触发重渲染，无需 force（也避免引用未定义的 force）
        }
        window.addEventListener('snx:usePrompt', onUse)
        return () => window.removeEventListener('snx:usePrompt', onUse)
      }, [])
      // v12：提示词历史翻阅（SPEC ⑥）——Ctrl+↑/↓ 在最近 10 条（lib.recents）间整套替换。
      // idx=-1 表示不在历史态；进入时记下当前文本，第 1 条再按 ↓ 退出历史并还原
      const histRef = useRef({ idx: -1, base: '' })
      function histExit() { histRef.current.idx = -1 }
      // 参数回填（灯箱/右键菜单「回填参数」与灯箱行级回填 R/P/S/D 共用）：
      // detail 里到场的字段才覆盖——全量回填事件带全部键，行级事件只带单键，互不干扰
      useEffect(() => {
        const onRestore = (e) => {
          const d = e && e.detail
          if (!d) return
          histExit()
          if (d.prompt !== undefined) setPrompt(d.prompt)
          if (d.negPrompt !== undefined) setNegPrompt(d.negPrompt)
          if (d.size !== undefined) setSize(d.size)
          if (d.model !== undefined) setModel(d.model)
          if (d.seed !== undefined) setSeed(d.seed)
          if (Array.isArray(d.refs)) setRefs(d.refs)
          if (d.board !== undefined) {   // SPEC-13 ②：灯箱「画板」行级回填写目标画板；
            setTargetBoard(d.board)      // SPEC-15 ①：显式回填=手动指定目标，脱离跟随画廊
            followBoard = false; setFollow(false)
          }
        }
        window.addEventListener('snx:restoreParams', onRestore)
        return () => window.removeEventListener('snx:restoreParams', onRestore)
      }, [])
      // SPEC-13 ②：对话卡「设为参考图」新广播 snx:setRef {src}——追加进参考图区，
      // 上限 4 张与 pickRef/uploadRef 同一逻辑；冷启动（工作台刚被 openTab 拉起、本监听器
      // 未挂载）时卡片已写 genPrefs.refs，首帧 useState(genPrefs.refs) 即见，两路不会重复
      useEffect(() => {
        const onSetRef = (e) => {
          const src = e && e.detail && e.detail.src
          if (!src) return
          histExit()
          setRefs((prev) => (prev.length >= 4 ? prev : [...prev, { src: String(src), role: 'reference', strength: 0.7 }]))
        }
        window.addEventListener('snx:setRef', onSetRef)
        return () => window.removeEventListener('snx:setRef', onSetRef)
      }, [])
      // P1-12：表单可变参数（负面词/参考图/张数/种子）实时发布到 genPrefs——
      // 画布悬浮条 GenBar 与设置页读同一份偏好，用户没点生成也同步（模型/画质/尺寸本就 onChange 直写）
      useEffect(() => { genPrefs.negPrompt = negPrompt }, [negPrompt])
      useEffect(() => { genPrefs.refs = refs }, [refs])
      useEffect(() => { genPrefs.count = count }, [count])
      useEffect(() => { genPrefs.seed = seed }, [seed])
      useEffect(() => { genPrefs.targetBoard = targetBoard }, [targetBoard])   // SPEC-15 ①：手动目标存底随行（跟随态下入板解析不走它，见 resolveTargetBoard）
      const pickRef = (node) => {
        if (refs.length >= 4) return
        setRefs([...refs, { src: node.src, role: 'reference', strength: 0.7, fromId: node.id }])
        setPickerOpen(false)
      }
      // 本地文件 → dataURL 参考图（改图入口：任意图都能传进来编辑；带 sensenova tEXt 的 PNG 顺带读回参数）
      const uploadRef = (e) => {
        const f = e.target.files && e.target.files[0]
        e.target.value = ''
        if (!f) return
        const r = new window.FileReader()
        r.onload = async () => {
          const src = String(r.result)
          setRefs((prev) => (prev.length >= 4 ? prev : [...prev, { src, role: 'reference', strength: 0.7 }]))
          const pp = await parsePngParams(f)
          if (pp) {
            histExit()   // v12：提示词被 PNG 读回参数覆盖，同步退出历史态
            if (!genPrefs.prompt) { setPrompt(pp.prompt); genPrefs.prompt = pp.prompt }
            if (pp.model) genPrefs.model = pp.model
            if (pp.size) genPrefs.size = pp.size
            if (typeof pp.seed === 'number') genPrefs.seed = pp.seed
            notify && notify('已从 PNG 读回生成参数' + (genPrefs.prompt ? '' : '，提示词已填入'))
          }
        }
        r.readAsDataURL(f)
      }
      const removeRef = (i) => setRefs(refs.filter((_, j) => j !== i))
      const setRefRole = (i, role) => {
        const ns = refs.slice(); ns[i] = { ...ns[i], role }; setRefs(ns)
      }
      const setRefStrength = (i, strength) => {
        const ns = refs.slice(); ns[i] = { ...ns[i], strength }; setRefs(ns)
      }

      const anchor = anchorInfo && anchorInfo.node

      // P1-6：风格单选互斥——后缀存 styleId，提交时统一拼接，不再往 textarea 里塞/抠后缀
      const styleSuffix = () => {
        const s = STYLE_PRESETS.find((x) => x.id === styleId)
        return s ? s.suffix : ''
      }
      const applyStyle = (s) => {
        setStyleId(styleId === s.id ? '' : s.id)   // 点当前芯片 = 清除
      }

      const onPreset = (s) => {
        setSize(s.w + 'x' + s.h)
      }

      // ── v12：决策面板内容 ── blocker 优先如实列出（Key 未配置时按钮虽可点但请求必失败，
      // 与提示词为空一起列为「不能入队的原因」，对齐 InvokeAI 决策面板语义）
      const decideBlockers = []
      if (busy) decideBlockers.push('上一批生成还在进行中，完成后可继续')
      if (!prompt.trim()) decideBlockers.push('提示词为空')
      if (keyOk === false) decideBlockers.push('未配置 API Key，到设置页配置')
      // 队列等待数现算（pending+running，与队列 tab 口径一致）：面板展开期间经 store.subscribe
      // 重渲染实时刷新；不取 Workbench 的 prop——gen 模式下 Workbench 无 store 订阅会冻结
      let decideQueueLen = 0
      for (const nn of store.doc.nodes) {
        if (nn.status === 'pending' || nn.status === 'running') decideQueueLen++
      }
      const decideModel = (() => {
        const p = MODEL_PRESETS_FORM.find((x) => x.id === model)
        if (!p) return model || '默认'
        return (p.label.split('·')[0] || p.label).trim() || p.label
      })()
      // SPEC-13 ②/SPEC-15 ①：决策面板「目标」行如实显示当前解析结果——
      // 跟随态：「跟随画廊:画板「X」」/「跟随画廊:未分组」（随 galBoard 实时变）；
      // 手动态：画板名 / 未分组（画廊再切不覆盖）。悬空 id 按未分组显示（删板路径会同步清，这里兜底）
      const decideTarget = (() => {
        const eff = follow ? followTargetOf(galBoard) : targetBoard
        const b = eff ? (store.doc.boards || []).find((x) => x.id === eff) : null
        if (follow) return b ? '跟随画廊:画板「' + b.name + '」' : '跟随画廊:未分组'
        return b ? '画板「' + b.name + '」' : '未分组'
      })()

      const gen = async () => {
        const p = prompt.trim()
        if (!p || busy) return
        histExit()   // v12：提交即结束历史翻阅态，下次 Ctrl+↑ 从最新一条重新开始
        setErr(''); setBusy(true)
        try {
          const engine = engineRef.current
          genPrefs.prompt = p; genPrefs.negPrompt = negPrompt
          genPrefs.size = size; genPrefs.model = model; genPrefs.count = count
          genPrefs.seed = seed; genPrefs.quality = quality; genPrefs.styleId = styleId
          genPrefs.refs = refs
          genPrefs.targetBoard = targetBoard   // SPEC-15 ①：手动选择存底；实际落板由 genToCanvas 按跟随/手动解析（resolveTargetBoard）走
          addRecent(p)
          await genToCanvas(engine, {
            prompt: p + styleSuffix(), negative: negPrompt || undefined, size: applyQuality(size, quality), model,
            seed: seed >= 0 ? seed : undefined,
            reference: anchor ? anchor.src : undefined,
            refs: refs.length ? refs.map((r) => ({ src: r.src, role: r.role, strength: r.strength })) : undefined,
            anchorNode: anchor,
            n: count,
          })
          if (notify) notify('已生成到画布' + (styleId ? '（含风格后缀：' + (STYLE_PRESETS.find((x) => x.id === styleId) || {}).label + '）' : ''))
        } catch (e) { setErr(String((e && e.message) || e)) }
        finally { setBusy(false) }
      }

      const onKey = (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); gen(); return }
        // v12：Ctrl+↑/↓ 翻阅最近提示词（对齐 InvokeAI）——整套替换 + toast「历史 n/N」；
        // ↑ 从当前文本进入历史取最新一条，再 ↑ 逐条向更旧翻；↓ 反向，越过最新条退出并还原进入前文本
        if ((e.ctrlKey || e.metaKey) && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          if (e.nativeEvent && e.nativeEvent.isComposing) return
          const recents = lib.recents || []
          if (!recents.length) { notify && notify('暂无提示词历史'); return }
          e.preventDefault()
          const st = histRef.current
          if (e.key === 'ArrowUp') {
            if (st.idx < 0) { st.base = prompt; st.idx = 0 }
            else st.idx = Math.min(st.idx + 1, recents.length - 1)
            setPrompt(recents[st.idx])
            notify && notify('历史 ' + (st.idx + 1) + '/' + recents.length)
          } else {
            if (st.idx < 0) return   // 不在历史态，↓ 保持原生光标行为
            st.idx -= 1
            if (st.idx < 0) { setPrompt(st.base); notify && notify('已退出历史翻阅') }
            else { setPrompt(recents[st.idx]); notify && notify('历史 ' + (st.idx + 1) + '/' + recents.length) }
          }
        }
      }

      return h('div', { className: 'snx-gen-form' },
        // ── i2i 锚点提示 ──
        anchor ? h('div', { className: 'snx-gen-anchor' },
          h('img', { src: anchor.src, alt: '', className: 'snx-gen-anchor-thumb' }),
          h('div', { className: 'snx-gen-anchor-info' },
            h('div', { className: 'lb' }, ic('pen-line', 12), ' i2i 编辑模式'),
            h('div', { className: 'sub' }, (anchor.prompt || '').replace(/^💬\s*/, '').slice(0, 48) || '— 无提示词 —'),
          ),
          h('button', {
            className: 'snx-gen-anchor-x',
            type: 'button',
            onClick: onClearAnchor,
            title: '清除选中，改为文生图',
          }, ic('x', 12)),
        ) : null,
        // ── 提示词 ──
        h('div', { className: 'snx-gen-fprompt' },
          h('div', { className: 'lb' },
              h('span', { className: 'ti' }, ic('wand-sparkles')),
              h('span', null, anchor ? '编辑指令' : '提示词'),
              h('div', { style: { flex: 1 } }),
              h('button', {
                type: 'button',
                className: 'snx-gen-star' + (starred ? ' on' : ''),
                onClick: () => { toggleStar(prompt) },   // P2-4：写库后经 snx:promptLibChanged 刷新派生星标
                title: starred ? '取消收藏' : '收藏到提示词库',
              }, ic('star', 12)),
              // v12：历史下拉（星标旁）——最近 10 条截断展示，点击整套回填；生成后自动记录
              h(SnxSelect, {
                value: '',
                width: 88,
                popWidth: 280,
                title: '最近提示词，点击回填（输入框内也可按上下方向键逐条翻阅）',
                onChange: (p) => { histExit(); setPrompt(p) },
                options: [{ value: '', label: lib.recents.length ? '历史' : '暂无历史' }].concat(
                  lib.recents.map((p) => ({ value: p, label: p.length > 42 ? p.slice(0, 42) + '…' : p })),
                ),
              }),
              h('span', { className: 'cnt' }, String(prompt.length) + ' / 2000'),
              h('span', { className: 'hk' }, 'Ctrl / Cmd + Enter'),
            ),
          h('textarea', {
            className: 'snx-gen-ta',
            value: prompt,
            onChange: (e) => { histExit(); setPrompt(e.target.value) },   // v12：手动编辑即退出历史态
            onKeyDown: onKey,
            placeholder: anchor
              ? '描述要怎么改这张图，例如：换成夜间背景，增加雪…'
              : '描述要生成的图…\n例如：戴墨镜的柴犬坐在月球表面，4K，电影感',
            rows: 3,
            maxLength: 2000,
            spellCheck: false,
          }),
          // ── 多参考图槽位（v8）──
          refs.length > 0 || pickerOpen ? h('div', { className: 'snx-gen-refs' },
            h('div', { className: 'lb' },
              h('span', { className: 'ti' }, ic('images')),
              h('span', null, `参考图（${refs.length}/4）`),
              h('div', { style: { flex: 1 } }),
              h('span', { className: 'h' }, '风格 / 角色 / 构图'),
            ),
            h('div', { className: 'snx-gen-refs-row' },
              refs.map((r, i) => h('div', { key: i, className: 'snx-gen-ref' },
                h('img', { src: r.src, alt: '', className: 'snx-gen-ref-img' }),
                h('div', { className: 'snx-gen-ref-meta' },
                  h(SnxSelect, {
                    value: r.role,
                    onChange: (v) => setRefRole(i, v),
                    title: '参考角色', width: 74,
                    options: [
                      { value: 'reference', label: '参考' },
                      { value: 'style', label: '风格' },
                      { value: 'character', label: '角色' },
                      { value: 'composition', label: '构图' },
                    ],
                  }),
                  h('input', {
                    type: 'range',
                    min: 10, max: 100, value: Math.round((r.strength ?? 0.7) * 100),
                    onChange: (e) => setRefStrength(i, parseInt(e.target.value, 10) / 100),
                    className: 'snx-gen-ref-strength',
                    title: '强度 ' + Math.round((r.strength ?? 0.7) * 100) + '%',
                  }),
                ),
                h('button', {
                  type: 'button', className: 'snx-gen-ref-x',
                  onClick: () => removeRef(i), title: '移除',
                }, ic('x', 10)),
              )),
              refs.length < 4 ? h('button', {
                type: 'button', className: 'snx-gen-ref-add',
                onClick: () => setPickerOpen(!pickerOpen),
                title: '从画廊选择参考图',
              }, pickerOpen ? [ic('x', 12), ' 收起'] : [ic('plus', 12), ' 参考图']) : null,
              refs.length < 4 ? h('label', {
                className: 'snx-gen-ref-add', title: '上传本地图片作为参考图（改图）', style: { cursor: 'pointer' },
              },
                h('input', { type: 'file', accept: 'image/*', style: { display: 'none' }, onChange: uploadRef }),
                ic('upload'), ' 上传') : null,
            ),
            pickerOpen ? h('div', { className: 'snx-gen-ref-picker' },
              store.doc.nodes.filter((n) => n.status === 'done').slice().reverse().slice(0, 12).map((n) =>
                h('button', {
                  key: n.id, type: 'button', className: 'snx-gen-ref-pick',
                  onClick: () => pickRef(n), title: (n.prompt || '').slice(0, 30),
                }, h('img', { src: n.src, alt: '', loading: 'lazy' })),
              ),
            ) : null,
          ) : h('div', { className: 'snx-gen-refcta' },
            h('button', {
              type: 'button', className: 'snx-gen-refs-add',
              onClick: () => setPickerOpen(true),
              title: '添加参考图（Midjourney 风格 / 角色 / 构图）',
            }, ic('image-plus'), ' + 多参考图'),
            h('label', {
              className: 'snx-gen-refs-add', title: '上传本地图片，写修改指令即可改图', style: { cursor: 'pointer', flex: 'none' },
            },
              h('input', { type: 'file', accept: 'image/*', style: { display: 'none' }, onChange: uploadRef }),
              ic('wand-sparkles'), ' 上传图片改图'),
          ),
          // ── 命名预设（P2-12：移出风格 chips 区，独立成块；没有预设时也可见并指路设置页）──
          h('div', { className: 'snx-gen-styles' },
            h('div', { className: 'lb' },
              h('span', { className: 'ti' }, ic('library')),
              h('span', null, '命名预设'),
            ),
            h(SnxSelect, {
              value: '',
              width: '100%',
              popWidth: 260,
              title: '套用设置页保存的正/负提示词成套预设',
              onChange: (name) => {
                const ps = presets.find((x) => x.name === name)   // P2-4：直接用缓存 state，不再读 localStorage
                if (!ps) return
                setPrompt(ps.prompt || '')
                genPrefs.prompt = ps.prompt || ''
                setNegPrompt(ps.negative || '')
                genPrefs.negPrompt = ps.negative || ''
                notify && notify('已套用预设「' + name + '」（正/负提示词一起回填）')
              },
              options: [{ value: '', label: presets.length ? '套用命名预设…' : '暂无预设' }].concat(
                presets.map((pp) => ({ value: pp.name, label: pp.name })),
              ),
            }),
            !presets.length ? h('div', { className: 'snx-promptlib-empty', style: { textAlign: 'left', padding: '6px 2px' } },
              '还没有预设——到设置页「提示词库」把正/负提示词成套保存，这里就能一键套用') : null,
          ),
          // ── 风格（P1-6：单选互斥，后缀提交时拼接；点当前芯片=清除）──
          h('div', { className: 'snx-gen-styles' },
            h('div', { className: 'lb' },
              h('span', { className: 'ti' }, ic('sparkles')),
              h('span', null, '风格'),
              h('div', { style: { flex: 1 } }),
              h('button', {
                type: 'button',
                className: 'snx-gen-styles-clr',
                onClick: () => { setStyleId('') },
                title: '清除已选风格',
              }, styleId ? '清除' : ''),
            ),
            h('div', { className: 'snx-gen-styles-row' },
              STYLE_PRESETS.map((s) => h('button', {
                key: s.id,
                className: 'snx-gen-chip' + (styleId === s.id ? ' on' : ''),
                onClick: () => applyStyle(s),
                type: 'button',
                title: styleId === s.id ? '再次点击清除该风格' : '单选风格后缀（提交生成时自动拼接，不改动提示词框）',
              }, s.label)),
            ),
          ),
          // ── 负面提示词（折叠在高级里也展示）──
          h('div', { className: 'snx-gen-fneg' },
            h('button', {
              className: 'snx-gen-fneg-tg',
              onClick: () => setShowAdv(!showAdv),
              type: 'button',
            },
              h('span', { className: 'ti' }, showAdv ? ic('chevron-down', 12) : ic('chevron-right', 12)),
              h('span', null, '负面提示词 / 种子 / 高级')),
            showAdv ? h('div', { className: 'snx-gen-fneg-body' },
              h('div', { className: 'lb' },
                h('span', { className: 'ti' }, ic('circle-x')),
                h('span', null, '负面提示词'),
              ),
              h('textarea', {
                className: 'snx-gen-ta sm',
                value: negPrompt,
                onChange: (e) => setNegPrompt(e.target.value),
                placeholder: '不要的元素：模糊、低质量、变形、错误手指数…',
                rows: 2,
                spellCheck: false,
              }),
              h('div', { className: 'snx-gen-advanced' },
                h('div', { className: 'snx-gen-seed' },
                  h('label', null, '种子'),
                  h('input', {
                    type: 'number', value: seed,
                    onChange: (e) => setSeed(parseInt(e.target.value || '-1', 10)),
                    min: -1,
                  }),
                  h('button', {
                    type: 'button',
                    onClick: () => setSeed(Math.floor(Math.random() * 1e9)),
                    title: '随机种子',
                  }, ic('dices')),
                  h('span', { className: 'h' }, '-1 = 随机'),
                ),
              ),
            ) : null,
          ),
        ),
        // ── 比例 + 尺寸 ──
        h('div', { className: 'snx-gen-fsize' },
          h('div', { className: 'lb' },
            h('span', { className: 'ti' }, ic('maximize')),
            h('span', null, '比例'),
            h('div', { style: { flex: 1 } }),
            h('span', { className: 'now' }, size),
          ),
          h('div', { className: 'snx-gen-fsize-row' },
            SIZE_CHIPS.map((s) => h('button', {
              key: s.id,
              className: 'snx-gen-chip' + (size === (s.w + 'x' + s.h) ? ' on' : ''),
              onClick: () => onPreset(s),
              type: 'button',
              title: s.w + '×' + s.h + '（已验证尺寸档）',
            }, s.label)),
            // P1-5：当前值不在预设集里（如历史图回填的自定义尺寸）也要有 active 态
            !SIZE_CHIPS.some((s) => (s.w + 'x' + s.h) === size) ? h('span', {
              className: 'snx-gen-chip on',
              title: '当前尺寸（自定义，非预设档）',
            }, size) : null,
          ),
        ),
        // ── 目标画板（SPEC-13 ②/SPEC-15 ①：生成入板路由——默认跟随画廊当前筛选，手动选择优先，未分组=不归板）──
        h('div', { className: 'snx-gen-styles' },
          h('div', { className: 'lb' },
            h('span', { className: 'ti' }, ic('folder')),
            h('span', null, '目标画板'),
            h('div', { style: { flex: 1 } }),
          ),
          h(SnxSelect, {
            // SPEC-15 ①：跟随态值=哨兵 FOLLOW_BOARD（按钮回显首项「跟随画廊:…」标签）；
            // 手动态值=targetBoard（按钮回显所选画板/未分组），首项变「回到跟随画廊」一键
            value: follow ? FOLLOW_BOARD : targetBoard,
            onChange: (v) => {
              if (v === FOLLOW_BOARD) { followBoard = true; setFollow(true); return }   // 「回到跟随画廊」
              // SPEC-17 三：排序切换项——只改排序偏好（localStorage snxBoardSort），不动目标画板；
              // 广播 snx:boardSortChanged 让画廊 chips/灯箱下拉等 Workbench 侧消费方同帧重排
              if (v === BOARD_SORT_OPT) {
                const next = boardSort === 'name' ? 'recent' : 'name'
                setBoardSortPref(next)
                setBoardSort(next)
                try { window.dispatchEvent(new CustomEvent('snx:boardSortChanged', { detail: { sort: next } })) } catch { }
                return
              }
              followBoard = false; setFollow(false)   // 手动选择（含未分组）→ 脱离跟随，画廊再切不覆盖
              setTargetBoard(v); genPrefs.targetBoard = v
            },
            width: '100%',
            popWidth: 240,
            title: '生成结果落入的画板：默认跟随画廊当前画板筛选（全部/未分组=不归板）；手动选择后以手动为准，下拉首项可回到跟随画廊（悬浮条生成/重绘增强等同样按解析落板）。末项可切换画板列表排序（最近使用/按名称，偏好持久化，画廊画板条/本下拉/灯箱画板下拉三处同时生效）',
            options: (() => {
              const fB = follow ? (store.doc.boards || []).find((x) => x.id === followTargetOf(galBoard)) : null
              return [
                { value: FOLLOW_BOARD, label: follow ? (fB ? '跟随画廊:画板「' + fB.name + '」' : '跟随画廊:未分组') : '回到跟随画廊' },
                { value: '', label: '未分组' },
              ]
                .concat(boardsByRecent().map((b) => ({ value: b.id, label: b.name })))   // SPEC-16 三/17 三：按偏好排序（最近使用/按名称）
                // SPEC-17 三：排序切换项置于末尾（选中只切偏好不落板）
                .concat([{ value: BOARD_SORT_OPT, label: boardSort === 'name' ? '排序：按名称（点击改回最近使用）' : '排序：最近使用（点击改为按名称）' }])
            })(),
          }),
        ),
        // ── 模型 + 质量 + 张数 ──
        h('div', { className: 'snx-gen-frow3' },
          h('div', { className: 'snx-gen-ff' },
            h('div', { className: 'lb' },
              h('span', { className: 'ti' }, ic('sliders-horizontal')),
              h('span', null, '模型'),
            ),
            h(SnxSelect, {
              value: model,
              onChange: (v) => { setModel(v); genPrefs.model = v },
              width: '100%',
              popWidth: 240,
              options: MODEL_PRESETS_FORM.map((p) => ({ value: p.id, label: p.label })),
            }),
          ),
          h('div', { className: 'snx-gen-ff tiny' },
            h('div', { className: 'lb' },
              h('span', { className: 'ti' }, ic('sliders-horizontal')),
              h('span', null, '画质'),
            ),
            h('div', { className: 'snx-gen-seg' },
              ['2k', '4k'].map((q) => h('button', {
                key: q,
                className: quality === q ? 'on' : '',
                onClick: () => { setQuality(q); genPrefs.quality = q },
                type: 'button',
              }, q.toUpperCase())),
            ),
          ),
          h('div', { className: 'snx-gen-ff tiny2' },
            h('div', { className: 'lb' },
              h('span', { className: 'ti' }, ic('layers', 13)),
              h('span', null, '张数'),
            ),
            h('div', { className: 'snx-gen-stepper' },
              h('button', { type: 'button', onClick: () => setCount(Math.max(1, count - 1)), disabled: count <= 1, title: '减少' }, ic('minus', 12)),
              h('span', null, count),
              h('button', { type: 'button', onClick: () => setCount(Math.min(8, count + 1)), disabled: count >= 8, title: '增加' }, ic('plus', 12)),
            ),
          ),
        ),
        // ── 生成按钮 + 决策面板（v12：hover/focus 浮出「将生成 N 张 · 模型 · 尺寸 · 目标 · 队列等待」）──
        h('div', {
          className: 'snx-gen-gowrap',
          onMouseEnter: showDecide,
          onMouseLeave: hideDecide,
          onFocus: showDecide,   // React onFocus=focusin：按钮获得键盘焦点同样浮出
          onBlur: hideDecide,
        },
          h('button', {
            ref: goRef,
            className: 'snx-gen-go' + (busy ? ' busy' : '') + (!prompt.trim() ? ' disabled' : ''),
            onClick: gen,
            disabled: busy || !prompt.trim(),
            type: 'button',
          },
            h('span', { className: 'ti' }, busy ? h('span', { className: 'snx-spinring' }) : ic('wand-sparkles')),
            h('span', null, busy ? '生成中…' : (anchor ? '生成 i2i' : '生成到画布')),
          ),
          goShow ? portalToBody(h('div', {
            className: 'snx-gen-decide', ref: decideRef,
            style: {
              position: 'fixed',
              left: ((goPos && goPos.left) != null ? goPos.left : -9999) + 'px',
              top: ((goPos && goPos.top) != null ? goPos.top : -9999) + 'px',
            },
          },
            queuePaused ? h('div', { className: 'snx-gen-decide-strip' }, '队列已暂停 — 新任务将排队等待恢复') : null,
            decideBlockers.length
              ? decideBlockers.map((b, i) => h('div', { key: i, className: 'snx-gen-decide-r blk' }, ic('circle-x', 13), h('span', null, b)))
              : [
                h('div', { key: 'n', className: 'snx-gen-decide-r' }, ic('sparkles', 13),
                  h('span', null, '将生成 ', h('b', null, String(count)), ' 张', anchor ? '（i2i 编辑）' : '')),
                h('div', { key: 'm', className: 'snx-gen-decide-r' }, ic('image', 13),
                  h('span', null, '模型 ', h('b', null, decideModel), ' · ', h('b', null, applyQuality(size, quality)))),
                h('div', { key: 't', className: 'snx-gen-decide-r' }, ic('folder', 13),
                  h('span', null, '目标：', h('b', null, decideTarget))),   // SPEC-15 ①：如实显示解析结果（跟随画廊:画板「X」/跟随画廊:未分组/手动画板/未分组）
                h('div', { key: 'q', className: 'snx-gen-decide-r' }, ic('list-ordered', 13),
                  decideQueueLen > 0
                    ? h('span', null, '队列等待 ', h('b', null, String(decideQueueLen)), ' 个任务')
                    : h('span', null, '队列空闲，提交后立即开始')),
              ],
          )) : null,
        ),
        err ? h('div', { className: 'snx-gen-err' }, err) : null,
      )
    }

    // ── 最近画廊（横排缩略图）。P0-2：只渲染完成图，pending/running 不再渲染成破图块 ──
    function GenRecent({ store, selId, setSelId, onOpen, onOpenLightbox }) {
      const nodes = store.doc.nodes.filter((n) => n.status === 'done' && n.src).slice().reverse().slice(0, 12)
      const pendingCount = store.doc.nodes.filter((n) => n.status === 'pending' || n.status === 'running').length
      if (nodes.length === 0) {
        return h('div', { className: 'snx-gen-recent' },
          h('div', { className: 'lb' },
            h('span', { className: 'ti' }, ic('images')),
            h('span', null, '最近生成'),
            h('div', { style: { flex: 1 } }),
            h('span', { className: 'h' }, '还没有'),
          ),
          h('div', { className: 'snx-gen-recent-empty' },
            pendingCount
              ? `正在生成 ${pendingCount} 张，完成后出现在这里`
              : '生成出来的图会按时间倒序排在下面。单击选中，双击看大图'),
        )
      }
      return h('div', { className: 'snx-gen-recent' },
        h('div', { className: 'lb' },
          h('span', { className: 'ti' }, ic('images')),
          h('span', null, `最近 ${nodes.length}`),
          h('div', { style: { flex: 1 } }),
          store.doc.nodes.length > nodes.length ? h('button', {
            className: 'snx-gen-more', type: 'button', onClick: onOpen,
          }, '查看全部', ic('chevron-right', 12)) : null,
        ),
        h('div', { className: 'snx-gen-thumbs' },
          nodes.map((n) => h('button', {
            key: n.id,
            className: 'snx-gen-thumb' + (selId === n.id ? ' on' : ''),
            onClick: () => {
              setSelId(n.id)
              store.sel = new Set([n.id])
            },
            onDoubleClick: () => onOpenLightbox && onOpenLightbox(n),
            // P2-11：右键不再劫持为看大图（大图入口=双击/灯箱），还给浏览器默认菜单
            title: (n.prompt || '') + '（双击看大图）',
            type: 'button',
          },
            h('img', { src: n.src, alt: '', loading: 'lazy' }),
          )),
        ),
      )
    }

    // ── 画廊单项（P1-3：点击语义分层 + hover 轻操作组，对齐 InvokeAI GalleryItemHoverIcons）──
    // 网格保持轻：缩略图只放轻操作（参考图/下载/收藏/删除），重操作全收右键菜单与批量条
    function GalleryItem({ node, selected, onItemClick, onItemDoubleClick, onItemContext, onItemPointerDown, ops, locateFlash }) {
      const ts = node.ts ? new Date(node.ts) : null
      const date = ts ? `${ts.getMonth() + 1}/${ts.getDate()} ${String(ts.getHours()).padStart(2, '0')}:${String(ts.getMinutes()).padStart(2, '0')}` : ''
      return h('div', {
        className: 'snx-gal-item' + (node.favorite ? ' fav' : '') + (selected ? ' sel' : '') + (locateFlash ? ' snx-locate' : ''),
        // SPEC-14 ②：画布右键「在画廊中定位」按 id 找卡（滚动 + 高亮闪）
        'data-gal-id': node.id,
        onClick: (e) => onItemClick && onItemClick(e, node),
        onDoubleClick: () => onItemDoubleClick && onItemDoubleClick(node),
        onContextMenu: (e) => onItemContext && onItemContext(e, node),
        onPointerDown: (e) => onItemPointerDown && onItemPointerDown(e, node),
        title: (node.prompt || '').replace(/^💬\s*/, '') + '（单击选中 · Ctrl 多选 · Shift 范围 · 双击看大图 · 右键更多）',
      },
        h('div', { className: 'snx-gal-item-img' },
          h('img', { src: node.src, alt: '', loading: 'lazy', draggable: false }),
          // v8：收藏角标
          node.favorite ? h('span', { className: 'snx-gal-item-fav' }, ic('star', 12)) : null,
          // v8：标签
          node.tags && node.tags.length ? h('div', { className: 'snx-gal-item-tags' },
            node.tags.slice(0, 3).map((t) => h('span', { key: t, className: 'snx-gal-item-tag' }, '#' + t)),
          ) : null,
          // P1-3：hover 轻操作组（按钮拦下 pointerdown，不触发拖拽/选中）
          ops && ops.length ? h('div', { className: 'snx-gal-item-ops' },
            ops.map((o) => h('button', {
              key: o.key, type: 'button',
              className: (o.danger ? 'warn' : '') + (o.active ? ' fav-on' : ''),
              title: o.title,
              onPointerDown: (e) => e.stopPropagation(),
              onClick: (e) => { e.stopPropagation(); o.onClick() },
            }, ic(o.icon, 13))),
          ) : null,
        ),
        h('div', { className: 'snx-gal-item-meta' },
          h('div', { className: 'snx-gal-item-pr' }, (node.prompt || '—').replace(/^💬\s*/, '').slice(0, 64)),
          h('div', { className: 'snx-gal-item-sub' },
            node.w && node.h ? `${node.w}×${node.h}` : '',
            date ? ' · ' + date : '',
          ),
        ),
      )
    }

    // ── 队列单项 ──
    // ── v8.1：dsh-better-sidebar 文件预览器（接管 png/jpg/webp）──
    function ImagePreview({ path, src }) {
      const [scale, setScale] = useState(1)
      const [loading, setLoading] = useState(true)
      const [err, setErr] = useState('')
      const [info, setInfo] = useState(null)   // {w, h, size}
      useEffect(() => {
        setScale(1); setLoading(true); setErr(''); setInfo(null)
        const im = new Image()
        im.onload = () => {
          setLoading(false)
          // 计算适合容器的初始缩放
          const wrap = document.querySelector('.snx-bsb-preview')
          if (wrap) {
            const pad = 40
            const sw = wrap.clientWidth - pad
            const sh = wrap.clientHeight - pad
            const s = Math.min(1, sw / im.naturalWidth, sh / im.naturalHeight)
            setScale(s)
          }
          setInfo({ w: im.naturalWidth, h: im.naturalHeight })
        }
        im.onerror = () => { setLoading(false); setErr('图片加载失败：' + (src || path)) }
        im.src = src || path
      }, [src, path])
      const download = () => {
        const a = document.createElement('a')
        a.href = src || path
        a.download = (path || 'image').replace(/.*\//, '')
        a.click()
      }
      return h('div', { className: 'snx-bsb-preview' },
        h('div', { className: 'snx-bsb-toolbar' },
          h('span', { className: 'snx-bsb-path' }, path || src || ''),
          h('div', { style: { flex: 1 } }),
          info ? h('span', { className: 'snx-bsb-info' }, `${info.w}×${info.h}`) : null,
          h('button', { type: 'button', onClick: () => setScale(Math.max(0.05, scale * 0.8)), title: '缩小' }, ic('minus', 12)),
          h('span', { className: 'snx-bsb-pct' }, Math.round(scale * 100) + '%'),
          h('button', { type: 'button', onClick: () => setScale(Math.min(8, scale * 1.25)), title: '放大' }, ic('plus', 12)),
          h('button', { type: 'button', onClick: () => setScale(1) }, '1:1'),
          h('button', { type: 'button', onClick: () => fit() }, ic('maximize'), ' 适应'),
          h('button', { type: 'button', onClick: download, className: 'snx-bsb-dl' }, ic('download'), ' 下载'),
        ),
        loading ? h('div', { className: 'snx-bsb-load' }, h('div', { className: 'spin' }), '加载中…') :
        err ? h('div', { className: 'snx-bsb-err' }, err) :
        h('div', { className: 'snx-bsb-canvas',
            onWheel: (e) => {
              e.preventDefault()
              setScale((s) => Math.max(0.05, Math.min(8, s * (e.deltaY > 0 ? 0.9 : 1.1))))
            },
          },
          // v11.2（A-P2-7）：缩放直写布局宽高（照灯箱 P0-3 同款），overflow:auto 的滚动范围
          // 真正生效——transform:scale 不改变布局尺寸，放大后拖不到图外区域
          h('img', {
            src: src || path,
            style: info
              ? { width: Math.round(info.w * scale) + 'px', height: Math.round(info.h * scale) + 'px' }
              : undefined,
          }),
        ),
      )
      function fit() {
        const im = new Image()
        im.onload = () => {
          const wrap = document.querySelector('.snx-bsb-preview')
          if (!wrap) return
          const pad = 40
          setScale(Math.min(1, (wrap.clientWidth - pad) / im.naturalWidth, (wrap.clientHeight - pad) / im.naturalHeight))
        }
        im.src = src || path
      }
    }

    // ── P1-18：快捷键速查 overlay（按 v11 真实行为重写，全部条目与代码逐条对过）──
    function HelpOverlay({ onClose }) {
      // P0-4：入模态栈——帮助打开时画布快捷键让路，Esc 只归栈顶
      const onCloseRef = useRef(onClose)
      onCloseRef.current = onClose
      const modalSelfRef = useRef(null)
      useEffect(() => {
        const self = modalPush(() => onCloseRef.current())
        modalSelfRef.current = self
        return () => { modalPop(self); if (modalSelfRef.current === self) modalSelfRef.current = null }
      }, [])
      const groups = [
        { title: '生成', items: [
          ['Ctrl / Cmd + Enter', '提示词框内生成（选中图 = 改图）'],
          ['星标按钮', '收藏 / 取消收藏当前提示词'],
          ['多参考图', '从画廊选图，或上传本地图片改图'],
        ] },
        { title: '画布', items: [
          ['滚轮', '缩放（以指针为锚点）'],
          ['空格 / 中键 + 拖动', '平移画布'],
          ['F', '适应画面'],
          ['Ctrl + A', '全选节点'],
          ['方向键', '微调选中节点（1px，Shift = 10px）'],
          ['Del / Backspace', '删除选中节点'],
          ['Esc', '清除选择；蒙版模式下取消蒙版'],
          ['Ctrl + Z / Shift+Z / Y', '撤销 / 重做'],
          ['Ctrl + D', '原位克隆选中节点'],
          ['Ctrl + C / X / V', '画布内复制 / 剪切 / 粘贴节点（粘贴落指针处，选中集内派生关系保持；排队/生成中的节点不参与复制）'],
          ['多选后拖动', '框选 / Shift 加选后拖任一成员，整组跟随（含排队/失败占位）'],
          ['拖动对齐', '靠近其他图的边/中心时显示参考线并吸附（约 6px）'],
          ['Ctrl + V 粘贴图片 / 拖入 PNG', '成节点，带 sensenova 参数自动读回（画布内已复制节点时 Ctrl+V 优先贴节点）'],
          ['左下角网格按钮', '按生成链整理布局'],
          ['双击节点', '打开灯箱（「新标签打开」在右键菜单）'],
          ['右键节点 / 空白', '菜单：灯箱 / 重试 / 下载 / 回填参数 / 对齐 / 成组 / 置顶等 z 序…'],
        ] },
        // v11.2（A-P2-2）：连线编辑操作段
        { title: '连线编辑', items: [
          ['拖输出端口', '从图右缘圆点拖到目标节点 = 改接其父图（防环，可撤销）'],
          ['右键连线', '断开衍生关系 / 选中子节点'],
          ['Esc（拖线中）', '取消本次拖线'],
        ] },
        // SPEC-14 二.5：补 C 键（对比交换，v12 ComparePair 实装、帮助表此前漏记）
        { title: '对比', items: [
          ['C', '对比视图交换 A/B（输入态 / 模态弹层打开时不触发）'],
        ] },
        { title: '画廊', items: [
          ['单击', '选中（轻态，不再直接跳画布/灯箱）'],
          ['Ctrl / Cmd + 单击', '切换多选'],
          ['Shift + 单击', '从上次单击处范围选择'],
          ['双击', '打开灯箱'],
          ['右键', '菜单：灯箱 / 下载 / 收藏 / 移入画板 / 删除'],
          ['悬停缩略图', '轻操作：参考图 / 下载 / 收藏 / 删除'],
          ['拖图到画板 chip', '批量归类（选中多张一起拖）'],
          ['底部已选条', 'N 张已选 · 移入画板 / 删除 / 清空'],
        ] },
        { title: '蒙版重绘', items: [
          ['涂抹', '标记要修改的区域'],
          ['Enter', '应用生成'],
          ['Esc / 取消', '退出蒙版'],
          ['四个滑块', '画笔大小 / 不透明 / 硬度 / 羽化'],
          ['撤一笔', '回退上一笔标注'],
        ] },
        { title: '灯箱', items: [
          ['Esc', '关闭'],
          ['滚轮', '以光标为锚点缩放'],
          ['拖拽', '平移大图'],
          ['双击 / 0', '复位到适应窗口'],
          ['+ / -', '缩放'],
          ['左 / 右方向键', '在完成图之间翻页'],
          ['R', '回填全部参数到生图表单'],
          ['P / S / D', '仅回填提示词 / 种子 / 尺寸（输入态不触发）'],
          ['重绘增强', '以原图为参考同分辨率重绘（非倍数放大）'],
        ] },
        { title: '全屏画布', items: [
          ['展开按钮', '画布模式右上角进入全屏'],
          ['Esc', '退出全屏'],
        ] },
        { title: '其他', items: [
          ['?', '打开 / 关闭本速查（输入框内除外）'],
        ] },
      ]
      return h('div', { className: 'snx-help-bg', onClick: onClose },
        h('div', { className: 'snx-help', onClick: (e) => e.stopPropagation() },
          h('div', { className: 'snx-help-top' },
            h('span', { className: 'ti' }, ic('keyboard')),
            h('span', null, '快捷键速查'),
            h('div', { style: { flex: 1 } }),
            h('span', { className: 'h' }, 'Esc 退出'),
            h('button', { type: 'button', className: 'snx-help-x', onClick: onClose }, ic('x', 13)),
          ),
          h('div', { className: 'snx-help-body' },
            groups.map((g) => h('div', { key: g.title, className: 'snx-help-g' },
              h('div', { className: 'snx-help-gh' }, g.title),
              g.items.map((it, i) => h('div', { key: i, className: 'snx-help-row' },
                h('kbd', null, it[0]),
                h('span', null, it[1]),
              )),
            )),
          ),
          h('div', { className: 'snx-help-foot' },
            'SenseNova 生图工作台 · v11',
          ),
        ),
      )
    }

    // ── 队列单项 ──
    function QueueItem({ node, onCancel, onOpen, onRetry, onMove, hist }) {
      const st = node.status
      // SPEC-18 二：并发闸等待表中的位次（>=0 = 正在排队可重排；-1 = 未在等待表——已占槽/未入队，无排可重）
      const wpos = st === 'pending' ? genQueuePos(node.id) : -1
      // 运行中每秒自更新，让 elapsed 秒数跳动（否则渲染时算一次、刷新前冻结）
      const [, tickT] = useState(0)
      // v12：行展开详情（SPEC ⑤：审讯队列——模型/尺寸/种子/负面词/错误全文/耗时两段）
      const [open, setOpen] = useState(false)
      useEffect(() => {
        if (st !== 'running') return
        const t = setInterval(() => tickT((x) => x + 1), 1000)
        return () => clearInterval(t)
      }, [st])
      // P2-8：耗时用 _startedAt（真正开跑时刻），排队等待不计入——node.ts 是入队时间戳
      const startedAt = st === 'running' ? (node._startedAt || node.ts) : null
      const elapsed = startedAt ? Math.floor((Date.now() - startedAt) / 1000) : null
      const meta = node.params || {}
      // ── v12：耗时两段 = 排队(_queuedAt→_startedAt) + 运行(_startedAt→_endedAt/现在)。
      // _queuedAt（v12 起创建/重试时落）缺失时回退 ts（pending/running/error 的 ts 即入队时刻）；
      // 旧 done 节点 ts 已被完成时间覆盖，排队段如实显示缺失。_endedAt 缺失时 done 回退 ts、running 用当前时刻。
      const fmtSec = (ms) => Math.max(0, Math.round(ms / 1000)) + 's'
      const nowMs = Date.now()
      const qAt = typeof node._queuedAt === 'number' ? node._queuedAt : (st !== 'done' && typeof node.ts === 'number' ? node.ts : null)
      const sAt = typeof node._startedAt === 'number' ? node._startedAt : null
      const eAt = typeof node._endedAt === 'number' ? node._endedAt
        : (st === 'done' && typeof node.ts === 'number' ? node.ts : (st === 'running' ? nowMs : null))
      let durText
      if (st === 'pending') durText = '排队中 · 已等 ' + fmtSec(nowMs - (qAt != null ? qAt : nowMs))
      else if (sAt) {
        const segs = []
        if (qAt != null) segs.push('排队 ' + fmtSec(sAt - qAt))
        if (eAt != null) segs.push('运行 ' + fmtSec(eAt - sAt))
        durText = segs.join(' + ') || '—'
      // SPEC-13 ②：全历史里的旧 done 节点（v12 前生成，无 _startedAt/_queuedAt，ts 已被完成时刻覆盖）
      // 排队/运行两段耗时数据不存在，如实标「未运行(历史)」——不用 ts 编数字
      } else durText = (hist && st === 'done') ? '未运行(历史)' : '未运行'
      const errMsgFull = String(node.errMsg || node.error || '').trim()
      const detailRows = [
        ['模型', meta.model || '默认'],
        ['尺寸', meta.size || '—'],
        ['种子', typeof meta.seed === 'number' && meta.seed >= 0 ? String(meta.seed) : '随机'],
        ['负面词', meta.negative ? String(meta.negative).slice(0, 80) : '—'],
        ['耗时', durText],
      ]
      return h('div', {
        className: ({ pending: 'snx-qi snx-qi-pending', running: 'snx-qi snx-qi-running', done: 'snx-qi snx-qi-done', error: 'snx-qi snx-qi-error' })[st] || 'snx-qi',
      },
        h('div', { className: 'snx-qi-row', onClick: st === 'done' ? onOpen : undefined },
          h('div', { className: 'snx-qi-img' },
            st === 'done' ? h('img', { src: node.src, alt: '' }) :
            st === 'error' ? h('span', { className: 'snx-qi-err-ico' }, ic('triangle-alert', 20)) :
            h('div', { className: 'snx-qi-spin' },
              h('div', { className: 'spin' }),
              st === 'running' ? h('span', null, elapsed != null ? elapsed + 's' : '…') : h('span', null, '排队')),
          ),
          h('div', { className: 'snx-qi-body' },
            h('div', { className: 'snx-qi-pr' }, (node.prompt || '—').replace(/^💬\s*/, '').slice(0, 80)),
            h('div', { className: 'snx-qi-meta' },
              h('span', { className: 'snx-qi-st' }, STATUS_ZH[st] || st),   // v11.2：徽章中文（uppercase 样式保留）
              meta.model ? h('span', null, ' · ' + meta.model) : null,
              meta.size ? h('span', null, ' · ' + meta.size) : null,
              node.errMsg ? h('span', { className: 'snx-qi-err-msg' }, ' · ' + node.errMsg.slice(0, 60)) : null,
            ),
          ),
          h('div', { className: 'snx-qi-acts' },
            st === 'done' ? h('button', { className: 'snx-qi-act', onClick: onOpen, type: 'button' }, ic('maximize')) : null,
            wpos >= 0 && onMove ? [
              h('button', {
                key: 'top', className: 'snx-qi-act', type: 'button',
                disabled: wpos === 0,
                title: wpos === 0 ? '已在队首' : '插队：移到等待表最前（下一个开跑）',
                onClick: (e) => { e.stopPropagation(); onMove('top') },
              }, ic('chevrons-up', 12)),
              h('button', {
                key: 'up', className: 'snx-qi-act', type: 'button',
                disabled: wpos === 0,
                title: '等待表第 ' + (wpos + 1) + ' 位 · 上移一位',
                onClick: (e) => { e.stopPropagation(); onMove('up') },
              }, ic('arrow-up', 12)),
              h('button', {
                key: 'down', className: 'snx-qi-act', type: 'button',
                disabled: wpos >= genWaitQueue.length - 1,
                title: '等待表第 ' + (wpos + 1) + ' 位 · 下移一位',
                onClick: (e) => { e.stopPropagation(); onMove('down') },
              }, ic('chevron-down', 12)),
            ] : null,
            (st === 'pending' || st === 'running') ? h('button', {
              className: 'snx-qi-act danger',
              onClick: (e) => { e.stopPropagation(); onCancel() },
              type: 'button',
              title: '取消',
            }, ic('x', 12)) : null,
            st === 'error' ? h('button', {
              className: 'snx-qi-act',
              onClick: (e) => { e.stopPropagation(); onRetry() },
              type: 'button',
              title: '重试',
            }, ic('rotate-ccw', 12)) : null,
          ),
          h('button', {
            className: 'snx-qi-chev' + (open ? ' on' : ''),
            onClick: (e) => { e.stopPropagation(); setOpen(!open) },
            type: 'button',
            title: open ? '收起详情' : '展开详情',
            'aria-expanded': open,
          }, ic('chevron-down', 14)),
        ),
        open ? h('div', { className: 'snx-qi-detail' },
          st === 'error' && errMsgFull ? h('div', { className: 'snx-qi-detail-err' }, errMsgFull) : null,
          h('dl', null,
            detailRows.map(([k, v]) => [
              h('dt', { key: k + '-k' }, k),
              h('dd', { key: k + '-v', title: String(v) }, String(v)),
            ]),
          ),
        ) : null,
      )
    }

    // ── 对比：2 张三模式对比 ──
    // v12（SPEC 三.3，对标 InvokeAI ImageComparison）：顶栏模式按钮组——
    // 滑块（clipPath 揭示，原有能力）/ 并排（左右五五开）/ 叠化（上层 opacity 随指针横向位置），
    // 当前高亮；+ 交换按钮（A/B 互换，内容换位、字母随图走，原型同款语义）+ C 键热键
    // （输入态 / 模态上层在场 / 下拉展开时不触发）。3-4 图仍走 CompareGrid 网格。
    function ComparePair({ a, b }) {
      const [pos, setPos] = useState(50)
      const [mode, setMode] = useState('slider')   // 'slider' | 'side' | 'fade'
      const [swapped, setSwapped] = useState(false)
      // 交换 = 两层内容互换；A/B 字母与说明栏跟着内容走（底层/揭示层的角色不变）
      const la = swapped ? b : a
      const lb = swapped ? a : b
      // C 键交换热键：输入态不触发；灯箱/确认弹窗等模态上层与 SnxSelect 下拉在场时让路
      useEffect(() => {
        const onKey = (e) => {
          if (e.key !== 'c' && e.key !== 'C') return
          if (e.ctrlKey || e.metaKey || e.altKey) return
          if (isTyping(e) || modalOpen() || document.querySelector('.snx-sel-pop')) return
          setSwapped((s) => !s)
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [])
      // 叠化：指针在 stage 上的横向位置 → 上层透明度（悬停即跟随，无需按住；pointer 事件兼容触摸）
      const trackFade = (e) => {
        if (mode !== 'fade') return
        const rect = e.currentTarget.getBoundingClientRect()
        const fx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
        setPos(Math.round(fx * 100))
      }
      const infoLb = mode === 'side' ? ['A · 左', 'B · 右']
        : mode === 'fade' ? ['A · 底', 'B · 叠化层'] : ['A · 底', 'B · 上']
      return h('div', { className: 'snx-cmp-pair' },
        // 顶栏：三模式按钮组 + 交换
        h('div', { className: 'snx-cmp-modes' },
          h('div', { className: 'snx-cmp-mseg', role: 'group', 'aria-label': '对比模式' },
            [['slider', '滑块', '拖分割线揭示上层'], ['side', '并排', '左右各半对照'], ['fade', '叠化', '上层透明度随指针横向位置']]
              .map(([m, label, tip]) => h('button', {
                key: m, type: 'button',
                className: 'snx-cmp-mbtn' + (mode === m ? ' on' : ''),
                title: tip,
                onClick: () => setMode(m),
              }, label)),
          ),
          h('button', {
            type: 'button', className: 'snx-cmp-mswap',
            title: '交换 A/B（热键 C，输入态不触发）',
            onClick: () => setSwapped((s) => !s),
          }, ic('arrow-left-right', 12), ' 交换（C）'),
        ),
        h('div', {
          className: 'snx-cmp-stage' + (mode === 'side' ? ' m-side' : ''),
          onMouseDown: mode === 'slider' ? startDrag : undefined,
          onTouchStart: mode === 'slider' ? startDrag : undefined,
          onPointerMove: trackFade,
          onDoubleClick: mode === 'slider' ? () => setPos(50) : undefined,
        },
          h('img', { className: 'snx-cmp-base', src: la.src, alt: 'A', draggable: false }),
          mode === 'side' ? h('div', { className: 'snx-cmp-clip' },
            h('img', { src: lb.src, alt: 'B', draggable: false }),
          ) : h('div', {
            className: 'snx-cmp-clip',
            style: mode === 'fade'
              ? { clipPath: 'none', opacity: pos / 100 }
              : { clipPath: 'inset(0 ' + (100 - pos) + '% 0 0)' },
          },
            h('img', { src: lb.src, alt: 'B', draggable: false }),
          ),
          mode === 'slider' ? h('div', {
            className: 'snx-cmp-handle',
            style: { left: pos + '%' },
          },
            h('div', { className: 'snx-cmp-handle-bar' }),
            h('div', { className: 'snx-cmp-handle-knob' }, ic('chevrons-left-right', 16)),
          ) : null,
          h('div', { className: 'snx-cmp-tag l' }, 'A'),
          h('div', { className: 'snx-cmp-tag r' }, 'B'),
        ),
        h('div', { className: 'snx-cmp-info' },
          h('div', { className: 'snx-cmp-info-c' },
            h('div', { className: 'lb' }, infoLb[0]),
            h('div', { className: 'pr' }, (la.prompt || '').replace(/^💬\s*/, '').slice(0, 80)),
          ),
          h('div', { className: 'snx-cmp-info-c' },
            h('div', { className: 'lb' }, infoLb[1]),
            h('div', { className: 'pr' }, (lb.prompt || '').replace(/^💬\s*/, '').slice(0, 80)),
          ),
        ),
      )
      function startDrag(e) {
        e.preventDefault()
        const stage = e.currentTarget
        const onMove = (ev) => {
          const rect = stage.getBoundingClientRect()
          const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX
          const p = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100))
          setPos(p)
        }
        const onUp = () => {
          window.removeEventListener('mousemove', onMove)
          window.removeEventListener('mouseup', onUp)
          window.removeEventListener('touchmove', onMove)
          window.removeEventListener('touchend', onUp)
        }
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
        window.addEventListener('touchmove', onMove)
        window.addEventListener('touchend', onUp)
      }
    }

    // ── 对比：3-4 张网格 + 单击设大图 ──
    // SPEC-13 ②：顶栏补与 2 图一致的模式按钮组——网格本身即「并排」（默认可用）；
    // 滑块/叠化是 2 图专属交互，对 3-4 图禁用（disabled + tooltip「仅支持 2 张对比」），不做假开关。
    // SPEC-14 二.4：顶栏补「交换」按钮=当前顺序倒转（reverse，再点一次恢复），
    // 样式/位置对齐 2 图对比的交换按钮（snx-cmp-mswap，模式按钮组右侧）
    function CompareGrid({ items }) {
      const [focus, setFocus] = useState(items[0] && items[0].id)
      const [mode, setMode] = useState('side')   // 3-4 图恒为并排；滑块/叠化按钮仅作禁用展示
      const [swapped, setSwapped] = useState(false)
      const shown = swapped ? items.slice().reverse() : items
      const big = shown.find((n) => n.id === focus) || shown[0]
      // v11.2（A-P2-5 半）：角标改字母 A/B/C/D，与 ComparePair 的 A/B 对齐；字母跟随交换后的位次
      const tagOf = (n) => 'ABCD'[shown.indexOf(n)] || '?'
      return h('div', { className: 'snx-cmp-grid' },
        h('div', { className: 'snx-cmp-modes' },
          h('div', { className: 'snx-cmp-mseg', role: 'group', 'aria-label': '对比模式（多图）' },
            [['slider', '滑块', '仅支持 2 张对比'], ['side', '并排', '多图并排对照'], ['fade', '叠化', '仅支持 2 张对比']]
              .map(([m, label, tip]) => h('button', {
                key: m, type: 'button',
                className: 'snx-cmp-mbtn' + (mode === m ? ' on' : ''),
                title: tip,
                disabled: m !== 'side',
                'aria-disabled': m !== 'side',
                onClick: () => setMode(m),
              }, label)),
          ),
          h('button', {
            type: 'button', className: 'snx-cmp-mswap',
            title: '倒序排列当前对比顺序（再点一次恢复）',
            onClick: () => setSwapped((s) => !s),
          }, ic('arrow-left-right', 12), ' 交换'),
        ),
        h('div', { className: 'snx-cmp-grid-big' },
          h('img', { src: big.src, alt: '' }),
          h('div', { className: 'snx-cmp-tag l' }, tagOf(big)),
          h('div', { className: 'snx-cmp-grid-big-pr' }, (big.prompt || '').replace(/^💬\s*/, '').slice(0, 80)),
        ),
        h('div', {
          // 列数类名字面量化(静态对账可见);对比网格只收 3-4 图,2 列兜底
          className: 'snx-cmp-grid-row ' + ({ 2: 'cols-2', 3: 'cols-3', 4: 'cols-4' }[Math.min(shown.length, 4)] || 'cols-3'),
        },
          shown.map((n) => h('button', {
            key: n.id,
            className: 'snx-cmp-grid-cell' + (n.id === focus ? ' on' : ''),
            onClick: () => setFocus(n.id),
            type: 'button',
            title: '设为大图（' + tagOf(n) + '）',
          },
            h('img', { src: n.src, alt: '' }),
            h('span', { className: 'snx-cmp-grid-cell-tag' }, tagOf(n)),
          )),
        ),
      )
    }

    // ── Lightbox 全屏预览组件 ──
    const ADJ_SPECS = [
      ['brightness', '亮度', -100, 100], ['contrast', '对比', -100, 100], ['saturation', '饱和', -100, 100],
      ['hue', '色相', -180, 180], ['temp', '色温', -100, 100], ['vignette', '晕影', 0, 100],
    ]
    const ADJ_PRESETS = [
      ['原片', {}], ['黑白', { saturation: -100 }], ['复古', { saturation: -15, temp: 30, vignette: 35, contrast: -8 }],
      ['冷调', { temp: -45, saturation: 8 }], ['暖调', { temp: 45, saturation: 6 }], ['鲜艳', { saturation: 42, contrast: 12 }],
    ]
    function Lightbox({ node, onClose, notify, onUseAsAnchor, onEdit, onDownload, onCopyParams, onRestoreParams, onRestoreField, onRegenSameSeed, onTiledUpscale, onDelete, onUpscale, onAdjust, onExport, onToggleFavorite, onOpenVersion, onNav, nav, boards, onChangeBoard }) {
      // P0-2：无 src 节点（生成中/失败）降级——不渲染破图，禁用导出/调整
      const hasImg = !!(node && node.src)
      const [scale, setScale] = useState(1)
      // P0-3：缩放重做——scale 乘在「适应窗口」基准尺寸上、直接改写布局宽高，
      // .snx-lb-stage 的 overflow:auto 真正生效；滚轮以光标为锚点；按住拖拽平移；双击复位
      const stageRef = useRef(null)
      const scaleRef = useRef(1)
      scaleRef.current = scale
      const zoomAnchorRef = useRef(null)   // {px,py,cx,cy,prev} 滚轮光标锚点
      const panRef = useRef(null)          // {x,y,sl,st} 拖拽平移基线
      const [nat, setNat] = useState(null)             // {w,h} 原图 natural 尺寸
      const [box, setBox] = useState({ w: 0, h: 0 })   // stage 可视尺寸
      useEffect(() => {
        let dead = false
        if (!hasImg) { setNat(null); return }
        loadImg(node.src).then((im) => { if (!dead) setNat({ w: im.naturalWidth, h: im.naturalHeight }) }).catch(() => { if (!dead) setNat(null) })
        return () => { dead = true }
      }, [hasImg, node && node.src])
      useEffect(() => {
        const st = stageRef.current
        if (!st) return
        const update = () => setBox({ w: st.clientWidth, h: st.clientHeight })
        update()
        if (typeof ResizeObserver === 'function') {
          const ro = new ResizeObserver(update)
          ro.observe(st)
          return () => ro.disconnect()
        }
      }, [])
      // 基准尺寸：stage 内 contain 且不超过原始像素（与旧 max-width:100% 观感一致）
      const availW = Math.max(60, box.w - 24)
      const availH = Math.max(60, box.h - 24)
      const fitW = nat ? Math.min(availW, (availH * nat.w) / nat.h, nat.w) : 0
      const fitH = nat ? (fitW * nat.h) / nat.w : 0
      const dispW = Math.round(fitW * scale)
      const dispH = Math.round(fitH * scale)
      // 滚轮缩放（原生监听：React 的 wheel 委托是 passive，preventDefault 无效）
      useEffect(() => {
        const st = stageRef.current
        if (!st) return
        const onWheel = (e) => {
          e.preventDefault()
          const factor = e.deltaY > 0 ? 0.9 : 1.1
          const ns = Math.min(8, Math.max(0.25, scaleRef.current * factor))
          if (ns === scaleRef.current) return
          const rect = st.getBoundingClientRect()
          zoomAnchorRef.current = {
            px: e.clientX - rect.left, py: e.clientY - rect.top,
            cx: st.scrollLeft + e.clientX - rect.left, cy: st.scrollTop + e.clientY - rect.top,
            prev: scaleRef.current,
          }
          setScale(ns)
        }
        st.addEventListener('wheel', onWheel, { passive: false })
        return () => st.removeEventListener('wheel', onWheel)
      }, [])
      // 缩放落地后按锚点回拨滚动位置；无锚点（按钮/键盘/双击）则保持居中
      useEffect(() => {
        const st = stageRef.current
        if (!st) return
        const a = zoomAnchorRef.current
        zoomAnchorRef.current = null
        if (a && a.prev) {
          st.scrollLeft = a.cx * (scale / a.prev) - a.px
          st.scrollTop = a.cy * (scale / a.prev) - a.py
        } else {
          st.scrollLeft = Math.max(0, (dispW - st.clientWidth) / 2)
          st.scrollTop = Math.max(0, (dispH - st.clientHeight) / 2)
        }
      }, [scale, dispW, dispH])
      // 换图（翻页/版本树跳转）复位缩放
      useEffect(() => { setScale(1) }, [node && node.id])
      const setZoom = (fn) => setScale((s) => Math.min(8, Math.max(0.25, fn(s))))
      // 按住拖拽平移（grab 光标）
      const onStagePointerDown = (e) => {
        if (e.button !== 0) return
        const st = stageRef.current
        if (!st) return
        panRef.current = { x: e.clientX, y: e.clientY, sl: st.scrollLeft, st: st.scrollTop }
        st.setAttribute('data-dragging', '')
        try { st.setPointerCapture(e.pointerId) } catch { }
      }
      const onStagePointerMove = (e) => {
        const p = panRef.current
        const st = stageRef.current
        if (!p || !st) return
        st.scrollLeft = p.sl - (e.clientX - p.x)
        st.scrollTop = p.st - (e.clientY - p.y)
      }
      const onStagePointerUp = (e) => {
        panRef.current = null
        const st = stageRef.current
        if (st) {
          st.removeAttribute('data-dragging')
          try { st.releasePointerCapture(e.pointerId) } catch { }
        }
      }
      // P0-4：入模态栈——灯箱打开时画布快捷键让路，Esc 只归栈顶
      const onCloseRef = useRef(onClose)
      onCloseRef.current = onClose
      const modalSelfRef = useRef(null)
      useEffect(() => {
        const self = modalPush(() => onCloseRef.current())
        modalSelfRef.current = self
        return () => { modalPop(self); if (modalSelfRef.current === self) modalSelfRef.current = null }
      }, [])
      // v10：调整（亮度/对比/饱和/色相/色温/晕影），ctx.filter 实时预览
      const [adj, setAdj] = useState(() => Object.assign({ brightness: 0, contrast: 0, saturation: 0, hue: 0, temp: 0, vignette: 0 }, (node && node.filters) || {}))
      const setAdjK = (k, v) => setAdj((prev) => Object.assign({}, prev, { [k]: v }))
      const adjDirty = !!(adj.brightness || adj.contrast || adj.saturation || adj.hue || adj.temp || adj.vignette)
      const [exportOpen, setExportOpen] = useState(false)
      const [exportFmt, setExportFmt] = useState('png')
      const [exportQuality, setExportQuality] = useState(92)
      const [exportMeta, setExportMeta] = useState(true)
      useEffect(() => {
        const onKey = (e) => {
          if (modalTop() !== modalSelfRef.current) return   // 上层还有别的模态（如帮助）：让路
          if (e.key === 'Escape') onCloseRef.current()   // v11.2：分发器已独占 Esc，此分支保留为死代码
          else if (isTyping(e)) return   // v11.2（B-6）：输入态（标签框/滑块）不抢键——←/→ 调滑块不再连带翻页
          else if (e.key === '+' || e.key === '=') setZoom((s) => s * 1.25)
          else if (e.key === '-') setZoom((s) => s / 1.25)
          else if (e.key === '0') setScale(1)
          else if (e.key === 'ArrowLeft' && onNav) onNav(-1)
          else if (e.key === 'ArrowRight' && onNav) onNav(1)
          // 回填热键组（InvokeAI CurrentImageButtons 灵魂）：R=整套回填 / P=提示词 / S=种子 / D=尺寸。
          // P/S/D 与参数清单行按钮同链路：只覆盖该字段、停留灯箱、对应行高亮闪一下；
          // 输入态（标签输入框等）与带修饰键的组合不触发，避免抢 Ctrl+P/S/D 等浏览器快捷键
          else if (!e.ctrlKey && !e.metaKey && !e.altKey && !isTyping(e)) {
            const k = String(e.key || '').toLowerCase()
            if (k === 'r') { e.preventDefault(); onRestoreParams && onRestoreParams(node) }
            else if (k === 'p') { e.preventDefault(); doRestoreField('prompt') }
            else if (k === 's') { e.preventDefault(); doRestoreField('seed') }
            else if (k === 'd') { e.preventDefault(); doRestoreField('size') }
          }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [onNav, onRestoreParams, onRestoreField, node && node.id])
      // 应用调整 → GPU 滤镜实时预览
      const [adjustedSrc, setAdjustedSrc] = useState(node && node.src)
      // P1-16：预览 rAF 节流 + 显示分辨率——一帧内多次滑块 tick 只渲染最后一次；
      // 最长边按当前显示尺寸×dpr 钳制（下限 320、封顶 2048），不再每个 tick 对原图
      // 分辨率全量编码 PNG。导出/「应用」仍走原分辨率（见 doExport / onAdjust）。
      const adjPreviewRafRef = useRef(0)
      useEffect(() => {
        let cancelled = false
        if (!hasImg) { setAdjustedSrc(null); return }
        if (!(adj.brightness || adj.contrast || adj.saturation || adj.hue || adj.temp || adj.vignette)) { setAdjustedSrc(node && node.src); return }
        const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1
        const maxSide = Math.max(320, Math.min(2048, Math.round(Math.max(dispW, dispH) * dpr)))
        cancelAnimationFrame(adjPreviewRafRef.current)
        adjPreviewRafRef.current = requestAnimationFrame(() => {
          applyFiltersGpu(node && node.src, adj, maxSide).then((s) => { if (!cancelled) setAdjustedSrc(s) })
        })
        return () => { cancelled = true }
      }, [hasImg, node && node.src, adj, dispW, dispH])
      const ts = node && node.ts ? new Date(node.ts) : null
      const date = ts ? `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, '0')}-${String(ts.getDate()).padStart(2, '0')} ${String(ts.getHours()).padStart(2, '0')}:${String(ts.getMinutes()).padStart(2, '0')}:${String(ts.getSeconds()).padStart(2, '0')}` : ''
      const params = node && node.params ? node.params : {}
      // v8：版本历史（parent / children / siblings）
      const tree = useMemo(() => buildVersionTree(node, store), [node, store.doc.nodes.length])
      // v8：fav 状态
      const fav = node && node.favorite
      // v12：参数清单行级回填——行高亮闪一下（flash {field,n}；n 递增换行 key 强制重放动画）。
      // 行按钮与 P/S/D 热键共用同一入口，广播由 Workbench onRestoreField 完成（只覆盖该字段）
      const [flash, setFlash] = useState(null)
      const flashSeqRef = useRef(0)
      const doRestoreField = (field) => {
        if (!onRestoreField) return
        onRestoreField(node, field)
        flashSeqRef.current += 1
        setFlash({ field, n: flashSeqRef.current })
      }
      // 换图（翻页/版本树跳转）清掉上一张的行高亮
      useEffect(() => { setFlash(null) }, [node && node.id])
      // SPEC-17 二：同种子重生成四态防连点（idle/busy/ok/err，与同参数重抽同一套词汇）；
      // 换图复位。该图没有数字种子（当初随机生成/未记录）时无种子可锁，不出按钮
      const [regenSeed, setRegenSeed] = useState('idle')
      useEffect(() => { setRegenSeed('idle') }, [node && node.id])
      const canRegenSeed = typeof (node && node.params && node.params.seed) === 'number' && node.params.seed >= 0 && typeof onRegenSameSeed === 'function'
      const doRegenSameSeed = () => {
        if (regenSeed === 'busy' || !onRegenSameSeed) return
        setRegenSeed('busy')
        Promise.resolve(onRegenSameSeed(node))
          .then(() => setRegenSeed('ok'))
          .catch(() => setRegenSeed('err'))   // 失败态保留在按钮上，再点即重试
      }
      // SPEC-18 五：放大 2× 三态防连点（idle/busy/ok/err），busy 期进度文案（块 1/4…）
      const [tiled2x, setTiled2x] = useState('idle')
      const [tiledMsg, setTiledMsg] = useState('')
      useEffect(() => { setTiled2x('idle'); setTiledMsg('') }, [node && node.id])
      const canTiled = !!hasImg && typeof onTiledUpscale === 'function'
      const doTiled2x = () => {
        if (tiled2x === 'busy' || !onTiledUpscale) return
        setTiled2x('busy'); setTiledMsg('1/4')
        Promise.resolve(onTiledUpscale(node, (txt) => setTiledMsg(String(txt))))
          .then(() => { setTiled2x('ok'); setTiledMsg('') })
          .catch(() => { setTiled2x('err'); setTiledMsg('') })   // 失败态保留，再点即重试
      }
      // P2-3：标签编辑（输入+回车写 node.tags，删 tag 同步；画廊标签筛选读同一条链路）
      const [tagDraft, setTagDraft] = useState('')
      const nodeTags = node && Array.isArray(node.tags) ? node.tags : []
      const addTag = () => {
        const t = tagDraft.trim().slice(0, 24)
        if (!t || !node) return
        if (!nodeTags.includes(t)) {
          store.pushUndo()   // v11.2：标签增删入撤销栈
          node.tags = nodeTags.concat([t])
          store.emit()   // 驱动画布/画廊同步重渲染
          autosave()
        }
        setTagDraft('')
      }
      const removeTag = (t) => {
        if (!node) return
        store.pushUndo()   // v11.2：标签增删入撤销栈
        node.tags = nodeTags.filter((x) => x !== t)
        store.emit()
        autosave()
      }
      // 翻页/版本树换图时清掉未提交的标签草稿，防止误写到另一张图上
      useEffect(() => { setTagDraft('') }, [node && node.id])
      // v8：导出（canvas 下载）。P0-2：无 src 直接禁用；编码失败要有提示而不是静默 reject
      const doExport = async () => {
        if (!hasImg) { notify && notify('这张图还没有可导出的内容'); return }
        try {
          // P1-16：预览是显示分辨率，导出才按原分辨率应用滤镜（adjustedSrc 只作预览不作导出源）
          const outSrc = adjDirty ? await applyFiltersGpu(node.src, adj) : node.src
          const blob = await imageToBlob(outSrc, exportFmt, exportQuality, exportMeta ? node : null)
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url; a.download = (node && node.id || 'snx') + '.' + exportFmt
          a.click(); setTimeout(() => URL.revokeObjectURL(url), 400)   // v16.1:立即 revoke 偶发触发 Chromium 重启下载(第六任审计发现 1)
          setExportOpen(false)
          notify && notify('已导出 ' + a.download)
        } catch (e) {
          notify && notify('导出失败：' + String((e && e.message) || e))
        }
      }
      // v12：参数清单行集（InvokeAI ImageMetadataActions 式逐行）——
      // 基础 7 行常驻（提示词/负向词/模型/尺寸/种子/画板/创建时间），有参考图/滤镜再加行；
      // 值缺失显示「—」且不出回填按钮。SPEC-13 ②：画板行恢复回填按钮（回填写「目标画板」，
      // 形成「回填→生成回同一画板」闭环，v12 因无落点不加）；创建/调整仍为纯信息行
      const ROLE_LB = { reference: '参考', style: '风格', character: '角色', composition: '构图' }
      const pRefs = Array.isArray(params.refs) ? params.refs.filter((r) => r && r.src) : []
      const pSeed = typeof params.seed === 'number' ? params.seed : null
      const pAdj = params.adjusted && typeof params.adjusted === 'object' ? params.adjusted : null
      const adjTxt = pAdj ? ADJ_SPECS
        .map(([k, lb]) => ({ lb, v: Math.round(Number(pAdj[k]) || 0) }))
        .filter((x) => x.v !== 0)
        .map((x) => x.lb + ' ' + (x.v > 0 ? '+' : '') + x.v)
        .join(' · ') : ''
      const boardName = node && node.boardId
        ? (((boards || []).find((b) => b.id === node.boardId) || {}).name || (node.boardId || '').slice(0, 8))
        : '未分组'
      const plRows = [
        // v12.1（静态对账）：cls:'wrap'/'mono' 动态拼类名导致 CSS 对账看不见 .wrap——
        // 改为布尔标记，消费端拼字面量 'rv wrap'/'rv mono'，行为不变
        { k: 'prompt', label: '提示词', val: String(node && node.prompt || '').replace(/^💬\s*/, ''), btn: true, wrap: true },
        { k: 'negPrompt', label: '负向词', val: params.negative || '', btn: true },
        { k: 'model', label: '模型', val: params.model || '', btn: true, mono: true },
        { k: 'size', label: '尺寸', val: params.size ? params.size.replace('x', '×') : (node && node.w ? node.w + '×' + node.h : ''), btn: true, mono: true },
        { k: 'seed', label: '种子', val: pSeed === null ? '' : (pSeed < 0 ? '随机' : String(pSeed)), btn: pSeed !== null, mono: true },
        { k: 'board', label: '画板', val: boardName, btn: true },   // SPEC-13 ②：行级回填 targetBoard（未归板图=回填未分组）
        { k: 'created', label: '创建', val: date },
        pRefs.length ? {
          k: 'refs', label: '参考图', btn: true,
          val: pRefs.length + ' 张' + (pRefs.some((r) => ROLE_LB[r.role]) ? ' · ' + [...new Set(pRefs.map((r) => ROLE_LB[r.role] || '参考'))].join('/') : ''),
        } : null,
        adjTxt ? { k: 'adjusted', label: '调整', val: adjTxt } : null,
      ].filter(Boolean)
      return h('div', { className: 'snx-lb-backdrop', onClick: onClose },
        h('div', { className: 'snx-lb', onClick: (e) => e.stopPropagation() },
          // 顶栏
          h('div', { className: 'snx-lb-top' },
            h('div', { className: 'snx-lb-info' },
              h('span', { className: 'snx-lb-id' }, node && node.id ? node.id.slice(0, 8) : ''),
              h('span', { className: 'snx-lb-time' }, date),
              h('button', {
                type: 'button',
                className: 'snx-lb-fav' + (fav ? ' on' : ''),
                onClick: () => onToggleFavorite && onToggleFavorite(node),
                title: fav ? '取消收藏' : '收藏到画廊',
              }, ic('star', 14)),
            ),
            h('div', { style: { flex: 1 } }),
            // v10：←/→ 在已完成图中翻页
            onNav && nav && nav.total > 1 ? h('div', { className: 'snx-lb-nav' },
              h('button', { type: 'button', onClick: () => onNav(-1), title: '上一张（左方向键）' }, ic('chevron-left', 13)),
              h('span', { className: 'snx-lb-navct' }, (nav.idx + 1) + ' / ' + nav.total),
              h('button', { type: 'button', onClick: () => onNav(1), title: '下一张（右方向键）' }, ic('chevron-right', 13)),
            ) : null,
            // P1-1：「重绘增强」（原 2x/4x 假放大）——请求尺寸走已验证 SIZES 同比例档，与原图同分辨率重绘
            hasImg ? h('button', { type: 'button', className: 'snx-lb-up',
              onClick: () => onUpscale && onUpscale(node),
              title: '重绘增强：以这张图为参考重绘一张更清晰的版本（实际请求分辨率 ' + ((node && node.w && node.h) ? sizeForAspect(node.w, node.h) : '—') + '，不会成倍放大）',
            }, '重绘增强') : null,
            hasImg ? h('div', { className: 'snx-lb-zoom' },
              h('button', { type: 'button', onClick: () => setZoom((s) => s / 1.25), title: '缩小 (-)' }, ic('minus', 13)),
              h('span', null, Math.round(scale * 100) + '%'),
              h('button', { type: 'button', onClick: () => setZoom((s) => s * 1.25), title: '放大 (+)' }, ic('plus', 13)),
              h('button', { type: 'button', className: 'snx-lb-zoom-txt', onClick: () => setScale(1), title: '复位到适应窗口 (0)' }, '复位')   // v18.3:独立 text 类,原 26px 方钮把「复位」挤成竖排,
            ) : null,
            h('button', { className: 'snx-lb-close', type: 'button', onClick: onClose, title: '关闭 (Esc)' }, ic('x', 14)),
          ),
          // v8：3 栏布局 - 左版本树 / 中图 / 右调整+导出
          h('div', { className: 'snx-lb-body' },
            // 左：版本树
            tree ? h('aside', { className: 'snx-lb-tree' },
              h('div', { className: 'snx-lb-tree-h' }, ic('git-fork'), ' 衍生链'),
              h(VersionTree, { tree, currentId: node && node.id, onSelect: onOpenVersion }),
            ) : null,
            // 中：图片（P0-3：缩放改写布局宽高，overflow:auto 生效；拖拽平移；双击复位）
            h('div', { className: 'snx-lb-stage', ref: stageRef,
                onPointerDown: onStagePointerDown, onPointerMove: onStagePointerMove,
                onPointerUp: onStagePointerUp, onPointerCancel: onStagePointerUp,
                onDoubleClick: () => setScale(1),
                title: '滚轮缩放（以光标为中心）· 拖拽平移 · 双击复位',
              },
              hasImg && nat ? h('div', { className: 'snx-lb-imgwrap', style: { width: dispW + 'px', height: dispH + 'px' } },
                  h('img', { src: adjustedSrc, alt: '', className: 'snx-lb-img', draggable: false }),
                ) : hasImg ? h('div', { className: 'snx-lb-empty' }, h('span', { className: 'snx-spinring' }))
                : h('div', { className: 'snx-lb-empty' },
                  (node && (node.status === 'pending' || node.status === 'running')) ? h('span', { className: 'snx-spinring' }) : ic('triangle-alert', 26),
                  h('div', { className: 'snx-lb-empty-t' },
                    node && node.status === 'error'
                      ? '生成失败：' + String(node.errMsg || node.error || '未知错误').slice(0, 200)
                      : '这张图还没有内容，导出与调整已禁用'),
                ),
            ),
            // 右：调整（停靠）+ 详情 + 操作（P0-2：无 src 禁用调整）
            h('aside', { className: 'snx-lb-side' },
              // v10：调整面板
              hasImg ? h('div', { className: 'snx-lb-adj2' },
                h('div', { className: 'snx-lb-adj-h' },
                  ic('sliders-horizontal'), h('span', null, '调整'),
                  h('div', { style: { flex: 1 } }),
                  h('span', { className: 'snx-lb-adj-live' }, '实时预览'),
                ),
                ADJ_SPECS.map(([k, label, min, max]) => h('label', { key: k, className: 'snx-adjrow' },
                  h('span', null, label),
                  h('input', { type: 'range', min, max, value: adj[k] || 0, onChange: (e) => setAdjK(k, parseInt(e.target.value, 10)) }),
                  h('span', { className: 'v' }, adj[k] || 0),
                )),
                h('div', { className: 'snx-lb-presets' },
                  ADJ_PRESETS.map(([name, vals]) => h('button', {
                    key: name, type: 'button', className: 'snx-lb-preset',
                    onClick: () => setAdj(Object.assign({ brightness: 0, contrast: 0, saturation: 0, hue: 0, temp: 0, vignette: 0 }, vals)),
                  }, name)),
                ),
                h('div', { style: { display: 'flex', gap: '8px' } },
                  h('button', {
                    type: 'button', className: 'snx-lb-adj-rst',
                    onClick: () => setAdj({ brightness: 0, contrast: 0, saturation: 0, hue: 0, temp: 0, vignette: 0 }),
                    disabled: !adjDirty,
                    style: { flex: 1 },
                  }, ic('rotate-ccw'), ' 重置'),
                  h('button', {
                    type: 'button', className: 'snx-lb-adj-save',
                    onClick: () => onAdjust && onAdjust(node, adj),
                    disabled: !adjDirty,
                    style: { flex: 1 },
                  }, ic('check'), ' 应用'),
                ),
              ) : null,
              // v12：参数清单（InvokeAI ImageMetadataActions 式逐行 + 行级单键回填；整套回填主按钮置顶）
              h('div', { className: 'snx-lb-meta' },
                h('div', { className: 'snx-lb-plist-h' },
                  h('span', { className: 't' }, '参数清单'),
                  h('button', {
                    type: 'button', className: 'snx-lb-plist-go',
                    title: '整套回填：提示词/负向词/尺寸/模型/种子/参考图一次填回生图表单（热键 R）；该图已归画板时同时回填目标画板',
                    onClick: () => onRestoreParams && onRestoreParams(node),
                  }, ic('wand-sparkles', 12), '整套回填'),
                ),
                h('div', { className: 'snx-lb-rows' },
                  plRows.map((r) => {
                    const flashing = flash && flash.field === r.k
                    const hasVal = !!(r.val && r.val !== '—')
                    return h('div', {
                      key: r.k + (flashing ? ':' + flash.n : ''),
                      className: 'snx-lb-row' + (flashing ? ' fl' : ''),
                      onAnimationEnd: () => setFlash((f) => (f && f.field === r.k ? null : f)),
                    },
                      h('span', { className: 'rl' }, r.label),
                      h('span', { className: r.wrap ? 'rv wrap' : r.mono ? 'rv mono' : 'rv', title: r.wrap ? undefined : (r.val || '—') }, r.val || '—'),
                      r.btn && hasVal ? h('button', {
                        type: 'button', className: 'rb',
                        title: '只回填「' + r.label + '」到生图表单，其余不动'
                          + ({ prompt: '（热键 P）', seed: '（热键 S）', size: '（热键 D）' }[r.k] || ''),
                        onClick: () => doRestoreField(r.k),
                      }, ic('corner-right-down', 13)) : null,
                    )
                  }),
                ),
              ),
              // P2-3：标签编辑（写入 node.tags；画廊筛选条即时同步）
              h('div', { className: 'snx-lb-meta', style: { marginBottom: '10px' } },
                h('div', { className: 'lb' }, ic('tag'), ' 标签'),
                h('div', { className: 'snx-lb-tags' },
                  nodeTags.map((t) => h('span', { key: t, className: 'snx-lb-tag' }, '#' + t,
                    h('button', {
                      type: 'button', className: 'x', title: '删除标签「' + t + '」',
                      onClick: () => removeTag(t),
                    }, ic('x', 9)))),
                  h('input', {
                    className: 'snx-lb-tag-in', value: tagDraft,
                    placeholder: nodeTags.length ? '添加标签，回车确认' : '输入标签，回车添加',
                    onChange: (e) => setTagDraft(e.target.value),
                    onKeyDown: (e) => {
                      // 输入框内按键全部就地消费：灯箱 window 监听不看 isTyping，
                      // 否则 Esc 会连带关灯箱、←/→ 会翻页
                      e.stopPropagation()
                      if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); addTag() }
                      else if (e.key === 'Escape') setTagDraft('')
                    },
                  }),
                ),
              ),
              // v10：画板归属
              h('div', { className: 'snx-lb-meta', style: { marginBottom: '10px' } },
                h('div', { className: 'lb' }, ic('folder-plus'), ' 画板'),
                h(SnxSelect, {
                  value: (node && node.boardId) || '',
                  width: '100%',
                  onChange: (v) => onChangeBoard && onChangeBoard(node, v),
                  options: [{ value: '', label: '未分组' }].concat((boards || []).map((b) => ({ value: b.id, label: b.name }))),
                }),
              ),
              h('div', { className: 'snx-lb-acts' },
                // SPEC-17 二：同种子重生成——点击=回填该图 种子+提示词/尺寸/模型 到生图表单并直接
                // 触发重生成（与「同参数重抽」共用直连 POST，但 seed=该图种子而非随机）；四态防连点。
                // 图标 ic('lock')（ICONS 已有，不引入 emoji）；无种子可锁的图不出按钮
                canRegenSeed ? h('button', {
                  type: 'button', className: 'snx-lb-act go',
                  disabled: regenSeed === 'busy',
                  title: regenSeed === 'busy' ? '正在按同种子重生成…'
                    : regenSeed === 'err' ? '重生成失败，点击重试'
                    : '锁定该图种子 ' + node.params.seed + '，按同提示词/尺寸/模型直接重生成一张（种子不变=可控变体），参数同时回填生图表单',
                  onClick: doRegenSameSeed,
                },
                  regenSeed === 'busy' ? [h('span', { className: 'snx-spinring', key: 'r' }), ' 重生成中']
                    : regenSeed === 'ok' ? [ic('check', 12), ' 已重生成']
                      : regenSeed === 'err' ? [ic('triangle-alert', 12), ' 重试']
                        : [ic('lock'), ' 同种子重生成']) : null,
                canTiled ? h('button', {
                  type: 'button', className: 'snx-lb-act',
                  disabled: tiled2x === 'busy',
                  title: tiled2x === 'busy' ? '正在分块放大…'
                    : tiled2x === 'err' ? '放大失败，点击重试'
                    : '分块重绘放大 2×：把图切 4 块逐块超分重绘再缝合（质量依赖上游重绘保真，非专用放大模型），结果落到源图右侧',
                  onClick: doTiled2x,
                },
                  tiled2x === 'busy' ? [h('span', { className: 'snx-spinring', key: 'r' }), ' 放大中 ' + tiledMsg]
                    : tiled2x === 'ok' ? [ic('check', 12), ' 已放大 2×']
                      : tiled2x === 'err' ? [ic('triangle-alert', 12), ' 重试']
                        : [ic('expand'), ' 放大 2×']) : null,
                hasImg ? h('button', { className: 'snx-lb-act go', type: 'button', onClick: onUseAsAnchor }, ic('image-plus'), ' 作为参考图') : null,
                h('button', { className: 'snx-lb-act', type: 'button', onClick: onEdit }, ic('pen-tool'), ' 画布编辑'),
                h('button', { className: 'snx-lb-act', type: 'button', onClick: onCopyParams }, ic('clipboard-copy'), ' 复制参数'),
                // v12：回填入口收拢进「参数清单」面板（整套回填在面板顶部，行级回填在各行尾），
                // 操作区不再重复堆 P/S/D 单字段按钮；R/P/S/D 热键保持可用
                hasImg ? h('button', { className: 'snx-lb-act', type: 'button', onClick: onDownload }, ic('download'), ' 原始下载') : null,
                hasImg ? h('button', { className: 'snx-lb-act', type: 'button', onClick: () => setExportOpen(!exportOpen) }, ic('package'), ' 导出…') : null,
                h('button', { className: 'snx-lb-act danger', type: 'button', onClick: onDelete }, ic('trash-2'), ' 删除'),
              ),
              // v8：导出面板
              exportOpen ? h('div', { className: 'snx-lb-export' },
                h('div', { className: 'lb' }, ic('package'), ' 导出设置'),
                h('label', null, h('span', null, '格式'),
                  h(SnxSelect, { value: exportFmt, onChange: (v) => setExportFmt(v), width: 130, options: [
                    { value: 'png', label: 'PNG（无损）' },
                    { value: 'jpg', label: 'JPG（压缩）' },
                    { value: 'webp', label: 'WebP（推荐）' },
                  ] }),
                ),
                exportFmt !== 'png' ? h('label', null, h('span', null, '质量'),
                  h('input', { type: 'range', min: 50, max: 100, value: exportQuality, onChange: (e) => setExportQuality(parseInt(e.target.value, 10)) }),
                  h('span', { className: 'v' }, exportQuality + '%'),
                ) : null,
                exportFmt === 'png' ? h('label', { className: 'snx-lb-export-chk' },
                  h('input', { type: 'checkbox', checked: exportMeta, onChange: (e) => setExportMeta(e.target.checked) }),
                  h('span', null, '嵌入元数据（提示词/参数到 PNG tEXt）'),
                ) : null,
                h('div', { className: 'snx-lb-export-acts' },
                  h('button', { type: 'button', className: 'snx-lb-act go', onClick: doExport }, ic('check'), ' 导出'),
                  h('button', {
                    type: 'button', className: 'snx-lb-act', title: '复制 PNG 到系统剪贴板（可粘贴到聊天/图像软件）',
                    onClick: async () => {
                      try {
                        if (!navigator.clipboard || !window.ClipboardItem) throw new Error('此浏览器不支持图像剪贴板')
                        const blob = await imageToBlob(node && node.src, 'png', 92, null)
                        await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })])
                        notify && notify('图像已复制到剪贴板')
                      } catch (e) { notify && notify('复制失败：' + String((e && e.message) || e)) }
                    },
                  }, ic('copy'), ' 复制图像'),
                  h('button', { type: 'button', className: 'snx-lb-act', onClick: () => setExportOpen(false) }, '取消'),
                ),
              ) : null,
            ),
          ),
        ),
      )
    }

    // ——— v8：版本树构建 ———
    function buildVersionTree(node, store) {
      if (!node) return null
      // 找根：追溯 parentId（visited 集合防文档数据成环 A/B 互指时死循环，自引用同样被挡）
      let root = node
      const seen = new Set()
      while (root.parentId && !seen.has(root.id)) {
        seen.add(root.id)
        const p = store.node(root.parentId)
        if (!p) break
        root = p
      }
      // DFS 构建树（visited 防环：损坏数据成环时剪断回边，不再无限递归/渲染挂死）
      const visited = new Set()
      const build = (n, depth) => {
        visited.add(n.id)
        const children = store.doc.nodes
          .filter((c) => c.parentId === n.id && !visited.has(c.id))
          .map((c) => build(c, depth + 1))
        return { node: n, children, depth }
      }
      return build(root, 0)
    }

    // ——— v8：版本树渲染（递归）———
    function VersionTree({ tree, currentId, onSelect }) {
      const renderNode = (t) => h('div', { key: t.node.id, className: 'snx-tree-node' + (t.node.id === currentId ? ' on' : '') },
        h('button', {
          type: 'button', className: 'snx-tree-row', style: { paddingLeft: 8 + t.depth * 12 + 'px' },
          onClick: () => onSelect && onSelect(t.node),
        },
          h('div', { className: 'snx-tree-thumb' },
            t.node.src ? h('img', { src: t.node.src, alt: '', loading: 'lazy' }) : ic('image', 12),
          ),
          h('div', { className: 'snx-tree-info' },
            h('div', { className: 'pr' }, (t.node.prompt || '—').slice(0, 32)),
            h('div', { className: 'sub' },
              t.node.id === currentId ? h('span', { className: 'snx-tree-curr' }, '当前') : null,
              t.node.status !== 'done' ? h('span', null, STATUS_ZH[t.node.status] || t.node.status) : null,   // v11.2：状态中文
            ),
          ),
          t.children.length ? h('span', { className: 'snx-tree-cnt' }, t.children.length) : null,
        ),
        t.children.length ? h('div', { className: 'snx-tree-children' }, t.children.map(renderNode)) : null,
      )
      return h('div', { className: 'snx-tree' }, renderNode(tree))
    }

    // ——— v10：GPU 滤镜管线（ctx.filter + soft-light 色温层 + 径向晕影），任意尺寸实时预览 ———
    // P1-16：maxSide 传入时按显示分辨率降采样渲染（灯箱预览用，滑块拖动不再对原分辨率
    // 全量编码 PNG）；不传 = 原分辨率（「应用」落新节点 / 导出时用）
    function applyFiltersGpu(src, adj, maxSide) {
      return new Promise((resolve) => {
        const dirty = adj && (adj.brightness || adj.contrast || adj.saturation || adj.hue || adj.temp || adj.vignette)
        if (!src || !dirty) { resolve(src); return }
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => {
          try {
            const s0 = maxSide ? Math.min(1, maxSide / img.naturalWidth, maxSide / img.naturalHeight) : 1
            const cv = document.createElement('canvas')
            cv.width = Math.max(1, Math.round(img.naturalWidth * s0))
            cv.height = Math.max(1, Math.round(img.naturalHeight * s0))
            const cx = cv.getContext('2d')
            cx.filter = `brightness(${1 + (adj.brightness || 0) / 100}) contrast(${1 + (adj.contrast || 0) / 100}) saturate(${1 + (adj.saturation || 0) / 100}) hue-rotate(${adj.hue || 0}deg)`
            cx.drawImage(img, 0, 0, cv.width, cv.height)
            cx.filter = 'none'
            const t = adj.temp || 0
            if (t) {
              cx.globalCompositeOperation = 'soft-light'
              cx.fillStyle = t > 0 ? `rgba(255,138,40,${t / 220})` : `rgba(70,140,255,${-t / 220})`
              cx.fillRect(0, 0, cv.width, cv.height)
              cx.globalCompositeOperation = 'source-over'
            }
            const v = adj.vignette || 0
            if (v) {
              const g = cx.createRadialGradient(cv.width / 2, cv.height / 2, Math.min(cv.width, cv.height) * 0.42, cv.width / 2, cv.height / 2, Math.max(cv.width, cv.height) * 0.72)
              g.addColorStop(0, 'rgba(0,0,0,0)')
              g.addColorStop(1, `rgba(0,0,0,${v / 100})`)
              cx.fillStyle = g
              cx.fillRect(0, 0, cv.width, cv.height)
            }
            resolve(cv.toDataURL('image/png'))
          } catch (e) { resolve(src) }
        }
        img.onerror = () => resolve(src)
        img.src = src
      })
    }

    // ——— v8：图片滤镜（亮度/对比/饱和）实时预览 ———
    // 异步版：lightbox 里实时显示 + 「应用」按钮 → 真出图
    function applyFiltersAsync(src, b, c, s) {
      return new Promise((resolve) => {
        if (!src || (!b && !c && !s)) { resolve(src); return }
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => {
          try {
            const cv = document.createElement('canvas')
            cv.width = img.naturalWidth; cv.height = img.naturalHeight
            const cx = cv.getContext('2d')
            cx.drawImage(img, 0, 0)
            const data = cx.getImageData(0, 0, cv.width, cv.height)
            const px = data.data
            // brightness: 加法；contrast: 缩放；saturation: 与灰度插值
            const bright = b / 100
            const contr = (c / 100 + 1)  // 0~2
            const sat = (s / 100 + 1)   // 0~2
            for (let i = 0; i < px.length; i += 4) {
              let r = px[i], g = px[i + 1], bl = px[i + 2]
              // brightness
              r += bright * 255; g += bright * 255; bl += bright * 255
              // contrast (around 128)
              r = (r - 128) * contr + 128
              g = (g - 128) * contr + 128
              bl = (bl - 128) * contr + 128
              // saturation (around gray = 0.299*r + 0.587*g + 0.114*bl)
              const gray = 0.299 * r + 0.587 * g + 0.114 * bl
              r = gray + (r - gray) * sat
              g = gray + (g - gray) * sat
              bl = gray + (bl - gray) * sat
              px[i] = Math.max(0, Math.min(255, r))
              px[i + 1] = Math.max(0, Math.min(255, g))
              px[i + 2] = Math.max(0, Math.min(255, bl))
            }
            cx.putImageData(data, 0, 0)
            resolve(cv.toDataURL('image/png'))
          } catch (e) { resolve(src) }
        }
        img.onerror = () => resolve(src)
        img.src = src
      })
    }

    // ——— v8：导出工具 ———
    async function imageToBlob(src, fmt, quality, meta) {
      const img = await new Promise((res, rej) => {
        const im = new Image(); im.crossOrigin = 'anonymous'
        im.onload = () => res(im); im.onerror = rej; im.src = src
      })
      const cv = document.createElement('canvas')
      cv.width = img.naturalWidth; cv.height = img.naturalHeight
      const cx = cv.getContext('2d')
      cx.drawImage(img, 0, 0)
      // PNG 元数据：meta 时把 prompt / params 写到 PNG iTXt / tEXt（简化：直接进 dataURL → 用 png-chunks 库）
      const mime = fmt === 'jpg' ? 'image/jpeg' : fmt === 'webp' ? 'image/webp' : 'image/png'
      const dataUrl = cv.toDataURL(mime, quality / 100)
      if (fmt === 'png' && meta && meta.prompt) {
        // 简化：用 fetch + 拼装 tEXt 块
        try {
          const buf = await (await fetch(dataUrl)).arrayBuffer()
          const bytes = new Uint8Array(buf)
          // 在 IDAT 之前插入 tEXt 块
          const txt = `${meta.prompt.slice(0, 500)} | model=${meta.params?.model || ''} | size=${meta.params?.size || ''} | seed=${meta.params?.seed ?? ''}`
          const textBytes = new TextEncoder().encode(txt)
          const len = textBytes.length
          const chunk = new Uint8Array(4 + 4 + len + 4)  // length(4) + type(4) + data + crc(4)
          const dv = new DataView(chunk.buffer)
          dv.setUint32(0, len)
          chunk[4] = 0x74; chunk[5] = 0x45; chunk[6] = 0x58; chunk[7] = 0x74  // tEXt
          // tEXt 格式：keyword\0text
          const k = new TextEncoder().encode('sensenova')
          const full = new Uint8Array(k.length + 1 + textBytes.length)
          full.set(k, 0); full[k.length] = 0; full.set(textBytes, k.length + 1)
          // 重新构造
          const realChunk = new Uint8Array(4 + 4 + full.length + 4)
          const dv2 = new DataView(realChunk.buffer)
          dv2.setUint32(0, full.length)
          realChunk[4] = 0x74; realChunk[5] = 0x45; realChunk[6] = 0x58; realChunk[7] = 0x74
          realChunk.set(full, 8)
          // CRC
          const crcVal = crc32(realChunk.subarray(4, 8 + full.length))
          dv2.setUint32(8 + full.length, crcVal >>> 0)
          // 找到 IHDR 后插入（PNG header 8B + IHDR chunk 25B）
          const out = new Uint8Array(bytes.length + realChunk.length)
          out.set(bytes.subarray(0, 33), 0)
          out.set(realChunk, 33)
          out.set(bytes.subarray(33), 33 + realChunk.length)
          return new Blob([out], { type: mime })
        } catch { return await (await fetch(dataUrl)).blob() }
      }
      return await (await fetch(dataUrl)).blob()
    }
    // ——— 整画布导出：全部可见 done 图按文档布局合成一张 PNG（2x 超采样）———
    async function exportCanvasPng() {
      const nodes = store.doc.nodes.filter((n) => n.status === 'done' && n.src && !n.hidden)
      if (!nodes.length) throw new Error('画布上没有可导出的图片（隐藏图不计入）')
      const x0 = Math.min(...nodes.map((n) => n.x))
      const y0 = Math.min(...nodes.map((n) => n.y))
      const x1 = Math.max(...nodes.map((n) => n.x + n.w))
      const y1 = Math.max(...nodes.map((n) => n.y + n.h))
      const scale = 2
      const cv = document.createElement('canvas')
      cv.width = Math.ceil((x1 - x0) * scale); cv.height = Math.ceil((y1 - y0) * scale)
      const cx = cv.getContext('2d')
      cx.fillStyle = snxTheme().surface   // 底色跟随主题（与画布观感一致）
      cx.fillRect(0, 0, cv.width, cv.height)
      for (const n of nodes) {   // z 序 = 文档顺序
        const im = await loadImg(n.src)
        cx.drawImage(im, Math.round((n.x - x0) * scale), Math.round((n.y - y0) * scale), Math.round(n.w * scale), Math.round(n.h * scale))
      }
      return { url: cv.toDataURL('image/png'), w: cv.width, h: cv.height, count: nodes.length }
    }
    // CRC32（PNG tEXt 用）
    const _crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c } return t })()
    function crc32(buf) { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = _crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0 }

    // ── SPEC-17 一：store-only zip 打包（客户端手写，无外部依赖，~80 行）——PNG 本身已压缩无需
    // deflate，method=0(store)：local file header + central directory + EOCD 三段式；CRC32 复用上面的 crc32。
    // 文件名按 UTF-8 编码并置 general purpose bit 0x0800，中文提示词文件名解压不乱码。
    // 已知边界（如实）：条目数 >65535 或单文件 >4GB 需 zip64 扩展，本实现未做——画廊批量导出达不到该量级。
    // entries: [{ name: string, data: Uint8Array }] → Blob('application/zip')
    function storeOnlyZip(entries) {
      const enc = new TextEncoder()
      const u16 = (v) => new Uint8Array([v & 0xff, (v >>> 8) & 0xff])
      const u32 = (v) => new Uint8Array([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff])
      const cat = (parts) => {
        let n = 0; for (const p of parts) n += p.length
        const out = new Uint8Array(n)
        let o = 0; for (const p of parts) { out.set(p, o); o += p.length }
        return out
      }
      const now = new Date()   // DOS 时间：秒 2 秒精度、月份 1-12、年份自 1980
      const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2)
      const dosDate = (((now.getFullYear() - 1980) & 0x3f) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()
      const chunks = []    // 顺序拼接的二进制段（各成员 → central directory → EOCD）
      const centrals = []
      let offset = 0       // 下一 local file header 起始偏移
      for (const e of entries) {
        const name = enc.encode(String(e.name || 'f'))
        const data = e.data
        const crc = crc32(data)
        // local file header（30B 固定段 + 文件名）：store 下压缩=原始长度
        const head = cat([
          u32(0x04034b50), u16(20), u16(0x0800), u16(0),
          u16(dosTime), u16(dosDate), u32(crc),
          u32(data.length), u32(data.length),
          u16(name.length), u16(0),
          name,
        ])
        chunks.push(head, data)
        // central directory 记录（46B 固定段 + 文件名）：记录 local header 偏移供随机解压
        centrals.push(cat([
          u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0),
          u16(dosTime), u16(dosDate), u32(crc),
          u32(data.length), u32(data.length),
          u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset),
          name,
        ]))
        offset += head.length + data.length
      }
      const cdOffset = offset
      let cdSize = 0
      for (const c of centrals) { chunks.push(c); cdSize += c.length }
      // EOCD（22B）：条目数 + central directory 尺寸/偏移
      chunks.push(cat([
        u32(0x06054b50), u16(0), u16(0),
        u16(entries.length), u16(entries.length),
        u32(cdSize), u32(cdOffset), u16(0),
      ]))
      return new Blob(chunks, { type: 'application/zip' })
    }

    // ——— 设置卡片（插件配置页，v4.1：模型下拉 + 描述 + 测试连接）———
    const MODEL_PRESETS = [
      { id: '__keep__', label: '— 保留当前 —', desc: '不修改此项（保存时不发送）' },
      { id: 'sensenova-u1.5-lite', label: 'sensenova-u1.5-lite（当前可用·文生图/图生图）', desc: '2026-10 实测 /v1/models 可见；走 images/generations。旧的 u1-fast 已下线。' },
      { id: 'sensenova-u1.5-fast', label: 'sensenova-u1.5-fast（官方文档在列·文生图/图生图，未真机验证）', desc: '2026-10-18 真机验证通过：生成+参考图编辑均出图（id 实测有效，/v1/models 不列出图像模型属正常）。' },
      { id: 'sensenova-u1.5', label: 'sensenova-u1.5（U1.5 多模态，已开通时）', desc: '走 chat/completions，支持图像编辑/增强/扩图（画布"增强"入口专用）。' },
      { id: '__custom__', label: '自定义…', desc: '手动填入控制台模型广场实际可见的 id。' },
    ]
    function ConfigCard() {
      const [apiKey, setApiKey] = useState('')
      const [showKey, setShowKey] = useState(false)
      const [baseUrl, setBaseUrl] = useState('')
      const [model, setModel] = useState('')
      const [modelPreset, setModelPreset] = useState('__keep__')
      const [msg, setMsg] = useState('')
      const [testMsg, setTestMsg] = useState('')
      const [testing, setTesting] = useState(false)
      const [presetsInited, setPresetsInited] = useState(false)
      useEffect(() => {
        get(CONFIG_ROUTE).then((r) => {
          const m = (r.config && r.config.model) || ''
          const b = (r.config && r.config.baseUrl) || ''
          setBaseUrl(b)
          setModel(m)
          const matched = MODEL_PRESETS.find((p) => p.id === m)
          setModelPreset(matched ? matched.id : (m ? '__custom__' : '__keep__'))
          setPresetsInited(true)
        })
      }, [])
      const save = async () => {
        setMsg('保存中…'); setTestMsg('')
        const finalModel = modelPreset === '__custom__' ? model.trim()
          : modelPreset === '__keep__' ? '' : modelPreset
        const payload = { apiKey: apiKey.trim(), baseUrl: baseUrl.trim() }
        if (finalModel) payload.model = finalModel
        const r = await post(CONFIG_ROUTE, payload)
        setMsg(r.ok ? (r.persisted ? '已保存并持久化（立即生效）' : '已生效（本会话）——持久化暂不可用') : '保存失败：' + (r.error || '未知错误'))
      }
      const test = async () => {
        setTesting(true); setTestMsg('测试中…')
        try {
          try {
            // 先查 GET /api/sensenova/status：keyConfigured=false 直接给结论，不空打上游
            const st = await get(STATUS_ROUTE)
            if (st && st.ok && st.keyConfigured === false) {
              setTestMsg('未检测到 API Key（keyConfigured=false）：上方填 Key 并「保存设置」，或设 SENSENOVA_API_KEY 环境变量后重试')
              return
            }
            const r = await post('/api/sensenova/test', {})
            if (r.ok) {
              const ms = Array.isArray(r.models) && r.models.length
                ? `（共 ${r.models.length} 个模型可见：${r.models.slice(0, 6).join(', ')}${r.models.length > 6 ? '…' : ''}）`
                : ''
              setTestMsg('连接成功 · Key 已配置 ' + ms)
            } else {
              setTestMsg('连接失败：' + (r.error || '未知错误'))
            }
          } catch (e) {
            setTestMsg('测试失败：' + (e instanceof Error ? e.message : String(e)))
          }
        } finally {
          setTesting(false)   // 任何分支（含 keyConfigured=false 的 early-return）都要解锁按钮
        }
      }
      const presetDesc = (MODEL_PRESETS.find((p) => p.id === modelPreset) || {}).desc || ''
      return h('div', { className: 'snx-cfg', style: { maxWidth: '640px' } },
        // ——— API Key ———
        h('div', { className: 'snx-cfg-row' },
          h('label', { className: 'snx-cfg-lb' }, 'API Key'),
          h('span', { className: 'snx-cfg-hint' }, ' 商汤 SenseNova 控制台「API Key 管理」页创建。留空 = 不修改（保留现有/环境变量）'),
          h('div', { className: 'snx-cfg-in-wrap' },
            h('input', {
              className: 'snx-cfg-in',
              type: showKey ? 'text' : 'password',
              value: apiKey,
              onChange: (e) => setApiKey(e.target.value),
              placeholder: 'sk-...（不修改则留空）',
              autoComplete: 'off',
              spellCheck: false,
            }),
            h('button', {
              className: 'snx-cfg-eye', type: 'button',
              onClick: () => setShowKey(!showKey),
              title: showKey ? '隐藏' : '显示',
            }, showKey ? ic('eye-off') : ic('eye')),
          ),
        ),
        // ——— baseUrl ———
        h('div', { className: 'snx-cfg-row' },
          h('label', { className: 'snx-cfg-lb' }, 'baseUrl'),
          h('span', { className: 'snx-cfg-hint' }, ' 一般无需改。默认 https://token.sensenova.cn/v1'),
          h('input', {
            className: 'snx-cfg-in', value: baseUrl,
            onChange: (e) => setBaseUrl(e.target.value),
            spellCheck: false,
          }),
        ),
        // ——— 模型 ———
        h('div', { className: 'snx-cfg-row' },
          h('label', { className: 'snx-cfg-lb' }, '模型'),
          h('span', { className: 'snx-cfg-hint' }, ' 选预设或自定义。控制台「模型广场」可查实际 id。'),
          h(SnxSelect, {
            value: presetsInited ? modelPreset : '__keep__',
            onChange: (v) => {
              setModelPreset(v)
              if (v !== '__keep__' && v !== '__custom__') setModel(v)
            },
            popWidth: 300,
            options: MODEL_PRESETS.map((p) => ({ value: p.id, label: p.label })),
          }),
          modelPreset === '__custom__'
            ? h('input', {
              className: 'snx-cfg-in', style: { marginTop: '8px', fontFamily: 'var(--mono, monospace)' },
              value: model,
              onChange: (e) => setModel(e.target.value),
              placeholder: '自定义模型 id（控制台模型广场可见的实际 id）',
              spellCheck: false,
            })
            : null,
          presetDesc ? h('span', { className: 'snx-cfg-help' }, presetDesc) : null,
        ),
        // ——— 按钮组 ———
        h('div', { className: 'snx-cfg-actions' },
          h('button', { className: 'snx-cfg-go', onClick: save }, ic('save'), ' 保存设置'),
          h('button', { className: 'snx-cfg-test', onClick: test, disabled: testing },
            testing ? [h('span', { className: 'snx-spinring' }), ' 测试中…'] : ic('plug'), ' 测试连接'),
        ),
        msg ? h('div', { className: 'snx-cfg-msg ' + (/(失败|未检测到)/.test(msg) ? 'err' : 'ok') }, msg) : null,
        testMsg ? h('div', { className: 'snx-cfg-msg ' + (/(失败|未检测到)/.test(testMsg) ? 'err' : 'ok') }, testMsg) : null,
      )
    }

    // ——— 客户端生命周期 ———
    // v4.2：把工作台作为 rightbar tab 注入到 dsh 官方右栏（dsh-client-ui-sidebar-right），
    //       跟文件浏览器 tab 并排，不再替换左侧会话栏、不挡会话列表。
    //       侧栏底部"生图"按钮调用 ctx.layout.openRightbar() 把右栏滑出。
    const SNX_TAB_KEY = 'dsh-sensenova-image'
    const SNX_TAB_KIND = 'sensenova-image'
    window.__snxDebug = { step: 'init' }

    function apply(ctx) {
      const style = document.createElement('style')
      style.textContent = css
      document.head.appendChild(style)
      initBridge(ctx)
      // SPEC-13 ②：把宿主「打开工作台 tab」通道注入模块级 openWbTab——对话卡在 apply 闭包外，
      // 经它打开生图视图；与侧栏底部「生图」按钮同一套（sidebarRight.openTab 优先，layout.openRightbar 退路）
      openWbTab = () => {
        try {
          if (ctx.sidebarRight && typeof ctx.sidebarRight.openTab === 'function') ctx.sidebarRight.openTab(SNX_TAB_KIND)
          else if (ctx.layout && typeof ctx.layout.openRightbar === 'function') ctx.layout.openRightbar(true, false)
        } catch (e) { console.warn('[sensenova-image] openTab failed', e) }
      }
      window.__snxDebug = { step: 'init', errs: [] }
      try {
        window.__snxDebug.step = 'apply'
        window.__snxDebug.hasLayout = !!(ctx.layout && ctx.layout.openRightbar)
        window.__snxDebug.step = 'settings-section'
        ctx.effect(() => ctx.slots.inject('settings.section', () =>
          ctx.slots.register({ name: 'settings.section', id: 'sensenova-image', order: 45, label: 'SenseNova 生图' }, ConfigCard)
        ), 'sensenova-image: settings.section')
        window.__snxDebug.step = 'rb-tab-body'
        ctx.effect(() => {
          window.__snxDebug.tabBodyFired = true
          // 1) 注册 tab 类型（让右栏能识别这个 kind，能 openTab / 显示 chip）
          ctx.sidebarRightTabs.register({
            id: SNX_TAB_KEY,
            kind: SNX_TAB_KIND,
            priority: 'plugin',
            title: () => 'SenseNova 生图',
            icon: () => h('span', { className: 'snx-rb-ico' }, ic('zap')),
          })
          // 2) 注册 tab body 渲染组件
          ctx.slots.inject('sidebar.right.pane.tab', () =>
            ctx.slots.register({
              name: 'sidebar.right.pane.tab',
              key: SNX_TAB_KEY,
              inject: () => ({ hooks: {} }),
            }, function WorkbenchBoundary(props) { return h(WBErrorBoundary, null, h(Workbench, props)) }))
        }, 'sensenova-image: sidebar.right.pane.tab')
        window.__snxDebug.tabBodyInject = true
        window.__snxDebug.step = 'rb-tab-title'
        ctx.effect(() => {
          window.__snxDebug.tabTitleFired = true
          ctx.slots.inject('sidebar.right.pane.tab.title', () =>
            ctx.slots.register({ name: 'sidebar.right.pane.tab.title', key: SNX_TAB_KEY },
              () => h('span', { className: 'snx-rb-title' },
                h('span', { className: 'snx-rb-ico' }, ic('zap')),
                'SenseNova 生图',
              )))
        }, 'sensenova-image: sidebar.right.pane.tab.title')
        window.__snxDebug.tabTitleInject = true

        // ── v8.1：dsh-better-sidebar 兼容（可选软依赖）──
        // 如果用户装了 dsh-better-sidebar，再额外注册一个原生 tab + 文件预览器，
        // 这样在 better-sidebar 的「+」菜单里也能开到工作台，文件树里点 .png/.jpg/.webp 走我的预览
        if (hasBetterSidebar(ctx)) {
          window.__snxDebug.bsbAttempted = true
          const bsb = ctx.get('betterSidebar')
          if (bsb && typeof bsb.registerTab === 'function') {
            ctx.effect(() =>
              bsb.registerTab({
                id: 'dsh-sensenova-image:workbench',
                title: () => 'SenseNova 生图',
                description: () => '商汤 U1.5 多模态生图工作台：并发队列 / 多参考图 / 画笔 / 全屏画布',
                icon: () => h('span', { className: 'snx-rb-ico' }, ic('zap')),
                order: 60,
                single: true,
                component: function SenseNovaWorkbench() {
                  // better-sidebar 会把组件挂到自己的容器里，复用同一份 Workbench
                  return h('div', { className: 'snx-pro', style: { containerType: 'inline-size', containerName: 'snxpro', width: '100%', height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' } },
                    h(WBErrorBoundary, null, h(Workbench, { /* 由 bsb 注入 scope */ })),
                  )
                },
                onOpen: (ctx2, scope) => {
                  try {
                    if (window.__snxNotify) window.__snxNotify('已打开 SenseNova 生图工作台')
                  } catch {}
                },
              }), 'sensenova-image: bsb.tab'
            )
          }
          if (bsb && typeof bsb.registerFileViewer === 'function') {
            // 接管 .png / .jpg / .jpeg / .webp / .gif 文件（DSH 资源协议或文件路径）
            ctx.effect(() =>
              bsb.registerFileViewer({
                id: 'dsh-sensenova-image:image',
                exts: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'],
                fetchStrategy: 'url',   // 文件树一般已返回 URL，直接用
                component: ({ path, src }) => h(ImagePreview, { path, src }),
              }), 'sensenova-image: bsb.viewer'
            )
          }
        }
        window.__snxDebug.step = 'sidebar-footer'
        ctx.effect(() => {
          const Icon = h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' },
            h('rect', { x: 3, y: 3, width: 18, height: 18, rx: 3 }),
            h('circle', { cx: 8.5, cy: 8.5, r: 1.5, fill: 'currentColor', stroke: 'none' }),
            h('path', { d: 'M21 15l-5-5L5 21' }),
          )
          ctx.slots.inject('sidebar.footer.action', () =>
            ctx.slots.register({ name: 'sidebar.footer.action', id: 'dsh-sensenova-image', order: 25 },
              () => h('button', {
                className: 'snx-sidebtn',
                title: 'SenseNova 生图工作台（在 dsh 右栏打开）',
                onClick: () => {
                  try {
                    // 1) 打开/激活 sensenova-image tab（会自动展开右栏）
                    if (ctx.sidebarRight && typeof ctx.sidebarRight.openTab === 'function') {
                      ctx.sidebarRight.openTab(SNX_TAB_KIND)
                    } else if (ctx.layout && typeof ctx.layout.openRightbar === 'function') {
                      // 退路：仅打开右栏
                      ctx.layout.openRightbar(true, false)
                    }
                  } catch (e) { console.warn('[sensenova-image] openTab failed', e) }
                },
              }, Icon, '生图')))
        }, 'sensenova-image: sidebar.footer.action')
        window.__snxDebug.step = 'tool-call-toolview'
        // 三个生图工具共用同一张卡（v9：编辑/增强工具也有卡了）
        for (const toolKey of ['sensenova_generate_image', 'sensenova_edit_image', 'sensenova_enhance_image']) {
          ctx.slots.inject('tool.call.toolview', () =>
            ctx.slots.register({ name: 'tool.call.toolview', key: toolKey, id: 'dsh-sensenova-image', order: 10 }, SnxToolCard))
        }
        // v9：回合尾投递——Turn 折叠后生成的图仍直接落在回复下方。
        // sessions/uiConversation 缺任何一个就留空座位，只损失投递不损失卡片。
        ctx.slots.inject('conversation.chat.turnTail', () =>
          ctx.slots.register({
            name: 'conversation.chat.turnTail',
            id: 'dsh-sensenova-image',
            inject: function (sessionId) {
              try {
                const binding = ctx.sessions.binding(sessionId)
                if (binding === void 0) return {}
                const chat = ctx.uiConversation.binding(binding).target('chat')
                return {
                  keyedHooks: {
                    turnMedia: function (turn) {
                      const snapshot = chat.getSnapshot()
                      if (snapshot === void 0) return []
                      return snapshot.nodes.turnDataSource(Number(turn), 'tool-call')
                    },
                  },
                }
              } catch (e) { return {} }
            },
          }, SnxMediaTail))
        window.__snxDebug.step = 'done'
      } catch (e) {
        window.__snxDebug.errs.push(String((e && e.stack) || e))
      }
    }

    module.exports.apply = apply
    module.exports.inject = inject
    return module.exports
  },
})
