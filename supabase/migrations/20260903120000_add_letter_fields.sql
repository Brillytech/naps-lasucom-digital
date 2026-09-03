-- Letter drafts carry an addressee, a salutation and a complimentary close.
-- Memos have none of these, so the columns are nullable rather than defaulted:
-- a null here means "this is a memo", not "somebody left it blank".

alter table public.correspondence_drafts
  add column if not exists recipient  text,
  add column if not exists salutation text,
  add column if not exists closing    text;

comment on column public.correspondence_drafts.recipient is
  'Addressee block, one line per newline. Letters only.';
