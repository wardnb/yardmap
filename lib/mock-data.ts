// Mock data for demo purposes — replace with real Supabase data
export const mockProperty = {
  id: "prop-1",
  name: "Home — Boise",
  address: "123 Garden Way, Boise, ID 83702",
  boundary_geojson: null,
  created_at: "2024-03-01T00:00:00Z",
};

export const mockZones = [
  { id: "z1", property_id: "prop-1", name: "Front Lawn", type: "lawn", color: "#4ade80", geojson: null, notes: "Kentucky bluegrass, mow weekly in summer" },
  { id: "z2", property_id: "prop-1", name: "North Garden Bed", type: "garden_bed", color: "#a78bfa", geojson: null, notes: "Perennial border" },
  { id: "z3", property_id: "prop-1", name: "Back Patio", type: "hardscape", color: "#94a3b8", geojson: null, notes: "Concrete patio with raised planters" },
  { id: "z4", property_id: "prop-1", name: "Vegetable Garden", type: "garden_bed", color: "#fb923c", geojson: null, notes: "Raised bed veggie garden, zone 6b" },
  { id: "z5", property_id: "prop-1", name: "Drip Irrigation Zone 1", type: "irrigation", color: "#38bdf8", geojson: null, notes: "Covers front lawn and north bed" },
];

export const mockPlants = [
  {
    id: "p1", zone_id: "z2", name: "Russian Sage", species: "Perovskia atriplicifolia",
    common_name: "Russian Sage", date_planted: "2023-05-15", source: "Zamzows Boise",
    cost: 12.99, location_geojson: null, status: "healthy" as const,
    notes: "Cut back hard in spring. Blooms July-Sept.",
  },
  {
    id: "p2", zone_id: "z2", name: "Purple Coneflower", species: "Echinacea purpurea",
    common_name: "Echinacea", date_planted: "2023-05-15", source: "Zamzows Boise",
    cost: 9.99, location_geojson: null, status: "healthy" as const,
    notes: "Deadhead to extend bloom. Leave seed heads for birds.",
  },
  {
    id: "p3", zone_id: "z4", name: "Tomato — Celebrity", species: "Solanum lycopersicum",
    common_name: "Tomato", date_planted: "2024-05-25", source: "Home Depot",
    cost: 4.99, location_geojson: null, status: "needs_attention" as const,
    notes: "Needs staking. Watch for blight.",
  },
  {
    id: "p4", zone_id: "z4", name: "Zucchini", species: "Cucurbita pepo",
    common_name: "Zucchini", date_planted: "2024-05-25", source: "Seed — Baker Creek",
    cost: 3.50, location_geojson: null, status: "healthy" as const,
    notes: "Prolific producer. Check daily in July.",
  },
  {
    id: "p5", zone_id: "z2", name: "Karl Foerster Grass", species: "Calamagrostis × acutiflora",
    common_name: "Feather Reed Grass", date_planted: "2022-09-10", source: "Zamzows Boise",
    cost: 24.99, location_geojson: null, status: "healthy" as const,
    notes: "Cut to 4 inches in late Feb/early March.",
  },
  {
    id: "p6", zone_id: "z3", name: "Patio Rose", species: "Rosa 'Knock Out'",
    common_name: "Knock Out Rose", date_planted: "2023-06-01", source: "Les Bois Nursery",
    cost: 29.99, location_geojson: null, status: "needs_attention" as const,
    notes: "Black spot on lower leaves. Treat with neem oil.",
  },
];

export const mockTasks = [
  { id: "t1", property_id: "prop-1", zone_id: "z1", plant_id: null, title: "Mow front lawn", due_date: "2024-07-15", category: "other", recurrence: "weekly", completed: false, completed_at: null, notes: "3.5 inch cut height" },
  { id: "t2", property_id: "prop-1", zone_id: null, plant_id: "p3", title: "Stake tomatoes", due_date: "2024-07-10", category: "other", recurrence: null, completed: false, completed_at: null, notes: "Use bamboo stakes" },
  { id: "t3", property_id: "prop-1", zone_id: "z2", plant_id: null, title: "Fertilize perennial bed", due_date: "2024-07-20", category: "fertilize", recurrence: "monthly", completed: false, completed_at: null, notes: "Use slow-release granular 10-10-10" },
  { id: "t4", property_id: "prop-1", zone_id: null, plant_id: "p6", title: "Spray rose with neem oil", due_date: "2024-07-12", category: "other", recurrence: "weekly", completed: false, completed_at: null, notes: "Apply in evening, avoid hot sun" },
  { id: "t5", property_id: "prop-1", zone_id: "z4", plant_id: null, title: "Harvest zucchini", due_date: "2024-07-11", category: "harvest", recurrence: "weekly", completed: true, completed_at: "2024-07-11T10:00:00Z", notes: "" },
  { id: "t6", property_id: "prop-1", zone_id: "z5", plant_id: null, title: "Check drip irrigation heads", due_date: "2024-07-18", category: "water", recurrence: "monthly", completed: false, completed_at: null, notes: "Look for clogged emitters" },
];

export const mockInventory = [
  { id: "i1", property_id: "prop-1", name: "Scotts Turf Builder", category: "fertilizer", quantity: 1.5, unit: "bags", expiry_date: null, cost: 34.99, notes: "For lawn — spring and fall" },
  { id: "i2", property_id: "prop-1", name: "Neem Oil Concentrate", category: "chemical", quantity: 0.5, unit: "qt", expiry_date: "2025-12-01", cost: 18.99, notes: "Mix 2 tbsp/gallon for fungal issues" },
  { id: "i3", property_id: "prop-1", name: "Osmocote Plus", category: "fertilizer", quantity: 2, unit: "lbs", expiry_date: null, cost: 22.99, notes: "Slow-release for containers and beds" },
  { id: "i4", property_id: "prop-1", name: "Tomato Cages (6)", category: "tool", quantity: 6, unit: "pcs", expiry_date: null, cost: 24.99, notes: "Heavy gauge wire, stored in shed" },
  { id: "i5", property_id: "prop-1", name: "Zucchini (Black Beauty)", category: "seed", quantity: 20, unit: "seeds", expiry_date: "2026-01-01", cost: 3.50, notes: "Baker Creek. Store cool and dry." },
  { id: "i6", property_id: "prop-1", name: "Round-Up Concentrate", category: "chemical", quantity: 1, unit: "qt", expiry_date: "2025-06-01", cost: 29.99, notes: "Use carefully near garden beds" },
  { id: "i7", property_id: "prop-1", name: "Bark Mulch", category: "other", quantity: 3, unit: "cu yd", expiry_date: null, cost: 75.00, notes: "Double-shredded cedar, front bed" },
];

export const mockHealthLogs = [
  { id: "hl1", plant_id: "p3", date: "2024-07-08", status: "needs_attention", notes: "Bottom leaves yellowing, possible over-watering or early blight. Will monitor.", photo_url: null },
  { id: "hl2", plant_id: "p6", date: "2024-07-06", status: "needs_attention", notes: "Black spot fungus on 3 lower canes. Removed affected leaves, ordered neem oil.", photo_url: null },
  { id: "hl3", plant_id: "p1", date: "2024-07-01", status: "healthy", notes: "Looking great! Buds forming for July bloom.", photo_url: null },
];

// Seasonal tips for Boise zone 6b
export const seasonalTips: Record<number, string[]> = {
  1: ["Prune dormant fruit trees and shrubs", "Order seeds for spring planting", "Test soil pH while beds are empty", "Check stored bulbs for rot"],
  2: ["Start onions, leeks, and celery seeds indoors", "Cut ornamental grasses back to 4 inches", "Apply dormant oil spray to fruit trees", "Check irrigation system for winter damage"],
  3: ["Direct sow cool-season crops: peas, spinach, lettuce", "Divide overgrown perennials", "Apply pre-emergent herbicide for weed control", "Start tomatoes and peppers indoors (late March)"],
  4: ["Transplant cool-season seedlings outside", "Fertilize lawn with slow-release nitrogen", "Plant bare-root roses", "Last frost typically April 22 — protect tender plants"],
  5: ["After May 15: safe to transplant warm-season crops", "Plant tomatoes, peppers, squash outdoors", "Overseed bare lawn spots", "Begin regular drip irrigation schedule"],
  6: ["Deep-water trees and shrubs weekly in heat", "Mulch beds 2–3 inches to retain moisture", "Deadhead perennials to extend bloom", "Watch for aphids and treat early"],
  7: ["Water lawn early morning to reduce evaporation", "Harvest frequently to encourage production", "Pinch basil flowers to keep bushy", "Check for powdery mildew in humid stretches"],
  8: ["Plant fall garlic cloves (late August)", "Direct sow carrots and beets for fall harvest", "Divide irises after bloom fades", "Order spring bulbs for fall planting"],
  9: ["Plant spring bulbs: tulips, daffodils, alliums", "Overseed lawn in early September", "Harvest winter squash before first frost", "First frost window: late October"],
  10: ["Plant garlic for next year", "Dig and store tender bulbs (dahlias, cannas)", "Apply fall fertilizer to lawn", "Mulch perennial beds for winter protection"],
  11: ["Plant bare-root trees and shrubs while dormant", "Drain and winterize irrigation system", "Clean and sharpen tools for storage", "Compost fallen leaves"],
  12: ["Review the season: what worked, what didn't", "Update plant records and maps", "Plan next year's garden layout", "Check seed inventory and order early"],
};

export function getCurrentSeasonalTip(): string {
  const month = new Date().getMonth() + 1;
  const tips = seasonalTips[month] || [];
  return tips[0] || "Enjoy your garden!";
}
