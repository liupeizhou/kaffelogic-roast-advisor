alter table public.roast_logs
  add column if not exists parsed_payload jsonb;

create table if not exists public.roast_profile_scores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  upload_id uuid not null references public.uploads(id) on delete cascade,
  baseline_kind text not null check (baseline_kind in ('public_profile', 'user_curve')),
  baseline_profile_id uuid references public.roast_profiles(id) on delete set null,
  baseline_curve_document_id uuid references public.curve_documents(id) on delete set null,
  score numeric not null check (score >= 0 and score <= 100),
  rating text not null,
  metrics jsonb not null default '{}'::jsonb,
  notes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists roast_profile_scores_owner_upload_idx
  on public.roast_profile_scores(owner_id, upload_id, created_at desc);

alter table public.roast_profile_scores enable row level security;

drop policy if exists roast_profile_scores_select_own on public.roast_profile_scores;
create policy roast_profile_scores_select_own on public.roast_profile_scores
  for select using ((select auth.uid()) = owner_id);

drop policy if exists roast_profile_scores_insert_own on public.roast_profile_scores;
create policy roast_profile_scores_insert_own on public.roast_profile_scores
  for insert with check ((select auth.uid()) = owner_id);
