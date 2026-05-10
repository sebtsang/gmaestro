"use client";

import { useCallback, useEffect, useState } from "react";
import { makeMockCompanyProfile } from "@/lib/shared/mocks";
import {
  REQUIRED_COMPANY_PROFILE_FIELDS,
  type CompanyProfile,
} from "@/lib/shared/types";
import { MOCK_MODE } from "@/lib/ui/hooks/use-mock-driver";

interface WirePayload {
  profile:
    | (Omit<CompanyProfile, "createdAt" | "updatedAt"> & {
        createdAt: string;
        updatedAt: string;
      })
    | null;
}

function hydrate(payload: WirePayload): CompanyProfile | null {
  if (!payload.profile) return null;
  return {
    ...payload.profile,
    createdAt: new Date(payload.profile.createdAt),
    updatedAt: new Date(payload.profile.updatedAt),
  };
}

export function isProfileComplete(profile: CompanyProfile | null): boolean {
  if (!profile) return false;
  for (const f of REQUIRED_COMPANY_PROFILE_FIELDS) {
    const v = profile[f];
    if (typeof v !== "string" || v.trim().length === 0) return false;
  }
  return true;
}

export function missingRequiredFields(
  profile: CompanyProfile | null,
): ReadonlyArray<(typeof REQUIRED_COMPANY_PROFILE_FIELDS)[number]> {
  return REQUIRED_COMPANY_PROFILE_FIELDS.filter((f) => {
    const v = profile?.[f];
    return typeof v !== "string" || v.trim().length === 0;
  });
}

export function useCompanyProfile() {
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (MOCK_MODE) {
      setProfile(makeMockCompanyProfile());
      setLoading(false);
      return;
    }
    try {
      const res = await fetch("/api/company-profile", { signal });
      if (!res.ok) throw new Error(`GET /api/company-profile → ${res.status}`);
      const data = (await res.json()) as WirePayload;
      if (signal?.aborted) return;
      setProfile(hydrate(data));
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      console.error("[useCompanyProfile] fetch failed:", err);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    void load(ac.signal);
    return () => ac.abort();
  }, [load]);

  return { profile, loading, reload: () => load() };
}
