-- UNCVRD Tasks: schema, security and realtime
-- Run once in Supabase > SQL Editor (or `supabase db push`).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------

-- People. Rows can be seeded before someone signs in; auth_id is
-- linked automatically on their first Google sign-in (matched by email).
create table public.profiles (
  id          uuid primary key default gen_random_uuid(),
  auth_id     uuid unique references auth.users(id) on delete set null,
  email       text not null unique check (email = lower(email)),
  name        text not null,
  job_role    text,
  is_manager  boolean not null default false,
  created_at  timestamptz not null default now()
);

create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  parent_id   uuid references public.projects(id) on delete set null,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (name, parent_id)
);

create type public.task_status     as enum ('active', 'today', 'review', 'done');
create type public.task_priority   as enum ('need', 'nice');
create type public.task_difficulty as enum ('SIMP', 'MOD');

create table public.tasks (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (length(trim(title)) > 0),
  project_id    uuid references public.projects(id) on delete set null,
  job_role      text,
  assignee_id   uuid references public.profiles(id) on delete set null,
  created_by    uuid references public.profiles(id) on delete set null,
  priority      public.task_priority   not null default 'need',
  difficulty    public.task_difficulty not null default 'SIMP',
  htc           numeric(5,2) check (htc is null or htc >= 0),   -- hours to complete
  progress      smallint not null default 0 check (progress between 0 and 100),
  status        public.task_status not null default 'active',
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  today_at      timestamptz,
  completed_at  timestamptz
);
create index tasks_assignee_status_idx on public.tasks (assignee_id, status);
create index tasks_completed_idx on public.tasks (completed_at);

create table public.time_logs (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  check (ended_at is null or ended_at >= started_at)
);
create index time_logs_user_idx on public.time_logs (user_id, started_at);
create index time_logs_task_idx on public.time_logs (task_id);
-- one running timer per person
create unique index time_logs_one_running on public.time_logs (user_id) where ended_at is null;

-- ---------------------------------------------------------------
-- Helpers (security definer so policies can call them without recursion)
-- ---------------------------------------------------------------
create or replace function public.current_profile_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.profiles where auth_id = auth.uid()
$$;

create or replace function public.is_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_manager from public.profiles where auth_id = auth.uid()), false)
$$;

-- ---------------------------------------------------------------
-- Sign-up gate: only @uncvrd.com, and link to a seeded profile
-- ---------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(new.email);
begin
  if v_email is null or v_email not like '%@uncvrd.com' then
    raise exception 'Only @uncvrd.com accounts can sign in';
  end if;

  update public.profiles set auth_id = new.id where email = v_email;
  if not found then
    insert into public.profiles (auth_id, email, name)
    values (
      new.id,
      v_email,
      coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(v_email, '@', 1))
    );
  end if;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------
-- Task rules enforced in the database (not just the UI)
-- ---------------------------------------------------------------
create or replace function public.tasks_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  mgr boolean := public.is_manager();
begin
  new.updated_at := now();

  -- service role / SQL editor (no auth.uid) skips the member checks
  if auth.uid() is not null and not mgr then
    if tg_op = 'INSERT' then
      new.assignee_id := public.current_profile_id();
      new.created_by  := public.current_profile_id();
    else
      if new.assignee_id is distinct from old.assignee_id then
        raise exception 'Only managers can reassign tasks';
      end if;
      if new.status = 'done' and old.status <> 'done' then
        raise exception 'Only managers can mark tasks done';
      end if;
    end if;
  end if;

  if tg_op = 'INSERT' and new.created_by is null then
    new.created_by := public.current_profile_id();
  end if;

  -- keep timestamps consistent with status
  if new.status = 'today' and new.today_at is null then
    new.today_at := now();
  end if;
  if new.status = 'active' then
    new.today_at := null;
  end if;
  if new.status in ('review', 'done') and new.completed_at is null then
    new.completed_at := now();
  end if;
  if new.status in ('active', 'today') then
    new.completed_at := null;
  end if;
  return new;
end $$;

create trigger tasks_guard_trg
  before insert or update on public.tasks
  for each row execute function public.tasks_guard();

-- ---------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------
alter table public.profiles  enable row level security;
alter table public.projects  enable row level security;
alter table public.tasks     enable row level security;
alter table public.time_logs enable row level security;

-- profiles: everyone signed in can see the team list (needed for names)
create policy profiles_read   on public.profiles for select to authenticated using (true);
create policy profiles_insert on public.profiles for insert to authenticated with check (public.is_manager());
create policy profiles_update on public.profiles for update to authenticated using (public.is_manager());

-- projects: everyone reads, managers write
create policy projects_read   on public.projects for select to authenticated using (true);
create policy projects_insert on public.projects for insert to authenticated with check (public.is_manager());
create policy projects_update on public.projects for update to authenticated using (public.is_manager());
create policy projects_delete on public.projects for delete to authenticated using (public.is_manager());

-- tasks: members see/update their own, managers everything
create policy tasks_read on public.tasks for select to authenticated
  using (public.is_manager() or assignee_id = public.current_profile_id());
create policy tasks_insert on public.tasks for insert to authenticated
  with check (public.is_manager() or assignee_id = public.current_profile_id());
create policy tasks_update on public.tasks for update to authenticated
  using (public.is_manager() or assignee_id = public.current_profile_id());
create policy tasks_delete on public.tasks for delete to authenticated
  using (public.is_manager());

-- time logs: own rows, managers read all
create policy logs_read on public.time_logs for select to authenticated
  using (public.is_manager() or user_id = public.current_profile_id());
create policy logs_insert on public.time_logs for insert to authenticated
  with check (user_id = public.current_profile_id());
create policy logs_update on public.time_logs for update to authenticated
  using (user_id = public.current_profile_id());
create policy logs_delete on public.time_logs for delete to authenticated
  using (user_id = public.current_profile_id() or public.is_manager());

-- ---------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------
alter table public.tasks     replica identity full;
alter table public.time_logs replica identity full;
alter publication supabase_realtime add table public.tasks, public.time_logs, public.projects, public.profiles;
