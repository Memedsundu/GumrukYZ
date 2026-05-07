/**
 * Embed regulation corpus into Neon pgvector.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... pnpm --filter @gumrukyz/db embed-regulations
 *
 * Requires:
 *   - DATABASE_URL (set in packages/db/.env)
 *   - DATABASE_URL_UNPOOLED (set in packages/db/.env)
 *   - OPENAI_API_KEY (environment variable or .env.local)
 */
import OpenAI from 'openai'
import { PrismaClient } from '@prisma/client'
import { REGULATION_CORPUS } from './regulation-corpus.js'

const EMBEDDING_MODEL = 'text-embedding-3-small'
const DIMENSIONS = 1536

const openai = new OpenAI({ apiKey: process.env['OPENAI_API_KEY'] })
const prisma = new PrismaClient()

async function embedText(text: string): Promise<number[]> {
  const res = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
    dimensions: DIMENSIONS,
  })
  return res.data[0]!.embedding
}

/** Format a float[] as a pgvector literal: '[0.1,0.2,...]' */
function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`
}

async function main() {
  if (!process.env['OPENAI_API_KEY']) {
    console.error('OPENAI_API_KEY is not set. Please set it before running this script.')
    process.exit(1)
  }

  console.log(`Embedding ${REGULATION_CORPUS.reduce((n, e) => n + e.chunks.length, 0)} chunks from ${REGULATION_CORPUS.length} source documents…`)

  for (const entry of REGULATION_CORPUS) {
    const sourceDoc = await prisma.sourceDocument.findFirst({
      where: { url: entry.sourceDocumentUrl },
    })

    if (!sourceDoc) {
      console.warn(`  ⚠ SourceDocument not found for URL: ${entry.sourceDocumentUrl} — skipping`)
      continue
    }

    // Remove stale chunks for this document
    await prisma.regulationChunk.deleteMany({
      where: { sourceDocumentId: sourceDoc.id },
    })

    console.log(`\n▶ ${sourceDoc.title} (${entry.chunks.length} chunks)`)

    for (let i = 0; i < entry.chunks.length; i++) {
      const chunk = entry.chunks[i]!
      process.stdout.write(`  chunk ${i + 1}/${entry.chunks.length}… `)

      const embedding = await embedText(chunk)
      const vector = toVectorLiteral(embedding)

      // Prisma doesn't support Unsupported type writes, use raw SQL
      await prisma.$executeRaw`
        INSERT INTO regulation_chunks
          (id, source_document_id, chunk_index, chunk_text, embedding, token_count, model, created_at)
        VALUES
          (gen_random_uuid(), ${sourceDoc.id}, ${i}, ${chunk},
           ${vector}::vector, ${Math.ceil(chunk.length / 4)}, ${EMBEDDING_MODEL}, now())
      `

      console.log('✓')
    }

    // Update last_verified_at on the source document
    await prisma.sourceDocument.update({
      where: { id: sourceDoc.id },
      data: { lastVerifiedAt: new Date() },
    })
  }

  console.log('\nEmbedding complete. All chunks stored in regulation_chunks.')
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
