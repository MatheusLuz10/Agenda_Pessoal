import { useEffect, useState } from "react";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import {
  createExecutionHistoryEntry,
  fetchExecutionHistory,
  removeExecutionHistoryEntry,
  updateExecutionHistoryEntry,
} from "../services/ruleEngineApi";
import type { ExecutionHistoryEntry } from "../types";
import { mergeLoaded } from "./mergeLoaded";

// Histórico de atividades cronometradas (vida diária, vinculadas a uma
// categoria de prioridade) — a base de dados que o motor de decisão vai
// usar depois pra aprender o tempo médio de cada atividade. Sem Supabase
// configurado, fica só em memória (modo mock local).
export function useExecutionHistory() {
  const [entries, setEntries] = useState<ExecutionHistoryEntry[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    fetchExecutionHistory()
      .then((rows) => setEntries((prev) => mergeLoaded(rows, prev)))
      .finally(() => setLoading(false));
  }, []);

  // Otimista: aparece no Histórico na hora, e só depois tenta salvar no
  // Supabase — se falhar (ex: tabela ainda não migrada), continua
  // visível localmente em vez de sumir sem explicação. Isso importa
  // especialmente aqui: é o registro do cronômetro que calibra o tempo
  // estimado das tarefas de rotina.
  async function addEntry(entry: Omit<ExecutionHistoryEntry, "id">) {
    const optimisticEntry: ExecutionHistoryEntry = { ...entry, id: crypto.randomUUID() };
    setEntries((prev) => [optimisticEntry, ...prev]);

    if (isSupabaseConfigured) {
      try {
        const created = await createExecutionHistoryEntry(entry);
        setEntries((prev) => prev.map((e) => (e.id === optimisticEntry.id ? created : e)));
      } catch (error) {
        console.error("Falha ao salvar atividade no Supabase (mantida localmente):", error);
      }
    }
  }

  async function editEntry(id: string, entry: Omit<ExecutionHistoryEntry, "id">) {
    setEntries((prev) => prev.map((existing) => (existing.id === id ? { ...existing, ...entry } : existing)));
    if (isSupabaseConfigured) {
      try {
        await updateExecutionHistoryEntry(id, entry);
      } catch (error) {
        console.error("Falha ao atualizar atividade no Supabase:", error);
      }
    }
  }

  async function deleteEntry(id: string) {
    setEntries((prev) => prev.filter((entry) => entry.id !== id));
    if (isSupabaseConfigured) {
      try {
        await removeExecutionHistoryEntry(id);
      } catch (error) {
        console.error("Falha ao excluir atividade no Supabase:", error);
      }
    }
  }

  async function deleteEntries(ids: string[]) {
    const idSet = new Set(ids);
    setEntries((prev) => prev.filter((entry) => !idSet.has(entry.id)));
    if (isSupabaseConfigured) {
      try {
        await Promise.all(ids.map((id) => removeExecutionHistoryEntry(id)));
      } catch (error) {
        console.error("Falha ao excluir atividades no Supabase:", error);
      }
    }
  }

  return { entries, loading, addEntry, editEntry, deleteEntry, deleteEntries };
}
