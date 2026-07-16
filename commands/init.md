Install the AI Usage dashboard on this machine. Run this once — it clones the repo, builds, and starts the service.

---

## Step 1: Check environment & detect any existing install

Run the shared resolver once — it reports the Node version **and** whether a
dashboard is already installed on this machine, so Step 2 can offer that install
instead of blindly defaulting to `~/local-usage`:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/resolve.js"
```

It prints `STATUS` / `INSTALL_DIR` / `PORT` / `MARKER` / `DIR_EXISTS` / `NODE_MAJOR`.

- If `NODE_MAJOR` is below **18** — or the resolver didn't run at all (Node missing) —
  tell the user:
  > "Node.js 18+ is required. Please install it from https://nodejs.org and re-run /local-usage:init."

  Then stop.
- Otherwise carry `STATUS` and `INSTALL_DIR` forward to Step 2.

---

## Step 2: Determine install directory

**If Step 1 reported `STATUS=FOUND`** — a valid, git-cloned dashboard already exists
at that `INSTALL_DIR`. Don't reinstall blindly; offer it first via AskUserQuestion:
- **Use the detected install `<INSTALL_DIR>`（推荐）** → reuse it. Keep this
  `INSTALL_DIR`; Step 3 will see it already EXISTS and just pull instead of cloning.
  (If the user only wanted to repair/relaunch, `/local-usage:update` is the better
  fit — mention it.)
- **Install fresh to a different path** → fall through to the choice below.

**Otherwise** (`STATUS=STALE`/`NONE` — no valid install detected) ask where to install:
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
install dir no matter which directory the user runs them from. Write the marker with
the install script — one call, all platforms. It uses `$CLAUDE_PLUGIN_DATA` when the
host injects it, else the canonical `<plugin>-<marketplace>` path that `resolve.js`
reads back:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/install.js" --action=write-marker --install-dir="<INSTALL_DIR>"
```

> Without this marker the other commands fall back to the default `~/local-usage` and
> can't find a custom install location (e.g. on another drive) — that's what
> `/local-usage:update` repairs.

---

## Step 3: Clone or update the repo

Clone with the install script — it won't re-clone over an existing install:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/install.js" --action=clone --install-dir="<INSTALL_DIR>"
```

- `CLONED=yes` → freshly cloned. Continue.
- `CLONED=skipped-exists` → already a clone. Continue (Step 3a re-pins it).
- `CLONED=fail` → stop and report the git error shown above.

### Step 3a: Pin to the plugin's version (version-lockstep)

Pin the checkout to the tag matching the plugin's version (`v<version>`) so a fresh
install runs the exact commit this plugin version expects — deterministic and
reproducible across machines. On a tagless dashboard repo (today's reality) this
falls back to `main`, so it's a safe no-op there:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/install.js" --action=sync-code --install-dir="<INSTALL_DIR>"
```

Read `CODE_STATE`: `updated` / `current` / `fallback` → continue to Step 4 (the
build below runs `--force` regardless, since this is a first-time install). `error` →
stop and surface `WARNING`.

---

## Step 4: Install dependencies and build

First-time install → force a clean build:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/install.js" --action=build --install-dir="<INSTALL_DIR>" --force
```

- `BUILT=yes` → done.
- `BUILT=fail` → the last 30 lines are shown above (`STAGE` says install vs build).
  Stop and surface them to the user.

---

## Step 5: Detect installed tools & write config

The dashboard reads `local-usage.config.json` from the install dir to decide which
sources to track and which port to use. When the file is absent it falls back to
`["claude-code","codex"]` on port 3002, so this step is what records the user's
actual choice. **Write the file before starting the service** — the port is read
at launch time.

### 5a. Detect which AI tools are installed

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/detect-sources.js"
```

Read `DETECTED` (a CSV of the sources whose local data dirs exist) — use it to
preselect the recommended options in 5b.

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

Write the config with the install script, substituting the actual `ENABLED_SOURCES`
(as a comma-separated list) and `PORT` chosen above. It writes UTF-8 without a BOM
(a BOM breaks node's `JSON.parse` in both `config.ts` and `ecosystem.config.js`). The
`runMode` key is added in **Step 6a** once the user picks how to run the service —
`/local-usage:update` later reads it to bring the service back up without re-asking.

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/install.js" --action=write-config --install-dir="<INSTALL_DIR>" --sources="<ENABLED_SOURCES_CSV>" --port=<PORT>
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

Map the choice to a `RUN_MODE` string: 选项 1 → `pm2-global`, 选项 2 → `pm2-project`,
选项 3 → `none`.

---

## Step 6a: Persist the run mode into config

Merge `runMode` into the config (keeps the sources/port from Step 5d) so
`/local-usage:start` and `/local-usage:update` know how to (re)launch without asking
again — same script, run-mode only:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/install.js" --action=write-config --install-dir="<INSTALL_DIR>" --run-mode=<RUN_MODE>
```

---

## Step 7: Start the service

**pm2 模式的一次性准备**（选项 3 跳过）：
- 选项 1（pm2-global）：`npm install -g pm2`
- 选项 2（pm2-project）：`cd "<INSTALL_DIR>" && npm install pm2`

**起服务（所有模式，一行 — 自动探测模式、通过 `ecosystem.config.js` 读端口、起后轮询端口）：**

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/service.js" --action=start --install-dir="<INSTALL_DIR>" --port=<PORT>
```

读 `RESULT` / `PORT_LISTENING`：
- `RESULT=ok` → 已起。pm2 模式可设开机自启（仅首装）：`pm2 save` + `pm2 startup`
  （项目级用 `npx pm2 …`）；若 PM2 输出一行 `sudo env PATH=…` 手动命令，提示用户复制执行。
- `RESULT=fail` → 见 Step 8 诊断。

---

## Step 8: Confirm

- **`RESULT=ok`** → 打开 dashboard：
  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/scripts/open-browser.js" --port=<PORT>
  ```
  读 `URL`，告诉用户：
  > "✓ AI Usage Dashboard is running at <URL>
  >
  > Use `/local-usage:open` to open it, or `/local-usage:query` to see today's usage inline."
- **`RESULT=fail`**（端口没起）→ 按模式看日志诊断，修复后重试 Step 7：
  - PM2 模式：`pm2 logs local-usage --lines 30 --nostream`（全局）或 `npx pm2 logs local-usage --lines 30 --nostream`（项目级）
  - 无 PM2 模式：`cat "<INSTALL_DIR>/local-usage.log"`（macOS/Linux）
