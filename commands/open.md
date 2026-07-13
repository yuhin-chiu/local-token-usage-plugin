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

## Step 1: Open in the default browser

One call, all platforms — the script picks `open` / `xdg-open` / `start` from the
OS and launches the dashboard URL:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/open-browser.js" --port=<PORT>
```

Read `URL` from its output and tell the user:
> "Opening <URL> in your browser."

---

## Step 2: If the page doesn't load

Suggest running `/local-usage:status` to check whether the service is running.
