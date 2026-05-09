# CLAUDE.md — GMaestro

This file is the single source of truth for Claude Code sessions working on GMaestro. Read it on every fresh session before writing code.

> See [`PLAN.md`](./PLAN.md) at repo root for the full design doc, audit corrections, and detailed session prompts. This file is the operational quick-reference.

---

## What we're building

**GMaestro** is a local-first AI GTM team for pre-Series A founders running their own GTM. Multi-persona Claude agents orchestrate end-to-end pipeline work (research → qualify → outreach → schedule → brief → close-loop) via [Composio](https://composio.dev) tool integrations, with founder-in-loop approval gates for any external/irreversible action.

**Distribution:** local-first npm package. Founder runs `gmaestro dev` on their laptop; dashboard opens at `localhost:3000`. No hosted SaaS.

**Architectural inspiration:** [Garry Tan's gstack](https://github.com/garrytan/gstack) — same opinionated multi-persona pattern, different substrate (Composio's tool surface instead of Claude Code's filesystem).

---

## Demo scope

We're building deliberately for ONE primary scenario plus 2–3 alternates. Anything outside is "roadmap."

### Primary demo prompt

> *"I'm a YC W26 founder. 47 demo requests came in this week from our HN launch. I have 3 hours before cofounder offsite. Process them."*

### Alternates (same architecture handles them)

- *"Process this one inbound lead from acme.com"* — single-lead path
- *"Daily activation check on 12 trial users"* — CS path
- *"Customer reported a bug — file it and update them"* — Insight pipeline

### Demo company

The fake YC W26 startup we play in the demo is named **Anvil** (distinct from the product name **GMaestro**).

---

## Architecture (4 layers, executed by 5 things)

> **Critical:** [Claude Agent SDK forbids sub-agents from spawning sub-agents](https://code.claude.com/docs/en/agent-sdk/subagents). So we orchestrate the lower layers ourselves in TypeScript via separate `query()` calls.

```
L0  Workflow function (TypeScript)        — orchestrates everything
     │
     ▼
L1  Conductor query()                     — 1 SDK call, returns plan
     │   ├─ agents:                       —   sub-agents (1 SDK level deep, allowed)
     │   │   ├─ sales-mgr
     │   │   ├─ cs-mgr
     │   │   ├─ revops-mgr
     │   │   └─ insight-mgr
     │
     ▼
L2  Specialist queries (separate query() calls, dispatched by L0)
     │   13 personas × Sonnet 4.6 mostly, Haiku for tagger
     │   each with scoped Composio MCP via allowedTools
     │
     ▼
L3  Composio MCP HTTP server              — actions executed via Composio
```

**Workers** are NOT a separate layer. The 47-lead parallel fanout is just `pMap` calling Specialists in parallel.

---

## Personas (exactly 13 — DO NOT add Health Monitor; it was dropped per audit)

| Department | Specialists |
|---|---|
| Sales | researcher, qualifier, strategist, writer, scheduler, brief-writer |
| CS | activation |
| RevOps | crm-logger, pipeline-reporter, slack-digest |
| Insight | feedback-tagger, theme-synthesizer, linear-filer |

Plus Conductor (L1) and 4 Department Heads (L2) which exist as `AgentDefinition` objects nested inside the Conductor's `query()` call.

---

## Stack

- **Next.js 16.2.6** App Router (Turbopack default), TypeScript strict
- **`@anthropic-ai/claude-agent-sdk`** — orchestration via `query()`, sub-agents via `agents` config, MCP via `mcpServers`
- **`@composio/core`** — tool layer via Composio's hosted MCP HTTP server. **No `@composio/claude-agent-sdk` provider package** — we wire MCP directly.
- **`better-sqlite3` + `drizzle-orm`** — local DB at `~/.gmaestro/gmaestro.db`, WAL mode
- **`mitt`** for in-process pub/sub, exposed via SSE Route Handler
- **shadcn/ui** + Tailwind 4 — UI primitives in `components/ui/` (Foundation owns)
- **React Flow** — DAG visualization
- **Zod** — runtime validation everywhere we cross a trust boundary

### Model IDs (exact)

```ts
"claude-opus-4-7"           // Conductor + Managers
"claude-sonnet-4-6"          // Specialists (default)
"claude-haiku-4-5-20251001"  // Tagger (date suffix required)
```

### Anthropic tier requirement

Tier 2+ ($40 cumulative spend) for parallel fanout. Tier 1 = 50 RPM = bottleneck. CLI `doctor` warns and falls back to sequential dispatch (concurrency=1) if Tier 1.

---

## Founder ID

Single value `"default"`, generated/persisted at `gmaestro setup` time and stored as `GMAESTRO_USER_ID` in `~/.gmaestro/.env`. Used as `userId` everywhere (Composio sessions, Drizzle FKs).

---

## File ownership matrix

**🔒 Foundation owns (frozen after initial scaffold):**

```
PLAN.md                         CLAUDE.md
package.json                    pnpm-workspace.yaml
tsconfig.json                   next.config.ts
drizzle.config.ts               postcss.config.mjs
.env.example                    .gitignore
.github/workflows/*
components.json                 components/ui/*       ← shadcn primitives
lib/shared/types.ts             lib/shared/schemas.ts
lib/shared/env.ts               lib/shared/mocks.ts
lib/state/db.ts                 lib/state/schema.ts
drizzle/migrations/*
app/layout.tsx (initial)        app/globals.css
public/*
```

If a parallel session needs a change to any of these, raise it with the human conductor — DO NOT modify on your branch.

**Session 1 owns (worktree `feat/orchestrator`):**

```
lib/orchestrator/conductor.ts
lib/orchestrator/managers/{sales,cs,revops,insight}.ts
lib/state/workflows.ts
lib/state/approvals.ts
app/api/runs/route.ts
app/api/approvals/[id]/route.ts
```

**Session 2 owns (worktree `feat/personas`):**

```
lib/personas/registry.ts
lib/personas/runtime.ts
lib/personas/prompts/*.md         ← 13 stubs; non-tech teammate writes content
lib/tools/composio.ts
lib/tools/connect.ts
lib/tools/scopes.ts
lib/tools/slack-approval.ts
lib/state/voice.ts
lib/state/leads.ts
lib/state/activity.ts
```

**Session 3 owns (worktree `feat/dashboard`):**

```
app/(dashboard)/page.tsx
app/(dashboard)/connections/page.tsx
app/(dashboard)/runs/[id]/page.tsx
app/(dashboard)/approvals/page.tsx
app/api/stream/route.ts
app/api/composio/callback/route.ts
lib/ui/components/*.tsx           ← custom components (NOT components/ui/)
lib/ui/hooks/*.ts
lib/realtime/bus.ts
lib/realtime/events.ts
bin/gmaestro.ts                   ← currently a stub; Session 3 implements
scripts/seed-demo.ts
scripts/reset-demo.ts
scripts/smoke.ts
```

**Component directories (don't confuse them):**

- `components/ui/` — shadcn primitives. Foundation/shadcn writes these. Sessions read but never modify.
- `lib/ui/components/` — custom GMaestro components (DAG view, approval card, etc.). Session 3 owns.

---

## Mock-first development convention

Sessions cannot block on each other. Every cross-session dependency has a mock factory in `lib/shared/mocks.ts`.

| Need from another session | Mock to use until it lands |
|---|---|
| Session 1's API routes | mock fetch in dev (`NEXT_PUBLIC_USE_MOCKS=1`) |
| Session 2's `runPersona()` | `makeMockPersonaRuntime()` |
| Session 2's `getMcpConfigForUser()` | `makeMockMcpConfig()` |
| Session 2's persona registry | `makeMockPersonaRegistry()` |
| Session 3's `eventBus` | `makeMockEventBus()` |
| Session 3's event stream (for testing dashboard) | `makeMockEventStream()` |

Always swap mocks for real imports just before merging your branch to `main`.

---

## Critical implementation rules

1. **`export const runtime = "nodejs";`** on every API route that touches Claude Agent SDK or `better-sqlite3`. Edge runtime cannot load native modules.
2. **`export const dynamic = "force-dynamic";`** on the SSE route (otherwise Next.js may try to cache it).
3. **15-second SSE heartbeat** (`: heartbeat\n\n`) to prevent EventSource browser timeout.
4. **`globalThis.__gmaestroEventBus`** singleton pattern — Next.js bundles API routes and pages separately; module-level singletons duplicate. Same applies to `__gmaestroDb` and `__gmaestroComposio`.
5. **Composio integration: MCP HTTP transport only.** `composio.create(userId)` → use `session.mcp.url` and `session.mcp.headers` in `mcpServers: { composio: { type: "http", url, headers } }`. Per-persona scoping via `allowedTools: ["mcp__composio__GMAIL_DRAFT", ...]`.
6. **Connect Link API:** use `composio.connectedAccounts.link()`, NOT `initiate()` (deprecated for new orgs as of 2026-05-08).
7. **LinkedIn is READ-ONLY.** Researcher persona only: `LINKEDIN_SEARCH_PERSON`, `LINKEDIN_GET_PROFILE`, `LINKEDIN_GET_COMPANY`. All outbound = Gmail.
8. **Writer NEVER sends.** Writer drafts (`GMAIL_DRAFT`); only the Approval Gate flips drafts to sent.
9. **Conductor and Manager output is prompted JSON + Zod validation.** Schema is `WorkflowDAGSchema` in `lib/shared/schemas.ts`. One retry on parse failure.
10. **Voice training is STATIC for hackathon.** Seed founder samples → few-shots in Writer prompt. Edits captured but NOT re-injected within demo timespan.
11. **Graceful degradation when integration not connected.** Persona throws typed error → workflow function marks node failed → workflow continues with remaining tasks.
12. **Crash = restart from scratch.** No mid-workflow resume in hackathon scope.

---

## Decision log

| Decision | Why |
|---|---|
| Local-first, not hosted SaaS | Privacy moat, simpler hackathon build, agentic install fits |
| No Supabase / Inngest / Vercel | Single-user local app — SQLite + SSE replace Postgres + Realtime + queue |
| Claude Agent SDK over LangGraph/CrewAI | Native sub-agents, native MCP, fewer deps |
| Composio MCP HTTP, not provider package | Documented integration path, no extra package |
| Drop Health Monitor persona (13 not 14) | Overlapped with Activation, was P1+ anyway |
| Keep all 4 Department Heads | Visual depth in DAG sells the org-chart pitch |
| Static voice training, not cross-run learning | Hackathon scope; cross-run = P2 |
| Prompted JSON over `structured_output` API | Simpler, works today, retry on parse fail |
| Public repo from day 1 | Enables agentic install demo |

---

## How to run locally

```bash
pnpm install                      # installs everything, builds better-sqlite3
pnpm db:migrate                   # creates SQLite at ~/.gmaestro/gmaestro.db
pnpm dev                          # starts Next.js on localhost:3000
pnpm typecheck                    # tsc --noEmit
pnpm db:studio                    # browse SQLite via Drizzle Studio
```

Once Session 3 lands the CLI:
```bash
pnpm gmaestro setup               # interactive wizard for API keys
pnpm gmaestro dev                 # opens dashboard
pnpm gmaestro reset               # clean state for next demo
pnpm gmaestro doctor              # checks tier, env, network
```

---

## Commit conventions

- Prefix with `chore:`, `feat:`, `fix:`, `docs:`, `refactor:`
- Keep messages tight; describe WHY when non-obvious
- Co-author trailer: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`
- Push to your branch frequently (every ~1h); the human conductor merges to `main`

---

## When in doubt

1. Read `PLAN.md` (full design doc)
2. Read `lib/shared/types.ts` (the contracts)
3. Look for an existing pattern in the codebase
4. Ask the human conductor

Don't guess on architecture. Don't add deps without checking. Don't over-engineer for production — this is hackathon scope. Demo-tuned beats production-tuned every time.
