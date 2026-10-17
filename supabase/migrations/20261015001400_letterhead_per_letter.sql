/*
  Formal letterhead, round three.

  1. Patrons, Advisers, account details and an optional custom "From" line
     are now typed per letter, and saved with each draft in
     correspondence_drafts.letterhead. The org_settings columns from
     20261015001300 are left in place but no longer used.

  2. An optional "letterhead email" per executive, used only when the
     executive has no linked, active admin account with an email. Kept in its
     own table: the executives table is readable by the public site, and an
     address typed for letters should not be.

  3. letterhead_directory() now says where each email came from, and when
     there is none, why.
*/

-- 1. Per-letter letterhead fields ----------------------------------------------
alter table public.correspondence_drafts
  add column if not exists letterhead jsonb;

alter table public.correspondence_drafts
  drop constraint if exists correspondence_drafts_letterhead_check;

alter table public.correspondence_drafts
  add constraint correspondence_drafts_letterhead_check check (
    letterhead is null
    or (
      jsonb_typeof(letterhead) = 'object'
      and coalesce(letterhead ->> 'account_number', '') ~ '^[0-9]*$'
      and char_length(coalesce(letterhead ->> 'from', '')) <= 200
      and char_length(coalesce(letterhead ->> 'patrons', '')) <= 1200
      and char_length(coalesce(letterhead ->> 'advisers', '')) <= 1200
      and char_length(coalesce(letterhead ->> 'bank_name', '')) <= 80
      and char_length(coalesce(letterhead ->> 'account_name', '')) <= 120
      and char_length(coalesce(letterhead ->> 'account_number', '')) <= 20
    )
  );

comment on column public.correspondence_drafts.letterhead is
  'Formal letterhead only: {"from","patrons","advisers","bank_name","account_name","account_number"}. Patrons and advisers are one per line.';

-- 2. Letterhead email override --------------------------------------------------------
create table if not exists public.executive_contacts (
  executive_id      uuid primary key references public.executives (id) on delete cascade,
  letterhead_email  text check (
    letterhead_email is null
    or (char_length(letterhead_email) <= 120 and letterhead_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
  ),
  updated_by        uuid references auth.users (id) default auth.uid(),
  updated_at        timestamptz not null default now()
);

comment on table public.executive_contacts is
  'Private contact details used on letters. letterhead_email prints only when the executive has no linked account email.';

alter table public.executive_contacts enable row level security;

create policy "President and General Secretary read executive contacts"
  on public.executive_contacts for select
  using (
    exists (
      select 1 from public.admin_profiles p
      where p.user_id = (select auth.uid()) and p.is_active
        and p.role in ('president', 'general_secretary')
    )
  );

-- The roster is the President's, so its contact details are too.
create policy "President manages executive contacts"
  on public.executive_contacts for all
  using (
    exists (
      select 1 from public.admin_profiles p
      where p.user_id = (select auth.uid()) and p.is_active and p.role = 'president'
    )
  )
  with check (
    exists (
      select 1 from public.admin_profiles p
      where p.user_id = (select auth.uid()) and p.is_active and p.role = 'president'
    )
  );

-- 3. Directory with the source of each email -------------------------------------------
create or replace function public.letterhead_directory()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_set uuid;
  result jsonb;
begin
  if not exists (
    select 1 from public.admin_profiles p
    where p.user_id = (select auth.uid()) and p.is_active
  ) then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  select s.id into current_set
  from public.executive_sets s
  order by s.is_current desc nulls last, s.set_number desc nulls last
  limit 1;

  if not exists (select 1 from public.executives e where e.is_active and e.set_id = current_set) then
    current_set := null;
  end if;

  select coalesce(jsonb_agg(row_data order by ord nulls last, nm), '[]'::jsonb) into result
  from (
    select
      e.display_order as ord,
      coalesce(e.full_name, e.name) as nm,
      jsonb_build_object(
        'name', coalesce(nullif(btrim(e.full_name), ''), e.name),
        'office', e.office,
        'phone', nullif(btrim(coalesce(e.phone, '')), ''),
        'email', coalesce(
          case when p.is_active then lower(nullif(btrim(p.email), '')) end,
          lower(nullif(btrim(c.letterhead_email), ''))
        ),
        'email_source', case
          when p.is_active and nullif(btrim(p.email), '') is not null then 'account'
          when nullif(btrim(c.letterhead_email), '') is not null then 'override'
        end,
        -- Why there is no account email (an override may still cover it).
        'account_issue', case
          when e.user_id is null then 'not_linked'
          when p.user_id is null then 'account_missing'
          when not p.is_active then 'account_disabled'
          when nullif(btrim(p.email), '') is null then 'account_has_no_email'
        end,
        'linked', coalesce(p.is_active, false)
      ) as row_data
    from public.executives e
    left join public.admin_profiles p on p.user_id = e.user_id
    left join public.executive_contacts c on c.executive_id = e.id
    where e.is_active
      and (current_set is null or e.set_id = current_set)
  ) rows;

  return result;
end;
$$;

revoke execute on function public.letterhead_directory() from public, anon;
grant execute on function public.letterhead_directory() to authenticated;
