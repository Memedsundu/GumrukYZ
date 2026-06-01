import { readFileSync } from 'fs'
import { join } from 'path'

const root = process.cwd()

function read(path) {
  return readFileSync(join(root, path), 'utf8')
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

const auth = read('apps/web/src/lib/auth.ts')
assert(auth.includes('currentUser'), 'auth.ts must read Clerk user email for broker self-provisioning')
assert(auth.includes("role: 'TENANT_USER'"), 'Self-provisioned users must be non-admin tenant users')
assert(!auth.includes("role: 'PLATFORM_ADMIN'"), 'auth.ts must not first-login provision platform admins')
assert(auth.includes("'Gümrük müşaviri'"), 'Tenant users must be displayed as customs brokers')

const dashboardLayout = read('apps/web/src/app/(dashboard)/layout.tsx')
assert(dashboardLayout.includes('canManageTenant(user)'), 'Dashboard admin nav must be role-gated')
assert(dashboardLayout.includes('/profile'), 'Dashboard layout must link to profile')

const newSubmissionPage = read('apps/web/src/app/(dashboard)/submissions/new/page.tsx')
assert(!newSubmissionPage.includes('DATA_CLASSIFICATION_OPTIONS'), 'New submission page must not show data classification options')
assert(!newSubmissionPage.includes('Belgeleri yükleyin; sistem belge türünü ve ithalat/ihracat yönünü otomatik önerecek.'), 'Auto-classification guidance must move off the new submission page')
assert(newSubmissionPage.includes("JSON.stringify({ title })"), 'New submission page must submit only title')

const submissionsRoute = read('apps/web/src/app/api/submissions/route.ts')
assert(submissionsRoute.includes("const DEFAULT_DATA_CLASSIFICATION = 'REAL'"), 'Submission API must default new files to REAL server-side')
assert(submissionsRoute.includes('strict()'), 'Submission API must not accept user-facing classification fields')

const uploadClient = read('apps/web/src/app/(dashboard)/submissions/[id]/documents/upload-client.tsx')
assert(uploadClient.includes('Belgeleri yükleyin; sistem belge türünü ve ithalat/ihracat yönünü otomatik önerecek.'), 'Upload step must show auto-classification guidance')
assert(uploadClient.includes('ProgressBar'), 'Upload/process screen must show a processing progress bar')

const processRoute = read('apps/web/src/app/api/submissions/[id]/process/route.ts')
assert(processRoute.includes('tx.submission.updateMany'), 'Process route must claim submissions atomically')
assert(processRoute.includes("status: { in: PROCESSABLE_STATUSES }"), 'Process route must restrict claimable statuses')
assert(processRoute.includes('tx.processingJob.create'), 'Process route must create the job inside the claim transaction')

const processing = read('apps/web/src/lib/processing.ts')
assert(processing.includes('processSubmission.lock_missing'), 'Pipeline must refuse to run without an active job lock')
assert(processing.includes('clearGeneratedArtifacts'), 'Pipeline cleanup guard must remain present')
assert(!processing.includes("from './expert-review'"), 'Processing pipeline must not run expensive expert review automatically')
assert(processing.includes("from './ai-rule-validation'"), 'Processing pipeline must keep fast AI rule validation')
assert(processing.includes('sanitizePlaceholderValues'), 'Processing must sanitize placeholder extracted values before rules run')
assert(processing.includes('hasExplicitNetWeightEvidence'), 'Processing must drop inferred net weights without source evidence')

const openAiDocumentReader = read('apps/web/src/lib/openai-document-reader.ts')
assert(openAiDocumentReader.includes('Do not infer net_weight'), 'Document reader prompt must forbid inferred net_weight values')

const crossDocumentRules = read('packages/rules/src/rules/cross-document.ts')
assert(crossDocumentRules.includes('woodenbox'), 'CROSS-004 must recognize wooden box/package labels as package units')

const declarationRules = read('packages/rules/src/rules/declaration.ts')
assert(declarationRules.includes("ctx.tradeFlow === 'EXPORT'"), 'DECL-002 must not duplicate export-origin warnings')

const exportRules = read('packages/rules/src/rules/export.ts')
assert(exportRules.includes('normalizeCountryCode'), 'EXP-004 must validate export origin values')

const migration = read('packages/db/prisma/migrations/20260519100000_processing_job_active_lock/migration.sql')
assert(migration.includes('CREATE UNIQUE INDEX "processing_jobs_one_active_per_submission"'), 'Active job lock migration is missing')
assert(migration.includes("WHERE \"status\" IN"), 'Active job lock must be a partial unique index')

const realDataMigration = read('packages/db/prisma/migrations/20260519103000_allow_real_demo_submissions/migration.sql')
assert(realDataMigration.includes("'REAL' = ANY"), 'Demo REAL data migration must be idempotent')

const seed = read('packages/db/src/seed.ts')
assert(seed.includes('REGULATION_SOURCE_MANIFEST'), 'Seed must use the regulation source manifest')
assert(seed.includes('INTERNAL_ADMIN_CLERK_USER_ID'), 'Seed must provision admin only from explicit env')
assert(seed.includes('DataClassification.REAL'), 'Seed must allow REAL files for the internal/demo tenant')

const bootstrap = read('packages/db/src/bootstrap-regulations.ts')
assert(bootstrap.includes('REGULATION_SOURCE_MANIFEST'), 'Bootstrap must use regulation source manifest')
assert(bootstrap.includes('REGULATION_CORPUS'), 'Bootstrap must use fallback corpus chunks')
assert(bootstrap.includes('OPENAI_API_KEY'), 'Bootstrap must embed chunks when OPENAI_API_KEY is set')

const schema = read('packages/db/prisma/schema.prisma')
assert(schema.includes('expertReviewLimit'), 'Tenant schema must include expert review limit')
assert(schema.includes('expertReviewUsed'), 'Tenant schema must include expert review used counter')
assert(schema.includes('expertReviewUsedOn'), 'Tenant schema must track the daily expert review quota date')

const quotaMigration = read('packages/db/prisma/migrations/20260519150000_expert_review_quota/migration.sql')
assert(quotaMigration.includes('"expert_review_limit"'), 'Expert review quota migration must add limit column')
assert(quotaMigration.includes('"expert_review_used"'), 'Expert review quota migration must add used column')
assert(quotaMigration.includes('expert_reviews_one_running_per_submission'), 'Expert review migration must guard parallel running reviews')

const quotaHelper = read('apps/web/src/lib/expert-review-quota.ts')
assert(quotaHelper.includes('"expert_review_used" < "expert_review_limit"'), 'Expert review quota reservation must be atomic')
assert(quotaHelper.includes('ExpertReviewQuotaExhaustedError'), 'Expert review quota exhaustion must be explicit')
assert(quotaHelper.includes('expert_review_used_on'), 'Expert review quota must reset by usage date')
assert(quotaHelper.includes("period: 'DAILY'"), 'Expert review quota must be exposed as a daily quota')
assert(quotaHelper.includes('forceNew'), 'Expert review quota reservation must support intentional refreshes')

const dailyQuotaMigration = read('packages/db/prisma/migrations/20260601120000_daily_expert_review_quota/migration.sql')
assert(dailyQuotaMigration.includes('"expert_review_used_on"'), 'Daily quota migration must add usage date column')

const expertReviewRoute = read('apps/web/src/app/api/submissions/[id]/expert-review/route.ts')
assert(expertReviewRoute.includes('reserveExpertReviewSlot'), 'Manual expert review API must reserve quota')
assert(expertReviewRoute.includes('refundExpertReviewSlot'), 'Manual expert review API must refund quota on skipped/failed runs')
assert(expertReviewRoute.includes('{ status: 429 }'), 'Manual expert review API must return 429 when quota is exhausted')
assert(expertReviewRoute.includes("input.status !== 'COMPLETED'"), 'Manual expert review API must require completed processing')
assert(expertReviewRoute.includes('body.force === true'), 'Manual expert review API must support explicit refresh requests')

const statusRoute = read('apps/web/src/app/api/submissions/[id]/status/route.ts')
assert(statusRoute.includes('progressPercent'), 'Status API must expose progressPercent')
assert(statusRoute.includes('progressLabel'), 'Status API must expose progressLabel')
assert(statusRoute.includes('progressDescription'), 'Status API must expose progressDescription')

const betaPage = read('apps/web/src/app/beta/page.tsx')
assert(betaPage.includes('Beta kullanıma başla'), 'Beta page must provide a self-service start link')
assert(betaPage.includes('/sign-up'), 'Beta page must send new users to sign-up')

const onboardingPage = read('apps/web/src/app/(auth)/onboarding/page.tsx')
assert(!onboardingPage.includes('davetiyesi'), 'Onboarding copy must not be invite-only')

const expertReview = read('apps/web/src/lib/expert-review.ts')
assert(expertReview.includes('gtip_candidates'), 'Expert review schema must support concrete GTIP candidate suggestions')
assert(expertReview.includes('8708/870829'), 'Expert review prompt must ask for 8708/870829 candidate handling')
for (const requiredSource of [
  '4458 Sayılı Gümrük Kanunu',
  'Gümrük Yönetmeliği',
  'Türk Gümrük Tarife Cetveli',
  'Türkiye Ürün Kuralları Veri Tabanı - Sektörel Mevzuat',
  'GTİP Arama Motoru',
  'WCO HS Nomenclature 2022',
]) {
  assert(expertReview.includes(requiredSource), `Expert review required source missing: ${requiredSource}`)
}

const packageJson = read('package.json')
assert(packageJson.includes('db:bootstrap-regulations'), 'Root bootstrap-regulations script is missing')

const reportData = read('apps/web/src/lib/report-data.ts')
assert(reportData.includes('expertIncluded'), 'Report payload must expose whether expert review is integrated')
assert(reportData.includes('AI-UZMAN'), 'Report action summary must include expert review items')

const reportPdf = read('apps/web/src/lib/report-pdf.tsx')
assert(reportPdf.includes('createRequire'), 'Report PDF renderer must resolve font files through package resolution')
assert(reportPdf.includes('import React'), 'Report PDF renderer must import React for server-side JSX execution')

const regulationManifest = read('packages/db/src/regulation-source-manifest.ts')
assert(regulationManifest.includes('8708.29'), 'Regulation manifest must include targeted 8708.29 legal context')

read('fixtures/sample-export-package-vs-item/extraction.json')
read('fixtures/export-origin-placeholder/extraction.json')
read('fixtures/gross-only-no-net-weight/extraction.json')

console.log('Urgent fix invariants verified.')
