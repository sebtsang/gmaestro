import {
  Activity,
  ChartBar,
  FileSearch,
  Layers,
  Megaphone,
  MessagesSquare,
  Network,
  Newspaper,
  Palette,
  PenLine,
  Search,
  Send,
  Sparkles,
  Tag,
  Wand2,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import type { Department, PersonaId } from "@/lib/shared/types";

export const DEPARTMENT_OF_PERSONA: Record<PersonaId, Department> = {
  // Content
  researcher: "content",
  strategist: "content",
  writer: "content",
  "geo-editor": "content",
  formatter: "content",
  // Distribution
  "pipeline-reporter": "distribution",
  "slack-digest": "distribution",
  // Insight
  "feedback-tagger": "insight",
  "theme-synthesizer": "insight",
  "linear-filer": "insight",
};

export const DEPARTMENT_LABEL: Record<Department, string> = {
  content: "Content",
  distribution: "Distribution",
  insight: "Insight",
};

export const PERSONA_LABEL: Record<PersonaId, string> = {
  researcher: "Researcher",
  strategist: "Strategist",
  writer: "Writer",
  "geo-editor": "GEO Editor",
  formatter: "Formatter",
  "pipeline-reporter": "Pipeline Reporter",
  "slack-digest": "Slack Digest",
  "feedback-tagger": "Feedback Tagger",
  "theme-synthesizer": "Theme Synthesizer",
  "linear-filer": "Linear Filer",
};

export const PERSONA_ICON: Record<PersonaId, LucideIcon> = {
  researcher: Search,
  strategist: Sparkles,
  writer: PenLine,
  "geo-editor": Wand2,
  formatter: Layers,
  "pipeline-reporter": ChartBar,
  "slack-digest": MessagesSquare,
  "feedback-tagger": Tag,
  "theme-synthesizer": Layers,
  "linear-filer": FileSearch,
};

export const DEPARTMENT_ICON: Record<Department, LucideIcon> = {
  content: Megaphone,
  distribution: Send,
  insight: Activity,
};

export function isPersonaId(value: string): value is PersonaId {
  return value in DEPARTMENT_OF_PERSONA;
}

export function getPersonaLabel(id: string): string {
  if (isPersonaId(id)) return PERSONA_LABEL[id];
  if (id === "conductor") return "Conductor";
  if (id.endsWith("-mgr")) {
    const dept = id.slice(0, -4) as Department;
    return DEPARTMENT_LABEL[dept] ? `${DEPARTMENT_LABEL[dept]} Manager` : id;
  }
  return id;
}

export function getNodeIcon(id: string): LucideIcon {
  if (isPersonaId(id)) return PERSONA_ICON[id];
  if (id === "conductor") return Workflow;
  if (id.endsWith("-mgr")) {
    const dept = id.slice(0, -4) as Department;
    return DEPARTMENT_ICON[dept] ?? Network;
  }
  return Network;
}

export type NodeStatus =
  | "pending"
  | "running"
  | "awaiting_approval"
  | "done"
  | "failed"
  | "skipped";

export const PERSONA_ORDER: Record<Department, PersonaId[]> = {
  content: ["researcher", "strategist", "writer", "geo-editor", "formatter"],
  distribution: ["pipeline-reporter", "slack-digest"],
  insight: ["feedback-tagger", "theme-synthesizer", "linear-filer"],
};

/**
 * One-sentence role descriptions surfaced in the node-detail popover so a
 * non-technical founder can answer "what does this worker do?" without
 * reading code or task ids. Copy is intentionally peer-to-peer, not jargony.
 */
export const PERSONA_ROLE: Record<PersonaId, string> = {
  researcher:
    "Pulls Reddit / X / competitor blogs and AI-search citation footprints to surface candidate angles.",
  strategist:
    "Turns research into an outline with thesis, target keywords, and GEO signals.",
  writer:
    "Drafts the post in your voice — never publishes, always queues for your review.",
  "geo-editor":
    "Optimizes for AI search citation — direct-answer leads, fact density, schema recs.",
  formatter:
    "Reshapes one approved draft into per-channel variants (GitHub PR, Reddit, LinkedIn, X, Notion).",
  "pipeline-reporter":
    "Rolls up the run's content output — words, GEO signals, channels published.",
  "slack-digest":
    "Posts a content-shipping digest to Slack when the run wraps.",
  "feedback-tagger":
    "Tags post-publish reactions (Reddit comments, LinkedIn replies, analytics anomalies) by theme.",
  "theme-synthesizer":
    "Clusters recurring reader signals into a content backlog.",
  "linear-filer":
    "Files Linear tickets for topic gaps, quality issues, and follow-up requests.",
};

/**
 * Department-level role copy.
 */
export const DEPARTMENT_ROLE: Record<Department, string> = {
  content:
    "Researches, plans, drafts, and GEO-optimizes the post end-to-end.",
  distribution:
    "Reports the run + posts the content-shipping digest to Slack.",
  insight: "Captures post-publish reactions and routes them into the backlog.",
};

/**
 * Maps Composio tool slugs to plain-English descriptions of what the worker
 * is doing right now. The `mcp__composio__` prefix and SCREAMING_CASE are
 * removed entirely; if a tool isn't in the map we render a best-effort
 * Title Case fallback.
 */
const TOOL_NAME_HUMANIZED: Record<string, string> = {
  GMAIL_DRAFT: "Drafting an email",
  GMAIL_SEND: "Sending an email",
  GMAIL_FETCH_THREADS: "Reading recent emails",
  LINKEDIN_GET_PROFILE: "Looking up a LinkedIn profile",
  LINKEDIN_SEARCH_PERSON: "Searching LinkedIn for a person",
  LINKEDIN_GET_COMPANY: "Looking up a company on LinkedIn",
  GOOGLECALENDAR_FIND_FREE_SLOTS: "Checking your calendar",
  GOOGLECALENDAR_CREATE_EVENT: "Booking a meeting",
  HUBSPOT_CREATE_CONTACT: "Adding a contact in HubSpot",
  HUBSPOT_UPDATE_DEAL: "Updating a deal in HubSpot",
  SLACK_SEND_MESSAGE: "Posting to Slack",
  NOTION_CREATE_PAGE: "Writing a Notion page",
  LINEAR_CREATE_ISSUE: "Filing a Linear issue",
  INTERCOM_REPLY_TO_CONVERSATION: "Replying in Intercom",
  COMPOSIO_MULTI_EXECUTE_TOOL: "Running several actions at once",
  COMPOSIO_SEARCH_TOOLS: "Picking the right tool",
};

export const MCP_COMPOSIO_PREFIX = "mcp__composio__";

export function stripComposioPrefix(toolName: string): string {
  return toolName.startsWith(MCP_COMPOSIO_PREFIX)
    ? toolName.slice(MCP_COMPOSIO_PREFIX.length)
    : toolName;
}

export function humanizeTool(toolName: string): string {
  const stripped = stripComposioPrefix(toolName);
  const mapped = TOOL_NAME_HUMANIZED[stripped];
  if (mapped) return mapped;
  return stripped
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Plain-English status copy for the popover. Keep these short — they go in
 * a status pill alongside the persona name.
 */
export function statusCopy(status: NodeStatus): string {
  switch (status) {
    case "pending":
      return "Hasn't started";
    case "running":
      return "Working";
    case "awaiting_approval":
      return "Awaiting your review";
    case "done":
      return "Done";
    case "failed":
      return "Hit a snag";
    case "skipped":
      return "Skipped";
  }
}

export const STATUS_TONE: Record<
  NodeStatus,
  {
    bg: string;
    border: string;
    text: string;
    badgeBg: string;
    label: string;
  }
> = {
  pending: {
    bg: "bg-muted/40",
    border: "border-border",
    text: "text-muted-foreground",
    badgeBg: "bg-muted text-muted-foreground",
    label: "Pending",
  },
  running: {
    bg: "bg-blue-500/10",
    border: "border-blue-500/60",
    text: "text-blue-700 dark:text-blue-300",
    badgeBg: "bg-blue-500/20 text-blue-700 dark:text-blue-300",
    label: "Running",
  },
  awaiting_approval: {
    bg: "bg-amber-500/10",
    border: "border-amber-500/60",
    text: "text-amber-700 dark:text-amber-300",
    badgeBg: "bg-amber-500/20 text-amber-700 dark:text-amber-300",
    label: "Awaiting approval",
  },
  done: {
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/60",
    text: "text-emerald-700 dark:text-emerald-300",
    badgeBg: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
    label: "Done",
  },
  failed: {
    bg: "bg-rose-500/10",
    border: "border-rose-500/60",
    text: "text-rose-700 dark:text-rose-300",
    badgeBg: "bg-rose-500/20 text-rose-700 dark:text-rose-300",
    label: "Failed",
  },
  skipped: {
    bg: "bg-muted/30",
    border: "border-border/60",
    text: "text-muted-foreground",
    badgeBg: "bg-muted text-muted-foreground",
    label: "Skipped",
  },
};
