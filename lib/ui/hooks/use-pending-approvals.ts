"use client";

/**
 * Single source of truth for pending/dismissed approvals on the client.
 *
 * Reads the shared event stream (`useSharedEvents`) and a module-level
 * resolved/dismissed-id store, then derives:
 *   - `pending`:   approvals the founder hasn't seen or has fresh after a dismiss/resume
 *   - `dismissed`: approvals temporarily muted via Escape/X (still un-resolved)
 *   - `resolved`:  terminal — never re-surfaces in either bucket
 *
 * Why module-level Sets? React state in `<LiveApprovalSurface>` is local to
 * that component instance, which means navigating to /approvals (a separate
 * page tree) can't see it. By promoting the state to module scope, both
 * pages observe the same lifecycle.
 *
 * In mock mode, approvals don't exist server-side, so we materialize them
 * via `buildMockApproval` directly from the `approval_requested` event.
 */

import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { ApprovalRequest } from "@/lib/shared/types";
import type { WireEvent } from "@/lib/realtime/events";
import { buildMockApproval } from "@/lib/ui/components/mock-approval-builder";
import { pickEvents } from "@/lib/ui/hooks/use-event-stream";
import {
  injectSharedEvent,
  useSharedEvents,
} from "@/lib/ui/hooks/use-shared-events";
import { MOCK_MODE } from "@/lib/ui/hooks/use-mock-driver";

interface IdsStore {
  resolved: Set<string>;
  dismissed: Set<string>;
  // Optional cache of hydrated approvals by id. In real mode we fetch from
  // the API; in mock mode we materialize from the event payload. Either way,
  // we want both pages to see the same hydrated body.
  hydrated: Map<string, ApprovalRequest>;
  listeners: Set<() => void>;
}

declare global {
  // eslint-disable-next-line no-var
  var __gmaestroPendingApprovalsStore: IdsStore | undefined;
}

function getIdsStore(): IdsStore {
  if (typeof window === "undefined") {
    return {
      resolved: new Set(),
      dismissed: new Set(),
      hydrated: new Map(),
      listeners: new Set(),
    };
  }
  if (!globalThis.__gmaestroPendingApprovalsStore) {
    globalThis.__gmaestroPendingApprovalsStore = {
      resolved: new Set(),
      dismissed: new Set(),
      hydrated: new Map(),
      listeners: new Set(),
    };
  }
  return globalThis.__gmaestroPendingApprovalsStore;
}

function notifyIds(store: IdsStore) {
  for (const l of store.listeners) l();
}

function subscribeIds(listener: () => void): () => void {
  const store = getIdsStore();
  store.listeners.add(listener);
  return () => {
    store.listeners.delete(listener);
  };
}

// Snapshot returns a stable {resolved, dismissed} object. Bumping a version
// counter on each mutation is the cleanest way to satisfy
// useSyncExternalStore's identity requirement.
let idsVersion = 0;
function getIdsVersion(): number {
  return idsVersion;
}

export interface PendingApprovalsHandle {
  /** All un-resolved + un-dismissed approvals, oldest-first. */
  pending: ApprovalRequest[];
  /** All un-resolved + dismissed approvals, oldest-first (for the resume pill). */
  dismissed: ApprovalRequest[];
  /** Combined pending + dismissed count. Useful for header badges. */
  unresolvedCount: number;
  /** Materialize the most recent `approval_requested` event into an approval. */
  hydrate: (approvalId: string) => ApprovalRequest | null;
  /** Mark dismissed (Escape/X). Stays un-resolved; surface the resume pill. */
  dismiss: (approvalId: string) => void;
  /** Un-dismiss — surfaces the approval back into `pending` for re-open. */
  resume: (approvalId: string) => void;
  /** Mark resolved. Terminal: removes from both `pending` and `dismissed`. */
  resolve: (approvalId: string) => void;
  /** Stash an already-hydrated approval (e.g., one fetched from /api). */
  cache: (approval: ApprovalRequest) => void;
}

function hydrateFromEvent(
  evt: Extract<WireEvent, { type: "approval_requested" }>,
  store: IdsStore,
): ApprovalRequest | null {
  const cached = store.hydrated.get(evt.payload.approvalId);
  if (cached) return cached;
  if (!MOCK_MODE) {
    // Real mode: the page renders from server data. The hook's hydrated
    // cache is best-effort; if the entry isn't there yet, return null and
    // let the caller fetch it themselves. (LiveApprovalSurface fetches.)
    return null;
  }
  const approval = buildMockApproval(
    evt.payload.approvalId,
    evt.payload.artifactType,
    evt.payload.blastRadius,
    evt.payload.reason,
    evt.payload.workflowRunId,
  );
  store.hydrated.set(approval.id, approval);
  return approval;
}

export function usePendingApprovals(): PendingApprovalsHandle {
  const events = useSharedEvents();
  // Subscribe to id mutations so consumer re-renders when dismiss/resolve
  // is called. The version counter is both the snapshot AND a useMemo dep
  // below — `store` is a stable reference, so without the version the memo
  // wouldn't re-compute on Set mutation.
  const idsVersionSnapshot = useSyncExternalStore(
    subscribeIds,
    getIdsVersion,
    getIdsVersion,
  );
  const store = getIdsStore();

  const requested = useMemo(
    () => pickEvents(events, "approval_requested"),
    [events],
  );

  const { pending, dismissed } = useMemo(() => {
    // De-dupe by approvalId; later events win (revisions reuse the same id
    // suffix pattern, but distinct ids in practice).
    const byId = new Map<
      string,
      Extract<WireEvent, { type: "approval_requested" }>
    >();
    for (const e of requested) byId.set(e.payload.approvalId, e);

    const pending: ApprovalRequest[] = [];
    const dismissed: ApprovalRequest[] = [];
    for (const e of byId.values()) {
      const id = e.payload.approvalId;
      if (store.resolved.has(id)) continue;
      const hydrated = hydrateFromEvent(e, store);
      if (!hydrated) continue;
      if (store.dismissed.has(id)) {
        dismissed.push(hydrated);
      } else {
        pending.push(hydrated);
      }
    }
    pending.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    dismissed.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return { pending, dismissed };
    // idsVersionSnapshot is a deliberate dep: it forces re-derivation whenever
    // dismiss/resolve mutates the store's Sets (which are stable references).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requested, store, idsVersionSnapshot]);

  const hydrate = useCallback(
    (approvalId: string): ApprovalRequest | null => {
      const cached = store.hydrated.get(approvalId);
      if (cached) return cached;
      const evt = requested.find((e) => e.payload.approvalId === approvalId);
      if (!evt) return null;
      return hydrateFromEvent(evt, store);
    },
    [requested, store],
  );

  const dismiss = useCallback(
    (approvalId: string) => {
      // Already-resolved approvals are terminal — never re-mark them as
      // dismissed. (A `dismiss` racing a `resolve` would otherwise leave the
      // id in BOTH sets, which is harmless for derived arrays but a
      // confusing diagnostic state when inspecting the store.)
      if (store.resolved.has(approvalId)) return;
      if (store.dismissed.has(approvalId)) return;
      store.dismissed.add(approvalId);
      idsVersion += 1;
      notifyIds(store);
    },
    [store],
  );

  const resume = useCallback(
    (approvalId: string) => {
      if (!store.dismissed.has(approvalId)) return;
      store.dismissed.delete(approvalId);
      idsVersion += 1;
      notifyIds(store);
    },
    [store],
  );

  const resolve = useCallback(
    (approvalId: string) => {
      let mutated = false;
      if (!store.resolved.has(approvalId)) {
        store.resolved.add(approvalId);
        mutated = true;
      }
      if (store.dismissed.has(approvalId)) {
        store.dismissed.delete(approvalId);
        mutated = true;
      }
      if (mutated) {
        idsVersion += 1;
        notifyIds(store);
      }
    },
    [store],
  );

  const cache = useCallback(
    (approval: ApprovalRequest) => {
      const existing = store.hydrated.get(approval.id);
      if (
        existing &&
        existing.status === approval.status &&
        existing.resolvedAt === approval.resolvedAt
      ) {
        return;
      }
      store.hydrated.set(approval.id, approval);
      idsVersion += 1;
      notifyIds(store);
    },
    [store],
  );

  const unresolvedCount = pending.length + dismissed.length;

  return {
    pending,
    dismissed,
    unresolvedCount,
    hydrate,
    dismiss,
    resume,
    resolve,
    cache,
  };
}

/**
 * Synthesize a revised approval after `changes_requested`. Caches it AND
 * pushes a synthetic `approval_requested` event onto the shared bus so the
 * normal pending-pipeline picks it up — same path as a real revision would
 * arrive via SSE.
 */
export function injectMockRevisedApproval(opts: {
  workflowRunId: string;
  approvalId: string;
  artifactType: string;
  blastRadius: ApprovalRequest["blastRadius"];
  reason: string;
  priorNote: string;
}) {
  if (!MOCK_MODE) return;
  const store = getIdsStore();
  // Idempotency: a given revised id is materialized exactly once. Without
  // this, a stray double-fire of the scheduling timer (e.g. from React 19's
  // dev-mode strict-mode double-invoke or a rogue retry) would push two
  // identical events onto the shared bus and the de-dupe in
  // `usePendingApprovals` would silently drop one.
  if (store.hydrated.has(opts.approvalId)) return;
  const approval = buildMockApproval(
    opts.approvalId,
    opts.artifactType,
    opts.blastRadius,
    opts.reason,
    opts.workflowRunId,
    opts.priorNote,
  );
  store.hydrated.set(approval.id, approval);
  injectSharedEvent({
    type: "approval_requested",
    payload: {
      workflowRunId: opts.workflowRunId,
      approvalId: opts.approvalId,
      artifactType: opts.artifactType,
      blastRadius: opts.blastRadius,
      reason: opts.reason,
    },
  });
}
