/**
 * Bootstrap regulation source metadata and local fallback chunks.
 *
 * This command does not fetch official pages. It guarantees the legal context
 * tables have deterministic seed chunks for local/dev and first deploys.
 * If OPENAI_API_KEY is set, chunks are embedded for expert-review readiness.
 */
import { createHash } from 'crypto'
import OpenAI from 'openai'
import { prisma } from './client.js'
import { REGULATION_CORPUS } from './regulation-corpus.js'
import { REGULATION_SOURCE_MANIFEST } from './regulation-source-manifest.js'

const EMBEDDING_MODEL = 'text-embedding-3-small'
const DIMENSIONS = 1536

const openai = process.env['OPENAI_API_KEY']
  ? new OpenAI({ apiKey: process.env['OPENAI_API_KEY'] })
  : null

async function main() {
  let sourceCount = 0
  let chunkCount = 0
  let embeddedCount = 0

  for (const source of REGULATION_SOURCE_MANIFEST) {
    const chunks = chunksForSource(source.url, source.fallbackChunks)
    const sourceDocument = await upsertSourceDocument(source, chunks)
    sourceCount += 1

    if (chunks.length === 0) {
      console.warn(`No fallback chunks for ${source.title}`)
      continue
    }

    await prisma.regulationChunk.deleteMany({ where: { sourceDocumentId: sourceDocument.id } })

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!
      const embedding = openai ? await embedText(chunk) : null
      await insertChunk({
        sourceDocumentId: sourceDocument.id,
        sourceUrl: source.url,
        chunkIndex: i,
        chunkText: chunk,
        embedding,
      })
      chunkCount += 1
      if (embedding) embeddedCount += 1
    }

    console.log(`${source.title}: ${chunks.length} chunk(s)${openai ? ' embedded' : ''}`)
  }

  console.log(
    `Regulation bootstrap complete: ${sourceCount} source(s), ${chunkCount} chunk(s), ${embeddedCount} embedded.`,
  )
}

function chunksForSource(url: string, fallbackChunks: string[] = []): string[] {
  const corpusChunks = REGULATION_CORPUS.find((entry) => entry.sourceDocumentUrl === url)?.chunks ?? []
  return [...new Set([...corpusChunks, ...fallbackChunks])]
}

async function upsertSourceDocument(
  source: (typeof REGULATION_SOURCE_MANIFEST)[number],
  chunks: string[],
) {
  const existing = await prisma.sourceDocument.findFirst({
    where: {
      OR: [
        { url: source.url },
        { title: source.title },
      ],
    },
  })
  const now = new Date()
  const data = {
    title: source.title,
    url: source.url,
    sourceType: source.sourceType,
    jurisdiction: source.jurisdiction,
    language: source.language,
    effectiveDate: source.effectiveDate ? new Date(source.effectiveDate) : null,
    lastVerifiedAt: existing?.lastVerifiedAt ?? now,
    rawExcerpt: chunks.join(' ').slice(0, 800) || existing?.rawExcerpt || `${source.title} metadata.`,
    snapshotSha256: chunks.length > 0
      ? createHash('sha256').update(chunks.join('\n')).digest('hex')
      : existing?.snapshotSha256,
    snapshotFetchedAt: chunks.length > 0 ? now : existing?.snapshotFetchedAt,
    verificationStatus: chunks.length > 0 ? 'BOOTSTRAP_FALLBACK_CHUNKS' : 'SOURCE_METADATA_ONLY',
  }

  if (existing) {
    return prisma.sourceDocument.update({ where: { id: existing.id }, data })
  }
  return prisma.sourceDocument.create({ data })
}

async function insertChunk(params: {
  sourceDocumentId: string
  sourceUrl: string
  chunkIndex: number
  chunkText: string
  embedding: number[] | null
}) {
  if (params.embedding) {
    await prisma.$executeRaw`
      INSERT INTO regulation_chunks
        (id, source_document_id, chunk_index, chunk_text, article_label, source_url, embedding, token_count, model, verified_at, created_at)
      VALUES
        (gen_random_uuid(), ${params.sourceDocumentId}, ${params.chunkIndex}, ${params.chunkText},
         ${extractArticleLabel(params.chunkText)}, ${params.sourceUrl}, ${toVectorLiteral(params.embedding)}::vector,
         ${Math.ceil(params.chunkText.length / 4)}, ${EMBEDDING_MODEL}, now(), now())
    `
    return
  }

  await prisma.$executeRaw`
    INSERT INTO regulation_chunks
      (id, source_document_id, chunk_index, chunk_text, article_label, source_url, token_count, model, verified_at, created_at)
    VALUES
      (gen_random_uuid(), ${params.sourceDocumentId}, ${params.chunkIndex}, ${params.chunkText},
       ${extractArticleLabel(params.chunkText)}, ${params.sourceUrl}, ${Math.ceil(params.chunkText.length / 4)},
       ${EMBEDDING_MODEL}, now(), now())
  `
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

function extractArticleLabel(text: string): string | null {
  const madde = text.match(/\bMadde\s+([0-9]+(?:-[0-9]+)?)/i)
  if (madde) return `Madde ${madde[1]}`
  const section = text.match(/\b(Fasıl\s+[0-9]+(?:-[0-9]+)?|GRI-[0-9][a-z]?|Incoterms\s+2020|GT[İI]P)\b/i)
  return section?.[1] ?? null
}

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error)
    await prisma.$disconnect()
    process.exit(1)
  })
