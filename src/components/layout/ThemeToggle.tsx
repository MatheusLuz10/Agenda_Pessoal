import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { cn } from "@/lib/utils";

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme();
  const nextTheme = theme === "light" ? "dark" : "light";
  const Icon = theme === "light" ? Moon : Sun;

  return (
    <button
      type="button"
      onClick={() => setTheme(nextTheme)}
      aria-label={`Ativar tema ${nextTheme === "dark" ? "escuro" : "claro"}`}
      title={`Ativar tema ${nextTheme === "dark" ? "escuro" : "claro"}`}
      className={cn(
        "flex items-center justify-center gap-2 rounded-xl text-sm font-medium transition-colors",
        compact
          ? "size-10 text-creme/90 hover:bg-verde-600 hover:text-creme"
          : "h-10 w-full px-3 text-creme/85 hover:bg-verde-600 hover:text-creme",
      )}
    >
      <Icon className="size-4" />
      {!compact && (theme === "light" ? "Tema escuro" : "Tema claro")}
    </button>
  );
}
