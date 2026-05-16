// Document types supported by the system
export const DocumentType = {
  UNCLASSIFIED: 'UNCLASSIFIED',
  INVOICE: 'INVOICE',
  PACKING_LIST: 'PACKING_LIST',
  LOADING_INSTRUCTION: 'LOADING_INSTRUCTION',
  // Transport documents
  TRANSPORT_DOC: 'TRANSPORT_DOC',         // generic transport document
  BILL_OF_LADING: 'BILL_OF_LADING',       // maritime B/L (konşimento)
  AIRWAY_BILL: 'AIRWAY_BILL',             // air freight AWB
  // Declaration & tariff
  DECLARATION_OUTPUT: 'DECLARATION_OUTPUT',
  // Origin & certification
  ORIGIN_DOC: 'ORIGIN_DOC',              // generic origin document
  CERTIFICATE_OF_ORIGIN: 'CERTIFICATE_OF_ORIGIN', // formal A.TR / EUR.1 / Form A
  // Other
  PERMIT_DOC: 'PERMIT_DOC',
  OTHER: 'OTHER',
} as const

export type DocumentType = (typeof DocumentType)[keyof typeof DocumentType]

// Trade flow direction
export const TradeFlow = {
  UNKNOWN: 'UNKNOWN',
  IMPORT: 'IMPORT',
  EXPORT: 'EXPORT',
} as const

export type TradeFlow = (typeof TradeFlow)[keyof typeof TradeFlow]

// Submission processing states
export const SubmissionStatus = {
  PENDING: 'PENDING',
  UPLOADED: 'UPLOADED',
  CLASSIFYING: 'CLASSIFYING',
  AWAITING_VALIDATION: 'AWAITING_VALIDATION',
  EXTRACTING: 'EXTRACTING',
  NORMALIZING: 'NORMALIZING',
  RUNNING_RULES: 'RUNNING_RULES',
  GENERATING_REPORT: 'GENERATING_REPORT',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const

export type SubmissionStatus = (typeof SubmissionStatus)[keyof typeof SubmissionStatus]

// Document processing status
export const DocumentStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  DONE: 'DONE',
  FAILED: 'FAILED',
} as const

export type DocumentStatus = (typeof DocumentStatus)[keyof typeof DocumentStatus]

// Extraction status
export const ExtractionStatus = {
  PENDING: 'PENDING',
  DONE: 'DONE',
  FAILED: 'FAILED',
  LOW_CONFIDENCE: 'LOW_CONFIDENCE',
} as const

export type ExtractionStatus = (typeof ExtractionStatus)[keyof typeof ExtractionStatus]

// Extraction method
export const ExtractionMethod = {
  TEXT_PDF: 'TEXT_PDF',
  OCR_PYTHON: 'OCR_PYTHON',
  OPENAI_VISION: 'OPENAI_VISION',
  AZURE_DOC_INTEL: 'AZURE_DOC_INTEL',
} as const

export type ExtractionMethod = (typeof ExtractionMethod)[keyof typeof ExtractionMethod]

// Rule result outcomes
export const RuleResultOutcome = {
  PASS: 'PASS',
  WARN: 'WARN',
  FAIL: 'FAIL',
  SKIP: 'SKIP',
  REVIEW_NEEDED: 'REVIEW_NEEDED',
} as const

export type RuleResultOutcome = (typeof RuleResultOutcome)[keyof typeof RuleResultOutcome]

// Rule severity
export const RuleSeverity = {
  ERROR: 'ERROR',
  WARNING: 'WARNING',
  INFO: 'INFO',
} as const

export type RuleSeverity = (typeof RuleSeverity)[keyof typeof RuleSeverity]

// Rule lifecycle
export const RuleLifecycle = {
  DRAFT: 'DRAFT',
  IN_REVIEW: 'IN_REVIEW',
  APPROVED: 'APPROVED',
  ACTIVE: 'ACTIVE',
  DEPRECATED: 'DEPRECATED',
} as const

export type RuleLifecycle = (typeof RuleLifecycle)[keyof typeof RuleLifecycle]

// Candidate rule status
export const CandidateRuleStatus = {
  DRAFT: 'DRAFT',
  IN_REVIEW: 'IN_REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const

export type CandidateRuleStatus = (typeof CandidateRuleStatus)[keyof typeof CandidateRuleStatus]

// Source document types
export const SourceType = {
  LAW: 'LAW',
  REGULATION: 'REGULATION',
  CIRCULAR: 'CIRCULAR',
  INTERNATIONAL_STANDARD: 'INTERNATIONAL_STANDARD',
} as const

export type SourceType = (typeof SourceType)[keyof typeof SourceType]

// Jurisdiction
export const Jurisdiction = {
  TR: 'TR',
  EU: 'EU',
  WCO: 'WCO',
  ICC: 'ICC',
  IMO: 'IMO',
  IATA: 'IATA',
} as const

export type Jurisdiction = (typeof Jurisdiction)[keyof typeof Jurisdiction]

// Data classification for KVKK compliance
export const DataClassification = {
  SYNTHETIC: 'SYNTHETIC',
  REDACTED: 'REDACTED',
  REAL: 'REAL',
} as const

export type DataClassification = (typeof DataClassification)[keyof typeof DataClassification]

// User roles
export const UserRole = {
  TENANT_USER: 'TENANT_USER',
  TENANT_MANAGER: 'TENANT_MANAGER',
  PLATFORM_ADMIN: 'PLATFORM_ADMIN',
} as const

export type UserRole = (typeof UserRole)[keyof typeof UserRole]

// AI provider names
export const ProviderName = {
  OPENAI: 'openai',
  ANTHROPIC: 'anthropic',
  AZURE_DOC_INTEL: 'azure_doc_intel',
  OCR_PYTHON: 'ocr_python',
} as const

export type ProviderName = (typeof ProviderName)[keyof typeof ProviderName]

// Tenant plan
export const TenantPlan = {
  INTERNAL: 'internal',
  STARTER: 'starter',
  PRO: 'pro',
} as const

export type TenantPlan = (typeof TenantPlan)[keyof typeof TenantPlan]

// Valid Incoterms 2020
export const INCOTERMS_2020 = [
  'EXW',
  'FCA',
  'CPT',
  'CIP',
  'DAP',
  'DPU',
  'DDP',
  'FAS',
  'FOB',
  'CFR',
  'CIF',
] as const

export type Incoterm = (typeof INCOTERMS_2020)[number]

export function isValidIncoterm(value: string): value is Incoterm {
  return (INCOTERMS_2020 as readonly string[]).includes(value.toUpperCase())
}

// GTİP (HS code) format: exactly 8 digits
export function isValidGtip(value: string): boolean {
  return /^\d{8}$/.test(value.trim())
}

// ISO 4217 currency codes (common subset)
export const ISO_4217_CURRENCIES = [
  'USD', 'EUR', 'TRY', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD',
  'CNY', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RUB',
  'AED', 'SAR', 'INR', 'BRL', 'MXN', 'ZAR', 'SGD', 'HKD',
] as const

export function isValidCurrency(value: string): boolean {
  return (ISO_4217_CURRENCIES as readonly string[]).includes(value.toUpperCase())
}
