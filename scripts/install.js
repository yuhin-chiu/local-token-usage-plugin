#!/usr/bin/env node
/**
 * Disk-mutating install/repair actions for the `/init` and `/update` commands —
 * the deterministic, mechanical parts. The interactive parts (AskUserQuestion for
 * install dir / sources / port / run mode) and the "diagnose → fix → retry" loop
 * stay in the command markdown, per the script contract (§2).
 *
 * Sub-commands (--action):
 *   write-marker  --install-dir=<dir> [--data-dir=<dir>]
 *       Persist the install path so resolve.js finds it. data-dir precedence:
 *       --data-dir → $CLAUDE_PLUGIN_DATA → an existing local-usage-* data dir
 *       (mirrors resolve.js's scan; handles the ai-usage → local-usage rename — §5/D3).
 *
 *   write-config  --install-dir=<dir> [--sources=a,b] [--port=n] [--run-mode=m]
 *       Upsert local-usage.config.json: reads any existing file, sets ONLY the keys
 *       given, writes back (UTF-8, no BOM). New file → seeds version=1. Covers
 *       init 5d (sources/port), init 6a / update 4c (run mode), update 4d.
 *
 *   sync-config   --install-dir=<dir>
 *       Top up keys present in the shipped template local-usage.config.example.json
 *       but missing from the user's config, keeping existing values (update 4b).
 *       Reports SYNCED and the current RUN_MODE for the command to act on.
 *
 *   clone         --install-dir=<dir> [--repo=<url>]
 *       git clone the dashboard. If the dir is already a git-cloned install, reports
 *       CLONED=skipped-exists (the command pulls instead) — never re-clones over it.
 *
 *   pull          --install-dir=<dir> [--no-pull]
 *       Network-optional refresh: fetch, and fast-forward ONLY when strictly behind.
 *       Offline / diverged / ahead → PULLED=no (never blocks). --no-pull skips it.
 *
 *   sync-code     --install-dir=<dir> [--no-pull]
 *       Version-lockstep refresh: pin the dashboard checkout to the tag matching the
 *       plugin's version (v<version> from .claude-plugin/plugin.json). Already on the
 *       target commit → zero network, zero build. Tag not published yet → falls back
 *       to the plain `pull` (follows main), so it's a no-op change on repos without
 *       tags. Reports CODE_STATE / CODE_CHANGED for the command to key the rebuild off.
 *
 *   build         --install-dir=<dir> [--force]
 *       npm install + npm run build. Skips when node_modules + .next already exist
 *       (unless --force). On failure: last 30 lines to stderr, BUILT=fail, exit 1.
 *
 * Output — KEY=VALUE lines on stdout (resolve.js protocol); diagnostics on stderr.
 *
 * MUTATES disk → per contract §6 this is NOT in hooks/allow.js; it always prompts.
 *
 * Exit codes: 0 = ok; 1 = action failed; 2 = bad/missing arguments.
 */
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");


function argVal(name) {
  const pref = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(pref));
  return hit ? hit.slice(pref.length) : "";
}
const hasFlag = (name) => process.argv.includes(`--${name}`);

/** The dashboard's upstream repo — override with --repo. */
const DEFAULT_REPO = "https://github.com/yuhin-chiu/local-token-usage";

function die(msg) {
  process.stderr.write(`install: ${msg}\n`);
  process.exit(2);
}

function out(...lines) {
  process.stdout.write(lines.concat("").join("\n"));
}

function readJson(file) {
  const s0 = fs.readFileSync(file, "utf8");
  const raw = s0.charCodeAt(0) === 0xfeff ? s0.slice(1) : s0;
  return JSON.parse(raw);
}

/** Write JSON as UTF-8 without a BOM, 2-space indent, trailing newline. */
function writeJson(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + "\n");
}

/**
 * Marker directory: --data-dir → $CLAUDE_PLUGIN_DATA → an existing local-usage-* data
 * dir → default. The fallback mirrors resolve.js's scan (the plugin was renamed
 * ai-usage → local-usage): when no env var is injected, reuse whichever
 * local-usage-* dir already holds a marker (or the first one) so the marker lands
 * where resolve.js will look — avoiding a stray, never-read `local-usage-local-usage`.
 */
function markerDir() {
  const explicit = argVal("data-dir");
  if (explicit) return explicit;
  if (process.env.CLAUDE_PLUGIN_DATA) return process.env.CLAUDE_PLUGIN_DATA;

  const dataRoot = path.join(os.homedir(), ".claude", "plugins", "data");
  try {
    const dirs = fs
      .readdirSync(dataRoot)
      .filter((d) => d.startsWith("local-usage-"))
      .sort();
    const withMarker = dirs.find((d) => {
      try {
        return fs.statSync(path.join(dataRoot, d, "install-path")).isFile();
      } catch {
        return false;
      }
    });
    const pick = withMarker || dirs[0];
    if (pick) return path.join(dataRoot, pick);
  } catch {
    /* no data dir → fall through to default */
  }
  return path.join(dataRoot, "local-usage-local-usage");
}

function writeMarker() {
  const installDir = argVal("install-dir");
  if (!installDir) die("write-marker: missing --install-dir=<dir>");
  const dir = markerDir();
  fs.mkdirSync(dir, { recursive: true });
  const mp = path.join(dir, "install-path");
  fs.writeFileSync(mp, installDir); // plain path, no newline, no BOM
  out(`MARKER_DIR=${dir}`, `MARKER_PATH=${mp}`, `WROTE=yes`);
}

function writeConfig() {
  const installDir = argVal("install-dir");
  if (!installDir) die("write-config: missing --install-dir=<dir>");
  const cfgPath = path.join(installDir, "local-usage.config.json");

  // Upsert: start from the existing file if present/valid, else a fresh object.
  let cfg = {};
  try {
    cfg = readJson(cfgPath);
  } catch {
    cfg = {};
  }
  if (!("version" in cfg)) cfg.version = 1;

  const sources = argVal("sources");
  if (sources) {
    cfg.enabledSources = sources
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  const portRaw = argVal("port");
  if (portRaw) {
    const p = Number(portRaw);
    cfg.port = Number.isInteger(p) && p > 0 && p < 65536 ? p : 3002;
  }
  const rm = argVal("run-mode");
  if (rm) cfg.runMode = rm;

  writeJson(cfgPath, cfg);
  out(`CONFIG_PATH=${cfgPath}`, `WROTE=yes`, `RUN_MODE=${cfg.runMode || ""}`);
}

function syncConfig() {
  const installDir = argVal("install-dir");
  if (!installDir) die("sync-config: missing --install-dir=<dir>");
  const cfgPath = path.join(installDir, "local-usage.config.json");
  const tplPath = path.join(installDir, "local-usage.config.example.json");

  let cfg;
  try {
    cfg = readJson(cfgPath);
  } catch {
    // No/invalid config → this is update 4a territory (full first-time flow), which
    // the command drives. Report it and stop cleanly rather than inventing a config.
    out(`SYNCED=no-config`, `RUN_MODE=`);
    return;
  }

  let changed = false;
  try {
    const tpl = readJson(tplPath);
    for (const k of Object.keys(tpl)) {
      if (!(k in cfg)) {
        cfg[k] = tpl[k];
        changed = true;
      }
    }
  } catch {
    // No template shipped (older install) → nothing to top up; not an error.
  }
  if (changed) writeJson(cfgPath, cfg);

  out(`SYNCED=${changed ? "topped-up" : "complete"}`, `RUN_MODE=${cfg.runMode || ""}`);
}

function dirExists(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** Last n lines of a captured stream, for surfacing why a build failed. */
function tail(s, n) {
  return s.split("\n").slice(-n).join("\n") + "\n";
}

function cloneRepo() {
  const installDir = argVal("install-dir");
  if (!installDir) die("clone: missing --install-dir=<dir>");
  const repo = argVal("repo") || DEFAULT_REPO;

  // Already a git-cloned install → don't re-clone; the command pulls instead.
  if (dirExists(installDir) && dirExists(path.join(installDir, ".git"))) {
    out(`CLONED=skipped-exists`, `INSTALL_DIR=${installDir}`);
    return;
  }

  // Progress goes to stderr (inherited so the user sees it); stdout stays clean
  // for our KEY=VALUE line.
  const r = spawnSync(`git clone "${repo}" "${installDir}"`, {
    shell: true,
    stdio: ["ignore", "ignore", "inherit"],
  });
  if (r.status === 0) {
    out(`CLONED=yes`, `INSTALL_DIR=${installDir}`);
  } else {
    out(`CLONED=fail`);
    process.exit(1);
  }
}

function pullRepo() {
  const installDir = argVal("install-dir");
  if (!installDir) die("pull: missing --install-dir=<dir>");
  if (hasFlag("no-pull")) {
    out(`PULLED=no`, `PULL=skipped`);
    return;
  }

  const git = (a) => spawnSync(`git ${a}`, { shell: true, cwd: installDir, encoding: "utf8" });
  const rev = (a) => (git(a).stdout || "").trim();

  if (git("fetch").status !== 0) {
    // Offline / fetch failed — don't block the update, just skip pulling.
    out(`PULLED=no`, `PULL=offline`);
    return;
  }
  const local = rev("rev-parse @");
  const remote = rev('rev-parse "@{u}"');
  const base = rev('merge-base @ "@{u}"');

  if (!remote) return out(`PULLED=no`, `PULL=no-upstream`);
  if (local === remote) return out(`PULLED=no`, `PULL=up-to-date`);
  if (local === base) {
    // Strictly behind → fast-forward only (never a merge commit).
    const ok = git("merge --ff-only").status === 0;
    return out(`PULLED=${ok ? "yes" : "no"}`, `PULL=${ok ? "fast-forwarded" : "ff-failed"}`);
  }
  // Ahead of / diverged from upstream → leave local commits alone.
  out(`PULLED=no`, `PULL=diverged`);
}

/**
 * Version-lockstep: pin the dashboard to the tag matching the plugin's version.
 *
 * The plugin's own version (`.claude-plugin/plugin.json`, one level up from this
 * script's dir) is the single source of truth for which dashboard commit to run:
 * v<version>. When the checkout already sits on that commit we do nothing — no
 * network, no build — so re-running /update with an unchanged plugin is a true
 * no-op. When the tag isn't published yet (the current reality: the dashboard repo
 * has no tags), we fall back to the plain `pull` (follow main), so behaviour is
 * unchanged on tagless repos and upgrades automatically once tags exist.
 */
function pluginVersion() {
  const manifest = path.join(__dirname, "..", ".claude-plugin", "plugin.json");
  const v = String(readJson(manifest).version || "").trim();
  if (!/^\d+\.\d+\.\d+/.test(v)) throw new Error(`bad plugin version: ${v || "(none)"}`);
  return v;
}

function syncCode() {
  const installDir = argVal("install-dir");
  if (!installDir) die("sync-code: missing --install-dir=<dir>");
  const noPull = hasFlag("no-pull");

  if (!dirExists(path.join(installDir, ".git"))) {
    out(`CODE_STATE=error`, `CODE_CHANGED=false`, `WARNING=not-a-git-clone`);
    process.exit(1);
  }

  let targetTag;
  try {
    targetTag = "v" + pluginVersion();
  } catch (e) {
    out(`CODE_STATE=error`, `CODE_CHANGED=false`, `WARNING=${e.message}`);
    process.exit(1);
  }

  const git = (a) => spawnSync(`git ${a}`, { shell: true, cwd: installDir, encoding: "utf8" });
  const rev = (a) => (git(a).stdout || "").trim();
  const tagCommit = () => rev(`rev-parse -q --verify "${targetTag}^{commit}"`);

  const head = rev("rev-parse HEAD");

  // Already on the target commit → the whole point: zero network, zero build.
  let target = tagCommit();
  if (target && target === head) {
    out(
      `CODE_STATE=current`,
      `CODE_CHANGED=false`,
      `TARGET_TAG=${targetTag}`,
      `NETWORK_USED=false`,
      `WARNING=`
    );
    return;
  }

  // Dev-machine guard: never disturb uncommitted work or local commits.
  const dirty = rev("status --porcelain") !== "";
  if (dirty) {
    out(
      `CODE_STATE=protected`,
      `CODE_CHANGED=false`,
      `TARGET_TAG=${targetTag}`,
      `NETWORK_USED=false`,
      `WARNING=dirty-worktree`
    );
    return;
  }
  const ahead = Number(rev('rev-list --count "@{u}..HEAD"')) || 0;
  if (ahead > 0) {
    out(
      `CODE_STATE=protected`,
      `CODE_CHANGED=false`,
      `TARGET_TAG=${targetTag}`,
      `NETWORK_USED=false`,
      `WARNING=local-commits`
    );
    return;
  }

  // Tag not present locally and network allowed → fetch tags and re-check.
  let networkUsed = false;
  if (!target && !noPull) {
    networkUsed = true;
    if (git("fetch --tags").status === 0) target = tagCommit();
  }

  // Target tag resolved → detach onto it (deterministic, version-pinned).
  if (target) {
    const ok = git(`checkout --detach ${target}`).status === 0;
    if (!ok) {
      out(`CODE_STATE=error`, `CODE_CHANGED=false`, `TARGET_TAG=${targetTag}`,
        `NETWORK_USED=${networkUsed}`, `WARNING=checkout-failed`);
      process.exit(1);
    }
    out(
      `CODE_STATE=updated`,
      `CODE_CHANGED=true`,
      `TARGET_TAG=${targetTag}`,
      `NETWORK_USED=${networkUsed}`,
      `WARNING=`
    );
    return;
  }

  // Tag still unavailable (not published yet) → fall back to plain pull on main,
  // so tagless repos behave exactly as before and upgrade once a tag is published.
  pullFallback(installDir, noPull, targetTag);
}

/** Shared fallback used by sync-code when the version tag isn't published. */
function pullFallback(installDir, noPull, targetTag) {
  const git = (a) => spawnSync(`git ${a}`, { shell: true, cwd: installDir, encoding: "utf8" });
  const rev = (a) => (git(a).stdout || "").trim();

  const warn = `target-tag-${targetTag}-not-published-using-main`;

  if (noPull) {
    // No tag, offline → nothing safe to pin to; leave the checkout untouched.
    out(`CODE_STATE=fallback`, `CODE_CHANGED=false`, `TARGET_TAG=${targetTag}`,
      `NETWORK_USED=false`, `WARNING=${warn}-offline-noop`);
    return;
  }

  if (git("fetch").status !== 0) {
    out(`CODE_STATE=fallback`, `CODE_CHANGED=false`, `TARGET_TAG=${targetTag}`,
      `NETWORK_USED=true`, `WARNING=${warn}-fetch-offline`);
    return;
  }
  const local = rev("rev-parse @");
  const remote = rev('rev-parse "@{u}"');
  const base = rev('merge-base @ "@{u}"');

  if (!remote || local === remote) {
    out(`CODE_STATE=fallback`, `CODE_CHANGED=false`, `TARGET_TAG=${targetTag}`,
      `NETWORK_USED=true`, `WARNING=${warn}`);
    return;
  }
  if (local === base) {
    const ok = git("merge --ff-only").status === 0;
    out(`CODE_STATE=fallback`, `CODE_CHANGED=${ok}`, `TARGET_TAG=${targetTag}`,
      `NETWORK_USED=true`, `WARNING=${warn}`);
    return;
  }
  // Diverged → leave local commits alone.
  out(`CODE_STATE=fallback`, `CODE_CHANGED=false`, `TARGET_TAG=${targetTag}`,
    `NETWORK_USED=true`, `WARNING=${warn}-diverged`);
}

function buildApp() {
  const installDir = argVal("install-dir");
  if (!installDir) die("build: missing --install-dir=<dir>");
  const force = hasFlag("force");

  const haveDeps = dirExists(path.join(installDir, "node_modules"));
  const haveBuild = dirExists(path.join(installDir, ".next"));
  if (!force && haveDeps && haveBuild) {
    out(`BUILT=skipped`, `REASON=artifacts-present`);
    return;
  }

  const npm = (a) => spawnSync(`npm ${a}`, { shell: true, cwd: installDir, encoding: "utf8" });

  const inst = npm("install");
  if (inst.status !== 0) {
    process.stderr.write(tail(inst.stderr || inst.stdout || "", 30));
    out(`BUILT=fail`, `STAGE=install`);
    process.exit(1);
  }
  const built = npm("run build");
  if (built.status !== 0) {
    process.stderr.write(tail(built.stderr || built.stdout || "", 30));
    out(`BUILT=fail`, `STAGE=build`);
    process.exit(1);
  }
  out(`BUILT=yes`);
}

const action = argVal("action");
switch (action) {
  case "write-marker":
    writeMarker();
    break;
  case "write-config":
    writeConfig();
    break;
  case "sync-config":
    syncConfig();
    break;
  case "clone":
    cloneRepo();
    break;
  case "pull":
    pullRepo();
    break;
  case "sync-code":
    syncCode();
    break;
  case "build":
    buildApp();
    break;
  default:
    die(
      `unknown --action=${action || "(none)"} ` +
        `(expected write-marker|write-config|sync-config|clone|pull|sync-code|build)`
    );
}
