-- ============================================================================
-- ig-rag-bot: Supabase pgvector schema
-- ============================================================================
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New Query).
-- ============================================================================

-- 1. Enable the pgvector extension (required for vector columns & similarity search)
create extension if not exists vector;

-- 2. Knowledge chunks table
-- Each row = one chunk of scraped or FAQ text, plus its embedding vector.
create table if not exists knowledge_chunks (
  id         bigint primary key generated always as identity,
  content    text    not null,

  -- ⚠️  VECTOR DIMENSION — change 1024 to match your NVIDIA_EMBED_MODEL's output dimension.
  -- Default 1024 is for nvidia/nv-embedqa-e5-v5.
  -- Example: if you switch to nvidia/nv-embed-v1 (4096-d), change to vector(4096).
  -- Check your model's docs at https://build.nvidia.com for the correct dimension.
  embedding  vector(1024) not null,

  -- 'portfolio' for scraped site content, 'faq' for manual FAQ entries
  source     text    not null default 'portfolio',
  created_at timestamptz not null default now()
);

-- 3. IVFFlat index for fast cosine-similarity search
-- The lists parameter (100) is a good default for up to ~100k rows.
-- For larger datasets, increase lists ≈ sqrt(row_count).
create index if not exists knowledge_chunks_embedding_idx
  on knowledge_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- 4. RPC function: match_chunks
-- Call via supabase.rpc('match_chunks', { query_embedding: [...], match_count: 5 })
-- Returns the top-N most similar chunks ordered by cosine similarity (highest first).
create or replace function match_chunks(
  query_embedding vector(1024),  -- ⚠️  Must match the dimension above
  match_count     int default 5
)
returns table (
  id         bigint,
  content    text,
  source     text,
  similarity float
)
language plpgsql
as $$
begin
  return query
    select
      kc.id,
      kc.content,
      kc.source,
      -- Cosine similarity: 1 - cosine distance.  pgvector's <=> is cosine distance.
      1 - (kc.embedding <=> query_embedding) as similarity
    from knowledge_chunks kc
    order by kc.embedding <=> query_embedding
    limit match_count;
end;
$$;
