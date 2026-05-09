# GMaestro

**Local-first AI GTM team for founder-led GTM at pre-Series A startups.**

A multi-persona AI orchestrator that operates real SaaS tools — Gmail, Calendar, Slack, HubSpot, Linear, Notion, Stripe, GitHub, LinkedIn, and more — via [Composio](https://composio.dev), with founder-in-loop approval gates for any external action. Ship pipeline work without trusting your brand voice or close decisions to a faceless bot.

Inspired by [Garry Tan's gstack](https://github.com/garrytan/gstack) — same opinionated multi-persona pattern, different substrate (Composio's tool surface instead of Claude Code's filesystem).

> **Status:** Under active development for the SOON Hackathon (May 2026). Architecture and install instructions are in flux. See [`PLAN.md`](./PLAN.md) for the full design doc and [`CLAUDE.md`](./CLAUDE.md) for the implementation quick-reference.

---

## What it does

You're a founder running your own GTM. You have one or two cofounders, no full-time sales hire, and you're drowning in 47 inbound demos from a launch spike. You type one prompt:

> *"I'm a YC W26 founder. 47 demo requests came in this week from our HN launch. Process them."*

Within minutes:

- All 47 leads enriched and tier-scored against your ICP
- Outreach drafted *in your voice*, with your edits learned and applied to the rest of the batch
- Hot-tier discovery calls booked on your real calendar
- Prep briefs in Notion, ready to read before each call
- Trial users gently nudged toward activation
- HubSpot + Slack + Linear updated with the full picture
- A handful of "this needs a human" approvals surfaced in the dashboard (and as Slack DMs you can resolve from your phone)

You spent four minutes; the system did the keystrokes. You made only the high-stakes calls.

---

## Architecture in one diagram

```
L0  Workflow function (TypeScript)        ← orchestrates everything
     │
L1  Conductor query()                      ← 1 Claude Agent SDK call
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
L3  Composio MCP HTTP server               ← real Gmail/Slack/HubSpot/etc.
```

Each persona has scoped Composio actions (Researcher can `LINKEDIN_GET_PROFILE` but not `GMAIL_SEND`; Writer can `GMAIL_DRAFT` but never `GMAIL_SEND` — only the Approval Gate sends).

---

## Quick install (preview — manual path)

> Hackathon-stage. The polished `npx create-gmaestro` and agentic install paths land in Session 4.

```bash
git clone https://github.com/sebtsang/gmaestro
cd gmaestro
pnpm install
pnpm db:migrate                   # creates SQLite at ~/.gmaestro/gmaestro.db
pnpm gmaestro setup               # interactive — prompts for Anthropic + Composio API keys
pnpm gmaestro dev                 # opens dashboard at http://localhost:3000
```

You'll need:

- **Node.js 22+** (we test on 25; 22 LTS is the floor)
- **Anthropic API key** with **Tier 2+** ($40 cumulative spend) — Tier 1 will work but bottlenecks the parallel fanout
- **Composio API key** (free tier is fine)

See [`INSTALL.md`](./INSTALL.md) for the agent-tuned install path.

---

## Stack

- [Next.js 16](https://nextjs.org) App Router (Turbopack default)
- [`@anthropic-ai/claude-agent-sdk`](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)
- [`@composio/core`](https://www.npmjs.com/package/@composio/core) via MCP HTTP transport
- [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3) + [Drizzle ORM](https://orm.drizzle.team)
- [`mitt`](https://github.com/developit/mitt) + Server-Sent Events for live dashboard
- [shadcn/ui](https://ui.shadcn.com) + Tailwind 4 + [React Flow](https://reactflow.dev)

No Vercel. No Supabase. No Inngest. Single Next.js process on your laptop. Your sales pipeline never leaves your machine.

---

## Repository layout

| Path | Purpose |
|---|---|
| `app/` | Next.js App Router — dashboard pages and API routes |
| `bin/gmaestro.ts` | CLI entry: `setup`, `dev`, `reset`, `doctor` |
| `lib/shared/` | Typed contracts, Zod schemas, env validation, mock factories |
| `lib/state/` | Drizzle schema + connection + per-table helpers |
| `lib/orchestrator/` | Conductor + Department Heads (Session 1) |
| `lib/personas/` | 13 specialist configs + runtime + prompts (Session 2) |
| `lib/tools/` | Composio integration + per-persona scopes (Session 2) |
| `lib/realtime/` | In-process event bus + typed events (Session 3) |
| `lib/ui/` | Custom dashboard components and hooks (Session 3) |
| `components/ui/` | shadcn/ui primitives (auto-managed) |
| `scripts/` | Demo seed, reset, smoke test |

See [`CLAUDE.md`](./CLAUDE.md) for full ownership boundaries during parallel-session development.

---

## License

MIT.
