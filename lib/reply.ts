import { nvidia } from "./nvidia";

/**
 * Generate a reply to a user's Instagram message or comment.
 *
 * @param userMessage - The text the user sent.
 * @param context     - Relevant knowledge chunks retrieved by RAG.
 * @param mode        - "dm" for Direct Messages (conversational), "comment" for
 *                      public comment replies (short, under 300 chars).
 */
export async function generateReply(
  userMessage: string,
  context: string[],
  mode: "dm" | "comment"
): Promise<string> {
  const contextBlock =
    context.length > 0
      ? context.map((c, i) => `[${i + 1}] ${c}`).join("\n\n")
      : "No relevant context found in the knowledge base.";

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

RULES:
- Only answer based on the provided context. If the context doesn't cover the
  question, say you're not sure and suggest they DM or visit aliaftab.dev.
- Never make up information about pricing, timelines, or capabilities.
- Be warm, professional, and represent Ali well.
- Never reveal that you are an AI bot unless directly asked.

${modeInstructions}

CONTEXT FROM KNOWLEDGE BASE:
${contextBlock}`;

  const response = await nvidia.chat.completions.create({
    model: process.env.NVIDIA_LLM_MODEL!,
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
