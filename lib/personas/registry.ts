/**
 * The 9-specialist persona registry.
 *
 * Extends the foundation `Persona` type with Zod input/output schemas so
 * `runPersona()` can validate at both ends of a query() call. Output schemas
 * for canonical artifacts come from `lib/shared/schemas.ts`; for the merged
 * `revenue-operations` and `insights` personas we declare composite schemas
 * here that wrap their three former sub-personas' outputs in one structured
 * envelope.
 *
 * Do NOT add personas without updating CLAUDE.md, scopes, prompts, and the
 * PersonaId union in lib/shared/types.ts.
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
  // One persona produces the full RevOps envelope: per-lead CRM updates +
  // pipeline summary + Slack digest. Replaces the former trio (crm-logger,
  // pipeline-reporter, slack-digest). The dashboard's post-approval handler
  // dispatches the actual HubSpot writes / Slack posts when the founder
  // approves; this persona is a pure synthesizer.
  "revenue-operations": cfg(
    "revenue-operations",
    "revops",
    "sonnet",
    baseInput,
    z.object({
      crmUpdates: z
        .array(
          z.object({
            leadId: z.string(),
            crmContactId: z.string(),
            action: z.enum([
              "created",
              "updated",
              "noted",
              "appended",
              "failed",
            ]),
            note: z.string().optional(),
          }),
        )
        .default([]),
      summary: z.string(),
      metrics: z.record(z.string(), z.number()).default({}),
      slack: z.object({
        channel: z.string(),
        messageTs: z.string(),
        summaryBlocks: z.array(z.string()).default([]),
      }),
    }),
  ),

  // ----- Insight -----
  // One persona produces the full Insight envelope: tagged feedback +
  // synthesized themes + issues to file. Replaces the former trio
  // (feedback-tagger, theme-synthesizer, linear-filer).
  insights: cfg(
    "insights",
    "insight",
    "sonnet",
    baseInput.extend({
      item: z
        .object({
          feedback: z
            .array(
              z.object({
                id: z.string(),
                text: z.string(),
                source: z.string().optional(),
              }),
            )
            .default([]),
        })
        .optional(),
    }),
    z.object({
      taggedFeedback: z
        .array(
          z.object({
            feedbackId: z.string(),
            themes: z.array(z.string()).default([]),
            sentiment: z.enum(["pos", "neg", "neu"]),
          }),
        )
        .default([]),
      themes: z
        .array(
          z.object({
            label: z.string(),
            count: z.number().int().nonnegative(),
            representativeQuote: z.string(),
            suggestedAction: z.enum([
              "file-linear",
              "file-github",
              "write-doc",
              "monitor",
              "ignore",
            ]),
          }),
        )
        .default([]),
      notionPageUrl: z.string().url(),
      issuesToFile: z
        .array(
          z.object({
            issueId: z.string(),
            issueUrl: z.string().url(),
            title: z.string(),
            description: z.string().optional(),
            labels: z.array(z.string()).default([]),
          }),
        )
        .default([]),
    }),
  ),
};

/** All persona configs, in registration order. */
export const ALL_PERSONAS: readonly PersonaConfig[] = Object.values(
  PERSONA_REGISTRY,
);
