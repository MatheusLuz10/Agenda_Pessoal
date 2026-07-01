import * as React from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { EquipmentItem, ServiceOrder } from "@/types";
import { mockEquipmentItems, mockServiceOrders } from "@/data/mockData";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { todayISO } from "@/lib/date";
import {
  createEquipmentItem,
  createServiceOrder,
  fetchEquipmentItems,
  fetchServiceOrders,
  removeEquipmentItem,
  removeServiceOrder,
  updateEquipmentItem,
  updateServiceOrder,
} from "@/data/workApi";

interface WorkContextValue {
  equipmentItems: EquipmentItem[];
  serviceOrders: ServiceOrder[];
  loading: boolean;
  addEquipmentItem: (item: Omit<EquipmentItem, "id" | "createdAt">) => void;
  updateEquipmentItem: (itemId: string, item: Omit<EquipmentItem, "id" | "createdAt">) => void;
  deleteEquipmentItem: (itemId: string) => void;
  addServiceOrder: (order: Omit<ServiceOrder, "id" | "createdAt">) => void;
  updateServiceOrder: (orderId: string, order: Omit<ServiceOrder, "id" | "createdAt">) => void;
  deleteServiceOrder: (orderId: string) => void;
}

const WorkContext = createContext<WorkContextValue | null>(null);

// Mesma estratégia do AgendaContext/FinanceContext (ver comentários lá
// para mais detalhes): usa dados mockados quando o Supabase não está
// configurado, e sincroniza com o banco real (com atualização otimista)
// quando está.
export function WorkProvider({ children }: { children: React.ReactNode }) {
  const [equipmentItems, setEquipmentItems] = useState<EquipmentItem[]>(
    isSupabaseConfigured ? [] : mockEquipmentItems
  );
  const [serviceOrders, setServiceOrders] = useState<ServiceOrder[]>(
    isSupabaseConfigured ? [] : mockServiceOrders
  );
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    let isMounted = true;
    Promise.all([fetchEquipmentItems(), fetchServiceOrders()])
      .then(([equipmentData, ordersData]) => {
        if (!isMounted) return;
        setEquipmentItems(equipmentData);
        setServiceOrders(ordersData);
      })
      .catch((error) => console.error("Falha ao carregar dados de trabalho:", error))
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const addEquipmentItem: WorkContextValue["addEquipmentItem"] = (item) => {
    const optimistic: EquipmentItem = {
      ...item,
      id: `eq-${Date.now()}`,
      createdAt: todayISO(),
    };
    setEquipmentItems((prev) => [optimistic, ...prev]);

    if (isSupabaseConfigured) {
      createEquipmentItem(item)
        .then((saved) => {
          setEquipmentItems((prev) => prev.map((i) => (i.id === optimistic.id ? saved : i)));
        })
        .catch((error) => console.error("Falha ao criar equipamento:", error));
    }
  };

  const updateEquipmentItemFn: WorkContextValue["updateEquipmentItem"] = (itemId, item) => {
    setEquipmentItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, ...item } : i)));

    if (isSupabaseConfigured) {
      updateEquipmentItem(itemId, item).catch((error) =>
        console.error("Falha ao atualizar equipamento:", error)
      );
    }
  };

  const deleteEquipmentItem = (itemId: string) => {
    setEquipmentItems((prev) => prev.filter((i) => i.id !== itemId));

    if (isSupabaseConfigured) {
      removeEquipmentItem(itemId).catch((error) =>
        console.error("Falha ao excluir equipamento:", error)
      );
    }
  };

  const addServiceOrder: WorkContextValue["addServiceOrder"] = (order) => {
    const optimistic: ServiceOrder = {
      ...order,
      id: `os-${Date.now()}`,
      createdAt: todayISO(),
    };
    setServiceOrders((prev) => [optimistic, ...prev]);

    if (isSupabaseConfigured) {
      createServiceOrder(order)
        .then((saved) => {
          setServiceOrders((prev) => prev.map((o) => (o.id === optimistic.id ? saved : o)));
        })
        .catch((error) => console.error("Falha ao criar OS:", error));
    }
  };

  const updateServiceOrderFn: WorkContextValue["updateServiceOrder"] = (orderId, order) => {
    setServiceOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, ...order } : o)));

    if (isSupabaseConfigured) {
      updateServiceOrder(orderId, order).catch((error) =>
        console.error("Falha ao atualizar OS:", error)
      );
    }
  };

  const deleteServiceOrder = (orderId: string) => {
    setServiceOrders((prev) => prev.filter((o) => o.id !== orderId));

    if (isSupabaseConfigured) {
      removeServiceOrder(orderId).catch((error) => console.error("Falha ao excluir OS:", error));
    }
  };

  const value = useMemo(
    () => ({
      equipmentItems,
      serviceOrders,
      loading,
      addEquipmentItem,
      updateEquipmentItem: updateEquipmentItemFn,
      deleteEquipmentItem,
      addServiceOrder,
      updateServiceOrder: updateServiceOrderFn,
      deleteServiceOrder,
    }),
    [equipmentItems, serviceOrders, loading]
  );

  return <WorkContext.Provider value={value}>{children}</WorkContext.Provider>;
}

export function useWork() {
  const ctx = useContext(WorkContext);
  if (!ctx) throw new Error("useWork deve ser usado dentro de WorkProvider");
  return ctx;
}
