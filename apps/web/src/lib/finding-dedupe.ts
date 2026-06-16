export type DedupeRuleResult = {
  ruleCode: string
  result: string
}

export type DedupeExpertFinding = {
  area: string
  title: string
  explanation: string
  recommendation: string
}

export function filterExpertFindingsAgainstRules<T extends DedupeExpertFinding>(
  findings: T[],
  ruleResults: DedupeRuleResult[],
): T[] {
  const deterministicKeys = new Set(
    ruleResults
      .filter((result) => result.result !== 'PASS' && result.result !== 'SKIP')
      .map((result) => issueKeyForRuleCode(result.ruleCode))
      .filter((key): key is string => Boolean(key)),
  )

  if (deterministicKeys.size === 0) return findings
  return findings.filter((finding) => {
    const key = issueKeyForExpertFinding(finding)
    return !key || !deterministicKeys.has(key)
  })
}

export function issueKeyForRuleCode(ruleCode: string): string | null {
  if (ruleCode === 'QUAL-001' || ruleCode === 'OCR-001') return 'document_quality:ocr'
  if (ruleCode === 'QUAL-002') return 'document_quality:filename_type'
  if (ruleCode === 'QUAL-003') return 'document_quality:duplicate'
  if (ruleCode === 'PL-001' || ruleCode === 'CROSS-008') return 'packing:package_count'
  if (ruleCode === 'PL-002' || ruleCode === 'CROSS-002' || ruleCode === 'CROSS-006') return 'packing:weight'
  if (ruleCode === 'CROSS-004') return 'quantity'
  if (ruleCode === 'CROSS-001' || ruleCode.startsWith('VAL-')) return 'value'
  if (ruleCode === 'INV-006' || ruleCode === 'CROSS-003') return 'incoterm'
  if (ruleCode === 'EXP-004' || ruleCode === 'DECL-002' || ruleCode.startsWith('COO-')) return 'origin'
  if (ruleCode === 'DECL-001' || ruleCode === 'EXP-003') return 'regime'
  if (ruleCode === 'EXP-006') return 'free_of_charge'
  if (ruleCode.startsWith('GTIP-')) return 'gtip'
  if (ruleCode.startsWith('PRES-') || ruleCode === 'EXP-005') return 'missing_document'
  if (ruleCode === 'CROSS-009') return 'trade_flow'
  return null
}

export function issueKeyForExpertFinding(finding: DedupeExpertFinding): string | null {
  const text = normalize(`${finding.area} ${finding.title} ${finding.explanation} ${finding.recommendation}`)

  if (/(bedelsiz|f\.?\s*o\.?\s*c\.?|free of charge)/.test(text)) return 'free_of_charge'
  if (finding.area === 'GTIP_PLAUSIBILITY' || finding.area === 'PERMIT_PRODUCT_CONTROL') return 'gtip'
  if (finding.area === 'VALUATION') return 'value'
  if (finding.area === 'ORIGIN_PREFERENTIAL') return 'origin'
  if (finding.area === 'INCOTERM') return 'incoterm'
  if (finding.area === 'REGIME_CHOICE') return 'regime'

  if (finding.area === 'DOCUMENT_QUALITY') {
    if (/(dosya adi|filename|belge tur|doc type|document type|yanlis belge|wrong document|classification)/.test(text)) {
      return 'document_quality:filename_type'
    }
    if (/(ocr|tarama|raster|scan|scanned|dusuk kalite|low quality|native text|okuma kalitesi)/.test(text)) {
      return 'document_quality:ocr'
    }
    return 'document_quality'
  }

  if (finding.area === 'DOCUMENT_CONSISTENCY') {
    if (/(dosya adi|filename|belge tur|doc type|document type|yanlis belge|wrong document|classification)/.test(text)) {
      return 'document_quality:filename_type'
    }
    if (/(ocr|tarama|raster|scan|scanned|dusuk kalite|low quality|native text|okuma kalitesi)/.test(text)) {
      return 'document_quality:ocr'
    }
    if (/(kap|package|paket|ambalaj|pallet|palet|box|sandik)/.test(text)) return 'packing:package_count'
    if (/(agirlik|weight|net|brut|gross)/.test(text)) return 'packing:weight'
    if (/(miktar|quantity|adet|pcs)/.test(text)) return 'quantity'
    return 'document_consistency'
  }

  return null
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[İIı]/g, 'i')
    .toLowerCase()
}
