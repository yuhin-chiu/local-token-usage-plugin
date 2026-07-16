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

## Step 3: Refresh the code (version-lockstep, network-optional)

Step 1 guaranteed this is a git repo. The install script pins the checkout to the
tag matching **the plugin's own version** (`v<version>` from `plugin.json`) — one
call, all platforms. When the checkout already sits on that commit it does **nothing**
(no fetch, no build), so re-running `/update` without a plugin upgrade is a true
no-op. When the dashboard repo hasn't published that tag yet (today's reality — the
repo has no tags), it **falls back** to following `main` exactly as before, so nothing
breaks on tagless repos and it upgrades automatically once tags exist.

Pass `--no-pull` when the user passed `--no-pull` / `--local` / `--offline` (see
Arguments) to skip all network access:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/install.js" --action=sync-code --install-dir="<INSTALL_DIR>"
```

Read `CODE_STATE` and `CODE_CHANGED`:

- `CODE_STATE=current` → already pinned to the plugin's version tag; nothing changed
  (`CODE_CHANGED=false`). Zero network, zero build.
- `CODE_STATE=updated` → checked out the version tag; new code is in
  (`CODE_CHANGED=true`) → Step 5 forces a rebuild.
- `CODE_STATE=fallback` → the version tag isn't published yet, so it followed `main`.
  `CODE_CHANGED=true` only if new commits were fast-forwarded in (drives the rebuild);
  `false` when already up-to-date or offline. `WARNING` explains which fallback path.
- `CODE_STATE=protected` → local changes/commits present (dev machine); nothing was
  touched (`CODE_CHANGED=false`). Tell the user to commit/stash if they want the pin.
- `CODE_STATE=error` → not a git clone, or the plugin version is unreadable; **Stop**
  and surface `WARNING`.

Step 5 keys the rebuild off `CODE_CHANGED`, so an unchanged (`current`/up-to-date)
run does zero extra build work.


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

Rebuild only when needed — after a real pull, or when artifacts are missing. The build
script skips when `node_modules` + `.next` already exist; `--force` overrides it.

- **`CODE_CHANGED=true`** (new code, from Step 3) → force a rebuild:
  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/scripts/install.js" --action=build --install-dir="<INSTALL_DIR>" --force
  ```
- **`CODE_CHANGED=false`** → let it self-skip (builds only if artifacts are missing):
  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/scripts/install.js" --action=build --install-dir="<INSTALL_DIR>"
  ```

Read `BUILT`: `yes` / `skipped` → continue. `BUILT=fail` → the last 30 lines are shown
above (`STAGE` says install vs build); **Stop** — a human must read the error.

---

## Step 6: Bring the service up & verify (the success gate)

Bring the service up using `RUN_MODE` from the config, then confirm the port is
actually listening. If it isn't, diagnose and fix, then retry — repeat until it's up
or you hit a hard blocker (port taken by an unrelated process, etc.).

Read `PORT` and `RUN_MODE` from `<INSTALL_DIR>/local-usage.config.json`.

**Self-heal: if a pm2 mode is missing pm2, install it first** — `RUN_MODE=pm2-global`
→ `npm install -g pm2`; `pm2-project` → `cd "<INSTALL_DIR>" && npm install pm2`.

**Start + verify (one call — starts per `RUN_MODE` and polls the port):**
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/service.js" --action=start --install-dir="<INSTALL_DIR>" --port=<PORT> --mode=<RUN_MODE>
```

- **`RESULT=ok`** (`PORT_LISTENING=yes`) → success. Continue to Step 7.
- **`RESULT=fail`** → look at the logs, fix the root cause, then retry this step:
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
node "${CLAUDE_PLUGIN_ROOT}/scripts/open-browser.js" --port=<PORT>
```

> "✓ Repaired and running. Dashboard is live at http://localhost:<PORT>/dashboard.
> Install: `<INSTALL_DIR>` (run mode: `<RUN_MODE>`)."
