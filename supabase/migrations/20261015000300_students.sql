/*
  Student register, kept by the secretariat. Students do not sign in; the
  register exists so dues, payments and promotions have someone to belong to.

  Students are never deleted. Graduating sets status 'graduated' and clears
  the level. Every level a student holds is written to student_level_history,
  so promotion and corrections never overwrite the past.
*/
create table if not exists public.students (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null check (char_length(btrim(full_name)) between 2 and 120),
  matric_no   text not null unique check (matric_no ~ '^[A-Z0-9/._-]{3,40}$'),
  level       smallint check (level in (100, 200, 300, 400, 500, 600)),
  status      text not null default 'active'
    check (status in ('active', 'repeating', 'deferred', 'unconfirmed', 'graduated', 'withdrawn')),
  created_by  uuid references auth.users (id) default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- A graduate has no level; everyone else must have one.
  constraint students_level_matches_status check ((status = 'graduated') = (level is null))
);

comment on column public.students.status is
  'active: promoted normally. repeating / deferred / unconfirmed: the President decides at the next promotion. graduated: finished 600L. withdrawn: left.';

create index if not exists students_level_idx on public.students (level, status);
create index if not exists students_name_idx on public.students (lower(full_name));

create table if not exists public.student_level_history (
  id           bigint generated always as identity primary key,
  student_id   uuid not null references public.students (id),
  session_id   uuid references public.academic_sessions (id),
  level        smallint,
  status       text not null,
  reason       text not null check (reason in ('registered', 'correction', 'enrolled', 'promoted', 'repeated', 'deferred', 'graduated')),
  recorded_by  uuid references auth.users (id) default auth.uid(),
  recorded_at  timestamptz not null default now()
);

create index if not exists student_level_history_student_idx
  on public.student_level_history (student_id, recorded_at);

-- Tidy input: upper-case, trimmed matric numbers; single-spaced names.
create or replace function public.students_normalise()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.matric_no := upper(regexp_replace(btrim(new.matric_no), '\s+', '', 'g'));
  new.full_name := regexp_replace(btrim(new.full_name), '\s+', ' ', 'g');
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists students_normalise on public.students;
create trigger students_normalise
  before insert or update on public.students
  for each row execute function public.students_normalise();

-- Registering a student, or correcting their level by hand, is history too.
-- Session transitions write their own rows (with the decision as the reason)
-- and set naps.in_transition so this trigger stays out of the way.
create or replace function public.students_track_level()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('naps.in_transition', true), '') = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT'
     or new.level is distinct from old.level
     or new.status is distinct from old.status then
    insert into public.student_level_history (student_id, session_id, level, status, reason)
    values (
      new.id,
      (select s.id from public.academic_sessions s where s.is_active),
      new.level,
      new.status,
      case when tg_op = 'INSERT' then 'registered' else 'correction' end
    );
  end if;
  return new;
end;
$$;

drop trigger if exists students_track_level on public.students;
create trigger students_track_level
  after insert or update on public.students
  for each row execute function public.students_track_level();

create or replace function public.students_never_deleted()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Students are never deleted. Set their status to withdrawn instead.'
    using errcode = '42501';
end;
$$;

drop trigger if exists students_no_delete on public.students;
create trigger students_no_delete
  before delete on public.students
  for each row execute function public.students_never_deleted();

drop trigger if exists students_audit on public.students;
create trigger students_audit
  after insert or update on public.students
  for each row execute function public.audit_row_change();

alter table public.students enable row level security;
alter table public.student_level_history enable row level security;

-- Register keepers: President, General Secretary, Financial Secretary.
create policy "Register keepers and finance read students"
  on public.students for select
  using (
    (select public.can_read_finance())
    or (select public.has_admin_role(array['president', 'general_secretary', 'financial_secretary']))
  );

create policy "Register keepers add students"
  on public.students for insert
  with check ((select public.has_admin_role(array['president', 'general_secretary', 'financial_secretary'])));

create policy "Register keepers correct students"
  on public.students for update
  using ((select public.has_admin_role(array['president', 'general_secretary', 'financial_secretary'])))
  with check ((select public.has_admin_role(array['president', 'general_secretary', 'financial_secretary'])));

create policy "Register keepers and finance read level history"
  on public.student_level_history for select
  using (
    (select public.can_read_finance())
    or (select public.has_admin_role(array['president', 'general_secretary', 'financial_secretary']))
  );
