/*
  One row per completed move from one session to the next.

  The whole move -- closing the old session, activating the new one,
  promoting students, writing history, creating dues -- happens inside
  confirm_session_transition() as a single transaction. If anything fails,
  nothing is written, including this row, so there is no "half done" state.
  That is why the only status is 'completed'.

  Uniqueness makes a second run impossible even if two Presidents pressed
  confirm at the same moment: the same (from, to) pair cannot repeat, and a
  session can be moved into only once. from_session_id is null for the very
  first activation, and nulls count as equal here.
*/
create table if not exists public.session_transitions (
  id               uuid primary key default gen_random_uuid(),
  from_session_id  uuid references public.academic_sessions (id),
  to_session_id    uuid not null references public.academic_sessions (id),
  started_by       uuid references auth.users (id) default auth.uid(),
  confirmed_at     timestamptz not null default now(),
  status           text not null default 'completed' check (status in ('completed')),
  summary_json     jsonb not null,
  unique nulls not distinct (from_session_id, to_session_id),
  unique (to_session_id)
);

create or replace function public.session_transitions_are_permanent()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Session transitions are permanent records.' using errcode = '42501';
end;
$$;

drop trigger if exists session_transitions_no_update_delete on public.session_transitions;
create trigger session_transitions_no_update_delete
  before update or delete on public.session_transitions
  for each row execute function public.session_transitions_are_permanent();

alter table public.session_transitions enable row level security;

create policy "President and finance read transitions"
  on public.session_transitions for select
  using (
    (select public.can_read_finance())
    or (select public.has_admin_role(array['president']))
  );
