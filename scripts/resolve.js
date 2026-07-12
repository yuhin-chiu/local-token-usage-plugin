#!/usr/bin/env node
/**
 * Shared install-location resolver for the `local-usage` plugin.
 *
 * Single source of truth used by every command (init / update / start / stop /
 * status / open) to answer three questions the same way, on every OS:
 *   1. Where is the dashboard installed? (the persisted marker, else the default)
 *   2. Which port does it use? (from local-usage.config.json, else 3002)
 *   3. Is that install actually present and valid? (dir + package.json +
 *      ecosystem.config.js + .git)
 *
 * Output — plain KEY=VALUE lines on stdout (easy for the command to read and
 * substitute as <INSTALL_DIR> / <PORT>):
 *
 *   STATUS=FOUND|STALE|NONE
 *   INSTALL_DIR=<absolute path>
 *   PORT=<number>
 *   MARKER=env|canonical|none
 *   DIR_EXISTS=yes|no
 *   NODE_MAJOR=<number>
 *
 * NODE_MAJOR is the major version of the Node.js running this script. Since every
 * command already invokes Node here to locate the install, callers read it straight
 * from this output instead of spending a second `node --version` call (and prompt).
 *
 * STATUS semantics:
 *   FOUND  — INSTALL_DIR is a real, git-cloned dashboard install. Use it.
 *   STALE  — a marker was recorded but the path is missing or isn't a valid
 *            install (moved machines, renamed folder, hand-copied dir).
 *   NONE   — no marker recorded; INSTALL_DIR is the default ~/local-usage guess.
 *
 * DIR_EXISTS lets callers tell "the folder is gone" (offer to relocate) apart
 * from "the folder is there but not a real clone" (send the user to /init).
 *
 * This script only READS the filesystem — it never writes, clones, or mutates.
 */
"use strict";

const fs = require("fs");
const os = require("node:os");
const path = require("node:path");

const BOM = /^\uFEFF/;

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function readMarker(p) {
  try {
    return fs.readFileSync(p, "utf8").replace(BOM, "").trim();
  } catch {
    return "";
  }
}

// 1) Resolve the install directory from the persisted marker.
//    Prefer $CLAUDE_PLUGIN_DATA/install-path; fall back to the canonical
//    <plugin>-<marketplace> data path (covers hosts that don't inject the env
//    var). If neither yields a path, guess the default ~/local-usage.
const candidates = [];
if (process.env.CLAUDE_PLUGIN_DATA) {
  candidates.push([path.join(process.env.CLAUDE_PLUGIN_DATA, "install-path"), "env"]);
}
candidates.push([
  path.join(os.homedir(), ".claude", "plugins", "data", "local-usage-local-usage", "install-path"),
  "canonical",
]);

let installDir = "";
let marker = "none";
for (const [p, src] of candidates) {
  const val = readMarker(p);
  if (val) {
    installDir = val;
    marker = src;
    break;
  }
}
if (!installDir) {
  installDir = path.join(os.homedir(), "local-usage");
  marker = "none";
}

// 2) Read the port from the install's config (default 3002).
let port = 3002;
try {
  const cfgRaw = fs
    .readFileSync(path.join(installDir, "local-usage.config.json"), "utf8")
    .replace(BOM, "");
  const p = Number(JSON.parse(cfgRaw).port);
  if (Number.isFinite(p) && p > 0) port = p;
} catch {
  /* no/invalid config → keep default */
}

// 3) Validate the install.
const dirExists = isDir(installDir);
const valid =
  dirExists &&
  isFile(path.join(installDir, "package.json")) &&
  isFile(path.join(installDir, "ecosystem.config.js")) &&
  isDir(path.join(installDir, ".git"));

let status;
if (valid) status = "FOUND";
else if (marker !== "none") status = "STALE";
else status = "NONE";

const nodeMajor = Number((process.versions.node || "0").split(".")[0]) || 0;

process.stdout.write(
  [
    `STATUS=${status}`,
    `INSTALL_DIR=${installDir}`,
    `PORT=${port}`,
    `MARKER=${marker}`,
    `DIR_EXISTS=${dirExists ? "yes" : "no"}`,
    `NODE_MAJOR=${nodeMajor}`,
    "",
  ].join("\n")
);
