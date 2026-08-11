import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.ComponentProps<"section">) { return <section data-slot="card" className={cn("rounded-[var(--radius-panel)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-xs)]", className)} {...props} />; }
export function CardHeader({ className, ...props }: React.ComponentProps<"div">) { return <div data-slot="card-header" className={cn("flex items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-4", className)} {...props} />; }
export function CardTitle({ className, ...props }: React.ComponentProps<"h3">) { return <h3 data-slot="card-title" className={cn("text-[15px] font-bold text-[var(--ink)]", className)} {...props} />; }
export function CardDescription({ className, ...props }: React.ComponentProps<"p">) { return <p data-slot="card-description" className={cn("mt-1 text-[13px] leading-5 text-[var(--muted)]", className)} {...props} />; }
export function CardContent({ className, ...props }: React.ComponentProps<"div">) { return <div data-slot="card-content" className={cn("p-5", className)} {...props} />; }
export function CardFooter({ className, ...props }: React.ComponentProps<"div">) { return <div data-slot="card-footer" className={cn("flex items-center gap-2 border-t border-[var(--line)] px-5 py-3", className)} {...props} />; }
