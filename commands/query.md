Show today's AI token usage inline in the conversation. No browser needed — reads session files directly from the local machine.

---

## Step 1: Run the usage script

Run the following Node.js script in the terminal. It reads `~/.claude/projects/` and `~/.codex/sessions/` and prints a usage summary.

```bash
node -e "
const fs = require('fs');
const path = require('path');
const os = require('os');

const TODAY = new Date().toISOString().slice(0, 10);

// --- Pricing table ($/token) ---
const M = 1_000_000;
const PRICES = {
  'claude-opus-4':    { i: 15/M, o: 75/M,  cc: 18.75/M, cr: 1.5/M  },
  'claude-sonnet-4':  { i: 3/M,  o: 15/M,  cc: 3.75/M,  cr: 0.3/M  },
  'claude-haiku-4':   { i: 1/M,  o: 5/M,   cc: 1.25/M,  cr: 0.1/M  },
  'claude-3-5-sonnet':{ i: 3/M,  o: 15/M,  cc: 3.75/M,  cr: 0.3/M  },
  'claude-3-5-haiku': { i: 0.8/M,o: 4/M,   cc: 1/M,     cr: 0.08/M },
  'gpt-5':            { i: 1.25/M,o: 10/M,  cc: 0,       cr: 0.125/M},
  'o3':               { i: 2/M,  o: 8/M,   cc: 0,       cr: 0.5/M  },
  'o3-mini':          { i: 1.1/M,o: 4.4/M, cc: 0,       cr: 0.55/M },
  'o4-mini':          { i: 1.1/M,o: 4.4/M, cc: 0,       cr: 0.275/M},
};
const FALLBACK = { i: 3/M, o: 15/M, cc: 3.75/M, cr: 0.3/M };

function getPrice(model) {
  if (!model) return FALLBACK;
  const m = model.toLowerCase();
  for (const [k, v] of Object.entries(PRICES)) {
    if (m.startsWith(k) || m.includes(k)) return v;
  }
  if (m.includes('opus'))   return PRICES['claude-opus-4'];
  if (m.includes('sonnet')) return PRICES['claude-sonnet-4'];
  if (m.includes('haiku'))  return PRICES['claude-haiku-4'];
  if (m.includes('gpt-5') || m.includes('codex')) return PRICES['gpt-5'];
  return FALLBACK;
}

// --- Walk directory ---
function walkJsonl(dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.jsonl')) files.push(p);
    }
  }
  walk(dir);
  return files;
}

// --- Claude Code ---
let claudeTokens = 0, claudeCost = 0;
const seen = new Set();
for (const f of walkJsonl(path.join(os.homedir(), '.claude', 'projects'))) {
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      if (obj.type !== 'assistant') continue;
      const ts = obj.timestamp || obj.ts || '';
      if (!ts.startsWith(TODAY)) continue;
      const id = obj.message?.id || obj.requestId || '';
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      const u = obj.message?.usage || {};
      const inp  = u.input_tokens || 0;
      const out  = u.output_tokens || 0;
      const cc   = u.cache_creation_input_tokens || 0;
      const cr   = u.cache_read_input_tokens || 0;
      claudeTokens += inp + out + cc + cr;
      const p = getPrice(obj.message?.model);
      claudeCost += inp*p.i + out*p.o + cc*p.cc + cr*p.cr;
    } catch {}
  }
}

// --- Codex CLI ---
let codexTokens = 0, codexCost = 0;
const codexDir = path.join(os.homedir(), '.codex', 'sessions');
for (const f of walkJsonl(codexDir)) {
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      const ts = obj.timestamp || obj.ts || '';
      if (obj.type === 'event_msg' && obj.payload?.type === 'token_count' && ts.startsWith(TODAY)) {
        const delta = obj.payload?.info?.last_token_usage?.total_tokens || 0;
        codexTokens += delta;
        codexCost += delta * FALLBACK.i;
      }
    } catch {}
  }
}

// --- Format ---
function fmt(n) {
  if (n >= 1e9) return (n/1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n/1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n/1e3).toFixed(1) + 'K';
  return String(n);
}
function fmtCost(c) { return '\$' + c.toFixed(4); }

const total = claudeTokens + codexTokens;
const totalCost = claudeCost + codexCost;

console.log('');
console.log('AI Usage · Today (' + TODAY + ')');
console.log('─'.repeat(44));
console.log('Source        Tokens        Cost');
console.log('─'.repeat(44));
console.log('Claude Code   ' + fmt(claudeTokens).padEnd(14) + fmtCost(claudeCost));
console.log('Codex CLI     ' + fmt(codexTokens).padEnd(14) + fmtCost(codexCost));
console.log('─'.repeat(44));
console.log('Total         ' + fmt(total).padEnd(14) + fmtCost(totalCost));
console.log('');
"
```

---

## Step 2: Display the result

Copy the script output and display it to the user in a code block. Then add one line:
> "For full breakdown by model and daily trend, run `/ai-usage:open`."

If either source shows 0 tokens and the user expects data, suggest checking:
- Claude Code: `~/.claude/projects/` exists and contains `.jsonl` files
- Codex CLI: `~/.codex/sessions/` exists and contains `.jsonl` files
