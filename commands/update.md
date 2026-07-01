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

---

## Step 1: Locate & validate the install directory

Resolve where the install lives and confirm it's a real, git-cloned dashboard.

**macOS/Linux:**
```bash
INSTALL_DIR="$(cat "$CLAUDE_PLUGIN_DATA/install-path" 2>/dev/null)"
if [ -z "$INSTALL_DIR" ] || [ ! -d "$INSTALL_DIR" ]; then
  echo "NO_MARKER"
elif [ ! -f "$INSTALL_DIR/package.json" ] || [ ! -f "$INSTALL_DIR/ecosystem.config.js" ] || [ ! -d "$INSTALL_DIR/.git" ]; then
  echo "INVALID:$INSTALL_DIR"
else
  echo "OK:$INSTALL_DIR"
fi
```

**Windows (PowerShell):**
```powershell
$marker = if ($env:CLAUDE_PLUGIN_DATA) { Join-Path $env:CLAUDE_PLUGIN_DATA "install-path" } else { "" }
$INSTALL_DIR = if ($marker -and (Test-Path $marker)) { (Get-Content $marker -Raw).Trim() } else { "" }
if (-not $INSTALL_DIR -or -not (Test-Path $INSTALL_DIR)) { "NO_MARKER" }
elseif (-not (Test-Path (Join-Path $INSTALL_DIR "package.json")) -or -not (Test-Path (Join-Path $INSTALL_DIR "ecosystem.config.js")) -or -not (Test-Path (Join-Path $INSTALL_DIR ".git"))) { "INVALID:$INSTALL_DIR" }
else { "OK:$INSTALL_DIR" }
```

- **OK** → use this `INSTALL_DIR`. Refresh the marker anyway (Step 1a), continue.
- **NO_MARKER** → ask the user via **AskUserQuestion** where the install is:
  - **Default `~/local-usage`** (only offer if it exists on disk)
  - **Custom path** — user types the absolute path (e.g. `D:\code3\local-usage`)
  - **Not installed yet** → tell them to run `/local-usage:init`, then **Stop.**

  Re-run the validation above against the chosen path.
- **INVALID** (the directory exists but isn't a git-cloned dashboard — e.g. a
  hand-copied folder, or the wrong directory) → tell the user:
  > "`<INSTALL_DIR>` isn't a valid dashboard install (needs to be a `git clone` of
  > the repo). Run `/local-usage:init` to install it cleanly."

  Then **Stop.** This command repairs a real clone; it does not create one.

### Step 1a: Persist the resolved path

```bash
# macOS/Linux
mkdir -p "$CLAUDE_PLUGIN_DATA"
printf '%s' "$INSTALL_DIR" > "$CLAUDE_PLUGIN_DATA/install-path"
```
```powershell
# Windows
New-Item -ItemType Directory -Force $env:CLAUDE_PLUGIN_DATA | Out-Null
[System.IO.File]::WriteAllText((Join-Path $env:CLAUDE_PLUGIN_DATA "install-path"), $INSTALL_DIR)
```

---

## Step 2: Check the environment

```bash
node --version
```

If Node.js is missing or below 18, tell the user to install Node 18+ from
https://nodejs.org and re-run `/local-usage:update`. **Stop** — nothing below can
build or run without it.

---

## Step 3: Refresh the code

Step 1 already guaranteed this is a git repo, so pull the latest:

```bash
cd "<INSTALL_DIR>" && git pull
```

Note whether the pull actually brought in new commits (git prints `Already
up to date.` when it didn't). Call this `PULLED=yes|no` — Step 5 uses it to decide
whether a rebuild is needed.

---

## Step 4: Config health check & top-up

The install dir holds `local-usage.config.json` (`enabledSources`, `port`,
`version`, and the plugin's `runMode`). Repair it in two tiers.

### 4a. If the config file is missing entirely

Do the full first-time config flow (same as `/local-usage:init`):
1. Detect installed tools — check `~/.claude/projects` and `~/.codex/sessions`.
2. **AskUserQuestion (multiSelect)** which sources to track (recommend detected
   ones; fall back to `["claude-code"]` if none picked) → `ENABLED_SOURCES`.
3. **AskUserQuestion** for the port (default `3002`) → `PORT`.
4. Choose the run mode (see 4c) → `RUN_MODE`.
5. Write the file (Step 4d).

### 4b. If the config file exists — top up missing keys (silent tier)

New plugin/app versions may add config keys with safe defaults. Merge any key that
exists in the shipped template `local-usage.config.example.json` but is absent from
the user's config, **keeping the user's existing values**. (The template mirrors the
app's `DEFAULT_CONFIG`; pulling in Step 3 brought the current version's template.)

**macOS/Linux:**
```bash
node -e '
const fs=require("fs"),p=require("path");
const rd=f=>{const s=fs.readFileSync(f,"utf8");return s.charCodeAt(0)===0xFEFF?s.slice(1):s;}; // strip UTF-8 BOM
const dir=process.argv[1];
const cfgPath=p.join(dir,"local-usage.config.json");
const tplPath=p.join(dir,"local-usage.config.example.json");
const cfg=JSON.parse(rd(cfgPath));
let changed=false;
try{
  const tpl=JSON.parse(rd(tplPath));
  for(const k of Object.keys(tpl)){ if(!(k in cfg)){ cfg[k]=tpl[k]; changed=true; } }
}catch{}
if(changed){ fs.writeFileSync(cfgPath, JSON.stringify(cfg,null,2)+"\n"); console.log("TOPPED_UP:"+JSON.stringify(cfg)); }
else console.log("CONFIG_COMPLETE");
' "<INSTALL_DIR>"
```

**Windows (PowerShell):** run the same `node -e` with the script (single-quoted) and
`"<INSTALL_DIR>"` as the argument.

> This is how "is the config complete?" is judged — by diffing against the shipped
> template, **never** by a hardcoded key list here. When the dashboard adds a config
> key it also updates `DEFAULT_CONFIG` + `local-usage.config.example.json`, so this
> step picks it up automatically. Use the config's `version` as a cheap short-circuit
> if it already equals the template's version.

### 4c. Resolve the run mode (interactive tier)

`runMode` has no safe silent default, so it can't be filled from the template. Read
it from the config; if absent, ask the user once and write it back.

```bash
# read runMode (prints empty if missing)
node -e 'try{const s=require("fs").readFileSync(process.argv[1],"utf8");const t=s.charCodeAt(0)===0xFEFF?s.slice(1):s;process.stdout.write(String(JSON.parse(t).runMode||""))}catch{}' "<INSTALL_DIR>/local-usage.config.json"
```

- If it prints one of `pm2-global` / `pm2-project` / `none` → use it as `RUN_MODE`.
- If empty → **AskUserQuestion**: "How should the dashboard service run?"
  - **全局 PM2**（推荐）→ `pm2-global`
  - **项目级 PM2** → `pm2-project`
  - **不装 PM2** → `none`

  Store as `RUN_MODE` and continue — it gets written in Step 4d.

### 4d. Write the config

Write `local-usage.config.json` into `INSTALL_DIR` with the resolved values. Keep any
existing keys not managed here.

```bash
# macOS/Linux (adjust the values to what was resolved above)
cat > "<INSTALL_DIR>/local-usage.config.json" <<EOF
{
  "version": 1,
  "enabledSources": ["claude-code", "codex"],
  "port": 3002,
  "runMode": "pm2-global"
}
EOF
```
```powershell
# Windows — UTF-8 without BOM (Out-File -Encoding utf8 on PS 5.1 adds a BOM that
# breaks node's JSON.parse). Use .NET WriteAllText.
$cfg = @'
{
  "version": 1,
  "enabledSources": ["claude-code", "codex"],
  "port": 3002,
  "runMode": "pm2-global"
}
'@
[System.IO.File]::WriteAllText("<INSTALL_DIR>\local-usage.config.json", $cfg)
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
cd "<INSTALL_DIR>" && nohup npx next start -p <PORT> > ~/local-usage.log 2>&1 &
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
  - no-PM2: `cat ~/local-usage.log`
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
