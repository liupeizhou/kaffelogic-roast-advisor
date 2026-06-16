alter table public.roast_profiles
  add column if not exists initial_recommendation_score numeric,
  add column if not exists initial_recommendation_notes jsonb not null default '[]'::jsonb;

create table if not exists public.curve_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  color text not null default '#176B42',
  description text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.curve_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.roast_profile_tag_links (
  profile_id uuid not null references public.roast_profiles(id) on delete cascade,
  tag_id uuid not null references public.curve_tags(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(profile_id, tag_id)
);

create table if not exists public.roast_profile_group_links (
  profile_id uuid not null references public.roast_profiles(id) on delete cascade,
  group_id uuid not null references public.curve_groups(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(profile_id, group_id)
);

create table if not exists public.roast_profile_change_logs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.roast_profiles(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  before_snapshot jsonb not null default '{}'::jsonb,
  after_snapshot jsonb not null default '{}'::jsonb,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists curve_tags_name_idx on public.curve_tags(name);
create index if not exists curve_groups_sort_idx on public.curve_groups(sort_order, name);
create index if not exists roast_profile_tag_links_tag_idx on public.roast_profile_tag_links(tag_id);
create index if not exists roast_profile_group_links_group_idx on public.roast_profile_group_links(group_id);
create index if not exists roast_profile_change_logs_profile_idx on public.roast_profile_change_logs(profile_id, created_at desc);

alter table public.curve_tags enable row level security;
alter table public.curve_groups enable row level security;
alter table public.roast_profile_tag_links enable row level security;
alter table public.roast_profile_group_links enable row level security;
alter table public.roast_profile_change_logs enable row level security;

drop policy if exists curve_tags_select_all on public.curve_tags;
create policy curve_tags_select_all on public.curve_tags for select using (true);

drop policy if exists curve_groups_select_all on public.curve_groups;
create policy curve_groups_select_all on public.curve_groups for select using (true);

drop policy if exists roast_profile_tag_links_select_visible on public.roast_profile_tag_links;
create policy roast_profile_tag_links_select_visible on public.roast_profile_tag_links
  for select using (
    exists (
      select 1 from public.roast_profiles rp
      where rp.id = profile_id
        and (rp.visibility in ('public', 'unlisted') or rp.owner_id = (select auth.uid()))
    )
  );

drop policy if exists roast_profile_group_links_select_visible on public.roast_profile_group_links;
create policy roast_profile_group_links_select_visible on public.roast_profile_group_links
  for select using (
    exists (
      select 1 from public.roast_profiles rp
      where rp.id = profile_id
        and (rp.visibility in ('public', 'unlisted') or rp.owner_id = (select auth.uid()))
    )
  );

drop policy if exists roast_profile_change_logs_select_actor on public.roast_profile_change_logs;
create policy roast_profile_change_logs_select_actor on public.roast_profile_change_logs
  for select using ((select auth.uid()) = actor_id);

drop trigger if exists curve_tags_set_updated_at on public.curve_tags;
create trigger curve_tags_set_updated_at
before update on public.curve_tags
for each row execute function public.set_updated_at();

drop trigger if exists curve_groups_set_updated_at on public.curve_groups;
create trigger curve_groups_set_updated_at
before update on public.curve_groups
for each row execute function public.set_updated_at();
