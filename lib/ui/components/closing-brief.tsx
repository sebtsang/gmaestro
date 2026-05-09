"use client";

import {
  CalendarCheck,
  ExternalLink,
  HelpCircle,
  Lightbulb,
  ListChecks,
  MessageCircleQuestion,
  Quote,
  ShieldAlert,
  Building2,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { PrepBrief } from "@/lib/shared/types";

interface ClosingBriefProps {
  brief: PrepBrief;
}

interface SectionDef {
  title: string;
  icon: typeof Lightbulb;
  content: React.ReactNode;
}

export function ClosingBrief({ brief }: ClosingBriefProps) {
  const sections: SectionDef[] = [
    {
      title: "Lead summary",
      icon: Building2,
      content: <p className="text-sm">{brief.leadSummary}</p>,
    },
    {
      title: "Company context",
      icon: Building2,
      content: <p className="text-sm">{brief.companyContext}</p>,
    },
    {
      title: "Likely use case",
      icon: Lightbulb,
      content: <p className="text-sm">{brief.likelyUseCase}</p>,
    },
    {
      title: "Talking points",
      icon: ListChecks,
      content: <BulletList items={brief.talkingPoints} />,
    },
    {
      title: "Questions to ask",
      icon: HelpCircle,
      content: <BulletList items={brief.questionsToAsk} />,
    },
    {
      title: "Potential objections",
      icon: ShieldAlert,
      content: <BulletList items={brief.potentialObjections} />,
    },
    {
      title: "Recommended next steps",
      icon: CalendarCheck,
      content: <BulletList items={brief.recommendedNextSteps} />,
    },
  ];

  return (
    <Card className="gap-0 p-0">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <div className="text-sm font-medium">Closing brief</div>
          <div className="text-xs text-muted-foreground">
            Generated for the upcoming meeting
          </div>
        </div>
        <a
          href={brief.notionPageUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          <ExternalLink />
          Open in Notion
        </a>
      </div>

      <Tabs defaultValue="brief" className="px-5 py-4">
        <TabsList>
          <TabsTrigger value="brief">Brief</TabsTrigger>
          <TabsTrigger value="similar">Similar prior emails</TabsTrigger>
        </TabsList>

        <TabsContent value="brief" className="mt-4 grid gap-3">
          {sections.map(({ title, icon: Icon, content }) => (
            <div
              key={title}
              className="rounded-xl border border-border bg-muted/20 p-4"
            >
              <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Icon className="size-3" />
                {title}
              </div>
              {content}
            </div>
          ))}
        </TabsContent>

        <TabsContent value="similar" className="mt-4">
          {brief.similarPriorEmails.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
              No similar prior emails found.
            </div>
          ) : (
            <ul className="grid gap-3">
              {brief.similarPriorEmails.map((sample, i) => (
                <li
                  key={i}
                  className="rounded-xl border border-border bg-muted/20 p-4"
                >
                  <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <MessageCircleQuestion className="size-3" />
                    Sample {i + 1}
                  </div>
                  <Quote className="mb-1 size-3 text-muted-foreground" />
                  <p className="text-sm leading-6">{sample}</p>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </Card>
  );
}

function BulletList({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground italic">— none —</p>;
  }
  return (
    <ul className="grid gap-1.5 text-sm">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2">
          <span className="mt-1 size-1.5 shrink-0 rounded-full bg-foreground/40" />
          <span className="leading-6">{item}</span>
        </li>
      ))}
    </ul>
  );
}
