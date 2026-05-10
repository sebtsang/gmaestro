/**
 * Composio auth config IDs for the shared hackathon project.
 *
 * Auth configs are per-Composio-project resources; each `composio.connectedAccounts.link()`
 * call needs an authConfigId to know which OAuth flow to launch. The IDs below
 * were created via `pnpm tsx scripts/foundation/setup-auth-configs.ts` on the
 * shared GMaestro hackathon project (Composio org `ok_c66D29VWUsT3`,
 * project `pr_vMFxuHJYXEPp`, claimed by sebtsang9497@gmail.com).
 *
 * On a fresh install, the user's auth configs will have DIFFERENT IDs.
 * `getAuthConfigId()` below checks `~/.gmaestro/auth-configs.json` first (where
 * the setup script writes per-machine values) and falls back to the static map.
 *
 * Owned by: Foundation. Session 2's `lib/tools/connect.ts` imports `getAuthConfigId`.
 */

import "server-only";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Static fallback for the shared hackathon project. Generated on 2026-05-09.
 * 10 Tier-S toolkits + 3 Tier-A toolkits with managed auth.
 *
 * Apollo, Loom, Twitter are Composio-supported but require BYO OAuth credentials.
 * They're omitted here; if you need them, add custom auth configs in the Composio
 * dashboard and extend this map.
 */
export const SHARED_AUTH_CONFIG_IDS = {
  // Tier-S — content publishing + research toolkits
  GITHUB: "ac_cDbm2PkV6fAE", // PR-with-markdown to static-site repo
  LINKEDIN: "ac_SYdu3EiWTab5", // research read + native post create
  NOTION: "ac_3y-pCR1XXmw_", // Notion-as-blog database insert
  SLACK: "ac_Lu0dQWcjpBj3", // alt chat surface + content digest
  LINEAR: "ac_iqjQml1XG5Nw", // content task tickets
  // Legacy GTM toolkits (kept; not foregrounded in content workflow)
  GMAIL: "ac_2hputMiwYvxP",
  GOOGLECALENDAR: "ac_NKCrziL3f78H",
  GOOGLESHEETS: "ac_H_GFIjPzvr-h",
  HUBSPOT: "ac_t902_TzR-QrR",
  STRIPE: "ac_32H-16Pfi1nO",
  // Tier-A
  DISCORD: "ac_vc9-Gs8jOqvm",
  INTERCOM: "ac_UsUYGpryr6n5",
  CALENDLY: "ac_uhA3APM6PLC6",
  // Content-pivot additions — Firecrawl is the docs/company scraper used by
  // the Researcher's Pattern B fetch. Each teammate still needs to connect
  // their own Firecrawl API key on the Composio side; this id just tells the
  // app which auth config to look up at runtime.
  FIRECRAWL: "ac_X_lMXeDzr7EF",
  // Other content-pivot additions — TBD ids; create via:
  //   pnpm tsx scripts/foundation/setup-auth-configs.ts --toolkits REDDIT,TWITTER,WORDPRESS
  // Then replace the "ac_TBD_..." strings with the returned ids.
  // REDDIT: "ac_TBD_REDDIT",       // managed OAuth via Composio
  // TWITTER: "ac_TBD_TWITTER",     // BYO OAuth (founder supplies dev creds)
  // WORDPRESS: "ac_TBD_WORDPRESS", // managed OAuth (.com flow); slug verify pending
} as const satisfies Record<string, string>;

export type Toolkit = keyof typeof SHARED_AUTH_CONFIG_IDS;

/** Toolkits we can demo against. */
export const SUPPORTED_TOOLKITS = Object.keys(SHARED_AUTH_CONFIG_IDS) as Toolkit[];

/**
 * Toolkits we display on the Connections page but DO NOT yet have a
 * pre-created auth config for. Connecting these requires either:
 *   - OAUTH2: run `composio.authConfigs.create({ toolkit, type: "use_composio_auth" })`
 *     once and add the returned id to SHARED_AUTH_CONFIG_IDS
 *   - BYO: register your own OAuth app / API key with the third party first,
 *     then create an auth config in Composio's dashboard with those creds
 *
 * The cards show a "Setup required" state instead of a working Connect button.
 */
export const EXTRA_DISPLAYED_TOOLKITS = [
  // Content publishing — primary destinations (auth config TBD)
  "REDDIT",
  "TWITTER",
  "WORDPRESS",
  "GHOST",
  "WEBFLOW",
  "HASHNODE",
  "MEDIUM",
  "SUBSTACK",
  "DEV", // dev.to
  // Content research + grounding
  "FIRECRAWL",
  "PERPLEXITY",
  "TAVILY",
  "EXA",
  "GOOGLE_SEARCH_CONSOLE",
  "GOOGLE_ANALYTICS",
  "SEMRUSH",
  "AHREFS",
  // Listening for content signals
  "YOUTUBE",
  // Legacy GTM toolkits (kept; surfaced under "More")
  "OUTLOOK",
  "ZOOM",
  "SALESFORCE",
  "PIPEDRIVE",
  "ATTIO",
  "APOLLO",
  "HUNTER",
  "CRUNCHBASE",
  "CLAY",
  "LEMLIST",
  "INSTANTLY",
  "SMARTLEAD",
  "SALESLOFT",
  "ASANA",
  "JIRA",
  "MONDAY",
  "CLICKUP",
  "TRELLO",
  "MAILCHIMP",
  "CUSTOMERIO",
  "MIXPANEL",
  "AMPLITUDE",
  "POSTHOG",
  "GONG",
  "FIREFLIES",
  "CHORUS",
] as const;

export type ExtraToolkit = (typeof EXTRA_DISPLAYED_TOOLKITS)[number];

/** Union of pre-configured + extra-displayed toolkits. */
export const DISPLAYED_TOOLKITS: readonly string[] = [
  ...SUPPORTED_TOOLKITS,
  ...EXTRA_DISPLAYED_TOOLKITS,
];

/** True iff the toolkit has a real auth config wired (Connect button works). */
export function isAuthConfigured(toolkit: string): boolean {
  const upper = toolkit.toUpperCase();
  return upper in SHARED_AUTH_CONFIG_IDS;
}

const RUNTIME_PATH = path.join(os.homedir(), ".gmaestro", "auth-configs.json");

let runtimeCache: Record<string, string> | null | undefined = undefined;

function readRuntimeMap(): Record<string, string> | null {
  if (runtimeCache !== undefined) return runtimeCache;
  if (!fs.existsSync(RUNTIME_PATH)) {
    runtimeCache = null;
    return null;
  }
  try {
    runtimeCache = JSON.parse(fs.readFileSync(RUNTIME_PATH, "utf-8")) as Record<
      string,
      string
    >;
  } catch {
    runtimeCache = null;
  }
  return runtimeCache;
}

/**
 * Returns the authConfigId for a given toolkit.
 *
 * Resolution order:
 *   1. `~/.gmaestro/auth-configs.json` (per-machine, written by setup script)
 *   2. SHARED_AUTH_CONFIG_IDS static map (committed, hackathon project)
 *
 * Throws if the toolkit isn't found in either source.
 */
export function getAuthConfigId(toolkit: string): string {
  const upper = toolkit.toUpperCase();
  const runtime = readRuntimeMap();
  if (runtime && typeof runtime[upper] === "string") {
    return runtime[upper];
  }
  if (upper in SHARED_AUTH_CONFIG_IDS) {
    return SHARED_AUTH_CONFIG_IDS[upper as Toolkit];
  }
  throw new Error(
    `No auth config for toolkit "${toolkit}". Add it to ${RUNTIME_PATH} or ` +
      `lib/shared/auth-configs.ts (run \`pnpm tsx scripts/foundation/setup-auth-configs.ts\` ` +
      `to regenerate from your Composio project).`,
  );
}

/** Returns the resolved auth config map (runtime + static merged). */
export function getAllAuthConfigIds(): Record<string, string> {
  const runtime = readRuntimeMap();
  return { ...SHARED_AUTH_CONFIG_IDS, ...(runtime ?? {}) };
}
