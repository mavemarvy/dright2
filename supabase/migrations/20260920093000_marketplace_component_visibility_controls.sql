insert into public.user_navigation_visibility
  (feature_key,label,route,nav_group,visible,visible_to_admins,feature_scope,sort_order)
values
  (
    'marketplace_featured_sellers',
    'Marketplace Featured Sellers',
    'component:marketplace-featured-sellers',
    'Marketplace Components',
    true,
    true,
    'component',
    310
  ),
  (
    'marketplace_listing_count',
    'Marketplace Listing Count',
    'component:marketplace-listing-count',
    'Marketplace Components',
    true,
    true,
    'component',
    320
  )
on conflict (feature_key) do update
set label=excluded.label,
    route=excluded.route,
    nav_group=excluded.nav_group,
    feature_scope=excluded.feature_scope,
    sort_order=excluded.sort_order;
