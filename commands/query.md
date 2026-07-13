Show AI token usage inline in the conversation. No browser needed — reads session files directly from the local machine.

Accepts an optional argument:
- `/local-usage:query` or `/local-usage:query today` — today only (default)
- `/local-usage:query yesterday` — yesterday only
- `/local-usage:query 7d` — last 7 days
- `/local-usage:query 30d` — last 30 days

---

## Step 1: Parse the argument

Read the argument the user passed (if any). Map it to a date range:

| Argument | `FROM` (inclusive) | `TO` (inclusive) |
|---|---|---|
| `today` or none | today | today |
| `yesterday` | yesterday | yesterday |
| `7d` | 6 days ago | today |
| `30d` | 29 days ago | today |

Compute `FROM` and `TO` as `YYYY-MM-DD` strings.

---

## Step 2: Run the usage script

All the counting/pricing logic lives in the shared, cross-platform Node script
`scripts/usage.js` (it reads `~/.claude/projects` + `~/.codex/sessions`). Run it with
the dates from Step 1 — it prints the same formatted table inline, no browser:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/usage.js" --from=FROM_DATE --to=TO_DATE
```

Substitute `FROM_DATE` and `TO_DATE` with the actual `YYYY-MM-DD` strings before running.
(For a machine-readable object instead of the table, add `--format=json`.)

---

## Step 3: Display the result

Show the script output to the user in a code block. Then add:
> "For full breakdown by model and daily trend, run `/local-usage:open`."

If either source shows 0 tokens and the user expects data, suggest checking:
- Claude Code: `~/.claude/projects/` exists and contains `.jsonl` files
- Codex CLI: `~/.codex/sessions/` exists and contains `.jsonl` files
