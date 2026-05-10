# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This file is the single source of truth for Claude Code sessions working on GMaestro. Read it on every fresh session before writing code.

> See [`PLAN.md`](./PLAN.md) at repo root for the full design doc, audit corrections, and detailed session prompts. For user/agent-facing setup steps (install, API key wizard, OAuth), see [`INSTALL.md`](./INSTALL.md). This file is the operational quick-reference for development.

---

## What we're building

**GMaestro** is a local-first AI **content team** for pre-Series A founders. Multi-persona Claude agents orchestrate end-to-end content pipeline work (research → strategize → write → GEO-edit → format → publish across channels) via [Composio](https://composio.dev) tool integrations, with founder-in-loop approval gates at every irreversible step.

The team optimizes for both traditional **SEO** and **Generative Engine Optimization (GEO)** — citation by ChatGPT / Perplexity / Claude / Gemini / Google AI Overviews. Reddit drives ~47% of Perplexity citations, so multi-channel cross-posting (your blog + Reddit + LinkedIn + X + GitHub PR for static-site repos) is a first-class concern, not an afterthought.

**Pivoted 2026-05-09** from GTM (sales / CS / RevOps) to content. Architecture is unchanged — Conductor → Managers → Specialists → Composio MCP, Pattern B universal, post-approval deterministic dispatch — only the domain types changed.

**Distribution:** local-first npm package. Founder runs `gmaestro dev` on their laptop; dashboard opens at `localhost:3000`. No hosted SaaS.

**Architectural inspiration:** [Garry Tan's gstack](https://github.com/garrytan/gstack) — same opinionated multi-persona pattern, different substrate (Composio's tool surface instead of Claude Code's filesystem).

---

## Demo scope

We're building deliberately for ONE primary scenario plus 2–3 alternates.

### Primary demo prompt

> *"Anvil just hit 1k weekly active users. Plan and ship a 2k-word blog on what we learned about LLM-native onboarding, optimized for Perplexity citations. Cross-post to Reddit (r/SaaS, r/startups), LinkedIn, and our static-site blog repo (anvil-co/anvil-site)."*

### Alternates (same architecture handles them)

- *"Audit our existing site at anvil.co/blog. Tell me which 3 topics we're missing relative to our top-citing competitors, then draft the highest-priority one."* — GEO audit flavor
- *"It's Monday. Plan and queue 3 blog posts for the week, each with a Reddit + LinkedIn cross-post variant. Let me approve outlines today and drafts tomorrow."* — multi-topic sprint flavor

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
     │   │   ├─ content-mgr
     │   │   ├─ distribution-mgr
     │   │   └─ insight-mgr
     │
     ▼
L2  Specialist queries (separate query() calls, dispatched by L0)
     │   10 personas × Sonnet 4.6 mostly, Haiku for tagger
     │   each with scoped Composio MCP via allowedTools (currently all empty
     │   — Pattern B is universal in this codebase)
     │
     ▼
L3  Composio MCP HTTP server              — actions executed via Composio
```

**Workers** are NOT a separate layer. Multi-topic / multi-channel parallel fanout is just `pMap` calling Specialists in parallel.

**Post-approval dispatch is NOT an LLM call.** When the founder approves an artifact, `lib/dispatch/execute.ts` looks up the (artifactType, toolkit) pair in `lib/dispatch/providers.ts` and calls `composio.tools.execute()` directly — not via MCP, not via a `query()` loop. Adding a new provider for an artifact type = one entry in `providers.ts`, no persona scope changes. This is the mechanism behind rule #8 ("Writer NEVER publishes").

---

## Personas (exactly 10 — content-pivot roster as of 2026-05-09)

| Department | Specialists | Role |
|---|---|---|
| Content | researcher, strategist, writer, geo-editor, formatter | research → outline → draft → GEO-optimize → per-channel format |
| Distribution | pipeline-reporter, slack-digest | end-of-run summary + Slack digest |
| Insight | feedback-tagger, theme-synthesizer, linear-filer | post-publish reactions → themes → tickets |

Plus Conductor (L1) and 3 Department Heads (L2) which exist as `AgentDefinition` objects nested inside the Conductor's `query()` call.

The content workflow shape is:
> researcher → strategist → [Outline approval] → writer → geo-editor → [BlogDraft approval + channels picker] → formatter (fanout over channels) → [per-channel preview approvals] → publish via dispatcher → pipeline-reporter → slack-digest

The founder picks publish destinations at the BlogDraft approval gate (channels checkbox: GitHub PR, WordPress, Ghost, Notion, Reddit, LinkedIn, X). The Formatter fans out one ChannelVariant per ticked target.

---

## Stack

- **Next.js 16.2.6** App Router (Turbopack default), TypeScript strict
- **`@anthropic-ai/claude-agent-sdk`** — orchestration via `query()`, sub-agents via `agents` config, MCP via `mcpServers`
- **`@composio/core`** — tool layer via Composio's hosted MCP HTTP server. **No `@composio/claude-agent-sdk` provider package** — we wire MCP directly.
- **`better-sqlite3` + `drizzle-orm`** — local DB at `~/.gmaestro/gmaestro.db`, WAL mode
- **`mitt`** for in-process pub/sub, exposed via SSE Route Handler
- **shadcn/ui** + Tailwind 4 — UI primitives in `components/ui/` (Foundation owns)
- **`@base-ui/react`** — headless primitives used where shadcn doesn't fit. The disabled-Run-button tooltip in `lib/ui/components/prompt-input.tsx` uses Base UI's render-prop pattern with `disabled={isReady}`; do NOT refactor to a span wrapper or invert the disabled prop.
- **React Flow** — DAG visualization
- **`react-resizable-panels`** — drives the persisted 3-column dashboard layout (widths stored in `localStorage`)
- **`sonner`** — toast notifications used by approval flows
- **`next-themes`** — dark/light mode wrapper around the layout
- **Zod** — runtime validation everywhere we cross a trust boundary
- **`lib/shared/models.ts`** — single source of truth for model resolution; call `getModelForTier(tier)` everywhere instead of hardcoding model IDs

### Model IDs (exact)

```ts
"claude-opus-4-7"           // Conductor + Managers
"claude-sonnet-4-6"          // Specialists (default)
"claude-haiku-4-5-20251001"  // Tagger (date suffix required)
```

### Ollama provider (alternative to Anthropic)

Set `GMAESTRO_LLM_PROVIDER=ollama` + `OLLAMA_API_KEY=<your key>` to route through Ollama Cloud instead of Anthropic. The SDK's auth vars are auto-mirrored from `OLLAMA_API_KEY`. Defaults: opus+sonnet → `deepseek-v4-pro:cloud`, haiku → `kimi-k2.6:cloud`.

Per-tier model overrides work on both providers:
```
GMAESTRO_MODEL_OPUS=<model-id>
GMAESTRO_MODEL_SONNET=<model-id>
GMAESTRO_MODEL_HAIKU=<model-id>
```

### Key environment variables

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | required* | Anthropic auth (auto-set from `OLLAMA_API_KEY` in ollama mode) |
| `CLAUDE_CODE_OAUTH_TOKEN` | optional | Long-lived `sk-ant-oat01-…` token from `claude setup-token`; routes Anthropic calls through a Claude Pro/Max subscription instead of API billing. SDK picks it up via the bundled `claude-code` binary. Use *or* `ANTHROPIC_API_KEY`. |
| `COMPOSIO_API_KEY` | required | Falls back to `~/.composio/anonymous_user_data.json` if unset |
| `GMAESTRO_LLM_PROVIDER` | `anthropic` | Switch to `ollama` for Ollama Cloud |
| `OLLAMA_API_KEY` | required when provider=ollama | Auto-mirrored into Anthropic SDK auth vars |
| `GMAESTRO_TIER` | `auto` | Force `tier1` (sequential) or `tier2plus` (concurrency=10) |
| `GMAESTRO_USER_ID` | `default` | Composio sessions + DB foreign keys |
| `GMAESTRO_BASE_URL` | `http://localhost:3000` | Composio OAuth callback base |
| `NEXT_PUBLIC_USE_MOCKS` | unset | Mock all Session 1 API calls client-side |
| `COMPOSIO_MCP_CONFIG_ID` | unset | Skip MCP config lazy-create; use this existing config ID |

\* One of `ANTHROPIC_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN`, or `OLLAMA_API_KEY` must be set. If none are present, persona calls auto-fall back to mocks (`GMAESTRO_MOCK_PERSONAS=1` behavior).

### Anthropic tier requirement

Tier 2+ ($40 cumulative spend) for parallel fanout. Tier 1 = 50 RPM = bottleneck. CLI `doctor` warns and falls back to sequential dispatch (concurrency=1) if Tier 1. Override with `GMAESTRO_TIER=tier1`.

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
lib/utils.ts                    ← cn() helper; shadcn expects it at @/lib/utils
lib/shared/types.ts             lib/shared/schemas.ts
lib/shared/env.ts               lib/shared/mocks.ts
lib/shared/auth-configs.ts      ← Composio auth config IDs (Session 2 imports getAuthConfigId)
lib/state/db.ts                 lib/state/schema.ts
drizzle/migrations/*
app/layout.tsx (initial)        app/globals.css
public/*
scripts/foundation/*            ← one-time setup scripts (e.g., setup-auth-configs)
```

If a parallel session needs a change to any of these, raise it with the human conductor — DO NOT modify on your branch.

**Session 1 owns (worktree `feat/orchestrator`):**

```
lib/orchestrator/conductor.ts
lib/orchestrator/managers/{index,content,distribution,insight}.ts
lib/orchestrator/title.ts          ← run-title generator (LLM, used by recent-runs UI)
lib/orchestrator/context-synth.ts  ← one-shot LLM synth of CompanyContext from voice + leads
lib/dispatch/execute.ts            ← deterministic post-approval Composio dispatcher (no LLM)
lib/dispatch/providers.ts          ← artifactType × toolkit → Composio action map
lib/state/workflows.ts
lib/state/approvals.ts
lib/state/work-context.ts          ← WorkContext snapshot threaded into Conductor prompt
lib/state/company-context.ts       ← singleton CompanyContext row per founder (load/save)
lib/state/gtm-metrics.ts           ← live counts for GtmObjective targets (read-time, no snapshot)
app/api/runs/route.ts
app/api/runs/list/route.ts         ← lists recent runs for the dashboard drawer
app/api/approvals/[id]/route.ts
app/api/approvals/bulk/route.ts    ← bulk-resolve endpoint (one click approves all)
app/api/context/route.ts           ← GET/PUT singleton CompanyContext
app/api/context/refresh/route.ts   ← POST → returns a *proposed* CompanyContext (does not save)
```

**Session 2 owns (worktree `feat/personas`):**

```
lib/personas/registry.ts
lib/personas/runtime.ts
lib/personas/prompts/*.md         ← persona system prompts; non-tech teammate writes content
                                    (note: 13 shipping personas + 3 content stubs whose names
                                     don't yet match the registry's content PersonaIds)
lib/personas/researcher/fetch.ts  ← Pattern B: deterministic TS fetches → pure-LLM synthesizer
app/api/test-persona/route.ts     ← dev-only HTTP entry point used by the persona e2e harness
lib/tools/composio.ts
lib/tools/connect.ts
lib/tools/connections.ts          ← stateless Composio connection-status reader (cached 30s)
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
app/api/connections/start/route.ts ← mints Composio Connect Link OAuth URL
app/api/stream/mock-emit/          ← dev-only SSE injection endpoint
app/api/mock/runs/                 ← dev-only mock recent-runs feed (NEXT_PUBLIC_USE_MOCKS=1)
app/api/mock/context/route.ts      ← dev-only mock CompanyContext for NEXT_PUBLIC_USE_MOCKS=1
lib/ui/components/*.tsx           ← custom components (NOT components/ui/)
lib/ui/components/company-context-card.tsx   ← dashboard card showing CompanyContext + GTM metrics
lib/ui/components/edit-company-context-dialog.tsx ← edit/refresh dialog (pre-fills from synth)
lib/ui/hooks/*.ts
lib/ui/hooks/use-company-context.ts ← client hook; routes to /api/mock/context under NEXT_PUBLIC_USE_MOCKS
lib/ui/persona-meta.ts            ← display labels, icons, status colors for personas/nodes
lib/realtime/bus.ts
lib/realtime/events.ts
bin/gmaestro.ts                   ← `setup`/`dev`/`reset`/`doctor` subcommands (commander + inquirer)
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

**Runtime mock flags** (env vars, no code change needed):

- `GMAESTRO_MOCK_CONDUCTOR=1` — skip real Conductor LLM call, return `makeMockWorkflowDAG()`
- `GMAESTRO_MOCK_PERSONAS=1` — skip real Specialist calls, return mock outputs (also auto-activates when `ANTHROPIC_API_KEY` is unset)

`NEXT_PUBLIC_USE_MOCKS=1` does two things on the client: (1) routes recent-runs fetches at `app/api/mock/runs/`, and (2) drives a fake active-run timeline via `lib/ui/hooks/use-mock-active-run.ts` (node transitions, approvals, completion) so the dashboard can be exercised without a live workflow.

Always swap mocks for real imports just before merging your branch to `main`.

---

## Critical implementation rules

1. **`export const runtime = "nodejs";`** on every API route that touches Claude Agent SDK or `better-sqlite3`. Edge runtime cannot load native modules.
2. **`export const dynamic = "force-dynamic";`** on the SSE route (otherwise Next.js may try to cache it).
3. **15-second SSE heartbeat** (`: heartbeat\n\n`) to prevent EventSource browser timeout.
4. **`globalThis.__gmaestroEventBus`** singleton pattern — Next.js bundles API routes and pages separately; module-level singletons duplicate. Same applies to `__gmaestroDb` and `__gmaestroComposio`.
5. **Composio MCP wiring:** one shared MCP config (`"gmaestro-default-v2"`) is lazy-created via `composio.mcp.create(name, { toolkits, allowedTools, manuallyManageConnections: true })`, then `composio.mcp.generate(userId, configId)` mints a per-user instance URL. Drop the result into `mcpServers: { composio: { type: "http", url: instance.url, headers: {} } }`. Override the lazy-create flow by setting `COMPOSIO_MCP_CONFIG_ID` in env. Per-persona scoping via `allowedTools: ["mcp__composio__GMAIL_DRAFT", ...]` on each SDK `query()` call.
6. **Connect Link API:** use `composio.connectedAccounts.link(userId, authConfigId, { callbackUrl })`, NOT `initiate()` (deprecated for new orgs as of 2026-05-08). For `authConfigId`, import `getAuthConfigId(toolkit)` from `@/lib/shared/auth-configs` — Foundation pre-created auth configs for the Tier-S toolkits. **Reddit, Twitter, WordPress, Ghost** are content-pivot additions that need auth configs registered (entries are commented in `auth-configs.ts` with the script command); the connection picker surfaces them as "Setup required" until then.
7. **LinkedIn READ for research, official Posts API for publish.** The Researcher's Pattern B fetch reads LinkedIn (search/profile). The post-approval dispatcher publishes via `LINKEDIN_CREATE_LINKED_IN_POST` (`w_member_social` scope, official API — not bot-risk). Both go through Composio's managed LinkedIn auth.
8. **Writer NEVER publishes.** Writer drafts (`BlogDraft` artifact); only the post-approval dispatcher publishes via the channel-specific Composio action picked by the founder at the BlogDraft approval gate.
9. **Conductor and Manager output is prompted JSON + Zod validation.** Schema is `WorkflowDAGSchema` in `lib/shared/schemas.ts`. One retry on parse failure.
10. **Voice training is STATIC for hackathon.** Seed founder samples → few-shots in Writer prompt. Edits captured but NOT re-injected within demo timespan.
11. **Graceful degradation when integration not connected.** Persona throws typed error → workflow function marks node failed → workflow continues with remaining tasks.
12. **Crash = restart from scratch.** No mid-workflow resume in hackathon scope.
13. **Conductor only gets `allowedTools: ["Agent"]`** — it delegates all Composio work to Managers/Specialists. Never give the Conductor direct Composio tool access.
14. **`maxTurns` conventions:** Conductor = 12, Specialist single-task = 8, Specialist batch = 6.
15. **Batch auto-selection:** if a persona has `batchInputSchema`/`batchOutputSchema` in the registry AND item count > 5, the dispatcher auto-selects `mode: "batch"` even without an explicit Manager hint.
16. **Batch partial-failure threshold:** ≥80% coverage → keep valid items, skip-cascade missing ids. <80% → re-chunk into groups of 10 and retry once. Researcher's `maxConcurrency` is capped at 5 to match Reddit/X/Firecrawl's combined rate-limit envelope.
17. **WorkContext threading:** v1 returns empty topic/channel lists — content runs drive the topic from the founder's prompt. Channels are picked at the BlogDraft approval gate (founder ticks targets), not pre-loaded; the dispatcher injects the chosen targets into the Formatter's fanout via the approval payload.
18. **`POST /api/runs` is fire-and-forget.** Returns `{ workflowRunId }` with HTTP 202 immediately; the workflow runs detached. Always attach `.catch(markRunFailed)` to the detached promise — uncaught rejection kills the dev server.
19. **Pattern B is universal here.** The Researcher's deterministic Composio fetch (Reddit / X / Firecrawl / Perplexity) → pure-LLM synth (`lib/personas/researcher/fetch.ts`) is the model: every external read is pre-fetched in TypeScript, every external write is post-approval through the dispatcher. NO persona has live MCP tool access — `PERSONA_SCOPES` is universally `[]`. Composio is an automation handoff at deterministic seams, not a tool the LLM picks mid-thought.
20. **BlogDraft approval carries the channels picker.** When the founder approves a `BlogDraft`, the resolve-approval payload includes `targets: ToolkitId[]`. The Formatter is then fanned out one task per target. Each variant gets its own preview approval (bulk-approveable via `/api/approvals/bulk`) before publishing.
21. **CompanyContext synth proposes, never persists.** `lib/orchestrator/context-synth.ts` returns a *proposed* `CompanyContext`. The dashboard's edit dialog opens pre-populated with that proposal — the founder confirms before `saveCompanyContext` writes. `POST /api/context/refresh` returns the proposal; only `PUT /api/context` writes. Don't add a code path that auto-saves the synth output.

---

## Company context (dashboard surface)

A singleton `CompanyContext` row per `userId` stores the founder-confirmed snapshot of the company: `companyOverview`, `keyFacts`, `icps[]` (audience personas — priority + industry + size + seniority), and `gtmObjectives[]` (per-metric targets). Schema in `lib/shared/types.ts`; persistence in `lib/state/company-context.ts`; migration `drizzle/migrations/0003_company_context.sql`.

Lifecycle:
- **Read:** `GET /api/context` → `loadCompanyContext(userId)`. Joined with live counts from `lib/state/gtm-metrics.ts` for the dashboard card.
- **Write:** `PUT /api/context` → `saveCompanyContext(input)`. Founder-driven only.
- **Synth:** `POST /api/context/refresh` → returns a proposed `CompanyContext`. Does NOT persist; the edit dialog opens pre-populated and the founder confirms.
- **Mock:** `app/api/mock/context/route.ts` serves a fixture under `NEXT_PUBLIC_USE_MOCKS=1`.

Threading into the content pipeline: a planned next iteration splices CompanyContext fields into each content persona's `input` object at dispatch time. Today the personas accept an optional `companyProfile` parameter — wire `CompanyContext` → that parameter in `lib/state/workflows.ts` once the slice map is finalized for the 5 content personas (researcher / strategist / writer / geo-editor / formatter).

---

## Decision log

| Decision | Why |
|---|---|
| **Pivoted GTM → content/GEO domain (2026-05-09)** | Founders won't delegate cold email (it kills response rates) but will delegate blogs (they keep skipping content). Content-team angle is a sharper buy-vs-build wedge, GEO is a real recent shift, and the architecture survives intact. |
| Local-first, not hosted SaaS | Privacy moat, simpler hackathon build, agentic install fits |
| No Supabase / Inngest / Vercel | Single-user local app — SQLite + SSE replace Postgres + Realtime + queue |
| Claude Agent SDK over LangGraph/CrewAI | Native sub-agents, native MCP, fewer deps |
| Composio MCP HTTP, not provider package | Documented integration path, no extra package |
| Lean 10-persona content roster (was 13 GTM) | 5 Content + 2 Distribution + 3 Insight. Cleanly maps onto the content workflow without awkward repurposing. |
| 3 Department Heads (was 4) | Content / Distribution / Insight. CS/RevOps were dropped; Distribution absorbs end-of-run reporting. |
| Founder picks publish channels at BlogDraft approval | Differentiator: none of Jasper/Surfer/Frase let one approval fan out to N channels. The channels picker on the BlogDraft approval card is the sharpest UX move. |
| GitHub PR as primary blog destination | Most YC founders' sites are static-site repos. "GMaestro opened a PR with your draft" is a stronger demo than "we wrote to your CMS." |
| Pattern B universal — no live MCP scopes for any persona | All external reads via deterministic TS pre-fetch; all external writes via post-approval deterministic dispatch. Eliminates tool-selection hallucination on smaller models. |
| `CompanyContext` synth proposes, never auto-saves | Founder is the source of truth for company self-description; LLM seeds, founder confirms |
| Static voice training, not cross-run learning | Hackathon scope; cross-run = P2 |
| Prompted JSON over `structured_output` API | Simpler, works today, retry on parse fail |
| Public repo from day 1 | Enables agentic install demo |
| Ollama Cloud as alt provider | Zero marginal cost on Ollama Pro; `GMAESTRO_LLM_PROVIDER=ollama` + `OLLAMA_API_KEY` reroutes the whole stack without code changes |

---

## How to run locally

Requires **Node 22** (see `.nvmrc`) and **pnpm 11+** (the lockfile is pnpm-only — `npm install` / `yarn install` will fail or produce a divergent tree). For user/agent-facing setup steps, see [`INSTALL.md`](./INSTALL.md).

```bash
pnpm install                      # installs everything, builds better-sqlite3
pnpm db:migrate                   # creates SQLite at ~/.gmaestro/gmaestro.db
pnpm dev                          # starts Next.js on localhost:3000
pnpm build                        # production build (catches type + compile errors)
pnpm typecheck                    # tsc --noEmit
pnpm db:studio                    # browse SQLite via Drizzle Studio
```

There is no traditional unit-test suite. Verification is `pnpm typecheck` + `pnpm build` + the persona e2e harness. CI (`.github/workflows/typecheck.yml`) runs `pnpm typecheck` only on every PR and push to `main` — Node 22, pnpm 11, frozen lockfile. A red typecheck blocks merge.

**Persona e2e harness:** in one shell run `pnpm dev`; in another run `pnpm tsx scripts/_test-personas.ts`. The harness reads lead/trial fixtures from the local DB and `POST`s to `app/api/test-persona/route.ts` once per persona, feeding synthetic upstream `previousOutputs` where needed. Why HTTP and not direct import: `lib/personas/runtime.ts` is `import "server-only"`, which refuses to load under `tsx`. Each persona reports pass/fail with a 1-line preview; non-zero exit if any persona failed. The route is dev-only and is not registered with the production build — do not reference it from app code.

For UI changes, run `pnpm dev` and exercise the path in a browser before marking the task done — typecheck does not catch render bugs, and the dashboard's SSE/approval flows have several states (idle, running, awaiting approval) that only fail at runtime.

Debug utilities in `scripts/` (run via `tsx scripts/<name>.ts`):
- `_preflight-composio.ts` — verify Composio API key and connection state
- `_probe-mcp-tools.ts` — list tools available on the live MCP server for a given user
- `_check_auth_configs.ts` — list Composio auth configs registered on the API key
- `_check_calendar.ts` — dump connected accounts for `googlecalendar` + `gmail` toolkits
- `_db-poll-run.ts` — tail workflow run state from the local DB
- `_script-db.ts` — open a raw Drizzle query REPL against the local DB
- `_insert_test_approval.ts` — seed a rich OutreachDraft approval row for testing the approval card without a full smoke run

CLI commands (implemented via `tsx bin/gmaestro.ts`). Both forms work — `pnpm gmaestro <cmd>` forwards args, and the colon-suffixed scripts are aliases:
```bash
pnpm gmaestro setup               # or pnpm gmaestro:setup    — interactive wizard for API keys
pnpm gmaestro dev                 # or pnpm gmaestro:dev      — opens dashboard
pnpm gmaestro reset               # or pnpm gmaestro:reset    — clean state for next demo
pnpm gmaestro doctor              # or pnpm gmaestro:doctor   — checks tier, env, network
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
