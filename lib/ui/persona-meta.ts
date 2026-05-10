import {
  Activity,
  Briefcase,
  Building2,
  Calendar,
  ChartBar,
  ClipboardCheck,
  FileSearch,
  FileText,
  Globe,
  GraduationCap,
  Hash,
  Layers,
  MessageCircle,
  MessagesSquare,
  Network,
  Newspaper,
  Palette,
  PenLine,
  Search,
  Sparkles,
  Tag,
  TrendingUp,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import type { Department, PersonaId } from "@/lib/shared/types";

export const DEPARTMENT_OF_PERSONA: Record<PersonaId, Department> = {
  researcher: "sales",
  qualifier: "sales",
  strategist: "sales",
  writer: "sales",
  scheduler: "sales",
  "brief-writer": "sales",
  activation: "cs",
  "crm-logger": "revops",
  "pipeline-reporter": "revops",
  "slack-digest": "revops",
  "feedback-tagger": "insight",
  "theme-synthesizer": "insight",
  "linear-filer": "insight",
  "linkedin-researcher": "content",
  "x-researcher": "content",
  "reddit-researcher": "content",
  synthesizer: "content",
  "blog-writer": "content",
  "blog-designer": "content",
};

export const DEPARTMENT_LABEL: Record<Department, string> = {
  sales: "Sales",
  cs: "Customer Success",
  revops: "RevOps",
  insight: "Insight",
  content: "Content",
};

export const PERSONA_LABEL: Record<PersonaId, string> = {
  researcher: "Researcher",
  qualifier: "Qualifier",
  strategist: "Strategist",
  writer: "Writer",
  scheduler: "Scheduler",
  "brief-writer": "Brief Writer",
  activation: "Activation",
  "crm-logger": "CRM Logger",
  "pipeline-reporter": "Pipeline Reporter",
  "slack-digest": "Slack Digest",
  "feedback-tagger": "Feedback Tagger",
  "theme-synthesizer": "Theme Synthesizer",
  "linear-filer": "Linear Filer",
  "linkedin-researcher": "LinkedIn Researcher",
  "x-researcher": "X Researcher",
  "reddit-researcher": "Reddit Researcher",
  synthesizer: "Synthesizer",
  "blog-writer": "Blog Writer",
  "blog-designer": "Blog Designer",
};

export const PERSONA_ICON: Record<PersonaId, LucideIcon> = {
  researcher: Search,
  qualifier: ClipboardCheck,
  strategist: Sparkles,
  writer: PenLine,
  scheduler: Calendar,
  "brief-writer": FileText,
  activation: GraduationCap,
  "crm-logger": Building2,
  "pipeline-reporter": ChartBar,
  "slack-digest": MessagesSquare,
  "feedback-tagger": Tag,
  "theme-synthesizer": Layers,
  "linear-filer": FileSearch,
  "linkedin-researcher": Globe,
  "x-researcher": Hash,
  "reddit-researcher": MessageCircle,
  synthesizer: Sparkles,
  "blog-writer": PenLine,
  "blog-designer": Palette,
};

export const DEPARTMENT_ICON: Record<Department, LucideIcon> = {
  sales: TrendingUp,
  cs: Users,
  revops: Briefcase,
  insight: Activity,
  content: Newspaper,
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
  sales: [
    "researcher",
    "qualifier",
    "strategist",
    "writer",
    "scheduler",
    "brief-writer",
  ],
  cs: ["activation"],
  revops: ["crm-logger", "pipeline-reporter", "slack-digest"],
  insight: ["feedback-tagger", "theme-synthesizer", "linear-filer"],
  content: [
    "linkedin-researcher",
    "x-researcher",
    "reddit-researcher",
    "synthesizer",
    "blog-writer",
    "blog-designer",
  ],
};

/**
 * One-sentence role descriptions surfaced in the node-detail popover so a
 * non-technical founder can answer "what does this worker do?" without
 * reading code or task ids. Copy is intentionally peer-to-peer, not jargony.
 */
export const PERSONA_ROLE: Record<PersonaId, string> = {
  researcher:
    "Looks up each lead's company, role, and recent intent signals.",
  qualifier:
    "Scores leads on fit and intent, sorts them into hot / warm / cold.",
  strategist:
    "Picks the right outreach angle and tone for each lead.",
  writer:
    "Drafts a personalized email — never sends, always queues for your review.",
  scheduler:
    "Books meetings on your calendar once a lead is ready to talk.",
  "brief-writer":
    "Writes a meeting-prep doc before each call.",
  activation:
    "Nudges trial users who are stalling, gently.",
  "crm-logger":
    "Mirrors qualified leads and drafts into your CRM.",
  "pipeline-reporter":
    "Rolls up the day's pipeline movement for review.",
  "slack-digest":
    "Posts the daily wrap-up to Slack.",
  "feedback-tagger":
    "Tags incoming feedback by theme.",
  "theme-synthesizer":
    "Synthesizes recurring themes from feedback.",
  "linear-filer":
    "Files Linear tickets for product feedback.",
  "linkedin-researcher":
    "Pulls keywords, ICP signals, and competitor angles from LinkedIn.",
  "x-researcher":
    "Tracks trending threads and SEO terms your buyers are sharing on X.",
  "reddit-researcher":
    "Mines subreddits your ICP reads for the questions they actually ask.",
  synthesizer:
    "Combines the three research feeds and ideates blog topics worth writing.",
  "blog-writer":
    "Drafts the blog post in your voice — never publishes, always queues for review.",
  "blog-designer":
    "Wraps the draft in self-contained HTML ready to deploy or hand off.",
};

/**
 * Department-level role copy. Surfaced on Manager-node popovers so the user
 * understands what an entire dept is for, before drilling into individual
 * specialists.
 */
export const DEPARTMENT_ROLE: Record<Department, string> = {
  sales:
    "Handles inbound leads end-to-end — research, qualify, draft outreach.",
  cs: "Watches trial signals and re-engages stalled users.",
  revops: "Mirrors pipeline state into your CRM and Slack.",
  insight: "Captures and routes product feedback.",
  content:
    "Researches your ICP across LinkedIn, X, and Reddit, then writes and designs the blog.",
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
