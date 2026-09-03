import OpenAI from "openai";

/**
 * Shared NVIDIA NIM API client.
 *
 * NVIDIA NIM exposes an OpenAI-compatible REST API, so we reuse the official
 * OpenAI SDK and just point it at NVIDIA's base URL.  This single instance is
 * used for BOTH embedding calls and chat-completion calls.
 */
export const nvidia = new OpenAI({
  baseURL: "https://integrate.api.nvidia.com/v1",
  apiKey: process.env.NVIDIA_API_KEY,
});
