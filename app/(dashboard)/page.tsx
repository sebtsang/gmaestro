"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PromptInput } from "@/lib/ui/components/prompt-input";
import { RecentRunsList } from "@/lib/ui/components/recent-runs-list";
import { ResumePill } from "@/lib/ui/components/resume-pill";

const Hero = (
  <div className="px-1 pb-1">
    <h1 className="text-6xl tracking-tight font-[family-name:var(--font-space-grotesk)]">
      GMaestro{" "}
      <span className="text-muted-foreground">- GStack for GTM</span>
    </h1>
    <p className="mt-1 text-sm text-muted-foreground">
      You → Conductor → 4 managers → 13 specialists across 45 integrations.{" "}
      <em>A real chain of command.</em>
    </p>
  </div>
);

export default function DashboardPage() {
  const router = useRouter();

  const handleRunStarted = (id: string, _prompt: string) => {
    void _prompt;
    router.push(`/runs/${id}`);
  };

  return (
    <div className="mx-auto flex min-h-[calc(100vh-9rem)] w-full max-w-3xl flex-col justify-start gap-20 pt-32">
      <Suspense fallback={null}>
        <DeepLinkRedirect />
      </Suspense>
      {Hero}
      <div className="flex flex-col items-start gap-3">
        <ResumePill />
        <div className="w-full">
          <PromptInput onRunStarted={handleRunStarted} />
        </div>
        <RecentRunsList />
      </div>
    </div>
  );
}

/**
 * Back-compat: `/?runId=<id>` redirects to the canonical `/runs/<id>`
 * so smoke scripts and bookmarks keep working after the move to URL-keyed
 * runs.
 */
function DeepLinkRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  useEffect(() => {
    const id = searchParams.get("runId");
    if (id) router.replace(`/runs/${id}`);
  }, [router, searchParams]);
  return null;
}
