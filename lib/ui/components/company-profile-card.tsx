"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AlertCircle,
  Building2,
  ChevronDown,
  CircleCheck,
  ExternalLink,
  Globe2,
  PencilLine,
  Quote,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import type { CompanyProfile } from "@/lib/shared/types";
import { cn } from "@/lib/utils";
import {
  isProfileComplete,
  missingRequiredFields,
  useCompanyProfile,
} from "@/lib/ui/hooks/use-company-profile";

const SETTINGS_HREF = "/settings/company";

const FIELD_LABEL: Record<string, string> = {
  companyName: "company name",
  oneLiner: "one-liner",
  productDescription: "product description",
  icp: "ICP",
};

export function CompanyProfileCard() {
  const { profile, loading } = useCompanyProfile();
  const [open, setOpen] = useState(false);

  if (loading) return null;

  const complete = isProfileComplete(profile);
  const missing = missingRequiredFields(profile);
  const summary = profile?.companyName
    ? `${profile.companyName}${profile.oneLiner ? ` — ${profile.oneLiner}` : ""}`
    : "Set up your company profile";
  const truncatedSummary =
    summary.length > 96 ? `${summary.slice(0, 93)}…` : summary;

  return (
    <Card size="sm" className="w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/40"
      >
        <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate text-sm font-medium">{truncatedSummary}</span>
        <CompletenessBadge complete={complete} missing={missing.length} />
        <ChevronDown
          className={cn(
            "ml-1 size-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
            !open && "-rotate-90",
          )}
        />
      </button>

      {open && (
        <>
          <div className="mx-3 border-t border-border/60" />
          <CardContent className="grid gap-4 pb-3 pt-2">
            {!complete && (
              <IncompleteBanner missing={missing.map((m) => FIELD_LABEL[m] ?? m)} />
            )}
            {profile ? (
              <ProfileBody profile={profile} />
            ) : (
              <p className="text-sm text-muted-foreground">
                Tell your agents who you are and who you sell to. They&apos;ll
                anchor every reasoning step to it.
              </p>
            )}
          </CardContent>
          <CardFooter className="justify-between gap-2 py-2">
            <span className="text-[11px] text-muted-foreground">
              {profile?.updatedAt
                ? `Updated ${profile.updatedAt.toLocaleString()}`
                : "Not configured"}
            </span>
            <Link
              href={SETTINGS_HREF}
              className={cn(
                buttonVariants({ variant: "default", size: "sm" }),
                "gap-1.5",
              )}
            >
              <PencilLine className="size-3.5" />
              {complete ? "Edit in settings" : "Open settings"}
            </Link>
          </CardFooter>
        </>
      )}
    </Card>
  );
}

function CompletenessBadge({
  complete,
  missing,
}: {
  complete: boolean;
  missing: number;
}) {
  if (complete) {
    return (
      <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
        <CircleCheck className="size-2.5" />
        complete
      </span>
    );
  }
  return (
    <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
      <AlertCircle className="size-2.5" />
      {missing > 0 ? `${missing} missing` : "incomplete"}
    </span>
  );
}

function IncompleteBanner({ missing }: { missing: string[] }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-2.5 text-xs">
      <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="grid gap-1 text-amber-700 dark:text-amber-300">
        <span className="font-medium">
          Workflow runs are blocked until your profile is filled.
        </span>
        {missing.length > 0 && (
          <span>
            Still missing: <span className="font-medium">{missing.join(", ")}</span>.
          </span>
        )}
        <span>
          Personas need this to score leads, pick angles, and draft in your voice.
        </span>
      </div>
    </div>
  );
}

function ProfileBody({ profile }: { profile: CompanyProfile }) {
  return (
    <div className="grid gap-3">
      {profile.oneLiner && (
        <Section icon={Quote} label="One-liner">
          <p className="text-sm leading-relaxed">{profile.oneLiner}</p>
        </Section>
      )}

      {profile.productDescription && (
        <Section icon={Sparkles} label="Product">
          <Clamped text={profile.productDescription} />
        </Section>
      )}

      {profile.icp && (
        <Section icon={Users} label="ICP">
          <Clamped text={profile.icp} />
        </Section>
      )}

      {profile.positioning && (
        <Section icon={Target} label="Positioning">
          <Clamped text={profile.positioning} />
        </Section>
      )}

      {profile.valueProps && profile.valueProps.length > 0 && (
        <Section icon={Sparkles} label="Value props">
          <ul className="grid list-disc gap-0.5 pl-4 text-sm">
            {profile.valueProps.map((vp, i) => (
              <li key={`${i}-${vp}`}>{vp}</li>
            ))}
          </ul>
        </Section>
      )}

      {profile.competitors && profile.competitors.length > 0 && (
        <Section icon={Target} label="Competitors">
          <div className="flex flex-wrap gap-1.5">
            {profile.competitors.map((c) => (
              <Badge key={c} variant="outline" className="text-[11px]">
                {c}
              </Badge>
            ))}
          </div>
        </Section>
      )}

      {profile.voiceTone && (
        <Section icon={Quote} label="Voice / tone">
          <Clamped text={profile.voiceTone} />
        </Section>
      )}

      {profile.sourceUrl && (
        <Section icon={Globe2} label="Source">
          <a
            href={profile.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-primary underline-offset-2 hover:underline"
          >
            {profile.sourceUrl}
            <ExternalLink className="size-3" />
          </a>
        </Section>
      )}
    </div>
  );
}

function Section({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-1">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3" />
        {label}
      </div>
      {children}
    </section>
  );
}

function Clamped({ text }: { text: string }) {
  // Long fields (productDescription/icp/positioning can be ~2-4k chars) —
  // tap to toggle; default-clamped so the card stays scannable.
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 280;
  if (!isLong) {
    return <p className="whitespace-pre-wrap text-sm leading-relaxed">{text}</p>;
  }
  return (
    <div className="grid gap-1">
      <p
        className={cn(
          "whitespace-pre-wrap text-sm leading-relaxed",
          !expanded && "line-clamp-4",
        )}
      >
        {text}
      </p>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="text-left text-[11px] font-medium text-muted-foreground hover:text-foreground"
      >
        {expanded ? "Show less" : "Show more"}
      </button>
    </div>
  );
}
