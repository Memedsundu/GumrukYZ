export type { RuleDefinition, RuleEvaluationResult, SubmissionContext, ExtractionData, DeclarationSnapshotData } from './types.js'
export { RuleEvaluator } from './evaluator.js'

// Rule implementations
export { PRES_001, PRES_002 } from './rules/presence.js'
export { INV_001, INV_002, INV_003, INV_004, INV_005, INV_006 } from './rules/invoice.js'
export { PL_001, PL_002 } from './rules/packing-list.js'
export { GTIP_001 } from './rules/gtip.js'
export { CROSS_001, CROSS_002, CROSS_003, CROSS_004, CROSS_005 } from './rules/cross-document.js'

import type { RuleDefinition } from './types.js'
import { PRES_001, PRES_002 } from './rules/presence.js'
import { INV_001, INV_002, INV_003, INV_004, INV_005, INV_006 } from './rules/invoice.js'
import { PL_001, PL_002 } from './rules/packing-list.js'
import { GTIP_001 } from './rules/gtip.js'
import { CROSS_001, CROSS_002, CROSS_003, CROSS_004, CROSS_005 } from './rules/cross-document.js'

export const ALL_RULES: RuleDefinition[] = [
  // Presence
  PRES_001,
  PRES_002,
  // Invoice mandatory fields
  INV_001,
  INV_002,
  INV_003,
  INV_004,
  INV_005,
  INV_006,
  // Packing list
  PL_001,
  PL_002,
  // GTİP
  GTIP_001,
  // Cross-document
  CROSS_001,
  CROSS_002,
  CROSS_003,
  CROSS_004,
  CROSS_005,
]
