Start the AI Usage dashboard service.

---

## Step 1: Start the process

```bash
pm2 start ai-usage
```

---

## Step 2: Confirm

```bash
pm2 list
```

If `ai-usage` status is `online`, tell the user:
> "✓ Dashboard started at http://localhost:3002/dashboard"

If it fails to start, show the logs:

```bash
pm2 logs ai-usage --lines 20 --nostream
```

If PM2 has no saved process named `ai-usage` (e.g. after a reboot), suggest running `/ai-usage:init` again to re-register it.
