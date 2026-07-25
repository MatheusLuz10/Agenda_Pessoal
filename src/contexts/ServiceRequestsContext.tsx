import * as React from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  fetchServiceRequests,
  removeServiceRequest,
  updateServiceRequestObservations,
  updateServiceRequestStatus,
} from "@/data/serviceRequestsApi";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import type { ServiceRequest, ServiceRequestStatus } from "@/types";

interface ServiceRequestsContextValue {
  requests: ServiceRequest[];
  loading: boolean;
  setStatus: (id: string, status: ServiceRequestStatus) => void;
  setObservations: (id: string, observations: string) => void;
  deleteRequest: (id: string) => void;
}

const ServiceRequestsContext = createContext<ServiceRequestsContextValue | null>(null);

// Só a área PRIVADA (aba "Solicitações", autenticada) usa este contexto
// — a página pública de abertura de chamado (sem login) chama a API
// direto, sem passar por aqui. Sem Supabase configurado não há dado
// nenhum pra mostrar (diferente de outras abas, não existe "mock" de
// chamado de cliente): fica só a lista vazia.
export function ServiceRequestsProvider({ children }: { children: React.ReactNode }) {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let isMounted = true;
    fetchServiceRequests()
      .then((data) => {
        if (isMounted) setRequests(data);
      })
      .catch((error) => console.error("Falha ao carregar solicitações de serviço:", error))
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const setStatus: ServiceRequestsContextValue["setStatus"] = (id, status) => {
    setRequests((prev) => prev.map((request) => (request.id === id ? { ...request, status } : request)));
    if (isSupabaseConfigured) {
      updateServiceRequestStatus(id, status).catch((error) =>
        console.error("Falha ao atualizar status da solicitação:", error)
      );
    }
  };

  const setObservations: ServiceRequestsContextValue["setObservations"] = (id, observations) => {
    setRequests((prev) =>
      prev.map((request) => (request.id === id ? { ...request, observations: observations || null } : request))
    );
    if (isSupabaseConfigured) {
      updateServiceRequestObservations(id, observations).catch((error) =>
        console.error("Falha ao salvar observações da solicitação:", error)
      );
    }
  };

  const deleteRequest = (id: string) => {
    const target = requests.find((request) => request.id === id);
    setRequests((prev) => prev.filter((request) => request.id !== id));
    if (isSupabaseConfigured) {
      removeServiceRequest(id, target?.photos.map((photo) => photo.url) ?? []).catch((error) =>
        console.error("Falha ao excluir solicitação:", error)
      );
    }
  };

  const value = useMemo(
    () => ({ requests, loading, setStatus, setObservations, deleteRequest }),
    [requests, loading]
  );

  return <ServiceRequestsContext.Provider value={value}>{children}</ServiceRequestsContext.Provider>;
}

export function useServiceRequests() {
  const ctx = useContext(ServiceRequestsContext);
  if (!ctx) throw new Error("useServiceRequests deve ser usado dentro de ServiceRequestsProvider");
  return ctx;
}
