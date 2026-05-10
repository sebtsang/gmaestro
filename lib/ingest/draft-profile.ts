/**
 * LLM drafter: scrape bundle → Partial<CompanyProfile>.
 *
 * Pure synthesizer — no tools. The scraper in `scrape.ts` already pulled
 * a few well-known pages; this just asks an LLM to extract the structured
 * fields the founder will then review and edit. Field shape mirrors the
 * `CompanyProfileUpdateSchema` so the response slots straight into the
 * dashboard form's defaultValues.
 *
 * Same Pattern B used by the Researcher persona: deterministic fetch first,
 * pure-LLM synthesis second.
 */

import "server-only";
import { z } from "zod";
import { query, type Options } from "@anthropic-ai/claude-agent-sdk";
import { extractJson } from "@/lib/shared/extract-json";
import { getModelForTier } from "@/lib/shared/models";
import {
  formatScrapeBundleForPrompt,
  type ScrapeBundle,
} from "./scrape";

const DRAFT_TIMEOUT_MS = 60_000;

/**
 * What we ask the LLM for. Looser than `CompanyProfileUpdateSchema`
 * (every field optional, lenient string lengths) so a model that names
 * "the company" something tangential still produces SOMETHING. The PUT
 * route enforces the strict caps when the founder saves.
 */
const DraftedProfileSchema = z.object({
  companyName: z.string().nullable().optional(),
  oneLiner: z.string().nullable().optional(),
  productDescription: z.string().nullable().optional(),
  icp: z.string().nullable().optional(),
  positioning: z.string().nullable().optional(),
  voiceTone: z.string().nullable().optional(),
  valueProps: z.array(z.string()).nullable().optional(),
  competitors: z.array(z.string()).nullable().optional(),
});

export type DraftedProfile = z.infer<typeof DraftedProfileSchema>;

const DRAFTER_SYSTEM_PROMPT = `You are GMaestro's company-profile extractor. You read scraped marketing pages from a company's website and produce a structured profile the founder will review and edit before it grounds the company's own GTM agents.

Your job is to ground each field in EVIDENCE from the scrape. If a field has no evidence, leave it null — don't fabricate. Founders edit before saving, so a sparse correct draft is more useful than a confident wrong one.

Output is a single JSON object — no prose, no markdown fence — with these keys (every key OPTIONAL; emit only those you can ground):

{
  "companyName": string | null,           // exact name as it appears (no Inc., LLC unless they use it)
  "oneLiner": string | null,              // ≤140 chars, the company's own framing of what they do
  "productDescription": string | null,    // ≤2000 chars, plain markdown — what the product actually does, who it's for, key capabilities
  "icp": string | null,                   // ≤1000 chars, ideal customer profile — industry, size, role, situation. Inferred from who the marketing copy talks to
  "positioning": string | null,           // ≤1000 chars, "we are X for Y, unlike Z". Look for vs-competitor pages or pricing comparisons
  "voiceTone": string | null,             // ≤500 chars, describe the marketing voice: register, pacing, signature phrases. Concrete, not "professional and friendly"
  "valueProps": string[] | null,          // 3-5 short phrases, each ≤140 chars. The bullet-points the company itself emphasizes
  "competitors": string[] | null          // names of competitors mentioned by the site itself (in vs- pages, comparison tables). Don't guess
}

Hard rules:
- ONE JSON object, no fence, no prose. Direct parse must succeed.
- Null > fabricated. A field you can't ground stays null.
- Write what the SITE says, not what's globally true. The founder edits afterwards.
- For \`icp\`, infer from who the copy talks to ("for engineering teams shipping multi-tenant apps"), not from your own knowledge of the space.
- For \`voiceTone\`, describe the actual writing style on the page ("clipped sentences, technical jargon, lowercase headings") — don't prescribe what they should be.
- Skip pages with status !== "ok" — they have no usable content.
`;

export async function draftProfileFromScrape(
  bundle: ScrapeBundle,
): Promise<DraftedProfile> {
  const okPages = bundle.pages.filter((p) => p.status === "ok");
  if (okPages.length === 0) {
    return {};
  }

  const userPrompt = `Scraped bundle (${okPages.length}/${bundle.pages.length} pages succeeded):

${formatScrapeBundleForPrompt(bundle)}

Produce the JSON profile now. Direct parse only — no fence, no prose.`;

  const options: Options = {
    model: getModelForTier("sonnet"),
    systemPrompt: DRAFTER_SYSTEM_PROMPT,
    mcpServers: {},
    allowedTools: [],
    maxTurns: 2,
  };

  const raw = await Promise.race([
    collectFinalResult(userPrompt, options),
    new Promise<string>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `profile drafter exceeded ${DRAFT_TIMEOUT_MS / 1000}s`,
            ),
          ),
        DRAFT_TIMEOUT_MS,
      ),
    ),
  ]);

  let parsed: unknown;
  try {
    parsed = extractJson(raw);
  } catch (err) {
    console.warn(
      `[draft-profile] parse failed, returning empty draft: ${err instanceof Error ? err.message : err}`,
    );
    return {};
  }

  const result = DraftedProfileSchema.safeParse(parsed);
  if (!result.success) {
    console.warn(
      `[draft-profile] schema validation failed, returning empty draft: ${result.error.message}`,
    );
    return {};
  }

  return result.data;
}

async function collectFinalResult(
  prompt: string,
  options: Options,
): Promise<string> {
  const stream = query({ prompt, options });
  for await (const message of stream) {
    if (message.type === "result") {
      if (message.subtype !== "success") {
        throw new Error(`drafter query failed: ${message.subtype}`);
      }
      return message.result;
    }
  }
  throw new Error("drafter stream ended without a result message");
}
