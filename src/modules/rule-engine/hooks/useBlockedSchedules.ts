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

  async function addSchedule(schedule: Omit<BlockedSchedule, "id">) {
    if (isSupabaseConfigured) {
      const created = await createBlockedSchedule(schedule);
      setSchedules((prev) => [...prev, created]);
    } else {
      setSchedules((prev) => [...prev, { ...schedule, id: crypto.randomUUID() }]);
    }
  }

  async function deleteSchedule(id: string) {
    setSchedules((prev) => prev.filter((schedule) => schedule.id !== id));
    if (isSupabaseConfigured) await removeBlockedSchedule(id);
  }

  return { schedules, loading, addSchedule, deleteSchedule };
}
