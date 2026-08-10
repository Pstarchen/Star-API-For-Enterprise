"use client";

import { Moon, Sun } from "lucide-react";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export const ThemeToggle = forwardRef<HTMLButtonElement, React.ComponentPropsWithoutRef<"button">>(function ThemeToggle({ className, onClick, ...props }, ref) {
  function toggleTheme() {
    const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.style.colorScheme = nextTheme;
    localStorage.setItem("star-api-theme", nextTheme);
  }

  return <button ref={ref} type="button" className={cn(className)} aria-label="切换深浅色模式" {...props} onClick={(event) => { toggleTheme(); onClick?.(event); }}>
    <Moon className="theme-icon-light size-4" /><Sun className="theme-icon-dark size-4" />
  </button>;
});
