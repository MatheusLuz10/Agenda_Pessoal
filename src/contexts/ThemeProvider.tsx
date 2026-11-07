import { useEffect, useState, type ReactNode } from "react";
import { ThemeContext, type AppTheme } from "@/contexts/ThemeContext";

const THEME_STORAGE_KEY = "agenda-theme";

function getSavedTheme(): AppTheme {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch (error) {
    console.error("Não foi possível ler o tema salvo:", error);
    return "light";
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<AppTheme>(getSavedTheme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;

    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch (error) {
      console.error("Não foi possível salvar o tema:", error);
    }
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}
