/**
 * Pattern B fetch layer for the content researcher persona.
 *
 * Why this exists: research is the one persona that genuinely benefits from
 * external data lookups (Reddit threads, X discussions, competitor blogs,
 * existing AI-search citation footprints) — but having the LLM pick tools
 * mid-reasoning hits tool-selection hallucination + retry loops on smaller
 * models. We do the lookups in deterministic code FIRST, hand the result
 * bundle to a pure-LLM synthesizer SECOND.
 *
 * Failure modes are first-class. Every fetch returns a `status` enum so
 * the synthesizer LLM can stamp confidence flags ("reddit: ok" vs
 * "reddit: auth_failed") and never has to guess whether the absence
 * of a field means "nothing relevant" or "lookup blew up".
 */

import "server-only";
import { z } from "zod";
import { getComposio } from "@/lib/tools/composio";

// Bumped 8s → 25s to accommodate Firecrawl waitFor (2.5s JS render + scrape time).
const PER_FETCH_TIMEOUT_MS = 25_000;

const FetchStatusSchema = z.enum([
  /** Tool returned data the synthesizer can use. */
  "ok",
  /** Tool ran but found nothing (e.g. no Reddit threads on this topic). */
  "not_found",
  /** Composio reports the toolkit isn't connected for this user. */
  "not_connected",
  /** OAuth token expired / revoked. */
  "auth_failed",
  /** Rate limited — try again later. */
  "rate_limited",
  /** Unexpected — included for completeness; details in `error`. */
  "error",
  /** We didn't even try (e.g. no topic or no competitor URLs to scrape). */
  "skipped",
]);
export type FetchStatus = z.infer<typeof FetchStatusSchema>;

const ResearcherFetchBundleSchema = z.object({
  reddit: z.object({
    status: FetchStatusSchema,
    threads: z.array(z.unknown()).optional(),
    error: z.string().optional(),
  }),
  twitter: z.object({
    status: FetchStatusSchema,
    posts: z.array(z.unknown()).optional(),
    error: z.string().optional(),
  }),
  competitorBlogs: z.object({
    status: FetchStatusSchema,
    pages: z.array(z.object({ url: z.string(), markdown: z.string() })).optional(),
    error: z.string().optional(),
  }),
  citationFootprint: z.object({
    status: FetchStatusSchema,
    answer: z.string().optional(),
    citations: z.array(z.unknown()).optional(),
    error: z.string().optional(),
  }),
  fetchedAt: z.string(),
});
export type ResearcherFetchBundle = z.infer<typeof ResearcherFetchBundleSchema>;

export interface TopicForFetch {
  /** The seed topic / theme to research (the founder's prompt or a candidate). */
  topic: string;
  /**
   * Company name for the citation-footprint Perplexity probe. When provided,
   * the prompt becomes "Sources cited by ChatGPT/Perplexity when asked about
   * <topic> in <industry>; do they include <companyName>?".
   */
  companyName?: string;
  /** Competitor blog URLs to scrape via Firecrawl (max 3). */
  competitorUrls?: string[];
}

/**
 * Hit each research integration once and return a typed bundle. Never throws
 * — always returns SOMETHING, with statuses marking what worked.
 *
 * The persona dispatcher splats this into the researcher's prompt as
 * `fetchBundle: {...}`; the LLM then writes a TopicResearchBrief from it.
 */
export async function fetchResearcherBundle(
  userId: string,
  topic: TopicForFetch,
): Promise<ResearcherFetchBundle> {
  const [reddit, twitter, competitorBlogs, citationFootprint] = await Promise.all([
    fetchReddit(userId, topic),
    fetchTwitter(userId, topic),
    fetchCompetitorBlogs(userId, topic),
    fetchCitationFootprint(userId, topic),
  ]);
  return {
    reddit,
    twitter,
    competitorBlogs,
    citationFootprint,
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchReddit(
  userId: string,
  topic: TopicForFetch,
): Promise<ResearcherFetchBundle["reddit"]> {
  if (!topic.topic) return { status: "skipped" };
  return safeExecute("REDDIT_SEARCH_POSTS", () => {
    const composio = getComposio();
    return composio.tools.execute("REDDIT_SEARCH_POSTS", {
      userId,
      arguments: {
        query: topic.topic,
        sort: "relevance",
        limit: 10,
      },
      dangerouslySkipVersionCheck: true,
    });
  }).then((r) => ({
    status: r.status,
    threads: Array.isArray(r.data) ? r.data : r.data ? [r.data] : undefined,
    error: r.error,
  }));
}

async function fetchTwitter(
  userId: string,
  topic: TopicForFetch,
): Promise<ResearcherFetchBundle["twitter"]> {
  if (!topic.topic) return { status: "skipped" };
  return safeExecute("TWITTER_SEARCH_TWEETS", () => {
    const composio = getComposio();
    return composio.tools.execute("TWITTER_SEARCH_TWEETS", {
      userId,
      arguments: {
        query: topic.topic,
        max_results: 10,
      },
      dangerouslySkipVersionCheck: true,
    });
  }).then((r) => ({
    status: r.status,
    posts: Array.isArray(r.data) ? r.data : r.data ? [r.data] : undefined,
    error: r.error,
  }));
}

async function fetchCompetitorBlogs(
  userId: string,
  topic: TopicForFetch,
): Promise<ResearcherFetchBundle["competitorBlogs"]> {
  const urls = (topic.competitorUrls ?? []).slice(0, 3);
  if (urls.length === 0) return { status: "skipped" };
  // Run scrapes in parallel; aggregate into one bundle entry.
  const results = await Promise.all(
    urls.map((url) =>
      safeExecute("FIRECRAWL_SCRAPE", () => {
        const composio = getComposio();
        return composio.tools.execute("FIRECRAWL_SCRAPE", {
          userId,
          arguments: {
            url,
            formats: ["markdown"],
            // JS-render wait + strip nav/footer (Mintlify, Docusaurus, etc.).
            waitFor: 2500,
            onlyMainContent: true,
          },
          dangerouslySkipVersionCheck: true,
        });
      }).then((r) => ({
        url,
        ok: r.status === "ok",
        markdown: extractMarkdown(r.data),
        error: r.error,
      })),
    ),
  );
  const ok = results.filter((r) => r.ok && r.markdown);
  if (ok.length === 0) {
    return {
      status: results.some((r) => r.error) ? "error" : "not_found",
      error: results.find((r) => r.error)?.error,
    };
  }
  return {
    status: "ok",
    pages: ok.map((r) => ({ url: r.url, markdown: r.markdown! })),
  };
}

async function fetchCitationFootprint(
  userId: string,
  topic: TopicForFetch,
): Promise<ResearcherFetchBundle["citationFootprint"]> {
  if (!topic.topic) return { status: "skipped" };
  const company = topic.companyName ? ` Mention whether ${topic.companyName} is among the cited sources.` : "";
  return safeExecute("PERPLEXITY_ASK", () => {
    const composio = getComposio();
    return composio.tools.execute("PERPLEXITY_ASK", {
      userId,
      arguments: {
        query:
          `What sources are typically cited by AI search engines (ChatGPT, Perplexity, Claude, Gemini) when answering questions about: ${topic.topic}.` +
          company,
      },
      dangerouslySkipVersionCheck: true,
    });
  }).then((r) => {
    const data = r.data as { answer?: string; citations?: unknown[] } | undefined;
    return {
      status: r.status,
      answer: data?.answer,
      citations: data?.citations,
      error: r.error,
    };
  });
}

function extractMarkdown(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const obj = data as Record<string, unknown>;
  if (typeof obj.markdown === "string") return obj.markdown;
  if (typeof obj.content === "string") return obj.content;
  if (obj.data && typeof obj.data === "object") {
    const inner = obj.data as Record<string, unknown>;
    if (typeof inner.markdown === "string") return inner.markdown;
  }
  return undefined;
}

interface SafeExecuteResult {
  status: FetchStatus;
  data?: unknown;
  error?: string;
}

/**
 * Executes a Composio call within a timeout, normalizing the outcome to a
 * { status, data?, error? } shape. Maps known failure modes to typed
 * statuses (auth, rate-limit, not-connected) so the synthesizer prompt
 * doesn't have to interpret raw error strings.
 */
async function safeExecute(
  toolName: string,
  fn: () => Promise<unknown>,
): Promise<SafeExecuteResult> {
  try {
    const data = await Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`${toolName} fetch timed out`)),
          PER_FETCH_TIMEOUT_MS,
        ),
      ),
    ]);
    return { status: "ok", data };
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
    return { status: "error", error: message };
  }
}
