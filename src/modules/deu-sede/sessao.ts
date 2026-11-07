import { useAuth } from "@/contexts/AuthContext";
import { isSupabaseConfigured } from "@/lib/supabaseClient";

// O módulo de compras usa a mesma sessão do aplicativo: um login só.
//  - "local"    -> sem .env.local: modo de teste, sem login e sem banco.
//  - "supabase" -> banco real: o RequireAuth da Agenda já exige login.
export type ModoDeuSede = "local" | "supabase";

export function useSessaoDeuSede() {
  const { session, signOut } = useAuth();
  const mode: ModoDeuSede = isSupabaseConfigured ? "supabase" : "local";
  const userLabel = mode === "local" ? "Teste local" : (session?.user.email ?? "");
  return { mode, userLabel, signOut };
}
