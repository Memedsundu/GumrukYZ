import { DocumentType, RuleSeverity } from '@gumrukyz/domain'
import type { RuleDefinition, SubmissionContext, RuleEvaluationResult } from '../types.js'
import { reviewResult, toFiniteNumber } from '../helpers.js'

const TOLERANCE = 0.01 // 1%
const DECIMAL_SCALE_FACTORS = [10, 100, 1000]

function withinTolerance(a: number, b: number): boolean {
  if (a === 0 && b === 0) return true
  const base = Math.max(Math.abs(a), Math.abs(b))
  return Math.abs(a - b) / base <= TOLERANCE
}

function looksLikeDecimalScaleMismatch(a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return false
  return DECIMAL_SCALE_FACTORS.some(
    (factor) => withinTolerance(a * factor, b) || withinTolerance(a, b * factor),
  )
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
  const normalized = normalizeUnit(value)
  if (!normalized) return false
  return /(package|packages|pkg|koli|koliler|carton|ctn|pallet|palet|pallete|kap|case|box|woodenbox)/.test(normalized)
}

function isPieceUnit(value: unknown): boolean {
  const normalized = normalizeUnit(value)
  if (!normalized) return false
  return /^(pcs|pc|piece|pieces|adet|unit|units|ea)$/.test(normalized)
}

function hasAmbiguousQuantityUnits(
  invoiceItems: Array<{ unit?: unknown }>,
  packingList: Record<string, unknown>,
): boolean {
  const invoiceUnits = invoiceItems.map((item) => item.unit).filter(Boolean)
  const packingUnit = packingList['package_type']
  const packingItems = Array.isArray(packingList['items'])
    ? packingList['items'] as Array<{ unit?: unknown; package_type?: unknown }>
    : []
  const packingItemUnits = packingItems.flatMap((item) => [item.unit, item.package_type]).filter(Boolean)
  if (invoiceUnits.length === 0 && !packingUnit && packingItemUnits.length === 0) return true
  const invoiceLooksPieceBased = invoiceUnits.some(isPieceUnit)
  const packingLooksPackageBased = isPackageUnit(packingUnit) || packingItemUnits.some(isPackageUnit)
  return invoiceLooksPieceBased && packingLooksPackageBased
}

function normalizeCurrencyCode(value: unknown): string | null {
  const normalized = String(value ?? '').trim().toUpperCase()
  return normalized.length > 0 ? normalized : null
}

export const CROSS_001: RuleDefinition = {
  code: 'CROSS-001',
  name: 'Fatura toplam tutarı beyanname toplam tutarıyla eşleşmeli',
  severity: RuleSeverity.ERROR,
  appliesToDocTypes: [DocumentType.INVOICE, DocumentType.DECLARATION_OUTPUT],

  evaluate(ctx: SubmissionContext): RuleEvaluationResult | null {
    const invoices = ctx.documents.filter((d) => d.docType === DocumentType.INVOICE)
    const snap = ctx.declarationSnapshot

    if (invoices.length === 0 || !snap?.totalValue) return null

    const declAmt = toFiniteNumber(snap.totalValue)
    if (declAmt == null) return null

    const invoiceTotals = invoices.map((inv) => toFiniteNumber(inv.data['total_amount']))
    const readableTotals = invoiceTotals.filter((total): total is number => total != null)
    if (readableTotals.length === 0) return null

    // Multi-invoice declarations: summing invoice totals is only meaningful
    // when every invoice total is readable and all currencies agree (with
    // each other and with the declaration). Otherwise the comparison cannot
    // be decided deterministically — hand it to a human.
    if (invoices.length > 1) {
      if (readableTotals.length < invoices.length) {
        return reviewResult(
          this.code,
          this.severity,
          `Dosyada ${invoices.length} fatura var ancak ${invoices.length - readableTotals.length} tanesinde toplam tutar okunamadı. Fatura toplamları beyanname kıymetiyle karşılaştırılamadı; manuel kontrol gerekli.`,
          [{ docType: DocumentType.INVOICE, field: 'total_amount', value: null }],
        )
      }
      const invoiceCurrencies = new Set(
        invoices
          .map((inv) => normalizeCurrencyCode(inv.data['currency']))
          .filter((currency): currency is string => Boolean(currency)),
      )
      const declCurrency = normalizeCurrencyCode(snap.currency)
      const currencyConflict =
        invoiceCurrencies.size > 1 ||
        (declCurrency != null && invoiceCurrencies.size === 1 && !invoiceCurrencies.has(declCurrency))
      if (currencyConflict) {
        return reviewResult(
          this.code,
          this.severity,
          `Dosyadaki faturalar farklı para birimlerinde (${[...invoiceCurrencies].join(', ')}${declCurrency ? `; beyanname ${declCurrency}` : ''}). Toplamlar kur dönüşümü olmadan karşılaştırılamaz; manuel kontrol gerekli.`,
          invoices.map((inv) => ({
            docType: DocumentType.INVOICE,
            field: 'currency',
            value: inv.data['currency'] ?? null,
          })),
        )
      }
    }

    const invAmt = readableTotals.reduce((sum, total) => sum + total, 0)
    const pass = withinTolerance(invAmt, declAmt)
    const isFreeOfChargeExport =
      ctx.tradeFlow === 'EXPORT' && invoices.every((inv) => inv.data['free_of_charge'] === true)
    const invoiceLabel = invoices.length > 1
      ? `${invoices.length} faturanın toplam tutarı`
      : 'Fatura toplam tutarı'

    return {
      ruleCode: this.code,
      severity: pass || !isFreeOfChargeExport ? this.severity : RuleSeverity.WARNING,
      result: pass ? 'PASS' : isFreeOfChargeExport ? 'WARN' : 'FAIL',
      message: pass
        ? `${invoiceLabel} (${invAmt}) beyanname tutarıyla (${declAmt}) tolerans dahilinde eşleşiyor.`
        : isFreeOfChargeExport
          ? `Bedelsiz ihracat faturası (${invAmt}) beyanname istatistiki/gümrük kıymetinden (${declAmt}) farklı. Manuel inceleme önerilir.`
        : `${invoiceLabel} (${invAmt}) beyanname toplam tutarıyla (${declAmt}) ±%1'den fazla farklı. Alanlar: invoice.total_amount, declaration.total_value.`,
      sourceRefs: pass
        ? []
        : [
            ...invoices.map((inv) => ({
              docType: DocumentType.INVOICE,
              field: 'total_amount',
              value: toFiniteNumber(inv.data['total_amount']),
            })),
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

    const plWeight = toFiniteNumber(pl.data['gross_weight'])
    const declWeight = toFiniteNumber(snap.totalGrossWeight)
    if (plWeight == null || declWeight == null) return null

    const pass = withinTolerance(plWeight, declWeight)
    const decimalScaleMismatch = !pass && looksLikeDecimalScaleMismatch(plWeight, declWeight)

    return {
      ruleCode: this.code,
      severity: pass || decimalScaleMismatch ? RuleSeverity.WARNING : this.severity,
      result: pass ? 'PASS' : decimalScaleMismatch ? 'REVIEW_NEEDED' : 'FAIL',
      message: pass
        ? `Çeki listesi brüt ağırlığı (${plWeight} kg) beyanname brüt ağırlığıyla (${declWeight} kg) eşleşiyor.`
        : decimalScaleMismatch
          ? `Brüt ağırlık farkı ondalık/binlik ayırıcı okuma hatası olabilir: çeki listesi (${plWeight} kg) ↔ beyanname (${declWeight} kg). Kaynak belgelerde ağırlık alanları manuel doğrulanmalı.`
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

    const invTotal = invoiceItems.reduce((sum, item) => sum + (toFiniteNumber(item.quantity) || 0), 0)
    const plTotal = plItems.reduce((sum, item) => sum + (toFiniteNumber(item.quantity) || 0), 0)

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
          ? `Miktar değerleri farklı (${invTotal} ↔ ${plTotal}) ancak fatura adet, çeki listesi ambalaj/kap sayısı gösteriyor olabilir. Manuel inceleme önerilir.`
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

    const invWeight = toFiniteNumber(invoice.data['net_weight'])
    const plWeight = toFiniteNumber(pl.data['net_weight'])
    const invGrossWeight = toFiniteNumber(invoice.data['gross_weight'])
    const plGrossWeight = toFiniteNumber(pl.data['gross_weight'])

    if (
      (invWeight == null || invWeight === 0) &&
      (plWeight == null || plWeight === 0) &&
      ((invGrossWeight != null && invGrossWeight > 0) || (plGrossWeight != null && plGrossWeight > 0))
    ) {
      return reviewResult(
        this.code,
        RuleSeverity.WARNING,
        'Net ağırlık bilgisi belgelerde bulunamadı; brüt ağırlık net ağırlık olarak kullanılmamalı.',
        [
          { docType: DocumentType.INVOICE, field: 'net_weight', value: invoice.data['net_weight'] ?? null },
          { docType: DocumentType.PACKING_LIST, field: 'net_weight', value: pl.data['net_weight'] ?? null },
          { docType: DocumentType.PACKING_LIST, field: 'gross_weight', value: plGrossWeight ?? null },
        ],
      )
    }

    if (invWeight == null || plWeight == null || invWeight === 0 || plWeight === 0) return null

    const pass = withinTolerance(invWeight, plWeight)
    const decimalScaleMismatch = !pass && looksLikeDecimalScaleMismatch(invWeight, plWeight)

    return {
      ruleCode: this.code,
      severity: pass || decimalScaleMismatch ? RuleSeverity.WARNING : this.severity,
      result: pass ? 'PASS' : decimalScaleMismatch ? 'REVIEW_NEEDED' : 'FAIL',
      message: pass
        ? `Net ağırlık eşleşiyor: fatura (${invWeight} kg) ≈ çeki listesi (${plWeight} kg).`
        : decimalScaleMismatch
          ? `Net ağırlık farkı ondalık/binlik ayırıcı okuma hatası olabilir: fatura (${invWeight} kg) ↔ çeki listesi (${plWeight} kg). Kaynak belgede ağırlık alanları manuel doğrulanmalı.`
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

    const plCount = toFiniteNumber(pl.data['package_count'])
    const declCount = toFiniteNumber(snap.packageCount)

    if (plCount == null || declCount == null) return null

    const pass = plCount === declCount
    const decimalScaleMismatch = !pass && looksLikeDecimalScaleMismatch(plCount, declCount)
    const packageBreakdownTotal = sumPackageBreakdown(pl.data)

    if (pass) {
      return {
        ruleCode: this.code,
        severity: this.severity,
        result: 'PASS',
        message: `Paket sayısı eşleşiyor: çeki listesi ve beyannamede ${plCount} paket.`,
        sourceRefs: [],
      }
    }

    if (packageBreakdownTotal != null && packageBreakdownTotal === declCount) {
      return {
        ruleCode: this.code,
        severity: RuleSeverity.WARNING,
        result: 'REVIEW_NEEDED',
        message: `Kap sayısı beyannameyle ambalaj kırılımı üzerinden uzlaşıyor (${packageBreakdownTotal}), ancak çeki listesi ana package_count alanı ${plCount} olarak çıkarılmış. Palet/koli ayrımı kaynak belgeden manuel doğrulanmalı.`,
        sourceRefs: [
          { docType: DocumentType.PACKING_LIST, field: 'package_count', value: plCount },
          { docType: DocumentType.PACKING_LIST, field: 'package_breakdown', value: packageBreakdownTotal },
          { docType: DocumentType.DECLARATION_OUTPUT, field: 'package_count', value: declCount },
        ],
      }
    }

    return {
      ruleCode: this.code,
      severity: decimalScaleMismatch ? RuleSeverity.WARNING : this.severity,
      result: decimalScaleMismatch ? 'REVIEW_NEEDED' : 'FAIL',
      message: decimalScaleMismatch
        ? `Kap sayısı farkı ondalık/binlik ayırıcı okuma hatası olabilir: çeki listesi (${plCount}) ↔ beyanname (${declCount}). Kaynak belgelerde kap alanları manuel doğrulanmalı.`
        : `Paket sayısı uyuşmazlığı: çeki listesinde ${plCount}, beyannamede ${declCount} paket.`,
      sourceRefs: [
        { docType: DocumentType.PACKING_LIST, field: 'package_count', value: plCount },
        { docType: DocumentType.DECLARATION_OUTPUT, field: 'package_count', value: declCount },
      ],
    }
  },
}

function sumPackageBreakdown(data: Record<string, unknown>): number | null {
  const rawBreakdown = data['package_breakdown']
  if (!Array.isArray(rawBreakdown)) return null
  const values = rawBreakdown
    .map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
      return toFiniteNumber((entry as Record<string, unknown>)['count'])
    })
    .filter((value): value is number => value != null && value > 0)
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0)
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
