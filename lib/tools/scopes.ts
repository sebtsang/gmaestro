/**
 * Per-persona Composio action scopes.
 *
 * Action names are Composio tool slugs WITHOUT the `mcp__composio__` prefix.
 * Claude Agent SDK gets the prefixed form via `getAllowedToolsForPersona()`
 * in `./composio.ts`.
 *
 * Critical guardrails (enforced by absence here, not just by prompt):
 *  - LinkedIn is READ-ONLY for the researcher. No other persona may touch it.
 *    LinkedIn enforces ~100–500 msg/day per account; automating outbound at
 *    scale gets the founder's account banned. All outbound = Gmail.
 *  - Writer NEVER gets GMAIL_SEND. It only drafts (GMAIL_DRAFT). Drafts are
 *    flipped to sent by the Approval Gate (Session 1).
 *  - Scheduler does get GMAIL_SEND, but its system prompt must constrain it
 *    to calendar invite emails only.
 */

import type { PersonaId } from "@/lib/shared/types";

// Composio meta-tools that batch-mode personas use to fan out tool calls
// server-side via one MCP round-trip (instead of N sequential calls).
const COMPOSIO_META_TOOLS = [
  "COMPOSIO_MULTI_EXECUTE_TOOL",
  "COMPOSIO_SEARCH_TOOLS",
] as const;

export const PERSONA_SCOPES: Record<PersonaId, readonly string[]> = {
  researcher: [
    "LINKEDIN_SEARCH_PERSON",
    "LINKEDIN_GET_PROFILE",
    "LINKEDIN_GET_COMPANY",
    "APOLLO_ENRICH_EMAIL",
    "GITHUB_SEARCH_CODE",
    ...COMPOSIO_META_TOOLS,
  ],
  qualifier: ["HUBSPOT_SEARCH_CONTACTS", ...COMPOSIO_META_TOOLS],
  strategist: [],
  writer: ["GMAIL_DRAFT", "LOOM_CREATE_VIDEO"],
  scheduler: [
    "GOOGLECALENDAR_FIND_FREE_SLOTS",
    "GOOGLECALENDAR_CREATE_EVENT",
    "GMAIL_SEND",
  ],
  "brief-writer": [
    "NOTION_CREATE_PAGE",
    "NOTION_APPEND_BLOCK",
    "GMAIL_SEARCH",
  ],
  activation: [
    "GMAIL_DRAFT",
    "INTERCOM_SEND_MESSAGE",
    "STRIPE_GET_SUBSCRIPTION",
    "STRIPE_LIST_CUSTOMERS",
  ],
  "crm-logger": [
    "HUBSPOT_CREATE_CONTACT",
    "HUBSPOT_UPDATE_DEAL",
    "HUBSPOT_ADD_NOTE",
    "GOOGLESHEETS_APPEND_ROW",
    ...COMPOSIO_META_TOOLS,
  ],
  "pipeline-reporter": [
    "HUBSPOT_SEARCH_CONTACTS",
    "GOOGLESHEETS_READ_RANGE",
    "SLACK_POST_MESSAGE",
  ],
  "slack-digest": ["SLACK_POST_MESSAGE", "SLACK_UPDATE_MESSAGE"],
  "feedback-tagger": [],
  "theme-synthesizer": ["NOTION_CREATE_PAGE"],
  "linear-filer": ["LINEAR_CREATE_ISSUE", "GITHUB_CREATE_ISSUE"],
};

/** Union of every action across every persona. Used to seed the MCP config. */
export const ALL_ACTIONS: readonly string[] = Array.from(
  new Set(Object.values(PERSONA_SCOPES).flat()),
);

/**
 * Toolkit slugs (Composio's lowercase namespace) derived from action prefixes.
 * Used to seed the MCP config with the right toolkit catalog.
 */
export const ALL_TOOLKITS: readonly string[] = Array.from(
  new Set(
    ALL_ACTIONS.map((a) => a.split("_")[0]?.toLowerCase()).filter(
      (s): s is string => Boolean(s),
    ),
  ),
);
