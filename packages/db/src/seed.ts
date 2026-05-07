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
  const gumrukYonetmeligiSource = await prisma.sourceDocument.findFirst({
    where: { title: 'Gümrük Yönetmeliği' },
  })
  const incotermsSource = await prisma.sourceDocument.findFirst({
    where: { title: 'ICC Incoterms 2020' },
  })
  const tariffSource = await prisma.sourceDocument.findFirst({
    where: { title: 'Türk Gümrük Tarife Cetveli' },
  })
  const fiataSource = await prisma.sourceDocument.findFirst({
    where: { title: 'FIATA Bill of Lading Model Rules' },
  })
  const wcoSource = await prisma.sourceDocument.findFirst({
    where: { title: 'WCO HS Nomenclature 2022' },
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
    // GTİP rules
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
    {
      ruleCode: 'GTIP-002',
      name: 'Goods description must not be blank on declaration items',
      description: 'Declaration item goods_description field must not be blank.',
      appliesToDocTypes: ['DECLARATION_OUTPUT'],
      fieldChecks: ['goods_description'],
      severity: 'ERROR',
      explanationTemplate: 'Goods description is blank on one or more declaration items. Field: goods_description.',
      sourceDocumentId: gumrukKanunuSource?.id ?? null,
      fixturePassRef: 'fixtures/clean-import/declaration_output.json',
      fixtureFailRef: 'fixtures/missing-invoice/extraction.json',
    },
    {
      ruleCode: 'GTIP-003',
      name: 'GTIP codes must be consistent across invoice and declaration',
      description: 'If a GTİP code appears on both invoice and declaration, they must match.',
      appliesToDocTypes: ['INVOICE', 'DECLARATION_OUTPUT'],
      fieldChecks: ['gtip_code'],
      severity: 'WARNING',
      explanationTemplate: 'GTİP code mismatch between invoice and declaration. Field: gtip_code.',
      sourceDocumentId: tariffSource?.id ?? null,
      fixturePassRef: 'fixtures/clean-import/extraction.json',
      fixtureFailRef: 'fixtures/value-mismatch/extraction.json',
    },
    // Cross-document consistency rules
    {
      ruleCode: 'CROSS-001',
      name: 'Invoice total value must match declaration total value',
      description: 'Invoice total_amount and declaration total_value must match within 1%.',
      appliesToDocTypes: ['INVOICE', 'DECLARATION_OUTPUT'],
      fieldChecks: ['total_amount', 'total_value'],
      severity: 'ERROR',
      explanationTemplate: 'Value mismatch between invoice and declaration. Fields: total_amount, total_value.',
      sourceDocumentId: gumrukKanunuSource?.id ?? null,
      fixturePassRef: 'fixtures/clean-import/extraction.json',
      fixtureFailRef: 'fixtures/value-mismatch/extraction.json',
    },
    {
      ruleCode: 'CROSS-002',
      name: 'Packing list gross weight must match declaration gross weight',
      description: 'Packing list gross_weight and declaration total_gross_weight must match within 1%.',
      appliesToDocTypes: ['PACKING_LIST', 'DECLARATION_OUTPUT'],
      fieldChecks: ['gross_weight', 'total_gross_weight'],
      severity: 'ERROR',
      explanationTemplate: 'Gross weight mismatch between packing list and declaration.',
      sourceDocumentId: gumrukKanunuSource?.id ?? null,
      fixturePassRef: 'fixtures/clean-import/extraction.json',
      fixtureFailRef: 'fixtures/weight-mismatch/extraction.json',
    },
    {
      ruleCode: 'CROSS-003',
      name: 'Invoice incoterm must match loading instruction delivery term',
      description: 'Incoterm in invoice and loading instruction must match.',
      appliesToDocTypes: ['INVOICE', 'LOADING_INSTRUCTION'],
      fieldChecks: ['incoterm', 'delivery_term'],
      severity: 'WARNING',
      explanationTemplate: 'Incoterm mismatch between invoice and loading instruction.',
      sourceDocumentId: incotermsSource?.id ?? null,
      fixturePassRef: 'fixtures/clean-import/extraction.json',
      fixtureFailRef: 'fixtures/missing-invoice/extraction.json',
    },
    {
      ruleCode: 'CROSS-004',
      name: 'Invoice quantity must match declaration quantity',
      description: 'Total invoice item quantities should match declaration quantities.',
      appliesToDocTypes: ['INVOICE', 'DECLARATION_OUTPUT'],
      fieldChecks: ['items[].quantity'],
      severity: 'ERROR',
      explanationTemplate: 'Quantity mismatch between invoice and declaration.',
      sourceDocumentId: gumrukKanunuSource?.id ?? null,
      fixturePassRef: 'fixtures/clean-import/extraction.json',
      fixtureFailRef: 'fixtures/value-mismatch/extraction.json',
    },
    {
      ruleCode: 'CROSS-005',
      name: 'Seller in invoice must match shipper in loading instruction',
      description: 'Invoice seller_name and loading instruction shipper should match (fuzzy).',
      appliesToDocTypes: ['INVOICE', 'LOADING_INSTRUCTION'],
      fieldChecks: ['seller_name', 'shipper'],
      severity: 'WARNING',
      explanationTemplate: 'Seller/shipper name mismatch between invoice and loading instruction.',
      sourceDocumentId: gumrukKanunuSource?.id ?? null,
      fixturePassRef: 'fixtures/clean-import/extraction.json',
      fixtureFailRef: 'fixtures/missing-invoice/extraction.json',
    },
    {
      ruleCode: 'CROSS-006',
      name: 'Invoice net weight must match packing list net weight',
      description: 'net_weight on invoice and packing list must match within 1%.',
      appliesToDocTypes: ['INVOICE', 'PACKING_LIST'],
      fieldChecks: ['net_weight'],
      severity: 'ERROR',
      explanationTemplate: 'Net weight mismatch between invoice and packing list.',
      sourceDocumentId: gumrukKanunuSource?.id ?? null,
      fixturePassRef: 'fixtures/clean-import/extraction.json',
      fixtureFailRef: 'fixtures/weight-mismatch/extraction.json',
    },
    {
      ruleCode: 'CROSS-007',
      name: 'Currency must match across invoice and declaration',
      description: 'Invoice currency and declaration currency must be the same.',
      appliesToDocTypes: ['INVOICE', 'DECLARATION_OUTPUT'],
      fieldChecks: ['currency'],
      severity: 'ERROR',
      explanationTemplate: 'Currency mismatch between invoice and declaration. Field: currency.',
      sourceDocumentId: incotermsSource?.id ?? null,
      fixturePassRef: 'fixtures/clean-import/extraction.json',
      fixtureFailRef: 'fixtures/value-mismatch/extraction.json',
    },
    {
      ruleCode: 'CROSS-008',
      name: 'Package count in packing list must match declaration',
      description: 'package_count on packing list must equal packageCount on declaration.',
      appliesToDocTypes: ['PACKING_LIST', 'DECLARATION_OUTPUT'],
      fieldChecks: ['package_count'],
      severity: 'ERROR',
      explanationTemplate: 'Package count mismatch between packing list and declaration.',
      sourceDocumentId: gumrukKanunuSource?.id ?? null,
      fixturePassRef: 'fixtures/clean-import/extraction.json',
      fixtureFailRef: 'fixtures/weight-mismatch/extraction.json',
    },
    // Presence rules (new)
    {
      ruleCode: 'PRES-003',
      name: 'Transport document required for maritime shipments',
      description: 'Import submissions should include a bill of lading or transport document.',
      appliesToDocTypes: ['BILL_OF_LADING'],
      fieldChecks: ['doc_type'],
      severity: 'WARNING',
      explanationTemplate: 'No bill of lading found for this import submission.',
      sourceDocumentId: fiataSource?.id ?? null,
      fixturePassRef: 'fixtures/clean-import/extraction.json',
      fixtureFailRef: 'fixtures/missing-invoice/extraction.json',
    },
    {
      ruleCode: 'PRES-004',
      name: 'Certificate of origin required if preferential tariff indicated',
      description: 'If a preferential tariff regime is claimed, a COO document must be present.',
      appliesToDocTypes: ['CERTIFICATE_OF_ORIGIN'],
      fieldChecks: ['doc_type'],
      severity: 'WARNING',
      explanationTemplate: 'Preferential tariff claimed but no certificate of origin found.',
      sourceDocumentId: gumrukKanunuSource?.id ?? null,
      fixturePassRef: 'fixtures/clean-import/extraction.json',
      fixtureFailRef: 'fixtures/missing-invoice/extraction.json',
    },
    {
      ruleCode: 'PRES-005',
      name: 'At most one declaration output per submission',
      description: 'Only one DECLARATION_OUTPUT document should be present per submission.',
      appliesToDocTypes: ['DECLARATION_OUTPUT'],
      fieldChecks: ['doc_type'],
      severity: 'WARNING',
      explanationTemplate: 'Multiple declaration output documents found in this submission.',
      sourceDocumentId: gumrukYonetmeligiSource?.id ?? null,
      fixturePassRef: 'fixtures/clean-import/extraction.json',
      fixtureFailRef: 'fixtures/missing-invoice/extraction.json',
    },
    // Declaration rules
    {
      ruleCode: 'DECL-001',
      name: 'Regime code must be 4-digit numeric',
      description: 'The customs regime code (rejim kodu) must be exactly 4 numeric digits.',
      appliesToDocTypes: ['DECLARATION_OUTPUT'],
      fieldChecks: ['regime_code'],
      severity: 'ERROR',
      explanationTemplate: 'Regime code "{{regime_code}}" is not a valid 4-digit numeric code.',
      sourceDocumentId: gumrukKanunuSource?.id ?? null,
      fixturePassRef: 'fixtures/clean-import/declaration_output.json',
      fixtureFailRef: 'fixtures/value-mismatch/declaration_output.json',
    },
    {
      ruleCode: 'DECL-002',
      name: 'Country of origin must be present and valid',
      description: 'country_of_origin must be a 2-letter ISO 3166-1 alpha-2 code.',
      appliesToDocTypes: ['INVOICE', 'DECLARATION_OUTPUT'],
      fieldChecks: ['country_of_origin'],
      severity: 'ERROR',
      explanationTemplate: 'Country of origin is missing or invalid. Field: country_of_origin.',
      sourceDocumentId: gumrukKanunuSource?.id ?? null,
      fixturePassRef: 'fixtures/clean-import/invoice.json',
      fixtureFailRef: 'fixtures/missing-invoice/invoice.json',
    },
    {
      ruleCode: 'DECL-003',
      name: 'Importer tax ID must be present',
      description: 'The importer/exporter tax identification number must not be blank.',
      appliesToDocTypes: ['DECLARATION_OUTPUT'],
      fieldChecks: ['importer_tax_id'],
      severity: 'ERROR',
      explanationTemplate: 'Importer tax ID is missing. Field: importer_tax_id.',
      sourceDocumentId: gumrukKanunuSource?.id ?? null,
      fixturePassRef: 'fixtures/clean-import/declaration_output.json',
      fixtureFailRef: 'fixtures/missing-invoice/extraction.json',
    },
    {
      ruleCode: 'DECL-004',
      name: 'Declaration date must not be in the future',
      description: 'declaration_date on the customs form must not be a future date.',
      appliesToDocTypes: ['DECLARATION_OUTPUT'],
      fieldChecks: ['declaration_date'],
      severity: 'ERROR',
      explanationTemplate: 'Declaration date is in the future. Field: declaration_date.',
      sourceDocumentId: gumrukYonetmeligiSource?.id ?? null,
      fixturePassRef: 'fixtures/clean-import/declaration_output.json',
      fixtureFailRef: 'fixtures/missing-invoice/extraction.json',
    },
    {
      ruleCode: 'DECL-005',
      name: 'Customs office code must be present',
      description: 'The gümrük müdürlüğü (customs office) code must be present on the declaration.',
      appliesToDocTypes: ['DECLARATION_OUTPUT'],
      fieldChecks: ['customs_office_code'],
      severity: 'WARNING',
      explanationTemplate: 'Customs office code is missing. Field: customs_office_code.',
      sourceDocumentId: gumrukYonetmeligiSource?.id ?? null,
      fixturePassRef: 'fixtures/clean-import/declaration_output.json',
      fixtureFailRef: 'fixtures/missing-invoice/extraction.json',
    },
    // Bill of lading rules
    {
      ruleCode: 'BL-001',
      name: 'Bill of lading number must be present',
      description: 'The B/L must have a non-empty bl_number field.',
      appliesToDocTypes: ['BILL_OF_LADING'],
      fieldChecks: ['bl_number'],
      severity: 'ERROR',
      explanationTemplate: 'Bill of lading number is missing. Field: bl_number.',
      sourceDocumentId: fiataSource?.id ?? null,
      fixturePassRef: 'fixtures/clean-import/extraction.json',
      fixtureFailRef: 'fixtures/missing-invoice/extraction.json',
    },
    {
      ruleCode: 'BL-002',
      name: 'Port of loading and discharge must be present',
      description: 'B/L must contain both port_of_loading and port_of_discharge.',
      appliesToDocTypes: ['BILL_OF_LADING'],
      fieldChecks: ['port_of_loading', 'port_of_discharge'],
      severity: 'ERROR',
      explanationTemplate: 'B/L is missing port of loading or discharge.',
      sourceDocumentId: fiataSource?.id ?? null,
      fixturePassRef: 'fixtures/clean-import/extraction.json',
      fixtureFailRef: 'fixtures/missing-invoice/extraction.json',
    },
    {
      ruleCode: 'BL-003',
      name: 'B/L consignee must be present and match invoice buyer',
      description: 'B/L consignee must not be blank and should match the invoice buyer.',
      appliesToDocTypes: ['BILL_OF_LADING', 'INVOICE'],
      fieldChecks: ['consignee', 'buyer_name'],
      severity: 'WARNING',
      explanationTemplate: 'B/L consignee does not match invoice buyer.',
      sourceDocumentId: fiataSource?.id ?? null,
      fixturePassRef: 'fixtures/clean-import/extraction.json',
      fixtureFailRef: 'fixtures/missing-invoice/extraction.json',
    },
    // Certificate of origin rules
    {
      ruleCode: 'COO-001',
      name: 'Certificate of origin country must match invoice country of origin',
      description: 'country_of_origin must be identical on both the COO and the invoice.',
      appliesToDocTypes: ['CERTIFICATE_OF_ORIGIN', 'INVOICE'],
      fieldChecks: ['country_of_origin'],
      severity: 'ERROR',
      explanationTemplate: 'Country of origin mismatch between COO and invoice.',
      sourceDocumentId: gumrukKanunuSource?.id ?? null,
      fixturePassRef: 'fixtures/clean-import/extraction.json',
      fixtureFailRef: 'fixtures/value-mismatch/extraction.json',
    },
    {
      ruleCode: 'COO-002',
      name: 'Certificate of origin date must not be after invoice date',
      description: 'COO issue_date must be on or before the invoice_date.',
      appliesToDocTypes: ['CERTIFICATE_OF_ORIGIN', 'INVOICE'],
      fieldChecks: ['issue_date', 'invoice_date'],
      severity: 'WARNING',
      explanationTemplate: 'Certificate of origin issue date is after the invoice date.',
      sourceDocumentId: gumrukKanunuSource?.id ?? null,
      fixturePassRef: 'fixtures/clean-import/extraction.json',
      fixtureFailRef: 'fixtures/missing-invoice/extraction.json',
    },
    {
      ruleCode: 'COO-003',
      name: 'Certificate of origin issuing authority must be present',
      description: 'The COO must contain a non-blank issuing_authority field.',
      appliesToDocTypes: ['CERTIFICATE_OF_ORIGIN'],
      fieldChecks: ['issuing_authority'],
      severity: 'ERROR',
      explanationTemplate: 'Certificate of origin issuing authority is missing.',
      sourceDocumentId: gumrukKanunuSource?.id ?? null,
      fixturePassRef: 'fixtures/clean-import/extraction.json',
      fixtureFailRef: 'fixtures/missing-invoice/extraction.json',
    },
    // Value / arithmetic rules
    {
      ruleCode: 'VAL-001',
      name: 'Invoice unit prices must be positive',
      description: 'Each line item unit_price must be a positive number.',
      appliesToDocTypes: ['INVOICE'],
      fieldChecks: ['items[].unit_price'],
      severity: 'ERROR',
      explanationTemplate: 'One or more invoice items have a zero or missing unit price.',
      sourceDocumentId: gumrukKanunuSource?.id ?? null,
      fixturePassRef: 'fixtures/clean-import/invoice.json',
      fixtureFailRef: 'fixtures/value-mismatch/invoice.json',
    },
    {
      ruleCode: 'VAL-002',
      name: 'Invoice line total must match quantity × unit price',
      description: 'items[].line_total ≈ items[].quantity × items[].unit_price (within 0.5%).',
      appliesToDocTypes: ['INVOICE'],
      fieldChecks: ['items[].line_total', 'items[].quantity', 'items[].unit_price'],
      severity: 'ERROR',
      explanationTemplate: 'Invoice line total does not equal quantity × unit price.',
      sourceDocumentId: gumrukKanunuSource?.id ?? null,
      fixturePassRef: 'fixtures/clean-import/invoice.json',
      fixtureFailRef: 'fixtures/value-mismatch/invoice.json',
    },
    {
      ruleCode: 'VAL-003',
      name: 'Invoice total must equal sum of line item totals',
      description: 'total_amount ≈ sum of items[].line_total (within 0.5%).',
      appliesToDocTypes: ['INVOICE'],
      fieldChecks: ['total_amount', 'items[].line_total'],
      severity: 'ERROR',
      explanationTemplate: 'Invoice total does not match the sum of individual line totals.',
      sourceDocumentId: gumrukKanunuSource?.id ?? null,
      fixturePassRef: 'fixtures/clean-import/invoice.json',
      fixtureFailRef: 'fixtures/value-mismatch/invoice.json',
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
