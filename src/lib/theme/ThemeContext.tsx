"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    let inicial: Theme = "light";
    try {
      const salvo = window.localStorage.getItem("portal-repasse-theme");
      if (salvo === "dark" || salvo === "light") {
        inicial = salvo;
      } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
        inicial = "dark";
      }
    } catch {
      // localStorage indisponível (modo privado etc.) — mantém o padrão claro.
    }
    setTheme(inicial);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    try {
      window.localStorage.setItem("portal-repasse-theme", theme);
    } catch {
      // ignora falha de storage
    }
  }, [theme]);

  return (
    <ThemeContext.Provider
      value={{ theme, toggleTheme: () => setTheme((t) => (t === "light" ? "dark" : "light")) }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme precisa estar dentro de <ThemeProvider>");
  return ctx;
}
