"use client";

/**
 * Detail popover for a selected DAG node. Mounted inside dag-view's DagNode
 * via React Flow's <NodeToolbar> so React Flow owns positioning, pan/zoom
 * transforms, and z-index. Content leads with the work item ("Working on
 * Dale Smith @ Acme") so a non-technical viewer can answer "what is this
 * worker on?" without reading task ids.
 */

import { ChevronLeft, ExternalLink, Mail, User, X } from "lucide-react";

import {
  DEPARTMENT_LABEL,
  DEPARTMENT_OF_PERSONA,
  DEPARTMENT_ROLE,
  PERSONA_ORDER,
  PERSONA_ROLE,
  STATUS_TONE,
  getNodeIcon,
  getPersonaLabel,
  humanizeTool,
  isPersonaId,
  statusCopy,
  type NodeStatus,
} from "@/lib/ui/persona-meta";
import type { WireEvent } from "@/lib/realtime/events";
import type {
  Department,
  PersonaId,
  WorkflowTask,
} from "@/lib/shared/types";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
//  Per-node timeline derivation
// ---------------------------------------------------------------------------

export interface NodeTimeline {
  startedAt: number | null;
  completedAt: number | null;
  input?: unknown;
  toolCalls: { toolName: string }[];
  artifacts: { type: string; id: string; link?: string | null }[];
  output?: unknown;
}

const EMPTY_TIMELINE: NodeTimeline = {
  startedAt: null,
  completedAt: null,
  toolCalls: [],
  artifacts: [],
};

export function deriveNodeTimelines(
  events: WireEvent[],
): Map<string, NodeTimeline> {
  const map = new Map<string, NodeTimeline>();
  const ensure = (id: string): NodeTimeline => {
    let t = map.get(id);
    if (!t) {
      t = { startedAt: null, completedAt: null, toolCalls: [], artifacts: [] };
      map.set(id, t);
    }
    return t;
  };

  events.forEach((e, idx) => {
    switch (e.type) {
      case "persona_started": {
        const t = ensure(e.payload.nodeId);
        t.startedAt = idx;
        if (e.payload.input !== undefined) t.input = e.payload.input;
        break;
      }
      case "tool_called":
        ensure(e.payload.nodeId).toolCalls.push({
          toolName: e.payload.toolName,
        });
        break;
      case "artifact_created":
        ensure(e.payload.nodeId).artifacts.push({
          type: e.payload.artifactType,
          id: e.payload.artifactId,
          link: e.payload.link ?? null,
        });
        break;
      case "persona_completed": {
        const t = ensure(e.payload.nodeId);
        t.completedAt = idx;
        if (e.payload.output !== undefined) t.output = e.payload.output;
        break;
      }
      default:
        break;
    }
  });

  return map;
}

// Per CLAUDE.md rule #17, the orchestrator denormalizes a fanout task's input
// at dispatch (`item: { fields }` splatted in), so once a persona_started
// event fires we have a real lead/trial/feedback to read. Pre-fanout
// templates still carry `${each}` tokens — we detect those and render role
// copy instead.

export type WorkItem =
  | { kind: "lead"; label: string; sublabel?: string; icon: "lead" }
  | { kind: "trial"; label: string; sublabel?: string; icon: "trial" }
  | { kind: "feedback"; label: string; sublabel?: string; icon: "feedback" }
  | { kind: "none" };

function containsTemplateToken(value: unknown): boolean {
  if (typeof value === "string") return value.includes("${each}");
  if (Array.isArray(value)) return value.some(containsTemplateToken);
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) {
      if (containsTemplateToken(v)) return true;
    }
  }
  return false;
}

function isTemplate(input: unknown): boolean {
  return (
    typeof input === "object" && input !== null && containsTemplateToken(input)
  );
}

export function getWorkItem(input: unknown): WorkItem {
  if (!input || typeof input !== "object") return { kind: "none" };
  if (isTemplate(input)) return { kind: "none" };
  const i = input as Record<string, unknown>;

  // Lead-shaped input (denormalized — preferred path)
  const lead = i.lead as Record<string, unknown> | undefined;
  if (lead && typeof lead === "object") {
    const name = typeof lead.name === "string" ? lead.name : null;
    const company = typeof lead.company === "string" ? lead.company : null;
    const email = typeof lead.email === "string" ? lead.email : undefined;
    if (name && company) {
      return { kind: "lead", label: `${name} @ ${company}`, sublabel: email, icon: "lead" };
    }
    if (name) return { kind: "lead", label: name, sublabel: email, icon: "lead" };
    if (email) return { kind: "lead", label: email, icon: "lead" };
  }

  // Trial-signal-shaped input
  const signal = i.signal as Record<string, unknown> | undefined;
  if (signal && typeof signal === "object") {
    const sLead = signal.lead as Record<string, unknown> | undefined;
    if (sLead && typeof sLead.name === "string") {
      const company = typeof sLead.company === "string" ? sLead.company : null;
      return {
        kind: "trial",
        label: company ? `${sLead.name} @ ${company}` : (sLead.name as string),
        sublabel: typeof signal.stalledAtStep === "string" ? `Stalled at: ${signal.stalledAtStep}` : undefined,
        icon: "trial",
      };
    }
    if (typeof signal.leadId === "string") {
      return { kind: "trial", label: signal.leadId, icon: "trial" };
    }
  }

  // Feedback / theme — Insight pipeline
  if (typeof i.theme === "string" && i.theme) {
    return { kind: "feedback", label: i.theme, icon: "feedback" };
  }
  if (typeof i.feedback === "string" && i.feedback) {
    const trimmed = i.feedback.length > 80 ? `${i.feedback.slice(0, 80)}…` : i.feedback;
    return { kind: "feedback", label: trimmed, icon: "feedback" };
  }

  // Generic item-shaped fallback
  const item = i.item as Record<string, unknown> | undefined;
  if (item && typeof item === "object") {
    if (typeof item.name === "string") return { kind: "lead", label: item.name, icon: "lead" };
    if (typeof item.id === "string") return { kind: "lead", label: item.id, icon: "lead" };
  }

  return { kind: "none" };
}

/** Used by fanout list rows. Falls back to the task id only if no work item. */
export function formatTaskTitle(task: WorkflowTask): string {
  const w = getWorkItem(task.input);
  return w.kind === "none" ? task.id : w.label;
}

// ---------------------------------------------------------------------------
//  "Currently doing" — translate the latest tool-call slug to plain English
// ---------------------------------------------------------------------------

function getCurrentlyDoing(
  timeline: NodeTimeline,
  status: NodeStatus,
): string | null {
  if (status === "pending" || status === "skipped") return null;
  const lastTool = timeline.toolCalls[timeline.toolCalls.length - 1];
  if (lastTool) return humanizeTool(lastTool.toolName);
  if (status === "running") return "Thinking…";
  return null;
}

// ---------------------------------------------------------------------------
//  Group descriptors
// ---------------------------------------------------------------------------

export type ConductorGroup = {
  prompt: string;
  totalTasks: number;
  activeDepts: Department[];
  status: NodeStatus;
};

export type ManagerGroup = {
  dept: Department;
  status: NodeStatus;
  personas: Array<{
    personaId: PersonaId;
    childCount: number;
    status: NodeStatus;
  }>;
};

export type StageGroup = {
  dept: Department;
  personaId: PersonaId;
  status: NodeStatus;
  isBatch: boolean;
  tasks: WorkflowTask[];
  taskStatuses: Map<string, NodeStatus>;
  timelines: Map<string, NodeTimeline>;
  /**
   * Personas this stage is waiting on (de-duped). Used to render
   * "Will start once the Qualifier finishes." for pending stages.
   * Empty array = no upstream dependency (top of the chain).
   */
  upstreamPersonas: PersonaId[];
};

export interface NodeDetailPopoverProps {
  conductor?: ConductorGroup;
  manager?: ManagerGroup;
  stage?: StageGroup;
  drillTaskId: string | null;
  onDrillIn: (taskId: string) => void;
  onDrillOut: () => void;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
//  Shared bits
// ---------------------------------------------------------------------------

function StatusPill({ status }: { status: NodeStatus }) {
  const tone = STATUS_TONE[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium",
        tone.badgeBg,
      )}
    >
      {statusCopy(status)}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </div>
  );
}

function WorkItemBlock({
  item,
  size = "md",
}: {
  item: Exclude<WorkItem, { kind: "none" }>;
  size?: "sm" | "md";
}) {
  const Icon = item.icon === "feedback" ? Mail : User;
  const labelClass =
    size === "md" ? "text-sm font-medium" : "text-xs font-medium";
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className={cn("truncate text-foreground", labelClass)}>
          {item.label}
        </div>
        {item.sublabel ? (
          <div className="truncate text-[11px] text-muted-foreground">
            {item.sublabel}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ShowRaw({
  label,
  value,
}: {
  label: string;
  value: unknown;
}) {
  let text: string;
  if (typeof value === "string") text = value;
  else {
    try {
      text = JSON.stringify(value, null, 2);
    } catch {
      text = String(value);
    }
  }
  return (
    <details className="group rounded border border-border/60 bg-muted/30 px-2 py-1 text-[11px]">
      <summary className="cursor-pointer text-[10px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground">
        {label}
      </summary>
      <pre className="mt-1.5 max-h-40 overflow-auto rounded bg-background/60 px-2 py-1.5 text-[11px] leading-snug text-foreground/80">
        {text}
      </pre>
    </details>
  );
}

function joinPersonas(personaIds: PersonaId[]): string {
  const labels = personaIds.map((p) => `the ${getPersonaLabel(p)}`);
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

// ---------------------------------------------------------------------------
//  Branches
// ---------------------------------------------------------------------------

function ConductorView({ group }: { group: ConductorGroup }) {
  const deptList =
    group.activeDepts.length > 0
      ? group.activeDepts.map((d) => DEPARTMENT_LABEL[d]).join(", ")
      : null;
  return (
    <div className="grid gap-3">
      <div>
        <SectionLabel>Your prompt</SectionLabel>
        <div className="mt-1 line-clamp-4 text-sm text-foreground">
          {group.prompt || (
            <span className="italic text-muted-foreground">(no prompt)</span>
          )}
        </div>
      </div>
      <div className="text-sm text-foreground">
        Planning {group.totalTasks} task{group.totalTasks === 1 ? "" : "s"}
        {deptList ? (
          <>
            {" "}
            across the <span className="font-medium">{deptList}</span> team
            {group.activeDepts.length === 1 ? "" : "s"}
          </>
        ) : null}
        .
      </div>
    </div>
  );
}

function ManagerView({ group }: { group: ManagerGroup }) {
  return (
    <div className="grid gap-3">
      <div className="text-sm text-foreground">
        {DEPARTMENT_ROLE[group.dept]}
      </div>
      <div className="grid gap-1.5">
        <SectionLabel>Team</SectionLabel>
        {group.personas.length === 0 ? (
          <div className="text-xs italic text-muted-foreground">
            Nobody dispatched yet.
          </div>
        ) : (
          <ul className="grid gap-1">
            {group.personas.map((p) => {
              const Icon = getNodeIcon(p.personaId);
              return (
                <li
                  key={p.personaId}
                  className="flex items-center gap-2 rounded border border-border/60 bg-card/50 px-2 py-1.5 text-xs"
                >
                  <Icon className="size-3.5 text-muted-foreground" />
                  <span className="flex-1 truncate">
                    {getPersonaLabel(p.personaId)}
                  </span>
                  {p.childCount > 1 ? (
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                      × {p.childCount}
                    </span>
                  ) : null}
                  <StatusPill status={p.status} />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * The detail view for a SINGLE materialized task. Used both as the inner
 * content of `StageSingleView` and as the drilled-in detail of a fanout row.
 */
function TaskDetailView({
  task,
  status,
  timeline,
  personaId,
  upstreamPersonas,
}: {
  task: WorkflowTask;
  status: NodeStatus;
  timeline: NodeTimeline;
  personaId: PersonaId;
  upstreamPersonas: PersonaId[];
}) {
  const work = getWorkItem(timeline.input ?? task.input);
  const currently = getCurrentlyDoing(timeline, status);
  const role = PERSONA_ROLE[personaId];

  let header: React.ReactNode;
  if (work.kind !== "none") {
    header = (
      <div className="grid gap-1.5">
        <SectionLabel>Working on</SectionLabel>
        <WorkItemBlock item={work} size="md" />
      </div>
    );
  } else if (status === "pending") {
    const blocked =
      upstreamPersonas.length > 0
        ? `Will start once ${joinPersonas(upstreamPersonas)} finishes.`
        : "Will start when there's work to do.";
    header = (
      <>
        <div className="text-sm text-foreground">{role}</div>
        <div className="text-xs text-muted-foreground">{blocked}</div>
      </>
    );
  } else {
    header = <div className="text-sm text-foreground">{role}</div>;
  }

  return (
    <div className="grid gap-3">
      {header}

      {currently ? (
        <div className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Currently:</span>{" "}
          {currently}
        </div>
      ) : null}

      {timeline.artifacts.length > 0 ? (
        <div className="grid gap-1">
          <SectionLabel>Produced</SectionLabel>
          <ul className="grid gap-0.5">
            {timeline.artifacts.map((a, idx) => (
              <li
                key={idx}
                className="flex items-center gap-1.5 text-[11px] text-foreground/80"
              >
                <span className="rounded bg-muted px-1 font-mono text-[10px]">
                  {a.type}
                </span>
                {a.link ? (
                  <a
                    href={a.link}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                  >
                    Open <ExternalLink className="size-3" />
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-1.5">
        {timeline.input !== undefined || task.input ? (
          <ShowRaw label="Show input" value={timeline.input ?? task.input} />
        ) : null}
        {timeline.output !== undefined ? (
          <ShowRaw label="Show output" value={timeline.output} />
        ) : null}
      </div>
    </div>
  );
}

function StageSingleView({ group }: { group: StageGroup }) {
  const task = group.tasks[0];
  if (!task) {
    return (
      <div className="grid gap-2">
        <div className="text-sm text-foreground">
          {PERSONA_ROLE[group.personaId]}
        </div>
        <div className="text-xs italic text-muted-foreground">
          {group.upstreamPersonas.length > 0
            ? `Will start once ${joinPersonas(group.upstreamPersonas)} finishes.`
            : "Hasn't been scheduled yet."}
        </div>
      </div>
    );
  }
  return (
    <TaskDetailView
      task={task}
      status={group.taskStatuses.get(task.id) ?? "pending"}
      timeline={group.timelines.get(task.id) ?? EMPTY_TIMELINE}
      personaId={group.personaId}
      upstreamPersonas={group.upstreamPersonas}
    />
  );
}

function StageBatchView({ group }: { group: StageGroup }) {
  const task = group.tasks[0];
  if (!task) {
    return (
      <div className="text-xs italic text-muted-foreground">
        No items to process yet.
      </div>
    );
  }
  const timeline = group.timelines.get(task.id) ?? EMPTY_TIMELINE;
  const role = PERSONA_ROLE[group.personaId];
  const verb = group.status === "done" ? "Processed" : "Processing";
  const currently = getCurrentlyDoing(timeline, group.status);
  return (
    <div className="grid gap-3">
      <div className="text-sm text-foreground">
        {verb} {group.tasks.length} item{group.tasks.length === 1 ? "" : "s"}
        {" "}in one batch.
      </div>
      <div className="text-xs text-muted-foreground">{role}</div>
      {currently ? (
        <div className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Currently:</span>{" "}
          {currently}
        </div>
      ) : null}
      {timeline.output !== undefined ? (
        <ShowRaw label="Show output" value={timeline.output} />
      ) : null}
    </div>
  );
}

function StageFanoutView({
  group,
  onDrillIn,
}: {
  group: StageGroup;
  onDrillIn: (taskId: string) => void;
}) {
  const rows = group.tasks.map((t) => ({
    task: t,
    status: group.taskStatuses.get(t.id) ?? "pending",
    work: getWorkItem(group.timelines.get(t.id)?.input ?? t.input),
  }));

  const counts: Record<NodeStatus, number> = {
    pending: 0,
    running: 0,
    awaiting_approval: 0,
    done: 0,
    failed: 0,
    skipped: 0,
  };
  for (const r of rows) counts[r.status] += 1;
  const summaryParts: string[] = [];
  (["done", "running", "awaiting_approval", "failed", "skipped", "pending"] as NodeStatus[]).forEach((s) => {
    if (counts[s] > 0) summaryParts.push(`${counts[s]} ${statusCopy(s).toLowerCase()}`);
  });

  const sampleKind = rows.find((r) => r.work.kind !== "none")?.work.kind ?? "none";
  const itemNoun =
    sampleKind === "trial"
      ? "trial users"
      : sampleKind === "feedback"
        ? "feedback items"
        : "leads";

  const headline =
    group.status === "done"
      ? `Handled ${rows.length} ${itemNoun}.`
      : group.status === "pending"
        ? group.upstreamPersonas.length > 0
          ? `Will work on ${rows.length} ${itemNoun} once ${joinPersonas(group.upstreamPersonas)} finishes.`
          : `Will work on ${rows.length} ${itemNoun}.`
        : `Working on ${rows.length} ${itemNoun}.`;

  return (
    <div className="grid gap-3">
      <div className="text-sm text-foreground">{headline}</div>
      <div className="text-xs text-muted-foreground">
        {PERSONA_ROLE[group.personaId]}
      </div>
      {summaryParts.length > 0 ? (
        <div className="text-xs text-muted-foreground">
          {summaryParts.join(" · ")}
        </div>
      ) : null}
      <ul className="grid gap-1">
        {rows.map(({ task, status, work }) => (
          <li key={task.id}>
            <button
              onClick={() => onDrillIn(task.id)}
              className="flex w-full items-center gap-2 rounded border border-border/60 bg-card/50 px-2 py-1.5 text-left text-xs hover:bg-muted/60"
            >
              <span className="flex-1 truncate">
                {work.kind === "none" ? task.id : work.label}
              </span>
              <StatusPill status={status} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Public component
// ---------------------------------------------------------------------------

export function NodeDetailPopover(props: NodeDetailPopoverProps) {
  const { conductor, manager, stage, drillTaskId } = props;
  const showBack = drillTaskId != null && stage != null;

  // Header content varies by branch
  let headerLeft: React.ReactNode = null;
  if (showBack && stage) {
    const drillTask = stage.tasks.find((t) => t.id === drillTaskId);
    const work = drillTask ? getWorkItem(stage.timelines.get(drillTask.id)?.input ?? drillTask.input) : { kind: "none" as const };
    headerLeft = (
      <button
        onClick={props.onDrillOut}
        className="inline-flex min-w-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-3.5 shrink-0" />
        <span className="truncate">
          {work.kind !== "none" ? work.label : drillTask ? drillTask.id : "Back"}
        </span>
      </button>
    );
  } else if (conductor) {
    const Icon = getNodeIcon("conductor");
    headerLeft = (
      <div className="flex min-w-0 items-center gap-1.5">
        <Icon className="size-3.5 text-muted-foreground" />
        <span className="truncate text-xs font-medium">Conductor</span>
        <StatusPill status={conductor.status} />
      </div>
    );
  } else if (manager) {
    const Icon = getNodeIcon(`${manager.dept}-mgr`);
    headerLeft = (
      <div className="flex min-w-0 items-center gap-1.5">
        <Icon className="size-3.5 text-muted-foreground" />
        <span className="truncate text-xs font-medium">
          {DEPARTMENT_LABEL[manager.dept]} Manager
        </span>
        <StatusPill status={manager.status} />
      </div>
    );
  } else if (stage) {
    const Icon = getNodeIcon(stage.personaId);
    headerLeft = (
      <div className="flex min-w-0 items-center gap-1.5">
        <Icon className="size-3.5 text-muted-foreground" />
        <span className="truncate text-xs font-medium">
          {getPersonaLabel(stage.personaId)}
        </span>
        {stage.tasks.length > 1 ? (
          <span className="rounded bg-muted px-1 font-mono text-[10px] text-muted-foreground">
            × {stage.tasks.length}
          </span>
        ) : null}
        <StatusPill status={stage.status} />
      </div>
    );
  }

  function renderBody(): React.ReactNode {
    if (showBack && stage) {
      const t = stage.tasks.find((x) => x.id === drillTaskId);
      if (!t) {
        return (
          <div className="text-xs italic text-muted-foreground">
            Task not found.
          </div>
        );
      }
      return (
        <TaskDetailView
          task={t}
          status={stage.taskStatuses.get(t.id) ?? "pending"}
          timeline={stage.timelines.get(t.id) ?? EMPTY_TIMELINE}
          personaId={stage.personaId}
          upstreamPersonas={stage.upstreamPersonas}
        />
      );
    }
    if (conductor) return <ConductorView group={conductor} />;
    if (manager) return <ManagerView group={manager} />;
    if (!stage) return null;
    if (stage.isBatch) return <StageBatchView group={stage} />;
    if (stage.tasks.length > 1) {
      return <StageFanoutView group={stage} onDrillIn={props.onDrillIn} />;
    }
    return <StageSingleView group={stage} />;
  }

  return (
    <div
      className="flex w-[440px] max-h-[520px] flex-col overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl"
      // mousedown-capture beats React Flow's pan-start. Click stop runs in
      // BUBBLE phase so inner button handlers (drill-in, close, artifact
      // links) fire first, then we prevent the click from bubbling to
      // ReactFlow's onNodeClick (which would re-toggle the node and close
      // the popover before the inner action took effect).
      onMouseDownCapture={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0 flex-1">{headerLeft}</div>
        <button
          onClick={props.onClose}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Close detail"
        >
          <X className="size-4" />
        </button>
      </header>
      <div className="overflow-y-auto px-3 py-3">{renderBody()}</div>
    </div>
  );
}

// Re-export for shared imports (dag-view memoizes against PERSONA_ORDER too).
export { PERSONA_ORDER, DEPARTMENT_OF_PERSONA, isPersonaId };
