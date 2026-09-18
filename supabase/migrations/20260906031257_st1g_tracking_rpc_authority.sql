create or replace function public.resolve_tracking_link(p_code text, p_product_id uuid default null)
returns table(link_id uuid, owner_id uuid, tracking_code text, product_id uuid, source_type text, source_level text, campaign_id uuid, sales_team_id uuid, team_member_id uuid, team_lead_id uuid)
language sql
security definer
set search_path = public
as $$
  select rl.id, rl.user_id, rl.unique_code, rl.product_id, rl.source_type, rl.source_level, rl.campaign_id, rl.sales_team_id, rl.team_member_id, rl.team_lead_id
  from public.referral_links rl
  where rl.unique_code = p_code
    and (p_product_id is null or rl.product_id = p_product_id or rl.product_id is null)
  order by case when p_product_id is not null and rl.product_id = p_product_id then 0 else 1 end
  limit 1;
$$;

create or replace function public.get_or_create_tracking_link(p_user_id uuid, p_product_id uuid default null, p_source_type text default 'affiliate', p_source_level text default null, p_campaign_id uuid default null, p_sales_team_id uuid default null, p_team_member_id uuid default null, p_team_lead_id uuid default null)
returns table(link_id uuid, tracking_code text)
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; v_code text; v_user_code text;
begin
  if p_user_id is null then raise exception 'user_id is required'; end if;
  select referral_code into v_user_code from public.users where id=p_user_id;
  if v_user_code is null or length(trim(v_user_code))=0 then raise exception 'user has no referral code'; end if;
  select id, unique_code into v_id, v_code from public.referral_links where user_id=p_user_id and product_id is not distinct from p_product_id and source_type=p_source_type and coalesce(source_level,'')=coalesce(p_source_level,'') and campaign_id is not distinct from p_campaign_id and sales_team_id is not distinct from p_sales_team_id and team_member_id is not distinct from p_team_member_id and team_lead_id is not distinct from p_team_lead_id limit 1;
  if v_id is null then
    v_code := case when p_product_id is null and p_source_type='affiliate' then v_user_code else upper(substr(md5(p_user_id::text || coalesce(p_product_id::text,'') || p_source_type || coalesce(p_source_level,'') || clock_timestamp()::text),1,10)) end;
    insert into public.referral_links(user_id,unique_code,product_id,source_type,source_level,campaign_id,sales_team_id,team_member_id,team_lead_id,total_clicks,total_conversions)
    values(p_user_id,v_code,p_product_id,p_source_type,p_source_level,p_campaign_id,p_sales_team_id,p_team_member_id,p_team_lead_id,0,0)
    returning id into v_id;
  end if;
  return query select v_id,v_code;
end;
$$;

create or replace function public.record_tracking_click(p_code text, p_product_id uuid default null, p_visitor_id text default null, p_session_id text default null)
returns table(link_id uuid, owner_id uuid, source_type text, source_level text, campaign_id uuid, sales_team_id uuid, team_member_id uuid, team_lead_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare r record;
begin
  select * into r from public.resolve_tracking_link(p_code,p_product_id) limit 1;
  if r.link_id is null then return; end if;
  insert into public.affiliate_clicks(referrer_id,product_id,source,referral_link_id,tracking_code,source_type,source_level,campaign_id,sales_team_id,team_member_id,team_lead_id,visitor_id,session_id,attribution_at)
  values(r.owner_id,r.product_id,'tracked_link',r.link_id,r.tracking_code,r.source_type,r.source_level,r.campaign_id,r.sales_team_id,r.team_member_id,r.team_lead_id,p_visitor_id,p_session_id,now());
  update public.referral_links set total_clicks=coalesce(total_clicks,0)+1 where id=r.link_id;
  return query select r.link_id,r.owner_id,r.source_type,r.source_level,r.campaign_id,r.sales_team_id,r.team_member_id,r.team_lead_id;
end;
$$;

revoke all on function public.resolve_tracking_link(text,uuid) from public;
revoke all on function public.get_or_create_tracking_link(uuid,uuid,text,text,uuid,uuid,uuid,uuid) from public;
revoke all on function public.record_tracking_click(text,uuid,text,text) from public;
grant execute on function public.resolve_tracking_link(text,uuid) to anon,authenticated;
grant execute on function public.get_or_create_tracking_link(uuid,uuid,text,text,uuid,uuid,uuid,uuid) to authenticated;
grant execute on function public.record_tracking_click(text,uuid,text,text) to anon,authenticated;