#!/usr/bin/env node
/**
 * Cross-platform "open the dashboard in the default browser" for the
 * `local-usage` plugin's `/open` command.
 *
 * Replaces the three per-OS shell blocks (`open` / `xdg-open` / `Start-Process`)
 * that `open.md` used to carry with a single Node call that picks the right opener
 * from `process.platform`.
 *
 * Usage:
 *   node open-browser.js --port=<port> [--path=/dashboard] [--dry-run]
 *
 *   --port     required; the dashboard port (the command reads it from resolve.js).
 *   --path     URL path to open (default: /dashboard).
 *   --dry-run  print the opener command that WOULD run, then exit 0 without
 *              spawning anything. Used for cross-platform regression checks.
 *
 * Output — plain KEY=VALUE lines on stdout (same protocol as resolve.js):
 *   URL=http://localhost:<port><path>
 *   OPENER=<argv joined by spaces>          (the command chosen for this platform)
 *   OPENED=yes|dry-run                      (yes = actually spawned; dry-run = not)
 *
 * Side effect: launches the OS default browser. This is intentional and harmless
 * (the user invoked /open), which is why the plugin's PreToolUse hook auto-approves
 * this script — see hooks/allow.js.
 */
"use strict";

const { spawn } = require("node:child_process");

function argVal(name, fallback) {
  const pref = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(pref));
  return hit ? hit.slice(pref.length) : fallback;
}
const hasFlag = (name) => process.argv.includes(`--${name}`);

const port = argVal("port", "");
const urlPath = argVal("path", "/dashboard");
const dryRun = hasFlag("dry-run");

if (!port) {
  process.stderr.write("open-browser: missing required --port=<port>\n");
  process.exit(2);
}

const url = `http://localhost:${port}${urlPath}`;

// Pick the platform's default-browser opener. On Windows we go through
// `cmd /c start "" <url>` — `start` is a shell builtin, and the empty "" is the
// window-title argument so a quoted URL isn't mistaken for the title.
let cmd;
let args;
switch (process.platform) {
  case "darwin":
    cmd = "open";
    args = [url];
    break;
  case "win32":
    cmd = "cmd";
    args = ["/c", "start", "", url];
    break;
  default: // linux and other unixes
    cmd = "xdg-open";
    args = [url];
    break;
}

const opener = [cmd, ...args].join(" ");

function emit(opened) {
  process.stdout.write([`URL=${url}`, `OPENER=${opener}`, `OPENED=${opened}`, ""].join("\n"));
}

if (dryRun) {
  emit("dry-run");
  process.exit(0);
}

const child = spawn(cmd, args, { stdio: "ignore", detached: true });
child.on("error", (err) => {
  process.stderr.write(`open-browser: failed to launch (${err.message})\n`);
  process.exit(1);
});
child.unref();
emit("yes");
