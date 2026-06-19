# Finish Wave 0 — Trigger.dev + strict health (beginner guide)

Most Wave 0 ops are already done (cron, DB pool, deploy). Three items need a **one-time browser login** that cannot be fully automated. This guide takes about **10 minutes**.

## Already done for you

- Vercel: `CRON_SECRET`, `DATABASE_URL` with `connection_limit=1`, production deploy
- Neon GumrukYZ: autoscaling floor raised **0.25 → 0.5 CU** (max still 2 CU)
- Smoke test updated to check `/` instead of `/beta`

---

## Step 1 — Trigger.dev project (browser, ~5 min)

1. Open **[cloud.trigger.dev](https://cloud.trigger.dev)** and sign in (GitHub or Google is fine).

2. Click **New project** → name it **`GumrukYZ`** → Create.

3. On the project dashboard, find **Project ref** (looks like `proj_abc123…`). Copy it.

4. Go to **API Keys** → switch to **PROD** → copy the secret key (starts with `tr_prod_…`).  
   Direct link: https://cloud.trigger.dev/orgs/zanai-74d8/projects/gumrukyz-kUH6/env/prod/apikeys

5. Open `apps/web/.env.local` on your machine and add (or update):

```env
TRIGGER_PROJECT_ID=proj_nwvnvcvwwrfrtjapfjhg
TRIGGER_SECRET_KEY=tr_prod_your_key_here
```

---

## Step 2 — Login Trigger CLI (terminal, ~1 min)

In Terminal:

```bash
cd apps/web
npx trigger.dev@latest login
```

Your browser opens → approve access → terminal should say login succeeded.

Verify:

```bash
npx trigger.dev@latest whoami
```

---

## Step 3 — Run the finish script (automated)

From the **repo root**:

```bash
node scripts/finish-wave0-production.mjs
```

This will automatically:

1. Push `TRIGGER_SECRET_KEY`, `TRIGGER_PROJECT_ID`, and `HEALTH_STRICT=true` to Vercel Production
2. Deploy the background task (`process-submission`) to Trigger.dev
3. Redeploy Vercel production
4. Run `pnpm smoke:production`

---

## Step 4 — Quick manual check

1. Open https://gumrukyz.vercel.app/api/health  
   Expect: `"ok": true`, `"strict": true`, `"trigger": true`

2. In the app, start an analysis on a test submission  
   Expect: HTTP **202** (async), status eventually **COMPLETED**

---

## If something fails

| Problem | Fix |
|---------|-----|
| `finish-wave0-production.mjs` says missing keys | Complete Step 1 — keys must be in `.env.local` |
| `trigger.dev login` fails | Run again; use same Google account as Trigger dashboard |
| `trigger deploy` fails | Check `TRIGGER_PROJECT_ID` matches dashboard project ref |
| Health shows `"trigger": false` after deploy | Redeploy Vercel after env vars were added |
| Health 503 with strict | One of blob/openai/trigger/azure keys missing on Vercel |

---

## Neon autoscaling (optional tweak)

Current setting: **min 0.5 CU, max 2 CU** on project GumrukYZ.

To change later: [Neon console](https://console.neon.tech) → **GumrukYZ** → **Branches** → **production** → **Compute** → edit min/max.

For heavier load (Wave 2+), consider min **1 CU**.

---

## One-liner after keys are in `.env.local`

```bash
node scripts/finish-wave0-production.mjs
```

That’s it.
