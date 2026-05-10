import "server-only";
import { query, type Options } from "@anthropic-ai/claude-agent-sdk";
import { extractJson } from "@/lib/shared/extract-json";
import { WorkflowDAGSchema } from "@/lib/shared/schemas";
import { getModelForTier } from "@/lib/shared/models";
import type { ComposioMcpConfig, WorkflowDAG } from "@/lib/shared/types";
import { makeMockMcpConfig, makeMockWorkflowDAG } from "@/lib/shared/mocks";
import type { WorkContext } from "@/lib/state/work-context";
import { managerAgents, MANAGER_AGENT_NAMES } from "./managers";

export const CONDUCTOR_SYSTEM_PROMPT = `You are the Conductor of GMaestro, an AI content team for a pre-Series A founder. The team optimizes for both traditional SEO and Generative Engine Optimization (GEO — citation by ChatGPT / Perplexity / Claude / Gemini / Google AI Overviews).

You have three department-head sub-agents you can invoke via the Agent tool:
- ${MANAGER_AGENT_NAMES.join(", ")}

Each manager owns a fixed roster of specialists. Your job:
1. Read the founder's objective. The objective typically names a topic (or asks to plan multiple) and may specify channels, audience, voice constraints.
2. Read the AVAILABLE WORK ITEMS section if present — multi-topic sprints expose a "topics" collection. Single-blog runs typically have no work items; the topic is in the objective itself.
3. Decide which department(s) should be involved.
4. Invoke the relevant managers (in parallel when independent) using the Agent tool. Each manager will return a JSON array of specialist tasks for its department, possibly using the FANOUT TEMPLATE pattern (see below).
5. Concatenate every manager's task array into a single flat array.
6. Output ONE final JSON object — and nothing else — matching this schema:

{
  "tasks": [
    {
      "id": string,                                                  // unique across the whole DAG
      "specialistId": "researcher" | "strategist" | "writer" | "geo-editor" | "formatter"
                    | "pipeline-reporter" | "slack-digest"
                    | "feedback-tagger" | "theme-synthesizer" | "linear-filer",
      "input": object,                                               // values may contain the literal token "\${each}" when fanoutOver is set
      "dependsOn"?: string[],                                        // ids of upstream tasks in this same DAG
      "passOutput"?: string[],                                       // whitelist of output keys to expose to downstream tasks (default: expose all)
      "triggerRule"?: "all_success" | "all_done",                    // default "all_success"; use "all_done" for tasks that should run even if upstream failed (e.g. a final summary)
      "fanoutOver"?: "topics" | "channels",                          // if set, system materializes one task per item in the named collection
      "mode"?: "batch" | "fanout"                                    // batch = ONE LLM call processes all items (~30× faster); fanout = N LLM calls. Default batch for read/synth personas, fanout for write-with-approval.
    }
  ],
  "edges"?: [ { "from": string, "to": string, "artifactType": string } ]
}

CONTENT WORKFLOW SHAPE — typical single-blog run:
  researcher → strategist → [Outline approval] → writer → geo-editor → [BlogDraft approval + channels picker] → formatter (fanout over channels) → [per-channel preview approvals] → publish via dispatcher → pipeline-reporter → slack-digest

FANOUT TEMPLATES — read carefully:
- A task with "fanoutOver" is a TEMPLATE the system expands into one materialized task per source item.
- Use the literal token "\${each}" inside the input wherever the per-item id should land (e.g. { "topic": "\${each}" } or { "target": "\${each}" }).
- Within a single fanout chain, dependsOn references stay as the SHORT template id ("writer", not "writer-1"). The system rewires each instance correctly.
- A non-fanout task (e.g. "slack-digest") that depends on a fanout template ("formatter") will wait for ALL N instances of that template to complete.
- Downstream tasks read upstream outputs via previousOutputs.<upstreamTaskId>.<field>. Use passOutput on the upstream task to whitelist which output keys flow through.

CHANNELS FANOUT — special case:
- The "channels" fanoutOver source is set by the founder at BlogDraft approval time (they tick which destinations to publish to). The orchestrator materializes one formatter task per ticked target.
- The formatter task input MUST include "target": "\${each}".

STRICT OUTPUT RULES:
- Return ONLY the JSON object. No prose, no markdown code fences, no commentary before or after.
- The "tasks" array must be flat — no nesting per department. Each task must use one of the 10 specialist ids above.
- Cross-department dependencies are allowed (e.g. pipeline-reporter depends on formatter). Use the task ids returned by the managers.
- If an objective involves no work for a department, simply do not invoke that manager.
`;

function buildConductorPrompt(
  prompt: string,
  workContext: WorkContext,
): string {
  return `Founder objective:

${prompt}

AVAILABLE WORK ITEMS (loaded from the dashboard's local store; treat as the source of truth):

${workContext.summary}

Produce the final WorkflowDAG JSON now.`;
}

async function getMcpConfig(userId: string): Promise<ComposioMcpConfig> {
  // TODO(session-2): swap to `getMcpConfigForUser(userId)` from
  // "@/lib/tools/composio" once Session 2 lands. Until then, the mock config
  // keeps the SDK happy without making real Composio calls.
  void userId;
  return makeMockMcpConfig();
}

function shouldUseMockConductor(): boolean {
  // Only mock when explicitly opted in. Previously this also auto-activated
  // when ANTHROPIC_API_KEY was unset, but that footgun fired on the
  // legitimate OAuth path (Claude Code Pro/Max) — the SDK would happily use
  // Keychain creds, but we'd silently route around the real LLM. Let the
  // SDK throw a clear auth error if no creds are available.
  return process.env.GMAESTRO_MOCK_CONDUCTOR === "1";
}

// 180s: the Conductor invokes 4 manager sub-agents inside one query() call.
// With Ollama Cloud back to normal latency (~2s "hello" probes on 2026-05-09),
// 180s gives generous headroom for the 6-7 round-trip fanout while still
// failing fast if a model goes catatonic. Bump back to 300s if queue degrades.
const CONDUCTOR_TIMEOUT_MS = 180_000;

async function collectFinalResult(
  prompt: string,
  options: Options,
): Promise<string> {
  const inner = (async () => {
    const stream = query({ prompt, options });
    for await (const message of stream) {
      if (message.type === "result") {
        if (message.subtype !== "success") {
          throw new Error(
            `Conductor query failed: ${message.subtype}${
              "api_error_status" in message && message.api_error_status
                ? ` (status ${message.api_error_status})`
                : ""
            }`,
          );
        }
        return message.result;
      }
    }
    throw new Error("Conductor stream ended without a result message");
  })();

  return Promise.race([
    inner,
    new Promise<string>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `Conductor exceeded ${CONDUCTOR_TIMEOUT_MS / 1000}s — model is stuck`,
            ),
          ),
        CONDUCTOR_TIMEOUT_MS,
      ),
    ),
  ]);
}

export function parseWorkflowDAG(text: string): WorkflowDAG {
  const raw = extractJson(text);
  // Open-weights models (DeepSeek/Kimi) sometimes return just the array
  // instead of the documented `{ tasks: [...] }` envelope. Accept both shapes
  // — burning a retry on a wrapping mismatch wastes ~90s of LLM time.
  const wrapped =
    Array.isArray(raw) ? { tasks: raw } : (raw as { tasks?: unknown });
  return WorkflowDAGSchema.parse(wrapped);
}

export async function runConductor(
  workflowRunId: string,
  prompt: string,
  founderId: string,
  workContext: WorkContext,
): Promise<WorkflowDAG> {
  if (shouldUseMockConductor()) {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.warn(
        `[conductor] ANTHROPIC_API_KEY not set — using mock WorkflowDAG for run ${workflowRunId}.`,
      );
    } else {
      console.warn(
        `[conductor] GMAESTRO_MOCK_CONDUCTOR=1 — using mock WorkflowDAG for run ${workflowRunId}.`,
      );
    }
    return makeMockWorkflowDAG();
  }

  const mcpConfig = await getMcpConfig(founderId);
  // Override the per-manager model with the current tier resolution so a
  // single GMAESTRO_LLM_PROVIDER=ollama swap reroutes Conductor + Managers
  // simultaneously (managers/*.ts hardcode the Anthropic IDs at module load).
  const opusModel = getModelForTier("opus");
  const resolvedAgents = Object.fromEntries(
    Object.entries(managerAgents).map(([name, agent]) => [
      name,
      { ...agent, model: opusModel },
    ]),
  );
  const baseOptions: Options = {
    model: opusModel,
    systemPrompt: CONDUCTOR_SYSTEM_PROMPT,
    mcpServers: { composio: mcpConfig },
    allowedTools: ["Agent"],
    agents: resolvedAgents,
    maxTurns: 12,
  };

  const userPrompt = buildConductorPrompt(prompt, workContext);
  const firstResult = await collectFinalResult(userPrompt, baseOptions);

  try {
    return parseWorkflowDAG(firstResult);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.warn(
      `[conductor] First parse failed for run ${workflowRunId}: ${errorMessage}. Retrying once.`,
    );
    // Truncated raw response in the warning so future "no JSON" failures are
    // diagnosable without redeploying with debug logging.
    console.warn(
      `[conductor] raw response (first 400 chars): ${firstResult.slice(0, 400).replace(/\s+/g, " ")}`,
    );
    const retryPrompt = `Your previous response could not be parsed as a valid WorkflowDAG.

Parse / validation error:
${errorMessage}

Previous response:
${firstResult}

Output ONLY the corrected JSON object. No prose. No markdown fences.`;
    const retryResult = await collectFinalResult(retryPrompt, baseOptions);
    return parseWorkflowDAG(retryResult);
  }
}
