begin;

update public.marketplace_taxonomy_categories
set restricted=true,
    age_gate=case
      when moderation_tier in ('adult_age_gate','adult_regulated_review') then true
      else age_gate
    end,
    updated_at=now()
where moderation_tier in ('adult_age_gate','adult_regulated_review','restricted_health_review')
  and (restricted=false or (moderation_tier in ('adult_age_gate','adult_regulated_review') and age_gate=false));

commit;