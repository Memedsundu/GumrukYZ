# Gümrük Beyanname Akıllı Kontrol Sistemi — Tam Uygulama Outline'ı

> **Belge amacı:** Bu belge, gümrük beyanname hata tespit platformunun sıfırdan üretime çıkana kadar her adımını, kullanılacak her teknolojiyi, her veri tabanı tablosunu, her API endpoint'ini, her servis konfigürasyonunu ve ileriye dönük model eğitim stratejisini kapsamaktadır.

---

## İçindekiler

1. [Proje Genel Yapısı ve Prensipler](#1)
2. [Teknoloji Stack'i — Tam Liste](#2)
3. [Sistem Mimarisi](#3)
4. [Monorepo Yapısı ve Klasör Düzeni](#4)
5. [Veritabanı Tasarımı — Tam Şema](#5)
6. [Dosya İşleme Pipeline'ı (Ingestion)](#6)
7. [OCR Katmanı — Hibrit Strateji](#7)
8. [Kural Motoru (Rule Engine)](#8)
9. [Mevzuat RAG Katmanı](#9)
10. [LLM Entegrasyon Katmanı](#10)
11. [Backend API — FastAPI](#11)
12. [Async İşleme — Celery + Redis](#12)
13. [Frontend — Next.js](#13)
14. [Authentication ve RBAC](#14)
15. [Multi-Tenancy Mimarisi](#15)
16. [Mevzuat Senkronizasyon Pipeline'ı](#16)
17. [Kendi Modelini Eğitme Stratejisi](#17)
18. [KVKK ve Veri Güvenliği](#18)
19. [Monitoring, Logging ve Alerting](#19)
20. [CI/CD ve Test Stratejisi](#20)
21. [Deployment — Production Kurulum](#21)
22. [Faz Planı ve Milestone'lar](#22)

---

## 1. Proje Genel Yapısı ve Prensipler {#1}

### 1.1 Temel Tasarım Prensipleri

**Kural motoru birincil, LLM ikincil.** Hata tespiti kural motoruyla yapılır; LLM yalnızca açıklama ve özet üretir. Bu prensibin tek istisnası yoktur.

**Her uyarı savunulabilir olmalıdır.** Sistemin ürettiği her uyarı; hangi kural, hangi alan, hangi mevzuat maddesi, hangi belge referansı diye sorulduğunda yanıt verebilmelidir.

**LLM olmadan sistem çalışabilir.** LLM bir katman olarak eklenmiştir, kritik yol üzerinde değildir. API timeout veya servis kesintisinde kural motoru + risk raporu çıktı vermeye devam eder.

**Tüm kararlar kayıt altına alınır.** Operatörün her override'ı, her onayı, hangi kullanıcının hangi saatte hangi kararı aldığı append-only audit log'a yazılır.

**Multi-tenant sıfırdan.** İlk satır koddan itibaren `tenant_id` her tabloda vardır, PostgreSQL Row-Level Security aktiftir.

### 1.2 Sistemin Çözdüğü Problem Hiyerarşisi

```
Seviye 1 — Veri uyumsuzluğu      (kural motoru, deterministik)
Seviye 2 — Eksik alan/referans   (kural motoru, deterministik)
Seviye 3 — Mantık anomalisi      (kural motoru + istatistik)
Seviye 4 — Yorum riski           (LLM + RAG, öneri niteliğinde)
Seviye 5 — Örüntü anomalisi      (ML modeli, Faz 2+)
```

---

## 2. Teknoloji Stack'i — Tam Liste {#2}

### 2.1 Backend

| Katman | Teknoloji | Versiyon | Gerekçe |
|---|---|---|---|
| Ana dil | Python | 3.12 | Async, AI/ML ekosistemi |
| Web framework | FastAPI | 0.111+ | Async-native, otomatik OpenAPI |
| Veri doğrulama | Pydantic | v2 | Tip güvenli schema'lar |
| ORM | SQLAlchemy | 2.0 (async) | Async ORM, PostgreSQL uyumu |
| Migration | Alembic | latest | Schema versiyonlama |
| Task queue | Celery | 5.3+ | Async iş kuyruğu |
| Message broker | Redis | 7.x | Celery broker + cache |
| Canlı bildirim | Redis Pub/Sub + SSE | — | Gerçek zamanlı UI güncellemesi |

### 2.2 Veritabanları

| Veritabanı | Kullanım Amacı | Gerekçe |
|---|---|---|
| PostgreSQL 16 | Ana veri tabanı | ACID, RLS, JSONB, full-text search |
| Redis 7 | Cache + broker + session | Hız, TTL, pub/sub |
| Qdrant | Vektör veritabanı (RAG) | Self-host, Türkiye bölgesi, KVKK |

**MongoDB kullanılmıyor.** PostgreSQL'in JSONB kolonları serbest yapılı verileri yeterince karşılar, tek veritabanı operasyonel yükü düşürür.

### 2.3 OCR ve Belge İşleme

| Araç | Ne Zaman | Neden |
|---|---|---|
| PyMuPDF (fitz) | Text-based PDF parse | Hızlı, OCR gerektirmez |
| pdfplumber | Tablo çıkarımı (text PDF) | Tablo koordinat hassasiyeti |
| PaddleOCR | Taranmış PDF, Türkçe | GPU destekli, iyi Türkçe model |
| Surya | Karmaşık layout | 2024 SotA, layout-aware |
| Azure Document Intelligence | Sadece kritik form/tablo | Ticari kalite, eğitilebilir |
| img2pdf + pdf2image | PDF ↔ görüntü dönüşüm | Pipeline hazırlık |
| OpenCV | Görüntü ön işleme | Döndürme, gürültü temizleme |

### 2.4 AI / LLM

| Araç | Rol | Model |
|---|---|---|
| LangChain | LLM orkestrasyon | Soyutlama katmanı |
| LlamaIndex | RAG pipeline | Chunk + retrieval |
| OpenAI SDK | Birincil LLM | gpt-4o / gpt-4o-mini |
| Anthropic SDK | Yedek LLM | claude-sonnet-4-6 |
| Sentence Transformers | Embedding üretimi | all-MiniLM-L6-v2 + türkçe fine-tune |
| HuggingFace Transformers | Model eğitimi | Gelecek faz |
| Weights & Biases | Deney takibi | Model eğitim monitoring |

### 2.5 Frontend

| Araç | Versiyon | Gerekçe |
|---|---|---|
| Next.js | 14 (App Router) | SSR, streaming, TypeScript |
| React | 18 | Concurrent features |
| TypeScript | 5.x | Tip güvenliği |
| Tailwind CSS | 3.x | Utility-first, hızlı geliştirme |
| shadcn/ui | latest | Radix tabanlı, accessibility |
| TanStack Query | v5 | Server state yönetimi |
| Zustand | 4.x | Client state |
| PDF.js | latest | Tarayıcıda PDF render |
| React PDF Highlighter | — | PDF üzerinde annotation |

### 2.6 Infrastructure

| Araç | Kullanım |
|---|---|
| Docker | Container |
| Docker Compose | Local + staging |
| Kubernetes (K8s) | Production orchestration |
| Azure Turkey North | Cloud provider (KVKK) |
| Azure Blob Storage | Dosya depolama |
| Azure Container Registry | Docker image registry |
| Keycloak | Identity provider (self-host) |
| Nginx | Reverse proxy |
| GitHub Actions | CI/CD |
| Grafana | Monitoring dashboard |
| Prometheus | Metrics |
| Loki | Log aggregation |
| Sentry | Hata takibi |

---

## 3. Sistem Mimarisi {#3}

### 3.1 Yüksek Seviye Bileşenler

```
┌─────────────────────────────────────────────────────────────┐
│                        INTERNET                             │
└─────────────────┬───────────────────────────────────────────┘
                  │ HTTPS
┌─────────────────▼───────────────────────────────────────────┐
│                    Nginx (Reverse Proxy)                     │
│              Rate limiting · SSL termination                 │
└────────┬────────────────────────┬───────────────────────────┘
         │                        │
┌────────▼────────┐    ┌──────────▼──────────┐
│  Next.js (SSR)  │    │   FastAPI Backend    │
│  Port 3000      │    │   Port 8000          │
│  Static assets  │    │   REST + SSE API     │
└────────┬────────┘    └──────────┬──────────┘
         │                        │
         └───────────┬────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│                   Internal Services                          │
├──────────────┬──────────────┬─────────────┬─────────────────┤
│  PostgreSQL  │    Redis     │   Qdrant    │  Blob Storage   │
│  (Ana DB)    │  (Cache+Q)   │  (Vektör)   │  (Dosyalar)     │
└──────────────┴──────┬───────┴─────────────┴─────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                  Celery Workers                              │
├──────────────────┬──────────────────┬───────────────────────┤
│  OCR Worker      │  Rule Engine     │  LLM Worker           │
│  (GPU node)      │  Worker          │  (API calls)          │
└──────────────────┴──────────────────┴───────────────────────┘
```

### 3.2 İstek Akışı (Dosya Yüklendiğinde)

```
1. Kullanıcı → Frontend: Dosya yükle
2. Frontend → API: POST /api/v1/submissions (multipart)
3. API → Blob Storage: Ham dosya kaydet (S3/Azure Blob)
4. API → PostgreSQL: submission kaydı oluştur (status=PENDING)
5. API → Redis Queue: celery task gönder
6. API → Frontend: 202 Accepted + job_id
7. Frontend: SSE bağlantısı aç (GET /api/v1/submissions/{id}/stream)

--- Async (Celery) ---
8. OCR Worker: Belgeleri oku, alan çıkar, JSON üret
9. Rule Engine Worker: 200+ kural çalıştır, sonuçları üret
10. RAG Worker: İlgili mevzuat parçalarını çek
11. LLM Worker: (sadece hata varsa) açıklama üret
12. PostgreSQL: Tüm sonuçları kaydet
13. Redis Pub/Sub: "job tamamlandı" event'i yayınla
14. SSE: Frontend'e gerçek zamanlı güncelleme

--- Frontend ---
15. Risk raporu ekrana gelir
16. Operatör inceleyip override/onay yapar
17. API: override kaydı audit log'a yazılır
```

---

## 4. Monorepo Yapısı ve Klasör Düzeni {#4}

```
gumruk-kontrol/
├── apps/
│   ├── api/                          # FastAPI backend
│   │   ├── main.py
│   │   ├── config.py                 # Ortam değişkenleri
│   │   ├── dependencies.py           # FastAPI DI
│   │   ├── routers/
│   │   │   ├── auth.py
│   │   │   ├── submissions.py
│   │   │   ├── declarations.py
│   │   │   ├── documents.py
│   │   │   ├── rules.py
│   │   │   ├── reports.py
│   │   │   ├── tenants.py
│   │   │   └── admin.py
│   │   ├── models/                   # SQLAlchemy ORM modelleri
│   │   │   ├── base.py
│   │   │   ├── tenant.py
│   │   │   ├── user.py
│   │   │   ├── submission.py
│   │   │   ├── declaration.py
│   │   │   ├── document.py
│   │   │   ├── rule.py
│   │   │   ├── rule_result.py
│   │   │   ├── override.py
│   │   │   └── audit_log.py
│   │   ├── schemas/                  # Pydantic şemaları
│   │   │   ├── submission.py
│   │   │   ├── declaration.py
│   │   │   └── ...
│   │   ├── services/
│   │   │   ├── ocr/
│   │   │   │   ├── base.py           # OCR abstract class
│   │   │   │   ├── pymupdf_parser.py
│   │   │   │   ├── paddle_ocr.py
│   │   │   │   ├── surya_ocr.py
│   │   │   │   ├── azure_doc_intel.py
│   │   │   │   └── router.py         # Hangi OCR'ı seç
│   │   │   ├── rule_engine/
│   │   │   │   ├── engine.py         # Ana motor
│   │   │   │   ├── loader.py         # DB'den kural yükle
│   │   │   │   ├── context.py        # Kural context objesi
│   │   │   │   └── rules/            # Kural kategorileri
│   │   │   │       ├── document_match.py
│   │   │   │       ├── mandatory_fields.py
│   │   │   │       ├── value_checks.py
│   │   │   │       ├── weight_checks.py
│   │   │   │       ├── gtip_checks.py
│   │   │   │       ├── origin_checks.py
│   │   │   │       └── reference_checks.py
│   │   │   ├── rag/
│   │   │   │   ├── indexer.py        # Mevzuat indexleme
│   │   │   │   ├── retriever.py      # Sorgu + getirme
│   │   │   │   └── chunker.py        # Metin parçalama
│   │   │   ├── llm/
│   │   │   │   ├── base.py           # LLM abstract class
│   │   │   │   ├── openai_client.py
│   │   │   │   ├── anthropic_client.py
│   │   │   │   ├── router.py         # Provider seçimi + fallback
│   │   │   │   └── prompts/
│   │   │   │       ├── explain_error.py
│   │   │   │       ├── summarize_risk.py
│   │   │   │       └── draft_response.py
│   │   │   ├── storage/
│   │   │   │   ├── blob.py           # Azure Blob / S3
│   │   │   │   └── local.py          # Dev ortamı
│   │   │   └── notification/
│   │   │       └── sse.py
│   │   ├── tasks/                    # Celery task'ları
│   │   │   ├── celery_app.py
│   │   │   ├── ocr_task.py
│   │   │   ├── rule_engine_task.py
│   │   │   ├── rag_task.py
│   │   │   └── llm_task.py
│   │   ├── db/
│   │   │   ├── session.py            # Async session factory
│   │   │   ├── rls.py                # Row-Level Security helpers
│   │   │   └── migrations/           # Alembic
│   │   └── tests/
│   │       ├── conftest.py
│   │       ├── test_rules/
│   │       └── test_api/
│   └── web/                          # Next.js frontend
│       ├── app/
│       │   ├── (auth)/
│       │   │   └── login/
│       │   ├── (dashboard)/
│       │   │   ├── submissions/
│       │   │   │   ├── page.tsx       # Dosya listesi
│       │   │   │   └── [id]/
│       │   │   │       └── page.tsx   # Risk raporu
│       │   │   ├── declarations/
│       │   │   ├── reports/
│       │   │   └── settings/
│       │   └── admin/
│       ├── components/
│       │   ├── pdf-viewer/            # PDF + annotation
│       │   ├── risk-report/           # Hata listesi
│       │   ├── override-panel/        # Onay/red formu
│       │   ├── copilot-panel/         # LLM açıklama
│       │   └── rule-editor/           # Admin kural yönetimi
│       └── lib/
│           ├── api-client.ts
│           ├── sse-client.ts
│           └── stores/
├── packages/
│   ├── shared-types/                  # Ortak TypeScript + Python tipler
│   └── rule-dsl/                      # Kural tanım formatı
├── infrastructure/
│   ├── docker/
│   │   ├── Dockerfile.api
│   │   ├── Dockerfile.worker
│   │   └── Dockerfile.web
│   ├── docker-compose.yml             # Local dev
│   ├── docker-compose.prod.yml
│   ├── k8s/                           # Kubernetes manifests
│   │   ├── namespace.yaml
│   │   ├── api-deployment.yaml
│   │   ├── worker-deployment.yaml
│   │   ├── web-deployment.yaml
│   │   ├── postgres-statefulset.yaml
│   │   ├── redis-deployment.yaml
│   │   ├── qdrant-deployment.yaml
│   │   └── ingress.yaml
│   └── terraform/                     # Azure infra as code
└── scripts/
    ├── seed_rules.py                  # İlk kural kataloğunu yükle
    ├── seed_legislation.py            # İlk mevzuat corpus'unu yükle
    └── anonymize_dataset.py           # Model eğitimi için veri anonimleştirme
```

---

## 5. Veritabanı Tasarımı — Tam Şema {#5}

### 5.1 Tenant İzolasyonu

Her tablo `tenant_id UUID NOT NULL` kolonu taşır. PostgreSQL Row-Level Security tüm tablolarda aktiftir:

```sql
-- Her tablo için RLS aktifleştirme
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON submissions
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- API bağlantısında set edilir
SET app.current_tenant_id = '...';
```

### 5.2 Tam Tablo Listesi

```sql
-- ─────────────────────────────────────────────
-- CORE: Kimlik ve Erişim
-- ─────────────────────────────────────────────

CREATE TABLE tenants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(200) NOT NULL,
    slug            VARCHAR(100) UNIQUE NOT NULL,      -- URL-safe isim
    plan            VARCHAR(50) NOT NULL DEFAULT 'starter',
                                                        -- starter|professional|enterprise
    monthly_file_quota  INTEGER NOT NULL DEFAULT 750,
    max_users       INTEGER NOT NULL DEFAULT 2,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    settings        JSONB NOT NULL DEFAULT '{}',        -- Tenant-özel ayarlar
    data_retention_days INTEGER NOT NULL DEFAULT 90,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    keycloak_id     VARCHAR(200) UNIQUE NOT NULL,       -- Keycloak subject ID
    email           VARCHAR(300) NOT NULL,
    full_name       VARCHAR(200),
    role            VARCHAR(50) NOT NULL DEFAULT 'operator',
                                                        -- operator|reviewer|admin|super_admin
    is_active       BOOLEAN NOT NULL DEFAULT true,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, email)
);

-- ─────────────────────────────────────────────
-- CORE: Dosya ve Beyanname
-- ─────────────────────────────────────────────

CREATE TABLE submissions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    created_by      UUID NOT NULL REFERENCES users(id),
    status          VARCHAR(50) NOT NULL DEFAULT 'pending',
                    -- pending|processing|ocr_done|rules_done|rag_done|llm_done
                    -- completed|failed|cancelled
    error_message   TEXT,                               -- İşleme hatası varsa
    priority        INTEGER NOT NULL DEFAULT 0,         -- Yüksek öncelikli kuyruk
    files_count     INTEGER NOT NULL DEFAULT 0,
    processing_started_at TIMESTAMPTZ,
    processing_completed_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata        JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_submissions_tenant_status ON submissions(tenant_id, status);
CREATE INDEX idx_submissions_tenant_created ON submissions(tenant_id, created_at DESC);

CREATE TABLE uploaded_documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    submission_id   UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    document_type   VARCHAR(100) NOT NULL,
                    -- INVOICE|PACKING_LIST|BL|AWB|CMR|CERTIFICATE_ORIGIN
                    -- CIRCULATION_CERT|INSURANCE|PERMIT|TPS_REFERENCE|OTHER
    original_filename   VARCHAR(500) NOT NULL,
    blob_path       TEXT NOT NULL,                      -- Azure Blob / S3 yolu
    blob_path_cold  TEXT,                               -- Glacier/cold storage yolu
    file_size_bytes BIGINT NOT NULL,
    mime_type       VARCHAR(100) NOT NULL,
    page_count      INTEGER,
    is_scanned      BOOLEAN,                            -- OCR gerekiyor mu?
    checksum_sha256 VARCHAR(64) NOT NULL,               -- Bütünlük kontrolü
    uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cold_archived_at TIMESTAMPTZ,                       -- Cold storage'a taşındığında
    deleted_at      TIMESTAMPTZ                         -- Soft delete
);

CREATE TABLE document_extractions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    document_id     UUID NOT NULL REFERENCES uploaded_documents(id) ON DELETE CASCADE,
    ocr_engine      VARCHAR(100) NOT NULL,
                    -- pymupdf|pdfplumber|paddleocr|surya|azure_doc_intel
    extraction_status VARCHAR(50) NOT NULL DEFAULT 'pending',
    raw_text        TEXT,                               -- Ham OCR metni
    structured_data JSONB NOT NULL DEFAULT '{}',        -- Çıkarılan alanlar
    confidence_score FLOAT,                             -- OCR güven skoru
    processing_time_ms INTEGER,
    error_message   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Normalize edilmiş alan şeması (JSON içindeki kritik alanlar için ayrı tablo)
CREATE TABLE extracted_fields (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    extraction_id   UUID NOT NULL REFERENCES document_extractions(id),
    field_name      VARCHAR(200) NOT NULL,              -- Örn: invoice_number
    field_value     TEXT,
    field_value_numeric NUMERIC(20,4),                  -- Sayısal ise
    field_value_date DATE,                              -- Tarih ise
    confidence      FLOAT,
    page_number     INTEGER,
    bbox_x1         FLOAT, bbox_y1 FLOAT,               -- PDF koordinatları
    bbox_x2         FLOAT, bbox_y2 FLOAT,               -- (annotation için)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE declarations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    submission_id   UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    regime          VARCHAR(50),                        -- İthalat/ihracat/transit
    declaration_number  VARCHAR(100),                   -- Tescil numarası
    declaration_date DATE,
    customs_office  VARCHAR(100),
    currency_code   VARCHAR(10),
    total_invoice_value NUMERIC(20,4),
    total_cif_value NUMERIC(20,4),
    importer_tax_id VARCHAR(50),
    exporter_tax_id VARCHAR(50),
    importer_name   VARCHAR(500),
    exporter_name   VARCHAR(500),
    origin_country  VARCHAR(10),
    transport_mode  VARCHAR(50),
    raw_data        JSONB NOT NULL DEFAULT '{}',        -- Tam ham veri
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE declaration_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    declaration_id  UUID NOT NULL REFERENCES declarations(id) ON DELETE CASCADE,
    item_number     INTEGER NOT NULL,
    gtip_code       VARCHAR(20),                        -- HS/GTİP kodu
    goods_description TEXT,
    quantity        NUMERIC(20,4),
    quantity_unit   VARCHAR(20),
    net_weight_kg   NUMERIC(20,4),
    gross_weight_kg NUMERIC(20,4),
    statistical_value NUMERIC(20,4),
    customs_value   NUMERIC(20,4),
    origin_country  VARCHAR(10),
    permit_references JSONB DEFAULT '[]',               -- TPS/izin referansları
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- CORE: Kural Motoru
-- ─────────────────────────────────────────────

CREATE TABLE rules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID,                               -- NULL = global kural
    rule_code       VARCHAR(50) UNIQUE NOT NULL,        -- Örn: DOC-001
    category        VARCHAR(100) NOT NULL,
                    -- DOCUMENT_MATCH|MANDATORY_FIELD|VALUE_CHECK|GTIP_CHECK
                    -- WEIGHT_CHECK|ORIGIN_CHECK|REFERENCE_CHECK|ANOMALY
    name            VARCHAR(200) NOT NULL,
    description     TEXT NOT NULL,
    severity        VARCHAR(20) NOT NULL DEFAULT 'WARNING',
                    -- ERROR|WARNING|INFO
    affected_fields TEXT[],                             -- Etkilenen alan listesi
    legislation_references TEXT[],                      -- Mevzuat madde kodları
    is_active       BOOLEAN NOT NULL DEFAULT true,
    is_overridable  BOOLEAN NOT NULL DEFAULT true,
    implementation  VARCHAR(50) NOT NULL DEFAULT 'python',
                    -- python|dsl (ileride kural dili)
    config          JSONB NOT NULL DEFAULT '{}',        -- Kural parametreleri
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE rule_results (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    submission_id   UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    rule_id         UUID NOT NULL REFERENCES rules(id),
    status          VARCHAR(20) NOT NULL,
                    -- PASS|FAIL|WARNING|SKIPPED|ERROR
    affected_field  VARCHAR(200),
    found_value     TEXT,                               -- Gerçekte bulunan değer
    expected_value  TEXT,                               -- Beklenen değer
    detail_message  TEXT,                               -- Kural mesajı
    source_document_id UUID REFERENCES uploaded_documents(id),
    target_document_id UUID REFERENCES uploaded_documents(id),
    execution_time_ms INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rule_results_submission ON rule_results(submission_id);
CREATE INDEX idx_rule_results_status ON rule_results(submission_id, status);

CREATE TABLE risk_scores (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    submission_id   UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    total_score     FLOAT NOT NULL,                     -- 0-100
    error_count     INTEGER NOT NULL DEFAULT 0,
    warning_count   INTEGER NOT NULL DEFAULT 0,
    info_count      INTEGER NOT NULL DEFAULT 0,
    risk_level      VARCHAR(20) NOT NULL,               -- LOW|MEDIUM|HIGH|CRITICAL
    score_breakdown JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- CORE: RAG ve LLM
-- ─────────────────────────────────────────────

CREATE TABLE legislation_documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_code        VARCHAR(100) UNIQUE NOT NULL,       -- Örn: GUMRUK_KANUNU_4458
    title           TEXT NOT NULL,
    document_type   VARCHAR(100) NOT NULL,
                    -- KANUN|YONETMELIK|TEBLIG|GENELGE|REHBER
    publication_date DATE,
    effective_date  DATE,
    expiry_date     DATE,
    source_url      TEXT,
    full_text       TEXT NOT NULL,
    chunk_count     INTEGER DEFAULT 0,
    is_indexed      BOOLEAN NOT NULL DEFAULT false,
    last_synced_at  TIMESTAMPTZ,
    staleness_flag  BOOLEAN NOT NULL DEFAULT false,     -- Güncelleme gerekiyor mu?
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE legislation_chunks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legislation_id  UUID NOT NULL REFERENCES legislation_documents(id),
    chunk_index     INTEGER NOT NULL,
    article_ref     VARCHAR(100),                       -- Madde numarası
    chunk_text      TEXT NOT NULL,
    token_count     INTEGER,
    qdrant_point_id VARCHAR(200),                       -- Qdrant ID referansı
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE llm_explanations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    submission_id   UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    llm_provider    VARCHAR(50) NOT NULL,               -- openai|anthropic
    model_name      VARCHAR(100) NOT NULL,
    prompt_tokens   INTEGER NOT NULL,
    completion_tokens INTEGER NOT NULL,
    cost_usd        NUMERIC(10,6),
    explanation_text TEXT NOT NULL,
    retrieved_chunks JSONB DEFAULT '[]',                -- Kullanılan RAG chunk'ları
    generation_time_ms INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- CORE: Denetim ve İş Akışı
-- ─────────────────────────────────────────────

CREATE TABLE overrides (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    submission_id   UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    rule_result_id  UUID REFERENCES rule_results(id),
    user_id         UUID NOT NULL REFERENCES users(id),
    action          VARCHAR(50) NOT NULL,
                    -- ACCEPT_RISK|REJECT|REQUEST_CORRECTION|ESCALATE|APPROVE_ALL
    comment         TEXT NOT NULL,                      -- Zorunlu açıklama
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_logs (
    id              BIGSERIAL PRIMARY KEY,              -- BIGINT, hızlı append
    tenant_id       UUID NOT NULL,
    user_id         UUID,
    action          VARCHAR(100) NOT NULL,
    resource_type   VARCHAR(100),
    resource_id     UUID,
    ip_address      INET,
    user_agent      TEXT,
    payload         JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    -- NOT: Bu tabloya UPDATE/DELETE yasaktır (trigger ile korunur)
);

-- Audit log'u koruma trigger'ı
CREATE RULE no_update_audit AS ON UPDATE TO audit_logs DO INSTEAD NOTHING;
CREATE RULE no_delete_audit AS ON DELETE TO audit_logs DO INSTEAD NOTHING;

-- ─────────────────────────────────────────────
-- MODEL EĞİTİMİ İÇİN TABLOLAR
-- ─────────────────────────────────────────────

CREATE TABLE training_samples (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id   UUID NOT NULL REFERENCES submissions(id),
    sample_type     VARCHAR(50) NOT NULL,
                    -- extraction|rule_result|llm_explanation
    input_data      JSONB NOT NULL,                     -- Girdi (anonimleştirilmiş)
    expected_output JSONB NOT NULL,                     -- Doğru çıktı
    quality_score   FLOAT,                              -- İnsan değerlendirmesi
    is_validated    BOOLEAN NOT NULL DEFAULT false,
    validated_by    UUID REFERENCES users(id),
    validated_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE model_versions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_type      VARCHAR(100) NOT NULL,
                    -- ocr_extraction|rule_classifier|field_extractor
    version         VARCHAR(50) NOT NULL,
    training_samples_count INTEGER NOT NULL,
    eval_metrics    JSONB NOT NULL DEFAULT '{}',
    artifact_path   TEXT NOT NULL,
    is_production   BOOLEAN NOT NULL DEFAULT false,
    deployed_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 5.3 Önemli Index'ler

```sql
-- Performans kritik sorgu path'leri için
CREATE INDEX idx_submissions_tenant_status_created
    ON submissions(tenant_id, status, created_at DESC);

CREATE INDEX idx_rule_results_tenant_submission_status
    ON rule_results(tenant_id, submission_id, status);

CREATE INDEX idx_extracted_fields_extraction_name
    ON extracted_fields(extraction_id, field_name);

CREATE INDEX idx_audit_logs_tenant_created
    ON audit_logs(tenant_id, created_at DESC);

-- Full-text search (beyanname üzerinde Türkçe arama)
CREATE INDEX idx_declarations_fts
    ON declarations USING GIN (to_tsvector('turkish', raw_data::text));
```

---

## 6. Dosya İşleme Pipeline'ı (Ingestion) {#6}

### 6.1 API Endpoint — Dosya Yükleme

```python
# apps/api/routers/submissions.py

@router.post("/submissions", response_model=SubmissionResponse, status_code=202)
async def create_submission(
    files: List[UploadFile] = File(...),
    declaration_data: Optional[str] = Form(None),  # JSON string
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    blob_service: BlobStorageService = Depends(get_blob_service),
):
    # 1. Dosya sayısı ve boyut limiti kontrolü
    if len(files) > 20:
        raise HTTPException(400, "Tek seferde maksimum 20 dosya")
    
    # 2. Submission kaydı oluştur
    submission = Submission(
        tenant_id=current_user.tenant_id,
        created_by=current_user.id,
        status=SubmissionStatus.PENDING,
        files_count=len(files),
    )
    db.add(submission)
    await db.flush()
    
    # 3. Her dosyayı blob storage'a kaydet + DB kaydı
    uploaded_docs = []
    for file in files:
        content = await file.read()
        checksum = hashlib.sha256(content).hexdigest()
        
        # Dosya tipi tespiti
        is_scanned = await detect_if_scanned(content, file.content_type)
        doc_type = await classify_document_type(file.filename)
        
        # Blob'a kaydet (tenant izolasyonu ile)
        blob_path = f"{current_user.tenant_id}/{submission.id}/{file.filename}"
        await blob_service.upload(blob_path, content)
        
        doc = UploadedDocument(
            tenant_id=current_user.tenant_id,
            submission_id=submission.id,
            document_type=doc_type,
            original_filename=file.filename,
            blob_path=blob_path,
            file_size_bytes=len(content),
            mime_type=file.content_type,
            is_scanned=is_scanned,
            checksum_sha256=checksum,
        )
        db.add(doc)
        uploaded_docs.append(doc)
    
    await db.commit()
    
    # 4. Celery task'ı başlat
    from tasks.ocr_task import process_submission
    process_submission.delay(str(submission.id), str(current_user.tenant_id))
    
    # 5. Audit log
    await write_audit_log(db, current_user, "SUBMISSION_CREATED", submission.id)
    
    return SubmissionResponse.from_orm(submission)
```

### 6.2 Dosya Tipi Tespiti

```python
# services/ocr/router.py

async def classify_document_type(filename: str) -> str:
    """Dosya adından belge tipini tahmin et."""
    filename_lower = filename.lower()
    
    patterns = {
        "INVOICE": ["invoice", "fatura", "inv", "commercial"],
        "PACKING_LIST": ["packing", "liste", "pl_", "packlist"],
        "BL": ["bill_of_lading", "konşimento", "bl_", "_bl."],
        "AWB": ["airway", "awb", "havayolu"],
        "CERTIFICATE_ORIGIN": ["origin", "menşe", "eur.1", "form_a", "a.tr"],
        "PERMIT": ["izin", "permit", "lisans", "uygunluk"],
        "TPS_REFERENCE": ["tps", "tek_pencere", "single_window"],
    }
    
    for doc_type, keywords in patterns.items():
        if any(kw in filename_lower for kw in keywords):
            return doc_type
    
    return "OTHER"

async def detect_if_scanned(content: bytes, mime_type: str) -> bool:
    """PDF'nin taranmış mı yoksa text-based mi olduğunu tespit et."""
    if mime_type != "application/pdf":
        return True  # Görüntü dosyaları her zaman taranmış
    
    import fitz  # PyMuPDF
    doc = fitz.open(stream=content, filetype="pdf")
    
    text_chars = 0
    for page in doc:
        text_chars += len(page.get_text())
    
    doc.close()
    
    # Sayfa başına 100'den az karakter varsa taranmış kabul et
    return (text_chars / max(len(doc), 1)) < 100
```

---

## 7. OCR Katmanı — Hibrit Strateji {#7}

### 7.1 OCR Router — Hangi Engine'i Seç

```python
# services/ocr/router.py

class OCRRouter:
    """
    Maliyet-kalite dengesine göre doğru OCR engine'i seçer.
    Öncelik: PyMuPDF → pdfplumber → PaddleOCR → Surya → Azure
    """
    
    async def route(self, document: UploadedDocument, content: bytes) -> str:
        """OCR engine seç ve metni döndür."""
        
        # Strateji 1: Text-based PDF → PyMuPDF (ücretsiz, hızlı)
        if not document.is_scanned and document.mime_type == "application/pdf":
            result = await self._try_pymupdf(content)
            if result.confidence > 0.8:
                return result
        
        # Strateji 2: Tablo ağırlıklı PDF → pdfplumber (tablo yapısı korur)
        if document.document_type in ["INVOICE", "PACKING_LIST"]:
            result = await self._try_pdfplumber(content)
            if result.confidence > 0.7:
                return result
        
        # Strateji 3: Taranmış, Türkçe → PaddleOCR (GPU worker)
        if document.is_scanned:
            result = await self._try_paddle(content)
            if result.confidence > 0.75:
                return result
        
        # Strateji 4: Karmaşık layout → Surya
        result = await self._try_surya(content)
        if result.confidence > 0.8:
            return result
        
        # Strateji 5: Fallback → Azure Document Intelligence
        # Sadece bu noktaya gelirse kullan (düşük frekans)
        return await self._try_azure(content, document.document_type)
    
    async def _try_pymupdf(self, content: bytes) -> OCRResult:
        import fitz
        doc = fitz.open(stream=content, filetype="pdf")
        full_text = ""
        tables = []
        
        for page_num, page in enumerate(doc):
            # Metin çıkar
            text = page.get_text("dict")
            full_text += self._extract_text_from_dict(text)
            
            # Tablo tespiti
            found_tables = page.find_tables()
            for table in found_tables:
                tables.append({
                    "page": page_num,
                    "data": table.extract(),
                    "bbox": table.bbox,
                })
        
        doc.close()
        
        return OCRResult(
            engine="pymupdf",
            text=full_text,
            tables=tables,
            confidence=0.95 if full_text else 0.0,
        )
```

### 7.2 Alan Çıkarımı — Yapılandırılmış Veri

```python
# services/ocr/field_extractor.py

class DocumentFieldExtractor:
    """
    OCR metninden belge tipine göre alan çıkarımı yapar.
    Regex + LLM assisted (düşük güvende).
    """
    
    INVOICE_PATTERNS = {
        "invoice_number": [
            r"(?:invoice|fatura)\s*(?:no|numarası|number)[:\s#]*([A-Z0-9\-/]+)",
            r"(?:inv|ftr)[.\-#\s]*([A-Z0-9\-/]{4,20})",
        ],
        "invoice_date": [
            r"(?:date|tarih)[:\s]*(\d{1,2}[./\-]\d{1,2}[./\-]\d{2,4})",
        ],
        "total_amount": [
            r"(?:total|toplam|amount)[:\s]*([A-Z]{3})?\s*([\d,]+\.?\d*)",
        ],
        "currency": [
            r"\b(USD|EUR|TRY|GBP|CHF|JPY)\b",
        ],
        "seller_name": [
            r"(?:seller|satıcı|exporter)[:\s]*([^\n]{5,100})",
        ],
        "buyer_name": [
            r"(?:buyer|alıcı|importer)[:\s]*([^\n]{5,100})",
        ],
    }
    
    async def extract(
        self,
        text: str,
        doc_type: str,
        tables: List[dict],
        use_llm_fallback: bool = True
    ) -> dict:
        patterns = self._get_patterns(doc_type)
        extracted = {}
        low_confidence_fields = []
        
        for field_name, pattern_list in patterns.items():
            value, confidence = self._extract_with_patterns(text, pattern_list)
            
            if confidence > 0.8:
                extracted[field_name] = {"value": value, "confidence": confidence}
            else:
                low_confidence_fields.append(field_name)
        
        # Tablolardan alan çıkarımı
        if tables:
            table_fields = self._extract_from_tables(tables, doc_type)
            extracted.update(table_fields)
        
        # Düşük güven → LLM fallback (sadece bu alanlar için, tüm belge değil)
        if low_confidence_fields and use_llm_fallback:
            llm_extracted = await self._llm_extract_fields(
                text=text[:3000],  # Token tasarrufu için ilk 3000 karakter
                fields=low_confidence_fields,
                doc_type=doc_type,
            )
            extracted.update(llm_extracted)
        
        return extracted
    
    async def _llm_extract_fields(
        self,
        text: str,
        fields: List[str],
        doc_type: str
    ) -> dict:
        """
        Sadece bulunamayan alanlar için minimal LLM çağrısı.
        Tüm belgeyi değil, regex'in bulamadığı alanları sorar.
        """
        from services.llm.router import llm_router
        
        prompt = f"""Aşağıdaki {doc_type} belgesinden şu alanları çıkar:
{', '.join(fields)}

Yalnızca JSON formatında yanıt ver:
{{"field_name": "değer", ...}}

Belge metni:
{text}"""
        
        response = await llm_router.complete(
            prompt=prompt,
            model="gpt-4o-mini",  # Ucuz model, basit extraction
            response_format={"type": "json_object"},
            max_tokens=500,
        )
        
        return json.loads(response.content)
```

---

## 8. Kural Motoru (Rule Engine) {#8}

### 8.1 Temel Kural Yapısı

```python
# services/rule_engine/engine.py

from dataclasses import dataclass
from typing import Optional, List
from enum import Enum

class RuleSeverity(str, Enum):
    ERROR = "ERROR"
    WARNING = "WARNING"
    INFO = "INFO"

class RuleStatus(str, Enum):
    PASS = "PASS"
    FAIL = "FAIL"
    WARNING = "WARNING"
    SKIPPED = "SKIPPED"

@dataclass
class RuleResult:
    rule_code: str
    status: RuleStatus
    severity: RuleSeverity
    affected_field: Optional[str]
    found_value: Optional[str]
    expected_value: Optional[str]
    detail_message: str
    source_doc_id: Optional[str] = None
    target_doc_id: Optional[str] = None

class BaseRule:
    """Tüm kurallar bu sınıftan türer."""
    
    code: str              # Örn: DOC-001
    name: str
    description: str
    severity: RuleSeverity = RuleSeverity.WARNING
    category: str = "GENERAL"
    legislation_refs: List[str] = []
    
    def evaluate(self, context: "RuleContext") -> RuleResult:
        raise NotImplementedError
    
    def _pass(self) -> RuleResult:
        return RuleResult(
            rule_code=self.code,
            status=RuleStatus.PASS,
            severity=self.severity,
            affected_field=None,
            found_value=None,
            expected_value=None,
            detail_message="Kontrol geçti",
        )
    
    def _fail(self, field, found, expected, message) -> RuleResult:
        return RuleResult(
            rule_code=self.code,
            status=RuleStatus.FAIL,
            severity=self.severity,
            affected_field=field,
            found_value=str(found) if found is not None else None,
            expected_value=str(expected) if expected is not None else None,
            detail_message=message,
        )
```

### 8.2 Örnek Kurallar — Detaylı

```python
# services/rule_engine/rules/document_match.py

class InvoiceAmountMatchRule(BaseRule):
    """
    DOC-001: Fatura toplam tutarı ile beyanname kıymeti eşleşmeli.
    Referans: Gümrük Yönetmeliği Madde 44
    """
    code = "DOC-001"
    name = "Fatura-Beyanname Kıymet Eşleşmesi"
    severity = RuleSeverity.ERROR
    category = "DOCUMENT_MATCH"
    legislation_refs = ["GUMRUK_YON_M44", "GUMRUK_KANUN_4458_M24"]
    tolerance_pct = 0.02  # %2 tolerans
    
    def evaluate(self, ctx: RuleContext) -> RuleResult:
        invoice = ctx.get_document("INVOICE")
        declaration = ctx.declaration
        
        if not invoice or not declaration:
            return RuleResult(
                rule_code=self.code,
                status=RuleStatus.SKIPPED,
                severity=self.severity,
                affected_field=None,
                found_value=None,
                expected_value=None,
                detail_message="Fatura veya beyanname verisi eksik",
            )
        
        inv_amount = invoice.get_field("total_amount")
        decl_value = declaration.total_invoice_value
        
        if inv_amount is None or decl_value is None:
            return self._fail(
                "total_invoice_value",
                inv_amount,
                decl_value,
                "Fatura tutarı veya beyanname kıymeti çıkarılamadı"
            )
        
        diff_pct = abs(inv_amount - decl_value) / max(decl_value, 0.01)
        
        if diff_pct > self.tolerance_pct:
            return self._fail(
                field="total_invoice_value",
                found=f"{inv_amount:.2f} {invoice.get_field('currency')}",
                expected=f"{decl_value:.2f} {declaration.currency_code}",
                message=(
                    f"Fatura tutarı ({inv_amount:.2f}) ile beyanname kıymeti "
                    f"({decl_value:.2f}) arasında %{diff_pct*100:.1f} fark var. "
                    f"İzin verilen tolerans: %{self.tolerance_pct*100:.0f}"
                )
            )
        
        return self._pass()


class PackingListWeightMatchRule(BaseRule):
    """
    DOC-003: Packing list ağırlık toplamı beyanname ağırlığıyla eşleşmeli.
    """
    code = "DOC-003"
    name = "Ağırlık Eşleşmesi"
    severity = RuleSeverity.ERROR
    category = "DOCUMENT_MATCH"
    tolerance_kg = 5.0  # 5 kg tolerans
    
    def evaluate(self, ctx: RuleContext) -> RuleResult:
        pl = ctx.get_document("PACKING_LIST")
        decl = ctx.declaration
        
        if not pl or not decl:
            return RuleResult(
                rule_code=self.code,
                status=RuleStatus.SKIPPED,
                severity=self.severity,
                affected_field=None,
                found_value=None,
                expected_value=None,
                detail_message="Packing list veya beyanname eksik",
            )
        
        pl_gross = pl.get_field("total_gross_weight_kg")
        decl_gross = sum(
            item.gross_weight_kg
            for item in decl.items
            if item.gross_weight_kg
        )
        
        if abs(pl_gross - decl_gross) > self.tolerance_kg:
            return self._fail(
                "gross_weight",
                pl_gross,
                decl_gross,
                f"Packing list brüt ağırlık ({pl_gross} kg) ile "
                f"beyanname toplamı ({decl_gross} kg) uyuşmuyor."
            )
        
        return self._pass()


class GTIPDescriptionConsistencyRule(BaseRule):
    """
    GTIP-001: GTİP kodu ile eşya tanımı semantik uyumunu kontrol et.
    Yüksek token maliyeti — sadece şüpheli eşyalarda çalıştır.
    """
    code = "GTIP-001"
    name = "GTİP-Eşya Tanımı Uyumu"
    severity = RuleSeverity.WARNING
    category = "GTIP_CHECK"
    
    # Bu kural LLM çağrısı yapar — maliyetli
    requires_llm = True
    
    def evaluate(self, ctx: RuleContext) -> RuleResult:
        for item in ctx.declaration.items:
            if not item.gtip_code or not item.goods_description:
                continue
            
            # GTİP veritabanından beklenen tanım kategorisini çek
            expected_category = ctx.gtip_db.get_category(item.gtip_code)
            
            if expected_category:
                # Basit keyword kontrolü önce
                if self._keyword_match(item.goods_description, expected_category):
                    continue
                
                # Keyword uyuşmadı → LLM semantic check (pahalı, az kullan)
                is_consistent = ctx.llm_check_gtip(
                    gtip=item.gtip_code,
                    description=item.goods_description,
                    expected_category=expected_category,
                )
                
                if not is_consistent:
                    return self._fail(
                        f"item_{item.item_number}.gtip_code",
                        f"{item.gtip_code}: {item.goods_description}",
                        f"GTİP {item.gtip_code} kategorisi: {expected_category}",
                        f"Kalem {item.item_number}: GTİP kodu eşya tanımıyla uyumsuz görünüyor"
                    )
        
        return self._pass()
```

### 8.3 Rule Engine Orkestratörü

```python
# services/rule_engine/engine.py

class RuleEngine:
    def __init__(self, db_session):
        self.db = db_session
        self._rules_cache = {}
        self._cache_ttl = 300  # 5 dakika
    
    async def load_rules(self, tenant_id: str) -> List[BaseRule]:
        """
        Aktif kuralları yükle. Global + tenant-özel kurallar.
        5 dakika cache'le — her dosyada DB sorgusu atma.
        """
        cache_key = f"rules_{tenant_id}"
        if cache_key in self._rules_cache:
            cached, cached_at = self._rules_cache[cache_key]
            if time.time() - cached_at < self._cache_ttl:
                return cached
        
        # Global + tenant-özel kurallar
        stmt = select(Rule).where(
            or_(Rule.tenant_id.is_(None), Rule.tenant_id == tenant_id),
            Rule.is_active == True
        )
        rules_db = (await self.db.execute(stmt)).scalars().all()
        
        # Python sınıflarına map et
        rules = [self._instantiate_rule(r) for r in rules_db]
        self._rules_cache[cache_key] = (rules, time.time())
        return rules
    
    async def evaluate(
        self,
        submission_id: str,
        tenant_id: str,
        context: RuleContext
    ) -> List[RuleResult]:
        rules = await self.load_rules(tenant_id)
        results = []
        
        for rule in rules:
            try:
                start_ms = time.time() * 1000
                result = rule.evaluate(context)
                end_ms = time.time() * 1000
                result.execution_time_ms = int(end_ms - start_ms)
                results.append(result)
                
                # DB'ye yaz
                await self._save_result(submission_id, tenant_id, result)
                
            except Exception as e:
                # Tek bir kural çökmesi tüm değerlendirmeyi durdurmamalı
                logger.error(f"Kural {rule.code} hata: {e}")
                results.append(RuleResult(
                    rule_code=rule.code,
                    status=RuleStatus.SKIPPED,
                    severity=rule.severity,
                    affected_field=None,
                    found_value=None,
                    expected_value=None,
                    detail_message=f"Kural değerlendirme hatası: {str(e)}",
                ))
        
        # Risk skoru hesapla
        await self._calculate_risk_score(submission_id, tenant_id, results)
        
        return results
    
    def _calculate_risk_score(self, results: List[RuleResult]) -> RiskScore:
        error_count = sum(1 for r in results if r.status == RuleStatus.FAIL
                         and r.severity == RuleSeverity.ERROR)
        warning_count = sum(1 for r in results if r.status == RuleStatus.FAIL
                           and r.severity == RuleSeverity.WARNING)
        
        # Ağırlıklı skor: ERROR = 10 puan, WARNING = 3 puan, INFO = 1 puan
        raw_score = (error_count * 10) + (warning_count * 3)
        normalized = min(100, raw_score)
        
        if error_count >= 3 or normalized >= 70:
            risk_level = "CRITICAL"
        elif error_count >= 1 or normalized >= 40:
            risk_level = "HIGH"
        elif warning_count >= 3 or normalized >= 20:
            risk_level = "MEDIUM"
        else:
            risk_level = "LOW"
        
        return RiskScore(
            total_score=normalized,
            error_count=error_count,
            warning_count=warning_count,
            risk_level=risk_level,
        )
```

### 8.4 Kural Kataloğu — Tam Liste (MVP)

```
BELGE UYUMU (DOC)
  DOC-001  Fatura-Beyanname kıymet eşleşmesi               ERROR
  DOC-002  Fatura-Packing list miktar eşleşmesi            ERROR
  DOC-003  Packing list-Beyanname ağırlık eşleşmesi        ERROR
  DOC-004  Fatura numarası beyannamede doğru referans       ERROR
  DOC-005  Fatura tarihi beyanname tarihi ile mantıklı      WARNING
  DOC-006  Satıcı-alıcı isim tutarsızlığı                  ERROR
  DOC-007  Para birimi uyumsuzluğu                          ERROR
  DOC-008  Menşe ülke tutarsızlığı                          ERROR

ZORUNLU ALANLAR (MAN)
  MAN-001  GTİP kodu eksik                                  ERROR
  MAN-002  Kıymet eksik veya sıfır                          ERROR
  MAN-003  Net ağırlık eksik                                 ERROR
  MAN-004  Brüt ağırlık eksik                               ERROR
  MAN-005  Menşe ülke eksik                                  ERROR
  MAN-006  Taşıma belgesi numarası eksik                    ERROR
  MAN-007  Rejim kodu eksik                                  ERROR
  MAN-008  Alıcı vergi numarası eksik                        ERROR

DEĞER KONTROLLERI (VAL)
  VAL-001  Birim fiyat × miktar ≠ toplam                    ERROR
  VAL-002  Satır toplamları ≠ genel toplam                  ERROR
  VAL-003  CIF değeri < FOB değeri (navlun/sigorta)         WARNING
  VAL-004  Anormal düşük birim fiyat (geçmişe göre)        WARNING
  VAL-005  Anormal yüksek birim fiyat                        WARNING
  VAL-006  Döviz kuru makul aralıkta mı?                    INFO

AĞIRLIK KONTROLLERI (WGT)
  WGT-001  Net ağırlık > Brüt ağırlık                       ERROR
  WGT-002  Ürün türüne göre birim ağırlık anomalisi         WARNING
  WGT-003  Sıfır net ağırlık                                 ERROR

GTİP KONTROLLERI (GTIP)
  GTIP-001 GTİP-eşya tanımı semantik uyumu                  WARNING
  GTIP-002 GTİP'e bağlı zorunlu izin eksik                  ERROR
  GTIP-003 GTİP'e bağlı TPS/Tek Pencere referansı eksik    ERROR
  GTIP-004 GTİP uzunluğu (8 veya 12 hane)                   ERROR
  GTIP-005 Geçerli GTİP kodu mu? (tarife listesi)           ERROR

MENŞE / TERCİHLİ (ORI)
  ORI-001  Tercihli menşe belgesi eksik                      ERROR
  ORI-002  EUR.1 veya A.TR geçerlilik tarihi               ERROR
  ORI-003  Menşe belgesi ihracatçı uyuşmazlığı             ERROR

REFERANS KONTROLLERI (REF)
  REF-001  TPS/Tek Pencere referansı geçersiz               ERROR
  REF-002  Lisans/izin tarihi süresi dolmuş                  ERROR
  REF-003  İzin numarası formatı hatalı                      ERROR
```

---

## 9. Mevzuat RAG Katmanı {#9}

### 9.1 Mevzuat Corpus İndexleme

```python
# services/rag/indexer.py

class LegislationIndexer:
    """
    Mevzuat belgelerini chunk'lara böler, embed eder, Qdrant'a yükler.
    """
    
    CHUNK_SIZE = 512        # Token cinsinden
    CHUNK_OVERLAP = 64      # Bağlam sürekliliği için örtüşme
    
    def __init__(self, qdrant_client, embedding_model):
        self.qdrant = qdrant_client
        self.embedder = embedding_model
        self.collection_name = "legislation_tr"
    
    async def index_document(self, legislation: LegislationDocument):
        """Bir mevzuat belgesini chunk'la, embed et ve index'le."""
        
        # 1. Madde bazında akıllı chunklama
        chunks = self._chunk_by_article(legislation.full_text)
        
        # 2. Her chunk için embedding üret
        texts = [c["text"] for c in chunks]
        embeddings = await self.embedder.embed_batch(texts)
        
        # 3. Qdrant'a yükle
        points = []
        for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
            point_id = str(uuid.uuid4())
            
            points.append(qdrant_models.PointStruct(
                id=point_id,
                vector=embedding,
                payload={
                    "legislation_id": str(legislation.id),
                    "doc_code": legislation.doc_code,
                    "title": legislation.title,
                    "document_type": legislation.document_type,
                    "article_ref": chunk.get("article_ref"),
                    "chunk_index": i,
                    "text": chunk["text"],
                    "effective_date": str(legislation.effective_date),
                    "publication_date": str(legislation.publication_date),
                }
            ))
        
        # Batch yükleme
        self.qdrant.upsert(
            collection_name=self.collection_name,
            points=points,
        )
        
        # DB güncelle
        legislation.chunk_count = len(chunks)
        legislation.is_indexed = True
        legislation.last_synced_at = datetime.utcnow()
    
    def _chunk_by_article(self, text: str) -> List[dict]:
        """
        Türk mevzuat maddelerini tanıyan akıllı chunker.
        'MADDE X —' pattern'ına göre böler.
        """
        import re
        
        # Madde başlıklarını tespit et
        article_pattern = re.compile(
            r"(MADDE\s+\d+\s*[–\-—]\s*[^\n]{0,100})",
            re.IGNORECASE
        )
        
        chunks = []
        positions = [(m.start(), m.group(1)) for m in article_pattern.finditer(text)]
        
        for i, (start, article_ref) in enumerate(positions):
            end = positions[i+1][0] if i+1 < len(positions) else len(text)
            chunk_text = text[start:end].strip()
            
            # Çok uzun maddeleri alt parçalara böl
            if len(chunk_text.split()) > self.CHUNK_SIZE:
                sub_chunks = self._split_long_chunk(chunk_text)
                for j, sub in enumerate(sub_chunks):
                    chunks.append({
                        "text": sub,
                        "article_ref": f"{article_ref} ({j+1}/{len(sub_chunks)})",
                    })
            else:
                chunks.append({
                    "text": chunk_text,
                    "article_ref": article_ref,
                })
        
        return chunks
```

### 9.2 Retrieval — Kural Sonuçlarına Göre Sorgulama

```python
# services/rag/retriever.py

class LegislationRetriever:
    """
    Kural motoru sonuçlarından akıllı RAG sorguları oluşturur.
    Tüm belgeyi değil, sadece hatalı alanların mevzuatını çeker.
    """
    
    async def retrieve_for_errors(
        self,
        rule_results: List[RuleResult],
        top_k: int = 3
    ) -> Dict[str, List[dict]]:
        """
        Her kural hatası için ilgili mevzuat parçalarını getir.
        Boşuna embedding yapma — sadece FAIL olanlar için sorgula.
        """
        
        failed_rules = [r for r in rule_results if r.status == RuleStatus.FAIL]
        
        if not failed_rules:
            return {}
        
        results = {}
        
        for rule_result in failed_rules:
            # Kural kodundan sorgu üret
            query = self._build_query(rule_result)
            
            # Vektör araması
            search_result = self.qdrant.search(
                collection_name="legislation_tr",
                query_vector=await self.embedder.embed(query),
                limit=top_k,
                score_threshold=0.7,  # Düşük benzerlik → getirme
            )
            
            results[rule_result.rule_code] = [
                {
                    "text": hit.payload["text"],
                    "article_ref": hit.payload["article_ref"],
                    "doc_title": hit.payload["title"],
                    "doc_code": hit.payload["doc_code"],
                    "score": hit.score,
                }
                for hit in search_result
            ]
        
        return results
    
    def _build_query(self, rule_result: RuleResult) -> str:
        """Kural hatasından arama sorgusu üret."""
        
        query_templates = {
            "DOC": "belge beyanname uyumsuzluk kıymet",
            "MAN": "zorunlu alan eksik beyanname",
            "VAL": "kıymet değer hesaplama gümrük",
            "GTIP": "tarife sınıflandırma GTİP gümrük",
            "ORI": "menşe tercihli belge ispat",
            "REF": "izin referans TPS tek pencere",
        }
        
        prefix = rule_result.rule_code.split("-")[0]
        base_query = query_templates.get(prefix, "gümrük beyanname")
        
        if rule_result.affected_field:
            return f"{base_query} {rule_result.affected_field} {rule_result.detail_message[:100]}"
        
        return f"{base_query} {rule_result.detail_message[:150]}"
```

---

## 10. LLM Entegrasyon Katmanı {#10}

### 10.1 Multi-Provider Router + Fallback

```python
# services/llm/router.py

class LLMRouter:
    """
    OpenAI primary, Anthropic fallback, local model son çare.
    LLM olmadan sistem çalışmaya devam eder.
    """
    
    PROVIDERS = [
        {"name": "openai", "model": "gpt-4o-mini", "priority": 1},
        {"name": "anthropic", "model": "claude-haiku-4-5-20251001", "priority": 2},
    ]
    
    async def complete(
        self,
        prompt: str,
        system: str = "",
        model: Optional[str] = None,
        max_tokens: int = 1000,
        response_format: Optional[dict] = None,
    ) -> Optional[LLMResponse]:
        
        for provider_config in self.PROVIDERS:
            try:
                response = await self._call_provider(
                    provider=provider_config["name"],
                    model=model or provider_config["model"],
                    prompt=prompt,
                    system=system,
                    max_tokens=max_tokens,
                    response_format=response_format,
                )
                return response
                
            except (RateLimitError, APIUnavailableError) as e:
                logger.warning(f"Provider {provider_config['name']} hata: {e}, sonraki deneniyor")
                continue
            
            except Exception as e:
                logger.error(f"LLM hatası: {e}")
                # Kritik değil — LLM açıklaması olmadan devam et
                return None
        
        logger.error("Tüm LLM provider'lar başarısız — LLM katmanı atlanıyor")
        return None  # Sistem LLM olmadan devam eder
```

### 10.2 Açıklama Üretme Prompts

```python
# services/llm/prompts/explain_error.py

SYSTEM_PROMPT = """Sen gümrük beyannamesi kontrolü yapan bir uzman asistandsın.
Türkiye gümrük mevzuatı (4458 sayılı Gümrük Kanunu ve Gümrük Yönetmeliği) konusunda
uzmansın. Yanıtlarını her zaman Türkçe, açık ve operatörün anlayabileceği şekilde ver.

KESİNLİKLE YAPMA:
- Kural motorunun bulamadığı ek hatalar "uydurma"
- Mevzuat maddelerini ezbere yazma — yalnızca sağlanan bağlamdan referans ver
- "Belki", "sanırım" gibi belirsiz ifadeler kullan

YAPILACAK:
- Bulunan hatayı operatöre sade Türkçe ile açıkla
- İlgili mevzuat maddesine atıf yap (sağlandıysa)
- Operatörün yapması gereken düzeltme adımını belirt
- Yanıtı JSON formatında döndür"""

async def build_explanation_prompt(
    rule_results: List[RuleResult],
    retrieved_legislation: Dict[str, List[dict]],
    declaration_summary: dict,
) -> str:
    
    errors_text = ""
    for result in rule_results:
        if result.status == RuleStatus.FAIL:
            legislation = retrieved_legislation.get(result.rule_code, [])
            leg_text = "\n".join([
                f"  - [{c['article_ref']}]: {c['text'][:200]}..."
                for c in legislation[:2]
            ])
            
            errors_text += f"""
HATA [{result.rule_code}] — {result.severity}
Alan: {result.affected_field}
Bulunan: {result.found_value}
Beklenen: {result.expected_value}
Mesaj: {result.detail_message}
İlgili mevzuat:
{leg_text}
---"""
    
    return f"""Aşağıdaki gümrük beyanname hatalarını operatöre açıkla.

BEYANNAME ÖZETI:
Rejim: {declaration_summary.get('regime')}
Toplam kıymet: {declaration_summary.get('total_value')}
Kalem sayısı: {declaration_summary.get('item_count')}

TESPİT EDİLEN HATALAR:
{errors_text}

Yanıtını şu JSON formatında ver:
{{
  "genel_ozet": "Dosyada X hata tespit edildi...",
  "hatalar": [
    {{
      "kural_kodu": "DOC-001",
      "operatör_mesajı": "Anlaşılır Türkçe açıklama",
      "düzeltme_adimi": "Operatörün yapması gereken",
      "mevzuat_referansi": "Gümrük Yönetmeliği Madde 44"
    }}
  ],
  "oncelik_sirasi": ["DOC-001", "MAN-003"]
}}"""
```

---

## 11. Backend API — FastAPI {#11}

### 11.1 Endpoint Listesi

```
AUTH
  POST   /api/v1/auth/token          Keycloak token exchange
  POST   /api/v1/auth/refresh         Token yenileme
  POST   /api/v1/auth/logout

SUBMISSIONS (Dosya İşleme)
  POST   /api/v1/submissions          Dosya yükle ve iş başlat
  GET    /api/v1/submissions          Liste (pagination + filter)
  GET    /api/v1/submissions/{id}     Detay
  GET    /api/v1/submissions/{id}/stream  SSE gerçek zamanlı güncelleme
  DELETE /api/v1/submissions/{id}     İptal et (sadece PENDING)

DECLARATIONS (Beyanname)
  GET    /api/v1/declarations/{id}    Beyanname + kalemler
  PATCH  /api/v1/declarations/{id}    Alan düzelt (override ile birlikte)

RULE RESULTS (Kural Sonuçları)
  GET    /api/v1/submissions/{id}/rule-results   Tüm sonuçlar
  GET    /api/v1/submissions/{id}/risk-score     Risk skoru

OVERRIDES (Onay/Red)
  POST   /api/v1/rule-results/{id}/override      Override kaydet
  GET    /api/v1/submissions/{id}/overrides       Override geçmişi

EXPLANATIONS (LLM)
  GET    /api/v1/submissions/{id}/explanation     LLM açıklaması
  POST   /api/v1/submissions/{id}/ask             Copilot soru-cevap

RULES (Admin)
  GET    /api/v1/admin/rules                      Kural listesi
  POST   /api/v1/admin/rules                      Yeni kural ekle
  PUT    /api/v1/admin/rules/{id}                 Kural güncelle
  POST   /api/v1/admin/rules/{id}/test            Kural test et

REPORTS
  GET    /api/v1/reports/errors-by-category       Hata kategori raporu
  GET    /api/v1/reports/operator-performance     Operatör performansı
  GET    /api/v1/reports/monthly-summary          Aylık özet

ADMIN (Super Admin)
  GET    /api/v1/admin/tenants                    Tenant listesi
  POST   /api/v1/admin/tenants                    Yeni tenant
  GET    /api/v1/admin/usage-stats                Kullanım istatistikleri
```

### 11.2 SSE — Gerçek Zamanlı Güncelleme

```python
# routers/submissions.py

@router.get("/submissions/{submission_id}/stream")
async def stream_submission_status(
    submission_id: str,
    current_user: User = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
):
    """
    Server-Sent Events ile submission işleme durumunu gerçek zamanlı yayınlar.
    Frontend bu endpoint'e bağlanır ve her adımı canlı görür.
    """
    
    async def event_generator():
        pubsub = redis.pubsub()
        channel = f"submission:{submission_id}:updates"
        await pubsub.subscribe(channel)
        
        # İlk durum — mevcut hali gönder
        current = await get_submission(submission_id)
        yield {
            "event": "status",
            "data": json.dumps({
                "status": current.status,
                "progress": get_progress_pct(current.status),
                "message": STATUS_MESSAGES[current.status],
            })
        }
        
        try:
            async for message in pubsub.listen():
                if message["type"] == "message":
                    yield {
                        "event": "update",
                        "data": message["data"]
                    }
                    
                    # İşleme tamamlandı → bağlantıyı kapat
                    data = json.loads(message["data"])
                    if data["status"] in ["completed", "failed"]:
                        break
        finally:
            await pubsub.unsubscribe(channel)
    
    return EventSourceResponse(event_generator())
```

---

## 12. Async İşleme — Celery + Redis {#12}

### 12.1 Task Zinciri

```python
# tasks/submission_pipeline.py

from celery import chain

def start_submission_pipeline(submission_id: str, tenant_id: str):
    """
    Submission işleme zincirini başlatır.
    Her adım tamamlanınca bir sonraki otomatik başlar.
    Herhangi biri başarısız olursa hata yönetimi devreye girer.
    """
    
    pipeline = chain(
        # 1. OCR ve alan çıkarımı
        ocr_task.si(submission_id, tenant_id)
            .set(queue="ocr", retry_backoff=True, max_retries=3),
        
        # 2. Kural motoru değerlendirmesi
        rule_engine_task.si(submission_id, tenant_id)
            .set(queue="rules"),
        
        # 3. Mevzuat retrieval (sadece hata varsa)
        rag_task.si(submission_id, tenant_id)
            .set(queue="rag"),
        
        # 4. LLM açıklama (sadece hata varsa)
        llm_explanation_task.si(submission_id, tenant_id)
            .set(queue="llm", soft_time_limit=60),
        
        # 5. Tamamlama ve bildirim
        finalize_task.si(submission_id, tenant_id)
            .set(queue="default"),
    )
    
    pipeline.apply_async()


@celery_app.task(bind=True, queue="ocr", max_retries=3)
def ocr_task(self, submission_id: str, tenant_id: str):
    try:
        # Status güncelle
        update_status(submission_id, "processing", "OCR işleniyor...")
        
        docs = get_documents(submission_id, tenant_id)
        
        for doc in docs:
            content = blob_service.download(doc.blob_path)
            result = ocr_router.route(doc, content)
            
            # Yapılandırılmış alanları çıkar
            fields = field_extractor.extract(
                text=result.text,
                doc_type=doc.document_type,
                tables=result.tables,
            )
            
            # DB'ye kaydet
            save_extraction(doc.id, result, fields)
        
        update_status(submission_id, "ocr_done", "Belge okuma tamamlandı")
        notify_progress(submission_id, "ocr_done", 25)
        
    except Exception as exc:
        self.retry(exc=exc, countdown=60)
```

### 12.2 Queue Konfigürasyonu

```python
# tasks/celery_app.py

CELERY_CONFIG = {
    "broker_url": "redis://redis:6379/0",
    "result_backend": "redis://redis:6379/1",
    
    "task_routes": {
        "tasks.ocr_task.*": {"queue": "ocr"},        # GPU worker'lar
        "tasks.rule_engine_task.*": {"queue": "rules"}, # CPU yoğun
        "tasks.rag_task.*": {"queue": "rag"},          # I/O yoğun
        "tasks.llm_task.*": {"queue": "llm"},          # API çağrısı
        "tasks.finalize_task.*": {"queue": "default"},
    },
    
    "worker_prefetch_multiplier": 1,  # Fair queue — her worker bir görev al
    "task_acks_late": True,           # Başarılı tamamlanınca ack gönder
    "task_reject_on_worker_lost": True,
    
    # Timeout'lar
    "task_soft_time_limit": 300,  # 5 dakika soft limit
    "task_time_limit": 360,       # 6 dakika hard limit
    
    # Retry politikası
    "task_max_retries": 3,
    "task_default_retry_delay": 60,
}
```

---

## 13. Frontend — Next.js {#13}

### 13.1 Risk Raporu Sayfası

```typescript
// app/(dashboard)/submissions/[id]/page.tsx

export default async function SubmissionDetailPage({
  params: { id }
}: { params: { id: string } }) {
  
  // Server-side initial data
  const submission = await getSubmission(id);
  const ruleResults = await getRuleResults(id);
  
  return (
    <div className="grid grid-cols-12 gap-6 h-screen">
      
      {/* Sol panel: PDF görüntüleyici */}
      <div className="col-span-5 border-r overflow-hidden">
        <PDFViewer
          submissionId={id}
          documents={submission.documents}
          annotations={ruleResults.filter(r => r.status === 'FAIL')}
        />
      </div>
      
      {/* Sağ panel: Risk raporu */}
      <div className="col-span-7 flex flex-col">
        
        {/* Üst: Risk skoru */}
        <RiskScoreHeader
          score={submission.riskScore}
          errorCount={ruleResults.filter(r => r.severity === 'ERROR').length}
          warningCount={ruleResults.filter(r => r.severity === 'WARNING').length}
        />
        
        {/* Orta: Hata listesi */}
        <div className="flex-1 overflow-y-auto">
          <RuleResultsList
            results={ruleResults}
            onFieldClick={(field) => {/* PDF'de ilgili alanı highlight et */}}
          />
        </div>
        
        {/* Alt: LLM copilot paneli */}
        <CopilotPanel submissionId={id} />
        
        {/* Alt: Override/onay butonları */}
        <OverridePanel
          submissionId={id}
          results={ruleResults}
        />
        
      </div>
      
      {/* Gerçek zamanlı güncelleme (hâlâ işleniyorsa) */}
      {submission.status !== 'completed' && (
        <SubmissionStatusStream submissionId={id} />
      )}
      
    </div>
  );
}
```

### 13.2 PDF Viewer + Annotation

```typescript
// components/pdf-viewer/PDFViewer.tsx
// PDF.js üzerinde kural hatalarının koordinatlarını gösterir

export function PDFViewer({ documents, annotations }: PDFViewerProps) {
  const [activeDocIndex, setActiveDocIndex] = useState(0);
  const [highlightedField, setHighlightedField] = useState<string | null>(null);
  
  const activeDoc = documents[activeDocIndex];
  const docAnnotations = annotations.filter(
    a => a.sourceDocumentId === activeDoc.id
  );
  
  return (
    <div className="flex flex-col h-full">
      
      {/* Belge sekmeler */}
      <div className="flex border-b overflow-x-auto">
        {documents.map((doc, i) => (
          <button
            key={doc.id}
            onClick={() => setActiveDocIndex(i)}
            className={cn(
              "px-4 py-2 text-sm whitespace-nowrap border-r",
              i === activeDocIndex && "bg-blue-50 text-blue-700"
            )}
          >
            {doc.documentType} {/* INVOICE, PACKING_LIST vs. */}
            {annotations.some(a => a.sourceDocumentId === doc.id) && (
              <span className="ml-1 bg-red-100 text-red-700 text-xs px-1.5 rounded-full">
                !
              </span>
            )}
          </button>
        ))}
      </div>
      
      {/* PDF render + highlight'lar */}
      <div className="flex-1 relative overflow-auto">
        <Document
          file={activeDoc.signedUrl}
          onLoadSuccess={({ numPages }) => setPageCount(numPages)}
        >
          {Array.from({ length: pageCount }, (_, i) => (
            <div key={i} className="relative">
              <Page pageNumber={i + 1} width={containerWidth} />
              
              {/* Hata annotation'ları */}
              {docAnnotations
                .filter(a => a.pageNumber === i + 1)
                .map(annotation => (
                  <FieldHighlight
                    key={annotation.ruleCode}
                    bbox={annotation.bbox}
                    severity={annotation.severity}
                    message={annotation.detailMessage}
                    isActive={highlightedField === annotation.affectedField}
                    onClick={() => setHighlightedField(annotation.affectedField)}
                  />
                ))
              }
            </div>
          ))}
        </Document>
      </div>
    </div>
  );
}
```

### 13.3 SSE Client — Gerçek Zamanlı Durum

```typescript
// components/SubmissionStatusStream.tsx

export function SubmissionStatusStream({ submissionId }: { submissionId: string }) {
  const [status, setStatus] = useState<SubmissionStatus | null>(null);
  
  useEffect(() => {
    const evtSource = new EventSource(
      `/api/v1/submissions/${submissionId}/stream`,
      { withCredentials: true }
    );
    
    evtSource.addEventListener('update', (e) => {
      const data = JSON.parse(e.data);
      setStatus(data);
      
      if (data.status === 'completed' || data.status === 'failed') {
        evtSource.close();
        // Sayfayı yenile — tüm sonuçları göster
        router.refresh();
      }
    });
    
    return () => evtSource.close();
  }, [submissionId]);
  
  if (!status) return null;
  
  return (
    <div className="fixed bottom-4 right-4 bg-white border rounded-lg shadow-sm p-4 min-w-64">
      <div className="flex items-center gap-3">
        <Spinner className="w-4 h-4" />
        <div>
          <p className="text-sm font-medium">{status.message}</p>
          <div className="mt-2 bg-gray-100 rounded-full h-1.5">
            <div
              className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${status.progress}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
```

---

## 14. Authentication ve RBAC {#14}

### 14.1 Keycloak Kurulumu

```yaml
# Keycloak realm konfigürasyonu (JSON export özeti)
realm: gumruk-kontrol
roles:
  realm:
    - super_admin    # Tüm tenant'lara erişim
    - tenant_admin   # Kendi tenant'ını yönet
    - reviewer       # Kuralları ve override'ları onaylayabilir
    - operator       # Dosya yükler, sonuçları görür
    - readonly       # Yalnızca okuma

clients:
  - client-id: gumruk-api
    protocol: openid-connect
    access-type: confidential
    
  - client-id: gumruk-web
    protocol: openid-connect
    access-type: public
    valid-redirect-uris:
      - https://app.gumrukkontrol.com/*
```

### 14.2 FastAPI Permission Sistemi

```python
# dependencies.py

class Permission(str, Enum):
    SUBMISSION_CREATE = "submission:create"
    SUBMISSION_READ = "submission:read"
    SUBMISSION_DELETE = "submission:delete"
    OVERRIDE_CREATE = "override:create"
    RULE_MANAGE = "rule:manage"
    TENANT_MANAGE = "tenant:manage"
    REPORT_READ = "report:read"

ROLE_PERMISSIONS = {
    "operator": [
        Permission.SUBMISSION_CREATE,
        Permission.SUBMISSION_READ,
        Permission.OVERRIDE_CREATE,
        Permission.REPORT_READ,
    ],
    "reviewer": [
        # operator'ın tüm yetkileri + ek
        *ROLE_PERMISSIONS["operator"],
        Permission.RULE_MANAGE,
    ],
    "tenant_admin": [
        # reviewer'ın tüm yetkileri + ek
        *ROLE_PERMISSIONS["reviewer"],
        Permission.TENANT_MANAGE,
    ],
    "super_admin": list(Permission),  # Tüm yetkiler
}

def require_permission(permission: Permission):
    async def _check(
        current_user: User = Depends(get_current_user)
    ) -> User:
        user_perms = ROLE_PERMISSIONS.get(current_user.role, [])
        if permission not in user_perms:
            raise HTTPException(403, f"{permission} yetkisi gerekli")
        return current_user
    return _check

# Kullanım:
@router.post("/submissions")
async def create_submission(
    _: User = Depends(require_permission(Permission.SUBMISSION_CREATE))
):
    ...
```

---

## 15. Multi-Tenancy Mimarisi {#15}

### 15.1 Tenant Context Middleware

```python
# middleware/tenant.py

class TenantMiddleware(BaseHTTPMiddleware):
    """
    Her request'te tenant_id'yi tespit et, DB session'a set et.
    Bu sayede tüm sorgular otomatik olarak tenant'a filtrelenir.
    """
    
    async def dispatch(self, request: Request, call_next):
        # JWT'den tenant_id çek
        token = request.headers.get("Authorization", "").replace("Bearer ", "")
        
        if token:
            try:
                payload = decode_jwt(token)
                tenant_id = payload.get("tenant_id")
                
                if tenant_id:
                    # Thread-local storage'a yaz
                    current_tenant.set(tenant_id)
                    
                    # PostgreSQL session variable'ını set et
                    # Bu RLS'nin çalışması için gerekli
                    request.state.tenant_id = tenant_id
                    
            except Exception:
                pass
        
        response = await call_next(request)
        return response


# DB session factory — tenant context ile
async def get_db() -> AsyncSession:
    async with async_session() as session:
        tenant_id = current_tenant.get(None)
        if tenant_id:
            await session.execute(
                text(f"SET LOCAL app.current_tenant_id = '{tenant_id}'")
            )
        yield session
```

### 15.2 Tenant Başına Kural Özelleştirme

```python
# Tenant'lar kural şiddetini özelleştirebilir
# Örn: Bir tenant DOC-001'i WARNING olarak görmek istiyor

CREATE TABLE tenant_rule_overrides (
    tenant_id   UUID NOT NULL REFERENCES tenants(id),
    rule_id     UUID NOT NULL REFERENCES rules(id),
    is_active   BOOLEAN NOT NULL DEFAULT true,
    severity    VARCHAR(20),          -- NULL = global değeri kullan
    config      JSONB DEFAULT '{}',   -- Parametre override
    PRIMARY KEY (tenant_id, rule_id)
);
```

---

## 16. Mevzuat Senkronizasyon Pipeline'ı {#16}

```python
# tasks/legislation_sync.py

class LegislationSyncTask:
    """
    Resmi Gazete ve Ticaret Bakanlığı kaynaklarını izler.
    Yeni/değişen mevzuatı tespit edip inceleme kuyruğuna alır.
    Otomatik indexleme YOK — insan onayı gerekir.
    """
    
    SOURCES = [
        {
            "name": "Resmi Gazete",
            "url": "https://www.resmigazete.gov.tr/",
            "rss": "https://www.resmigazete.gov.tr/rss.xml",
            "keywords": ["gümrük", "ithalat", "ihracat", "tebliğ", "yönetmelik"],
        },
        {
            "name": "Ticaret Bakanlığı",
            "url": "https://www.trade.gov.tr/",
            "check_path": "/mevzuat",
        },
    ]
    
    @celery_app.task(queue="default")
    async def check_for_updates(self):
        for source in self.SOURCES:
            new_docs = await self._scrape_new_documents(source)
            
            for doc in new_docs:
                # Mevcut indexde var mı?
                existing = await self._find_existing(doc)
                
                if not existing:
                    # Yeni belge → inceleme kuyruğuna ekle
                    await self._queue_for_review(doc, action="NEW")
                elif self._has_changed(existing, doc):
                    # Değişmiş → inceleme kuyruğuna ekle + eski işaretle
                    await self._queue_for_review(doc, action="UPDATED")
                    await self._mark_stale(existing)
    
    # Bu task'ı her gün sabah 06:00'da çalıştır
    # celery beat schedule'a ekle
```

---

## 17. Kendi Modelini Eğitme Stratejisi {#17}

### 17.1 Veri Toplama Aşaması (Sürekli)

Her dosya işlendiğinde model eğitimi için değerli veri üretilir. Bu veriyi sistemli topla:

```python
# services/training_data_collector.py

class TrainingDataCollector:
    """
    Üretim sisteminden model eğitimi için veri toplar.
    Tüm veriler anonimleştirilir — KVKK uyumu zorunlu.
    """
    
    async def collect_from_submission(
        self,
        submission_id: str,
        rule_results: List[RuleResult],
        overrides: List[Override],
        llm_explanation: Optional[str],
    ):
        
        # 1. OCR kalite örnekleri
        for doc in documents:
            if doc.extraction.confidence > 0.9:
                # Yüksek güven → pozitif eğitim örneği
                await self._save_sample(
                    sample_type="extraction",
                    input_data=self._anonymize(doc.raw_text),
                    expected_output=doc.structured_data,
                    quality_score=doc.extraction.confidence,
                )
        
        # 2. Kural motoru örnekleri
        for result in rule_results:
            if result.status == RuleStatus.FAIL:
                # Operatörün override kararı → etiket
                override = next(
                    (o for o in overrides if o.rule_result_id == result.id),
                    None
                )
                
                if override:
                    # Override yapıldıysa → "false positive" olabilir
                    label = "false_positive" if override.action == "ACCEPT_RISK" else "true_positive"
                else:
                    label = "true_positive"  # Override yoksa doğru alarm
                
                await self._save_sample(
                    sample_type="rule_result",
                    input_data=self._anonymize(result.__dict__),
                    expected_output={"label": label},
                    quality_score=None,  # İnsan validasyonu bekliyor
                )
        
        # 3. LLM çıktı kalitesi
        if llm_explanation:
            # Operatörün geri bildirimi varsa kalite skorunu kaydet
            await self._save_sample(
                sample_type="llm_explanation",
                input_data=self._build_llm_input(rule_results),
                expected_output={"explanation": llm_explanation},
            )
    
    def _anonymize(self, data: dict) -> dict:
        """
        Kişisel ve ticari gizli verileri anonimleştir.
        KVKK uyumu için zorunlu.
        """
        sensitive_fields = [
            "tax_id", "company_name", "importer_name", "exporter_name",
            "invoice_number", "bl_number", "address", "email", "phone"
        ]
        
        anonymized = data.copy()
        for field in sensitive_fields:
            if field in anonymized:
                # Deterministik hash — aynı değer hep aynı token'a eşlenir
                # Bu sayede "aynı şirket" ilişkisi korunur ama kimlik açığa çıkmaz
                anonymized[field] = f"[{field.upper()}_{self._hash(anonymized[field])}]"
        
        return anonymized
```

### 17.2 Model Eğitim Yol Haritası

```
AŞAMA 1 — Veri Toplama (Ay 1-6)
  Hedef: En az 10.000 anonimleştirilmiş dosya örneği
  Yapılacak:
    - training_samples tablosunu doldur
    - Alan çıkarım doğruluğunu insan validasyonu ile işaretle
    - False positive kural sonuçlarını etiketle
    - LLM açıklama kalitesini operatörlerle değerlendir (1-5 puan)

AŞAMA 2 — Alan Çıkarım Modeli (Ay 6-9)
  Hedef: OCR sonrası alan çıkarımı için fine-tune
  Temel model: LayoutLMv3 (Microsoft, belge anlama)
  Neden: Görsel + metin birlikte işler, gümrük belgelerinin tablo yapısına uygun
  Eğitim:
    - Input: PDF sayfa görüntüsü + OCR metni
    - Output: Yapılandırılmış alan JSON
    - Dataset: 5.000+ anonimleştirilmiş beyanname seti
  Altyapı:
    - Azure ML / HuggingFace Accelerate
    - 4× A100 GPU, ~3-5 gün eğitim
  Beklenen kazanım:
    - Alan çıkarım doğruluğu %85 → %95+
    - Azure Document Intelligence bağımlılığı azalır → maliyet düşer

AŞAMA 3 — Risk Skoru Modeli (Ay 9-12)
  Hedef: Kural motorunun yakalayamadığı örüntü anomalilerini tespit et
  Temel model: XGBoost / LightGBM (yorumlanabilirlik kritik)
  Input özellikler:
    - Tarihsel benzer dosya vektörü
    - GTİP geçmişi (bu firma bu GTİP'i daha önce kullandı mı?)
    - Değer anomali skoru
    - Operatör geçmişi (bu operatörün hata oranı)
  Output: Anomali skoru (0-1) + açıklama
  Neden XGBoost değil derin öğrenme:
    - Müşteri "neden bu şüpheli?" diye sorar — karar ağacı açıklanabilir
    - SHAP değerleriyle hangi özellik anomaliyi tetikledi gösterilebilir

AŞAMA 4 — GTİP Öneri Modeli (Ay 12+)
  Hedef: Eşya tanımından GTİP kodu önerisi
  Temel model: DistilBERT fine-tune (Türkçe)
  Dataset: Türk Gümrük Tarife Cetveli + geçmiş beyanname çiftleri
  Çıktı: Top-5 GTİP önerisi + güven skoru

AŞAMA 5 — LLM Fine-Tuning (Ay 18+)
  Hedef: Gümrük alanına özelleşmiş açıklama modeli
  Yöntem: OpenAI fine-tuning API veya Mistral fine-tune
  Dataset:
    - Kural hatası → operatör açıklaması çiftleri
    - Mevzuat soru-cevap çiftleri
    - Yüksek kalite puanlı LLM açıklamaları
  Beklenen kazanım:
    - Daha az hallucination
    - Daha kısa, net açıklamalar
    - gpt-4o-mini yerine fine-tune edilmiş küçük model → %70 maliyet tasarrufu
```

### 17.3 Model Deployment Stratejisi

```python
# services/model_registry.py

class ModelRegistry:
    """
    Eğitilmiş modelleri versiyonlayarak production'a alır.
    Eski model silinmez — her zaman rollback mümkün.
    """
    
    async def promote_to_production(self, model_version_id: str):
        new_version = await self.get_version(model_version_id)
        
        # A/B test: Önce %10 trafikte dene
        await self._set_traffic_split(
            model_type=new_version.model_type,
            splits=[
                {"version_id": model_version_id, "traffic_pct": 10},
                {"version_id": self.current_production_id, "traffic_pct": 90},
            ]
        )
        
        # 48 saat sonra metrikler iyiyse %100'e çıkar
        await asyncio.sleep(48 * 3600)
        
        if await self._check_metrics_acceptable(model_version_id):
            await self._set_traffic_split(
                model_type=new_version.model_type,
                splits=[{"version_id": model_version_id, "traffic_pct": 100}]
            )
            new_version.is_production = True
        else:
            # Rollback
            await self._set_traffic_split(
                model_type=new_version.model_type,
                splits=[{"version_id": self.current_production_id, "traffic_pct": 100}]
            )
            logger.error("Model A/B test başarısız — rollback yapıldı")
```

---

## 18. KVKK ve Veri Güvenliği {#18}

### 18.1 Veri Sınıflandırması

```
KİŞİSEL VERİ (KVKK Madde 6)
  - Gerçek kişi müşavir adları
  - TC kimlik numaraları
  - İletişim bilgileri

TİCARİ SIRLAR (özel dikkat)
  - Firma unvanları ve vergi numaraları
  - Ticaret miktarları ve fiyatları
  - Tedarikçi bilgileri
  - Ticaret rotaları

ZORUNLU SAKLAMA (gümrük mevzuatı)
  - Beyanname kayıtları: 5 yıl
  - İşlem logları: 5 yıl
```

### 18.2 Teknik Önlemler

```python
# KVKK uyum checklist

# 1. Şifreleme — tüm hassas alanlar şifreli tutulur
class EncryptedField(TypeDecorator):
    """Hassas alanlar DB'de şifreli saklanır."""
    impl = Text
    
    def process_bind_param(self, value, dialect):
        if value:
            return encrypt(value, settings.FIELD_ENCRYPTION_KEY)
        return value
    
    def process_result_value(self, value, dialect):
        if value:
            return decrypt(value, settings.FIELD_ENCRYPTION_KEY)
        return value

# Kullanım:
class UploadedDocument(Base):
    original_filename = Column(EncryptedField)  # Dosya adı şifreli

# 2. Veri minimizasyonu
# LLM'e gönderilen veri anonimleştirilmiş olmalı
# Tam fatura metni yerine sadece alanlar gönderilir

# 3. Veri silme
async def delete_tenant_data_after_retention(tenant_id: str):
    """
    Tenant'ın retention policy'si dolduğunda verileri sil.
    Ham dosyalar cold storage'dan silinir, meta veriler saklanır.
    """
    cutoff = datetime.now() - timedelta(days=tenant.data_retention_days)
    
    docs_to_delete = await db.execute(
        select(UploadedDocument)
        .where(UploadedDocument.tenant_id == tenant_id)
        .where(UploadedDocument.uploaded_at < cutoff)
    )
    
    for doc in docs_to_delete:
        await blob_service.delete(doc.blob_path)
        doc.blob_path = None
        doc.deleted_at = datetime.now()

# 4. KVKK başvuru endpoint'i
@router.post("/gdpr/data-export")
async def export_user_data(current_user: User = Depends(get_current_user)):
    """Kullanıcı kendi verilerini export edebilir."""
    ...

@router.delete("/gdpr/delete-my-data")
async def delete_user_data(current_user: User = Depends(get_current_user)):
    """Kullanıcı hesabını ve verilerini silebilir."""
    ...
```

---

## 19. Monitoring, Logging ve Alerting {#19}

### 19.1 Metrik Tanımları

```python
# Prometheus metrikleri
from prometheus_client import Counter, Histogram, Gauge

SUBMISSION_COUNTER = Counter(
    "submissions_total",
    "Toplam submission sayısı",
    ["tenant_id", "status"]
)

PROCESSING_DURATION = Histogram(
    "submission_processing_seconds",
    "Submission işleme süresi",
    buckets=[5, 10, 30, 60, 120, 300]
)

RULE_FAILURES = Counter(
    "rule_failures_total",
    "Kural ihlali sayısı",
    ["rule_code", "severity"]
)

LLM_COST = Counter(
    "llm_cost_usd_total",
    "Toplam LLM maliyeti",
    ["provider", "model"]
)

QUEUE_LENGTH = Gauge(
    "celery_queue_length",
    "Celery queue uzunluğu",
    ["queue_name"]
)
```

### 19.2 Kritik Alert'ler

```yaml
# Grafana alert kuralları

alerts:
  - name: HighErrorRate
    condition: rule_failures{severity="ERROR"} / submissions_total > 0.3
    message: "Son 1 saatte dosyaların %30'undan fazlasında ERROR — kural motoru veya OCR sorunu olabilir"
    
  - name: LLMCostSpike
    condition: rate(llm_cost_usd_total[1h]) > 50
    message: "LLM maliyeti saatte $50'ı geçti — beklenmedik yük"
    
  - name: QueueBacklog
    condition: celery_queue_length{queue_name="ocr"} > 500
    message: "OCR queue'su büyüyor — worker sayısı artırılmalı"
    
  - name: ProcessingTimeout
    condition: histogram_quantile(0.95, submission_processing_seconds) > 120
    message: "Submission'ların %5'i 2 dakikayı aşıyor — performans sorunu"
```

---

## 20. CI/CD ve Test Stratejisi {#20}

### 20.1 Test Katmanları

```python
# Backend test yapısı

# 1. Birim testler — kural motoru (en kritik)
# tests/test_rules/test_document_match.py

class TestInvoiceAmountMatchRule:
    
    def test_matching_amounts_pass(self):
        rule = InvoiceAmountMatchRule()
        ctx = RuleContextFactory.build(
            invoice_amount=10000.00,
            declaration_value=10000.00,
        )
        result = rule.evaluate(ctx)
        assert result.status == RuleStatus.PASS
    
    def test_5pct_difference_fails(self):
        rule = InvoiceAmountMatchRule()
        ctx = RuleContextFactory.build(
            invoice_amount=10000.00,
            declaration_value=9400.00,  # %6 fark
        )
        result = rule.evaluate(ctx)
        assert result.status == RuleStatus.FAIL
        assert result.severity == RuleSeverity.ERROR
        assert "fatura tutarı" in result.detail_message.lower()
    
    def test_missing_invoice_skips(self):
        rule = InvoiceAmountMatchRule()
        ctx = RuleContextFactory.build(invoice_amount=None)
        result = rule.evaluate(ctx)
        assert result.status == RuleStatus.SKIPPED

# 2. Kural regresyon testleri
# Yeni kural eklenmesi mevcut geçen testleri bozmamalı
# tests/test_rules/golden_tests/
#   - standart_ithalat_temiz.json → 0 ERROR beklenir
#   - fatura_uyumsuz.json → DOC-001 ERROR beklenir
#   - eksik_gtip.json → MAN-001 ERROR beklenir

# 3. API entegrasyon testleri
# tests/test_api/test_submissions.py

async def test_upload_creates_submission(client, auth_headers, sample_files):
    response = await client.post(
        "/api/v1/submissions",
        files=sample_files,
        headers=auth_headers,
    )
    assert response.status_code == 202
    data = response.json()
    assert data["status"] == "pending"
    assert "id" in data

# 4. E2E testler (Playwright)
# tests/e2e/test_submission_flow.py
# Gerçek bir dosya yükle → işlemenin tamamlanmasını bekle → sonuçları doğrula
```

### 20.2 GitHub Actions Pipeline

```yaml
# .github/workflows/main.yml

name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test-backend:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_DB: test_db
          POSTGRES_PASSWORD: test
      redis:
        image: redis:7
    steps:
      - uses: actions/checkout@v4
      - name: Python kurulum
        uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - name: Bağımlılıklar
        run: pip install -r requirements.txt
      - name: Birim testler
        run: pytest tests/ -v --cov=apps/api --cov-report=xml
      - name: Kural regresyon testleri
        run: pytest tests/test_rules/golden_tests/ -v
  
  test-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Node kurulum
        uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: npm ci
      - run: npm run type-check
      - run: npm run test
  
  build-and-push:
    needs: [test-backend, test-frontend]
    if: github.ref == 'refs/heads/main'
    steps:
      - name: Docker build + push
        run: |
          docker build -f infrastructure/docker/Dockerfile.api -t gumruk-api:${{ github.sha }} .
          docker push acr.azurecr.io/gumruk-api:${{ github.sha }}
  
  deploy-staging:
    needs: build-and-push
    environment: staging
    steps:
      - name: K8s deploy
        run: |
          kubectl set image deployment/api api=gumruk-api:${{ github.sha }}
          kubectl rollout status deployment/api
```

---

## 21. Deployment — Production Kurulum {#21}

### 21.1 Kubernetes Temel Yapı

```yaml
# infrastructure/k8s/api-deployment.yaml

apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  namespace: gumruk-prod
spec:
  replicas: 3              # 3 API pod başlangıç
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0    # Zero-downtime deploy
  selector:
    matchLabels:
      app: api
  template:
    spec:
      containers:
        - name: api
          image: acr.azurecr.io/gumruk-api:latest
          ports:
            - containerPort: 8000
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: db-secret
                  key: url
            - name: REDIS_URL
              valueFrom:
                secretKeyRef:
                  name: redis-secret
                  key: url
          resources:
            requests:
              cpu: "500m"
              memory: "512Mi"
            limits:
              cpu: "2000m"
              memory: "2Gi"
          livenessProbe:
            httpGet:
              path: /health
              port: 8000
            initialDelaySeconds: 30
          readinessProbe:
            httpGet:
              path: /ready
              port: 8000

---
# HPA — Otomatik ölçekleme
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api
  minReplicas: 3
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: External
      external:
        metric:
          name: celery_queue_length
          selector:
            matchLabels:
              queue: ocr
        target:
          type: AverageValue
          averageValue: "50"   # Queue 50'yi geçince worker ekle
```

### 21.2 Ortam Değişkenleri

```bash
# .env.production (şifreli vault'ta saklanır)

# Veritabanı
DATABASE_URL=postgresql+asyncpg://user:pass@postgres:5432/gumruk_prod
DATABASE_POOL_SIZE=20
DATABASE_MAX_OVERFLOW=40

# Redis
REDIS_URL=redis://redis:6379/0
REDIS_CACHE_URL=redis://redis:6379/2

# Blob Storage
AZURE_STORAGE_CONNECTION_STRING=...
AZURE_STORAGE_CONTAINER=documents
AZURE_STORAGE_COLD_CONTAINER=documents-cold

# OCR
AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT=...
AZURE_DOCUMENT_INTELLIGENCE_KEY=...
PADDLE_OCR_GPU_ENABLED=true

# LLM
OPENAI_API_KEY=...
OPENAI_ORG_ID=...
ANTHROPIC_API_KEY=...
LLM_PRIMARY_PROVIDER=openai
LLM_PRIMARY_MODEL=gpt-4o-mini
LLM_FALLBACK_PROVIDER=anthropic
LLM_FALLBACK_MODEL=claude-haiku-4-5-20251001

# Vektör DB
QDRANT_URL=http://qdrant:6333
QDRANT_COLLECTION=legislation_tr

# Auth
KEYCLOAK_URL=https://auth.gumrukkontrol.com
KEYCLOAK_REALM=gumruk
KEYCLOAK_CLIENT_ID=gumruk-api
KEYCLOAK_CLIENT_SECRET=...

# Güvenlik
FIELD_ENCRYPTION_KEY=...         # 256-bit AES anahtarı
JWT_SECRET=...
ALLOWED_ORIGINS=https://app.gumrukkontrol.com

# Monitoring
SENTRY_DSN=...
PROMETHEUS_PORT=9090
```

---

## 22. Faz Planı ve Milestone'lar {#22}

### Faz 0 — Hazırlık (Hafta 1-2)

```
□ Monorepo kurulumu ve klasör yapısı
□ Docker Compose local ortam (PostgreSQL, Redis, Qdrant)
□ Alembic migrations — temel tablolar
□ Keycloak kurulumu ve realm konfigürasyonu
□ Azure blob storage bağlantısı
□ CI/CD pipeline iskelet (GitHub Actions)
□ Gümrük müşaviri ile 3 senaryo workshop'u
□ 10 adet anonim örnek belge seti toplama
```

### Faz 1 — MVP (Hafta 3-10)

```
□ Dosya yükleme API + blob storage
□ PyMuPDF + pdfplumber text extraction
□ PaddleOCR entegrasyonu (GPU worker)
□ Alan çıkarım servisi (regex + basit LLM fallback)
□ İlk 30 kural implementasyonu
  □ 8 belge uyumu kuralı (DOC-*)
  □ 8 zorunlu alan kuralı (MAN-*)
  □ 6 değer kontrolü (VAL-*)
  □ 5 ağırlık kontrolü (WGT-*)
  □ 3 GTİP kuralı (GTIP-*)
□ Risk skoru hesaplama
□ Celery task zinciri
□ SSE gerçek zamanlı güncelleme
□ Temel mevzuat corpus indexleme (5 ana kaynak)
□ LLM açıklama katmanı (hatalı dosyalar için)
□ Frontend — dosya yükleme ve risk raporu ekranı
□ Frontend — PDF viewer + annotation
□ Override/onay akışı
□ Audit log
□ Multi-tenant RLS
□ Keycloak RBAC entegrasyonu
□ 5 gerçek müşteri ile pilot test
```

### Faz 2 — Operasyonel Olgunluk (Hafta 11-18)

```
□ Kural kataloğunu 100+'a çıkar
□ Tenant bazlı kural özelleştirme
□ Admin paneli — kural editörü
□ Mevzuat otomatik senkronizasyon
□ Benzer dosya karşılaştırma (basit heuristic)
□ Operatör performans raporu
□ Aylık özet raporları
□ Email bildirimleri (yüksek riskli dosyalar)
□ API rate limiting
□ Tenant başına dosya kotası uygulaması
□ Çoklu dil desteği (beyanname İngilizce de gelebilir)
□ Training data collector aktif
□ Yük testi (1000 kullanıcı simülasyonu)
□ Pen test
□ 50 müşteri hedefi
```

### Faz 3 — Büyüme (Ay 5-9)

```
□ LayoutLMv3 alan çıkarım modeli eğitimi
□ Anomali tespit katmanı
□ Copilot soru-cevap (contextual)
□ Contolled draft öneri (düşük riskli alanlar)
□ Mobil uyumlu UI
□ GTİP öneri modeli (beta)
□ Azure Turkey North migration (KVKK tam uyum)
□ ISO 27001 sertifika süreci başlatma
□ 200 müşteri hedefi
```

### Faz 4 — Pazar Liderliği (Ay 9+)

```
□ LLM fine-tuning (gümrük domain'i)
□ BİLGE/YKTS entegrasyonu (mümkünse)
□ API — müşterilerin kendi sistemleriyle entegrasyon
□ White-label (büyük brokerage firmaları için)
□ Model marketplace (tenant'lar arası kural paylaşımı)
□ 500+ müşteri hedefi
```

---

## Özet — Kritik Başarı Faktörleri

1. **Kural motoru kalitesi birincil önceliktir.** İlk 30 kural mükemmel çalışmazsa LLM katmanı fark yaratmaz. Gümrük müşaviriyle her kuralı tek tek doğrula.

2. **OCR kalitesi veri kalitesini belirler.** Gümrük belgelerinin %30-40'ı taranmış gelecek. PaddleOCR'ı Türkçe örneklerle önceden test et.

3. **Eğitim verisi toplamayı birinci günden başlat.** training_samples tablosunu doldur, anonimleştir, insan validasyonuyla etiketle. 6 ay sonra bu veri fark yaratacak.

4. **Multi-tenancy retrofit olmaz.** RLS ve tenant_id birinci günden her tabloda var.

5. **LLM olmadan sistem çalışmalı.** Her LLM çağrısı opsiyonel — graceful degradation test edilmeli.

6. **Audit log kutsal.** Gümrük operasyonlarında "kim ne zaman ne kararı aldı" sorusu yasal bir gereklilik olabilir.