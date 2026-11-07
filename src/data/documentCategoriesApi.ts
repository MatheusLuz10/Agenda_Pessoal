import { supabase } from "@/lib/supabaseClient";
import type { DocumentCategory } from "@/types";

// Categorias de documento (sub-abas da tela "Documentos", ver
// src/pages/DocumentsPage.tsx) — lista aberta, o usuário cria as suas.

interface DocumentCategoryRow {
  id: string;
  name: string;
  created_at: string;
}

function rowToCategory(row: DocumentCategoryRow): DocumentCategory {
  return { id: row.id, name: row.name, createdAt: row.created_at };
}

export async function fetchDocumentCategories(): Promise<DocumentCategory[]> {
  const { data, error } = await supabase!
    .from("document_categories")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as DocumentCategoryRow[]).map(rowToCategory);
}

export async function createDocumentCategory(name: string): Promise<DocumentCategory> {
  const { data, error } = await supabase!.from("document_categories").insert({ name }).select().single();
  if (error) throw error;
  return rowToCategory(data as DocumentCategoryRow);
}

export async function removeDocumentCategory(id: string): Promise<void> {
  const { error } = await supabase!.from("document_categories").delete().eq("id", id);
  if (error) throw error;
}
