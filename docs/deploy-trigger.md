# Trigger.dev — production deploy

GümrükYZ belge işleme pipeline’ı Vercel’in ~60s function limitini aşabilir. `TRIGGER_SECRET_KEY` tanımlıyken işlem Trigger.dev üzerinde asenkron çalışır.

## 1. Trigger.dev projesi

1. https://cloud.trigger.dev → yeni proje
2. **Project ID** → `TRIGGER_PROJECT_ID` (Vercel env)
3. **API Keys** → `TRIGGER_SECRET_KEY` (Vercel env, Production)

## 2. Deploy task

```bash
cd apps/web
npx trigger.dev@latest deploy
```

Konfigürasyon: [`apps/web/trigger.config.ts`](../apps/web/trigger.config.ts)  
Task: [`apps/web/src/trigger/process-submission.ts`](../apps/web/src/trigger/process-submission.ts)

## 3. Vercel

Aynı `TRIGGER_SECRET_KEY` ve `TRIGGER_PROJECT_ID` değerlerini Production ortamına ekleyin. Redeploy edin.

## 4. Doğrulama

- `GET /api/health` → `"trigger": true`
- Bir dosyada **Analizi başlat** → HTTP 202, ardından durum `COMPLETED`

## Yerel geliştirme

`TRIGGER_SECRET_KEY` boş bırakılırsa işlem istek içinde senkron çalışır (kısa testler için uygun).
