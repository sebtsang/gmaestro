/**
 * Composio Connect Link generation.
 *
 * The founder runs `gmaestro connect <toolkit>` (or clicks Connect in the
 * dashboard), we generate a one-shot OAuth URL, they complete the flow in
 * their browser, Composio redirects back to /api/composio/callback (Session 3
 * owns that route).
 *
 * `authConfigId` lookup goes through `getAuthConfigId()` from
 * `@/lib/shared/auth-configs`, which checks `~/.gmaestro/auth-configs.json`
 * first (per-machine override) then falls back to the static
 * SHARED_AUTH_CONFIG_IDS map Foundation pre-populated via the agent-native
 * Composio signup. Founders don't have to set 13 env vars manually.
 */

import "server-only";
import { getComposio } from "./composio";
import { env } from "@/lib/shared/env";
import { getAuthConfigId } from "@/lib/shared/auth-configs";

/**
 * Returns a redirect URL the founder visits to OAuth into `toolkit`.
 *
 * Uses `composio.connectedAccounts.link()` (NOT `.initiate()`, which returns
 * 400 for orgs created after 2026-05-08 per PLAN.md audit).
 */
export async function generateConnectLink(
  userId: string,
  toolkit: string,
): Promise<string> {
  let authConfigId: string;
  try {
    authConfigId = getAuthConfigId(toolkit);
  } catch (cause) {
    throw new IntegrationNotConfiguredError(toolkit, cause);
  }

  const composio = getComposio();
  const conn = await composio.connectedAccounts.link(userId, authConfigId, {
    callbackUrl:
      `${env().GMAESTRO_BASE_URL}/api/composio/callback` +
      `?toolkit=${encodeURIComponent(toolkit)}` +
      `&userId=${encodeURIComponent(userId)}`,
  });
  if (!conn.redirectUrl) {
    throw new Error(
      `Composio returned a connection request without a redirectUrl ` +
        `(toolkit=${toolkit}, connectionId=${conn.id}). The auth_config may ` +
        `be misconfigured.`,
    );
  }
  return conn.redirectUrl;
}

/** Thrown when the founder tries to connect a toolkit not in the auth-configs map. */
export class IntegrationNotConfiguredError extends Error {
  constructor(
    public toolkit: string,
    cause?: unknown,
  ) {
    super(
      `Composio toolkit "${toolkit}" has no auth config. ` +
        `Add it via \`pnpm tsx scripts/foundation/setup-auth-configs.ts\` ` +
        `or extend SHARED_AUTH_CONFIG_IDS in lib/shared/auth-configs.ts.`,
    );
    this.name = "IntegrationNotConfiguredError";
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}
