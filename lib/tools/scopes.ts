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

// Slugs verified against Composio's live tool catalog (probed 2026-05-09).
// Many of the names changed since the original PLAN.md was written:
//   GMAIL_DRAFT → GMAIL_CREATE_EMAIL_DRAFT
//   GMAIL_SEND → GMAIL_SEND_EMAIL  (plus GMAIL_SEND_DRAFT for the gate)
//   GMAIL_SEARCH → GMAIL_FETCH_EMAILS
//   SLACK_POST_MESSAGE → SLACK_SEND_MESSAGE
//   SLACK_UPDATE_MESSAGE → SLACK_UPDATES_A_SLACK_MESSAGE
//   NOTION_CREATE_PAGE → NOTION_CREATE_NOTION_PAGE
//   NOTION_APPEND_BLOCK → NOTION_APPEND_BLOCK_CHILDREN
//   GOOGLESHEETS_APPEND_ROW → GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND
//   GOOGLESHEETS_READ_RANGE → GOOGLESHEETS_LOOKUP_SPREADSHEET_ROW
//   HUBSPOT_ADD_NOTE → HUBSPOT_CREATE_NOTE
//   HUBSPOT_SEARCH_CONTACTS → HUBSPOT_SEARCH_CONTACTS_BY_CRITERIA
//   LINEAR_CREATE_ISSUE → LINEAR_CREATE_LINEAR_ISSUE
//   GITHUB_CREATE_ISSUE → GITHUB_CREATE_AN_ISSUE
//   LINKEDIN_SEARCH_PERSON / LINKEDIN_GET_PROFILE → LINKEDIN_GET_PERSON
//   LINKEDIN_GET_COMPANY → LINKEDIN_GET_COMPANY_INFO
//   APOLLO_ENRICH_EMAIL → APOLLO_PEOPLE_ENRICHMENT (+ APOLLO_PEOPLE_SEARCH)
//   INTERCOM_SEND_MESSAGE → INTERCOM_REPLY_TO_CONVERSATION + INTERCOM_CREATE_CONVERSATION
//   LOOM_CREATE_VIDEO → no Composio actions exist for Loom currently; dropped.
export const PERSONA_SCOPES: Record<PersonaId, readonly string[]> = {
  // Researcher uses Pattern B: deterministic Composio fetches happen in code
  // (lib/personas/researcher/fetch.ts) BEFORE the LLM is invoked. The fetched
  // bundle is splatted into the persona prompt as `fetchBundle` and the LLM
  // synthesizes an EnrichedLead from it. No mid-loop tool calling.
  researcher: [],
  // Qualifier reasons over rawMessage + previousOutputs (researcher's bundle
  // and synthesis) to assign tier/fit/intent. No Composio calls — HubSpot
  // dedup gating moves to a post-approval dispatch path if/when we wire it.
  qualifier: [],
  strategist: [],
  // Writer is a pure LLM reasoner — it produces a structured draft artifact for
  // the dashboard's approval surface. Composio integration (Gmail/Outlook send)
  // happens post-approval at the dispatch layer, not inside the LLM loop.
  writer: [],
  scheduler: [
    "GOOGLECALENDAR_FIND_FREE_SLOTS",
    "GOOGLECALENDAR_CREATE_EVENT",
    "GMAIL_SEND_EMAIL",
  ],
  "brief-writer": [
    "NOTION_CREATE_NOTION_PAGE",
    "NOTION_APPEND_BLOCK_CHILDREN",
    "GMAIL_FETCH_EMAILS",
  ],
  activation: [
    "GMAIL_CREATE_EMAIL_DRAFT",
    "INTERCOM_REPLY_TO_CONVERSATION",
    "INTERCOM_CREATE_CONVERSATION",
    "STRIPE_GET_SUBSCRIPTION",
    "STRIPE_LIST_CUSTOMERS",
  ],
  "crm-logger": [
    "HUBSPOT_CREATE_CONTACT",
    "HUBSPOT_UPDATE_DEAL",
    "HUBSPOT_CREATE_NOTE",
    "GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND",
    ...COMPOSIO_META_TOOLS,
  ],
  "pipeline-reporter": [
    "HUBSPOT_SEARCH_CONTACTS_BY_CRITERIA",
    "GOOGLESHEETS_LOOKUP_SPREADSHEET_ROW",
    "SLACK_SEND_MESSAGE",
  ],
  "slack-digest": ["SLACK_SEND_MESSAGE", "SLACK_UPDATES_A_SLACK_MESSAGE"],
  "feedback-tagger": [],
  "theme-synthesizer": ["NOTION_CREATE_NOTION_PAGE"],
  "linear-filer": ["LINEAR_CREATE_LINEAR_ISSUE", "GITHUB_CREATE_AN_ISSUE"],
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
