-- YardMap Initial Schema
-- Run this in your Supabase SQL editor or via Supabase CLI

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Properties table
create table if not exists properties (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  address text not null,
  boundary_geojson jsonb,
  created_at timestamptz not null default now()
);

-- Zones table (areas on the property: lawn, garden beds, etc.)
create table if not exists zones (
  id uuid primary key default uuid_generate_v4(),
  property_id uuid references properties(id) on delete cascade,
  name text not null,
  type text not null check (type in ('lawn', 'garden_bed', 'tree', 'hardscape', 'irrigation', 'fence', 'other')),
  color text not null default '#4ade80',
  geojson jsonb,
  notes text,
  created_at timestamptz not null default now()
);

-- Plants table
create table if not exists plants (
  id uuid primary key default uuid_generate_v4(),
  zone_id uuid references zones(id) on delete set null,
  name text not null,
  species text,
  common_name text,
  date_planted date,
  source text,
  cost numeric(10,2),
  location_geojson jsonb,
  status text not null default 'healthy' check (status in ('healthy', 'needs_attention', 'dead')),
  notes text,
  created_at timestamptz not null default now()
);

-- Health logs table
create table if not exists health_logs (
  id uuid primary key default uuid_generate_v4(),
  plant_id uuid not null references plants(id) on delete cascade,
  date date not null default current_date,
  status text not null check (status in ('healthy', 'needs_attention', 'dead')),
  notes text,
  photo_url text,
  created_at timestamptz not null default now()
);

-- Tasks table
create table if not exists tasks (
  id uuid primary key default uuid_generate_v4(),
  property_id uuid references properties(id) on delete cascade,
  zone_id uuid references zones(id) on delete set null,
  plant_id uuid references plants(id) on delete set null,
  title text not null,
  due_date date not null,
  category text not null default 'other' check (category in ('water', 'fertilize', 'prune', 'plant', 'harvest', 'other')),
  recurrence text check (recurrence in ('daily', 'weekly', 'biweekly', 'monthly', 'yearly', null)),
  completed boolean not null default false,
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

-- Inventory / shed items
create table if not exists inventory (
  id uuid primary key default uuid_generate_v4(),
  property_id uuid references properties(id) on delete cascade,
  name text not null,
  category text not null default 'other' check (category in ('fertilizer', 'chemical', 'tool', 'seed', 'other')),
  quantity numeric(10,2) not null default 1,
  unit text not null default 'pcs',
  expiry_date date,
  cost numeric(10,2),
  notes text,
  created_at timestamptz not null default now()
);

-- Enable Row Level Security (optional — add policies as needed)
alter table properties enable row level security;
alter table zones enable row level security;
alter table plants enable row level security;
alter table health_logs enable row level security;
alter table tasks enable row level security;
alter table inventory enable row level security;

-- Basic RLS policy: allow all for authenticated users (customize for multi-user)
create policy "Allow all for authenticated users" on properties for all using (auth.role() = 'authenticated');
create policy "Allow all for authenticated users" on zones for all using (auth.role() = 'authenticated');
create policy "Allow all for authenticated users" on plants for all using (auth.role() = 'authenticated');
create policy "Allow all for authenticated users" on health_logs for all using (auth.role() = 'authenticated');
create policy "Allow all for authenticated users" on tasks for all using (auth.role() = 'authenticated');
create policy "Allow all for authenticated users" on inventory for all using (auth.role() = 'authenticated');

-- Indexes for common queries
create index if not exists zones_property_id_idx on zones(property_id);
create index if not exists plants_zone_id_idx on plants(zone_id);
create index if not exists health_logs_plant_id_idx on health_logs(plant_id);
create index if not exists tasks_due_date_idx on tasks(due_date);
create index if not exists tasks_property_id_idx on tasks(property_id);
create index if not exists inventory_property_id_idx on inventory(property_id);
