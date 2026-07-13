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

## Step 1: Stop the service

`service.js` auto-detects the run mode and stops accordingly — one call, all
platforms. Global/project PM2 stop the `local-usage` process by name; no-PM2 (and
the fallback when the install dir is missing/moved) kills whatever is bound to the
port. It then polls the port to confirm:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/service.js" --action=stop --install-dir="<INSTALL_DIR>" --port=<PORT>
```

Read `RESULT` / `PORT_LISTENING` from its output.

- **`RESULT=ok`** (port no longer listening) →
  > "✓ Dashboard stopped."
- **`RESULT=fail`** (still listening) → something is still holding the port. Suggest
  re-checking with `/local-usage:status`, or that the user stop the process manually.

> Note: stopping only needs the `<PORT>` — a `STALE` install can still be stopped,
> since the port kill / npx-fallback doesn't depend on a valid `INSTALL_DIR`.
