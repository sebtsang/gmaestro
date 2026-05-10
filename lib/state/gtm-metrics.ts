import "server-only";
import { and, count, eq, gte, isNotNull, type SQL, type Table } from "drizzle-orm";
import { db, schema } from "@/lib/state/db";
import type { GtmMetric } from "@/lib/shared/types";

/** Zero-init counts for every metric. Exhaustiveness keeps it in sync with `GtmMetric`. */
export const ZERO_GTM_COUNTS: Record<GtmMetric, number> = {
  demos_booked: 0,
  qualified_hot_leads: 0,
  outreach_sent: 0,
};

// Adding a metric: extend GtmMetric AND add a counter here. The Record's
// exhaustiveness check enforces both halves stay in sync.
const METRIC_COUNTERS: Record<GtmMetric, (since: Date | undefined) => number> = {
  demos_booked: (since) =>
    countWhere(
      schema.bookedMeetings,
      since ? gte(schema.bookedMeetings.bookedAt, since) : undefined,
    ),
  qualified_hot_leads: (since) =>
    countWhere(
      schema.qualifiedLeads,
      and(
        eq(schema.qualifiedLeads.tier, "hot"),
        since ? gte(schema.qualifiedLeads.qualifiedAt, since) : undefined,
      ),
    ),
  outreach_sent: (since) =>
    countWhere(
      schema.outreachDrafts,
      and(
        isNotNull(schema.outreachDrafts.sentAt),
        since ? gte(schema.outreachDrafts.sentAt, since) : undefined,
      ),
    ),
};

function countWhere(table: Table, where: SQL | undefined): number {
  const row = db.select({ n: count() }).from(table).where(where).get();
  return row?.n ?? 0;
}

export function metricToCount(metric: GtmMetric, since?: Date): number {
  return METRIC_COUNTERS[metric](since);
}

export function countAllMetrics(
  metrics: Array<{ metric: GtmMetric; since?: string }>,
): Record<GtmMetric, number> {
  const out: Record<GtmMetric, number> = { ...ZERO_GTM_COUNTS };
  for (const m of metrics) {
    out[m.metric] = metricToCount(m.metric, m.since ? new Date(m.since) : undefined);
  }
  return out;
}
