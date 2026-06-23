Install the AI Usage dashboard on this machine. Run this once — it clones the repo, builds, and starts the service via PM2.

---

## Step 1: Check Node.js

```bash
node --version
```

If Node.js is not installed or version is below 18, tell the user:
> "Node.js 18+ is required. Please install it from https://nodejs.org and re-run /ai-usage:init."

Then stop.

---

## Step 2: Check PM2

```bash
pm2 --version
```

If PM2 is not installed (command not found), install it:

```bash
npm install -g pm2
```

Confirm installation succeeded before continuing.

---

## Step 3: Determine install directory

Ask the user via AskUserQuestion:
- Question: "Where should the dashboard be installed?"
- Options:
  - `~/ai-usage` (default, recommended)
  - `Custom path` (user will type their own)

Expand `~` to the actual home directory:
- macOS/Linux: `$HOME`
- Windows: `%USERPROFILE%`

Store the resolved path as `INSTALL_DIR` for use in subsequent steps.

---

## Step 4: Clone or update the repo

Check if `INSTALL_DIR` already exists:

```bash
# macOS/Linux
[ -d "$INSTALL_DIR" ] && echo "EXISTS" || echo "NEW"

# Windows (PowerShell)
if (Test-Path "$INSTALL_DIR") { "EXISTS" } else { "NEW" }
```

**If NEW** — clone the repo:

```bash
git clone https://github.com/yuhin-chiu/local-token-usage "$INSTALL_DIR"
```

**If EXISTS** — pull the latest:

```bash
cd "$INSTALL_DIR" && git pull
```

---

## Step 5: Install dependencies

```bash
cd "$INSTALL_DIR"
npm install
```

If this fails, show the error output and stop. Common fix: delete `node_modules/` and retry.

---

## Step 6: Build the app

```bash
cd "$INSTALL_DIR"
npm run build
```

This takes 30–60 seconds. If it fails, show the last 30 lines of output and stop.

---

## Step 7: Start with PM2

```bash
cd "$INSTALL_DIR"
npx pm2 start ecosystem.config.js --update-env
npx pm2 save
```

Then set PM2 to auto-start on system boot (run once, first install only):

```bash
npx pm2 startup
```

Follow any instructions PM2 prints (it may ask you to run a sudo command on macOS/Linux).

---

## Step 8: Confirm

```bash
pm2 list
```

Look for a process named `ai-usage` with status `online`.

**If online**, tell the user:
> "✓ AI Usage Dashboard is running at http://localhost:3002/dashboard
>
> Use `/ai-usage:open` to open it in your browser, or `/ai-usage:query` to see today's usage inline."

**If not online**, show the logs:

```bash
pm2 logs ai-usage --lines 30 --nostream
```

Tell the user what the error is and suggest next steps.
