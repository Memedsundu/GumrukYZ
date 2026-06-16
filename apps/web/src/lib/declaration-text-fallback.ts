import { toFiniteNumber } from '@gumrukyz/rules'

type DeclarationSummaryRow = {
  lineNumber: number | null
  gtipCode: string
  goodsDescription: string
  quantity: number | null
  unit: string | null
  netWeight: number | null
  grossWeight: number | null
  packageCount: number | null
  invoiceCurrency: string | null
  invoiceValue: number | null
  customsCurrency: string | null
  customsValue: number | null
}

export function enhanceDeclarationOutputFromText(
  data: Record<string, unknown>,
  rawText: string,
): Record<string, unknown> {
  const next = { ...data }
  const explicitPackageCount = firstMatch(rawText, /\b(\d+)\s*KAP\b/i)
  const explicitNetGross = rawText.match(/Toplam Net\s*\/\s*Br[üu]t Kg:\s*([\d.,]+)\s*\/\s*([\d.,]+)/i)
  const row = parseDeclarationSummaryRow(rawText)
  const invoiceRefs = parseInvoiceRefs(rawText)
  const fobValue = parseLocaleNumber(firstMatch(rawText, /Toplam FOB\s*:?\s*([+-]?\d[\d.,]*)/i))
  const freeOfChargeLineValues = parseFreeOfChargeLineValues(rawText)

  if (explicitPackageCount) next['package_count'] = parseLocaleNumber(explicitPackageCount)
  if (explicitPackageCount) {
    const count = parseLocaleNumber(explicitPackageCount)
    if (count != null) next['package_breakdown'] = [{ type: 'kap', count }]
  }
  if (invoiceRefs.length > 0) next['invoice_refs'] = invoiceRefs
  if (fobValue != null) next['fob_value'] = fobValue
  if (/Bedelsiz|F\.?\s*O\.?\s*C\.?|FREE OF CHARGE/i.test(rawText)) next['free_of_charge'] = true
  if (freeOfChargeLineValues.length > 0) next['free_of_charge_line_values'] = freeOfChargeLineValues
  if (explicitNetGross) {
    next['net_weight'] = parseLocaleNumber(explicitNetGross[1])
    next['gross_weight'] = parseLocaleNumber(explicitNetGross[2])
  }

  if (row) {
    next['gtip_code'] = row.gtipCode
    next['goods_description'] = next['goods_description'] ?? row.goodsDescription
    if (!explicitNetGross) {
      next['net_weight'] = row.netWeight
      next['gross_weight'] = row.grossWeight
    }
    if (!explicitPackageCount) next['package_count'] = row.packageCount
    next['currency'] = row.customsCurrency ?? row.invoiceCurrency ?? next['currency']
    next['total_value'] = row.customsValue ?? row.invoiceValue ?? next['total_value']
    next['items'] = mergeDeclarationSummaryItem(next['items'], row)
  }

  return next
}

export function parseDeclarationSummaryRow(rawText: string): DeclarationSummaryRow | null {
  const rowPattern =
    /^\s*(\d+)\s+(\d{8,12})\s+(.+?)\s+(\d+(?:[.,]\d+)?)\s+([A-Za-zÇĞİÖŞÜçğıöşü/]+)\s+([+-]?\d[\d.,]*)\s+([+-]?\d[\d.,]*)\s+(\d+)\s+([A-Z]{3})\s+([+-]?\d[\d.,]*)\s+([A-Z]{3})\s+([+-]?\d[\d.,]*)\s*$/gim

  for (const match of rawText.matchAll(rowPattern)) {
    const lineNumber = toInteger(match[1])
    const gtipCode = match[2]
    const goodsDescription = collapseWhitespace(match[3])
    const quantity = parseLocaleNumber(match[4])
    const unit = match[5] ?? null
    const netWeight = parseLocaleNumber(match[6])
    const grossWeight = parseLocaleNumber(match[7])
    const packageCount = toInteger(match[8])
    const invoiceCurrency = match[9] ?? null
    const invoiceValue = parseLocaleNumber(match[10])
    const customsCurrency = match[11] ?? null
    const customsValue = parseLocaleNumber(match[12])

    if (!gtipCode || grossWeight == null || packageCount == null) continue
    return {
      lineNumber,
      gtipCode,
      goodsDescription,
      quantity,
      unit,
      netWeight,
      grossWeight,
      packageCount,
      invoiceCurrency,
      invoiceValue,
      customsCurrency,
      customsValue,
    }
  }

  return null
}

function mergeDeclarationSummaryItem(
  rawItems: unknown,
  row: DeclarationSummaryRow,
): Array<Record<string, unknown>> {
  const rowItem = {
    line_number: row.lineNumber,
    gtip_code: row.gtipCode,
    goods_description: row.goodsDescription,
    quantity: row.quantity,
    unit: row.unit,
    net_weight: row.netWeight,
    gross_weight: row.grossWeight,
    value: row.customsValue ?? row.invoiceValue,
    currency: row.customsCurrency ?? row.invoiceCurrency,
  }

  if (!Array.isArray(rawItems) || rawItems.length === 0) return [rowItem]

  return rawItems.map((item, index) => {
    if (index !== 0 || item == null || typeof item !== 'object' || Array.isArray(item)) {
      return item as Record<string, unknown>
    }
    return { ...(item as Record<string, unknown>), ...rowItem }
  })
}

function firstMatch(text: string, pattern: RegExp): string | null {
  const match = text.match(pattern)
  return match?.[1]?.trim() ?? null
}

function parseLocaleNumber(value: string | null | undefined): number | null {
  return toFiniteNumber(value)
}

function toInteger(value: string | undefined): number | null {
  const parsed = parseLocaleNumber(value)
  return parsed == null ? null : Math.round(parsed)
}

function parseInvoiceRefs(rawText: string): Array<{ number: string; free_of_charge: boolean }> {
  const refs = new Map<string, { number: string; free_of_charge: boolean }>()
  for (const match of rawText.matchAll(/\b(FI[\d-]{6,}|[A-Z]{1,4}\d{10,})\b(\s*\((?:F\.?\s*O\.?\s*C\.?|BEDELS[İI]Z)\))?/gi)) {
    const number = match[1]?.trim()
    if (!number) continue
    const nearby = lineContaining(rawText, match.index ?? 0)
    refs.set(number, {
      number,
      free_of_charge: Boolean(match[2]) || /F\.?\s*O\.?\s*C\.?|BEDELS[İI]Z/i.test(nearby),
    })
  }

  const eInvoiceText = rawText.replace(/(\d)\s+(\d)/g, '$1$2')
  for (const match of eInvoiceText.matchAll(/TPS-E-Fatura\s+Var\s+([0-9./-]+\/[0-9]{12,})/gi)) {
    const number = match[1]?.trim()
    if (!number) continue
    const nearby = eInvoiceText.slice(Math.max(0, (match.index ?? 0) - 180), (match.index ?? 0) + 180)
    refs.set(number, {
      number,
      free_of_charge: /Bedelsiz|F\.?\s*O\.?\s*C\.?|FREE OF CHARGE/i.test(nearby),
    })
  }

  return Array.from(refs.values())
}

function lineContaining(rawText: string, index: number): string {
  const start = rawText.lastIndexOf('\n', index)
  const end = rawText.indexOf('\n', index)
  return rawText.slice(start < 0 ? 0 : start + 1, end < 0 ? rawText.length : end)
}

function parseFreeOfChargeLineValues(rawText: string): number[] {
  const normalized = collapseWhitespace(rawText)
  const directLineValues = normalized.match(/\bAD\s+[\d.,]+\s+(\d+[.,]\d{2})\s+(\d+[.,]\d{2})\s+9\b/i)
  if (directLineValues && /Bedelsiz/i.test(normalized)) {
    return directLineValues
      .slice(1)
      .map((value) => parseLocaleNumber(value))
      .filter((value): value is number => value != null && value > 0)
  }

  const match = normalized.match(/((?:\d{1,6}[.,]\d{2}\s+){2,6}\d+\s+(?:90,90,00\s+)?[\s\S]{0,180}?Kalem Notu\s*:\s*"?\s*Bedelsiz)/i)
  if (!match?.[1]) return []

  return Array.from(match[1].matchAll(/(?<!\d)(\d{1,6}[.,]\d{2})(?!\d)/g))
    .map((value) => parseLocaleNumber(value[1]))
    .filter((value): value is number => value != null && value > 0)
}

function collapseWhitespace(value: string | undefined): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}
