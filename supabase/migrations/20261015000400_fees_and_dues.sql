/*
  What each session charges, and what each student owes.

  Money is integer kobo everywhere (₦5,000.00 = 500000).

  A session's fees can be edited only while it is a draft. Once it is active,
  dues have been generated from those amounts, and changing them afterwards
  would leave the two disagreeing.

  student_dues.amount_paid_kobo is moved only by verify_payment(), so it is
  the sum of VERIFIED payments. status is generated from it, so it cannot be
  set by hand and can never say "paid" for money nobody has verified.
*/
create table if not exists public.fee_types (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique check (char_length(btrim(name)) between 2 and 80),
  description  text check (description is null or char_length(description) <= 300),
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

create table if not exists public.session_fees (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references public.academic_sessions (id) on delete cascade,
  fee_type_id   uuid not null references public.fee_types (id),
  -- null = every level; a level-specific row overrides it for that level.
  level         smallint check (level is null or level in (100, 200, 300, 400, 500, 600)),
  amount_kobo   bigint not null check (amount_kobo > 0),
  created_at    timestamptz not null default now(),
  unique nulls not distinct (session_id, fee_type_id, level)
);

create table if not exists public.student_dues (
  id                uuid primary key default gen_random_uuid(),
  student_id        uuid not null references public.students (id),
  session_id        uuid not null references public.academic_sessions (id),
  fee_type_id       uuid not null references public.fee_types (id),
  level             smallint not null,
  amount_due_kobo   bigint not null check (amount_due_kobo > 0),
  amount_paid_kobo  bigint not null default 0 check (amount_paid_kobo >= 0),
  status            text generated always as (
    case
      when amount_paid_kobo >= amount_due_kobo then 'paid'
      when amount_paid_kobo > 0 then 'partial'
      else 'unpaid'
    end
  ) stored,
  created_at        timestamptz not null default now(),
  unique (student_id, session_id, fee_type_id),
  check (amount_paid_kobo <= amount_due_kobo)
);

create index if not exists student_dues_session_idx on public.student_dues (session_id, status);
create index if not exists student_dues_student_idx on public.student_dues (student_id);

drop trigger if exists fee_types_audit on public.fee_types;
create trigger fee_types_audit
  after insert or update on public.fee_types
  for each row execute function public.audit_row_change();

drop trigger if exists session_fees_audit on public.session_fees;
create trigger session_fees_audit
  after insert or update or delete on public.session_fees
  for each row execute function public.audit_row_change();

alter table public.fee_types enable row level security;
alter table public.session_fees enable row level security;
alter table public.student_dues enable row level security;

create policy "Admins read fee types"
  on public.fee_types for select
  using ((select public.current_admin_role()) is not null);

create policy "President adds fee types"
  on public.fee_types for insert
  with check ((select public.has_admin_role(array['president'])));

-- Retiring a fee type is done with active = false; there is no delete.
create policy "President edits fee types"
  on public.fee_types for update
  using ((select public.has_admin_role(array['president'])))
  with check ((select public.has_admin_role(array['president'])));

create policy "Admins read session fees"
  on public.session_fees for select
  using ((select public.current_admin_role()) is not null);

create policy "President sets fees on draft sessions"
  on public.session_fees for all
  using (
    (select public.has_admin_role(array['president']))
    and exists (
      select 1 from public.academic_sessions s
      where s.id = session_fees.session_id and s.status = 'draft'
    )
  )
  with check (
    (select public.has_admin_role(array['president']))
    and exists (
      select 1 from public.academic_sessions s
      where s.id = session_fees.session_id and s.status = 'draft'
    )
  );

-- Dues are written only by confirm_session_transition() and verify_payment().
create policy "Finance readers read dues"
  on public.student_dues for select
  using ((select public.can_read_finance()));

/*
  Creates a session's dues for every active student at their current level:
  the level-specific fee where one exists, otherwise the all-levels fee.
  Called only from inside confirm_session_transition().
*/
create or replace function public.generate_session_dues(p_session_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  created integer;
begin
  insert into public.student_dues (student_id, session_id, fee_type_id, level, amount_due_kobo)
  select st.id, p_session_id, f.fee_type_id, st.level, f.amount_kobo
  from public.students st
  cross join lateral (
    select distinct on (sf.fee_type_id) sf.fee_type_id, sf.amount_kobo
    from public.session_fees sf
    join public.fee_types ft on ft.id = sf.fee_type_id and ft.active
    where sf.session_id = p_session_id
      and (sf.level = st.level or sf.level is null)
    order by sf.fee_type_id, sf.level nulls last
  ) f
  where st.status = 'active' and st.level is not null
  on conflict (student_id, session_id, fee_type_id) do nothing;

  get diagnostics created = row_count;
  return created;
end;
$$;

revoke execute on function public.generate_session_dues(uuid) from public, anon, authenticated;
