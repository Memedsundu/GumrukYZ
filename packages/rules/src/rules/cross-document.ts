import { DocumentType, RuleSeverity } from '@gumrukyz/domain'
import type { RuleDefinition, SubmissionContext, RuleEvaluationResult } from '../types.js'

const TOLERANCE = 0.01 // 1%

function withinTolerance(a: number, b: number): boolean {
  if (a === 0 && b === 0) return true
  const base = Math.max(Math.abs(a), Math.abs(b))
  return Math.abs(a - b) / base <= TOLERANCE
}

function normalizedWords(value: unknown): Set<string> {
  return new Set(
    String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[İIı]/g, 'i')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length >= 5),
  )
}

function hasMeaningfulOverlap(a: unknown, b: unknown): boolean {
  const left = normalizedWords(a)
  const right = normalizedWords(b)
  let overlaps = 0
  for (const word of left) {
    if (right.has(word)) overlaps += 1
  }
  return overlaps >= 2
}

function normalizeTokenText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[İIı]/g, 'i')
    .toLowerCase()
}

function containsTurkey(value: unknown): boolean {
  return /\b(turkiye|turkey|tr|istanbul|ankara|izmir|bursa|kocaeli|gebze)\b/.test(normalizeTokenText(value))
}

function containsForeignCountry(value: unknown): boolean {
  return /\b(polonya|poland|germany|almanya|france|fransa|italy|italya|romania|romanya|bulgaria|bulgaristan|netherlands|hollanda|spain|ispanya)\b/.test(normalizeTokenText(value))
}

function normalizeUnit(value: unknown): string {
  return normalizeTokenText(value).replace(/[^a-z0-9]+/g, '')
}

function isPackageUnit(value: unknown): boolean {
  return /^(package|packages|pkg|koli|koliler|carton|ctn|pallet|palet|kap|case|box)$/.test(normalizeUnit(value))
}

function isPieceUnit(value: unknown): boolean {
  return /^(pcs|pc|piece|pieces|adet|unit|units|ea)$/.test(normalizeUnit(value))
}

function hasAmbiguousQuantityUnits(
  invoiceItems: Array<{ unit?: unknown }>,
  packingList: Record<string, unknown>,
): boolean {
  const invoiceUnits = invoiceItems.map((item) => item.unit).filter(Boolean)
  const packingUnit = packingList['package_type']
  if (invoiceUnits.length === 0 && !packingUnit) return true
  const invoiceLooksPieceBased = invoiceUnits.some(isPieceUnit)
  const packingLooksPackageBased = isPackageUnit(packingUnit)
  return invoiceLooksPieceBased && packingLooksPackageBased
}

export const CROSS_001: RuleDefinition = {
  code: 'CROSS-001',
  name: 'Fatura toplam tutarı beyanname toplam tutarıyla eşleşmeli',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.INVOICE, DocumentType.DECLARATION_OUTPUT],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const invoice = ctx.documents.find((d) => d.docType === DocumentType.INVOICE)
    const snap = ctx.declarationSnapshot

    if (!invoice || !snap) return null
    if (!invoice.data['total_amount'] || !snap.totalValue) return null

    const invAmt = Number(invoice.data['total_amount'])
    const declAmt = Number(snap.totalValue)

    const pass = withinTolerance(invAmt, declAmt)
    const isFreeOfChargeExport = ctx.tradeFlow === 'EXPORT' && invoice.data['free_of_charge'] === true

    return {
      ruleCode: this.code,
      severity: pass || !isFreeOfChargeExport ? this.severity : RuleSeverity.WARNING,
      result: pass ? 'PASS' : isFreeOfChargeExport ? 'WARN' : 'FAIL',
      message: pass
        ? `Fatura tutarı (${invAmt}) beyanname tutarıyla (${declAmt}) tolerans dahilinde eşleşiyor.`
        : isFreeOfChargeExport
          ? `Bedelsiz ihracat faturası (${invAmt}) beyanname istatistiki/gümrük kıymetinden (${declAmt}) farklı. Manuel inceleme önerilir.`
        : `Fatura toplam tutarı (${invAmt}) beyanname toplam tutarıyla (${declAmt}) ±%1'den fazla farklı. Alanlar: invoice.total_amount, declaration.total_value.`,
      sourceRefs: pass
        ? []
        : [
            { docType: DocumentType.INVOICE, field: 'total_amount', value: invAmt },
            { docType: DocumentType.DECLARATION_OUTPUT, field: 'total_value', value: declAmt },
          ],
    }
  },
}

export const CROSS_002: RuleDefinition = {
  code: 'CROSS-002',
  name: 'Çeki listesi brüt ağırlığı beyanname brüt ağırlığıyla eşleşmeli',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.PACKING_LIST, DocumentType.DECLARATION_OUTPUT],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const pl = ctx.documents.find((d) => d.docType === DocumentType.PACKING_LIST)
    const snap = ctx.declarationSnapshot

    if (!pl || !snap) return null
    if (!pl.data['gross_weight'] || !snap.totalGrossWeight) return null

    const plWeight = Number(pl.data['gross_weight'])
    const declWeight = Number(snap.totalGrossWeight)

    const pass = withinTolerance(plWeight, declWeight)

    return {
      ruleCode: this.code,
      severity: this.severity,
      result: pass ? 'PASS' : 'FAIL',
      message: pass
        ? `Çeki listesi brüt ağırlığı (${plWeight} kg) beyanname brüt ağırlığıyla (${declWeight} kg) eşleşiyor.`
        : `Çeki listesi brüt ağırlığı (${plWeight} kg) beyanname brüt ağırlığından (${declWeight} kg) ±%1'den fazla farklı.`,
      sourceRefs: pass
        ? []
        : [
            { docType: DocumentType.PACKING_LIST, field: 'gross_weight', value: plWeight },
            { docType: DocumentType.DECLARATION_OUTPUT, field: 'total_gross_weight', value: declWeight },
          ],
    }
  },
}

export const CROSS_003: RuleDefinition = {
  code: 'CROSS-003',
  name: 'Fatura Incoterm değeri yükleme talimatıyla eşleşmeli',
  severity: RuleSeverity.WARNING,
  appliesToDocTypes: [DocumentType.INVOICE, DocumentType.LOADING_INSTRUCTION],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const invoice = ctx.documents.find((d) => d.docType === DocumentType.INVOICE)
    const loading = ctx.documents.find((d) => d.docType === DocumentType.LOADING_INSTRUCTION)

    if (!invoice || !loading) return null
    if (!invoice.data['incoterm'] || !loading.data['incoterm']) return null

    const invInco = String(invoice.data['incoterm']).toUpperCase().trim()
    const loadInco = String(loading.data['incoterm'] ?? loading.data['delivery_term'] ?? '').toUpperCase().trim()

    if (!invInco || !loadInco) return null

    const pass = invInco === loadInco

    return {
      ruleCode: this.code,
      severity: this.severity,
      result: pass ? 'PASS' : 'WARN',
      message: pass
        ? `Incoterm fatura (${invInco}) ile yükleme talimatı (${loadInco}) arasında eşleşiyor.`
        : `Incoterm uyuşmazlığı: fatura "${invInco}" ↔ yükleme talimatı "${loadInco}".`,
      sourceRefs: pass
        ? []
        : [
            { docType: DocumentType.INVOICE, field: 'incoterm', value: invInco },
            { docType: DocumentType.LOADING_INSTRUCTION, field: 'incoterm', value: loadInco },
          ],
    }
  },
}

export const CROSS_004: RuleDefinition = {
  code: 'CROSS-004',
  name: 'Fatura toplam miktarı çeki listesi toplam miktarıyla eşleşmeli',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.INVOICE, DocumentType.PACKING_LIST],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const invoice = ctx.documents.find((d) => d.docType === DocumentType.INVOICE)
    const pl = ctx.documents.find((d) => d.docType === DocumentType.PACKING_LIST)

    if (!invoice || !pl) return null

    const invoiceItems = invoice.data['items'] as Array<{ quantity?: number | null; unit?: string | null }> | null | undefined
    const plItems = pl.data['items'] as Array<{ quantity?: number | null }> | null | undefined

    if (!invoiceItems || invoiceItems.length === 0) return null
    if (!plItems || plItems.length === 0) return null

    const invTotal = invoiceItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)
    const plTotal = plItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)

    if (invTotal === 0 || plTotal === 0) return null

    const pass = withinTolerance(invTotal, plTotal)
    const ambiguousUnits = !pass && hasAmbiguousQuantityUnits(invoiceItems, pl.data)

    return {
      ruleCode: this.code,
      severity: ambiguousUnits ? RuleSeverity.WARNING : this.severity,
      result: pass ? 'PASS' : ambiguousUnits ? 'REVIEW_NEEDED' : 'FAIL',
      message: pass
        ? `Fatura toplam miktarı (${invTotal}) çeki listesi toplam miktarıyla (${plTotal}) eşleşiyor.`
        : ambiguousUnits
          ? `Miktar değerleri farklı (${invTotal} ↔ ${plTotal}) ancak birimler (adet vs koli) belirsiz. Hard fail yerine manuel inceleme önerilir.`
        : `Miktar uyuşmazlığı: fatura ${invTotal} birim, çeki listesi ${plTotal} birim. Fark %1'i aşıyor.`,
      sourceRefs: pass
        ? []
        : [
            { docType: DocumentType.INVOICE, field: 'items[].quantity', value: invTotal },
            { docType: DocumentType.PACKING_LIST, field: 'items[].quantity', value: plTotal },
          ],
    }
  },
}

export const CROSS_009: RuleDefinition = {
  code: 'CROSS-009',
  name: 'Doğrulanan ticaret akışı taraf ve güzergah verisiyle örtüşmeli',
  severity: RuleSeverity.WARNING,
  appliesToDocTypes: [DocumentType.INVOICE, DocumentType.DECLARATION_OUTPUT, DocumentType.LOADING_INSTRUCTION, DocumentType.TRANSPORT_DOC],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    if (ctx.tradeFlow !== 'IMPORT' && ctx.tradeFlow !== 'EXPORT') return null
    const invoice = ctx.documents.find((d) => d.docType === DocumentType.INVOICE)
    const declaration = ctx.documents.find((d) => d.docType === DocumentType.DECLARATION_OUTPUT)
    const loading = ctx.documents.find((d) => d.docType === DocumentType.LOADING_INSTRUCTION)
    const transport = ctx.documents.find((d) => d.docType === DocumentType.TRANSPORT_DOC)

    const sellerEvidence = `${invoice?.data['seller_name'] ?? ''} ${invoice?.data['seller_address'] ?? ''} ${declaration?.data['exporter'] ?? ''} ${loading?.data['shipper'] ?? ''} ${transport?.data['shipper'] ?? ''}`
    const buyerEvidence = `${invoice?.data['buyer_name'] ?? ''} ${invoice?.data['buyer_address'] ?? ''} ${invoice?.data['consignee'] ?? ''} ${declaration?.data['importer'] ?? ''} ${loading?.data['consignee'] ?? ''} ${loading?.data['delivery_address'] ?? ''} ${transport?.data['consignee'] ?? ''} ${transport?.data['destination'] ?? ''}`

    const sellerTurkey = containsTurkey(sellerEvidence)
    const buyerTurkey = containsTurkey(buyerEvidence)
    const sellerForeign = containsForeignCountry(sellerEvidence)
    const buyerForeign = containsForeignCountry(buyerEvidence)

    const exportPass = ctx.tradeFlow === 'EXPORT' && sellerTurkey && buyerForeign && !buyerTurkey
    const importPass = ctx.tradeFlow === 'IMPORT' && buyerTurkey && sellerForeign && !sellerTurkey

    if (exportPass || importPass) {
      return {
        ruleCode: this.code,
        severity: this.severity,
        result: 'PASS',
        message: `Ticaret akışı ${ctx.tradeFlow} taraf/güzergah verisiyle desteklenmiş.`,
        sourceRefs: [],
      }
    }

    const contradictory =
      (ctx.tradeFlow === 'EXPORT' && buyerTurkey && !sellerTurkey) ||
      (ctx.tradeFlow === 'IMPORT' && sellerTurkey && !buyerTurkey)

    return {
      ruleCode: this.code,
      severity: this.severity,
      result: contradictory ? 'WARN' : 'REVIEW_NEEDED',
      message: contradictory
        ? `Ticaret akışı ${ctx.tradeFlow} taraf verileriyle çelişiyor olabilir. Satıcı/alıcı ülkelerini kontrol edin.`
        : `Ticaret akışı ${ctx.tradeFlow} çıkarılan taraf veya güzergah verisi tarafından kuvvetli şekilde desteklenmiyor. Manuel doğrulama önerilir.`,
      sourceRefs: [
        { docType: DocumentType.INVOICE, field: 'seller/buyer evidence', value: `${sellerEvidence} | ${buyerEvidence}`.slice(0, 240) },
      ],
    }
  },
}

export const CROSS_006: RuleDefinition = {
  code: 'CROSS-006',
  name: 'Fatura net ağırlığı çeki listesi net ağırlığıyla eşleşmeli',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.INVOICE, DocumentType.PACKING_LIST],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const invoice = ctx.documents.find((d) => d.docType === DocumentType.INVOICE)
    const pl = ctx.documents.find((d) => d.docType === DocumentType.PACKING_LIST)

    if (!invoice || !pl) return null
    if (!invoice.data['net_weight'] || !pl.data['net_weight']) return null

    const invWeight = Number(invoice.data['net_weight'])
    const plWeight = Number(pl.data['net_weight'])

    if (isNaN(invWeight) || isNaN(plWeight) || invWeight === 0 || plWeight === 0) return null

    const pass = withinTolerance(invWeight, plWeight)

    return {
      ruleCode: this.code,
      severity: this.severity,
      result: pass ? 'PASS' : 'FAIL',
      message: pass
        ? `Net ağırlık eşleşiyor: fatura (${invWeight} kg) ≈ çeki listesi (${plWeight} kg).`
        : `Net ağırlık uyuşmazlığı: fatura (${invWeight} kg) ↔ çeki listesi (${plWeight} kg), fark %1'i aşıyor.`,
      sourceRefs: pass
        ? []
        : [
            { docType: DocumentType.INVOICE, field: 'net_weight', value: invWeight },
            { docType: DocumentType.PACKING_LIST, field: 'net_weight', value: plWeight },
          ],
    }
  },
}

export const CROSS_007: RuleDefinition = {
  code: 'CROSS-007',
  name: 'Para birimi fatura ile beyannamede eşleşmeli',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.INVOICE, DocumentType.DECLARATION_OUTPUT],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const invoice = ctx.documents.find((d) => d.docType === DocumentType.INVOICE)
    const snap = ctx.declarationSnapshot

    if (!invoice || !snap) return null
    if (!invoice.data['currency'] || !snap.currency) return null

    const invCcy = String(invoice.data['currency']).toUpperCase().trim()
    const declCcy = String(snap.currency).toUpperCase().trim()

    if (invCcy === declCcy) {
      return {
        ruleCode: this.code,
        severity: this.severity,
        result: 'PASS',
        message: `Para birimi eşleşiyor: fatura ve beyanname ${invCcy} kullanıyor.`,
        sourceRefs: [],
      }
    }

    return {
      ruleCode: this.code,
      severity: this.severity,
      result: 'FAIL',
      message: `Para birimi uyuşmazlığı: fatura "${invCcy}" ↔ beyanname "${declCcy}".`,
      sourceRefs: [
        { docType: DocumentType.INVOICE, field: 'currency', value: invCcy },
        { docType: DocumentType.DECLARATION_OUTPUT, field: 'currency', value: declCcy },
      ],
    }
  },
}

export const CROSS_008: RuleDefinition = {
  code: 'CROSS-008',
  name: 'Çeki listesi paket sayısı beyannameyle eşleşmeli',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.PACKING_LIST, DocumentType.DECLARATION_OUTPUT],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const pl = ctx.documents.find((d) => d.docType === DocumentType.PACKING_LIST)
    const snap = ctx.declarationSnapshot

    if (!pl || !snap) return null
    if (!pl.data['package_count'] || !snap.packageCount) return null

    const plCount = Number(pl.data['package_count'])
    const declCount = Number(snap.packageCount)

    if (isNaN(plCount) || isNaN(declCount)) return null

    if (plCount === declCount) {
      return {
        ruleCode: this.code,
        severity: this.severity,
        result: 'PASS',
        message: `Paket sayısı eşleşiyor: çeki listesi ve beyannamede ${plCount} paket.`,
        sourceRefs: [],
      }
    }

    return {
      ruleCode: this.code,
      severity: this.severity,
      result: 'FAIL',
      message: `Paket sayısı uyuşmazlığı: çeki listesinde ${plCount}, beyannamede ${declCount} paket.`,
      sourceRefs: [
        { docType: DocumentType.PACKING_LIST, field: 'package_count', value: plCount },
        { docType: DocumentType.DECLARATION_OUTPUT, field: 'package_count', value: declCount },
      ],
    }
  },
}

export const CROSS_005: RuleDefinition = {
  code: 'CROSS-005',
  name: 'Faturadaki satıcı yükleme talimatındaki gönderici ile eşleşmeli',
  severity: RuleSeverity.WARNING,
  appliesToDocTypes: [DocumentType.INVOICE, DocumentType.LOADING_INSTRUCTION],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const invoice = ctx.documents.find((d) => d.docType === DocumentType.INVOICE)
    const loading = ctx.documents.find((d) => d.docType === DocumentType.LOADING_INSTRUCTION)

    if (!invoice || !loading) return null
    if (!invoice.data['seller_name'] || !loading.data['shipper']) return null

    const sellerName = String(invoice.data['seller_name']).toLowerCase().trim()
    const sellerAddress = String(invoice.data['seller_address'] ?? '').toLowerCase().trim()
    const shipperName = String(loading.data['shipper']).toLowerCase().trim()

    // Fuzzy match: check if one contains the other (handles abbreviations)
    const pass =
      sellerName.includes(shipperName) ||
      shipperName.includes(sellerName) ||
      hasMeaningfulOverlap(sellerAddress, shipperName)

    return {
      ruleCode: this.code,
      severity: this.severity,
      result: pass ? 'PASS' : 'WARN',
      message: pass
        ? 'Fatura satıcısı yükleme talimatı göndericisiyle eşleşiyor.'
        : `Fatura satıcısı "${invoice.data['seller_name']}" yükleme talimatı göndericisi "${loading.data['shipper']}" ile eşleşmeyebilir.`,
      sourceRefs: pass
        ? []
        : [
            { docType: DocumentType.INVOICE, field: 'seller_name', value: invoice.data['seller_name'] },
            { docType: DocumentType.LOADING_INSTRUCTION, field: 'shipper', value: loading.data['shipper'] },
          ],
    }
  },
}
