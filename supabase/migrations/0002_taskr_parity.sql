-- UNCVRD Tasks 0002: Taskr-style workflow
-- Run once in Supabase > SQL Editor, after 0001_init.sql.

-- New enum values ------------------------------------------------------------
alter type public.task_status     add value if not exists 'hold';
alter type public.task_difficulty add value if not exists 'COMP';
alter type public.task_difficulty add value if not exists 'SUPC';

-- Clients --------------------------------------------------------------------
create table if not exists public.clients (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);
alter table public.clients enable row level security;
create policy clients_read   on public.clients for select to authenticated using (true);
create policy clients_insert on public.clients for insert to authenticated with check (public.is_manager());
create policy clients_update on public.clients for update to authenticated using (public.is_manager());

-- Tasks: numeric priority band + need/nice tier + scheduling -----------------
-- The old need/nice column becomes "tier"; "priority" is now the 1.0-4.9 band.
alter table public.tasks rename column priority to tier;
alter table public.tasks
  add column priority        numeric(2,1) not null default 3.0 check (priority between 1.0 and 4.9),
  add column client_id       uuid references public.clients(id) on delete set null,
  add column start_date      date,
  add column due_date        date,
  add column repeat          text not null default 'none' check (repeat in ('none', 'daily', 'weekly', 'monthly')),
  add column explanation_url text,
  add column sort_order      double precision not null default extract(epoch from now()),
  add column spawned_from    uuid references public.tasks(id) on delete set null;
create index if not exists tasks_spawned_from_idx on public.tasks (spawned_from);

-- Keep timestamps consistent (adds the "hold" status) --------------------------
create or replace function public.tasks_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  mgr boolean := public.is_manager();
begin
  new.updated_at := now();

  if auth.uid() is not null and not mgr then
    if tg_op = 'INSERT' then
      new.assignee_id := public.current_profile_id();
      new.created_by  := coalesce(new.created_by, public.current_profile_id());
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

  if new.status = 'today' and new.today_at is null then
    new.today_at := now();
  end if;
  if new.status::text in ('active', 'hold') then
    new.today_at := null;
  end if;
  if new.status in ('review', 'done') and new.completed_at is null then
    new.completed_at := now();
  end if;
  if new.status::text in ('active', 'today', 'hold') then
    new.completed_at := null;
  end if;
  return new;
end $$;

-- Repeating tasks: finishing one creates the next occurrence -------------------
create or replace function public.tasks_repeat() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  base  date;
  nxt   date;
begin
  if new.repeat = 'none' then
    return new;
  end if;

  if new.status in ('review', 'done') and old.status not in ('review', 'done') then
    if exists (select 1 from public.tasks where spawned_from = new.id) then
      return new;
    end if;
    base := greatest(coalesce(new.start_date, today), today);
    nxt := case new.repeat
             when 'daily'  then base + 1
             when 'weekly' then base + 7
             else (base + interval '1 month')::date
           end;
    insert into public.tasks (
      title, project_id, client_id, job_role, assignee_id, created_by, tier, priority,
      difficulty, htc, notes, repeat, explanation_url, start_date, due_date, status,
      sort_order, spawned_from
    ) values (
      new.title, new.project_id, new.client_id, new.job_role, new.assignee_id, new.created_by,
      new.tier, new.priority, new.difficulty, new.htc, new.notes, new.repeat, new.explanation_url,
      nxt, case when new.due_date is null then null else nxt end, 'active',
      new.sort_order, new.id
    );
  elsif old.status in ('review', 'done') and new.status not in ('review', 'done') then
    -- Undo / reopen: remove the untouched next occurrence again
    delete from public.tasks t
    where t.spawned_from = new.id
      and t.progress = 0
      and t.status in ('active', 'today')
      and not exists (select 1 from public.time_logs l where l.task_id = t.id);
  end if;
  return new;
end $$;

drop trigger if exists tasks_repeat_trg on public.tasks;
create trigger tasks_repeat_trg
  after update of status on public.tasks
  for each row execute function public.tasks_repeat();

-- Move repeating tasks whose day has come into "today" -------------------------
-- Runs with the caller's rights, so members only touch their own tasks.
create or replace function public.promote_due_tasks() returns integer
language sql security invoker set search_path = public as $$
  with up as (
    update public.tasks
       set status = 'today', today_at = now()
     where status = 'active'
       and repeat <> 'none'
       and start_date is not null
       and start_date <= (now() at time zone 'Asia/Ho_Chi_Minh')::date
    returning 1
  )
  select count(*)::integer from up
$$;
grant execute on function public.promote_due_tasks() to authenticated;

-- Members can delete tasks they created; managers any -------------------------
drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks for delete to authenticated
  using (public.is_manager() or created_by = public.current_profile_id());

-- Attendance (punch in / break / punch out) -----------------------------------
create table if not exists public.attendance (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  kind        text not null check (kind in ('work', 'break')),
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  check (ended_at is null or ended_at >= started_at)
);
create index if not exists attendance_user_idx on public.attendance (user_id, started_at);
create unique index if not exists attendance_one_open on public.attendance (user_id) where ended_at is null;
alter table public.attendance enable row level security;
create policy attendance_read on public.attendance for select to authenticated
  using (public.is_manager() or user_id = public.current_profile_id());
create policy attendance_insert on public.attendance for insert to authenticated
  with check (user_id = public.current_profile_id());
create policy attendance_update on public.attendance for update to authenticated
  using (user_id = public.current_profile_id());

-- Realtime ---------------------------------------------------------------------
alter table public.attendance replica identity full;
alter publication supabase_realtime add table public.clients, public.attendance;
