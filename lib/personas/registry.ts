/**
 * The 10-specialist persona registry — content / blog / GEO + SEO domain.
 *
 * Pivoted 2026-05-09 from 13 GTM personas to 10 content personas:
 *   Content (5):       researcher, strategist, writer, geo-editor, formatter
 *   Distribution (2):  pipeline-reporter, slack-digest
 *   Insight (3):       feedback-tagger, theme-synthesizer, linear-filer
 *
 * Extends the foundation `Persona` type with Zod input/output schemas so
 * `runPersona()` can validate at both ends of a query() call. Output schemas
 * for canonical artifacts come from `lib/shared/schemas.ts`.
 *
 * EXACTLY 10 personas. Do NOT add new ones without updating CLAUDE.md, scopes,
 * prompts, and the PersonaId union in lib/shared/types.ts.
 */

import "server-only";
import { z, type ZodTypeAny } from "zod";
import {
  BlogDraftSchema,
  ChannelVariantSchema,
  ContentOutlineSchema,
  TopicResearchBriefSchema,
  ToolkitIdSchema,
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
   * The dispatcher chooses batch vs fanout based on the task's `mode` field.
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

// ============================================================================
//  Per-persona input schemas
// ============================================================================

/** Researcher takes a topic seed (the founder's prompt or a candidate from a list). */
/**
 * Researcher input — accepts EITHER the new structured 3-input form payload
 * (companyUrl + docsUrl) OR a legacy `topic` string. The dispatcher pre-fetches
 * company-context + doc bundles via Pattern B and splats them in as
 * `companyBundle` + `docBundle` before invoking the LLM.
 */
const researcherInput = baseInput.extend({
  // New 3-input form fields (preferred path).
  companyUrl: z.string().url().optional(),
  docsUrl: z.string().url().optional(),
  destination: z
    .enum(["blog-html", "reddit", "x-thread"])
    .optional(),
  // Legacy: freeform topic from the old prompt-textarea path.
  topic: z.string().optional(),
  /** Optional company-grounding fields (set when CompanyProfile lands). */
  companyProfile: z.record(z.string(), z.unknown()).optional(),
});

/** Batch researcher: multiple topic candidates in one go. */
const researcherBatchItem = z.object({
  id: z.string(),
  topic: z.string(),
});
const researcherBatchInput = baseInput.extend({
  items: z.array(researcherBatchItem).min(1),
});

/** Strategist consumes a TopicResearchBrief (via previousOutputs.researcher). */
const strategistInput = baseInput.extend({
  topic: z.string().optional(),
  destination: z.enum(["blog-html", "reddit", "x-thread"]).optional(),
  researchBriefId: z.string().optional(),
});

/** Writer consumes an approved ContentOutline (via previousOutputs.strategist). */
const writerInput = baseInput.extend({
  outlineId: z.string().optional(),
  topic: z.string().optional(),
  destination: z.enum(["blog-html", "reddit", "x-thread"]).optional(),
});

/** GEO-Editor consumes a fresh draft (via previousOutputs.writer.body or .id). */
const geoEditorInput = baseInput.extend({
  draftId: z.string().optional(),
  destination: z.enum(["blog-html", "reddit", "x-thread"]).optional(),
});

/** Formatter consumes an approved BlogDraft + a single target (set via fanoutOver: "channels"). */
const formatterInput = baseInput.extend({
  draftId: z.string().optional(),
  target: ToolkitIdSchema,
});

const formatterBatchItem = z.object({
  id: z.string(),
  draftId: z.string(),
  target: ToolkitIdSchema,
});
const formatterBatchInput = baseInput.extend({
  items: z.array(formatterBatchItem).min(1),
});

// ============================================================================
//  cfg() helper
// ============================================================================

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

// ============================================================================
//  PERSONA_REGISTRY
// ============================================================================

export const PERSONA_REGISTRY: Record<PersonaId, PersonaConfig> = {
  // ----- Content (5) -----
  researcher: cfg(
    "researcher",
    "content",
    "sonnet",
    researcherInput,
    TopicResearchBriefSchema,
    // Reddit / X / Firecrawl / Perplexity have varying rate limits.
    // Keep at 5 to stay well below all of them.
    5,
    {
      input: researcherBatchInput,
      output: makeBatchOutputSchema(TopicResearchBriefSchema),
    },
  ),
  strategist: cfg(
    "strategist",
    "content",
    "sonnet",
    strategistInput,
    ContentOutlineSchema,
  ),
  writer: cfg("writer", "content", "sonnet", writerInput, BlogDraftSchema),
  "geo-editor": cfg(
    "geo-editor",
    "content",
    "sonnet",
    geoEditorInput,
    BlogDraftSchema,
  ),
  formatter: cfg(
    "formatter",
    "content",
    "sonnet",
    formatterInput,
    ChannelVariantSchema,
    10,
    {
      input: formatterBatchInput,
      output: makeBatchOutputSchema(ChannelVariantSchema),
    },
  ),

  // ----- Distribution (2) -----
  "pipeline-reporter": cfg(
    "pipeline-reporter",
    "distribution",
    "sonnet",
    baseInput,
    z.object({
      summary: z.string(),
      metrics: z.record(z.string(), z.number()),
    }),
  ),
  "slack-digest": cfg(
    "slack-digest",
    "distribution",
    "sonnet",
    baseInput,
    z.object({
      messageTs: z.string().optional(),
      channel: z.string().optional(),
      digestText: z.string(),
    }),
  ),

  // ----- Insight (3) -----
  "feedback-tagger": cfg(
    "feedback-tagger",
    "insight",
    "haiku",
    baseInput.extend({ messageId: z.string().optional() }),
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
      notionPageUrl: z.string().url().optional(),
      themes: z.array(z.string()).default([]),
    }),
  ),
  "linear-filer": cfg(
    "linear-filer",
    "insight",
    "sonnet",
    baseInput.extend({ themeId: z.string().optional() }),
    z.object({
      issueId: z.string(),
      issueUrl: z.string().url().optional(),
    }),
  ),

};

/** All 10 persona configs, in registration order. */
export const ALL_PERSONAS: readonly PersonaConfig[] = Object.values(
  PERSONA_REGISTRY,
);
