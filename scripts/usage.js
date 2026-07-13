#!/usr/bin/env node
/**
 * usage.js — 本地 AI token / 成本用量统计（只读）
 *
 * 走 ~/.claude/projects 和 ~/.codex/sessions 下的 .jsonl 会话文件，按日期区间
 * 统计 Claude Code + Codex CLI 的 token 与成本。逻辑从 commands/query.md 的内嵌
 * node -e 原样抽出，唯一区别是日期区间改由命令行参数传入（而非字符串替换）。
 *
 * 用法：
 *   node usage.js --from=YYYY-MM-DD --to=YYYY-MM-DD [--format=text|json]
 *
 * 输出：
 *   --format=text（默认）：给人看的格式化终端表格（与历史 query 命令逐字节一致）。
 *   --format=json：单个 JSON 对象，供看板 / 程序消费。
 *
 * 退出码：0 成功；2 参数错误。
 * 只读脚本（不改磁盘状态）→ 可进 hooks/allow.js 白名单。跨平台（os/path，无双写）。
 */
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

// --- 参数解析（非交互，纯参数进出）---
function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const m = /^--([^=]+)=(.*)$/.exec(a);
    if (m) out[m[1]] = m[2];
  }
  return out;
}
const args = parseArgs(process.argv.slice(2));
const FROM = args.from || "";
const TO = args.to || "";
const FORMAT = args.format || "text";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
if (!DATE_RE.test(FROM) || !DATE_RE.test(TO)) {
  process.stderr.write(
    "usage.js: --from and --to are required as YYYY-MM-DD\n"
  );
  process.exit(2);
}

function inRange(ts) {
  const d = (ts || "").slice(0, 10);
  return d >= FROM && d <= TO;
}

// --- Pricing table ($/token) ---
const M = 1_000_000;
const PRICES = {
  "claude-opus-4": { i: 15 / M, o: 75 / M, cc: 18.75 / M, cr: 1.5 / M },
  "claude-sonnet-4": { i: 3 / M, o: 15 / M, cc: 3.75 / M, cr: 0.3 / M },
  "claude-haiku-4": { i: 1 / M, o: 5 / M, cc: 1.25 / M, cr: 0.1 / M },
  "claude-3-5-sonnet": { i: 3 / M, o: 15 / M, cc: 3.75 / M, cr: 0.3 / M },
  "claude-3-5-haiku": { i: 0.8 / M, o: 4 / M, cc: 1 / M, cr: 0.08 / M },
  "gpt-5": { i: 1.25 / M, o: 10 / M, cc: 0, cr: 0.125 / M },
  "o3": { i: 2 / M, o: 8 / M, cc: 0, cr: 0.5 / M },
  "o3-mini": { i: 1.1 / M, o: 4.4 / M, cc: 0, cr: 0.55 / M },
  "o4-mini": { i: 1.1 / M, o: 4.4 / M, cc: 0, cr: 0.275 / M },
};
const FALLBACK = { i: 3 / M, o: 15 / M, cc: 3.75 / M, cr: 0.3 / M };

function getPrice(model) {
  if (!model) return FALLBACK;
  const m = model.toLowerCase();
  for (const [k, v] of Object.entries(PRICES)) {
    if (m.startsWith(k) || m.includes(k)) return v;
  }
  if (m.includes("opus")) return PRICES["claude-opus-4"];
  if (m.includes("sonnet")) return PRICES["claude-sonnet-4"];
  if (m.includes("haiku")) return PRICES["claude-haiku-4"];
  if (m.includes("gpt-5") || m.includes("codex")) return PRICES["gpt-5"];
  return FALLBACK;
}

function walkJsonl(dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".jsonl")) files.push(p);
    }
  }
  walk(dir);
  return files;
}

// --- Claude Code ---
let claudeTokens = 0,
  claudeCost = 0;
const seen = new Set();
for (const f of walkJsonl(path.join(os.homedir(), ".claude", "projects"))) {
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      if (obj.type !== "assistant") continue;
      const ts = obj.timestamp || obj.ts || "";
      if (!inRange(ts)) continue;
      const id = obj.message?.id || obj.requestId || "";
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      const u = obj.message?.usage || {};
      const inp = u.input_tokens || 0;
      const out = u.output_tokens || 0;
      const cc = u.cache_creation_input_tokens || 0;
      const cr = u.cache_read_input_tokens || 0;
      claudeTokens += inp + out + cc + cr;
      const p = getPrice(obj.message?.model);
      claudeCost += inp * p.i + out * p.o + cc * p.cc + cr * p.cr;
    } catch {}
  }
}

// --- Codex CLI ---
let codexTokens = 0,
  codexCost = 0;
for (const f of walkJsonl(path.join(os.homedir(), ".codex", "sessions"))) {
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      const ts = obj.timestamp || obj.ts || "";
      if (
        obj.type === "event_msg" &&
        obj.payload?.type === "token_count" &&
        inRange(ts)
      ) {
        const delta = obj.payload?.info?.last_token_usage?.total_tokens || 0;
        codexTokens += delta;
        codexCost += delta * FALLBACK.i;
      }
    } catch {}
  }
}

const total = claudeTokens + codexTokens;
const totalCost = claudeCost + codexCost;

// --- JSON 输出（供程序 / 看板 / 将来 Codex 消费）---
if (FORMAT === "json") {
  process.stdout.write(
    JSON.stringify({
      from: FROM,
      to: TO,
      claude: { tokens: claudeTokens, cost: claudeCost },
      codex: { tokens: codexTokens, cost: codexCost },
      total: { tokens: total, cost: totalCost },
    }) + "\n"
  );
  process.exit(0);
}

// --- Text 输出（默认，给人看；与历史 query 命令逐字节一致）---
function fmt(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(n);
}
function fmtCost(c) {
  return "$" + c.toFixed(4);
}

const label = FROM === TO ? FROM : FROM + " ~ " + TO;

console.log("");
console.log("AI Usage · " + label);
console.log("─".repeat(44));
console.log("Source        Tokens        Cost");
console.log("─".repeat(44));
console.log("Claude Code   " + fmt(claudeTokens).padEnd(14) + fmtCost(claudeCost));
console.log("Codex CLI     " + fmt(codexTokens).padEnd(14) + fmtCost(codexCost));
console.log("─".repeat(44));
console.log("Total         " + fmt(total).padEnd(14) + fmtCost(totalCost));
console.log("");
