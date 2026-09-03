import { embedText } from "./embeddings";
import { supabase } from "./supabase";

/** A retrieved chunk with its content and cosine similarity score. */
export interface RetrievedChunk {
  content: string;
  similarity: number;
}

/** Minimum cosine similarity to consider a chunk relevant. */
const SIMILARITY_THRESHOLD = 0.5;

/**
 * Retrieve the most relevant knowledge chunks for a user query.
 *
 * 1. Embeds the query using inputType "query" (optimized for retrieval).
 * 2. Calls the Supabase `match_chunks` RPC which does cosine-similarity search.
 * 3. Filters out matches below the similarity threshold (0.5) to avoid weak context.
 * 4. Returns chunks with their similarity scores.
 */
export async function retrieveContext(
  query: string,
  topK: number = 5
): Promise<RetrievedChunk[]> {
  // Embed the user's query
  const queryEmbedding = await embedText(query, "query");

  // Call the match_chunks Postgres function via Supabase RPC
  const { data, error } = await supabase.rpc("match_chunks", {
    query_embedding: queryEmbedding,
    match_count: topK,
  });

  if (error) {
    console.error("[RAG] match_chunks RPC error:", error);
    throw new Error(`RAG retrieval failed: ${error.message}`);
  }

  if (!data || data.length === 0) {
    console.log("[RAG] No matching chunks found for query:", query);
    return [];
  }

  // Filter out weak matches below the similarity threshold
  const filtered: RetrievedChunk[] = (
    data as { content: string; similarity: number }[]
  )
    .filter((row) => row.similarity >= SIMILARITY_THRESHOLD)
    .map((row) => ({
      content: row.content,
      similarity: row.similarity,
    }));

  console.log(
    `[RAG] Retrieved ${data.length} chunks, ${filtered.length} above threshold ${SIMILARITY_THRESHOLD}` +
      (filtered.length > 0
        ? ` (top: ${filtered[0].similarity.toFixed(3)})`
        : "")
  );

  return filtered;
}
