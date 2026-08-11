"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export function TooltipContent({ className, sideOffset = 7, ...props }: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return <TooltipPrimitive.Portal><TooltipPrimitive.Content sideOffset={sideOffset} data-slot="tooltip-content" className={cn("z-[100] max-w-64 rounded-[6px] border border-white/10 bg-[var(--night)] px-2.5 py-1.5 text-[11px] leading-4 text-white shadow-[var(--shadow-lg)] data-[state=delayed-open]:animate-[ui-fade-in_140ms_ease-out]", className)} {...props} /></TooltipPrimitive.Portal>;
}
