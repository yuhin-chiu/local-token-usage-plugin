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
 *       --data-dir → $CLAUDE_PLUGIN_DATA → canonical ~/.claude/plugins/data/
 *       local-usage-local-usage (the same fallback resolve.js reads — §5/D3).
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

/** Marker directory: --data-dir → $CLAUDE_PLUGIN_DATA → canonical (matches resolve.js). */
function markerDir() {
  const explicit = argVal("data-dir");
  if (explicit) return explicit;
  if (process.env.CLAUDE_PLUGIN_DATA) return process.env.CLAUDE_PLUGIN_DATA;
  return path.join(os.homedir(), ".claude", "plugins", "data", "local-usage-local-usage");
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
  case "build":
    buildApp();
    break;
  default:
    die(
      `unknown --action=${action || "(none)"} ` +
        `(expected write-marker|write-config|sync-config|clone|pull|build)`
    );
}
