/**
 * Company-context Pattern B fetch.
 *
 * Given a company URL, scrapes (via Firecrawl) the homepage + recent blog posts
 * and computes a `VoiceFingerprint` the Strategist + Writer use to mimic the
 * company's voice. Mechanical extraction — see PITCH.md / the plan file for
 * the 10 rules this implements.
 *
 * This is the killer feature of the 3-input form: founder doesn't paste voice
 * samples manually anymore — the system extracts them from existing content.
 */

import "server-only";
import type { VoiceFingerprint } from "@/lib/shared/types";
import { getComposio } from "@/lib/tools/composio";

// Bumped 12s → 25s to give Firecrawl headroom when waitFor is set —
// SPAs (Mintlify, Docusaurus, Vercel-hosted docs) need JS render time
// before the markdown extraction is meaningful.
// Bumped 25s → 40s to accommodate the longer waitFor.
const PER_FETCH_TIMEOUT_MS = 40_000;
const MAX_BLOG_POSTS = 5;
// Firecrawl JS-render wait. Bumped 2500 → 5000ms (2026-05-10) — Composio's
// own docs are Vercel-hosted Next.js client-side-rendered (the SSR'd HTML
// is just the JS shell); 2.5s wasn't enough for full hydration. 5s covers
// most slow-hydrating SPAs.
const FIRECRAWL_WAIT_FOR_MS = 5000;

/** Words flagged as marketing-speak. Stripped from output unless source posts use them. */
const MARKETING_BANNED = [
  "leverage",
  "empower",
  "unlock",
  "seamless",
  "robust",
  "cutting-edge",
  "best-in-class",
  "synergy",
  "delve",
  "tapestry",
  "navigate the landscape",
] as const;

export interface CompanyContextBundle {
  fingerprint: VoiceFingerprint;
  /** Status of each sub-fetch so the LLM can decide what to trust. */
  status: {
    homepage: "ok" | "not_connected" | "auth_failed" | "rate_limited" | "error" | "skipped";
    blog: "ok" | "not_found" | "not_connected" | "auth_failed" | "rate_limited" | "error" | "skipped";
  };
  fetchedAt: string;
  /** Raw scraped artifacts kept for the synthesizer's own reasoning. */
  raw: {
    homepageMarkdown?: string;
    blogIndexMarkdown?: string;
    blogPosts?: Array<{ url: string; markdown: string }>;
  };
}

/**
 * Hit the company URL + try to discover and scrape recent blog posts. Never
 * throws — always returns a bundle with status flags so the synthesizer can
 * stamp confidence.
 */
export async function fetchCompanyContextBundle(
  userId: string,
  companyUrl: string,
): Promise<CompanyContextBundle> {
  const homepage = await safeFirecrawl(userId, companyUrl);
  // Try the conventional /blog index. If it 404s or has no links, we
  // gracefully degrade to a fingerprint built from just the homepage.
  const blogIndexUrl = joinUrl(companyUrl, "/blog");
  const blogIndex = await safeFirecrawl(userId, blogIndexUrl);

  let blogPosts: Array<{ url: string; markdown: string }> = [];
  let blogStatus: CompanyContextBundle["status"]["blog"] = "not_found";

  if (blogIndex.status === "ok" && typeof blogIndex.markdown === "string") {
    const postUrls = extractBlogPostLinks(blogIndex.markdown, companyUrl).slice(
      0,
      MAX_BLOG_POSTS,
    );
    if (postUrls.length > 0) {
      const fetched = await Promise.all(
        postUrls.map((u) =>
          safeFirecrawl(userId, u).then((r) => ({
            url: u,
            markdown: r.status === "ok" ? r.markdown ?? "" : "",
          })),
        ),
      );
      blogPosts = fetched.filter((p) => p.markdown.length > 200);
      blogStatus = blogPosts.length > 0 ? "ok" : "not_found";
    }
  } else {
    blogStatus = blogIndex.status === "ok" ? "not_found" : (blogIndex.status as typeof blogStatus);
  }

  const fingerprint = computeFingerprint({
    homepageMarkdown: homepage.markdown,
    blogPosts: blogPosts.map((p) => p.markdown),
  });

  return {
    fingerprint,
    status: {
      homepage: homepage.status as CompanyContextBundle["status"]["homepage"],
      blog: blogStatus,
    },
    fetchedAt: new Date().toISOString(),
    raw: {
      homepageMarkdown: homepage.markdown,
      blogIndexMarkdown: blogIndex.markdown,
      blogPosts,
    },
  };
}

// ---------------------------------------------------------------------------
//  VoiceFingerprint computation — the 10 mechanical rules
// ---------------------------------------------------------------------------

interface FingerprintInput {
  homepageMarkdown?: string;
  blogPosts: string[];
}

function computeFingerprint(input: FingerprintInput): VoiceFingerprint {
  const corpus = input.blogPosts.length > 0 ? input.blogPosts : input.homepageMarkdown ? [input.homepageMarkdown] : [];

  if (corpus.length === 0) {
    return defaultFingerprint();
  }

  return {
    sentenceLength: sentenceLengthStats(corpus),
    pronounMode: detectPronounMode(corpus),
    hookPattern: detectHookPattern(corpus),
    headingStyle: detectHeadingStyle(corpus),
    codeBlocksPerPost: averageCodeBlocks(corpus),
    opinionDensity: opinionMarkerDensity(corpus),
    bannedWords: scanBannedWords(corpus),
    closingPattern: detectClosingPattern(corpus),
    statDensity: numericClaimDensity(corpus),
    wordsPerSection: wordsPerSectionRatio(corpus),
    samples: input.blogPosts.slice(0, 3),
    productDescription: extractProductDescription(input.homepageMarkdown),
    companyName: extractCompanyName(input.homepageMarkdown),
  };
}

function defaultFingerprint(): VoiceFingerprint {
  return {
    sentenceLength: { mean: 18, stdev: 6 },
    pronounMode: "we",
    hookPattern: "stat-led",
    headingStyle: "topical",
    codeBlocksPerPost: 2,
    opinionDensity: 2,
    bannedWords: [...MARKETING_BANNED],
    closingPattern: "single-line-punch",
    statDensity: 2,
    wordsPerSection: 350,
    samples: [],
  };
}

function sentenceLengthStats(corpus: string[]): { mean: number; stdev: number } {
  const sentences = corpus.flatMap((p) => splitSentences(stripMarkdownNoise(p)));
  if (sentences.length === 0) return { mean: 18, stdev: 6 };
  const wordCounts = sentences.map((s) => s.split(/\s+/).filter(Boolean).length).filter((n) => n > 0);
  const mean = wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length;
  const variance =
    wordCounts.reduce((acc, n) => acc + (n - mean) ** 2, 0) / wordCounts.length;
  return { mean: round1(mean), stdev: round1(Math.sqrt(variance)) };
}

function detectPronounMode(corpus: string[]): "we" | "i" | "neutral" {
  let we = 0,
    i = 0;
  for (const post of corpus) {
    const text = post.toLowerCase();
    we += (text.match(/\b(we|our|us)\b/g) ?? []).length;
    i += (text.match(/\b(i|my|me|i'm|i've|i'll|i'd)\b/g) ?? []).length;
  }
  if (we === 0 && i === 0) return "neutral";
  if (we > i * 2) return "we";
  if (i > we * 2) return "i";
  return "neutral";
}

function detectHookPattern(corpus: string[]): VoiceFingerprint["hookPattern"] {
  const hooks = corpus
    .map((p) => firstNWords(stripMarkdownNoise(p), 100).toLowerCase())
    .filter((h) => h.length > 50);
  if (hooks.length === 0) return "stat-led";

  let stat = 0,
    contrarian = 0,
    anomaly = 0,
    announcement = 0;

  for (const h of hooks) {
    if (/\d+%|\d+x|\d+\s+(million|thousand|hundred)/i.test(h)) stat++;
    if (/\b(but|actually|however|wrong|broken|isn't|doesn't|fails?)\b/i.test(h)) contrarian++;
    if (/\b(noticed|discovered|found|observed|started seeing)\b/i.test(h)) anomaly++;
    if (/\b(launching|introducing|announcing|today we|excited to|today we're)\b/i.test(h))
      announcement++;
  }

  const max = Math.max(stat, contrarian, anomaly, announcement);
  if (max === 0) return "stat-led";
  if (max === announcement) return "announcement";
  if (max === anomaly) return "anomaly";
  if (max === contrarian) return "contrarian";
  return "stat-led";
}

function detectHeadingStyle(corpus: string[]): VoiceFingerprint["headingStyle"] {
  const h2s = corpus.flatMap((p) => p.match(/^##\s+(.+)$/gm) ?? []).map((h) => h.replace(/^##\s+/, ""));
  if (h2s.length === 0) return "topical";

  let question = 0,
    named = 0,
    topical = 0;
  for (const h of h2s) {
    if (h.endsWith("?")) question++;
    else if (/^(The|A|An)\s+\w+(\s+\w+){1,2}$/i.test(h.trim())) named++;
    else topical++;
  }
  const max = Math.max(question, named, topical);
  if (max === named) return "named-concept";
  if (max === question) return "question";
  return "topical";
}

function averageCodeBlocks(corpus: string[]): number {
  if (corpus.length === 0) return 0;
  const counts = corpus.map((p) => (p.match(/```/g) ?? []).length / 2);
  return round1(counts.reduce((a, b) => a + b, 0) / counts.length);
}

function opinionMarkerDensity(corpus: string[]): number {
  if (corpus.length === 0) return 0;
  const totalWords = corpus.reduce(
    (acc, p) => acc + p.split(/\s+/).filter(Boolean).length,
    0,
  );
  if (totalWords === 0) return 0;
  const markers = corpus.reduce((acc, p) => {
    const m =
      (p.toLowerCase().match(
        /\b(we (think|believe|found|argue|see|learned)|in our (experience|view)|the truth is|here's what|the reality is)\b/g,
      ) ?? []).length;
    return acc + m;
  }, 0);
  return round1((markers / totalWords) * 1000);
}

function scanBannedWords(corpus: string[]): string[] {
  const allText = corpus.join("\n").toLowerCase();
  const found = new Set<string>(MARKETING_BANNED);
  // If a marketing word DOES appear in source posts, the company actually uses
  // it — drop it from the banned list (don't fight the founder's voice).
  for (const word of MARKETING_BANNED) {
    if (allText.includes(word)) found.delete(word);
  }
  return Array.from(found);
}

function detectClosingPattern(corpus: string[]): VoiceFingerprint["closingPattern"] {
  const closings = corpus
    .map((p) => {
      const sentences = splitSentences(stripMarkdownNoise(p));
      return sentences.slice(-2).join(" ");
    })
    .filter((c) => c.length > 20);
  if (closings.length === 0) return "single-line-punch";

  let punch = 0,
    wrapping = 0,
    cta = 0;
  for (const c of closings) {
    if (/\b(try it|sign up|get started|start today|join us|book a|talk to)/i.test(c))
      cta++;
    else if (/\b(in summary|to recap|wrapping up|takeaways|in conclusion)/i.test(c))
      wrapping++;
    else punch++;
  }
  const max = Math.max(punch, wrapping, cta);
  if (max === cta) return "cta-only";
  if (max === wrapping) return "wrapping-up";
  return "single-line-punch";
}

function numericClaimDensity(corpus: string[]): number {
  if (corpus.length === 0) return 0;
  const totalWords = corpus.reduce(
    (acc, p) => acc + p.split(/\s+/).filter(Boolean).length,
    0,
  );
  if (totalWords === 0) return 0;
  const numerics = corpus.reduce((acc, p) => {
    return acc + (p.match(/\b\d{1,3}(\.\d+)?(%|x|×|k|m|b)?\b/gi) ?? []).length;
  }, 0);
  return round1((numerics / totalWords) * 1000);
}

function wordsPerSectionRatio(corpus: string[]): number {
  if (corpus.length === 0) return 350;
  const ratios: number[] = [];
  for (const post of corpus) {
    const wordCount = post.split(/\s+/).filter(Boolean).length;
    const h2Count = (post.match(/^##\s+/gm) ?? []).length;
    if (h2Count > 0) ratios.push(wordCount / h2Count);
  }
  if (ratios.length === 0) return 350;
  return Math.round(ratios.reduce((a, b) => a + b, 0) / ratios.length);
}

function extractProductDescription(homepageMarkdown?: string): string | undefined {
  if (!homepageMarkdown) return undefined;
  // Take the first non-heading paragraph longer than 80 chars — usually the hero subtitle.
  const paragraphs = homepageMarkdown
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => !p.startsWith("#") && !p.startsWith("```") && p.length > 80 && p.length < 600);
  return paragraphs[0];
}

function extractCompanyName(homepageMarkdown?: string): string | undefined {
  if (!homepageMarkdown) return undefined;
  // Try the first H1; fall back to the first H2.
  const h1 = homepageMarkdown.match(/^#\s+([^\n]+)/m)?.[1]?.trim();
  if (h1 && h1.length < 60) return h1;
  return undefined;
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function stripMarkdownNoise(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ") // code blocks
    .replace(/`[^`]+`/g, " ") // inline code
    .replace(/!\[.*?\]\(.*?\)/g, " ") // images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links — keep visible text
    .replace(/^#{1,6}\s+.*$/gm, " ") // headings
    .replace(/^\s*[-*+]\s+/gm, "") // bullets
    .replace(/[*_~`>]/g, "");
}

function firstNWords(text: string, n: number): string {
  return text.split(/\s+/).slice(0, n).join(" ");
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function joinUrl(base: string, path: string): string {
  try {
    return new URL(path, base).toString();
  } catch {
    return base.replace(/\/$/, "") + (path.startsWith("/") ? path : "/" + path);
  }
}

function extractBlogPostLinks(blogIndexMarkdown: string, baseUrl: string): string[] {
  // Pull markdown links pointing at /blog/<slug> on the same origin.
  const links = new Set<string>();
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let baseOrigin = "";
  try {
    baseOrigin = new URL(baseUrl).origin;
  } catch {
    return [];
  }
  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(blogIndexMarkdown)) !== null) {
    const href = match[2];
    if (!href) continue;
    let abs: string;
    try {
      abs = new URL(href, baseUrl).toString();
    } catch {
      continue;
    }
    if (!abs.startsWith(baseOrigin)) continue;
    if (!/\/blog\/[^\/?]+/.test(abs)) continue;
    if (/\/blog\/?$/.test(abs)) continue;
    links.add(abs.split("#")[0].split("?")[0]);
  }
  return Array.from(links);
}

interface FirecrawlResult {
  status: "ok" | "not_found" | "not_connected" | "auth_failed" | "rate_limited" | "error" | "skipped";
  markdown?: string;
  error?: string;
}

async function safeFirecrawl(userId: string, url: string): Promise<FirecrawlResult> {
  try {
    const data = (await Promise.race([
      getComposio().tools.execute("FIRECRAWL_SCRAPE", {
        userId,
        arguments: {
          url,
          formats: ["markdown"],
          // JS-render wait + main-content-only stripping. Mintlify-hosted
          // docs (Composio, Resend, Mintlify-as-a-platform) ship a JS shell
          // — without waitFor, Firecrawl returns the shell instead of the
          // rendered docs. onlyMainContent strips nav/footer/sidebar so
          // the markdown is the actual article body, not boilerplate.
          waitFor: FIRECRAWL_WAIT_FOR_MS,
          onlyMainContent: true,
        },
        dangerouslySkipVersionCheck: true,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`firecrawl timeout: ${url}`)), PER_FETCH_TIMEOUT_MS),
      ),
    ])) as { markdown?: string; data?: { markdown?: string }; content?: string } | undefined;

    const markdown =
      typeof data?.markdown === "string"
        ? data.markdown
        : typeof data?.content === "string"
          ? data.content
          : typeof data?.data?.markdown === "string"
            ? data.data.markdown
            : undefined;

    if (!markdown || markdown.length < 100) {
      return { status: "not_found" };
    }
    return { status: "ok", markdown };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (
      /\b1810\b|\b1811\b|connectedaccount.*notfound|no\s+(connected|active)\s+(account|connection)|not[\s_-]?connected/i.test(
        message,
      )
    ) {
      return { status: "not_connected", error: message };
    }
    if (/401|unauthor|expired|revoked/i.test(message)) {
      return { status: "auth_failed", error: message };
    }
    if (/429|rate[\s_-]?limit|too many requests/i.test(message)) {
      return { status: "rate_limited", error: message };
    }
    if (/404|not found/i.test(message)) {
      return { status: "not_found", error: message };
    }
    return { status: "error", error: message };
  }
}

/**
 * Standalone doc-page fetch. Same Firecrawl shape, single URL, no fingerprint
 * computation — pure content scrape.
 */
export async function fetchDocBundle(
  userId: string,
  docsUrl: string,
): Promise<{ status: FirecrawlResult["status"]; markdown?: string; error?: string; fetchedAt: string }> {
  const result = await safeFirecrawl(userId, docsUrl);
  return {
    ...result,
    fetchedAt: new Date().toISOString(),
  };
}
