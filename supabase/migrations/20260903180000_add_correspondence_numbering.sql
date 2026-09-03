/*
  Reference numbering.

  A reference is how a document gets cited afterwards, so two documents must
  never carry the same one. Counting rows to derive the next number is not
  enough: two admins exporting at the same moment would both read the same
  count and both take it. The counter is therefore a row that is incremented
  atomically, and the number is handed out by the database rather than
  calculated in the browser.

  Numbers are allocated on export, never on a draft save -- a draft is not an
  issued document, and incrementing on save would leave gaps for every
  work-in-progress that was never sent.
*/

create table if not exists public.correspondence_counters (
  office text not null,
  year   int  not null,
  last   int  not null default 0,
  primary key (office, year)
);

comment on table public.correspondence_counters is
  'Last reference number issued per office per year. Written only by next_correspondence_ref().';

alter table public.correspondence_counters enable row level security;

-- Readable so the composer can show the number a document would take. Never
-- writable directly: the function below is the only way it moves.
create policy "Active admins read correspondence counters"
  on public.correspondence_counters for select
  using (
    exists (
      select 1 from public.admin_profiles p
      where p.user_id = (select auth.uid()) and p.is_active
    )
  );

create or replace function public.next_correspondence_ref(p_office text, p_year int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  allocated int;
begin
  -- security definer bypasses RLS, so the caller is checked explicitly.
  if not exists (
    select 1 from public.admin_profiles p
    where p.user_id = auth.uid() and p.is_active
  ) then
    raise exception 'Not authorised to allocate a reference number';
  end if;

  insert into public.correspondence_counters as c (office, year, last)
  values (p_office, p_year, 1)
  on conflict (office, year)
    do update set last = c.last + 1
  returning c.last into allocated;

  return allocated;
end;
$$;

revoke execute on function public.next_correspondence_ref(text, int) from public, anon;
grant execute on function public.next_correspondence_ref(text, int) to authenticated;

comment on function public.next_correspondence_ref(text, int) is
  'Atomically allocates the next reference number for an office and year. Called on export only.';

-- Which reference a document was actually issued under, alongside the number
-- itself so a row can be traced back to its counter.
alter table public.correspondence_drafts
  add column if not exists issued_at timestamptz,
  add column if not exists reference_seq int;
