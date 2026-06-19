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
