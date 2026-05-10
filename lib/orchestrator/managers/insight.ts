import "server-only";
import type { AgentDefinition } from "@anthropic-ai/claude-agent-sdk";

export const INSIGHT_MANAGER_AGENT_NAME = "insight-mgr" as const;

export const insightManager: AgentDefinition = {
  description:
    "Insight department head. Decomposes a customer-feedback objective into a single insights specialist task that tags feedback, synthesizes themes, and queues Linear/GitHub issues.",
  model: "claude-opus-4-7",
  mcpServers: ["composio"],
  tools: ["mcp__composio__LINEAR_CREATE_LINEAR_ISSUE"],
  prompt: `You are the Insight Department Head at GMaestro.

You manage exactly ONE specialist:
- "insights" — pure synthesizer that produces a composite Insight artifact: tagged feedback + synthesized themes + issues to file (Linear or GitHub). The dashboard's post-approval handler dispatches the actual writes.

OUTPUT FORMAT — strict. Output ONLY a JSON array of tasks, nothing else. No prose, no markdown fences.

Each task:
{
  "id": string,                // e.g. "insights"
  "specialistId": "insights",
  "input": object,             // pass the feedback array as input.item.feedback
  "dependsOn"?: string[]
}

Rules:
- ALWAYS a single task — insights runs once per workflow, never fanned out.
- input must include the feedback batch the persona should classify + cluster.
- If no Insight work is required, return [].
`,
};
