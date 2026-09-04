import OpenAI from "openai";

/**
 * Shared NVIDIA NIM API client.
 *
 * NVIDIA NIM exposes an OpenAI-compatible REST API, so we reuse the official
 * OpenAI SDK and just point it at NVIDIA's base URL.  This single instance is
 * used for ALL three model calls:
 *   - Embeddings  (nvidia/nemotron-3-embed-1b)
 *   - LLM replies (nemotron-3.5-lightning-30b-a3b)
 *   - Safety check (nemotron-3.5-content-safety)
 */
export const nvidia = new OpenAI({
  baseURL: "https://integrate.api.nvidia.com/v1",
  apiKey: process.env.NVIDIA_API_KEY?.trim(),
});
