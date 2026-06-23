Stop the AI Usage dashboard service.

---

## Step 1: Stop the process

```bash
pm2 stop ai-usage
```

---

## Step 2: Confirm

```bash
pm2 list
```

If `ai-usage` status is `stopped`, tell the user:
> "✓ Dashboard stopped."

If the process is not found, tell the user:
> "No running ai-usage process found — it may already be stopped."
