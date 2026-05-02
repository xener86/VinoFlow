-- Migration 002: pgvector for embedding-based wine matching.
-- Requires the pgvector extension. The official postgres image does NOT include
-- it — use pgvector/pgvector:pg16 image (or install the extension manually).
--
-- This migration is intentionally separate so deployments without pgvector
-- can skip it without breaking the rest of the app.

BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to wines (768 dim for Gemini text-embedding-004)
ALTER TABLE wines ADD COLUMN IF NOT EXISTS embedding vector(768);

-- Approximate nearest neighbor index (HNSW, fast for read-heavy workloads)
CREATE INDEX IF NOT EXISTS idx_wines_embedding ON wines
    USING hnsw (embedding vector_cosine_ops);

COMMIT;
