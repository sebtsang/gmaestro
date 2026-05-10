/**
 * Toolkit categorization shared by the Server-Component connections page
 * and the Client-Component connection card. Kept in its own non-"use client"
 * module so the page can import these constants without the bundler
 * mistakenly treating them as serialized client-reference stubs.
 */

export type ToolkitCategory =
  | "publishing"
  | "social"
  | "research"
  | "knowledge"
  | "messaging"
  | "pm"
  | "email"
  | "calendar"
  | "crm"
  | "listening"
  | "sequencer"
  | "analytics"
  | "callintel"
  | "devpay"
  | "other";

export const TOOLKIT_CATEGORY: Record<string, ToolkitCategory> = {
  // Content publishing destinations (post-pivot priority)
  GITHUB: "publishing", WORDPRESS: "publishing", GHOST: "publishing",
  WEBFLOW: "publishing", HASHNODE: "publishing", MEDIUM: "publishing",
  SUBSTACK: "publishing", DEV: "publishing",
  // Social distribution
  REDDIT: "social", LINKEDIN: "social", TWITTER: "social", YOUTUBE: "social",
  // Content research + grounding
  FIRECRAWL: "research", PERPLEXITY: "research", TAVILY: "research", EXA: "research",
  GOOGLE_SEARCH_CONSOLE: "research", GOOGLE_ANALYTICS: "research",
  SEMRUSH: "research", AHREFS: "research",
  APOLLO: "research", HUNTER: "research", CRUNCHBASE: "research", CLAY: "research",
  // Knowledge / docs
  NOTION: "knowledge", GOOGLESHEETS: "knowledge",
  // Messaging — alt chat surface
  SLACK: "messaging", DISCORD: "messaging", INTERCOM: "messaging",
  // Project management — content task tickets
  LINEAR: "pm", ASANA: "pm", JIRA: "pm", MONDAY: "pm", CLICKUP: "pm", TRELLO: "pm",
  // Legacy GTM toolkits — kept for backward compat
  GMAIL: "email", OUTLOOK: "email", MAILCHIMP: "email", CUSTOMERIO: "email",
  GOOGLECALENDAR: "calendar", CALENDLY: "calendar", ZOOM: "calendar",
  HUBSPOT: "crm", SALESFORCE: "crm", PIPEDRIVE: "crm", ATTIO: "crm",
  LEMLIST: "sequencer", INSTANTLY: "sequencer", SMARTLEAD: "sequencer",
  SALESLOFT: "sequencer",
  MIXPANEL: "analytics", AMPLITUDE: "analytics", POSTHOG: "analytics",
  GONG: "callintel", FIREFLIES: "callintel", CHORUS: "callintel",
  STRIPE: "devpay",
};

export const CATEGORY_ORDER: ToolkitCategory[] = [
  "publishing",
  "social",
  "research",
  "knowledge",
  "messaging",
  "pm",
  // Legacy categories — surfaced under "More"
  "email",
  "calendar",
  "crm",
  "listening",
  "sequencer",
  "analytics",
  "callintel",
  "devpay",
  "other",
];

// Pinned section at top of Connections page; order is the suggested setup sequence.
// Content-pivot priority: blog publishing → social distribution → knowledge.
export const POPULAR_CATEGORY_ID = "popular";
export const POPULAR_TOOLKITS = [
  "GITHUB",
  "WORDPRESS",
  "NOTION",
  "REDDIT",
  "LINKEDIN",
  "TWITTER",
  "FIRECRAWL",
  "PERPLEXITY",
  "SLACK",
  "LINEAR",
] as const satisfies readonly (keyof typeof TOOLKIT_META)[];

export const TOOLKIT_LOGO_URL: Record<string, string> = {
  // Google — must use gstatic, not S2 favicon
  GMAIL: "https://www.gstatic.com/images/branding/product/2x/gmail_2020q4_32dp.png",
  GOOGLECALENDAR: "https://www.gstatic.com/images/branding/product/2x/calendar_2020q4_32dp.png",
  GOOGLESHEETS: "https://www.gstatic.com/images/branding/product/2x/sheets_2020q4_32dp.png",
  // simpleicons CDN
  NOTION: "https://cdn.simpleicons.org/notion",
  HUBSPOT: "https://cdn.simpleicons.org/hubspot",
  LINEAR: "https://cdn.simpleicons.org/linear",
  STRIPE: "https://cdn.simpleicons.org/stripe",
  GITHUB: "https://cdn.simpleicons.org/github",
  DISCORD: "https://cdn.simpleicons.org/discord",
  INTERCOM: "https://cdn.simpleicons.org/intercom",
  CALENDLY: "https://cdn.simpleicons.org/calendly",
  MAILCHIMP: "https://cdn.simpleicons.org/mailchimp",
  ZOOM: "https://cdn.simpleicons.org/zoom",
  REDDIT: "https://cdn.simpleicons.org/reddit",
  YOUTUBE: "https://cdn.simpleicons.org/youtube",
  TWITTER: "https://cdn.simpleicons.org/x",
  PERPLEXITY: "https://cdn.simpleicons.org/perplexity",
  CRUNCHBASE: "https://cdn.simpleicons.org/crunchbase",
  MIXPANEL: "https://cdn.simpleicons.org/mixpanel",
  POSTHOG: "https://cdn.simpleicons.org/posthog",
  ASANA: "https://cdn.simpleicons.org/asana",
  SLACK: "https://www.google.com/s2/favicons?domain=slack.com&sz=64",
  JIRA: "https://cdn.simpleicons.org/jira",
  CLICKUP: "https://cdn.simpleicons.org/clickup",
  TRELLO: "https://cdn.simpleicons.org/trello",
  // Google favicons for brands not on simpleicons or with trademark issues
  OUTLOOK: "https://www.google.com/s2/favicons?domain=outlook.com&sz=64",
  SALESFORCE: "https://www.google.com/s2/favicons?domain=salesforce.com&sz=64",
  PIPEDRIVE: "https://www.google.com/s2/favicons?domain=pipedrive.com&sz=64",
  SALESLOFT: "https://www.google.com/s2/favicons?domain=salesloft.com&sz=64",
  AMPLITUDE: "https://www.google.com/s2/favicons?domain=amplitude.com&sz=64",
  MONDAY: "https://www.google.com/s2/favicons?domain=monday.com&sz=64",
  ATTIO: "https://www.google.com/s2/favicons?domain=attio.com&sz=64",
  APOLLO: "https://www.google.com/s2/favicons?domain=apollo.io&sz=64",
  TAVILY: "https://www.google.com/s2/favicons?domain=tavily.com&sz=64",
  EXA: "https://www.google.com/s2/favicons?domain=exa.ai&sz=64",
  FIRECRAWL: "https://www.google.com/s2/favicons?domain=firecrawl.dev&sz=64",
  HUNTER: "https://www.google.com/s2/favicons?domain=hunter.io&sz=64",
  CLAY: "https://www.google.com/s2/favicons?domain=clay.com&sz=64",
  CUSTOMERIO: "https://www.google.com/s2/favicons?domain=customer.io&sz=64",
  LEMLIST: "https://www.google.com/s2/favicons?domain=lemlist.com&sz=64",
  INSTANTLY: "https://www.google.com/s2/favicons?domain=instantly.ai&sz=64",
  SMARTLEAD: "https://www.google.com/s2/favicons?domain=smartlead.ai&sz=64",
  GONG: "https://www.google.com/s2/favicons?domain=gong.io&sz=64",
  FIREFLIES: "https://www.google.com/s2/favicons?domain=fireflies.ai&sz=64",
  CHORUS: "https://www.google.com/s2/favicons?domain=chorus.ai&sz=64",
  // Content publishing additions (post-pivot)
  WORDPRESS: "https://cdn.simpleicons.org/wordpress",
  GHOST: "https://cdn.simpleicons.org/ghost",
  WEBFLOW: "https://cdn.simpleicons.org/webflow",
  HASHNODE: "https://cdn.simpleicons.org/hashnode",
  MEDIUM: "https://cdn.simpleicons.org/medium",
  SUBSTACK: "https://cdn.simpleicons.org/substack",
  DEV: "https://cdn.simpleicons.org/devdotto",
  GOOGLE_SEARCH_CONSOLE: "https://www.google.com/s2/favicons?domain=search.google.com&sz=64",
  GOOGLE_ANALYTICS: "https://www.google.com/s2/favicons?domain=analytics.google.com&sz=64",
  SEMRUSH: "https://cdn.simpleicons.org/semrush",
  AHREFS: "https://cdn.simpleicons.org/ahrefs",
};

export const TOOLKIT_META: Record<string, { name: string }> = {
  // Email
  GMAIL: { name: "Gmail" },
  OUTLOOK: { name: "Outlook" },
  MAILCHIMP: { name: "Mailchimp" },
  CUSTOMERIO: { name: "Customer.io" },
  // Calendar & meetings
  GOOGLECALENDAR: { name: "Google Calendar" },
  CALENDLY: { name: "Calendly" },
  ZOOM: { name: "Zoom" },
  // CRM
  HUBSPOT: { name: "HubSpot" },
  SALESFORCE: { name: "Salesforce" },
  PIPEDRIVE: { name: "Pipedrive" },
  ATTIO: { name: "Attio" },
  // Docs / knowledge
  NOTION: { name: "Notion" },
  GOOGLESHEETS: { name: "Google Sheets" },
  // Messaging
  SLACK: { name: "Slack" },
  DISCORD: { name: "Discord" },
  INTERCOM: { name: "Intercom" },
  // Listening / lead sources
  REDDIT: { name: "Reddit" },
  YOUTUBE: { name: "YouTube" },
  LINKEDIN: { name: "LinkedIn" },
  TWITTER: { name: "X" },
  // Research & enrichment
  APOLLO: { name: "Apollo" },
  TAVILY: { name: "Tavily" },
  EXA: { name: "Exa" },
  FIRECRAWL: { name: "Firecrawl" },
  PERPLEXITY: { name: "Perplexity" },
  HUNTER: { name: "Hunter" },
  CRUNCHBASE: { name: "Crunchbase" },
  CLAY: { name: "Clay" },
  // Outbound sequencers
  LEMLIST: { name: "Lemlist" },
  INSTANTLY: { name: "Instantly" },
  SMARTLEAD: { name: "Smartlead" },
  SALESLOFT: { name: "Salesloft" },
  // Product analytics
  MIXPANEL: { name: "Mixpanel" },
  AMPLITUDE: { name: "Amplitude" },
  POSTHOG: { name: "PostHog" },
  // Call intelligence
  GONG: { name: "Gong" },
  FIREFLIES: { name: "Fireflies" },
  CHORUS: { name: "Chorus" },
  // Project management
  LINEAR: { name: "Linear" },
  ASANA: { name: "Asana" },
  JIRA: { name: "Jira" },
  MONDAY: { name: "Monday" },
  CLICKUP: { name: "ClickUp" },
  TRELLO: { name: "Trello" },
  // Dev & payments
  GITHUB: { name: "GitHub" },
  STRIPE: { name: "Stripe" },
  // Content publishing destinations (post-pivot)
  WORDPRESS: { name: "WordPress" },
  GHOST: { name: "Ghost" },
  WEBFLOW: { name: "Webflow" },
  HASHNODE: { name: "Hashnode" },
  MEDIUM: { name: "Medium" },
  SUBSTACK: { name: "Substack" },
  DEV: { name: "Dev.to" },
  GOOGLE_SEARCH_CONSOLE: { name: "Google Search Console" },
  GOOGLE_ANALYTICS: { name: "Google Analytics" },
  SEMRUSH: { name: "Semrush" },
  AHREFS: { name: "Ahrefs" },
};

export const CATEGORY_LABEL: Record<ToolkitCategory, string> = {
  publishing: "Blog publishing",
  social: "Social distribution",
  research: "Research & GEO grounding",
  knowledge: "Docs & knowledge",
  messaging: "Messaging",
  pm: "Project management",
  email: "Email",
  calendar: "Calendar & meetings",
  crm: "CRM",
  listening: "Listening & lead sources",
  sequencer: "Outbound sequencers",
  analytics: "Product analytics",
  callintel: "Call intelligence",
  devpay: "Dev & payments",
  other: "Other",
};
