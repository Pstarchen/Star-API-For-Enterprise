"use client";

import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return <SwitchPrimitive.Root data-slot="switch" className={cn("relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border border-[var(--line-strong)] bg-[var(--surface-subtle)] outline-none transition-colors focus-visible:ring-3 focus-visible:ring-[var(--focus-soft)] data-[state=checked]:border-[var(--brand)] data-[state=checked]:bg-[var(--brand)] disabled:cursor-not-allowed disabled:opacity-50", className)} {...props}><SwitchPrimitive.Thumb className="pointer-events-none block size-4 translate-x-0 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-4" /></SwitchPrimitive.Root>;
}
