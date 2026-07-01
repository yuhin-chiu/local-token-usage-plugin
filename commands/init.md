Install the AI Usage dashboard on this machine. Run this once — it clones the repo, builds, and starts the service.

---

## Step 1: Check Node.js

```bash
node --version
```

If Node.js is not installed or version is below 18, tell the user:
> "Node.js 18+ is required. Please install it from https://nodejs.org and re-run /local-usage:init."

Then stop.

---

## Step 2: Determine install directory

Ask the user via AskUserQuestion:
- Question: "Where should the dashboard be installed?"
- Options:
  - `~/local-usage` (default, recommended)
  - Custom path (user will type their own)

Expand `~` to the actual home directory:
- macOS/Linux: `$HOME`
- Windows: `%USERPROFILE%`

Store the resolved path as `INSTALL_DIR`.

### Persist the install path (critical)

The other commands (`start` / `stop` / `status` / `open`) must be able to find the
install dir no matter which directory the user runs them from. Write the resolved
`INSTALL_DIR` to a fixed marker file `~/.local-usage/install-path`:

**macOS/Linux:**
```bash
mkdir -p "$HOME/.local-usage"
printf '%s' "$INSTALL_DIR" > "$HOME/.local-usage/install-path"
```

**Windows (PowerShell):**
```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.local-usage" | Out-Null
[System.IO.File]::WriteAllText("$env:USERPROFILE\.local-usage\install-path", $INSTALL_DIR)
```

> Without this marker, the other commands would fall back to the default
> `~/local-usage` and fail to find a custom install location (e.g. on another drive).

---

## Step 3: Clone or update the repo

Check if `INSTALL_DIR` already exists:

```bash
# macOS/Linux
[ -d "$INSTALL_DIR" ] && echo "EXISTS" || echo "NEW"

# Windows (PowerShell)
if (Test-Path "$INSTALL_DIR") { "EXISTS" } else { "NEW" }
```

**If NEW** — clone:
```bash
git clone https://github.com/yuhin-chiu/local-token-usage "$INSTALL_DIR"
```

**If EXISTS** — pull latest:
```bash
cd "$INSTALL_DIR" && git pull
```

---

## Step 4: Install dependencies and build

```bash
cd "$INSTALL_DIR"
npm install
npm run build
```

If build fails, show the last 30 lines of output and stop.

---

## Step 5: Detect installed tools & write config

The dashboard reads `local-usage.config.json` from the install dir to decide which
sources to track and which port to use. When the file is absent it falls back to
`["claude-code","codex"]` on port 3002, so this step is what records the user's
actual choice. **Write the file before starting the service** — the port is read
at launch time.

### 5a. Detect which AI tools are installed

Check whether each source's local data directory exists:

```bash
# macOS/Linux
[ -d "$HOME/.claude/projects" ] && echo "claude-code: FOUND" || echo "claude-code: not found"
[ -d "$HOME/.codex/sessions" ]  && echo "codex: FOUND"       || echo "codex: not found"
```

```powershell
# Windows (PowerShell)
if (Test-Path "$env:USERPROFILE\.claude\projects") { "claude-code: FOUND" } else { "claude-code: not found" }
if (Test-Path "$env:USERPROFILE\.codex\sessions")  { "codex: FOUND" }       else { "codex: not found" }
```

### 5b. Ask which tools to track

Use AskUserQuestion with **multiSelect: true**:
- Question: "Which AI tools should the dashboard track?"
- Options (append "(detected — recommended)" to whichever were FOUND in 5a):
  - `Claude Code` → source id `claude-code`
  - `Codex CLI` → source id `codex`

Recommend the detected tools. Map the selection to source ids and store as
`ENABLED_SOURCES` (e.g. `["claude-code","codex"]`). If nothing is selected, fall
back to `["claude-code"]`.

> Only `claude-code` and `codex` are supported today. As more sources are added
> to the dashboard, list them here too.

### 5c. Ask for the port

Use AskUserQuestion:
- Question: "Which port should the dashboard listen on?"
- Options: `3002` (default, recommended) / Custom (user types a number)

Store as `PORT` (a positive integer; fall back to `3002` if invalid).

### 5d. Write `local-usage.config.json`

Write the file into `INSTALL_DIR`, substituting the actual `ENABLED_SOURCES` and
`PORT` chosen above (the example below shows both sources on port 3002):

```bash
# macOS/Linux
cat > "$INSTALL_DIR/local-usage.config.json" <<EOF
{
  "version": 1,
  "enabledSources": ["claude-code", "codex"],
  "port": 3002
}
EOF
```

```powershell
# Windows (PowerShell)
@'
{
  "version": 1,
  "enabledSources": ["claude-code", "codex"],
  "port": 3002
}
'@ | Out-File -FilePath "$INSTALL_DIR\local-usage.config.json" -Encoding utf8
```

---

## Step 6: Choose how to run the service

Ask the user via AskUserQuestion:

**Question:** "How would you like to run the dashboard service?"

**Options（推荐第一个）：**

1. **全局安装 PM2（推荐）**
   - 运行 `npm install -g pm2` 全局安装 PM2 进程管理器
   - 优点：关闭终端后服务继续运行，崩溃自动重启，可设置开机自启
   - 适合：长期使用，不想每次手动启动

2. **项目级安装 PM2**
   - 运行 `npm install pm2` 安装在当前项目内，通过 `npx pm2` 调用
   - 优点：不污染全局环境，功能与全局安装相同
   - 适合：不想全局装软件，但仍需要后台持久运行

3. **不安装 PM2，直接运行**
   - 在终端前台/后台运行 `next start`，监听 Step 5c 选定的端口
   - 优点：零依赖，开箱即用
   - 缺点：关闭终端后服务停止，无自动重启
   - 适合：临时查看，或自己有其他进程管理方案

---

## Step 7: Start the service

根据用户在 Step 6 的选择执行对应操作。PM2 模式会通过 `ecosystem.config.js`
自动读取 Step 5d 写入的端口；无 PM2 模式需显式带上端口。

### 选项 1：全局安装 PM2

```bash
npm install -g pm2
cd "$INSTALL_DIR"
pm2 start ecosystem.config.js --update-env
pm2 save
```

设置开机自启（仅首次安装执行）：
```bash
pm2 startup
```
如果 PM2 输出了一行需要手动执行的命令（通常是 `sudo env PATH=...`），提示用户复制并在终端执行。

### 选项 2：项目级安装 PM2

```bash
cd "$INSTALL_DIR"
npm install pm2
npx pm2 start ecosystem.config.js --update-env
npx pm2 save
```

设置开机自启（仅首次安装执行）：
```bash
npx pm2 startup
```
同样，如果输出了手动命令，提示用户执行。

### 选项 3：不安装 PM2

用 Step 5c 选定的 `$PORT` 直接启动（不要用 `npm start`，因为它把端口写死成 3002）。

**macOS/Linux** — 后台运行并输出日志到文件：
```bash
cd "$INSTALL_DIR"
nohup npx next start -p $PORT > ~/local-usage.log 2>&1 &
echo "Started. PID: $!"
```

**Windows（PowerShell）** — 后台运行：
```powershell
Start-Process -NoNewWindow -FilePath "npx" -ArgumentList "next","start","-p","$PORT" -WorkingDirectory "$INSTALL_DIR"
```

告诉用户：
> "服务已在后台启动（无 PM2）。注意：重启电脑后需重新运行 /local-usage:init 或 /local-usage:start 来启动服务。"

---

## Step 8: Confirm

检查 Step 5c 选定的端口（默认 3002，下面记作 `$PORT`）是否有进程在监听：

```bash
# macOS/Linux
lsof -i :$PORT | grep LISTEN

# Windows (PowerShell)
Get-NetTCPConnection -LocalPort $PORT -State Listen -ErrorAction SilentlyContinue
```

如果端口有监听，告诉用户（把 `$PORT` 换成实际端口）：
> "✓ AI Usage Dashboard is running at http://localhost:$PORT/dashboard
>
> Use `/local-usage:open` to open it, or `/local-usage:query` to see today's usage inline."

如果端口无响应，根据启动模式显示日志：
- PM2 模式：`pm2 logs local-usage --lines 30 --nostream`（全局）或 `npx pm2 logs local-usage --lines 30 --nostream`（项目级）
- 无 PM2 模式：`cat ~/local-usage.log`（macOS/Linux）
