/*
  Student reviews belong to the President, Vice President, General Secretary
  and PRO -- not every admin. Keep in step with REVIEW_ROLES in
  src/utils/reviewCampaign.js.

  org_settings stays updatable by every active admin (correspondence edits its
  contact details), so the review switch is guarded by a trigger instead of
  the row policy.
*/
create or replace function public.is_review_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_profiles p
    where p.user_id = (select auth.uid())
      and p.is_active
      and p.role in ('president', 'vice_president', 'general_secretary', 'pro')
  );
$$;

drop policy if exists "Active admins read reviews" on public.app_reviews;

create policy "Review admins read reviews"
  on public.app_reviews for select
  using ((select public.is_review_admin()));

create or replace function public.guard_review_campaign()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.review_campaign_active is distinct from old.review_campaign_active
      or new.review_campaign_id is distinct from old.review_campaign_id)
     and (select auth.uid()) is not null   -- SQL editor / service role pass
     and not public.is_review_admin() then
    raise exception 'Only the President, Vice President, General Secretary or PRO can change the review campaign'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_review_campaign on public.org_settings;

create trigger guard_review_campaign
  before update on public.org_settings
  for each row execute function public.guard_review_campaign();
