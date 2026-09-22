begin;

update public.subscription_plans
set features='["₦10,000 ad credit","Targeted placements","Basic analytics"]'::jsonb,
    updated_at=now()
where slug='ads_starter';

update public.subscription_plans
set features='["₦50,000 ad credit","Premium placements","Advanced targeting","A/B testing","Conversion analytics","Dedicated ad manager"]'::jsonb,
    updated_at=now()
where slug='ads_pro';

commit;
