import { supabase } from './supabase';

export type PromotionTierCode = 'normal' | 'plus' | 'platinum';
export type PromotionAssetType = 'product' | 'service' | 'course' | 'job' | 'campaign' | 'store' | 'profile' | 'sales_team' | 'community';
export type PromotionGoal =
  | 'more_views' | 'more_clicks' | 'more_sales' | 'more_messages'
  | 'more_job_applications' | 'more_course_enrollments' | 'more_listing_visits'
  | 'more_store_visits' | 'more_profile_visits' | 'more_community_visits'
  | 'more_conversions' | 'more_leads' | 'more_qualified_applicants'
  | 'more_service_inquiries' | 'more_campaign_participation' | 'more_hiring_requests';

export interface PromotionTier {
  code: PromotionTierCode;
  name: string;
  description: string | null;
  tier_rank: number;
  is_enabled: boolean;
  pricing_multiplier: number;
  reach_multiplier: number;
}

export interface AdPlacement {
  code: string;
  name: string;
  description: string | null;
  enabled: boolean;
  minimum_tier_rank: number;
  contextual: boolean;
  premium: boolean;
  surcharge: number;
  density_organic_interval: number;
  frequency_cap: number;
  frequency_window_hours: number;
  supported_asset_types: PromotionAssetType[];
  supported_goals: string[];
  creative_types: string[];
  preview_key: string;
  sort_order: number;
}

export interface PromotableAsset {
  asset_type: PromotionAssetType;
  asset_id: string;
  title: string;
  subtitle: string;
  image_url: string | null;
  destination: string;
  status: string;
  public_id: string;
  price?: number | null;
}

export interface CampaignCreateResult {
  campaign_id: string;
  status: string;
  payment_status: string;
  tier: PromotionTierCode;
  media_budget: number;
  placement_fee_total: number;
  platform_fee: number;
  tax_amount: number;
  total_payable: number;
  currency: string;
}

export interface CampaignAssetRecord {
  id: string;
  campaign_id: string;
  asset_type: PromotionAssetType;
  asset_id: string;
  allocation_amount: number;
  allocation_percent: number;
  title_snapshot: string | null;
  image_snapshot: string | null;
  destination_snapshot: string | null;
  actual_spend: number;
  actual_impressions: number;
  actual_clicks: number;
  actual_conversions: number;
}

export interface CampaignPlacementRecord {
  id: string;
  campaign_id: string;
  placement_code: string;
  tier_code: PromotionTierCode;
  placement_fee: number;
  status: string;
  actual_spend: number;
  actual_impressions: number;
  actual_clicks: number;
  actual_conversions: number;
}

export interface UniversalCampaign {
  id: string;
  seller_id: string;
  goal: PromotionGoal;
  tier_code: PromotionTierCode;
  owner_profile_type: string;
  budget: number;
  media_budget: number;
  placement_fee_total: number;
  platform_fee: number;
  tax_amount: number;
  total_payable: number;
  billing_currency: string;
  duration_days: number;
  start_date: string;
  end_date: string;
  status: string;
  payment_status: string;
  actual_spend: number;
  actual_impressions: number;
  actual_clicks: number;
  actual_conversions: number;
  actual_reach: number;
  estimated_reach: number;
  estimated_impressions: number;
  estimated_clicks: number;
  estimated_conversions: number;
  allow_comments: boolean;
  created_at: string;
  placements: string[];
  campaign_assets?: CampaignAssetRecord[];
  campaign_placements?: CampaignPlacementRecord[];
}

export interface SponsoredDeliveryItem {
  campaign_id: string;
  campaign_asset_id: string;
  asset_type: PromotionAssetType;
  asset_id: string;
  tier_code: PromotionTierCode;
  goal: string;
  placement: string;
  title: string | null;
  description: string | null;
  image_url: string | null;
  cta_label: string | null;
  destination: string | null;
  allow_comments: boolean;
  seller_id: string;
  sponsored_label: string;
}

export interface UniversalCampaignPayload {
  tier: PromotionTierCode;
  goal: PromotionGoal;
  owner_profile_type: string;
  audience_type: 'everyone' | 'country' | 'state' | 'city' | 'category' | 'interests' | 'followers';
  audience_country?: string;
  audience_state?: string;
  audience_city?: string;
  audience_category?: string;
  audience_interests?: string[];
  audience_followers_only?: boolean;
  budget: number;
  duration_days: number;
  daily_budget?: number;
  pacing_mode: 'even' | 'accelerated';
  allow_comments: boolean;
  placements: string[];
  assets: Array<{ asset_type: PromotionAssetType; asset_id: string; allocation_amount?: number }>;
}

const money = (value: unknown) => Number(value || 0);

export async function fetchPromotionConfiguration() {
  const [tiersRes, placementsRes, linksRes, settingsRes, pricingRes] = await Promise.all([
    supabase.from('promotion_tiers').select('*').eq('is_enabled', true).order('tier_rank'),
    supabase.from('ad_placements').select('*').order('sort_order'),
    supabase.from('promotion_tier_placements').select('*').eq('is_included', true),
    supabase.from('promotion_distribution_settings').select('*').eq('singleton', true).maybeSingle(),
    supabase.from('promotion_pricing').select('*').eq('is_singleton', true).maybeSingle(),
  ]);

  return {
    tiers: ((tiersRes.data || []) as PromotionTier[]).map(t => ({ ...t, pricing_multiplier: money(t.pricing_multiplier), reach_multiplier: money(t.reach_multiplier) })),
    placements: ((placementsRes.data || []) as AdPlacement[]).map(p => ({ ...p, surcharge: money(p.surcharge) })),
    tierPlacements: linksRes.data || [],
    settings: settingsRes.data || null,
    pricing: pricingRes.data || null,
  };
}

export async function fetchPromotableAssets(userId: string): Promise<PromotableAsset[]> {
  const [productsRes, jobsRes, campaignsRes, profileRes] = await Promise.all([
    supabase.from('products')
      .select('id,name,category,image_url,price,product_type,approval_status,is_active,is_hidden')
      .eq('uploaded_by', userId)
      .eq('is_active', true)
      .eq('is_hidden', false)
      .eq('approval_status', 'approved')
      .order('created_at', { ascending: false }),
    supabase.from('jobs')
      .select('id,title,company_name,status,salary_currency,salary_min,salary_max')
      .eq('employer_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false }),
    supabase.from('cc_campaigns')
      .select('id,name,task_type,status,reward_per_completion')
      .eq('creator_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false }),
    supabase.from('users')
      .select('id,full_name,username,role,avatar_url,profession,store_title,store_banner_url,store_description,marketer_level,marketer_status,advertiser_grade,advertiser_status,is_verified')
      .eq('id', userId)
      .maybeSingle(),
  ]);

  const assets: PromotableAsset[] = [];
  for (const row of productsRes.data || []) {
    const raw = String(row.product_type || '').toUpperCase();
    const assetType: PromotionAssetType = raw === 'SERVICE' ? 'service' : raw === 'COURSE' ? 'course' : 'product';
    assets.push({
      asset_type: assetType,
      asset_id: row.id,
      title: row.name,
      subtitle: row.category || (assetType === 'product' ? 'Product' : assetType),
      image_url: row.image_url || null,
      destination: `/product/${row.id}`,
      status: 'Eligible',
      public_id: row.id,
      price: row.price == null ? null : Number(row.price),
    });
  }

  for (const row of jobsRes.data || []) {
    assets.push({
      asset_type: 'job', asset_id: row.id, title: row.title,
      subtitle: row.company_name || 'Job opportunity', image_url: null,
      destination: `/jobs/${row.id}`, status: 'Eligible', public_id: row.id,
    });
  }

  for (const row of campaignsRes.data || []) {
    assets.push({
      asset_type: 'campaign', asset_id: row.id, title: row.name,
      subtitle: row.task_type || 'Campaign / task', image_url: null,
      destination: `/creator-campaigns/${row.id}`, status: 'Eligible', public_id: row.id,
    });
  }

  const profile = profileRes.data;
  if (profile?.store_title || profile?.store_description) {
    assets.push({
      asset_type: 'store', asset_id: userId,
      title: profile.store_title || `${profile.full_name || 'My'} Store`,
      subtitle: 'Store', image_url: profile.store_banner_url || profile.avatar_url || null,
      destination: `/shop/${userId}`, status: 'Eligible', public_id: userId,
    });
  }

  const hasProfessionalCapability = Boolean(
    assets.length ||
    ['affiliate', 'seller', 'vendor', 'employer', 'freelancer', 'creator', 'service_provider'].includes(String(profile?.role || '').toLowerCase()) ||
    profile?.marketer_status === 'approved' || profile?.advertiser_status === 'approved'
  );
  if (profile && hasProfessionalCapability) {
    assets.push({
      asset_type: 'profile', asset_id: userId,
      title: profile.full_name || profile.username || 'Professional profile',
      subtitle: profile.profession || 'Professional profile', image_url: profile.avatar_url || null,
      destination: `/profile/${userId}`, status: 'Eligible', public_id: userId,
    });
  }

  const marketerEligible = profile?.marketer_status === 'approved' && Number(profile?.marketer_level || 0) >= 3;
  const advertiserEligible = profile?.advertiser_status === 'approved' && Boolean(profile?.advertiser_grade);
  if (profile && (marketerEligible || advertiserEligible)) {
    const label = marketerEligible ? `Marketer L${profile.marketer_level}` : `Advertiser ${profile.advertiser_grade}`;
    assets.push({
      asset_type: 'sales_team', asset_id: userId,
      title: profile.full_name || profile.username || 'Sales Team professional',
      subtitle: label, image_url: profile.avatar_url || null,
      destination: `/profile/${userId}`, status: 'Verified Sales Team', public_id: userId,
    });
  }

  return assets;
}

export function goalsForAssets(assets: PromotableAsset[]): Array<{ value: PromotionGoal; label: string; description: string }> {
  const types = new Set(assets.map(a => a.asset_type));
  const result = new Map<PromotionGoal, { value: PromotionGoal; label: string; description: string }>();
  const add = (value: PromotionGoal, label: string, description: string) => result.set(value, { value, label, description });
  add('more_views', 'More views', 'Increase relevant visibility across selected placements.');
  add('more_clicks', 'More visits', 'Drive people to the selected DRIGHT destination.');
  if ([...types].some(t => ['product', 'store', 'course'].includes(t))) add('more_sales', 'More sales', 'Reach users likely to purchase or enroll.');
  if (types.has('store')) add('more_store_visits', 'More store visits', 'Bring relevant shoppers to your DRIGHT store.');
  if (types.has('profile')) add('more_profile_visits', 'More profile visits', 'Increase professional profile discovery.');
  if (types.has('job')) {
    add('more_job_applications', 'More applications', 'Increase legitimate candidate discovery and applications.');
    add('more_qualified_applicants', 'More qualified applicants', 'Optimize for candidates matching the job context.');
  }
  if (types.has('course')) add('more_course_enrollments', 'More enrollments', 'Promote course discovery and enrollment.');
  if (types.has('service')) add('more_service_inquiries', 'More service inquiries', 'Encourage real service enquiries and messages.');
  if (types.has('campaign')) add('more_campaign_participation', 'More participation', 'Increase discovery of your campaign or task.');
  if (types.has('sales_team')) add('more_hiring_requests', 'More hiring requests', 'Increase professional discovery by eligible hiring users.');
  if ([...types].some(t => ['service', 'profile', 'sales_team'].includes(t))) add('more_messages', 'More messages', 'Encourage relevant enquiries and conversations.');
  add('more_conversions', 'More conversions', 'Optimize toward the selected asset’s real conversion action.');
  return [...result.values()];
}

export async function createUniversalPromotionCampaign(payload: UniversalCampaignPayload): Promise<CampaignCreateResult> {
  const { data, error } = await supabase.rpc('create_universal_promotion_campaign', { p_payload: payload });
  if (error) throw error;
  return data as CampaignCreateResult;
}

export async function initializePromotionPayment(campaignId: string, totalPayable: number) {
  const { data, error } = await supabase.functions.invoke('paystack-initialize', {
    body: {
      purpose: 'promotion_campaign',
      reference_id: campaignId,
      amount: Math.round(Number(totalPayable) * 100),
      metadata: { campaign_id: campaignId, custom_redirect: '/payment/callback' },
    },
  });
  if (error) throw error;
  if (!data?.authorization_url) throw new Error(data?.error || 'Unable to initialize promotion payment');
  return data as { authorization_url: string; reference: string; amount: number; currency: string };
}

export async function fetchUniversalCampaigns(userId: string): Promise<UniversalCampaign[]> {
  const { data: campaigns, error } = await supabase.from('promotion_campaigns')
    .select('*').eq('seller_id', userId).order('created_at', { ascending: false });
  if (error) throw error;
  const rows = (campaigns || []) as UniversalCampaign[];
  if (!rows.length) return [];
  const ids = rows.map(c => c.id);
  const [assetsRes, placementsRes] = await Promise.all([
    supabase.from('campaign_assets').select('*').in('campaign_id', ids).order('sort_order'),
    supabase.from('campaign_placements').select('*').in('campaign_id', ids),
  ]);
  return rows.map(c => ({
    ...c,
    budget: money(c.budget), media_budget: money(c.media_budget), placement_fee_total: money(c.placement_fee_total),
    platform_fee: money(c.platform_fee), tax_amount: money(c.tax_amount), total_payable: money(c.total_payable),
    actual_spend: money(c.actual_spend),
    campaign_assets: ((assetsRes.data || []).filter(a => a.campaign_id === c.id) as CampaignAssetRecord[]).map(a => ({ ...a, allocation_amount: money(a.allocation_amount), allocation_percent: money(a.allocation_percent), actual_spend: money(a.actual_spend) })),
    campaign_placements: ((placementsRes.data || []).filter(p => p.campaign_id === c.id) as CampaignPlacementRecord[]).map(p => ({ ...p, placement_fee: money(p.placement_fee), actual_spend: money(p.actual_spend) })),
  }));
}

export async function fetchSponsoredDelivery(placement: string, limit = 5): Promise<SponsoredDeliveryItem[]> {
  const { data, error } = await supabase.rpc('get_promotion_delivery_v2', { p_placement: placement, p_limit: limit });
  if (error) {
    console.error('get_promotion_delivery_v2 failed', error);
    return [];
  }
  return (data || []) as SponsoredDeliveryItem[];
}

export async function recordSponsoredDeliveryEvent(item: SponsoredDeliveryItem, eventType: 'impression' | 'click', userId: string | null) {
  if (!userId) return;
  const { error } = await supabase.from('campaign_events').insert({
    campaign_id: item.campaign_id,
    listing_id: item.asset_id,
    user_id: userId,
    event_type: eventType,
    metadata: { placement: item.placement, campaign_asset_id: item.campaign_asset_id, asset_type: item.asset_type },
  });
  if (!error && eventType === 'impression') {
    await supabase.from('sponsored_listing_logs').insert({
      campaign_id: item.campaign_id,
      campaign_asset_id: item.campaign_asset_id,
      listing_id: item.asset_id,
      placement: item.placement,
      user_id: userId,
      view_context: { source: 'universal_promotion_ui' },
    });
  }
}

export async function fetchPromotionCampaignAnalytics(campaignId: string, days = 30) {
  const { data, error } = await supabase.rpc('get_promotion_analytics', { p_promotion_id: campaignId, p_days: days });
  if (error) return null;
  return data as Record<string, unknown>;
}

export async function updateCampaignLifecycle(campaignId: string, status: 'paused' | 'active' | 'cancelled') {
  const { error } = await supabase.from('promotion_campaigns').update({ status }).eq('id', campaignId);
  if (error) throw error;
}
