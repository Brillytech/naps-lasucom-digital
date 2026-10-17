/*
  The only ways a payment is written. Each runs as one transaction (a
  function call always does), checks the caller's office itself, locks the
  rows it reads, writes the audit log, and raises messages written for the
  person using the screen.
*/

create or replace function public.format_naira(p_kobo bigint)
returns text
language sql
immutable
set search_path = ''
as $$
  select '₦' || to_char(p_kobo / 100.0, 'FM999,999,999,990.00');
$$;

-- ---------------------------------------------------------------------------
-- record_payment: Treasurer only.
-- ---------------------------------------------------------------------------
create or replace function public.record_payment(
  p_due_id uuid,
  p_amount_kobo bigint,
  p_method text,
  p_payment_date date,
  p_bank_reference text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  due public.student_dues;
  sess public.academic_sessions;
  pending_kobo bigint;
  room_kobo bigint;
  ref text := nullif(btrim(coalesce(p_bank_reference, '')), '');
  note text := nullif(btrim(coalesce(p_note, '')), '');
  new_id uuid;
begin
  if not public.has_admin_role(array['treasurer']) then
    raise exception 'Only the Treasurer can record payments.' using errcode = '42501';
  end if;

  if p_amount_kobo is null or p_amount_kobo <= 0 then
    raise exception 'Enter an amount greater than zero.';
  end if;

  if p_method is null or p_method not in ('cash', 'bank_transfer', 'other') then
    raise exception 'Choose how the money was paid: cash, bank transfer or other.';
  end if;

  if p_method = 'bank_transfer' and ref is null then
    raise exception 'A bank transfer needs its reference, so the Financial Secretary can match it to the statement.';
  end if;

  if p_payment_date is null or p_payment_date > (now() at time zone 'Africa/Lagos')::date then
    raise exception 'The payment date cannot be in the future.';
  end if;

  select * into due from public.student_dues where id = p_due_id for update;
  if not found then
    raise exception 'That due was not found. Refresh and choose the fee again.';
  end if;

  select * into sess from public.academic_sessions where id = due.session_id;
  if sess.status = 'draft' then
    raise exception 'Payments cannot be recorded against a session that has not started.';
  end if;

  select coalesce(sum(p.amount_kobo), 0) into pending_kobo
  from public.payments p
  where p.due_id = due.id and p.status = 'pending_verification';

  room_kobo := due.amount_due_kobo - due.amount_paid_kobo - pending_kobo;

  if room_kobo <= 0 then
    raise exception 'Nothing is left to pay on this fee%.',
      case when pending_kobo > 0
        then ' once the ' || public.format_naira(pending_kobo) || ' awaiting verification is confirmed'
        else '' end;
  end if;

  if p_amount_kobo > room_kobo then
    raise exception 'That is more than the student owes. At most % can be recorded%.',
      public.format_naira(room_kobo),
      case when pending_kobo > 0
        then ' (' || public.format_naira(pending_kobo) || ' is already awaiting verification)'
        else '' end;
  end if;

  insert into public.payments (
    due_id, student_id, session_id, amount_kobo, method, payment_date,
    bank_reference, note, recorded_by
  )
  values (
    due.id, due.student_id, due.session_id, p_amount_kobo, p_method, p_payment_date,
    ref, note, (select auth.uid())
  )
  returning id into new_id;

  perform public.write_audit(
    'record_payment', 'payments', new_id::text, null,
    (select to_jsonb(p) from public.payments p where p.id = new_id)
  );

  return jsonb_build_object('id', new_id, 'status', 'pending_verification');
end;
$$;

-- ---------------------------------------------------------------------------
-- verify_payment: Financial Secretary only, never their own entry. Issues the
-- receipt in the same transaction, so a verified payment without a receipt
-- (or a receipt without a verified payment) cannot exist.
-- ---------------------------------------------------------------------------
create or replace function public.verify_payment(p_payment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  pay public.payments;
  due public.student_dues;
  st public.students;
  sess public.academic_sessions;
  fee_name text;
  maker public.admin_profiles;
  checker public.admin_profiles;
  rec public.receipts;
begin
  if not public.has_admin_role(array['financial_secretary']) then
    raise exception 'Only the Financial Secretary can verify payments.' using errcode = '42501';
  end if;

  select * into pay from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'That payment was not found.';
  end if;

  if pay.status <> 'pending_verification' then
    raise exception 'This payment was already %.', replace(pay.status, '_', ' ');
  end if;

  if pay.recorded_by = me then
    raise exception 'You recorded this payment, so someone else must verify it.' using errcode = '42501';
  end if;

  select * into due from public.student_dues where id = pay.due_id for update;

  if due.amount_paid_kobo + pay.amount_kobo > due.amount_due_kobo then
    raise exception 'Verifying this would take the student past what they owe (% left to pay). Reject it and ask the Treasurer to record the right amount.',
      public.format_naira(due.amount_due_kobo - due.amount_paid_kobo);
  end if;

  update public.payments
  set status = 'verified', verified_by = me, verified_at = now()
  where id = pay.id;

  update public.student_dues
  set amount_paid_kobo = amount_paid_kobo + pay.amount_kobo
  where id = due.id
  returning * into due;

  select * into st from public.students where id = pay.student_id;
  select * into sess from public.academic_sessions where id = pay.session_id;
  select ft.name into fee_name from public.fee_types ft where ft.id = due.fee_type_id;
  select * into maker from public.admin_profiles where user_id = pay.recorded_by limit 1;
  select * into checker from public.admin_profiles where user_id = me limit 1;

  insert into public.receipts (
    receipt_number, payment_id, student_id, session_id,
    student_name, matric_no, level, session_label, fee_name,
    amount_kobo, total_due_kobo, paid_to_date_kobo, outstanding_kobo,
    payment_method, payment_date, payment_reference,
    recorded_by_name, recorded_by_title, recorded_at,
    verified_by_name, verified_by_title, verified_at
  )
  values (
    'pending', pay.id, pay.student_id, pay.session_id,
    st.full_name, st.matric_no, due.level, sess.label, fee_name,
    pay.amount_kobo, due.amount_due_kobo, due.amount_paid_kobo,
    due.amount_due_kobo - due.amount_paid_kobo,
    pay.method, pay.payment_date, pay.bank_reference,
    coalesce(maker.full_name, 'Treasurer'), coalesce(maker.office, 'Treasurer'), pay.recorded_at,
    coalesce(checker.full_name, 'Financial Secretary'), coalesce(checker.office, 'Financial Secretary'), now()
  )
  returning * into rec;

  perform public.write_audit(
    'verify_payment', 'payments', pay.id::text,
    to_jsonb(pay),
    (select to_jsonb(p) from public.payments p where p.id = pay.id)
      || jsonb_build_object('receipt_number', rec.receipt_number)
  );

  return jsonb_build_object(
    'payment_id', pay.id,
    'receipt_id', rec.id,
    'receipt_number', rec.receipt_number,
    'due_status', due.status
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- reject_payment: Financial Secretary only, never their own entry.
-- ---------------------------------------------------------------------------
create or replace function public.reject_payment(p_payment_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  pay public.payments;
  reason text := btrim(coalesce(p_reason, ''));
begin
  if not public.has_admin_role(array['financial_secretary']) then
    raise exception 'Only the Financial Secretary can reject payments.' using errcode = '42501';
  end if;

  if char_length(reason) < 3 then
    raise exception 'Say why it is being rejected, so the Treasurer can correct it.';
  end if;

  select * into pay from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'That payment was not found.';
  end if;

  if pay.status <> 'pending_verification' then
    raise exception 'This payment was already %.', replace(pay.status, '_', ' ');
  end if;

  if pay.recorded_by = me then
    raise exception 'You recorded this payment, so someone else must decide on it.' using errcode = '42501';
  end if;

  update public.payments
  set status = 'rejected', verified_by = me, verified_at = now(), rejection_reason = left(reason, 500)
  where id = pay.id;

  perform public.write_audit(
    'reject_payment', 'payments', pay.id::text,
    to_jsonb(pay),
    (select to_jsonb(p) from public.payments p where p.id = pay.id)
  );

  return jsonb_build_object('payment_id', pay.id, 'status', 'rejected');
end;
$$;

revoke execute on function public.record_payment(uuid, bigint, text, date, text, text) from public, anon;
revoke execute on function public.verify_payment(uuid) from public, anon;
revoke execute on function public.reject_payment(uuid, text) from public, anon;
grant execute on function public.record_payment(uuid, bigint, text, date, text, text) to authenticated;
grant execute on function public.verify_payment(uuid) to authenticated;
grant execute on function public.reject_payment(uuid, text) to authenticated;
