/**
 * The 13-specialist persona registry.
 *
 * Extends the foundation `Persona` type with Zod input/output schemas so
 * `runPersona()` can validate at both ends of a query() call. Output schemas
 * for canonical artifacts come from `lib/shared/schemas.ts`; for the few
 * persona-internal artifacts (crm-logger receipt, slack-digest message ref,
 * etc.) we declare local schemas here and promote to shared if cross-session
 * callers ever need them.
 *
 * EXACTLY 13 personas. Health Monitor was dropped per audit. Do NOT add any
 * without updating CLAUDE.md, scopes, prompts, and the PersonaId union in
 * lib/shared/types.ts.
 */

import "server-only";
import { z, type ZodTypeAny } from "zod";
import {
  ActivationNudgeSchema,
  BookedMeetingSchema,
  EnrichedLeadSchema,
  OutreachDraftSchema,
  OutreachStrategySchema,
  PrepBriefSchema,
  QualifiedLeadSchema,
} from "@/lib/shared/schemas";
import type { Persona, PersonaId } from "@/lib/shared/types";
import { PERSONA_SCOPES } from "@/lib/tools/scopes";

export interface PersonaConfig extends Persona {
  inputSchema: ZodTypeAny;
  outputSchema: ZodTypeAny;
}

const baseInput = z.object({
  workflowRunId: z.string().optional(),
  nodeId: z.string().optional(),
});
const leadInput = baseInput.extend({ leadId: z.string() });

function cfg(
  id: PersonaId,
  department: Persona["department"],
  modelTier: Persona["modelTier"],
  inputSchema: ZodTypeAny,
  outputSchema: ZodTypeAny,
  maxConcurrency = 10,
): PersonaConfig {
  return {
    id,
    layer: "specialist",
    department,
    systemPromptPath: `lib/personas/prompts/${id}.md`,
    allowedActions: [...PERSONA_SCOPES[id]],
    modelTier,
    maxConcurrency,
    inputSchema,
    outputSchema,
  };
}

export const PERSONA_REGISTRY: Record<PersonaId, PersonaConfig> = {
  // ----- Sales -----
  researcher: cfg(
    "researcher",
    "sales",
    "sonnet",
    leadInput,
    EnrichedLeadSchema,
    // LinkedIn is bucket-throttled at 1/sec; cap concurrency to match.
    5,
  ),
  qualifier: cfg("qualifier", "sales", "sonnet", leadInput, QualifiedLeadSchema),
  strategist: cfg(
    "strategist",
    "sales",
    "sonnet",
    leadInput,
    OutreachStrategySchema,
  ),
  writer: cfg("writer", "sales", "sonnet", leadInput, OutreachDraftSchema),
  scheduler: cfg(
    "scheduler",
    "sales",
    "sonnet",
    leadInput.extend({ draftId: z.string() }),
    BookedMeetingSchema,
  ),
  "brief-writer": cfg(
    "brief-writer",
    "sales",
    "sonnet",
    baseInput.extend({ meetingId: z.string() }),
    PrepBriefSchema,
  ),

  // ----- CS -----
  activation: cfg(
    "activation",
    "cs",
    "sonnet",
    leadInput,
    ActivationNudgeSchema,
  ),

  // ----- RevOps -----
  "crm-logger": cfg(
    "crm-logger",
    "revops",
    "sonnet",
    leadInput,
    z.object({
      crmContactId: z.string(),
      action: z.string(),
    }),
  ),
  "pipeline-reporter": cfg(
    "pipeline-reporter",
    "revops",
    "sonnet",
    baseInput,
    z.object({
      summary: z.string(),
      metrics: z.record(z.string(), z.number()),
    }),
  ),
  "slack-digest": cfg(
    "slack-digest",
    "revops",
    "sonnet",
    baseInput,
    z.object({
      messageTs: z.string(),
      channel: z.string(),
    }),
  ),

  // ----- Insight -----
  "feedback-tagger": cfg(
    "feedback-tagger",
    "insight",
    "haiku",
    baseInput.extend({ messageId: z.string() }),
    z.object({
      themes: z.array(z.string()),
      sentiment: z.enum(["pos", "neg", "neu"]),
    }),
  ),
  "theme-synthesizer": cfg(
    "theme-synthesizer",
    "insight",
    "sonnet",
    baseInput,
    z.object({
      notionPageUrl: z.string().url(),
    }),
  ),
  "linear-filer": cfg(
    "linear-filer",
    "insight",
    "sonnet",
    baseInput.extend({ themeId: z.string() }),
    z.object({
      issueId: z.string(),
      issueUrl: z.string().url(),
    }),
  ),
};

/** All 13 persona configs, in registration order. */
export const ALL_PERSONAS: readonly PersonaConfig[] = Object.values(
  PERSONA_REGISTRY,
);
