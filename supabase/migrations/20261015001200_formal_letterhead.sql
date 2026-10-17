/*
  Formal letterhead: a third correspondence template.

  1. Drafts may now be 'letterhead', and remember which officers sign
     (one to three of President, Vice President, General Secretary).
  2. Footer-band lines live on the single settings row. Only the President
     and the General Secretary may change them.
  3. letterhead_directory() lists the current executive set for the sidebar,
     with each officer's email taken from the admin account linked to them.
*/

-- 1. Drafts ----------------------------------------------------------------
alter table public.correspondence_drafts
  drop constraint if exists correspondence_drafts_template_check;

alter table public.correspondence_drafts
  add constraint correspondence_drafts_template_check
  check (template in ('memo', 'letter', 'letterhead'));

alter table public.correspondence_drafts
  add column if not exists signatories text[];

alter table public.correspondence_drafts
  drop constraint if exists correspondence_drafts_signatories_check;

alter table public.correspondence_drafts
  add constraint correspondence_drafts_signatories_check
  check (
    signatories is null
    or (
      cardinality(signatories) between 1 and 3
      and signatories <@ array['president', 'vice_president', 'general_secretary']
    )
  );

comment on column public.correspondence_drafts.signatories is
  'Formal letterhead only: the offices that sign, in order. Null for memos and letters.';

-- 2. Footer band --------------------------------------------------------------
alter table public.org_settings
  add column if not exists letterhead_footer_1 text check (letterhead_footer_1 is null or char_length(letterhead_footer_1) <= 120),
  add column if not exists letterhead_footer_2 text check (letterhead_footer_2 is null or char_length(letterhead_footer_2) <= 120),
  add column if not exists letterhead_footer_3 text check (letterhead_footer_3 is null or char_length(letterhead_footer_3) <= 120),
  add column if not exists letterhead_show_account_details boolean not null default false;

comment on column public.org_settings.letterhead_footer_3 is
  'Account details (or patrons/advisers). Printed only when letterhead_show_account_details is on.';

-- Pre-filled with what the association already publishes; the rest is left
-- for the secretariat to write. No names or bank details are invented.
update public.org_settings
set
  letterhead_footer_1 = coalesce(letterhead_footer_1, 'E-mail: ' || nullif(btrim(email), '')),
  letterhead_footer_2 = coalesce(letterhead_footer_2, 'Instagram: ' || nullif(btrim(instagram), ''))
where id;

create or replace function public.guard_letterhead_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.letterhead_footer_1, new.letterhead_footer_2, new.letterhead_footer_3,
      new.letterhead_show_account_details)
     is distinct from
     (old.letterhead_footer_1, old.letterhead_footer_2, old.letterhead_footer_3,
      old.letterhead_show_account_details)
     and (select auth.uid()) is not null
     and not exists (
       select 1 from public.admin_profiles p
       where p.user_id = (select auth.uid()) and p.is_active
         and p.role in ('president', 'general_secretary')
     ) then
    raise exception 'Only the President or the General Secretary can change the letterhead footer.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_letterhead_settings on public.org_settings;
create trigger guard_letterhead_settings
  before update on public.org_settings
  for each row execute function public.guard_letterhead_settings();

-- 3. Sidebar directory ----------------------------------------------------------
/*
  The current executive set's active officers, in display order, for the
  letterhead sidebar.

  Email comes from the admin account linked to the executive by user id
  (executives.user_id, set when an officer's account is paired with their
  profile). There is no matching on names. An executive with no linked
  account, or whose account is disabled, comes back with no email; test or
  unlinked admin accounts never appear, because the list starts from the
  executives table.

  security definer because ordinary executives cannot read each other's
  admin rows. It returns only these fields, and only to active admins.
*/
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

  -- Same rule as the composer: the set marked current, else the newest.
  select s.id into current_set
  from public.executive_sets s
  order by s.is_current desc nulls last, s.set_number desc nulls last
  limit 1;

  -- Older executive rows predate sets; if nobody is tagged to the current
  -- set, list every active executive rather than an empty column.
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
        'email', case when p.is_active then lower(nullif(btrim(p.email), '')) end,
        'linked', coalesce(p.is_active, false)
      ) as row_data
    from public.executives e
    left join public.admin_profiles p on p.user_id = e.user_id
    where e.is_active
      and (current_set is null or e.set_id = current_set)
  ) rows;

  return result;
end;
$$;

revoke execute on function public.letterhead_directory() from public, anon;
grant execute on function public.letterhead_directory() to authenticated;
