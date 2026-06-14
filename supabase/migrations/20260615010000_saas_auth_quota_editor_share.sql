create extension if not exists pgcrypto;

alter table public.uploads
  add column if not exists owner_id uuid references auth.users(id) on delete set null,
  add column if not exists visibility text not null default 'private' check (visibility in ('private', 'public', 'unlisted')),
  add column if not exists source_scope text not null default 'user' check (source_scope in ('user', 'official', 'community', 'system'));

alter table public.roast_profiles
  add column if not exists owner_id uuid references auth.users(id) on delete set null,
  add column if not exists visibility text not null default 'private' check (visibility in ('private', 'public', 'unlisted')),
  add column if not exists source_scope text not null default 'user' check (source_scope in ('user', 'official', 'community', 'system'));

alter table public.roast_logs
  add column if not exists owner_id uuid references auth.users(id) on delete set null,
  add column if not exists visibility text not null default 'private' check (visibility in ('private', 'public', 'unlisted')),
  add column if not exists source_scope text not null default 'user' check (source_scope in ('user', 'official', 'community', 'system'));

alter table public.roast_cases
  add column if not exists owner_id uuid references auth.users(id) on delete set null,
  add column if not exists visibility text not null default 'private' check (visibility in ('private', 'public', 'unlisted')),
  add column if not exists source_scope text not null default 'user' check (source_scope in ('user', 'official', 'community', 'system'));

alter table public.uploads drop constraint if exists uploads_file_hash_key;
create unique index if not exists uploads_owner_hash_idx on public.uploads(owner_id, file_hash) where owner_id is not null;
create unique index if not exists uploads_public_hash_idx on public.uploads(file_hash) where owner_id is null;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  locale text not null default 'zh' check (locale in ('zh', 'en')),
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_code text not null check (plan_code in ('free', 'balanced', 'pro')),
  status text not null default 'active' check (status in ('active', 'inactive', 'cancelled', 'past_due')),
  daily_limit integer not null,
  monthly_limit integer not null,
  price_cny numeric(10, 2) not null default 0,
  provider text not null default 'manual',
  provider_subscription_id text,
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null,
  reason text not null,
  provider text not null default 'manual',
  payment_order_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  upload_id uuid references public.uploads(id) on delete set null,
  event_type text not null default 'upload_analysis',
  status text not null check (status in ('charged', 'failed', 'refunded')),
  charge_source text not null check (charge_source in ('subscription', 'credits', 'free', 'none')),
  units integer not null default 1 check (units > 0),
  usage_day date not null,
  usage_month text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'manual',
  order_type text not null check (order_type in ('subscription', 'credits')),
  plan_code text,
  credit_units integer,
  amount_cny numeric(10, 2) not null default 0,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'cancelled', 'refunded')),
  provider_order_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.credit_transactions
  drop constraint if exists credit_transactions_payment_order_id_fkey,
  add constraint credit_transactions_payment_order_id_fkey foreign key (payment_order_id) references public.payment_orders(id) on delete set null;

create table if not exists public.curve_documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  short_name text,
  designer text,
  description text,
  recommended_level numeric,
  expected_first_crack_temp numeric,
  expected_colour_change_temp numeric,
  roast_levels jsonb not null default '[]'::jsonb,
  roast_curve_points jsonb not null default '[]'::jsonb,
  fan_curve_points jsonb not null default '[]'::jsonb,
  raw_fields jsonb not null default '{}'::jsonb,
  visibility text not null default 'private' check (visibility in ('private', 'public', 'unlisted')),
  source_profile_id uuid references public.roast_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.curve_versions (
  id uuid primary key default gen_random_uuid(),
  curve_document_id uuid not null references public.curve_documents(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  version_number integer not null,
  snapshot jsonb not null,
  note text,
  created_at timestamptz not null default now(),
  unique(curve_document_id, version_number)
);

create table if not exists public.share_pages (
  id uuid primary key default gen_random_uuid(),
  curve_document_id uuid not null references public.curve_documents(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  slug text not null unique,
  template text not null default 'barista' check (template in ('barista', 'baroque', 'cyberpunk')),
  title text not null,
  summary text not null,
  ai_prediction text not null,
  quote_text text not null,
  quote_author text not null,
  quote_work text,
  quote_source_note text,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_plans_user_status_idx on public.user_plans(user_id, status);
create index if not exists usage_events_user_day_idx on public.usage_events(user_id, usage_day, status);
create index if not exists usage_events_user_month_idx on public.usage_events(user_id, usage_month, status);
create index if not exists credit_transactions_user_idx on public.credit_transactions(user_id);
create index if not exists curve_documents_owner_idx on public.curve_documents(owner_id, updated_at desc);
create index if not exists share_pages_slug_idx on public.share_pages(slug);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists user_plans_set_updated_at on public.user_plans;
create trigger user_plans_set_updated_at before update on public.user_plans
for each row execute function public.set_updated_at();

drop trigger if exists payment_orders_set_updated_at on public.payment_orders;
create trigger payment_orders_set_updated_at before update on public.payment_orders
for each row execute function public.set_updated_at();

drop trigger if exists curve_documents_set_updated_at on public.curve_documents;
create trigger curve_documents_set_updated_at before update on public.curve_documents
for each row execute function public.set_updated_at();

drop trigger if exists share_pages_set_updated_at on public.share_pages;
create trigger share_pages_set_updated_at before update on public.share_pages
for each row execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

alter table public.profiles enable row level security;
alter table public.user_plans enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.usage_events enable row level security;
alter table public.payment_orders enable row level security;
alter table public.curve_documents enable row level security;
alter table public.curve_versions enable row level security;
alter table public.share_pages enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select using ((select auth.uid()) = id);
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update using ((select auth.uid()) = id);
drop policy if exists user_plans_select_own on public.user_plans;
create policy user_plans_select_own on public.user_plans for select using ((select auth.uid()) = user_id);
drop policy if exists credit_transactions_select_own on public.credit_transactions;
create policy credit_transactions_select_own on public.credit_transactions for select using ((select auth.uid()) = user_id);
drop policy if exists usage_events_select_own on public.usage_events;
create policy usage_events_select_own on public.usage_events for select using ((select auth.uid()) = user_id);
drop policy if exists payment_orders_select_own on public.payment_orders;
create policy payment_orders_select_own on public.payment_orders for select using ((select auth.uid()) = user_id);
drop policy if exists curve_documents_select_own_or_public on public.curve_documents;
create policy curve_documents_select_own_or_public on public.curve_documents for select using ((select auth.uid()) = owner_id or visibility in ('public', 'unlisted'));
drop policy if exists curve_documents_write_own on public.curve_documents;
create policy curve_documents_write_own on public.curve_documents for all using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
drop policy if exists curve_versions_select_own on public.curve_versions;
create policy curve_versions_select_own on public.curve_versions for select using ((select auth.uid()) = owner_id);
drop policy if exists curve_versions_insert_own on public.curve_versions;
create policy curve_versions_insert_own on public.curve_versions for insert with check ((select auth.uid()) = owner_id);
drop policy if exists share_pages_select_public_or_own on public.share_pages;
create policy share_pages_select_public_or_own on public.share_pages for select using (is_public or (select auth.uid()) = owner_id);
drop policy if exists share_pages_write_own on public.share_pages;
create policy share_pages_write_own on public.share_pages for all using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

drop policy if exists uploads_select_own_or_public on public.uploads;
create policy uploads_select_own_or_public on public.uploads for select using ((select auth.uid()) = owner_id or visibility in ('public', 'unlisted'));
drop policy if exists roast_profiles_select_own_or_public on public.roast_profiles;
create policy roast_profiles_select_own_or_public on public.roast_profiles for select using ((select auth.uid()) = owner_id or visibility in ('public', 'unlisted'));
drop policy if exists roast_logs_select_own on public.roast_logs;
create policy roast_logs_select_own on public.roast_logs for select using ((select auth.uid()) = owner_id);
drop policy if exists roast_cases_select_own_or_public on public.roast_cases;
create policy roast_cases_select_own_or_public on public.roast_cases for select using ((select auth.uid()) = owner_id or visibility in ('public', 'unlisted'));
