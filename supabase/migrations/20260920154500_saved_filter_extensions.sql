-- Preserve newer marketplace filter controls without changing existing saved-filter columns.
begin;

alter table public.saved_filters
  add column if not exists extended_filters jsonb not null default '{}'::jsonb;

comment on column public.saved_filters.extended_filters is
  'Additive saved-filter metadata for advanced/taxonomy filters. Existing core columns remain authoritative and backward compatible.';

commit;
