
-- Seed the reusable default template and exact requested 16-tier default ladder.
do $$
declare
  v_challenge_id uuid;
begin
  select id into v_challenge_id
  from public.sales_challenges
  where is_template=true and title='DRIGHT Sales Challenge'
  order by created_at
  limit 1;

  if v_challenge_id is null then
    insert into public.sales_challenges(
      title,tagline,short_description,long_description,cta_label,
      completed_tier_message,expired_message,status,currency,
      minimum_product_price,minimum_retained_margin_pct,
      leaderboard_enabled,claims_enabled,is_template
    ) values (
      'DRIGHT Sales Challenge',
      'Sell More. Earn More. Unlock Bigger Rewards.',
      'Promote selected DRIGHT products, earn your normal affiliate commission on every qualified sale, and unlock one-time bonus rewards as you complete each fresh sales mission.',
      'The DRIGHT Sales Challenge rewards affiliates for consistent, verified sales of products selected for the challenge. Normal affiliate commission continues to be earned on every qualified sale. Challenge rewards are additional bonuses. Each sales milestone is a separate mission. After successfully claiming a completed mission reward, that mission is permanently closed for the current challenge cycle, the active sales counter resets to zero, and the next mission begins from zero. Previous mission sales do not count toward the next mission. Challenge progress does not carry into a new challenge cycle.',
      'Start Selling',
      'Mission complete. Claim your reward to unlock the next sales mission.',
      'This challenge has ended. Your unfinished progress has expired. Rewards successfully claimed during the challenge remain recorded in your account.',
      'DRAFT','NGN',20000,15,true,true,true
    ) returning id into v_challenge_id;
  end if;

  if not exists(select 1 from public.sales_challenge_tiers where challenge_id=v_challenge_id) then
    insert into public.sales_challenge_tiers(challenge_id,sort_order,sales_required,reward_type,cash_reward,enabled)
    values
      (v_challenge_id,1,25,'CASH',30000,true),
      (v_challenge_id,2,50,'CASH',60000,true),
      (v_challenge_id,3,75,'CASH',100000,true),
      (v_challenge_id,4,100,'CASH',150000,true),
      (v_challenge_id,5,150,'CASH',250000,true),
      (v_challenge_id,6,250,'CASH',450000,true),
      (v_challenge_id,7,350,'CASH',650000,true),
      (v_challenge_id,8,500,'CASH',1000000,true),
      (v_challenge_id,9,700,'CASH',1500000,true),
      (v_challenge_id,10,1000,'CASH',2200000,true),
      (v_challenge_id,11,1500,'CASH',3300000,true),
      (v_challenge_id,12,2000,'CASH',4600000,true),
      (v_challenge_id,13,2500,'CASH',6000000,true),
      (v_challenge_id,14,3000,'CASH',7800000,true),
      (v_challenge_id,15,5000,'CASH',12500000,true),
      (v_challenge_id,16,10000,'CASH',25000000,true);
  end if;
end $$;

-- Keep visible cycle status synchronized. Exact sale cutoffs do not depend on cron.
do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname='sales-challenge-cycle-tick' limit 1;
  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;
  perform cron.schedule(
    'sales-challenge-cycle-tick',
    '* * * * *',
    'select private.sales_challenge_tick();'
  );
end $$;
