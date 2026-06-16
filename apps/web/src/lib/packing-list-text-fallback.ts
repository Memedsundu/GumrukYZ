import { toFiniteNumber } from '@gumrukyz/rules'

export type PackingListTextFields = {
  packageCount: number | null
  totalQuantity: number | null
  grossWeight: number | null
  netWeight: number | null
  packageBreakdown: PackageBreakdownEntry[]
  invoiceRefs: InvoiceReference[]
  itemPackageCounts: number[]
  itemQuantities: number[]
}

export type PackageBreakdownEntry = {
  type: string
  count: number
}

export type InvoiceReference = {
  number: string
  free_of_charge: boolean
}

export function enhancePackingListFromText(
  data: Record<string, unknown>,
  rawText: string,
): Record<string, unknown> {
  const next = { ...data }
  const fields = parsePackingListTextFields(rawText)

  if (fields.packageCount != null) next['package_count'] = fields.packageCount
  if (fields.packageBreakdown.length > 0) next['package_breakdown'] = fields.packageBreakdown
  if (fields.invoiceRefs.length > 0) next['invoice_refs'] = fields.invoiceRefs
  if (fields.grossWeight != null) next['gross_weight'] = fields.grossWeight
  if (fields.netWeight != null) next['net_weight'] = fields.netWeight

  if (
    Array.isArray(next['items']) &&
    fields.itemQuantities.length === 0 &&
    fields.itemPackageCounts.length > next['items'].length
  ) {
    next['items'] = fields.itemPackageCounts.map((packageCount) => ({
      quantity: null,
      package_count: packageCount,
    }))
  } else if (Array.isArray(next['items'])) {
    next['items'] = next['items'].map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return item
      return {
        ...item,
        ...(fields.itemPackageCounts[index] != null ? { package_count: fields.itemPackageCounts[index] } : {}),
        ...(fields.itemQuantities[index] != null ? { quantity: fields.itemQuantities[index] } : {}),
      }
    })
  } else if (fields.itemQuantities.length > 0) {
    next['items'] = fields.itemQuantities.map((quantity, index) => ({
      quantity,
      package_count: fields.itemPackageCounts[index] ?? null,
    }))
  } else if (fields.itemPackageCounts.length > 0) {
    next['items'] = fields.itemPackageCounts.map((packageCount) => ({
      quantity: null,
      package_count: packageCount,
    }))
  } else if (fields.totalQuantity != null) {
    next['items'] = [{ quantity: fields.totalQuantity }]
  }

  if (!hasExplicitNetWeightEvidence(rawText)) {
    next['net_weight'] = null
    if (Array.isArray(next['items'])) {
      next['items'] = next['items'].map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return item
        return { ...item, net_weight: null }
      })
    }
  }

  return next
}

export function parsePackingListTextFields(rawText: string): PackingListTextFields {
  const normalized = collapseWhitespace(rawText)
  const packageBreakdown = parsePackageBreakdown(rawText)
  const tableSection =
    rawText.match(/Package Details[\s\S]*?(?=Total Quantity|Total Packages|Not:|Haz[ıi]rlayan|$)/i)?.[0] ??
    rawText.match(/Ambalaj Bilgileri[\s\S]*?(?=Total Quantity|Total Packages|Not:|Haz[ıi]rlayan|$)/i)?.[0] ??
    rawText.match(/Muhteviyat[\s\S]*?(?=TOPLAM|TOTAL|Not:|Haz[ıi]rlayan|$)/i)?.[0] ??
    ''

  return {
    packageCount: parsePackageCount(normalized, packageBreakdown),
    totalQuantity: parseLocaleNumber(firstMatch(normalized, /Total Quantity\s+([+-]?\d[\d.,]*)\s*(?:pcs|adet|pieces?)/i)),
    grossWeight:
      parseLocaleNumber(firstMatch(normalized, /(?:Total Gross Weight|Toplam\s+Br[üu]t(?:\s+A[ğg][ıi]rl[ıi]k)?)\s+([+-]?\d[\d.,]*)/i)) ??
      parseLocaleNumber(firstMatch(normalized, /\b(?:TOPLAM|TOTAL)\s+\d+\s+([+-]?\d[\d.,]*)(?:\s+(?:TOPLAM|TOTAL))?\b/i)),
    netWeight: parseLocaleNumber(firstMatch(normalized, /(?:Total Net Weight|Toplam\s+Net(?:\s+A[ğg][ıi]rl[ıi]k)?)\s+([+-]?\d[\d.,]*)/i)),
    packageBreakdown,
    invoiceRefs: parseInvoiceRefs(rawText),
    itemPackageCounts: parseItemPackageCounts(tableSection),
    itemQuantities: parseItemQuantities(tableSection || normalized),
  }
}

function parsePackageCount(text: string, packageBreakdown: PackageBreakdownEntry[]): number | null {
  const explicitLabeledTotal = parseLocaleNumber(
    firstMatch(
      text,
      /(?:Total Packages|Toplam\s+(?:Paket|Kap)|Package Summary)\s*:?\s*(\d+)\s+(?:wooden\s+)?(?:boxes|box|packages?|pkg|koli|kap|sand[ıi]k|sandik)\b/i,
    ),
  )
  if (explicitLabeledTotal != null) return explicitLabeledTotal

  const explicitTableTotal = parseLocaleNumber(
    firstMatch(text, /\b(?:TOPLAM|TOTAL)\s+(\d+)\s+[+-]?\d[\d.,]*(?:\s+(?:TOPLAM|TOTAL))?\b/i),
  )
  if (explicitTableTotal != null) return explicitTableTotal

  if (packageBreakdown.length === 0) return null
  if (hasHandlingUnitRelationship(text)) {
    const primary = packageBreakdown.find((entry) => !isPalletType(entry.type))
    return primary?.count ?? packageBreakdown[0]?.count ?? null
  }
  return packageBreakdown.reduce((sum, entry) => sum + entry.count, 0)
}

function parseItemPackageCounts(text: string): number[] {
  const typeBeforeCount = Array.from(
    text.matchAll(/\b(?:WOODEN\s+BOX|BOX|PALLET|PALLETE|PALET|KOLI|KOLİ|SANDIK|SAND[İI]K)\s+(\d+(?:[.,]\d+)?)\s+[+-]?\d[\d.,]*\b/gi),
  )
    .map((match) => parseLocaleNumber(match[1]))
    .filter((value): value is number => value != null && value > 0)
  if (typeBeforeCount.length > 0) return typeBeforeCount

  const countBeforeType = Array.from(
    text.matchAll(/(?<![-\d])\b(\d+)\s+(?:wooden\s+)?(?:boxes|box|packages?|pkg|koli|kap|sand[ıi]k|sandik)\b/gi),
  )
    .map((match) => parseLocaleNumber(match[1]))
    .filter((value): value is number => value != null && value > 0)
  return countBeforeType
}

function parseItemQuantities(text: string): number[] {
  const insideQuantities = Array.from(
    text.matchAll(/\b(\d+(?:[.,]\d+)?)\s+(?:pieces?|pcs|adet)\s+inside\b/gi),
  )
    .map((match) => parseLocaleNumber(match[1]))
    .filter((value): value is number => value != null && value > 0)
  if (insideQuantities.length > 0) return insideQuantities

  return Array.from(text.matchAll(/\b(\d+(?:[.,]\d+)?)\s+(?:pcs\s*\/\s*adet|pcs|adet|pieces?)\b/gi))
    .map((match) => parseLocaleNumber(match[1]))
    .filter((value): value is number => value != null && value > 0)
}

function hasExplicitNetWeightEvidence(rawText: string): boolean {
  return /\b(net\s*(weight|wt|kg)|netto|net ağırlık|net agirlik|toplam\s+net)\b/i.test(rawText)
}

function parsePackageBreakdown(rawText: string): PackageBreakdownEntry[] {
  const tableRows = aggregatePackageBreakdown(
    Array.from(
      rawText.matchAll(/\b(WOODEN\s+BOX|BOX|PALLET|PALLETE|PALET|KOLI|KOLİ|SANDIK|SAND[İI]K)\s+(\d+(?:[.,]\d+)?)\s+[+-]?\d[\d.,]*\b/gi),
    ).map((match) => ({
      type: normalizePackageType(match[1]),
      count: parseLocaleNumber(match[2]),
    })),
  )
  if (tableRows.length > 0) return tableRows

  const summaryPhrase =
    firstMatch(rawText, /(?:Total Packages|Package Summary|Toplam\s+(?:Paket|Kap))\s*:?\s*([^\n\r]+)/i) ??
    firstMatch(rawText, /(?:Kap\s*Adedi\s*\/\s*Cinsi|Kap\s*\/\s*Ambalaj|Ambalaj)\s*:?\s*([^\n\r]+)/i)

  if (!summaryPhrase) return []
  return aggregatePackageBreakdown(
    Array.from(
      summaryPhrase.matchAll(/\b(\d+(?:[.,]\d+)?)\s+(?:pcs?\s+)?((?:wooden\s+)?box(?:es)?|packages?|pkg|koli|kap|sand[ıi]k|sandik|pallets?|palet|pallete)\b/gi),
    ).map((match) => ({
      type: normalizePackageType(match[2]),
      count: parseLocaleNumber(match[1]),
    })),
  )
}

function aggregatePackageBreakdown(
  entries: Array<{ type: string; count: number | null }>,
): PackageBreakdownEntry[] {
  const totals = new Map<string, number>()
  for (const entry of entries) {
    if (entry.count == null || entry.count <= 0) continue
    totals.set(entry.type, (totals.get(entry.type) ?? 0) + entry.count)
  }
  return Array.from(totals.entries()).map(([type, count]) => ({ type, count }))
}

function parseInvoiceRefs(rawText: string): InvoiceReference[] {
  const refs = new Map<string, InvoiceReference>()
  for (const match of rawText.matchAll(/\b(FI[\d-]{6,}|[A-Z]{1,4}\d{10,})\b(\s*\((?:F\.?\s*O\.?\s*C\.?|BEDELS[İI]Z)\))?/gi)) {
    const number = match[1]?.trim()
    if (!number) continue
    const nearby = lineContaining(rawText, match.index ?? 0)
    refs.set(number, {
      number,
      free_of_charge: Boolean(match[2]) || /F\.?\s*O\.?\s*C\.?|BEDELS[İI]Z/i.test(nearby),
    })
  }
  return Array.from(refs.values())
}

function lineContaining(rawText: string, index: number): string {
  const start = rawText.lastIndexOf('\n', index)
  const end = rawText.indexOf('\n', index)
  return rawText.slice(start < 0 ? 0 : start + 1, end < 0 ? rawText.length : end)
}

function hasHandlingUnitRelationship(text: string): boolean {
  return /\b(?:on|üzerinde|uzerinde)\b|\/\s*\d+\s*(?:pallet|palet|pallete)/i.test(text)
}

function isPalletType(type: string): boolean {
  return type === 'pallet'
}

function normalizePackageType(value: string | undefined): string {
  const normalized = collapseWhitespace(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  if (/pallet|palet|pallete/.test(normalized)) return 'pallet'
  if (/wooden\s+box|sandik|sand[ıi]k/.test(normalized)) return 'wooden_box'
  if (/box|koli|kap|package|pkg/.test(normalized)) return 'package'
  return normalized || 'package'
}

function firstMatch(text: string, pattern: RegExp): string | null {
  const match = text.match(pattern)
  return match?.[1]?.trim() ?? null
}

function parseLocaleNumber(value: string | null | undefined): number | null {
  return toFiniteNumber(value)
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}
