/**
 * RAG vector search against regulation_chunks.
 *
 * Uses cosine similarity via pgvector's <=> operator.
 * Returns the top-k most relevant regulation chunks for a given query.
 */
import { PrismaClient } from '@prisma/client'

export interface RegulationCitation {
  chunkId: string
  chunkText: string
  similarity: number
  sourceDocumentId: string
  sourceDocumentTitle: string
  sourceDocumentUrl: string
}

/**
 * Find the top-k regulation chunks most similar to the given query embedding.
 *
 * @param prisma  Prisma client instance
 * @param queryEmbedding  float[] of length 1536 (text-embedding-3-small)
 * @param topK    number of results to return (default 5)
 * @param minSimilarity  cosine similarity threshold 0–1 (default 0.5)
 */
export async function searchRegulations(
  prisma: PrismaClient,
  queryEmbedding: number[],
  topK = 5,
  minSimilarity = 0.5,
): Promise<RegulationCitation[]> {
  const vector = `[${queryEmbedding.join(',')}]`

  const rows = await prisma.$queryRaw<
    Array<{
      chunk_id: string
      chunk_text: string
      similarity: number
      source_document_id: string
      title: string
      url: string
    }>
  >`
    SELECT
      rc.id              AS chunk_id,
      rc.chunk_text,
      1 - (rc.embedding <=> ${vector}::vector) AS similarity,
      sd.id              AS source_document_id,
      sd.title,
      sd.url
    FROM regulation_chunks rc
    JOIN source_documents sd ON sd.id = rc.source_document_id
    WHERE rc.embedding IS NOT NULL
      AND 1 - (rc.embedding <=> ${vector}::vector) >= ${minSimilarity}
    ORDER BY rc.embedding <=> ${vector}::vector
    LIMIT ${topK}
  `

  return rows.map((r) => ({
    chunkId: r.chunk_id,
    chunkText: r.chunk_text,
    similarity: Number(r.similarity),
    sourceDocumentId: r.source_document_id,
    sourceDocumentTitle: r.title,
    sourceDocumentUrl: r.url,
  }))
}
