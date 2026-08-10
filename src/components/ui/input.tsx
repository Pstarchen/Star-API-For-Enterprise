import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return <input type={type} data-slot="input" className={cn("h-10 w-full min-w-0 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-[11px] text-[var(--ink)] shadow-[var(--shadow-inset)] outline-none transition-[border-color,box-shadow,background-color] placeholder:text-[var(--muted-soft)] hover:border-[var(--line-strong)] focus:border-[var(--brand)] focus:ring-3 focus:ring-[var(--focus-soft)] disabled:cursor-not-allowed disabled:bg-[var(--surface-subtle)] disabled:opacity-65", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea data-slot="textarea" className={cn("min-h-24 w-full resize-y rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2.5 text-[11px] leading-5 text-[var(--ink)] shadow-[var(--shadow-inset)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--muted-soft)] hover:border-[var(--line-strong)] focus:border-[var(--brand)] focus:ring-3 focus:ring-[var(--focus-soft)] disabled:cursor-not-allowed disabled:opacity-65", className)} {...props} />;
}

export function InputGroup({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="input-group" className={cn("flex h-10 items-center rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface-raised)] shadow-[var(--shadow-inset)] transition-[border-color,box-shadow] hover:border-[var(--line-strong)] focus-within:border-[var(--brand)] focus-within:ring-3 focus-within:ring-[var(--focus-soft)] [&_[data-slot=input]]:h-full [&_[data-slot=input]]:border-0 [&_[data-slot=input]]:bg-transparent [&_[data-slot=input]]:shadow-none [&_[data-slot=input]]:focus:ring-0", className)} {...props} />;
}
