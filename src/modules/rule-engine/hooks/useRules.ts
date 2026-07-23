import { useEffect, useState } from "react";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { createRule, fetchRules, removeRule, updateRule } from "../services/ruleEngineApi";
import type { Rule } from "../types";
import { mergeLoaded } from "./mergeLoaded";

// Regras de negócio cadastráveis que o motor de decisão vai usar (motor
// em si ainda não existe — só o cadastro por enquanto).
export function useRules() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    fetchRules()
      .then((rows) => setRules((prev) => mergeLoaded(rows, prev)))
      .finally(() => setLoading(false));
  }, []);

  // Otimista: aparece na tela na hora, e só depois tenta salvar no
  // Supabase — se falhar (ex: tabela ainda não migrada), continua
  // visível localmente em vez de sumir sem explicação.
  async function addRule(rule: Omit<Rule, "id" | "createdAt">) {
    const optimisticRule: Rule = { ...rule, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    setRules((prev) => [optimisticRule, ...prev]);

    if (isSupabaseConfigured) {
      try {
        const created = await createRule(rule);
        setRules((prev) => prev.map((r) => (r.id === optimisticRule.id ? created : r)));
      } catch (error) {
        console.error("Falha ao salvar regra no Supabase (mantida localmente):", error);
      }
    }
  }

  async function editRule(id: string, rule: Omit<Rule, "id" | "createdAt">) {
    setRules((prev) => prev.map((existing) => (existing.id === id ? { ...existing, ...rule } : existing)));
    if (isSupabaseConfigured) {
      try {
        await updateRule(id, rule);
      } catch (error) {
        console.error("Falha ao atualizar regra no Supabase:", error);
      }
    }
  }

  async function deleteRule(id: string) {
    setRules((prev) => prev.filter((rule) => rule.id !== id));
    if (isSupabaseConfigured) {
      try {
        await removeRule(id);
      } catch (error) {
        console.error("Falha ao excluir regra no Supabase:", error);
      }
    }
  }

  return { rules, loading, addRule, editRule, deleteRule };
}
