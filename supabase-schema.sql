-- Fleet Management Database Schema for Supabase

-- 1. Create drivers table
create table if not exists drivers (
  id uuid default gen_random_uuid() primary key,
  phone text unique not null,
  full_name text not null,
  preferred_language text default 'en',
  created_at timestamp with time zone default now()
);

-- 2. Create vehicles table
create table if not exists vehicles (
  id uuid default gen_random_uuid() primary key,
  plate_number text unique not null,
  make text,
  model text,
  year text,
  status text default 'active' check (status in ('active', 'in_maintenance', 'out_of_service')),
  assigned_driver_id uuid references drivers(id) on delete set null,
  created_at timestamp with time zone default now()
);

-- 3. Create conversations table
create table if not exists conversations (
  id uuid default gen_random_uuid() primary key,
  phone text unique not null,
  name text,
  mode text not null default 'agent' check (mode in ('agent', 'human')),
  driver_id uuid references drivers(id) on delete set null,
  vehicle_id uuid references vehicles(id) on delete set null,
  active_issue_id text,
  updated_at timestamp with time zone default now(),
  created_at timestamp with time zone default now()
);

-- 4. Create messages table
create table if not exists messages (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid references conversations(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  whatsapp_msg_id text unique,
  media_url text,
  media_type text default 'text' check (media_type in ('text', 'image', 'audio', 'video', 'location')),
  location_lat double precision,
  location_lng double precision,
  created_at timestamp with time zone default now()
);

-- 5. Issue Counter Sequence for Issue IDs (e.g. LG-2026-000245)
create sequence if not exists issue_id_seq start 245;

-- 6. Create issues table
create table if not exists issues (
  id uuid default gen_random_uuid() primary key,
  issue_id text unique not null, -- Format: LG-2026-XXXXXX
  conversation_id uuid references conversations(id) on delete cascade not null,
  driver_id uuid references drivers(id) on delete set null,
  vehicle_id uuid references vehicles(id) on delete set null,
  category text not null, -- engine, brakes, battery, tyre, gearbox, fuel, electrical, coolant, overheating, smoke, other
  severity text not null check (severity in ('minor', 'major', 'critical')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  ai_diagnosis text,
  ai_confidence_score double precision default 0.85,
  root_cause text,
  suggested_solution text,
  video_guide_url text,
  resolution_notes text,
  created_at timestamp with time zone default now(),
  resolved_at timestamp with time zone
);

-- 7. Create indexes for performance
create index if not exists idx_messages_conversation on messages(conversation_id);
create index if not exists idx_conversations_updated on conversations(updated_at desc);
create index if not exists idx_issues_issue_id on issues(issue_id);
create index if not exists idx_issues_status on issues(status);

-- 8. Enable Realtime subscriptions
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table conversations;
alter publication supabase_realtime add table issues;
