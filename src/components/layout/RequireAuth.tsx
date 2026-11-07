import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { isSupabaseConfigured } from "@/lib/supabaseClient";

// Guarda de rota: usada como elemento de uma rota "pai" no App.tsx, então
// tudo que está dentro dela só renderiza se passar pela condição abaixo
// (o conteúdo da rota filha entra no lugar do <Outlet />).
//
//   - Sem Supabase configurado (modo mock local) não há autenticação;
//     o app continua liberado para desenvolvimento.
//   - Com Supabase configurado, espera a checagem inicial da sessão
//     (loading) e só then decide: sem sessão -> manda para /login;
//     com sessão -> libera o conteúdo.
export function RequireAuth() {
  const { session, loading } = useAuth();

  if (!isSupabaseConfigured) return <Outlet />;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Carregando...
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;

  return <Outlet />;
}
