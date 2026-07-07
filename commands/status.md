Check whether the AI Usage dashboard is running.

---

## Step 0: Resolve install directory & port

The install dir was chosen at `/local-usage:init` and persisted to a marker file.
Resolve it (fall back to `~/local-usage` if the marker is missing).

**macOS/Linux:**
```bash
INSTALL_DIR="$(cat "$CLAUDE_PLUGIN_DATA/install-path" 2>/dev/null)"
# Defensive fallback: scan the canonical <plugin>-<marketplace> path
if [ -z "$INSTALL_DIR" ]; then
  p="$HOME/.claude/plugins/data/local-usage-local-usage/install-path"
  [ -f "$p" ] && INSTALL_DIR="$(cat "$p" 2>/dev/null)"
fi
[ -z "$INSTALL_DIR" ] && INSTALL_DIR="$HOME/local-usage"
PORT="$(node -e "try{process.stdout.write(String(require(process.argv[1]).port||3002))}catch{process.stdout.write('3002')}" "$INSTALL_DIR/local-usage.config.json" 2>/dev/null)"
[ -z "$PORT" ] && PORT=3002
echo "INSTALL_DIR=$INSTALL_DIR  PORT=$PORT"
```

**Windows (PowerShell):**
```powershell
function Get-LocalUsageInstallDir {
  $candidates = @()
  if ($env:CLAUDE_PLUGIN_DATA) { $candidates += (Join-Path $env:CLAUDE_PLUGIN_DATA "install-path") }
  $candidates += (Join-Path $env:USERPROFILE ".claude\plugins\data\local-usage-local-usage\install-path")
  foreach ($p in $candidates) { if (Test-Path $p) { return (Get-Content $p -Raw).Trim() } }
  return "$env:USERPROFILE\local-usage"
}
$INSTALL_DIR = Get-LocalUsageInstallDir
$cfg = Join-Path $INSTALL_DIR "local-usage.config.json"
$PORT = if (Test-Path $cfg) { try { [int]((Get-Content $cfg -Raw | ConvertFrom-Json).port) } catch { 3002 } } else { 3002 }
if (-not $PORT) { $PORT = 3002 }
"INSTALL_DIR=$INSTALL_DIR  PORT=$PORT"
```

Use `<INSTALL_DIR>` / `<PORT>` below.

---

## Step 1: Check the configured port (universal)

Regardless of how the service was started, check whether the port is listening:

**macOS/Linux:**
```bash
lsof -i :<PORT> | grep LISTEN
```

**Windows (PowerShell):**
```powershell
Get-NetTCPConnection -LocalPort <PORT> -State Listen -ErrorAction SilentlyContinue
```

If the port is active → service is running, report:
> "✓ AI Usage Dashboard is running at http://localhost:<PORT>/dashboard
>
> Use `/local-usage:open` to open it, or `/local-usage:query` to see today's usage inline."

If the port is not active → service is stopped, continue to Step 2.

---

## Step 2: Check PM2 for more detail (if available)

If global `pm2` is available:
```bash
pm2 list
```

If project-level PM2 (run from install dir):
```bash
cd "<INSTALL_DIR>" && npx pm2 list
```

Look for `local-usage` process:
- `online` → port check above should have caught this; show the URL
- `stopped` → report: "✗ Dashboard is stopped. Use `/local-usage:start` to start it."
- Not listed → report: "✗ No local-usage process registered. Run `/local-usage:start` to start it, or `/local-usage:update` if the install needs repair."

If neither PM2 is available (no-PM2 mode):
> "✗ Dashboard is not running. Use `/local-usage:start` to start it."
