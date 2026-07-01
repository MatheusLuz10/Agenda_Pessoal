import { supabase } from "@/lib/supabaseClient";
import type { EquipmentItem, ServiceOrder } from "@/types";

// Mesma ideia de src/data/supabaseApi.ts e src/data/financeApi.ts: isola
// o formato das tabelas do Postgres (snake_case) do formato usado no app
// (camelCase).

interface EquipmentItemRow {
  id: string;
  name: string;
  category: EquipmentItem["category"];
  condition: EquipmentItem["condition"];
  observation: string | null;
  created_at: string;
}

interface ServiceOrderRow {
  id: string;
  client: string;
  description: string;
  date: string;
  status: ServiceOrder["status"];
  observation: string | null;
  created_at: string;
}

function rowToEquipmentItem(row: EquipmentItemRow): EquipmentItem {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    condition: row.condition,
    observation: row.observation ?? "",
    createdAt: row.created_at,
  };
}

function rowToServiceOrder(row: ServiceOrderRow): ServiceOrder {
  return {
    id: row.id,
    client: row.client,
    description: row.description,
    date: row.date,
    status: row.status,
    observation: row.observation ?? "",
    createdAt: row.created_at,
  };
}

export async function fetchEquipmentItems(): Promise<EquipmentItem[]> {
  const { data, error } = await supabase!
    .from("equipment_items")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as EquipmentItemRow[]).map(rowToEquipmentItem);
}

export async function fetchServiceOrders(): Promise<ServiceOrder[]> {
  const { data, error } = await supabase!
    .from("service_orders")
    .select("*")
    .order("date", { ascending: false });
  if (error) throw error;
  return (data as ServiceOrderRow[]).map(rowToServiceOrder);
}

export async function createEquipmentItem(
  item: Omit<EquipmentItem, "id" | "createdAt">
): Promise<EquipmentItem> {
  const { data, error } = await supabase!
    .from("equipment_items")
    .insert({
      name: item.name,
      category: item.category,
      condition: item.condition,
      observation: item.observation || null,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToEquipmentItem(data as EquipmentItemRow);
}

export async function updateEquipmentItem(
  itemId: string,
  item: Omit<EquipmentItem, "id" | "createdAt">
): Promise<EquipmentItem> {
  const { data, error } = await supabase!
    .from("equipment_items")
    .update({
      name: item.name,
      category: item.category,
      condition: item.condition,
      observation: item.observation || null,
    })
    .eq("id", itemId)
    .select()
    .single();
  if (error) throw error;
  return rowToEquipmentItem(data as EquipmentItemRow);
}

export async function removeEquipmentItem(itemId: string) {
  const { error } = await supabase!.from("equipment_items").delete().eq("id", itemId);
  if (error) throw error;
}

export async function createServiceOrder(
  order: Omit<ServiceOrder, "id" | "createdAt">
): Promise<ServiceOrder> {
  const { data, error } = await supabase!
    .from("service_orders")
    .insert({
      client: order.client,
      description: order.description,
      date: order.date,
      status: order.status,
      observation: order.observation || null,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToServiceOrder(data as ServiceOrderRow);
}

export async function updateServiceOrder(
  orderId: string,
  order: Omit<ServiceOrder, "id" | "createdAt">
): Promise<ServiceOrder> {
  const { data, error } = await supabase!
    .from("service_orders")
    .update({
      client: order.client,
      description: order.description,
      date: order.date,
      status: order.status,
      observation: order.observation || null,
    })
    .eq("id", orderId)
    .select()
    .single();
  if (error) throw error;
  return rowToServiceOrder(data as ServiceOrderRow);
}

export async function removeServiceOrder(orderId: string) {
  const { error } = await supabase!.from("service_orders").delete().eq("id", orderId);
  if (error) throw error;
}
