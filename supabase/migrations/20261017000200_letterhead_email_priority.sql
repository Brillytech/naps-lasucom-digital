/*
  Formal letterhead: typed emails win, and the General Secretary may type them.

  1. A letterhead email typed for an executive (executive_contacts) now ALWAYS
     prints, ahead of the linked admin account's email. Without one, the
     account email is used; with neither, the line is left out, as before.

  2. The President and the General Secretary may both set, change or clear
     typed emails (they could both already read them). Nobody else can.

  3. letterhead_directory() also returns each executive's id and, for the
     President and General Secretary only, the typed email itself, so the
     composer can edit it in place. email_source is now 'typed' or 'account',
     and account_issue gains 'not_in_current_set' for the fallback where the
     current set has no active executives and an older set is shown.
*/

-- 2. Who may edit typed emails ------------------------------------------------
drop policy if exists "President manages executive contacts" on public.executive_contacts;
drop policy if exists "President and General Secretary manage executive contacts" on public.executive_contacts;

create policy "President and General Secretary manage executive contacts"
  on public.executive_contacts for all
  using (
    exists (
      select 1 from public.admin_profiles p
      where p.user_id = (select auth.uid()) and p.is_active
        and p.role in ('president', 'general_secretary')
    )
  )
  with check (
    exists (
      select 1 from public.admin_profiles p
      where p.user_id = (select auth.uid()) and p.is_active
        and p.role in ('president', 'general_secretary')
    )
  );

comment on table public.executive_contacts is
  'Private contact details used on letters. A typed letterhead_email always prints, ahead of the linked account email.';

-- 1 and 3. Directory ---------------------------------------------------------
create or replace function public.letterhead_directory()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  marked_set uuid;
  current_set uuid;
  can_edit boolean;
  result jsonb;
begin
  if not exists (
    select 1 from public.admin_profiles p
    where p.user_id = (select auth.uid()) and p.is_active
  ) then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  can_edit := exists (
    select 1 from public.admin_profiles p
    where p.user_id = (select auth.uid()) and p.is_active
      and p.role in ('president', 'general_secretary')
  );

  select s.id into marked_set
  from public.executive_sets s
  order by s.is_current desc nulls last, s.set_number desc nulls last
  limit 1;

  current_set := marked_set;
  if not exists (select 1 from public.executives e where e.is_active and e.set_id = current_set) then
    current_set := null;
  end if;

  select coalesce(jsonb_agg(row_data order by ord nulls last, nm), '[]'::jsonb) into result
  from (
    select
      e.display_order as ord,
      coalesce(e.full_name, e.name) as nm,
      jsonb_build_object(
        'id', e.id,
        'name', coalesce(nullif(btrim(e.full_name), ''), e.name),
        'office', e.office,
        'phone', nullif(btrim(coalesce(e.phone, '')), ''),
        -- Typed first, always; then the active account's email.
        'email', coalesce(
          lower(nullif(btrim(c.letterhead_email), '')),
          case when p.is_active then lower(nullif(btrim(p.email), '')) end
        ),
        'email_source', case
          when nullif(btrim(c.letterhead_email), '') is not null then 'typed'
          when p.is_active and nullif(btrim(p.email), '') is not null then 'account'
        end,
        'typed_email', case when can_edit then lower(nullif(btrim(c.letterhead_email), '')) end,
        -- Why there is no account email (a typed email may still cover it).
        'account_issue', case
          when marked_set is not null and e.set_id is distinct from marked_set then 'not_in_current_set'
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
