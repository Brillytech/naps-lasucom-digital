/*
  Live finance screens: when the Financial Secretary verifies or rejects a
  payment, the Treasurer's open ledger flips without a reload.

  Realtime delivers a change only to clients whose row-level security lets
  them read that row, so this widens nothing: finance readers already see
  payments, everyone else still receives nothing.
*/
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'payments'
     ) then
    alter publication supabase_realtime add table public.payments;
  end if;
end;
$$;
