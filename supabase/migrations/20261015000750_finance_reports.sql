/*
  Read-only finance reporting, computed in the database.

  The API returns at most 1,000 rows per request, and one session's dues
  pass that quickly (600 students x 2 fees), so totals added up in the
  browser would quietly be wrong. These functions aggregate here instead.

  They run as the CALLER (security invoker), so row-level security applies:
  anyone who cannot read finance gets zeros and empty lists, not data.
*/

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
    select student_id,
           sum(amount_due_kobo) as due,
           sum(amount_paid_kobo) as paid
    from d group by student_id
  ),
  pend as (
    select count(*) as n, coalesce(sum(amount_kobo), 0) as kobo
    from public.payments
    where session_id = p_session_id and status = 'pending_verification'
  )
  select jsonb_build_object(
    'total_due_kobo', coalesce((select sum(amount_due_kobo) from d), 0),
    'collected_kobo', coalesce((select sum(amount_paid_kobo) from d), 0),
    'outstanding_kobo', coalesce((select sum(amount_due_kobo - amount_paid_kobo) from d), 0),
    'pending_count', (select n from pend),
    'pending_kobo', (select kobo from pend),
    'students', (select count(*) from per_student),
    'students_paid', (select count(*) from per_student where paid >= due),
    'students_partial', (select count(*) from per_student where paid > 0 and paid < due),
    'students_unpaid', (select count(*) from per_student where paid = 0),
    'by_level', coalesce((
      select jsonb_agg(x order by x.level)
      from (
        select level,
               count(distinct student_id) as students,
               sum(amount_due_kobo) as due_kobo,
               sum(amount_paid_kobo) as paid_kobo
        from d group by level
      ) x
    ), '[]'::jsonb)
  );
$$;

/*
  One row per student for a session: what they owe across all fees, what is
  verified, what is waiting for verification, and an overall status.
  p_status filters on that overall status ('paid' | 'partial' | 'unpaid').
*/
create or replace function public.finance_ledger(
  p_session_id uuid,
  p_level smallint default null,
  p_status text default null,
  p_search text default null,
  p_limit int default 50,
  p_offset int default 0
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with per_student as (
    select d.student_id,
           max(d.level) as level,
           sum(d.amount_due_kobo) as due_kobo,
           sum(d.amount_paid_kobo) as paid_kobo
    from public.student_dues d
    where d.session_id = p_session_id
    group by d.student_id
  ),
  pend as (
    select p.student_id, sum(p.amount_kobo) as pending_kobo
    from public.payments p
    where p.session_id = p_session_id and p.status = 'pending_verification'
    group by p.student_id
  ),
  rows as (
    select s.id as student_id, s.full_name, s.matric_no, ps.level,
           ps.due_kobo, ps.paid_kobo,
           coalesce(pe.pending_kobo, 0) as pending_kobo,
           ps.due_kobo - ps.paid_kobo as outstanding_kobo,
           case
             when ps.paid_kobo >= ps.due_kobo then 'paid'
             when ps.paid_kobo > 0 then 'partial'
             else 'unpaid'
           end as status
    from per_student ps
    join public.students s on s.id = ps.student_id
    left join pend pe on pe.student_id = ps.student_id
  ),
  filtered as (
    select * from rows
    where (p_level is null or level = p_level)
      and (p_status is null or status = p_status)
      and (
        p_search is null or btrim(p_search) = ''
        or full_name ilike '%' || btrim(p_search) || '%'
        or matric_no ilike '%' || btrim(p_search) || '%'
      )
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'rows', coalesce((
      select jsonb_agg(f order by f.level, f.full_name)
      from (
        select * from filtered
        order by level, full_name
        limit least(greatest(p_limit, 1), 1000) offset greatest(p_offset, 0)
      ) f
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.finance_overview(uuid) from public, anon;
revoke execute on function public.finance_ledger(uuid, smallint, text, text, int, int) from public, anon;
grant execute on function public.finance_overview(uuid) to authenticated;
grant execute on function public.finance_ledger(uuid, smallint, text, text, int, int) to authenticated;
