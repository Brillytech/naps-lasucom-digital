-- Correspondence composer: draft storage and shared organisation settings.

create table if not exists public.correspondence_drafts (
  id             uuid primary key default gen_random_uuid(),
  template       text not null default 'memo'
                   check (template in ('memo', 'letter')),
  office         text not null
                   check (office in ('president', 'vice_president',
                                     'general_secretary', 'pro')),
  reference      text,
  subject        text,
  -- Editor output. Stored as HTML rather than a document tree so the render
  -- path stays independent of whichever editor the UI uses.
  body_html      text,
  document_date  date,
  status         text not null default 'draft'
                   check (status in ('draft', 'issued')),
  created_by     uuid references auth.users (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.correspondence_drafts is
  'Letters and memoranda in progress. Distinct from internal_records, which archives finished documents.';

create index if not exists correspondence_drafts_recent_idx
  on public.correspondence_drafts (updated_at desc);

/*
  Organisation settings.

  A single row, shared by the whole secretariat: the last saved value is what
  every future document shows, regardless of who edited it. The CHECK on a
  fixed id is what enforces "exactly one row" -- without it a second insert
  would silently create a competing set of values.
*/
create table if not exists public.org_settings (
  id          boolean primary key default true check (id),
  email       text not null default 'napslasucom@gmail.com',
  instagram   text not null default '@napslasucom',
  updated_by  uuid references auth.users (id),
  updated_at  timestamptz not null default now()
);

comment on table public.org_settings is
  'Single-row organisation contact details shared across all correspondence.';

insert into public.org_settings (id) values (true) on conflict (id) do nothing;

-- RLS: both tables are secretariat-only. Nothing here is public.
alter table public.correspondence_drafts enable row level security;
alter table public.org_settings enable row level security;

create policy "Active admins manage correspondence drafts"
  on public.correspondence_drafts for all
  using (
    exists (
      select 1 from public.admin_profiles p
      where p.user_id = (select auth.uid()) and p.is_active
    )
  )
  with check (
    exists (
      select 1 from public.admin_profiles p
      where p.user_id = (select auth.uid()) and p.is_active
    )
  );

create policy "Active admins read org settings"
  on public.org_settings for select
  using (
    exists (
      select 1 from public.admin_profiles p
      where p.user_id = (select auth.uid()) and p.is_active
    )
  );

create policy "Active admins update org settings"
  on public.org_settings for update
  using (
    exists (
      select 1 from public.admin_profiles p
      where p.user_id = (select auth.uid()) and p.is_active
    )
  )
  with check (
    exists (
      select 1 from public.admin_profiles p
      where p.user_id = (select auth.uid()) and p.is_active
    )
  );
