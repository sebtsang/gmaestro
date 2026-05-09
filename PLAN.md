# GMaestro — Local-First Build Plan

> Product name: **GMaestro** (the AI GTM team / orchestrator we're building).
> Demo company name: **Anvil** (the fake YC W26 startup we're pretending to be in the demo). Two distinct names to avoid confusion.

## Context

We're building an AI GTM team for founder-led GTM at pre-Series A startups: a multi-persona system (Conductor → 4 Department Heads → ~13 Stage Specialists → ephemeral workers) that operates real SaaS tools via Composio with founder-in-loop approval gates. Architecture inspired by Garry Tan's gstack (multi-persona, opinionated workflow, sprint-style hand-offs); substrate is Composio's tool surface instead of Claude Code's filesystem.

**Pivot from prior plan:** drop the hosted-SaaS shape entirely. Distribute as a local-first SDK/CLI that the founder downloads and runs on their laptop. The dashboard runs on `localhost:3000` and is the only consumer of the local backend. This matches how gstack distributes (`~/.claude/skills/gstack/`), strengthens the privacy story, simplifies the hackathon build (no deploy, no auth, no multi-tenant), and enables agentic install — Claude Code / Cursor can install + run our product the same way Composio's own CLI is installable.

**Hackathon scope:** demo-tuned, not production-tuned. Build deliberately for one primary scenario plus 2–3 alternates that the same architecture happens to handle. Anything outside is "roadmap."

## What changes from the prior architecture

| Layer | Prior (hosted SaaS) | New (local-first) | Why |
|---|---|---|---|
| Hosting | Vercel | None — runs on user's laptop | No deploy needed; founder owns the data |
| Database | Supabase Cloud Postgres | SQLite via `better-sqlite3` + Drizzle ORM | Single-user local app; SQLite ships in the npm package |
| Realtime | Supabase Realtime | Server-Sent Events from in-process EventEmitter | Same Next.js process hosts agent runtime + dashboard; SSE is enough |
| Auth | Supabase Auth | None | Single-user local app — only the laptop owner accesses it |
| Durable execution | Inngest Cloud | None — Claude Agent SDK runs in-process | Demo workflows complete in <2 min while founder watches; durability is overkill. Trigger.dev v3 (open-source, self-hostable) is the future upgrade path if needed |
| Distribution | URL | `npx create-gmaestro` scaffolder + `npx gmaestro@latest` global CLI + MCP server for agentic install | Matches gstack's distribution; enables agentic install for the Video Cooker submission |

**Direct answers to user's questions:**
- **Do we need Supabase?** No. Local-first replaces Postgres → SQLite, Realtime → SSE, Auth → none.
- **What was Inngest Cloud for?** Durable execution. We don't need it for hackathon scope. Workflows run in the API route handler; status streams via SSE; founder watches it complete in 90 seconds.

## Locked decisions (post-clarification)

| Decision | Value |
|---|---|
| Repo name | `gmaestro` |
| Repo visibility | **Public from day 1** — supports agentic install (any agent can `git clone` and the README is publicly readable) |
| Agentic install priority | **P1 for video** (must work end-to-end for Video Cooker submission), **P0 stretch** (demo it live on stage if we're ahead of schedule) |
| Slack DM approval fallback | **In scope (P1)** — Composio Slack integration also DMs founder when an approval is raised, with the proposed action and a deep link to the local dashboard |
| GitHub destination | `github.com/sebtsang/gmaestro` |
| Persona count | **13** (Researcher, Qualifier, Strategist, Writer, Scheduler, Brief Writer, Activation, CRM Logger, Pipeline Reporter, Slack Digest, Feedback Tagger, Theme Synthesizer, Linear Filer). Health Monitor dropped — overlapped with Activation, P1+ anyway. |
| Department layer | **Keep all 4** (Sales, CS, RevOps, Insight). Even though Conductor *could* dispatch specialists directly, the Manager layer makes the org-chart pitch land harder visually. |
| Voice training scope | **Static only** for hackathon. Founder voice samples loaded as few-shots from seed. Edits captured (for future) but not re-injected within demo timespan. Cross-run learning = P2. |
| Structured output strategy | **Prompted JSON + Zod validation.** Conductor + Manager system prompts instruct the model to output JSON conforming to a documented schema; we parse and validate with Zod in TypeScript. Retry once on parse failure. |
| Founder ID | Single value `"default"`, generated/persisted at `gmaestro setup` and stored as `GMAESTRO_USER_ID` in `~/.gmaestro/.env`. Used as `userId` everywhere (Composio sessions, Drizzle FKs). |
| Durability scope | **Crash = restart from scratch.** No mid-workflow resume. SQLite stores artifacts so previous-run state is browseable; new runs start fresh. The "checkpoint" language in earlier drafts is wrong — removing. |

## Final validation pass (corrections from research round 2)

These changed during the final review and are now reflected throughout the plan:

| Original assumption | Corrected | Source |
|---|---|---|
| Sub-agents can spawn sub-sub-agents (5-layer SDK hierarchy) | **WRONG.** SDK forbids it. We use SDK sub-agents only for Conductor → Managers (1 level), and orchestrate Specialists as separate `query()` calls dispatched by our TypeScript workflow function. Workers are parallel fanout via `Promise.all`. | [Subagents in the SDK](https://code.claude.com/docs/en/agent-sdk/subagents) explicitly states `"Subagents cannot spawn their own subagents. Don't include Agent in a subagent's tools array."` |
| Use `@composio/claude-agent-sdk` provider package | **REPLACE.** Use Composio's hosted MCP HTTP server via Claude Agent SDK's `mcpServers` config. Pattern: `composio.create(userId)` returns `session.mcp.url` and `session.mcp.headers`; pass these as `{ type: "http", url, headers }` into `mcpServers`. Per-persona scoping via `allowedTools: ["mcp__composio__GMAIL_DRAFT", ...]`. | [MCP in Agent SDK](https://code.claude.com/docs/en/agent-sdk/mcp); Composio MCP integration docs |
| Use `composio.connectedAccounts.initiate()` for OAuth | **REPLACE with `composio.connectedAccounts.link()`.** `initiate()` returns 400 for new orgs as of 2026-05-08 (yesterday). | Composio changelog + Authenticating Tools docs |
| Module-level singleton for the in-process event bus | **REPLACE with globalThis pattern.** Next.js App Router has separate bundles for API routes vs pages — module singletons duplicate. Pattern: `globalThis.__gmaestroEventBus ??= mitt()`. | [Next.js singleton issue #65350](https://github.com/vercel/next.js/issues/65350) |
| `better-sqlite3` will work everywhere | **CAVEAT.** Native module install can fail on newer Node versions. Fallback: `@libsql/client` (WASM, Drizzle-compatible). Documented as a backup, not required at start. | Multiple `better-sqlite3` GitHub issues |
| Demo on Anthropic Tier 1 fine | **NEED TIER 2+** ($40 cumulative spend) for 47-lead parallel demo. Tier 1 = 50 RPM = bottleneck on the parallel fanout. CLI `doctor` command warns if on Tier 1. | Anthropic rate limit docs |

### What was confirmed (no change)

- Claude Agent SDK `query()` is the correct entrypoint, supports MCP HTTP transport natively, supports parallel sub-agents up to 1 level deep
- `AgentDefinition` type supports per-sub-agent `mcpServers`, `tools`, `model`, `prompt`, `description`
- `allowedTools` naming convention is `mcp__<server-name>__<tool-name>` (wildcards allowed: `mcp__composio__*`)
- SSE in Next.js App Router via Route Handler + ReadableStream + `export const dynamic = "force-dynamic"`
- React Flow real-time updates via immutable nodes/edges array reference replacement
- shadcn/ui as the UI primitives
- Drizzle + better-sqlite3 + WAL mode for local state

## Adversarial audit corrections (round 3)

Material changes from the third validation pass. All applied throughout the plan.

| Issue | Resolution |
|---|---|
| Next.js version was wrong | Updated to **16.2.6** (current stable, May 2026; Turbopack default) |
| Haiku model ID missing date suffix | Use `claude-haiku-4-5-20251001` exactly |
| LinkedIn integration would risk account suspension | Constrained Researcher to LinkedIn READ-ONLY (search/profile/company); all outbound = Gmail |
| `founderId` was undefined | Hardcoded as `"default"`, generated/persisted at setup time as `GMAESTRO_USER_ID` env var |
| Persona count was inconsistent (13 vs 14) | Locked to **13**; dropped Health Monitor (overlapped with Activation, was P1+) |
| Department layer was open question | **Kept all 4** Managers — visual depth pays off in the demo |
| Voice training scope was hand-waved | **Static only:** seed founder voice samples, edits captured but not consumed within hackathon timespan |
| Structured output strategy was unspecified | **Prompted JSON + Zod validation** with one retry on parse failure |
| L4 "Workers" was a non-existent layer | Folded into L3 Specialists — workers are just parallel `pMap` fanout |
| Component directories were ambiguous | `components/ui/` = shadcn primitives (Foundation owns); `lib/ui/components/` = custom (Session 3 owns). Both directories exist, distinct purposes. |
| `connections` table was missing | Added to Foundation schema; tracks per-toolkit OAuth status |
| No graceful degradation for un-connected integrations | Added: persona fails → mark node failed, emit event, workflow continues |
| No SSE keepalive | Added: `: heartbeat\n\n` every 15s in `/api/stream` |
| No per-tool throttling | Added: `withRateLimit(action, fn)` helper; LinkedIn = 1/sec, others = 5/sec |
| "Durability via SQLite checkpoints" was misleading | Removed: hackathon scope is "crash = restart from scratch"; SQLite stores artifacts only |
| API routes touching Node-native modules might land in Edge runtime | Required `export const runtime = "nodejs"` on all API routes touching SDK / better-sqlite3 |
| No retry logic for Composio failures | Added: graceful degradation in workflow function; one retry inside `parseWorkflowDAGWithRetry` |
| No approval timeout | 60-minute hard timeout; auto-marks "expired" and continues with partial artifact |
| Tier 1 users had no fallback | Auto-detect tier in `gmaestro doctor`; fall back to sequential dispatch (concurrency = 1) if Tier 1 |
| No CI on public repo | Added `.github/workflows/typecheck.yml` running `tsc --noEmit` on PRs |
| Anthropic prompt caching was vague | Specified: `cache_control: { type: "ephemeral" }` on persona system prompts |
| Environment validation was missing | Added `lib/shared/env.ts` Zod-validated env loader; fail fast with actionable message |
| `next.config.js` needed `serverExternalPackages` for better-sqlite3 | Added to Foundation step |
| `p-map` was missing from Foundation deps | Added |

## Stack

| Layer | Choice |
|---|---|
| Distribution | git clone (P0) → `npx create-gmaestro@latest` (P1) → MCP server `@gmaestro/mcp` for agent-driven install (P1) |
| Runtime | **Next.js 16.2.6 App Router** (current stable as of May 2026; Turbopack default) on `localhost:3000`. All API routes that touch Claude Agent SDK or better-sqlite3 must declare `export const runtime = "nodejs";` (Edge runtime cannot load native modules). |
| CLI | `bin/gmaestro.ts` with subcommands: `setup`, `dev`, `reset`, `doctor` |
| Orchestration | `@anthropic-ai/claude-agent-sdk` (`query()` function, sub-agents via `agents` parameter, `mcpServers` config) |
| Tools | `@composio/core` exposed via Composio's hosted MCP HTTP server; configured into Claude Agent SDK as `mcpServers: { composio: { type: "http", url: session.mcp.url, headers: session.mcp.headers } }`. Per-persona scoping via `allowedTools: ['mcp__composio__GMAIL_DRAFT', ...]`. No per-integration wrappers. **Note: NOT using a `@composio/claude-agent-sdk` provider package — the MCP HTTP transport is the documented integration path and is more reliable.** |
| Database | `better-sqlite3` + `drizzle-orm` (sqlite dialect), DB file at `~/.gmaestro/gmaestro.db`, WAL mode (`sqlite.pragma('journal_mode = WAL')`). **Fallback:** if native module install fails, switch to `@libsql/client` (WASM, Drizzle-compatible). |
| Realtime | Next.js Route Handler `/api/stream` returning a `ReadableStream` (SSE), backed by an in-process `mitt` event bus stored as `globalThis.__gmaestroEventBus` to survive HMR and multi-bundle (API routes vs. pages) duplication. Required: `export const dynamic = "force-dynamic"` on the SSE route. |
| UI | shadcn/ui + Tailwind + React Flow (immutable node updates on SSE event) |
| Models | **Exact API IDs:** `claude-opus-4-7` (Conductor + Managers), `claude-sonnet-4-6` (Specialists), `claude-haiku-4-5-20251001` (deterministic tagging — note the date suffix is required). Prompt caching ON via `cache_control: { type: "ephemeral" }` on persona system prompts. **Anthropic API tier requirement: Tier 2+ ($40 cumulative spend). Tier 1 = 50 RPM = bottleneck on parallel fanout. CLI `doctor` command pings the API to detect tier; warns if Tier 1 and falls back to sequential dispatch (concurrency = 1) if user opts in.** |

## Architecture

**Critical constraint discovered during validation:** [Claude Agent SDK explicitly forbids sub-agents from spawning their own sub-agents](https://code.claude.com/docs/en/agent-sdk/subagents) (`"Subagents cannot spawn their own subagents"`). So we orchestrate the lower layers ourselves in TypeScript via separate `query()` calls, while using the SDK's native sub-agent mechanism only for Conductor → Managers.

```
~/.gmaestro/gmaestro.db (SQLite, WAL mode)
       ↑↓
┌──────────────────────────────────────────────────────────────────┐
│  Next.js process on localhost:3000                               │
│                                                                  │
│  POST /api/runs ──▶ Workflow function (TypeScript)               │
│                                                                  │
│   STEP 1 — query() #1: Conductor                                 │
│   ├─ agents: { sales-mgr, cs-mgr, revops-mgr, insight-mgr }      │
│   ├─ each Manager AgentDefinition has its own scoped MCP +       │
│   │   allowedTools (e.g., sales-mgr: ['mcp__composio__HUBSPOT_*']│
│   ├─ Conductor decides which Managers to invoke (parallel)       │
│   ├─ Each Manager returns structured plan:                       │
│   │   [{ specialistId, input }, ...]                             │
│   └─ Conductor returns aggregated task list                      │
│                                                                  │
│   STEP 2 — fanout: workflow function dispatches Specialists      │
│   For each task in plan, in parallel (Promise.all, concurrency): │
│     query() with Specialist's system prompt + scoped Composio    │
│     MCP (e.g., Researcher: allowedTools includes only LINKEDIN_* │
│     and APOLLO_*)                                                │
│     ↓                                                            │
│     Composio MCP server (hosted) → real Gmail/Slack/HubSpot/etc. │
│     ↓                                                            │
│     Specialist returns typed artifact → write to SQLite,         │
│     emit ActivityEvent to in-process bus                         │
│                                                                  │
│   Bus → SSE /api/stream → dashboard live updates                 │
│                                                                  │
│  When a Specialist needs approval:                               │
│   1. Insert ApprovalRequest row in SQLite                        │
│   2. Emit APPROVAL_REQUESTED event → SSE → dashboard card        │
│   3. Composio Slack: DM founder w/ proposed action + deep link   │
│   4. Workflow function polls approval_requests row               │
│   5. Founder approves (dashboard or via deep link)               │
│   6. Workflow resumes                                            │
└──────────────────────────────────────────────────────────────────┘
```

**Layer mapping (revised):**

| Layer | Implementation |
|---|---|
| L0 — Workflow function | TypeScript code in `lib/state/workflows.ts`. Owns orchestration, durability checkpoints, fanout, approval polling. |
| L1 — Conductor | One `query()` call. Returns structured plan. |
| L2 — Department Heads | `agents` parameter inside Conductor's `query()` — these are SDK sub-agents (1 level deep, allowed). Each has own scoped MCP. Returns its decomposition as part of the structured response. |
| L3 — Specialists | Separate `query()` calls dispatched by the workflow function based on Conductor's plan. Each specialist's `query()` has its own scoped Composio MCP via `allowedTools: ['mcp__composio__SPECIFIC_ACTION_*']`. |
| L4 — *(removed; folded into L3)* | Earlier drafts called the parallel fanout of Specialists "Workers" as a separate layer. They aren't separate — a worker is just one parallel invocation of a Specialist (e.g., 47 parallel `runPersona('researcher', ...)` calls via `pMap` with concurrency limit). Removing the L4 distinction. |
| L5 — Composio actions | MCP HTTP transport. **One Composio MCP URL per user, shared across all queries.** `composio.create(userId)` is idempotent — call it once at startup, reuse `session.mcp.url` + `session.mcp.headers` everywhere. Per-persona scoping is done at the `allowedTools` filter level on each `query()` call, not by spinning up separate MCP servers. |

## Demo scoping

| Scenario | Validates | Status |
|---|---|---|
| 🌟 **Primary: "47 demo requests from HN launch — process them"** | Full multi-persona orchestration, all 10 Composio tools, approval gate, parallel sub-agent fanout, Slack DM fallback | P0 |
| Alt 1: "Process this one inbound lead from acme.com" | Single-lead path | P0 (free if primary works) |
| Alt 2: "Daily activation check on 12 trial users" | CS Bridge path independent of sales | P1 |
| Alt 3: "Customer reported a bug — file it and update them" | Insight pipeline (Tagger → Theme → Linear Filer) | P1 |
| Anything else | — | Out of scope; route to "that's roadmap" |

## Composio integrations

**Tier S (P0 — 10 integrations, ~40 distinct actions):** Gmail, Google Calendar, Google Sheets, Slack, Notion, HubSpot, Linear, Stripe, GitHub, LinkedIn.

**Tier A (P1 — 6 more):** Apollo, Loom, Discord, Intercom, Twitter/X, Calendly.

**Tier B (P2 — bonus):** Reddit, Hacker News, Crunchbase, Hunter.io, DocuSign.

Per-persona action scoping (`lib/tools/scopes.ts`) restricts each persona to its allowed Composio actions. Researcher can `LINKEDIN_SEARCH_PERSON` but not `GMAIL_SEND`; Writer can `GMAIL_DRAFT` but never `GMAIL_SEND` (only Approval Gate sends after founder approves). Demonstrates Composio's permission model deliberately.

**Slack approval DM (P1).** When an `ApprovalRequest` is created, Composio Slack tool DMs the founder with: proposed action summary, blast radius badge, and a deep link to the local dashboard approval card. Founder approves in dashboard; workflow resumes. (P2 stretch: true tap-to-approve via Slack interactive messages — requires Composio webhook → local tunnel; skip unless ahead of schedule.)

## Repo structure

```
gmaestro/
├── README.md                        ← agent-readable install + run docs
├── INSTALL.md                       ← short doc targeted at AI agents
├── CLAUDE.md                        ← read by every parallel Claude Code session
├── package.json                     ← bin: { gmaestro: "./dist/bin/gmaestro.js" }
├── .env.example
├── tsconfig.json
├── next.config.js
├── drizzle.config.ts
├── bin/
│   └── gmaestro.ts                  ← CLI: setup | dev | reset | doctor
├── app/
│   ├── layout.tsx
│   ├── (dashboard)/
│   │   ├── page.tsx                 ← prompt input + DAG + activity feed
│   │   ├── connections/page.tsx     ← Composio Connect Link cards
│   │   ├── runs/[id]/page.tsx
│   │   └── approvals/page.tsx       ← also reachable via Slack deep link
│   └── api/
│       ├── runs/route.ts            ← POST starts workflow
│       ├── approvals/[id]/route.ts  ← POST resolve
│       └── stream/route.ts          ← SSE endpoint
├── lib/
│   ├── shared/
│   │   ├── types.ts                 ← all typed contracts (locked at hour 0)
│   │   ├── schemas.ts               ← Zod schemas
│   │   └── mocks.ts                 ← factories for parallel dev
│   ├── orchestrator/
│   │   ├── conductor.ts             ← Conductor system prompt + Claude Agent SDK call
│   │   └── managers/                ← Sales, CS, RevOps, Insight sub-agent configs
│   ├── personas/
│   │   ├── prompts/                 ← 13 markdown files (non-tech teammate writes)
│   │   ├── registry.ts              ← persona configs (id, layer, dept, scope, schemas, model)
│   │   └── runtime.ts               ← generic Claude Agent SDK invoker
│   ├── tools/
│   │   ├── composio.ts              ← Composio + ClaudeAgentSDKProvider setup
│   │   ├── scopes.ts                ← per-persona allowed Composio actions
│   │   └── slack-approval.ts        ← Slack DM helper for approval fallback
│   ├── state/
│   │   ├── db.ts                    ← Drizzle client + connection
│   │   ├── schema.ts                ← Drizzle schema definitions
│   │   ├── leads.ts, workflows.ts, approvals.ts, voice.ts, activity.ts
│   ├── realtime/
│   │   ├── bus.ts                   ← in-process mitt singleton
│   │   └── events.ts                ← typed event constants
│   └── ui/
│       ├── components/              ← dag-view, activity-feed, approval-card, connection-card, state-sidebar, closing-brief
│       └── hooks/                   ← use-event-stream, use-workflow
├── drizzle/
│   └── migrations/
├── packages/                        ← P1, post-Foundation
│   ├── create-gmaestro/             ← scaffolder for `npx create-gmaestro`
│   └── mcp/                         ← MCP server for agentic install
├── scripts/
│   ├── seed-demo.ts                 ← 47 leads + 12 trials + voice samples
│   ├── reset-demo.ts                ← clean state in <5s
│   └── smoke.ts                     ← end-to-end demo run from CLI
└── .gitignore
```

## Distribution model

**P0 (works for demo day):**
```bash
git clone https://github.com/sebtsang/gmaestro
cd gmaestro
pnpm install
pnpm gmaestro setup    # interactive wizard for keys
pnpm gmaestro dev      # opens dashboard
```

**P1 (Video Cooker submission target):**
```bash
npx create-gmaestro@latest my-gtm
cd my-gtm
gmaestro dev
```

Plus `@gmaestro/mcp` MCP server published. Claude Code / Cursor user adds the MCP server, agent reads README, runs scaffolder, prompts user for keys, runs `gmaestro dev`. Mirrors [Composio's agent-native signup](https://agents.composio.dev). This is the headline of the Video Cooker submission.

**P0 stretch (demo on stage):** if ahead of schedule, demo the agentic install live — judge sees Claude Code install GMaestro from scratch and run a workflow with one prompt.

## Parallel Claude Code session plan

**Session 0 — Foundation (sequential, must finish first).** Owned by user as the human conductor in this Claude Code session. Tasks:
1. Create `github.com/sebtsang/gmaestro` (public)
2. Scaffold Next.js 14 + Tailwind + shadcn
3. Add CLI bin entry (`bin/gmaestro.ts`) — stub for now, Session 3 fills in
4. Install deps: `@anthropic-ai/claude-agent-sdk`, `@composio/core`, `@composio/claude-agent-sdk`, `better-sqlite3`, `drizzle-orm`, `drizzle-kit`, `reactflow`, `zod`, `mitt`, `commander`, `@inquirer/prompts`, `open`
5. Write `lib/shared/types.ts` and `lib/shared/schemas.ts` (the contract)
6. Write `lib/shared/mocks.ts` (factories for parallel dev)
7. Set up Drizzle schema (`lib/state/schema.ts`) + initial migration
8. Write `CLAUDE.md` (architecture + per-session ownership boundaries + mock-first convention + demo scenarios)
9. Write `README.md` (install instructions, agent-readable; keep concise — agents parse it)
10. Write `INSTALL.md` (specifically tuned for AI agents installing GMaestro)
11. Write `.env.example`
12. Commit `main`, push to GitHub

After Session 0, three parallel sessions branch off `main` on isolated worktrees. None touch each other's directories.

**Session 1 — Orchestration + State (parallel).** Worktree: `claude --worktree feat/orchestrator`. Owns: `lib/orchestrator/`, `lib/state/workflows.ts`, `lib/state/approvals.ts`, `app/api/runs/`, `app/api/approvals/`. Builds Conductor + 4 Department Heads as Claude Agent SDK sub-agent configs; the workflow execution function (in-process); Drizzle queries for run + approval state; API routes. Uses mock persona functions from `lib/shared/mocks.ts` while Session 2 builds the real ones.

**Session 2 — Personas + Tools (parallel).** Worktree: `claude --worktree feat/personas`. Owns: `lib/personas/`, `lib/tools/`, `lib/state/voice.ts`, `lib/state/leads.ts`, `lib/state/activity.ts`. Builds Composio client wired with `ClaudeAgentSDKProvider`; per-persona tool scopes; 13 persona configs; generic persona runtime; voice memory store; activity event emitter; Slack DM approval helper. Persona prompt markdown files are stubbed by Session 2; non-technical teammate authors final content in parallel.

**Session 3 — Dashboard + CLI + Demo (parallel).** Worktree: `claude --worktree feat/dashboard`. Owns: `app/(dashboard)/*`, `app/api/stream/`, `lib/ui/`, `lib/realtime/`, `bin/`, `scripts/`. Builds dashboard (prompt input, React Flow DAG, activity feed, approval queue UI, closing brief, state sidebar); SSE endpoint; in-process event bus; CLI (`setup`, `dev`, `reset`, `doctor`); demo seed + reset scripts. Uses mock POST `/api/runs` response while Sessions 1+2 land their work.

**Session 4 — Integration + Polish (sequential).** Merge order: orchestrator → personas → dashboard. Resolve any contract drift. Run `scripts/smoke.ts` end-to-end against real Composio + Anthropic. Build `packages/create-gmaestro` and `packages/mcp` for the agentic install path. Record Video Cooker submission demonstrating agentic install + full workflow. Pre-record backup demo video.

**File ownership matrix (zero overlap on writes):**

| Path | Owner |
|---|---|
| `lib/shared/*`, `package.json`, `tsconfig.json`, `CLAUDE.md`, `README.md`, `INSTALL.md`, `drizzle/migrations/*`, `lib/state/db.ts`, `lib/state/schema.ts` | Session 0 (then frozen) |
| `lib/orchestrator/*`, `lib/state/workflows.ts`, `lib/state/approvals.ts`, `app/api/runs/*`, `app/api/approvals/*` | Session 1 |
| `lib/personas/*`, `lib/tools/*`, `lib/state/voice.ts`, `lib/state/leads.ts`, `lib/state/activity.ts` | Session 2 |
| `app/(dashboard)/*`, `app/api/stream/*`, `lib/ui/*`, `lib/realtime/*`, `bin/*`, `scripts/*` | Session 3 |
| `packages/create-gmaestro/*`, `packages/mcp/*` | Session 4 |

## Critical files to be created

| File | Purpose | Reuse |
|---|---|---|
| `lib/shared/types.ts` | Lead, EnrichedLead, QualifiedLead, OutreachStrategy, OutreachDraft, BookedMeeting, PrepBrief, TrialSignal, ActivationNudge, ApprovalRequest, WorkflowRun, WorkflowDAG, WorkflowNode, ActivityEvent, Persona, ApprovalStatus, PersonaId | — |
| `lib/state/schema.ts` | Drizzle table definitions matching types.ts | Drizzle SQLite docs |
| `lib/state/db.ts` | better-sqlite3 connection + Drizzle client + WAL mode (`sqlite.pragma('journal_mode = WAL')`) | — |
| `lib/orchestrator/conductor.ts` | Claude Agent SDK `query()` call with Conductor prompt; declares 4 Manager AgentDefinitions in `agents` config; returns structured WorkflowDAG plan | [Subagents in the SDK](https://code.claude.com/docs/en/agent-sdk/subagents), [TypeScript reference](https://code.claude.com/docs/en/agent-sdk/typescript) |
| `lib/tools/composio.ts` | Composio client init (`new Composio({ apiKey })`); `composio.create(userId)` returns session with `mcp.url` and `mcp.headers`; helper `getMcpConfigForUser(userId)` returns `{ type: "http", url, headers }` ready to drop into `mcpServers` | [Composio quickstart](https://docs.composio.dev/docs/quickstart), [MCP in Agent SDK](https://code.claude.com/docs/en/agent-sdk/mcp) |
| `lib/tools/connect.ts` | Generates Connect Links via `composio.connectedAccounts.link(userId, authConfigId, { callbackUrl })`. **Use `link()` not `initiate()` — `initiate()` returns 400 for new orgs as of 2026-05-08.** | [Composio Connect Link docs](https://docs.composio.dev/docs/tools-direct/authenticating-tools) |
| `app/api/composio/callback/route.ts` | Handles OAuth callback (`http://localhost:3000/api/composio/callback`); records connection success in SQLite; closes the OAuth window | — |
| `lib/tools/slack-approval.ts` | Helper that DMs founder via Composio Slack with proposed action summary + dashboard deep link | — |
| `lib/personas/registry.ts` | 13 persona configs (id, layer, dept, prompt path, allowed actions, model tier, I/O Zod schemas) | — |
| `lib/personas/runtime.ts` | Generic invoker: load prompt MD, validate input, call Claude Agent SDK with scoped tools, validate output, emit activity events | — |
| `lib/realtime/bus.ts` | Singleton mitt instance via `globalThis` pattern (Next.js App Router has separate bundles for API routes and pages — module-level singletons don't work; `globalThis` does). Pattern: `export const eventBus = globalThis.__gmaestroEventBus ??= mitt<Events>();` | [Next.js singleton issue #65350](https://github.com/vercel/next.js/issues/65350); `mitt` npm |
| `app/api/stream/route.ts` | SSE Route Handler returning ReadableStream subscribed to bus | Must include `export const dynamic = "force-dynamic"` |
| `app/api/runs/route.ts` | POST: validates prompt, kicks off workflow, returns workflowRunId | — |
| `app/api/approvals/[id]/route.ts` | POST: resolves approval, unblocks waiting workflow | — |
| `lib/ui/hooks/use-event-stream.ts` | Generic SSE EventSource hook with reconnect | — |
| `lib/ui/components/dag-view.tsx` | React Flow with status-colored nodes, animated edges, immutable updates on event | React Flow `update-node` example |
| `lib/ui/components/approval-card.tsx` | The demo's emotional payoff. Edit-in-place, approve/reject, learns voice from edits. | — |
| `bin/gmaestro.ts` | CLI: setup (interactive prompts), dev (next dev + open browser), reset, doctor | `commander`, `@inquirer/prompts`, `open` |
| `scripts/seed-demo.ts` | Inserts 47 leads + 12 trial users + 5–10 voice samples + ICP into SQLite | — |
| `CLAUDE.md` | Architecture, ownership boundaries per session, mock-first convention, demo scenarios | — |
| `README.md` | Install instructions readable by both humans and AI agents | — |
| `INSTALL.md` | Agent-tuned install path: precise commands, expected output, verification steps | Mirrors how Composio's docs are written for agent consumption |
| `packages/create-gmaestro/index.ts` | Scaffolder: clones template, installs deps, runs setup wizard | `degit` pattern |
| `packages/mcp/src/index.ts` | MCP server exposing `setup_gmaestro()` and `run_workflow(prompt)` tools for Claude Code / Cursor | `@modelcontextprotocol/sdk` |

## Verification

End-to-end after each milestone:

1. **After Session 0:** `pnpm install` succeeds; `pnpm dev` starts Next.js on `localhost:3000`; `pnpm drizzle-kit push` creates SQLite at `~/.gmaestro/gmaestro.db`; `lib/shared/types.ts` typechecks; README + INSTALL.md committed to public repo.
2. **After Session 1 lands on main:** `curl -X POST localhost:3000/api/runs -d '{"prompt": "test"}'` returns a workflowRunId; the workflow uses mock personas (from `lib/shared/mocks.ts`) and completes; SQLite has rows in `workflow_runs` and `activity_events`.
3. **After Session 2 lands on main:** `pnpm tsx lib/personas/runtime.ts test-researcher` executes the Researcher persona against a mock lead and returns an EnrichedLead artifact; Composio Connect Link works for one Tier-S integration end-to-end; Slack DM helper sends a real test message.
4. **After Session 3 lands on main:** `pnpm gmaestro dev` opens dashboard; prompt input dispatches a workflow; DAG renders nodes; activity feed streams via SSE; approval card appears in queue when raised; demo seed script populates 47 leads.
5. **After Session 4 (integration):** `pnpm tsx scripts/smoke.ts` runs the primary demo prompt end-to-end against real Composio + Anthropic with all 10 Tier-S integrations connected; approvals are surfaced in dashboard AND Slack DM (with deep link); closing brief is generated in Notion; reset script returns to clean state in <5s. Video Cooker recording captured: agentic install (Claude Code installs GMaestro) → setup → dev → workflow run → approval → completion.
6. **Demo-day check:** Fresh laptop, `git clone github.com/sebtsang/gmaestro` + `pnpm install` + `pnpm gmaestro setup` (paste keys) + `pnpm gmaestro dev` works in under 10 minutes from zero.

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| Composio LinkedIn integration broken | Apollo as fallback enricher (Tier-A); demo script avoids LinkedIn-specific actions if needed |
| SQLite write contention on parallel sub-agents | WAL mode + transactions per persona output; Drizzle handles |
| SSE connection drops mid-demo | Auto-reconnect in `useEventStream` hook; polling fallback every 2s |
| Anthropic rate limit on parallel sub-agents | Batch fanout in groups of 10 with backoff; show queued state in DAG (not deficit) |
| Approval flow blocked when dashboard tab closed | Slack DM with deep link (P1 in scope) — founder sees DM, clicks link, dashboard opens to approval card |
| Demo-day machine failure | Pre-record full demo video the night before; have it queued |
| Composio Connect Link OAuth fails for one tool at demo | Pre-authorized accounts before demo; reset script restores to known-good state |
| Public repo risk: judges find pre-demo, spoils surprise | Acceptable — agentic install is the headline, public is required. README emphasizes "preview / under active development" |
| Agentic install (`@gmaestro/mcp`) flaky during Video Cooker recording | Pre-record multiple takes; have a fallback shot of manual install; the magic is the *idea* working, not perfect execution |

---

## Appendix: Session Prompts

Use these as the FIRST message in each Claude Code session. Each is self-contained — fresh sessions need full context.

### Foundation Session (sequential, must run first)

```
You are setting up the foundation for GMaestro, an AI GTM team for pre-Series A founders. This is a hackathon project — demo in <30 hours. We're building a local-first product: founder runs `gmaestro dev` on their laptop, dashboard opens at localhost:3000, multi-persona Claude agents execute GTM workflows via Composio.

Your role: Sequential foundation work. After you finish and push to main, three parallel Claude Code sessions branch off your commit and develop different layers in isolated worktrees without touching each other's files.

PROJECT CONTEXT:
- Architecture (5-layer hierarchy):
  L1 Conductor (Opus 4.7) — plans the workflow DAG from a prompt
  L2 Department Heads (Opus) — Sales, CS, RevOps, Insight; decompose into stages
  L3 Stage Specialists (Sonnet 4.6) — 13 personas (Researcher, Qualifier, Strategist, Writer, Scheduler, Brief Writer, Activation, Health Monitor, CRM Logger, Pipeline Reporter, Slack Digest, Feedback Tagger, Theme Synthesizer, Linear Filer)
  L4 Workers (ephemeral) — spawned per-task via Claude Agent SDK sub-agents
  L5 Composio tool calls — Gmail, Calendar, Sheets, Slack, Notion, HubSpot, Linear, Stripe, GitHub, LinkedIn (Tier-S P0)
- Demo prompt: "I'm a YC W26 founder. 47 demo requests came in this week from our HN launch. I have 3 hours before cofounder offsite. Process them."
- Stack: Next.js 14 App Router + TypeScript + Tailwind + shadcn/ui + @anthropic-ai/claude-agent-sdk + @composio/core + @composio/claude-agent-sdk + better-sqlite3 + drizzle-orm + mitt + reactflow + zod
- Distribution: local-first. CLI bin (`bin/gmaestro.ts`) with subcommands setup/dev/reset/doctor. SQLite at ~/.gmaestro/gmaestro.db.
- Realtime: Server-Sent Events from in-process mitt EventEmitter. NO Supabase. NO Inngest.

YOUR TASKS (in order):
1. Initialize **Next.js 16.2.6** App Router project with TypeScript strict mode, Tailwind 4, shadcn/ui (init with slate base color). Use `pnpm dlx create-next-app@latest . --typescript --tailwind --app --src-dir=false --import-alias "@/*"`. Run `pnpm dlx shadcn@latest init` and accept defaults; this creates `components/ui/` for shadcn primitives — KEEP THIS DIRECTORY (Session 3's custom UI lives in `lib/ui/components/`).
2. Add CLI bin entry: package.json `"bin": { "gmaestro": "./dist/bin/gmaestro.js" }`. Stub bin/gmaestro.ts with placeholder; Session 3 fills in.
3. Configure next.config.js:
   - `serverExternalPackages: ['better-sqlite3']` (native module — must be external)
   - Enable Turbopack (default in 16)
4. Install dependencies:
   - Core: @anthropic-ai/claude-agent-sdk @composio/core
   - DB: better-sqlite3 drizzle-orm drizzle-kit @types/better-sqlite3
   - Realtime: mitt
   - UI: reactflow
   - CLI: commander @inquirer/prompts open
   - Validation: zod
   - Concurrency: p-map
   - **NOTE:** No `@composio/claude-agent-sdk` provider package. Composio integration is via MCP HTTP transport using `@composio/core` only.
5. Set up SQLite + Drizzle:
   - lib/state/db.ts: better-sqlite3 connection at ~/.gmaestro/gmaestro.db (create dir if missing). Enable WAL: `sqlite.pragma('journal_mode = WAL')`. Export drizzle client.
   - lib/state/schema.ts: Drizzle table definitions matching the typed contracts. Tables: **connections** (NEW: tracks which Composio integrations are connected per founderId — toolkit, connectedAccountId, status, connectedAt), leads, enriched_leads, qualified_leads, outreach_strategies, outreach_drafts, booked_meetings, prep_briefs, trial_signals, activation_nudges, approval_requests, workflow_runs, workflow_nodes, activity_events, voice_samples, founder_voice_edits, personas
   - drizzle.config.ts pointing at ~/.gmaestro/gmaestro.db
   - Run `pnpm drizzle-kit generate` to create initial migration
6. Write lib/shared/types.ts with all typed contracts. See the plan file (sections "Critical files to be created" and architecture) for the full type list. Make sure types match Drizzle schema 1:1. Persona count is EXACTLY 13 (no Health Monitor).
7. Write lib/shared/schemas.ts — Zod runtime schemas matching every type in types.ts. Include WorkflowDAGSchema for the structured-output validation.
8. Write lib/shared/env.ts — environment variable validator using Zod. Validates ANTHROPIC_API_KEY, COMPOSIO_API_KEY, GMAESTRO_USER_ID at module load. Throws with actionable message if missing. ALL session code imports from here.
9. Write lib/shared/mocks.ts — factories: makeMockLead(), makeMockEnrichedLead(), makeMockQualifiedLead(), makeMockOutreachDraft(), makeMockApprovalRequest(), makeMockWorkflowDAG(), makeMockActivityEvent(), makeMockPersonaRuntime(), makeMockEventBus(), makeMockMcpConfig(), makeMockConnectLink(). These let parallel sessions develop independently.
10. Write CLAUDE.md (the most important file you'll create) — must include:
   - Project mission (1 paragraph)
   - Architecture diagram (4 layers: workflow function → conductor+managers → specialists → composio actions). NO L4 workers — workers were folded into specialists as parallel fanout.
   - Demo prompt + scenarios
   - Per-session ownership table (which session owns which directories) — INCLUDE the `components/ui/` (Foundation/shadcn) vs `lib/ui/components/` (Session 3 custom) distinction
   - "Do not touch" lists per session
   - Mock-first development convention
   - Stack summary (Next.js 16, exact model IDs, Composio via MCP HTTP, founderId = "default")
   - How to test locally
   - Decision log (key choices: local-first, no Supabase, no Inngest, prompted JSON + Zod for structured output, static voice training, LinkedIn read-only, 13 personas)
11. Write README.md — agent-readable install instructions (mirror Composio docs style)
12. Write INSTALL.md — agent-tuned install path with precise commands and expected output
13. Write .env.example — list ANTHROPIC_API_KEY, COMPOSIO_API_KEY, GMAESTRO_USER_ID (default value: "default")
14. .gitignore: node_modules, .next, .env*, drizzle/migrations/meta (keep migrations themselves tracked), ~/.gmaestro/ — note we already have .gitignore from initial commit; extend it
15. Add `.github/workflows/typecheck.yml` — runs `pnpm tsc --noEmit` on every PR. Free CI win for parallel session reviews.
16. Initial commit "foundation: scaffold gmaestro" and push to main on github.com/sebtsang/gmaestro

WHEN YOU'RE DONE (verification):
- pnpm install succeeds
- pnpm dev starts Next.js on localhost:3000 (404 OK)
- pnpm drizzle-kit push creates SQLite at ~/.gmaestro/gmaestro.db
- All shared types + schemas typecheck
- main is pushed to github.com/sebtsang/gmaestro

KEY REFERENCES:
- Claude Agent SDK: https://platform.claude.com/docs/en/agent-sdk/overview
- Composio quickstart: https://docs.composio.dev/docs/quickstart
- Drizzle SQLite: https://orm.drizzle.team/docs/get-started-sqlite
- shadcn/ui: https://ui.shadcn.com/docs/installation/next

When in doubt, ask the user. Do not over-engineer — this is hackathon scope.
```

### Session 1 Prompt (parallel — Orchestration + State)

```
You are working on GMaestro — an AI GTM team for pre-Series A founders, distributed as a local-first npm package. Multi-persona Claude agents orchestrate GTM workflows via Composio.

READ FIRST (required): CLAUDE.md, lib/shared/types.ts, lib/shared/mocks.ts. Do not write code until you've read these.

YOUR SESSION: Orchestration + State (worktree: feat/orchestrator)

YOUR SCOPE — modify only:
- lib/orchestrator/conductor.ts
- lib/orchestrator/managers/{sales,cs,revops,insight}.ts
- lib/state/workflows.ts
- lib/state/approvals.ts
- app/api/runs/route.ts
- app/api/approvals/[id]/route.ts

DO NOT TOUCH (other sessions own):
- lib/personas/* — Session 2
- lib/tools/* — Session 2
- lib/state/voice.ts, leads.ts, activity.ts — Session 2
- app/(dashboard)/*, app/api/stream/*, lib/ui/*, lib/realtime/*, bin/*, scripts/* — Session 3
- lib/shared/*, package.json, tsconfig.json, drizzle/migrations/*, lib/state/db.ts, lib/state/schema.ts — Session 0 frozen

If you need a new shared type, STOP and ask the user. They add it to lib/shared/types.ts; you rebase.

WHAT TO BUILD:

CRITICAL ARCHITECTURE NOTE: Claude Agent SDK forbids sub-agents from spawning their own sub-agents (https://code.claude.com/docs/en/agent-sdk/subagents — "Subagents cannot spawn their own subagents"). So our hierarchy is:
- Conductor query() with Manager sub-agents (1 SDK level, allowed)
- Specialists are SEPARATE query() calls dispatched by your workflow function
- Workers are PARALLEL fanout of specialist queries via Promise.all

1. lib/orchestrator/conductor.ts — single Claude Agent SDK query() call returning structured JSON plan
   ```ts
   import { query } from "@anthropic-ai/claude-agent-sdk";
   import { getMcpConfigForUser } from "@/lib/tools/composio"; // Session 2 — use mock until landed
   import { WorkflowDAGSchema } from "@/lib/shared/schemas";

   export async function runConductor(workflowRunId, prompt, companyState, userId) {
     const mcpConfig = await getMcpConfigForUser(userId);
     const result = await collectResult(query({
       prompt: buildConductorPrompt(prompt, companyState),
       options: {
         model: "claude-opus-4-7",
         systemPrompt: CONDUCTOR_SYSTEM_PROMPT, // includes "Output ONLY JSON matching the schema. No prose."
         mcpServers: { composio: mcpConfig },
         allowedTools: ["Agent"], // required for sub-agent invocation
         agents: {
           "sales-mgr": { description: "...", prompt: SALES_MGR_PROMPT, model: "claude-opus-4-7", mcpServers: ["composio"], tools: ["mcp__composio__HUBSPOT_SEARCH_CONTACTS"] },
           "cs-mgr": { ... },
           "revops-mgr": { ... },
           "insight-mgr": { ... }
         }
       }
     }));
     // Strategy: prompted JSON + Zod validation. One retry on parse failure with corrective prompt.
     return parseWorkflowDAGWithRetry(result, WorkflowDAGSchema);
   }
   ```
   parseWorkflowDAGWithRetry: extract JSON from result string, parse, validate with Zod schema. On failure: re-call query() with the schema error appended. Max 1 retry, then throw.

2. lib/orchestrator/managers/{sales,cs,revops,insight}.ts
- Each exports an AgentDefinition object (NOT a separate query call)
- These get composed into Conductor's `agents` config
- Manager system prompts instruct: "Decompose this objective into a list of (specialistId, input) tasks. Return as structured JSON."

3. lib/state/workflows.ts — runWorkflow(prompt, founderId)
   ```ts
   import pMap from "p-map";

   export async function runWorkflow(prompt, founderId = "default") {
     const workflowRunId = await createRun(prompt);
     try {
       // Step 1: Conductor + Managers (1 SDK query, sub-agents = managers)
       const dag = await runConductor(workflowRunId, prompt, await loadCompanyState(), founderId);

       // Step 2: dispatch Specialists in parallel (concurrency = 10 by default; 1 if user is Anthropic Tier 1)
       const concurrency = await getDispatchConcurrency(); // reads ~/.gmaestro/.env GMAESTRO_TIER override or auto-detects
       await pMap(dag.tasks, async (task) => {
         try {
           return await runPersona(task.specialistId, { ...task.input, workflowRunId }, founderId);
         } catch (err) {
           // Graceful degradation: log and mark task failed, but DON'T crash the workflow
           await markNodeFailed(workflowRunId, task.specialistId, err);
           if (isIntegrationNotConnected(err)) {
             await emitEvent(workflowRunId, task.specialistId, "tool_called", { error: "integration_not_connected", toolkit: extractToolkit(err) });
             return null;
           }
           throw err; // unexpected — propagate
         }
       }, { concurrency });

       await markRunDone(workflowRunId);
     } catch (err) {
       await markRunFailed(workflowRunId, err);
       throw err;
     }
     return workflowRunId;
   }
   ```
- runPersona is owned by Session 2 — import from mock until landed:
  ```ts
  import { makeMockPersonaRuntime } from "@/lib/shared/mocks";
  const runPersona = makeMockPersonaRuntime();
  ```
- Use `p-map` for concurrency-limited fanout (Foundation includes it in deps)
- **Graceful degradation:** if a persona fails because an integration isn't connected (Composio returns specific error), mark that node as failed but let the rest of the workflow continue.
- **Approval timeout:** `awaitApproval(approvalId)` polls every 500ms with a 60-minute hard timeout. After timeout, the approval is auto-marked as "expired" and the workflow continues with a `partial` artifact (or skips, depending on persona).
- Updates workflow_runs and workflow_nodes tables in real time
- All state writes via Drizzle client from lib/state/db.ts

4. lib/state/approvals.ts
- raiseApproval(workflowRunId, artifactType, artifactId, blastRadius, reason, proposedAction): inserts row, returns Promise that resolves when state changes
- resolveApproval(approvalId, status, edits?, founderNotes?): updates row, triggers waiting promise
- awaitApproval(approvalId): polls every 500ms; returns once status moves out of 'pending'

5. app/api/runs/route.ts (POST)
- Validates body { prompt: string } via Zod schema from lib/shared/schemas.ts
- Calls runWorkflow, returns { workflowRunId }

6. app/api/approvals/[id]/route.ts (POST)
- Validates body { status, edits?, founderNotes? }
- Calls resolveApproval
- Returns { ok: true }

VERIFICATION (your slice complete when):
- `curl -X POST localhost:3000/api/runs -d '{"prompt":"test"}' -H "Content-Type: application/json"` returns { workflowRunId: "..." }
- The workflow uses mock personas and completes (state: done)
- SQLite shows rows in workflow_runs and workflow_nodes
- Raising an approval blocks the workflow until POST /api/approvals/[id] resolves it (test with curl)

KEY REFERENCES:
- Claude Agent SDK sub-agents: https://platform.claude.com/docs/en/agent-sdk/overview
- Building Agents with Claude Agent SDK: https://claude.com/blog/building-agents-with-the-claude-agent-sdk
- Drizzle SQLite: https://orm.drizzle.team/docs/get-started-sqlite

Hackathon scope. Don't over-engineer. Don't modify files outside your scope. Ask the user when in doubt.
```

### Session 2 Prompt (parallel — Personas + Tools)

```
You are working on GMaestro — an AI GTM team for pre-Series A founders, distributed as a local-first npm package. Multi-persona Claude agents orchestrate GTM workflows via Composio.

READ FIRST (required): CLAUDE.md, lib/shared/types.ts, lib/shared/mocks.ts.

YOUR SESSION: Personas + Tools (worktree: feat/personas)

YOUR SCOPE — modify only:
- lib/personas/registry.ts
- lib/personas/runtime.ts
- lib/personas/prompts/*.md (stub files; non-tech teammate writes content)
- lib/tools/composio.ts
- lib/tools/scopes.ts
- lib/tools/slack-approval.ts
- lib/state/voice.ts
- lib/state/leads.ts
- lib/state/activity.ts

DO NOT TOUCH:
- lib/orchestrator/* — Session 1
- lib/state/workflows.ts, approvals.ts — Session 1
- app/api/runs/*, app/api/approvals/* — Session 1
- app/(dashboard)/*, app/api/stream/*, lib/ui/*, lib/realtime/*, bin/*, scripts/* — Session 3
- lib/shared/*, package.json, tsconfig.json, drizzle/migrations/*, lib/state/db.ts, lib/state/schema.ts — Session 0 frozen

If you need a new shared type, ask the user.

WHAT TO BUILD:

1. lib/tools/composio.ts — Composio + Claude Agent SDK integration via MCP HTTP transport (NOT a provider package)
   ```ts
   import { Composio } from "@composio/core";

   declare global {
     var __gmaestroComposio: Composio | undefined;
   }

   function getComposio() {
     return globalThis.__gmaestroComposio ??= new Composio({ apiKey: process.env.COMPOSIO_API_KEY! });
   }

   // Returns an mcpServers config block ready to drop into Claude Agent SDK query() options
   export async function getMcpConfigForUser(userId: string) {
     const composio = getComposio();
     const session = await composio.create(userId); // creates if needed
     return {
       type: "http" as const,
       url: session.mcp.url,
       headers: session.mcp.headers,
     };
   }

   // Returns the allowedTools array for a persona (intersect with what Composio exposes)
   export function getAllowedToolsForPersona(personaId: PersonaId): string[] {
     return PERSONA_SCOPES[personaId].map(action => `mcp__composio__${action}`);
   }
   ```
   Per-persona scoping happens via `allowedTools` on the query() call, not by filtering the MCP server itself. The MCP server exposes everything Composio supports for the user; the SDK gates which tools the model can call.

2. lib/tools/connect.ts — Connect Link generation for OAuth flows
   ```ts
   export async function generateConnectLink(userId: string, toolkit: string) {
     const composio = getComposio();
     // Use link() — initiate() returns 400 for new orgs as of 2026-05-08
     const conn = await composio.connectedAccounts.link(userId, AUTH_CONFIG_IDS[toolkit], {
       callbackUrl: `${process.env.GMAESTRO_BASE_URL || "http://localhost:3000"}/api/composio/callback?toolkit=${toolkit}&userId=${userId}`,
     });
     return conn.redirectUrl;
   }
   ```

2. lib/tools/scopes.ts — per-persona allowed Composio actions. **CRITICAL: LinkedIn is READ-ONLY.** Composio explicitly warns that automating LinkedIn messaging at scale = account suspension. All outbound messaging goes through Gmail. Health Monitor persona was dropped (overlapped with Activation); registry is exactly 13 personas.
  - researcher: ['LINKEDIN_SEARCH_PERSON', 'LINKEDIN_GET_PROFILE', 'LINKEDIN_GET_COMPANY', 'APOLLO_ENRICH_EMAIL', 'GITHUB_SEARCH_CODE'] *(read-only on LinkedIn)*
  - qualifier: ['HUBSPOT_SEARCH_CONTACTS']
  - strategist: [] (read-only — synthesizes from artifacts only)
  - writer: ['GMAIL_DRAFT', 'LOOM_CREATE_VIDEO'] *(NEVER GMAIL_SEND — only Approval Gate sends)*
  - scheduler: ['GOOGLECALENDAR_FIND_FREE_SLOTS', 'GOOGLECALENDAR_CREATE_EVENT', 'GMAIL_SEND'] *(GMAIL_SEND scoped to calendar-invite emails only via system prompt; Writer cannot use it)*
  - briefWriter: ['NOTION_CREATE_PAGE', 'NOTION_APPEND_BLOCK', 'GMAIL_SEARCH']
  - activation: ['GMAIL_DRAFT', 'INTERCOM_SEND_MESSAGE', 'STRIPE_GET_SUBSCRIPTION', 'STRIPE_LIST_CUSTOMERS']
  - crmLogger: ['HUBSPOT_CREATE_CONTACT', 'HUBSPOT_UPDATE_DEAL', 'HUBSPOT_ADD_NOTE', 'GOOGLESHEETS_APPEND_ROW']
  - pipelineReporter: ['HUBSPOT_SEARCH_CONTACTS', 'GOOGLESHEETS_READ_RANGE', 'SLACK_POST_MESSAGE']
  - slackDigest: ['SLACK_POST_MESSAGE', 'SLACK_UPDATE_MESSAGE']
  - feedbackTagger: [] (read-only)
  - themeSynthesizer: ['NOTION_CREATE_PAGE']
  - linearFiler: ['LINEAR_CREATE_ISSUE', 'GITHUB_CREATE_ISSUE']
  - All managers: minimal read scopes (Sales mgr: HUBSPOT_SEARCH_CONTACTS; CS mgr: STRIPE_LIST_CUSTOMERS; RevOps mgr: SLACK_POST_MESSAGE; Insight mgr: LINEAR_CREATE_ISSUE)
  
  **Per-tool throttling** (in `lib/tools/composio.ts`): wrap each Composio call site in a per-tool rate limiter:
  - LinkedIn: max 1 call/sec (LinkedIn enforces ~100–500/day; demo seed pre-enriches)
  - All others: max 5 calls/sec default
  - Use a simple token bucket; export `withRateLimit(action, fn)` helper.

3. lib/personas/registry.ts
- Array of EXACTLY 13 Persona configs (Researcher, Qualifier, Strategist, Writer, Scheduler, Brief Writer, Activation, CRM Logger, Pipeline Reporter, Slack Digest, Feedback Tagger, Theme Synthesizer, Linear Filer)
- Each: { id, layer, department?, systemPromptPath, allowedActions, modelTier, inputSchema, outputSchema, maxConcurrency }
- modelTier: 'sonnet' default → `claude-sonnet-4-6`; 'haiku' for tagging-class (feedbackTagger) → `claude-haiku-4-5-20251001`; 'opus' for managers → `claude-opus-4-7`

4. lib/personas/runtime.ts — generic Specialist invoker (separate query() per call)
   ```ts
   import { query } from "@anthropic-ai/claude-agent-sdk";
   import { getMcpConfigForUser, getAllowedToolsForPersona } from "@/lib/tools/composio";

   export async function runPersona<TIn, TOut>(personaId: PersonaId, input: TIn, userId: string): Promise<TOut> {
     const persona = PERSONA_REGISTRY[personaId];
     persona.inputSchema.parse(input);

     const promptBody = await readFile(persona.systemPromptPath, "utf-8");
     const mcpConfig = await getMcpConfigForUser(userId);

     await emitEvent(input.workflowRunId, persona.id, "persona_started", { input });

     const result = await collectResult(query({
       prompt: buildPersonaPrompt(persona, input),
       options: {
         model: persona.modelTier === "opus" ? "claude-opus-4-7" :
                persona.modelTier === "haiku" ? "claude-haiku-4-5" : "claude-sonnet-4-6",
         systemPrompt: promptBody,
         mcpServers: { composio: mcpConfig },
         allowedTools: getAllowedToolsForPersona(persona.id),
         maxTurns: 8,
       }
     }));

     const output = persona.outputSchema.parse(parsePersonaOutput(result));
     await emitEvent(input.workflowRunId, persona.id, "persona_completed", { output });
     return output as TOut;
   }
   ```

5. lib/personas/prompts/*.md (EXACTLY 13 stub files — NOT 14)
- Frontmatter: { model_tier, allowed_actions }
- Body: placeholder system prompt (non-technical teammate writes real content)
- File names match persona IDs (researcher.md, qualifier.md, strategist.md, writer.md, scheduler.md, brief-writer.md, activation.md, crm-logger.md, pipeline-reporter.md, slack-digest.md, feedback-tagger.md, theme-synthesizer.md, linear-filer.md)
- For Conductor + Manager prompts: include explicit JSON output schema in the prompt body. Example: `Output ONLY a JSON object matching: { "tasks": [{ "specialistId": "...", "input": {...} }, ...] }. No prose.`

6. lib/state/voice.ts — STATIC voice samples for hackathon (no cross-run learning)
- getVoiceSamples(founderId): returns 5–10 founder emails seeded at setup time, used as few-shot examples for Writer persona
- recordVoiceEdit(approvalId, originalDraft, founderEdits): stores diff in founder_voice_edits table for FUTURE use (NOT consumed within this hackathon's runs — stored for post-demo analytics)
- buildFewShotExamples(founderId, count = 3): for hackathon, returns the 3 most recent voice samples by category (no ranking by similarity). P2 = ranked retrieval based on current task semantics.

7. lib/state/leads.ts
- insertLead, getLead, updateEnriched, updateQualified, listLeads(filter)

8. lib/state/activity.ts
- emitEvent(workflowRunId, nodeId, type, payload, link?): writes to activity_events table AND emits to lib/realtime/bus.ts (Session 3 owns) — use the mock from lib/shared/mocks.ts (makeMockEventBus) until Session 3 lands

9. lib/tools/slack-approval.ts
- sendApprovalDM(founderSlackUserId, approvalRequest, dashboardUrl): uses Composio SLACK_DM to message the founder with proposed action summary + dashboard deep link
- Called from lib/state/approvals.ts (Session 1) when raising an approval. They will import this.

VERIFICATION (your slice complete when):
- `pnpm tsx -e "import {runPersona} from './lib/personas/runtime'; runPersona('researcher', {leadId:'test'}, 'demo-user').then(console.log)"` returns a typed EnrichedLead artifact
- Composio Connect Link works for Gmail end-to-end (manual: connect test Gmail, run Researcher invocation, verify it calls real Composio)
- Slack approval DM sends successfully to test workspace
- All 13 persona configs typecheck and validate against Zod schemas
- Per-persona scope filter rejects out-of-scope actions

KEY REFERENCES:
- Composio quickstart: https://docs.composio.dev/docs/quickstart
- Composio Claude Agent SDK provider: see Composio docs (the @composio/claude-agent-sdk package)
- Claude Agent SDK: https://platform.claude.com/docs/en/agent-sdk/overview

Hackathon scope. Don't over-engineer. Don't modify files outside your scope. Ask the user when in doubt.
```

### Session 3 Prompt (parallel — Dashboard + CLI + Demo)

```
You are working on GMaestro — an AI GTM team for pre-Series A founders, distributed as a local-first npm package. Multi-persona Claude agents orchestrate GTM workflows via Composio.

READ FIRST (required): CLAUDE.md, lib/shared/types.ts, lib/shared/mocks.ts.

YOUR SESSION: Dashboard + CLI + Demo (worktree: feat/dashboard)

YOUR SCOPE — modify only:
- app/(dashboard)/page.tsx
- app/(dashboard)/connections/page.tsx
- app/(dashboard)/runs/[id]/page.tsx
- app/(dashboard)/approvals/page.tsx
- app/api/stream/route.ts
- app/api/composio/callback/route.ts
- lib/ui/components/*.tsx
- lib/ui/hooks/*.ts
- lib/realtime/bus.ts
- lib/realtime/events.ts
- bin/gmaestro.ts
- scripts/seed-demo.ts
- scripts/reset-demo.ts
- scripts/smoke.ts

DO NOT TOUCH:
- lib/orchestrator/*, lib/state/workflows.ts, approvals.ts, app/api/runs/*, app/api/approvals/* — Session 1
- lib/personas/*, lib/tools/*, lib/state/voice.ts, leads.ts, activity.ts — Session 2
- lib/shared/*, package.json, tsconfig.json, drizzle/migrations/*, lib/state/db.ts, lib/state/schema.ts — Session 0 frozen

If you need a new shared type, ask the user.

WHAT TO BUILD:

1. lib/realtime/bus.ts — singleton mitt() instance via globalThis pattern (Next.js App Router has separate bundles for API routes vs pages — module-level singletons don't work across the boundary, globalThis does):
   ```ts
   import mitt, { Emitter } from "mitt";
   import type { GMaestroEvents } from "./events";

   declare global {
     var __gmaestroEventBus: Emitter<GMaestroEvents> | undefined;
   }

   export const eventBus: Emitter<GMaestroEvents> =
     globalThis.__gmaestroEventBus ?? (globalThis.__gmaestroEventBus = mitt<GMaestroEvents>());
   ```
2. lib/realtime/events.ts — typed event map for mitt:
   ```ts
   export type GMaestroEvents = {
     persona_started: { workflowRunId: string; personaId: string; input: unknown };
     tool_called: { workflowRunId: string; personaId: string; toolName: string };
     artifact_created: { workflowRunId: string; personaId: string; artifactType: string; artifactId: string; link?: string };
     approval_requested: { approvalId: string; workflowRunId: string; artifactType: string; reason: string };
     approval_resolved: { approvalId: string; status: "approved" | "edited" | "rejected" };
     persona_completed: { workflowRunId: string; personaId: string; output: unknown };
     workflow_done: { workflowRunId: string };
   };
   ```

3. app/api/stream/route.ts — SSE endpoint
- `export const dynamic = "force-dynamic"`
- `export const runtime = "nodejs"` (Edge runtime cannot subscribe to in-process EventEmitter)
- Returns ReadableStream subscribed to eventBus
- Pushes JSON-encoded events as `data: {json}\n\n`
- **Sends `: heartbeat\n\n` comment every 15 seconds** to prevent browser EventSource timeout (default ~60s on Chrome). Implement via setInterval inside the ReadableStream's start() callback; clearInterval in cancel().
- Cleanup: unsubscribe AND clearInterval on stream cancel
- Reference: https://nextjs.org/docs/app/building-your-application/routing/route-handlers

4. lib/ui/hooks/use-event-stream.ts
- useEventStream<T>(workflowRunId?): returns { events, latestEvent }
- EventSource with auto-reconnect (5s backoff)

5. lib/ui/components/dag-view.tsx — React Flow component
- Status color: pending (gray), running (blue, pulsing), awaiting_approval (amber), done (green), failed (red)
- Edges labeled with artifact type from lib/shared/types.ts
- Re-renders on PERSONA_STARTED / PERSONA_COMPLETED events
- Immutable updates: pass new nodes array reference each time
- React Flow update-node example: https://reactflow.dev/examples/nodes/update-node

6. lib/ui/components/activity-feed.tsx — vertical scroll, animated insertion (newest top)

7. lib/ui/components/approval-card.tsx — INVEST POLISH HERE, this is the demo's emotional payoff
- Modal/card layout
- Shows: artifact type, blast radius badge, reason for review, proposed action (rendered: emails get an email preview, Slack messages get a Slack mock-up, etc.)
- Edit-in-place: text fields editable; on submit captures founderNotes
- Approve / Reject / Edit & Approve buttons
- POSTs to /api/approvals/[id]

8. lib/ui/components/connection-card.tsx
- One card per Composio integration: icon, name, "Connect" button (opens Composio Connect Link URL)
- Status: Disconnected / Connected / Failed
- 10 Tier-S + 6 Tier-A integrations

9. lib/ui/components/state-sidebar.tsx — live counters: leads enriched, qualified, drafted, approved, sent, meetings booked. Subscribes to event stream.

10. lib/ui/components/closing-brief.tsx — renders final PrepBrief with sections (lead summary, company context, likely use case, talking points, etc.). "Open in Notion" link.

11. Dashboard pages (app/(dashboard)/*)
- page.tsx: prompt input + DAG view + activity feed + state sidebar
- connections/page.tsx: grid of connection cards
- runs/[id]/page.tsx: detail view of past run
- approvals/page.tsx: list view of pending approvals (also reachable via Slack DM deep links)

11b. app/api/composio/callback/route.ts — handles Composio OAuth callback after Connect Link completion.
- `export const runtime = "nodejs"` (touches better-sqlite3)
- Records connection success in SQLite `connections` table (Foundation owns the schema): { userId, toolkit, connectedAccountId, status, connectedAt }
- Returns a small HTML page that auto-closes the browser tab and posts a window message to the parent (so the connections page can update in real time)

12. CLI (bin/gmaestro.ts) — use commander
- setup: interactive @inquirer/prompts wizard for ANTHROPIC_API_KEY, COMPOSIO_API_KEY; writes ~/.gmaestro/.env; runs drizzle-kit push to init SQLite. **Also displays Anthropic tier check warning: "Tier 2+ ($40 cumulative spend) recommended for full demo with parallel sub-agents."**
- dev: runs `next dev` in current dir; opens browser via `open` package
- reset: deletes SQLite, re-runs migrations, re-seeds via scripts/seed-demo.ts
- doctor: checks env vars, SQLite, network connectivity to Composio + Anthropic; pings Anthropic API to detect rate-limit tier; warns if Tier 1

13. scripts/seed-demo.ts — inserts 47 demo leads + 12 trial users + 5-10 voice samples + ICP definition (placeholder content; non-tech teammate provides final)

14. scripts/reset-demo.ts — truncates run/node/event/approval tables; re-runs seed; <5s to clean state

15. scripts/smoke.ts — programmatically POSTs primary demo prompt to /api/runs; polls until done; asserts counts

USE MOCKS WHILE OTHER SESSIONS LAND:
- POST /api/runs may not exist yet — use mock fetch responses in dev with NEXT_PUBLIC_USE_MOCKS=1
- Persona runtime may not exist — emit fake events via makeMockEventStream from lib/shared/mocks.ts to test dashboard

VERIFICATION (your slice complete when):
- `pnpm gmaestro setup` walks user through key entry, writes .env, inits SQLite
- `pnpm gmaestro dev` opens dashboard
- Prompt input dispatches a workflow (against mock or real backend)
- DAG view renders nodes with status colors
- Activity feed streams events via SSE
- Approval card appears in queue when raised; approve / edit / reject all work
- `pnpm tsx scripts/seed-demo.ts` populates 47 leads in <2s
- `pnpm tsx scripts/reset-demo.ts` returns to clean state in <5s

KEY REFERENCES:
- React Flow: https://reactflow.dev/api-reference
- Next.js App Router Route Handlers (SSE): https://nextjs.org/docs/app/building-your-application/routing/route-handlers
- shadcn/ui: https://ui.shadcn.com/
- @inquirer/prompts: https://www.npmjs.com/package/@inquirer/prompts

Hackathon scope. Don't over-engineer. Don't modify files outside your scope. Ask the user when in doubt.
```

### Session 4 Prompt (sequential — Integration + Polish)

```
You are working on GMaestro. Sessions 1, 2, 3 have completed and are merged. Your role: integration, polish, agentic install (P1), Video Cooker submission.

READ FIRST: CLAUDE.md, latest main branch.

YOUR TASKS (in order):

1. Run `pnpm tsx scripts/smoke.ts` end-to-end against real Composio + Anthropic with all 10 Tier-S integrations connected
2. Fix any integration breakage from session merges (typecheck, contract drift, etc.)
3. Build packages/create-gmaestro:
   - npm package implementing the scaffolder
   - When run: clones https://github.com/sebtsang/gmaestro template, runs pnpm install, prompts for keys, runs gmaestro setup
   - Use degit pattern
   - Test: `npx ./packages/create-gmaestro test-install` should produce a working install
4. Build packages/mcp:
   - MCP server using @modelcontextprotocol/sdk
   - Exposes tools: setup_gmaestro(anthropic_key, composio_key), run_workflow(prompt), get_status(workflowRunId)
   - Test: register in Claude Code config, ask Claude to "set up GMaestro and run a demo" — should work end-to-end
5. Record Video Cooker submission:
   - Open with Claude Code session: "Install GMaestro and run the 47-lead demo"
   - Show agentic install: scaffolder + setup + dev
   - Show dashboard, prompt input, live DAG, approvals, closing brief
   - Final shot: receipt of all 47 leads processed in 4 minutes
6. Pre-record backup demo video (full primary scenario)
7. P0 STRETCH: if ahead of schedule, prep agentic install for live stage demo

VERIFICATION:
- Smoke test passes
- Fresh laptop install (`git clone` → `pnpm install` → `pnpm gmaestro setup` → `pnpm gmaestro dev`) works in <10 minutes
- Agentic install via MCP server works end-to-end in Claude Code
- Video Cooker submission recorded
- Backup video recorded

Hackathon final hours — prioritize ruthlessly. Polish > new features.
```

