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

## Step 1: Probe the port and PM2 (one call, all platforms)

The probe script does the cross-platform port check (a TCP connect, replacing
`lsof` / `Get-NetTCPConnection`) and reads PM2 in one shot:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/status.js" --port=<PORT> --install-dir="<INSTALL_DIR>"
```

It prints:
```
PORT_LISTENING=yes|no          is the dashboard actually running (source of truth)
PM2_MODE=global|npx|none        which PM2 is available
PM2_STATE=online|stopped|absent status of the local-usage process
```

---

## Step 2: Report based on the probe

**`PORT_LISTENING=yes`** → running. Report:
> "✓ AI Usage Dashboard is running at http://localhost:<PORT>/dashboard
>
> Use `/local-usage:open` to open it, or `/local-usage:query` to see today's usage inline."

**`PORT_LISTENING=no`** → not running. Use `PM2_STATE` to explain why, but first apply
the `INSTALL_MISSING` override:

- **`INSTALL_MISSING`** (Step 0a — port not listening *and* install path missing/moved):
  don't advise `start`, it can't succeed. Report:
  > "✗ Dashboard isn't running and its install at `<INSTALL_DIR>` is missing or was
  > moved. Run `/local-usage:update` to relocate and repair it."
- **`PM2_STATE=stopped`** →
  > "✗ Dashboard is stopped. Use `/local-usage:start` to start it."
- **`PM2_STATE=absent`** (registered nowhere, or `PM2_MODE=none` = no-PM2 mode) →
  > "✗ Dashboard is not running. Use `/local-usage:start` to start it (or
  > `/local-usage:update` if the install needs repair)."
