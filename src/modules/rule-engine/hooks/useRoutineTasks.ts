import { useEffect, useState } from "react";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import {
  createRoutineTask,
  fetchRoutineTasks,
  removeRoutineTask,
  updateRoutineTask,
} from "../services/ruleEngineApi";
import type { RoutineTask } from "../types";

// Tarefas de rotina (casa, saúde, relacionamento etc.), sem data fixa —
// "Iniciar Dia" decide se cada uma venceu cruzando intervalDays com o
// histórico de execução. Sem Supabase configurado, fica só em memória.
export function useRoutineTasks() {
  const [routineTasks, setRoutineTasks] = useState<RoutineTask[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    fetchRoutineTasks()
      .then(setRoutineTasks)
      .finally(() => setLoading(false));
  }, []);

  async function addRoutineTask(task: Omit<RoutineTask, "id">) {
    if (isSupabaseConfigured) {
      const created = await createRoutineTask(task);
      setRoutineTasks((prev) => [...prev, created]);
    } else {
      setRoutineTasks((prev) => [...prev, { ...task, id: crypto.randomUUID() }]);
    }
  }

  async function editRoutineTask(id: string, task: Omit<RoutineTask, "id">) {
    setRoutineTasks((prev) => prev.map((existing) => (existing.id === id ? { ...existing, ...task } : existing)));
    if (isSupabaseConfigured) await updateRoutineTask(id, task);
  }

  async function deleteRoutineTask(id: string) {
    setRoutineTasks((prev) => prev.filter((task) => task.id !== id));
    if (isSupabaseConfigured) await removeRoutineTask(id);
  }

  async function deleteRoutineTasks(ids: string[]) {
    const idSet = new Set(ids);
    setRoutineTasks((prev) => prev.filter((task) => !idSet.has(task.id)));
    if (isSupabaseConfigured) await Promise.all(ids.map((id) => removeRoutineTask(id)));
  }

  return { routineTasks, loading, addRoutineTask, editRoutineTask, deleteRoutineTask, deleteRoutineTasks };
}
