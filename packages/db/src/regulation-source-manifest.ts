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
