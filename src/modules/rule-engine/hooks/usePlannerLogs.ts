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

  async function logDecision(decision: string, reason: string) {
    if (isSupabaseConfigured) {
      const created = await createPlannerLog(decision, reason);
      setLogs((prev) => [created, ...prev].slice(0, 50));
    } else {
      setLogs((prev) =>
        [{ id: crypto.randomUUID(), decision, reason, createdAt: new Date().toISOString() }, ...prev].slice(0, 50)
      );
    }
  }

  return { logs, loading, logDecision };
}
