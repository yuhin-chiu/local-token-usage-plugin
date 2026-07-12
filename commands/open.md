Open the AI Usage dashboard in the default browser.

---

## Step 0: Resolve the configured port

Resolve the port with the shared resolver (one call, all platforms — it reads the
marker and the install's `local-usage.config.json`, falling back to `3002`):

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/resolve.js"
```

Read `PORT` from its output and use `<PORT>` below.

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
