# GMaestro

**Docs are for parsers. Blogs are for people. We turn one into the other — for devtools founders whose engineering velocity outruns their marketing.**

*One commit. Every channel. All your buyers.*

[Quickstart](#quickstart) · [Try without keys](#try-it-without-api-keys) · [Architecture](#architecture-in-one-diagram) · [Personas](#the-10-personas)

> **Hackathon preview.** Built for SOON 2026. See [`PITCH.md`](./PITCH.md) for the locked positioning, [`CLAUDE.md`](./CLAUDE.md) for the engineering quick-reference.

---

## The 30-second pitch

You're a Series A devtools founder. Your docs change every day. Your blog ships quarterly when you remember. Buyers find Resend, Linear, Vercel, and Stripe because those companies show up where buyers already read — Reddit threads, LinkedIn long-form, Perplexity citations. You don't. Your AI knows you. Your buyers don't — yet.

You give GMaestro three things:

- The URL of a doc you just shipped
- Your company URL (it learns your voice from your existing blog)
- A destination (GitHub PR, Reddit, LinkedIn, Notion)

In ~60 seconds, a 10-persona content team researches what's resonating in your space, drafts the human-readable blog version of your doc, optimizes it for AI-search citation, formats it for the destination you picked, and lands an approval card on the dashboard. You approve once — the dispatcher publishes.

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

Fill out the 3-input form on the dashboard (company URL + docs URL + destination), hit Run, watch the team work. See [auth setup](#auth-setup) for the three ways to give it an LLM.

---

## Try it without API keys

Skip every cloud setup. The dashboard ships with a mock driver that produces a fake DAG, fake personas, and a fake approval card so you can click through the full flow without burning a token:

```bash
NEXT_PUBLIC_USE_MOCKS=1 pnpm dev
```

Good for: reviewing the UI, validating the approval card with channels picker, demoing the flow, contributing UI patches. Not good for: assessing the LLM's actual judgement on your real docs.

---

## Auth setup

Three paths to give GMaestro an LLM. All work; pick one.

| Method | Cost | Setup |
|---|---|---|
| **Claude Pro/Max OAuth** | $0 (uses your subscription) | `claude setup-token` → paste the `sk-ant-oat01-…` token into `.env` as `CLAUDE_CODE_OAUTH_TOKEN=` |
| **Anthropic API key** | ~$1–$2 per run | `ANTHROPIC_API_KEY=sk-ant-api03-…` from [console.anthropic.com](https://console.anthropic.com/settings/keys) |
| **Ollama Cloud (Kimi/Qwen)** | $0 on Ollama Pro | `OLLAMA_API_KEY=…` + `GMAESTRO_LLM_PROVIDER=ollama` |

The OAuth path is the cheapest first run if you already have Claude Pro or Max. The token is long-lived, billed against your subscription, and the SDK picks it up via the bundled `claude-code` binary. Composio integrations (Firecrawl, Reddit, LinkedIn, etc.) need a separate `COMPOSIO_API_KEY` — `pnpm gmaestro setup` walks you through it.

---

## Architecture in one diagram

```
L0  Workflow function (TypeScript)        ← orchestrates everything
     │
L1  Conductor query()                     ← 1 Claude Agent SDK call
     │   ├─ content-mgr      (sub-agent)
     │   ├─ distribution-mgr (sub-agent)
     │   └─ insight-mgr      (sub-agent)
     │
L2  10 Specialists (separate query() calls dispatched in parallel)
     │   Content:      Researcher · Strategist · Writer · GEO-Editor · Formatter
     │   Distribution: Pipeline Reporter · Slack Digest
     │   Insight:      Feedback Tagger · Theme Synthesizer · Linear Filer
     │
L3  Composio (Firecrawl · Reddit · LinkedIn · GitHub · Notion · Slack)
                                          ← fired post-approval, never mid-reasoning
```

**Pattern B is universal.** Every external read (Reddit, X, Firecrawl, Perplexity) is pre-fetched deterministically in TypeScript before the LLM ever runs; every external write is post-approval through the dispatcher. No persona has live MCP tool access — `PERSONA_SCOPES` is universally `[]`. This eliminates tool-selection hallucination on smaller models and lets you replace the LLM provider without re-tuning agent loops.

---

## What happens when you click Run

1. **Researcher** fires `FIRECRAWL_SCRAPE` on your docs URL and your company URL (in parallel). The company scrape feeds a 10-rule `VoiceFingerprint` (sentence-length distribution, pronoun mode, hook patterns, banned-vocabulary scan, etc.). The docs scrape becomes the source material. Same persona also pulls signal from Reddit, X, and Perplexity citations to learn what's resonating in your space.
2. **Strategist** picks the angle — failure-mode-first / stat-anchored / contrarian — and locks the word-count target for your chosen destination (1,000 for blog-html, 250 for Reddit, 5–10 tweets for X).
3. **Outline approval** lands on the dashboard. You confirm the angle and the structure.
4. **Writer** drafts the long form. Translation, not summarization — the killer rule: open with what changed, not what the doc *is*.
5. **GEO-Editor** does a citation pass — direct-answer lead, fact density, Reddit-thread reference, schema markup.
6. **BlogDraft approval** lands with the channels picker. You tick the destinations you want (GitHub PR, Reddit, LinkedIn, Notion).
7. **Formatter** fans out one variant per ticked destination — markdown-with-frontmatter for GitHub, native discussion shape for Reddit, long-form for LinkedIn.
8. **Per-channel previews** stack in `/approvals`. Bulk-approve.
9. **Dispatcher** publishes via Composio. GitHub PR opens with the real PR URL; Reddit post lands; LinkedIn post is live.

Every step is auditable in the SQLite DB at `~/.gmaestro/gmaestro.db`.

---

## The 10 personas

### Content (5)

| Persona | Tier | What it does |
|---|---|---|
| **Researcher** | Sonnet | Pre-fetches Firecrawl (docs + company blog), Reddit, X, Perplexity. Computes `VoiceFingerprint`. Recommends the angle. |
| **Strategist** | Sonnet | Picks angle + locks per-destination output shape (word count, section count, rhetorical move). |
| **Writer** | Haiku | Drafts the long form in your voice. Translates the doc into a human-readable post; refuses to summarize. |
| **GEO-Editor** | Sonnet | Direct-answer lead, fact density check, schema markup, citation-friendly structure. |
| **Formatter** | Sonnet | Per-destination formatting — fans out one variant per channel ticked at the BlogDraft approval. |

### Distribution (2)

| Persona | Tier | What it does |
|---|---|---|
| **Pipeline Reporter** | Sonnet | End-of-run status digest. |
| **Slack Digest** | Sonnet | Posts the digest to `#content` or DMs the founder. |

### Insight (3)

| Persona | Tier | What it does |
|---|---|---|
| **Feedback Tagger** | Haiku | Themes + sentiment from post-publish reactions (comments, replies). |
| **Theme Synthesizer** | Sonnet | Cross-feedback patterns into a Notion doc. |
| **Linear Filer** | Sonnet | Files reader-flagged bugs/feature-requests to Linear/GitHub. |

Each persona has scoped Composio actions enforced in code. Writers and editors draft but never publish — only the post-approval dispatcher ships anything. LinkedIn is used read-only for research and via the official Posts API (w_member_social) for publish — no bot-risk scraping.

---

## Toolkit support

| Toolkit | Status | Used by |
|---|---|---|
| Firecrawl | ✓ | Researcher (docs scrape + company-blog voice fingerprint) |
| Reddit | ✓ | Researcher (signal mining) · Dispatcher (publish) |
| LinkedIn | ✓ | Researcher (read) · Dispatcher (official Posts API publish) |
| Perplexity | ✓ | Researcher (citation footprint) |
| X (Twitter) | research only | Researcher; publish requires BYO Twitter dev creds |
| GitHub | ✓ | Dispatcher (PR open for static-site repos) |
| Notion | ✓ | Dispatcher (publish target) |
| Slack | ✓ | Slack Digest · approval DMs |
| WordPress / Ghost | roadmap | Composio slug verification pending |

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

No Vercel, no Supabase, no Inngest, no hosted SaaS. Single Next.js process on your laptop. Your drafts never leave your machine.

---

## Repository layout

| Path | Purpose |
|---|---|
| `app/` | Next.js App Router — dashboard pages and API routes |
| `bin/gmaestro.ts` | CLI: `setup`, `dev`, `reset`, `doctor` |
| `lib/orchestrator/` | Conductor + 3 manager sub-agents + DAG title generator |
| `lib/personas/` | 10 persona configs + runtime + prompt files |
| `lib/personas/researcher/` | Pattern B pre-fetch (Reddit/X/Firecrawl/Perplexity) + company-fetch (VoiceFingerprint) |
| `lib/tools/` | Composio client + per-persona scopes + stateless connections helper |
| `lib/dispatch/` | Post-approval Composio executor + provider catalog (BlogDraft → channels fan-out) |
| `lib/state/` | Drizzle schema + workflow / approval / activity persistence |
| `lib/ui/` | Custom dashboard components + hooks |
| `components/ui/` | shadcn/ui primitives (auto-managed) |
| `scripts/` | Demo seed, smoke test, persona e2e harness, Firecrawl + Slack debug helpers |

See [`CLAUDE.md`](./CLAUDE.md) for the full file-ownership matrix and engineering rules.

### Verifying changes

There's no unit-test suite. Three checks gate a change:

1. `pnpm typecheck` — strict TS, runs in CI on every PR
2. `pnpm build` — catches compile errors typecheck misses
3. `pnpm tsx scripts/_test-personas.ts` (with `pnpm dev` running in another shell) — drives the 10 personas through `app/api/test-persona/route.ts` against DB fixtures, reports pass/fail per persona. Needs a seeded DB first: `pnpm db:migrate && pnpm tsx scripts/seed-demo.ts`.

For UI changes, run `pnpm dev` and exercise the path in a browser before marking a task done — none of the above catches render or SSE bugs.

---

## Status & roadmap

**Works today:** real-LLM persona pipeline (researcher → strategist → writer → geo-editor → formatter), Firecrawl docs scrape, voice fingerprint auto-extraction, BlogDraft approval card with channels picker, multi-run dashboard, post-approval Composio dispatch, Slack DM on approvals, mock mode for keyless demos, Claude OAuth + API key + Ollama provider switching, stateless Composio connection state.

**In progress:** end-to-end publish-flow tests for GitHub PR / Reddit / LinkedIn; bulk-approve UI for per-channel previews; CompanyContext slice-map into the content personas.

**Roadmap:** WordPress / Ghost publish (Composio slugs pending verification), live X publish (needs BYO Twitter dev creds), cross-run voice learning, citation-tracking loop (post-publish → Perplexity / ChatGPT citation count).

**Out of scope for hackathon:** mid-workflow resume after crash, hosted multi-tenant mode, anything that isn't a single-laptop install.

---

## License

MIT.
