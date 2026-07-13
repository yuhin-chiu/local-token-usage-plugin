Diagnose and repair an existing AI Usage install, then make sure it's actually running.

Use this when the dashboard was **already installed** but something is off — a new
plugin version can't locate it, the config is missing keys, dependencies/build are
stale, or the service won't come up. This command runs a health check, fixes each
problem it finds, and keeps going until the service is **listening**.

**Success criterion:** a process is listening on the configured port (you can open
`/dashboard`). If a repair doesn't get there, diagnose the next problem and fix it —
don't stop at "I ran the command", stop at "it's up".

**This command never clones.** It only repairs an install that already exists on
disk. If there's no install directory at all (or it isn't the dashboard repo), it
hands off to `/local-usage:init`.

## Arguments

Optional flag in the command arguments:

- `--no-pull` (aliases `--local`, `--offline`) → **skip the network step entirely.**
  Run a pure local repair (config / deps / build / service) without contacting the
  remote. Use this to fix a local issue fast, or when you're offline. Step 3 honors it.

Even without the flag, Step 3 never re-downloads when the code is already current and
never fails just because the network is down — see below.

---

## Step 1: Locate & validate the install directory

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

Act on `STATUS` (use `INSTALL_DIR` / `PORT` from the output below):

- **FOUND** → it's a real, git-cloned dashboard. Use this `INSTALL_DIR`; refresh the
  marker (Step 1a) and continue.
- **STALE / NONE with `DIR_EXISTS=no`** (nothing usable recorded — no marker, or the
  recorded folder is gone, e.g. after moving machines) → ask the user via
  **AskUserQuestion** where the install is:
  - **Default `~/local-usage`** (only offer if it exists on disk)
  - **Custom path** — user types the absolute path (e.g. `D:\code3\local-usage`)
  - **Not installed yet** → tell them to run `/local-usage:init`, then **Stop.**

  Re-run the resolver against the chosen path (or validate it) before continuing.
- **STALE with `DIR_EXISTS=yes`** (the directory is there but isn't a git-cloned
  dashboard — a hand-copied folder or the wrong directory) → tell the user:
  > "`<INSTALL_DIR>` isn't a valid dashboard install (needs to be a `git clone` of
  > the repo). Run `/local-usage:init` to install it cleanly."

  Then **Stop.** This command repairs a real clone; it does not create one.

### Step 1a: Persist the resolved path

Write the resolved `<INSTALL_DIR>` back to the marker (self-heals a missing/stale
marker) — one call, all platforms; it falls back to the canonical data dir when
`$CLAUDE_PLUGIN_DATA` isn't injected:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/install.js" --action=write-marker --install-dir="<INSTALL_DIR>"
```

---

## Step 2: Check the environment

No extra call needed — Step 1 already ran Node, so read `NODE_MAJOR` from its output.
If it's below **18** (or the resolver didn't run at all), tell the user to install
Node 18+ from https://nodejs.org and re-run `/local-usage:update`. **Stop** — nothing
below can build or run without it.

---

## Step 3: Refresh the code (network-optional)

Step 1 guaranteed this is a git repo. Sync the latest commits, but treat the network
as **optional**: a doctor run must still work offline, and it must not re-download or
rebuild when nothing changed.

**If the user passed `--no-pull` / `--local` / `--offline`** (see Arguments): skip
this whole step, set `PULLED=no`, and go to Step 4.

Otherwise fetch, then fast-forward **only when the local branch is actually behind** —
and never let a failed fetch abort the run:

**macOS/Linux:**
```bash
cd "<INSTALL_DIR>" || exit 1
if git fetch --quiet 2>/dev/null; then
  LOCAL="$(git rev-parse HEAD 2>/dev/null)"
  REMOTE="$(git rev-parse '@{u}' 2>/dev/null)"
  if [ -n "$REMOTE" ] && [ "$LOCAL" != "$REMOTE" ]; then
    git merge --ff-only 2>/dev/null && echo "PULLED=yes" \
      || echo "PULLED=no (diverged/local changes — skipping, nothing lost)"
  else
    echo "PULLED=no (already up to date)"
  fi
else
  echo "PULLED=no (offline or fetch failed — continuing with local repair)"
fi
```

**Windows (PowerShell):** same logic — `git fetch`; compare `git rev-parse HEAD` vs
`git rev-parse '@{u}'`; run `git merge --ff-only` only if they differ; on any fetch
failure just report offline and continue.

`PULLED=yes` **only** when new commits were fast-forwarded in. Step 5 keys the
reinstall/rebuild off it, so an up-to-date (or offline) run does **zero** extra
network or build work — it just verifies the service is up.

---

## Step 4: Config health check & top-up

The install dir holds `local-usage.config.json` (`enabledSources`, `port`,
`version`, and the plugin's `runMode`). Repair it in two tiers.

### 4a. If the config file is missing entirely

Do the full first-time config flow (same as `/local-usage:init`):
1. Detect installed tools — `node "${CLAUDE_PLUGIN_ROOT}/scripts/detect-sources.js"`,
   read `DETECTED`.
2. **AskUserQuestion (multiSelect)** which sources to track (recommend detected
   ones; fall back to `["claude-code"]` if none picked) → `ENABLED_SOURCES`.
3. **AskUserQuestion** for the port (default `3002`) → `PORT`.
4. Choose the run mode (see 4c) → `RUN_MODE`.
5. Write the file (Step 4d).

### 4b. If the config file exists — top up missing keys (silent tier)

New plugin/app versions may add config keys with safe defaults. The install script
merges any key present in the shipped template `local-usage.config.example.json` but
absent from the user's config, **keeping the user's existing values** (one call, all
platforms):

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/install.js" --action=sync-config --install-dir="<INSTALL_DIR>"
```

Read its output:
- `SYNCED=complete` / `SYNCED=topped-up` → config is present and now current.
- `SYNCED=no-config` → the file is missing entirely; go to **4a** (full first-time flow).
- `RUN_MODE=<value>` → the current run mode (empty if unset) — used by **4c**.

> Completeness is judged by diffing against the shipped template, **never** a hardcoded
> key list. When the dashboard adds a config key it also updates `DEFAULT_CONFIG` +
> `local-usage.config.example.json`, so this step picks it up automatically after the
> Step 3 pull.

### 4c. Resolve the run mode (interactive tier)

`runMode` has no safe silent default, so it can't be filled from the template. Use the
`RUN_MODE` printed by the `sync-config` call in 4b:

- If it is one of `pm2-global` / `pm2-project` / `none` → use it as `RUN_MODE`.
- If empty → **AskUserQuestion**: "How should the dashboard service run?"
  - **全局 PM2**（推荐）→ `pm2-global`
  - **项目级 PM2** → `pm2-project`
  - **不装 PM2** → `none`

  Store as `RUN_MODE` and continue — it gets written in Step 4d.

### 4d. Write the config

Write the resolved values with the install script (upsert — UTF-8, no BOM, keeps any
keys not passed). In the **4a** full-flow pass all three; in the **4b/4c** path pass
only what changed (typically just `--run-mode` when 4c had to ask):

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/install.js" --action=write-config --install-dir="<INSTALL_DIR>" --sources="<ENABLED_SOURCES_CSV>" --port=<PORT> --run-mode=<RUN_MODE>
```

> If you only topped up (4b) / added `runMode` (4c) to an existing file, prefer
> merging via `node -e` over rewriting, so unrelated keys survive. Then read the final
> `PORT` and `RUN_MODE` back from the file for the steps below.

---

## Step 5: Dependencies & build

Rebuild only when needed — after a real pull, or when artifacts are missing.

```bash
cd "<INSTALL_DIR>"
# install if node_modules is missing OR code was pulled (PULLED=yes)
[ ! -d node_modules ] && NEED_INSTALL=1
# build if .next is missing OR code was pulled
[ ! -d .next ] && NEED_BUILD=1
```

- If `PULLED=yes` **or** `node_modules` missing → `npm install`
- If `PULLED=yes` **or** `.next` missing → `npm run build`

If `npm run build` fails, show the last 30 lines and **Stop** — this is a hard
blocker that needs a human to read the error.

---

## Step 6: Bring the service up & verify (the success gate)

Bring the service up using `RUN_MODE` from the config, then confirm the port is
actually listening. If it isn't, diagnose and fix, then retry — repeat until it's up
or you hit a hard blocker (port taken by an unrelated process, etc.).

Read `PORT` and `RUN_MODE` from `<INSTALL_DIR>/local-usage.config.json`.

### RUN_MODE = pm2-global
```bash
pm2 --version || npm install -g pm2          # fix: pm2 missing
pm2 restart local-usage --update-env 2>/dev/null || pm2 start "<INSTALL_DIR>/ecosystem.config.js"
pm2 save
```

### RUN_MODE = pm2-project
```bash
cd "<INSTALL_DIR>"
npx --no pm2 --version 2>/dev/null || npm install pm2   # fix: pm2 missing
npx pm2 restart local-usage --update-env 2>/dev/null || npx pm2 start ecosystem.config.js
npx pm2 save
```

### RUN_MODE = none
```bash
# macOS/Linux
cd "<INSTALL_DIR>" && nohup npx next start -p <PORT> > "<INSTALL_DIR>/local-usage.log" 2>&1 &
```
```powershell
# Windows
Start-Process -NoNewWindow -FilePath "npx" -ArgumentList "next","start","-p","<PORT>" -WorkingDirectory "<INSTALL_DIR>"
```

### Verify it's listening
```bash
# macOS/Linux
lsof -i :<PORT> | grep LISTEN
# Windows
Get-NetTCPConnection -LocalPort <PORT> -State Listen -ErrorAction SilentlyContinue
```

- **Listening** → success. Continue to Step 7.
- **Not listening** → look at the logs and fix the root cause, then retry this step:
  - PM2 modes: `pm2 logs local-usage --lines 30 --nostream` (or `npx pm2 logs ...`)
  - no-PM2: `cat "<INSTALL_DIR>/local-usage.log"`
  - Common fixes: port taken → tell the user (hard blocker unless they change
    `port` in config); build error → back to Step 5; missing dep → `npm install`.
  Keep going until the port is listening.

---

## Step 7: Report & open

Summarize what was checked and repaired (marker, config keys added, pulled/rebuilt,
service restarted), then open the dashboard:

```bash
# macOS: open ... / Linux: xdg-open ... / Windows: Start-Process
```
```powershell
Start-Process "http://localhost:<PORT>/dashboard"
```

> "✓ Repaired and running. Dashboard is live at http://localhost:<PORT>/dashboard.
> Install: `<INSTALL_DIR>` (run mode: `<RUN_MODE>`)."
