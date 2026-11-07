import * as React from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { DocumentCategory } from "@/types";
import { mockDocumentCategories } from "@/data/mockData";
import {
  createDocumentCategory,
  fetchDocumentCategories,
  removeDocumentCategory,
} from "@/data/documentCategoriesApi";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { todayISO } from "@/lib/date";

interface DocumentCategoriesContextValue {
  categories: DocumentCategory[];
  loading: boolean;
  addCategory: (name: string) => void;
  deleteCategory: (id: string) => void;
}

const DocumentCategoriesContext = createContext<DocumentCategoriesContextValue | null>(null);

// Mesma estratégia do DocumentsContext/PetsContext: dados mockados quando
// o Supabase não está configurado, sincronizado com o banco real (com
// atualização otimista) quando está.
export function DocumentCategoriesProvider({ children }: { children: React.ReactNode }) {
  const [categories, setCategories] = useState<DocumentCategory[]>(
    isSupabaseConfigured ? [] : mockDocumentCategories
  );
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    let isMounted = true;
    fetchDocumentCategories()
      .then((data) => {
        if (isMounted) setCategories(data);
      })
      .catch((error) => console.error("Falha ao carregar categorias de documento:", error))
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const addCategory: DocumentCategoriesContextValue["addCategory"] = (name) => {
    const optimistic: DocumentCategory = {
      id: `cat-${Date.now()}`,
      name,
      createdAt: todayISO(),
    };
    setCategories((prev) => [...prev, optimistic]);

    if (isSupabaseConfigured) {
      createDocumentCategory(name)
        .then((saved) => {
          setCategories((prev) => prev.map((c) => (c.id === optimistic.id ? saved : c)));
        })
        .catch((error) => console.error("Falha ao criar categoria de documento:", error));
    }
  };

  const deleteCategory = (id: string) => {
    setCategories((prev) => prev.filter((c) => c.id !== id));

    if (isSupabaseConfigured) {
      // Documentos da categoria somem junto no banco ("on delete cascade"
      // — ver supabase/schema.sql); quem tira da tela é DocumentsPage.
      removeDocumentCategory(id).catch((error) =>
        console.error("Falha ao excluir categoria de documento:", error)
      );
    }
  };

  const value = useMemo(
    () => ({ categories, loading, addCategory, deleteCategory }),
    [categories, loading]
  );

  return <DocumentCategoriesContext.Provider value={value}>{children}</DocumentCategoriesContext.Provider>;
}

export function useDocumentCategories() {
  const ctx = useContext(DocumentCategoriesContext);
  if (!ctx) throw new Error("useDocumentCategories deve ser usado dentro de DocumentCategoriesProvider");
  return ctx;
}
