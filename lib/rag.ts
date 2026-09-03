import { embedText } from "./embeddings";
import { supabase } from "./supabase";

/**
 * Retrieve the most relevant knowledge chunks for a user query.
 *
 * 1. Embeds the query using inputType "query" (optimized for retrieval).
 * 2. Calls the Supabase `match_chunks` RPC which does cosine-similarity search.
 * 3. Returns the raw content strings of the top-K matches.
 */
export async function retrieveContext(
  query: string,
  topK: number = 5
): Promise<string[]> {
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

  console.log(
    `[RAG] Retrieved ${data.length} chunks (top similarity: ${data[0].similarity.toFixed(3)})`
  );

  return data.map((row: { content: string }) => row.content);
}
