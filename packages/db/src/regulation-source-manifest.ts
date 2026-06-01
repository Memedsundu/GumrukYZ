import { Jurisdiction, SourceType } from '@gumrukyz/domain'

export type RegulationSourceManifestEntry = {
  title: string
  url: string
  sourceType: string
  jurisdiction: string
  language: string
  effectiveDate?: string
  category: 'core' | 'permit' | 'standard'
  allowSnapshotStorage: boolean
  fallbackChunks?: string[]
}

export const REGULATION_SOURCE_MANIFEST: RegulationSourceManifestEntry[] = [
  {
    title: '4458 Sayılı Gümrük Kanunu',
    url: 'https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=4458&MevzuatTur=1&MevzuatTertip=5',
    sourceType: SourceType.LAW,
    jurisdiction: Jurisdiction.TR,
    language: 'TR',
    effectiveDate: '1999-11-04',
    category: 'core',
    allowSnapshotStorage: true,
  },
  {
    title: 'Gümrük Yönetmeliği',
    url: 'https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=25407&MevzuatTur=9&MevzuatTertip=5',
    sourceType: SourceType.REGULATION,
    jurisdiction: Jurisdiction.TR,
    language: 'TR',
    effectiveDate: '2006-10-07',
    category: 'core',
    allowSnapshotStorage: true,
  },
  {
    title: 'Türk Gümrük Tarife Cetveli',
    url: 'https://www.ticaret.gov.tr/dis-ticaret/urun-klasifikasyon-ve-gtip',
    sourceType: SourceType.REGULATION,
    jurisdiction: Jurisdiction.TR,
    language: 'TR',
    effectiveDate: '2024-01-01',
    category: 'core',
    allowSnapshotStorage: true,
    fallbackChunks: [
      'Türk Gümrük Tarife Cetveli: GTİP kodu, eşyanın Türk Gümrük Tarife Cetvelindeki tarife pozisyonunu gösterir. Sınıflandırma ürün tanımı, materyal, kullanım amacı, teknik özellikler ve ilgili bölüm/fasıl notları dikkate alınarak değerlendirilmelidir.',
      'Türk Gümrük Tarife Cetveli: GTİP kodunun doğru seçimi gümrük vergisi, dış ticaret politikası önlemleri, izinler, ürün güvenliği kontrolleri ve istatistik beyanı açısından önemlidir. Belge verileri kodla uyumsuzsa manuel uzman incelemesi gerekir.',
      'Türk Gümrük Tarife Cetveli: GTİP doğrulaması yalnızca sekiz haneli format kontrolü değildir; eşya açıklaması, ticari tanım, miktar birimi ve ürünün esas niteliği de kontrol edilmelidir.',
      'Türk Gümrük Tarife Cetveli / HS 87.08: 8708 pozisyonu, 8701-8705 pozisyonlarındaki motorlu taşıtlara ait aksam, parça ve aksesuarları kapsar. 8708.29 alt pozisyonu, tampon ve emniyet kemeri gibi daha özel alt pozisyonlara girmeyen karoseri/gövde aksam ve aksesuarları için değerlendirilir.',
      'Türk Gümrük Tarife Cetveli / HS 8708.29: Otobüs veya benzeri motorlu taşıtlarda yalnız veya esasen kullanılan gövde, iç kapak, kanal, kaplama veya karoseriyle ilişkili parçalar için 8708.29 ailesi aday olabilir; parça mekanik, elektrikli veya iklimlendirme cihazının esas parçasıysa alternatif fasıllar ayrıca incelenmelidir.',
    ],
  },
  {
    title: 'Türkiye Ürün Kuralları Veri Tabanı - Sektörel Mevzuat',
    url: 'https://urunkurallari.ticaret.gov.tr/tr/sektorel-rehber',
    sourceType: SourceType.REGULATION,
    jurisdiction: Jurisdiction.TR,
    language: 'TR',
    category: 'permit',
    allowSnapshotStorage: true,
    fallbackChunks: [
      'Türkiye Ürün Kuralları Veri Tabanı - Sektörel Mevzuat: İthalat ve ihracat işlemlerinde ürün güvenliği, teknik düzenleme, uygunluk değerlendirmesi ve izin yükümlülükleri ürünün GTİP kodu, ürün tanımı, kullanım amacı ve ilgili sektörel mevzuatına göre kontrol edilmelidir.',
      'Türkiye Ürün Kuralları Veri Tabanı - Sektörel Mevzuat: GTİP veya ürün tanımı yeterli değilse, izin veya uygunluk yükümlülüğü konusunda otomatik kesin sonuç verilmemeli; ilgili bakanlık düzenlemeleri ve ürün özelindeki teknik mevzuat manuel uzman incelemesine yönlendirilmelidir.',
      'Türkiye Ürün Kuralları Veri Tabanı - Sektörel Mevzuat: Ürün güvenliği denetimi, uygunluk belgesi, ithalat kontrol belgesi veya sektörel izin ihtimali bulunan eşyalarda belge seti ve beyan bilgileri ürün mevzuatıyla birlikte değerlendirilmelidir.',
    ],
  },
  {
    title: 'GTİP Arama Motoru',
    url: 'https://dys.ticaret.gov.tr/destek-mekanizmalari-ve-bilgi-kaynaklari/gtip-arama-motoru',
    sourceType: SourceType.REGULATION,
    jurisdiction: Jurisdiction.TR,
    language: 'TR',
    category: 'permit',
    allowSnapshotStorage: true,
    fallbackChunks: [
      'GTİP Arama Motoru: Eşyanın GTİP kodu, ürün tanımı, materyali, kullanım amacı ve teknik özellikleri dikkate alınarak belirlenir. GTİP kodu vergi, izin, gözetim, ürün güvenliği ve dış ticaret politikası önlemlerini etkileyebilir.',
      'GTİP Arama Motoru: Belge üzerindeki GTİP kodu ile eşya tanımı arasında tereddüt varsa, sınıflandırma otomatik olarak doğru kabul edilmemeli; Türk Gümrük Tarife Cetveli ve ilgili açıklama notları kapsamında manuel uzman incelemesi gerekir.',
      'GTİP Arama Motoru: Aynı eşya için fatura, beyanname, çeki listesi ve taşıma belgelerinde yer alan ürün açıklamaları GTİP değerlendirmesinde birlikte dikkate alınmalıdır.',
      'GTİP Arama Motoru: Aday GTİP yorumu yapılırken beyan edilen kod, eşya tanımı, üretici parça kodu, araçta kullanım yeri, materyal, teknik çizim ve fonksiyon birlikte değerlendirilmelidir. Yetersiz teknik veri varsa aday kod güven düzeyi düşük tutulmalı ve eksik kanıt açıkça istenmelidir.',
    ],
  },
  {
    title: 'ICC Incoterms 2020',
    url: 'https://iccwbo.org/business-solutions/incoterms-rules/incoterms-2020/',
    sourceType: SourceType.INTERNATIONAL_STANDARD,
    jurisdiction: Jurisdiction.ICC,
    language: 'EN',
    effectiveDate: '2020-01-01',
    category: 'standard',
    allowSnapshotStorage: false,
  },
  {
    title: 'WCO HS Nomenclature 2022',
    url: 'https://www.wcoomd.org/en/topics/nomenclature/instrument-and-tools/hs-nomenclature-2022-edition.aspx',
    sourceType: SourceType.INTERNATIONAL_STANDARD,
    jurisdiction: Jurisdiction.WCO,
    language: 'EN',
    effectiveDate: '2022-01-01',
    category: 'standard',
    allowSnapshotStorage: false,
    fallbackChunks: [
      'WCO HS Nomenclature 2022 Chapter 87: Heading 87.08 covers parts and accessories of motor vehicles of headings 87.01 to 87.05. Within that heading, subheading 8708.29 is the other category for parts and accessories of bodies including cabs.',
      'WCO HS Nomenclature 2022 Chapter 87: GTİP/HS review should first confirm whether the item is suitable for use solely or principally with vehicles of headings 87.01 to 87.05, and then whether a more specific subheading applies before using an other category.',
    ],
  },
  {
    title: 'FIATA Bill of Lading Model Rules',
    url: 'https://fiata.org/resources/',
    sourceType: SourceType.INTERNATIONAL_STANDARD,
    jurisdiction: Jurisdiction.ICC,
    language: 'EN',
    effectiveDate: '2017-01-01',
    category: 'standard',
    allowSnapshotStorage: false,
    fallbackChunks: [
      'FIATA Documents and Resources: FIATA documents include the Negotiable FIATA Multimodal Transport Bill of Lading (FBL), the Non-negotiable FIATA Multimodal Transport Waybill (FWB), warehouse receipt and forwarding certificates. Transport documents should identify the parties, cargo, routing and document issuer clearly.',
      'FIATA eFBL: The FIATA Multimodal Transport Bill of Lading is a recognised multimodal negotiable transport document. Digital FBL documents include trust and verification mechanisms and can be checked for document integrity and issuer identity.',
      'FIATA document verification: FIATA provides document tracking and verification mechanisms to reduce fraud risks and certify the validity, integrity and issuer identity of FIATA Bill of Lading documents.',
    ],
  },
]
