update public.marketer_profile_deep_research
set status='partial',
    failure_category=coalesce(failure_category,'AI_PROVIDER_FAILURE'),
    evidence_count=greatest(evidence_count, jsonb_array_length(coalesce(research->'search_evidence','[]'::jsonb))),
    search_sources=case when jsonb_array_length(coalesce(research->'search_evidence','[]'::jsonb))>0 and jsonb_array_length(search_sources)=0 then '["Serper/Google"]'::jsonb else search_sources end,
    providers_used=case when jsonb_array_length(coalesce(research->'search_evidence','[]'::jsonb))>0 and jsonb_array_length(providers_used)=0 then '["Serper/Google"]'::jsonb else providers_used end,
    summary=coalesce(summary, research->'research'->>'summary', 'Public search evidence was preserved, but AI synthesis was unavailable.'),
    recommendation=coalesce(recommendation, research->'research'->>'recommendation', 'MANUAL_REVIEW'),
    limitations=case when jsonb_array_length(limitations)=0 then coalesce(research->'research'->'limitations','["AI synthesis was unavailable for this historical run."]'::jsonb) else limitations end,
    updated_at=now()
where status='failed'
  and jsonb_array_length(coalesce(research->'search_evidence','[]'::jsonb))>0;

create index if not exists idx_marketer_signals_resolved_by on public.marketer_monitoring_signals(resolved_by);