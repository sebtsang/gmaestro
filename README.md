# GMaestro

**Your AI GTM team, running on your laptop.** A multi-persona agent that processes inbound leads end-to-end — research, qualify, draft outreach in your voice, book meetings, update CRM — and asks before sending anything.

[Quickstart](#quickstart) · [Try without keys](#try-it-without-api-keys) · [Architecture](#architecture-in-one-diagram) · [Personas](#the-13-personas)

> **Hackathon preview.** Built for SOON 2026. Works today end-to-end on the canonical demo (5 leads → 5 personalized drafts → real Gmail send). Rough edges around long fanouts and some persona prompts. See [`PLAN.md`](./PLAN.md) for the design doc, [`CLAUDE.md`](./CLAUDE.md) for the implementation notes.

---

## The 30-second pitch

You're a founder running your own GTM. One or two cofounders, no full-time sales hire, drowning in inbound demos from a launch spike. You type one prompt:

> *"I'm a YC W26 founder. A handful of demo requests came in this week from our HN launch. Process them — short, personalized Gmail draft per lead."*

Within minutes:

- Each lead is enriched, tier-scored against your ICP, and given a strategy
- Outreach is drafted in your voice with the lead's actual inbound message referenced
- An approval card lands in `/approvals` with the email, the reasoning chain, and a provider picker
- One click sends via Gmail (or saves locally if you'd rather copy-paste)

You spent four minutes; the team did the keystrokes. You only made the high-stakes calls.

Inspired by [Garry Tan's gstack](https://github.com/garrytan/gstack) — same opinionated multi-persona pattern, different substrate.

---

## Quickstart

Requires **Node 22+** ([`.nvmrc`](./.nvmrc)) and `pnpm`.

```bash
git clone https://github.com/sebtsang/gmaestro
cd gmaestro
pnpm install
pnpm db:migrate              # creates ~/.gmaestro/gmaestro.db
pnpm gmaestro setup          # interactive — keys + Composio
pnpm dev                     # dashboard at http://localhost:3000
```

Type a prompt, hit Run, watch the team work. See the [auth setup](#auth-setup) section for the three ways to give it an LLM.

---

## Try it without API keys

Skip every cloud setup. The dashboard ships with a mock driver that produces fake DAGs, fake personas, and fake approvals so you can click through the entire UI without burning a token:

```bash
NEXT_PUBLIC_USE_MOCKS=1 pnpm dev
```

Mock mode is good for: reviewing the UI, validating the approval card, demoing the flow, contributing UI patches. It is not good for: assessing the LLM's actual judgement on your real leads.

---

## Auth setup

Three paths to give GMaestro an LLM. All work; pick one.

| Method | Cost | Setup |
|---|---|---|
| **Claude Pro/Max OAuth** | $0 (uses your subscription) | `claude setup-token` → paste the `sk-ant-oat01-…` token into `.env` as `CLAUDE_CODE_OAUTH_TOKEN=` |
| **Anthropic API key** | ~$1–$2 per run | `ANTHROPIC_API_KEY=sk-ant-api03-…` from [console.anthropic.com](https://console.anthropic.com/settings/keys) |
| **Ollama Cloud (Kimi/Qwen)** | $0 on Ollama Pro | `OLLAMA_API_KEY=…` + `GMAESTRO_LLM_PROVIDER=ollama` |

The OAuth path is the cheapest first run if you already have Claude Pro or Max. The token is long-lived, billed against your subscription, and the SDK picks it up via the bundled `claude-code` binary. Composio integrations (Gmail, Calendar, etc.) need a separate `COMPOSIO_API_KEY` — `pnpm gmaestro setup` walks you through it.

---

## Architecture in one diagram

```
L0  Workflow function (TypeScript)        ← orchestrates everything
     │
L1  Conductor query()                     ← 1 Claude Agent SDK call
     │   ├─ sales-mgr   (sub-agent)
     │   ├─ cs-mgr      (sub-agent)
     │   ├─ revops-mgr  (sub-agent)
     │   └─ insight-mgr (sub-agent)
     │
L2  13 Specialists (separate query() calls dispatched in parallel)
     │   Researcher · Qualifier · Strategist · Writer · Scheduler · Brief Writer
     │   Activation · CRM Logger · Pipeline Reporter · Slack Digest
     │   Feedback Tagger · Theme Synthesizer · Linear Filer
     │
L3  Composio (Gmail, Calendar, LinkedIn, …) ← fired post-approval, never mid-reasoning
```

Personas reason in pure LLM over local data (the lead's inbound `rawMessage`, name, email, company). Composio integrations are the dashboard's automation handoff — fired by the founder's approval click, not by an LLM picking tools mid-thought. This is the [Pattern B](https://www.zenml.io/llmops-database/rebuilding-an-ai-sdr-agent-with-multi-agent-architecture-for-enterprise-sales-automation) architecture 11x.ai converged on after rebuilding their first SDR agent.

---

## What happens when you click Run

1. **Conductor** plans the DAG via 4 manager sub-agents (`sales-mgr`, `cs-mgr`, `revops-mgr`, `insight-mgr`). Output is a Zod-validated `WorkflowDAG`.
2. **Researcher** kicks off a deterministic Composio fetch (LinkedIn / Apollo) per lead, then a pure-LLM synth pass that turns the bundle into an `EnrichedLead`.
3. **Qualifier → Strategist → Writer** run in sequence per lead. Each persona reasons over the previous output. Writer drafts the email and produces a one-line rationale.
4. **Approval card** lands in `/approvals` with the lead's inbound message, the upstream reasoning chain, the editable draft, and a provider picker (Gmail / Outlook / none).
5. **You click Approve & send via Gmail.** The dashboard makes a single `composio.tools.execute()` call. Email lands in your real Sent folder. Or click "Request changes" to send it back with feedback for the team to revise.

Every step is auditable in the SQLite DB at `~/.gmaestro/gmaestro.db`.

---

## The 13 personas

| Persona | Department | Tier | What it does |
|---|---|---|---|
| **Researcher** | Sales | Sonnet | Pre-fetches LinkedIn/Apollo, synthesizes EnrichedLead |
| **Qualifier** | Sales | Sonnet | Tier + fit + intent scoring from rawMessage |
| **Strategist** | Sales | Sonnet | Picks angle / tone / CTA / customHooks |
| **Writer** | Sales | Sonnet | Drafts personalized email in founder voice |
| **Scheduler** | Sales | Sonnet | Books meetings on connected calendar |
| **Brief Writer** | Sales | Sonnet | Pre-meeting prep brief in Notion |
| **Activation** | CS | Sonnet | Nudges trial users stalled mid-onboarding |
| **CRM Logger** | RevOps | Sonnet | Mirrors the run to HubSpot/Sheets |
| **Pipeline Reporter** | RevOps | Sonnet | Daily status digest |
| **Slack Digest** | RevOps | Sonnet | End-of-run summary in `#gtm` |
| **Feedback Tagger** | Insight | Haiku | Themes + sentiment from support replies |
| **Theme Synthesizer** | Insight | Sonnet | Cross-feedback patterns into a Notion doc |
| **Linear Filer** | Insight | Sonnet | Files real bugs to Linear/GitHub |

Each persona has scoped Composio actions enforced in code. Writer can `GMAIL_CREATE_EMAIL_DRAFT` but never `GMAIL_SEND_EMAIL` — only the post-approval dispatcher sends. LinkedIn is read-only for everyone.

---

## Toolkit support

| Toolkit | Status | Used by |
|---|---|---|
| Gmail (send + draft) | ✓ | Writer · Scheduler · Activation |
| Google Calendar | ✓ | Scheduler |
| LinkedIn (read-only) | ✓ | Researcher |
| Slack | ✓ | Slack Digest |
| HubSpot | ✓ | CRM Logger · Qualifier (dedup) |
| Notion | ✓ | Brief Writer · Theme Synthesizer |
| Linear / GitHub | ✓ | Linear Filer |
| Stripe | ✓ | Activation |
| Outlook | roadmap | — |
| Apollo | roadmap | — |

Add a connection from `/connections` — OAuth opens in a popup, lands you back on the dashboard, ready to approve from. Composio is the source of truth for connection state; we don't mirror it locally.

---

## Stack

- [Next.js 16](https://nextjs.org) App Router (Turbopack)
- [`@anthropic-ai/claude-agent-sdk`](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk) for orchestration + sub-agents
- [`@composio/core`](https://www.npmjs.com/package/@composio/core) for tool execution
- [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3) + [Drizzle ORM](https://orm.drizzle.team) (single-file DB at `~/.gmaestro/gmaestro.db`)
- [`mitt`](https://github.com/developit/mitt) + Server-Sent Events for the live dashboard
- [shadcn/ui](https://ui.shadcn.com) + Tailwind 4 + [React Flow](https://reactflow.dev)
- TypeScript strict, Zod everywhere

No Vercel, no Supabase, no Inngest, no hosted SaaS. Single Next.js process on your laptop. Your sales pipeline never leaves your machine.

---

## Repository layout

| Path | Purpose |
|---|---|
| `app/` | Next.js App Router — dashboard pages and API routes |
| `bin/gmaestro.ts` | CLI: `setup`, `dev`, `reset`, `doctor` |
| `lib/orchestrator/` | Conductor + 4 manager sub-agents + DAG title generator |
| `lib/personas/` | 13 specialist configs + runtime + prompt files |
| `lib/tools/` | Composio client + per-persona scopes + stateless connections helper |
| `lib/dispatch/` | Post-approval Composio executor + provider catalog |
| `lib/state/` | Drizzle schema + workflow / approval / activity persistence |
| `lib/ui/` | Custom dashboard components + hooks |
| `components/ui/` | shadcn/ui primitives (auto-managed) |
| `scripts/` | Demo seed, smoke test, persona e2e harness, debug helpers (`_db-poll-run.ts`, `_check_calendar.ts`) |

See [`CLAUDE.md`](./CLAUDE.md) for ownership boundaries during parallel-session development.

### Verifying changes

There's no unit-test suite. Three checks gate a change:

1. `pnpm typecheck` — strict TS, runs in CI on every PR
2. `pnpm build` — catches compile errors typecheck misses
3. `pnpm tsx scripts/_test-personas.ts` (with `pnpm dev` running in another shell) — drives all 13 personas through `app/api/test-persona/route.ts` against DB fixtures, reports pass/fail per persona

For UI changes, run `pnpm dev` and exercise the path in a browser before marking a task done — none of the above catches render or SSE bugs.

---

## Status & roadmap

**Works today (verified end-to-end on the canonical demo):** Conductor + 4 managers + 13 personas, multi-run dashboard, approval cards with full reasoning chain, provider picker (Gmail/Outlook/none), post-approval Composio dispatch, voice-sample few-shotting, mock mode, Claude OAuth + API key + Ollama provider switching, stateless Composio connection state, auto-create lead from any email mentioned in the prompt.

**Rough edges:** Writer fanout is ~3-5/5 reliability under Ollama (Kimi K2.6). Brief writer + Theme synthesizer prompts are stubs. Outlook + Apollo + Twitter + Loom integrations are roadmap (Composio supports them but BYO OAuth needed).

**Out of scope for hackathon:** cross-run voice learning, mid-workflow resume after crash, hosted multi-tenant mode, anything that isn't a single-laptop install.

---

## License

MIT.
