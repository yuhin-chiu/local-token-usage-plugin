Stop the AI Usage dashboard service.

---

## Step 0: Resolve install directory & port

Resolve the marker, port, and install validity with the shared resolver (one call,
all platforms):

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/resolve.js"
```

It prints `STATUS` / `INSTALL_DIR` / `PORT` / `MARKER` / `DIR_EXISTS` / `NODE_MAJOR`.
Use `<INSTALL_DIR>` / `<PORT>` below. Stopping only needs `<PORT>` (the service is
bound to it either way), so even a `STALE` install can still be stopped by port —
the project-PM2 fallback below already handles a missing `INSTALL_DIR`.

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

Project PM2 lives inside `INSTALL_DIR`, so it needs the directory. If `INSTALL_DIR`
is missing or moved (`[ -d "$INSTALL_DIR" ]` is false), the `cd`/`npx pm2` below can't
run — **fall back to the no-PM2 method** (kill by port) instead; the service is bound
to `<PORT>` either way.

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
