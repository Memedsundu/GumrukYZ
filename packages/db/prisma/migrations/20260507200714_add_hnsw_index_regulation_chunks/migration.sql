-- HNSW index for cosine similarity search on regulation chunk embeddings.
-- This dramatically speeds up nearest-neighbour queries (ann_threshold vs brute force).
-- ef_construction=128 balances index build time and recall quality.
CREATE INDEX IF NOT EXISTS "regulation_chunks_embedding_hnsw_idx"
ON "regulation_chunks"
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 128);
