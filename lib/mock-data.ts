// Mock data — cleared for real use. Supabase is the source of truth.
import type { Zone, Plant, Task, InventoryItem } from "@/types";

export const mockProperty = {
  id: "00000000-0000-0000-0000-000000000001",
  name: "Home",
  address: "1600 E Victory Rd, Boise, ID 83706",
  boundary_geojson: null,
  created_at: new Date().toISOString(),
};

export const mockZones: Zone[] = [];
export const mockPlants: Plant[] = [];
export const mockTasks: Task[] = [];
export const mockInventory: InventoryItem[] = [];
export const mockHealthLogs: { id: string; plant_id: string; date: string; status: string; notes: string | null; photo_url: string | null }[] = [];

export const seasonalTips: Record<number, string[]> = {
  1:  ["Prune dormant trees and shrubs", "Order seeds for spring", "Check stored bulbs for rot"],
  2:  ["Start seeds indoors (tomatoes, peppers)", "Cut back ornamental grasses", "Apply dormant oil spray to fruit trees"],
  3:  ["Divide perennials", "Apply pre-emergent herbicide", "Plant cool-season veggies (lettuce, spinach, peas)"],
  4:  ["Last frost risk in Boise — hold off on tender plants", "Fertilize lawn", "Plant trees and shrubs"],
  5:  ["After May 15 frost date: plant tomatoes, peppers, squash", "Mulch garden beds", "Install drip irrigation"],
  6:  ["Deep water trees weekly", "Deadhead flowers for continued bloom", "Watch for aphids and spider mites"],
  7:  ["Water early morning to reduce evaporation", "Harvest zucchini before it gets too large", "Mow high (3.5\") during heat"],
  8:  ["Sow fall crops (carrots, beets, lettuce)", "Reduce watering as temps cool", "Plant fall bulbs late month"],
  9:  ["Plant garlic", "Divide and transplant perennials", "Overseed thin lawn areas"],
  10: ["Cut back frost-killed annuals", "Mulch perennial beds for winter", "Dig and store tender bulbs"],
  11: ["Plant spring bulbs before ground freezes", "Final lawn fertilization", "Winterize irrigation"],
  12: ["Plan next year's garden", "Order seed catalogs", "Protect sensitive plants from hard freezes"],
};
