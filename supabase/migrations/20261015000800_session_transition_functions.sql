/*
  Moving to a new academic session: preview, then confirm.

  Who may do it is a setting the President controls
  (org_settings.session_transition_roles, default just the President).

  Promotion table for students who are 'active':
    100 -> 200 -> 300 -> 400 -> 500 -> 600 -> graduated (level cleared,
    never deleted).
  Students marked repeating / deferred / unconfirmed are listed for review;
  the President picks Promote (default), Repeat level, or Defer for each.
  Withdrawn and graduated students are left alone.

  The very first activation (no session is active yet) promotes nobody:
  everyone starts the session at the level they were registered with, and
  for review students "promote" means "include".

  confirm_session_transition() is one function call, so one transaction:
  close the old session, activate the new, move every student, write level
  history, create the new dues (always unpaid -- nothing carries over),
  record the transition and the audit entry. Any error undoes all of it.
*/

alter table public.org_settings
  add column if not exists session_transition_roles text[] not null default array['president'];

create or replace function public.guard_finance_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.finance_visible_to_all_admins is distinct from old.finance_visible_to_all_admins
      or new.session_transition_roles is distinct from old.session_transition_roles)
     and (select auth.uid()) is not null
     and not public.has_admin_role(array['president']) then
    raise exception 'Only the President can change finance access settings.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.can_run_transition()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_admin_role(
    coalesce((select s.session_transition_roles from public.org_settings s where s.id), array['president'])
  );
$$;

revoke execute on function public.can_run_transition() from public, anon;
grant execute on function public.can_run_transition() to authenticated;

-- ---------------------------------------------------------------------------
-- Preview: changes nothing.
-- ---------------------------------------------------------------------------
create or replace function public.preview_session_transition(p_to_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  tgt public.academic_sessions;
  cur public.academic_sessions;
  first_session boolean;
  problems text[] := array[]::text[];
  result jsonb;
begin
  if not public.can_run_transition() then
    raise exception 'Only the President can move the association to a new session.' using errcode = '42501';
  end if;

  select * into tgt from public.academic_sessions where id = p_to_session_id;
  if not found then
    raise exception 'That session was not found.';
  end if;

  select * into cur from public.academic_sessions where status = 'active';
  first_session := cur.id is null;

  if tgt.status <> 'draft' then
    problems := problems || format('%s has already been started.', tgt.label);
  end if;
  if not first_session and tgt.starts_on <= cur.starts_on then
    problems := problems || format('%s must start after the current session, %s.', tgt.label, cur.label);
  end if;
  if not exists (select 1 from public.session_fees f where f.session_id = tgt.id) then
    problems := problems || format('Set at least one fee for %s first.', tgt.label);
  end if;

  with eligible as (
    select s.* from public.students s
    where s.level is not null and s.status in ('active', 'repeating', 'deferred', 'unconfirmed')
  )
  select jsonb_build_object(
    'first_session', first_session,
    'from', case when first_session then null
                 else jsonb_build_object('id', cur.id, 'label', cur.label) end,
    'to', jsonb_build_object('id', tgt.id, 'label', tgt.label, 'starts_on', tgt.starts_on, 'ends_on', tgt.ends_on),
    'problems', to_jsonb(problems),
    'total_students', (select count(*) from eligible),
    'moves', jsonb_build_object(
      '100', (select count(*) from eligible where status = 'active' and level = 100),
      '200', (select count(*) from eligible where status = 'active' and level = 200),
      '300', (select count(*) from eligible where status = 'active' and level = 300),
      '400', (select count(*) from eligible where status = 'active' and level = 400),
      '500', (select count(*) from eligible where status = 'active' and level = 500)
    ),
    -- On a first activation the "moves" are enrolments at the current level
    -- (the 600 count is in 'enrolling_600'), and nobody graduates.
    'enrolling_600', (select count(*) from eligible where status = 'active' and level = 600),
    'graduating', case when first_session then 0
                       else (select count(*) from eligible where status = 'active' and level = 600) end,
    'review', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'full_name', e.full_name, 'matric_no', e.matric_no,
        'level', e.level, 'status', e.status
      ) order by e.level, e.full_name)
      from eligible e where e.status <> 'active'
    ), '[]'::jsonb),
    'fees', coalesce((
      select jsonb_agg(jsonb_build_object(
        'fee', ft.name, 'level', f.level, 'amount_kobo', f.amount_kobo
      ) order by ft.name, f.level nulls first)
      from public.session_fees f
      join public.fee_types ft on ft.id = f.fee_type_id
      where f.session_id = tgt.id
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Confirm: the whole move, all or nothing.
-- p_decisions: {"<student uuid>": "promote" | "repeat" | "defer", ...} for
-- students in the review list. Anyone not listed is promoted.
-- ---------------------------------------------------------------------------
create or replace function public.confirm_session_transition(
  p_to_session_id uuid,
  p_decisions jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  tgt public.academic_sessions;
  cur public.academic_sessions;
  first_session boolean;
  bad_key text;
  summary jsonb;
  dues_created integer;
  transition_id uuid;
begin
  if not public.can_run_transition() then
    raise exception 'Only the President can move the association to a new session.' using errcode = '42501';
  end if;

  -- Lock the target first: a second, simultaneous confirm waits here and then
  -- finds it no longer a draft.
  select * into tgt from public.academic_sessions where id = p_to_session_id for update;
  if not found then
    raise exception 'That session was not found.';
  end if;
  if tgt.status <> 'draft' then
    raise exception '% has already been started. A session can only be started once.', tgt.label;
  end if;

  select * into cur from public.academic_sessions where status = 'active' for update;
  first_session := cur.id is null;

  if exists (select 1 from public.session_transitions t where t.to_session_id = tgt.id) then
    raise exception 'The move to % has already been done.', tgt.label;
  end if;
  if not first_session and tgt.starts_on <= cur.starts_on then
    raise exception '% must start after the current session, %.', tgt.label, cur.label;
  end if;
  if not exists (select 1 from public.session_fees f where f.session_id = tgt.id) then
    raise exception 'Set at least one fee for % first, so dues can be created.', tgt.label;
  end if;

  p_decisions := coalesce(p_decisions, '{}'::jsonb);
  if jsonb_typeof(p_decisions) <> 'object' then
    raise exception 'Decisions must be a list of student choices.';
  end if;

  select k into bad_key
  from jsonb_each_text(p_decisions) d(k, v)
  where v not in ('promote', 'repeat', 'defer')
     or k !~ '^[0-9a-fA-F-]{36}$'
     or not exists (
       select 1 from public.students s
       where s.id::text = lower(k) and s.level is not null
         and s.status in ('repeating', 'deferred', 'unconfirmed')
     )
  limit 1;
  if bad_key is not null then
    raise exception 'A review decision does not match a student awaiting review (%). Refresh the preview and try again.', bad_key;
  end if;

  -- Bulk change: one summary audit entry and our own history rows instead
  -- of a row-by-row trail.
  perform set_config('naps.in_transition', 'on', true);
  perform set_config('naps.skip_row_audit', 'on', true);

  if not first_session then
    update public.academic_sessions set status = 'closed' where id = cur.id;
  end if;
  update public.academic_sessions set status = 'active' where id = tgt.id;

  -- Decide, move and write history in one statement.
  with moves as (
    select s.id, s.level as old_level, s.status as old_status,
      case when s.status = 'active' then 'promote'
           else coalesce(p_decisions ->> s.id::text, 'promote') end as decision
    from public.students s
    where s.level is not null and s.status in ('active', 'repeating', 'deferred', 'unconfirmed')
  ),
  moved as (
    update public.students s set
      level = case
        when m.decision = 'promote' and not first_session and m.old_level = 600 then null
        when m.decision = 'promote' and not first_session then m.old_level + 100
        else m.old_level end,
      status = case
        when m.decision = 'defer' then 'deferred'
        when m.decision = 'promote' and not first_session and m.old_level = 600 then 'graduated'
        else 'active' end
    from moves m
    where m.id = s.id
    returning s.id, s.level, s.status, m.decision, m.old_level
  ),
  history as (
    insert into public.student_level_history (student_id, session_id, level, status, reason)
    select id, tgt.id, level, status,
      case
        when status = 'graduated' then 'graduated'
        when decision = 'defer' then 'deferred'
        when decision = 'repeat' then 'repeated'
        when first_session then 'enrolled'
        else 'promoted' end
    from moved
    returning 1
  )
  select jsonb_build_object(
    'first_session', first_session,
    'from_session', case when first_session then null else cur.label end,
    'to_session', tgt.label,
    'students_moved', (select count(*) from moved),
    'promoted', (select count(*) from moved where decision = 'promote' and status = 'active' and not first_session),
    'enrolled', (select count(*) from moved where decision = 'promote' and first_session),
    'graduated', (select count(*) from moved where status = 'graduated'),
    'repeating', (select count(*) from moved where decision = 'repeat'),
    'deferred', (select count(*) from moved where decision = 'defer'),
    'by_old_level', (
      select coalesce(jsonb_object_agg(old_level::text, n), '{}'::jsonb)
      from (select old_level, count(*) as n from moved where decision = 'promote' group by old_level) x
    ),
    'history_rows', (select count(*) from history)
  ) into summary;

  dues_created := public.generate_session_dues(tgt.id);
  summary := summary || jsonb_build_object('dues_created', dues_created);

  insert into public.session_transitions (from_session_id, to_session_id, summary_json)
  values (cur.id, tgt.id, summary)
  returning id into transition_id;

  perform public.write_audit(
    'confirm_session_transition', 'academic_sessions', tgt.id::text,
    case when first_session then null else jsonb_build_object('active_session', cur.label) end,
    summary || jsonb_build_object('transition_id', transition_id)
  );

  return summary || jsonb_build_object('transition_id', transition_id);
exception
  when unique_violation then
    raise exception 'Another session change happened at the same moment. Nothing was changed; refresh and check.';
end;
$$;

revoke execute on function public.preview_session_transition(uuid) from public, anon;
revoke execute on function public.confirm_session_transition(uuid, jsonb) from public, anon;
grant execute on function public.preview_session_transition(uuid) to authenticated;
grant execute on function public.confirm_session_transition(uuid, jsonb) to authenticated;
