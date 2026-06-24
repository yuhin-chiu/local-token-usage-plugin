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
  - `~/ai-usage` (default, recommended)
  - Custom path (user will type their own)

Expand `~` to the actual home directory:
- macOS/Linux: `$HOME`
- Windows: `%USERPROFILE%`

Store the resolved path as `INSTALL_DIR`.

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

## Step 5: Choose how to run the service

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
   - 只执行 `npm start`，在终端前台运行
   - 优点：零依赖，开箱即用
   - 缺点：关闭终端后服务停止，无自动重启
   - 适合：临时查看，或自己有其他进程管理方案

---

## Step 6: Start the service

根据用户在 Step 5 的选择执行对应操作：

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

**macOS/Linux** — 后台运行并输出日志到文件：
```bash
cd "$INSTALL_DIR"
nohup npm start > ~/ai-usage.log 2>&1 &
echo "Started. PID: $!"
```

**Windows（PowerShell）** — 后台运行：
```powershell
Start-Process -NoNewWindow -FilePath "npm" -ArgumentList "start" -WorkingDirectory "$INSTALL_DIR"
```

告诉用户：
> "服务已在后台启动（无 PM2）。注意：重启电脑后需重新运行 /local-usage:init 或 /local-usage:start 来启动服务。"

---

## Step 7: Confirm

检查 3002 端口是否有进程在监听：

```bash
# macOS/Linux
lsof -i :3002 | grep LISTEN

# Windows (PowerShell)
Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue
```

如果端口有监听，告诉用户：
> "✓ AI Usage Dashboard is running at http://localhost:3002/dashboard
>
> Use `/local-usage:open` to open it, or `/local-usage:query` to see today's usage inline."

如果端口无响应，根据启动模式显示日志：
- PM2 模式：`pm2 logs local-usage --lines 30 --nostream`（全局）或 `npx pm2 logs local-usage --lines 30 --nostream`（项目级）
- 无 PM2 模式：`cat ~/ai-usage.log`（macOS/Linux）
