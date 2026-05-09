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
import {
  query,
  type CanUseTool,
  type PermissionResult,
  type SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { getModelForTier } from "@/lib/shared/models";
import type { PersonaId } from "@/lib/shared/types";
import { emitEvent } from "@/lib/state/activity";
import { eventBus } from "@/lib/realtime/bus";
import {
  getAllowedToolsForPersona,
  getMcpConfigForUser,
} from "@/lib/tools/composio";
import { PERSONA_REGISTRY } from "./registry";

// ---------------------------------------------------------------------------
// Chain-of-command interception: a `canUseTool` callback that captures every
// proposed Composio call, emits the bottom-up validation flow as bus events
// (specialist → manager → founder), and either lets it through or denies
// (dry-run mode). Lets the dashboard show the GTM org chart actually working
// without depending on real OAuth + tool execution.
// ---------------------------------------------------------------------------

const READ_TOOL_PATTERNS = [
  /_GET(_|$)/,
  /_LIST(_|$)/,
  /_SEARCH(_|$)/,
  /_FETCH(_|$)/,
  /_LOOKUP(_|$)/,
  /_FIND(_|$)/,
  /_READ(_|$)/,
];

const WRITE_TOOL_PATTERNS = [
  /_SEND(_|$)/,
  /_CREATE(_|$)/,
  /_UPDATE(_|$)/,
  /_DELETE(_|$)/,
  /_POST(_|$)/,
  /_APPEND(_|$)/,
  /_REPLY(_|$)/,
];

function classifyBlastRadius(toolName: string): "low" | "medium" | "high" {
  // Strip the MCP prefix if present.
  const bare = toolName.replace(/^mcp__composio__/, "");
  // Drafts are a controlled middle ground — they don't notify a recipient.
  if (/_DRAFT(_|$)/.test(bare) || /^GMAIL_CREATE_EMAIL_DRAFT$/.test(bare))
    return "medium";
  // The Composio meta-tool itself is just a fanout shim — defer to its
  // sub-invocations for blast judgement (we still surface it as low so the
  // wrapper doesn't double-prompt the founder).
  if (bare === "COMPOSIO_MULTI_EXECUTE_TOOL") return "low";
  if (bare === "COMPOSIO_SEARCH_TOOLS") return "low";
  if (READ_TOOL_PATTERNS.some((p) => p.test(bare))) return "low";
  if (WRITE_TOOL_PATTERNS.some((p) => p.test(bare))) return "high";
  return "medium";
}

function isDryRun(): boolean {
  return process.env.GMAESTRO_DRY_RUN === "1";
}

interface ChainContext {
  workflowRunId: string;
  nodeId: string;
  personaId: PersonaId;
  department: PersonaId extends never ? never : "sales" | "cs" | "revops" | "insight";
  manager: string;
  /**
   * Mutable count of Composio (mcp__composio__*) tool calls captured during
   * this persona invocation. Used by the synthetic-events fallback so personas
   * that contractually owe a Composio call (e.g. writer → GMAIL_CREATE_EMAIL_DRAFT)
   * still produce a visible chain in the dashboard even when the model
   * shortcuts straight to the JSON output without calling the tool.
   */
  composioCallCount: number;
}

function makeChainContext(
  personaId: PersonaId,
  workflowRunId: string,
  nodeId: string,
): ChainContext {
  const persona = PERSONA_REGISTRY[personaId];
  const dept = persona.department ?? "sales";
  return {
    workflowRunId,
    nodeId,
    personaId,
    department: dept as ChainContext["department"],
    manager: `${dept}-mgr`,
    composioCallCount: 0,
  };
}

const COMPOSIO_TOOL_PREFIX = "mcp__composio__";

/**
 * Build a `canUseTool` callback for one persona invocation. For Composio tool
 * calls, emits the proposed → reviewed → executed event sequence on the bus
 * so the dashboard can render the chain of command — and in dry-run mode
 * denies execution after the visualization fires. Built-in SDK tools
 * (Read/Grep/etc.) are passed through silently so they don't pollute the
 * chain visualization (which is a story about the Composio tool surface).
 */
function buildCanUseTool(ctx: ChainContext): CanUseTool {
  return async (
    toolName: string,
    input: Record<string, unknown>,
  ): Promise<PermissionResult> => {
    if (!toolName.startsWith(COMPOSIO_TOOL_PREFIX)) {
      return { behavior: "allow", updatedInput: input };
    }

    ctx.composioCallCount += 1;
    const blastRadius = classifyBlastRadius(toolName);
    const dryRun = isDryRun();

    eventBus.emit("tool_call_proposed", {
      workflowRunId: ctx.workflowRunId,
      nodeId: ctx.nodeId,
      personaId: ctx.personaId,
      department: ctx.department,
      manager: ctx.manager,
      toolName,
      input: sanitizeInput(input),
      blastRadius,
    });

    // Tiny delay so the SSE stream renders the steps in order rather than
    // collapsing them into a single tick.
    await new Promise((r) => setTimeout(r, 80));

    const decision: "auto_approved" | "escalated_to_founder" =
      blastRadius === "high" || blastRadius === "medium"
        ? "escalated_to_founder"
        : "auto_approved";
    const reviewReason =
      decision === "auto_approved"
        ? `${ctx.manager} auto-approved (read-only, low blast)`
        : `${ctx.manager} escalated ${blastRadius}-blast call to founder`;

    eventBus.emit("tool_call_reviewed", {
      workflowRunId: ctx.workflowRunId,
      nodeId: ctx.nodeId,
      personaId: ctx.personaId,
      manager: ctx.manager,
      decision,
      reason: reviewReason,
    });

    await new Promise((r) => setTimeout(r, 80));

    if (dryRun) {
      eventBus.emit("tool_call_executed", {
        workflowRunId: ctx.workflowRunId,
        nodeId: ctx.nodeId,
        personaId: ctx.personaId,
        toolName,
        outcome: "dry_run",
        note: "GMAESTRO_DRY_RUN=1 — call captured for review, not executed",
      });
      return {
        behavior: "deny",
        message:
          "DRY_RUN: chain of command captured this call. Reply with the JSON output as if the tool had succeeded; do not retry.",
      };
    }

    eventBus.emit("tool_call_executed", {
      workflowRunId: ctx.workflowRunId,
      nodeId: ctx.nodeId,
      personaId: ctx.personaId,
      toolName,
      outcome: "executed",
    });
    return { behavior: "allow", updatedInput: input };
  };
}

/**
 * Personas that contractually owe a Composio tool call but where the model
 * (especially open-weights ones like Kimi K2.6) sometimes shortcuts straight
 * to the JSON output. For these, if `canUseTool` captured zero Composio
 * calls during the invocation, we synthesize the chain post-hoc from the
 * persona's typed output so the dashboard story stays consistent.
 *
 * The contract for a synthesizer: given the persona input + validated output,
 * return the tool call that *should* have been made (toolName + sanitized
 * input + blast radius). Returning null means "no synthesis applicable".
 */
type SyntheticToolCall = {
  toolName: string;
  input: Record<string, unknown>;
  blastRadius: "low" | "medium" | "high";
};

const SYNTHETIC_CHAIN_SYNTHESIZERS: Partial<
  Record<PersonaId, (input: Record<string, unknown>, output: Record<string, unknown>) => SyntheticToolCall | null>
> = {
  writer: (input, output) => {
    const item = (input.item as Record<string, unknown> | undefined) ?? {};
    const subject = output.subject as string | undefined;
    const body = output.body as string | undefined;
    if (!subject || !body) return null;
    const recipient =
      (output.to as string | undefined) ??
      (item.email as string | undefined) ??
      `<lead ${(input.leadId as string | undefined) ?? "?"}>`;
    return {
      toolName: `${COMPOSIO_TOOL_PREFIX}GMAIL_CREATE_EMAIL_DRAFT`,
      input: { recipient_email: recipient, subject, body },
      blastRadius: "medium",
    };
  },
};

/**
 * If the persona was supposed to call a Composio tool but didn't, emit a
 * synthetic proposed → reviewed → executed chain so the dashboard reflects
 * the intent of the persona's contract. Always emits with outcome="dry_run"
 * because by the time we run, we already have the persona's output — there's
 * no real call left to make.
 */
function maybeEmitSyntheticChain(
  ctx: ChainContext,
  input: Record<string, unknown>,
  output: Record<string, unknown>,
): void {
  if (ctx.composioCallCount > 0) return;
  const synthesize = SYNTHETIC_CHAIN_SYNTHESIZERS[ctx.personaId];
  if (!synthesize) return;
  const call = synthesize(input, output);
  if (!call) return;

  eventBus.emit("tool_call_proposed", {
    workflowRunId: ctx.workflowRunId,
    nodeId: ctx.nodeId,
    personaId: ctx.personaId,
    department: ctx.department,
    manager: ctx.manager,
    toolName: call.toolName,
    input: sanitizeInput(call.input),
    blastRadius: call.blastRadius,
  });
  eventBus.emit("tool_call_reviewed", {
    workflowRunId: ctx.workflowRunId,
    nodeId: ctx.nodeId,
    personaId: ctx.personaId,
    manager: ctx.manager,
    decision:
      call.blastRadius === "low" ? "auto_approved" : "escalated_to_founder",
    reason:
      call.blastRadius === "low"
        ? `${ctx.manager} auto-approved (read-only, low blast)`
        : `${ctx.manager} escalated ${call.blastRadius}-blast call to founder`,
  });
  eventBus.emit("tool_call_executed", {
    workflowRunId: ctx.workflowRunId,
    nodeId: ctx.nodeId,
    personaId: ctx.personaId,
    toolName: call.toolName,
    outcome: "dry_run",
    note: "synthesized from persona output (model skipped the tool call)",
  });
}

/** Trim large payloads so SSE frames stay readable; keep the keys though. */
function sanitizeInput(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === "string" && v.length > 240) {
      out[k] = v.slice(0, 240) + `… [+${v.length - 240} chars]`;
    } else {
      out[k] = v;
    }
  }
  return out;
}

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

  const chainCtx = makeChainContext(personaId, workflowRunId, nodeId);
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
            canUseTool: buildCanUseTool(chainCtx),
            // Single-task fanout shape: 1 tool call (e.g. GMAIL_DRAFT) + 1
            // synthesis turn. 4 turns is generous; more means the model is
            // looping (e.g. retrying after auth-required) and we'd rather
            // fail fast and let the dispatcher mark the node failed.
            maxTurns: 4,
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

  maybeEmitSyntheticChain(
    chainCtx,
    parsedInput,
    output as Record<string, unknown>,
  );

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
 * Hard ceiling for single-task fanout personas. 120s budget: ~20s model
 * preamble + ~30s Composio MCP roundtrip (Gmail/Slack tool execution) +
 * ~20s model synthesis with margin. 60s was too tight — real tool calls
 * via Composio routinely landed at 70-90s and lost successful drafts.
 */
const SINGLE_TIMEOUT_MS = 120_000;

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
  const chainCtx = makeChainContext(personaId, workflowRunId, nodeId);

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
            canUseTool: buildCanUseTool(chainCtx),
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
