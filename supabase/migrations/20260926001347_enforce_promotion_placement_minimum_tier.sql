-- Enforce the administrator-configured minimum tier for every placement at campaign creation time.
do $$
declare v_def text;
begin
  select pg_get_functiondef('public.create_universal_promotion_campaign(jsonb)'::regprocedure)
  into v_def;

  if strpos(v_def,'ap.minimum_tier_rank >')=0 then
    v_def:=replace(
      v_def,
      'where ap.code is null or ap.enabled=false or ptp.placement_code is null or not(v_asset_type=any(ap.supported_asset_types))',
      'where ap.code is null or ap.enabled=false or ptp.placement_code is null or ap.minimum_tier_rank > coalesce((select tier_rank from public.promotion_tiers where code=v_tier),1) or not(v_asset_type=any(ap.supported_asset_types))'
    );
  end if;

  execute v_def;
end $$;
