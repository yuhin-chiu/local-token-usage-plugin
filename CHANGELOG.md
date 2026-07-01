# 更新日志

`local-usage` 插件的所有版本变更记录。

---

## [1.2.0] - 2026-07-01

### 修复（支持任意安装目录）
- **根因**：`init` 选择的安装目录（可自定义，如装到 `D:\code3\local-usage`）从未被持久化，导致 `start`/`stop`/`status`/`open` 全部写死 `~/local-usage` 和端口 `3002`，装在非默认位置就无法运行。
- `/local-usage:init` 新增「持久化安装路径」：把解析出的 `INSTALL_DIR` 写入固定标记文件 `~/.local-usage/install-path`。
- `/local-usage:start`、`stop`、`status`、`open` 各新增 **Step 0**：从标记文件读取真实 `INSTALL_DIR` 与 `PORT`（读不到才回退默认 `~/local-usage` / `3002`），后续步骤一律使用变量而非写死值。
- `/local-usage:start` 全局 PM2 模式改用 `pm2 start "<INSTALL_DIR>/ecosystem.config.js"`（可注册+启动，不再依赖进程已按名字注册），修复首次启动把 `local-usage` 当当前目录脚本路径而失败的问题。
- 无 PM2 模式改用 `next start -p <PORT>`，尊重自定义端口。

---

## [1.1.0] - 2026-06-29

### 插件命令
- `/local-usage:init` 新增「自动探测 + 选择数据源」步骤（Step 5）：
  - 探测本机已装的 AI 工具（检测 `~/.claude/projects`、`~/.codex/sessions` 是否存在）
  - 多选让用户勾选要纳入的源，默认推荐探测到的（claude-code 保底），写入 `local-usage.config.json` 的 `enabledSources`
  - 询问监听端口（默认 3002），一并写入配置；配置在启动服务前写好
- 「不安装 PM2」模式改用 `next start -p <port>` 启动，以尊重自定义端口（原 `npm start` 把端口写死成 3002）

### 说明
- 配合看板侧多源动态支持：看板按 `local-usage.config.json` 的 `enabledSources` 及各源能力动态渲染

---

## [1.0.6] - 2026-06-24

### 变更
- 插件重命名：`ai-usage` → `local-usage`，所有命令前缀由 `/ai-usage:` 改为 `/local-usage:`

---

## [1.0.5] - 2026-06-24

### 插件命令
- `/local-usage:start` 启动服务成功后自动在默认浏览器中打开看板

### 看板页面
- 新增日间 / 暗黑模式切换按钮（右上角悬浮 ☀️ / 🌙，偏好保存到本地）
- 默认选中时间范围改为「今天」（原来是「近 7 天」）
- 日间模式背景色采用暖橘奶油色调，与橘色主题风格统一

---

## [1.0.4] - 2026-06-23

### 插件命令
- `/local-usage:init` 新增三种 PM2 安装方式供用户选择：
  1. 全局安装 PM2（推荐）
  2. 项目级安装 PM2
  3. 不安装 PM2（直接 `npm start`）
- `/local-usage:start`、`/local-usage:stop`、`/local-usage:status` 同步适配三种模式

---

## [1.0.3] - 2026-06-23

### 插件命令
- `/local-usage:query` 支持时间范围参数：`today`（默认）、`yesterday`、`7d`、`30d`

---

## [1.0.2] - 2026-06-23

### 修复
- 修复 Codex CLI JSONL 解析错误：
  - 事件类型判断改为 `obj.type === 'event_msg' && obj.payload?.type === 'token_count'`
  - Token 取值路径改为 `obj.payload.info.last_token_usage.total_tokens`

---

## [1.0.1] - 2026-06-23

### 文档
- README 补充两步安装说明（`/plugin marketplace add` + `/plugin install`）

---

## [1.0.0] - 2026-06-23

### 首次发布
- 6 个命令：`init`、`start`、`stop`、`status`、`open`、`query`
- 支持 Claude Code 数据源（`~/.claude/projects/**/*.jsonl`）
- 支持 Codex CLI 数据源（`~/.codex/sessions/**/*.jsonl`）
- 内置模型定价表，自动估算费用
