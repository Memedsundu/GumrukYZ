# Finish scalability setup (Waves 1–4)

Run after code is deployed to production. One command:

```bash
node scripts/finish-scalability-production.mjs
```

## One-time: Upstash Redis (Wave 4 distributed rate limits)

Without Upstash, rate limits are per-serverless-instance only (not cross-fleet).

1. Open [Upstash Console](https://console.upstash.com/redis) → **Create database**
   - Region: `eu-central-1` (or closest to Neon/Vercel)
   - Enable **Eviction** is not required for rate limiting
2. Copy **REST URL** and **REST TOKEN**
3. Add to `apps/web/.env.local`:

```env
UPSTASH_REDIS_REST_URL=https://....upstash.io
UPSTASH_REDIS_REST_TOKEN=....
```

Alternative: [Vercel Upstash integration](https://vercel.com/integrations/upstash) auto-injects env vars.

## What the script pushes to Vercel production

| Variable | Default | Purpose |
|----------|---------|---------|
| `SPEND_CIRCUIT_BREAKER_ENABLED` | `true` | Hourly AI spend ceiling |
| `SPEND_LIMIT_TENANT_USD_PER_HOUR` | `25` | Per-tenant limit |
| `SPEND_LIMIT_GLOBAL_USD_PER_HOUR` | `500` | Platform limit |
| `OPENAI_PROVIDER_MAX_CONCURRENCY` | `5` | Provider throttle |
| `AZURE_PROVIDER_MAX_CONCURRENCY` | `3` | Provider throttle |
| `TRIGGER_*_CONCURRENCY` | see `.env.example` | Queue caps |
| `UPSTASH_*` | from `.env.local` | Distributed rate limit |

Also re-pushes `TRIGGER_SECRET_KEY`, `TRIGGER_PROJECT_ID`, `HEALTH_STRICT=true`.

## Verify

```bash
pnpm verify:production-env
pnpm smoke:production
```

Health should show:

```json
"scalability": {
  "distributedRateLimit": true,
  "rateLimitRedisOk": true,
  "spendGuard": true
}
```

## Load-test ladder (post Wave 2 gate)

Run against production when traffic is low; watch `dbLatencyMs` in `/api/ready`:

```bash
node scripts/load-test-readiness.mjs --stage 50
node scripts/load-test-readiness.mjs --stage 100
node scripts/load-test-readiness.mjs --stage 250
```

Stop and investigate if error rate > 5% or p95 > 3s on health/ready.

## Related

- [production-env-checklist.md](./production-env-checklist.md)
- [scalability-plan.md](./scalability-plan.md)
- [finish-wave0-setup.md](./finish-wave0-setup.md)
