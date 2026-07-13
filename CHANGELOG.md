# 更新日志

`local-usage` 插件的所有版本变更记录。

---

## [1.7.0] - 2026-07-13

### 变更（命令全面脚本化，消除 bash/PowerShell 双写）
- 继 1.6.0 的 `resolve.js` 之后，把 6 个命令**剩余的确定性逻辑**全部下沉到 `scripts/`，命令 markdown 只留编排（`AskUserQuestion`、`STATUS` gate、诊断→修复→重试循环、pm2 安装/startup 提示）：
  - `open` → `scripts/open-browser.js`：按 `process.platform` 选 `open`/`xdg-open`/`start`，替代三平台块。
  - `status` → `scripts/status.js`：Node `net` 试连端口（跨平台零 spawn，替代 `lsof`/`Get-NetTCPConnection` 双写）+ 只读 `pm2 jlist` 探测模式/状态。
  - `start` / `stop` → `scripts/service.js`：自动探测三模式（global pm2 / npx pm2 / no-PM2）、按模式起停、起后轮询端口；no-PM2 用 Node `spawn(detached)` 替代 `nohup`/`Start-Process`，kill-by-port 按平台收敛在脚本内。**改盘脚本，不进白名单。**
  - `init` / `update` 机械部分 → `scripts/install.js`（`write-marker` / `write-config` upsert / `sync-config` 补缺键 / `clone` / `pull` 网络可选 / `build` 按需）+ 只读 `scripts/detect-sources.js`。**install.js 改盘、不进白名单。**
- 跨平台**单一 Node 实现**（`os`/`path`/`child_process`），彻底无 bash+PowerShell 双写；只读脚本（`resolve`/`usage`/`status`/`open-browser`/`detect-sources`）进 hook 白名单不弹框，改盘脚本（`service`/`install`）照常确认。

### 修复（fallback 兼容 `ai-usage` / `local-usage` 两种 slug）
- **根因**：插件曾 `ai-usage` → `local-usage` 重命名（见下方 1.x 记录），**老用户**注册的 marketplace slug 仍是 `ai-usage`，data 目录为 `local-usage-ai-usage`；而 1.4.2 的 fallback **硬编码** `local-usage-local-usage`，在 `$CLAUDE_PLUGIN_DATA` 未注入时对不上老用户、误报 `NONE`（真实插件运行有 env、一直正常）。
- 修复：`resolve.js` / `install.js` 的 fallback 改为**扫描** `~/.claude/plugins/data/local-usage-*`，兼容 `ai-usage` / `local-usage` 及未来任意 slug（反转 1.4.2「不兼容旧 slug」的决策——理由：老用户真实存在）。

---

## [1.6.0] - 2026-07-12

### 新增（共享定位脚本 `scripts/resolve.js` + 自动放行，治「反复弹框」）
- 新增只读定位器 `scripts/resolve.js`：一次调用输出 `STATUS` / `INSTALL_DIR` / `PORT` / `MARKER` / `DIR_EXISTS` / `NODE_MAJOR`，成为所有命令定位安装、判端口、校验有效性的**唯一真相源**（跨 macOS/Linux/Windows，无需再各写一套双平台探测块）。
- 新增 **PreToolUse hook**（`hooks/hooks.json` + `hooks/allow.js`）：自动放行本插件运行的低风险命令——`resolve.js`（只读）/ `pm2` / `npx pm2` / `npx next` / `cd` / 只读 `git`（fetch/rev-parse/status/… ）。复合命令仅当**每一段**都在白名单才放行（`cd x && rm -rf y` 不会被 `cd` 带过），其余一律静默回退到正常提示，绝不 deny、不扩权。

### 变更（命令收敛到 `resolve.js`，少一次 `node` 调用与弹框）
- `init` / `update` / `start` / `stop` / `status` / `open` 的 Step 0/1 定位逻辑统一替换为一行 `node "${CLAUDE_PLUGIN_ROOT}/scripts/resolve.js"`，删除各自 ~30 行 bash+PowerShell 双平台块。
- `node --version` 环境检查**并入** `resolve.js` 输出的 `NODE_MAJOR`：既然定位那一步已经跑了 Node，就不再单独跑第二次 `node --version`（也省一次弹框）。`update` / `init` 直接读 `NODE_MAJOR`，<18 才停。
- `init` Step 2 新增**自动定位**：`resolve.js` 报 `STATUS=FOUND` 时，把已检测到的安装作为首选项（避免误重装），而非无脑默认 `~/local-usage`。
- `start` Step 0a / `status` Step 0a 的安装校验改用 `resolve.js` 的 `STATUS`（FOUND / STALE / NONE），不再各自重写探测。

---

## [1.5.0] - 2026-07-12

### 新增（`/update` 支持离线 / 跳过网络）
- `/local-usage:update` 新增 `--no-pull`（别名 `--local` / `--offline`）：纯本地体检修复，全程不联网，适合只想修本地问题或人在离线时。

### 变更（`/update` 拉取改为「按需 + 网络可选」，治「反复 pull」）
- Step 3 由无条件 `git pull` 改为 `git fetch` 后比对 `HEAD` 与 `@{u}`，**仅当本地落后才 `merge --ff-only`**；已是最新 / 离线 / fetch 失败一律 `PULLED=no`，跳过 `npm install` / `npm run build`，只验证服务在监听。
- pull 全程 **best-effort**：离线或 fetch 失败不再中断 doctor 流程，继续本地体检修复。

### 新增（运行命令校验安装目录，治跨机器 / 移动目录后的玄学失败）
- `start` 新增 Step 0a **硬校验**：安装目录 / `package.json` / `ecosystem.config.js` 缺失即停，提示跑 `/update` 重新定位修复，而非甩一个 PM2/next 报错。
- `status` **软校验**：不阻断端口检测（端口才是「是否在跑」的真相源），但端口未监听且安装缺失时，报告改为「安装丢失 / 被移动 → 跑 `/update`」。
- `stop` 项目级 PM2 段补说明：安装目录丢失时回退到「按端口 kill」（全局 PM2 / no-PM2 本就不依赖目录）。

---

## [1.4.2] - 2026-07-07

### 修复（`CLAUDE_PLUGIN_DATA` 缺失时丢失自定义安装目录）
- **根因**：`start` / `stop` / `status` / `open` / `update` 的 Step 0 仅依赖 `$CLAUDE_PLUGIN_DATA` 读 marker，env var 一旦未注入（裸终端跑、自定义 host 启动等）就直接 fallback 到默认 `~/local-usage`，导致装在自定义目录（如 `D:\code3\local-usage`）的命令全部指错路径。
- 修复：所有 runtime 命令的 Step 0 在 marker 读不到时，**先扫固定路径 `~/.claude/plugins/data/local-usage-local-usage/install-path`**，找不到才回退 `~/local-usage`。两套平台（POSIX + PowerShell）均补齐。
- `init` 写 marker 时改为 `MARKER_DIR="${CLAUDE_PLUGIN_DATA:-$HOME/.claude/plugins/data/local-usage-local-usage}"`：env 在则写 env 路径、否则写固定路径，保证新装未来也能被 fallback 命中。
- `update` 的 NO_MARKER 行为保留（marker 真缺时仍转交用户重选）—— fallback 只在 marker 文件**存在但 env 没注入**的场景生效。

### 修复（无 PM2 模式的日志路径与 install 解耦）
- `init` / `update` / `start` 的 `nohup ... > ~/local-usage.log` 改为 `> "$INSTALL_DIR/local-usage.log"`：自定义安装目录时日志跟 install 在一起，不再漂到家目录。

---

## [1.4.0] - 2026-07-01

### 重构（`/local-usage:update` 升级为「体检 → 修复 → 确保运行」的 doctor 命令）
- 不再只写安装路径标记，而是逐项体检并修复现有安装，**一直修到服务端口在监听**为止：
  1. 定位并校验安装目录（必须是 `git clone` 的看板，否则转交 `/init`，**永不 clone**）
  2. Node ≥18 检查
  3. `git pull` 拉取最新代码
  4. 配置体检：缺失则重建；已存在则按模板 `local-usage.config.example.json` **数据驱动地补齐缺失字段**（不再靠命令里硬编码 key 列表，避免与 app 漂移）
  5. 按需 `npm install` / `npm run build`
  6. 按配置里的 `runMode` 拉起/重启服务并验证监听，起不来则看日志继续修
- 弃用对短命的 `~/.local-usage`（1.2.0）的任何兼容/清理逻辑。

### 新增
- 配置新增 `runMode` 字段（`pm2-global` / `pm2-project` / `none`）：`/init` 选完运行方式后写入配置，`/update` 直接读取以重启服务、无需重新交互。

### 变更
- `start` / `status` 失败提示由「建议 `/init` 重装」改为「优先 `/update` 修复」。
- 版本与看板 repo（`local-token-usage`）同步为 **1.4.0**。

---

## [1.3.0] - 2026-07-01

### 变更（标记文件迁移到插件数据目录）
- 安装路径标记从家目录 dotfile `~/.local-usage/install-path` 迁到插件持久化数据目录 **`$CLAUDE_PLUGIN_DATA/install-path`**（`~/.claude/plugins/data/<plugin>-<marketplace>/`）。理由：跟插件走、不污染家目录、跨版本更新自动保留（安装 cache 是版本化的，放那儿更新即丢）。
- `init` 及 `start`/`stop`/`status`/`open` 的 Step 0 统一改读 `$CLAUDE_PLUGIN_DATA`；不再使用 `~/.local-usage`。

### 新增
- **`/local-usage:update`** 迁移/修复命令：面向「已安装但新命令定位不到」的老用户（尤其自定义安装目录）。让用户直接指认现有安装目录并写入标记，**不重新克隆、不 rebuild、不重复 pull**；顺带清理 1.2.0 遗留的 `~/.local-usage`。

### 说明
- 1.2.0 的 `~/.local-usage` 标记方案为短命中间产物，本版直接弃用（无外部用户依赖）；升级后如定位不到安装，运行一次 `/local-usage:update` 即可。

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
