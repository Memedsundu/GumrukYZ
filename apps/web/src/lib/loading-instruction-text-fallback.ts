import { toFiniteNumber } from '@gumrukyz/rules'

export type LoadingInstructionTextFields = {
  packageCount: number | null
  packageBreakdown: PackageBreakdownEntry[]
  grossWeight: number | null
  netWeight: number | null
}

export type PackageBreakdownEntry = {
  type: string
  count: number
}

export function enhanceLoadingInstructionFromText(
  data: Record<string, unknown>,
  rawText: string,
): Record<string, unknown> {
  const next = { ...data }
  const fields = parseLoadingInstructionTextFields(rawText)

  if (fields.packageCount != null) next['package_count'] = fields.packageCount
  if (fields.packageBreakdown.length > 0) next['package_breakdown'] = fields.packageBreakdown
  if (fields.grossWeight != null) next['gross_weight'] = fields.grossWeight
  if (fields.netWeight != null) next['net_weight'] = fields.netWeight
  if (!hasExplicitNetWeightEvidence(rawText)) next['net_weight'] = null

  return next
}

export function parseLoadingInstructionTextFields(rawText: string): LoadingInstructionTextFields {
  const normalized = collapseWhitespace(rawText)
  const packagePhrase = firstMatch(
    normalized,
    /(?:Kap\s*\/\s*Ambalaj|Ambalaj|Packages?|Package\s+Count)\s*:?\s*(.{1,100}?)(?=\s+(?:Br[üu]t|Gross|Net|Talimat|Haz[ıi]rlayan|Kontrol|$))/i,
  )
  const packageText = packagePhrase ?? normalized
  const packageBreakdown = parsePackageBreakdown(packageText)

  return {
    packageCount: parsePackageCount(packageText, packageBreakdown),
    packageBreakdown,
    grossWeight: parseLabeledWeight(normalized, /(?:Br[üu]t|Brut|Gross)\s*(?:Weight|Wt|A[ğg][ıi]rl[ıi]k|Agirlik|kg)?/i),
    netWeight: hasExplicitNetWeightEvidence(rawText)
      ? parseLabeledWeight(normalized, /(?:Net|Netto)\s*(?:Weight|Wt|A[ğg][ıi]rl[ıi]k|Agirlik|kg)?|Toplam\s+Net/i)
      : null,
  }
}

export function hasExplicitNetWeightEvidence(rawText: string): boolean {
  return /\b(net\s*(weight|wt|kg)|netto|net ağırlık|net agirlik|toplam\s+net)\b/i.test(rawText)
}

function parsePackageCount(text: string, packageBreakdown: PackageBreakdownEntry[]): number | null {
  if (packageBreakdown.length === 0) return null
  if (hasHandlingUnitRelationship(text)) {
    const primary = packageBreakdown.find((entry) => !isPalletType(entry.type))
    return primary?.count ?? packageBreakdown[0]?.count ?? null
  }
  return packageBreakdown.reduce((sum, entry) => sum + entry.count, 0)
}

function parseLabeledWeight(text: string, labelPattern: RegExp): number | null {
  const pattern = new RegExp(
    `(?:${labelPattern.source})[^\\d+-]{0,40}([+-]?\\d[\\d.,]*)`,
    labelPattern.flags.replace('g', ''),
  )
  return parseLocaleNumber(firstMatch(text, pattern))
}

function parsePackageBreakdown(text: string): PackageBreakdownEntry[] {
  const totals = new Map<string, number>()

  for (const match of text.matchAll(/\b(\d+(?:[.,]\d+)?)\s+(?:pcs?\s+)?((?:wooden\s+)?box(?:es)?|packages?|pkg|koli|kap|sand[ıi]k|sandik|pallets?|palet|pallete)\b/gi)) {
    const count = parseLocaleNumber(match[1])
    if (count == null || count <= 0) continue
    const type = normalizePackageType(match[2])
    totals.set(type, (totals.get(type) ?? 0) + count)
  }

  return Array.from(totals.entries()).map(([type, count]) => ({ type, count }))
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
