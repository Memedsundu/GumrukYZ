export const AI_RULE_VALIDATION_SAFETY_GUARDRAILS = `
- Farklı ambalaj seviyelerini toplama: "5 wooden boxes / 2 pallets" değeri 7 kap anlamına gelmez.
- Aynı kural "8 wooden boxes / 2 pallets" için de geçerlidir: kap sayısı 8'dir, 10 değildir.
- Paletler çeki listesinde ayrı paket satırı olarak listelenmiş ve Total/TOPLAM paket sayısına dahil edilmişse bu açık toplam esas alınır; "6 wooden box + 3 pallet = 9 KAP" beyanname 9 KAP ile uyumludur.
- "480 pcs/adet" ürün adedi ile "12 wooden boxes / 3 pallets" ambalaj/taşıma seviyesi farklıdır; CROSS-004 ve PL-001 PASS ise bunu miktar/kap uyuşmazlığı sayma.
- CROSS-008 veya PL-001 PASS ise paket/kap sayısı için POTENTIAL_FALSE_NEGATIVE üretme; aynı alan ve aynı birimde açık çelişki gerekir.
- CROSS-004 PASS ise fatura ürün adedi ile çeki listesi Quantity Inside/Total Quantity değeri uzlaşmıştır; aynı bulguda paket sayısıyla yeniden karşılaştırma yapma.
- Deterministik kural PASS ise yalnızca açık, aynı alan ve aynı birim kanıtı varsa POTENTIAL_FALSE_NEGATIVE üret.
- Incoterm kodu ile teslim yeri birlikte yazılabilir: "DAP" ile "DAP Warszawa, Poland" uyumludur.
- PRES-006 PASS ve yapılandırılmış yükleme talimatı alanları mevcutsa, yalnızca _native_text_length=0 veya ilk metin okuma sinyaline dayanarak "yükleme talimatı içeriği doğrulanamadı" bulgusu üretme.
- EXP-004 REVIEW_NEEDED ve kanıt ":"/boş menşe ise sonuç muhtemelen doğrudur; bunu sahtecilik veya tercihli menşe belgesi eksikliği olarak genişletme.
- QUAL-002 veya OCR-001 non-pass ise belge türü/kalitesi zaten deterministik olarak yakalanmıştır; aynı sorunu ikinci bir advisory olarak tekrarlama.
`.trim()

export type AiRuleValidationSafetyItem = {
  rule_result_id: string
  status: string
  confidence: number
  explanation: string
  recommendation: string
  evidence_refs: Array<{
    docType?: string | null
    field?: string | null
    value?: string | null
  }>
}

export type AiRuleValidationSafetyRuleResult = {
  id: string
  ruleCode: string
  result: string
  message?: string | null
}

export function applyAiRuleValidationSafetyFilters<T extends AiRuleValidationSafetyItem>(
  validations: T[],
  ruleResults: AiRuleValidationSafetyRuleResult[],
): T[] {
  const byId = new Map(ruleResults.map((ruleResult) => [ruleResult.id, ruleResult]))
  return validations.filter((validation) => {
    if (shouldDropPackageCountAdvisory(validation, ruleResults, byId)) return false
    if (shouldDropPassedIncotermAdvisory(validation, ruleResults, byId)) return false
    if (shouldDropUnverifiedLoadingInstructionAdvisory(validation, ruleResults, byId)) return false
    if (shouldDropDocumentQualityDuplicateAdvisory(validation, byId)) return false
    return true
  })
}

function shouldDropPackageCountAdvisory(
  validation: AiRuleValidationSafetyItem,
  ruleResults: AiRuleValidationSafetyRuleResult[],
  byId: Map<string, AiRuleValidationSafetyRuleResult>,
): boolean {
  if (validation.status === 'LIKELY_CORRECT') return false
  if (
    !hasPassedRule(ruleResults, 'CROSS-008') &&
    !hasPassedRule(ruleResults, 'PL-001') &&
    !(hasPassedRule(ruleResults, 'CROSS-004') && hasPassedRule(ruleResults, 'PL-001'))
  ) return false
  if (!mentions(validation, /(kap|paket|package|ambalaj|pallet|palet|box|sand[ıi]k)/i)) return false

  const rule = byId.get(validation.rule_result_id)
  const isPassedRuleAdvisory = rule?.result === 'PASS'
  const evidenceIsPackageOnly = validation.evidence_refs.length > 0 &&
    validation.evidence_refs.every((ref) => {
      const field = normalize(ref.field)
      const value = normalize(ref.value)
      return field.includes('package') ||
        field.includes('paket') ||
        field.includes('kap') ||
        /(wooden|box|pallet|palet|package|paket|kap|sandik|\d+)/.test(value)
    })

  return isPassedRuleAdvisory || evidenceIsPackageOnly
}

function shouldDropPassedIncotermAdvisory(
  validation: AiRuleValidationSafetyItem,
  ruleResults: AiRuleValidationSafetyRuleResult[],
  byId: Map<string, AiRuleValidationSafetyRuleResult>,
): boolean {
  if (validation.status === 'LIKELY_CORRECT') return false
  if (!hasPassedRule(ruleResults, 'CROSS-003')) return false
  const rule = byId.get(validation.rule_result_id)
  if (rule?.result !== 'PASS' && rule?.ruleCode !== 'CROSS-003') return false
  if (!mentions(validation, /(incoterm|teslim|dap|delivery)/i)) return false
  return mentions(validation, /(dap|warszawa|poland|teslim yeri|delivery place)/i)
}

function shouldDropUnverifiedLoadingInstructionAdvisory(
  validation: AiRuleValidationSafetyItem,
  ruleResults: AiRuleValidationSafetyRuleResult[],
  byId: Map<string, AiRuleValidationSafetyRuleResult>,
): boolean {
  if (validation.status === 'LIKELY_CORRECT') return false
  if (!hasPassedRule(ruleResults, 'PRES-006')) return false

  const rule = byId.get(validation.rule_result_id)
  if (rule?.result !== 'PASS' && rule?.ruleCode !== 'PRES-006') return false
  if (!mentions(validation, /(yükleme talimat[ıi]|loading instruction|unverified|do[ğg]rulanamad[ıi]|native text)/i)) {
    return false
  }

  return validation.evidence_refs.length > 0 &&
    validation.evidence_refs.every((ref) => {
      const field = normalize(ref.field)
      return field === '_native_text_length' ||
        field === '_native_text_confidence' ||
        field === '_final_extraction_confidence' ||
        field === '_extraction_method'
    })
}

function shouldDropDocumentQualityDuplicateAdvisory(
  validation: AiRuleValidationSafetyItem,
  byId: Map<string, AiRuleValidationSafetyRuleResult>,
): boolean {
  if (validation.status === 'LIKELY_CORRECT') return false
  const rule = byId.get(validation.rule_result_id)
  if (!rule || rule.result === 'PASS' || rule.result === 'SKIP') return false
  if (rule.ruleCode !== 'QUAL-002' && rule.ruleCode !== 'OCR-001') return false
  return mentions(validation, /(belge t[üu]r[üu]|document type|filename|dosya ad[ıi]|ocr|tarama|scan|raster|d[üu][şs][üu]k kalite|low quality)/i)
}

function hasPassedRule(ruleResults: AiRuleValidationSafetyRuleResult[], ruleCode: string): boolean {
  return ruleResults.some((ruleResult) => ruleResult.ruleCode === ruleCode && ruleResult.result === 'PASS')
}

function mentions(validation: AiRuleValidationSafetyItem, pattern: RegExp): boolean {
  const evidence = validation.evidence_refs
    .map((ref) => `${ref.field ?? ''} ${ref.value ?? ''}`)
    .join(' ')
  return pattern.test(`${validation.explanation} ${validation.recommendation} ${evidence}`)
}

function normalize(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[İIı]/g, 'i')
    .toLowerCase()
}
