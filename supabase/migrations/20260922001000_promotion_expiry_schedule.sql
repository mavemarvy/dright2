begin;

-- Delivery already enforces end_date > now() in get_promotion_delivery_v2.
-- This cron keeps persisted campaign status aligned with that real-time authority.
do $$
begin
  if exists(select 1 from cron.job where jobname='dright2-promotion-expiry') then
    perform cron.unschedule('dright2-promotion-expiry');
  end if;

  perform cron.schedule(
    'dright2-promotion-expiry',
    '*/5 * * * *',
    'select public.expire_campaigns();'
  );
end $$;

select public.expire_campaigns();

commit;
