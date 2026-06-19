# GümrükYZ Scalability Plan — ~1,000 Concurrent Users

This document describes the phased plan to make GümrükYZ production-ready for approximately 1,000 concurrent users.

## How the fixes were prioritized

Nine candidate fixes were designed in detail, then stress-tested from two angles: whether the order would break anything, and whether the set would actually survive 1,000 users. Two findings shaped the decisions:

1. **The biggest risks weren't in the original nine.** The wall you hit first at scale is the database connection pool and a silent credit leak (a cleanup job that never runs in production) — neither was in the original list. They're also nearly free to fix, so they go to the front.

2. **One fix (#A) is a loaded gun.** Turning on the background queue, if merged carelessly, instantly returns errors to every user. It must be choreographed exactly. The sequence below prevents that.

3. **Direct-to-blob uploads (G) were cut.** They add real new failure modes and upload memory is not what breaks at 1,000 users. Defer until upload memory actually bites.

---

## The sequence — five waves

| Wave | What | Plain-language why | Effort | Risk |
|------|------|-------------------|--------|------|
| **0** | Pool sizing · Reconciler cron · Poller backoff · `/process` timeout · health-check honesty · deploy-script fix | Remove the real walls (DB connections, credit leak, request storms) — cheap insurance before anything else | ~1 day | Low |
| **1** | Provider throttling + auto-retry (F) · `/ready` metrics + alerting (H) | Make today's synchronous system self-heal under provider rate limits; gain eyes on saturation | ~2–3 days | Low |
| **2** | Trigger v3→v4 (I) → Queue + per-tenant caps (B) → Enable + fail-closed (A) | Turn the background kitchen ON, with a concurrency ceiling and per-tenant fairness from day one | ~3–4 days | High (choreography) |
| **3** | Classification → background (C) → Expert review → background (D) | Move the two remaining long synchronous operations off the request path | ~1 week | Medium |
| **4** | Distributed rate limit (E) · per-tenant spend circuit-breaker | Real cross-server limits + a cost ceiling so one tenant or a provider outage can't bankrupt/starve the system | ~3–4 days | Medium |
| *cut* | Direct-to-blob upload (G) | Not the bottleneck; adds new failure modes — revisit only if upload memory actually bites | — | — |

---

## Wave 0 — Cheap fixes that remove the real walls

Independent, high value-to-effort. **Ship first.**

### Size the database connection pool

The pipeline holds a DB connection across 14s+ of waiting on Azure/OpenAI. At a few hundred concurrent analyses you'll hit "too many connections" before any AI limit.

**Action:** Add an explicit `connection_limit` + confirm transaction-mode pooling on the pooled URL, set a Neon autoscaling floor, and load-test the connection count specifically.

**Files:** `DATABASE_URL` config + `packages/db/src/client.ts`

### Wire the reconciler to a cron

Add a `crons` entry in `vercel.json` hitting `/api/platform/reconcile` every ~15–30 min. Right now `reconcileStuckReservations` never runs in prod, so every crashed analysis silently leaks a customer's credit forever.

### Calm the pollers

Add jitter + exponential backoff + a pause when the browser tab is hidden to `submission-status-poll.ts` and the two banner pollers. 1,000 open cases at fixed 3s = ~333 authenticated DB hits/sec, forever, even in background tabs.

### `/process` timeout safety net

`export const maxDuration = 300` on `process/route.ts` so the sync path can't be truncated mid-pipeline before Wave 2 lands.

### Make the health check honest

Behind a `HEALTH_STRICT` flag: in prod, fail if Blob/OpenAI/Azure keys are missing, instead of always reporting green. `health/route.ts`

### Fix the deploy script

`trigger:deploy` calls a binary that isn't installed → change to `npx trigger.dev@latest deploy`. `package.json`

---

## Wave 1 — Resilience + eyes for today's system

### Provider throttling + retry (F)

Wrap the OpenAI/Azure call sites with a small concurrency limiter and 429 retry-with-backoff, so transient rate-limit errors become self-healing instead of fatal. Helps the current synchronous prod path immediately. ~250 lines, one new module + 3 thin wraps.

**Files:** `structured-client.ts`, `azure-document-intelligence.ts`, `openai-document-reader.ts`

### `/ready` endpoint + real alerting (H)

Expose queue depth, provider error rate, p95 — and wire an alert (Sentry/email/Slack) on stuck jobs, reconciler backlog, error spikes, and DB saturation. A dashboard nobody watches at 3am doesn't survive 1,000 users.

---

## Wave 2 — Turn the kitchen on (keystone — one coordinated release)

**Order is non-negotiable:** I → B → A, shipped together.

### I — Trigger v3→v4 first

Mechanical (4 import swaps + dependency bump, ~30 min, no breaking APIs in use). Building A/B on the retiring v3 would force redoing it all.

### B — Queue concurrency + per-tenant fairness

Set a `concurrencyLimit` so 1,000 queued jobs don't stampede Azure/OpenAI, plus a per-tenant `concurrencyKey` so one customer bulk-uploading 50 cases can't starve the other 999. This must be live before the key flip.

### A — Enable Trigger + fail-closed

~30–40 lines so production never runs the long pipeline inside a web request again.

> **Trap to avoid:** A's fail-closed gate flips prod from "works" to "503 for everyone" the instant it merges while `TRIGGER_SECRET_KEY` is unset. Rule: deploy the Trigger task and set the keys in the **same release** as the code merge, or gate it behind a `PROCESSING_ALLOW_SYNC_FALLBACK` escape-hatch flag. Never merge it "naked." Also extract a single shared `isProduction()` helper so A and H don't drift.

---

## Wave 3 — Move the last synchronous work to background

### C — Classification → background

Return 202 + poll. It's the busiest long request. Reuses A's pattern. Must include a stale-RUNNING reaper (or rely on Trigger) so jobs can't get stuck forever. Touches the shared submission-status state machine + 4 frontend pollers.

### D — Expert review → background

After C. The most timeout-prone endpoint (~98s p95). Extend the reconciler to cover its credits too.

---

## Wave 4 — Distributed limits + spend guard

### E — Distributed rate limiter

Upstash Redis, keyed by tenant/org, not IP (so a shared office network isn't falsely throttled), replacing the per-server in-memory one that doesn't actually enforce anything across Vercel's fleet.

### Per-tenant spend circuit-breaker

You record cost but nothing acts on it. Add a per-tenant/global $/hour ceiling that sheds load gracefully — important because F's retries can amplify spend during a provider outage.

---

## Explicitly deferred

- **Direct-to-blob upload (G):** Cut from the readiness push. Upload memory isn't the 1,000-user bottleneck, and it introduces a localhost-breaks-dev callback, an upload-before-DB-row race, and orphan-file risks. Revisit only if you actually observe memory/body-size limits biting.
- **Per-step micro-optimizations of the AI pipeline:** Not needed until the queue + throttling are in place and you have load-test numbers.

---

## Cautions

1. **Shared database:** The Neon DB is shared, so migrations in H (an index) and D (optional columns) must use `migrate deploy` (not `migrate dev`) and be confirmed before running.

2. **Nothing is "ready" until load-tested.** After Wave 2, run 100 → 250 → 500 → 1,000 tests — and watch the DB connection count first, since that's the real wall.

---

## Load-test gate (after Wave 2)

| Stage | Users | Watch first |
|-------|-------|-------------|
| 1 | 100 | DB connection count |
| 2 | 250 | Reconciler backlog |
| 3 | 500 | Provider 429 rate |
| 4 | 1,000 | p95 latency + queue depth |
