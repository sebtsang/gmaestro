"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  makeMockCompanyContext,
  makeMockGtmLiveCounts,
} from "@/lib/shared/mocks";
import type { CompanyContext, GtmMetric } from "@/lib/shared/types";
import { MOCK_MODE } from "@/lib/ui/hooks/use-mock-driver";

export type LiveCounts = Record<GtmMetric, number>;

interface WirePayload {
  context: (Omit<CompanyContext, "updatedAt"> & { updatedAt: string }) | null;
  liveCounts: LiveCounts;
}

interface RefreshPayload {
  proposed: Omit<CompanyContext, "updatedAt"> & { updatedAt: string };
}

interface State {
  context: CompanyContext | null;
  liveCounts: LiveCounts;
}

const ZERO_COUNTS: LiveCounts = {
  demos_booked: 0,
  qualified_hot_leads: 0,
  outreach_sent: 0,
};

function hydrate(payload: WirePayload): State {
  return {
    context: payload.context
      ? { ...payload.context, updatedAt: new Date(payload.context.updatedAt) }
      : null,
    liveCounts: payload.liveCounts,
  };
}

export function useCompanyContext() {
  const [{ context, liveCounts }, setState] = useState<State>({
    context: null,
    liveCounts: ZERO_COUNTS,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (MOCK_MODE) {
      setState({
        context: makeMockCompanyContext(),
        liveCounts: makeMockGtmLiveCounts(),
      });
      setLoading(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/context");
        if (!res.ok) throw new Error(`GET /api/context → ${res.status}`);
        const data = (await res.json()) as WirePayload;
        if (cancelled) return;
        setState(hydrate(data));
      } catch (err) {
        console.error("[useCompanyContext] fetch failed:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback(
    async (next: Omit<CompanyContext, "userId" | "updatedAt">) => {
      if (MOCK_MODE) {
        const merged = makeMockCompanyContext(next);
        setState((s) => ({ ...s, context: merged }));
        toast.success("Company context saved (mock)");
        return merged;
      }
      const res = await fetch("/api/context", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => res.statusText);
        toast.error(`Save failed: ${msg}`);
        throw new Error(msg || `PUT /api/context → ${res.status}`);
      }
      const data = (await res.json()) as WirePayload;
      const hydrated = hydrate(data);
      setState(hydrated);
      toast.success("Company context saved");
      return hydrated.context!;
    },
    [],
  );

  const refresh = useCallback(async (): Promise<CompanyContext | null> => {
    if (MOCK_MODE) {
      toast.info("AI proposed updates (mock)");
      return makeMockCompanyContext({
        companyOverview:
          makeMockCompanyContext().companyOverview + " (refreshed mock)",
      });
    }
    setRefreshing(true);
    try {
      const res = await fetch("/api/context/refresh", { method: "POST" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        toast.error(`AI refresh failed: ${data.message ?? res.statusText}`);
        return null;
      }
      const { proposed } = (await res.json()) as RefreshPayload;
      toast.info("AI proposed updates — review and save");
      return { ...proposed, updatedAt: new Date(proposed.updatedAt) };
    } catch (err) {
      toast.error(`AI refresh failed: ${(err as Error).message}`);
      return null;
    } finally {
      setRefreshing(false);
    }
  }, []);

  return { context, liveCounts, loading, refreshing, save, refresh };
}
