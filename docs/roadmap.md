# GümrükYZ — Implementation Roadmap

> **Status:** Active  
> **Last updated:** 2026-05-07  
> **Primary guide:** This file supersedes `outline_chatgpt.md` and `outline_claude.md` for all implementation decisions. Those files remain as reference material only.

---

## Table of Contents

1. [Product Purpose](#1-product-purpose)
2. [Scope Boundaries](#2-scope-boundaries)
3. [Architecture Decisions](#3-architecture-decisions)
4. [Final Data Model](#4-final-data-model)
5. [Rule Lifecycle](#5-rule-lifecycle)
6. [OCR Decision Tree](#6-ocr-decision-tree)
7. [Processing Pipeline State Machine](#7-processing-pipeline-state-machine)
8. [Fixture Inventory](#8-fixture-inventory)
9. [Sprint Plan](#9-sprint-plan)
10. [Knowledge Sources Registry](#10-knowledge-sources-registry)
11. [Deferred Items](#11-deferred-items)
12. [Environment Variables](#12-environment-variables)

---

## 1. Product Purpose

**Gümrük Beyanname Akıllı Kontrol Sistemi** is a pre-check and post-check assistant for customs brokerage offices.

It accepts a **document package** (invoice, packing list, transport doc, loading instruction, declaration output, origin/permit docs) for a single customs transaction and produces a **risk report** identifying:

- Missing required documents
- Mandatory field violations within a document
- Cross-document field inconsistencies
- Low-confidence extractions requiring manual review
- Declaration output mismatches against source documents

**This product does NOT:**
- Submit to or integrate with BİLGE / YKTS / TPS
- Replace a licensed customs broker
- Make legally binding customs decisions
- Store real personal data before KVKK controls are in place (Phase 4)

**First user:** Founder/internal use with synthetic or redacted documents only.

---

## 2. Scope Boundaries

### In scope for MVP (Phase 1–2)

- Import and export transaction types
- Document types: INVOICE, PACKING_LIST, LOADING_INSTRUCTION, TRANSPORT_DOC, DECLARATION_OUTPUT, ORIGIN_DOC, PERMIT_DOC, OTHER
- Manual file upload (PDF)
- Text-based PDF extraction (Tier 1 OCR)
- Universal mandatory-field rules (no broker expertise required)
- Cross-document consistency rules
- Risk report with per-finding explanation
- Override flow with reason capture
- Single internal tenant

### Out of scope for MVP

- BİLGE / TPS integration
- Keycloak / enterprise SSO
- Kubernetes
- Qdrant / external vector DB
- Celery / Redis worker topology
- Model training / fine-tuning
- Multi-language UI
- Mobile app
- Automated regulation crawling
- Transit, antrepo, geçici ithalat, dahilde/hariçte işleme (Phase 5+)

---

## 3. Architecture Decisions

| Concern | Decision | Rationale |
|---------|----------|-----------|
| Hosting | Vercel | Next.js native, zero-config CI/CD, marketplace |
| Database | Neon Postgres | Serverless, pgvector, Vercel integration, DB branching per PR |
| ORM | Prisma | Migrations, type safety, schema-as-source-of-truth |
| Auth | Clerk | Organizations = tenants, built-in RBAC, KVKK-compliant EU residency |
| AI / LLM | OpenAI GPT-4o via Vercel AI SDK | Best structured output, `generateObject` + Zod, provider abstraction |
| Async jobs | Trigger.dev | Durable pipelines >60s, retries, step observability, open-source |
| OCR Tier 1 | pdfjs-dist (pdf.js) | Text PDFs, TypeScript-native, zero cost |
| OCR Tier 2 | Python sidecar (PyMuPDF + Tesseract) on Railway | Scanned PDFs, open-source, free tier sufficient for MVP |
| OCR Tier 3 | Azure AI Document Intelligence (Phase 4) | Production scanned docs, KVKK Turkey North residency |
| File storage MVP | Vercel Blob | Zero-config, CDN, direct Vercel integration |
| File storage prod | Azure Blob Turkey North (Phase 4) | KVKK data residency in Turkey |
| UI components | shadcn/ui + Tailwind CSS | Composable, accessible, fast to build |
| Validation | Zod | Shared across API handlers and extraction schemas |
| Monorepo | pnpm workspaces + Turborepo | TypeScript-native, build caching |
| Error tracking | Sentry | First-class Vercel integration |
| Secondary LLM | Anthropic (placeholder) | Interface ready; implementation deferred |

### Monorepo layout

```
/
  apps/
    web/              Next.js 15 app (Vercel)
    ocr-service/      Python FastAPI + PyMuPDF + Tesseract (Railway)
  packages/
    db/               Prisma schema, migrations, seed, fixture runner
    domain/           Shared types, enums, state machines
    ai/               Vercel AI SDK wrapper, Zod extraction schemas, LlmProvider interface
    rules/            Rule definitions, evaluator, severity constants
    storage/          StorageProvider abstraction
    shared/           Logger, structured log format, errors, config
  fixtures/
    clean-import/     Synthetic clean import package
    missing-invoice/  Import package — invoice absent
    weight-mismatch/  Packing list vs declaration gross weight differ
    value-mismatch/   Invoice vs declaration total value differ
    low-confidence/   Scanned PDF with degraded quality
  docs/
    roadmap.md        ← this file
    outline_chatgpt.md
    outline_claude.md
    evaluation_report.md
    evaluation_report1.md
```

---

## 4. Final Data Model

### 4.1 Core tables

#### `tenants`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| clerk_org_id | text UNIQUE | Maps to Clerk Organization |
| name | text | |
| plan | text | 'internal' \| 'starter' \| 'pro' |
| data_classification_allowed | text[] | ['SYNTHETIC','REDACTED','REAL'] — what this tenant may upload |
| created_at | timestamptz | |
| updated_at | timestamptz | |

#### `users`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| tenant_id | uuid FK → tenants | |
| clerk_user_id | text UNIQUE | |
| email | text | |
| role | text | 'TENANT_USER' \| 'TENANT_MANAGER' \| 'PLATFORM_ADMIN' |
| created_at | timestamptz | |
| updated_at | timestamptz | |

#### `submissions`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| tenant_id | uuid FK → tenants | |
| created_by | uuid FK → users | |
| trade_flow | text | 'IMPORT' \| 'EXPORT' |
| title | text | User-supplied reference name |
| status | text | see processing state machine |
| data_classification | text | 'SYNTHETIC' \| 'REDACTED' \| 'REAL' |
| created_at | timestamptz | |
| updated_at | timestamptz | |

#### `documents`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| submission_id | uuid FK → submissions | |
| tenant_id | uuid FK → tenants | |
| doc_type | text | DocumentType enum |
| label | text | User-supplied label |
| is_required_guess | boolean | System's guess whether required |
| latest_version_id | uuid FK → document_versions (nullable) | |
| status | text | 'PENDING' \| 'PROCESSING' \| 'DONE' \| 'FAILED' |
| created_at | timestamptz | |

#### `document_versions`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| document_id | uuid FK → documents | |
| tenant_id | uuid FK → tenants | |
| version_number | integer | |
| file_url | text | StorageProvider URL |
| original_filename | text | |
| mime_type | text | |
| file_size_bytes | integer | |
| checksum_sha256 | text | |
| is_active | boolean | |
| uploaded_by | uuid FK → users | |
| uploaded_at | timestamptz | |

#### `document_extractions`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| document_version_id | uuid FK → document_versions | |
| tenant_id | uuid FK → tenants | |
| extraction_status | text | 'PENDING' \| 'DONE' \| 'FAILED' \| 'LOW_CONFIDENCE' |
| extraction_method | text | 'TEXT_PDF' \| 'OCR_PYTHON' \| 'OPENAI_VISION' \| 'AZURE_DOC_INTEL' |
| raw_text | text | Full text output |
| structured_json | jsonb | Normalized extraction result |
| confidence | float | 0–1 |
| provider_run_id | uuid FK → provider_runs (nullable) | |
| created_at | timestamptz | |

#### `declaration_snapshots`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| submission_id | uuid FK → submissions | |
| tenant_id | uuid FK → tenants | |
| source_document_version_id | uuid FK → document_versions | |
| declaration_number | text | |
| declaration_date | date | |
| regime_code | text | |
| incoterm | text | |
| total_value | numeric | |
| currency | text | ISO 4217 |
| total_net_weight | numeric | kg |
| total_gross_weight | numeric | kg |
| package_count | integer | |
| raw_json | jsonb | |
| created_at | timestamptz | |

#### `declaration_items`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| declaration_snapshot_id | uuid FK | |
| tenant_id | uuid FK → tenants | |
| line_number | integer | |
| gtip_code | text | 8-digit HS code |
| goods_description | text | |
| quantity | numeric | |
| unit | text | |
| net_weight | numeric | |
| gross_weight | numeric | |
| value | numeric | |
| currency | text | |

### 4.2 Rules / Reports tables

#### `source_documents`
Authoritative registry of all regulatory sources. Every ACTIVE rule references at least one row.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| title | text | Full official title |
| url | text | Public URL |
| source_type | text | 'LAW' \| 'REGULATION' \| 'CIRCULAR' \| 'INTERNATIONAL_STANDARD' |
| jurisdiction | text | 'TR' \| 'EU' \| 'WCO' \| 'ICC' \| 'IMO' \| 'IATA' |
| language | text | 'TR' \| 'EN' |
| effective_date | date | |
| last_verified_at | timestamptz | |
| raw_excerpt | text | Relevant excerpt stored for reference |
| created_at | timestamptz | |

#### `candidate_rules`
Staging area for rules authored via the admin panel before promotion.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| rule_code_draft | text | e.g. 'INV-007-draft' |
| description | text | |
| applies_to_doc_types | text[] | DocumentType values |
| field_checks | text[] | Field names being checked |
| severity | text | 'ERROR' \| 'WARNING' \| 'INFO' |
| status | text | 'DRAFT' \| 'IN_REVIEW' \| 'APPROVED' \| 'REJECTED' |
| source_document_id | uuid FK → source_documents (nullable) | |
| extracted_rationale | text | Why this rule exists, from source |
| ai_confidence | float | Confidence AI research had in this rule |
| reviewed_by | uuid FK → users (nullable) | |
| reviewed_at | timestamptz | |
| created_at | timestamptz | |

#### `rules`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| rule_code | text UNIQUE | e.g. 'INV-001' |
| name | text | Short display name |
| description | text | Full explanation |
| applies_to_doc_types | text[] | |
| field_checks | text[] | |
| severity | text | 'ERROR' \| 'WARNING' \| 'INFO' |
| explanation_template | text | Mustache-style template for rule result message |
| source_document_id | uuid FK → source_documents (nullable) | Required for ACTIVE |
| effective_from | date | |
| fixture_pass_ref | text | Path to passing fixture JSON |
| fixture_fail_ref | text | Path to failing fixture JSON |
| lifecycle_status | text | 'ACTIVE' \| 'DEPRECATED' |
| created_at | timestamptz | |
| updated_at | timestamptz | |

#### `rule_results`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| submission_id | uuid FK → submissions | |
| tenant_id | uuid FK → tenants | |
| rule_code | text | |
| severity | text | |
| result | text | 'PASS' \| 'WARN' \| 'FAIL' \| 'SKIP' \| 'REVIEW_NEEDED' |
| message | text | Rendered explanation |
| source_refs_json | jsonb | Which document/field triggered this |
| created_at | timestamptz | |

#### `risk_reports`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| submission_id | uuid FK → submissions | |
| tenant_id | uuid FK → tenants | |
| total_errors | integer | |
| total_warnings | integer | |
| total_review_needed | integer | |
| summary_text | text | AI-generated plain-language summary |
| snapshot_json | jsonb | Full report snapshot at generation time |
| generated_at | timestamptz | |

#### `override_actions`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| rule_result_id | uuid FK → rule_results | |
| tenant_id | uuid FK → tenants | |
| overridden_by | uuid FK → users | |
| reason | text | Mandatory |
| original_result | text | |
| new_result | text | |
| created_at | timestamptz | |

### 4.3 Ops / Audit tables

#### `audit_logs`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| tenant_id | uuid FK → tenants (nullable) | |
| user_id | uuid FK → users (nullable) | |
| action | text | e.g. 'submission.created', 'document.uploaded', 'rule_result.overridden' |
| entity_type | text | |
| entity_id | uuid | |
| before_json | jsonb | |
| after_json | jsonb | |
| ip_address | text | |
| created_at | timestamptz | |

#### `provider_runs`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| tenant_id | uuid FK → tenants | |
| provider | text | 'openai' \| 'anthropic' \| 'azure_doc_intel' \| 'ocr_python' |
| model | text | e.g. 'gpt-4o' |
| operation | text | e.g. 'extract_invoice', 'classify_document', 'risk_summary' |
| input_tokens | integer | |
| output_tokens | integer | |
| estimated_cost_usd | numeric | |
| duration_ms | integer | |
| status | text | 'OK' \| 'ERROR' |
| error_message | text | |
| created_at | timestamptz | |

#### `processing_jobs`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| submission_id | uuid FK → submissions | |
| tenant_id | uuid FK → tenants | |
| trigger_job_id | text | Trigger.dev job ID |
| status | text | See state machine below |
| current_step | text | |
| error_message | text | |
| started_at | timestamptz | |
| completed_at | timestamptz | |
| updated_at | timestamptz | |

---

## 5. Rule Lifecycle

```
DRAFT → IN_REVIEW → APPROVED → ACTIVE → DEPRECATED
```

### Transitions

| From | To | Required |
|------|----|----------|
| DRAFT | IN_REVIEW | source_document_id linked |
| IN_REVIEW | APPROVED | fixture_pass_ref AND fixture_fail_ref set; fixture runner passes |
| IN_REVIEW | REJECTED | Reviewer decision |
| APPROVED | ACTIVE | Platform admin activation |
| ACTIVE | DEPRECATED | Replacement rule exists or regulation invalidated |

### Enforcement

- The admin panel **disables** the "Promote to APPROVED" button unless both fixture refs are set and fixture runner returns green.
- The rule evaluator **skips** any rule not in ACTIVE status silently (no error; no result entry).
- DEPRECATED rules are never deleted — they remain for audit purposes.

### AI research loop (developer workflow only)

1. Developer researches regulation using GPT-4o externally
2. Developer opens admin rule panel → "New Candidate Rule"
3. Enters: rule code draft, description, applies_to, field_checks, severity, extracted rationale, source URL + date
4. System saves as `candidate_rules` row with status DRAFT
5. Developer writes or generates fixtures (clean JSON extraction + error-injected JSON)
6. Developer links fixture files → promotes to IN_REVIEW
7. Developer runs `pnpm --filter @gumrukyz/rules test:fixtures` → must pass
8. Developer promotes to APPROVED in admin panel
9. Platform admin activates

---

## 6. OCR Decision Tree

```
Document uploaded
       │
       ▼
Is MIME type application/pdf?
  ├─ NO  → Mark as UNSUPPORTED; REVIEW_NEEDED
  └─ YES ▼
         Try pdfjs-dist text extraction
                │
                ▼
         text_length > 100 chars AND confidence > 0.6?
           ├─ YES → Use text extraction result (Tier 1)
           └─ NO  ▼
                  Call Python OCR sidecar (PyMuPDF + Tesseract)
                         │
                         ▼
                  ocr_confidence > 0.5?
                    ├─ YES → Use OCR result (Tier 2)
                    └─ NO  → Mark extraction_status = LOW_CONFIDENCE
                             Add REVIEW_NEEDED rule result
                             Save partial result; continue pipeline
```

### Confidence scoring

- Text extraction: `min(text_length / 500, 1.0)` × readability score from heuristic (no garbled chars)
- OCR: Tesseract returns per-page confidence; use mean of all pages
- Low-confidence threshold: `< 0.5`
- Ambiguous threshold: `0.5–0.7` → extract but flag with `LOW_CONFIDENCE` status

---

## 7. Processing Pipeline State Machine

```
PENDING → UPLOADED → CLASSIFYING → EXTRACTING → NORMALIZING → RUNNING_RULES → GENERATING_REPORT → COMPLETED
                                                                                                   → FAILED (from any state)
```

### State definitions

| State | Meaning |
|-------|---------|
| PENDING | Submission created; no files yet |
| UPLOADED | All files stored in storage; processing not started |
| CLASSIFYING | Document type classification in progress |
| EXTRACTING | OCR/text extraction running per document |
| NORMALIZING | Structured JSON normalization per document type |
| RUNNING_RULES | Rule engine evaluating all applicable rules |
| GENERATING_REPORT | Risk report assembly + AI summary generation |
| COMPLETED | Report available; no further processing |
| FAILED | Unrecoverable error; error_message populated |

### Failure behavior

- Any step that throws an unrecoverable error → write FAILED to `processing_jobs`, write structured error to `audit_logs`, surface error state in UI
- Low-confidence extraction is NOT a failure; it produces a REVIEW_NEEDED rule result and continues
- AI extraction failure (OpenAI API error) → fall back to field-only extraction from raw text with lower confidence; continue pipeline

---

## 8. Fixture Inventory

All fixtures are synthetic (AI-generated) or redacted. No real customer data.

### clean-import

**Purpose:** Baseline — a valid complete import package with no errors  
**Files:** `invoice.json`, `packing_list.json`, `transport_doc.json`, `loading_instruction.json`  
**Expected rule results:** 0 FAIL, 0 WARN, 0 REVIEW_NEEDED

### missing-invoice

**Purpose:** Validates document presence rule PRES-001  
**Files:** `packing_list.json`, `transport_doc.json` (no invoice)  
**Expected:** PRES-001 → FAIL

### weight-mismatch

**Purpose:** Validates cross-document rule CROSS-002  
**Files:** `invoice.json`, `packing_list.json` (gross_weight=1250), `declaration_output.json` (gross_weight=1340)  
**Expected:** CROSS-002 → FAIL

### value-mismatch

**Purpose:** Validates cross-document rule CROSS-001  
**Files:** `invoice.json` (total_amount=42500 USD), `declaration_output.json` (total_value=39000 USD)  
**Expected:** CROSS-001 → FAIL

### low-confidence

**Purpose:** Validates REVIEW_NEEDED surfacing for bad OCR  
**Files:** `scanned_invoice_degraded.pdf` (image-only, degraded quality)  
**Expected:** extraction_status=LOW_CONFIDENCE; rule result=REVIEW_NEEDED; no FAIL from bad data

---

## 9. Sprint Plan

### Sprint 0 — Pre-scaffold (Week 0) ✓ DONE
- [x] Write `docs/roadmap.md`
- [x] Stage planning documents
- [x] Create branch `cursor/gumrukyz-mvp-foundation`

### Sprint 1 — Monorepo + DB + Auth (Weeks 1–2)

**Goal:** Running Next.js app with Clerk auth, Neon DB, complete Prisma schema deployed on Vercel

Acceptance criteria:
- `pnpm dev` starts the web app locally
- Clerk login/logout works; user object available in server components
- `prisma migrate dev` runs cleanly against Neon dev branch
- All tables from section 4 exist with correct relations
- `DATABASE_URL` in `.env.local` only; never committed

Tasks:
- [ ] `pnpm init` root; `pnpm-workspace.yaml`; Turborepo config
- [ ] `create-next-app` in `apps/web`; TypeScript strict; Tailwind; shadcn/ui init
- [ ] `packages/shared` — logger, structured log format, error classes
- [ ] `packages/domain` — all enums, DocumentType, SubmissionStatus, RuleLifecycle
- [ ] `packages/db` — Prisma schema, all tables from section 4
- [ ] Neon project + dev branch; `DATABASE_URL` in `.env.local`
- [ ] `prisma migrate dev --name init`
- [ ] Clerk app; Clerk middleware in Next.js; sign-in/sign-up pages
- [ ] `packages/db` seed: create internal tenant, admin user
- [ ] Vercel project linked; env vars in Vercel dashboard

### Sprint 2 — File Upload + Extraction Pipeline (Weeks 3–4)

**Goal:** User can upload PDF files; system extracts text; documents stored in DB

Acceptance criteria:
- File upload to Vercel Blob works; `document_versions` row created
- `pdfjs-dist` extracts text from text-based PDFs
- `document_extractions` row written with `extraction_method='TEXT_PDF'`
- Trigger.dev job runs; all state transitions written to `processing_jobs`

Tasks:
- [ ] `packages/storage` — `StorageProvider` interface + `VercelBlobProvider`
- [ ] File upload API route
- [ ] Submission creation flow (API + UI)
- [ ] Document upload UI (type selection + drag/drop)
- [ ] `pdfjs-dist` extraction in Node.js
- [ ] Trigger.dev project; job definition with all pipeline steps (stubs ok)
- [ ] State machine written to `processing_jobs` on each step
- [ ] Confidence scoring heuristic

### Sprint 3 — Rule Engine v1 + Fixtures (Weeks 5–6)

**Goal:** 15 rules running against fixture data; all fixtures produce expected results

Acceptance criteria:
- All 5 fixture sets load and process without errors
- Fixture runner `pnpm --filter @gumrukyz/rules test:fixtures` passes
- Each rule has `fixture_pass_ref` and `fixture_fail_ref` set
- `rule_results` rows written after each submission processing

Tasks:
- [ ] `packages/rules` — `RuleEvaluator`, `RuleDefinition` type, `RuleSeverity` enum
- [ ] Implement PRES-001, PRES-002 (document presence)
- [ ] Implement INV-001…INV-006 (invoice mandatory fields)
- [ ] Implement PL-001, PL-002 (packing list mandatory fields)
- [ ] Implement GTIP-001 (HS code format)
- [ ] Create all 5 fixture JSON sets
- [ ] Fixture runner script
- [ ] `risk_reports` assembly function
- [ ] Basic risk report page (list of findings)

### Sprint 4 — AI Extraction + Cross-Document Rules (Weeks 7–8)

**Goal:** OpenAI extracts structured data; cross-document rules run; full risk report visible

Acceptance criteria:
- `generateObject` + Zod schema produces typed extraction for INVOICE, PACKING_LIST, TRANSPORT_DOC, DECLARATION_OUTPUT
- CROSS-001…CROSS-005 rules produce correct results against fixtures
- Provider run metadata saved to `provider_runs`
- AI-generated plain-language risk summary rendered in report

Tasks:
- [ ] `packages/ai` — `LlmProvider` interface, `OpenAIProvider`, `AnthropicPlaceholder`
- [ ] Zod extraction schemas per document type
- [ ] `generateObject` pipeline integrated into Trigger.dev extraction step
- [ ] CROSS-001…CROSS-005 rule implementations
- [ ] `provider_runs` logging
- [ ] Risk summary prompt + rendering
- [ ] Full risk report UI (severity badges, source refs, override button)

### Sprint 5 — Admin Panel + Override Flow (Week 9–10)

**Goal:** TENANT_MANAGER can override findings; PLATFORM_ADMIN can manage rules

Acceptance criteria:
- Override action captured with mandatory reason; `override_actions` row written
- `audit_logs` written for every data mutation
- Admin rule panel lists all rules with lifecycle status
- DRAFT → IN_REVIEW → APPROVED → ACTIVE promotion blocked until fixtures verified

Tasks:
- [ ] Override flow UI + API
- [ ] `audit_logs` write helper used on all mutations
- [ ] Admin rule panel (list, edit, promote)
- [ ] Fixture verification gate in promotion flow
- [ ] `candidate_rules` creation form

### Sprint 6 — OCR Sidecar + Hardening (Weeks 11–12)

**Goal:** Scanned PDFs handled; structured logging complete; Sentry integrated

Acceptance criteria:
- Python OCR sidecar processes scanned PDF fixture; confidence score returned
- `low-confidence` fixture produces REVIEW_NEEDED result (not FAIL)
- Sentry captures errors and sends to dashboard
- All secrets confirmed absent from codebase

Tasks:
- [ ] `apps/ocr-service` — FastAPI + PyMuPDF + Tesseract
- [ ] Deploy OCR sidecar to Railway
- [ ] Tier 2 OCR path in Trigger.dev pipeline
- [ ] Sentry integration (Next.js + Trigger.dev)
- [ ] Secret audit (no hardcoded keys)
- [ ] README and local dev setup docs

---

## 10. Knowledge Sources Registry

Seed rows for `source_documents` table. Insert via `packages/db/seed.ts`.

| Title | URL | Type | Jurisdiction | Effective date |
|-------|-----|------|--------------|----------------|
| 4458 Sayılı Gümrük Kanunu | https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=4458&MevzuatTur=1&MevzuatTertip=5 | LAW | TR | 1999-11-04 |
| Gümrük Yönetmeliği | https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=25407&MevzuatTur=9&MevzuatTertip=5 | REGULATION | TR | 2006-10-07 |
| Türk Gümrük Tarife Cetveli | https://www.ticaret.gov.tr/dis-ticaret/urun-klasifikasyon-ve-gtip | REGULATION | TR | 2024-01-01 |
| ICC Incoterms 2020 | https://iccwbo.org/business-solutions/incoterms-rules/incoterms-2020/ | INTERNATIONAL_STANDARD | ICC | 2020-01-01 |
| WCO HS Nomenclature 2022 | https://www.wcoomd.org/en/topics/nomenclature/instrument-and-tools/hs-nomenclature-2022-edition.aspx | INTERNATIONAL_STANDARD | WCO | 2022-01-01 |
| FIATA Bill of Lading Model Rules | https://fiata.org/transport-documents/ | INTERNATIONAL_STANDARD | ICC | 2017-01-01 |

---

## 11. Deferred Items

The following are explicitly out of scope until business requirements justify them. Do not add these without updating this file.

- BİLGE / YKTS / TPS API integration
- Keycloak / SAML SSO (Clerk enterprise handles this)
- Kubernetes deployment
- Qdrant or any external vector database
- Celery / Redis worker topology
- Model training / fine-tuning on customs documents
- Automated regulation corpus crawling (developer workflow only)
- Transit, antrepo, geçici ithalat, dahilde/hariçte işleme regimes
- Mobile application
- Multi-language UI (Turkish is the working language)
- Azure full compute migration (Phase 4+ only, triggered by first REAL submission)
- ISO 27001 certification (Phase 5)

---

## 12. Environment Variables

All secrets in `.env.local` (local dev) and Vercel environment variables (production). Never committed.

```env
# Database
DATABASE_URL=                        # Neon connection string
DATABASE_URL_UNPOOLED=               # Neon direct connection (for migrations)

# Auth
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard

# Storage
BLOB_READ_WRITE_TOKEN=               # Vercel Blob token

# AI
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o
ANTHROPIC_API_KEY=__PLACEHOLDER__
ANTHROPIC_ENABLED=false

# Async jobs
TRIGGER_SECRET_KEY=
NEXT_PUBLIC_TRIGGER_PUBLIC_API_KEY=

# OCR sidecar
OCR_SERVICE_URL=                     # Python sidecar base URL
OCR_SERVICE_SECRET=                  # Shared secret for sidecar auth

# Observability
SENTRY_DSN=
SENTRY_AUTH_TOKEN=                   # For source map upload

# Internal
INTERNAL_TENANT_CLERK_ORG_ID=        # The single internal Organization ID
```
