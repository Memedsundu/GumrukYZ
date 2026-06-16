export const EXPERT_REVIEW_SAFETY_GUARDRAILS = `
- Deterministik kural PASS ise aynı alan için açık ve farklı belge kanıtı olmadan çelişki üretme.
- CROSS-008 veya PL-001 paket/kap sayısı PASS ise 10 wooden boxes / 3 pallets veya 8 wooden boxes / 2 pallets gibi farklı ambalaj seviyelerini toplayıp 13/10 kap uyumsuzluğu yazma.
- CROSS-004 ve PL-001 PASS ise "480 pcs/adet" ürün adedi ile "12 wooden boxes / 3 pallets" ambalaj/taşıma seviyesini uyumsuzluk sayma; 480 adedin 12 sandığa dağıtılması tutarlıdır.
- CMR, konşimento, AWB veya taşıma belgesi eksikliği yalnızca ilgili deterministik belge-varlığı kuralı eksik belge göstermişse ya da dosya metni açıkça bu belgenin beklendiğini söylüyorsa bulgu olabilir.
- Yükleme talimatı eksikliği yalnızca PRES-006 veya EXP-005 non-pass ise Incoterm/operasyon bulgusu olabilir.
- CROSS-003 Incoterm uyumu PASS ise "DAP" ile "DAP Warszawa, Poland" gibi kod ve kod+teslim yeri ifadelerini uyumsuzluk sayma.
- A.TR, EUR.1, tercihli menşe veya preferential origin uyarısı yalnızca tercihli rejim, tariff_preference=true, A.TR/EUR.1 metni veya açık tercihli tarife talebi varsa üretilebilir.
- Dosya setinde beyanname yoksa ve deterministik belge-varlığı/kıymet/rejim kuralı bunu non-pass olarak işaretlemediyse, yalnızca beyanname eksik diye REGIME_CHOICE veya VALUATION bulgusu üretme.
- 870829909000 / 8708 / 870829 otobüs gövde aksamı veya aksesuarı bağlamında makul aday olabilir; nihai teyit için teknik çizim, malzeme, işlev, montaj yeri ve parçanın gövde bileşeni mi HVAC/mekanik parça mı olduğunu gösteren kanıt iste.
- Aynı GTİP teknik belirsizliğini GTİP_PLAUSIBILITY ve PERMIT_PRODUCT_CONTROL olarak iki ayrı uyarıya bölme; mümkünse tek GTİP teknik teyit bulgusunda birleştir.
`.trim()

export type ExpertReviewSafetyFinding = {
  area: string
  title: string
  explanation: string
  recommendation: string
  evidence_refs: Array<{
    docType?: string | null
    field?: string | null
    value?: string | null
  }>
}

export type ExpertReviewSafetyRuleResult = {
  ruleCode: string
  result: string
  message?: string | null
  sourceRefsJson?: unknown
}

export type ExpertReviewSafetyDocument = {
  docType: string
  data: Record<string, unknown>
}

export function applyExpertReviewSafetyFilters<T extends ExpertReviewSafetyFinding>(
  review: { overallRisk: string; summary: string; findings: T[] },
  context: {
    documents: ExpertReviewSafetyDocument[]
    ruleResults: ExpertReviewSafetyRuleResult[]
  },
): { overallRisk: string; summary: string; findings: T[] } {
  const hasGtipPlausibility = review.findings.some((finding) => finding.area === 'GTIP_PLAUSIBILITY')
  const findings = review.findings.filter((finding) => {
    if (shouldDropPackageCountFinding(finding, context.ruleResults)) return false
    if (shouldDropPassedIncotermCompatibilityFinding(finding, context.ruleResults)) return false
    if (shouldDropMissingLoadingInstructionFinding(finding, context.ruleResults)) return false
    if (shouldDropMissingTransportFinding(finding, context.ruleResults)) return false
    if (shouldDropPreferentialOriginFinding(finding, context)) return false
    if (shouldDropMissingDeclarationScopeFinding(finding, context)) return false
    if (shouldDropDuplicatePermitFinding(finding, hasGtipPlausibility)) return false
    return true
  })
  const dedupedFindings = dedupeGtipPlausibilityFindings(findings)

  const changed = dedupedFindings.length !== review.findings.length
  const summary = changed ? buildSafetyFilteredSummary(dedupedFindings) : review.summary
  return {
    overallRisk: normalizeOverallRisk(review.overallRisk, dedupedFindings, context.ruleResults),
    summary,
    findings: dedupedFindings,
  }
}

function shouldDropPackageCountFinding(
  finding: ExpertReviewSafetyFinding,
  ruleResults: ExpertReviewSafetyRuleResult[],
): boolean {
  if (finding.area !== 'DOCUMENT_CONSISTENCY') return false
  if (
    !hasPassedRule(ruleResults, 'CROSS-008') &&
    !hasPassedRule(ruleResults, 'PL-001') &&
    !(hasPassedRule(ruleResults, 'CROSS-004') && hasPassedRule(ruleResults, 'PL-001'))
  ) return false
  if (!mentions(finding, /(kap|paket|package|ambalaj|pallet|palet|box|sand[ıi]k)/i)) return false
  return finding.evidence_refs.length > 0 && finding.evidence_refs.every((ref) => {
    const field = normalize(ref.field)
    const value = normalize(ref.value)
    return field.includes('package') ||
      field.includes('paket') ||
      field.includes('kap') ||
      /(wooden|box|pallet|palet|package|paket|kap|sandik|\d+)/.test(value)
  })
}

function shouldDropPassedIncotermCompatibilityFinding(
  finding: ExpertReviewSafetyFinding,
  ruleResults: ExpertReviewSafetyRuleResult[],
): boolean {
  if (finding.area !== 'INCOTERM') return false
  if (!hasPassedRule(ruleResults, 'CROSS-003')) return false
  if (!mentions(finding, /(incoterm|teslim|delivery|dap)/i)) return false
  return mentions(finding, /(dap|warszawa|poland|teslim yeri|delivery place|tam e[şs]le[şs]miyor|da[ğg][ıi]n[ıi]k)/i)
}

function shouldDropMissingLoadingInstructionFinding(
  finding: ExpertReviewSafetyFinding,
  ruleResults: ExpertReviewSafetyRuleResult[],
): boolean {
  if (finding.area !== 'INCOTERM') return false
  if (!mentions(finding, /(y[üu]kleme talimat[ıi]|loading instruction|sevk organizasyonu|sevk ak[ıi][şs][ıi]|teslim sorumlulu[ğg]u)/i)) {
    return false
  }
  return !hasNonPassRule(ruleResults, 'PRES-006') && !hasNonPassRule(ruleResults, 'EXP-005')
}

function shouldDropMissingTransportFinding(
  finding: ExpertReviewSafetyFinding,
  ruleResults: ExpertReviewSafetyRuleResult[],
): boolean {
  if (finding.area !== 'INCOTERM') return false
  if (!mentions(finding, /(cmr|kon[şs]imento|ta[şs][ıi]ma belgesi|transport document|bill of lading|awb)/i)) {
    return false
  }
  return !hasNonPassRule(ruleResults, 'PRES-003')
}

function shouldDropPreferentialOriginFinding(
  finding: ExpertReviewSafetyFinding,
  context: {
    documents: ExpertReviewSafetyDocument[]
    ruleResults: ExpertReviewSafetyRuleResult[]
  },
): boolean {
  if (finding.area !== 'ORIGIN_PREFERENTIAL') return false
  if (hasNonPassRule(context.ruleResults, 'PRES-004')) return false
  return !hasPreferentialSignal(context.documents)
}

function shouldDropMissingDeclarationScopeFinding(
  finding: ExpertReviewSafetyFinding,
  context: {
    documents: ExpertReviewSafetyDocument[]
    ruleResults: ExpertReviewSafetyRuleResult[]
  },
): boolean {
  if (finding.area !== 'REGIME_CHOICE' && finding.area !== 'VALUATION') return false
  if (context.documents.some((document) => document.docType === 'DECLARATION_OUTPUT')) return false
  if (!mentions(finding, /(beyanname|declaration|g[üu]mr[üu]k k[ıi]ymeti|customs value|rejim|regime)/i)) {
    return false
  }
  if (!mentions(finding, /(eksik|yok|bulunmuyor|sunulmam[ıi][şs]|missing|not provided|no declaration|absent)/i)) {
    return false
  }
  return !hasAnyNonPassRule(context.ruleResults, [
    'PRES-005',
    'DECL-001',
    'DECL-002',
    'DECL-003',
    'DECL-004',
    'DECL-005',
    'CROSS-001',
    'CROSS-007',
    'CROSS-008',
    'EXP-003',
  ])
}

function shouldDropDuplicatePermitFinding(
  finding: ExpertReviewSafetyFinding,
  hasGtipPlausibility: boolean,
): boolean {
  if (!hasGtipPlausibility || finding.area !== 'PERMIT_PRODUCT_CONTROL') return false
  return mentions(finding, /(hvac|ventilation|havaland[ıi]rma|hava kanal[ıi]|8708|870829|teknik|technical)/i)
}

function dedupeGtipPlausibilityFindings<T extends ExpertReviewSafetyFinding>(findings: T[]): T[] {
  let sawGtipPlausibility = false
  return findings.filter((finding) => {
    if (finding.area !== 'GTIP_PLAUSIBILITY') return true
    if (sawGtipPlausibility) return false
    sawGtipPlausibility = true
    return true
  })
}

function normalizeOverallRisk(
  original: string,
  findings: ExpertReviewSafetyFinding[],
  ruleResults: ExpertReviewSafetyRuleResult[],
): string {
  if (ruleResults.some((result) => result.result === 'FAIL')) return original
  if (findings.length === 0) return 'LOW'
  const onlyGtipTechnicalReview = findings.every((finding) => finding.area === 'GTIP_PLAUSIBILITY')
  if (onlyGtipTechnicalReview) return 'LOW'
  return original === 'HIGH' ? 'MEDIUM' : original
}

function buildSafetyFilteredSummary(findings: ExpertReviewSafetyFinding[]): string {
  if (findings.length === 0) {
    return 'Uzman İncelemesi deterministik kontroller dışında ek risk bulgusu üretmedi.'
  }
  if (findings.length === 1 && findings[0]?.area === 'GTIP_PLAUSIBILITY') {
    return 'Uzman İncelemesi yalnızca GTİP sınıflandırması için teknik teyit gerektiğini belirtiyor; ek belge uyumsuzluğu bulgusu yok.'
  }
  const titles = findings.map((finding) => finding.title).slice(0, 3).join(', ')
  return `Uzman İncelemesi kalan yorum konularını işaretledi: ${titles}.`
}

function hasPassedRule(ruleResults: ExpertReviewSafetyRuleResult[], ruleCode: string): boolean {
  return ruleResults.some((result) => result.ruleCode === ruleCode && result.result === 'PASS')
}

function hasNonPassRule(ruleResults: ExpertReviewSafetyRuleResult[], ruleCode: string): boolean {
  return ruleResults.some(
    (result) => result.ruleCode === ruleCode && result.result !== 'PASS' && result.result !== 'SKIP',
  )
}

function hasAnyNonPassRule(ruleResults: ExpertReviewSafetyRuleResult[], ruleCodes: string[]): boolean {
  return ruleCodes.some((ruleCode) => hasNonPassRule(ruleResults, ruleCode))
}

function hasPreferentialSignal(documents: ExpertReviewSafetyDocument[]): boolean {
  const text = normalize(JSON.stringify(documents.map((document) => document.data)))
  return /tariff_preference"?\s*:\s*true|a\.?\s*t\.?\s*r|eur\.?\s*1|preferential|tercihli|mense ispat|dolasim belgesi/.test(text)
}

function mentions(finding: ExpertReviewSafetyFinding, pattern: RegExp): boolean {
  const evidence = finding.evidence_refs
    .map((ref) => `${ref.docType ?? ''} ${ref.field ?? ''} ${ref.value ?? ''}`)
    .join(' ')
  return pattern.test(`${finding.title} ${finding.explanation} ${finding.recommendation} ${evidence}`)
}

function normalize(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[İIı]/g, 'i')
    .toLowerCase()
}
