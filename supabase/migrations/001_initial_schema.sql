-- ============================================
-- OmniFlow Initial Schema
-- TASK-002: Database Schema & RLS
-- ============================================

-- ============================================
-- 1. Utility function: auto-update updated_at
-- ============================================

create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ============================================
-- 2. profiles
-- ============================================

create table profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text not null,
  name            text,
  credits_balance integer not null default 0,
  plan            text not null default 'free',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "Users access own profile"
  on profiles for all
  using (id = auth.uid());

create trigger profiles_updated_at
  before update on profiles
  for each row execute function update_updated_at_column();

-- Auto-create profile on user signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================
-- 3. projects
-- ============================================

create table projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  name        text not null,
  description text,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index projects_user_id_idx on projects(user_id);
create index projects_created_at_idx on projects(created_at desc);

alter table projects enable row level security;

create policy "Users access own projects"
  on projects for all
  using (user_id = auth.uid());

create trigger projects_updated_at
  before update on projects
  for each row execute function update_updated_at_column();

-- ============================================
-- 4. generations
-- ============================================

create table generations (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references projects(id) on delete cascade,
  user_id             uuid not null references profiles(id) on delete cascade,
  keyword             text not null,
  language            text not null,
  pins_requested      integer not null check (pins_requested > 0),
  website_url         text,
  pinterest_url       text,
  reference_image_url text,
  model_used          text not null,
  credits_used        integer not null default 0,
  status              text not null default 'pending',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index generations_user_id_idx on generations(user_id);
create index generations_project_id_idx on generations(project_id);
create index generations_status_idx on generations(status);
create index generations_created_at_idx on generations(created_at desc);

alter table generations enable row level security;

create policy "Users access own generations"
  on generations for all
  using (user_id = auth.uid());

create trigger generations_updated_at
  before update on generations
  for each row execute function update_updated_at_column();

-- ============================================
-- 5. pins
-- ============================================

create table pins (
  id              uuid primary key default gen_random_uuid(),
  generation_id   uuid not null references generations(id) on delete cascade,
  language        text not null,
  title           text not null,
  description     text not null,
  keywords        text not null,
  board           text not null,
  image_prompt    text not null,
  image_analysis  text,
  media_url       text,
  link_url        text,
  publish_date    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index pins_generation_id_idx on pins(generation_id);
create index pins_language_idx on pins(language);
create index pins_created_at_idx on pins(created_at desc);

alter table pins enable row level security;

create policy "Users access own pins"
  on pins for all
  using (
    generation_id in (
      select id from generations where user_id = auth.uid()
    )
  );

create trigger pins_updated_at
  before update on pins
  for each row execute function update_updated_at_column();
