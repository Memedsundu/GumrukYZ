import type { ReportCitationItem, ReportFindingItem } from './report-types'

/**
 * Filter, sort and count semantics for the report workspace. This module is
 * the behavioral contract of the page — layout components may move around it,
 * but the logic here must not change without a product decision.
 */

export type FilterKey = 'ALL' | 'FAIL' | 'REVIEW_NEEDED' | 'WARN' | 'EXPERT' | 'PASS'

export const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'ALL', label: 'Tüm bulgular' },
  { key: 'FAIL', label: 'Hatalar' },
  { key: 'REVIEW_NEEDED', label: 'İnceleme gerekli' },
  { key: 'WARN', label: 'Uyarılar' },
  { key: 'EXPERT', label: 'Yapay zeka' },
  { key: 'PASS', label: 'Geçen kontroller' },
]

export const CATEGORY_ORDER = [
  'Belge seti',
  'Belge kalitesi',
  'Fatura',
  'Çeki listesi',
  'Beyanname',
  'GTİP',
  'Menşe',
  'Kıymet',
  'Taşıma',
  'Yapay zeka',
  'Diğer',
]

export function matchesFilter(finding: ReportFindingItem, filter: FilterKey, category: string | null) {
  if (category && finding.category !== category) return false
  if (filter === 'ALL') return true
  if (filter === 'EXPERT') return finding.kind === 'expert'
  return finding.result === filter
}

export function sortFindings(a: ReportFindingItem, b: ReportFindingItem) {
  const resultDiff = resultPriority(a.result) - resultPriority(b.result)
  if (resultDiff !== 0) return resultDiff
  const categoryDiff = categoryPriority(a.category) - categoryPriority(b.category)
  if (categoryDiff !== 0) return categoryDiff
  const sourceDiff = sourcePriority(a.kind) - sourcePriority(b.kind)
  if (sourceDiff !== 0) return sourceDiff
  return a.code.localeCompare(b.code, 'tr')
}

export function resultPriority(result: string): number {
  if (result === 'FAIL') return 0
  if (result === 'REVIEW_NEEDED') return 1
  if (result === 'WARN') return 2
  return 3
}

export function sourcePriority(kind: ReportFindingItem['kind']): number {
  return kind === 'expert' ? 1 : 0
}

export function categoryPriority(category: string): number {
  const index = CATEGORY_ORDER.indexOf(category)
  return index === -1 ? CATEGORY_ORDER.length : index
}

export function buildCategoryCounts(findings: ReportFindingItem[]) {
  const counts = new Map<string, number>()
  for (const finding of findings.filter((item) => item.result !== 'PASS')) {
    counts.set(finding.category, (counts.get(finding.category) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => categoryPriority(a.category) - categoryPriority(b.category))
}

export function buildReportSources(findings: ReportFindingItem[]) {
  const sources = new Map<string, ReportCitationItem>()
  for (const citation of findings.flatMap((finding) => finding.citations)) {
    const key = `${citation.title}:${citation.label ?? ''}:${citation.url}`
    if (!sources.has(key)) sources.set(key, citation)
  }
  return [...sources.values()]
}
