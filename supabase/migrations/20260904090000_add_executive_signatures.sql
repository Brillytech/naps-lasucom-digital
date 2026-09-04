/*
  Executive signatures.

  A stored signature can be lifted out of any PDF it appears in and reused, so
  the bucket is private rather than public: the composer downloads the file
  with the caller's own session and embeds it, and nobody without an active
  admin row can fetch it by URL.

  The path is stored, not a public URL -- a public URL for a private object is
  a broken link, and keeping the path means the bucket can be renamed or moved
  behind a signed URL later without rewriting every row.
*/

alter table public.executives
  add column if not exists signature_path text;

comment on column public.executives.signature_path is
  'Object path in the private signatures bucket. Null means the letter falls back to a rendered script mark.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('signatures', 'signatures', false, 2097152, array['image/png'])
on conflict (id) do nothing;

/*
  Only the President maintains executive profiles, which is already how the
  Executives page gates itself, so the write policies match that. Reads are
  open to any active admin: every office needs to render its own letters, and
  the General Secretary prepares correspondence for others.
*/
create policy "Active admins read signatures"
  on storage.objects for select
  using (
    bucket_id = 'signatures'
    and exists (
      select 1 from public.admin_profiles p
      where p.user_id = (select auth.uid()) and p.is_active
    )
  );

create policy "President writes signatures"
  on storage.objects for insert
  with check (
    bucket_id = 'signatures'
    and exists (
      select 1 from public.admin_profiles p
      where p.user_id = (select auth.uid())
        and p.is_active
        and p.role = 'president'
    )
  );

create policy "President replaces signatures"
  on storage.objects for update
  using (
    bucket_id = 'signatures'
    and exists (
      select 1 from public.admin_profiles p
      where p.user_id = (select auth.uid())
        and p.is_active
        and p.role = 'president'
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
