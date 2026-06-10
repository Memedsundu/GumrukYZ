# GümrükYZ — Visual Design & UX Aesthetics Review

**Date:** 2026-06-10 · **Scope:** apps/web in-app UI + PDF export · **Method:** full code-trace of design tokens, UI kit, app shell, all consultant journeys, auth/onboarding, admin surfaces, and `report-pdf.tsx`. Review only covers look & feel; rules logic and data models are out of scope.

> Companion note: the roadmap in §F marks which items were implemented immediately after this review (same branch). Everything else remains open.

---

## A. Executive summary

**Overall aesthetic grade: B−.**

**Positioning in one sentence:** GümrükYZ today is a *competent, calm, consistent* warm-neutral admin product — but it is **anonymous**: strip the word "GümrükYZ" from the sidebar and nothing on any screen says "Turkish customs intelligence" rather than "generic well-built SaaS dashboard."

### Top 3 wins
1. **A real token system, used honestly.** `apps/web/src/app/globals.css:3-65` defines warm stone neutrals, a trustworthy blue, semantic risk colors and a dedicated purple `ai` family — and the dashboard surfaces actually use them (`sidebar.tsx`, `topbar.tsx`, all of `components/ui/*`). Very little raw-palette drift inside the shell.
2. **Severity communication is mostly colorblind-safe.** Findings pair icon + label + tint everywhere that matters (`report-workspace.tsx:804-849` — `XCircle`/`AlertCircle`/`Info`/`CheckCircle` + text badges). Admin parity is real: rules/audit/observability get the same polish as consultant screens.
3. **The upload flow has genuine UX intelligence.** The "Sıradaki adım" next-action banner in `upload-client.tsx` (sticky step guidance with blocking reasons) is better interaction design than most enterprise tools ship.

### Top 3 gaps
1. **Zero brand expression beyond a blue shield.** No display typeface, no illustration, no customs visual language, coral `accent` tokens defined (`globals.css:26-29`) but used exactly once (audit OVERRIDE badge). Empty states are a gray box with a gray icon (`empty-state.tsx:16-18`). The product never *feels* like customs.
2. **The hero screen under-delivers its own drama.** The risk report (`report-workspace.tsx`) buries the verdict: a 3-column kanban of findings (`:312-325`) forces horizontal scanning, the sticky filter bar at `top-0 z-20` (`:224`) slides **under** the `z-30 h-16` topbar — an actual layering bug — and there is no "all clear" moment when a file passes.
3. **The front door doesn't match the house.** Auth, onboarding, consent and 403 pages use raw `gray-*`/`blue-600` Tailwind palette instead of the tokens (`(auth)/sign-in/[[...sign-in]]/page.tsx`, `onboarding/page.tsx`, `pilot-consent/consent-form.tsx`, `forbidden.tsx`). First impression is the off-brand screen.

---

## Scores — 12 dimensions (1–10, evidence-backed)

| # | Dimension | Score | Evidence |
|---|-----------|-------|----------|
| 1 | First impression & brand personality | **4** | Sign-in is an unthemed Clerk card on `bg-gray-50`; in-app the only branded moment is the dashboard gradient band (`dashboard/page.tsx` hero). No illustration, no display type, accent coral unused. |
| 2 | Visual hierarchy (report scan <5s) | **6** | Gauge + 4 metric tiles read fast (`report-workspace.tsx:254-290`), but blocking findings sit in column 1 of 3 equal columns — severity is encoded by *position* the eye must learn, and the next action is never named. |
| 3 | Density vs. breathing room | **7** | Consistent `p-5/p-6` card rhythm, tables at `px-6 py-4`. Report finding cards are slightly cramped at `px-3 py-3` inside `p-3` columns; admin tables comfortable. |
| 4 | Color semantics | **7** | PASS/WARN/FAIL/REVIEW_NEEDED always icon+label+tint. Weakness: REVIEW_NEEDED shares brand blue with interactive elements (active filters are also `bg-brand-600`), so "blue = needs review" and "blue = selected" collide on the same screen. |
| 5 | Typography | **5** | Inter only (`layout.tsx:7`), three weights, no display face, no loaded mono font — `font-mono` classes on rule codes (`report-workspace.tsx:398`) fall back to system mono with no token (`--font-mono` undefined). Hierarchy works but has no voice. |
| 6 | Iconography | **6** | Lucide used consistently and semantically; nothing wrong, nothing memorable. Doc types (INVOICE/PACKING_LIST/…) all render as the same `FileText`. |
| 7 | Motion & micro-interactions | **3** | Only `transition-colors`, sidebar `duration-200`, and `animate-spin`. Zero keyframes in `globals.css`, no entrance motion, no processing pulse, no success moment. The most static dimension of the product. |
| 8 | Empty & error states | **4** | One pattern: gray rounded box + muted icon (`empty-state.tsx`). Errors are competent (`bg-danger-50` blocks placed contextually) but sterile; no recovery personality anywhere. |
| 9 | Mobile / responsive | **7** | Mobile drawer + scrim done right (`sidebar.tsx`), pages collapse to single column, filter bar scrolls horizontally. Gap: report evidence panel simply disappears below `xl` (`report-workspace.tsx:337`) — phone users lose category filters, documents and mevzuat entirely. |
| 10 | Accessibility | **6** | Focus-visible rings, `sr-only` labels, `lang="tr"`, Radix primitives. Gaps: hand-rolled report modal has no focus trap/restore (`:468-646`), gauge score is color-distinguished only at a glance, button vs input focus recipes differ (`ring-brand-500/40`+offset vs `/30` no offset), no `aria-live` on async status. |
| 11 | AI moments | **6** | Purple `ai` family + Sparkles is a consistent, recognizable language (`expert-review-button.tsx`). But "magic" is one tinted box; the running state is just a spinner, and the AI summary is a generic left-border callout. |
| 12 | Admin surfaces | **7** | Same tokens, same density, real empty states — admin is not a dumping ground. Cost: severity/status badge class clusters are copy-pasted per page (`admin/rules/page.tsx`, `admin/audit/page.tsx` `ACTION_COLORS`) instead of using `ui/badge.tsx`. |

**Mean ≈ 5.7 → B−.** The floor is high (nothing embarrassing), the ceiling is low (nothing memorable).

---

## B. Screen-by-screen critique

### B1. App shell & navigation
*Files: `(dashboard)/app-shell.tsx`, `sidebar.tsx`, `sidebar-nav.tsx`, `topbar.tsx`*

**Inferred render:** white sidebar (`w-64` ↔ `w-16` rail, cookie-persisted), ShieldCheck-in-blue-square logo, nav pills with `bg-brand-50 text-brand-700` active state, frosted `bg-surface/80 backdrop-blur` topbar with breadcrumbs and Clerk controls.

**Works:** collapse behavior with tooltips at `delayDuration={150}`; admin section gating with an uppercase "Yönetim" label; warm canvas behind white surfaces gives gentle depth without borders shouting.

**Generic/confusing:** the logo treatment (icon in rounded square + bold Inter) is the default of every shadcn starter. The topbar is pure chrome — no tenant context beyond Clerk's own switcher, no environment/beta marker despite the pilot-consent flow insisting this is a beta.

### B2. Dashboard home — `dashboard/page.tsx`

**Inferred render:** blue gradient hero band (greeting + CTA) → 5 stat cards (`sm:grid-cols-2 xl:grid-cols-5`) → recent-files table + 320px side rail (expert quota progress bar, quick links).

**Works:** the gradient band is the one place the product has presence; stat-card icon tiles are tidy; quota bar with `bg-ai-500` ties AI usage to the purple language.

**Generic:** the hero band is a flat 2-stop gradient with no texture or graphic — it reads "template hero." Recent-files table renders doc/status info as text+badge only; five stat cards of near-equal visual weight means nothing is the headline. Empty state is the standard gray box.

### B3. New submission — `submissions/new/page.tsx`

Single narrow card, one labeled input, full-width primary button with hand-rolled loading state (conditional `Loader2` + text swap). Fine, minimal, correct. Critique: this is the **start of the core ritual** and it feels like a settings form — no sense of "you are opening a customs dossier." A doc-type preview row or illustration would set expectations for the upload step that follows.

### B4. Submission detail — `submissions/[id]/page.tsx`

**Works:** `ProcessingTimeline` is honest about the 10-stage pipeline; numbered circles + colors + progress banner is the right concept.

**Gaps:** the *current* step is visually static — a brand-colored circle with no pulse; you cannot tell at a glance whether the pipeline is moving or hung. Documents list renders every type as `FileText`. Risk summary card duplicates `risk-summary-card.tsx` semantics correctly but the "Tam Raporu Gör →" link is a text afterthought for what is the page's primary action once processing completes.

### B5. Document upload — `documents/upload-client.tsx` (828 lines)

**Works (genuinely good):** the "Sıradaki adım" banner with contextual CTA and explicit blocking reasons; confidence-tiered badges (≥80 green / ≥60 amber / <60 red); ignore-toggle with clear "Analize dahil / Analiz dışı" labels.

**Gaps:** dropzone is a static dashed box — drag-over only swaps colors, no scale/lift; upload success has no moment (files just appear in the list); the page is the longest client component in the app with every button hand-styled rather than using `ui/button.tsx`'s missing loading variant; doc-type select is a bare native `<select>`.

### B6. Risk report (HERO) — `report/report-workspace.tsx` + `expert-review-button.tsx` + `override-button.tsx`

**Inferred render:** header (back link, "Risk Raporu" h1, count badge, PDF/JSON buttons) → sticky 6-pill filter bar → score card (SVG gauge | 4 metric tiles + AI summary callout | purple expert-review panel) → "Bulgular" as 3 columns FAIL/REVIEW_NEEDED/WARN → collapsed "Geçen kontroller" → right sticky evidence rail (xl only) → hand-rolled detail modal.

**What works:**
- Information architecture is right: verdict → findings → evidence; passed checks collapsed by default is exactly correct for time-pressed consultants.
- Finding cards carry code (mono), severity icon+badge, blocking flag, confidence — dense but legible.
- The modal's content model (Bulgu / Ne yapmalı? / AI ikinci kontrol / GTİP adayları / Mevzuat / Kanıt / Override) is genuinely strong domain UX.

**What fails:**
1. **Sticky bug:** filter bar `sticky top-0 z-20` (`:224`) vs topbar `sticky top-0 z-30 h-16` (`topbar.tsx`) — when stuck, the filters slide under the topbar and the top ~64px of the bar is unusable/clipped.
2. **The kanban anti-pattern:** three equal columns (`:312-325`) imply parallel workstreams; severity is a *priority order*, not lanes. With 1 hata and 9 uyarı, the eye lands on the heaviest column — the wrong one.
3. **No verdict moment:** a clean report shows… an empty kanban with three dashed "yok" boxes. The single most reassuring state the product can produce is rendered as absence.
4. **Hand-rolled modal** (`:468-646`): reimplements escape/scroll-lock via `useEffect`, has no focus trap or focus-restore, and duplicates what `ui/dialog.tsx` (Radix) already provides — two modal systems in one app.
5. **Evidence rail vanishes below `xl`** (`:337`) taking category filters with it.
6. **Expert review "running" state** is a spinner and a disabled button — the most expensive, most magical operation in the product looks like a form submit.

### B7. Auth / onboarding / consent / 403

`sign-in`, `sign-up`: centered Clerk cards over `bg-gray-50` with hand-set `text-gray-900` headers. `onboarding/page.tsx`: same, with `text-blue-600` shield. `pilot-consent/consent-form.tsx`: legal scroll-box (`bg-gray-50 border-gray-200`), raw `bg-blue-600` submit. `forbidden.tsx`: gray 403 card with `bg-gray-900` button.

**Verdict:** functionally fine, tonally correct (the consent copy is appropriately serious) — but every one of these screens uses the raw Tailwind palette, not the tokens. The warm stone identity literally does not exist until after login. The 403 page — a screen consultants hit when tenant permissions bite — has zero brand warmth.

### B8. Admin — rules / clients / sources / audit / observability

**Works:** identical shell, PageShell rhythm, real empty states, tone-coded stat tiles (`admin/sources/page.tsx` summary grid), thoughtful remediation copy with CLI commands in failure alerts.

**Gaps:** every page re-implements badges as inline class strings (severity map in `rules/page.tsx`, `ACTION_COLORS` in `audit/page.tsx:16-23`, verification badge component in `sources/page.tsx:10-41`) when `ui/badge.tsx` has the exact tones; tables are raw `<table>` markup instead of `ui/table.tsx`; rule codes/IDs use un-tokenized `font-mono`.

### B9. PDF export — `lib/report-pdf.tsx`

Noto Sans 400/700, A4, 36pt margins, hardcoded grays/blues that *approximate* the tokens (`#111827` vs ink `#1c1917`, `#eff6ff` vs brand-50 `#eef4ff`). Structure mirrors the in-app report well (stats row → AI summary → action summary → expert review → control results).

**Gaps:** no brand mark or header rule — the artifact a consultant forwards to a client opens with plain text; colors drift slightly off-token; severity in the body is text-only (acceptable) but the stats row has no tinting at all, so the "3 Hata" box looks identical to "12 Geçti."

---

## C. Design system audit

### C1. Token gaps (in `globals.css`)

| Missing | Consequence | Recommendation |
|---|---|---|
| Motion: durations, easings, keyframes | Every animation is ad-hoc (`duration-200` inline, `duration-500` in upload progress); no `prefers-reduced-motion` story | `--duration-fast/base/slow` (150/250/400ms), `--ease-out-soft: cubic-bezier(0.22,1,0.36,1)`, keyframes `fade-rise`, `scale-in`, `pulse-soft`, `check-draw` + reduced-motion guard |
| `--font-mono` | `font-mono` classes resolve to browser default; GTİP/rule codes render inconsistently across OSes | Token with SF Mono/Cascadia/Menlo chain (no webfont needed) |
| `--font-display` | No typographic brand voice | Space Grotesk via next/font, `latin-ext` subset (İ ş ğ Ö Ü Ç), applied to page titles & verdict headings only |
| Z-index scale | `z-20/z-30/z-50` scattered; caused the report filter-bar layering bug | Document `--z-sticky: 20`, `--z-shell: 30`, `--z-overlay: 50` |
| Input invalid state | Error display is always an external red box; fields never show error state | `aria-invalid` styling: `border-danger-500` + `ring-danger-500/30` |
| Button loading variant | Loading buttons hand-rolled in ≥4 places (`submissions/new`, `upload-client`, `override-button`, `expert-review-button`) | `loading` prop on `ui/button.tsx` |

### C2. Duplication & drift

- **Two modal systems:** Radix `ui/dialog.tsx` vs hand-rolled `FindingDetailModal` (`report-workspace.tsx:468-646`). Consolidate on Radix.
- **Badge re-implementations:** `rules`, `audit`, `sources` admin pages + report `ResultBadge`/`SourceTypeBadge` all hand-roll what `ui/badge.tsx` tones cover.
- **Focus-ring recipes differ:** Button `ring-brand-500/40 ring-offset-2` vs Input `ring-brand-500/30` no offset. Pick one recipe.
- **Raw palette on auth/error/beta routes:** `gray-*`, `blue-600`, `slate-*` (see B7) — migrate to tokens.
- **Page-level hardcoded buttons:** dashboard quick CTA, admin "Yeni Müşteri" duplicate `bg-brand-600 … hover:bg-brand-700` instead of `<Button>`.

### C3. Recommended `globals.css` additions

```css
--font-display: var(--font-space-grotesk), var(--font-inter), ui-sans-serif, sans-serif;
--font-mono: ui-monospace, "SF Mono", "Cascadia Mono", Menlo, monospace;
--ease-out-soft: cubic-bezier(0.22, 1, 0.36, 1);
--duration-fast: 150ms;  --duration-base: 250ms;  --duration-slow: 400ms;
--animate-fade-rise: fade-rise var(--duration-slow) var(--ease-out-soft) both;
--animate-scale-in: scale-in var(--duration-base) var(--ease-out-soft) both;
--animate-pulse-soft: pulse-soft 2s ease-in-out infinite;
--animate-check-draw: check-draw var(--duration-slow) var(--ease-out-soft) 150ms both;
/* + keyframes, + @media (prefers-reduced-motion: reduce) kill-switch */
```

---

## D. Radical redesign concepts

### D1. "Sakin Kontrol Odası" (Calm Control Room) — **recommended & implemented**

**Mood:** air-traffic-control calm, not NASA drama. Warm stone canvas stays; a left *severity rail* becomes the consultant's instrument panel; verdict, blocking items and next action are always one glance away. Motion is entrance-only, ≤400ms, eased soft. Space Grotesk headlines mark waypoints; Inter does the work.

**Report page wireframe:**

```
┌ topbar (z-30) ───────────────────────────────────────────────────────────┐
├──────────────┬───────────────────────────────────────────┬───────────────┤
│ SEVERITY RAIL│  COMMAND DECK                             │ EVIDENCE      │
│ (sticky)     │  ┌─────────┐  Hata İncel. Uyarı Geçti     │ (sticky)      │
│  ◯ 72        │  │ gauge   │  [ 2 ] [ 1 ]  [ 4 ]  [12]    │ Kategoriler   │
│  Yüksek risk │  │  72     │  ┌──────────────────────┐    │  Fatura  3    │
│ ──────────── │  └─────────┘  │ ⓘ Yapay zeka özeti   │    │  GTİP    2    │
│ ▸ Hatalar  2 │               └──────────────────────┘    │ Belgeler      │
│ ▸ İncele.  1 │  ┌ Uzman Yz incelemesi (mor panel) ──┐    │  📄 fatura.pdf│
│ ▸ Uyarı    4 │  └───────────────────────────────────┘    │ Mevzuat       │
│ ▸ Yz       3 │                                           │  · 4458 GK    │
│ ▸ Geçen   12 │  BULGULAR (tek sütun, öncelik sırasıyla)  │               │
│ ──────────── │  ━ HATALAR (2) ━━━━━━━━━━━━━━━━━━━━━━     │               │
│ SIRADAKİ     │  ▌✕ INV-001  Fatura tutarı uyuşmuyor      │               │
│ "Fatura      │  ▌✕ DOC-003  Menşe belgesi eksik          │               │
│  tutarı..."  │  ━ İNCELEME GEREKLİ (1) ━━━━━━━━━━━━━     │               │
│ [Detayı aç]  │  ▌ⓘ GTIP-02 ...                           │               │
└──────────────┴───────────────────────────────────────────┴───────────────┘
  < xl: rail → sticky top strip (top-16);  evidence → <details> disclosure
  All clear: deck = success band + drawn-check ✓ "Engelleyici bulgu yok"
```

**Trade-offs:** the biggest diff in the codebase's biggest file; mitigated by mechanical extraction first (logic frozen in `report-filters.ts`), then layout-only rewrite. Familiarity risk Low-Med — content and filters unchanged, only geometry moves toward the natural scan order.

### D2. "Mühür & Kağıt" (Stamp & Paper)

**Mood:** the aesthetics of the customs ledger — faint paper-grain on `canvas`, documents as slightly rotated stacked sheets in illustrations, severity rendered as ink-stamp impressions (rounded-rectangle outline badges with slight rotation and texture), coral as sealing-wax accent, a serif display face (e.g. Source Serif) for report titles. PDF gets a full letterhead with a stamp mark.

```
┌──────────────────────────────────────────────┐
│  ▒ paper-texture canvas ▒                    │
│   ┌────────────────────────────┐             │
│   │  RİSK RAPORU        ┌────┐ │  ← stamp-   │
│   │  INV-2024-00123     │TEMİZ│ │    style    │
│   │  ──────────────     └────┘ │    verdict  │
│   │  findings as ledger rows…  │             │
└──────────────────────────────────────────────┘
```

**Trade-offs:** highest brand distinctiveness; serious risk of cuteness undermining KVKK-enterprise trust if the stamp metaphor touches actual severity badges (guardrail: decorative surfaces only). Texture + serif = larger design QA surface. Dev cost high. **Not chosen** — but its illustration language (stamps, sheets, containers) is harvested for §E.

### D3. "Mavi Mühür" (Blue Seal) — conservative deepening

**Mood:** keep every layout; spend entirely on identity: a proper seal-style logomark (shield + crescent-notch echoing a customs stamp), Space Grotesk titles, coral used deliberately (quota warnings, beta tag, override accents), gradient-mesh band refined, PDF letterhead. Essentially "the current app, but it signs its name."

**Trade-offs:** cheapest (days), zero familiarity risk, but does not fix the report-page hierarchy or motion deadness — it polishes the anonymity rather than curing it. **Folded into D1** (the typography/brand items ship together with the relayout).

---

## E. Illustration & graphic asset brief

Style: **2-color line art** — `ink-subtle` strokes + one accent fill (brand-100 or accent-100), 1.5px stroke, rounded joins, drawn on a 200×160 grid. Inline SVG React components (tree-shakeable, theme-aware via CSS vars / `currentColor`). **No Lottie** for v1: the only animation needs (check-draw, pulse) are 1-path CSS animations; Lottie adds a runtime for nothing. Static PNG only if marketing screenshots need them later.

| # | Asset | Placement | Style notes | Purpose |
|---|-------|-----------|-------------|---------|
| 1 | Boş dosya rafı (empty dossier shelf: folder + container silhouette) | Dashboard & list empty states | Line art, brand-100 fill on folder tab | Kill the "blank SaaS" gray box |
| 2 | Belge yükleme (document stack with up-arrow sheet) | Upload dropzone idle / first-run | Accent-100 on top sheet | Make the dropzone inviting |
| 3 | Temiz rapor mührü (check inside a stamp ring) | Report all-clear deck; PDF footer mark variant | Success-100 fill, ring drawn with `check-draw` | The reward moment |
| 4 | Kontrol noktası bariyeri (checkpoint barrier) | `forbidden.tsx` 403 | Neutral + warning-100 stripe | Humanize denial without cuteness |
| 5 | Rota haritası (dashed route + port pin) | Onboarding org-select | Brand-100 pin | "You're setting a course" |
| 6 | Konteyner vinci (container crane, minimal) | Processing/loading states on submission detail | Animated `pulse-soft` on hook cable | Pipeline is *moving* |
| 7 | Doc-type mini-glyph set (8): fatura, çeki listesi, beyanname, menşe, taşıma, banka, sözleşme, diğer | DocTypeChip everywhere documents appear | 16px Lucide-compatible strokes, per-type tint | Distinct doc-type visual language |
| 8 | İmza/onay kaşesi (small approval stamp) | Override-confirmed and consent-accepted confirmations | Accent-100 | Mark human decisions distinctly from AI ones |
| 9 | Yapay zeka kıvılcımı (sparkle constellation, restrained) | Expert review running/finished panel | ai-100, 2 sparks max | AI moment without gimmick |
| 10 | Mevzuat cildi (statute book spine) | Admin sources empty state | Neutral | Domain warmth in admin |
| 11 | Letterhead rule + shield seal (vector for react-pdf) | PDF header | Brand-600 1pt rule + mark | The forwarded artifact carries the brand |
| 12 | Gradient-mesh band texture (SVG blur blobs, very low contrast) | Dashboard hero band only — never behind data | brand-700→600 + accent at 8% | Depth for the one hero surface |

---

## F. Prioritized roadmap

**✅ = implemented in this session** (branch `cursor/gumrukyz-mvp-foundation`).

### Quick wins (1–2 days)
| Item | Files | Impact | Risk |
|---|---|---|---|
| ✅ Motion/duration/z tokens + keyframes + reduced-motion guard | `globals.css` | Foundation for everything below | Low |
| ✅ `--font-mono` token + Space Grotesk display font wiring | `globals.css`, `layout.tsx` | Codes render consistently; titles get a voice | Low |
| ✅ Button `loading` prop; unify focus rings; input `aria-invalid` styling | `ui/button.tsx`, `ui/input.tsx`, `ui/textarea.tsx` | Removes 4 hand-rolled spinners | Low |
| ✅ Fix report sticky bar under-topbar bug | `report-workspace.tsx` | Restores usable filters when scrolled | Low |
| ✅ Auth/consent/403 token migration + brand header | `(auth)/*`, `forbidden.tsx` | First impression matches the product | Low |
| ✅ PDF brand header + token-aligned colors + tinted stat boxes | `lib/report-pdf.tsx` | Forwarded artifact signs its name | Low |

### Medium (1–2 weeks)
| Item | Files | Impact | Risk |
|---|---|---|---|
| ✅ Illustration set v1 (5 scenes + glyphs) + EmptyState `illustration` slot | `components/illustrations/*`, `ui/empty-state.tsx` | Kills blank-SaaS feeling app-wide | Low |
| ✅ DocTypeChip component rolled out (dashboard, detail, upload, report evidence) | `ui/doc-type-chip.tsx` + 4 call sites | Documents become scannable by type | Low |
| ✅ Processing micro-motion: timeline pulse, drawn check, dropzone lift | `submissions/[id]/page.tsx`, `upload-client.tsx` | Pipeline feels alive | Med (poll re-renders) |
| ✅ Admin badge/table consolidation onto ui kit | `admin/*/page.tsx` | Single severity language | Low |
| AI-moment upgrade v2: streaming-style running narrative for expert review | `expert-review-button.tsx`, API | Magic where the money is | Med |

### Bold (1 sprint+)
| Item | Files | Impact | Risk |
|---|---|---|---|
| ✅ Report "Calm Control Room": severity rail, command deck, single prioritized findings column, all-clear state, Radix dialog swap, mobile evidence disclosure | `report/*` (extracted into `finding-badges.tsx`, `report-filters.ts`, `evidence-panel.tsx`, `finding-detail-dialog.tsx`, `severity-rail.tsx`, …) | Hero screen finally behaves like the verdict it is | Med-High — mitigated by logic-frozen extraction |
| Seal logomark + favicon/OG set ("Mavi Mühür" identity) | brand assets, `layout.tsx` metadata | Memorability | Low |
| Report workspace keyboard nav (j/k between findings, Enter to open) | `report/*` | Power-consultant speed | Med |

---

## G. Anti-patterns — what we will NOT do

1. **No dark mode (now).** Single-theme consistency beats a half-tested dark variant; consultants work in offices in daylight; risk-color semantics would need full re-verification on dark surfaces. Revisit only with user demand.
2. **No decorative graphics over tables or finding text.** Illustrations live in empty states, hero bands, terminal moments — never behind data a consultant must trust.
3. **No playful Turkish copy.** "Harika! 🎉" has no place in a customs compliance verdict. The all-clear says "Engelleyici bulgu yok." and stops.
4. **No animation over 400ms on routine UI, none blocking input.** The check-draw is the celebratory maximum; everything else is 150–250ms entrance easing, all disabled under `prefers-reduced-motion`.
5. **No severity conveyed by color alone, ever** — including the gauge: score number + level label always accompany the ring color.
6. **No second accent rampage.** Coral gets *assigned jobs* (quota pressure, beta marker, human-override accents); it does not become a general highlight color competing with severity semantics.
7. **No skeleton-screen theater on fast queries.** Server components render fast; faking latency with shimmer would reduce perceived performance.
8. **No marketing-gradient invasion.** The mesh texture stays inside the dashboard hero band; canvas remains matte warm stone everywhere else — that calm *is* the brand.

---

## H. Reference apps

| Product | Borrow | Reject |
|---|---|---|
| **Linear** | Motion discipline (entrance-only, fast easings); keyboard-first findings nav (later); typographic restraint | Dark-first aesthetic; density that assumes daily power users |
| **Stripe Dashboard** | Mono for identifiers; "object page" rigor (submission detail); restrained celebratory states (first-payment moment ≈ our all-clear) | Their scale of component abstraction — overkill at this codebase size |
| **Intercom** | Warm-neutral surfaces + one human accent (already the stated direction); illustration *system* with strict usage rules | Chat-bubble friendliness in copy — wrong register for customs law |
| **Notion** | Empty states that teach the next action | Gray-on-gray flatness; hover-revealed controls (hides actions from occasional users) |
| **Vercel** | Status/timeline clarity for pipelines (deploy steps ≈ our processing timeline) | Stark black/white minimalism — would read cold and "startup" against KVKK-enterprise expectations |

---

*Review by: design-critic pass over the full front-end source. All file references relative to repo root; line numbers verified against `cursor/gumrukyz-mvp-foundation` @ `db872c5`.*
