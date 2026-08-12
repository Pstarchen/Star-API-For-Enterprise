import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getMethodClass(method: string) {
  if (method.includes("GET") && method.includes("POST")) return "bg-[var(--aqua-soft)] text-[var(--aqua)]";
  if (method === "GET") return "bg-[#e5f1ff] text-[#28609a]";
  if (method === "DELETE") return "bg-[var(--danger-soft)] text-[var(--danger)]";
  if (method === "PUT" || method === "PATCH") return "bg-[var(--warning-soft)] text-[var(--warning)]";
  return "bg-[var(--brand-soft)] text-[var(--brand-strong)]";
}
