"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  NodeToolbar,
  Position,
  type Edge,
  type Node,
  type NodeProps,
} from "reactflow";
import "reactflow/dist/style.css";

import {
  NodeDetailPopover,
  deriveNodeTimelines,
  type ConductorGroup,
  type ManagerGroup,
  type NodeTimeline,
  type StageGroup,
} from "@/lib/ui/components/node-detail-popover";
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
  /** True when all tasks in this stage run as one batch LLM call. */
  batch?: boolean;
  /** Cross-lead reasoning groups surfaced by the batch persona. */
  mergedGroupCount?: number;
  /** Selection state — flips the popover on. */
  isSelected?: boolean;
  /** Side to anchor the popover; flipped to Left for the rightmost column. */
  popoverSide?: "left" | "right";
  /** Pre-rendered popover content. Built in `build()` so each node owns its slice. */
  popoverContent?: React.ReactNode;
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
          "flex w-[200px] flex-col gap-1 rounded-lg border bg-card px-3 py-2 text-xs shadow-sm transition-all cursor-pointer",
          "hover:bg-muted/60 hover:shadow-md",
          tone.bg,
          tone.border,
          data.status === "running" && "ring-2 ring-blue-400/40 animate-pulse",
          data.isSelected && "ring-2 ring-foreground/40",
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
          {data.batch ? (
            <span className="rounded bg-violet-500/15 px-1.5 py-0.5 font-mono text-[10px] text-violet-700 dark:text-violet-300">
              1 batch
            </span>
          ) : null}
        </div>
        {data.detail ? (
          <div className="truncate text-[10px] text-muted-foreground">
            {data.detail}
          </div>
        ) : null}
        {data.mergedGroupCount ? (
          <div className="truncate text-[10px] text-violet-600 dark:text-violet-400">
            merged {data.mergedGroupCount} duplicate
            {data.mergedGroupCount === 1 ? "" : "s"}
          </div>
        ) : null}
      </div>
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
      <NodeToolbar
        isVisible={data.isSelected}
        position={data.popoverSide === "left" ? Position.Left : Position.Right}
        offset={12}
      >
        {data.popoverContent}
      </NodeToolbar>
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
        // Finalize any nodes still showing "running" once the workflow has
        // terminated. Two known causes leave a stuck-running node behind:
        //   1. The persona failed at exec/parse and the workflow function
        //      recorded the failure in workflow_nodes but never emitted a
        //      persona_completed event to the activity bus.
        //   2. Skip-cascade dropped the started→completed pair for a
        //      mid-chain node whose upstream errored.
        // In both cases the workflow is over — leaving the node painted
        // "running" forever is misleading. We bias to "done" since the
        // detailed per-node error (when there is one) is already surfaced
        // via the workflow_nodes status badge inside the popover; the DAG
        // overview just needs to reflect "this workflow is finished."
        for (const [id, s] of statuses) {
          if (s === "running") apply(id, "done");
        }
        break;
    }
  }

  return statuses;
}

/**
 * Scan events for batch persona_completed payloads carrying mergedGroups, so
 * the dashboard can show "merged N duplicates" on the relevant stage card.
 * Keyed by personaId — there's at most one batch invocation per persona per run.
 */
function deriveMergedGroups(events: WireEvent[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const e of events) {
    if (e.type !== "persona_completed") continue;
    const payload = e.payload as {
      personaId?: string;
      output?: { mergedGroups?: number | unknown[] };
    };
    const out = payload.output;
    const personaId = payload.personaId;
    if (!personaId || !out) continue;
    const mg = out.mergedGroups;
    const n = Array.isArray(mg) ? mg.length : typeof mg === "number" ? mg : 0;
    if (n > 0) counts.set(personaId, n);
  }
  return counts;
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

interface BuildArgs {
  plan: WorkflowDAG | null;
  statuses: Map<string, NodeStatus>;
  mergedGroupCounts: Map<string, number>;
  timelines: Map<string, NodeTimeline>;
  selected: { nodeId: string; drillTaskId: string | null } | null;
  runPrompt: string;
  onDrillIn: (taskId: string) => void;
  onDrillOut: () => void;
  onClose: () => void;
}

function build(args: BuildArgs): { nodes: Node<DagNodeData>[]; edges: Edge[] } {
  const {
    plan,
    statuses,
    mergedGroupCounts,
    timelines,
    selected,
    runPrompt,
    onDrillIn,
    onDrillOut,
    onClose,
  } = args;
  const tasks = plan?.tasks ?? [];
  const taskById = new Map(tasks.map((t) => [t.id, t]));

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
    ["content", "distribution", "insight"] as Department[]
  ).filter((d) =>
    PERSONA_ORDER[d].some((p) => stageGroups.has(stageKey(d, p))),
  );

  const colWidth = NODE_WIDTH + COL_GAP;
  const totalWidth = Math.max(1, activeDepts.length) * colWidth;
  const lastDeptIdx = activeDepts.length - 1;

  const nodes: Node<DagNodeData>[] = [];
  const edges: Edge[] = [];

  const popoverSideFor = (deptIdx: number): "left" | "right" =>
    deptIdx === lastDeptIdx && activeDepts.length > 1 ? "left" : "right";

  // Conductor
  const allTaskStatuses = tasks.map((t) => statuses.get(t.id) ?? "pending");
  const conductorStatus = aggregate(allTaskStatuses);
  const conductorSelected = selected?.nodeId === "conductor";
  const conductorGroup: ConductorGroup = {
    prompt: runPrompt,
    totalTasks: tasks.length,
    activeDepts,
    status: conductorStatus,
  };
  nodes.push({
    id: "conductor",
    type: "dag",
    position: { x: totalWidth / 2 - NODE_WIDTH / 2, y: Y_CONDUCTOR },
    data: {
      id: "conductor",
      label: "Conductor",
      layer: "conductor",
      status: conductorStatus,
      detail:
        tasks.length > 0
          ? `${tasks.length} task${tasks.length === 1 ? "" : "s"}`
          : undefined,
      isSelected: conductorSelected,
      popoverSide: "right",
      popoverContent: conductorSelected ? (
        <NodeDetailPopover
          conductor={conductorGroup}
          drillTaskId={null}
          onDrillIn={onDrillIn}
          onDrillOut={onDrillOut}
          onClose={onClose}
        />
      ) : null,
    },
  });

  // Managers — one per active department, in a row.
  activeDepts.forEach((dept, i) => {
    const mgrId = `${dept}-mgr`;
    const childStatuses: NodeStatus[] = [];
    const personaSummaries: ManagerGroup["personas"] = [];
    for (const persona of PERSONA_ORDER[dept]) {
      const group = stageGroups.get(stageKey(dept, persona));
      if (!group) continue;
      const childStats = group.map((t) => statuses.get(t.id) ?? "pending");
      for (const s of childStats) childStatuses.push(s);
      personaSummaries.push({
        personaId: persona,
        childCount: group.length,
        status: aggregate(childStats),
      });
    }
    const mgrStatus = aggregate(childStatuses);
    const mgrX = i * colWidth + (colWidth - NODE_WIDTH) / 2;
    const mgrSelected = selected?.nodeId === mgrId;
    const mgrSide = popoverSideFor(i);
    const managerGroup: ManagerGroup = {
      dept,
      status: mgrStatus,
      personas: personaSummaries,
    };

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
        isSelected: mgrSelected,
        popoverSide: mgrSide,
        popoverContent: mgrSelected ? (
          <NodeDetailPopover
            manager={managerGroup}
            drillTaskId={null}
            onDrillIn={onDrillIn}
            onDrillOut={onDrillOut}
            onClose={onClose}
          />
        ) : null,
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

      // Stage runs in batch mode if every materialized task in the group has
      // mode === "batch". (A stage with N>1 instances and unset mode = fanout.)
      const isBatch =
        group.length > 0 && group.every((t) => t.mode === "batch");

      const stageSelected = selected?.nodeId === stageId;
      const stageSide = popoverSideFor(i);
      const taskStatusesForGroup = new Map<string, NodeStatus>();
      const timelinesForGroup = new Map<string, NodeTimeline>();
      for (const t of group) {
        taskStatusesForGroup.set(t.id, statuses.get(t.id) ?? "pending");
        const tl = timelines.get(t.id);
        if (tl) timelinesForGroup.set(t.id, tl);
      }
      const upstreamPersonas: PersonaId[] = [];
      const seenUpstream = new Set<PersonaId>();
      for (const depId of group[0]?.dependsOn ?? []) {
        const depTask = taskById.get(depId);
        if (!depTask || !isPersonaId(depTask.specialistId)) continue;
        if (seenUpstream.has(depTask.specialistId)) continue;
        seenUpstream.add(depTask.specialistId);
        upstreamPersonas.push(depTask.specialistId);
      }
      const stageGroupForPopover: StageGroup = {
        dept,
        personaId: persona,
        status: stageStatus,
        isBatch,
        tasks: group,
        taskStatuses: taskStatusesForGroup,
        timelines: timelinesForGroup,
        upstreamPersonas,
      };

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
          batch: isBatch,
          mergedGroupCount: mergedGroupCounts.get(persona),
          isSelected: stageSelected,
          popoverSide: stageSide,
          popoverContent: stageSelected ? (
            <NodeDetailPopover
              stage={stageGroupForPopover}
              drillTaskId={selected?.drillTaskId ?? null}
              onDrillIn={onDrillIn}
              onDrillOut={onDrillOut}
              onClose={onClose}
            />
          ) : null,
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
  /**
   * Founder prompt for this run, displayed in the conductor node header.
   * Passed in (rather than read via useActiveRun) so DAGView stays decoupled
   * from the run-store and can render any plan/events pair the caller hands it.
   */
  runPrompt?: string;
}

export function DAGView({ plan, events, runPrompt = "" }: DAGViewProps) {
  const [selected, setSelected] = useState<
    { nodeId: string; drillTaskId: string | null } | null
  >(null);

  const onDrillIn = useCallback((taskId: string) => {
    setSelected((prev) => (prev ? { ...prev, drillTaskId: taskId } : prev));
  }, []);
  const onDrillOut = useCallback(() => {
    setSelected((prev) => (prev ? { ...prev, drillTaskId: null } : prev));
  }, []);
  const onClose = useCallback(() => setSelected(null), []);

  // Escape closes the popover. Bound only while one is open so we don't
  // intercept other components' Escape semantics.
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  // If the plan changes (or the selected stage no longer exists), close the
  // popover so we don't anchor to a stale node.
  useEffect(() => {
    if (!selected) return;
    const planNodeIds = new Set<string>(["conductor"]);
    const tasks = plan?.tasks ?? [];
    for (const t of tasks) {
      if (!isPersonaId(t.specialistId)) continue;
      const dept = DEPARTMENT_OF_PERSONA[t.specialistId];
      planNodeIds.add(`${dept}-mgr`);
      planNodeIds.add(`${dept}::${t.specialistId}`);
    }
    if (!planNodeIds.has(selected.nodeId)) setSelected(null);
  }, [plan, selected]);

  const { nodes, edges } = useMemo(() => {
    const statuses = deriveNodeStatuses(events);
    const mergedGroupCounts = deriveMergedGroups(events);
    const timelines = deriveNodeTimelines(events);
    return build({
      plan,
      statuses,
      mergedGroupCounts,
      timelines,
      selected,
      runPrompt,
      onDrillIn,
      onDrillOut,
      onClose,
    });
  }, [plan, events, selected, runPrompt, onDrillIn, onDrillOut, onClose]);

  if (!plan) {
    return (
      <div className="flex h-[600px] items-center justify-center rounded-xl border border-dashed border-border/70 bg-muted/30 text-sm text-muted-foreground">
        Waiting for the Conductor to plan the run…
      </div>
    );
  }
  if (plan.tasks.length === 0) {
    return (
      <div className="flex h-[600px] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border/70 bg-muted/30 px-6 text-center text-sm text-muted-foreground">
        <span className="font-medium text-foreground">
          No work items matched this prompt
        </span>
        <span>The team had nothing to do for this run.</span>
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
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, node) => {
          setSelected((prev) =>
            prev?.nodeId === node.id
              ? null
              : { nodeId: node.id, drillTaskId: null },
          );
        }}
        onPaneClick={() => setSelected(null)}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
        <Controls position="bottom-right" showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
