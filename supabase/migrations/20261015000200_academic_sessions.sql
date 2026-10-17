/*
  Academic sessions. A session is created as a draft and only becomes active
  through confirm_session_transition(), which also closes the old one.

  is_active is generated from status, so the two can never disagree, and the
  partial unique index allows at most one active session.
*/
create table if not exists public.academic_sessions (
  id          uuid primary key default gen_random_uuid(),
  label       text not null unique
    check (
      label ~ '^[0-9]{4}/[0-9]{4}$'
      and right(label, 4)::int = left(label, 4)::int + 1
    ),
  starts_on   date not null,
  ends_on     date not null,
  status      text not null default 'draft' check (status in ('draft', 'active', 'closed')),
  is_active   boolean generated always as (status = 'active') stored,
  created_by  uuid references auth.users (id) default auth.uid(),
  created_at  timestamptz not null default now(),
  check (ends_on > starts_on)
);

comment on table public.academic_sessions is
  'School sessions such as 2026/2027. Draft until confirmed; one active at a time.';

create unique index if not exists academic_sessions_one_active
  on public.academic_sessions (is_active) where is_active;

alter table public.academic_sessions enable row level security;

-- Every active executive may see the session list; the active session heads
-- every finance page.
create policy "Admins read sessions"
  on public.academic_sessions for select
  using ((select public.current_admin_role()) is not null);

-- The President drafts sessions. Activation and closing happen only inside
-- confirm_session_transition(), which runs with definer rights.
create policy "President creates draft sessions"
  on public.academic_sessions for insert
  with check ((select public.has_admin_role(array['president'])) and status = 'draft');

create policy "President edits draft sessions"
  on public.academic_sessions for update
  using ((select public.has_admin_role(array['president'])) and status = 'draft')
  with check (status = 'draft');

create policy "President deletes unused drafts"
  on public.academic_sessions for delete
  using ((select public.has_admin_role(array['president'])) and status = 'draft');

drop trigger if exists academic_sessions_audit on public.academic_sessions;
create trigger academic_sessions_audit
  after insert or update or delete on public.academic_sessions
  for each row execute function public.audit_row_change();
