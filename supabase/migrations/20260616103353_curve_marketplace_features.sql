alter table public.roast_profiles
  add column if not exists download_count integer not null default 0,
  add column if not exists review_count integer not null default 0,
  add column if not exists rating_average numeric not null default 0,
  add column if not exists leaderboard_score numeric not null default 0;

create table if not exists public.roast_profile_downloads (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.roast_profiles(id) on delete cascade,
  owner_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.roast_profile_reviews (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.roast_profiles(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(profile_id, owner_id)
);

create index if not exists roast_profiles_leaderboard_idx
  on public.roast_profiles(leaderboard_score desc, download_count desc, rating_average desc);

create index if not exists roast_profile_downloads_profile_idx
  on public.roast_profile_downloads(profile_id, created_at desc);

create index if not exists roast_profile_reviews_profile_idx
  on public.roast_profile_reviews(profile_id, updated_at desc);

alter table public.roast_profile_downloads enable row level security;
alter table public.roast_profile_reviews enable row level security;

drop policy if exists roast_profile_downloads_select_own on public.roast_profile_downloads;
create policy roast_profile_downloads_select_own on public.roast_profile_downloads
  for select using ((select auth.uid()) = owner_id);

drop policy if exists roast_profile_reviews_select_visible on public.roast_profile_reviews;
create policy roast_profile_reviews_select_visible on public.roast_profile_reviews
  for select using (
    exists (
      select 1 from public.roast_profiles rp
      where rp.id = profile_id
        and (rp.visibility in ('public', 'unlisted') or rp.owner_id = (select auth.uid()))
    )
  );

drop policy if exists roast_profile_reviews_insert_own on public.roast_profile_reviews;
create policy roast_profile_reviews_insert_own on public.roast_profile_reviews
  for insert with check ((select auth.uid()) = owner_id);

drop policy if exists roast_profile_reviews_update_own on public.roast_profile_reviews;
create policy roast_profile_reviews_update_own on public.roast_profile_reviews
  for update using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create or replace function public.recalculate_roast_profile_rating(p_profile_id uuid)
returns void
language plpgsql
security invoker
as $$
declare
  v_review_count integer;
  v_rating_average numeric;
  v_download_count integer;
begin
  select count(*), coalesce(avg(rating), 0)
    into v_review_count, v_rating_average
  from public.roast_profile_reviews
  where profile_id = p_profile_id;

  select count(*)
    into v_download_count
  from public.roast_profile_downloads
  where profile_id = p_profile_id;

  update public.roast_profiles
  set review_count = v_review_count,
      rating_average = round(v_rating_average, 2),
      download_count = v_download_count,
      leaderboard_score = round((least(v_download_count, 500)::numeric * 0.12) + (v_rating_average * 16) + (least(v_review_count, 100)::numeric * 0.8), 2)
  where id = p_profile_id;
end;
$$;

create or replace function public.roast_profile_reviews_refresh()
returns trigger
language plpgsql
security invoker
as $$
begin
  perform public.recalculate_roast_profile_rating(coalesce(new.profile_id, old.profile_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists roast_profile_reviews_refresh_trigger on public.roast_profile_reviews;
create trigger roast_profile_reviews_refresh_trigger
after insert or update or delete on public.roast_profile_reviews
for each row execute function public.roast_profile_reviews_refresh();

create or replace function public.roast_profile_downloads_refresh()
returns trigger
language plpgsql
security invoker
as $$
begin
  perform public.recalculate_roast_profile_rating(new.profile_id);
  return new;
end;
$$;

drop trigger if exists roast_profile_downloads_refresh_trigger on public.roast_profile_downloads;
create trigger roast_profile_downloads_refresh_trigger
after insert on public.roast_profile_downloads
for each row execute function public.roast_profile_downloads_refresh();
