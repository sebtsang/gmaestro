import {
  Activity,
  Briefcase,
  Building2,
  Calendar,
  ChartBar,
  ClipboardCheck,
  FileSearch,
  FileText,
  GraduationCap,
  Layers,
  MessagesSquare,
  Network,
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
};

export const DEPARTMENT_LABEL: Record<Department, string> = {
  sales: "Sales",
  cs: "Customer Success",
  revops: "RevOps",
  insight: "Insight",
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
};

export const DEPARTMENT_ICON: Record<Department, LucideIcon> = {
  sales: TrendingUp,
  cs: Users,
  revops: Briefcase,
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
};

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
