# Gümrük Beyanname Akıllı Kontrol Sistemi — `outline.md`

> **Belge amacı:** Bu doküman, Codex'in projeyi sıfırdan geliştirmeye başlayabilmesi için hazırlanmış ayrıntılı uygulama planıdır.  
> Bu belge; ürün kapsamını, teknik mimariyi, veri modelini, geliştirme sırasını, bekleyen girdileri, geçici varsayımları ve sonraki genişleme noktalarını içerir.  
> Henüz eksik olan domain girdileri (gümrük müşaviri teyitleri, ek örnek dosyalar, gerçek kullanıcı akışları vb.) daha sonra sisteme minimum kırılımla eklenebilecek şekilde yapı kurgulanacaktır.

---

## 0. Çok Kısa Özet

Bu ürün, gümrük müşavirliği ofislerinde **belge paketi + beyanname çıktısı** üzerinden çalışan bir **ön kontrol ve son kontrol uygulaması**dır.

Amaç:
- belge eksiklerini tespit etmek,
- belge-belge ve belge-beyanname uyumsuzluklarını yakalamak,
- temel kural ihlallerini belirlemek,
- kullanıcıya açıklamalı risk raporu sunmak.

Bu ürün:
- Bakanlık sistemlerinin yerine geçmez,
- BİLGE / YKTS / TPS ile doğrudan entegre olmaz,
- dosyaları **manuel yükleme** mantığıyla çalışır,
- ilk aşamada **OpenAI birincil model sağlayıcısı** kullanır,
- ikinci sağlayıcı olarak **Anthropic/Claude** için şimdilik placeholder bırakır.

İlk ürün mimarisi:
- **Frontend / App Hosting:** Vercel
- **Ana veritabanı:** Neon Postgres
- **Belge depolama:** object storage (Vercel Blob veya S3-uyumlu servis; seçim sonra netleştirilecek)
- **AI / processing:** server-side API route + asenkron job mantığı
- **Ağır OCR / yoğun processing:** sonraki aşamada ayrı worker servisine taşınabilir

---

# 1. Temel İlkeler

## 1.1 Ürün ilkeleri

1. **Kural motoru birincil, LLM ikincil**
   - Hata tespiti öncelikle rule-based yapılır.
   - LLM açıklama, sınıflandırma desteği, yapılandırılmış extraction ve kullanıcı dostu özet için kullanılır.

2. **Belge paketi merkezlidir**
   - Sistem tek belge üzerinden değil, bir işlem dosyasındaki belge paketi üzerinden çalışır.
   - Bir submission birden fazla belge içerir.

3. **Beyanname çıktısı ayrı ve kritik bir belge türüdür**
   - Kaynak belge değildir.
   - Son kontrol ve belge-beyanname karşılaştırma için kullanılır.

4. **MVP’de manuel yükleme vardır**
   - Resmî sistem entegrasyonu yoktur.
   - Kullanıcı belgeleri sisteme yükler.

5. **Eksik domain bilgileri sistemde yer tutucu (placeholder) ile modellenir**
   - Gümrük müşaviri teyitleri,
   - daha fazla örnek dosya,
   - istisna senaryoları,
   - özel belge türleri
   sonradan eklenebilir.

6. **Secret / API key asla kod, doküman veya commit içinde yer almaz**
   - Tüm gizli bilgiler environment variable / secret store’da tutulur.

---

# 2. Ürünün Çözdüğü Problem

## 2.1 Ana problem

Gümrük müşavirliği ofislerine gelen dosya paketlerinde:
- eksik belge,
- yanlış belge,
- belge versiyon karışıklığı,
- belge içi veri hatası,
- belgeler arası tutarsızlık,
- beyannameye yanlış veri aktarımı

gibi problemler oluşabilir.

Bu ürün, resmî tescil öncesinde ve varsa beyanname çıktısı geldikten sonra son kontrolde bu hataları sistematik biçimde görünür kılar.

## 2.2 Ne yapmaz?

Bu ürün:
- resmî beyanname oluşturmaz,
- BİLGE’ye veri göndermez,
- TPS başvurusu yapmaz,
- kesin GTİP kararı vermez,
- hukuki görüş yerine geçmez.

---

# 3. İlk Sürüm Kapsamı (MVP)

## 3.1 MVP’de desteklenecek işlem türleri

İlk sürümde yalnızca aşağıdakiler aktif olarak hedeflenecek:

1. **İhracat dosyası**
2. **İthalat dosyası**

İkinci dalga / sonraki fazlar:
- transit,
- antrepo,
- geçici ithalat,
- dahilde işleme,
- hariçte işleme,
- özel izin/uygunluk yoğun dosyalar

## 3.2 MVP’de desteklenecek belge türleri

İlk sürümde çekirdek belge türleri:

1. `INVOICE` — Ticari Fatura / E-Fatura
2. `PACKING_LIST` — Packing List / Çeki Listesi
3. `LOADING_INSTRUCTION` — Yükleme Talimatı
4. `TRANSPORT_DOC` — Taşıma Belgesi (CMR / AWB / B/L vb.)
5. `DECLARATION_OUTPUT` — Beyanname Çıktısı / Kontrol Çıktısı
6. `ORIGIN_DOC` — Menşe / Dolaşım Belgesi
7. `PERMIT_DOC` — İzin / Uygunluk / Kontrol Belgesi
8. `OTHER` — Diğer destekleyici belge

**Not:** müşavirden gelecek teyitler sonrasında bu liste revize edilebilir.

## 3.3 MVP’de yapılacak ana işler

- kullanıcı giriş yapar
- submission oluşturur
- belge türüne göre dosya yükler
- sistem belge tipini doğrulamaya çalışır
- sistem extraction yapar
- temel kuralları çalıştırır
- risk raporu üretir
- kullanıcı hataları, eksikleri ve belge uyuşmazlıklarını görür
- varsa beyanname çıktısıyla karşılaştırma yapılır

---

# 4. Şu Anda Bilinenler ve Bilinmeyenler

## 4.1 Bilinenler

- Manuel dosya yükleme olacak.
- Belgeler çoğunlukla PDF olacak gibi görünüyor.
- Tek submission içinde çoklu belge olacak.
- Beyanname çıktısı ayrı belge türü olarak kullanılacak.
- İlk teknoloji yönü: **Vercel + Neon**
- OpenAI birincil sağlayıcı olacak.
- Claude entegrasyonu placeholder olarak duracak.

## 4.2 Henüz netleşmemiş ama ileride gelecek girdiler

Bu girdiler geldiğinde sisteme zarar vermeden eklenebilmesi gerekir:

1. Gümrük müşavirlerinin dolduracağı Excel teyit formu sonuçları
2. Daha fazla gerçek örnek belge paketi
3. Hatalı / düzeltilmiş dosya örnekleri
4. Düşük kaliteli taranmış dosyalar
5. Özel rejim senaryoları
6. Kullanıcıların gerçek çıktı beklentileri
7. Belge türleri listesinde düzeltme ihtiyacı
8. İlk rule catalog için müşavir teyitleri

## 4.3 Tasarım ilkesi

**Eksik domain bilgisi nedeniyle sistem durmamalı.**  
Bunun için:
- enum’lar genişletilebilir,
- yeni belge türleri eklenebilir,
- yeni kurallar migration gerektirmeden veritabanından eklenebilir,
- extraction şemaları versiyonlanabilir.

---

# 5. Önerilen Yüksek Seviye Mimari

## 5.1 İlk ürün mimarisi

- **Frontend:** Next.js (Vercel)
- **App/API:** Next.js server actions + route handlers veya hafif backend route’ları
- **Database:** Neon Postgres
- **File storage:** object storage
- **AI processing:** server-side application logic
- **Async jobs:** başlangıçta hafif kuyruklu yapı; sonraki aşamada ayrı worker
- **LLM provider:** OpenAI
- **Secondary provider:** Anthropic placeholder (inactive)

## 5.2 Neden bu seçim?

Bu mimari:
- hızlı PoC çıkarır,
- Vercel ile deployment’ı kolaylaştırır,
- Neon ile Postgres’i yönetmeyi kolaylaştırır,
- ileride worker servislerini ayırmaya izin verir.

## 5.3 Büyüme yolu

### Faz 1
- Vercel + Neon
- düşük/orta hacim
- temel processing

### Faz 2
- asenkron job sistemi güçlenir
- OCR katmanı derinleşir
- provider abstraction tamamlanır

### Faz 3
- ağır belge işleme ayrı servise taşınır
- yoğun kullanım ve eşzamanlılık artar

### Faz 4
- multi-tenant hardening
- daha gelişmiş audit, SLA, enterprise özellikleri

---

# 6. Teknoloji Kararları

## 6.1 Temel stack

- **Frontend framework:** Next.js
- **Dil:** TypeScript
- **UI:** Tailwind + component library
- **Database:** PostgreSQL (Neon)
- **ORM:** Prisma veya Drizzle  
  - **Tercih önerisi:** Prisma ile başla (okunabilirlik ve migration rahatlığı için)
- **Storage:** object storage
- **Validation:** Zod
- **Background tasks:** başlangıçta DB-backed job tablosu + cron/queue stratejisi
- **Observability:** temel loglama + hata yakalama
- **Auth:** başlangıçta uygulama içi auth / managed auth
- **LLM:** OpenAI API
- **Future provider:** Anthropic placeholder

## 6.2 OpenAI kullanımı

İlk sürümde:
- hazır modeli API ile çağır
- fine-tuning ile başlama
- structured outputs / JSON output kullan
- kural motoruyla birlikte çalıştır

### Başlangıç modeli
- **geçici karar:** `gpt-5.4-nano` (veya mevcut API’de bunun karşılığı hangi model id ise environment ile verilecek)
- not: gerçek model adı kod içinde hardcode edilmemeli, env’den gelmeli

### Claude
- şu an aktif değil
- ama provider interface yazılacak
- implementasyon placeholder olacak

---

# 7. Repo ve Monorepo Yapısı

Önerilen yapı:

```txt
repo/
  apps/
    web/
  packages/
    db/
    domain/
    ai/
    rules/
    shared/
  docs/
    outline.md
```

## 7.1 `apps/web`
- Next.js uygulaması
- kullanıcı ekranları
- API route’ları / server actions
- dashboard
- upload ekranları
- rapor ekranları

## 7.2 `packages/db`
- Prisma/Drizzle schema
- migration’lar
- seed script’leri

## 7.3 `packages/domain`
- domain type’ları
- submission mantığı
- belge türleri
- risk score mantığı
- state machine

## 7.4 `packages/ai`
- provider abstraction
- OpenAI implementation
- Anthropic placeholder
- prompt builder
- extraction pipeline

## 7.5 `packages/rules`
- rule definitions
- rule evaluator
- severity constants
- field matcher’lar

## 7.6 `packages/shared`
- ortak util’ler
- logger
- config
- errors
- constants

---

# 8. Domain Model

## 8.1 Ana varlıklar

1. **Tenant**
2. **User**
3. **Submission**
4. **Document**
5. **DocumentVersion**
6. **DocumentExtraction**
7. **DeclarationSnapshot**
8. **Rule**
9. **RuleResult**
10. **RiskReport**
11. **OverrideAction**
12. **AuditLog**
13. **ProviderRunLog**

## 8.2 Submission nedir?

Submission = tek bir işlem dosyası.

Bir submission:
- işlem türü taşır (`IMPORT`, `EXPORT`)
- birden çok belge içerir
- opsiyonel olarak beyanname çıktısı içerir
- işlenme statüsüne sahiptir

## 8.3 Document nedir?

Document = submission içindeki tekil belge.

Özellikler:
- document type
- original filename
- mime type
- uploaded by
- uploaded at
- current version
- status
- confidence
- raw text available mı

## 8.4 DocumentVersion neden gerekli?

Aynı belgenin revize edilmiş halleri gelebilir.

Bu yüzden her document:
- birden fazla version taşıyabilir
- biri aktif version olur
- kullanıcı “son versiyon”u seçebilir
- sistem versiyon farkını kaydedebilir

## 8.5 DeclarationSnapshot nedir?

Beyanname çıktısından veya kullanıcı tarafından girilmiş son beyan verisinden oluşan normalize edilmiş yapı.

Bu:
- kaynak belge değildir
- son kontrol hedefidir

---

# 9. Veritabanı Tasarımı

## 9.1 Tablolar

En az şu tablolar oluşturulmalı:

### Core
- `tenants`
- `users`
- `memberships` (opsiyonel)
- `submissions`
- `documents`
- `document_versions`
- `document_extractions`
- `declaration_snapshots`
- `declaration_items`

### Rules / Reports
- `rules`
- `rule_results`
- `risk_reports`
- `override_actions`

### Ops / Audit
- `audit_logs`
- `provider_runs`
- `processing_jobs`

## 9.2 Çok önemli alanlar

### `submissions`
- id
- tenant_id
- created_by
- trade_flow (`IMPORT` / `EXPORT`)
- status
- title / reference
- created_at
- updated_at

### `documents`
- id
- submission_id
- type
- label
- is_required_guess
- latest_version_id
- status

### `document_versions`
- id
- document_id
- version_number
- file_url
- original_filename
- mime_type
- file_size
- uploaded_at
- uploaded_by
- is_active
- checksum

### `document_extractions`
- id
- document_version_id
- extraction_status
- extraction_method
- raw_text
- structured_json
- confidence
- created_at

### `declaration_snapshots`
- id
- submission_id
- source_document_version_id
- declaration_number
- declaration_date
- regime_code
- incoterm
- total_value
- currency
- total_net_weight
- total_gross_weight
- package_count
- raw_json

### `rule_results`
- id
- submission_id
- rule_code
- severity
- result (`PASS`, `WARN`, `FAIL`)
- message
- source_refs_json
- created_at

---

# 10. Belge Türleri Sözlüğü

Sabit enum olarak başla, daha sonra admin panelinden genişletilebilir hale getir.

```ts
export const DocumentType = {
  INVOICE: "INVOICE",
  PACKING_LIST: "PACKING_LIST",
  LOADING_INSTRUCTION: "LOADING_INSTRUCTION",
  TRANSPORT_DOC: "TRANSPORT_DOC",
  DECLARATION_OUTPUT: "DECLARATION_OUTPUT",
  ORIGIN_DOC: "ORIGIN_DOC",
  PERMIT_DOC: "PERMIT_DOC",
  OTHER: "OTHER",
} as const;
```

## 10.1 Belge türü başına ilk extraction hedefleri

### INVOICE
- invoice_number
- invoice_date
- seller_name
- buyer_name
- consignee
- currency
- total_amount
- incoterm
- hs_code
- item_description
- quantity
- unit_price

### PACKING_LIST
- package_count
- package_type
- gross_weight
- net_weight
- dimensions
- item_description

### LOADING_INSTRUCTION
- shipper
- consignee
- delivery_address
- gross_weight
- package_count
- goods_description
- delivery_term

### TRANSPORT_DOC
- document_number
- vehicle_plate / awb / bl no
- transport_mode
- departure
- destination

### DECLARATION_OUTPUT
- declaration_number
- declaration_date
- exporter/importer
- regime
- gtip_code
- goods_description
- package_count
- gross_weight
- net_weight
- total_value
- currency
- incoterm
- permit_refs

---

# 11. UI / Kullanıcı Akışları

## 11.1 İlk sürüm ekranları

1. Login
2. Submission listesi
3. Yeni submission oluştur
4. Submission detail
5. Belge yükleme ekranı
6. Belge önizleme
7. Risk report ekranı
8. Rule result detay ekranı
9. Admin panel (çok temel)

## 11.2 Yeni submission akışı

1. Kullanıcı “Yeni Dosya” der
2. İşlem türü seçer: ithalat / ihracat
3. Referans adı girer
4. Belge yükleme alanları açılır
5. Belgeleri tek tek tür seçerek yükler
6. Sistem her belgeyi kabul eder
7. Kullanıcı “Analizi Başlat” der
8. Sistem işlemeyi başlatır
9. Sonuç raporu oluşur

## 11.3 Belge yükleme UX kararı

**Hibrit model:**
- Kullanıcı belge türünü seçer
- Sistem belgeyi otomatik sınıflandırmaya çalışır
- Uyuşmazlık varsa uyarır

---

# 12. İşleme Pipeline’ı

## 12.1 Submission işlendiğinde aşamalar

1. File accepted
2. File stored
3. Document classified
4. Extraction started
5. Extraction completed
6. Structured normalization completed
7. Rule engine started
8. Rule evaluation completed
9. Risk report assembled
10. LLM explanation generated (opsiyonel / koşullu)
11. Final report saved

## 12.2 Job state’leri

- `PENDING`
- `UPLOADED`
- `CLASSIFYING`
- `EXTRACTING`
- `NORMALIZING`
- `RUNNING_RULES`
- `GENERATING_REPORT`
- `COMPLETED`
- `FAILED`

---

# 13. OCR / Extraction Stratejisi

## 13.1 Karar ağacı

### Adım 1 — Belge text-based PDF mi?
- Evetse: önce text extraction dene
- Hayırsa: OCR gerekli

### Adım 2 — Text extraction yeterli mi?
- Yeterliyse structured parse
- Yetersizse OCR fallback

### Adım 3 — OCR confidence düşük mü?
- Düşükse ikinci OCR stratejisi
- Yine düşükse “manual review needed”

## 13.2 İlk sürüm pragmatik strateji

İlk sürümde:
- text-based PDF’leri öncelikli destekle
- zor/scanned belgeyi işaretle
- OCR desteğini modüler kur
- tüm OCR sağlayıcılarını ilk gün bağlama

## 13.3 Önemli not

OCR katmanı provider bağımsız abstraction ile yazılmalı.

Arayüz örneği:
```ts
interface ExtractionProvider {
  extract(document: StoredDocument): Promise<ExtractionResult>;
}
```

İlk implementasyon:
- `TextPdfExtractor`
- `OpenAiAssistedExtractor` (belirli senaryoda)
- `PlaceholderOcrExtractor`

---

# 14. Rule Engine

## 14.1 Rule engine tasarım ilkesi

Kurallar:
- versiyonlanabilir
- kodla veya config ile tanımlanabilir
- severity taşır
- belge türlerine bağlıdır
- kullanıcıya açıklanabilir sonuç üretir

## 14.2 İlk rule kategorileri

1. Mandatory fields
2. Document-document consistency
3. Document-declaration consistency
4. Numeric consistency
5. Weight/package checks
6. Reference presence checks
7. Human-review-needed flags

## 14.3 İlk 20–30 kuralın gerçekten yazılması gerekir

Bu outline’dan sonra ayrı bir dosyada `initial-rule-catalog.md` oluşturulmalı.

Örnek:

### RULE-INV-001
- Rule code: `INV-001`
- Name: Invoice number must exist
- Applies to: INVOICE
- Severity: ERROR
- Logic: invoice_number boş olamaz

### RULE-PL-001
- Rule code: `PL-001`
- Name: Packing list package count must exist
- Applies to: PACKING_LIST
- Severity: WARNING

### RULE-CROSS-001
- Rule code: `CROSS-001`
- Name: Invoice quantity and declaration quantity should match
- Applies to: INVOICE + DECLARATION_OUTPUT
- Severity: ERROR

### RULE-CROSS-002
- Rule code: `CROSS-002`
- Name: Packing list gross weight and declaration gross weight should match
- Applies to: PACKING_LIST + DECLARATION_OUTPUT
- Severity: ERROR

### RULE-CROSS-003
- Rule code: `CROSS-003`
- Name: Loading instruction delivery term and invoice incoterm should match
- Applies to: LOADING_INSTRUCTION + INVOICE
- Severity: WARNING

---

# 15. LLM Katmanı

## 15.1 LLM’in rolleri

LLM şu işlerde kullanılacak:
- belge tipi doğrulama desteği
- düşük yapılandırılmış extraction yardımı
- rule result açıklaması
- kullanıcıya sade risk özeti üretimi

## 15.2 LLM’in yapmayacağı işler

- nihai hukuki karar
- kesin GTİP kararı
- resmî beyan oluşturma
- insan onaysız kritik alan doldurma

## 15.3 Provider abstraction

```ts
interface LlmProvider {
  extractStructured(input: unknown, schemaName: string): Promise<unknown>;
  classifyDocument(input: unknown): Promise<DocumentClassificationResult>;
  explainRuleResults(input: unknown): Promise<ExplanationResult>;
}
```

### Aktif sağlayıcı
- OpenAI

### Pasif sağlayıcı
- Anthropic placeholder

## 15.4 Prompt/Schema yönetimi

Her görev için ayrı şema kullanılmalı:
- `document_classification`
- `invoice_extraction`
- `packing_list_extraction`
- `declaration_output_extraction`
- `risk_summary`

---

# 16. OpenAI Entegrasyonu

## 16.1 Gizli anahtar yönetimi

- Gerçek API key hiçbir dosyaya yazılmaz
- Kodda hardcode edilmez
- `.env.local` / Vercel environment variables kullanılır
- commit edilmez

## 16.2 Config örneği

```env
OPENAI_API_KEY=__SET_IN_VERCEL_ENV_ONLY__
OPENAI_MODEL=gpt-5.4-nano
ANTHROPIC_API_KEY=__PLACEHOLDER__
ANTHROPIC_ENABLED=false
```

## 16.3 Kod ilkesi

- OpenAI client tek yerde tanımlansın
- retry / timeout / logging kontrollü olsun
- request ve response metadata’sı kaydedilsin
- token ve cost tahmini `provider_runs` tablosuna yazılsın

---

# 17. Anthropic Placeholder

Şimdilik yalnızca arayüz hazırlanacak.

Yapılacaklar:
- config flag
- provider interface
- runtime’da disabled
- not implemented warning

Yapılmayacaklar:
- canlı çağrı
- production kullanımı
- test bağımlılığı

---

# 18. Auth ve RBAC

## 18.1 İlk sürüm roller

1. `TENANT_USER`
   - submission oluşturur
   - belge yükler
   - raporları görür

2. `TENANT_MANAGER`
   - tenant içi kullanıcıları görür
   - submission’ları yönetir
   - override yapabilir

3. `PLATFORM_ADMIN`
   - tüm tenant’ları görür
   - rule katalogunu yönetir
   - sistem ayarlarını yönetir

## 18.2 İlk sürüm auth yaklaşımı

İlk ürün için sade auth tercih edilir.
Keycloak gibi ağır çözüm ilk gün zorunlu değildir.

---

# 19. Multi-Tenancy

Bu ürün çok kiracılı olacak.

## 19.1 İlkeler
- her ana tabloda `tenant_id`
- sorgular tenant scope ile çalışır
- kullanıcı yalnız kendi tenant verisini görür
- admin farklı scope’larda çalışabilir

## 19.2 Neon tarafında
İlk sürümde uygulama seviyesinde tenant izolasyonu + migration disiplini yeterli olabilir.
İleri aşamada RLS sertleştirilebilir.

---

# 20. Storage Stratejisi

## 20.1 Orijinal dosya saklama kararı

- Orijinal dosya saklanır
- Hemen silinmez
- İleride arşiv katmanına taşınabilir

## 20.2 Neden?
- OCR hatası olabilir
- karşılaştırma gerekebilir
- denetim / doğrulama ihtiyacı doğabilir

## 20.3 Tutulacak katmanlar
- original file
- extracted raw text
- normalized structured JSON
- risk report snapshot

---

# 21. API Tasarımı

## 21.1 İlk endpoint’ler

### Auth
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

### Submissions
- `GET /api/submissions`
- `POST /api/submissions`
- `GET /api/submissions/:id`
- `DELETE /api/submissions/:id`

### Documents
- `POST /api/submissions/:id/documents`
- `PATCH /api/documents/:id/type`
- `PATCH /api/documents/:id/set-active-version`
- `GET /api/documents/:id`

### Processing
- `POST /api/submissions/:id/process`
- `GET /api/submissions/:id/status`
- `GET /api/submissions/:id/report`

### Overrides
- `POST /api/rule-results/:id/override`

### Admin
- `GET /api/admin/rules`
- `POST /api/admin/rules`
- `PATCH /api/admin/rules/:id`

---

# 22. İlk Geliştirme Sırası

## Faz A — Repo kurulumu
1. Next.js app oluştur
2. Neon bağlantısını kur
3. ORM kur
4. migration sistemini kur
5. env yapısını kur
6. temel auth iskeletini kur

## Faz B — Core domain
1. tenant/user/submission/document tablolarını çıkar
2. belge türleri enum’unu çıkar
3. submission creation akışını yap
4. belge yükleme akışını yap
5. dosya storage bağlantısını kur

## Faz C — Extraction v1
1. text-based PDF extraction yap
2. belge türü tahmini yap
3. invoice extraction schema yaz
4. packing list extraction schema yaz
5. declaration output extraction schema yaz
6. extraction sonuçlarını DB’ye yaz

## Faz D — Rules v1
1. kural motoru iskeletini kur
2. 10 temel kuralı yaz
3. rule result storage yap
4. risk report summary üret

## Faz E — UI v1
1. submission list
2. submission detail
3. belge yükleme ekranı
4. işlem durumu ekranı
5. risk report ekranı
6. belge önizleme ekranı

## Faz F — LLM v1
1. OpenAI provider ekle
2. document classification support ekle
3. extraction fallback desteği ekle
4. risk summary üretimi ekle

## Faz G — Hardening
1. audit logs
2. override flow
3. tenant isolation hardening
4. cost logging
5. retry / error handling

---

# 23. Pending Inputs Entegrasyon Planı

## 23.1 Gümrük müşaviri Excel sonuçları geldiğinde
Yapılacaklar:
- belge türleri listesi güncellenecek
- beyanname türü öncelikleri güncellenecek
- zorunlu belge matrisi güncellenecek
- “human review only” alan listesi güncellenecek

## 23.2 Yeni örnek dosyalar geldiğinde
Yapılacaklar:
- fixture dataset oluşturulacak
- extraction test set büyütülecek
- ilk kurallar güçlendirilecek

## 23.3 Hatalı/düzeltilmiş dosyalar geldiğinde
Yapılacaklar:
- golden test set hazırlanacak
- rule precision/recall testleri eklenecek

---

# 24. Test Stratejisi

## 24.1 Test katmanları

1. Unit tests
2. schema validation tests
3. extraction snapshot tests
4. rule engine tests
5. API integration tests
6. UI smoke tests

## 24.2 Zorunlu fixture’lar
Başlangıçta şu fixture’lar oluşturulsun:
- sample export package
- sample import package
- sample invoice
- sample packing list
- sample loading instruction
- sample declaration output

---

# 25. Coding Standards

- Tüm kod TypeScript strict mode ile yazılacak
- Any kullanımından kaçınılacak
- Domain types merkezi tanımlanacak
- Hardcoded secret olmayacak
- Error boundaries eklenecek
- Her modül için README veya doc comment olacak

---

# 26. Codex İçin Net Görev Talimatı

## 26.1 İlk sprint hedefi
Codex önce şunları yapsın:

1. Monorepo kur
2. Next.js app oluştur
3. Neon bağlantısını kur
4. Prisma/Drizzle schema’yı oluştur
5. tenant/user/submission/document tablolarını yaz
6. basit auth iskeletini kur
7. belge yükleme ekranını oluştur
8. submission detail sayfasını oluştur
9. file upload API’yi yaz
10. processing_jobs tablosunu ekle

## 26.2 İkinci sprint hedefi
1. text PDF extraction
2. belge türü sınıflandırma
3. invoice / packing list / declaration output extraction
4. extraction storage
5. rule engine v1
6. risk report ekranı

## 26.3 Üçüncü sprint hedefi
1. OpenAI provider
2. LLM explanation
3. override flow
4. audit log
5. admin basic rule panel

---

# 27. Bilinçli Olarak Ertelenenler

Aşağıdakiler ilk ürün dışında bırakıldı:

- BİLGE / TPS entegrasyonu
- tam üretim seviyesi worker mimarisi
- Kubernetes
- Keycloak
- advanced RAG mevzuat senkronizasyonu
- klasik ML anomaly detection
- automated declaration drafting
- tam enterprise IAM
- çok dilli UI
- mobil uygulama

---

# 28. Sonuç

Bu outline’ın amacı:
- eksik domain verilerine rağmen geliştirmeyi başlatmak,
- ama gelecek müşavir geri bildirimleri ve örnek dosyaları sisteme kolayca eklenebilir kılmaktır.

İlk ürün için yaklaşım:
- sade,
- modüler,
- genişleyebilir,
- Vercel + Neon uyumlu,
- OpenAI birincil,
- belge paketi merkezli,
- rule-first tasarımlı olmalıdır.
