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
