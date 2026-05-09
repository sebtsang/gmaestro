import "server-only";
import { query, type Options } from "@anthropic-ai/claude-agent-sdk";
import { WorkflowDAGSchema } from "@/lib/shared/schemas";
import type { ComposioMcpConfig, WorkflowDAG } from "@/lib/shared/types";
import { makeMockMcpConfig, makeMockWorkflowDAG } from "@/lib/shared/mocks";
import { managerAgents, MANAGER_AGENT_NAMES } from "./managers";

const CONDUCTOR_MODEL = "claude-opus-4-7";

export const CONDUCTOR_SYSTEM_PROMPT = `You are the Conductor of GMaestro, an AI GTM team for a YC W26 founder.

You have four department-head sub-agents you can invoke via the Agent tool:
- ${MANAGER_AGENT_NAMES.join(", ")}

Each manager owns a fixed roster of specialists. Your job:
1. Read the founder's objective.
2. Decide which department(s) should be involved.
3. Invoke the relevant managers (in parallel when independent) using the Agent tool. Each manager will return a JSON array of specialist tasks for its department.
4. Concatenate every manager's task array into a single flat array.
5. Output ONE final JSON object — and nothing else — matching this schema:

{
  "tasks": [
    {
      "id": string,                                                  // unique across the whole DAG
      "specialistId": "researcher" | "qualifier" | "strategist" | "writer" | "scheduler" | "brief-writer"
                    | "activation"
                    | "crm-logger" | "pipeline-reporter" | "slack-digest"
                    | "feedback-tagger" | "theme-synthesizer" | "linear-filer",
      "input": object,
      "dependsOn"?: string[]
    },
    ...
  ],
  "edges"?: [ { "from": string, "to": string, "artifactType": string } ]
}

STRICT OUTPUT RULES:
- Return ONLY the JSON object. No prose, no markdown code fences, no commentary before or after.
- The "tasks" array must be flat — no nesting per department. Each task must use one of the 13 specialist ids above.
- Cross-department dependencies are allowed (e.g. crm-logger-1 depends on writer-1). Use the task ids returned by the managers.
- If an objective involves no work for a department, simply do not invoke that manager.
`;

function buildConductorPrompt(prompt: string): string {
  return `Founder objective:\n\n${prompt}\n\nProduce the final WorkflowDAG JSON now.`;
}

async function getMcpConfig(userId: string): Promise<ComposioMcpConfig> {
  // TODO(session-2): swap to `getMcpConfigForUser(userId)` from
  // "@/lib/tools/composio" once Session 2 lands. Until then, the mock config
  // keeps the SDK happy without making real Composio calls.
  void userId;
  return makeMockMcpConfig();
}

function shouldUseMockConductor(): boolean {
  return (
    process.env.GMAESTRO_MOCK_CONDUCTOR === "1" ||
    !process.env.ANTHROPIC_API_KEY
  );
}

async function collectFinalResult(
  prompt: string,
  options: Options,
): Promise<string> {
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
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  // Direct parse first.
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through to extraction
  }
  // Strip ```json ... ``` fences if present.
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    return JSON.parse(fenceMatch[1].trim());
  }
  // Last resort: slice from first { to last }.
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
  }
  throw new Error("No JSON object found in conductor output");
}

export function parseWorkflowDAG(text: string): WorkflowDAG {
  const raw = extractJson(text);
  return WorkflowDAGSchema.parse(raw);
}

export async function runConductor(
  workflowRunId: string,
  prompt: string,
  founderId: string,
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
  const baseOptions: Options = {
    model: CONDUCTOR_MODEL,
    systemPrompt: CONDUCTOR_SYSTEM_PROMPT,
    mcpServers: { composio: mcpConfig },
    allowedTools: ["Agent"],
    agents: managerAgents,
    maxTurns: 12,
  };

  const userPrompt = buildConductorPrompt(prompt);
  const firstResult = await collectFinalResult(userPrompt, baseOptions);

  try {
    return parseWorkflowDAG(firstResult);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.warn(
      `[conductor] First parse failed for run ${workflowRunId}: ${errorMessage}. Retrying once.`,
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
