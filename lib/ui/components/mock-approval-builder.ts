/**
 * Mock approval builder — extracted from live-approval-surface so it can be
 * shared between the live surface (modal in dashboard) and the approvals page
 * (browse all pending approvals). Both consume `usePendingApprovals`, which
 * materializes mock approvals via this builder.
 *
 * Revision tracking is metadata-driven, NOT id-parsing-driven. A previous
 * implementation parsed a chained "-r<ts>" suffix on the id to derive the
 * revision count, which was fragile under fast clicks (timestamp dedup → same
 * id → cache hit → wrong revision count) and HMR (stale module replaying old
 * regex semantics on a freshly-restored id). This file now keeps an explicit
 * `revisionMeta` map that stores `{ rootId, revisionCount, priorNote,
 * priorBody, priorSubject }` for every revised approval. `registerRevision`
 * is called from the side that owns the revision lifecycle (the live
 * surface's onResolved handler) BEFORE the synthetic event is injected, so
 * by the time `buildMockApproval` runs the metadata is already there.
 *
 * Why a module-level Map (and globalThis fallback)? Same reason as the rest
 * of the dashboard's client-side stores: Next.js bundles pages and route
 * handlers separately, and we want a single canonical record of revisions
 * regardless of which entrypoint imported the module first.
 *
 * Revisions stack: each revision applies feedback heuristics to the PRIOR
 * body (passed into `registerRevision`), not the original. So "shorter"
 * then "more casual" then "drop founder name" produces a body that's
 * progressively shorter, more casual, AND missing the founder line.
 */

import type {
  ApprovalArtifactType,
  ApprovalRequest,
} from "@/lib/shared/types";
import {
  applyFeedbackHeuristics,
  revisionLeadIn,
} from "@/lib/ui/components/feedback-heuristics";

// ---------------------------------------------------------------------------
//  Default copy
// ---------------------------------------------------------------------------

const DEFAULT_OUTREACH_BODY =
  "Hey Jordan,\n\n" +
  "Saw your HN post - congrats on the seed. I run GMaestro, an AI GTM team for founders.\n\n" +
  "Noticed Acme is hiring backend engineers; that's exactly the moment we wedge in for most of our customers (founder-led GTM, no sales hire yet). Mind if I send a 90-second Loom on what we'd do for the first 47 leads in your inbox this week?\n\n" +
  "If there's a better time, just say the word.\n\n" +
  "- [Founder]";

const DEFAULT_OUTREACH_SUBJECT = "Demo for Acme - quick question";

const DEFAULT_NUDGE_BODY =
  "Hey, saw you started a trial yesterday but haven't connected Gmail yet. Want me to walk you through it?";

const DEFAULT_NUDGE_SUBJECT = "Stuck on connecting your first tool?";

// ---------------------------------------------------------------------------
//  Revision metadata — authoritative source for `revision`, `priorNote`,
//  `priorBody`, `priorSubject`, and `rootId` for any revised approval.
//  Populated by `registerRevision`.
// ---------------------------------------------------------------------------

interface RevisionMeta {
  rootId: string;
  revisionCount: number;
  priorNote: string;
  /** The body of the approval that was just resolved with `changes_requested`. */
  priorBody: string;
  /** The subject of the approval that was just resolved with `changes_requested`. */
  priorSubject: string;
  /** The artifact kind so the builder picks the right defaults if priorBody is empty. */
  kind: ApprovalArtifactType;
  /** LLM-rewritten body. When set, replaces heuristic output entirely. */
  overrideBody?: string;
  /** LLM-rewritten subject. When set, replaces heuristic output entirely. */
  overrideSubject?: string;
}

interface RevisionStore {
  meta: Map<string, RevisionMeta>;
}

declare global {
  // eslint-disable-next-line no-var
  var __gmaestroMockRevisionStore: RevisionStore | undefined;
}

function getRevisionStore(): RevisionStore {
  if (typeof window === "undefined") {
    return { meta: new Map() };
  }
  if (!globalThis.__gmaestroMockRevisionStore) {
    globalThis.__gmaestroMockRevisionStore = { meta: new Map() };
  }
  return globalThis.__gmaestroMockRevisionStore;
}

/**
 * Mint a new revision id and register its metadata atomically.
 *
 * Returns a stable id of the form `<rootId>#rev<n>` (NOT a chained `-r<ts>`
 * suffix). The id is opaque — code never parses it. The `n` segment is a
 * monotonic counter scoped to the rootId so two clicks in the same
 * millisecond can't collide on the id.
 *
 * Caller responsibility: call this BEFORE injecting the synthetic
 * `approval_requested` event so the metadata is in place when
 * `buildMockApproval` runs against the new id. Pass the CURRENT body / subject
 * of the approval being revised so heuristics can stack across revisions.
 */
export function registerRevision(opts: {
  parentApprovalId: string;
  priorNote: string;
  priorBody: string;
  priorSubject: string;
  kind: ApprovalArtifactType;
  /** LLM-produced body. When provided, the builder skips heuristics. */
  overrideBody?: string;
  /** LLM-produced subject. When provided, the builder skips heuristics. */
  overrideSubject?: string;
}): { revisedId: string; revisionCount: number } {
  const store = getRevisionStore();
  const parentMeta = store.meta.get(opts.parentApprovalId);
  const rootId = parentMeta?.rootId ?? opts.parentApprovalId;
  const revisionCount = (parentMeta?.revisionCount ?? 0) + 1;
  // Suffix uses the revision counter PLUS a short timestamp segment to keep
  // ids globally unique across a session even if a future bug causes the
  // counter to be reused. Counter alone would be reset by a full reload of
  // the dashboard tab; the timestamp guards against id collisions in the
  // event log if someone reloads mid-revision.
  const tsSeg = Date.now().toString(36).slice(-6);
  const revisedId = `${rootId}#rev${revisionCount}-${tsSeg}`;
  store.meta.set(revisedId, {
    rootId,
    revisionCount,
    priorNote: opts.priorNote,
    priorBody: opts.priorBody,
    priorSubject: opts.priorSubject,
    kind: opts.kind,
    overrideBody: opts.overrideBody,
    overrideSubject: opts.overrideSubject,
  });
  return { revisedId, revisionCount };
}

/**
 * Look up `RevisionMeta` for an approval id. Returns null for the original
 * (non-revised) approval. Used by `buildMockApproval` and exposed for tests.
 */
export function getRevisionMeta(approvalId: string): RevisionMeta | null {
  return getRevisionStore().meta.get(approvalId) ?? null;
}

// ---------------------------------------------------------------------------
//  Body / subject builders for revised approvals
// ---------------------------------------------------------------------------

interface BuiltDraft {
  subject: string;
  body: string;
}

/**
 * Build the revised draft for an outreach email. Applies heuristics to the
 * prior body so revisions stack. Falls back to a generic "rewrite" template
 * when no heuristic matches the founder's note (so the body still varies).
 */
function buildRevisedOutreachDraft(meta: RevisionMeta): BuiltDraft {
  const prior = {
    body: meta.priorBody || DEFAULT_OUTREACH_BODY,
    subject: meta.priorSubject || DEFAULT_OUTREACH_SUBJECT,
  };

  // LLM-driven path: when an override is provided, skip heuristics entirely
  // and use the model's rewrite. Subject still gets the "(revised vN)" suffix
  // so the user sees the revision counter ticking up.
  if (meta.overrideBody) {
    const subjectBase = meta.overrideSubject ?? prior.subject;
    const subjectClean = subjectBase
      .replace(/\s*\(revised v\d+\)\s*$/, "")
      .trim();
    return {
      body: meta.overrideBody,
      subject: `${subjectClean} (revised v${meta.revisionCount})`,
    };
  }

  const result = applyFeedbackHeuristics(
    prior.body,
    prior.subject,
    meta.priorNote,
    "OutreachDraft",
  );
  // If at least one heuristic fired, return as-is (transformed body) plus a
  // subject suffix that surfaces the revision count.
  const subjectBase =
    result.subject ?? prior.subject ?? DEFAULT_OUTREACH_SUBJECT;
  // Strip any prior "(revised v...)" suffix so we don't stack them.
  const subjectClean = subjectBase.replace(/\s*\(revised v\d+\)\s*$/, "").trim();
  const subject = `${subjectClean} (revised v${meta.revisionCount})`;

  if (result.applied.length > 0) {
    return { body: result.body, subject };
  }

  // Recognized keyword but no transform fired = body already complied.
  // Keep the prior body so chained transformations aren't undone (e.g.
  // "no exclamation marks" when the body already has zero `!`).
  if (result.recognized) {
    return { body: prior.body, subject };
  }

  // Fallback: nothing recognized. Rotate among differing rewrite templates
  // keyed off the prior body so at least the body changes meaningfully
  // between revisions. We rewrite from PRIOR (not original) to preserve any
  // earlier deletions like the founder signature.
  const cleanNote = meta.priorNote.trim().replace(/\s+/g, " ").slice(0, 140);
  const fallbackBody = templateRewrite(prior.body, cleanNote, meta.revisionCount);
  return { body: fallbackBody, subject };
}

/**
 * Best-effort rewrite when no heuristic recognized the note. Preserves
 * prior structural decisions (no greeting / no signature) by keying off
 * what's currently in the body, then prepending an acknowledgement of the
 * note. Result is shorter than the input by one paragraph.
 */
function templateRewrite(priorBody: string, cleanNote: string, revisionCount: number): string {
  const paragraphs = priorBody.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const isGreeting = (p: string) =>
    /^(hey|hi|hello|dear)\b/i.test(p) && p.length < 30;
  const isSignature = (p: string) => /^[-—]\s*/.test(p);
  // Detect the marker we add ourselves on prior fallback revisions so we
  // strip it before re-applying. Otherwise the body grows by one paragraph
  // every revision.
  const isLeadIn = (p: string) => /^Per your note \(/i.test(p);
  // Detect prior rotation sentences so we replace, not append.
  const isPriorRotation = (p: string) =>
    /\b90-(second|sec)\s+Loom\b|\b10-min\s+look\b/i.test(p);

  const greeting = paragraphs.length > 0 && isGreeting(paragraphs[0]) ? paragraphs[0] : null;
  const signature =
    paragraphs.length > 0 && isSignature(paragraphs[paragraphs.length - 1])
      ? paragraphs[paragraphs.length - 1]
      : null;
  const middle = paragraphs.filter(
    (p) => p !== greeting && p !== signature && !isLeadIn(p) && !isPriorRotation(p),
  );

  // Pick a different sentence for each revision so the visible content rotates.
  const rotations = [
    "Want a quick 90-second Loom on what we'd do with this week's inbound?",
    "Mind if I send a 90-second Loom on how we'd work this week's leads?",
    "Quick one - happy to send a 90-sec Loom if it'd help.",
    "Worth a 10-min look at how we'd handle this week's pipeline?",
  ];
  const replacement = rotations[(revisionCount - 1) % rotations.length];

  const out: string[] = [];
  if (greeting) out.push(greeting);
  out.push(`Per your note ("${cleanNote}"):`);
  out.push(replacement);
  // Keep any non-rotation, non-marker middle paragraphs (e.g. supporting
  // sentences from earlier templates) so prior shortening etc. is preserved.
  for (const p of middle) out.push(p);
  if (signature) out.push(signature);
  return out.join("\n\n");
}

function buildRevisedNudgeDraft(meta: RevisionMeta): BuiltDraft {
  const prior = {
    body: meta.priorBody || DEFAULT_NUDGE_BODY,
    subject: meta.priorSubject || DEFAULT_NUDGE_SUBJECT,
  };

  if (meta.overrideBody) {
    const subjectBase = meta.overrideSubject ?? prior.subject;
    const subjectClean = subjectBase
      .replace(/\s*\(revised v\d+\)\s*$/, "")
      .trim();
    return {
      body: meta.overrideBody,
      subject: `${subjectClean} (revised v${meta.revisionCount})`,
    };
  }

  const result = applyFeedbackHeuristics(
    prior.body,
    prior.subject,
    meta.priorNote,
    "ActivationNudge",
  );
  const subjectBase = result.subject ?? prior.subject ?? DEFAULT_NUDGE_SUBJECT;
  const subjectClean = subjectBase.replace(/\s*\(revised v\d+\)\s*$/, "").trim();
  const subject = `${subjectClean} (revised v${meta.revisionCount})`;

  if (result.applied.length > 0) {
    return { body: result.body, subject };
  }
  if (result.recognized) {
    return { body: prior.body, subject };
  }

  const cleanNote = meta.priorNote.trim().replace(/\s+/g, " ").slice(0, 140);
  const lead = revisionLeadIn(result.applied, cleanNote);
  // Fallback rotates among 3 short rewrites for the activation nudge.
  const fallbackBody = (() => {
    if (meta.revisionCount <= 1) {
      return `Hey - noticed Gmail still isn't connected. One click and you're done: {{connect_url}} (${lead})`;
    }
    if (meta.revisionCount === 2) {
      return `Hey - Gmail's still not connected. Connect in one click: {{connect_url}} (${lead})`;
    }
    return `Gmail still pending - one click: {{connect_url}} (${lead})`;
  })();
  return { body: fallbackBody, subject };
}

// ---------------------------------------------------------------------------
//  Builder
// ---------------------------------------------------------------------------

export function buildMockApproval(
  approvalId: string,
  artifactType: string,
  blastRadius: ApprovalRequest["blastRadius"],
  reason: string,
  workflowRunId: string,
  priorNote?: string,
): ApprovalRequest {
  // Prefer registered revision metadata; fall back to the optional `priorNote`
  // arg for callers (legacy or tests) that haven't called `registerRevision`.
  const meta = getRevisionMeta(approvalId);
  const revision = meta?.revisionCount ?? 0;
  const note = meta?.priorNote ?? priorNote ?? "";
  const isRevision = revision > 0 && note.length > 0;

  const kind = artifactType as ApprovalArtifactType;

  let proposedAction: Record<string, unknown>;
  if (kind === "OutreachDraft") {
    const draft =
      isRevision && meta
        ? buildRevisedOutreachDraft(meta)
        : { subject: DEFAULT_OUTREACH_SUBJECT, body: DEFAULT_OUTREACH_BODY };
    proposedAction = {
      tool: "gmail.send",
      to: "jordan@acme.example",
      subject: draft.subject,
      body: draft.body,
    };
  } else if (kind === "ActivationNudge") {
    const draft =
      isRevision && meta
        ? buildRevisedNudgeDraft(meta)
        : { subject: DEFAULT_NUDGE_SUBJECT, body: DEFAULT_NUDGE_BODY };
    proposedAction = {
      channel: "email",
      subject: draft.subject,
      body: draft.body,
    };
  } else {
    proposedAction = {
      tool: "hubspot.update_deal",
      dealId: "d_123",
      stage: "interested",
    };
  }

  return {
    id: approvalId,
    workflowRunId,
    artifactType: kind,
    artifactId: `${approvalId}-artifact`,
    blastRadius,
    reason,
    proposedAction,
    status: "pending",
    // When this is a revision, surface the prior founder note on the approval
    // so the ApprovalCard can render a "Revised based on your feedback" banner.
    founderNotes: isRevision ? note : null,
    createdAt: new Date(),
  };
}
