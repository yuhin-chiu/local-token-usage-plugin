#!/usr/bin/env node
/**
 * Read-only detection of which coding-agent session stores exist on this machine,
 * used to seed the source picker in `/init` and `/update`'s first-time config flow
 * (replaces the bash+PowerShell "check ~/.claude/projects and ~/.codex/sessions"
 * double-write). It only stat()s two directories — nothing is written — so it's
 * safe to auto-approve via hooks/allow.js.
 *
 * Output — KEY=VALUE lines on stdout (resolve.js protocol):
 *   CLAUDE_CODE=yes|no    is ~/.claude/projects present?
 *   CODEX=yes|no          is ~/.codex/sessions present?
 *   DETECTED=<csv>        the enabledSources defaults to recommend (may be empty)
 */
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

const home = os.homedir();
const claudeCode = isDir(path.join(home, ".claude", "projects"));
const codex = isDir(path.join(home, ".codex", "sessions"));

const detected = [claudeCode && "claude-code", codex && "codex"].filter(Boolean);

process.stdout.write(
  [
    `CLAUDE_CODE=${claudeCode ? "yes" : "no"}`,
    `CODEX=${codex ? "yes" : "no"}`,
    `DETECTED=${detected.join(",")}`,
    "",
  ].join("\n")
);
