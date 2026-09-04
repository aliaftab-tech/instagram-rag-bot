import { nvidia } from "./nvidia";
import type { RetrievedChunk } from "./rag";

// ─── Content Safety ──────────────────────────────────────────────────────────

interface SafetyResult {
  safe: boolean;
  reason?: string;
}

/**
 * Pre-screen a user message using NVIDIA's content-safety model.
 *
 * Uses nemotron-3.5-content-safety via chat completions to classify whether the
 * incoming message is safe/appropriate to respond to (not spam, abuse, or harmful).
 */
export async function checkContentSafety(text: string): Promise<SafetyResult> {
  try {
    const response = await nvidia.chat.completions.create({
      model: (process.env.NVIDIA_SAFETY_MODEL || "nvidia/nemotron-3.5-content-safety").trim(),
      messages: [
        {
          role: "user",
          content: text,
        },
      ],
      // Low temperature for consistent classification
      temperature: 0,
      max_tokens: 64,
    });

    const output = response.choices[0]?.message?.content?.trim().toLowerCase() || "";

    // nemotron-3.5-content-safety returns a classification.
    // The model outputs "safe" or indicates unsafe categories.
    // We check for explicit unsafe signals — any mention of unsafe/blocked/harmful.
    const isUnsafe =
      output.includes("unsafe") ||
      output.includes("blocked") ||
      output.includes("harmful") ||
      output.includes("violation");

    if (isUnsafe) {
      return { safe: false, reason: output };
    }

    return { safe: true };
  } catch (error) {
    // If the safety check itself fails, err on the side of caution and allow
    // the message through — don't block users due to API errors.
    console.error("[Safety] Content safety check failed:", error);
    return { safe: true };
  }
}

// ─── Reply Generation ────────────────────────────────────────────────────────

// Neutral deflection replies — never expose the safety check reason to the user.
const UNSAFE_REPLY_DM =
  "Thanks for reaching out! I appreciate the message. If you have any questions about my services or portfolio, feel free to ask — or visit aliaftab.dev for more info. 🙂";

const UNSAFE_REPLY_COMMENT =
  "Thanks for reaching out! For detailed questions please DM me directly 💬";

// Fallback when no relevant context is found (empty or below-threshold results)
const NO_CONTEXT_REPLY_DM =
  "Thanks for reaching out! I don't have exact info on that right now — check aliaftab.dev or I'll get back to you personally soon. 🙂";

const NO_CONTEXT_REPLY_COMMENT =
  "Great question! DM me for details or check aliaftab.dev 🚀";

/**
 * Generate a reply to a user's Instagram message or comment.
 *
 * Three-step flow:
 * 1. Content safety check — if unsafe, return a neutral deflection.
 * 2. Context relevance check — if no relevant context, return a safe fallback.
 * 3. LLM generation — build system prompt with RAG context, call NVIDIA LLM.
 *
 * @param userMessage - The text the user sent.
 * @param context     - Relevant knowledge chunks retrieved by RAG (already filtered by threshold).
 * @param mode        - "dm" for Direct Messages (conversational), "comment" for
 *                      public comment replies (short, under 300 chars).
 */
export async function generateReply(
  userMessage: string,
  context: RetrievedChunk[],
  mode: "dm" | "comment"
): Promise<string> {
  // ── Step 1: Content safety pre-check ──
  const safety = await checkContentSafety(userMessage);
  if (!safety.safe) {
    console.log(
      `[Reply] Unsafe content detected, returning deflection. Reason: ${safety.reason}`
    );
    return mode === "dm" ? UNSAFE_REPLY_DM : UNSAFE_REPLY_COMMENT;
  }

  // ── Step 2: Context relevance check ──
  if (context.length === 0) {
    console.log("[Reply] No relevant context — returning safe fallback");
    return mode === "dm" ? NO_CONTEXT_REPLY_DM : NO_CONTEXT_REPLY_COMMENT;
  }

  // ── Step 3: LLM reply generation with RAG context ──
  const contextBlock = context
    .map((c, i) => `[${i + 1}] (similarity: ${c.similarity.toFixed(2)}) ${c.content}`)
    .join("\n\n");

  const modeInstructions =
    mode === "dm"
      ? `You are replying via Instagram Direct Message. Be conversational, helpful,
and friendly. You can write longer responses. Use casual but professional tone.
If the user writes in Urdu/Roman Urdu, reply in the same language.`
      : `You are replying to a public Instagram comment. Keep your reply UNDER 300
characters. Be friendly, concise, and use an engaging Instagram tone. Use emojis
sparingly. If appropriate, invite them to DM for more details.`;

  const systemPrompt = `You are Ali Aftab's portfolio assistant bot on Instagram. You help answer
questions about Ali's services, tech stack, portfolio, pricing, and availability.

STRICT RULES:
- ONLY answer based on the provided context below. Do NOT make up any information
  that is not explicitly present in the context.
- If the context doesn't cover the question, say you're not sure and suggest they
  DM directly or visit aliaftab.dev for more details.
- Never fabricate information about pricing, timelines, capabilities, or past projects.
- Be warm, professional, and represent Ali well.
- Never reveal that you are an AI bot unless directly asked.

${modeInstructions}

CONTEXT FROM KNOWLEDGE BASE:
${contextBlock}`;

  const response = await nvidia.chat.completions.create({
    model: (process.env.NVIDIA_LLM_MODEL || "nvidia/nemotron-3.5-lightning-30b-a3b").trim(),
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    temperature: 0.7,
    max_tokens: mode === "dm" ? 1024 : 200,
  });

  const reply = response.choices[0]?.message?.content?.trim();
  if (!reply) {
    throw new Error("NVIDIA LLM returned empty response");
  }

  // Safety net: truncate comment replies to 300 chars (Instagram comment limit consideration)
  if (mode === "comment" && reply.length > 300) {
    return reply.slice(0, 297) + "...";
  }

  return reply;
}
