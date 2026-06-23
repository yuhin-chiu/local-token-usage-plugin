Start the AI Usage dashboard service.

---

## Step 1: Detect running mode

Check which PM2 is available:

```bash
# Check global PM2
pm2 --version

# Check project-level PM2 (run from install dir, default ~/ai-usage)
npx --no pm2 --version 2>/dev/null
```

- If global `pm2` is available → use **global PM2 mode**
- If only project-level (`npx pm2`) → use **project PM2 mode**
- If neither → use **no-PM2 mode**

---

## Step 2: Start the service

### 全局 PM2 模式

```bash
pm2 start ai-usage
pm2 list
```

If `ai-usage` is `online`:
> "✓ Dashboard started at http://localhost:3002/dashboard"

If it fails or process not found:
```bash
pm2 logs ai-usage --lines 20 --nostream
```
Suggest running `/ai-usage:init` to re-register the process.

---

### 项目级 PM2 模式

```bash
cd ~/ai-usage
npx pm2 start ai-usage
npx pm2 list
```

If `ai-usage` is `online`:
> "✓ Dashboard started at http://localhost:3002/dashboard"

If it fails:
```bash
npx pm2 logs ai-usage --lines 20 --nostream
```

---

### 无 PM2 模式

**macOS/Linux:**
```bash
cd ~/ai-usage
nohup npm start > ~/ai-usage.log 2>&1 &
echo "Started PID: $!"
```

**Windows (PowerShell):**
```powershell
Start-Process -NoNewWindow -FilePath "npm" -ArgumentList "start" -WorkingDirectory "$HOME\ai-usage"
```

Then verify the port is listening:
```bash
# macOS/Linux
lsof -i :3002 | grep LISTEN

# Windows
Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue
```

If port is live:
> "✓ Dashboard started at http://localhost:3002/dashboard"
