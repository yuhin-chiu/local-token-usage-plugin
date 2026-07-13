#!/usr/bin/env node
/**
 * Start/stop the `local-usage` dashboard service — the disk-mutating half of the
 * `/start` and `/stop` commands.
 *
 * Replaces the three per-mode × per-OS shell blocks in start.md / stop.md
 * (global pm2 / project npx pm2 / no-PM2 nohup|Start-Process|lsof|Get-NetTCPConnection)
 * with one cross-platform Node implementation. Platform differences (spawning a
 * detached process, killing by port) are collapsed into a single place here.
 *
 * Usage:
 *   node service.js --action=start|stop --install-dir=<dir> --port=<port> [--mode=global|npx|none] [--dry-run]
 *
 *   --action       required; start or stop.
 *   --install-dir  required; the resolved install directory (cwd for npx/next).
 *   --port         required; the dashboard port.
 *   --mode         optional; force a run mode. Default: auto-detect
 *                  (global pm2 → project npx pm2 → no-PM2), matching start.md.
 *   --dry-run      print the command(s) that WOULD run, then exit 0 without
 *                  mutating anything. Used for cross-platform regression.
 *
 * Output — plain KEY=VALUE lines on stdout (same protocol as resolve.js):
 *   ACTION=start|stop
 *   MODE=global|npx|none
 *   CMD=<the primary command chosen for this mode/platform>
 *   PM2_STATE=online|stopped|absent|n/a   (n/a in no-PM2 mode)
 *   PORT_LISTENING=yes|no                 post-action port probe (source of truth)
 *   RESULT=ok|fail|dry-run
 *
 * This script MUTATES system state (starts/stops processes) — so, per the plugin's
 * script contract (§6), it is deliberately NOT in the hooks/allow.js allowlist and
 * always goes through the normal confirmation prompt.
 *
 * Exit codes: 0 = ok / dry-run; 1 = action ran but didn't reach the expected state;
 * 2 = bad/missing arguments.
 */
"use strict";

const net = require("node:net");
const { spawnSync, spawn } = require("node:child_process");

function argVal(name) {
  const pref = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(pref));
  return hit ? hit.slice(pref.length) : "";
}
const hasFlag = (name) => process.argv.includes(`--${name}`);

const action = argVal("action");
const installDir = argVal("install-dir");
const port = Number(argVal("port"));
const forcedMode = argVal("mode");
const dryRun = hasFlag("dry-run");

function die(msg) {
  process.stderr.write(`service: ${msg}\n`);
  process.exit(2);
}
if (action !== "start" && action !== "stop") die("--action must be start or stop");
if (!installDir) die("missing required --install-dir=<dir>");
if (!Number.isFinite(port) || port <= 0) die("missing/invalid required --port=<port>");
if (forcedMode && !["global", "npx", "none"].includes(forcedMode)) {
  die("--mode must be global, npx, or none");
}

const SHELL = { encoding: "utf8", shell: true, timeout: 8000 };

/** TCP connect probe — is anything listening on 127.0.0.1:<port>? (no spawn) */
function checkPort(p) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port: p });
    let done = false;
    const finish = (r) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(r);
    };
    socket.setTimeout(1000);
    socket.on("connect", () => finish(true));
    socket.on("timeout", () => finish(false));
    socket.on("error", () => finish(false));
  });
}

/**
 * Poll the port until it reaches `want` (start → listening, stop → free) or the
 * cap is hit. Returns the ACTUAL listening state (true = something is listening),
 * NOT whether it matched — callers need the real state to report PORT_LISTENING.
 */
async function waitForPort(p, want, tries = 20, gapMs = 500) {
  let listening = await checkPort(p);
  for (let i = 0; i < tries && listening !== want; i++) {
    await new Promise((r) => setTimeout(r, gapMs));
    listening = await checkPort(p);
  }
  return listening;
}

/** Detect run mode the same way start.md does: global pm2 → project npx pm2 → none. */
function detectMode(dir) {
  if (forcedMode) return forcedMode;
  const g = spawnSync("pm2 --version", SHELL);
  if (!g.error && g.status === 0) return "global";
  const n = spawnSync("npx --no pm2 --version", { ...SHELL, cwd: dir });
  if (!n.error && n.status === 0) return "npx";
  return "none";
}

/** Read the local-usage process status from `pm2 jlist` (mode: global|npx). */
function pm2State(mode, dir) {
  const listCmd = mode === "global" ? "pm2 jlist" : "npx --no pm2 jlist";
  const opts = mode === "global" ? SHELL : { ...SHELL, cwd: dir };
  const r = spawnSync(listCmd, opts);
  if (r.error || r.status !== 0) return "absent";
  let list;
  try {
    list = JSON.parse(r.stdout);
  } catch {
    const s = r.stdout.indexOf("[");
    const e = r.stdout.lastIndexOf("]");
    if (s >= 0 && e > s) {
      try {
        list = JSON.parse(r.stdout.slice(s, e + 1));
      } catch {
        /* unparseable */
      }
    }
  }
  if (!Array.isArray(list)) return "absent";
  const proc = list.find((p) => p && p.name === "local-usage");
  if (!proc) return "absent";
  return proc.pm2_env && proc.pm2_env.status === "online" ? "online" : "stopped";
}

// The primary command string for a given action/mode — also what --dry-run prints.
function primaryCmd(act, mode, dir, p) {
  if (act === "start") {
    if (mode === "global") return `pm2 start "${dir}/ecosystem.config.js"`;
    if (mode === "npx") return `npx pm2 start ecosystem.config.js  (cwd=${dir})`;
    return `npx next start -p ${p}  (detached, cwd=${dir})`;
  }
  // stop
  if (mode === "global") return "pm2 stop local-usage";
  if (mode === "npx") return `npx pm2 stop local-usage  (cwd=${dir})`;
  return killByPortCmd(p);
}

/** The platform-specific kill-by-port command (no-PM2 stop / npx fallback). */
function killByPortCmd(p) {
  if (process.platform === "win32") {
    return (
      `powershell -NoProfile -Command ` +
      `"$c=Get-NetTCPConnection -LocalPort ${p} -State Listen -EA SilentlyContinue|Select-Object -First 1;` +
      `if($c){Stop-Process -Id $c.OwningProcess -Force}"`
    );
  }
  return `kill $(lsof -ti :${p}) 2>/dev/null`;
}

function dirExists(d) {
  try {
    return require("node:fs").statSync(d).isDirectory();
  } catch {
    return false;
  }
}

function emit(mode, cmd, pm2, listening, result) {
  process.stdout.write(
    [
      `ACTION=${action}`,
      `MODE=${mode}`,
      `CMD=${cmd}`,
      `PM2_STATE=${pm2}`,
      `PORT_LISTENING=${listening}`,
      `RESULT=${result}`,
      "",
    ].join("\n")
  );
}

async function doStart(mode) {
  if (mode === "global") {
    spawnSync(`pm2 start "${installDir}/ecosystem.config.js"`, SHELL);
  } else if (mode === "npx") {
    spawnSync("npx pm2 start ecosystem.config.js", { ...SHELL, cwd: installDir });
  } else {
    // no-PM2: launch next detached so it outlives this script. shell:true lets
    // Windows find npx.cmd; detached + unref + ignored stdio fully backgrounds it.
    const child = spawn("npx", ["next", "start", "-p", String(port)], {
      cwd: installDir,
      detached: true,
      stdio: "ignore",
      shell: true,
    });
    child.unref();
  }
  const listening = await waitForPort(port, true);
  const pm2 = mode === "none" ? "n/a" : pm2State(mode, installDir);
  return { listening };
}

async function doStop(mode) {
  let effMode = mode;
  if (mode === "global") {
    spawnSync("pm2 stop local-usage", SHELL);
  } else if (mode === "npx" && dirExists(installDir)) {
    spawnSync("npx pm2 stop local-usage", { ...SHELL, cwd: installDir });
  } else {
    // no-PM2, or npx with a missing install dir → kill by port. The service is
    // bound to the port either way, so this reliably stops it.
    effMode = "none";
    spawnSync(killByPortCmd(port), SHELL);
  }
  const listening = await waitForPort(port, false);
  return { listening, effMode };
}

(async () => {
  const mode = detectMode(installDir);
  const cmd = primaryCmd(action, mode, installDir, port);

  if (dryRun) {
    emit(mode, cmd, mode === "none" ? "n/a" : "unknown", "unknown", "dry-run");
    process.exit(0);
  }

  if (action === "start") {
    const { listening } = await doStart(mode);
    const pm2 = mode === "none" ? "n/a" : pm2State(mode, installDir);
    const ok = listening; // port is the source of truth for "running"
    emit(mode, cmd, pm2, listening ? "yes" : "no", ok ? "ok" : "fail");
    process.exit(ok ? 0 : 1);
  } else {
    const { listening, effMode } = await doStop(mode);
    const pm2 = effMode === "none" ? "n/a" : pm2State(effMode, installDir);
    const ok = !listening && pm2 !== "online";
    emit(effMode, primaryCmd("stop", effMode, installDir, port), pm2, listening ? "yes" : "no", ok ? "ok" : "fail");
    process.exit(ok ? 0 : 1);
  }
})();
