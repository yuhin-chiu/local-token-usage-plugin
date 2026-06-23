# ai-usage plugin

Local AI token & cost dashboard for Claude Code + Codex CLI.

Reads session files directly from your machine — no data ever leaves.

## Requirements

- Node.js 18+
- Git
- PM2 (`npm install -g pm2`)

## Install via Claude Code marketplace

**Step 1 — Register the marketplace:**
```
/plugin marketplace add https://github.com/yuhin-chiu/local-token-usage-plugin.git#main
```

**Step 2 — Install the plugin:**
```
/plugin install ai-usage
```

## Commands

| Command | Description |
|---------|-------------|
| `/ai-usage:init` | One-time install: clones dashboard, builds, starts via PM2 |
| `/ai-usage:start` | Start the dashboard service |
| `/ai-usage:stop` | Stop the dashboard service |
| `/ai-usage:status` | Check if dashboard is running |
| `/ai-usage:open` | Open dashboard in browser |
| `/ai-usage:query` | Show today's usage inline in chat (no browser needed) |

## Dashboard

After `/ai-usage:init`, the dashboard runs at `http://localhost:3002/dashboard`.

Source: [yuhin-chiu/local-token-usage](https://github.com/yuhin-chiu/local-token-usage)
