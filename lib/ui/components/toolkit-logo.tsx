"use client";

import { useState } from "react";
import { Plug } from "lucide-react";
import { TOOLKIT_LOGO_URL } from "@/lib/ui/components/connection-meta";

const LINKEDIN_PATH =
  "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z";

function LinkedInLogo({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d={LINKEDIN_PATH} fill="#0A66C2" />
    </svg>
  );
}

const INLINE_LOGOS: Record<string, (props: { className: string }) => React.JSX.Element> = {
  LINKEDIN: LinkedInLogo,
};

interface ToolkitLogoProps {
  toolkit: string;
  name?: string;
  size: "sm" | "md";
  fallback?: "plug" | "none";
}

export function ToolkitLogo({ toolkit, name, size, fallback = "none" }: ToolkitLogoProps) {
  const [failed, setFailed] = useState(false);
  const className = size === "sm" ? "size-4" : "size-6";
  const px = size === "sm" ? 16 : 24;

  const Inline = INLINE_LOGOS[toolkit];
  if (Inline) return <Inline className={className} />;

  const src = TOOLKIT_LOGO_URL[toolkit];
  if (!src || failed) {
    return fallback === "plug" ? (
      <Plug className={`${className} text-muted-foreground`} />
    ) : null;
  }

  return (
    <img
      src={src}
      alt={name ?? ""}
      width={px}
      height={px}
      className={size === "sm" ? "size-4 object-contain" : "size-6"}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
