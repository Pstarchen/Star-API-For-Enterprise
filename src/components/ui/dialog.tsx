"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({ className, children, showClose = true, ...props }: React.ComponentProps<typeof DialogPrimitive.Content> & { showClose?: boolean }) {
  return <DialogPrimitive.Portal><DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#101321]/55 backdrop-blur-[3px] data-[state=open]:animate-[ui-fade-in_160ms_ease-out]" /><DialogPrimitive.Content data-slot="dialog-content" className={cn("fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-32px)] w-[min(calc(100%-24px),640px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[var(--radius-panel)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-lg)] outline-none data-[state=open]:animate-[ui-dialog-in_180ms_ease-out]", className)} {...props}>{children}{showClose && <DialogPrimitive.Close className="absolute right-3 top-3 grid size-10 place-items-center rounded-[var(--radius-control)] text-[var(--muted)] transition hover:bg-[var(--surface-subtle)] hover:text-[var(--ink)] lg:size-8" aria-label="关闭"><X className="size-4" /></DialogPrimitive.Close>}</DialogPrimitive.Content></DialogPrimitive.Portal>;
}

export function DialogHeader({ className, ...props }: React.ComponentProps<"div">) { return <div data-slot="dialog-header" className={cn("border-b border-[var(--line)] px-5 py-4 pr-12", className)} {...props} />; }
export function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) { return <DialogPrimitive.Title data-slot="dialog-title" className={cn("text-[15px] font-bold text-[var(--ink)]", className)} {...props} />; }
export function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) { return <DialogPrimitive.Description data-slot="dialog-description" className={cn("mt-1 text-xs leading-5 text-[var(--muted)]", className)} {...props} />; }
export function DialogBody({ className, ...props }: React.ComponentProps<"div">) { return <div data-slot="dialog-body" className={cn("p-5", className)} {...props} />; }
export function DialogFooter({ className, ...props }: React.ComponentProps<"div">) { return <div data-slot="dialog-footer" className={cn("flex flex-col-reverse gap-2 border-t border-[var(--line)] bg-[var(--surface-subtle)] px-5 py-3 sm:flex-row sm:justify-end", className)} {...props} />; }
