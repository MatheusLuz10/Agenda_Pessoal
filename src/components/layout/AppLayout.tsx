import { Outlet } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { Sidebar, BottomNav } from "@/components/layout/Sidebar";

// Esqueleto visual compartilhado por todas as rotas (ver App.tsx: este
// componente é o elemento da rota "pai", e cada página entra no lugar
// do <Outlet />, que é onde o react-router injeta a rota filha ativa.
export function AppLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 px-4 py-6 pb-20 sm:px-6 sm:pb-6">
          <div className="mx-auto w-full max-w-5xl">
            <Outlet />
          </div>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
