import { useEffect, useState } from "react";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { createBlockedSchedule, fetchBlockedSchedules, removeBlockedSchedule } from "../services/ruleEngineApi";
import type { BlockedSchedule } from "../types";

// Horários fixos/bloqueados da rotina (trabalho, faculdade, sono etc.).
// Sem Supabase configurado, fica só em memória (modo mock local).
export function useBlockedSchedules() {
  const [schedules, setSchedules] = useState<BlockedSchedule[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    fetchBlockedSchedules()
      .then(setSchedules)
      .finally(() => setLoading(false));
  }, []);

  // Otimista: aparece na tela na hora, e só depois tenta salvar no
  // Supabase — se falhar (ex: tabela ainda não migrada), continua
  // visível localmente em vez de sumir sem explicação.
  async function addSchedule(schedule: Omit<BlockedSchedule, "id">) {
    const optimisticSchedule: BlockedSchedule = { ...schedule, id: crypto.randomUUID() };
    setSchedules((prev) => [...prev, optimisticSchedule]);

    if (isSupabaseConfigured) {
      try {
        const created = await createBlockedSchedule(schedule);
        setSchedules((prev) => prev.map((s) => (s.id === optimisticSchedule.id ? created : s)));
      } catch (error) {
        console.error("Falha ao salvar horário bloqueado no Supabase (mantido localmente):", error);
      }
    }
  }

  async function deleteSchedule(id: string) {
    setSchedules((prev) => prev.filter((schedule) => schedule.id !== id));
    if (isSupabaseConfigured) {
      try {
        await removeBlockedSchedule(id);
      } catch (error) {
        console.error("Falha ao excluir horário bloqueado no Supabase:", error);
      }
    }
  }

  return { schedules, loading, addSchedule, deleteSchedule };
}
