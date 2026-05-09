/**
 * Seed the local SQLite DB with demo content for the primary scenario.
 *
 *   pnpm tsx scripts/seed-demo.ts
 *
 * Idempotent on lead/voice content (re-running upserts by deterministic id).
 * Wraps inserts in a single transaction so total time stays under ~2s.
 */

import { db, schema, sqlite } from "./_script-db";

// ---------------------------------------------------------------------------
//  Lead generation
// ---------------------------------------------------------------------------

const FIRST_NAMES = [
  "Jordan", "Avery", "Taylor", "Sam", "Cameron", "Riley", "Morgan",
  "Drew", "Reese", "Quinn", "Skyler", "Robin", "Charlie", "Casey",
  "Parker", "Rowan", "Sage", "Kai", "Devon", "Hayden",
];
const LAST_NAMES = [
  "Lee", "Patel", "Nguyen", "Kim", "Garcia", "Martinez", "Cohen",
  "Singh", "Wong", "Chen", "Davis", "Brown", "Wilson", "Taylor",
  "Anderson", "Thomas", "Jackson", "White", "Harris", "Martin",
];
const COMPANIES = [
  { name: "Anvil", domain: "anvil.example", industry: "Devtools", size: 24 },
  { name: "Tributary", domain: "tributary.example", industry: "Fintech", size: 18 },
  { name: "Northwind Labs", domain: "northwind.example", industry: "Logistics", size: 35 },
  { name: "Loomstone", domain: "loomstone.example", industry: "Marketing AI", size: 12 },
  { name: "Quartzline", domain: "quartzline.example", industry: "B2B SaaS", size: 28 },
  { name: "Mira Health", domain: "mirahealth.example", industry: "Healthtech", size: 19 },
  { name: "Oxide Forge", domain: "oxide.example", industry: "Devtools", size: 22 },
  { name: "Reedbridge", domain: "reedbridge.example", industry: "Fintech", size: 41 },
  { name: "Wavelet", domain: "wavelet.example", industry: "Communications", size: 14 },
  { name: "Cinder Loop", domain: "cinderloop.example", industry: "B2B SaaS", size: 17 },
  { name: "Glassbeam", domain: "glassbeam.example", industry: "Analytics", size: 33 },
  { name: "Tasselton", domain: "tasselton.example", industry: "B2B SaaS", size: 9 },
];

const RAW_MESSAGES = [
  "Saw your launch on HN — would love a demo. We're a B2B SaaS in fintech.",
  "Hey! Just came across your project on Hacker News. Curious how this compares to Apollo.",
  "Read your post and the founder-led GTM angle resonates. Can we set up time?",
  "We're a YC alum running outbound ourselves. Interested in trying gmaestro.",
  "Saw the demo video — really cool. We have ~80 inbound leads/week we struggle to triage.",
  "Founder here — burning evenings on outreach. Tell me more.",
  "Trying to scale GTM without hiring AEs. This caught my eye.",
];

function deterministicLead(i: number) {
  const first = FIRST_NAMES[i % FIRST_NAMES.length];
  const last = LAST_NAMES[(i * 7) % LAST_NAMES.length];
  const company = COMPANIES[i % COMPANIES.length];
  const id = `seed-lead-${String(i + 1).padStart(3, "0")}`;
  const sourceCycle = ["inbound_form", "trial_signup", "manual_import"] as const;
  return {
    id,
    email: `${first.toLowerCase()}.${last.toLowerCase()}+${i}@${company.domain}`,
    name: `${first} ${last}`,
    company: company.name,
    source: sourceCycle[i % sourceCycle.length],
    rawMessage: RAW_MESSAGES[i % RAW_MESSAGES.length],
    createdAt: new Date(Date.now() - (i + 1) * 60_000),
  } as const;
}

// ---------------------------------------------------------------------------
//  Voice samples
// ---------------------------------------------------------------------------

const VOICE_SAMPLES = [
  {
    id: "seed-voice-001",
    category: "cold_email_intro",
    body:
      "Hey — quick one. Saw you raised. Most founders we work with are hiring engineers AND running their own GTM right now. If that sounds familiar, mind if I send a 90-second demo?",
    context: "to a CXO at an early-stage B2B SaaS",
  },
  {
    id: "seed-voice-002",
    category: "cold_email_intro",
    body:
      "Hi — saw your HN post. We help founder-led teams handle inbound at the moment they get a launch spike. Worth 10 minutes?",
    context: "to a CTO post-launch",
  },
  {
    id: "seed-voice-003",
    category: "follow_up",
    body:
      "Bumping this in case it slipped. Happy to skip the call and just send a Loom if that's easier.",
    context: "no-reply 3 days after first email",
  },
  {
    id: "seed-voice-004",
    category: "discovery_open",
    body:
      "Before I pitch — what's the biggest GTM bottleneck this quarter? I want to make sure I'm spending your time on the right thing.",
    context: "first 60 seconds of a discovery call",
  },
  {
    id: "seed-voice-005",
    category: "discovery_open",
    body:
      "I'd love to understand: when you got these 47 leads from HN, what felt impossible? That'll tell me whether we're a fit.",
    context: "discovery call opener",
  },
  {
    id: "seed-voice-006",
    category: "ce_book_call",
    body:
      "Here's a 15-min slot tomorrow morning if it's useful — otherwise feel free to grab anything on my calendar.",
    context: "after positive signal in email reply",
  },
  {
    id: "seed-voice-007",
    category: "ce_book_call",
    body:
      "Want me to send a calendar invite, or do you prefer to grab a slot yourself?",
    context: "low-friction close",
  },
  {
    id: "seed-voice-008",
    category: "icp_definition",
    body:
      "ICP: pre-Series A B2B SaaS founders running their own GTM. 5–30 employees. No dedicated AE/SDR yet. Bonus: technical founder, recent fundraise, US-based.",
    context: "internal ICP doc",
  },
];

// ---------------------------------------------------------------------------
//  Trial signals (12 trial users)
// ---------------------------------------------------------------------------

const TRIAL_LEADS = [
  { stalled: "connect-first-tool", featuresUsed: ["onboarding-step-1"], invitedTeammates: 0 },
  { stalled: "import-leads", featuresUsed: ["onboarding-step-1", "onboarding-step-2"], invitedTeammates: 0 },
  { stalled: null, featuresUsed: ["onboarding-step-1", "onboarding-step-2", "first-run"], invitedTeammates: 1 },
  { stalled: "approve-first-draft", featuresUsed: ["first-run"], invitedTeammates: 0 },
  { stalled: null, featuresUsed: ["first-run", "approved-1"], invitedTeammates: 2 },
  { stalled: "connect-first-tool", featuresUsed: [], invitedTeammates: 0 },
  { stalled: null, featuresUsed: ["first-run", "approved-3", "approved-5"], invitedTeammates: 0 },
  { stalled: "import-leads", featuresUsed: ["onboarding-step-1"], invitedTeammates: 0 },
  { stalled: null, featuresUsed: ["first-run", "approved-1"], invitedTeammates: 1 },
  { stalled: "approve-first-draft", featuresUsed: ["first-run"], invitedTeammates: 0 },
  { stalled: null, featuresUsed: ["first-run", "approved-2"], invitedTeammates: 0 },
  { stalled: "connect-first-tool", featuresUsed: [], invitedTeammates: 0 },
];

// ---------------------------------------------------------------------------
//  Run
// ---------------------------------------------------------------------------

function main() {
  console.time("seed-demo");

  const leads = Array.from({ length: 47 }, (_, i) => deterministicLead(i));

  // sqlite-better is sync; one transaction.
  const tx = sqlite.transaction(() => {
    for (const l of leads) {
      db.insert(schema.leads)
        .values(l)
        .onConflictDoUpdate({
          target: schema.leads.id,
          set: {
            email: l.email,
            name: l.name,
            company: l.company,
            source: l.source,
            rawMessage: l.rawMessage,
          },
        })
        .run();
    }

    // 12 trial signals — bind to the first 12 leads.
    for (let i = 0; i < TRIAL_LEADS.length; i++) {
      const cfg = TRIAL_LEADS[i];
      const leadId = leads[i].id;
      const id = `seed-trial-${String(i + 1).padStart(3, "0")}`;
      db.insert(schema.trialSignals)
        .values({
          id,
          leadId,
          signupAt: new Date(Date.now() - (i + 2) * 86_400_000),
          invitedTeammates: cfg.invitedTeammates,
          featuresUsed: cfg.featuresUsed,
          stalledAtStep: cfg.stalled,
          stripeStatus: cfg.stalled ? "trialing" : "active",
          trialEndsAt: new Date(Date.now() + 13 * 86_400_000),
        })
        .onConflictDoUpdate({
          target: schema.trialSignals.id,
          set: {
            stripeStatus: cfg.stalled ? "trialing" : "active",
            featuresUsed: cfg.featuresUsed,
            stalledAtStep: cfg.stalled,
          },
        })
        .run();
    }

    for (const v of VOICE_SAMPLES) {
      db.insert(schema.voiceSamples)
        .values({
          id: v.id,
          userId: process.env.GMAESTRO_USER_ID ?? "default",
          category: v.category,
          body: v.body,
          context: v.context,
        })
        .onConflictDoUpdate({
          target: schema.voiceSamples.id,
          set: { body: v.body, context: v.context, category: v.category },
        })
        .run();
    }
  });

  tx();

  const leadCount = db.select().from(schema.leads).all().length;
  const trialCount = db.select().from(schema.trialSignals).all().length;
  const voiceCount = db.select().from(schema.voiceSamples).all().length;

  console.log(
    `seeded · leads=${leadCount} · trials=${trialCount} · voice=${voiceCount}`,
  );
  console.timeEnd("seed-demo");
}

try {
  main();
  process.exit(0);
} catch (err) {
  console.error(err);
  process.exit(1);
}
