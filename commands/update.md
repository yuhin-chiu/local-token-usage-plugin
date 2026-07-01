Repair/migrate an existing AI Usage install so the current commands can find it.

Use this when the dashboard was **already installed** but `/local-usage:start`
(or `status`/`stop`/`open`) can't locate it — typically because you installed to a
**custom directory** (e.g. another drive) with an older plugin version that didn't
persist the install path.

**This does NOT re-clone or rebuild anything.** It only records where your existing
install lives, by writing a marker into the plugin's persistent data dir
(`$CLAUDE_PLUGIN_DATA/install-path`). No repeated `git pull`.

---

## Step 1: Check whether a valid marker already exists

**macOS/Linux:**
```bash
MARKER="$CLAUDE_PLUGIN_DATA/install-path"
DIR="$(cat "$MARKER" 2>/dev/null)"
if [ -n "$DIR" ] && [ -f "$DIR/ecosystem.config.js" ]; then
  echo "OK: already registered -> $DIR"
elif [ -n "$DIR" ]; then
  echo "STALE: marker points to '$DIR' but no install found there"
else
  echo "MISSING: no marker"
fi
```

**Windows (PowerShell):**
```powershell
$marker = if ($env:CLAUDE_PLUGIN_DATA) { Join-Path $env:CLAUDE_PLUGIN_DATA "install-path" } else { "" }
if ($marker -and (Test-Path $marker)) {
  $dir = (Get-Content $marker -Raw).Trim()
  if (Test-Path (Join-Path $dir "ecosystem.config.js")) { "OK: already registered -> $dir" }
  else { "STALE: marker points to '$dir' but no install found there" }
} else { "MISSING: no marker" }
```

- If it prints **OK** → tell the user they're already set up; nothing to migrate. **Stop.**
- If **MISSING** or **STALE** → continue to Step 2.

---

## Step 2: Ask where the existing install is

Use **AskUserQuestion**:

- Question: "Where is your existing AI Usage dashboard installed?"
- Options:
  1. **Default `~/local-usage`** — only present this if it plausibly exists.
  2. **Custom path** — the user types the absolute path (e.g. `D:\code3\local-usage`).
  3. **Not installed yet** — if chosen, tell the user to run `/local-usage:init`
     instead, then **Stop** (this command only registers an existing install).

Store the chosen absolute path as `INSTALL_DIR`.

---

## Step 3: Validate the chosen directory

Confirm it really is a local-usage install (has both files):

**macOS/Linux:**
```bash
DIR="<INSTALL_DIR>"
if [ -f "$DIR/ecosystem.config.js" ] && [ -f "$DIR/package.json" ]; then echo "VALID"; else echo "INVALID"; fi
```

**Windows (PowerShell):**
```powershell
$dir = "<INSTALL_DIR>"
if ((Test-Path (Join-Path $dir "ecosystem.config.js")) -and (Test-Path (Join-Path $dir "package.json"))) { "VALID" } else { "INVALID" }
```

- **INVALID** → the path isn't a dashboard install. Re-ask (Step 2) or suggest
  `/local-usage:init`. **Do not write the marker.**
- **VALID** → continue.

---

## Step 4: Write the marker into the plugin data dir

**macOS/Linux:**
```bash
mkdir -p "$CLAUDE_PLUGIN_DATA"
printf '%s' "<INSTALL_DIR>" > "$CLAUDE_PLUGIN_DATA/install-path"
cat "$CLAUDE_PLUGIN_DATA/install-path"
```

**Windows (PowerShell):**
```powershell
New-Item -ItemType Directory -Force $env:CLAUDE_PLUGIN_DATA | Out-Null
[System.IO.File]::WriteAllText((Join-Path $env:CLAUDE_PLUGIN_DATA "install-path"), "<INSTALL_DIR>")
Get-Content (Join-Path $env:CLAUDE_PLUGIN_DATA "install-path") -Raw
```

Also clean up the obsolete marker from the short-lived 1.2.0 scheme, if present:
```bash
# macOS/Linux
rm -rf "$HOME/.local-usage"
```
```powershell
# Windows
Remove-Item "$env:USERPROFILE\.local-usage" -Recurse -Force -ErrorAction SilentlyContinue
```

---

## Step 5: Done

Tell the user:
> "✓ Migrated. Your existing install at `<INSTALL_DIR>` is now registered — no
> reinstall needed. Run `/local-usage:start` to launch it, or `/local-usage:status`
> to check."
