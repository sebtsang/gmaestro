/**
 * Generic persona invoker.
 *
 * `runPersona(personaId, input, userId)` is the single entry point any caller
 * (workflow function, ad-hoc tsx script, test) uses to execute a specialist:
 *
 *   1. Validate input against the persona's Zod inputSchema
 *   2. Emit `persona_started` activity event
 *   3. Call Claude Agent SDK `query()` with the persona's system prompt,
 *      Composio MCP server, scoped allowedTools, and tier-appropriate model
 *   4. Collect the final assistant text, parse the JSON object out of it
 *   5. Validate against the persona's Zod outputSchema
 *   6. Emit `persona_completed` and return the typed output
 *
 * Failures at any stage throw `PersonaRuntimeError` with a `stage` discriminator
 * so Session 1's workflow function can mark a node failed and continue (per
 * CLAUDE.md rule 11 — graceful degradation).
 */

import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { getModelForTier } from "@/lib/shared/models";
import type { PersonaId } from "@/lib/shared/types";
import { emitEvent } from "@/lib/state/activity";
import {
  getAllowedToolsForPersona,
  getMcpConfigForUser,
} from "@/lib/tools/composio";
import { PERSONA_REGISTRY } from "./registry";

export type PersonaRuntimeStage = "input" | "exec" | "parse" | "output";

export class PersonaRuntimeError extends Error {
  constructor(
    public personaId: PersonaId,
    public stage: PersonaRuntimeStage,
    cause: unknown,
  ) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    super(`runPersona[${personaId}] failed at ${stage}: ${reason}`);
    this.name = "PersonaRuntimeError";
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

export async function runPersona<TOut = unknown>(
  personaId: PersonaId,
  input: Record<string, unknown> & { workflowRunId?: string; nodeId?: string },
  userId: string,
): Promise<TOut> {
  const persona = PERSONA_REGISTRY[personaId];

  let parsedInput: Record<string, unknown> & {
    workflowRunId?: string;
    nodeId?: string;
  };
  try {
    parsedInput = persona.inputSchema.parse(input) as typeof parsedInput;
  } catch (e) {
    throw new PersonaRuntimeError(personaId, "input", e);
  }

  const workflowRunId = parsedInput.workflowRunId ?? "ad-hoc";
  const nodeId = parsedInput.nodeId ?? personaId;

  const promptBody = await readFile(
    path.resolve(process.cwd(), persona.systemPromptPath),
    "utf-8",
  );
  const mcpConfig = await getMcpConfigForUser(userId);

  await emitEvent(workflowRunId, nodeId, "persona_started", {
    personaId,
    input: parsedInput,
  });

  let raw: string;
  try {
    raw = await Promise.race([
      collectFinalText(
        query({
          prompt: buildUserPrompt(personaId, parsedInput),
          options: {
            model: getModelForTier(persona.modelTier),
            systemPrompt: promptBody,
            mcpServers: { composio: mcpConfig },
            allowedTools: getAllowedToolsForPersona(personaId),
            maxTurns: 8,
          },
        }),
      ),
      new Promise<string>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                `single-task invocation exceeded ${SINGLE_TIMEOUT_MS / 1000}s`,
              ),
            ),
          SINGLE_TIMEOUT_MS,
        ),
      ),
    ]);
  } catch (e) {
    throw new PersonaRuntimeError(personaId, "exec", e);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonBlock(raw));
  } catch (e) {
    throw new PersonaRuntimeError(personaId, "parse", e);
  }

  let output: TOut;
  try {
    output = persona.outputSchema.parse(parsed) as TOut;
  } catch (e) {
    throw new PersonaRuntimeError(personaId, "output", e);
  }

  await emitEvent(workflowRunId, nodeId, "persona_completed", {
    personaId,
    output: output as Record<string, unknown>,
  });
  return output;
}

// ============================================================================
//  Batch invoker — one LLM call processes N items via COMPOSIO_MULTI_EXECUTE_TOOL
// ============================================================================

export interface BatchItemEnvelope {
  /** The canonical id used to key output back to input (leadId, trialSignalId). */
  id: string;
  /** Persona-shaped payload (denormalized fields from work-context). */
  payload: Record<string, unknown>;
}

export interface BatchResult<TItem> {
  /** Per-item outputs keyed by source id. Missing ids → batch dropped them. */
  items: Map<string, TItem>;
  /** Optional cross-item observations (e.g. qualifier dedup groups). */
  mergedGroups?: Array<{ leadIds: string[]; reason: string }>;
}

const BATCH_MIN_VALID_FRACTION = 0.8;
const BATCH_MAX_RETRIES = 1;
const BATCH_CHUNK_SIZE_ON_RETRY = 10;
/**
 * Hard ceiling on a single batch persona invocation. The intended shape is
 * ONE MULTI_EXECUTE_TOOL call + ONE synthesis turn — anything longer means
 * the model is sequentially looping (defeats the batch optimization).
 * Throw and let the dispatcher fall back to skip-cascade rather than wait.
 */
const BATCH_TIMEOUT_MS = 90_000;
/**
 * Hard ceiling for single-task fanout personas. Open-weights models on
 * Ollama Cloud can occasionally wedge mid-stream; without this cap the
 * whole workflow stays "running" forever.
 */
const SINGLE_TIMEOUT_MS = 90_000;

/**
 * Run a persona in BATCH mode: one LLM call processes all items at once.
 *
 * The persona prompt is expected to instruct the model to issue ONE call to
 * `mcp__composio__COMPOSIO_MULTI_EXECUTE_TOOL` with N parallel sub-invocations
 * (Composio fans them out server-side, ~30× faster than N sequential agent
 * sessions). Output must be `{ items: [{leadId|trialSignalId, ...}], mergedGroups? }`.
 *
 * Partial failure handling:
 *   - ≥80% of input ids covered in output → mark missing ids as failed,
 *     return only the valid items. Skip-cascade in the dispatcher handles
 *     downstream chains for the missing ids.
 *   - <80% covered → re-chunk into groups of 10 and retry once. Beyond that,
 *     return whatever made it through.
 */
export async function runPersonaBatch<TItem = unknown>(
  personaId: PersonaId,
  envelopes: BatchItemEnvelope[],
  userId: string,
  ctx: { workflowRunId?: string; nodeId?: string } = {},
): Promise<BatchResult<TItem>> {
  const persona = PERSONA_REGISTRY[personaId];
  if (!persona.batchInputSchema || !persona.batchOutputSchema) {
    throw new PersonaRuntimeError(
      personaId,
      "input",
      new Error(
        `persona "${personaId}" has no batch schemas — caller should fall back to fanout`,
      ),
    );
  }

  const workflowRunId = ctx.workflowRunId ?? "ad-hoc";
  const nodeId = ctx.nodeId ?? `${personaId}__BATCH`;

  const promptBody = await readFile(
    path.resolve(process.cwd(), persona.systemPromptPath),
    "utf-8",
  );
  const mcpConfig = await getMcpConfigForUser(userId);

  await emitEvent(workflowRunId, nodeId, "persona_started", {
    personaId,
    input: { batchSize: envelopes.length },
  });

  const collected = await runBatchAttempt<TItem>(
    persona,
    personaId,
    envelopes,
    promptBody,
    mcpConfig,
    workflowRunId,
    nodeId,
  );

  const expectedIds = new Set(envelopes.map((e) => e.id));
  const validFraction = collected.items.size / Math.max(1, expectedIds.size);

  if (
    validFraction < BATCH_MIN_VALID_FRACTION &&
    BATCH_MAX_RETRIES > 0 &&
    envelopes.length > BATCH_CHUNK_SIZE_ON_RETRY
  ) {
    // Systemic batch failure — re-chunk and retry once on the missing ids only.
    const missing = envelopes.filter((e) => !collected.items.has(e.id));
    const chunks: BatchItemEnvelope[][] = [];
    for (let i = 0; i < missing.length; i += BATCH_CHUNK_SIZE_ON_RETRY) {
      chunks.push(missing.slice(i, i + BATCH_CHUNK_SIZE_ON_RETRY));
    }
    for (const chunk of chunks) {
      try {
        const retryResult = await runBatchAttempt<TItem>(
          persona,
          personaId,
          chunk,
          promptBody,
          mcpConfig,
          workflowRunId,
          nodeId,
        );
        for (const [k, v] of retryResult.items) collected.items.set(k, v);
        if (retryResult.mergedGroups?.length) {
          collected.mergedGroups = [
            ...(collected.mergedGroups ?? []),
            ...retryResult.mergedGroups,
          ];
        }
      } catch {
        // Per-chunk failure on retry is logged via emitEvent inside the attempt,
        // but we keep going so other chunks have a chance.
      }
    }
  }

  await emitEvent(workflowRunId, nodeId, "persona_completed", {
    personaId,
    output: {
      batchSize: envelopes.length,
      coverage: collected.items.size,
      mergedGroups: collected.mergedGroups?.length ?? 0,
    },
  });

  return collected;
}

async function runBatchAttempt<TItem>(
  persona: (typeof PERSONA_REGISTRY)[PersonaId],
  personaId: PersonaId,
  envelopes: BatchItemEnvelope[],
  promptBody: string,
  mcpConfig: Awaited<ReturnType<typeof getMcpConfigForUser>>,
  workflowRunId: string,
  nodeId: string,
): Promise<BatchResult<TItem>> {
  const items = envelopes.map((e) => ({ ...e.payload, [keyField(e)]: e.id }));
  const inputForValidation = { items, workflowRunId, nodeId };

  try {
    persona.batchInputSchema!.parse(inputForValidation);
  } catch (e) {
    throw new PersonaRuntimeError(personaId, "input", e);
  }

  const userPrompt = buildBatchUserPrompt(personaId, items);

  let raw: string;
  try {
    raw = await Promise.race([
      collectFinalText(
        query({
          prompt: userPrompt,
          options: {
            model: getModelForTier(persona.modelTier),
            systemPrompt: promptBody,
            mcpServers: { composio: mcpConfig },
            allowedTools: getAllowedToolsForPersona(personaId),
            // Batch shape: tool call + tool result + synthesis = 3 turns. Cap at
            // 6 for one round of correction. Anything more = the model is
            // looping sequentially through items (defeats the optimization).
            maxTurns: 6,
          },
        }),
      ),
      new Promise<string>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                `batch invocation exceeded ${BATCH_TIMEOUT_MS / 1000}s — model is looping`,
              ),
            ),
          BATCH_TIMEOUT_MS,
        ),
      ),
    ]);
  } catch (e) {
    throw new PersonaRuntimeError(personaId, "exec", e);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonBlock(raw));
  } catch (e) {
    // Log a slice of the raw output so we can see WHY parse failed (model
    // returned narration instead of JSON, hit maxTurns mid-output, etc.).
    console.warn(
      `[runPersonaBatch:${personaId}] parse failed — raw response (first 500 chars): ${raw.slice(0, 500)}`,
    );
    throw new PersonaRuntimeError(personaId, "parse", e);
  }

  let output: { items: Array<Record<string, unknown>>; mergedGroups?: Array<{ leadIds: string[]; reason: string }> };
  try {
    output = persona.batchOutputSchema!.parse(parsed) as typeof output;
  } catch (e) {
    console.warn(
      `[runPersonaBatch:${personaId}] schema validation failed — parsed shape: ${JSON.stringify(parsed).slice(0, 500)}`,
    );
    throw new PersonaRuntimeError(personaId, "output", e);
  }

  // Index by source id, accepting common alias keys (leadId, lead_id, id).
  const byId = new Map<string, TItem>();
  const expected = new Set(envelopes.map((e) => e.id));
  const seen = new Set<string>();
  for (const it of output.items) {
    const id =
      (it.leadId as string | undefined) ??
      (it.trialSignalId as string | undefined) ??
      (it.id as string | undefined);
    if (!id || !expected.has(id) || seen.has(id)) continue;
    seen.add(id);
    byId.set(id, it as TItem);
  }

  return { items: byId, mergedGroups: output.mergedGroups };
}

function keyField(envelope: BatchItemEnvelope): string {
  // Mirror what the work-context loader put in the payload.
  if ("trialSignalId" in envelope.payload) return "trialSignalId";
  return "leadId";
}

function buildBatchUserPrompt(
  personaId: PersonaId,
  items: Array<Record<string, unknown>>,
): string {
  return [
    `Persona: ${personaId} (BATCH MODE — ${items.length} items)`,
    "",
    "Step 1: Issue exactly ONE call to mcp__composio__COMPOSIO_MULTI_EXECUTE_TOOL",
    "        with one sub-invocation per item. Do NOT make separate tool calls",
    "        for each item — that defeats the batch optimization.",
    "",
    "Step 2: After the tool result lands, emit a SINGLE final assistant message",
    "        whose entire body is a fenced JSON block (```json ... ```) matching:",
    "          { \"items\": [...], \"mergedGroups\"?: [...] }",
    "        Every input id MUST appear in `items`. If a sub-call failed,",
    "        still emit a row with the id and an `error` field — never silently",
    "        drop an id.",
    "",
    "DO NOT emit any narration, explanation, or prose outside the ```json``` block.",
    "DO NOT call MULTI_EXECUTE_TOOL more than once.",
    "DO NOT call any other tool sequentially per-item.",
    "",
    "AUTHENTICATION HANDLING — if a tool returns an authentication-required error",
    "(e.g. an OAuth URL, 401, NOT_CONNECTED), DO NOT relay that URL to the user",
    "and DO NOT prompt for action. Instead, emit the JSON output with each",
    "affected item's row containing { \"<id-field>\": \"<id>\", \"error\":",
    "\"integration_not_connected\" }. The dashboard surfaces this and the",
    "founder fixes it on the Connections page — that is NOT your job.",
    "",
    `Items (JSON): ${JSON.stringify(items)}`,
  ].join("\n");
}

// ----- helpers -----

function buildUserPrompt(
  personaId: PersonaId,
  input: Record<string, unknown>,
): string {
  const { previousOutputs, ...rest } = input as Record<string, unknown> & {
    previousOutputs?: Record<string, Record<string, unknown>>;
  };
  const sections: string[] = [
    `Persona: ${personaId}`,
    `Input (JSON): ${JSON.stringify(rest)}`,
  ];
  if (previousOutputs && Object.keys(previousOutputs).length > 0) {
    sections.push(
      `Upstream task outputs (previousOutputs) — reference these when your system prompt needs an artifact id (e.g. previousOutputs.writer.draftId) from a dependency:\n${JSON.stringify(previousOutputs, null, 2)}`,
    );
  }
  sections.push(
    "Follow your system prompt. Return ONLY a JSON object (or fenced ```json block) matching your output schema.",
  );
  return sections.join("\n\n");
}

/**
 * Iterate the SDK message stream until we see the terminal `result` message,
 * then return its `result` text. Throws on `error_*` subtypes so callers wrap
 * them as PersonaRuntimeError(stage="exec").
 */
async function collectFinalText(
  q: AsyncIterable<SDKMessage>,
): Promise<string> {
  let lastAssistantText = "";
  for await (const msg of q) {
    if (msg.type === "assistant") {
      // Concatenate any text blocks from the assistant message.
      const blocks = msg.message?.content;
      if (Array.isArray(blocks)) {
        for (const b of blocks) {
          if (
            b &&
            typeof b === "object" &&
            "type" in b &&
            (b as { type: string }).type === "text" &&
            typeof (b as { text?: unknown }).text === "string"
          ) {
            lastAssistantText = (b as { text: string }).text;
          }
        }
      }
      continue;
    }
    if (msg.type === "result") {
      if (msg.subtype === "success") {
        return msg.result || lastAssistantText;
      }
      throw new Error(
        `query terminated with subtype=${msg.subtype}` +
          (msg.errors?.length ? `: ${msg.errors.join("; ")}` : ""),
      );
    }
  }
  if (lastAssistantText) return lastAssistantText;
  throw new Error("query stream ended without a result message");
}

/**
 * Extract the JSON object from a model reply. Handles three shapes:
 *   - raw JSON object
 *   - fenced ```json ... ``` block
 *   - prose with an embedded {...} object (takes the first balanced span)
 */
function extractJsonBlock(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return trimmed;

  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) return fence[1].trim();

  const start = trimmed.indexOf("{");
  if (start === -1) throw new Error("no JSON object found in model reply");
  let depth = 0;
  for (let i = start; i < trimmed.length; i++) {
    const c = trimmed[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return trimmed.slice(start, i + 1);
    }
  }
  throw new Error("unterminated JSON object in model reply");
}
