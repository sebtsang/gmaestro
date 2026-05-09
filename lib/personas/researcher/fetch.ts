/**
 * Pattern B fetch layer for the researcher persona.
 *
 * Why this exists: research is the one persona that genuinely benefits from
 * external data lookups (LinkedIn, Apollo, etc.) — but having the LLM pick
 * tools mid-reasoning hits tool-selection hallucination + retry loops on
 * smaller models. We do the lookups in deterministic code FIRST, hand the
 * result bundle to a pure-LLM synthesizer SECOND. Same architecture Clay's
 * waterfall + 11x post-rebuild + Perplexity all converged on.
 *
 * Failure modes are first-class. Every fetch returns a `status` enum so
 * the synthesizer LLM can stamp confidence flags ("linkedin: ok" vs
 * "linkedin: auth_failed") and never has to guess whether the absence
 * of a field means "not in profile" or "lookup blew up".
 */

import "server-only";
import { z } from "zod";
import { getComposio } from "@/lib/tools/composio";

const PER_FETCH_TIMEOUT_MS = 8_000;

const FetchStatusSchema = z.enum([
  /** Tool returned data the synthesizer can use. */
  "ok",
  /** Tool ran but found nothing (e.g. lead has no LinkedIn). */
  "not_found",
  /** Composio reports the toolkit isn't connected for this user. */
  "not_connected",
  /** OAuth token expired / revoked. */
  "auth_failed",
  /** Rate limited — try again later. */
  "rate_limited",
  /** Unexpected — included for completeness; details in `error`. */
  "error",
  /** We didn't even try (e.g. no email to feed Apollo). */
  "skipped",
]);
export type FetchStatus = z.infer<typeof FetchStatusSchema>;

const ResearcherFetchBundleSchema = z.object({
  linkedin: z.object({
    status: FetchStatusSchema,
    profile: z.unknown().optional(),
    error: z.string().optional(),
  }),
  apollo: z.object({
    status: FetchStatusSchema,
    person: z.unknown().optional(),
    error: z.string().optional(),
  }),
  fetchedAt: z.string(),
});
export type ResearcherFetchBundle = z.infer<typeof ResearcherFetchBundleSchema>;

export interface LeadForFetch {
  email?: string;
  name?: string;
  company?: string;
}

/**
 * Hit each enrichment integration once and return a typed bundle. Never
 * throws — always returns SOMETHING, with statuses marking what worked.
 *
 * The persona dispatcher splats this into the researcher's prompt as
 * `fetchBundle: {...}`; the LLM then writes an EnrichedLead from it.
 */
export async function fetchResearcherBundle(
  userId: string,
  lead: LeadForFetch,
): Promise<ResearcherFetchBundle> {
  const [linkedin, apollo] = await Promise.all([
    fetchLinkedIn(userId, lead),
    fetchApollo(userId, lead),
  ]);
  return {
    linkedin,
    apollo,
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchLinkedIn(
  userId: string,
  lead: LeadForFetch,
): Promise<ResearcherFetchBundle["linkedin"]> {
  if (!lead.name && !lead.email) {
    return { status: "skipped" };
  }
  return safeExecute("LINKEDIN_SEARCH_PERSON", () => {
    const composio = getComposio();
    return composio.tools.execute("LINKEDIN_SEARCH_PERSON", {
      userId,
      arguments: {
        keywords: [lead.name, lead.company].filter(Boolean).join(" "),
      },
      dangerouslySkipVersionCheck: true,
    });
  }).then((r) => ({
    status: r.status,
    profile: r.data,
    error: r.error,
  }));
}

async function fetchApollo(
  userId: string,
  lead: LeadForFetch,
): Promise<ResearcherFetchBundle["apollo"]> {
  if (!lead.email) {
    return { status: "skipped" };
  }
  return safeExecute("APOLLO_PEOPLE_ENRICHMENT", () => {
    const composio = getComposio();
    return composio.tools.execute("APOLLO_PEOPLE_ENRICHMENT", {
      userId,
      arguments: { email: lead.email },
      dangerouslySkipVersionCheck: true,
    });
  }).then((r) => ({
    status: r.status,
    person: r.data,
    error: r.error,
  }));
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
