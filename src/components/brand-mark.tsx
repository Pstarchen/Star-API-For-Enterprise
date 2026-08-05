"use client";

import Image from "next/image";
import Link from "next/link";
import { platformIconUrl } from "@/lib/platform";
import { useBranding } from "./branding-provider";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  const branding = useBranding();
  return (
    <Link href="/" className="inline-flex min-w-0 items-center gap-2.5" aria-label={`${branding.name} 首页`}>
      <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-[5px] bg-[var(--brand)] text-white shadow-sm">
        {branding.hasCustomIcon ? <Image src={platformIconUrl(branding)} alt="" width={32} height={32} unoptimized className="size-full object-cover" /> : <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
          <path d="M5 7.5h7.5M11.5 16.5H19M8 5v5M16 14v5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <circle cx="16" cy="7.5" r="2.5" fill="currentColor" />
          <circle cx="8" cy="16.5" r="2.5" fill="currentColor" />
        </svg>}
      </span>
      {!compact && (
        <span className="flex min-w-0 items-baseline gap-1.5">
          <strong className="max-w-40 truncate text-[17px] font-bold text-[var(--ink)]">{branding.name}</strong>
          <span className="mono text-[11px] font-semibold text-[var(--muted)]">API HUB</span>
        </span>
      )}
    </Link>
  );
}
