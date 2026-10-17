/*
  Fix: executives could not save their own signature ("new row violates
  row-level security policy").

  The self-signature storage policies from 20260904140000 compare the object
  path with the caller's executive row:

      exists (select 1 from public.executives e
              where e.user_id = auth.uid()
                and name = e.set_id || '/' || e.id || '.png')

  The unqualified "name" was meant to be storage.objects.name, the path. But
  public.executives has a "name" column of its own, and inside that subquery
  Postgres resolves "name" to the nearest table: the executive's name. A
  person's name never equals "<set>/<id>.png", so the "own signature" branch
  was always false and only the President's branch could pass. Every
  non-President upload, first-time or replacement, was refused.

  Same rules, with the column qualified. Nothing else changes: the bucket
  stays private, reads stay with active admins, deletes stay with the
  President, and an executive may write only the object named for their own
  row. Replacing (an upsert) needs both the INSERT and the UPDATE policy, so
  both are recreated; the UPDATE policy also states its WITH CHECK, so an
  update cannot move an object onto someone else's path.
*/

drop policy if exists "Write own signature or any as President" on storage.objects;
drop policy if exists "Replace own signature or any as President" on storage.objects;

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
          and storage.objects.name = e.set_id::text || '/' || e.id::text || '.png'
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
          and storage.objects.name = e.set_id::text || '/' || e.id::text || '.png'
      )
    )
  )
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
          and storage.objects.name = e.set_id::text || '/' || e.id::text || '.png'
      )
    )
  );
