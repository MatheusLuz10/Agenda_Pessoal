import { useEffect, useState } from "react";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { createPlannerLog, fetchPlannerLogs } from "../services/ruleEngineApi";
import type { PlannerLog } from "../types";

// Histórico de decisões do motor (ex: "Categoria Desenvolvimento
// pessoal priorizada — regra ativa: Nunca sacrificar desenvolvimento
// pessoal"), registrado toda vez que "Iniciar Dia" monta a fila e
// alguma regra cadastrada realmente influencia a ordem.
export function usePlannerLogs() {
  const [logs, setLogs] = useState<PlannerLog[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    fetchPlannerLogs()
      .then(setLogs)
      .finally(() => setLoading(false));
  }, []);

  // Otimista: a decisão aparece na tela na hora, e só depois tenta
  // salvar no Supabase — se falhar (ex: tabela ainda não migrada),
  // continua visível localmente em vez de sumir sem explicação.
  async function logDecision(decision: string, reason: string) {
    const optimisticLog = { id: crypto.randomUUID(), decision, reason, createdAt: new Date().toISOString() };
    setLogs((prev) => [optimisticLog, ...prev].slice(0, 50));

    if (isSupabaseConfigured) {
      try {
        const created = await createPlannerLog(decision, reason);
        setLogs((prev) => prev.map((log) => (log.id === optimisticLog.id ? created : log)));
      } catch (error) {
        console.error("Falha ao salvar decisão no Supabase (mantida localmente):", error);
      }
    }
  }

  return { logs, loading, logDecision };
}
