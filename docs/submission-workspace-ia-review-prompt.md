# Agent prompt: Submission workspace — detailed IA & implementation plan

Copy everything below the line into a new Agent or Plan mode chat.

---

# Task: Produce a very detailed plan for the best submission workspace UX

You are a senior product designer + frontend architect reviewing **GümrükYZ**, a Turkish customs brokerage pre-check tool. The product accepts a document package for one customs transaction and produces a risk report with an action checklist, expert review, and evidence panel.

## What the founder wants

The founder believes the current **multi-page submission flow is not the best architecture** (separate pages for uploading/starting analysis vs. working the action list). They want you to:

1. **Review the current UX/IA thoroughly**
2. **Evaluate alternatives**
3. **Pick the single best solution** (not a vague "it depends" — commit to one recommendation with clear rationale)
4. **Deliver a very detailed plan** for implementing that best solution

**Do not implement code.** The deliverable is an exhaustive, actionable plan detailed enough that another engineer or agent could execute it in phases without re-deciding the architecture.

If you identify trade-offs, resolve them in your recommendation. Only list open questions when a founder business decision is truly required (max 5).

---

## Product context

- **Users:** Customs brokers / operations staff in Turkey (Turkish UI, `lang="tr"`)
- **Core job-to-be-done:** Upload trade documents → validate AI classification → run analysis → work through findings → optionally request expert review → export PDF/JSON
- **Important lifecycle events:**
  - Adding documents after a report exists marks the report **stale** and may trigger re-analysis (possibly billing a credit)
  - Replacing a document from the report can auto-reclassify and auto-reanalyze, or require manual re-validation
  - During re-analysis, the old report stays visible as read-only reference
- **Out of scope for this review:** Rule engine logic, OCR pipeline internals — unless UI consolidation clearly requires a small API surface change (call those out explicitly if needed)

Read `docs/roadmap.md` (Product Purpose) and `docs/design-review-2026-06-10.md` for prior UX critique and design token context.

---

## Current architecture (what exists today)

### Routes & pages

| Route | Role |
|-------|------|
| `/submissions/new` | Create submission (title only) → redirects to documents |
| `/submissions/[id]` | **Submission hub** — status timeline, document list (read-only), links to other pages |
| `/submissions/[id]/documents` | **Upload + classify + validate + start analysis** — primary pre-report workflow |
| `/submissions/[id]/report` | **Action list (Aksiyon listesi)** — findings checklist, evidence panel, expert review, AI assistant, document replace, PDF/JSON export |

### Key files to read first

**Navigation & state routing:**
- `apps/web/src/lib/submission-status.ts` — `resolveSubmissionNextAction()` decides whether user goes to `documents` or `report`
- `apps/web/src/app/(dashboard)/submissions/[id]/submission-next-step.tsx` — CTA banner/button that deep-links between pages

**Pre-report workflow (828+ lines, heavy client component):**
- `apps/web/src/app/(dashboard)/submissions/[id]/documents/page.tsx`
- `apps/web/src/app/(dashboard)/submissions/[id]/documents/upload-client.tsx`
  - Upload, drag-drop, classify, validate trade flow + doc types + client match
  - "Sıradaki adım" next-action banner with blocking reasons
  - Start analysis with progress polling
  - Handles stale-report re-analysis after document changes

**Post-report workflow (~1200 lines):**
- `apps/web/src/app/(dashboard)/submissions/[id]/report/page.tsx` — server data assembly
- `apps/web/src/app/(dashboard)/submissions/[id]/report/report-workspace.tsx` — main UI
  - Action checklist (incomplete/completed findings)
  - Document coverage panel
  - Evidence panel + replace document
  - Expert review card, suggestion chips, AI assistant chat
  - Stale report banner with link back to documents for validation
- Supporting: `evidence-panel.tsx`, `document-coverage-panel.tsx`, `expert-review-button.tsx`, `assistant-chat.tsx`

**Submission hub (partial duplicate):**
- `apps/web/src/app/(dashboard)/submissions/[id]/page.tsx` — status + read-only doc list + CTAs

### Known pain points (from prior design review + code inspection)

1. **Split mental model:** Users upload/start on `/documents`, then work findings on `/report`. Adding docs or replacing files may send them back to `/documents` for validation.
2. **Three pages for one "dossier":** Hub (`/submissions/[id]`) is a third stop that mostly links elsewhere.
3. **Duplicate next-step logic:** `upload-client.tsx` has its own `getNextAction()`; `submission-status.ts` has `resolveSubmissionNextAction()` — may diverge.
4. **Report page can't upload new docs** — only replace existing ones; "Belge Ekle" lives on hub/documents.
5. **Mobile gap:** Evidence panel hidden below `xl` breakpoint on report page.
6. **No single "dossier status" view** that shows documents + pipeline progress + findings severity at once.
7. **Re-analysis UX is fragmented:** Replace on report → maybe validate on documents → analysis progress shown in different places.

### Backend behaviors the UI must respect

- Classification requires human validation before analysis (`classificationStatus: VALIDATED`)
- Processing blocked while `isProcessingActive` or `classificationStatus === 'RUNNING'`
- `reportStaleAt` makes report read-only until re-analysis completes
- Entitlements: re-analysis may consume analysis credits (`willChargeAnalysis` in entitlements)
- Expert reviews can be superseded after reprocess

Relevant API routes:
- `POST /api/submissions/[id]/documents` — add document
- `POST /api/submissions/[id]/documents/[documentId]/versions` — replace file
- `POST /api/submissions/[id]/classify`, `PATCH /api/submissions/[id]/classification`
- `POST /api/submissions/[id]/process`

---

## Your analysis process

### Step 1 — Understand current state

Map these user journeys step-by-step (every page transition, dead end, context loss):

- **A.** First-time: new submission → upload → classify → validate → analyze → work checklist
- **B.** Return visit: open completed submission, work remaining checklist items
- **C.** Fix a finding: replace document from report → re-validate? → re-analyze → resume checklist
- **D.** Add missing document after report (e.g. packing list was missing)
- **E.** Failed analysis recovery
- **F.** Expert review request while checklist incomplete vs complete

### Step 2 — Evaluate options briefly, then commit

Compare at least 3 IA approaches (multi-page improved, single unified workspace, two-page split, progressive disclosure, etc.). Use a comparison table.

Then **select one winner** and explain why it beats the alternatives for GümrükYZ's broker users. Do not present multiple equally-weighted recommendations.

### Step 3 — Write the very detailed plan for the winning solution

This is the core deliverable. The plan must be **implementation-grade**, not high-level UX fluff.

---

## Required deliverable: very detailed plan (winning solution only)

Structure your final output as follows. **Sections 4–9 are the most important — go deep.**

### 1. Executive summary (½ page)
- One-sentence recommendation
- Why this is the best solution
- Expected user impact
- Estimated engineering effort (T-shirt: S/M/L/XL with week ranges)

### 2. Current-state diagnosis (concise)
- Journey maps for A–F (can use mermaid)
- Problems ranked P0 / P1 / P2

### 3. Options considered (concise)
- Comparison table of 3+ options
- **Decision:** which option wins and why (1–2 paragraphs)

### 4. Target information architecture ⭐ DETAILED
- Final URL structure (keep, merge, or redirect old routes)
- Page vs layout vs tab vs panel hierarchy
- Navigation model (sidebar within dossier? sticky stepper? command deck?)
- What happens to `/submissions/[id]`, `/documents`, `/report` — be explicit
- Deep-linking and bookmark behavior
- Breadcrumb / back navigation rules

### 5. Target UI specification ⭐ VERY DETAILED
For the **recommended single workspace** (or chosen structure), specify every major region:

#### 5.1 Global header
- Fields shown (title, trade flow, client, status badge, dates)
- Primary CTA per submission state (matrix: status × classificationStatus × reportStale × hasReport)
- Secondary actions (export, expert review, settings)
- Billing disclosure placement for re-analysis

#### 5.2 Document panel / zone
- Upload UX (inline vs drawer vs modal)
- Document list columns/fields (type, confidence, validated, ignored, replace, version)
- Add document + replace document flows **without leaving the workspace**
- Classification + validation UX (inline expand vs dedicated step)
- Document coverage visualization placement

#### 5.3 Pipeline / progress zone
- How classification and analysis progress display
- Polling/resume behavior (reference existing `submission-status-poll.ts`, `submission-next-step.tsx`)
- Failed state recovery UI
- Stale report banner behavior (no redirect to another page)

#### 5.4 Findings / action list zone
- Checklist layout (keep kanban vs single list vs severity rail — recommend one)
- Incomplete vs completed grouping
- Finding detail (inline expand vs dialog — reference `finding-detail-dialog.tsx`)
- Checklist notes, overrides, read-only rules when stale/processing
- "All clear" success state

#### 5.5 Evidence & context zone
- Category filters, source documents, mevzuat citations
- Mobile strategy (fix current xl-hidden evidence panel gap)

#### 5.6 Expert review & AI assistant zone
- Placement relative to checklist (sidebar, bottom sheet, tab)
- When expert review is disabled/hidden

#### 5.7 Responsive behavior ⭐ DETAILED
- Breakpoint behavior for mobile / tablet / desktop
- What collapses, what becomes a tab, what becomes a drawer
- Touch targets and one-handed mobile use

Include **ASCII wireframes** or **mermaid diagrams** for:
- Desktop layout (default)
- Mobile layout
- At least 3 state variants: (1) pre-analysis, (2) post-analysis active work, (3) stale/re-analyzing

### 6. State machine & UX rules ⭐ VERY DETAILED
Define behavior for every meaningful state combination:

| Dimension | Values |
|-----------|--------|
| `submission.status` | PENDING, UPLOADED, CLASSIFYING, EXTRACTING, … COMPLETED, FAILED |
| `classificationStatus` | PENDING, RUNNING, AWAITING_VALIDATION, VALIDATED |
| `reportStaleAt` | null / set |
| `hasReport` | true / false |
| Active processing job | yes / no |

Produce:
- **Visibility matrix:** which UI regions are shown/enabled/hidden/read-only per state
- **Primary CTA matrix:** exact button label + action per state (Turkish copy)
- **Unified next-step logic:** propose one source of truth replacing duplicated `getNextAction()` / `resolveSubmissionNextAction()` — function signature and decision tree
- Edge cases: add doc mid-checklist, replace during expert review pending, entitlement exhausted, concurrent tab

### 7. Component & file architecture ⭐ VERY DETAILED
Propose a concrete target file tree, e.g.:

```
apps/web/src/app/(dashboard)/submissions/[id]/
  workspace/
    page.tsx                    # server shell + data loading
    submission-workspace.tsx    # client orchestrator
    panels/
      documents-panel.tsx
      pipeline-panel.tsx
      findings-panel.tsx
      evidence-panel.tsx
      expert-panel.tsx
    hooks/
      use-submission-workspace-state.ts
      use-submission-actions.ts
```

For each proposed file:
- **Responsibility** (1–2 sentences)
- **Source components to extract/reuse** (map from existing files — be specific: "move `ReplaceDocumentControl` from report-workspace.tsx")
- **New shared types** needed
- **Server vs client boundary**

List components that stay unchanged, move as-is, or get refactored.

### 8. Phased implementation plan ⭐ VERY DETAILED
Minimum **3 phases**, each with:

- **Goal**
- **Duration estimate**
- **Tasks** (checkbox list, ordered, file-level where possible)
- **Acceptance criteria** (testable)
- **Rollback / feature-flag strategy** if applicable
- **What users see after this phase ships** (important — each phase should deliver visible value OR be internal-only with justification)

Example phase structure (adapt to your recommendation):

| Phase | Focus |
|-------|--------|
| Phase 1 | Shared layout shell + unified next-step without route merge |
| Phase 2 | Route consolidation + document actions in workspace |
| Phase 3 | Mobile, polish, remove deprecated pages |

Include a **migration / redirect plan** for old URLs (`/documents`, `/report`).

### 9. Data loading & performance
- What the server component fetches vs client polls
- Avoid duplicate polling (current issue: multiple `SubmissionNextStep` instances)
- Lazy-load heavy panels (assistant, expert review)?
- Suspense / skeleton strategy

### 10. Copy & microcopy (Turkish)
- Key strings for banners, CTAs, empty states, stale report, re-analysis billing
- Tone: professional broker, not consumer

### 11. Success metrics & validation
- Task completion proxies
- Usability test script (5 tasks for a Turkish broker)
- What to A/B or measure post-launch

### 12. Open questions for founder (max 5)
Only genuine business decisions — not technical choices you can make yourself.

---

## Constraints & principles

- Turkish UI copy; professional broker tone
- Compliance-adjacent: informational disclaimer always visible where appropriate
- **Prefer composing existing components** over full rewrite — but the plan may include justified rewrites
- Do not remove human-in-the-loop classification validation
- KVKK awareness — no unnecessary document exposure
- Match existing design system (`apps/web/src/app/globals.css`, `apps/web/src/components/ui/`)
- Customs-specific visual identity is a plus but **clarity beats decoration**

---

## Quality bar

The founder should be able to hand your plan to an implementation agent and say "build Phase 1" without a follow-up architecture meeting.

If any section is thin, you have not finished. **Sections 4–8 must be the longest and most specific parts of your response.**

Start by reading the key files listed above, then produce the full report.
