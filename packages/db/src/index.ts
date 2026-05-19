export { prisma } from './client.js'
export { PrismaClient, Prisma } from '@prisma/client'
export { searchRegulations } from './vector-search.js'
export type { RegulationCitation } from './vector-search.js'
export type {
  Tenant,
  User,
  Submission,
  Document,
  DocumentVersion,
  DocumentExtraction,
  DeclarationSnapshot,
  DeclarationItem,
  SourceDocument,
  CandidateRule,
  Rule,
  RuleResult,
  RiskReport,
  OverrideAction,
  AuditLog,
  ProviderRun,
  ProcessingJob,
  RegulationChunk,
  BrokerClient,
  DocumentClassificationSuggestion,
  RuleLegalCitation,
  RuleResultCitation,
  AiRuleValidation,
  ExpertReview,
  ExpertReviewFinding,
  ExpertReviewFindingCitation,
} from '@prisma/client'
