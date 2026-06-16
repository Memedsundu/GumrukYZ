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

  if (explicitPackageCount) next['package_count'] = parseLocaleNumber(explicitPackageCount)
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

function parseLocaleNumber(value: string | undefined): number | null {
  return toFiniteNumber(value)
}

function toInteger(value: string | undefined): number | null {
  const parsed = parseLocaleNumber(value)
  return parsed == null ? null : Math.round(parsed)
}

function collapseWhitespace(value: string | undefined): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}
