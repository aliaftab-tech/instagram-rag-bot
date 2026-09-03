import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import { supabase } from "@/lib/supabase";
import { embedText, chunkText } from "@/lib/embeddings";

/**
 * POST /api/ingest
 *
 * Protected endpoint that:
 * 1. Scrapes aliaftab.dev (homepage + internal links) using Cheerio
 * 2. Chunks the text and embeds each chunk via NVIDIA NIM
 * 3. Upserts embeddings into Supabase knowledge_chunks table
 * 4. Optionally ingests FAQ entries from the request body
 *
 * Requires `Authorization: Bearer <INGEST_SECRET>` header.
 */
export async function POST(request: NextRequest) {
  // ── Auth check ──
  const authHeader = request.headers.get("authorization") || "";
  const expectedToken = `Bearer ${process.env.INGEST_SECRET}`;
  if (authHeader !== expectedToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const portfolioUrl = process.env.PORTFOLIO_URL || "https://aliaftab.dev";
  let totalPortfolioChunks = 0;
  let totalFaqChunks = 0;

  try {
    // ── 1. Scrape Portfolio ──
    console.log(`[Ingest] Scraping portfolio: ${portfolioUrl}`);

    // Fetch and parse the homepage
    const homepageHtml = await fetchPage(portfolioUrl);
    const $ = cheerio.load(homepageHtml);

    // Discover internal links (same origin, no external links)
    const internalLinks = new Set<string>();
    $("a[href]").each((_: number, el: Element) => {
      const href = $(el).attr("href");
      if (!href) return;

      try {
        const resolved = new URL(href, portfolioUrl);
        // Only follow links on the same domain
        if (resolved.origin === new URL(portfolioUrl).origin) {
          // Normalize: remove hash, trailing slash
          resolved.hash = "";
          const normalized = resolved.href.replace(/\/$/, "");
          internalLinks.add(normalized);
        }
      } catch {
        // Invalid URL — skip
      }
    });

    // Always include homepage
    internalLinks.add(portfolioUrl.replace(/\/$/, ""));

    console.log(
      `[Ingest] Found ${internalLinks.size} internal pages to scrape`
    );

    // Scrape all pages and collect text
    const allTexts: string[] = [];
    for (const pageUrl of internalLinks) {
      try {
        const html = await fetchPage(pageUrl);
        const text = extractText(html);
        if (text.length > 50) {
          // Skip near-empty pages
          allTexts.push(`[Source: ${pageUrl}]\n${text}`);
        }
      } catch (err) {
        console.warn(`[Ingest] Failed to scrape ${pageUrl}:`, err);
      }
    }

    // Chunk all scraped text
    const portfolioChunks: string[] = [];
    for (const text of allTexts) {
      const chunks = chunkText(text);
      portfolioChunks.push(...chunks);
    }

    console.log(
      `[Ingest] Created ${portfolioChunks.length} chunks from portfolio`
    );

    // ── 2. Clear old portfolio data and insert fresh ──
    const { error: deleteError } = await supabase
      .from("knowledge_chunks")
      .delete()
      .eq("source", "portfolio");

    if (deleteError) {
      console.error("[Ingest] Error deleting old portfolio chunks:", deleteError);
      throw deleteError;
    }

    // Embed and insert each chunk
    for (const chunk of portfolioChunks) {
      const embedding = await embedText(chunk, "passage");
      const { error: insertError } = await supabase
        .from("knowledge_chunks")
        .insert({
          content: chunk,
          embedding,
          source: "portfolio",
        });

      if (insertError) {
        console.error("[Ingest] Error inserting chunk:", insertError);
        throw insertError;
      }
      totalPortfolioChunks++;
    }

    // ── 3. Handle optional FAQ entries ──
    let body: { faq?: { question: string; answer: string }[] } = {};
    try {
      body = await request.json();
    } catch {
      // No body or invalid JSON — that's fine, FAQ is optional
    }

    if (body.faq && Array.isArray(body.faq) && body.faq.length > 0) {
      console.log(`[Ingest] Processing ${body.faq.length} FAQ entries`);

      // Clear old FAQ data
      const { error: deleteFaqError } = await supabase
        .from("knowledge_chunks")
        .delete()
        .eq("source", "faq");

      if (deleteFaqError) {
        console.error("[Ingest] Error deleting old FAQ chunks:", deleteFaqError);
        throw deleteFaqError;
      }

      for (const item of body.faq) {
        const faqText = `Q: ${item.question}\nA: ${item.answer}`;
        const embedding = await embedText(faqText, "passage");

        const { error: insertFaqError } = await supabase
          .from("knowledge_chunks")
          .insert({
            content: faqText,
            embedding,
            source: "faq",
          });

        if (insertFaqError) {
          console.error("[Ingest] Error inserting FAQ chunk:", insertFaqError);
          throw insertFaqError;
        }
        totalFaqChunks++;
      }
    }

    const summary = {
      success: true,
      portfolioChunks: totalPortfolioChunks,
      faqChunks: totalFaqChunks,
      totalChunks: totalPortfolioChunks + totalFaqChunks,
      pagesScraped: internalLinks.size,
    };

    console.log("[Ingest] Complete:", summary);
    return NextResponse.json(summary);
  } catch (error) {
    console.error("[Ingest] Fatal error:", error);
    return NextResponse.json(
      {
        error: "Ingestion failed",
        detail: error instanceof Error ? error.message : String(error),
        partialResults: {
          portfolioChunks: totalPortfolioChunks,
          faqChunks: totalFaqChunks,
        },
      },
      { status: 500 }
    );
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Fetch a page's HTML with a browser-like User-Agent */
async function fetchPage(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; ig-rag-bot/2.0; +https://aliaftab.dev)",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.text();
}

/**
 * Extract meaningful text content from HTML, stripping boilerplate.
 * Removes nav, footer, header, script, style, and SVG elements.
 */
function extractText(html: string): string {
  const $ = cheerio.load(html);

  // Remove boilerplate and non-content elements
  $("nav, footer, header, script, style, svg, noscript, iframe").remove();

  // Remove common boilerplate class/id patterns
  $(
    '[class*="nav"], [class*="footer"], [class*="header"], [class*="cookie"], [class*="banner"], [id*="nav"], [id*="footer"], [id*="header"]'
  ).remove();

  // Get the remaining text, collapse whitespace
  const text = $("body").text().replace(/\s+/g, " ").trim();

  return text;
}
