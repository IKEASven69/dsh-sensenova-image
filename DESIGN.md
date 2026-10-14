# DESIGN.md

## 主题

暗色为主(跟随宿主 dsh 0.2 主题令牌自动明暗)。场景:开发者在 27 寸显示器上、IDE 旁的侧栏/底栏里管理生图任务,环境光正常,注意力在图不在壳。

## 颜色(Restrained 策略)

全部经令牌桥取自宿主,自带硬 fallback:

- 强调色 `--snx-accent` ← `--dsw-alias-link`(#7aaaff DeepSeek 蓝):仅用于主操作/当前选中/状态指示,不做装饰
- 语义色 `--snx-ok`(绿)/`--snx-warn`(琥珀)/`--snx-error`(红):状态词汇表,禁止挪作他用
- 中性面:`--dsw-alias-bg-layer-1/2/3` 三层(内容面/面板面/悬浮面),文字 `--dsw-alias-label-primary/secondary/tertiary/caption`
- 禁 `#000/#fff` 裸值;高亮用 `color-mix(in srgb, accent 15%, transparent)` 一类

## 排版

系统字体栈(`var(--dsw-font-family)` → Segoe UI 栈),单一字族。固定 rem 阶:11.5/12/12.5/13/14/16,比率≈1.15;层级主要靠字重(600/700 vs 400)与 caption 色。数据/键名用 ui-monospace。

## 布局

密度优先的 product 布局:表单控件贴 8px 网格,卡片圆角 6-10px,面板分层用背景色差而非描边堆叠。已知宿主约束:工作台装在可拉伸右侧栏(≈300-960px)或底栏,一切布局必须容器查询自适应(断点 379/420/500/719)。

## 组件词汇表(同一动作同一长相)

- **SnxSelect**:全应用唯一下拉(button+portal popover,键盘可达)
- **SnxConfirm**:全应用唯一确认弹窗(danger 配色、portal、promise 化)
- **主按钮** `snx-gen-go` / 次按钮 / ghost 按钮:字重 600,圆角 8px
- **chip**:选中态 = accent 15% 底 + accent 字,禁 side-stripe
- **toast**:按 kind 着色,但用全边框/底色 tint 表达,**不用 border-left 彩条**(待改)
- **图标**:全部 lucide 内联(`ic()`),尺寸 13/14/16/42;禁止 emoji 与装饰字形

## 动效

150-250ms,ease-out(cubic-bezier(0.22,1,0.36,1) 一族);只做状态反馈(展开/浮起/落位),无编排式入场;扫光仅 busy 态。

## 已知打磨债

- toast side-stripe(违 impeccable 禁令)
- (持续记录区,打磨轮更新)
