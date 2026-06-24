Stop the AI Usage dashboard service.

---

## Step 1: Detect running mode

```bash
# Check global PM2
pm2 --version
```

- If global `pm2` available → **global PM2 mode**
- If not, check project: `cd ~/local-usage && npx --no pm2 --version`
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
cd ~/local-usage
npx pm2 stop local-usage
npx pm2 list
```

If status is `stopped`:
> "✓ Dashboard stopped."

---

### 无 PM2 模式

Find and kill the process on port 3002:

**macOS/Linux:**
```bash
kill $(lsof -ti :3002)
```

**Windows (PowerShell):**
```powershell
$p = Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($p) { Stop-Process -Id $p.OwningProcess -Force; "✓ Dashboard stopped." } else { "No process found on port 3002." }
```
