/**
 * Reconcile the local `connections` table against Composio's
 * `connectedAccounts.list` API for a given set of toolkits.
 *
 * Why: the local table can drift — old runs may have left rows marked
 * "connected" even after the OAuth token expired or the founder revoked
 * access. Reading the local table alone tells the dashboard what *was*
 * connected, not what *is*. Right before rendering surfaces that depend
 * on liveness (e.g. the approval card's provider picker — which providers
 * can the founder dispatch through right now?), we hit Composio for
 * truth and upsert.
 *
 * This is intentionally narrow: pass the toolkits you care about, get
 * back a Map of fresh statuses. The Connections page still has its own
 * (broader) reconciliation flow over `DISPLAYED_TOOLKITS`.
 */

import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getComposio } from "@/lib/tools/composio";
import { db, schema } from "./db";
import type { ConnectionStatus } from "@/lib/shared/types";

const RECONCILE_TIMEOUT_MS = 6_000;
const COMPOSIO_TIMEOUT_PER_TOOLKIT_MS = 3_000;

export interface ToolkitStatus {
  toolkit: string;
  status: ConnectionStatus;
  connectedAccountId: string | null;
}

/**
 * Reconcile a set of toolkits and return their fresh status. Fail-soft: a
 * Composio API blip on one toolkit doesn't fail the others — the affected
 * row falls back to whatever's already in the local table.
 *
 * Best-effort: an outer timeout (6s) caps total work so a slow Composio
 * API doesn't hang the dashboard. Anything not reconciled in time is
 * returned with the last-known status from the local table.
 */
export async function reconcileToolkits(
  userId: string,
  toolkits: readonly string[],
): Promise<ToolkitStatus[]> {
  if (toolkits.length === 0) return [];

  const reconciled = await Promise.race([
    reconcileAll(userId, toolkits),
    new Promise<ToolkitStatus[]>((resolve) =>
      setTimeout(
        async () => resolve(await readLocalStatuses(userId, toolkits)),
        RECONCILE_TIMEOUT_MS,
      ),
    ),
  ]);

  return reconciled;
}

async function reconcileAll(
  userId: string,
  toolkits: readonly string[],
): Promise<ToolkitStatus[]> {
  const results = await Promise.all(
    toolkits.map((toolkit) => reconcileOne(userId, toolkit)),
  );
  return results;
}

async function reconcileOne(
  userId: string,
  toolkit: string,
): Promise<ToolkitStatus> {
  try {
    const fresh = await Promise.race([
      composioStatus(userId, toolkit),
      new Promise<{ status: ConnectionStatus; connectedAccountId: string | null }>(
        (_, reject) =>
          setTimeout(
            () => reject(new Error("composio list timed out")),
            COMPOSIO_TIMEOUT_PER_TOOLKIT_MS,
          ),
      ),
    ]);
    await upsertLocal(userId, toolkit, fresh);
    return { toolkit, ...fresh };
  } catch {
    // Composio API blip / timeout — return what's in the local table so
    // the picker can still render reasonable choices.
    const fallback = await readLocalStatus(userId, toolkit);
    return fallback;
  }
}

async function composioStatus(
  userId: string,
  toolkit: string,
): Promise<{ status: ConnectionStatus; connectedAccountId: string | null }> {
  const composio = getComposio();
  const resp = await composio.connectedAccounts.list({
    userIds: [userId],
    toolkitSlugs: [toolkit.toLowerCase()],
  });
  const items =
    (resp as { items?: Array<{ id: string; status: string }> }).items ?? [];
  const active = items.find((i) => i.status === "ACTIVE");
  if (active) {
    return { status: "connected", connectedAccountId: active.id };
  }
  // Map the worst non-ACTIVE status we see to a useful local enum, falling
  // back to "pending" when Composio reports nothing.
  const failed = items.find(
    (i) => i.status === "FAILED" || i.status === "EXPIRED",
  );
  if (failed) {
    return { status: failed.status === "EXPIRED" ? "revoked" : "failed", connectedAccountId: failed.id };
  }
  return { status: "pending", connectedAccountId: null };
}

async function upsertLocal(
  userId: string,
  toolkit: string,
  fresh: { status: ConnectionStatus; connectedAccountId: string | null },
): Promise<void> {
  // Local connections rows use UPPERCASE toolkit keys to match the OAuth
  // callback's convention (which writes the toolkit param verbatim from the
  // URL — and the static auth-config map keys are uppercase). Mixing cases
  // here creates duplicate rows that the connections page then misreads
  // as "revoked" because the lowercase reconcile-written row sits next to
  // the uppercase callback-written one.
  const slug = toolkit.toUpperCase();
  const existing = await db
    .select({ id: schema.connections.id })
    .from(schema.connections)
    .where(
      and(
        eq(schema.connections.userId, userId),
        eq(schema.connections.toolkit, slug),
      ),
    )
    .limit(1);

  if (existing.length === 0) {
    await db.insert(schema.connections).values({
      id: randomUUID(),
      userId,
      toolkit: slug,
      status: fresh.status,
      connectedAccountId: fresh.connectedAccountId,
      connectedAt: fresh.status === "connected" ? new Date() : null,
    });
    return;
  }
  await db
    .update(schema.connections)
    .set({
      status: fresh.status,
      connectedAccountId: fresh.connectedAccountId,
      connectedAt: fresh.status === "connected" ? new Date() : null,
    })
    .where(eq(schema.connections.id, existing[0].id));
}

async function readLocalStatus(
  userId: string,
  toolkit: string,
): Promise<ToolkitStatus> {
  const slug = toolkit.toUpperCase();
  const rows = await db
    .select({
      status: schema.connections.status,
      connectedAccountId: schema.connections.connectedAccountId,
    })
    .from(schema.connections)
    .where(
      and(
        eq(schema.connections.userId, userId),
        eq(schema.connections.toolkit, slug),
      ),
    )
    .limit(1);
  return {
    toolkit,
    status: rows[0]?.status ?? "pending",
    connectedAccountId: rows[0]?.connectedAccountId ?? null,
  };
}

async function readLocalStatuses(
  userId: string,
  toolkits: readonly string[],
): Promise<ToolkitStatus[]> {
  return Promise.all(toolkits.map((t) => readLocalStatus(userId, t)));
}
