Stop the AI Usage dashboard service.

---

## Step 0: Resolve install directory & port

The install dir was chosen at `/local-usage:init` and persisted to a marker file.
Resolve it (fall back to `~/local-usage` if the marker is missing).

**macOS/Linux:**
```bash
INSTALL_DIR="$(cat "$CLAUDE_PLUGIN_DATA/install-path" 2>/dev/null)"
[ -z "$INSTALL_DIR" ] && INSTALL_DIR="$HOME/local-usage"
PORT="$(node -e "try{process.stdout.write(String(require(process.argv[1]).port||3002))}catch{process.stdout.write('3002')}" "$INSTALL_DIR/local-usage.config.json" 2>/dev/null)"
[ -z "$PORT" ] && PORT=3002
echo "INSTALL_DIR=$INSTALL_DIR  PORT=$PORT"
```

**Windows (PowerShell):**
```powershell
$marker = if ($env:CLAUDE_PLUGIN_DATA) { Join-Path $env:CLAUDE_PLUGIN_DATA "install-path" } else { "" }
$INSTALL_DIR = if ($marker -and (Test-Path $marker)) { (Get-Content $marker -Raw).Trim() } else { "$env:USERPROFILE\local-usage" }
$cfg = Join-Path $INSTALL_DIR "local-usage.config.json"
$PORT = if (Test-Path $cfg) { try { [int]((Get-Content $cfg -Raw | ConvertFrom-Json).port) } catch { 3002 } } else { 3002 }
if (-not $PORT) { $PORT = 3002 }
"INSTALL_DIR=$INSTALL_DIR  PORT=$PORT"
```

Use `<INSTALL_DIR>` / `<PORT>` below.

---

## Step 1: Detect running mode

```bash
# Check global PM2
pm2 --version
```

- If global `pm2` available → **global PM2 mode**
- If not, check project: `cd "<INSTALL_DIR>" && npx --no pm2 --version`
- If neither → **no-PM2 mode**

---

## Step 2: Stop the service

### 全局 PM2 模式

```bash
pm2 stop local-usage
pm2 list
```

If status is `stopped`:
> "✓ Dashboard stopped."

If process not found:
> "No running local-usage process found — it may already be stopped."

---

### 项目级 PM2 模式

```bash
cd "<INSTALL_DIR>"
npx pm2 stop local-usage
npx pm2 list
```

If status is `stopped`:
> "✓ Dashboard stopped."

---

### 无 PM2 模式

Find and kill the process on the configured port:

**macOS/Linux:**
```bash
kill $(lsof -ti :<PORT>)
```

**Windows (PowerShell):**
```powershell
$p = Get-NetTCPConnection -LocalPort <PORT> -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($p) { Stop-Process -Id $p.OwningProcess -Force; "✓ Dashboard stopped." } else { "No process found on port <PORT>." }
```
