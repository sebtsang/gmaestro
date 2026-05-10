import { NextResponse } from "next/server";
import { CompanyProfileScrapeRequestSchema } from "@/lib/shared/schemas";
import { draftProfileFromScrape } from "@/lib/ingest/draft-profile";
import { scrapeCompanySite } from "@/lib/ingest/scrape";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Synchronous scrape + draft. The whole call fits inside the LLM's 60s
 * budget plus the scraper's 15s budget — no need for the fire-and-forget
 * shape that `/api/runs` uses for multi-minute workflows.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = CompanyProfileScrapeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  let bundle;
  try {
    bundle = await scrapeCompanySite(parsed.data.url);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Scrape failed" },
      { status: 502 },
    );
  }

  const okCount = bundle.pages.filter((p) => p.status === "ok").length;
  if (okCount === 0) {
    return NextResponse.json(
      {
        error:
          "couldn't fetch any usable pages from that URL. The site may require JavaScript or blocks scrapers — fill the form manually instead.",
        bundle,
      },
      { status: 422 },
    );
  }

  let draft;
  try {
    draft = await draftProfileFromScrape(bundle);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? `LLM drafter failed: ${err.message}`
            : "LLM drafter failed",
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    draft: { ...draft, sourceUrl: parsed.data.url },
    bundle: {
      origin: bundle.origin,
      okCount,
      attempted: bundle.pages.length,
    },
  });
}
