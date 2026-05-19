# Production environment checklist (Vercel)

Proje: `gumrukyz` → https://gumrukyz.vercel.app

Doğrulama: `pnpm smoke:production` veya `curl https://gumrukyz.vercel.app/api/health`

## Zorunlu

| Değişken | Açıklama |
|----------|----------|
| `DATABASE_URL` | Neon pooled connection |
| `DATABASE_URL_UNPOOLED` | Neon direct (migrations) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk |
| `CLERK_SECRET_KEY` | Clerk |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob |
| `OPENAI_API_KEY` | Yapılandırılmış modeller |
| `TRIGGER_SECRET_KEY` | Uzun işleme pipeline (60s+ timeout önleme) |
| `TRIGGER_PROJECT_ID` | Trigger.dev proje kimliği |

## Önerilen (pilot)

| Değişken | Açıklama |
|----------|----------|
| `OCR_SERVICE_URL` | Railway OCR sidecar (taranmış PDF) |
| `OCR_SERVICE_SECRET` | OCR API anahtarı |
| `AZURE_DOCUMENT_INTELLIGENCE_*` | `DOCUMENT_READER_MODE=managed` ise |
| `INTERNAL_TENANT_CLERK_ORG_ID` | Dahili test org Clerk ID |
| `PLATFORM_ADMIN_CLERK_USER_IDS` | Virgülle ayrılmış platform admin Clerk user ID |

## Clerk redirect URL’leri (production)

- Sign-in / sign-up sonrası: `/onboarding`
- Organizations: etkin

## Migration

```bash
pnpm db:migrate
```

Son migration: `20260519120000_pilot_org_users` (pilot onay + org başına kullanıcı).
