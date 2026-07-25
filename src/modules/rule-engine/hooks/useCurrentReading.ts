import { useEffect, useState } from "react";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { fetchCurrentReading, saveCurrentReading } from "../services/ruleEngineApi";
import type { CurrentReading } from "../types";

// "Leitura atual" (tema + link externo, ex: um arquivo no Mega) — usada
// como sugestão de fallback em "Iniciar Dia"/"Off Work" quando nenhuma
// tarefa cabe no tempo livre restante. Registro único (singleton).
export function useCurrentReading() {
  const [reading, setReading] = useState<CurrentReading | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    fetchCurrentReading()
      .then((row) => setReading((prev) => prev ?? row))
      .catch((error) => console.error("Falha ao buscar leitura atual no Supabase (tabela ainda não migrada?):", error))
      .finally(() => setLoading(false));
  }, []);

  // Otimista: aparece na tela na hora, e só depois tenta salvar no
  // Supabase — se falhar (ex: tabela ainda não migrada), continua
  // visível localmente em vez de sumir sem explicação.
  async function setCurrentReading(theme: string, link: string) {
    const optimistic: CurrentReading = { id: crypto.randomUUID(), theme, link, updatedAt: new Date().toISOString() };
    setReading(optimistic);

    if (isSupabaseConfigured) {
      try {
        const saved = await saveCurrentReading(theme, link);
        setReading(saved);
      } catch (error) {
        console.error("Falha ao salvar leitura atual no Supabase (mantida localmente):", error);
      }
    }
  }

  return { reading, loading, setCurrentReading };
}
