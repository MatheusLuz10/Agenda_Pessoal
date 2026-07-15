import { useEffect, useState } from "react";
import { Lightbulb, LogOut, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { isSupabaseConfigured } from "@/lib/supabaseClient";

// Cabeçalho fixo no topo, presente em todas as páginas (renderizado pelo
// AppLayout). Contém a logo e o alternador de tema claro/escuro.
export function Header() {
  const [darkMode, setDarkMode] = useState(false);
  const { signOut } = useAuth();

  // Ao montar o componente, decide o tema inicial: usa o que foi salvo
  // antes no localStorage ou, na primeira visita, segue a preferência do
  // sistema operacional do usuário (prefers-color-scheme).
  useEffect(() => {
    const storedTheme = localStorage.getItem("theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = storedTheme ? storedTheme === "dark" : prefersDark;

    setDarkMode(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  // Sempre que `darkMode` mudar (ex: usuário clicou no botão), aplica a
  // classe "dark" no <html> (o Tailwind usa essa classe para trocar as
  // variáveis de cor definidas em index.css) e salva a escolha.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    localStorage.setItem("theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-card/80 px-4 backdrop-blur-md sm:px-6">
      <div className="flex items-center gap-2">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Lightbulb className="size-4.5" />
        </div>
        <span className="text-base font-semibold tracking-tight">Otimizza camp</span>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setDarkMode((prev) => !prev)}
          aria-label="Alternar modo escuro"
        >
          {darkMode ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>

        {/* Só faz sentido sair de uma sessão que existe de fato. */}
        {isSupabaseConfigured && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => signOut()}
            aria-label="Sair"
          >
            <LogOut className="size-4" />
          </Button>
        )}
      </div>
    </header>
  );
}
