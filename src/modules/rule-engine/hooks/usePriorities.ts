import { useEffect, useState } from "react";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { fetchPriorities, saveAllPriorities } from "../services/ruleEngineApi";
import { DEFAULT_PRIORITY_CATEGORIES } from "../types";

// Ordem das categorias de prioridade. Sem Supabase configurado (ou
// enquanto a tabela está vazia, primeiro uso) mostra a ordem padrão do
// spec — só passa a persistir de verdade depois do primeiro reorder.
export function usePriorities() {
  const [categories, setCategories] = useState<string[]>([...DEFAULT_PRIORITY_CATEGORIES]);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    fetchPriorities()
      .then((rows) => {
        if (rows.length > 0) setCategories(rows.map((row) => row.category));
      })
      .finally(() => setLoading(false));
  }, []);

  async function reorder(next: string[]) {
    setCategories(next);
    if (isSupabaseConfigured) {
      try {
        await saveAllPriorities(next);
      } catch (error) {
        console.error("Falha ao salvar ordem de prioridades no Supabase (mantida localmente):", error);
      }
    }
  }

  return { categories, loading, reorder };
}
