"use client";

import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { cn } from "@/lib/utils";

export function Avatar({ className, ...props }: React.ComponentProps<typeof AvatarPrimitive.Root>) { return <AvatarPrimitive.Root data-slot="avatar" className={cn("relative flex size-8 shrink-0 overflow-hidden rounded-full border border-[var(--accent-line)] bg-[var(--accent-soft)]", className)} {...props} />; }
export function AvatarImage({ className, ...props }: React.ComponentProps<typeof AvatarPrimitive.Image>) { return <AvatarPrimitive.Image data-slot="avatar-image" className={cn("size-full object-cover", className)} {...props} />; }
export function AvatarFallback({ className, ...props }: React.ComponentProps<typeof AvatarPrimitive.Fallback>) { return <AvatarPrimitive.Fallback data-slot="avatar-fallback" className={cn("grid size-full place-items-center text-[10px] font-bold text-[var(--accent-strong)]", className)} {...props} />; }
