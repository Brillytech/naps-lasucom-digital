/*
  Formal letterhead, round two: Patrons/Advisers and account details as two
  separate settings groups, each with its own switch.

  - letterhead_patrons / letterhead_advisers: lists of { name, title }.
    Printed as a strip at the foot of page 1 when letterhead_show_patrons
    is on.
  - letterhead_bank_name / _account_name / _account_number: printed in the
    footer band when letterhead_show_account_details is on.

  The free-text footer lines from 20261015001200 are no longer printed. Any
  "Patron: ..." or "Adviser: ..." entry already typed into them is moved into
  the new lists below, so nothing has to be re-entered. The old lines
  themselves are kept, not deleted.

  As before, only the President and the General Secretary may change these.
*/

alter table public.org_settings
  add column if not exists letterhead_patrons jsonb not null default '[]'::jsonb,
  add column if not exists letterhead_advisers jsonb not null default '[]'::jsonb,
  add column if not exists letterhead_show_patrons boolean not null default false,
  add column if not exists letterhead_bank_name text,
  add column if not exists letterhead_account_name text,
  add column if not exists letterhead_account_number text;

alter table public.org_settings
  drop constraint if exists org_settings_letterhead_people_check,
  drop constraint if exists org_settings_letterhead_account_check;

alter table public.org_settings
  add constraint org_settings_letterhead_people_check check (
    jsonb_typeof(letterhead_patrons) = 'array' and jsonb_array_length(letterhead_patrons) <= 8
    and jsonb_typeof(letterhead_advisers) = 'array' and jsonb_array_length(letterhead_advisers) <= 8
  ),
  add constraint org_settings_letterhead_account_check check (
    (letterhead_bank_name is null or char_length(letterhead_bank_name) <= 80)
    and (letterhead_account_name is null or char_length(letterhead_account_name) <= 120)
    and (letterhead_account_number is null or letterhead_account_number ~ '^[0-9 ]{6,20}$')
  );

comment on column public.org_settings.letterhead_patrons is
  'Formal letterhead: [{"name": "...", "title": "..."}], printed under "Patron(s)" when letterhead_show_patrons is on.';
comment on column public.org_settings.letterhead_show_account_details is
  'Formal letterhead: print bank name, account name and number in the footer band.';

-- Carry over patrons and advisers already typed into the old footer lines.
-- A line may hold several entries separated by "·" or "|"; each entry
-- "Patron: Name" / "Advisers - Name; Name" is read, nothing is guessed.
do $$
declare
  line text;
  segment text;
  m text[];
  name text;
  patrons jsonb := '[]'::jsonb;
  advisers jsonb := '[]'::jsonb;
begin
  for line in
    select unnest(array[letterhead_footer_1, letterhead_footer_2, letterhead_footer_3])
    from public.org_settings where id
  loop
    continue when line is null;
    foreach segment in array regexp_split_to_array(line, '\s*[·|]\s*') loop
      m := regexp_match(segment, '^\s*(patron|patrons|patroness|matron|adviser|advisers|advisor|advisors)\s*[:\-–—]\s*(.+?)\s*$', 'i');
      continue when m is null;
      foreach name in array regexp_split_to_array(m[2], '\s*;\s*') loop
        continue when btrim(name) = '';
        if lower(m[1]) like 'advis%' then
          advisers := advisers || jsonb_build_array(jsonb_build_object('name', btrim(name), 'title', ''));
        else
          patrons := patrons || jsonb_build_array(jsonb_build_object('name', btrim(name), 'title', ''));
        end if;
      end loop;
    end loop;
  end loop;

  if jsonb_array_length(patrons) > 0 or jsonb_array_length(advisers) > 0 then
    update public.org_settings
    set
      letterhead_patrons = case when jsonb_array_length(letterhead_patrons) = 0 then patrons else letterhead_patrons end,
      letterhead_advisers = case when jsonb_array_length(letterhead_advisers) = 0 then advisers else letterhead_advisers end,
      letterhead_show_patrons = true
    where id;
  end if;
end;
$$;

-- Same rule as before, now covering the new fields.
create or replace function public.guard_letterhead_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.letterhead_footer_1, new.letterhead_footer_2, new.letterhead_footer_3,
      new.letterhead_show_account_details, new.letterhead_patrons, new.letterhead_advisers,
      new.letterhead_show_patrons, new.letterhead_bank_name, new.letterhead_account_name,
      new.letterhead_account_number)
     is distinct from
     (old.letterhead_footer_1, old.letterhead_footer_2, old.letterhead_footer_3,
      old.letterhead_show_account_details, old.letterhead_patrons, old.letterhead_advisers,
      old.letterhead_show_patrons, old.letterhead_bank_name, old.letterhead_account_name,
      old.letterhead_account_number)
     and (select auth.uid()) is not null
     and not exists (
       select 1 from public.admin_profiles p
       where p.user_id = (select auth.uid()) and p.is_active
         and p.role in ('president', 'general_secretary')
     ) then
    raise exception 'Only the President or the General Secretary can change the letterhead settings.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
