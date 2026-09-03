import { NextRequest, NextResponse } from "next/server";
import {
  verifyWebhookSignature,
  sendDirectMessage,
  replyToComment,
} from "@/lib/instagram";
import { retrieveContext } from "@/lib/rag";
import { generateReply } from "@/lib/reply";

/**
 * GET /api/webhook/instagram
 *
 * Meta webhook verification endpoint.
 * When you register a webhook URL in the Meta Developer Dashboard, Meta sends a
 * GET request with these query params:
 *   - hub.mode        = "subscribe"
 *   - hub.verify_token = your custom IG_VERIFY_TOKEN
 *   - hub.challenge    = a random string Meta expects you to echo back
 *
 * Return the challenge as plain text to prove ownership of the endpoint.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.IG_VERIFY_TOKEN) {
    console.log("[Webhook] Verification successful");
    return new NextResponse(challenge, { status: 200 });
  }

  console.warn("[Webhook] Verification failed — token mismatch or bad mode");
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// ─── Instagram Webhook Payload Types ─────────────────────────────────────────
// These types describe the relevant parts of Instagram's webhook payload.
// The full payload structure is deeply nested and varies by event type.

interface IGMessagingEvent {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: {
    mid: string;
    text?: string;
    // is_echo is true when the message was sent BY the page (i.e., our bot or
    // the page owner). We skip these to avoid infinite reply loops.
    is_echo?: boolean;
  };
}

interface IGCommentChange {
  field: "comments";
  value: {
    // The comment ID — use this to reply
    id: string;
    // The text of the comment
    text: string;
    // The commenter's Instagram-scoped user ID
    from: { id: string; username?: string };
    // The media (post/reel) the comment was left on
    media: { id: string };
    // Parent comment ID if this is a reply to another comment
    parent_id?: string;
  };
}

interface IGWebhookEntry {
  id: string;
  time: number;
  // Messaging events (DMs) — present when subscribed to "messages"
  messaging?: IGMessagingEvent[];
  // Field-level changes (comments) — present when subscribed to "comments"
  changes?: IGCommentChange[];
}

interface IGWebhookPayload {
  object: string;
  entry: IGWebhookEntry[];
}

/**
 * POST /api/webhook/instagram
 *
 * Receives Instagram webhook events (DMs and comments).
 *
 * Flow:
 * 1. Read raw body and verify X-Hub-Signature-256
 * 2. Parse the JSON payload
 * 3. For each entry, handle messaging events (DMs) and/or comment changes
 * 4. For each event: retrieve RAG context → generate reply → send response
 * 5. Return 200 immediately (Meta requires fast response, processing is best-effort)
 */
export async function POST(request: NextRequest) {
  // 1. Read raw body for signature verification
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256") || "";

  if (!verifyWebhookSignature(rawBody, signature)) {
    console.warn("[Webhook] Invalid signature — rejecting request");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // 2. Parse the payload
  let payload: IGWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as IGWebhookPayload;
  } catch {
    console.error("[Webhook] Failed to parse JSON body");
    return NextResponse.json({ error: "Bad Request" }, { status: 400 });
  }

  // Instagram webhooks always have object = "instagram"
  if (payload.object !== "instagram") {
    console.log(`[Webhook] Ignoring non-Instagram object: ${payload.object}`);
    return NextResponse.json({ received: true }, { status: 200 });
  }

  console.log(
    `[Webhook] Received ${payload.entry.length} entry(ies) from Instagram`
  );

  // 3. Process each entry (usually just one, but the spec allows batching)
  // We process in the background and return 200 fast so Meta doesn't retry.
  // In a production system you might use a queue — for Vercel, the function
  // continues executing after the response is sent (within the timeout).
  const processingPromises: Promise<void>[] = [];

  for (const entry of payload.entry) {
    // ── Handle DMs ──
    if (entry.messaging) {
      for (const event of entry.messaging) {
        // Skip echo messages (sent by the page/bot itself)
        if (event.message?.is_echo) {
          console.log("[Webhook] Skipping echo message");
          continue;
        }

        // Only handle text messages (ignore stickers, attachments, etc.)
        const text = event.message?.text;
        if (!text) {
          console.log("[Webhook] Skipping non-text message event");
          continue;
        }

        const senderId = event.sender.id;
        console.log(`[Webhook] DM from ${senderId}: "${text}"`);

        processingPromises.push(handleDM(senderId, text));
      }
    }

    // ── Handle Comments ──
    // Comment events come via the "changes" array with field = "comments"
    if (entry.changes) {
      for (const change of entry.changes) {
        if (change.field !== "comments") continue;

        const { id: commentId, text, from, parent_id } = change.value;

        // Skip replies to other comments (we only auto-reply to top-level comments)
        // Remove this check if you want to reply to all comments including nested ones
        if (parent_id) {
          console.log("[Webhook] Skipping nested comment reply");
          continue;
        }

        console.log(
          `[Webhook] Comment from ${from.username || from.id}: "${text}"`
        );

        processingPromises.push(handleComment(commentId, text));
      }
    }
  }

  // Wait for all handlers (best-effort within Vercel's function timeout)
  await Promise.allSettled(processingPromises);

  return NextResponse.json({ received: true }, { status: 200 });
}

// ─── Event Handlers ──────────────────────────────────────────────────────────

async function handleDM(senderId: string, userMessage: string): Promise<void> {
  try {
    // retrieveContext returns RetrievedChunk[] (already filtered by similarity threshold)
    // generateReply accepts RetrievedChunk[] directly
    const context = await retrieveContext(userMessage);
    const reply = await generateReply(userMessage, context, "dm");
    await sendDirectMessage(senderId, reply);
  } catch (error) {
    console.error(`[Webhook] Error handling DM from ${senderId}:`, error);
  }
}

async function handleComment(
  commentId: string,
  commentText: string
): Promise<void> {
  try {
    const context = await retrieveContext(commentText);
    const reply = await generateReply(commentText, context, "comment");
    await replyToComment(commentId, reply);
  } catch (error) {
    console.error(
      `[Webhook] Error handling comment ${commentId}:`,
      error
    );
  }
}

