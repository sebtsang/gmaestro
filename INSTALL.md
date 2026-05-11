# GMaestro Install Guide (for AI agents)

This document is tuned for AI coding agents (Claude Code, Cursor, Codex, etc.) installing GMaestro on a user's machine. Follow it step by step.

GMaestro is a local-first AI content team for devtools founders. Give it a docs URL + a company URL + a destination, get back a published blog post, Reddit thread, LinkedIn post, or GitHub PR — with founder approval at every gate.

## Prerequisites

Verify before starting:

```bash
node --version    # must be 22.x or newer (we test on 25)
pnpm --version    # if missing: `npm install -g pnpm`
git --version
```

If `pnpm` is missing, install it first:

```bash
npm install -g pnpm
```

## Step 1: Clone the repo

```bash
git clone https://github.com/sebtsang/gmaestro
cd gmaestro
```

## Step 2: Install dependencies

```bash
pnpm install
```

This will:

- Install Next.js 16, Claude Agent SDK, Composio, Drizzle, and ~340 transitive deps
- Auto-build `better-sqlite3` (native module — uses `prebuild-install` to fetch a precompiled binary; falls back to `node-gyp` if needed)
- Approve `sharp`, `esbuild`, and `better-sqlite3` build scripts (configured via `pnpm-workspace.yaml`)

If you see `[ERR_PNPM_IGNORED_BUILDS]`, run `pnpm rebuild better-sqlite3` to retrigger the native compile.

## Step 3: Initialize the local database

```bash
pnpm db:migrate
```

This creates `~/.gmaestro/gmaestro.db` (SQLite, WAL mode). All workflow state, approvals, voice samples, and Composio connections live here. Single file, no server.

## Step 4: Get API keys

GMaestro needs two cloud services. Both have free tiers. For the LLM, pick **one** of three paths.

### LLM credentials — pick one

| Path | Cost | What to do |
|---|---|---|
| **Claude Pro/Max OAuth** | $0 (uses your subscription) | Run `claude setup-token`, copy the long-lived `sk-ant-oat01-…` token, save as `CLAUDE_CODE_OAUTH_TOKEN` |
| **Anthropic API key** | ~$1–$2 per run | Console → Settings → API Keys → Create Key, save as `ANTHROPIC_API_KEY` (starts with `sk-ant-api03-…`) |
| **Ollama Cloud** | $0 on Ollama Pro | Save your Ollama key as `OLLAMA_API_KEY` and set `GMAESTRO_LLM_PROVIDER=ollama` |

**Tier note (API key path only):** parallel persona fanout (multi-channel formatter) benefits from Anthropic **Tier 2+** ($40 cumulative spend). Tier 1's 50 RPM limit slows long-form generation. If you're on Tier 1, the CLI will detect it and fall back to sequential dispatch (still works). The OAuth and Ollama paths bypass per-account API tier ratelimits.

### Composio API key

Composio has an [agent-native signup at agents.composio.dev](https://agents.composio.dev) specifically for AI agents installing tools.

1. Visit <https://agents.composio.dev> (or <https://composio.dev> for human signup)
2. Create a project, name it `gmaestro`
3. Copy the API key from the dashboard

You'll connect individual SaaS tools (Firecrawl, Reddit, LinkedIn, etc.) later — Composio handles the OAuth (or API-key-binding) flow per-tool when you click each card in the dashboard's Connections page.

## Step 5: Run the setup wizard

```bash
pnpm gmaestro setup
```

This interactive wizard will:

1. Prompt for your LLM credential (`ANTHROPIC_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN`, or `OLLAMA_API_KEY` + `GMAESTRO_LLM_PROVIDER=ollama`)
2. Prompt for `COMPOSIO_API_KEY`
3. Generate a stable `GMAESTRO_USER_ID` (defaults to `"default"`)
4. Write `~/.gmaestro/.env` with these values
5. Verify connectivity to both services
6. Detect your Anthropic tier and warn if you're on Tier 1 (API key path only)

## Step 6: Start the dashboard

```bash
pnpm gmaestro dev
```

This starts Next.js on `http://localhost:3000` and auto-opens your default browser. You should see the GMaestro dashboard with:

- A 3-input form (company URL + docs URL + destination)
- An empty DAG visualization
- A connections page (top-right) showing supported integrations as "Disconnected" cards

## Step 7: Connect your tools

Click each integration card in the Connections page to start the Composio OAuth (or API-key) flow. At minimum, connect:

- **Firecrawl** — docs scrape + company-blog scrape (load-bearing; Researcher returns empty without it)
- **LinkedIn** — read for research + publish via official Posts API
- **Slack** — end-of-run digest + approval DMs

For the full demo, also connect:

- **Reddit** — research signal + publish
- **GitHub** — open a PR with your draft (the strongest demo for static-site repos)
- **Notion** — alternate publish target

Firecrawl is an API-key toolkit (no OAuth) — if its card doesn't bind cleanly via the standard Connect Link flow, run `pnpm tsx scripts/connect-firecrawl.ts` to register the connection with the right `userId`. The other integrations open a new browser tab to Composio's hosted OAuth page; you sign in to the relevant service, and Composio redirects back to `http://localhost:3000/api/composio/callback`. Cards flip to "Connected" in real time.

## Step 8: Run the demo workflow

Fill out the 3-input form on the dashboard:

- **Company URL:** your homepage (the researcher scrapes `/` and `/blog` to learn your voice)
- **Docs URL:** the page you just shipped (e.g. `https://docs.composio.dev/toolkits/firecrawl`)
- **Destination:** pick one — `blog-html` / `reddit` / `x-thread`

Hit Run. The dashboard renders the 10-persona org chart, then:

1. Researcher fans out (Firecrawl on docs + company URL, plus Reddit / X / Perplexity signal).
2. Strategist picks the angle and locks the per-destination output shape.
3. Outline approval lands — you confirm.
4. Writer drafts the long form (~1,000 words for blog-html, 250 for Reddit, 5–10 tweets for X).
5. GEO-Editor passes for citation-friendliness.
6. BlogDraft approval lands with a channels checkbox — tick the destinations you want.
7. Formatter fans out one variant per ticked target.
8. Per-channel preview approvals stack in the queue. Bulk-approve.
9. Dispatcher publishes via Composio. Done.

## Troubleshooting

### `Error: Could not locate the bindings file` for `better-sqlite3`

The native module didn't compile. Run:

```bash
pnpm rebuild better-sqlite3
```

If that fails, check that `pnpm-workspace.yaml` has `better-sqlite3` in `onlyBuiltDependencies`, then `pnpm install` again.

### Anthropic returns 401

Re-run `pnpm gmaestro setup` and verify the API key. If still failing, regenerate the key at console.anthropic.com.

### Composio OAuth redirect fails

Some browsers block popups for `localhost`. Allow popups for `localhost:3000` and click the connection card again.

### Workflow hangs on an approval

By default, approvals time out after 60 minutes and the workflow proceeds with a partial artifact. To approve faster, open the dashboard's Approvals page (top-right) and resolve manually.

### Demo seed needs a reset

```bash
pnpm gmaestro reset
```

Clears all workflow state and re-seeds the demo fixtures in under 5 seconds.

### Firecrawl returns shell HTML for SPA-rendered docs

Modern devtools docs (Mintlify, Docusaurus, Vercel-hosted Next.js) are JS-rendered SPAs. The standard scrape returns the JS shell, not the rendered content. The Researcher's Firecrawl call already passes `waitFor: 5000` and `onlyMainContent: true` to handle this — if a specific docs site still returns shell HTML, try the script:

```bash
pnpm tsx scripts/_test-firecrawl.ts <docs-url>
```

If output is under 100 chars, the page is hydrating slower than 5s; consider pointing at the server-rendered URL or a different doc page for the demo.

## Next steps

- Read [`PITCH.md`](./PITCH.md) for the locked product positioning
- Read [`CLAUDE.md`](./CLAUDE.md) for the engineering quick-reference
- Connect Reddit + GitHub for the strongest end-to-end demo (PR + Reddit thread + LinkedIn post from one approval)
