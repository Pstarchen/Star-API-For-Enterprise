import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 text-[11px] font-semibold", {
  variants: {
    variant: {
      neutral: "border-[var(--line)] bg-[var(--surface-subtle)] text-[var(--muted)]",
      brand: "border-[var(--brand-line)] bg-[var(--brand-soft)] text-[var(--brand-strong)]",
      accent: "border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent-strong)]",
      success: "border-[var(--success-line)] bg-[var(--success-soft)] text-[var(--success)]",
      warning: "border-[var(--warning-line)] bg-[var(--warning-soft)] text-[var(--warning)]",
      danger: "border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger)]",
      outline: "border-[var(--line-strong)] bg-transparent text-[var(--ink)]",
    },
  },
  defaultVariants: { variant: "neutral" },
});

export function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}
