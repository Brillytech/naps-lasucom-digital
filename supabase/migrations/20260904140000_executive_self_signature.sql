/*
  Let every executive sign for themselves, and only for themselves.

  Signing was the President's alone because the whole Executives page was.
  That is the wrong shape: the President cannot sign on anyone else's behalf,
  and an officer signing from their own phone is the point of the feature.

  Ownership needs to be a column, not a string comparison. Matching an admin
  to their executive row on office text works today -- all nine pair up -- but
  it is one rename away from silently pairing the wrong people, and the thing
  it would be guarding is whose signature goes on a letter.
*/

alter table public.executives
  add column if not exists user_id uuid references auth.users (id);

comment on column public.executives.user_id is
  'The admin who owns this profile. Set from admin_profiles on the office it holds; used to decide who may sign as this executive.';

create index if not exists executives_user_idx on public.executives (user_id);

-- Backfill on normalised office within the same DEC set. Punctuation differs
-- between the two tables ("PRO" against "P.R.O"), so compare letters only.
update public.executives e
set user_id = p.user_id
from public.admin_profiles p
where e.user_id is null
  and e.set_id = p.dec_set_id
  and regexp_replace(lower(e.office), '[^a-z]', '', 'g')
    = regexp_replace(lower(p.office), '[^a-z]', '', 'g');

/*
  Signature updates go through a function rather than an UPDATE policy.

  Row-level security decides which rows a caller may touch, not which columns.
  A policy permissive enough to let an officer set their own signature_path
  would also let them rewrite their office, their name, or their visibility.
  This writes exactly one column, on exactly one row, and refuses a path that
  does not belong to the caller.
*/
create or replace function public.set_my_signature(p_path text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.executives%rowtype;
begin
  select * into target
  from public.executives
  where user_id = auth.uid()
  limit 1;

  if not found then
    raise exception 'No executive profile is linked to this account';
  end if;

  -- The path carries the identity, so a caller cannot hand in someone else's.
  if p_path is distinct from target.set_id::text || '/' || target.id::text || '.png' then
    raise exception 'That signature path does not belong to this account';
  end if;

  update public.executives
  set signature_path = p_path
  where id = target.id;

  return target.id;
end;
$$;

revoke execute on function public.set_my_signature(text) from public, anon;
grant execute on function public.set_my_signature(text) to authenticated;

comment on function public.set_my_signature(text) is
  'Sets the calling admin''s own signature. Writes signature_path only, and rejects a path belonging to another executive.';

/*
  Storage: the President may write any signature in the bucket, and everyone
  else may write only the object named for their own executive row.
*/
drop policy if exists "President writes signatures" on storage.objects;
drop policy if exists "President replaces signatures" on storage.objects;
drop policy if exists "President removes signatures" on storage.objects;

create policy "Write own signature or any as President"
  on storage.objects for insert
  with check (
    bucket_id = 'signatures'
    and (
      exists (
        select 1 from public.admin_profiles p
        where p.user_id = (select auth.uid())
          and p.is_active
          and p.role = 'president'
      )
      or exists (
        select 1 from public.executives e
        where e.user_id = (select auth.uid())
          and name = e.set_id::text || '/' || e.id::text || '.png'
      )
    )
  );

create policy "Replace own signature or any as President"
  on storage.objects for update
  using (
    bucket_id = 'signatures'
    and (
      exists (
        select 1 from public.admin_profiles p
        where p.user_id = (select auth.uid())
          and p.is_active
          and p.role = 'president'
      )
      or exists (
        select 1 from public.executives e
        where e.user_id = (select auth.uid())
          and name = e.set_id::text || '/' || e.id::text || '.png'
      )
    )
  );

create policy "President removes signatures"
  on storage.objects for delete
  using (
    bucket_id = 'signatures'
    and exists (
      select 1 from public.admin_profiles p
      where p.user_id = (select auth.uid())
        and p.is_active
        and p.role = 'president'
    )
  );
