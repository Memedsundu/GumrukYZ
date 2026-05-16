/**
 * Fetch official regulation snapshots and store parsed chunks for deterministic citations.
 *
 * Usage:
 *   BLOB_READ_WRITE_TOKEN=... OPENAI_API_KEY=... pnpm --filter @gumrukyz/db ingest-regulations
 *
 * If OPENAI_API_KEY is omitted, chunks are stored without embeddings.
 */
import { createHash } from 'crypto'
import OpenAI from 'openai'
import { put } from '@vercel/blob'
import { prisma } from './client.js'
import { REGULATION_SOURCE_MANIFEST } from './regulation-source-manifest.js'

const EMBEDDING_MODEL = 'text-embedding-3-small'
const DIMENSIONS = 1536
const FETCH_TIMEOUT_MS = 15_000
const MAX_RETRIES = 3
const RETRY_BASE_DELAY_MS = 500

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null

async function fetchWithRetry(url: string): Promise<Response | null> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

      const response = await fetch(url, {
        headers: { 'User-Agent': 'GumrukYZ compliance citation ingester' },
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout))

      if (response.ok) return response

      console.warn(`  attempt ${attempt}/${MAX_RETRIES}: HTTP ${response.status}`)
      if (response.status < 500) return response // 4xx — no point retrying
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.warn(`  attempt ${attempt}/${MAX_RETRIES}: fetch error — ${msg}`)
      if (attempt === MAX_RETRIES) return null
    }

    // Exponential back-off: 500 ms, 1 s, 2 s …
    await new Promise((resolve) => setTimeout(resolve, RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1)))
  }
  return null
}

async function main() {
  let successCount = 0
  let failCount = 0

  for (const source of REGULATION_SOURCE_MANIFEST) {
    console.log(`\n▶ ${source.title}`)
    console.log(`  URL: ${source.url}`)

    const response = await fetchWithRetry(source.url)

    if (!response) {
      console.warn('  ✗ All retries exhausted — marking FETCH_FAILED')
      await upsertSource(source, null, 'FETCH_FAILED')
      failCount++
      continue
    }

    if (!response.ok) {
      console.warn(`  ✗ HTTP ${response.status} — marking FETCH_FAILED`)
      await upsertSource(source, null, 'FETCH_FAILED')
      failCount++
      continue
    }

    let body: string
    try {
      body = await response.text()
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.warn(`  ✗ Failed to read body — ${msg}`)
      await upsertSource(source, null, 'FETCH_FAILED')
      failCount++
      continue
    }

    const contentType = response.headers.get('content-type') ?? 'text/html; charset=utf-8'
    const sha256 = createHash('sha256').update(body).digest('hex')
    const snapshotBlobUrl = await maybeStoreSnapshot(source, body, sha256, contentType)
    const verificationStatus = snapshotBlobUrl ? 'OFFICIAL_SNAPSHOT' : 'OFFICIAL_FETCHED_NO_BLOB'

    const sourceDocument = await upsertSource(source, {
      snapshotBlobUrl,
      snapshotSha256: sha256,
      snapshotFetchedAt: new Date(),
      verificationStatus,
      rawExcerpt: extractPlainText(body).slice(0, 800),
    })

    const plainText = extractPlainText(body)
    if (plainText.length < 100) {
      console.warn('  ⚠ Content too short to chunk — skipping chunk storage')
      successCount++
      continue
    }

    const chunks = splitIntoChunks(plainText)
    await prisma.regulationChunk.deleteMany({ where: { sourceDocumentId: sourceDocument.id } })

    let chunksFailed = 0
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!
      try {
        const embedding = openai ? await embedText(chunk) : null
        if (embedding) {
          await prisma.$executeRaw`
            INSERT INTO regulation_chunks
              (id, source_document_id, chunk_index, chunk_text, article_label, source_url, embedding, token_count, model, verified_at, created_at)
            VALUES
              (gen_random_uuid(), ${sourceDocument.id}, ${i}, ${chunk}, ${extractArticleLabel(chunk)}, ${source.url},
               ${toVectorLiteral(embedding)}::vector, ${Math.ceil(chunk.length / 4)}, ${EMBEDDING_MODEL}, now(), now())
          `
        } else {
          await prisma.$executeRaw`
            INSERT INTO regulation_chunks
              (id, source_document_id, chunk_index, chunk_text, article_label, source_url, token_count, model, verified_at, created_at)
            VALUES
              (gen_random_uuid(), ${sourceDocument.id}, ${i}, ${chunk}, ${extractArticleLabel(chunk)}, ${source.url},
               ${Math.ceil(chunk.length / 4)}, ${EMBEDDING_MODEL}, now(), now())
          `
        }
      } catch (chunkErr) {
        chunksFailed++
        console.warn(`  chunk ${i} failed: ${chunkErr instanceof Error ? chunkErr.message : String(chunkErr)}`)
      }
    }

    const stored = chunks.length - chunksFailed
    console.log(`  ✓ stored ${stored}/${chunks.length} chunks (${verificationStatus})`)
    if (chunksFailed > 0) console.warn(`  ⚠ ${chunksFailed} chunks failed to store`)
    successCount++
  }

  console.log(`\n─── Ingest complete ─────────────────────────────────`)
  console.log(`  Sources: ${REGULATION_SOURCE_MANIFEST.length} total, ${successCount} success, ${failCount} failed`)
  if (failCount > 0) {
    console.log(`  Run again with better network access to retry FETCH_FAILED sources.`)
  }
}

async function upsertSource(
  source: (typeof REGULATION_SOURCE_MANIFEST)[number],
  snapshot: {
    snapshotBlobUrl: string | null
    snapshotSha256: string
    snapshotFetchedAt: Date
    verificationStatus: string
    rawExcerpt: string
  } | null,
  failStatus?: string,
) {
  const existing = await prisma.sourceDocument.findFirst({ where: { url: source.url } })
  const data = {
    title: source.title,
    url: source.url,
    sourceType: source.sourceType,
    jurisdiction: source.jurisdiction,
    language: source.language,
    effectiveDate: source.effectiveDate ? new Date(source.effectiveDate) : null,
    lastVerifiedAt: snapshot?.snapshotFetchedAt ?? (existing?.lastVerifiedAt ?? new Date()),
    rawExcerpt: snapshot?.rawExcerpt ?? existing?.rawExcerpt,
    snapshotBlobUrl: snapshot?.snapshotBlobUrl ?? existing?.snapshotBlobUrl,
    snapshotSha256: snapshot?.snapshotSha256 ?? existing?.snapshotSha256,
    snapshotFetchedAt: snapshot?.snapshotFetchedAt ?? existing?.snapshotFetchedAt,
    verificationStatus: failStatus ?? snapshot?.verificationStatus ?? 'SOURCE_METADATA_ONLY',
  }

  if (existing) {
    return prisma.sourceDocument.update({ where: { id: existing.id }, data })
  }
  return prisma.sourceDocument.create({ data })
}

async function maybeStoreSnapshot(
  source: (typeof REGULATION_SOURCE_MANIFEST)[number],
  body: string,
  sha256: string,
  contentType: string,
): Promise<string | null> {
  if (!source.allowSnapshotStorage || !process.env.BLOB_READ_WRITE_TOKEN) return null
  try {
    const pathname = `regulations/${safeName(source.title)}-${sha256.slice(0, 12)}.html`
    const blob = await put(pathname, body, { access: 'private', contentType })
    return blob.url
  } catch (error) {
    console.warn(`  blob upload failed: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

async function embedText(text: string): Promise<number[]> {
  if (!openai) throw new Error('OpenAI client is not configured')
  const res = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
    dimensions: DIMENSIONS,
  })
  return res.data[0]!.embedding
}

function extractPlainText(body: string): string {
  return body
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function splitIntoChunks(text: string): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/)
  const chunks: string[] = []
  let current = ''
  for (const sentence of sentences) {
    if ((current + ' ' + sentence).trim().length > 1200 && current.length > 200) {
      chunks.push(current.trim())
      current = sentence
    } else {
      current = `${current} ${sentence}`.trim()
    }
  }
  if (current.trim().length > 0) chunks.push(current.trim())
  return chunks.slice(0, 200)
}

function extractArticleLabel(text: string): string | null {
  const madde = text.match(/\bMadde\s+([0-9]+(?:-[0-9]+)?)/i)
  if (madde) return `Madde ${madde[1]}`
  const gtip = text.match(/\bGT[İI]P\b/i)
  if (gtip) return 'GTİP'
  return null
}

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`
}

function safeName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 80)
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error)
    await prisma.$disconnect()
    process.exit(1)
  })
