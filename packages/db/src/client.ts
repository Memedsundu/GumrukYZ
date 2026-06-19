import { neonConfig } from '@neondatabase/serverless'
import { PrismaNeon } from '@prisma/adapter-neon'
import { PrismaClient } from '@prisma/client'
import WebSocket from 'ws'

// Node workers (e.g. Trigger.dev) do not provide a global WebSocket; Neon needs one.
if (typeof globalThis.WebSocket === 'undefined') {
  neonConfig.webSocketConstructor = WebSocket
}

// PrismaNeon uses Neon's serverless WebSocket driver — no native binary needed.
// Works on Vercel Serverless Functions, Edge, and local Node.js alike.
// Pool size is controlled via connection_limit on DATABASE_URL (see docs/production-env-checklist.md).
function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set')
  }
  const adapter = new PrismaNeon({ connectionString })
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function getPrismaClient(): PrismaClient {
  if (globalForPrisma.prisma) return globalForPrisma.prisma
  const client = createPrismaClient()
  if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = client
  return client
}

// Lazy proxy: Trigger.dev injects env vars at task runtime, not during deploy indexing.
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrismaClient()
    const value = client[prop as keyof PrismaClient]
    return typeof value === 'function' ? value.bind(client) : value
  },
})
