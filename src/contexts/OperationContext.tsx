import * as React from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { OperationActivity, OperationSettings, PunchRecord } from "@/types";
import { mockOperationActivities, mockOperationPunches, mockOperationSettings } from "@/data/mockData";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { todayISO } from "@/lib/date";
import {
  createOperationActivity,
  fetchOperationActivities,
  fetchOperationPunches,
  fetchOperationSettings,
  removeOperationActivity,
  removeOperationPunch,
  saveOperationPunch,
  saveOperationSettings,
  updateOperationActivity,
} from "@/data/operationApi";

interface OperationContextValue {
  activities: OperationActivity[];
  punches: PunchRecord[];
  settings: OperationSettings;
  loading: boolean;
  addActivity: (activity: Omit<OperationActivity, "id" | "createdAt">) => void;
  updateActivity: (activityId: string, activity: Omit<OperationActivity, "id" | "createdAt">) => void;
  deleteActivity: (activityId: string) => void;
  savePunch: (punch: Omit<PunchRecord, "id" | "createdAt">) => void;
  deletePunch: (punchId: string) => void;
  updateSettings: (settings: OperationSettings) => void;
}

const OperationContext = createContext<OperationContextValue | null>(null);

// Mesma estratégia do WorkContext/AgendaContext: dados mockados sem
// Supabase configurado, sincronização com atualização otimista quando
// está. `settings` é a exceção: é sempre uma linha única (ver
// operationApi.ts), guardada à parte com seu id real para saber se deve
// fazer insert (primeiro uso) ou update.
export function OperationProvider({ children }: { children: React.ReactNode }) {
  const [activities, setActivities] = useState<OperationActivity[]>(
    isSupabaseConfigured ? [] : mockOperationActivities
  );
  const [punches, setPunches] = useState<PunchRecord[]>(isSupabaseConfigured ? [] : mockOperationPunches);
  const [settings, setSettings] = useState<OperationSettings>(mockOperationSettings);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    let isMounted = true;
    Promise.all([fetchOperationActivities(), fetchOperationPunches(), fetchOperationSettings()])
      .then(([activityData, punchData, settingsData]) => {
        if (!isMounted) return;
        setActivities(activityData);
        setPunches(punchData);
        if (settingsData) {
          const { id, ...rest } = settingsData;
          setSettings(rest);
          setSettingsId(id);
        }
      })
      .catch((error) => console.error("Falha ao carregar dados de operação:", error))
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const addActivity: OperationContextValue["addActivity"] = (activity) => {
    const optimistic: OperationActivity = {
      ...activity,
      id: `act-${Date.now()}`,
      createdAt: todayISO(),
    };
    setActivities((prev) => [optimistic, ...prev]);

    if (isSupabaseConfigured) {
      createOperationActivity(activity)
        .then((saved) => {
          setActivities((prev) => prev.map((a) => (a.id === optimistic.id ? saved : a)));
        })
        .catch((error) => console.error("Falha ao registrar atividade:", error));
    }
  };

  const updateActivity: OperationContextValue["updateActivity"] = (activityId, activity) => {
    setActivities((prev) => prev.map((a) => (a.id === activityId ? { ...a, ...activity } : a)));

    if (isSupabaseConfigured) {
      updateOperationActivity(activityId, activity).catch((error) =>
        console.error("Falha ao atualizar atividade:", error)
      );
    }
  };

  const deleteActivity = (activityId: string) => {
    setActivities((prev) => prev.filter((a) => a.id !== activityId));

    if (isSupabaseConfigured) {
      removeOperationActivity(activityId).catch((error) =>
        console.error("Falha ao excluir atividade:", error)
      );
    }
  };

  const savePunchFn: OperationContextValue["savePunch"] = (punch) => {
    const optimistic: PunchRecord = {
      ...punch,
      id: `punch-${Date.now()}`,
      createdAt: todayISO(),
    };
    // Upsert por data: substitui o registro existente do mesmo dia, se houver.
    setPunches((prev) => [optimistic, ...prev.filter((p) => p.date !== punch.date)]);

    if (isSupabaseConfigured) {
      saveOperationPunch(punch)
        .then((saved) => {
          setPunches((prev) => [saved, ...prev.filter((p) => p.date !== punch.date && p.id !== optimistic.id)]);
        })
        .catch((error) => console.error("Falha ao salvar ponto:", error));
    }
  };

  const deletePunch = (punchId: string) => {
    setPunches((prev) => prev.filter((p) => p.id !== punchId));

    if (isSupabaseConfigured) {
      removeOperationPunch(punchId).catch((error) => console.error("Falha ao excluir ponto:", error));
    }
  };

  const updateSettings: OperationContextValue["updateSettings"] = (nextSettings) => {
    setSettings(nextSettings);

    if (isSupabaseConfigured) {
      saveOperationSettings(settingsId, nextSettings)
        .then((saved) => {
          const { id, ...rest } = saved;
          setSettings(rest);
          setSettingsId(id);
        })
        .catch((error) => console.error("Falha ao salvar configurações de operação:", error));
    }
  };

  const value = useMemo(
    () => ({
      activities,
      punches,
      settings,
      loading,
      addActivity,
      updateActivity,
      deleteActivity,
      savePunch: savePunchFn,
      deletePunch,
      updateSettings,
    }),
    [activities, punches, settings, loading]
  );

  return <OperationContext.Provider value={value}>{children}</OperationContext.Provider>;
}

export function useOperation() {
  const ctx = useContext(OperationContext);
  if (!ctx) throw new Error("useOperation deve ser usado dentro de OperationProvider");
  return ctx;
}
