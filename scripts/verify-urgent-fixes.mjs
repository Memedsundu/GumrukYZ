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

const processRoute = read('apps/web/src/app/api/submissions/[id]/process/route.ts')
assert(processRoute.includes('tx.submission.updateMany'), 'Process route must claim submissions atomically')
assert(processRoute.includes("status: { in: PROCESSABLE_STATUSES }"), 'Process route must restrict claimable statuses')
assert(processRoute.includes('tx.processingJob.create'), 'Process route must create the job inside the claim transaction')

const processing = read('apps/web/src/lib/processing.ts')
assert(processing.includes('processSubmission.lock_missing'), 'Pipeline must refuse to run without an active job lock')
assert(processing.includes('clearGeneratedArtifacts'), 'Pipeline cleanup guard must remain present')

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

const expertReview = read('apps/web/src/lib/expert-review.ts')
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

console.log('Urgent fix invariants verified.')
