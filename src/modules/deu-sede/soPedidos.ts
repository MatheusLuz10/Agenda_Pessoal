import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { useConsulta } from "@/modules/deu-sede/data/cliente";
import type { Acesso } from "@/modules/deu-sede/data/tipos";

// Login "só pedidos de compra" (papel "pedidos", migração 0015): o banco já
// barra o resto; o app mostra só a área de pedidos (ver acessoPedidos.tsx).
export const INICIO_PEDIDOS = "/deu-sede/pedidos/montar";
export const AREA_PEDIDOS = /^\/deu-sede\/pedidos(\/|$)/;

/** true no login de pedidos; undefined enquanto carrega; false nos demais (e no modo local). */
export function useSoPedidos(): boolean | undefined {
  const { dados, erro } = useConsulta<Acesso | null>("meu_acesso", isSupabaseConfigured ? {} : null);
  if (!isSupabaseConfigured || erro) return false;
  if (dados === undefined) return undefined;
  return dados?.papel === "pedidos";
}
