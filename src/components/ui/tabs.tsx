"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) { return <TabsPrimitive.Root data-slot="tabs" className={cn("flex flex-col gap-4", className)} {...props} />; }
export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) { return <TabsPrimitive.List data-slot="tabs-list" className={cn("inline-flex min-h-10 w-fit items-center rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface-subtle)] p-1", className)} {...props} />; }
export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) { return <TabsPrimitive.Trigger data-slot="tabs-trigger" className={cn("inline-flex h-8 items-center justify-center gap-2 rounded-[6px] px-3 text-xs font-semibold text-[var(--muted)] outline-none transition hover:text-[var(--ink)] focus-visible:ring-3 focus-visible:ring-[var(--focus-soft)] data-[state=active]:bg-[var(--surface-raised)] data-[state=active]:text-[var(--ink)] data-[state=active]:shadow-[var(--shadow-xs)]", className)} {...props} />; }
export function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) { return <TabsPrimitive.Content data-slot="tabs-content" className={cn("outline-none", className)} {...props} />; }
