"use client";

import Image from "next/image";
import Link from "next/link";
import { Waypoints } from "lucide-react";
import { platformIconUrl } from "@/lib/platform";
import { useBranding } from "./branding-provider";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  const branding = useBranding();
  return (
    <Link href="/" className="inline-flex min-w-0 items-center gap-2.5" aria-label={`${branding.name} 首页`}>
      <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-[7px] bg-[var(--brand)] text-white shadow-[var(--shadow-brand)]">
        {branding.hasCustomIcon ? <Image src={platformIconUrl(branding)} alt="" width={32} height={32} unoptimized className="size-full object-cover" /> : <Waypoints className="size-5" strokeWidth={2.1} />}
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
