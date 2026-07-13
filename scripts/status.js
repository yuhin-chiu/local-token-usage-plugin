#!/usr/bin/env node
/**
 * Read-only status probe for the `local-usage` plugin's `/status` command.
 *
 * Replaces the per-OS port check (`lsof` / `Get-NetTCPConnection`) and the manual
 * `pm2 list` reading in `status.md` with one cross-platform Node call.
 *
 * Usage:
 *   node status.js --port=<port> --install-dir=<dir>
 *
 *   --port         required; the dashboard port (the command reads it from resolve.js).
 *   --install-dir  required; the resolved install directory — used as the cwd when
 *                  probing project-level (`npx pm2`) mode.
 *
 * Output — plain KEY=VALUE lines on stdout (same protocol as resolve.js):
 *   PORT_LISTENING=yes|no          is something accepting connections on the port?
 *   PM2_MODE=global|npx|none       which PM2 is available (or neither)
 *   PM2_STATE=online|stopped|absent status of the `local-usage` process under that PM2
 *
 * PORT_LISTENING is the source of truth for "is the dashboard running": a plain TCP
 * connect to 127.0.0.1:<port>, no spawn, works identically on macOS/Linux/Windows.
 * PM2_MODE/PM2_STATE are supplementary detail so a *stopped* result can explain why.
 *
 * This script only PROBES — it connects to a port and reads `pm2 jlist`. It never
 * starts, stops, or writes anything, which is why the plugin's PreToolUse hook
 * auto-approves it (see hooks/allow.js). The pm2 child processes it spawns are
 * internal to this script — they don't go through the Bash tool, so they don't prompt.
 */
"use strict";

const net = require("node:net");
const { spawnSync } = require("node:child_process");

function argVal(name) {
  const pref = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(pref));
  return hit ? hit.slice(pref.length) : "";
}

const port = Number(argVal("port"));
const installDir = argVal("install-dir");

if (!Number.isFinite(port) || port <= 0) {
  process.stderr.write("status: missing/invalid required --port=<port>\n");
  process.exit(2);
}
if (!installDir) {
  process.stderr.write("status: missing required --install-dir=<dir>\n");
  process.exit(2);
}

/**
 * Is anything accepting TCP connections on 127.0.0.1:<port>?
 * A successful connect means "running"; refusal/timeout means "not".
 * (127.0.0.1 covers the common case — Next start binds all interfaces / IPv4.)
 */
function checkPort(p) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port: p });
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(1000);
    socket.on("connect", () => finish(true));
    socket.on("timeout", () => finish(false));
    socket.on("error", () => finish(false));
  });
}

/**
 * Probe PM2 with a single `jlist` (machine-readable). Try global first, then
 * project-level via npx (run from the install dir). Returns the mode plus the raw
 * jlist stdout so we parse the process list only once.
 */
function pm2Probe(dir) {
  const opts = { encoding: "utf8", shell: true, timeout: 5000 };

  const g = spawnSync("pm2 jlist", opts);
  if (!g.error && g.status === 0) return { mode: "global", out: g.stdout || "" };

  // cwd is passed as an option (not concatenated into the shell string), so a path
  // with spaces or shell metacharacters can't break out — and a missing dir just
  // makes this probe fail and fall through to "none".
  const n = spawnSync("npx --no pm2 jlist", { ...opts, cwd: dir });
  if (!n.error && n.status === 0) return { mode: "npx", out: n.stdout || "" };

  return { mode: "none", out: "" };
}

/** Parse `pm2 jlist` output → status of the `local-usage` process. */
function pm2State(mode, out) {
  if (mode === "none") return "absent";

  let list;
  try {
    list = JSON.parse(out);
  } catch {
    // pm2 sometimes prefixes log noise before the JSON — slice to the array.
    const s = out.indexOf("[");
    const e = out.lastIndexOf("]");
    if (s >= 0 && e > s) {
      try {
        list = JSON.parse(out.slice(s, e + 1));
      } catch {
        /* still unparseable → treat as no process */
      }
    }
  }
  if (!Array.isArray(list)) return "absent";

  const proc = list.find((p) => p && p.name === "local-usage");
  if (!proc) return "absent";
  const st = proc.pm2_env && proc.pm2_env.status;
  return st === "online" ? "online" : "stopped";
}

(async () => {
  const listening = await checkPort(port);
  const { mode, out } = pm2Probe(installDir);
  const state = pm2State(mode, out);

  process.stdout.write(
    [`PORT_LISTENING=${listening ? "yes" : "no"}`, `PM2_MODE=${mode}`, `PM2_STATE=${state}`, ""].join(
      "\n"
    )
  );
})();
