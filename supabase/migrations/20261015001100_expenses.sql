/*
  Expenses, with the constitution's rule for extra-budgetary spending.

  Normal expense:          Treasurer records -> Financial Secretary verifies.
  Extra-budgetary expense: Treasurer records -> Financial Secretary verifies
                           -> President approves.

  status walks:
    pending_verification --verify--> verified            (normal: final)
    pending_verification --verify--> awaiting_approval   (extra-budgetary)
    awaiting_approval    --approve-> approved            (final)
    pending_verification / awaiting_approval --reject--> rejected

  An expense counts in the Overview only when it is final: a verified normal
  expense, or an approved extra-budgetary one.

  Held by the table itself, whoever writes to it:
  - nobody verifies, approves or rejects an expense they recorded, and the
    approver is never the verifier;
  - a normal expense can never be awaiting approval or approved, and an
    extra-budgetary one can never stop at "verified";
  - final and rejected expenses are frozen; nothing is ever deleted.
  Money is integer kobo.
*/

create table if not exists public.expenses (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references public.academic_sessions (id),
  amount_kobo       bigint not null check (amount_kobo > 0),
  purpose           text not null check (char_length(btrim(purpose)) between 3 and 300),
  spent_on          date not null,
  method            text not null check (method in ('cash', 'bank_transfer', 'other')),
  reference         text check (reference is null or char_length(reference) between 1 and 80),
  note              text check (note is null or char_length(note) <= 500),
  extra_budgetary   boolean not null default false,
  status            text not null default 'pending_verification'
    check (status in ('pending_verification', 'awaiting_approval', 'verified', 'approved', 'rejected')),

  recorded_by       uuid not null references auth.users (id),
  recorded_at       timestamptz not null default now(),
  verified_by       uuid references auth.users (id),
  verified_at       timestamptz,
  approved_by       uuid references auth.users (id),
  approved_at       timestamptz,
  rejected_by       uuid references auth.users (id),
  rejected_at       timestamptz,
  rejected_stage    text check (rejected_stage in ('verification', 'approval')),
  rejection_reason  text check (rejection_reason is null or char_length(rejection_reason) between 3 and 500),

  constraint expenses_no_self_checking check (
    (verified_by is null or verified_by <> recorded_by)
    and (approved_by is null or (approved_by <> recorded_by and approved_by <> verified_by))
    and (rejected_by is null or rejected_by <> recorded_by)
  ),
  constraint expenses_route_matches_kind check (
    extra_budgetary or status not in ('awaiting_approval', 'approved')
  ),
  constraint expenses_extra_needs_approval check (
    not extra_budgetary or status <> 'verified'
  ),
  constraint expenses_state_complete check (
    (status = 'pending_verification' and verified_by is null and approved_by is null and rejected_by is null)
    or (status in ('verified', 'awaiting_approval') and verified_by is not null and verified_at is not null
        and approved_by is null and rejected_by is null)
    or (status = 'approved' and verified_by is not null and approved_by is not null and approved_at is not null
        and rejected_by is null)
    or (status = 'rejected' and rejected_by is not null and rejected_at is not null and rejection_reason is not null
        and approved_by is null
        and (rejected_stage = 'verification' and verified_by is null
             or rejected_stage = 'approval' and verified_by is not null))
  ),
  constraint expenses_transfer_has_reference
    check (method <> 'bank_transfer' or reference is not null)
);

create index if not exists expenses_session_idx on public.expenses (session_id, status);
create index if not exists expenses_status_idx on public.expenses (status, recorded_at);

comment on table public.expenses is
  'Money spent by the association. Treasurer records, Financial Secretary verifies, President approves extra-budgetary spending.';

create or replace function public.expenses_freeze_decided()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Expenses are never deleted. Reject it instead.' using errcode = '42501';
  end if;

  if old.status in ('verified', 'approved', 'rejected') then
    raise exception 'This expense is already %. It cannot be changed.', old.status using errcode = '42501';
  end if;

  if (new.session_id, new.amount_kobo, new.purpose, new.spent_on, new.method, new.reference,
      new.note, new.extra_budgetary, new.recorded_by, new.recorded_at)
     is distinct from
     (old.session_id, old.amount_kobo, old.purpose, old.spent_on, old.method, old.reference,
      old.note, old.extra_budgetary, old.recorded_by, old.recorded_at) then
    raise exception 'A recorded expense cannot be edited. Reject it and record it again.' using errcode = '42501';
  end if;

  -- The verifier's stamp is fixed once given.
  if old.verified_by is not null and new.verified_by is distinct from old.verified_by then
    raise exception 'The verification of this expense cannot be changed.' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists expenses_freeze_decided on public.expenses;
create trigger expenses_freeze_decided
  before update or delete on public.expenses
  for each row execute function public.expenses_freeze_decided();

alter table public.expenses enable row level security;

-- Reads only; every write goes through the functions below.
create policy "Finance readers read expenses"
  on public.expenses for select
  using ((select public.can_read_finance()));

-- ---------------------------------------------------------------------------
-- record_expense: Treasurer only, against the active session.
-- ---------------------------------------------------------------------------
create or replace function public.record_expense(
  p_amount_kobo bigint,
  p_purpose text,
  p_spent_on date,
  p_method text,
  p_reference text default null,
  p_note text default null,
  p_extra_budgetary boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  sess_id uuid;
  purpose text := btrim(coalesce(p_purpose, ''));
  ref text := nullif(btrim(coalesce(p_reference, '')), '');
  note text := nullif(btrim(coalesce(p_note, '')), '');
  new_id uuid;
begin
  if not public.has_admin_role(array['treasurer']) then
    raise exception 'Only the Treasurer can record expenses.' using errcode = '42501';
  end if;

  select s.id into sess_id from public.academic_sessions s where s.is_active;
  if sess_id is null then
    raise exception 'There is no active session to record this expense against.';
  end if;

  if p_amount_kobo is null or p_amount_kobo <= 0 then
    raise exception 'Enter an amount greater than zero.';
  end if;
  if char_length(purpose) < 3 then
    raise exception 'Say what the money was spent on.';
  end if;
  if p_method is null or p_method not in ('cash', 'bank_transfer', 'other') then
    raise exception 'Choose how the money was paid out: cash, bank transfer or other.';
  end if;
  if p_method = 'bank_transfer' and ref is null then
    raise exception 'A bank transfer needs its reference, so the Financial Secretary can match it to the statement.';
  end if;
  if p_spent_on is null or p_spent_on > (now() at time zone 'Africa/Lagos')::date then
    raise exception 'The date spent cannot be in the future.';
  end if;

  insert into public.expenses (
    session_id, amount_kobo, purpose, spent_on, method, reference, note, extra_budgetary, recorded_by
  )
  values (
    sess_id, p_amount_kobo, left(purpose, 300), p_spent_on, p_method, ref, note,
    coalesce(p_extra_budgetary, false), (select auth.uid())
  )
  returning id into new_id;

  perform public.write_audit(
    'record_expense', 'expenses', new_id::text, null,
    (select to_jsonb(e) from public.expenses e where e.id = new_id)
  );

  return jsonb_build_object('id', new_id, 'status', 'pending_verification');
end;
$$;

-- ---------------------------------------------------------------------------
-- verify_expense: Financial Secretary, never their own entry. A normal
-- expense becomes final; an extra-budgetary one moves to the President.
-- ---------------------------------------------------------------------------
create or replace function public.verify_expense(p_expense_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  exp public.expenses;
  next_status text;
begin
  if not public.has_admin_role(array['financial_secretary']) then
    raise exception 'Only the Financial Secretary can verify expenses.' using errcode = '42501';
  end if;

  select * into exp from public.expenses where id = p_expense_id for update;
  if not found then
    raise exception 'That expense was not found.';
  end if;
  if exp.status <> 'pending_verification' then
    raise exception 'This expense is not awaiting verification (it is %).', replace(exp.status, '_', ' ');
  end if;
  if exp.recorded_by = me then
    raise exception 'You recorded this expense, so someone else must verify it.' using errcode = '42501';
  end if;

  next_status := case when exp.extra_budgetary then 'awaiting_approval' else 'verified' end;

  update public.expenses
  set status = next_status, verified_by = me, verified_at = now()
  where id = exp.id;

  perform public.write_audit(
    'verify_expense', 'expenses', exp.id::text, to_jsonb(exp),
    (select to_jsonb(e) from public.expenses e where e.id = exp.id)
  );

  return jsonb_build_object('id', exp.id, 'status', next_status);
end;
$$;

-- ---------------------------------------------------------------------------
-- approve_expense: President, extra-budgetary only, after verification.
-- ---------------------------------------------------------------------------
create or replace function public.approve_expense(p_expense_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  exp public.expenses;
begin
  if not public.has_admin_role(array['president']) then
    raise exception 'Only the President can approve extra-budgetary expenses.' using errcode = '42501';
  end if;

  select * into exp from public.expenses where id = p_expense_id for update;
  if not found then
    raise exception 'That expense was not found.';
  end if;
  if exp.status <> 'awaiting_approval' then
    raise exception 'This expense is not awaiting approval (it is %).', replace(exp.status, '_', ' ');
  end if;
  if exp.recorded_by = me or exp.verified_by = me then
    raise exception 'You recorded or verified this expense, so someone else must approve it.' using errcode = '42501';
  end if;

  update public.expenses
  set status = 'approved', approved_by = me, approved_at = now()
  where id = exp.id;

  perform public.write_audit(
    'approve_expense', 'expenses', exp.id::text, to_jsonb(exp),
    (select to_jsonb(e) from public.expenses e where e.id = exp.id)
  );

  return jsonb_build_object('id', exp.id, 'status', 'approved');
end;
$$;

-- ---------------------------------------------------------------------------
-- reject_expense: the Financial Secretary at verification, the President at
-- approval. Never the person who recorded it; a reason is required.
-- ---------------------------------------------------------------------------
create or replace function public.reject_expense(p_expense_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  exp public.expenses;
  reason text := btrim(coalesce(p_reason, ''));
  stage text;
begin
  select * into exp from public.expenses where id = p_expense_id for update;
  if not found then
    raise exception 'That expense was not found.';
  end if;

  if exp.status = 'pending_verification' then
    if not public.has_admin_role(array['financial_secretary']) then
      raise exception 'Only the Financial Secretary can reject an expense awaiting verification.' using errcode = '42501';
    end if;
    stage := 'verification';
  elsif exp.status = 'awaiting_approval' then
    if not public.has_admin_role(array['president']) then
      raise exception 'Only the President can reject an expense awaiting approval.' using errcode = '42501';
    end if;
    stage := 'approval';
  else
    raise exception 'This expense is already %. It cannot be rejected now.', replace(exp.status, '_', ' ');
  end if;

  if exp.recorded_by = me then
    raise exception 'You recorded this expense, so someone else must decide on it.' using errcode = '42501';
  end if;
  if char_length(reason) < 3 then
    raise exception 'Say why it is being rejected, so the Treasurer can correct it.';
  end if;

  update public.expenses
  set status = 'rejected', rejected_by = me, rejected_at = now(), rejected_stage = stage,
      rejection_reason = left(reason, 500)
  where id = exp.id;

  perform public.write_audit(
    'reject_expense', 'expenses', exp.id::text, to_jsonb(exp),
    (select to_jsonb(e) from public.expenses e where e.id = exp.id)
  );

  return jsonb_build_object('id', exp.id, 'status', 'rejected');
end;
$$;

revoke execute on function public.record_expense(bigint, text, date, text, text, text, boolean) from public, anon;
revoke execute on function public.verify_expense(uuid) from public, anon;
revoke execute on function public.approve_expense(uuid) from public, anon;
revoke execute on function public.reject_expense(uuid, text) from public, anon;
grant execute on function public.record_expense(bigint, text, date, text, text, text, boolean) to authenticated;
grant execute on function public.verify_expense(uuid) to authenticated;
grant execute on function public.approve_expense(uuid) to authenticated;
grant execute on function public.reject_expense(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Overview: income, expenses, balance, and what is pending on each side.
-- Same signature as before; existing keys are kept.
-- ---------------------------------------------------------------------------
create or replace function public.finance_overview(p_session_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with d as (
    select * from public.student_dues where session_id = p_session_id
  ),
  per_student as (
    select student_id, sum(amount_due_kobo) as due, sum(amount_paid_kobo) as paid
    from d group by student_id
  ),
  pend as (
    select count(*) as n, coalesce(sum(amount_kobo), 0) as kobo
    from public.payments
    where session_id = p_session_id and status = 'pending_verification'
  ),
  ex as (
    select
      coalesce(sum(amount_kobo) filter (where status in ('verified', 'approved')), 0) as final_kobo,
      count(*) filter (where status in ('verified', 'approved')) as final_n,
      coalesce(sum(amount_kobo) filter (where status in ('pending_verification', 'awaiting_approval')), 0) as pending_kobo,
      count(*) filter (where status in ('pending_verification', 'awaiting_approval')) as pending_n,
      count(*) filter (where status = 'awaiting_approval') as awaiting_approval_n
    from public.expenses
    where session_id = p_session_id
  )
  select jsonb_build_object(
    'total_due_kobo', coalesce((select sum(amount_due_kobo) from d), 0),
    'collected_kobo', coalesce((select sum(amount_paid_kobo) from d), 0),
    'income_kobo', coalesce((select sum(amount_paid_kobo) from d), 0),
    'outstanding_kobo', coalesce((select sum(amount_due_kobo - amount_paid_kobo) from d), 0),
    'pending_count', (select n from pend),
    'pending_kobo', (select kobo from pend),
    'expenses_kobo', (select final_kobo from ex),
    'expenses_count', (select final_n from ex),
    'expenses_pending_kobo', (select pending_kobo from ex),
    'expenses_pending_count', (select pending_n from ex),
    'expenses_awaiting_approval_count', (select awaiting_approval_n from ex),
    'balance_kobo', coalesce((select sum(amount_paid_kobo) from d), 0) - (select final_kobo from ex),
    'students', (select count(*) from per_student),
    'students_paid', (select count(*) from per_student where paid >= due),
    'students_partial', (select count(*) from per_student where paid > 0 and paid < due),
    'students_unpaid', (select count(*) from per_student where paid = 0),
    'by_level', coalesce((
      select jsonb_agg(x order by x.level)
      from (
        select level, count(distinct student_id) as students,
               sum(amount_due_kobo) as due_kobo, sum(amount_paid_kobo) as paid_kobo
        from d group by level
      ) x
    ), '[]'::jsonb)
  );
$$;

-- Live screens for expenses too (Realtime still applies row-level security).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'expenses'
     ) then
    alter publication supabase_realtime add table public.expenses;
  end if;
end;
$$;
