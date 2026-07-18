import { supabase } from "@/lib/supabaseClient";
import type { UserProfile } from "@/types";

// Foto de perfil da tela Início: linha única (mesmo padrão de
// operation_settings) + um arquivo no Storage (bucket "avatars").

interface UserProfileRow {
  id: string;
  photo_url: string | null;
  photo_position_x: number;
  photo_position_y: number;
  photo_zoom: number;
}

function rowToProfile(row: UserProfileRow): UserProfile & { id: string } {
  return {
    id: row.id,
    photoUrl: row.photo_url,
    photoPositionX: Number(row.photo_position_x),
    photoPositionY: Number(row.photo_position_y),
    photoZoom: Number(row.photo_zoom),
  };
}

export async function fetchUserProfile(): Promise<(UserProfile & { id: string }) | null> {
  const { data, error } = await supabase!.from("user_profile").select("*").limit(1).maybeSingle();
  if (error) throw error;
  return data ? rowToProfile(data as UserProfileRow) : null;
}

export async function saveUserProfile(
  profileId: string | null,
  profile: UserProfile
): Promise<UserProfile & { id: string }> {
  const payload = {
    photo_url: profile.photoUrl,
    photo_position_x: profile.photoPositionX,
    photo_position_y: profile.photoPositionY,
    photo_zoom: profile.photoZoom,
  };

  const query = profileId
    ? supabase!.from("user_profile").update(payload).eq("id", profileId)
    : supabase!.from("user_profile").insert(payload);

  const { data, error } = await query.select().single();
  if (error) throw error;
  return rowToProfile(data as UserProfileRow);
}

// Sempre sobrescreve o mesmo arquivo ("avatar") — evita acumular fotos
// antigas no bucket a cada troca de foto.
export async function uploadAvatarPhoto(file: File): Promise<string> {
  const path = `avatar-${Date.now()}.${file.name.split(".").pop() ?? "jpg"}`;
  const { error: uploadError } = await supabase!.storage.from("avatars").upload(path, file, { upsert: true });
  if (uploadError) throw uploadError;
  const { data } = supabase!.storage.from("avatars").getPublicUrl(path);
  return data.publicUrl;
}
