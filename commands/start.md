Start the AI Usage dashboard service.

---

## Step 0: Resolve & validate install directory + port

Resolve where the install lives with the shared resolver — the single source of
truth for the marker, port, and install validity, used by every command (works on
macOS/Linux/Windows, no per-OS block needed):

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/resolve.js"
```

It prints:
```
STATUS=FOUND|STALE|NONE
INSTALL_DIR=<path>
PORT=<port>
MARKER=env|canonical|none
DIR_EXISTS=yes|no
NODE_MAJOR=<major>
```

Use `INSTALL_DIR` / `PORT` from the output in every step below (written as
`<INSTALL_DIR>` / `<PORT>`).

### Step 0a: Gate on STATUS

If the folder was moved, renamed, or deleted (common after switching machines or
reorganizing disks), starting from a stale path fails with a cryptic PM2/next error.
The resolver already validated the install, so just act on `STATUS`:

- **FOUND** → real, git-cloned install. Continue.
- **STALE / NONE** (no usable marker, or the recorded folder is gone / isn't a valid
  install) → **stop here**, don't try to start:
  > "The dashboard install at `<INSTALL_DIR>` is missing or was moved. Run
  > `/local-usage:update` to relocate and repair it (or `/local-usage:init` if it was
  > never installed)."

---

## Step 1: Start the service

`service.js` auto-detects the run mode (global pm2 → project npx pm2 → no-PM2) and
starts accordingly — one call, all platforms. It starts via the install's
`ecosystem.config.js` (which registers + starts and is a no-op if already online),
then polls the port and reports the result:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/service.js" --action=start --install-dir="<INSTALL_DIR>" --port=<PORT>
```

Read `RESULT` / `MODE` / `PM2_STATE` / `PORT_LISTENING` from its output.

- **`RESULT=ok`** → started. Report and continue to Step 2:
  > "✓ Dashboard started at http://localhost:<PORT>/dashboard"
- **`RESULT=fail`** → it didn't come up. Diagnose (Step 1a).

### Step 1a: If start failed

Pull recent logs to see why (use the reported `MODE`):

```bash
# MODE=global
pm2 logs local-usage --lines 20 --nostream
# MODE=npx
cd "<INSTALL_DIR>" && npx pm2 logs local-usage --lines 20 --nostream
```

Then suggest running `/local-usage:update` to diagnose and repair the install (it fixes
a missing config, stale deps/build, or an unregistered service, then brings it back up).
Only fall back to `/local-usage:init` if there's no install directory at all.

---

## Step 2: Open in browser

After `RESULT=ok`, open the dashboard automatically (one call, all platforms):

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/open-browser.js" --port=<PORT>
```

Read `URL` from its output and tell the user:
> "Opening <URL> in your browser."
