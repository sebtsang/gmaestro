import "server-only";
import type { FanoutSource } from "@/lib/shared/types";

/**
 * Lightweight snapshot of the founder's available work surfaces, threaded into
 * the Conductor prompt so Managers can reason about counts (and reference real
 * IDs) without the workflow function having to enumerate every artifact.
 *
 * Items are intentionally narrow — just what a Manager needs to plan, not what
 * a Specialist needs to execute.
 *
 * Content-domain WorkContext shapes (post-2026-05-09 pivot):
 *   - "topics"   — multi-topic sprint backlog. v1: empty (single-blog runs
 *                  drive the topic from the founder's prompt). v2: a topics
 *                  table populated via gmaestro setup or a Notion sync.
 *   - "channels" — set at BlogDraft approval time, not at run start. The
 *                  Formatter's fanout over "channels" is materialized when
 *                  the founder ticks targets in the approval payload, not
 *                  here. v1: empty.
 */
export interface WorkItem {
  id: string;
  /** Compact human-readable label for prompt summaries. */
  label: string;
  /**
   * Denormalized record fields. Splatted into materialized task input as
   * `item: {...}` so personas can act on the topic/channel without an extra
   * Composio round-trip.
   */
  fields: Record<string, unknown>;
}

export interface WorkContext {
  items: Record<FanoutSource, WorkItem[]>;
  summary: string;
}

export async function loadWorkContext(): Promise<WorkContext> {
  // v1: no pre-loaded topic backlog. The topic comes from the founder's
  // prompt; channels are set at BlogDraft approval time. Both arrays are
  // empty here, and the dispatcher injects channels into the formatter
  // fanout via the approval payload (handled in lib/state/workflows.ts).
  const items: Record<FanoutSource, WorkItem[]> = {
    topics: [],
    channels: [],
  };

  return { items, summary: formatSummary(items) };
}

function formatSummary(items: Record<FanoutSource, WorkItem[]>): string {
  const sections: string[] = [];
  for (const [source, list] of Object.entries(items) as Array<
    [FanoutSource, WorkItem[]]
  >) {
    if (list.length === 0) continue;
    const sample = list.slice(0, 3).map((i) => `  - ${i.id}: ${i.label}`);
    sections.push(
      `${source} (count=${list.length})\n${sample.join("\n")}` +
        (list.length > 3 ? `\n  ... and ${list.length - 3} more` : ""),
    );
  }
  return sections.length > 0
    ? sections.join("\n\n")
    : "(no pre-loaded work items — drive the topic from the founder's objective; channels are picked at BlogDraft approval time)";
}

/**
 * Pure helper used by the dispatcher to materialize a fanout template into one
 * task per item.
 */
export function fanoutItems(
  source: FanoutSource,
  ctx: WorkContext,
): readonly WorkItem[] {
  return ctx.items[source];
}
