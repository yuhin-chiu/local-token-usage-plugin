Check whether the AI Usage dashboard is running.

---

## Step 1: Check PM2

```bash
pm2 list
```

Look for a process named `ai-usage` in the output.

**If status is `online`:**
> "✓ AI Usage Dashboard is running at http://localhost:3002/dashboard
>
> Use `/ai-usage:open` to open it, or `/ai-usage:query` to see today's usage inline."

**If status is `stopped`:**
> "✗ Dashboard is stopped. Use `/ai-usage:start` to start it."

**If process is not listed at all:**
> "✗ No ai-usage process found in PM2. Run `/ai-usage:init` to install and register it."
