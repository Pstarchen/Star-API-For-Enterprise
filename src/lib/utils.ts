import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getMethodClass(method: "GET" | "POST") {
  return method === "GET"
    ? "bg-[#e5f1ff] text-[#28609a]"
    : "bg-[var(--brand-soft)] text-[var(--brand-strong)]";
}
