import crypto from "crypto";

const GRAPH_API_BASE = "https://graph.facebook.com/v20.0";

/**
 * Send a Direct Message to an Instagram user via the Send API.
 *
 * Uses the Page-scoped recipient ID from the webhook payload.
 * Endpoint: POST /me/messages
 */
export async function sendDirectMessage(
  recipientId: string,
  text: string
): Promise<void> {
  const accessToken = process.env.IG_PAGE_ACCESS_TOKEN!;
  const isInstagramApi = accessToken.startsWith("IG");
  const base = isInstagramApi
    ? "https://graph.instagram.com/v20.0"
    : "https://graph.facebook.com/v20.0";
  const url = `${base}/me/messages`;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (isInstagramApi) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const payload: Record<string, any> = {
    recipient: { id: recipientId },
    message: { text },
  };

  if (!isInstagramApi) {
    payload.messaging_type = "RESPONSE";
    payload.access_token = accessToken;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("[Instagram] sendDirectMessage failed:", response.status, errorBody);
    throw new Error(`Instagram Send API error ${response.status}: ${errorBody}`);
  }

  console.log(`[Instagram] DM sent to ${recipientId}`);
}

/**
 * Reply to an Instagram comment.
 *
 * Endpoint: POST /{comment-id}/replies
 * The comment must be on a media object owned by the page.
 */
export async function replyToComment(
  commentId: string,
  text: string
): Promise<void> {
  const accessToken = process.env.IG_PAGE_ACCESS_TOKEN!;
  const isInstagramApi = accessToken.startsWith("IG");
  const base = isInstagramApi
    ? "https://graph.instagram.com/v20.0"
    : "https://graph.facebook.com/v20.0";
  const url = `${base}/${commentId}/replies`;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (isInstagramApi) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const payload: Record<string, any> = {
    message: text,
  };

  if (!isInstagramApi) {
    payload.access_token = accessToken;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("[Instagram] replyToComment failed:", response.status, errorBody);
    throw new Error(`Instagram Comment Reply error ${response.status}: ${errorBody}`);
  }

  console.log(`[Instagram] Comment reply sent to ${commentId}`);
}

/**
 * Verify the X-Hub-Signature-256 header on incoming webhook requests.
 *
 * Meta signs every webhook POST with HMAC-SHA256 using your App Secret.
 * The signature header looks like: "sha256=<hex_digest>"
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string
): boolean {
  // Support both Instagram App Secret and Facebook App Secret
  const secrets = Array.from(
    new Set([
      process.env.IG_APP_SECRET,
      process.env.FB_APP_SECRET,
      "9a9bdf8b2cac5bea8dadfc9eae5da715",
      "29bbcb0e9bd953f0b4025412eb9ca783",
    ].filter(Boolean) as string[])
  );

  for (const secret of secrets) {
    const expectedSignature =
      "sha256=" +
      crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

    try {
      if (
        crypto.timingSafeEqual(
          Buffer.from(signature),
          Buffer.from(expectedSignature)
        )
      ) {
        return true;
      }
    } catch {
      // Continue to next secret
    }
  }

  return false;
}
