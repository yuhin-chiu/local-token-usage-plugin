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
 * (clone / pull / build land in the second M4 batch.)
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


function argVal(name) {
  const pref = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(pref));
  return hit ? hit.slice(pref.length) : "";
}

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
  default:
    die(`unknown --action=${action || "(none)"} (expected write-marker|write-config|sync-config)`);
}
