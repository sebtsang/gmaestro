/**
 * Static-HTML scraper for the company-profile auto-fill flow.
 *
 * Pattern B mirror of `lib/personas/researcher/fetch.ts`: deterministic
 * fetches happen here in code; the LLM only synthesizes. Each fetch is
 * wrapped in a timeout + status-enum so the drafter prompt can stamp
 * confidence ("homepage: ok" vs "homepage: error") instead of guessing
 * whether a missing field means "not on the page" or "lookup failed".
 *
 * No headless browser — SPA-only sites degrade to manual form entry,
 * which is acceptable for the demo.
 */

import "server-only";
import { load as loadHtml } from "cheerio";
import TurndownService from "turndown";

const PER_FETCH_TIMEOUT_MS = 8_000;
const TOTAL_FETCH_BUDGET_MS = 15_000;

/** Paths probed alongside the homepage. Each is best-effort — 404s are normal. */
const WELL_KNOWN_PATHS = ["/", "/about", "/pricing", "/product", "/features"];

/** Hard cap on per-page markdown so the drafter prompt stays bounded. */
const MAX_MARKDOWN_PER_PAGE = 6_000;

export type PageFetchStatus =
  | "ok"
  | "not_found"
  | "redirected_off_origin"
  | "blocked"
  | "timeout"
  | "error"
  | "skipped";

export interface PageFetch {
  path: string;
  url: string;
  status: PageFetchStatus;
  /** Cleaned markdown of the page's main text. Empty string when status !== "ok". */
  markdown: string;
  title: string | null;
  description: string | null;
  error?: string;
}

export interface ScrapeBundle {
  origin: string;
  pages: PageFetch[];
  fetchedAt: string;
}

/**
 * Fetch a small, well-known set of pages from the given URL's origin and
 * convert each to markdown. Always returns a bundle — failures are recorded
 * inline rather than thrown, so the drafter can reason about partial data.
 */
export async function scrapeCompanySite(rawUrl: string): Promise<ScrapeBundle> {
  let origin: string;
  try {
    origin = new URL(rawUrl).origin;
  } catch {
    throw new Error(`invalid URL: ${rawUrl}`);
  }

  const deadline = Date.now() + TOTAL_FETCH_BUDGET_MS;
  const pages = await Promise.all(
    WELL_KNOWN_PATHS.map((p) => fetchAndConvert(origin, p, deadline)),
  );

  return {
    origin,
    pages,
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchAndConvert(
  origin: string,
  path: string,
  deadline: number,
): Promise<PageFetch> {
  const url = `${origin}${path}`;
  if (Date.now() > deadline) {
    return {
      path,
      url,
      status: "skipped",
      markdown: "",
      title: null,
      description: null,
      error: "total fetch budget exhausted",
    };
  }
  try {
    const res = await fetchWithTimeout(url, PER_FETCH_TIMEOUT_MS);
    if (res.redirectedOffOrigin) {
      return {
        path,
        url,
        status: "redirected_off_origin",
        markdown: "",
        title: null,
        description: null,
      };
    }
    if (res.status === 404) {
      return {
        path,
        url,
        status: "not_found",
        markdown: "",
        title: null,
        description: null,
      };
    }
    if (res.status === 403 || res.status === 429) {
      return {
        path,
        url,
        status: "blocked",
        markdown: "",
        title: null,
        description: null,
        error: `HTTP ${res.status}`,
      };
    }
    if (res.status >= 400) {
      return {
        path,
        url,
        status: "error",
        markdown: "",
        title: null,
        description: null,
        error: `HTTP ${res.status}`,
      };
    }
    const { markdown, title, description } = htmlToMarkdown(res.body);
    return {
      path,
      url,
      status: "ok",
      markdown: markdown.slice(0, MAX_MARKDOWN_PER_PAGE),
      title,
      description,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout = /timed out/i.test(message);
    return {
      path,
      url,
      status: isTimeout ? "timeout" : "error",
      markdown: "",
      title: null,
      description: null,
      error: message,
    };
  }
}

interface FetchResult {
  status: number;
  body: string;
  redirectedOffOrigin: boolean;
}

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
): Promise<FetchResult> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: ac.signal,
      headers: {
        // Some sites block bare `node-fetch`-style UAs. Identify as a normal
        // browser so well-behaved CDNs don't 403 us out.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 GMaestroBot/0.1",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    const finalUrl = new URL(res.url);
    const requested = new URL(url);
    const redirectedOffOrigin = finalUrl.origin !== requested.origin;
    const body = redirectedOffOrigin ? "" : await res.text();
    return { status: res.status, body, redirectedOffOrigin };
  } catch (err) {
    if (ac.signal.aborted) throw new Error(`fetch timed out after ${timeoutMs}ms`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

interface HtmlConversion {
  markdown: string;
  title: string | null;
  description: string | null;
}

function htmlToMarkdown(html: string): HtmlConversion {
  const $ = loadHtml(html);

  // Strip noise that bloats the markdown without adding signal.
  $("script, style, noscript, iframe, svg, footer, nav, form").remove();
  $("[role='navigation'], [role='banner'], [aria-hidden='true']").remove();

  const title = ($("title").first().text() || "").trim() || null;
  const description =
    ($('meta[name="description"]').attr("content") || "").trim() ||
    ($('meta[property="og:description"]').attr("content") || "").trim() ||
    null;

  // Prefer <main>/<article> when present — landing pages without those
  // structural tags fall back to <body>.
  const $main = $("main").first();
  const $article = $("article").first();
  const $root =
    $main.length > 0 ? $main : $article.length > 0 ? $article : $("body");

  const turndown = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
  });
  // Drop image markdown — alt-text rarely helps the drafter and can carry
  // raw filenames that confuse the model.
  turndown.addRule("dropImages", {
    filter: ["img"],
    replacement: () => "",
  });

  const rawHtml = $.html($root);
  const md = turndown
    .turndown(rawHtml)
    // Collapse 3+ newlines to 2; turndown can leave gaps when nested
    // <div> wrappers were stripped.
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { markdown: md, title, description };
}

/**
 * Compact text representation of the bundle for inclusion in the drafter
 * prompt. Per-page sections are clearly labeled with their status so the
 * LLM can reason about partial data.
 */
export function formatScrapeBundleForPrompt(bundle: ScrapeBundle): string {
  const sections: string[] = [`SCRAPED ORIGIN: ${bundle.origin}`];
  for (const page of bundle.pages) {
    const header = `### ${page.path} (status=${page.status})`;
    if (page.status !== "ok") {
      sections.push(`${header}\n(no content${page.error ? ` — ${page.error}` : ""})`);
      continue;
    }
    const meta: string[] = [];
    if (page.title) meta.push(`title: ${page.title}`);
    if (page.description) meta.push(`meta-description: ${page.description}`);
    sections.push(
      `${header}\n${meta.join("\n")}${meta.length ? "\n\n" : ""}${page.markdown}`,
    );
  }
  return sections.join("\n\n---\n\n");
}
