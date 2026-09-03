/**
 * Ingest Script — run with: npm run ingest
 *
 * Calls the /api/ingest endpoint locally to:
 * 1. Scrape aliaftab.dev and ingest portfolio content
 * 2. Ingest the FAQ entries defined below
 *
 * Prerequisites:
 * - Next.js dev server running (`npm run dev`)
 * - All env vars set in .env.local
 *
 * Usage:
 *   npm run dev          # in one terminal
 *   npm run ingest       # in another terminal
 */

// ── FAQ Knowledge Base ───────────────────────────────────────────────────────
// Customize these Q&A pairs with your actual information.
// These get embedded and stored alongside the scraped portfolio content.
const FAQ_ENTRIES = [
  {
    question: "What services does Ali Aftab offer?",
    answer:
      "Ali Aftab offers full-stack web development, mobile app development (React Native / Expo), AI/ML integration, UI/UX design, and technical consulting. He specializes in Next.js, React, Node.js, and Python-based solutions.",
  },
  {
    question: "What is Ali Aftab's tech stack?",
    answer:
      "Ali primarily works with TypeScript, Next.js 14, React, React Native (Expo), Node.js, Python, Supabase (PostgreSQL), TailwindCSS, and various AI/ML APIs including NVIDIA NIM and Google Gemini. He also has experience with AWS, Vercel, and Docker.",
  },
  {
    question: "How can I contact Ali Aftab or book a consultation?",
    answer:
      "You can reach Ali via Instagram DM, WhatsApp at +92 320 4621535, or email at hello@aliaftab.dev. Visit aliaftab.dev for his portfolio and contact form. He typically responds within a few hours.",
  },
  {
    question: "What are Ali Aftab's rates and project pricing?",
    answer:
      "Pricing depends on project scope and complexity. Ali offers both fixed-price projects and hourly consulting. For a custom quote, DM on Instagram or WhatsApp at +92 320 4621535 with your project details.",
  },
];

// ── Main ─────────────────────────────────────────────────────────────────────

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
const INGEST_SECRET = process.env.INGEST_SECRET;

async function main() {
  if (!INGEST_SECRET) {
    console.error(
      "❌ INGEST_SECRET not set. Add it to your .env.local file."
    );
    process.exit(1);
  }

  console.log(`🚀 Calling ${BASE_URL}/api/ingest ...`);
  console.log(`📄 Sending ${FAQ_ENTRIES.length} FAQ entries`);

  const response = await fetch(`${BASE_URL}/api/ingest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${INGEST_SECRET}`,
    },
    body: JSON.stringify({ faq: FAQ_ENTRIES }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("❌ Ingestion failed:", data);
    process.exit(1);
  }

  console.log("✅ Ingestion complete!");
  console.log(`   📦 Portfolio chunks: ${data.portfolioChunks}`);
  console.log(`   ❓ FAQ chunks:       ${data.faqChunks}`);
  console.log(`   📊 Total chunks:     ${data.totalChunks}`);
  console.log(`   🌐 Pages scraped:    ${data.pagesScraped}`);
}

main().catch((err) => {
  console.error("❌ Script error:", err);
  process.exit(1);
});
