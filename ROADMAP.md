# ROADMAP — dsh-sensenova-image

> 2026-10-31 立项。来源：三竞品对照深挖（dsh-agnes-media / dsh-image-gen / dsh-ark9canvas）+ 历轮 deferred 清账 + v18 真机复核发现。
> **定位不变式**：SenseNova 生图的「管理与编辑」工作台。接入层不做（Token Plan 登录/额度可视化/多 key 池交给 dsh-connect-sensenova-token-plan 与 dsh-sensenova-pool，兼容其注册的 provider）；非 SenseNova 模型不绑（无多 provider/订阅免 Key/本地 ComfyUI）。

## P0 — 下轮工作流实施（2026-10-31 起）

| # | 项 | 内容 | 来源 |
|---|---|---|---|
| 1 | **孤儿清扫运行时修复** | v18.3 的清扫源码正确但活体未触发（疑似 applyDoc 所在闭包无 autosave 引用，ReferenceError 被加载链 `.catch(()=>{})` 静默吞掉）。先定位作用域，改用可靠持久化路径，再做活体验证（开画布→服务端状态翻转）。 | v18.3 真机复核遗留 |
| 2 | **RPS 预限流节流** | 相邻两次生成 POST 之间强制最小间隔（可配 `snxGenMinIntervalMs`，默认 2000ms，队列调度层执行而非失败后重试），从源头避开上游 RPS 429（实测免费档并发 2 即 `rps exhausted`）。 | dsh-sensenova-pool 预限流思路 + 真机 429 实证 |
| 3 | **agent 生成审批门（human-in-loop）** | 对话轴三工具（generate/edit/enhance）执行前挂起：请求进工作台「审批」区，人工批准/拒绝/超时（默认 120s）自动拒绝；拒绝不产生任何上游调用与计费；总开关默认关，面板可开。 | dsh-ark9canvas 杀手锏；防 agent 循环烧免费额度 |

## P1 — 后续轮次

| # | 项 | 内容 | 来源 |
|---|---|---|---|
| 4 | 任务宿主进程化 | 生成提交后由 server 侧任务表驱动，关页签/关浏览器不中断（客户端只读展示进度）——架构级根治孤儿任务；改动大，需先出设计稿。 | dsh-agnes-media 架构 |
| 5 | 参考图库 | 角色/场景/风格本地库：灯箱「存入图库」+ 表单快捷引用（替代每次重新上传）。 | dsh-image-studio 模式 |
| 6 | 灵感库外部源 | 自定义 JSON prompt 源（host 代理拉取防 CORS），叠加现有收藏+最近 10 条。 | dsh-ark9canvas prompt sources |
| 7 | 极小缩放端口热区合拢吞边 | SPEC-17 起 deferred 的空间分配张力（热区半径已按相机反比，再压伤正常缩放可点性）；需新的交互方案（如热区分级）。 | 历轮 deferred |
| 8 | 透明背景 | SenseNova images/generations 是否支持 background 参数需查官方文档，支持才做。 | dsh-ark9canvas |

## 不做（定位外，明示防止范围漂移）

- 文生视频 / 首帧参考体系 / 短剧分镜（agnes-media 领地）
- 多 provider / 订阅免 Key / 本地 ComfyUI（image-gen 领地，与 SenseNova 绑定定位冲突）
- 接入层全部（登录/额度可视化/多 key 轮换池——两个成熟竞品已覆盖，我们兼容其 provider）

## 已完成（不入图）

并发闸+队列重排插队、对话轴等待预估服务端兜底、minimap、tiled 2× 放大、增强、蒙版重绘、批量变体/zip、真实链路验证+真测常规化、孤儿清扫+客户端看门狗（v18/v18.3）。
