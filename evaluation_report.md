# Değerlendirme Raporu: outline_chatgpt.md vs outline_claude.md
## Verdict
> **Rapor Tarihi:** 29 Mart 2026  
> **Amaç:** Gümrük Beyanname Akıllı Kontrol Sistemi için hazırlanan iki farklı outline dokümanının karşılaştırmalı analizi ve proje için hangisinin daha uygun olduğunun belirlenmesi.

---
## Yönetici Özeti

| Kriter | outline_chatgpt.md | outline_claude.md | Kazanan |
|---|---|---|---|
| Kapsam & Bütünlük | Yeterli (MVP odaklı) | Çok kapsamlı (MVP → Üretime kadar) | Claude |
| MVP Pragmatizmi | Çok iyi | Aşırı mühendislik riski | ChatGPT |
| Mimari Uygunluk (Proje büyüklüğüne) | Doğru boyutlandırılmış | Büyük boyutlandırılmış | ChatGPT |
| Domain Derinliği | Orta | Çok iyi | Claude |
| Kural Motoru Tasarımı | İskelet düzeyinde | Üretime yakın | Claude |
| OCR Stratejisi | Temel | Detaylı ve katmanlı | Claude |
| KVKK / Regülasyon | Yok (sadece genel güvenlik) | Detaylı bölüm var | Claude |
| Operasyonel Olgunluk | Düşük | Yüksek (monitoring, CI/CD, K8s) | Claude |
| Geliştirme Hızı (ilk ürün) | Hızlı | Yavaş (altyapı ağır) | ChatGPT |
| Kod Örnekleri & Uygulanabilirlik | Arayüz tanımları | Çalışan kod parçaları | Claude |
| Teknoloji Stack Tutarlılığı | Tutarlı (tek dil: TS) | Karışık (Python + TS) | ChatGPT |
| Ölçeklenebilirlik Vizyonu | Genel, faz bazlı | Detaylı, model eğitimi dahil | Claude |
| Bakım Kolaylığı | Basit, az bileşen | Karmaşık, çok bileşen | ChatGPT |
| Takım Büyüklüğü Uygunluğu | 1–3 kişi | 4–8 kişi | — (bağlam bağımlı) |

**Genel Sonuç:** Her iki outline farklı senaryolarda üstün. Aşağıda ayrıntılı analiz ve nihai tavsiye yer almaktadır.

---
## 1. Kapsam ve Bütünlük

### outline_chatgpt.md (1079 satır, 28 bölüm)
- Ürün ilkeleri, MVP kapsamı, domain modeli, veritabanı, API, UI akışları, geliştirme sırası ve kodlama standartlarını kapsar.
- Her bölüm "yeterli" düzeyde bilgi verir ancak çoğu konuyu **iskelet seviyesinde** bırakır.
- Bazı kritik konular **hiç yer almaz**: KVKK/veri güvenliği, monitoring/alerting, CI/CD, deployment stratejisi, model eğitim yol haritası.

### outline_claude.md (2970 satır, 22 bölüm)
- Yukarıdaki tüm konulara ek olarak: tam SQL DDL, çalışan Python/TypeScript kod blokları, OCR hibrit strateji, RAG pipeline, mevzuat senkronizasyonu, model eğitim yol haritası (5 aşama), KVKK uyumu, Prometheus metrikleri, Kubernetes manifest'leri, CI/CD pipeline YAML'ı içerir.
- Bazı bölümler **gereğinden fazla detaylı** (örn. Faz 4 model eğitimi, henüz MVP bile ortada yokken).
**Değerlendirme:** Claude outline'ı kapsam olarak açık ara önde. Ancak bu derinlik, erken aşamada "analiz felci"ne neden olabilir. ChatGPT'nin eksiklikleri (KVKK, monitoring, CI/CD) ise bir MVP planı için ciddi boşluklardır ve mutlaka eklenmesi gerekir.

## 2. Mimari ve Teknoloji Stack'i
### outline_chatgpt.md
- **Tek dil:** TypeScript (frontend + backend)
- **Stack:** Next.js (Vercel) + Neon Postgres + Prisma/Drizzle
- **İşlem kuyruğu:** DB-backed job tablosu + cron (başlangıçta)
- **LLM:** OpenAI birincil, Anthropic placeholder
- **Avantajlar:**
  - Vercel ekosistemiyle tam uyumlu
  - Tek dil = daha az bağlam değiştirme, daha küçük takım
  - Deployment basitliği (Vercel push-to-deploy)
  - Neon Postgres serverless = sıfır ops yükü
- **Dezavantajlar:**
  - Next.js API route'ları ağır OCR/ML işlemleri için uygun değil (serverless timeout)
  - Vercel'in function timeout'ları (60s Pro, 300s Enterprise) belge işleme pipeline'ını kısıtlayabilir
  - Python AI/ML ekosistemiyle entegrasyon zorlaşır
### outline_claude.md
- **İki dil:** Python (backend) + TypeScript (frontend)
- **Stack:** FastAPI + Celery + Redis + PostgreSQL + Qdrant + Keycloak + Kubernetes + Azure
- **İşlem kuyruğu:** Celery + Redis (ayrılmış queue'lar: ocr, rules, rag, llm)
- **LLM:** OpenAI + Anthropic (aktif fallback)
- **Ek bileşenler:** PaddleOCR, Surya, Azure Document Intelligence, Qdrant, Keycloak
- **Avantajlar:**
  - Python backend = OCR/ML kütüphanelerine doğal erişim (PyMuPDF, PaddleOCR, Surya)
  - Celery = gerçek asenkron job yönetimi, timeout kontrolü, retry, dead-letter queue
  - GPU worker desteği doğal
  - Ölçeklendirme stratejisi net (K8s HPA, queue-based autoscaling)
- **Dezavantajlar:**
  - Altyapı karmaşıklığı çok yüksek (PostgreSQL + Redis + Qdrant + Keycloak + K8s)
  - İki dil = iki ekosistem, iki build pipeline, ortak tip senkronizasyonu sorunu
  - Day-1 Kubernetes gereksiz — erken aşamada Docker Compose yeterli
  - Keycloak = ağır, bakım gerektiren ayrı bir sistem (ilk gün için overkill)

**Değerlendirme:** ChatGPT'nin mimarisi basit ve hızlı başlangıç için uygun, ancak OCR/ML ihtiyaçları büyüdüğünde ciddi refaktör gerektirir. Claude'un mimarisi üretim ortamı için doğru tasarlanmış, ancak MVP aşamasında gereksiz altyapı yükü taşıyor. Python backend tercihinin **OCR/ML açısından stratejik olarak doğru** olduğunu not etmek gerekir — bu projenin temel değer önerisi belge işlemedir.
---
## 3. Domain Anlayışı
### outline_chatgpt.md
- Belge türleri iyi tanımlanmış (8 tür + extraction hedefleri)
- Submission kavramı doğru modelleniyor
- Beyanname çıktısının "kaynak belge değil, kontrol hedefi" olduğu doğru vurgulanmış
- Kural örnekleri var ama **sadece 5 kural** gösterilmiş (INV-001, PL-001, CROSS-001, CROSS-002, CROSS-003)
- "Eksik domain bilgisi ile durmamalı" prensibi çok doğru
### outline_claude.md
- **35+ kural** kategorize edilmiş (DOC, MAN, VAL, WGT, GTIP, ORI, REF)
- GTİP kontrolü, menşe belgesi validasyonu, TPS referans kontrolü gibi **domain-spesifik kurallar** mevcut
- Fatura-beyanname kıymet eşleşmesinde **%2 tolerans** gibi gerçek dünya parametreleri var
- CIF/FOB farkı kontrolü, birim fiyat anomali tespiti gibi **ileri seviye kurallar** tanımlı
- Mevzuat referansları kural tanımlarına bağlanmış (örn: "Gümrük Yönetmeliği Madde 44")
- Problem hiyerarşisi net tanımlanmış (5 seviye: deterministik → ML)
**Değerlendirme:** Claude outline'ı gümrük domain'ini çok daha derinlemesine anlıyor. Kural kataloğu tek başına büyük bir değer. ChatGPT'nin kural tanımları iskelet düzeyinde ve bir müşavir teyidi olmadan bile yetersiz kalıyor.

## 4. OCR ve Belge İşleme Stratejisi
### outline_chatgpt.md
- Karar ağacı mantıklı (text PDF → OCR → fallback)
- Provider-agnostic abstraction doğru tasarlanmış
- Ancak **somut implementasyon yok** — "PlaceholderOcrExtractor" yer tutucu
- Hangi OCR kütüphanelerinin kullanılacağı **belirtilmemiş**
### outline_claude.md
- 5 katmanlı OCR yönlendirme: PyMuPDF → pdfplumber → PaddleOCR → Surya → Azure Doc Intelligence
- Maliyet-kalite dengesi açıkça düşünülmüş (ücretsiz → ücretli sıralama)
- Tablo çıkarımı için ayrı strateji (pdfplumber)
- Türkçe OCR için PaddleOCR önerisi doğru
- Alan çıkarımı: regex patterns + LLM fallback (sadece bulunamayan alanlar için — maliyet optimizasyonu)
- Taranmış belge tespiti implementasyonu var
**Değerlendirme:** OCR bu projenin kalbi. Claude outline'ının OCR stratejisi üretim kalitesinde; ChatGPT'ninki ise sadece bir şablon. Bu fark **kritik** çünkü gümrük belgelerinin önemli bir kısmı taranmış PDF olarak gelecek.
---
## 5. Veritabanı Tasarımı
### outline_chatgpt.md
- 15 tablo listelenmiş, alan tanımları var
- `document_versions` tablosu ile versiyon yönetimi düşünülmüş
- `declaration_items` ayrı tablo olarak var
- Ancak **SQL DDL yok**, sadece alan listesi
- Index stratejisi yok
### outline_claude.md
- Tam SQL DDL (CREATE TABLE + CREATE INDEX)
- Row-Level Security implementasyonu mevcut
- `extracted_fields` tablosu ile alan bazında güven skoru + PDF koordinatları (annotation için)
- `training_samples` ve `model_versions` tabloları (gelecek model eğitimi için)
- `legislation_documents` + `legislation_chunks` (RAG altyapısı)
- Audit log koruma trigger'ları (UPDATE/DELETE yasağı)
- Cold storage path'i (`blob_path_cold`, `cold_archived_at`)
- Performans index'leri tanımlı
- Full-text search index'i (Türkçe)
**Değerlendirme:** Claude outline'ının veritabanı tasarımı doğrudan `CREATE TABLE` ifadeleriyle uygulanabilir düzeyde. ChatGPT'ninki daha çok bir "veri modeli taslağı." Claude'un `extracted_fields` tablosundaki `bbox` koordinatları ve `training_samples` tablosu gibi ince detaylar, domain bilgisinin derinliğini gösteriyor.

## 6. KVKK ve Regülasyon Uyumu
### outline_chatgpt.md
- "Secret / API key asla kod, doküman veya commit içinde yer almaz" prensibi var
- Ancak **KVKK konusunda hiçbir bölüm yok**
- Veri saklama süreleri belirtilmemiş
- Veri anonimleştirme stratejisi yok
- Şifreleme stratejisi yok
### outline_claude.md
- Ayrı KVKK bölümü (Bölüm 18)
- Veri sınıflandırması: kişisel veri / ticari sırlar / zorunlu saklama
- `EncryptedField` TypeDecorator ile hassas alanların DB'de şifreli saklanması
- Veri minimizasyonu prensibi (LLM'e anonimleştirilmiş veri gönderimi)
- Retention policy implementasyonu (tenant başına configurable)
- GDPR/KVKK başvuru endpoint'leri (`/gdpr/data-export`, `/gdpr/delete-my-data`)
- Model eğitimi verisi anonimleştirme stratejisi (deterministik hash)
**Değerlendirme:** Gümrük belgeleri ticari sır ve kişisel veri içerir. KVKK uyumu hukuki bir zorunluluktur. ChatGPT outline'ında bu konunun hiç yer almaması **ciddi bir eksiklik**. Claude outline'ı Azure Turkey North deployment'ı ve KVKK uyumu konusunda somut çözümler sunuyor. Bu kriter tek başına mimari kararları etkileyecek düzeyde kritik.

---
### `outline_claude.md`
## 7. Operasyonel Olgunluk
- Too much day-one infrastructure.
- Too many hard commitments before domain validation.
- MVP is overloaded with enterprise concerns.
- Higher risk of delayed delivery because it couples product discovery with platform build-out.
### outline_chatgpt.md
- "Temel loglama + hata yakalama" dışında monitoring yok
- CI/CD stratejisi yok
- Deployment planı: "Vercel" (tek satır)
- Alerting yok
- Performans metrikleri yok
## Recommended Project Use
### outline_claude.md
- Prometheus metrikleri (submission sayısı, işleme süresi, kural ihlalleri, LLM maliyeti, queue uzunluğu)
- Grafana alert kuralları (hata oranı, maliyet spike, queue backlog, timeout)
- Sentry hata takibi
- Loki log aggregation
- GitHub Actions CI/CD pipeline (backend test, frontend test, Docker build, K8s deploy)
- Zero-downtime deployment (K8s rolling update)
- HPA (Horizontal Pod Autoscaler) ile otomatik ölçekleme
- Health/readiness probe'ları
Use `outline_chatgpt.md` as the primary build document.
**Değerlendirme:** Bir üretim sistemi için monitoring, alerting ve CI/CD vazgeçilmezdir. ChatGPT outline'ı bu konularda tamamen boş. Claude outline'ı burada açık ara önde, ancak bazı bileşenler (K8s, Grafana stack) MVP için overkill.
Borrow selected parts from `outline_claude.md` later, especially:
---
- audit log expectations,
- rule explainability discipline,
- test-layer structure,
- monitoring/alerting ideas,
- KVKK and retention checklists.
## 8. Geliştirme Hızı ve Pragmatizm
Do not import the following from `outline_claude.md` into the first implementation unless there is a concrete business requirement right now:
### outline_chatgpt.md
- 7 faz (A–G), net sprint hedefleri
- İlk sprint: monorepo + DB + basit auth + upload + submission detail (uygulanabilir)
- "Eksik domain bilgisi nedeniyle sistem durmamalı" prensibi mükemmel
- Basit başla, karmaşıklığı sonra ekle felsefesi
- Vercel deployment = anında canlıya alma
- Kubernetes-first thinking,
- Keycloak from day one,
- Qdrant/RAG in MVP,
- full Celery/Redis worker topology before it is needed,
- model training roadmap work,
- self-hosted enterprise platform concerns.
### outline_claude.md
- 5 faz (0–4), hafta bazlı plan
- Faz 0 (2 hafta): Monorepo + Docker Compose + Alembic + **Keycloak** + Azure Blob + CI/CD + müşavir workshop
- MVP (Hafta 3-10): 30 kural + 4 OCR engine + RAG + SSE + PDF annotation + RBAC + RLS
- MVP için gereken bileşen sayısı çok yüksek
- "5 gerçek müşteri ile pilot test" hedefi 10. haftada — gerçekçi mi?
## Final Recommendation
**Değerlendirme:** ChatGPT planı ile 4–6 haftada çalışan bir ürün çıkarılabilir. Claude planında MVP'nin kendisi zaten 10 haftalık ve altyapı ağır. Bir startup veya küçük takım için ChatGPT'nin yaklaşımı daha pragmatik. Ancak ChatGPT'nin planında "sonra ekleriz" denen bazı şeyler (multi-tenancy, monitoring) gerçekte retrofit'i çok zor olan konular.
For this project as it exists today, `outline_chatgpt.md` is better because it is more buildable, more honest about uncertainty, more focused on MVP value, and more directly actionable for implementation.
---
`outline_claude.md` is better interpreted as a phase-2/phase-3 architecture reference, not as the primary project outline.
## 9. Ölçeklenebilirlik Vizyonu
### outline_chatgpt.md
- 4 faz büyüme yolu var ama jenerik
- "Worker servisine taşınabilir" gibi genel ifadeler
- Somut ölçekleme stratejisi yok
### outline_claude.md
- Celery queue bazlı ölçekleme (OCR GPU worker, rule worker, LLM worker ayrı)
- K8s HPA ile CPU ve queue uzunluğuna göre otomatik ölçekleme
- Cold storage archival (maliyet optimizasyonu)
- Model eğitim yol haritası (5 aşama, 18+ ay)
- Tenant başına kural özelleştirme
- A/B test ile model deployment
**Değerlendirme:** Claude outline'ının ölçeklenebilirlik vizyonu çok daha somut ve uygulanabilir. Özellikle model eğitim stratejisi ve veri toplama planı, projenin uzun vadeli rekabet avantajı için kritik.
---
## 10. Zayıf Noktalar
### outline_chatgpt.md — Kritik Zayıflıklar
1. **KVKK uyumu tamamen eksik** — ticari sır ve kişisel veri içeren bir sistemde bu kabul edilemez
2. **OCR stratejisi somut değil** — projenin en kritik bileşeni havada
3. **Monitoring/alerting yok** — üretimde sorun tespiti imkansız
4. **CI/CD yok** — güvenilir deployment süreçsiz
5. **Vercel timeout kısıtlamaları düşünülmemiş** — ağır belge işleme serverless ortamda nasıl çalışacak?
6. **Kural kataloğu çok sığ** — 5 örnek kural, domain derinliği yetersiz
### outline_claude.md — Kritik Zayıflıklar
1. **Aşırı mühendislik (overengineering)** — Day-1'de Kubernetes, Keycloak, Qdrant, Celery, Redis gereksiz karmaşıklık
2. **İki dil ekosistemi** — Python backend + TypeScript frontend tip senkronizasyonu sorunu yaratır
3. **Altyapı maliyeti yüksek** — PostgreSQL + Redis + Qdrant + Keycloak + K8s minimum 4–5 sunucu gerektirir
4. **MVP süresi uzun** — 10 hafta, bu sürede pazar testi yapılamıyor
5. **Tek kişilik takım için uygun değil** — birden fazla alana (DevOps, ML, backend, frontend) hakim takım gerektirir
6. **Next.js 14 referansı** — Doküman güncelliğini yitirmiş olabilir (şu an Next.js 16 mevcut)
7. **Bazı kod blokları hatalı** — `_calculate_risk_score` metodu yanlış parametre imzasına sahip (self eksik ama class method gibi kullanılmış)
---
## 11. Nihai Değerlendirme ve Tavsiye
### Senaryo A: Küçük Takım (1–3 kişi), Hızlı MVP Hedefi
**Tavsiye: outline_chatgpt.md bazında başla, Claude'dan kritik bölümleri entegre et.**
Yapılması gerekenler:
- ChatGPT'nin TypeScript/Vercel mimarisini temel al
- Claude'un kural kataloğunu (35+ kural) aynen al
- Claude'un KVKK bölümünü adapte et
- OCR için: başlangıçta text PDF + OpenAI Vision API fallback (Python worker ayrı servis olarak eklenebilir)
- Monitoring: Vercel Analytics + Sentry (minimal başlangıç)
- CI/CD: Vercel Git integration (otomatik)
### Senaryo B: 4+ Kişilik Takım, Enterprise Hedef
**Tavsiye: outline_claude.md bazında başla, MVP kapsamını daralt.**
Yapılması gerekenler:
- Claude mimarisini temel al ama MVP'de Keycloak yerine basit JWT auth kullan
- Kubernetes yerine Docker Compose ile başla
- Qdrant'ı MVP'den çıkar, RAG'i Faz 2'ye ertele
- Faz 0–1 süresini 6 haftaya sıkıştır (30 kural yerine 15 ile başla)
- Model eğitim tabloları Day-1'de oluşturulsun ama populate Faz 2'de başlasın
### Senaryo C: Hibrit Yaklaşım (Önerilen)
**Tavsiye: İkisinin güçlü yanlarını birleştiren yeni bir mimari oluştur.**
```
Frontend:       Next.js (Vercel) — ChatGPT yaklaşımı
Backend API:    Next.js API routes (basit CRUD) + Python microservice (OCR/ML) — Hibrit
Database:       Neon Postgres — ChatGPT yaklaşımı
File Storage:   Vercel Blob veya S3 — ChatGPT yaklaşımı
OCR/ML:         Python worker (Docker) — Claude yaklaşımı
Kural Motoru:   TypeScript, DB-configurable — ChatGPT tabanı + Claude kural kataloğu
LLM:            OpenAI (aktif) + Anthropic (fallback) — Claude yaklaşımı
Auth:           Uygulama içi auth (başlangıç) — ChatGPT yaklaşımı
Monitoring:     Vercel Analytics + Sentry — Minimal başlangıç
KVKK:           Claude'un KVKK bölümü aynen uygulanır
CI/CD:          Vercel Git integration + GitHub Actions (test) — Minimal
Deployment:     Vercel (web) + Railway/Fly.io (Python worker) — Pragmatik
```
**Bu hibrit yaklaşımın gerekçesi:**
1. TypeScript full-stack ile hızlı başlangıç (ChatGPT'nin avantajı)
2. Python worker ile OCR/ML kütüphanelerine erişim (Claude'un avantajı)
3. Neon Postgres serverless ile sıfır DB ops (ChatGPT'nin avantajı)
4. 35+ kural kataloğu ile domain derinliği (Claude'un avantajı)
5. KVKK uyumu Day-1'den (Claude'un avantajı)
6. Basit auth ile hızlı MVP, Keycloak ileride (ChatGPT'nin avantajı)
7. Training data tabloları Day-1'den (Claude'un avantajı)
---
## 12. Sonuç Tablosu
| Boyut | Puan (ChatGPT) | Puan (Claude) | Ağırlık |
|---|---|---|---|
| MVP Hızı | 9/10 | 5/10 | Yüksek |
| Domain Derinliği | 5/10 | 9/10 | Yüksek |
| Teknik Mimari (MVP) | 7/10 | 6/10 | Yüksek |
| Teknik Mimari (Uzun vade) | 5/10 | 9/10 | Orta |
| OCR/Belge İşleme | 3/10 | 9/10 | Çok Yüksek |
| Kural Motoru | 4/10 | 9/10 | Çok Yüksek |
| KVKK/Güvenlik | 2/10 | 8/10 | Yüksek |
| Operasyonel Hazırlık | 3/10 | 8/10 | Orta |
| Bakım Kolaylığı | 8/10 | 5/10 | Orta |
| Uygulanabilirlik (küçük takım) | 9/10 | 4/10 | Yüksek |
| **Ağırlıklı Toplam** | **~5.5/10** | **~7.2/10** | — |
### Nihai Karar
**outline_claude.md teknik olarak üstün dokümandır**, özellikle şu alanlarda:
- Kural kataloğu ve domain derinliği
- OCR stratejisi
- KVKK uyumu
- Veritabanı tasarımı
- Operasyonel olgunluk
Ancak **doğrudan uygulanması için çok ağırdır**. Önerilen yol: **Claude outline'ını ana referans doküman olarak kabul edip, ChatGPT'nin pragmatik MVP yaklaşımıyla hafifletilmiş bir implementasyon planı oluşturmaktır.**
Özellikle Claude'dan mutlaka alınması gereken bölümler:
1. Kural kataloğu (Bölüm 8.4) — 35+ kural tanımı
2. OCR hibrit strateji (Bölüm 7) — özellikle PyMuPDF → PaddleOCR sıralaması
3. KVKK bölümü (Bölüm 18) — veri sınıflandırması ve teknik önlemler
4. Veritabanı DDL (Bölüm 5) — extracted_fields ve training_samples tabloları
5. LLM prompt stratejisi (Bölüm 10.2) — açıklama üretme template'i
ChatGPT'den alınması gereken yaklaşımlar:
1. Vercel + Neon Postgres ile basit deployment
2. Tek dil (TypeScript) ile hızlı geliştirme
3. Faz bazlı basit sprint planı
4. "Eksik domain bilgisi ile durmamalı" prensibi
5. Basit auth ile başla felsefesi