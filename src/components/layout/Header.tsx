import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Globe, LogOut, Moon, Settings, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { NAV_ITEMS } from "@/config/navigation";

// Deriva o destino do botão "Voltar" a partir do próprio caminho, em vez
// de usar o histórico do navegador (navigate(-1)): quem entra direto
// numa rota aninhada (link compartilhado, QR Code, aba nova) não tem
// histórico dentro do app, e navigate(-1) nesse caso sairia do app em
// vez de voltar pra dentro dele. Rotas com mais de um segmento (ex:
// "/calendarios/abc123", "/meu-trabalho/ttk") sobem um nível; as demais
// (ex: "/financas", que não é mais destino de nenhum item do menu) caem
// na AGENDA, que é a tela inicial do app.
function getBackTarget(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length <= 1) return "/calendarios";
  return `/${segments.slice(0, -1).join("/")}`;
}

// Cabeçalho fixo no topo, presente em todas as páginas (renderizado pelo
// AppLayout). Contém o botão "Voltar" (só nas telas que não são um
// destino direto da barra de navegação fixa embaixo, ex: uma tarefa
// dentro de um calendário específico), a logo (atalho pra AGENDA) e o
// alternador de tema claro/escuro.
export function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const showBackButton = !NAV_ITEMS.some((item) => item.to === location.pathname);

  // Tema inicial: usa o que foi salvo antes no localStorage ou, na
  // primeira visita, segue a preferência do sistema operacional do
  // usuário (prefers-color-scheme).
  const [darkMode, setDarkMode] = useState(() => {
    const storedTheme = localStorage.getItem("theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    return storedTheme ? storedTheme === "dark" : prefersDark;
  });
  const { signOut } = useAuth();

  // Sempre que `darkMode` mudar (ex: usuário clicou no botão, ou o valor
  // inicial calculado acima), aplica a
  // classe "dark" no <html> (o Tailwind usa essa classe para trocar as
  // variáveis de cor definidas em index.css) e salva a escolha.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    localStorage.setItem("theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-card/80 px-4 backdrop-blur-md sm:px-6">
      <div className="flex items-center gap-2">
        {showBackButton && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(getBackTarget(location.pathname))}
            aria-label="Voltar"
          >
            <ArrowLeft className="size-4.5" />
          </Button>
        )}
        <Link to="/calendarios" className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Globe className="size-4.5" />
          </div>
          <span
            className="text-lg font-bold tracking-tight"
            style={{ fontFamily: "'Quicksand', sans-serif" }}
          >
            Otimizza Central
          </span>
        </Link>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/configuracoes")}
          aria-label="Configurações"
        >
          <Settings className="size-4" />
        </Button>

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
