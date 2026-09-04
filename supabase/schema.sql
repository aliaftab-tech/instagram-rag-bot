-- ============================================================================
-- ig-rag-bot: Supabase pgvector schema
-- ============================================================================
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New Query).
-- ============================================================================

-- 1. Enable pgvector extension
create extension if not exists vector;

-- 2. Drop old functions and table if migrating from vector(1024)
drop function if exists match_chunks(vector, int);
drop function if exists match_chunks(vector(1024), int);
drop function if exists match_chunks(vector(2048), int);
drop table if exists knowledge_chunks cascade;

-- 3. Knowledge chunks table (2048-d matching nvidia/nemotron-3-embed-1b)
create table knowledge_chunks (
  id         bigint primary key generated always as identity,
  content    text    not null,
  embedding  vector(2048) not null,
  source     text    not null default 'portfolio',
  created_at timestamptz not null default now()
);

-- Note: pgvector index limit is 2,000-d, but unindexed exact search supports up to 16,000-d.
-- For portfolio/FAQ knowledge base (<1,000 chunks), unindexed search runs in <1ms with 100% accuracy.

-- 4. RPC function: match_chunks
-- Call via supabase.rpc('match_chunks', { query_embedding: [...], match_count: 5 })
-- Returns the top-N most similar chunks ordered by cosine similarity (highest first).
create or replace function match_chunks(
  query_embedding vector(2048),  -- Must match the embedding column dimension (2048)
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
