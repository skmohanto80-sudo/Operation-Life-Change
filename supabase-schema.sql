create table if not exists public.life_change_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  app_data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.life_change_profiles enable row level security;

create policy "users can read own profile"
on public.life_change_profiles
for select
using (auth.uid() = user_id);

create policy "users can insert own profile"
on public.life_change_profiles
for insert
with check (auth.uid() = user_id);

create policy "users can update own profile"
on public.life_change_profiles
for update
using (auth.uid() = user_id);
