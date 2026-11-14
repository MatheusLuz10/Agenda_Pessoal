import { supabase } from "@/lib/supabaseClient";
import type { AppDocument } from "@/types";

// Documentos das sub-abas de categoria (dinâmicas, ver
// src/pages/DocumentsPage.tsx) e da sub-aba fixa "Pets" — mesma tabela
// pras duas, "category_id" preenchido num caso e "pet_id" no outro (nunca
// os dois). O arquivo em si (foto ou PDF) fica no Storage (bucket
// "documents" — ver supabase/schema.sql), aqui só a URL pública.

const DOCUMENTS_BUCKET = "documents";

interface AppDocumentRow {
  id: string;
  category_id: string | null;
  pet_id: string | null;
  name: string;
  file_url: string | null;
  file_name: string | null;
  content: string | null;
  created_at: string;
}

function rowToDocument(row: AppDocumentRow): AppDocument {
  return {
    id: row.id,
    categoryId: row.category_id,
    petId: row.pet_id,
    name: row.name,
    fileUrl: row.file_url,
    fileName: row.file_name,
    content: row.content ?? "",
    createdAt: row.created_at,
  };
}

export async function fetchDocuments(): Promise<AppDocument[]> {
  const { data, error } = await supabase!
    .from("documents")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as AppDocumentRow[]).map(rowToDocument);
}

export async function createDocument(doc: Omit<AppDocument, "id" | "createdAt">): Promise<AppDocument> {
  const { data, error } = await supabase!
    .from("documents")
    .insert({
      category_id: doc.categoryId,
      pet_id: doc.petId,
      name: doc.name,
      file_url: doc.fileUrl,
      file_name: doc.fileName,
      content: doc.content,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToDocument(data as AppDocumentRow);
}

// Apaga o arquivo do Storage antes de apagar a linha — mesmo padrão de
// removeServiceRequest em serviceRequestsApi.ts.
export async function removeDocument(id: string, fileUrl: string | null): Promise<void> {
  const marker = `/object/public/${DOCUMENTS_BUCKET}/`;
  const markerIndex = fileUrl?.indexOf(marker) ?? -1;
  if (fileUrl && markerIndex !== -1) {
    const path = fileUrl.slice(markerIndex + marker.length);
    await supabase!.storage.from(DOCUMENTS_BUCKET).remove([path]);
  }
  const { error } = await supabase!.from("documents").delete().eq("id", id);
  if (error) throw error;
}

// Nome do arquivo prefixado com timestamp pra nunca colidir entre
// documentos diferentes (mesmo padrão de uploadAvatarPhoto).
export async function uploadDocumentFile(file: File): Promise<{ url: string; name: string }> {
  const extension = file.name.split(".").pop() ?? "";
  const path = `doc-${Date.now()}${extension ? `.${extension}` : ""}`;
  const { error: uploadError } = await supabase!.storage.from(DOCUMENTS_BUCKET).upload(path, file);
  if (uploadError) throw uploadError;
  const { data } = supabase!.storage.from(DOCUMENTS_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, name: file.name };
}
