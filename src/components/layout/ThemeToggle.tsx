import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { cn } from "@/lib/utils";

// Só o ícone (lua/sol), no canto superior direito: sobre o verde do
// cabeçalho no celular ("cabecalho") ou sobre o fundo da página no
// computador ("pagina").
export function ThemeToggle({ variante = "cabecalho" }: { variante?: "cabecalho" | "pagina" }) {
  const { theme, setTheme } = useTheme();
  const nextTheme = theme === "light" ? "dark" : "light";
  const Icon = theme === "light" ? Moon : Sun;
  const rotulo = `Ativar tema ${nextTheme === "dark" ? "escuro" : "claro"}`;

  return (
    <button
      type="button"
      onClick={() => setTheme(nextTheme)}
      aria-label={rotulo}
      title={rotulo}
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-full transition-colors",
        variante === "cabecalho"
          ? "text-creme/90 hover:bg-verde-600 hover:text-creme"
          : "border border-linha bg-superficie text-verde shadow-sm hover:border-amarelo",
      )}
    >
      <Icon className="size-5" />
    </button>
  );
}
