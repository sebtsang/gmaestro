import "server-only";
import type { AgentDefinition } from "@anthropic-ai/claude-agent-sdk";
import { csManager, CS_MANAGER_AGENT_NAME } from "./cs";
import { insightManager, INSIGHT_MANAGER_AGENT_NAME } from "./insight";
import { revopsManager, REVOPS_MANAGER_AGENT_NAME } from "./revops";
import { salesManager, SALES_MANAGER_AGENT_NAME } from "./sales";

export {
  csManager,
  insightManager,
  revopsManager,
  salesManager,
  CS_MANAGER_AGENT_NAME,
  INSIGHT_MANAGER_AGENT_NAME,
  REVOPS_MANAGER_AGENT_NAME,
  SALES_MANAGER_AGENT_NAME,
};

export const managerAgents: Record<string, AgentDefinition> = {
  [SALES_MANAGER_AGENT_NAME]: salesManager,
  [CS_MANAGER_AGENT_NAME]: csManager,
  [REVOPS_MANAGER_AGENT_NAME]: revopsManager,
  [INSIGHT_MANAGER_AGENT_NAME]: insightManager,
};

export const MANAGER_AGENT_NAMES = [
  SALES_MANAGER_AGENT_NAME,
  CS_MANAGER_AGENT_NAME,
  REVOPS_MANAGER_AGENT_NAME,
  INSIGHT_MANAGER_AGENT_NAME,
] as const;
