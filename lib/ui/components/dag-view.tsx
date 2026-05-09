"use client";

import { useMemo } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  type Edge,
  type Node,
  type NodeProps,
} from "reactflow";
import "reactflow/dist/style.css";

import {
  DEPARTMENT_LABEL,
  DEPARTMENT_OF_PERSONA,
  PERSONA_ORDER,
  STATUS_TONE,
  getNodeIcon,
  getPersonaLabel,
  isPersonaId,
  type NodeStatus,
} from "@/lib/ui/persona-meta";
import type { WireEvent } from "@/lib/realtime/events";
import type {
  Department,
  PersonaId,
  WorkflowDAG,
  WorkflowTask,
} from "@/lib/shared/types";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
//  Layout
//
//  Three-tier vertical org chart:
//    Conductor (row 0, centered)
//    Managers  (row 1, one per active department, spread horizontally)
//    Stages    (rows 2..N, persona pipeline within each manager column,
//               GROUPED — one card per (department, persona) regardless of
//               fanout cardinality, with a "× N" badge)
// ---------------------------------------------------------------------------

const NODE_WIDTH = 200;
const NODE_HEIGHT = 64;
const COL_GAP = 56;
const ROW_GAP_Y = 96;
const Y_CONDUCTOR = 0;
const Y_MANAGER = 140;
const Y_STAGE_START = 280;

interface DagNodeData {
  id: string;
  label: string;
  layer: "conductor" | "manager" | "specialist";
  department?: Department;
  status: NodeStatus;
  detail?: string;
  count?: number;
  failedCount?: number;
  skippedCount?: number;
  doneCount?: number;
}

function DagNode({ data }: NodeProps<DagNodeData>) {
  const Icon = getNodeIcon(data.id);
  const tone = STATUS_TONE[data.status];
  const totalChildren = data.count ?? 0;

  return (
    <>
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <div
        className={cn(
          "flex w-[200px] flex-col gap-1 rounded-lg border bg-card px-3 py-2 text-xs shadow-sm transition-colors",
          tone.bg,
          tone.border,
          data.status === "running" && "ring-2 ring-blue-400/40 animate-pulse",
        )}
      >
        <div className="flex items-center gap-2">
          <Icon className={cn("size-3.5 shrink-0", tone.text)} />
          <span className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {data.layer}
          </span>
          <span
            className={cn(
              "ml-auto rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide",
              tone.badgeBg,
            )}
          >
            {tone.label}
          </span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="font-medium text-foreground">{data.label}</span>
          {totalChildren > 1 ? (
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              × {totalChildren}
            </span>
          ) : null}
        </div>
        {data.detail ? (
          <div className="truncate text-[10px] text-muted-foreground">
            {data.detail}
          </div>
        ) : null}
      </div>
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
    </>
  );
}

const NODE_TYPES = { dag: DagNode };

// ---------------------------------------------------------------------------
//  Status derivation from event stream
// ---------------------------------------------------------------------------

function deriveNodeStatuses(events: WireEvent[]): Map<string, NodeStatus> {
  const statuses = new Map<string, NodeStatus>();
  const apply = (id: string, s: NodeStatus) => statuses.set(id, s);

  for (const e of events) {
    switch (e.type) {
      case "persona_started":
        apply(e.payload.nodeId, "running");
        break;
      case "approval_requested":
        break;
      case "persona_completed": {
        // Workflow function emits persona_completed with status:"skipped" for
        // skip-cascade nodes — pick that up so the grouped card reflects it.
        const status = (e.payload as { status?: NodeStatus }).status;
        apply(
          e.payload.nodeId,
          status === "skipped" ? "skipped" : "done",
        );
        break;
      }
      case "workflow_done":
        break;
    }
  }

  return statuses;
}

function aggregate(children: NodeStatus[]): NodeStatus {
  if (children.length === 0) return "pending";
  if (children.some((c) => c === "running")) return "running";
  if (children.some((c) => c === "awaiting_approval"))
    return "awaiting_approval";
  if (children.every((c) => c === "skipped")) return "skipped";
  if (children.every((c) => c === "done" || c === "skipped")) return "done";
  if (children.every((c) => c === "failed" || c === "skipped"))
    return "failed";
  // Mixed in-flight + terminal → still running.
  if (children.some((c) => c === "pending")) return "pending";
  if (children.some((c) => c === "failed")) return "failed";
  return "pending";
}

// ---------------------------------------------------------------------------
//  Build the synthesized layered graph
// ---------------------------------------------------------------------------

function build({
  plan,
  statuses,
}: {
  plan: WorkflowDAG | null;
  statuses: Map<string, NodeStatus>;
}): { nodes: Node<DagNodeData>[]; edges: Edge[] } {
  const tasks = plan?.tasks ?? [];

  // Group materialized tasks by (department, specialistId) so 47 fanout
  // instances collapse into a single "Researcher × 47" card.
  const stageGroups = new Map<string, WorkflowTask[]>();
  const stageKey = (dept: Department, persona: PersonaId) =>
    `${dept}::${persona}`;

  for (const t of tasks) {
    if (!isPersonaId(t.specialistId)) continue;
    const dept = DEPARTMENT_OF_PERSONA[t.specialistId];
    const key = stageKey(dept, t.specialistId);
    const arr = stageGroups.get(key) ?? [];
    arr.push(t);
    stageGroups.set(key, arr);
  }

  const activeDepts: Department[] = (
    ["sales", "cs", "revops", "insight"] as Department[]
  ).filter((d) =>
    PERSONA_ORDER[d].some((p) => stageGroups.has(stageKey(d, p))),
  );

  const colWidth = NODE_WIDTH + COL_GAP;
  const totalWidth = Math.max(1, activeDepts.length) * colWidth;

  const nodes: Node<DagNodeData>[] = [];
  const edges: Edge[] = [];

  // Conductor
  const allTaskStatuses = tasks.map((t) => statuses.get(t.id) ?? "pending");
  const conductorStatus = aggregate(allTaskStatuses);
  nodes.push({
    id: "conductor",
    type: "dag",
    position: { x: totalWidth / 2 - NODE_WIDTH / 2, y: Y_CONDUCTOR },
    data: {
      id: "conductor",
      label: "Conductor",
      layer: "conductor",
      status: conductorStatus,
      detail: tasks.length > 0 ? `${tasks.length} task${tasks.length === 1 ? "" : "s"}` : undefined,
    },
  });

  // Managers — one per active department, in a row.
  activeDepts.forEach((dept, i) => {
    const mgrId = `${dept}-mgr`;
    const childStatuses: NodeStatus[] = [];
    for (const persona of PERSONA_ORDER[dept]) {
      const group = stageGroups.get(stageKey(dept, persona));
      if (!group) continue;
      for (const t of group) childStatuses.push(statuses.get(t.id) ?? "pending");
    }
    const mgrStatus = aggregate(childStatuses);
    const mgrX = i * colWidth + (colWidth - NODE_WIDTH) / 2;

    nodes.push({
      id: mgrId,
      type: "dag",
      position: { x: mgrX, y: Y_MANAGER },
      data: {
        id: mgrId,
        label: `${DEPARTMENT_LABEL[dept]} Mgr`,
        layer: "manager",
        department: dept,
        status: mgrStatus,
      },
    });
    edges.push({
      id: `e-conductor-${mgrId}`,
      source: "conductor",
      target: mgrId,
      animated: mgrStatus === "running",
    });

    // Stage cards stack vertically under the manager. One per persona in
    // the department's pipeline order.
    let row = 0;
    let prevStageId: string | null = null;
    for (const persona of PERSONA_ORDER[dept]) {
      const group = stageGroups.get(stageKey(dept, persona));
      if (!group) continue;
      const childIds = group.map((t) => t.id);
      const childStats = childIds.map((id) => statuses.get(id) ?? "pending");
      const stageStatus = aggregate(childStats);
      const stageId = stageKey(dept, persona);
      const stageY = Y_STAGE_START + row * ROW_GAP_Y;

      const failedCount = childStats.filter((s) => s === "failed").length;
      const skippedCount = childStats.filter((s) => s === "skipped").length;
      const doneCount = childStats.filter((s) => s === "done").length;
      const detailParts: string[] = [];
      if (doneCount > 0) detailParts.push(`${doneCount} done`);
      if (failedCount > 0) detailParts.push(`${failedCount} failed`);
      if (skippedCount > 0) detailParts.push(`${skippedCount} skipped`);

      nodes.push({
        id: stageId,
        type: "dag",
        position: { x: mgrX, y: stageY },
        data: {
          id: persona,
          label: getPersonaLabel(persona),
          layer: "specialist",
          department: dept,
          status: stageStatus,
          count: childIds.length,
          detail: detailParts.length > 0 ? detailParts.join(" · ") : undefined,
          doneCount,
          failedCount,
          skippedCount,
        },
      });

      const sourceForEdge = prevStageId ?? mgrId;
      edges.push({
        id: `e-${sourceForEdge}-${stageId}`,
        source: sourceForEdge,
        target: stageId,
        animated: stageStatus === "running",
      });

      prevStageId = stageId;
      row += 1;
    }
  });

  return { nodes, edges };
}

// ---------------------------------------------------------------------------
//  Public component
// ---------------------------------------------------------------------------

interface DAGViewProps {
  plan: WorkflowDAG | null;
  events: WireEvent[];
}

export function DAGView({ plan, events }: DAGViewProps) {
  const { nodes, edges } = useMemo(() => {
    const statuses = deriveNodeStatuses(events);
    return build({ plan, statuses });
  }, [plan, events]);

  if (!plan || plan.tasks.length === 0) {
    return (
      <div className="flex h-[600px] items-center justify-center rounded-xl border border-dashed border-border/70 bg-muted/30 text-sm text-muted-foreground">
        Waiting for the Conductor to plan the run…
      </div>
    );
  }

  return (
    <div className="h-[600px] overflow-hidden rounded-xl border border-border bg-card">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
        <Controls position="bottom-right" showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
