import { toFiniteNumber } from '@gumrukyz/rules'

export type PackingListTextFields = {
  packageCount: number | null
  totalQuantity: number | null
  grossWeight: number | null
  netWeight: number | null
  itemPackageCounts: number[]
  itemQuantities: number[]
}

export function enhancePackingListFromText(
  data: Record<string, unknown>,
  rawText: string,
): Record<string, unknown> {
  const next = { ...data }
  const fields = parsePackingListTextFields(rawText)

  if (fields.packageCount != null) next['package_count'] = fields.packageCount
  if (fields.grossWeight != null) next['gross_weight'] = fields.grossWeight
  if (fields.netWeight != null) next['net_weight'] = fields.netWeight

  if (Array.isArray(next['items'])) {
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
  const tableSection =
    rawText.match(/Package Details[\s\S]*?(?=Total Quantity|Total Packages|Not:|Haz[ıi]rlayan|$)/i)?.[0] ??
    rawText.match(/Ambalaj Bilgileri[\s\S]*?(?=Total Quantity|Total Packages|Not:|Haz[ıi]rlayan|$)/i)?.[0] ??
    ''

  return {
    packageCount: parsePackageCount(normalized),
    totalQuantity: parseLocaleNumber(firstMatch(normalized, /Total Quantity\s+([+-]?\d[\d.,]*)\s*(?:pcs|adet|pieces?)/i)),
    grossWeight: parseLocaleNumber(firstMatch(normalized, /(?:Total Gross Weight|Toplam\s+Br[üu]t(?:\s+A[ğg][ıi]rl[ıi]k)?)\s+([+-]?\d[\d.,]*)/i)),
    netWeight: parseLocaleNumber(firstMatch(normalized, /(?:Total Net Weight|Toplam\s+Net(?:\s+A[ğg][ıi]rl[ıi]k)?)\s+([+-]?\d[\d.,]*)/i)),
    itemPackageCounts: parseItemPackageCounts(tableSection),
    itemQuantities: parseItemQuantities(tableSection || normalized),
  }
}

function parsePackageCount(text: string): number | null {
  return parseLocaleNumber(
    firstMatch(
      text,
      /(?:Total Packages|Toplam\s+(?:Paket|Kap)|Package Summary)\s*:?\s*(\d+)\s+(?:wooden\s+)?(?:boxes|box|packages?|pkg|koli|kap|sand[ıi]k|sandik)\b/i,
    ),
  )
}

function parseItemPackageCounts(text: string): number[] {
  return Array.from(
    text.matchAll(/(?<![-\d])\b(\d+)\s+(?:wooden\s+)?(?:boxes|box|packages?|pkg|koli|kap|sand[ıi]k|sandik)\b/gi),
  )
    .map((match) => parseLocaleNumber(match[1]))
    .filter((value): value is number => value != null && value > 0)
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
