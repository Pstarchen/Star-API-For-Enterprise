import * as React from "react";
import { cn } from "@/lib/utils";

export function FormField({ className, ...props }: React.ComponentProps<"label">) {
  return <label data-slot="form-field" className={cn("block space-y-1.5", className)} {...props} />;
}

export function FormLabel({ className, ...props }: React.ComponentProps<"span">) {
  return <span data-slot="form-label" className={cn("block text-[10px] font-semibold text-[var(--ink)]", className)} {...props} />;
}

export function FormHint({ className, ...props }: React.ComponentProps<"span">) {
  return <span data-slot="form-hint" className={cn("block text-[9px] leading-4 text-[var(--muted)]", className)} {...props} />;
}

export function FormMessage({ className, tone = "error", ...props }: React.ComponentProps<"p"> & { tone?: "error" | "success" | "info" }) {
  const tones = { error: "border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger)]", success: "border-[var(--success-line)] bg-[var(--success-soft)] text-[var(--success)]", info: "border-[var(--brand-line)] bg-[var(--brand-soft)] text-[var(--brand-strong)]" };
  return <p role={tone === "error" ? "alert" : "status"} data-slot="form-message" className={cn("rounded-[var(--radius-control)] border px-3 py-2.5 text-[10px] leading-5", tones[tone], className)} {...props} />;
}
