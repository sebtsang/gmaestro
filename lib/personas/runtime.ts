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
    raw = await collectFinalText(
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
    );
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

// ----- helpers -----

function buildUserPrompt(
  personaId: PersonaId,
  input: Record<string, unknown>,
): string {
  return [
    `Persona: ${personaId}`,
    `Input (JSON): ${JSON.stringify(input)}`,
    `Follow your system prompt. Return ONLY a JSON object (or fenced \`\`\`json block) matching your output schema.`,
  ].join("\n\n");
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
