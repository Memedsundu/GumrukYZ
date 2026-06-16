import { toFiniteNumber } from '@gumrukyz/rules'

export type LoadingInstructionTextFields = {
  packageCount: number | null
  grossWeight: number | null
  netWeight: number | null
}

export function enhanceLoadingInstructionFromText(
  data: Record<string, unknown>,
  rawText: string,
): Record<string, unknown> {
  const next = { ...data }
  const fields = parseLoadingInstructionTextFields(rawText)

  if (fields.packageCount != null) next['package_count'] = fields.packageCount
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

  return {
    packageCount: parsePackageCount(packagePhrase ?? normalized),
    grossWeight: parseLabeledWeight(normalized, /(?:Br[üu]t|Brut|Gross)\s*(?:Weight|Wt|A[ğg][ıi]rl[ıi]k|Agirlik|kg)?/i),
    netWeight: hasExplicitNetWeightEvidence(rawText)
      ? parseLabeledWeight(normalized, /(?:Net|Netto)\s*(?:Weight|Wt|A[ğg][ıi]rl[ıi]k|Agirlik|kg)?|Toplam\s+Net/i)
      : null,
  }
}

export function hasExplicitNetWeightEvidence(rawText: string): boolean {
  return /\b(net\s*(weight|wt|kg)|netto|net ağırlık|net agirlik|toplam\s+net)\b/i.test(rawText)
}

function parsePackageCount(text: string): number | null {
  const primary = firstNumericUnitMatch(
    text,
    /\b(\d+)\s+(?:wooden\s+)?(?:boxes|box|packages?|pkg|koli|kap|sand[ıi]k|sandik)\b/i,
  )
  if (primary != null) return primary

  return firstNumericUnitMatch(text, /\b(\d+)\s+(?:pallets?|palet)\b/i)
}

function parseLabeledWeight(text: string, labelPattern: RegExp): number | null {
  const pattern = new RegExp(
    `(?:${labelPattern.source})\\s*:?\\s*([+-]?\\d[\\d.,]*)`,
    labelPattern.flags.replace('g', ''),
  )
  return parseLocaleNumber(firstMatch(text, pattern))
}

function firstNumericUnitMatch(text: string, pattern: RegExp): number | null {
  return parseLocaleNumber(firstMatch(text, pattern))
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
