"use client";

import { useTimeZone } from "@/components/time-zone-provider";
import { formatUserDate } from "@/lib/timezone";

export function LocalTime({ value, dateOnly = false, options, fallback = "-", className }: { value: string | number | Date; dateOnly?: boolean; options?: Intl.DateTimeFormatOptions; fallback?: string; className?: string }) {
  const timeZone = useTimeZone();
  const date = value instanceof Date ? value : new Date(value);
  const formatted = formatUserDate(date, timeZone, dateOnly, options);
  if (!formatted) return <>{fallback}</>;
  return <time dateTime={date.toISOString()} className={className}>{formatted}</time>;
}
