import { supabase } from "@/lib/supabaseClient";

// Guarda cada "batimento de caixa" gerado, mas só os 3 mais recentes —
// depois de cada insert, apaga o que sobrar além disso (ver
// saveBatimentoReport) para não acumular histórico sem necessidade.

export interface BatimentoReportPayload {
  atendente: string;
  protocolo: string;
  caixaBatida: string;
  portasLivres: string;
  portaUtilizada: string | null;
  obs: string | null;
}

export async function saveBatimentoReport(payload: BatimentoReportPayload): Promise<void> {
  const { error: insertError } = await supabase!.from("batimento_reports").insert({
    atendente: payload.atendente,
    protocolo: payload.protocolo,
    caixa_batida: payload.caixaBatida,
    portas_livres: payload.portasLivres,
    porta_utilizada: payload.portaUtilizada,
    obs: payload.obs,
  });
  if (insertError) throw insertError;

  const { data, error: fetchError } = await supabase!
    .from("batimento_reports")
    .select("id")
    .order("created_at", { ascending: false });
  if (fetchError) throw fetchError;

  const staleIds = (data ?? []).slice(3).map((row) => row.id as string);
  if (staleIds.length > 0) {
    await supabase!.from("batimento_reports").delete().in("id", staleIds);
  }
}
