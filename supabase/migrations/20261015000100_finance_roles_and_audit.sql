/*
  Finance foundation: who is asking, and an audit trail nobody can rewrite.

  Every finance table and function decides access with these helpers, so the
  rules live in the database rather than in which buttons the UI shows.

  Finance is readable by the President, Treasurer and Financial Secretary.
  org_settings.finance_visible_to_all_admins widens that to every active
  executive, read-only, when the President chooses to.
*/

alter table public.org_settings
  add column if not exists finance_visible_to_all_admins boolean not null default false;

create or replace function public.current_admin_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.admin_profiles p
  where p.user_id = (select auth.uid()) and p.is_active
  limit 1;
$$;

create or replace function public.has_admin_role(roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_admin_role() = any (roles), false);
$$;

create or replace function public.can_read_finance()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_admin_role(array['president', 'treasurer', 'financial_secretary'])
    or (
      public.current_admin_role() is not null
      and coalesce(
        (select s.finance_visible_to_all_admins from public.org_settings s where s.id),
        false
      )
    );
$$;

-- org_settings is updatable by every active admin (letterhead contacts), so
-- the finance switches on it are guarded here: only the President may change
-- them. SQL-editor / service-role changes (no auth.uid()) pass.
create or replace function public.guard_finance_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.finance_visible_to_all_admins is distinct from old.finance_visible_to_all_admins
     and (select auth.uid()) is not null
     and not public.has_admin_role(array['president']) then
    raise exception 'Only the President can change who sees finance.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_finance_settings on public.org_settings;
create trigger guard_finance_settings
  before update on public.org_settings
  for each row execute function public.guard_finance_settings();

grant execute on function public.current_admin_role() to authenticated;
grant execute on function public.has_admin_role(text[]) to authenticated;
grant execute on function public.can_read_finance() to authenticated;
revoke execute on function public.current_admin_role() from anon;
revoke execute on function public.has_admin_role(text[]) from anon;
revoke execute on function public.can_read_finance() from anon;

-- ---------------------------------------------------------------------------
-- Audit log. Append-only for everyone, the database owner included: the
-- trigger below refuses UPDATE and DELETE outright, and TRUNCATE too.
-- ---------------------------------------------------------------------------
create table if not exists public.audit_log (
  id           bigint generated always as identity primary key,
  occurred_at  timestamptz not null default now(),
  actor_id     uuid,
  actor_role   text,
  action       text not null,
  entity       text not null,
  entity_id    text,
  old_value    jsonb,
  new_value    jsonb
);

comment on table public.audit_log is
  'Who did what, when, with the before and after. Append-only; never edited or deleted.';

create index if not exists audit_log_entity_idx on public.audit_log (entity, entity_id);
create index if not exists audit_log_time_idx on public.audit_log (occurred_at desc);

create or replace function public.audit_log_is_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'The audit log is append-only. Entries cannot be changed or removed.'
    using errcode = '42501';
end;
$$;

drop trigger if exists audit_log_no_update_delete on public.audit_log;
create trigger audit_log_no_update_delete
  before update or delete on public.audit_log
  for each row execute function public.audit_log_is_append_only();

drop trigger if exists audit_log_no_truncate on public.audit_log;
create trigger audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function public.audit_log_is_append_only();

alter table public.audit_log enable row level security;

-- Readable by finance readers. No insert/update/delete policy: clients never
-- write here directly; the security-definer functions below do.
create policy "Finance readers read the audit log"
  on public.audit_log for select
  using ((select public.can_read_finance()));

create or replace function public.write_audit(
  p_action text,
  p_entity text,
  p_entity_id text,
  p_old jsonb,
  p_new jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_log (actor_id, actor_role, action, entity, entity_id, old_value, new_value)
  values ((select auth.uid()), public.current_admin_role(), p_action, p_entity, p_entity_id, p_old, p_new);
$$;

-- Only other database functions may call it; a client could otherwise forge
-- entries under its own name.
revoke execute on function public.write_audit(text, text, text, jsonb, jsonb) from public, anon, authenticated;

-- Generic row trigger for the tables admins edit directly (students, fees,
-- sessions). Functions that make bulk changes set naps.skip_row_audit and
-- write one summary entry instead of thousands of row entries.
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('naps.skip_row_audit', true), '') = 'on' then
    return coalesce(new, old);
  end if;

  perform public.write_audit(
    lower(tg_op),
    tg_table_name,
    coalesce(new.id, old.id)::text,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;
