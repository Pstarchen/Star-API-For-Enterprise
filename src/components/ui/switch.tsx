"use client";

import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return <SwitchPrimitive.Root data-slot="switch" className={cn("relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-[var(--line-strong)] bg-[var(--surface-subtle)] p-0.5 outline-none shadow-[inset_0_1px_2px_rgb(35_43_66_/_10%)] transition-[background-color,border-color,box-shadow] duration-200 focus-visible:ring-3 focus-visible:ring-[var(--focus-soft)] data-[state=checked]:border-[var(--brand)] data-[state=checked]:bg-[var(--brand)] data-[state=checked]:shadow-[inset_0_1px_2px_rgb(28_38_105_/_18%)] disabled:cursor-not-allowed disabled:opacity-50", className)} {...props}><SwitchPrimitive.Thumb className="pointer-events-none block size-[18px] translate-x-0 rounded-full border border-white/80 bg-white shadow-[0_2px_6px_rgb(30_37_58_/_24%)] transition-transform duration-200 ease-[cubic-bezier(.2,.8,.2,1)] data-[state=checked]:translate-x-[20px]" /></SwitchPrimitive.Root>;
}
