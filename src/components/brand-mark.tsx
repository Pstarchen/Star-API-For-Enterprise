import Link from "next/link";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="inline-flex items-center gap-2.5" aria-label="星枢 API 首页">
      <span className="grid size-8 place-items-center rounded-[5px] bg-[var(--brand)] text-white shadow-sm">
        <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
          <path d="M5 7.5h7.5M11.5 16.5H19M8 5v5M16 14v5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <circle cx="16" cy="7.5" r="2.5" fill="currentColor" />
          <circle cx="8" cy="16.5" r="2.5" fill="currentColor" />
        </svg>
      </span>
      {!compact && (
        <span className="flex items-baseline gap-1.5">
          <strong className="text-[17px] font-bold text-[var(--ink)]">星枢</strong>
          <span className="mono text-[11px] font-semibold text-[var(--muted)]">API HUB</span>
        </span>
      )}
    </Link>
  );
}
