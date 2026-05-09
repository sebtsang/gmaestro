/**
 * Static voice memory.
 *
 * For the hackathon, voice training is one-shot:
 *  - Founder samples are seeded at `gmaestro setup` (Session 3).
 *  - The Writer persona prompt pulls 3 most recent samples as few-shots via
 *    `buildFewShotExamples()`.
 *  - When the founder edits an outreach draft at the approval gate, we capture
 *    the diff via `recordVoiceEdit()` for FUTURE cross-run learning, but it is
 *    NOT consumed within the current demo (per CLAUDE.md rule 10).
 */

import "server-only";
import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/state/db";
import {
  FounderVoiceEditSchema,
  VoiceSampleSchema,
} from "@/lib/shared/schemas";
import type {
  FounderVoiceEdit,
  PersonaId,
  VoiceSample,
} from "@/lib/shared/types";

export function getVoiceSamples(userId: string): VoiceSample[] {
  const rows = db
    .select()
    .from(schema.voiceSamples)
    .where(eq(schema.voiceSamples.userId, userId))
    .orderBy(desc(schema.voiceSamples.createdAt))
    .all();
  return rows.map((r) => VoiceSampleSchema.parse(r));
}

/**
 * N most recent voice samples, ready to drop into a system prompt as
 * few-shots. Returns `[]` if the table is empty — Writer prompts must
 * tolerate zero examples (e.g., for fresh setups before seeding).
 */
export function buildFewShotExamples(
  userId: string,
  count = 3,
): VoiceSample[] {
  return getVoiceSamples(userId).slice(0, count);
}

export function recordVoiceEdit(input: {
  userId: string;
  approvalId: string;
  personaId: PersonaId;
  originalDraft: string;
  editedDraft: string;
}): FounderVoiceEdit {
  const row = {
    id: randomUUID(),
    userId: input.userId,
    approvalId: input.approvalId,
    personaId: input.personaId,
    originalDraft: input.originalDraft,
    editedDraft: input.editedDraft,
    capturedAt: new Date(),
  };
  db.insert(schema.founderVoiceEdits).values(row).run();
  return FounderVoiceEditSchema.parse(row);
}
