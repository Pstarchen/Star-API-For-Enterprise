import * as React from "react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({ icon: Icon = Inbox, title, description, action, className }: { icon?: React.ComponentType<{ className?: string }>; title: string; description?: string; action?: React.ReactNode; className?: string }) {
  return <div data-slot="empty-state" className={cn("grid min-h-52 place-items-center px-6 py-10 text-center", className)}><div className="max-w-sm"><span className="mx-auto grid size-10 place-items-center rounded-[var(--radius-panel)] border border-[var(--brand-line)] bg-[var(--brand-soft)] text-[var(--brand)]"><Icon className="size-4" /></span><strong className="mt-3 block text-sm text-[var(--ink)]">{title}</strong>{description && <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{description}</p>}{action && <div className="mt-4 flex justify-center">{action}</div>}</div></div>;
}
