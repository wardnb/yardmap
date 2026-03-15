-- Optional seed data for YardMap
-- Run after 001_initial_schema.sql

-- Insert default property
insert into properties (id, name, address) values
  ('00000000-0000-0000-0000-000000000001', 'Home — Boise', '123 Garden Way, Boise, ID 83702')
on conflict (id) do nothing;

-- Insert default zones
insert into zones (property_id, name, type, color, notes) values
  ('00000000-0000-0000-0000-000000000001', 'Front Lawn', 'lawn', '#4ade80', 'Kentucky bluegrass, mow weekly in summer'),
  ('00000000-0000-0000-0000-000000000001', 'North Garden Bed', 'garden_bed', '#a78bfa', 'Perennial border'),
  ('00000000-0000-0000-0000-000000000001', 'Back Patio', 'hardscape', '#94a3b8', 'Concrete patio with raised planters'),
  ('00000000-0000-0000-0000-000000000001', 'Vegetable Garden', 'garden_bed', '#fb923c', 'Raised bed veggie garden, zone 6b'),
  ('00000000-0000-0000-0000-000000000001', 'Drip Irrigation Zone 1', 'irrigation', '#38bdf8', 'Covers front lawn and north bed')
on conflict do nothing;
