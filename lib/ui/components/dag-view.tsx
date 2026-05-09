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
  STATUS_TONE,
  getNodeIcon,
  getPersonaLabel,
  isPersonaId,
  type NodeStatus,
} from "@/lib/ui/persona-meta";
import type { WireEvent } from "@/lib/realtime/events";
import type { Department, WorkflowDAG } from "@/lib/shared/types";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
//  Layout — manual layered. Conductor at top, managers in middle, specialists
//  at bottom. No external layout dep needed for hackathon demo scope.
// ---------------------------------------------------------------------------

const LAYER_Y: Record<"conductor" | "manager" | "specialist", number> = {
  conductor: 0,
  manager: 140,
  specialist: 320,
};

const NODE_WIDTH = 200;
const NODE_GAP = 32;

// ---------------------------------------------------------------------------
//  Custom node
// ---------------------------------------------------------------------------

interface DagNodeData {
  id: string;
  label: string;
  layer: "conductor" | "manager" | "specialist";
  department?: Department;
  status: NodeStatus;
  detail?: string;
}

function DagNode({ data }: NodeProps<DagNodeData>) {
  const Icon = getNodeIcon(data.id);
  const tone = STATUS_TONE[data.status];

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
        <div className="font-medium text-foreground">{data.label}</div>
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
        // node id isn't in the payload directly; fall through.
        break;
      case "persona_completed":
        apply(e.payload.nodeId, "done");
        break;
      case "workflow_done":
        // No-op — individual nodes already marked done.
        break;
    }
  }

  return statuses;
}

// ---------------------------------------------------------------------------
//  Build the synthesized layered graph
// ---------------------------------------------------------------------------

interface BuildOpts {
  plan: WorkflowDAG | null;
  statuses: Map<string, NodeStatus>;
}

function build({ plan, statuses }: BuildOpts): {
  nodes: Node<DagNodeData>[];
  edges: Edge[];
} {
  const tasks = plan?.tasks ?? [];

  const departments = new Set<Department>();
  for (const t of tasks) {
    if (isPersonaId(t.specialistId)) {
      departments.add(DEPARTMENT_OF_PERSONA[t.specialistId]);
    }
  }
  const orderedDepts: Department[] = (
    ["sales", "cs", "revops", "insight"] as Department[]
  ).filter((d) => departments.has(d));

  // Group specialists by department for layout x-spacing.
  const tasksByDept = new Map<Department, typeof tasks>();
  for (const t of tasks) {
    if (!isPersonaId(t.specialistId)) continue;
    const d = DEPARTMENT_OF_PERSONA[t.specialistId];
    const arr = tasksByDept.get(d) ?? [];
    arr.push(t);
    tasksByDept.set(d, arr);
  }

  const totalSpecialists = Math.max(1, tasks.length);
  const totalWidth = totalSpecialists * (NODE_WIDTH + NODE_GAP);

  const nodes: Node<DagNodeData>[] = [];
  const edges: Edge[] = [];

  const conductorStatus = statuses.get("conductor") ?? "pending";

  nodes.push({
    id: "conductor",
    type: "dag",
    position: { x: totalWidth / 2 - NODE_WIDTH / 2, y: LAYER_Y.conductor },
    data: {
      id: "conductor",
      label: "Conductor",
      layer: "conductor",
      status: conductorStatus,
    },
  });

  // Managers spread across the conductor row width.
  const mgrSpan = totalWidth / Math.max(1, orderedDepts.length);
  orderedDepts.forEach((dept, i) => {
    const mgrId = `${dept}-mgr`;
    const mgrStatus = deriveSynthStatus(
      statuses.get(mgrId),
      tasksByDept.get(dept)?.map((t) => statuses.get(t.id) ?? "pending") ?? [],
    );
    nodes.push({
      id: mgrId,
      type: "dag",
      position: {
        x: i * mgrSpan + mgrSpan / 2 - NODE_WIDTH / 2,
        y: LAYER_Y.manager,
      },
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
  });

  // Specialists spread within their dept group.
  let cursor = 0;
  for (const dept of orderedDepts) {
    const list = tasksByDept.get(dept) ?? [];
    list.forEach((task) => {
      const status = statuses.get(task.id) ?? "pending";
      nodes.push({
        id: task.id,
        type: "dag",
        position: {
          x: cursor * (NODE_WIDTH + NODE_GAP),
          y: LAYER_Y.specialist,
        },
        data: {
          id: task.specialistId,
          label: getPersonaLabel(task.specialistId),
          layer: "specialist",
          department: dept,
          status,
          detail: task.id,
        },
      });
      edges.push({
        id: `e-${dept}-mgr-${task.id}`,
        source: `${dept}-mgr`,
        target: task.id,
        animated: status === "running",
      });
      cursor += 1;
    });
  }

  // Plan-level edges (specialist → specialist artifact dependencies).
  if (plan?.edges) {
    for (const e of plan.edges) {
      edges.push({
        id: `plan-${e.from}-${e.to}`,
        source: e.from,
        target: e.to,
        label: e.artifactType,
        labelStyle: { fontSize: 10 },
        type: "smoothstep",
        style: { strokeDasharray: "4 4", opacity: 0.6 },
      });
    }
  }

  return { nodes, edges };
}

function deriveSynthStatus(
  explicit: NodeStatus | undefined,
  children: NodeStatus[],
): NodeStatus {
  if (explicit) return explicit;
  if (children.length === 0) return "pending";
  if (children.some((c) => c === "failed")) return "failed";
  if (children.some((c) => c === "awaiting_approval"))
    return "awaiting_approval";
  if (children.some((c) => c === "running")) return "running";
  if (children.every((c) => c === "done")) return "done";
  return "pending";
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
      <div className="flex h-[480px] items-center justify-center rounded-xl border border-dashed border-border/70 bg-muted/30 text-sm text-muted-foreground">
        Waiting for the Conductor to plan the run…
      </div>
    );
  }

  return (
    <div className="h-[480px] overflow-hidden rounded-xl border border-border bg-card">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.15 }}
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
