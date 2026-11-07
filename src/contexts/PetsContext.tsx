import * as React from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Pet } from "@/types";
import { mockPets } from "@/data/mockData";
import { createPet, fetchPets, removePet } from "@/data/petsApi";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { todayISO } from "@/lib/date";

interface PetsContextValue {
  pets: Pet[];
  loading: boolean;
  addPet: (pet: Omit<Pet, "id" | "createdAt">) => void;
  deletePet: (id: string) => void;
}

const PetsContext = createContext<PetsContextValue | null>(null);

// Mesma estratégia do DocumentsContext: dados mockados quando o Supabase
// não está configurado, sincronizado com o banco real (com atualização
// otimista) quando está.
export function PetsProvider({ children }: { children: React.ReactNode }) {
  const [pets, setPets] = useState<Pet[]>(isSupabaseConfigured ? [] : mockPets);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    let isMounted = true;
    fetchPets()
      .then((data) => {
        if (isMounted) setPets(data);
      })
      .catch((error) => console.error("Falha ao carregar pets:", error))
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const addPet: PetsContextValue["addPet"] = (pet) => {
    const optimistic: Pet = {
      ...pet,
      id: `pet-${Date.now()}`,
      createdAt: todayISO(),
    };
    setPets((prev) => [...prev, optimistic]);

    if (isSupabaseConfigured) {
      createPet(pet)
        .then((saved) => {
          setPets((prev) => prev.map((p) => (p.id === optimistic.id ? saved : p)));
        })
        .catch((error) => console.error("Falha ao criar pet:", error));
    }
  };

  const deletePet = (id: string) => {
    setPets((prev) => prev.filter((p) => p.id !== id));

    if (isSupabaseConfigured) {
      // Documentos do pet somem junto no banco (foreign key "on delete
      // cascade" — ver supabase/schema.sql); quem tira da tela é
      // DocumentsPage, que chama deleteDocument pra cada um antes disto.
      removePet(id).catch((error) => console.error("Falha ao excluir pet:", error));
    }
  };

  const value = useMemo(() => ({ pets, loading, addPet, deletePet }), [pets, loading]);

  return <PetsContext.Provider value={value}>{children}</PetsContext.Provider>;
}

export function usePets() {
  const ctx = useContext(PetsContext);
  if (!ctx) throw new Error("usePets deve ser usado dentro de PetsProvider");
  return ctx;
}
