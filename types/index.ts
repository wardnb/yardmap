export interface Plant {
  id: string;
  zone_id: string | null;
  name: string;
  species: string | null;
  common_name: string | null;
  date_planted: string | null;
  source: string | null;
  cost: number | null;
  location_geojson: object | null;
  status: "healthy" | "needs_attention" | "dead";
  notes: string | null;
}

export interface Zone {
  id: string;
  property_id: string;
  name: string;
  type: string;
  color: string;
  geojson: object | null;
  notes: string | null;
}

export interface Task {
  id: string;
  property_id: string | null;
  zone_id: string | null;
  plant_id: string | null;
  title: string;
  due_date: string;
  category: string;
  recurrence: string | null;
  completed: boolean;
  completed_at: string | null;
  notes: string | null;
}

export interface InventoryItem {
  id: string;
  property_id: string | null;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  expiry_date: string | null;
  cost: number | null;
  notes: string | null;
}

export interface HealthLog {
  id: string;
  plant_id: string;
  date: string;
  status: string;
  notes: string | null;
  photo_url: string | null;
}
