/*
  Student review campaign.

  The on/off switch lives on the existing single-row org_settings table so
  admins can run a campaign without a deploy. org_settings stays admin-only;
  the public site reads just the two campaign fields through
  get_review_campaign(), which exposes nothing else on that row.

  Students are anonymous, so app_reviews accepts inserts from anyone, but only
  for the campaign that is currently live. Changing review_campaign_id starts a
  fresh campaign: every browser tracks its own state per campaign ID.
*/
alter table public.org_settings
  add column if not exists review_campaign_active boolean not null default false,
  add column if not exists review_campaign_id text not null default 'review-2026-1'
    check (review_campaign_id ~ '^[A-Za-z0-9_-]{1,64}$');

create or replace function public.get_review_campaign()
returns table (active boolean, campaign_id text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.review_campaign_active, s.review_campaign_id
  from public.org_settings s
  where s.id;
$$;

grant execute on function public.get_review_campaign() to anon, authenticated;

create table if not exists public.app_reviews (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  text not null,
  rating       smallint not null check (rating between 1 and 5),
  comment      text check (comment is null or char_length(comment) <= 1000),
  created_at   timestamptz not null default now()
);

comment on table public.app_reviews is
  'Anonymous star ratings (and optional comments) from the student review popup.';

create index if not exists app_reviews_campaign_idx
  on public.app_reviews (campaign_id, created_at desc);

alter table public.app_reviews enable row level security;

create policy "Anyone can review the live campaign"
  on public.app_reviews for insert
  to anon, authenticated
  with check (
    exists (
      select 1 from public.get_review_campaign() c
      where c.active and c.campaign_id = app_reviews.campaign_id
    )
  );

create policy "Active admins read reviews"
  on public.app_reviews for select
  using (
    exists (
      select 1 from public.admin_profiles p
      where p.user_id = (select auth.uid()) and p.is_active
    )
  );
