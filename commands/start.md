Start the AI Usage dashboard service.

---

## Step 0: Resolve install directory & port

The install directory is chosen during `/local-usage:init` and persisted to a
marker file. **Always resolve it here** instead of assuming `~/local-usage` — the
user may have installed to a custom path (e.g. another drive). If the marker is
missing, fall back to the default `~/local-usage`.

**macOS/Linux:**
```bash
INSTALL_DIR="$(cat "$HOME/.local-usage/install-path" 2>/dev/null)"
[ -z "$INSTALL_DIR" ] && INSTALL_DIR="$HOME/local-usage"
PORT="$(node -e "try{process.stdout.write(String(require(process.argv[1]).port||3002))}catch{process.stdout.write('3002')}" "$INSTALL_DIR/local-usage.config.json" 2>/dev/null)"
[ -z "$PORT" ] && PORT=3002
echo "INSTALL_DIR=$INSTALL_DIR  PORT=$PORT"
```

**Windows (PowerShell):**
```powershell
$marker = "$env:USERPROFILE\.local-usage\install-path"
$INSTALL_DIR = if (Test-Path $marker) { (Get-Content $marker -Raw).Trim() } else { "$env:USERPROFILE\local-usage" }
$cfg = Join-Path $INSTALL_DIR "local-usage.config.json"
$PORT = if (Test-Path $cfg) { try { [int]((Get-Content $cfg -Raw | ConvertFrom-Json).port) } catch { 3002 } } else { 3002 }
if (-not $PORT) { $PORT = 3002 }
"INSTALL_DIR=$INSTALL_DIR  PORT=$PORT"
```

Use the resolved `$INSTALL_DIR` and `$PORT` in every step below (written as
`<INSTALL_DIR>` / `<PORT>`).

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
Suggest running `/local-usage:init` to (re)install, or verify the install dir exists.

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
nohup npx next start -p <PORT> > ~/local-usage.log 2>&1 &
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
