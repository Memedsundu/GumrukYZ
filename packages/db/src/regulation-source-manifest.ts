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
  },
  {
    title: 'Türkiye Ürün Kuralları Veri Tabanı - Sektörel Mevzuat',
    url: 'https://urunkurallari.ticaret.gov.tr/tr/sektorel-rehber',
    sourceType: SourceType.REGULATION,
    jurisdiction: Jurisdiction.TR,
    language: 'TR',
    category: 'permit',
    allowSnapshotStorage: true,
  },
  {
    title: 'GTİP Arama Motoru',
    url: 'https://dys.ticaret.gov.tr/destek-mekanizmalari-ve-bilgi-kaynaklari/gtip-arama-motoru',
    sourceType: SourceType.REGULATION,
    jurisdiction: Jurisdiction.TR,
    language: 'TR',
    category: 'permit',
    allowSnapshotStorage: true,
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
    url: 'https://fiata.org/transport-documents/',
    sourceType: SourceType.INTERNATIONAL_STANDARD,
    jurisdiction: Jurisdiction.ICC,
    language: 'EN',
    effectiveDate: '2017-01-01',
    category: 'standard',
    allowSnapshotStorage: false,
  },
]
