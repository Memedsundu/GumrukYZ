# Pilot firma onboarding — GümrükYZ

## Paylaşılacak link

**Üretim:** https://gumrukyz.vercel.app (giriş sayfasına yönlendirir)

Alternatif doğrudan giriş: https://gumrukyz.vercel.app/sign-in

Firmalar doğrudan kayıt olmamalı; her firma için Clerk **Organization** davetiyesi gönderin.

## Clerk kurulumu (tek seferlik)

1. [Clerk Dashboard](https://dashboard.clerk.com) → **Organizations** → etkinleştirin.
2. **Settings → Restrictions**: mümkünse yalnızca davet ile üyelik (open signup kapatın).
3. Her pilot firma için bir organizasyon oluşturun (ör. `ABC Gümrük`, `XYZ Lojistik`).
4. İlk kullanıcıyı **Organization admin** olarak davet edin (otomatik `TENANT_MANAGER` rolü atanır).

## Firma kullanıcı akışı

1. Davet e-postasındaki link → kayıt / giriş
2. `/onboarding` — organizasyonu seçin
3. `/pilot-consent` — pilot koşullarını onaylayın
4. Kontrol paneli → **Yeni dosya** → veri türünü seçin (varsayılan: anonimleştirilmiş)
5. PDF belgeleri yükleyin → sınıflandırmayı doğrulayın → **Analizi başlat**
6. Risk raporunu inceleyin

## Desteklenen belge türleri

| Tür | Açıklama |
|-----|----------|
| INVOICE | Ticari fatura |
| PACKING_LIST | Çeki listesi |
| TRANSPORT_DOC | Konşimento / taşıma belgesi |
| LOADING_INSTRUCTION | Yükleme talimatı |
| DECLARATION_OUTPUT | Beyanname çıktısı (kontrol hedefi) |
| ORIGIN_DOC | Menşe belgesi |
| PERMIT_DOC | İzin belgesi |

## Örnek belge paketi

Sentetik test verileri: `fixtures/` klasöründeki JSON çıkarımları referanstır. Pilot için mümkünse **kendi anonimleştirilmiş PDF** setinizi kullanın; gerçek müşteri belgesi yalnızca hukuki dayanağınız varsa ve uygulama içinde **Gerçek müşteri belgesi** seçeneği ile işaretleyin.

## Geri bildirim soruları (öneri)

1. Risk bulguları ne kadar anlaşılır ve işe yarar?
2. Belge sınıflandırma adımı net mi?
3. Hangi belge türleri veya kurallar eksik?
4. Raporu müşteriye / ekibe sunmak için yeterli mi?
5. Ücretli kullanım için ne ödersiniz?

## Teknik destek

İşlem hatalarında: Vercel logları ve uygulama içi **Sağlayıcı Takibi** (yönetici rolü).
