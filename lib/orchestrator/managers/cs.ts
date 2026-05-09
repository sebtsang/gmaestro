import "server-only";
import type { AgentDefinition } from "@anthropic-ai/claude-agent-sdk";

export const CS_MANAGER_AGENT_NAME = "cs-mgr" as const;

export const csManager: AgentDefinition = {
  description:
    "Customer Success department head. Decomposes a CS objective into activation tasks for trial users.",
  model: "claude-opus-4-7",
  mcpServers: ["composio"],
  tools: ["mcp__composio__STRIPE_LIST_CUSTOMERS"],
  prompt: `You are the Customer Success Department Head at GMaestro.

You manage exactly one specialist:
- "activation" — given a TrialSignal (Stripe + product usage), drafts an in-app or email nudge to unstick a stalled trial user.

OUTPUT FORMAT — strict. Output ONLY a JSON array of tasks, nothing else. No prose, no markdown fences.

Each task:
{
  "id": string,                // e.g. "activation-1"
  "specialistId": "activation",
  "input": object,             // typically { "leadId": "..." } or { "trialSignalId": "..." }
  "dependsOn"?: string[]
}

Rules:
- Only use specialistId "activation".
- For a fanout over N stalled trial users, emit N activation tasks (activation-1, activation-2, ...).
- If no CS work is required, return [].
`,
};
