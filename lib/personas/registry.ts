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
  makeBatchOutputSchema,
} from "@/lib/shared/schemas";
import type { Persona, PersonaId } from "@/lib/shared/types";
import { PERSONA_SCOPES } from "@/lib/tools/scopes";

export interface PersonaConfig extends Persona {
  inputSchema: ZodTypeAny;
  outputSchema: ZodTypeAny;
  /**
   * If set, this persona supports BATCH mode: input is an array (one entry
   * per source-item) and output is `{ items: [...], mergedGroups?: [...] }`.
   * The dispatcher chooses batch vs fanout based on the task's `mode` field;
   * if a Manager emits `mode: "batch"` for a persona without batch schemas,
   * runtime falls back to fanout (logged warning, not an error).
   */
  batchInputSchema?: ZodTypeAny;
  batchOutputSchema?: ZodTypeAny;
}

const baseInput = z.object({
  workflowRunId: z.string().optional(),
  nodeId: z.string().optional(),
  previousOutputs: z
    .record(z.string(), z.record(z.string(), z.unknown()))
    .optional(),
});
const leadInput = baseInput.extend({ leadId: z.string() });

function cfg(
  id: PersonaId,
  department: Persona["department"],
  modelTier: Persona["modelTier"],
  inputSchema: ZodTypeAny,
  outputSchema: ZodTypeAny,
  maxConcurrency = 10,
  batch?: { input: ZodTypeAny; output: ZodTypeAny },
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
    batchInputSchema: batch?.input,
    batchOutputSchema: batch?.output,
  };
}

// ----- Batch input schemas: one wrapper per fanout source. -----
// Each item carries denormalized record fields the persona needs to act
// (email/name/company for leads; stalledAtStep for trial-signals) plus the
// canonical id used for output keying.

const leadItemSchema = z.object({
  leadId: z.string(),
  email: z.string().email().optional(),
  name: z.string().optional(),
  company: z.string().nullable().optional(),
});
const leadBatchInput = baseInput.extend({
  items: z.array(leadItemSchema).min(1),
});
// trial-signals batch input intentionally omitted — activation persona stays
// fanout-only for hackathon scope (each nudge needs per-user voice + approval).

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
    {
      input: leadBatchInput,
      output: makeBatchOutputSchema(EnrichedLeadSchema),
    },
  ),
  qualifier: cfg(
    "qualifier",
    "sales",
    "sonnet",
    leadInput,
    QualifiedLeadSchema,
    10,
    {
      input: leadBatchInput,
      output: makeBatchOutputSchema(QualifiedLeadSchema),
    },
  ),
  strategist: cfg(
    "strategist",
    "sales",
    "sonnet",
    leadInput,
    OutreachStrategySchema,
    10,
    {
      input: leadBatchInput,
      output: makeBatchOutputSchema(OutreachStrategySchema),
    },
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
    10,
    {
      input: leadBatchInput,
      output: makeBatchOutputSchema(
        z.object({
          leadId: z.string(),
          crmContactId: z.string(),
          action: z.string(),
        }),
      ),
    },
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

  // ----- Content (blogs pivot) -----
  // These are wired into the type system + persona registry so the mock
  // workflow + DAG renderer can reference them. Real-mode prompts/runtime
  // wiring lives in lib/orchestrator/managers/content.ts and the *.md prompts.
  // Schemas are intentionally permissive (z.unknown passthrough) — the blog
  // pipeline outputs aren't part of the canonical artifact catalog yet.
  "linkedin-researcher": cfg(
    "linkedin-researcher",
    "content",
    "sonnet",
    baseInput.extend({ topic: z.string().optional() }),
    z.object({}).passthrough(),
  ),
  "x-researcher": cfg(
    "x-researcher",
    "content",
    "sonnet",
    baseInput.extend({ topic: z.string().optional() }),
    z.object({}).passthrough(),
  ),
  "reddit-researcher": cfg(
    "reddit-researcher",
    "content",
    "sonnet",
    baseInput.extend({ topic: z.string().optional() }),
    z.object({}).passthrough(),
  ),
  synthesizer: cfg(
    "synthesizer",
    "content",
    "sonnet",
    baseInput,
    z.object({}).passthrough(),
  ),
  "blog-writer": cfg(
    "blog-writer",
    "content",
    "sonnet",
    baseInput,
    z.object({}).passthrough(),
  ),
  "blog-designer": cfg(
    "blog-designer",
    "content",
    "sonnet",
    baseInput,
    z.object({}).passthrough(),
  ),
};

/** All 13 persona configs, in registration order. */
export const ALL_PERSONAS: readonly PersonaConfig[] = Object.values(
  PERSONA_REGISTRY,
);
