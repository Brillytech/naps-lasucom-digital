-- Adds AI-generated lecture explanations to public.resources.
--
-- Scope: lecture materials only. Past questions and timetables live in this
-- same table and are deliberately left untouched -- their processing_status
-- stays NULL, which is why the CHECK below permits NULL and why the backfill
-- and the index are both filtered on category = 'Materials'.

alter table public.resources
  add column if not exists generated_explanation jsonb,
  add column if not exists processing_status      text,
  add column if not exists generated_date         timestamptz,
  add column if not exists error_message          text,
  add column if not exists explanation_version    integer not null default 1,
  add column if not exists explanation_batch_id   text;

comment on column public.resources.generated_explanation is
  'Structured explanation produced by the offline batch. Shape is documented in scripts/explanationSchema.js.';
comment on column public.resources.explanation_batch_id is
  'Anthropic Batch API id for the run that claimed this row. Lets a killed run be traced back and resumed.';

-- Status vocabulary.
--
-- 'unsupported' is deliberately distinct from 'failed': a failure is worth
-- retrying (network blip, model error), whereas an unsupported file will
-- never work no matter how many times it is retried. At least one row in
-- this table is a 9 MB MP4 uploaded as a lecture material.
alter table public.resources
  drop constraint if exists resources_processing_status_check;

alter table public.resources
  add constraint resources_processing_status_check
  check (
    processing_status is null
    or processing_status in ('pending', 'processing', 'completed', 'failed', 'unsupported')
  );

-- Queue the materials, and only the materials.
update public.resources
   set processing_status = 'pending'
 where category = 'Materials'
   and processing_status is null;

-- Partial index for the queue scan. Deliberately narrow: the table is small,
-- and this index exists to serve the pipeline's status filter, not the
-- student-facing category/level/semester query (which seq-scans in under a
-- millisecond at this row count and would ignore an index anyway).
create index if not exists resources_pending_materials_idx
  on public.resources (processing_status)
  where category = 'Materials';
