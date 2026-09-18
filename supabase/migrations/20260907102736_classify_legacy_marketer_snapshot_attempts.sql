update public.marketer_social_analysis_snapshots
set analysis_status = case
  when analysis->>'status' = 'analyzed' then 'completed'
  when analysis->>'status' = 'limited_data' then 'partial'
  when analysis->>'status' in ('blocked_or_unavailable','fetch_failed','invalid_url') then 'failed'
  else analysis_status
end
where analysis ? 'status';