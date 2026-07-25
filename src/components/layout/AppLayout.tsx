import { Outlet, useLocation } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { Sidebar, BottomNav } from "@/components/layout/Sidebar";
import { cn } from "@/lib/utils";

// Esqueleto visual compartilhado por todas as rotas (ver App.tsx: este
// componente é o elemento da rota "pai", e cada página entra no lugar
// do <Outlet />, que é onde o react-router injeta a rota filha ativa.
//
// A barra inferior fixa (mobile) só aparece na grade ("/menu") — nas
// demais páginas a navegação de volta é o botão "Voltar" do Header, não
// uma barra fixa permanente (ver Header.tsx).
export function AppLayout() {
  const location = useLocation();
  const showBottomNav = location.pathname === "/menu";

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <div className="flex flex-1">
        <Sidebar />
        <main className={cn("flex-1 px-4 py-6 sm:px-6 sm:pb-6", showBottomNav ? "pb-20" : "pb-6")}>
          <div className="mx-auto w-full max-w-5xl">
            <Outlet />
          </div>
        </main>
      </div>
      {showBottomNav && <BottomNav />}
    </div>
  );
}
