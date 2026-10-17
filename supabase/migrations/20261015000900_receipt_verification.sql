/*
  Public receipt check, for anyone holding a receipt (a parent, a lecturer,
  the student themselves). It answers only: is this a real receipt, and if
  so for how much, when, for which session, and whose initials.

  No name, matric number, level or officer is returned. The receipts table
  itself stays closed to the public; this function is the only way in, and
  it looks up one exact number at a time -- no searching or listing.
*/
create or replace function public.verify_receipt(p_receipt_number text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'valid', true,
        'receipt_number', r.receipt_number,
        'amount_kobo', r.amount_kobo,
        'issued_on', (r.issued_at at time zone 'Africa/Lagos')::date,
        'session', r.session_label,
        'initials', (
          select string_agg(left(w, 1) || '.', ' ')
          from unnest(regexp_split_to_array(upper(btrim(r.student_name)), '\s+')) as w
          where w <> ''
        )
      )
      from public.receipts r
      where r.receipt_number = upper(btrim(p_receipt_number))
    ),
    jsonb_build_object('valid', false)
  );
$$;

revoke execute on function public.verify_receipt(text) from public;
grant execute on function public.verify_receipt(text) to anon, authenticated;
