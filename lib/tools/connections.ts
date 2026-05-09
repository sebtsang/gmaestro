/**
 * Stateless Composio connection-status helper.
 *
 * Composio's `connectedAccounts.list` is the authoritative store of which
 * toolkits the founder has connected — there is no good reason to mirror
 * that into a local SQLite table (the previous pattern caused four months
 * of duplicate-row, casing, and stale-status bugs). This module is the
 * single read path the dashboard uses; cleanup of stale connection records
 * lives in the OAuth callback.
 *
 * Cache: a 30-second in-process Map keyed on `userId|sortedSlugs`. Plenty
 * fast for the 1–2 dashboard pages that read from it, immediate enough that
 * a successful OAuth callback reflects on the next dashboard render after
 * `invalidateConnections(userId)` runs.
 */

import "server-only";
import { getComposio } from "./composio";

/**
 * Composio's connection status enum, narrowed to the values we observe.
 * `MISSING` is our addition — Composio simply omits the toolkit from the
 * list response when no connected_account exists.
 */
export type ToolkitStatus =
  | "ACTIVE"
  | "INITIALIZING"
  | "EXPIRED"
  | "FAILED"
  | "MISSING";

export interface ToolkitConnection {
  /** Lowercase Composio toolkit slug (e.g. "gmail"). */
  toolkit: string;
  status: ToolkitStatus;
  /** The connected_account id (`ca_*`) we'd dispatch through, if any. */
  connectedAccountId: string | null;
}

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { ts: number; data: ToolkitConnection[] }>();

/**
 * Look up the live connection status for each requested toolkit. Always
 * returns one entry per requested toolkit, in the requested order.
 *
 * If multiple connected_accounts exist for a (userId, toolkit) pair (e.g.
 * the user retried OAuth and Composio left INITIALIZING + EXPIRED records
 * around the new ACTIVE one), this returns the BEST status. The OAuth
 * callback is responsible for cleaning up stale records — see
 * `app/api/composio/callback/route.ts` for the deletion path.
 */
export async function getConnectionStatuses(
  userId: string,
  toolkits: readonly string[],
): Promise<ToolkitConnection[]> {
  if (toolkits.length === 0) return [];

  const slugs = toolkits.map((t) => t.toLowerCase());
  const cacheKey = `${userId}|${[...new Set(slugs)].sort().join(",")}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    // Return entries in the requested order even though the cache is keyed
    // by sorted slugs (caller ordering doesn't change the API call).
    return slugs.map(
      (s) =>
        cached.data.find((c) => c.toolkit === s) ??
        ({ toolkit: s, status: "MISSING", connectedAccountId: null } as const),
    );
  }

  const composio = getComposio();
  const resp = await composio.connectedAccounts.list({
    userIds: [userId],
    toolkitSlugs: slugs,
  });
  const items =
    (
      resp as {
        items?: Array<{
          id: string;
          status: string;
          toolkit?: { slug?: string };
        }>;
      }
    ).items ?? [];

  // Group by toolkit and pick the highest-rank status per group. ACTIVE
  // wins over INITIALIZING wins over EXPIRED/FAILED.
  const byToolkit = new Map<
    string,
    { id: string; status: ToolkitStatus }
  >();
  for (const item of items) {
    const slug = (item.toolkit?.slug ?? "").toLowerCase();
    if (!slug) continue;
    const status = normalizeStatus(item.status);
    const existing = byToolkit.get(slug);
    if (!existing || rank(status) > rank(existing.status)) {
      byToolkit.set(slug, { id: item.id, status });
    }
  }

  const result: ToolkitConnection[] = slugs.map((slug) => {
    const found = byToolkit.get(slug);
    if (!found) {
      return { toolkit: slug, status: "MISSING", connectedAccountId: null };
    }
    return {
      toolkit: slug,
      status: found.status,
      connectedAccountId: found.id,
    };
  });

  cache.set(cacheKey, { ts: Date.now(), data: result });
  return result;
}

/**
 * Drop all cached entries for a userId. Call this from the OAuth callback
 * after a successful connect so the next dashboard render hits Composio
 * for fresh state instead of serving the (now-stale) cached miss.
 */
export function invalidateConnections(userId: string): void {
  for (const key of [...cache.keys()]) {
    if (key.startsWith(`${userId}|`)) cache.delete(key);
  }
}

/** Convenience: which toolkits in the input set are currently ACTIVE? */
export function activeToolkits(
  connections: readonly ToolkitConnection[],
): string[] {
  return connections.filter((c) => c.status === "ACTIVE").map((c) => c.toolkit);
}

function normalizeStatus(raw: string): ToolkitStatus {
  switch (raw) {
    case "ACTIVE":
    case "INITIALIZING":
    case "EXPIRED":
    case "FAILED":
      return raw;
    default:
      return "FAILED";
  }
}

function rank(status: ToolkitStatus): number {
  switch (status) {
    case "ACTIVE":
      return 4;
    case "INITIALIZING":
      return 3;
    case "EXPIRED":
      return 2;
    case "FAILED":
      return 1;
    case "MISSING":
      return 0;
  }
}
