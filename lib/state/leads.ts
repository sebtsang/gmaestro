/**
 * Lead pipeline state: leads, enrichment, qualification.
 *
 * Personas read/write here through narrow helpers — never raw Drizzle — so
 * we can swap storage later without touching every persona's code.
 *
 * All return values run through their matching Zod schema before they leave
 * this module so callers get parsed dates, narrowed enums, and typed nullables.
 */

import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/state/db";
import {
  EnrichedLeadSchema,
  LeadSchema,
  QualifiedLeadSchema,
} from "@/lib/shared/schemas";
import type {
  EnrichedLead,
  Lead,
  LeadSource,
  QualifiedLead,
  Tier,
} from "@/lib/shared/types";

// ----- leads -----

export function insertLead(
  input: Omit<Lead, "id" | "createdAt"> & { id?: string },
): Lead {
  const row = {
    id: input.id ?? randomUUID(),
    email: input.email,
    name: input.name,
    company: input.company ?? null,
    source: input.source,
    rawMessage: input.rawMessage ?? null,
    createdAt: new Date(),
  };
  db.insert(schema.leads).values(row).run();
  return LeadSchema.parse(row);
}

export function getLead(leadId: string): Lead | null {
  const row = db
    .select()
    .from(schema.leads)
    .where(eq(schema.leads.id, leadId))
    .get();
  return row ? LeadSchema.parse(row) : null;
}

export function listLeads(filter?: {
  source?: LeadSource;
  tier?: Tier;
  limit?: number;
}): Lead[] {
  const limit = filter?.limit ?? 100;

  // Tier lives on qualified_leads; if filtered, join via leadId.
  if (filter?.tier) {
    const rows = db
      .select({ lead: schema.leads })
      .from(schema.leads)
      .innerJoin(
        schema.qualifiedLeads,
        eq(schema.qualifiedLeads.leadId, schema.leads.id),
      )
      .where(
        filter.source
          ? and(
              eq(schema.qualifiedLeads.tier, filter.tier),
              eq(schema.leads.source, filter.source),
            )
          : eq(schema.qualifiedLeads.tier, filter.tier),
      )
      .orderBy(desc(schema.leads.createdAt))
      .limit(limit)
      .all();
    return rows.map((r) => LeadSchema.parse(r.lead));
  }

  const q = db.select().from(schema.leads);
  const rows = (
    filter?.source
      ? q.where(eq(schema.leads.source, filter.source))
      : q
  )
    .orderBy(desc(schema.leads.createdAt))
    .limit(limit)
    .all();
  return rows.map((r) => LeadSchema.parse(r));
}

// ----- enriched_leads (upsert by leadId; researcher persona writes) -----

export function updateEnriched(
  leadId: string,
  enrichment: Omit<EnrichedLead, "id" | "leadId" | "enrichedAt">,
): EnrichedLead {
  const existing = db
    .select()
    .from(schema.enrichedLeads)
    .where(eq(schema.enrichedLeads.leadId, leadId))
    .get();

  const row = {
    id: existing?.id ?? randomUUID(),
    leadId,
    linkedinUrl: enrichment.linkedinUrl ?? null,
    companyDomain: enrichment.companyDomain ?? null,
    companySize: enrichment.companySize ?? null,
    companyIndustry: enrichment.companyIndustry ?? null,
    personRole: enrichment.personRole ?? null,
    personSeniority: enrichment.personSeniority ?? null,
    intentSignals: enrichment.intentSignals,
    techStack: enrichment.techStack ?? null,
    recentSocial: enrichment.recentSocial ?? null,
    enrichedAt: new Date(),
  };

  if (existing) {
    db.update(schema.enrichedLeads)
      .set(row)
      .where(eq(schema.enrichedLeads.id, existing.id))
      .run();
  } else {
    db.insert(schema.enrichedLeads).values(row).run();
  }

  return EnrichedLeadSchema.parse(row);
}

export function getEnriched(leadId: string): EnrichedLead | null {
  const row = db
    .select()
    .from(schema.enrichedLeads)
    .where(eq(schema.enrichedLeads.leadId, leadId))
    .get();
  return row ? EnrichedLeadSchema.parse(row) : null;
}

// ----- qualified_leads (upsert by leadId; qualifier persona writes) -----

export function updateQualified(
  leadId: string,
  qualification: Omit<QualifiedLead, "id" | "leadId" | "qualifiedAt">,
): QualifiedLead {
  const existing = db
    .select()
    .from(schema.qualifiedLeads)
    .where(eq(schema.qualifiedLeads.leadId, leadId))
    .get();

  const row = {
    id: existing?.id ?? randomUUID(),
    leadId,
    tier: qualification.tier,
    fitScore: qualification.fitScore,
    fitReasons: qualification.fitReasons,
    intentScore: qualification.intentScore,
    intentReasons: qualification.intentReasons,
    recommendedAction: qualification.recommendedAction,
    qualifiedAt: new Date(),
  };

  if (existing) {
    db.update(schema.qualifiedLeads)
      .set(row)
      .where(eq(schema.qualifiedLeads.id, existing.id))
      .run();
  } else {
    db.insert(schema.qualifiedLeads).values(row).run();
  }

  return QualifiedLeadSchema.parse(row);
}

export function getQualified(leadId: string): QualifiedLead | null {
  const row = db
    .select()
    .from(schema.qualifiedLeads)
    .where(eq(schema.qualifiedLeads.leadId, leadId))
    .get();
  return row ? QualifiedLeadSchema.parse(row) : null;
}
