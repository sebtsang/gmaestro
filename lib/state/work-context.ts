import "server-only";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "./db";
import {
  formatCompanyProfileForPrompt,
  getCompanyProfile,
} from "./company-profile";
import type { CompanyProfile, FanoutSource } from "@/lib/shared/types";

/**
 * Lightweight snapshot of the founder's available work surfaces, threaded into
 * the Conductor prompt so Managers can reason about counts (and reference real
 * IDs) without the workflow function having to enumerate every artifact.
 *
 * Items are intentionally narrow — just what a Manager needs to plan, not what
 * a Specialist needs to execute. Specialists fetch full records by id at
 * dispatch time.
 */
export interface WorkItem {
  id: string;
  /** Compact human-readable label for prompt summaries. */
  label: string;
  /**
   * Denormalized record fields. Splatted into materialized task input as
   * `item: {...}` so personas can act on the lead/trial without an extra
   * Composio round-trip back into the local store (which they have no tool
   * to query anyway).
   */
  fields: Record<string, unknown>;
}

export interface WorkContext {
  items: Record<FanoutSource, WorkItem[]>;
  /**
   * Company profile snapshot — the founder-vetted record that grounds every
   * persona reasoning about a customer or message. May be null only if the
   * workflow-start guard was bypassed (e.g. an internal caller); production
   * runs always have this populated.
   */
  companyProfile: CompanyProfile | null;
  summary: string;
}

const MAX_ITEMS_PER_SOURCE = 100;

export async function loadWorkContext(
  userId: string = process.env.GMAESTRO_USER_ID ?? "default",
): Promise<WorkContext> {
  const leadRows = db
    .select({
      id: schema.leads.id,
      email: schema.leads.email,
      name: schema.leads.name,
      company: schema.leads.company,
      source: schema.leads.source,
      rawMessage: schema.leads.rawMessage,
    })
    .from(schema.leads)
    .orderBy(desc(schema.leads.createdAt))
    .limit(MAX_ITEMS_PER_SOURCE)
    .all();

  const trialRows = db
    .select({
      id: schema.trialSignals.id,
      leadId: schema.trialSignals.leadId,
      stalledAtStep: schema.trialSignals.stalledAtStep,
      stripeStatus: schema.trialSignals.stripeStatus,
    })
    .from(schema.trialSignals)
    .where(eq(schema.trialSignals.stripeStatus, "trialing"))
    .limit(MAX_ITEMS_PER_SOURCE)
    .all();

  const items: Record<FanoutSource, WorkItem[]> = {
    leads: leadRows.map((r) => ({
      id: r.id,
      label: `${r.name} <${r.email}>${r.company ? ` · ${r.company}` : ""} · src=${r.source}`,
      fields: {
        leadId: r.id,
        email: r.email,
        name: r.name,
        company: r.company,
        source: r.source,
        // The lead's actual inbound text — far more useful for personalization
        // than name/company alone, especially when upstream research has nothing
        // because integrations aren't connected.
        rawMessage: r.rawMessage,
      },
    })),
    "trial-signals": trialRows.map((r) => ({
      id: r.id,
      label: `lead=${r.leadId}${r.stalledAtStep ? ` · stalled=${r.stalledAtStep}` : ""}`,
      fields: {
        trialSignalId: r.id,
        leadId: r.leadId,
        stalledAtStep: r.stalledAtStep,
        stripeStatus: r.stripeStatus,
      },
    })),
  };

  const companyProfile = getCompanyProfile(userId);
  const summary = formatSummary(items, companyProfile);
  return { items, companyProfile, summary };
}

function formatSummary(
  items: Record<FanoutSource, WorkItem[]>,
  companyProfile: CompanyProfile | null,
): string {
  // Lead with the founder's company so the Conductor + Managers reason about
  // tasks already grounded in who the company is and who they sell to. Without
  // this, the planner only sees "process these leads" and has to infer the
  // bar for "good fit" from the prompt + lead text alone.
  const sections: string[] = [
    "FOUNDER'S COMPANY:\n" + formatCompanyProfileForPrompt(companyProfile),
  ];

  const itemSections: string[] = [];
  for (const [source, list] of Object.entries(items) as Array<
    [FanoutSource, WorkItem[]]
  >) {
    if (list.length === 0) continue;
    const sample = list.slice(0, 3).map((i) => `  - ${i.id}: ${i.label}`);
    itemSections.push(
      `${source} (count=${list.length})\n${sample.join("\n")}` +
        (list.length > 3 ? `\n  ... and ${list.length - 3} more` : ""),
    );
  }
  sections.push(
    itemSections.length > 0
      ? itemSections.join("\n\n")
      : "(no work items currently available)",
  );
  return sections.join("\n\n");
}

/**
 * Pure helper used by the dispatcher to materialize a fanout template into one
 * task per item. Kept here so workflows.ts stays focused on scheduling.
 */
export function fanoutItems(
  source: FanoutSource,
  ctx: WorkContext,
): readonly WorkItem[] {
  return ctx.items[source];
}
