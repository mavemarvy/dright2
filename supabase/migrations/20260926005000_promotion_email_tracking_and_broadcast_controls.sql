-- Consent-gated email promotions, tracked external clicks, and recommendation broadcast master control.

alter table public.telegram_broadcast_settings
  add column if not exists recommendation_broadcasts_enabled boolean not null default true;
update public.telegram_broadcast_settings
set recommendation_broadcasts_enabled=true,updated_at=now()
where singleton=true;

create or replace function public.enqueue_promotion_email_deliveries()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_asset public.campaign_assets%rowtype;
  v_user record;
  v_delivery_id uuid;
  v_token uuid;
  v_tracking_url text;
  v_frequency_cap integer:=1;
  v_window_hours integer:=168;
begin
  if not(
    new.status='active'
    and new.payment_status='paid'
    and new.payment_verified_at is not null
    and new.moderation_status='approved'
    and 'email'=any(coalesce(new.placements,'{}'::text[]))
  ) then return new; end if;

  select frequency_cap,frequency_window_hours into v_frequency_cap,v_window_hours
  from public.ad_placements where code='email' and enabled=true;
  if v_frequency_cap is null then return new; end if;

  select * into v_asset from public.campaign_assets
  where campaign_id=new.id and status='eligible'
  order by sort_order,created_at limit 1;
  if not found then return new; end if;

  for v_user in
    select u.id user_id,lower(btrim(u.email)) email
    from public.users u
    join public.cookie_consents cc on cc.user_id=u.id and cc.marketing_allowed=true
    left join public.notification_user_settings nus on nus.user_id=u.id
    where u.id<>new.seller_id
      and nullif(btrim(coalesce(u.email,'')),'') is not null
      and coalesce(upper(u.account_status),'ACTIVE')<>'BANNED'
      and coalesce((nus.delivery_channels->>'email')::boolean,true)=true
      and coalesce((nus.category_toggles->>'promotions')::boolean,true)=true
      and(
        select count(*) from public.promotion_external_deliveries ped
        where ped.recipient_user_id=u.id and ped.channel='email' and ped.status in('queued','sent')
          and ped.created_at>=now()-make_interval(hours=>greatest(v_window_hours,1))
      )<greatest(v_frequency_cap,1)
  loop
    v_token:=gen_random_uuid();
    v_delivery_id:=null;

    insert into public.promotion_external_deliveries(
      campaign_id,campaign_asset_id,seller_id,placement_code,channel,recipient_user_id,destination_key,
      idempotency_key,status,provider,audience_size_snapshot,delivered_count,tracked_clicks,tracking_token,
      destination_url,metadata
    ) values(
      new.id,v_asset.id,new.seller_id,'email','email',v_user.user_id,'user:'||v_user.user_id::text,
      'email:'||new.id::text||':'||v_user.user_id::text,'queued','resend',1,0,0,v_token,
      coalesce(nullif(v_asset.destination_snapshot,''),'https://dright.store'),
      jsonb_build_object('campaign_id',new.id,'campaign_asset_id',v_asset.id,'asset_type',v_asset.asset_type,'title',v_asset.title_snapshot)
    )
    on conflict(idempotency_key) do nothing
    returning id into v_delivery_id;

    if v_delivery_id is null then continue; end if;

    v_tracking_url:='https://vtiardblxpaeekbfvhjo.supabase.co/functions/v1/promotion-track?token='||v_token::text;

    insert into public.notification_email_outbox(
      notification_id,user_id,recipient_email,notification_type,category,priority,subject,message,metadata,status,provider
    ) values(
      null,v_user.user_id,v_user.email,'promotion_email','promotions','normal',
      'Sponsored on DRIGHT — '||coalesce(v_asset.title_snapshot,'Discover on DRIGHT'),
      coalesce(v_asset.title_snapshot,'A DRIGHT promotion')||
        case when new.goal is not null then ' · '||replace(new.goal,'_',' ') else '' end,
      jsonb_build_object(
        'action_url',v_tracking_url,'marketing_email',true,'campaign_id',new.id,'campaign_asset_id',v_asset.id,
        'external_delivery_id',v_delivery_id,'placement','email',
        'manage_preferences_url','https://dright.store/settings?tab=privacy'
      ),
      'pending','resend'
    );
  end loop;

  return new;
end $$;

drop trigger if exists trg_enqueue_promotion_email_deliveries on public.promotion_campaigns;
create trigger trg_enqueue_promotion_email_deliveries
after insert or update of status,payment_status,payment_verified_at,moderation_status,placements
on public.promotion_campaigns
for each row execute function public.enqueue_promotion_email_deliveries();
revoke all on function public.enqueue_promotion_email_deliveries() from public,anon,authenticated;

create or replace function public.record_promotion_external_click(p_token uuid)
returns text language plpgsql security definer set search_path=public as $$
declare
  v_role text:=coalesce(auth.role(),'');
  v_delivery public.promotion_external_deliveries%rowtype;
  v_asset public.campaign_assets%rowtype;
begin
  if v_role<>'service_role' then raise exception 'External click tracking requires service authority'; end if;

  select * into v_delivery from public.promotion_external_deliveries
  where tracking_token=p_token for update;
  if not found then return null; end if;

  update public.promotion_external_deliveries
  set tracked_clicks=tracked_clicks+1,last_clicked_at=now(),updated_at=now()
  where id=v_delivery.id;

  if v_delivery.campaign_asset_id is not null then
    select * into v_asset from public.campaign_assets where id=v_delivery.campaign_asset_id;
    if found then
      insert into public.campaign_events(campaign_id,listing_id,user_id,event_type,is_fraudulent,metadata)
      values(
        v_delivery.campaign_id,v_asset.asset_id,v_delivery.recipient_user_id,'click',false,
        jsonb_build_object(
          'placement',v_delivery.placement_code,'channel',v_delivery.channel,
          'campaign_asset_id',v_delivery.campaign_asset_id,'external_delivery_id',v_delivery.id,'external',true
        )
      );
    end if;
  end if;

  return v_delivery.destination_url;
end $$;
revoke all on function public.record_promotion_external_click(uuid) from public,anon,authenticated;
grant execute on function public.record_promotion_external_click(uuid) to service_role;
