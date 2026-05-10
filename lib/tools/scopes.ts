/**
 * Per-persona Composio action scopes — content / blog / GEO domain.
 *
 * Action names are Composio tool slugs WITHOUT the `mcp__composio__` prefix.
 * Claude Agent SDK gets the prefixed form via `getAllowedToolsForPersona()`
 * in `./composio.ts`.
 *
 * Architecture rule: every content persona is **pure-LLM** in the orchestration
 * layer (Pattern B universal). Researcher's external data (Reddit / X /
 * Firecrawl / Perplexity) is fetched deterministically in TypeScript at
 * `lib/personas/researcher/fetch.ts` BEFORE the LLM is invoked, and splatted
 * into the prompt as `fetchBundle: {...}`. Publishing happens post-approval
 * via the deterministic dispatcher in `lib/dispatch/execute.ts` calling
 * `composio.tools.execute()` directly — never via the LLM mid-thought.
 *
 * Critical guardrails (enforced by absence here, not just by prompt):
 *  - LinkedIn READ is researcher-only (handled in fetch.ts; not exposed to LLM).
 *  - Writer NEVER publishes. Only the post-approval dispatcher can publish.
 *  - Reddit / X / Firecrawl / Perplexity reads happen in fetch.ts (deterministic).
 *  - Reddit / LinkedIn / GitHub / Notion / Twitter / WordPress writes happen
 *    in the dispatcher post-approval (deterministic).
 */

import type { PersonaId } from "@/lib/shared/types";

export const PERSONA_SCOPES: Record<PersonaId, readonly string[]> = {
  // Researcher uses Pattern B: deterministic Composio fetches happen in code
  // (lib/personas/researcher/fetch.ts) BEFORE the LLM is invoked. The fetched
  // bundle is splatted into the prompt as `fetchBundle` and the LLM
  // synthesizes a TopicResearchBrief from it. No mid-loop tool calling.
  researcher: [],
  // Strategist reasons over the researcher's bundle + company profile to
  // produce a ContentOutline. Pure-LLM.
  strategist: [],
  // Writer is a pure LLM reasoner — produces a BlogDraft (markdown). Publishing
  // happens post-approval via the deterministic dispatcher.
  writer: [],
  // GEO-Editor reasons over the draft + GEO signal rules to produce an
  // enriched draft. Pure-LLM.
  "geo-editor": [],
  // Formatter reasons over an approved BlogDraft + the founder's picked
  // targets list to emit per-channel ChannelVariant content. Pure-LLM —
  // dispatcher does the actual publish call.
  formatter: [],
  // Pipeline Reporter is a pure synthesizer — produces a content-performance
  // summary the dashboard renders + Slack Digest reads as previousOutputs.
  "pipeline-reporter": [],
  // Slack Digest produces a content-update digest block; the dashboard's
  // post-approval handler is what posts to Slack via composio.tools.execute().
  "slack-digest": [],
  // Insight personas — pure-LLM tagging / clustering / ticketing.
  "feedback-tagger": [],
  // Theme Synthesizer + Linear Filer write the artifact's "url" as a sentinel
  // the dashboard rewrites at post-approval send time. Pure-LLM personas.
  "theme-synthesizer": [],
  "linear-filer": [],
};

/** Union of every action across every persona. Used to seed the MCP config. */
export const ALL_ACTIONS: readonly string[] = Array.from(
  new Set(Object.values(PERSONA_SCOPES).flat()),
);

/**
 * Toolkit slugs (Composio's lowercase namespace) derived from action prefixes.
 * Used to seed the MCP config with the right toolkit catalog.
 *
 * Even though no persona currently has direct tool access (Pattern B), we
 * still seed the MCP config with the toolkits the deterministic dispatcher +
 * fetch.ts will call — that's what makes the per-user instance URL light up
 * the right Connect buttons.
 */
export const ALL_TOOLKITS: readonly string[] = [
  // Used by the Researcher's Pattern B fetch
  "reddit",
  "twitter",
  "linkedin",
  "firecrawl",
  "perplexity",
  // Used by the post-approval dispatcher for publishing
  "github",
  "wordpress",
  "ghost",
  "notion",
  // Used by Slack Digest + alt chat surface
  "slack",
  // Used by Linear Filer for content task tickets
  "linear",
];
