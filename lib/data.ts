import { supabase } from "./supabase";

const PROPERTY_ID = "00000000-0000-0000-0000-000000000001";

export async function getProperty() {
  const { data } = await supabase.from("properties").select("*").eq("id", PROPERTY_ID).single();
  return data;
}

export async function getZones() {
  const { data } = await supabase.from("zones").select("*").eq("property_id", PROPERTY_ID).order("created_at");
  return data || [];
}

export async function createZone(zone: { name: string; type: string; color: string; geojson?: object | null; notes?: string | null }) {
  const { data, error } = await supabase.from("zones").insert({ ...zone, property_id: PROPERTY_ID }).select().single();
  if (error) throw error;
  return data;
}

export async function updateZone(id: string, updates: Partial<{ name: string; type: string; color: string; geojson: object | null; notes: string | null }>) {
  const { data, error } = await supabase.from("zones").update(updates).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteZone(id: string) {
  const { error } = await supabase.from("zones").delete().eq("id", id);
  if (error) throw error;
}

export async function getPlants() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await supabase.from("plants").select("*, zones(name, type, color)").order("created_at") as any;
  return data || [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createPlant(plant: Record<string, any>) {
  const { data, error } = await supabase.from("plants").insert(plant).select().single();
  if (error) throw error;
  return data;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updatePlant(id: string, updates: Record<string, any>) {
  const { data, error } = await supabase.from("plants").update(updates).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function deletePlant(id: string) {
  const { error } = await supabase.from("plants").delete().eq("id", id);
  if (error) throw error;
}

export async function getTasks() {
  const { data } = await supabase.from("tasks").select("*").eq("property_id", PROPERTY_ID).order("due_date");
  return data || [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createTask(task: Record<string, any>) {
  const { data, error } = await supabase.from("tasks").insert({ ...task, property_id: PROPERTY_ID }).select().single();
  if (error) throw error;
  return data;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateTask(id: string, updates: Record<string, any>) {
  const { data, error } = await supabase.from("tasks").update(updates).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteTask(id: string) {
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw error;
}

export async function getInventory() {
  const { data } = await supabase.from("inventory").select("*").eq("property_id", PROPERTY_ID).order("created_at");
  return data || [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createInventoryItem(item: Record<string, any>) {
  const { data, error } = await supabase.from("inventory").insert({ ...item, property_id: PROPERTY_ID }).select().single();
  if (error) throw error;
  return data;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateInventoryItem(id: string, updates: Record<string, any>) {
  const { data, error } = await supabase.from("inventory").update(updates).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteInventoryItem(id: string) {
  const { error } = await supabase.from("inventory").delete().eq("id", id);
  if (error) throw error;
}

export async function getHealthLogs(plantId: string) {
  const { data } = await supabase.from("health_logs").select("*").eq("plant_id", plantId).order("date", { ascending: false });
  return data || [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createHealthLog(log: Record<string, any>) {
  const { data, error } = await supabase.from("health_logs").insert(log).select().single();
  if (error) throw error;
  return data;
}
