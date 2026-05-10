"use client";

/**
 * Renders an artifact's content as if it were a published page on the company's
 * blog. Used inside the approval modal to give the founder a what-the-reader-
 * sees preview instead of raw JSON.
 *
 * Styling target: a clean modern devtools-blog look — prose typography,
 * serif headings, sans-serif body, neutral palette, max-w-prose container,
 * an unobtrusive header bar carrying the company hostname so the preview
 * reads as "this is how it would render on yoursite.com".
 *
 * Markdown rendering is intentionally tiny: we handle the subset the writer/
 * geo-editor personas actually emit (h1/h2/h3, paragraphs, bold/italic,
 * inline + fenced code, lists, links). Anything fancier falls through as
 * plain text — the goal is faithful preview, not a perfect renderer.
 */

import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";

interface BlogPagePreviewProps {
  /** Headline. Renders as the page H1. */
  title?: string;
  /** Smaller line above the title (kicker / category / breadcrumb). */
  kicker?: string;
  /** Lead paragraph under the title. */
  excerpt?: string;
  /** Markdown body. Rendered with the inline parser. */
  body?: string;
  /** Hostname shown in the chrome bar. Strips protocol/path. */
  companyUrl?: string;
  /** Tag pills under the title. */
  tags?: string[];
  /** Cap the preview height; user scrolls inside the modal. */
  maxHeightClass?: string;
}

export function BlogPagePreview({
  title,
  kicker,
  excerpt,
  body,
  companyUrl,
  tags,
  maxHeightClass = "max-h-[60vh]",
}: BlogPagePreviewProps) {
  const hostname = formatHostname(companyUrl);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
      {/* Browser-chrome header — anchors the preview as "rendered on the site" */}
      <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2">
        <div className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-rose-400/70" />
          <span className="size-2 rounded-full bg-amber-400/70" />
          <span className="size-2 rounded-full bg-emerald-400/70" />
        </div>
        <div className="ml-2 flex items-center gap-1.5 truncate rounded-md bg-background/80 px-2 py-0.5 text-[10.5px] font-mono text-muted-foreground ring-1 ring-border">
          <Globe className="size-3 opacity-60" />
          <span className="truncate">{hostname ?? "preview"}</span>
        </div>
      </div>

      <div
        className={cn(
          "overflow-y-auto bg-background",
          maxHeightClass,
        )}
      >
        {/* Article container — narrow column for prose readability */}
        <article className="mx-auto max-w-[640px] px-6 py-8 sm:px-8 sm:py-10">
          {kicker ? (
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {kicker}
            </div>
          ) : null}
          {title ? (
            <h1 className="font-[family-name:var(--font-space-grotesk)] text-3xl font-semibold leading-[1.15] tracking-tight text-foreground sm:text-4xl">
              {title}
            </h1>
          ) : null}
          {excerpt ? (
            <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
              {excerpt}
            </p>
          ) : null}
          {tags && tags.length > 0 ? (
            <div className="mt-5 flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                >
                  {t}
                </span>
              ))}
            </div>
          ) : null}

          {(title || excerpt) && body ? (
            <div className="mt-8 h-px w-full bg-border" />
          ) : null}

          {body ? (
            <div className="mt-6">
              <Markdown source={body} />
            </div>
          ) : null}
        </article>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Tiny markdown renderer — intentionally minimal
// ---------------------------------------------------------------------------

function Markdown({ source }: { source: string }) {
  const blocks = parseBlocks(source);
  return (
    <div className="space-y-4 text-[15px] leading-[1.7] text-foreground/90">
      {blocks.map((b, i) => (
        <Block key={i} block={b} />
      ))}
    </div>
  );
}

type ParsedBlock =
  | { type: "h1"; text: string }
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "code"; lang?: string; text: string }
  | { type: "quote"; text: string };

function parseBlocks(src: string): ParsedBlock[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const out: ParsedBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    const fence = line.match(/^```(\w+)?\s*$/);
    if (fence) {
      const lang = fence[1];
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].match(/^```\s*$/)) {
        buf.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      out.push({ type: "code", lang, text: buf.join("\n") });
      continue;
    }

    // Headings
    const h3 = line.match(/^###\s+(.+)$/);
    if (h3) { out.push({ type: "h3", text: h3[1] }); i++; continue; }
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) { out.push({ type: "h2", text: h2[1] }); i++; continue; }
    const h1 = line.match(/^#\s+(.+)$/);
    if (h1) { out.push({ type: "h1", text: h1[1] }); i++; continue; }

    // Blockquote
    if (line.match(/^>\s*/)) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].match(/^>\s*/)) {
        buf.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      out.push({ type: "quote", text: buf.join(" ").trim() });
      continue;
    }

    // Unordered list
    if (line.match(/^[-*]\s+/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^[-*]\s+/)) {
        items.push(lines[i].replace(/^[-*]\s+/, ""));
        i++;
      }
      out.push({ type: "ul", items });
      continue;
    }

    // Ordered list
    if (line.match(/^\d+\.\s+/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^\d+\.\s+/)) {
        items.push(lines[i].replace(/^\d+\.\s+/, ""));
        i++;
      }
      out.push({ type: "ol", items });
      continue;
    }

    // Paragraph — collect until blank line
    if (line.trim() === "") { i++; continue; }
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !isBlockStart(lines[i])) {
      buf.push(lines[i]);
      i++;
    }
    out.push({ type: "p", text: buf.join(" ") });
  }
  return out;
}

function isBlockStart(line: string): boolean {
  return (
    /^#{1,3}\s+/.test(line) ||
    /^[-*]\s+/.test(line) ||
    /^\d+\.\s+/.test(line) ||
    /^>\s*/.test(line) ||
    /^```/.test(line)
  );
}

function Block({ block }: { block: ParsedBlock }) {
  switch (block.type) {
    case "h1":
      return (
        <h2 className="mt-6 font-[family-name:var(--font-space-grotesk)] text-2xl font-semibold leading-tight tracking-tight">
          <Inline text={block.text} />
        </h2>
      );
    case "h2":
      return (
        <h3 className="mt-5 font-[family-name:var(--font-space-grotesk)] text-xl font-semibold leading-snug tracking-tight">
          <Inline text={block.text} />
        </h3>
      );
    case "h3":
      return (
        <h4 className="mt-4 text-base font-semibold leading-snug">
          <Inline text={block.text} />
        </h4>
      );
    case "p":
      return (
        <p>
          <Inline text={block.text} />
        </p>
      );
    case "ul":
      return (
        <ul className="ml-5 list-disc space-y-1.5 marker:text-muted-foreground/60">
          {block.items.map((it, i) => (
            <li key={i}>
              <Inline text={it} />
            </li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol className="ml-5 list-decimal space-y-1.5 marker:text-muted-foreground/60">
          {block.items.map((it, i) => (
            <li key={i}>
              <Inline text={it} />
            </li>
          ))}
        </ol>
      );
    case "quote":
      return (
        <blockquote className="border-l-2 border-border pl-4 italic text-muted-foreground">
          <Inline text={block.text} />
        </blockquote>
      );
    case "code":
      return (
        <pre className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 text-[12.5px] leading-relaxed">
          <code className="font-mono">{block.text}</code>
        </pre>
      );
  }
}

function Inline({ text }: { text: string }) {
  // Order matters: code first (so its contents aren't double-parsed), then
  // links, then bold/italic. We tokenize into a flat array of strings + JSX.
  type Token = string | { type: "code" | "bold" | "italic" | "link"; text: string; href?: string };
  let tokens: Token[] = [text];

  const splitWith = (
    re: RegExp,
    map: (m: RegExpMatchArray) => Token,
  ) => {
    const next: Token[] = [];
    for (const t of tokens) {
      if (typeof t !== "string") { next.push(t); continue; }
      let last = 0;
      const matches = Array.from(t.matchAll(re));
      for (const m of matches) {
        if (m.index === undefined) continue;
        if (m.index > last) next.push(t.slice(last, m.index));
        next.push(map(m));
        last = m.index + m[0].length;
      }
      if (last < t.length) next.push(t.slice(last));
    }
    tokens = next;
  };

  splitWith(/`([^`]+)`/g, (m) => ({ type: "code", text: m[1] }));
  splitWith(/\[([^\]]+)\]\(([^)]+)\)/g, (m) => ({ type: "link", text: m[1], href: m[2] }));
  splitWith(/\*\*([^*]+)\*\*/g, (m) => ({ type: "bold", text: m[1] }));
  splitWith(/(?<!\*)\*([^*]+)\*(?!\*)/g, (m) => ({ type: "italic", text: m[1] }));

  return (
    <>
      {tokens.map((t, i) => {
        if (typeof t === "string") return <span key={i}>{t}</span>;
        if (t.type === "code")
          return (
            <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.92em]">
              {t.text}
            </code>
          );
        if (t.type === "bold")
          return <strong key={i} className="font-semibold">{t.text}</strong>;
        if (t.type === "italic")
          return <em key={i}>{t.text}</em>;
        if (t.type === "link")
          return (
            <a
              key={i}
              href={t.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline decoration-muted-foreground/40 underline-offset-[3px] hover:decoration-foreground"
            >
              {t.text}
            </a>
          );
        return null;
      })}
    </>
  );
}

function formatHostname(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
