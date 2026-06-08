export type {
  RuleDefinition,
  RuleEvaluationResult,
  SubmissionContext,
  ExtractionData,
  DeclarationSnapshotData,
} from './types.js'
export { RuleEvaluator } from './evaluator.js'
export {
  LOW_CONFIDENCE_THRESHOLD,
  MEDIUM_CONFIDENCE_THRESHOLD,
  EXTRACTION_FILENAME_FIELD,
  NATIVE_TEXT_CONFIDENCE_FIELD,
  NATIVE_TEXT_LENGTH_FIELD,
  FINAL_EXTRACTION_CONFIDENCE_FIELD,
  EXTRACTION_METHOD_FIELD,
  isLowConfidence,
  isExtractionEmpty,
  hasValue,
  isPlaceholderValue,
  normalizeCountryCode,
  toFiniteNumber,
} from './helpers.js'

// ── Quality / extraction sanity rules ─────────────────────────────────────────
export { QUAL_001, QUAL_002, QUAL_003, OCR_001 } from './rules/quality.js'

// ── Presence rules ────────────────────────────────────────────────────────────
export { PRES_001, PRES_002, PRES_003, PRES_004, PRES_005 } from './rules/presence.js'

// ── Invoice rules ─────────────────────────────────────────────────────────────
export { INV_001, INV_002, INV_003, INV_004, INV_005, INV_006 } from './rules/invoice.js'

// ── Packing list rules ────────────────────────────────────────────────────────
export { PL_001, PL_002 } from './rules/packing-list.js'

// ── GTİP / HS code rules ──────────────────────────────────────────────────────
export { GTIP_001, GTIP_002, GTIP_003 } from './rules/gtip.js'

// ── Cross-document consistency rules ─────────────────────────────────────────
export {
  CROSS_001,
  CROSS_002,
  CROSS_003,
  CROSS_004,
  CROSS_005,
  CROSS_006,
  CROSS_007,
  CROSS_008,
  CROSS_009,
} from './rules/cross-document.js'

// ── Declaration rules ─────────────────────────────────────────────────────────
export { DECL_001, DECL_002, DECL_003, DECL_004, DECL_005 } from './rules/declaration.js'

// ── Bill of lading rules ──────────────────────────────────────────────────────
export { BL_001, BL_002, BL_003 } from './rules/bill-of-lading.js'

// ── Certificate of origin rules ───────────────────────────────────────────────
export { COO_001, COO_002, COO_003 } from './rules/certificate-of-origin.js'

// ── Value / arithmetic rules ──────────────────────────────────────────────────
export { VAL_001, VAL_002, VAL_003 } from './rules/value.js'

// ── Export-specific rules ─────────────────────────────────────────────────────
export { EXP_001, EXP_002, EXP_003, EXP_004, EXP_005 } from './rules/export.js'

// ── Compiled registry (49 ACTIVE rules) ───────────────────────────────────────
import type { RuleDefinition } from './types.js'

import { QUAL_001, QUAL_002, QUAL_003, OCR_001 } from './rules/quality.js'
import { PRES_001, PRES_002, PRES_003, PRES_004, PRES_005 } from './rules/presence.js'
import { INV_001, INV_002, INV_003, INV_004, INV_005, INV_006 } from './rules/invoice.js'
import { PL_001, PL_002 } from './rules/packing-list.js'
import { GTIP_001, GTIP_002, GTIP_003 } from './rules/gtip.js'
import {
  CROSS_001,
  CROSS_002,
  CROSS_003,
  CROSS_004,
  CROSS_005,
  CROSS_006,
  CROSS_007,
  CROSS_008,
  CROSS_009,
} from './rules/cross-document.js'
import { DECL_001, DECL_002, DECL_003, DECL_004, DECL_005 } from './rules/declaration.js'
import { BL_001, BL_002, BL_003 } from './rules/bill-of-lading.js'
import { COO_001, COO_002, COO_003 } from './rules/certificate-of-origin.js'
import { VAL_001, VAL_002, VAL_003 } from './rules/value.js'
import { EXP_001, EXP_002, EXP_003, EXP_004, EXP_005 } from './rules/export.js'

/**
 * ALL_RULES is the canonical registry used by the rule engine. Quality rules
 * run first so the report surfaces upload/extraction issues before domain
 * rules trigger.
 */
export const ALL_RULES: RuleDefinition[] = [
  // Quality / extraction sanity (4)
  QUAL_001,
  QUAL_002,
  QUAL_003,
  OCR_001,
  // Presence (5)
  PRES_001,
  PRES_002,
  PRES_003,
  PRES_004,
  PRES_005,
  // Invoice mandatory fields (6)
  INV_001,
  INV_002,
  INV_003,
  INV_004,
  INV_005,
  INV_006,
  // Packing list (2)
  PL_001,
  PL_002,
  // GTİP / HS code (3)
  GTIP_001,
  GTIP_002,
  GTIP_003,
  // Cross-document consistency (9)
  CROSS_001,
  CROSS_002,
  CROSS_003,
  CROSS_004,
  CROSS_005,
  CROSS_006,
  CROSS_007,
  CROSS_008,
  CROSS_009,
  // Declaration (5)
  DECL_001,
  DECL_002,
  DECL_003,
  DECL_004,
  DECL_005,
  // Bill of lading (3)
  BL_001,
  BL_002,
  BL_003,
  // Certificate of origin (3)
  COO_001,
  COO_002,
  COO_003,
  // Value / arithmetic (3)
  VAL_001,
  VAL_002,
  VAL_003,
  // Export-specific (5)
  EXP_001,
  EXP_002,
  EXP_003,
  EXP_004,
  EXP_005,
]
