// Sanitized sample risk report for the public "Örnek risk raporunu gör" demo.
// Entirely synthetic — contains no real customer data.

export type SampleResult = 'FAIL' | 'WARN' | 'REVIEW_NEEDED' | 'PASS'

export interface SampleFinding {
  code: string
  title: string
  result: SampleResult
  category: string
  message: string
  action: string
  citation?: { label: string; excerpt: string }
}

export interface SampleReport {
  reference: string
  tradeFlow: string
  generatedAt: string
  counts: { errors: number; warnings: number; reviewNeeded: number; passes: number }
  findings: SampleFinding[]
}

export const SAMPLE_REPORT: SampleReport = {
  reference: 'ÖRNEK-2026-00471',
  tradeFlow: 'İthalat',
  generatedAt: '16.06.2026',
  counts: { errors: 1, warnings: 2, reviewNeeded: 1, passes: 6 },
  findings: [
    {
      code: 'GTIP-002',
      title: 'GTİP fatura ile beyanname arasında tutarsız',
      result: 'FAIL',
      category: 'GTİP',
      message:
        'Faturada belirtilen eşya tanımı (8471.30 — taşınabilir bilgi işlem makinesi) ile beyannamedeki GTİP (8473.30) örtüşmüyor.',
      action: 'Eşya tanımını ve GTİP’i tek bir tarife pozisyonunda birleştirin; gerekirse BTB başvurusu yapın.',
      citation: {
        label: 'Türk Gümrük Tarife Cetveli — GTİP',
        excerpt:
          'GTİP, eşyanın doğru sınıflandırılması için kullanılan sekiz haneli tarife pozisyonudur.',
      },
    },
    {
      code: 'COO-003',
      title: 'Menşe belgesi tarihi fatura tarihinden önce',
      result: 'WARN',
      category: 'Menşe',
      message: 'Menşe şahadetnamesi tarihi (01.05.2026), fatura tarihinden (12.05.2026) önce görünüyor.',
      action: 'Menşe belgesi ile fatura tarihlerini teyit edin; tercihli tarife talebinde uyum şarttır.',
      citation: {
        label: '4458 Sayılı Gümrük Kanunu — Madde 241',
        excerpt: 'Menşe/dolaşım belgeleri fatura ile uyumlu olmalıdır.',
      },
    },
    {
      code: 'PL-004',
      title: 'Brüt ağırlık çeki listesi ile taşıma belgesinde farklı',
      result: 'WARN',
      category: 'Çeki listesi',
      message: 'Çeki listesinde 1.240 kg, taşıma belgesinde 1.310 kg brüt ağırlık beyan edilmiş.',
      action: 'Ağırlık farkını gönderici ile teyit edip belgeleri uyumlu hale getirin.',
    },
    {
      code: 'VAL-002',
      title: 'Birim kıymet emsallerin altında',
      result: 'REVIEW_NEEDED',
      category: 'Kıymet',
      message: 'Beyan edilen birim kıymet, benzer eşya emsallerine göre düşük olabilir.',
      action: 'Kıymet tevsik belgelerini hazır bulundurun; gerekirse kıymet araştırmasına yanıt verin.',
    },
    {
      code: 'INV-001',
      title: 'Fatura zorunlu alanları tam',
      result: 'PASS',
      category: 'Fatura',
      message: 'Satıcı/alıcı, fatura no, tarih, teslim şekli ve para birimi eksiksiz.',
      action: 'İşlem gerekmiyor.',
    },
  ],
}
