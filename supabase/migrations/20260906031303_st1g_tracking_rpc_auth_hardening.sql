create or replace function public.get_or_create_tracking_link(p_user_id uuid, p_product_id uuid default null, p_source_type text default 'affiliate', p_source_level text default null, p_campaign_id uuid default null, p_sales_team_id uuid default null, p_team_member_id uuid default null, p_team_lead_id uuid default null)
returns table(link_id uuid, tracking_code text)
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; v_code text; v_user_code text;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then raise exception 'not authorized'; end if;
  if p_source_type not in ('affiliate','sales_team','advertiser','pro_advertiser','super_advertiser','partnership') then raise exception 'invalid source_type'; end if;
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