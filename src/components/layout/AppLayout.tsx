import { Outlet } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { BottomNav } from "@/components/layout/Sidebar";
import { AssistantWidget } from "@/components/assistant/AssistantWidget";

// Esqueleto visual compartilhado por todas as rotas (ver App.tsx: este
// componente é o elemento da rota "pai", e cada página entra no lugar
// do <Outlet />, que é onde o react-router injeta a rota filha ativa.
//
// A barra inferior fixa fica sempre visível, com todos os itens de
// NAV_ITEMS (ver navigation.ts) — único menu de navegação do app, em
// qualquer tamanho de tela. O botão "Voltar" do Header (ver Header.tsx)
// é um atalho adicional, não um substituto dela.
export function AppLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1 px-4 py-6 pb-24 sm:px-6">
        <div className="mx-auto w-full max-w-5xl">
          <Outlet />
        </div>
      </main>
      <AssistantWidget />
      <BottomNav />
    </div>
  );
}
