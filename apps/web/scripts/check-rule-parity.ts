/**
 * Rule registry parity check.
 *
 * The executable registry (ALL_RULES) is the single source of truth. This
 * script asserts that every rule code is covered by:
 *  - RULE_SEED_METADATA (DB seed input — the seed itself also throws on gaps)
 *  - RULE_METADATA (Turkish display metadata)
 *  - PASS_MESSAGES / ISSUE_MESSAGES (canned report copy), unless exempt
 * and that none of those maps contain stale codes that no longer exist.
 *
 * Run with: pnpm --filter @gumrukyz/web check:rule-parity
 */
import { ALL_RULES } from '@gumrukyz/rules'
import { RULE_SEED_METADATA } from '@gumrukyz/db/rule-seed-metadata'
import { RULE_METADATA } from '../src/lib/rule-display-metadata'
import { PASS_MESSAGES, ISSUE_MESSAGES } from '../src/lib/report-format'

/**
 * Rules intentionally absent from the canned message maps:
 * - OCR-001 renders its own rule-authored message; formatRuleResultMessage
 *   special-cases it (see report-format.ts) and provides a built-in fallback.
 */
const MESSAGE_MAP_EXEMPTIONS = new Set(['OCR-001'])

const registryCodes = new Set(ALL_RULES.map((rule) => rule.code))
const problems: string[] = []

function checkCoverage(mapName: string, map: Record<string, unknown>, exemptions: Set<string> = new Set()) {
  for (const code of registryCodes) {
    if (exemptions.has(code)) continue
    if (!(code in map)) {
      problems.push(`${mapName}: missing entry for ${code}`)
    }
  }
  for (const code of Object.keys(map)) {
    if (!registryCodes.has(code)) {
      problems.push(`${mapName}: stale entry ${code} (not in ALL_RULES)`)
    }
  }
}

checkCoverage('RULE_SEED_METADATA', RULE_SEED_METADATA)
checkCoverage('RULE_METADATA', RULE_METADATA)
checkCoverage('PASS_MESSAGES', PASS_MESSAGES, MESSAGE_MAP_EXEMPTIONS)
checkCoverage('ISSUE_MESSAGES', ISSUE_MESSAGES, MESSAGE_MAP_EXEMPTIONS)

// Duplicate codes in the registry itself would silently shadow each other.
const seen = new Set<string>()
for (const rule of ALL_RULES) {
  if (seen.has(rule.code)) problems.push(`ALL_RULES: duplicate rule code ${rule.code}`)
  seen.add(rule.code)
}

if (problems.length > 0) {
  console.error(`Rule parity check failed (${problems.length} problem${problems.length === 1 ? '' : 's'}):`)
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}

console.log(`Rule parity check passed: ${registryCodes.size} rules consistent across registry, seed metadata, display metadata and message maps.`)
