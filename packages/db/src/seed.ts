import { PrismaClient } from '@prisma/client'
import { DataClassification, TenantPlan, UserRole, SourceType, Jurisdiction } from '@gumrukyz/domain'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  // Upsert internal tenant
  const internalTenant = await prisma.tenant.upsert({
    where: { clerkOrgId: process.env['INTERNAL_TENANT_CLERK_ORG_ID'] ?? 'internal_dev' },
    update: {},
    create: {
      clerkOrgId: process.env['INTERNAL_TENANT_CLERK_ORG_ID'] ?? 'internal_dev',
      name: 'GümrükYZ Internal',
      plan: TenantPlan.INTERNAL,
      dataClassificationAllowed: [
        DataClassification.SYNTHETIC,
        DataClassification.REDACTED,
      ],
    },
  })
  console.log('Tenant:', internalTenant.name)

  // Seed source documents
  const sources = [
    {
      title: '4458 Sayılı Gümrük Kanunu',
      url: 'https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=4458&MevzuatTur=1&MevzuatTertip=5',
      sourceType: SourceType.LAW,
      jurisdiction: Jurisdiction.TR,
      language: 'TR',
      effectiveDate: new Date('1999-11-04'),
      rawExcerpt: 'Türkiye Cumhuriyeti gümrük mevzuatının temel kanunu.',
    },
    {
      title: 'Gümrük Yönetmeliği',
      url: 'https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=25407&MevzuatTur=9&MevzuatTertip=5',
      sourceType: SourceType.REGULATION,
      jurisdiction: Jurisdiction.TR,
      language: 'TR',
      effectiveDate: new Date('2006-10-07'),
      rawExcerpt: '4458 sayılı Gümrük Kanununun uygulanmasına ilişkin yönetmelik.',
    },
    {
      title: 'Türk Gümrük Tarife Cetveli',
      url: 'https://www.ticaret.gov.tr/dis-ticaret/urun-klasifikasyon-ve-gtip',
      sourceType: SourceType.REGULATION,
      jurisdiction: Jurisdiction.TR,
      language: 'TR',
      effectiveDate: new Date('2024-01-01'),
      rawExcerpt: 'GTİP kodları ve tarife sınıflandırması için referans belge.',
    },
    {
      title: 'ICC Incoterms 2020',
      url: 'https://iccwbo.org/business-solutions/incoterms-rules/incoterms-2020/',
      sourceType: SourceType.INTERNATIONAL_STANDARD,
      jurisdiction: Jurisdiction.ICC,
      language: 'EN',
      effectiveDate: new Date('2020-01-01'),
      rawExcerpt:
        'International Commercial Terms 2020 edition. Defines trade term obligations for buyers and sellers.',
    },
    {
      title: 'WCO HS Nomenclature 2022',
      url: 'https://www.wcoomd.org/en/topics/nomenclature/instrument-and-tools/hs-nomenclature-2022-edition.aspx',
      sourceType: SourceType.INTERNATIONAL_STANDARD,
      jurisdiction: Jurisdiction.WCO,
      language: 'EN',
      effectiveDate: new Date('2022-01-01'),
      rawExcerpt:
        'Harmonized System Nomenclature 2022 — international standard for classifying goods in trade.',
    },
    {
      title: 'FIATA Bill of Lading Model Rules',
      url: 'https://fiata.org/transport-documents/',
      sourceType: SourceType.INTERNATIONAL_STANDARD,
      jurisdiction: Jurisdiction.ICC,
      language: 'EN',
      effectiveDate: new Date('2017-01-01'),
      rawExcerpt: 'FIATA model rules for transport document issuance and required fields.',
    },
  ]

  for (const source of sources) {
    const existing = await prisma.sourceDocument.findFirst({ where: { url: source.url } })
    if (!existing) {
      await prisma.sourceDocument.create({ data: source })
      console.log('Source document:', source.title)
    }
  }

  // Seed initial ACTIVE rules
  const gumrukKanunuSource = await prisma.sourceDocument.findFirst({
    where: { title: '4458 Sayılı Gümrük Kanunu' },
  })
  const incotermsSource = await prisma.sourceDocument.findFirst({
    where: { title: 'ICC Incoterms 2020' },
  })
  const tariffSource = await prisma.sourceDocument.findFirst({
    where: { title: 'Türk Gümrük Tarife Cetveli' },
  })

  const initialRules = [
    // Document presence rules
    {
      ruleCode: 'PRES-001',
      name: 'Invoice required for all submissions',
      description: 'Every import or export submission must include at least one INVOICE document.',
      appliesToDocTypes: ['INVOICE'],
      fieldChecks: ['doc_type'],
      severity: 'ERROR',
      explanationTemplate:
        'No invoice found in this submission. An invoice is mandatory for all import and export transactions.',
      sourceDocumentId: gumrukKanunuSource?.id ?? null,
      fixturePassRef: 'fixtures/clean-import/extraction.json',
      fixtureFailRef: 'fixtures/missing-invoice/extraction.json',
    },
    {
      ruleCode: 'PRES-002',
      name: 'Packing list required for import',
      description: 'Import submissions must include at least one PACKING_LIST document.',
      appliesToDocTypes: ['PACKING_LIST'],
      fieldChecks: ['doc_type'],
      severity: 'WARNING',
      explanationTemplate:
        'No packing list found. A packing list is required for import transactions.',
      sourceDocumentId: gumrukKanunuSource?.id ?? null,
      fixturePassRef: 'fixtures/clean-import/extraction.json',
      fixtureFailRef: 'fixtures/missing-invoice/extraction.json',
    },
    // Invoice mandatory field rules
    {
      ruleCode: 'INV-001',
      name: 'Invoice number must be present',
      description: 'The invoice must have a non-empty invoice number.',
      appliesToDocTypes: ['INVOICE'],
      fieldChecks: ['invoice_number'],
      severity: 'ERROR',
      explanationTemplate: 'Invoice number is missing. Field: invoice_number.',
      sourceDocumentId: gumrukKanunuSource?.id ?? null,
      fixturePassRef: 'fixtures/clean-import/invoice.json',
      fixtureFailRef: 'fixtures/missing-invoice/invoice.json',
    },
    {
      ruleCode: 'INV-002',
      name: 'Invoice date must be valid',
      description: 'The invoice date must be parseable and not in the future.',
      appliesToDocTypes: ['INVOICE'],
      fieldChecks: ['invoice_date'],
      severity: 'ERROR',
      explanationTemplate: 'Invoice date is missing or invalid. Field: invoice_date.',
      sourceDocumentId: gumrukKanunuSource?.id ?? null,
      fixturePassRef: 'fixtures/clean-import/invoice.json',
      fixtureFailRef: 'fixtures/missing-invoice/invoice.json',
    },
    {
      ruleCode: 'INV-003',
      name: 'Seller and buyer must be identified',
      description: 'The invoice must contain both seller and buyer names.',
      appliesToDocTypes: ['INVOICE'],
      fieldChecks: ['seller_name', 'buyer_name'],
      severity: 'ERROR',
      explanationTemplate:
        'Seller or buyer name is missing. Fields: seller_name, buyer_name. Both are required.',
      sourceDocumentId: gumrukKanunuSource?.id ?? null,
      fixturePassRef: 'fixtures/clean-import/invoice.json',
      fixtureFailRef: 'fixtures/missing-invoice/invoice.json',
    },
    {
      ruleCode: 'INV-004',
      name: 'Currency must be valid ISO 4217',
      description: 'Invoice currency must be a valid ISO 4217 currency code.',
      appliesToDocTypes: ['INVOICE'],
      fieldChecks: ['currency'],
      severity: 'ERROR',
      explanationTemplate:
        'Currency code "{{currency}}" is not a valid ISO 4217 code. Field: currency.',
      sourceDocumentId: incotermsSource?.id ?? null,
      fixturePassRef: 'fixtures/clean-import/invoice.json',
      fixtureFailRef: 'fixtures/missing-invoice/invoice.json',
    },
    {
      ruleCode: 'INV-005',
      name: 'Total amount must be positive',
      description: 'The invoice total amount must be a positive number.',
      appliesToDocTypes: ['INVOICE'],
      fieldChecks: ['total_amount'],
      severity: 'ERROR',
      explanationTemplate: 'Invoice total amount is missing or not a positive number. Field: total_amount.',
      sourceDocumentId: gumrukKanunuSource?.id ?? null,
      fixturePassRef: 'fixtures/clean-import/invoice.json',
      fixtureFailRef: 'fixtures/value-mismatch/invoice.json',
    },
    {
      ruleCode: 'INV-006',
      name: 'Incoterm must be a valid Incoterms 2020 term',
      description: 'If incoterm is present, it must be one of the 11 valid Incoterms 2020 terms.',
      appliesToDocTypes: ['INVOICE'],
      fieldChecks: ['incoterm'],
      severity: 'WARNING',
      explanationTemplate:
        'Incoterm "{{incoterm}}" is not a valid Incoterms 2020 term. Field: incoterm.',
      sourceDocumentId: incotermsSource?.id ?? null,
      fixturePassRef: 'fixtures/clean-import/invoice.json',
      fixtureFailRef: 'fixtures/missing-invoice/invoice.json',
    },
    // Packing list rules
    {
      ruleCode: 'PL-001',
      name: 'Package count must be a positive integer',
      description: 'Packing list must contain a positive integer package count.',
      appliesToDocTypes: ['PACKING_LIST'],
      fieldChecks: ['package_count'],
      severity: 'ERROR',
      explanationTemplate: 'Package count is missing or invalid. Field: package_count.',
      sourceDocumentId: gumrukKanunuSource?.id ?? null,
      fixturePassRef: 'fixtures/clean-import/packing_list.json',
      fixtureFailRef: 'fixtures/weight-mismatch/packing_list.json',
    },
    {
      ruleCode: 'PL-002',
      name: 'Gross weight must be present',
      description: 'Packing list gross weight must be a positive number.',
      appliesToDocTypes: ['PACKING_LIST'],
      fieldChecks: ['gross_weight'],
      severity: 'WARNING',
      explanationTemplate: 'Gross weight is missing or not a positive number. Field: gross_weight.',
      sourceDocumentId: gumrukKanunuSource?.id ?? null,
      fixturePassRef: 'fixtures/clean-import/packing_list.json',
      fixtureFailRef: 'fixtures/weight-mismatch/packing_list.json',
    },
    // GTİP rule
    {
      ruleCode: 'GTIP-001',
      name: 'GTİP code must be 8-digit numeric',
      description: 'When a GTİP/HS code is present, it must be exactly 8 numeric digits.',
      appliesToDocTypes: ['DECLARATION_OUTPUT'],
      fieldChecks: ['gtip_code'],
      severity: 'ERROR',
      explanationTemplate:
        'GTİP code "{{gtip_code}}" is not a valid 8-digit HS code. Field: gtip_code.',
      sourceDocumentId: tariffSource?.id ?? null,
      fixturePassRef: 'fixtures/clean-import/declaration_output.json',
      fixtureFailRef: 'fixtures/value-mismatch/declaration_output.json',
    },
  ]

  for (const rule of initialRules) {
    const { sourceDocumentId, ...ruleData } = rule
    await prisma.rule.upsert({
      where: { ruleCode: rule.ruleCode },
      update: {},
      create: {
        ...ruleData,
        lifecycleStatus: 'ACTIVE',
        sourceDocumentId: sourceDocumentId ?? undefined,
        effectiveFrom: new Date('2024-01-01'),
      },
    })
    console.log('Rule:', rule.ruleCode)
  }

  console.log('Seed complete.')
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
