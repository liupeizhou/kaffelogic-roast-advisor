create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from storage.buckets where id = 'kaffelogic-uploads') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'kaffelogic-uploads',
      'kaffelogic-uploads',
      false,
      6291456,
      array[
        'text/plain',
        'application/octet-stream',
        'image/png',
        'image/jpeg',
        'image/webp',
        'image/heic',
        'image/heif'
      ]
    );
  end if;
end $$;

create table if not exists public.uploads (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  file_hash text not null unique,
  file_kind text not null check (file_kind in ('kpro', 'log_image', 'unknown')),
  mime_type text not null,
  storage_path text,
  size_bytes integer not null check (size_bytes > 0),
  parse_status text not null check (parse_status in ('parsed', 'needs_review', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.roast_profiles (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null unique references public.uploads(id) on delete cascade,
  file_name text not null,
  display_name text not null,
  short_name text,
  designer text,
  description text,
  source_type text not null default 'uploaded',
  target_brew text not null default 'filter',
  process_fit text not null default 'any',
  altitude_range jsonb,
  recommended_level numeric,
  expected_first_crack_temp numeric,
  expected_colour_change_temp numeric,
  roast_levels jsonb not null default '[]'::jsonb,
  roast_curve_points jsonb not null default '[]'::jsonb,
  fan_curve_points jsonb not null default '[]'::jsonb,
  raw_fields jsonb not null default '{}'::jsonb,
  user_tags jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.roast_logs (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null unique references public.uploads(id) on delete cascade,
  ai_analysis jsonb not null default '{}'::jsonb,
  confirmed_analysis jsonb,
  user_corrections jsonb,
  confidence numeric not null default 0 check (confidence >= 0 and confidence <= 1),
  needs_review boolean not null default true,
  parse_status text not null check (parse_status in ('parsed', 'needs_review', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.roast_cases (
  id uuid primary key default gen_random_uuid(),
  roast_log_id uuid references public.roast_logs(id) on delete set null,
  roast_profile_id uuid references public.roast_profiles(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'archived')),
  outcome text not null default 'unknown' check (outcome in ('success', 'failed', 'mixed', 'unknown')),
  bean_profile jsonb not null default '{}'::jsonb,
  roast_metrics jsonb not null default '{}'::jsonb,
  brew_feedback jsonb not null default '{}'::jsonb,
  notes text,
  confidence numeric not null default 0 check (confidence >= 0 and confidence <= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists uploads_file_hash_idx on public.uploads(file_hash);
create index if not exists uploads_file_kind_idx on public.uploads(file_kind);
create index if not exists roast_profiles_search_idx on public.roast_profiles using gin (
  to_tsvector('simple', coalesce(display_name, '') || ' ' || coalesce(short_name, '') || ' ' || coalesce(designer, '') || ' ' || coalesce(description, ''))
);
create index if not exists roast_profiles_curve_points_idx on public.roast_profiles using gin (roast_curve_points);
create index if not exists roast_logs_needs_review_idx on public.roast_logs(needs_review);
create index if not exists roast_cases_bean_profile_idx on public.roast_cases using gin (bean_profile);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists uploads_set_updated_at on public.uploads;
create trigger uploads_set_updated_at
before update on public.uploads
for each row execute function public.set_updated_at();

drop trigger if exists roast_profiles_set_updated_at on public.roast_profiles;
create trigger roast_profiles_set_updated_at
before update on public.roast_profiles
for each row execute function public.set_updated_at();

drop trigger if exists roast_logs_set_updated_at on public.roast_logs;
create trigger roast_logs_set_updated_at
before update on public.roast_logs
for each row execute function public.set_updated_at();

drop trigger if exists roast_cases_set_updated_at on public.roast_cases;
create trigger roast_cases_set_updated_at
before update on public.roast_cases
for each row execute function public.set_updated_at();

alter table public.uploads enable row level security;
alter table public.roast_profiles enable row level security;
alter table public.roast_logs enable row level security;
alter table public.roast_cases enable row level security;

-- Server routes use the service role key and bypass RLS. No anon/authenticated
-- policies are created in v1, so uploaded roast data is private by default.
