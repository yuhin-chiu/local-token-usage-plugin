Check whether the AI Usage dashboard is running.

---

## Step 1: Check port 3002 (universal)

Regardless of how the service was started, check whether port 3002 is listening:

**macOS/Linux:**
```bash
lsof -i :3002 | grep LISTEN
```

**Windows (PowerShell):**
```powershell
Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue
```

If the port is active → service is running, report:
> "✓ AI Usage Dashboard is running at http://localhost:3002/dashboard
>
> Use `/ai-usage:open` to open it, or `/ai-usage:query` to see today's usage inline."

If the port is not active → service is stopped, continue to Step 2.

---

## Step 2: Check PM2 for more detail (if available)

If global `pm2` is available:
```bash
pm2 list
```

If project-level PM2 (run from install dir):
```bash
cd ~/ai-usage && npx pm2 list
```

Look for `ai-usage` process:
- `online` → port check above should have caught this; show the URL
- `stopped` → report: "✗ Dashboard is stopped. Use `/ai-usage:start` to start it."
- Not listed → report: "✗ No ai-usage process registered. Run `/ai-usage:init` to set it up."

If neither PM2 is available (no-PM2 mode):
> "✗ Dashboard is not running. Use `/ai-usage:start` to start it."
