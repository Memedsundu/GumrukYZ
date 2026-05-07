import type { RuleDefinition, SubmissionContext, RuleEvaluationResult } from './types.js'
import { logger } from '@gumrukyz/shared'

export class RuleEvaluator {
  constructor(private readonly rules: RuleDefinition[]) {}

  evaluate(ctx: SubmissionContext): RuleEvaluationResult[] {
    const results: RuleEvaluationResult[] = []

    for (const rule of this.rules) {
      try {
        const result = rule.evaluate(ctx)
        if (result !== null) {
          results.push(result)
        }
      } catch (err) {
        logger.error('Rule evaluation error', {
          ruleCode: rule.code,
          submissionId: ctx.submissionId,
          error: err instanceof Error ? err.message : String(err),
        })
        results.push({
          ruleCode: rule.code,
          severity: rule.severity,
          result: 'SKIP',
          message: `Rule evaluation failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
          sourceRefs: [],
        })
      }
    }

    return results
  }
}
