Check whether the AI Usage dashboard is running.

---

## Step 0: Resolve install directory & port

Resolve the marker, port, and install validity with the shared resolver (one call,
all platforms):

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/resolve.js"
```

It prints `STATUS` / `INSTALL_DIR` / `PORT` / `MARKER` / `DIR_EXISTS` / `NODE_MAJOR`.
Use `<INSTALL_DIR>` / `<PORT>` below.

### Step 0a: Note whether the install still exists

Don't gate on this — the port check below is the source of truth for "running". But
carry the resolver's `STATUS` so a stopped/not-found result can tell the user *why*:
treat `STATUS=FOUND` as **`INSTALL_OK`**, and `STATUS=STALE`/`NONE` as
**`INSTALL_MISSING`** (path `<INSTALL_DIR>`) in the reporting below.

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

**Override when `INSTALL_MISSING`** (Step 0a): if the port is not listening *and* the
install path is missing/moved, don't advise `start` — it can't succeed. Report instead:
> "✗ Dashboard isn't running and its install at `<INSTALL_DIR>` is missing or was
> moved. Run `/local-usage:update` to relocate and repair it."
