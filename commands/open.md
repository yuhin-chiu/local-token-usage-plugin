Open the AI Usage dashboard in the default browser.

---

## Step 1: Detect OS and open

**macOS:**
```bash
open http://localhost:3002/dashboard
```

**Linux:**
```bash
xdg-open http://localhost:3002/dashboard
```

**Windows (PowerShell):**
```powershell
Start-Process "http://localhost:3002/dashboard"
```

Tell the user:
> "Opening http://localhost:3002/dashboard in your browser."

---

## Step 2: If the page doesn't load

Suggest running `/ai-usage:status` to check whether the service is running.
