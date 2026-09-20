# 给其他会话捎话 — dsh-sensenova-image 当前状态

## 当前阶段（v4.1 — 2026-09-20）

**已完成 v4.1 侧栏模式**：工作台不再用 `shell.overlay` 全屏遮挡，也不再用 rightbar 抽屉，而是直接挂到 dsh 侧栏 DOM（`[class*="sidebarCol"]`）里，替换 sessions 视图。这样既能多线程生图（聊天区不遮挡），又兼容官方 dsh 侧栏 + dsh-better-sidebar。

**实现要点**：
- `client/client-v4.js`：去掉了 `shell.overlay` 注册，改用 `ReactDOMClient.createRoot` 把 `<Workbench>` 挂到 sidebar 的末尾 host 元素；`← 返回` 按钮 unmount host + 恢复原 sidebar children 的 display。
- `ResizeObserver` 监听 host 实际宽度：< 520px 时给 `.snx-cv` 加 `.narrow` 类，CSS 自动切到 column 布局（右侧参数面板折到底部）。
- 工作台顶栏：`⚡ SENSENOVA 生图工作台` + Key 状态徽章 + `适应` + `← 返回`。
- 空画布加了个 `✦ 画布为空` 提示。
- ESC 关工作台（沿用原 overlay 习惯）。

**已废弃的文件（删除）**：
- `client/app.html`（v3 静态页，serve 路由 `/sensenova`，现在用不上了）
- `client/workbench.html`（死代码，CDN konva，无路由）
- `client/test-page.html`
- `client/client-v3.js`、`client/client.js`
- `src/index.ts` 里 `/sensenova` 路由已删（注释 `（v4 不再单独挂静态页面：工作台直接在 dsh 侧栏里打开）`）

**dsh-better-sidebar 兼容**：
- 检测 `window.dshBetterSidebar.getSidebar()`（若提供）
- 回退到 `[class*="sidebarCol"]` DOM 选择器
- 当前未实测（源码不在本地），但防御性写法已加；用户装了更好的侧栏可以试

## 安装路径

- 源在 `D:\coding\dsh-sensenova-image\`
- 装在 `~/.dsh/profiles/web/node_modules/dsh-sensenova-image\`（hardlink，写源文件即生效）
- `cordis.patch.yml` 在 profile 根目录，register 插件（不要动）

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
3. **browser 缓存 client-v4.js**：编辑 client-v4.js 后必须**关 tab 重开**才能看到新代码（HMR 对模块不全刷新）。调试时用 `window.__snxTrace` 之类全局变量确认新代码加载了。
4. **CSS 模块哈希**：`pI_x6G_sidebarCol` 每次构建变，必须用 `[class*="sidebarCol"]` 子串选择器。
5. **侧栏窄宽度布局**：`max-width:520px` 媒体查询查的是 **viewport** 不是 sidebar。需要 `ResizeObserver` 测 host 实际宽 → 加 `.narrow` class。

## 待做（Phase 3+）

- 单图"标注即编辑"流程（蒙版 UI 已就位，sensenova_edit_image 已通）
- 历史快照对比
- 品牌模板 / 预设 prompt
- dsh-tools 升级到最新（先扫 lib 的 deep imports）
- README 更新（截图 + 链接）