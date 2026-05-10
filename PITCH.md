# GMaestro — pitch & purpose

> **Single source of truth for what we're building, who it's for, and why it wins.**
> Slide decks, demo scripts, marketing copy, and READMEs all derive from this file.
> If a teammate is unsure where to point a sentence, this is north.

---

## One-liner (project header)

> **Docs are for parsers. Blogs are for people. We turn one into the other — for devtools founders whose engineering velocity outruns their marketing.**

## Tagline (everywhere else)

> **One commit. Every channel. All your buyers.**

---

## The contrarian insight

Technical documentation is now written for AI: dense, structured, exhaustive — optimized for LLM parsers. Humans still read **blogs**. As your docs change every day, your buyers fall further behind your product. Your AI knows you. Your buyers don't — yet.

**GMaestro is the bridge.** A multi-persona AI content team that watches your docs, drafts the human-readable blog version of every meaningful change, optimizes it for AI search citation, and ships it across the channels your buyers actually read — with founder approval at every gate.

---

## Who it's for

**Series A devtools companies whose docs ship daily and blogs ship quarterly.** Companies in our heads: Resend, Linear, Vercel, Stripe, Stainless's customers (OpenAI / Anthropic), Mintlify's customers, Anvil-shape startups.

**NOT for:** every founder ever, enterprise marketing teams, agencies, content farms. The narrow ICP is the wedge — broader expansion is the vision slide, not the pitch.

## Why now

1. **AI search is real and growing.** ChatGPT, Perplexity, Claude, and Google AI Overviews handle ~12–18% of English informational queries (Q1 2026, up from <2% a year ago). Reddit drives ~40% of AI-search citations across major engines (Semrush 150K analysis).
2. **Docs platforms are publicly naming the marketing surface.** Mintlify ($45M Series B at $500M, 10× ARR in 2025) is calling docs "the new top-of-funnel." Stainless ($25M Series A) makes SDKs from docs for OpenAI/Anthropic. They're solving inside their own products — not extending out into multi-channel content.
3. **The translation layer is white space.** Notra and PersonaBox are early; Docsie does landing pages not blogs; nobody has multi-persona reasoning + founder-in-loop approval + multi-channel fanout. We're first.
4. **Composio's tool surface** makes multi-channel publishing trivial. One approval, fan out via deterministic dispatcher → GitHub PR, Reddit, LinkedIn, Notion, etc.

## Why we win

| | What we do | What incumbents do |
|---|---|---|
| **Multi-persona reasoning** | 10 specialists across 3 departments, each prompt-tuned | Single LLM call with a long prompt |
| **Founder-in-loop** | Approval gates at every irreversible step | "Generate and post" or fully manual |
| **One approval, N channels** | Founder ticks destinations once, dispatcher fans out | Copy/paste to each channel |
| **GEO-aware** | Dedicated `geo-editor` persona; fact density, citations, schema | SEO-only or generic AI writing |
| **Local-first** | Runs on the founder's laptop; privacy moat | Hosted SaaS |
| **Devtools-shaped** | Reads docs URLs via Firecrawl; commits MDX via GitHub PR | Generic content automation |

## What we're explicitly not

- **Not a docs platform.** We don't host docs. (Mintlify, GitBook own that.)
- **Not GEO measurement.** Profound just raised $96M Series C ($1B valuation) owning GEO observability. We're *generation*, not *measurement*. We get the GEO benefit for free by shipping where AI search crawls.
- **Not generic AI content.** Jasper / Copy.ai / Writer fight for the broad "AI content" square. We don't.
- **Not a GTM tool.** Pivoted off this on 2026-05-09. The architecture survived; the framing tightened.

---

## Hackathon theme: "One for All"

Three independent ways the architecture *is* One for All:

1. **One approval, all destinations.** The BlogDraft channels-checkbox is the central UX innovation: founder approves once, dispatcher fans out to N targets.
2. **One source, all audiences.** Docs → blog → Reddit thread → LinkedIn post → X thread → GitHub PR. One canonical truth, every reader's preferred format.
3. **One prompt, the whole team executes.** Conductor → 3 managers → 10 specialists.

The theme isn't a slogan — it's the architecture.

---

## Demo arc (target: 90 seconds)

**Setup:** founder is "Anvil," a YC W26 devtools startup whose docs change weekly.

**The prompt:**

> *"Anvil shipped v2.3 of our API last week. Read our docs at anvil.co/docs/v2.3, find the 3 most important changes for our buyers, write a blog post about them, and cross-post to r/programming, LinkedIn, and a PR to our static-site repo."*

**The beats:**

1. DAG renders the 10-persona org chart, channels lit up by department.
2. Researcher fires Firecrawl on the docs URL → surfaces 3 changes worth covering.
3. Strategist picks the angle: *"v2.3 has a backwards-incompatible auth change — lead with that."*
4. Writer drafts in the founder's voice (loaded from voice samples at setup).
5. GEO-Editor: direct-answer lead, fact density check, Reddit thread citation, schema markup recommendation.
6. **Approval gate** — the BlogDraft card pops with the draft + the channels checkbox. Founder ticks: GitHub PR, Reddit (r/programming), LinkedIn. Approves.
7. Formatter fans out 3 channel variants in parallel — markdown-with-frontmatter for GitHub, Reddit-native discussion shape, LinkedIn long-form.
8. Bulk-approve the per-channel previews.
9. Dispatcher publishes via Composio: GitHub PR opens (real PR URL!), Reddit post lands, LinkedIn post is live.
10. Toast: *"3 channels live in 47 seconds. Reddit thread should surface in Perplexity citations within 7 days."*

**Closing line:**

> *"Engineering ships docs every day. Now marketing does too. One commit, every channel, all your buyers — that's not just the theme, it's the architecture. One for All."*

---

## MVP scope (what must work for the live demo)

| Capability | Status | Owner |
|---|---|---|
| Real LLM persona pipeline (researcher → strategist → writer → geo-editor → formatter) | ✅ live | core |
| Real Firecrawl docs scrape | ✅ wired (needs auth config) | core + Foundation |
| BlogDraft approval card with channels checkbox | ✅ live | core |
| Real Composio publish for **GitHub PR** | wired in providers; needs end-to-end test | core |
| Real Composio publish for **Reddit** | needs auth config registration | Foundation |
| Real Composio publish for **LinkedIn** | wired (auth config exists); needs publish-flow test | core |
| Bulk-approve for per-channel previews | endpoint exists; needs UI wiring | core |
| Mock-mode fallback (full demo without live LLM) | ✅ live | core |
| CompanyContext system (one-time setup) | ✅ in main; persona slice-map TBD | parallel session |
| Voice samples (founder paste at setup) | wired | core |

**If anything above is flaky day-of:** mock-mode demo path is fully working as fallback.

## Explicitly out of scope for MVP

- WordPress / Ghost publish (Composio slugs unverified)
- X (Twitter) live publish (requires BYO Twitter dev creds)
- Cross-run voice learning
- Slack alt-chat surface (mention as "capability," don't demo)
- Analytics / citation tracking loop
- General GTM features (sales, CRM, scheduling) — deliberately killed in the pivot
- Multi-topic sprint demo (single-blog flow only)

## North-star metrics

- **Demo:** *"3+ channels live in <60 seconds from a docs URL."* If we hit that, we win.
- **Product:** *"Every doc commit auto-becomes the blog post you didn't write."*

---

## Decision log (why this framing won)

- **Locked in 2026-05-10** after debating GEO-only / blog-tool / GMF / docs-→-blogs.
- Research-driven: Anthropic-judged hackathons reward narrow + theatrical demos over broad pitches (the *lawyer* beat 500 devs at Cerebral Valley with permit-processing). Profound's $1B Series C owns the GEO narrative — we don't try to out-pitch a unicorn. Jasper/Copy.ai/Writer own the broad "AI content for founders" square — we don't fight there.
- White space: Notra/PersonaBox/Docsie are adjacent; nobody has multi-persona + multi-channel + founder-in-loop. Mintlify and GitBook publicly naming the gap = category being established.
- Devtools is the highest-WTP B2B niche. $4–12K/mo agency budgets at Series A devtools companies prove the buyer pays.
- "One for All" theme literally restates the product: one input, all the channels.

## Pivot history

- **2026-05-08** — initial pitch: AI GTM team for pre-Series A founders (sales / CS / RevOps).
- **2026-05-09** — pivoted to AI content team (blog / GEO / multi-channel). Architecture survived; domain types swapped.
- **2026-05-10** — narrowed to **devtools docs → multi-channel content**. Same architecture, sharper positioning. **This is locked.**

---

## Where each teammate goes from here

- **Pitch deck:** lift hero / tagline / theme tie-in / demo arc verbatim. Don't paraphrase.
- **Demo script:** the 10 beats above. Single founder prompt. 90 seconds.
- **Marketing copy / project page:** start from the one-liner. Use Mintlify/Stainless funding as social proof.
- **Engineering (this branch):** finish the real-LLM publish path for GitHub PR + Reddit + LinkedIn. Verify Firecrawl docs scrape end-to-end. Bulk-approve UI for per-channel previews.

If you change the pitch, change this file first. Everything else flows from here.
