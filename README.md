# GMaestro

Local-first AI GTM team for founder-led GTM at pre-Series A startups.

A multi-persona AI orchestrator that operates real SaaS tools (Gmail, Calendar, Slack, HubSpot, Linear, Notion, Stripe, GitHub, LinkedIn, and more) via [Composio](https://composio.dev), with a founder-in-loop approval gate for any action with external blast radius. Ship pipeline work without trusting your brand voice or close decisions to a faceless bot.

Inspired by [Garry Tan's gstack](https://github.com/garrytan/gstack) — same opinionated multi-persona pattern, different substrate.

## Status

Under active development for the SOON Hackathon (May 8–10, 2026). Architecture and install instructions are in flux.

## Quick install (preview)

```bash
git clone https://github.com/sebtsang/gmaestro
cd gmaestro
pnpm install
pnpm gmaestro setup    # interactive — prompts for Anthropic + Composio API keys
pnpm gmaestro dev      # opens dashboard at http://localhost:3000
```

## License

MIT.
