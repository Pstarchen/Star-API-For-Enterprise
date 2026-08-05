"use client";

import { Moon, Sun } from "lucide-react";

export function ThemeToggle({ className = "" }: { className?: string }) {
  function toggleTheme() {
    const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.style.colorScheme = nextTheme;
    localStorage.setItem("star-api-theme", nextTheme);
  }

  return <button type="button" onClick={toggleTheme} className={className} aria-label="切换深浅色模式" title="切换深浅色模式">
    <Moon className="theme-icon-light size-4" /><Sun className="theme-icon-dark size-4" />
  </button>;
}
