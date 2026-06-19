# Slack alerts for GümrükYZ production

Production `/api/ready` runs every **15 minutes** (Vercel cron). When thresholds are exceeded and the request includes `Authorization: Bearer <CRON_SECRET>`, an alert is posted to Slack.

**On-call contact:** veysel.sundu@gmail.com

## 1. Create a Slack incoming webhook

1. Open [Slack API — Your Apps](https://api.slack.com/apps) → **Create New App** → **From scratch**
   - App name: `GümrükYZ Alerts`
   - Workspace: your team workspace
2. **Incoming Webhooks** → toggle **On** → **Add New Webhook to Workspace**
3. Pick a channel, e.g. `#gumrukyz-alerts` (create the channel first if needed)
4. Copy the webhook URL (format: `https://hooks.slack.com/services/T…/B…/…` — paste the full URL from Slack, do not commit it to git)

## 2. Local test

Add to `apps/web/.env.local`:

```env
SLACK_WEBHOOK_URL=<paste-from-slack-incoming-webhooks>
ALERT_NOTIFY_EMAIL=veysel.sundu@gmail.com
```

Run:

```bash
node scripts/test-slack-alert.mjs
```

You should see a formatted message in Slack with a test alert line.

## 3. Production (Vercel)

```bash
cd apps/web
vercel env add SLACK_WEBHOOK_URL production --value "<paste-from-slack>" --yes --force
vercel env add ALERT_NOTIFY_EMAIL production --value "veysel.sundu@gmail.com" --yes --force
vercel deploy --prod -y
```

`CRON_SECRET` must already be set — Vercel sends it as `Authorization: Bearer` on cron hits.

## What triggers an alert

Cron calls `/api/ready` with cron auth. Alerts fire when any threshold is exceeded:

| Metric | Default threshold |
|--------|-------------------|
| Queue depth | > 50 |
| Stuck jobs | > 5 |
| Reconciler backlog | > 10 |
| Provider error rate | > 25% |
| Provider p95 latency | > 120s |
| Global AI spend (1h) | > $500 |
| DB latency | > 500ms |

Slack messages include metrics, alert lines, on-call email, and a link to `/api/ready`.

## Env vars

| Variable | Purpose |
|----------|---------|
| `SLACK_WEBHOOK_URL` | Preferred — Slack incoming webhook |
| `ALERT_WEBHOOK_URL` | Generic JSON webhook (fallback) |
| `ALERT_NOTIFY_EMAIL` | Shown in Slack footer (default: veysel.sundu@gmail.com) |
| `CRON_SECRET` | Required for cron to dispatch alerts |

## Manual cron test (production)

```bash
curl -s "https://gumrukyz.vercel.app/api/ready" \
  -H "Authorization: Bearer $CRON_SECRET" | jq .
```

Alerts only send when `ready: false`. To force a test, use `node scripts/test-slack-alert.mjs` locally.
