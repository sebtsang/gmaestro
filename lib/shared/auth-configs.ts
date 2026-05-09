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
  // Tier-S
  GMAIL: "ac_2hputMiwYvxP",
  GOOGLECALENDAR: "ac_NKCrziL3f78H",
  GOOGLESHEETS: "ac_H_GFIjPzvr-h",
  SLACK: "ac_Lu0dQWcjpBj3",
  NOTION: "ac_3y-pCR1XXmw_",
  HUBSPOT: "ac_t902_TzR-QrR",
  LINEAR: "ac_iqjQml1XG5Nw",
  STRIPE: "ac_32H-16Pfi1nO",
  GITHUB: "ac_cDbm2PkV6fAE",
  LINKEDIN: "ac_SYdu3EiWTab5",
  // Tier-A (3 of 6 — Apollo/Loom/Twitter need custom OAuth)
  DISCORD: "ac_vc9-Gs8jOqvm",
  INTERCOM: "ac_UsUYGpryr6n5",
  CALENDLY: "ac_uhA3APM6PLC6",
} as const satisfies Record<string, string>;

export type Toolkit = keyof typeof SHARED_AUTH_CONFIG_IDS;

/** Toolkits we can demo against. */
export const SUPPORTED_TOOLKITS = Object.keys(SHARED_AUTH_CONFIG_IDS) as Toolkit[];

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
