-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateTable
CREATE TABLE "regulation_chunks" (
    "id" TEXT NOT NULL,
    "source_document_id" TEXT NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "chunk_text" TEXT NOT NULL,
    "embedding" vector(1536),
    "token_count" INTEGER,
    "model" TEXT NOT NULL DEFAULT 'text-embedding-3-small',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regulation_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "regulation_chunks_source_document_id_idx" ON "regulation_chunks"("source_document_id");

-- AddForeignKey
ALTER TABLE "regulation_chunks" ADD CONSTRAINT "regulation_chunks_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "source_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
