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
