import "server-only";
import type { AgentDefinition } from "@anthropic-ai/claude-agent-sdk";
import {
  contentManager,
  CONTENT_MANAGER_AGENT_NAME,
} from "./content";
import {
  distributionManager,
  DISTRIBUTION_MANAGER_AGENT_NAME,
} from "./distribution";
import { insightManager, INSIGHT_MANAGER_AGENT_NAME } from "./insight";

export {
  contentManager,
  distributionManager,
  insightManager,
  CONTENT_MANAGER_AGENT_NAME,
  DISTRIBUTION_MANAGER_AGENT_NAME,
  INSIGHT_MANAGER_AGENT_NAME,
};

export const managerAgents: Record<string, AgentDefinition> = {
  [CONTENT_MANAGER_AGENT_NAME]: contentManager,
  [DISTRIBUTION_MANAGER_AGENT_NAME]: distributionManager,
  [INSIGHT_MANAGER_AGENT_NAME]: insightManager,
};

export const MANAGER_AGENT_NAMES = [
  CONTENT_MANAGER_AGENT_NAME,
  DISTRIBUTION_MANAGER_AGENT_NAME,
  INSIGHT_MANAGER_AGENT_NAME,
] as const;
