#!/usr/bin/env node
/**
 * PreToolUse hook for the `local-usage` plugin.
 *
 * Auto-approves ONLY the specific, low-risk shell commands this plugin runs
 * (its own read-only resolve.js / pm2 / npx pm2 / npx next / cd / read-only git),
 * so users aren't prompted for routine dashboard start/stop/status/update work.
 *
 * IMPORTANT: this hook fires for EVERY Bash call in any session while the plugin
 * is enabled — not just calls from this plugin's slash commands. So it must stay
 * a tight allowlist and be SILENT for anything it doesn't explicitly recognize
 * (silence = fall through to Claude Code's normal permission prompt). It never
 * denies and never broadens permissions for unrelated commands.
 */
"use strict";

const fs = require("fs");

/** Read-only git subcommands the plugin uses — safe to auto-approve globally. */
const GIT_READ = new Set([
  "fetch",
  "rev-parse",
  "status",
  "remote",
  "log",
  "branch",
  "show",
  "diff",
  "ls-files",
]);

/** True if a single command segment is one we're willing to auto-approve. */
function segmentAllowed(seg) {
  if (!seg) return false;

  // Directory change — harmless, and needed so compound commands like
  // `cd "<dir>" && npx pm2 start ...` can be approved as a whole.
  if (seg === "cd" || seg.startsWith("cd ")) return true;

  // The plugin's shared install-location resolver — a read-only Node script every
  // command runs in Step 0/1 to locate/validate the install. Match only THIS script
  // (the `scripts/resolve.js` under the plugin root, quoted or not), never `node`
  // in general, so unrelated `node <anything>` still falls through to a prompt.
  if (/^node\s+["']?[^"']*[\\/]scripts[\\/]resolve\.js(["']|\s|$)/.test(seg)) return true;

  // The plugin's read-only usage reporter (the `query` command). Same tight match
  // as resolve.js — only THIS script, never `node <anything>` in general.
  if (/^node\s+["']?[^"']*[\\/]scripts[\\/]usage\.js(["']|\s|$)/.test(seg)) return true;

  // The plugin's browser opener (the `open` command). Launching the default
  // browser is a harmless side effect the user explicitly asked for via /open,
  // so auto-approve it — but, as above, ONLY this exact script.
  if (/^node\s+["']?[^"']*[\\/]scripts[\\/]open-browser\.js(["']|\s|$)/.test(seg)) return true;

  // pm2 process manager (global) and via npx (project-level).
  if (seg === "pm2" || seg.startsWith("pm2 ")) return true;
  if (seg.startsWith("npx pm2 ") || seg.startsWith("npx --no pm2 ")) return true;

  // no-PM2 mode starts the dashboard with `npx next start -p <port>`.
  if (seg.startsWith("npx next ")) return true;

  // git: read-only subcommands only. Mutations (pull/merge/clone/checkout/reset)
  // deliberately fall through to the normal prompt.
  const g = seg.match(/^git\s+(\S+)/);
  if (g && GIT_READ.has(g[1])) return true;

  return false;
}

function main() {
  let cmd = "";
  try {
    const input = JSON.parse(fs.readFileSync(0, "utf8"));
    cmd = ((input && input.tool_input && input.tool_input.command) || "").trim();
  } catch {
    // Malformed / missing input — decide nothing, let the normal flow handle it.
    return;
  }
  if (!cmd) return;

  // Split into segments on shell separators (&& || ; | and newlines) so a
  // compound command is approved only if EVERY segment is individually allowed.
  // This prevents `cd x && rm -rf y` from being auto-approved via the `cd`.
  const segments = cmd
    .split(/\s*(?:&&|\|\||;|\||\n)\s*/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (segments.length > 0 && segments.every(segmentAllowed)) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "allow",
          permissionDecisionReason:
            "local-usage: auto-approved dashboard command (resolve.js / usage.js / open-browser.js / pm2 / npx next / read-only git / cd)",
        },
      })
    );
  }
  // Otherwise: no output → normal permission prompt applies.
}

main();
