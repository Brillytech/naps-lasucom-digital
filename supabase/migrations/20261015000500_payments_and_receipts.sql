/*
  Payments are recorded by the Treasurer and decided by the Financial
  Secretary (maker-checker). Money changes hands outside the app; these rows
  only record and verify it.

  Rules held by the table itself, not just the functions that write it:
  - the person who recorded a payment can never be the one who decides it
    (payments_checker_is_not_maker);
  - a decided payment is frozen (payments_freeze_decided);
  - verified_by / verified_at hold whoever decided, verified OR rejected,
    and rejection_reason is required exactly when rejected.

  Receipts exist only for verified payments, one each. The number is
  assigned by the database from a sequence that is never reset, so a number
  is never issued twice, and the row can never be edited or deleted. Each
  receipt carries a snapshot of names, levels, amounts and officers as they
  were at issue, so later edits to the register never change an old receipt.
*/
create table if not exists public.payments (
  id                uuid primary key default gen_random_uuid(),
  due_id            uuid not null references public.student_dues (id),
  student_id        uuid not null references public.students (id),
  session_id        uuid not null references public.academic_sessions (id),
  amount_kobo       bigint not null check (amount_kobo > 0),
  method            text not null check (method in ('cash', 'bank_transfer', 'other')),
  payment_date      date not null,
  bank_reference    text check (bank_reference is null or char_length(bank_reference) between 1 and 80),
  note              text check (note is null or char_length(note) <= 500),
  status            text not null default 'pending_verification'
    check (status in ('pending_verification', 'verified', 'rejected')),
  recorded_by       uuid not null references auth.users (id),
  recorded_at       timestamptz not null default now(),
  verified_by       uuid references auth.users (id),
  verified_at       timestamptz,
  rejection_reason  text check (rejection_reason is null or char_length(rejection_reason) between 3 and 500),

  constraint payments_checker_is_not_maker
    check (verified_by is null or verified_by <> recorded_by),
  constraint payments_decision_complete check (
    (status = 'pending_verification' and verified_by is null and verified_at is null and rejection_reason is null)
    or (status = 'verified' and verified_by is not null and verified_at is not null and rejection_reason is null)
    or (status = 'rejected' and verified_by is not null and verified_at is not null and rejection_reason is not null)
  ),
  constraint payments_transfer_has_reference
    check (method <> 'bank_transfer' or bank_reference is not null)
);

create index if not exists payments_status_idx on public.payments (status, recorded_at);
create index if not exists payments_due_idx on public.payments (due_id);
create index if not exists payments_student_idx on public.payments (student_id);

create or replace function public.payments_freeze_decided()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Payments are never deleted. Reject it instead.' using errcode = '42501';
  end if;

  if old.status <> 'pending_verification' then
    raise exception 'This payment has already been %. It cannot be changed.', old.status
      using errcode = '42501';
  end if;

  -- Deciding a payment may only touch the decision fields.
  if (new.due_id, new.student_id, new.session_id, new.amount_kobo, new.method,
      new.payment_date, new.bank_reference, new.note, new.recorded_by, new.recorded_at)
     is distinct from
     (old.due_id, old.student_id, old.session_id, old.amount_kobo, old.method,
      old.payment_date, old.bank_reference, old.note, old.recorded_by, old.recorded_at) then
    raise exception 'A recorded payment cannot be edited. Reject it and record it again.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists payments_freeze_decided on public.payments;
create trigger payments_freeze_decided
  before update or delete on public.payments
  for each row execute function public.payments_freeze_decided();

-- ---------------------------------------------------------------------------
-- Receipts
-- ---------------------------------------------------------------------------
create sequence if not exists public.receipt_number_seq as bigint minvalue 1 no cycle;

create table if not exists public.receipts (
  id                  uuid primary key default gen_random_uuid(),
  receipt_number      text not null unique,
  payment_id          uuid not null unique references public.payments (id),
  student_id          uuid not null references public.students (id),
  session_id          uuid not null references public.academic_sessions (id),
  issued_at           timestamptz not null default now(),

  -- Snapshot at issue. Never recomputed.
  student_name        text not null,
  matric_no           text not null,
  level               smallint,
  session_label       text not null,
  fee_name            text not null,
  amount_kobo         bigint not null check (amount_kobo > 0),
  total_due_kobo      bigint not null,
  paid_to_date_kobo   bigint not null,
  outstanding_kobo    bigint not null check (outstanding_kobo >= 0),
  payment_method      text not null,
  payment_date        date not null,
  payment_reference   text,
  recorded_by_name    text not null,
  recorded_by_title   text not null,
  recorded_at         timestamptz not null,
  verified_by_name    text not null,
  verified_by_title   text not null,
  verified_at         timestamptz not null
);

create index if not exists receipts_student_idx on public.receipts (student_id);
create index if not exists receipts_issued_idx on public.receipts (issued_at desc);

-- Assigns the number, ignoring any value supplied. The year is the session's
-- start year; the running number is global and never resets.
create or replace function public.receipts_assign_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_year int;
  n bigint;
begin
  select extract(year from s.starts_on)::int into session_year
  from public.academic_sessions s where s.id = new.session_id;

  n := nextval('public.receipt_number_seq');
  new.receipt_number := format(
    'NAPS/FIN/%s/%s',
    session_year,
    lpad(n::text, greatest(6, length(n::text)), '0')
  );
  new.issued_at := now();
  return new;
end;
$$;

drop trigger if exists receipts_assign_number on public.receipts;
create trigger receipts_assign_number
  before insert on public.receipts
  for each row execute function public.receipts_assign_number();

create or replace function public.receipts_are_permanent()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Receipts are permanent. They cannot be edited or deleted.'
    using errcode = '42501';
end;
$$;

drop trigger if exists receipts_no_update_delete on public.receipts;
create trigger receipts_no_update_delete
  before update or delete on public.receipts
  for each row execute function public.receipts_are_permanent();

alter table public.payments enable row level security;
alter table public.receipts enable row level security;

-- Reads only. Every write goes through record_payment / verify_payment /
-- reject_payment, which run with definer rights and check the caller's role.
create policy "Finance readers read payments"
  on public.payments for select
  using ((select public.can_read_finance()));

create policy "Finance readers read receipts"
  on public.receipts for select
  using ((select public.can_read_finance()));
