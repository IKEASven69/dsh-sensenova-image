# PRODUCT.md

## Users

单人重度用户(本仓库主人):dsh(DeepSeek Harness)深度玩家,3080 本机跑 SenseNova U1.5 出图。两种使用姿态并存:会话里让 agent 调工具生图(结果卡/回合尾入口),以及打开工作台手动整理画布、改图、对比、管理队列。第二用户姿态是"未来的同类玩家"——插件要能被陌生人装上就会用。

## Product Purpose

dsh 插件形式的 AI 生图工作台:无限画布(Konva)、画廊+画板、灯箱(调色/回填)、生成表单、队列、对比视图。人与 agent 共用同一份画布文档(SSE 同步)。它不是独立应用——视觉上必须像 dsh 宿主的一部分。

## Register

product(工具型 UI,设计为任务服务)。earned familiarity 是及格线:用过 Linear/Figma/InvokeAI 的人坐下就信任,不会在每个组件前迟疑。

## Tone

克制、密而不挤、工具感。中文微文案,短句,动词开头。不卖弄:动效只传达状态,装饰性动效为零。

## Anti-references

- AI slop 全家:hero-metric 卡片阵、side-stripe 彩条、渐变字、玻璃拟态、装饰性动效
- 原生控件裸奔(native select/confirm/prompt/alert)
- emoji 充当图标
- "strangeness without purpose":过度装饰的按钮、不一致的表单控件、发明非标准交互

## Strategic principles

1. **宿主原生感**:全部颜色走 `--dsw-alias-*` 令牌桥(自带 fallback),插件消失进宿主;单一强调色 = DeepSeek 蓝。
2. **操作分层**:网格只放轻操作(hover 轻按钮),重操作收右键菜单与批量条(InvokeAI 法则)。
3. **状态机完备**:每个异步动作有 pending/空态/错误/部分成功;loading 用骨架或既有转圈,不用中置 spinner。
4. **一个词汇表**:同一控件(按钮/下拉/弹窗/chip)在全表面长得一样;同一动作不换词。
5. **键盘可达**:每个自定义控件都能 Tab 到、方向键用、Esc 关;焦点态可见。
