CREATE OR REPLACE FUNCTION public.get_marketplace_feed_v2(p_cursor text DEFAULT NULL::text, p_limit integer DEFAULT NULL::integer, p_search text DEFAULT NULL::text, p_category text DEFAULT NULL::text, p_min_price numeric DEFAULT NULL::numeric, p_max_price numeric DEFAULT NULL::numeric, p_location text DEFAULT NULL::text, p_verified_only boolean DEFAULT false, p_min_rating numeric DEFAULT NULL::numeric, p_product_type text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid:=auth.uid(); v_limit integer:=30; v_explore numeric:=8;
  wr numeric:=30; wv numeric:=15; wq numeric:=10; wc numeric:=15; ws numeric:=10; wrat numeric:=10; wf numeric:=5; wt numeric:=5;
  wi numeric:=22; wsa numeric:=10; wco numeric:=18; wsp numeric:=8;
  v_cursor_score numeric; v_cursor_epoch numeric; v_cursor_id uuid; v_result jsonb;
begin
  select marketplace_page_size,marketplace_exploration_percentage,marketplace_relevance_weight,marketplace_seller_verification_weight,
    marketplace_listing_quality_weight,marketplace_conversion_rate_weight,marketplace_sales_history_weight,marketplace_rating_weight,
    marketplace_freshness_weight,marketplace_trending_weight,marketplace_interest_weight,marketplace_seller_affinity_weight,
    marketplace_commerce_weight,search_personalization_weight
  into v_limit,v_explore,wr,wv,wq,wc,ws,wrat,wf,wt,wi,wsa,wco,wsp
  from public.algorithm_settings where is_singleton=true limit 1;
  v_limit:=least(greatest(coalesce(p_limit,v_limit,30),5),50);
  if p_cursor is not null and p_cursor<>'' then begin
    v_cursor_score:=split_part(p_cursor,'|',1)::numeric; v_cursor_epoch:=split_part(p_cursor,'|',2)::numeric; v_cursor_id:=split_part(p_cursor,'|',3)::uuid;
  exception when others then raise exception 'Invalid marketplace cursor'; end; end if;

  with base as (
    select p.id,p.name,p.description,p.price,p.commission_rate,p.image_url,p.category,p.uploaded_by,p.created_at,p.sales_team_tier,p.admin_task_percent,p.sales_team_task_percent,
      p.is_free,p.stock_quantity,p.initial_stock,p.product_type,p.demo_video_url,p.total_reviews,p.average_rating,p.total_sales,p.view_count,p.is_featured,p.is_sponsored,
      p.location,p.tags,p.brand,p.condition,
      u.full_name seller_name,u.avatar_url seller_avatar,u.store_title store_name,coalesce(u.is_verified,false) seller_verified,
      coalesce(ls.dds_score,0)::numeric dds_score,coalesce(ls.trending_score,0)::numeric listing_trending_score,
      case when coalesce(btrim(p_search),'')='' then .50
        when lower(p.name)=lower(btrim(p_search)) then 1.00
        when lower(p.name) like lower(btrim(p_search))||'%' then .90
        when p.name ilike '%'||btrim(p_search)||'%' then .80
        when p.category ilike '%'||btrim(p_search)||'%' then .65
        when coalesce(p.description,'') ilike '%'||btrim(p_search)||'%' then .45
        when exists(select 1 from unnest(coalesce(p.tags,'{}'::text[])) tag where tag ilike '%'||btrim(p_search)||'%') then .55
        else 0 end::numeric search_relevance,
      case when v_uid is null then 0 else coalesce((uip.scores->>p.category)::numeric,0)/100 end category_affinity,
      case when v_uid is null then 0 else coalesce((uip.seller_scores->>p.uploaded_by::text)::numeric,0)/100 end seller_affinity,
      case when v_uid is null then 0 else coalesce((uip.commerce_scores->>p.category)::numeric,0)/100 end commerce_affinity,
      (case when p.image_url is not null then .34 else 0 end + case when length(coalesce(p.description,''))>=50 then .33 else 0 end + case when p.stock_quantity is not null then .33 else 0 end)::numeric listing_quality,
      least(case when coalesce(p.view_count,0)>0 then coalesce(p.total_sales,0)::numeric/p.view_count else 0 end,1)::numeric conversion_rate,
      least(ln(1+greatest(coalesce(p.total_sales,0),0))/ln(101),1)::numeric sales_score,
      case when coalesce(p.total_reviews,0)>0 then least(greatest(coalesce(p.average_rating,0)::numeric/5,0),1) else .35 end rating_score,
      greatest(0,1-extract(epoch from(now()-p.created_at))/2592000.0)::numeric freshness_score,
      greatest(least(coalesce(ls.trending_score,0)::numeric/100,1),least(coalesce(p.view_count,0)::numeric/200,1))::numeric trend_score
    from public.products p
    join public.users u on u.id=p.uploaded_by
    left join public.listing_scores ls on ls.listing_id=p.id
    left join public.user_interest_profiles uip on uip.user_id=v_uid
    where p.is_active=true and p.is_hidden=false and p.approval_status='approved'
      and coalesce(u.account_status,'active') not in ('banned','suspended','deleted','disabled')
      and (p_category is null or p_category='' or lower(p.category)=lower(p_category))
      and (p_min_price is null or (p.price * (1 + (case when coalesce(p.sales_team_task_percent,0)>0 then p.sales_team_task_percent else coalesce(p.admin_task_percent,0) end)/100.0))>=p_min_price) and (p_max_price is null or (p.price * (1 + (case when coalesce(p.sales_team_task_percent,0)>0 then p.sales_team_task_percent else coalesce(p.admin_task_percent,0) end)/100.0))<=p_max_price)
      and (p_location is null or p_location='' or coalesce(p.location,u.store_location,u.location,'') ilike '%'||p_location||'%')
      and (not coalesce(p_verified_only,false) or coalesce(u.is_verified,false)=true)
      and (p_min_rating is null or coalesce(p.average_rating,0)>=p_min_rating)
      and (p_product_type is null or p_product_type='' or upper(p.product_type)=upper(p_product_type))
      and (coalesce(btrim(p_search),'')='' or p.name ilike '%'||btrim(p_search)||'%' or p.category ilike '%'||btrim(p_search)||'%' or coalesce(p.description,'') ilike '%'||btrim(p_search)||'%' or exists(select 1 from unnest(coalesce(p.tags,'{}'::text[])) tag where tag ilike '%'||btrim(p_search)||'%'))
      and (v_uid is null or not exists(select 1 from public.user_blocks b where (b.blocker_id=v_uid and b.blocked_id=p.uploaded_by) or (b.blocker_id=p.uploaded_by and b.blocked_id=v_uid)))
  ), ranked as (
    select b.*,
      (b.search_relevance*wr + (case when b.seller_verified then 1 else 0 end)*wv + b.listing_quality*wq + b.conversion_rate*wc + b.sales_score*ws + b.rating_score*wrat + b.freshness_score*wf + b.trend_score*wt
       + b.category_affinity*wi + b.seller_affinity*wsa + b.commerce_affinity*wco
       + case when coalesce(btrim(p_search),'')<>'' then b.category_affinity*wsp else 0 end
       + least(b.dds_score,100)*.05
       + case when mod(abs(hashtextextended(b.id::text||coalesce(v_uid::text,'anon')||current_date::text,0)),100)<v_explore then greatest(v_explore*.35,1) else 0 end)::numeric final_score,
      case when v_uid is not null and b.commerce_affinity>=.65 then 'commerce_affinity'
           when v_uid is not null and b.category_affinity>=.55 then 'similar_category'
           when b.trend_score>=.70 then 'trending'
           when b.freshness_score>=.80 then 'fresh'
           else 'recommended' end recommendation_reason
    from base b
  ), keyed as (
    select * from ranked where v_cursor_score is null or final_score<v_cursor_score
      or (final_score=v_cursor_score and extract(epoch from created_at)<v_cursor_epoch)
      or (final_score=v_cursor_score and extract(epoch from created_at)=v_cursor_epoch and id<v_cursor_id)
  ), page_all as (
    select * from keyed order by final_score desc,created_at desc,id desc limit v_limit+1
  ), page as (
    select * from page_all order by final_score desc,created_at desc,id desc limit v_limit
  )
  select jsonb_build_object(
    'items',coalesce(jsonb_agg(to_jsonb(page)-'final_score'-'search_relevance'-'category_affinity'-'seller_affinity'-'commerce_affinity'-'listing_quality'-'conversion_rate'-'sales_score'-'rating_score'-'freshness_score'-'trend_score'-'dds_score'-'listing_trending_score' order by final_score desc,created_at desc,id desc),'[]'::jsonb),
    'has_more',(select count(*) from page_all)>v_limit,
    'next_cursor',(select final_score::text||'|'||extract(epoch from created_at)::text||'|'||id::text from page order by final_score asc,created_at asc,id asc limit 1),
    'personalized',(v_uid is not null and exists(select 1 from public.user_interest_profiles where user_id=v_uid and interaction_count>0)),
    'algorithm_version',2
  ) into v_result from page;
  return coalesce(v_result,jsonb_build_object('items','[]'::jsonb,'has_more',false,'next_cursor',null,'personalized',false,'algorithm_version',2));
end $function$
