/**
 * Company-profile reads/writes.
 *
 * One row per founder (`userId` is the PK). The profile grounds every
 * persona that reasons about a customer or message — without it, the
 * Qualifier is scoring against an unknown ICP and the Writer is drafting
 * about a product the LLM had to guess at.
 *
 * Filling the profile is REQUIRED before a workflow run is allowed to
 * dispatch — the guard lives in `app/api/runs/route.ts` and uses
 * {@link isCompanyProfileComplete} to decide. Fields are nullable so a
 * partial profile (e.g. an LLM draft mid-edit) can still be saved.
 */

import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/state/db";
import { CompanyProfileSchema } from "@/lib/shared/schemas";
import {
  REQUIRED_COMPANY_PROFILE_FIELDS,
  type CompanyProfile,
} from "@/lib/shared/types";

export function getCompanyProfile(userId: string): CompanyProfile | null {
  const row = db
    .select()
    .from(schema.companyProfiles)
    .where(eq(schema.companyProfiles.userId, userId))
    .get();
  if (!row) return null;
  return CompanyProfileSchema.parse(row);
}

export type CompanyProfileUpsert = {
  companyName?: string | null;
  oneLiner?: string | null;
  productDescription?: string | null;
  icp?: string | null;
  positioning?: string | null;
  voiceTone?: string | null;
  valueProps?: string[] | null;
  competitors?: string[] | null;
  sourceUrl?: string | null;
};

/**
 * Insert-or-update the founder's profile. Only fields present in `patch`
 * are touched — undefined keys are left as-is; null clears a field.
 *
 * Returns the post-write row so callers can hand it straight to a Zod
 * validator + UI without a follow-up read.
 */
export function upsertCompanyProfile(
  userId: string,
  patch: CompanyProfileUpsert,
): CompanyProfile {
  const now = new Date();
  const existing = db
    .select()
    .from(schema.companyProfiles)
    .where(eq(schema.companyProfiles.userId, userId))
    .get();

  if (!existing) {
    db.insert(schema.companyProfiles)
      .values({
        userId,
        companyName: patch.companyName ?? null,
        oneLiner: patch.oneLiner ?? null,
        productDescription: patch.productDescription ?? null,
        icp: patch.icp ?? null,
        positioning: patch.positioning ?? null,
        voiceTone: patch.voiceTone ?? null,
        valueProps: patch.valueProps ?? null,
        competitors: patch.competitors ?? null,
        sourceUrl: patch.sourceUrl ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  } else {
    const next: Record<string, unknown> = { updatedAt: now };
    if (patch.companyName !== undefined) next.companyName = patch.companyName;
    if (patch.oneLiner !== undefined) next.oneLiner = patch.oneLiner;
    if (patch.productDescription !== undefined)
      next.productDescription = patch.productDescription;
    if (patch.icp !== undefined) next.icp = patch.icp;
    if (patch.positioning !== undefined) next.positioning = patch.positioning;
    if (patch.voiceTone !== undefined) next.voiceTone = patch.voiceTone;
    if (patch.valueProps !== undefined) next.valueProps = patch.valueProps;
    if (patch.competitors !== undefined) next.competitors = patch.competitors;
    if (patch.sourceUrl !== undefined) next.sourceUrl = patch.sourceUrl;
    db.update(schema.companyProfiles)
      .set(next)
      .where(eq(schema.companyProfiles.userId, userId))
      .run();
  }

  return CompanyProfileSchema.parse(
    db
      .select()
      .from(schema.companyProfiles)
      .where(eq(schema.companyProfiles.userId, userId))
      .get(),
  );
}

/**
 * True iff every required field on the profile is present and non-empty.
 * Used by the workflow-start guard — runs are refused until this passes.
 *
 * Optional fields (positioning, voiceTone, valueProps, competitors, sourceUrl)
 * are not checked here; personas degrade gracefully when they're missing.
 */
export function isCompanyProfileComplete(
  profile: CompanyProfile | null,
): profile is CompanyProfile {
  if (!profile) return false;
  for (const field of REQUIRED_COMPANY_PROFILE_FIELDS) {
    const v = profile[field];
    if (typeof v !== "string" || v.trim().length === 0) return false;
  }
  return true;
}

/**
 * Compact summary block used when threading the profile into prompts.
 * Always returns SOMETHING — even an empty profile produces "(no company
 * profile filled)" — so persona prompts can rely on the field's presence.
 */
export function formatCompanyProfileForPrompt(
  profile: CompanyProfile | null,
): string {
  if (!profile) return "(no company profile filled)";
  const lines: string[] = [];
  if (profile.companyName) lines.push(`COMPANY: ${profile.companyName}`);
  if (profile.oneLiner) lines.push(`ONE-LINER: ${profile.oneLiner}`);
  if (profile.productDescription)
    lines.push(`PRODUCT:\n${profile.productDescription}`);
  if (profile.icp) lines.push(`ICP:\n${profile.icp}`);
  if (profile.positioning) lines.push(`POSITIONING:\n${profile.positioning}`);
  if (profile.voiceTone) lines.push(`VOICE / TONE:\n${profile.voiceTone}`);
  if (profile.valueProps?.length)
    lines.push(`VALUE PROPS:\n- ${profile.valueProps.join("\n- ")}`);
  if (profile.competitors?.length)
    lines.push(`COMPETITORS: ${profile.competitors.join(", ")}`);
  return lines.length > 0 ? lines.join("\n\n") : "(no company profile filled)";
}
