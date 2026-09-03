# 🤖 ig-rag-bot — Instagram RAG Assistant

A RAG-powered Instagram bot that auto-replies to DMs and comments using content
scraped from [aliaftab.dev](https://aliaftab.dev) plus a manual FAQ knowledge
base. Built with Next.js 14, NVIDIA NIM API, Supabase pgvector, and deployed on
Vercel.

---

## Architecture

```
Instagram DM/Comment
        ↓
  Meta Webhook POST
        ↓
  /api/webhook/instagram
        ↓
  ┌──────────────┐
  │ Verify sig   │ → reject if invalid
  │ Parse event  │ → skip echoes
  │ Extract text │
  └──────┬───────┘
         ↓
  ┌─────────────────────────┐
  │ 1. Content Safety Check │ → nemotron-3.5-content-safety
  │    (block unsafe input) │
  ├─────────────────────────┤
  │ 2. RAG Pipeline         │
  │    a. Embed query       │ → nemotron-3-embed-1b (2048-d)
  │    b. Vector search     │ → Supabase pgvector (≥0.5 threshold)
  │    c. Context check     │ → fallback if no relevant chunks
  ├─────────────────────────┤
  │ 3. Generate reply       │ → nemotron-3.5-lightning-30b-a3b
  └──────┬──────────────────┘
         ↓
  Send reply via Graph API
```

---

## Prerequisites

- [Node.js](https://nodejs.org) ≥ 18
- A [Supabase](https://supabase.com) project (free tier works)
- An [NVIDIA NIM API key](https://build.nvidia.com)
- A [Meta Developer App](https://developers.facebook.com) with Instagram Graph API

---

## 1. NVIDIA NIM API Setup

1. Go to **[build.nvidia.com](https://build.nvidia.com)** and create an account.
2. Generate an **API Key** — this is your `NVIDIA_API_KEY`.
3. This project uses **three specific NVIDIA NIM models** (all pre-configured in `.env.local.example`):

| Purpose | Model | Notes |
|---|---|---|
| **Embeddings** | `nvidia/nemotron-3-embed-1b` | 2048-d output (native only, no dimension reduction) |
| **Reply Generation** | `nemotron-3.5-lightning-30b-a3b` | Fast, high-quality LLM for conversational replies |
| **Content Safety** | `nemotron-3.5-content-safety` | Pre-screens incoming messages for abuse/spam |

> The `supabase/schema.sql` is already set to `vector(2048)` matching nemotron-3-embed-1b.

---

## 2. Meta Developer App Setup

### 2.1 Create a Meta Developer App

1. Go to [developers.facebook.com](https://developers.facebook.com) → **My Apps** → **Create App**.
2. Select **Other** → **Business** type.
3. Under **Add Products**, add **Instagram Graph API** (or Messenger).

### 2.2 Link Instagram to Facebook Page

1. In Instagram app: **Settings → Account type and tools → Switch to Professional account**.
2. Create or connect a **Facebook Page** to your Instagram account.

### 2.3 Get a Long-Lived Page Access Token (`IG_PAGE_ACCESS_TOKEN`)

1. In your Meta App Dashboard, go to **Instagram** (or Messenger) settings.
2. Link your Facebook Page & Instagram account.
3. Generate a **Page Access Token**.
4. **Extend to long-lived** (60 days):
   ```
   GET https://graph.facebook.com/v20.0/oauth/access_token
     ?grant_type=fb_exchange_token
     &client_id={app-id}
     &client_secret={app-secret}
     &fb_exchange_token={short-lived-token}
   ```
5. For a **permanent token**, use the long-lived user token to request a Page token:
   ```
   GET https://graph.facebook.com/v20.0/me/accounts?access_token={long-lived-user-token}
   ```
   The page access token returned here doesn't expire.

### 2.4 Get App Secret (`IG_APP_SECRET`)

1. In Meta App Dashboard → **Settings → Basic**.
2. Copy the **App Secret** — this is used for webhook signature verification.

### 2.5 Set Up Webhook

1. Deploy to Vercel first (or use `ngrok` for local testing).
2. In your Meta App Dashboard → **Webhooks** → **Instagram**:
   - **Callback URL**: `https://<your-vercel-domain>/api/webhook/instagram`
   - **Verify Token**: same string as your `IG_VERIFY_TOKEN` env var
3. Subscribe to these fields:
   - `messages` — for DM auto-replies
   - `comments` — for comment auto-replies

---

## 3. Supabase Setup

1. Create a project at [supabase.com](https://supabase.com).
2. Copy your **Project URL** → `SUPABASE_URL`
3. Copy your **Service Role Key** (Settings → API → service_role) → `SUPABASE_SERVICE_ROLE_KEY`
4. Open the **SQL Editor** in Supabase Dashboard.
5. Paste and run the contents of [`supabase/schema.sql`](supabase/schema.sql).

> The schema uses `vector(2048)` matching nemotron-3-embed-1b. If you previously
> ran the schema with a different dimension, see the migration note in the SQL file.

---

## 4. Local Development

### 4.1 Install Dependencies

```bash
npm install
```

### 4.2 Configure Environment

```bash
cp .env.local.example .env.local
```

Edit `.env.local` with your actual keys and tokens.

### 4.3 Start Dev Server

```bash
npm run dev
```

### 4.4 Run Initial Ingestion

In a second terminal:

```bash
npm run ingest
```

This scrapes aliaftab.dev and inserts FAQ entries into the vector store. You
should see output like:

```
🚀 Calling http://localhost:3000/api/ingest ...
📄 Sending 4 FAQ entries
✅ Ingestion complete!
   📦 Portfolio chunks: 12
   ❓ FAQ chunks:       4
   📊 Total chunks:     16
   🌐 Pages scraped:    5
```

### 4.5 Test Webhook Verification (Optional)

```bash
curl "http://localhost:3000/api/webhook/instagram?hub.mode=subscribe&hub.verify_token=YOUR_VERIFY_TOKEN&hub.challenge=test123"
```

Should return: `test123`

---

## 5. Deploy to Vercel

1. Push this repo to GitHub.
2. Import in [Vercel](https://vercel.com) → **New Project** → select the repo.
3. Add all env vars from `.env.local` to **Vercel → Settings → Environment Variables**.
4. Deploy — Vercel auto-detects Next.js.
5. Update the webhook URL in your Meta App Dashboard to:
   ```
   https://<your-vercel-domain>/api/webhook/instagram
   ```

---

## Project Structure

```
ig-rag-bot/
├── app/
│   ├── api/
│   │   ├── ingest/route.ts           # Portfolio scraping + FAQ ingestion
│   │   └── webhook/instagram/route.ts # Instagram webhook handler
│   ├── layout.tsx                     # Root layout
│   └── page.tsx                       # Status page
├── lib/
│   ├── embeddings.ts                  # NVIDIA NIM embeddings + text chunking
│   ├── instagram.ts                   # Graph API: send DM, reply comment, verify sig
│   ├── nvidia.ts                      # Shared OpenAI SDK client for NVIDIA NIM
│   ├── rag.ts                         # RAG retrieval via Supabase pgvector
│   ├── reply.ts                       # LLM reply generation with context
│   └── supabase.ts                    # Supabase client
├── scripts/
│   └── ingest.ts                      # Standalone ingestion script
├── supabase/
│   └── schema.sql                     # pgvector schema + RPC function
├── .env.local.example                 # Environment variable template
├── next.config.mjs
├── package.json
└── tsconfig.json
```

---

## Accuracy & Safety

No LLM guarantees zero errors. This project reduces mistakes through multiple layers:

1. **Strict RAG grounding** — the LLM is instructed to only use information present in the retrieved context, never fabricate facts.
2. **Similarity threshold filtering** — chunks with cosine similarity below 0.5 are discarded before reaching the LLM, so weak/irrelevant context doesn't cause hallucinated replies.
3. **Content safety pre-check** — every incoming message is screened by `nemotron-3.5-content-safety` before the LLM sees it. Unsafe messages get a polite deflection instead of a generated reply.
4. **Safe fallback replies** — when no relevant context is found, the bot returns a helpful fallback message instead of guessing.

> **Recommendation**: Manually review the first 1–2 weeks of auto-replies before
> fully trusting the bot unattended. Monitor your Instagram inbox and comments
> regularly to catch any edge cases.

---

## Environment Variables Reference

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) |
| `NVIDIA_API_KEY` | NVIDIA NIM API key from build.nvidia.com |
| `NVIDIA_EMBED_MODEL` | Embedding model (`nvidia/nemotron-3-embed-1b`) |
| `NVIDIA_LLM_MODEL` | Reply generation LLM (`nemotron-3.5-lightning-30b-a3b`) |
| `NVIDIA_SAFETY_MODEL` | Content safety model (`nemotron-3.5-content-safety`) |
| `IG_PAGE_ACCESS_TOKEN` | Instagram/Facebook Page long-lived access token |
| `IG_VERIFY_TOKEN` | Custom string for Meta webhook verification |
| `IG_APP_SECRET` | Meta App Secret for webhook signature verification |
| `PORTFOLIO_URL` | URL to scrape (default: `https://aliaftab.dev`) |
| `INGEST_SECRET` | Secret to protect the `/api/ingest` endpoint |

---

## License

MIT — Ali Aftab
