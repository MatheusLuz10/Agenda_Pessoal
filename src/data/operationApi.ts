import { supabase } from "@/lib/supabaseClient";
import type { FinancialOverrides, OperationActivity, OperationSettings, PunchRecord } from "@/types";

// Mesma ideia de src/data/workApi.ts: isola o formato das tabelas do
// Postgres (snake_case) do formato usado no app (camelCase).

interface OperationActivityRow {
  id: string;
  type: OperationActivity["type"];
  date: string;
  quantity: number;
  description: string | null;
  created_at: string;
}

interface OperationPunchRow {
  id: string;
  date: string;
  clock_in: string;
  lunch_start: string;
  lunch_end: string;
  clock_out: string;
  created_at: string;
}

interface OperationSettingsRow {
  id: string;
  cycle_start_day: number;
  cycle_end_day: number;
  base_salary: number;
  hazard_pay_percent: number;
  weekly_hours: number;
  effectiveness_percent: number;
  updated_at: string;
}

function rowToActivity(row: OperationActivityRow): OperationActivity {
  return {
    id: row.id,
    type: row.type,
    date: row.date,
    quantity: row.quantity,
    description: row.description ?? undefined,
    createdAt: row.created_at,
  };
}

// HH:mm:ss (formato "time" do Postgres) -> HH:mm (formato usado no app).
function rowToPunch(row: OperationPunchRow): PunchRecord {
  return {
    id: row.id,
    date: row.date,
    clockIn: row.clock_in.slice(0, 5),
    lunchStart: row.lunch_start.slice(0, 5),
    lunchEnd: row.lunch_end.slice(0, 5),
    clockOut: row.clock_out.slice(0, 5),
    createdAt: row.created_at,
  };
}

function rowToSettings(row: OperationSettingsRow): OperationSettings & { id: string } {
  return {
    id: row.id,
    cycleStartDay: row.cycle_start_day,
    cycleEndDay: row.cycle_end_day,
    baseSalary: Number(row.base_salary),
    hazardPayPercent: Number(row.hazard_pay_percent),
    weeklyHours: Number(row.weekly_hours),
    effectivenessPercent: Number(row.effectiveness_percent),
  };
}

export async function fetchOperationActivities(): Promise<OperationActivity[]> {
  const { data, error } = await supabase!
    .from("operation_activities")
    .select("*")
    .order("date", { ascending: false });
  if (error) throw error;
  return (data as OperationActivityRow[]).map(rowToActivity);
}

export async function createOperationActivity(
  activity: Omit<OperationActivity, "id" | "createdAt">
): Promise<OperationActivity> {
  const { data, error } = await supabase!
    .from("operation_activities")
    .insert({
      type: activity.type,
      date: activity.date,
      quantity: activity.quantity,
      description: activity.description || null,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToActivity(data as OperationActivityRow);
}

export async function updateOperationActivity(
  activityId: string,
  activity: Omit<OperationActivity, "id" | "createdAt">
): Promise<OperationActivity> {
  const { data, error } = await supabase!
    .from("operation_activities")
    .update({
      type: activity.type,
      date: activity.date,
      quantity: activity.quantity,
      description: activity.description || null,
    })
    .eq("id", activityId)
    .select()
    .single();
  if (error) throw error;
  return rowToActivity(data as OperationActivityRow);
}

export async function removeOperationActivity(activityId: string) {
  const { error } = await supabase!.from("operation_activities").delete().eq("id", activityId);
  if (error) throw error;
}

export async function fetchOperationPunches(): Promise<PunchRecord[]> {
  const { data, error } = await supabase!
    .from("operation_punches")
    .select("*")
    .order("date", { ascending: false });
  if (error) throw error;
  return (data as OperationPunchRow[]).map(rowToPunch);
}

// Upsert por data (a tabela tem `date` como unique): salvar um ponto do
// mesmo dia duas vezes substitui o registro em vez de duplicar.
export async function saveOperationPunch(punch: Omit<PunchRecord, "id" | "createdAt">): Promise<PunchRecord> {
  const { data, error } = await supabase!
    .from("operation_punches")
    .upsert(
      {
        date: punch.date,
        clock_in: punch.clockIn,
        lunch_start: punch.lunchStart,
        lunch_end: punch.lunchEnd,
        clock_out: punch.clockOut,
      },
      { onConflict: "date" }
    )
    .select()
    .single();
  if (error) throw error;
  return rowToPunch(data as OperationPunchRow);
}

export async function removeOperationPunch(punchId: string) {
  const { error } = await supabase!.from("operation_punches").delete().eq("id", punchId);
  if (error) throw error;
}

// Configurações são uma linha única. fetchOperationSettings devolve null
// se a tabela ainda estiver vazia (primeiro uso) — o contexto decide o
// que fazer nesse caso (usar valores padrão).
export async function fetchOperationSettings(): Promise<(OperationSettings & { id: string }) | null> {
  const { data, error } = await supabase!.from("operation_settings").select("*").limit(1).maybeSingle();
  if (error) throw error;
  return data ? rowToSettings(data as OperationSettingsRow) : null;
}

export async function saveOperationSettings(
  settingsId: string | null,
  settings: OperationSettings
): Promise<OperationSettings & { id: string }> {
  const payload = {
    cycle_start_day: settings.cycleStartDay,
    cycle_end_day: settings.cycleEndDay,
    base_salary: settings.baseSalary,
    hazard_pay_percent: settings.hazardPayPercent,
    weekly_hours: settings.weeklyHours,
    effectiveness_percent: settings.effectivenessPercent,
  };

  const query = settingsId
    ? supabase!.from("operation_settings").update(payload).eq("id", settingsId)
    : supabase!.from("operation_settings").insert(payload);

  const { data, error } = await query.select().single();
  if (error) throw error;
  return rowToSettings(data as OperationSettingsRow);
}

interface OperationFinancialOverridesRow {
  cycle_start: string;
  base_salary: number | null;
  hazard_pay: number | null;
  overtime50_amount: number | null;
  overtime100_amount: number | null;
  dsr_amount: number | null;
  prize_amount: number | null;
}

function rowToFinancialOverrides(row: OperationFinancialOverridesRow): FinancialOverrides {
  return {
    baseSalary: row.base_salary,
    hazardPay: row.hazard_pay,
    overtime50Amount: row.overtime50_amount,
    overtime100Amount: row.overtime100_amount,
    dsrAmount: row.dsr_amount,
    prizeAmount: row.prize_amount,
  };
}

// Ajustes manuais do Card "Resumo financeiro", uma linha por ciclo
// (identificado por cycleStart). Devolve null quando o ciclo ainda não
// tem nenhum ajuste salvo — nesse caso todos os valores são calculados.
export async function fetchFinancialOverrides(cycleStart: string): Promise<FinancialOverrides | null> {
  const { data, error } = await supabase!
    .from("operation_financial_overrides")
    .select("*")
    .eq("cycle_start", cycleStart)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToFinancialOverrides(data as OperationFinancialOverridesRow) : null;
}

export async function saveFinancialOverrides(cycleStart: string, overrides: FinancialOverrides): Promise<void> {
  const { error } = await supabase!.from("operation_financial_overrides").upsert(
    {
      cycle_start: cycleStart,
      base_salary: overrides.baseSalary,
      hazard_pay: overrides.hazardPay,
      overtime50_amount: overrides.overtime50Amount,
      overtime100_amount: overrides.overtime100Amount,
      dsr_amount: overrides.dsrAmount,
      prize_amount: overrides.prizeAmount,
    },
    { onConflict: "cycle_start" }
  );
  if (error) throw error;
}
