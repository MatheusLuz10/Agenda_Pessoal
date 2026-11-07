import { supabase } from "@/lib/supabaseClient";
import type { Pet } from "@/types";

// Pets cadastrados na sub-aba "Pet" (ver src/pages/DocumentsPage.tsx) —
// perfil simples (nome, espécie, raça, cor, notas). Documentos de cada
// pet vivem em "documents" (pet_id), ver src/data/documentsApi.ts.

interface PetRow {
  id: string;
  name: string;
  species: string;
  breed: string;
  color: string;
  notes: string;
  created_at: string;
}

function rowToPet(row: PetRow): Pet {
  return {
    id: row.id,
    name: row.name,
    species: row.species as Pet["species"],
    breed: row.breed,
    color: row.color,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export async function fetchPets(): Promise<Pet[]> {
  const { data, error } = await supabase!.from("pets").select("*").order("created_at", { ascending: true });
  if (error) throw error;
  return (data as PetRow[]).map(rowToPet);
}

export async function createPet(pet: Omit<Pet, "id" | "createdAt">): Promise<Pet> {
  const { data, error } = await supabase!
    .from("pets")
    .insert({ name: pet.name, species: pet.species, breed: pet.breed, color: pet.color, notes: pet.notes })
    .select()
    .single();
  if (error) throw error;
  return rowToPet(data as PetRow);
}

export async function removePet(id: string): Promise<void> {
  const { error } = await supabase!.from("pets").delete().eq("id", id);
  if (error) throw error;
}
