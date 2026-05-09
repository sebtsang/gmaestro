/**
 * Composio Connect Link generation.
 *
 * The founder runs `gmaestro connect <toolkit>` (or clicks Connect in the
 * dashboard), we generate a one-shot OAuth URL, they complete the flow in
 * their browser, Composio redirects back to /api/composio/callback (Session 3
 * owns that route).
 *
 * Per-toolkit `auth_config_id` values are read from
 * `process.env.COMPOSIO_AUTH_<TOOLKIT>` to keep the foundation env schema
 * frozen — they're populated during `gmaestro setup`.
 */

import "server-only";
import { getComposio } from "./composio";
import { env } from "@/lib/shared/env";

const authConfigEnvKey = (toolkit: string) =>
  `COMPOSIO_AUTH_${toolkit.toUpperCase()}`;

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
  const authConfigId = process.env[authConfigEnvKey(toolkit)];
  if (!authConfigId) {
    throw new IntegrationNotConfiguredError(toolkit, authConfigEnvKey(toolkit));
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

/** Thrown when the founder tries to connect a toolkit before configuring its auth_config_id. */
export class IntegrationNotConfiguredError extends Error {
  constructor(
    public toolkit: string,
    public envVar: string,
  ) {
    super(
      `Composio toolkit "${toolkit}" is not configured. ` +
        `Set ${envVar} in ~/.gmaestro/.env (run \`pnpm gmaestro setup\`).`,
    );
    this.name = "IntegrationNotConfiguredError";
  }
}
