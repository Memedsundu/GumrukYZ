# Production environment checklist (Vercel)

Proje: `gumrukyz` → https://gumrukyz.vercel.app

Doğrulama: `pnpm smoke:production` veya `curl https://gumrukyz.vercel.app/api/health` · `curl https://gumrukyz.vercel.app/api/ready`

## Zorunlu

| Değişken | Açıklama |
|----------|----------|
| `DATABASE_URL` | Neon **pooled** connection (`-pooler` hostname) with `connection_limit=1` |
| `DATABASE_URL_UNPOOLED` | Neon **direct** host (migrations only) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk |
| `CLERK_SECRET_KEY` | Clerk |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob |
| `OPENAI_API_KEY` | Yapılandırılmış modeller |
| `TRIGGER_SECRET_KEY` | Uzun işleme pipeline (60s+ timeout önleme) |
| `TRIGGER_PROJECT_ID` | Trigger.dev proje kimliği |
| `TRIGGER_GLOBAL_CONCURRENCY` | Tüm tenant'lar için eşzamanlı submission limiti (varsayılan 15) |
| `TRIGGER_TENANT_CONCURRENCY` | Tenant başına eşzamanlı submission limiti (varsayılan 2) |
| `TRIGGER_CLASSIFICATION_CONCURRENCY` | Global sınıflandırma kuyruğu limiti (varsayılan 10) |
| `TRIGGER_EXPERT_REVIEW_CONCURRENCY` | Global Uzman İncelemesi kuyruğu limiti (varsayılan 5) |
| `UPSTASH_REDIS_REST_URL` | Wave 4 — distributed rate limit (org-keyed, cross-server) |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash REST token |
| `SPEND_CIRCUIT_BREAKER_ENABLED` | `true` — enforce hourly AI spend ceilings |
| `SPEND_LIMIT_TENANT_USD_PER_HOUR` | Tenant başına saatlik AI maliyet limiti (USD, varsayılan 25) |
| `SPEND_LIMIT_GLOBAL_USD_PER_HOUR` | Platform geneli saatlik AI maliyet limiti (USD, varsayılan 500) |
| `CRON_SECRET` | Vercel cron auth for `/api/platform/reconcile` and `/api/ready` alerts |
| `HEALTH_STRICT` | `true` — fail health check when Blob/OpenAI/Trigger keys missing |

## Önerilen (pilot)

| Değişken | Açıklama |
|----------|----------|
| `OCR_SERVICE_URL` | Railway OCR sidecar (taranmış PDF) |
| `OCR_SERVICE_SECRET` | OCR API anahtarı |
| `AZURE_DOCUMENT_INTELLIGENCE_*` | `DOCUMENT_READER_MODE=managed` ise |
| `INTERNAL_TENANT_CLERK_ORG_ID` | Dahili test org Clerk ID |
| `PLATFORM_ADMIN_CLERK_USER_IDS` | Virgülle ayrılmış platform admin Clerk user ID |
| `ALERT_WEBHOOK_URL` | Slack/generic webhook — cron `/api/ready` posts when thresholds exceeded |
| `OPENAI_PROVIDER_MAX_CONCURRENCY` | OpenAI eşzamanlı istek limiti (varsayılan 5) |
| `AZURE_PROVIDER_MAX_CONCURRENCY` | Azure Doc Intel eşzamanlı istek limiti (varsayılan 3) |

## Neon ops (dashboard)

- **Autoscaling floor:** Set a minimum compute size so cold-start latency does not spike under load.
- **Connection monitoring:** After deploy, watch active connections during load tests — this is the first wall at scale.

## Clerk redirect URL’leri (production)

- Sign-in / sign-up sonrası: `/onboarding`
- Organizations: etkin

## Migration

```bash
pnpm db:migrate
```

Son migration: `20260519120000_pilot_org_users` (pilot onay + org başına kullanıcı).

## Scalability roadmap

See [scalability-plan.md](./scalability-plan.md) for the full 5-wave plan (~1,000 concurrent users).

**Activate Waves 1–4 on production:** [finish-scalability-setup.md](./finish-scalability-setup.md) → `node scripts/finish-scalability-production.mjs`
