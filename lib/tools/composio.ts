/**
 * Composio client + MCP wiring.
 *
 * Composio is the tool-execution layer. We talk to it two ways:
 *  1. Via MCP HTTP transport from inside Claude Agent SDK queries (most calls).
 *  2. Via direct `composio.tools.execute(...)` for deterministic actions that
 *     don't need an LLM in the loop (e.g., the Slack approval DM).
 *
 * Per-persona scoping happens via `allowedTools` on the SDK query, not on the
 * MCP server itself — one MCP config covers every persona, the query filters.
 */

import "server-only";
import { Composio } from "@composio/core";
import type { ComposioMcpConfig, PersonaId } from "@/lib/shared/types";
import { env } from "@/lib/shared/env";
import { ALL_ACTIONS, ALL_TOOLKITS, PERSONA_SCOPES } from "./scopes";

declare global {
  // eslint-disable-next-line no-var
  var __gmaestroComposio: Composio | undefined;
  // eslint-disable-next-line no-var
  var __gmaestroMcpConfigId: string | undefined;
}

export function getComposio(): Composio {
  return (globalThis.__gmaestroComposio ??= new Composio({
    apiKey: env().COMPOSIO_API_KEY,
  }));
}

// Bumped to v3 after correcting persona scope slugs against Composio's live
// catalog (the original PLAN.md slugs like GMAIL_DRAFT, SLACK_POST_MESSAGE,
// NOTION_CREATE_PAGE etc. don't exist — modern names are GMAIL_CREATE_EMAIL_DRAFT,
// SLACK_SEND_MESSAGE, NOTION_CREATE_NOTION_PAGE, etc.). v2 configs registered
// the wrong allowedTools list; v3 forces a fresh registration with the correct
// slugs. The self-healing cache validation in getOrCreateMcpConfigId evicts v2.
const MCP_CONFIG_NAME = "gmaestro-default-v3";

/**
 * Resolve the MCP config ID we'll generate per-user instances against.
 * Order: env var → in-memory cache → list-by-name on Composio → lazy-create.
 *
 * Composio's mcp.create rejects duplicate names with a 1151 error and there's
 * no upsert primitive — so on a fresh process where the in-memory cache is
 * empty (Next.js HMR, restart, multi-bundle isolation) we list first and
 * only create if nothing matches.
 */
async function getOrCreateMcpConfigId(): Promise<string> {
  if (process.env.COMPOSIO_MCP_CONFIG_ID) {
    return process.env.COMPOSIO_MCP_CONFIG_ID;
  }

  const composio = getComposio();

  // Validate any cached id still resolves to a config with the EXPECTED NAME.
  // Survives the case where MCP_CONFIG_NAME was bumped (e.g. allowedTools
  // changed) but globalThis still holds the previous version's id from an
  // earlier dev process — Next.js HMR doesn't clear globalThis.
  if (globalThis.__gmaestroMcpConfigId) {
    try {
      const cached = await composio.mcp.get(globalThis.__gmaestroMcpConfigId);
      if (cached?.name === MCP_CONFIG_NAME) {
        return globalThis.__gmaestroMcpConfigId;
      }
      // Stale (different name) → evict and fall through.
      globalThis.__gmaestroMcpConfigId = undefined;
    } catch {
      // 404 → evict and fall through.
      globalThis.__gmaestroMcpConfigId = undefined;
    }
  }

  const existing = await composio.mcp
    .list({ name: MCP_CONFIG_NAME, limit: 5, page: 1, toolkits: [], authConfigs: [] })
    .catch(() => ({ items: [] as Array<{ id: string; name: string }> }));
  const match = (existing.items ?? []).find((s) => s.name === MCP_CONFIG_NAME);
  if (match) {
    globalThis.__gmaestroMcpConfigId = match.id;
    return match.id;
  }

  try {
    const created = await composio.mcp.create(MCP_CONFIG_NAME, {
      toolkits: [...ALL_TOOLKITS],
      allowedTools: [...ALL_ACTIONS],
      manuallyManageConnections: true,
    });
    globalThis.__gmaestroMcpConfigId = created.id;
    return created.id;
  } catch (err) {
    // Race between list and create (or list returned a stale page) — re-list
    // and trust the duplicate.
    const recheck = await composio.mcp
      .list({ name: MCP_CONFIG_NAME, limit: 5, page: 1, toolkits: [], authConfigs: [] })
      .catch(() => ({ items: [] as Array<{ id: string; name: string }> }));
    const found = (recheck.items ?? []).find((s) => s.name === MCP_CONFIG_NAME);
    if (found) {
      globalThis.__gmaestroMcpConfigId = found.id;
      return found.id;
    }
    throw err;
  }
}

/**
 * Returns the MCP server config block to drop into Claude Agent SDK
 * `query({ options: { mcpServers: { composio: ... } } })`.
 *
 * Composio's MCP instance URL is self-authenticating (signed for this user),
 * so no headers are required — but we still return a `headers: {}` map to
 * satisfy the shared `ComposioMcpConfig` contract.
 */
export async function getMcpConfigForUser(
  userId: string,
): Promise<ComposioMcpConfig> {
  const composio = getComposio();
  const configId = await getOrCreateMcpConfigId();
  const instance = await composio.mcp.generate(userId, configId);
  return { type: "http", url: instance.url, headers: {} };
}

/** Allowed tools array for a persona, prefixed for Claude Agent SDK. */
export function getAllowedToolsForPersona(personaId: PersonaId): string[] {
  return PERSONA_SCOPES[personaId].map((a) => `mcp__composio__${a}`);
}

// ============================================================================
//  Per-tool rate limiter (token bucket)
//
//  IMPORTANT: This only throttles direct Composio calls (e.g., the Slack
//  approval DM). It does NOT throttle MCP-routed calls inside Claude queries
//  — those happen inside the Agent SDK process and would need MCP middleware
//  to throttle. For the hackathon, per-persona maxConcurrency in the
//  registry is the primary lever there.
// ============================================================================

type Bucket = {
  tokens: number;
  lastRefill: number;
  capacity: number;
  refillPerSec: number;
};

const buckets = new Map<string, Bucket>();

function bucketFor(action: string): Bucket {
  const isLinkedIn = action.startsWith("LINKEDIN_");
  const key = isLinkedIn ? "_linkedin" : "_default";
  let b = buckets.get(key);
  if (!b) {
    b = isLinkedIn
      ? { tokens: 1, lastRefill: Date.now(), capacity: 1, refillPerSec: 1 }
      : { tokens: 5, lastRefill: Date.now(), capacity: 5, refillPerSec: 5 };
    buckets.set(key, b);
  }
  return b;
}

/** Wrap a direct Composio call with a token-bucket rate limit. */
export async function withRateLimit<T>(
  action: string,
  fn: () => Promise<T>,
): Promise<T> {
  const b = bucketFor(action);
  // Loop until a token is available, then consume it.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const now = Date.now();
    const elapsedSec = (now - b.lastRefill) / 1000;
    b.tokens = Math.min(b.capacity, b.tokens + elapsedSec * b.refillPerSec);
    b.lastRefill = now;
    if (b.tokens >= 1) {
      b.tokens -= 1;
      return fn();
    }
    const waitMs = Math.ceil(((1 - b.tokens) / b.refillPerSec) * 1000);
    await new Promise((r) => setTimeout(r, waitMs));
  }
}

/**
 * Typed error: a persona tried to use a Composio toolkit the founder hasn't
 * connected. Session 1's workflow function catches this and marks the node
 * failed without crashing the whole workflow (per CLAUDE.md rule 11).
 */
export class IntegrationNotConnectedError extends Error {
  constructor(
    public toolkit: string,
    public userId: string,
    cause?: unknown,
  ) {
    super(
      `Composio toolkit "${toolkit}" is not connected for user "${userId}". ` +
        `Run /connect ${toolkit.toLowerCase()} from the dashboard.`,
    );
    this.name = "IntegrationNotConnectedError";
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}
