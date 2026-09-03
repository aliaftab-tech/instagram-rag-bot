import { nvidia } from "./nvidia";

/**
 * Embed a single text string using the NVIDIA NIM embeddings endpoint.
 *
 * @param text      - The text to embed.
 * @param inputType - "query" for search queries, "passage" for documents being stored.
 *
 * Model: nvidia/nemotron-3-embed-1b (2048-dimensional output).
 * This model only supports its native 2048 dimension — do NOT pass a `dimensions`
 * parameter, as reduced dimensions are not supported.
 *
 * NIM-specific notes:
 * - `input_type` and `truncate` are passed via the SDK's `extra_body` option
 *   since they aren't part of the standard OpenAI embeddings API.
 * - `truncate: "END"` safely handles inputs exceeding the model's token limit.
 */
export async function embedText(
  text: string,
  inputType: "query" | "passage"
): Promise<number[]> {
  const response = await nvidia.embeddings.create({
    model: process.env.NVIDIA_EMBED_MODEL!,
    input: text,
    // Do NOT pass `dimensions` — nemotron-3-embed-1b only supports native 2048-d output.
    // @ts-expect-error — extra_body is supported at runtime by the OpenAI SDK
    // but not in the type definitions.  These are NIM-specific params.
    extra_body: {
      input_type: inputType,
      truncate: "END", // Truncate from the end if input exceeds model's max tokens
    },
  });

  return response.data[0].embedding;
}

/**
 * Split a long text into chunks of approximately `maxTokens` tokens,
 * breaking at sentence boundaries where possible.
 *
 * Rough heuristic: 1 token ≈ 4 characters (for English text).
 * This is intentionally simple — no tiktoken dependency needed.
 */
export function chunkText(text: string, maxTokens: number = 500): string[] {
  const maxChars = maxTokens * 4;

  // Normalize whitespace
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxChars) {
    return [cleaned];
  }

  // Split into sentences (handles ., !, ? followed by space or end-of-string)
  const sentences = cleaned.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) || [
    cleaned,
  ];

  const chunks: string[] = [];
  let currentChunk = "";

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;

    // If adding this sentence would exceed the limit, push current chunk and start new
    if (currentChunk.length + trimmed.length + 1 > maxChars) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
      }
      // If a single sentence is longer than maxChars, force-split it
      if (trimmed.length > maxChars) {
        for (let i = 0; i < trimmed.length; i += maxChars) {
          chunks.push(trimmed.slice(i, i + maxChars).trim());
        }
        currentChunk = "";
      } else {
        currentChunk = trimmed;
      }
    } else {
      currentChunk += (currentChunk ? " " : "") + trimmed;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}
