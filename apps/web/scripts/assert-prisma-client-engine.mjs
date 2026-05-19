import { existsSync, readFileSync } from 'fs'
import { createRequire } from 'module'
import { dirname, join } from 'path'

const require = createRequire(import.meta.url)
const clientEntry = require.resolve('@prisma/client')
const clientPackageDir = dirname(clientEntry)
const generatedClientEntry = require.resolve('.prisma/client/index', { paths: [clientPackageDir] })
const generatedClient = readFileSync(generatedClientEntry, 'utf8')

if (!generatedClient.includes('"engineType": "client"')) {
  throw new Error(
    `Generated Prisma Client is not configured for engineType="client": ${generatedClientEntry}`,
  )
}

const dashboardTracePath = join(
  process.cwd(),
  '.next/server/app/(dashboard)/dashboard/page.js.nft.json',
)

if (!existsSync(dashboardTracePath)) {
  throw new Error(`Dashboard trace not found: ${dashboardTracePath}`)
}

const dashboardTrace = JSON.parse(readFileSync(dashboardTracePath, 'utf8'))
const nativeEngineFiles = dashboardTrace.files.filter((file) => file.includes('libquery_engine'))
const queryCompilerWasmFiles = dashboardTrace.files.filter((file) =>
  file.endsWith('/query_compiler_bg.wasm'),
)
const pdfWorkerFiles = dashboardTrace.files.filter((file) =>
  file.endsWith('/pdf.worker.mjs'),
)

if (nativeEngineFiles.length > 0) {
  throw new Error(
    `Dashboard trace includes native Prisma query engine files:\n${nativeEngineFiles.join('\n')}`,
  )
}

if (queryCompilerWasmFiles.length === 0) {
  throw new Error('Dashboard trace is missing Prisma query_compiler_bg.wasm.')
}

if (pdfWorkerFiles.length === 0) {
  throw new Error('Dashboard trace is missing pdfjs-dist pdf.worker.mjs.')
}

const { PrismaClient } = require('@prisma/client')
const { PrismaNeon } = require('@prisma/adapter-neon')
const client = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: 'postgresql://user:password@localhost:5432/db' }),
})

await client.$disconnect().catch(() => {})

console.log('assert-prisma-client-engine: Prisma Client is generated for client engine mode.')
