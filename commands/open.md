Open the AI Usage dashboard in the default browser.

---

## Step 0: Resolve the configured port

The port lives in `local-usage.config.json` inside the install dir (chosen at
`/local-usage:init` and persisted to a marker file). Resolve it, falling back to
`3002`.

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
echo "PORT=$PORT"
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
"PORT=$PORT"
```

Use `<PORT>` below.

---

## Step 1: Detect OS and open

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

---

## Step 2: If the page doesn't load

Suggest running `/local-usage:status` to check whether the service is running.
