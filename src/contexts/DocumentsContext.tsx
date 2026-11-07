import * as React from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { AppDocument } from "@/types";
import { mockDocuments } from "@/data/mockData";
import { createDocument, fetchDocuments, removeDocument } from "@/data/documentsApi";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { todayISO } from "@/lib/date";

interface DocumentsContextValue {
  documents: AppDocument[];
  loading: boolean;
  addDocument: (doc: Omit<AppDocument, "id" | "createdAt">) => void;
  deleteDocument: (id: string) => void;
}

const DocumentsContext = createContext<DocumentsContextValue | null>(null);

// Mesma estratégia dos demais contexts: dados mockados quando o Supabase
// não está configurado, sincronizado com o banco real (com atualização
// otimista) quando está.
export function DocumentsProvider({ children }: { children: React.ReactNode }) {
  const [documents, setDocuments] = useState<AppDocument[]>(isSupabaseConfigured ? [] : mockDocuments);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    let isMounted = true;
    fetchDocuments()
      .then((data) => {
        if (isMounted) setDocuments(data);
      })
      .catch((error) => console.error("Falha ao carregar documentos:", error))
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const addDocument: DocumentsContextValue["addDocument"] = (doc) => {
    const optimistic: AppDocument = {
      ...doc,
      id: `doc-${Date.now()}`,
      createdAt: todayISO(),
    };
    setDocuments((prev) => [optimistic, ...prev]);

    if (isSupabaseConfigured) {
      createDocument(doc)
        .then((saved) => {
          setDocuments((prev) => prev.map((d) => (d.id === optimistic.id ? saved : d)));
        })
        .catch((error) => console.error("Falha ao criar documento:", error));
    }
  };

  const deleteDocument = (id: string) => {
    const target = documents.find((d) => d.id === id);
    setDocuments((prev) => prev.filter((d) => d.id !== id));

    if (isSupabaseConfigured && target) {
      removeDocument(id, target.fileUrl).catch((error) => console.error("Falha ao excluir documento:", error));
    }
  };

  const value = useMemo(() => ({ documents, loading, addDocument, deleteDocument }), [documents, loading]);

  return <DocumentsContext.Provider value={value}>{children}</DocumentsContext.Provider>;
}

export function useDocuments() {
  const ctx = useContext(DocumentsContext);
  if (!ctx) throw new Error("useDocuments deve ser usado dentro de DocumentsProvider");
  return ctx;
}
