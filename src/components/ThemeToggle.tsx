"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme/ThemeContext";
import { cn } from "@/lib/utils/cn";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={theme === "light" ? "Ativar modo escuro" : "Ativar modo claro"}
      title={theme === "light" ? "Modo escuro" : "Modo claro"}
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-md border border-border",
        "bg-surface text-ink-secondary transition-colors hover:bg-surface-soft",
        "dark:border-white/15 dark:bg-[#1B1E17] dark:text-white/80 dark:hover:bg-white/5",
        className
      )}
    >
      {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
    </button>
  );
}
