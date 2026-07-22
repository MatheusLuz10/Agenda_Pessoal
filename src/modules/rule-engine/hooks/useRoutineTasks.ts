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

  // Otimista: a tarefa aparece na tela na hora, e só depois tenta salvar
  // no Supabase — se a tabela ainda não existir lá (schema pendente) ou
  // a gravação falhar por qualquer motivo, a tarefa continua visível
  // localmente em vez de sumir/nunca aparecer sem explicação.
  async function addRoutineTask(task: Omit<RoutineTask, "id">) {
    const optimisticTask: RoutineTask = { ...task, id: crypto.randomUUID() };
    setRoutineTasks((prev) => [...prev, optimisticTask]);

    if (isSupabaseConfigured) {
      try {
        const created = await createRoutineTask(task);
        setRoutineTasks((prev) => prev.map((t) => (t.id === optimisticTask.id ? created : t)));
      } catch (error) {
        console.error("Falha ao salvar tarefa de rotina no Supabase (mantida localmente):", error);
      }
    }
  }

  async function editRoutineTask(id: string, task: Omit<RoutineTask, "id">) {
    setRoutineTasks((prev) => prev.map((existing) => (existing.id === id ? { ...existing, ...task } : existing)));
    if (isSupabaseConfigured) {
      try {
        await updateRoutineTask(id, task);
      } catch (error) {
        console.error("Falha ao atualizar tarefa de rotina no Supabase:", error);
      }
    }
  }

  async function deleteRoutineTask(id: string) {
    setRoutineTasks((prev) => prev.filter((task) => task.id !== id));
    if (isSupabaseConfigured) {
      try {
        await removeRoutineTask(id);
      } catch (error) {
        console.error("Falha ao excluir tarefa de rotina no Supabase:", error);
      }
    }
  }

  async function deleteRoutineTasks(ids: string[]) {
    const idSet = new Set(ids);
    setRoutineTasks((prev) => prev.filter((task) => !idSet.has(task.id)));
    if (isSupabaseConfigured) {
      try {
        await Promise.all(ids.map((id) => removeRoutineTask(id)));
      } catch (error) {
        console.error("Falha ao excluir tarefas de rotina no Supabase:", error);
      }
    }
  }

  return { routineTasks, loading, addRoutineTask, editRoutineTask, deleteRoutineTask, deleteRoutineTasks };
}
