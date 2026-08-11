import * as React from "react";
import { cn } from "@/lib/utils";

export function TableContainer({ className, ...props }: React.ComponentProps<"div">) { return <div data-slot="table-container" className={cn("w-full overflow-x-auto", className)} {...props} />; }
export function Table({ className, ...props }: React.ComponentProps<"table">) { return <table data-slot="table" className={cn("w-full caption-bottom text-left text-xs", className)} {...props} />; }
export function TableHeader({ className, ...props }: React.ComponentProps<"thead">) { return <thead data-slot="table-header" className={cn("border-b border-[var(--line)] bg-[var(--surface-subtle)] text-[var(--muted)]", className)} {...props} />; }
export function TableBody({ className, ...props }: React.ComponentProps<"tbody">) { return <tbody data-slot="table-body" className={cn("divide-y divide-[var(--line)]", className)} {...props} />; }
export function TableRow({ className, ...props }: React.ComponentProps<"tr">) { return <tr data-slot="table-row" className={cn("transition-colors hover:bg-[var(--surface-hover)]", className)} {...props} />; }
export function TableHead({ className, ...props }: React.ComponentProps<"th">) { return <th data-slot="table-head" className={cn("h-10 whitespace-nowrap px-5 text-[11px] font-semibold", className)} {...props} />; }
export function TableCell({ className, ...props }: React.ComponentProps<"td">) { return <td data-slot="table-cell" className={cn("whitespace-nowrap px-5 py-3.5 align-middle", className)} {...props} />; }
export function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) { return <tfoot data-slot="table-footer" className={cn("border-t border-[var(--line)] bg-[var(--surface-subtle)] font-medium", className)} {...props} />; }
