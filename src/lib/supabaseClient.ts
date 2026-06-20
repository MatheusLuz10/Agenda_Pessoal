import { createClient } from "@supabase/supabase-js";

// Variáveis de ambiente lidas pelo Vite (precisam começar com VITE_ para
// ficarem disponíveis no código do navegador). Definidas em .env.local
// (veja .env.example) ou nas variáveis de ambiente do projeto na Vercel.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Permite que o app funcione com dados mockados localmente quando ainda
// não existe um projeto Supabase configurado (ex: ambiente de estudo,
// primeira execução do projeto). O AgendaContext usa esta flag para
// decidir se busca dados reais ou usa src/data/mockData.ts.
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// `supabase` fica `null` se as variáveis não estiverem definidas, em vez
// de lançar erro — assim o app continua funcionando em modo "mock".
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl as string, supabaseAnonKey as string)
  : null;
