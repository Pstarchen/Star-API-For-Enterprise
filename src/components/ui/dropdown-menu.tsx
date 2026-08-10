"use client";

import * as React from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Check, ChevronRight, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuPortal = DropdownMenuPrimitive.Portal;
export const DropdownMenuGroup = DropdownMenuPrimitive.Group;
export const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;
export const DropdownMenuSub = DropdownMenuPrimitive.Sub;

export function DropdownMenuContent({ className, sideOffset = 6, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) { return <DropdownMenuPrimitive.Portal><DropdownMenuPrimitive.Content sideOffset={sideOffset} data-slot="dropdown-menu-content" className={cn("z-[80] min-w-48 overflow-hidden rounded-[var(--radius-panel)] border border-[var(--line)] bg-[var(--surface)] p-1.5 text-[var(--ink)] shadow-[var(--shadow-lg)] data-[state=open]:animate-[ui-pop-in_150ms_ease-out]", className)} {...props} /></DropdownMenuPrimitive.Portal>; }
export function DropdownMenuItem({ className, inset, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & { inset?: boolean }) { return <DropdownMenuPrimitive.Item data-slot="dropdown-menu-item" className={cn("relative flex h-9 cursor-default select-none items-center gap-2 rounded-[6px] px-2 text-[10px] outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-[var(--surface-subtle)] data-[highlighted]:text-[var(--ink)] [&_svg]:size-3.5 [&_svg]:shrink-0", inset && "pl-8", className)} {...props} />; }
export function DropdownMenuLabel({ className, inset, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Label> & { inset?: boolean }) { return <DropdownMenuPrimitive.Label className={cn("px-2 py-1.5 text-[9px] font-semibold text-[var(--muted)]", inset && "pl-8", className)} {...props} />; }
export function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) { return <DropdownMenuPrimitive.Separator className={cn("-mx-1.5 my-1 h-px bg-[var(--line)]", className)} {...props} />; }
export function DropdownMenuShortcut({ className, ...props }: React.ComponentProps<"span">) { return <span className={cn("ml-auto text-[8px] text-[var(--muted)]", className)} {...props} />; }
export function DropdownMenuCheckboxItem({ className, children, checked, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>) { return <DropdownMenuPrimitive.CheckboxItem className={cn("relative flex h-9 cursor-default select-none items-center rounded-[6px] py-1.5 pl-8 pr-2 text-[10px] outline-none data-[highlighted]:bg-[var(--surface-subtle)]", className)} checked={checked} {...props}><span className="absolute left-2 grid size-4 place-items-center"><DropdownMenuPrimitive.ItemIndicator><Check className="size-3.5" /></DropdownMenuPrimitive.ItemIndicator></span>{children}</DropdownMenuPrimitive.CheckboxItem>; }
export function DropdownMenuRadioItem({ className, children, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem>) { return <DropdownMenuPrimitive.RadioItem className={cn("relative flex h-9 cursor-default select-none items-center rounded-[6px] py-1.5 pl-8 pr-2 text-[10px] outline-none data-[highlighted]:bg-[var(--surface-subtle)]", className)} {...props}><span className="absolute left-2 grid size-4 place-items-center"><DropdownMenuPrimitive.ItemIndicator><Circle className="size-2 fill-current" /></DropdownMenuPrimitive.ItemIndicator></span>{children}</DropdownMenuPrimitive.RadioItem>; }
export function DropdownMenuSubTrigger({ className, inset, children, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.SubTrigger> & { inset?: boolean }) { return <DropdownMenuPrimitive.SubTrigger className={cn("flex h-9 cursor-default select-none items-center rounded-[6px] px-2 text-[10px] outline-none data-[state=open]:bg-[var(--surface-subtle)]", inset && "pl-8", className)} {...props}>{children}<ChevronRight className="ml-auto size-3.5" /></DropdownMenuPrimitive.SubTrigger>; }
export function DropdownMenuSubContent({ className, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.SubContent>) { return <DropdownMenuPrimitive.SubContent className={cn("z-[90] min-w-40 overflow-hidden rounded-[var(--radius-panel)] border border-[var(--line)] bg-[var(--surface)] p-1.5 shadow-[var(--shadow-lg)]", className)} {...props} />; }
