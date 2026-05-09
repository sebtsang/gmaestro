/**
 * Toolkit categorization shared by the Server-Component connections page
 * and the Client-Component connection card. Kept in its own non-"use client"
 * module so the page can import these constants without the bundler
 * mistakenly treating them as serialized client-reference stubs.
 */

export type ToolkitCategory =
  | "email"
  | "calendar"
  | "crm"
  | "knowledge"
  | "messaging"
  | "listening"
  | "research"
  | "sequencer"
  | "analytics"
  | "callintel"
  | "pm"
  | "devpay"
  | "other";

export const TOOLKIT_CATEGORY: Record<string, ToolkitCategory> = {
  GMAIL: "email", OUTLOOK: "email", MAILCHIMP: "email", CUSTOMERIO: "email",
  GOOGLECALENDAR: "calendar", CALENDLY: "calendar", ZOOM: "calendar",
  HUBSPOT: "crm", SALESFORCE: "crm", PIPEDRIVE: "crm", ATTIO: "crm",
  NOTION: "knowledge", GOOGLESHEETS: "knowledge",
  SLACK: "messaging", DISCORD: "messaging", INTERCOM: "messaging",
  REDDIT: "listening", YOUTUBE: "listening", LINKEDIN: "listening",
  APOLLO: "research", TAVILY: "research", EXA: "research",
  FIRECRAWL: "research", PERPLEXITY: "research", HUNTER: "research",
  CRUNCHBASE: "research", CLAY: "research",
  LEMLIST: "sequencer", INSTANTLY: "sequencer", SMARTLEAD: "sequencer",
  SALESLOFT: "sequencer",
  MIXPANEL: "analytics", AMPLITUDE: "analytics", POSTHOG: "analytics",
  GONG: "callintel", FIREFLIES: "callintel", CHORUS: "callintel",
  LINEAR: "pm", ASANA: "pm", JIRA: "pm", MONDAY: "pm", CLICKUP: "pm", TRELLO: "pm",
  GITHUB: "devpay", STRIPE: "devpay",
};

export const CATEGORY_ORDER: ToolkitCategory[] = [
  "email",
  "calendar",
  "crm",
  "messaging",
  "knowledge",
  "listening",
  "research",
  "sequencer",
  "analytics",
  "callintel",
  "pm",
  "devpay",
  "other",
];

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
  PERPLEXITY: "https://cdn.simpleicons.org/perplexity",
  CRUNCHBASE: "https://cdn.simpleicons.org/crunchbase",
  MIXPANEL: "https://cdn.simpleicons.org/mixpanel",
  POSTHOG: "https://cdn.simpleicons.org/posthog",
  ASANA: "https://cdn.simpleicons.org/asana",
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
};

export const CATEGORY_LABEL: Record<ToolkitCategory, string> = {
  email: "Email",
  calendar: "Calendar & meetings",
  crm: "CRM",
  messaging: "Messaging",
  knowledge: "Docs & knowledge",
  listening: "Listening & lead sources",
  research: "Research & enrichment",
  sequencer: "Outbound sequencers",
  analytics: "Product analytics",
  callintel: "Call intelligence",
  pm: "Project management",
  devpay: "Dev & payments",
  other: "Other",
};
