Start the AI Usage dashboard service.

---

## Step 0: Resolve & validate install directory + port

Resolve where the install lives with the shared resolver — the single source of
truth for the marker, port, and install validity, used by every command (works on
macOS/Linux/Windows, no per-OS block needed):

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/resolve.js"
```

It prints:
```
STATUS=FOUND|STALE|NONE
INSTALL_DIR=<path>
PORT=<port>
MARKER=env|canonical|none
DIR_EXISTS=yes|no
NODE_MAJOR=<major>
```

Use `INSTALL_DIR` / `PORT` from the output in every step below (written as
`<INSTALL_DIR>` / `<PORT>`).

### Step 0a: Gate on STATUS

If the folder was moved, renamed, or deleted (common after switching machines or
reorganizing disks), starting from a stale path fails with a cryptic PM2/next error.
The resolver already validated the install, so just act on `STATUS`:

- **FOUND** → real, git-cloned install. Continue.
- **STALE / NONE** (no usable marker, or the recorded folder is gone / isn't a valid
  install) → **stop here**, don't try to start:
  > "The dashboard install at `<INSTALL_DIR>` is missing or was moved. Run
  > `/local-usage:update` to relocate and repair it (or `/local-usage:init` if it was
  > never installed)."

---

## Step 1: Detect running mode

Check which PM2 is available:

```bash
# Check global PM2
pm2 --version

# Check project-level PM2 (run from the resolved install dir)
cd "<INSTALL_DIR>" && npx --no pm2 --version 2>/dev/null
```

- If global `pm2` is available → use **global PM2 mode**
- If only project-level (`npx pm2`) → use **project PM2 mode**
- If neither → use **no-PM2 mode**

---

## Step 2: Start the service

### 全局 PM2 模式

Start via the install dir's `ecosystem.config.js` — this **registers and starts**
the process regardless of whether PM2 already knows it, reads the port from
`local-usage.config.json`, and is a no-op if it's already online:

```bash
pm2 start "<INSTALL_DIR>/ecosystem.config.js"
pm2 list
```

> ⚠️ Do **not** use `pm2 start local-usage` (by name) for the first start — if the
> process was never registered, PM2 treats `local-usage` as a script path in the
> current directory and fails. Starting from the ecosystem file avoids this.

If `local-usage` is `online`:
> "✓ Dashboard started at http://localhost:<PORT>/dashboard"

If it fails:
```bash
pm2 logs local-usage --lines 20 --nostream
```
Suggest running `/local-usage:update` to diagnose and repair the install (it fixes a
missing config, stale deps/build, or an unregistered service, then brings it back up).
Only fall back to `/local-usage:init` if there's no install directory at all.

---

### 项目级 PM2 模式

```bash
cd "<INSTALL_DIR>"
npx pm2 start ecosystem.config.js
npx pm2 list
```

If `local-usage` is `online`:
> "✓ Dashboard started at http://localhost:<PORT>/dashboard"

If it fails:
```bash
cd "<INSTALL_DIR>" && npx pm2 logs local-usage --lines 20 --nostream
```

---

### 无 PM2 模式

**macOS/Linux:**
```bash
cd "<INSTALL_DIR>"
nohup npx next start -p <PORT> > "<INSTALL_DIR>/local-usage.log" 2>&1 &
echo "Started PID: $!"
```

**Windows (PowerShell):**
```powershell
Start-Process -NoNewWindow -FilePath "npx" -ArgumentList "next","start","-p","<PORT>" -WorkingDirectory "<INSTALL_DIR>"
```

Then verify the port is listening:
```bash
# macOS/Linux
lsof -i :<PORT> | grep LISTEN

# Windows
Get-NetTCPConnection -LocalPort <PORT> -State Listen -ErrorAction SilentlyContinue
```

If port is live:
> "✓ Dashboard started at http://localhost:<PORT>/dashboard"

---

## Step 3: Open in browser

After confirming the service is running, open the dashboard automatically:

**macOS:**
```bash
open http://localhost:<PORT>/dashboard
```

**Linux:**
```bash
xdg-open http://localhost:<PORT>/dashboard
```

**Windows (PowerShell):**
```powershell
Start-Process "http://localhost:<PORT>/dashboard"
```

Tell the user:
> "Opening http://localhost:<PORT>/dashboard in your browser."
