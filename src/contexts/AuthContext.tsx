import * as React from "react";
import { createContext, useContext, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Controla a sessão de login do Supabase Auth. Quando o Supabase não está
// configurado (modo mock local), este provider não faz nada de especial:
// considera que "não há sessão para checar" e libera o app direto — a
// tela de login só entra em cena quando há um banco real para proteger.
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    // Recupera a sessão atual (se o usuário já tinha logado antes e o
    // token ainda é válido, ficou salvo no localStorage pelo supabase-js).
    supabase!.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    // Reage a login/logout/expiração de token em tempo real, em qualquer
    // aba aberta — assim a UI nunca fica com um estado de sessão velho.
    const { data: listener } = supabase!.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  // Tenta logar com e-mail/senha. Retorna uma mensagem de erro em
  // português (ou null em caso de sucesso) para a LoginPage exibir.
  const signIn: AuthContextValue["signIn"] = async (email, password) => {
    if (!supabase) return { error: "Supabase não está configurado." };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: "E-mail ou senha inválidos." };
    return { error: null };
  };

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return ctx;
}
