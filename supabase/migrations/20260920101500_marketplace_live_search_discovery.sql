insert into public.user_navigation_visibility
  (feature_key,label,route,nav_group,visible,visible_to_admins,feature_scope,sort_order)
values
  (
    'marketplace_search_discovery',
    'Marketplace Search Trending & Popular',
    'component:marketplace-search-discovery',
    'Marketplace Components',
    true,
    true,
    'component',
    330
  )
on conflict (feature_key) do update
set label=excluded.label,
    route=excluded.route,
    nav_group=excluded.nav_group,
    feature_scope=excluded.feature_scope,
    sort_order=excluded.sort_order;

create or replace function public.get_marketplace_search_discovery(p_limit integer default 5)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
with params as (
  select greatest(1, least(coalesce(p_limit, 5), 10)) as lim
),
eligible as (
  select p.id, p.name, p.category, p.product_type,
         coalesce(p.total_sales, 0) as total_sales,
         coalesce(p.view_count, 0) as view_count,
         coalesce(p.average_rating, 0) as average_rating,
         coalesce(p.total_reviews, 0) as total_reviews,
         p.created_at
  from public.products p
  where p.is_active = true
    and p.is_hidden = false
    and p.approval_status = 'approved'
),
recent_events as (
  select
    le.listing_id,
    count(*) filter (where le.created_at >= now() - interval '24 hours')::numeric as opens_24h,
    count(*) filter (where le.created_at >= now() - interval '7 days')::numeric as opens_7d,
    count(distinct le.user_id) filter (where le.created_at >= now() - interval '7 days')::numeric as unique_users_7d
  from public.listing_events le
  where le.listing_type = 'product'
    and le.event_type = 'open'
    and le.created_at >= now() - interval '7 days'
  group by le.listing_id
),
trending_ranked as (
  select
    e.id, e.name, e.category, e.product_type,
    (
      coalesce(r.opens_24h, 0) * 5
      + coalesce(r.opens_7d, 0) * 2
      + coalesce(r.unique_users_7d, 0) * 3
      + ln(1 + e.view_count::numeric) * 1.5
      + ln(1 + e.total_sales::numeric) * 4
      + case
          when e.created_at >= now() - interval '7 days' then 4
          when e.created_at >= now() - interval '30 days' then 2
          else 0
        end
    ) as score
  from eligible e
  left join recent_events r on r.listing_id = e.id
  order by score desc, e.created_at desc
  limit (select lim from params)
),
popular_ranked as (
  select e.id, e.name, e.category, e.product_type
  from eligible e
  order by e.total_sales desc, e.view_count desc, e.average_rating desc, e.total_reviews desc, e.created_at desc
  limit (select lim from params)
)
select jsonb_build_object(
  'trending',
  coalesce(
    (select jsonb_agg(jsonb_build_object(
      'id', t.id, 'name', t.name, 'category', t.category, 'product_type', t.product_type
    ) order by t.score desc) from trending_ranked t),
    '[]'::jsonb
  ),
  'popular',
  coalesce(
    (select jsonb_agg(jsonb_build_object(
      'id', p.id, 'name', p.name, 'category', p.category, 'product_type', p.product_type
    )) from popular_ranked p),
    '[]'::jsonb
  )
);
$$;

revoke all on function public.get_marketplace_search_discovery(integer) from public;
grant execute on function public.get_marketplace_search_discovery(integer) to anon, authenticated;
