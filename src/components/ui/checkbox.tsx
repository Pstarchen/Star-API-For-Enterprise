"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return <CheckboxPrimitive.Root data-slot="checkbox" className={cn("peer grid size-4 shrink-0 place-items-center rounded-[4px] border border-[var(--line-strong)] bg-[var(--surface-raised)] text-white outline-none transition focus-visible:ring-3 focus-visible:ring-[var(--focus-soft)] data-[state=checked]:border-[var(--brand)] data-[state=checked]:bg-[var(--brand)] disabled:opacity-50", className)} {...props}><CheckboxPrimitive.Indicator><Check className="size-3" strokeWidth={2.5} /></CheckboxPrimitive.Indicator></CheckboxPrimitive.Root>;
}
