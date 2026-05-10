# GMaestro Install Guide (for AI agents)

This document is tuned for AI coding agents (Claude Code, Cursor, Codex, etc.) installing GMaestro on a user's machine. Follow it step by step.

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

**Tier note (API key path only):** the demo's parallel persona fanout (47 leads) needs Anthropic **Tier 2+** ($40 cumulative spend). Tier 1's 50 RPM limit will bottleneck. If you're on Tier 1, the CLI will detect it and fall back to sequential dispatch (slower demo but still works). The OAuth and Ollama paths bypass per-account API tier ratelimits.

### Composio API key

Composio has an [agent-native signup at agents.composio.dev](https://agents.composio.dev) specifically for AI agents installing tools.

1. Visit <https://agents.composio.dev> (or <https://composio.dev> for human signup)
2. Create a project, name it `gmaestro`
3. Copy the API key from the dashboard

You'll connect individual SaaS tools (Gmail, Slack, etc.) later — Composio handles the OAuth flow per-tool when you click each card in the dashboard's Connections page.

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

- A prompt input
- An empty DAG visualization
- A connections page (top-right) showing all 16 supported integrations as "Disconnected" cards

## Step 7: Connect your tools

Click each integration card in the Connections page to start the Composio OAuth flow. At minimum, connect:

- Gmail
- Google Calendar
- Slack
- HubSpot (free tier)
- Notion

For the full demo: also connect Linear, Stripe, GitHub, LinkedIn, and Google Sheets.

Each card opens a new browser tab to Composio's hosted OAuth page, you sign in to the relevant service, and Composio redirects back to `http://localhost:3000/api/composio/callback` to confirm the connection. The card flips to "Connected" in real time.

## Step 8: Run the demo workflow

In the dashboard prompt input, type:

> *"I'm a YC W26 founder. 47 demo requests came in this week from our HN launch. Process them."*

Watch the DAG render, the activity feed stream, and the approval cards land in the queue. Approve drafts, watch them send live, and see your Calendar, HubSpot, Notion, and Slack populate in real time.

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

Clears all workflow state and re-seeds 47 demo leads + 12 trial users in under 5 seconds.

## Next steps

- Read [`PLAN.md`](./PLAN.md) for the full architecture and design
- Read [`CLAUDE.md`](./CLAUDE.md) for the implementation quick-reference
- Try the alternate demo prompts (single-lead, daily activation, bug report)
- Connect more integrations (Apollo, Loom, Discord, Intercom, Twitter, Calendly)
