import { supabase } from './supabase';
import { getAttribution, getAffiliateCookie, getSessionId, getVisitorId } from './affiliate';

export interface DrightOfficialStore {
  name: string;
  slug: string;
  tagline: string;
  description: string;
  logo_url: string | null;
  banner_url: string | null;
  official: boolean;
}

export interface DrightStarterProduct {
  marketplace_product_id?: string | null;
  title: string;
  subtitle: string;
  description: string;
  category: string;
  price: number;
  currency: string;
  affiliate_commission_percent: number;
  included_trial_days: number;
  guest_only: boolean;
  official_badge_enabled: boolean;
  official_rating_enabled: boolean;
  official_rating: number;
  benefits: string[];
  image_url: string | null;
  image_urls: string[];
}

export interface DrightStarterPublicSettings {
  available: boolean;
  store?: DrightOfficialStore;
  product?: DrightStarterProduct;
}

export interface DrightStarterAdminSettings {
  store: {
    singleton: boolean;
    name: string;
    slug: string;
    tagline: string;
    description: string;
    public_visible: boolean;
    is_active: boolean;
    logo_url: string | null;
    banner_url: string | null;
    updated_at: string;
    updated_by: string | null;
  };
  product: {
    singleton: boolean;
    marketplace_product_id: string | null;
    title: string;
    subtitle: string;
    description: string;
    category: string;
    price: number;
    currency: string;
    affiliate_commission_percent: number;
    included_trial_days: number;
    is_enabled: boolean;
    public_visible: boolean;
    guest_only: boolean;
    official_badge_enabled: boolean;
    official_rating_enabled: boolean;
    official_rating: number;
    benefits: string[];
    image_url: string | null;
    image_urls: string[];
    updated_at: string;
    updated_by: string | null;
  };
}

const PENDING_KEY = 'dright_starter_pending_purchase';
// Starter funnel state is session-scoped; payment authority remains server-side.
const STARTER_FUNNEL_KEY = 'dright_starter_paid_signup_funnel_v1';

export function markDrightStarterSignupFunnel(): void {
  try {
    sessionStorage.setItem(STARTER_FUNNEL_KEY, JSON.stringify({
      required: true,
      entered_at: new Date().toISOString(),
    }));
  } catch { /* storage unavailable */ }
}

export function isDrightStarterSignupFunnelRequired(): boolean {
  try {
    const raw = sessionStorage.getItem(STARTER_FUNNEL_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (parsed?.required !== true) return false;
    const enteredAt = Date.parse(String(parsed.entered_at || ''));
    // Keep the gate for the active purchase journey, but do not trap a browser forever.
    if (!Number.isFinite(enteredAt) || Date.now() - enteredAt > 6 * 60 * 60 * 1000) {
      sessionStorage.removeItem(STARTER_FUNNEL_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function clearDrightStarterSignupFunnel(): void {
  try { sessionStorage.removeItem(STARTER_FUNNEL_KEY); } catch { /* ignore */ }
}

export async function fetchDrightStarterProduct(): Promise<DrightStarterPublicSettings> {
  const { data, error } = await supabase.rpc('get_public_dright_starter_product');
  if (error) {
    console.error('Unable to load DRIGHT Starter product', error);
    return { available: false };
  }
  const payload = (data || {}) as Record<string, any>;
  if (!payload.available) return { available: false };
  return {
    available: true,
    store: payload.store as DrightOfficialStore,
    product: {
      ...(payload.product as DrightStarterProduct),
      price: Number(payload.product?.price ?? 0),
      affiliate_commission_percent: Number(payload.product?.affiliate_commission_percent ?? 0),
      included_trial_days: Number(payload.product?.included_trial_days ?? 0),
      official_rating: Number(payload.product?.official_rating ?? 0),
      image_url: payload.product?.image_url ? String(payload.product.image_url) : null,
      image_urls: Array.isArray(payload.product?.image_urls) ? payload.product.image_urls.map(String) : [],
      description: renderDrightStarterTemplate(
        String(payload.product?.description || ''),
        Number(payload.product?.included_trial_days ?? 0),
      ),
      subtitle: renderDrightStarterTemplate(
        String(payload.product?.subtitle || ''),
        Number(payload.product?.included_trial_days ?? 0),
      ),
      benefits: Array.isArray(payload.product?.benefits)
        ? payload.product.benefits.map((value: unknown) => renderDrightStarterTemplate(
            String(value),
            Number(payload.product?.included_trial_days ?? 0),
          ))
        : [],
    },
  };
}

export async function getAdminDrightStarterSettings(): Promise<DrightStarterAdminSettings | null> {
  const { data, error } = await supabase.rpc('admin_get_dright_starter_settings');
  if (error || !data) {
    if (error && !/permission/i.test(error.message || '')) console.error('Unable to load DRIGHT Starter admin settings', error);
    return null;
  }
  const payload = data as any;
  return {
    store: payload.store,
    product: {
      ...payload.product,
      price: Number(payload.product?.price ?? 0),
      affiliate_commission_percent: Number(payload.product?.affiliate_commission_percent ?? 0),
      included_trial_days: Number(payload.product?.included_trial_days ?? 0),
      official_rating: Number(payload.product?.official_rating ?? 0),
      benefits: Array.isArray(payload.product?.benefits) ? payload.product.benefits.map(String) : [],
      image_url: payload.product?.image_url ? String(payload.product.image_url) : null,
      image_urls: Array.isArray(payload.product?.image_urls) ? payload.product.image_urls.map(String) : [],
    },
  };
}

export async function updateAdminDrightStarterSettings(
  settings: DrightStarterAdminSettings,
): Promise<DrightStarterAdminSettings> {
  const { error } = await supabase.rpc('admin_update_dright_starter_settings', {
    p_store: {
      name: settings.store.name,
      tagline: settings.store.tagline,
      description: settings.store.description,
      public_visible: settings.store.public_visible,
      is_active: settings.store.is_active,
      logo_url: settings.store.logo_url,
      banner_url: settings.store.banner_url,
    },
    p_product: {
      title: settings.product.title,
      subtitle: settings.product.subtitle,
      description: settings.product.description,
      category: settings.product.category,
      price: Number(settings.product.price || 0),
      currency: String(settings.product.currency || 'USD').toUpperCase(),
      affiliate_commission_percent: Number(settings.product.affiliate_commission_percent || 0),
      included_trial_days: Number(settings.product.included_trial_days || 0),
      is_enabled: settings.product.is_enabled,
      public_visible: settings.product.public_visible,
      official_badge_enabled: settings.product.official_badge_enabled,
      official_rating_enabled: settings.product.official_rating_enabled,
      official_rating: Number(settings.product.official_rating || 0),
      benefits: settings.product.benefits,
      image_url: settings.product.image_url,
      image_urls: settings.product.image_urls,
    },
  });
  if (error) throw error;
  const next = await getAdminDrightStarterSettings();
  if (!next) throw new Error('Unable to reload DRIGHT Starter settings.');
  return next;
}

export function buildDrightStarterAffiliateLink(referralCode: string): string {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  const params = new URLSearchParams({ ref: referralCode });
  return `${base}/dright/starter?${params.toString()}`;
}

export async function startDrightStarterCheckout(input: {
  buyerName: string;
  buyerEmail: string;
  turnstileToken: string;
}) {
  const attribution = getAttribution();
  const trackingCode = attribution?.trackingCode || getAffiliateCookie();
  const { data, error } = await supabase.functions.invoke('dright-starter-checkout', {
    body: {
      buyer_name: input.buyerName.trim(),
      buyer_email: input.buyerEmail.trim().toLowerCase(),
      turnstile_token: input.turnstileToken,
      tracking_code: trackingCode || null,
      referral_link_id: attribution?.linkId || null,
      visitor_id: getVisitorId() || null,
      session_id: getSessionId() || null,
    },
  });
  const payload = (data || {}) as {
    success?: boolean;
    error?: string;
    reference?: string;
    purchase_id?: string;
    authorization_url?: string;
    amount?: number;
    currency?: string;
    included_trial_days?: number;
  };
  if (error || payload.error || !payload.success) {
    throw new Error(payload.error || error?.message || 'Unable to start DRIGHT Starter checkout.');
  }
  return payload;
}


export async function getDrightStarterSignupPolicy(): Promise<{
  starterProductRequired: boolean;
  requiredProfiles: string[];
}> {
  const { data, error } = await supabase.rpc('get_public_dright_starter_signup_policy');
  if (error || !data || typeof data !== 'object') {
    // Standard signup must remain available even if the optional Starter-policy lookup fails.
    // The paid Starter funnel still performs its own server-verified payment gate.
    return {
      starterProductRequired: false,
      requiredProfiles: [],
    };
  }
  const payload = data as Record<string, unknown>;
  return {
    starterProductRequired: payload.starter_product_required !== false,
    requiredProfiles: Array.isArray(payload.required_profiles)
      ? payload.required_profiles.map(String)
      : [],
  };
}

export async function getDrightStarterSignupEligibility(
  reference: string,
  email: string,
): Promise<{ eligible: boolean; reason: string; message: string; includedTrialDays?: number }> {
  const { data, error } = await supabase.rpc('get_dright_starter_signup_eligibility', {
    p_reference: reference.trim(),
    p_email: email.trim().toLowerCase(),
  });
  if (error) {
    return {
      eligible: false,
      reason: 'verification_error',
      message: error.message || 'Unable to verify DRIGHT Starter payment eligibility.',
    };
  }
  const payload = (data || {}) as Record<string, unknown>;
  return {
    eligible: payload.eligible === true,
    reason: String(payload.reason || (payload.eligible ? 'verified' : 'not_verified')),
    message: String(payload.message || (payload.eligible ? 'Payment verified.' : 'Payment verification is required.')),
    includedTrialDays: payload.included_trial_days == null ? undefined : Number(payload.included_trial_days),
  };
}

export function setPendingDrightStarterPurchase(reference: string, email?: string): void {
  try {
    const existing = getPendingDrightStarterPurchase();
    const normalizedEmail = email?.trim().toLowerCase()
      || (existing?.reference === reference ? existing.email : null);
    localStorage.setItem(PENDING_KEY, JSON.stringify({
      reference,
      email: normalizedEmail,
      saved_at: new Date().toISOString(),
    }));
  } catch { /* storage unavailable */ }
}

export function getPendingDrightStarterPurchase(): { reference: string; email: string | null } | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.reference || typeof parsed.reference !== 'string') return null;
    return {
      reference: parsed.reference,
      email: typeof parsed.email === 'string' ? parsed.email : null,
    };
  } catch {
    return null;
  }
}

export function clearPendingDrightStarterPurchase(): void {
  try { localStorage.removeItem(PENDING_KEY); } catch { /* ignore */ }
}

export async function claimPendingDrightStarterPurchase(): Promise<{
  claimed: boolean;
  trialEndsAt?: string | null;
  error?: string;
}> {
  const pending = getPendingDrightStarterPurchase();
  if (!pending?.reference) return { claimed: false };

  const { data, error } = await supabase.rpc('claim_dright_starter_purchase', {
    p_reference: pending.reference,
  });
  if (error) return { claimed: false, error: error.message };

  const payload = (data || {}) as Record<string, unknown>;
  const claimed = Boolean(payload.success);
  if (claimed) {
    clearPendingDrightStarterPurchase();
    clearDrightStarterSignupFunnel();
  }
  return {
    claimed,
    trialEndsAt: payload.trial_ends_at ? String(payload.trial_ends_at) : null,
  };
}


export interface DrightStarterAffiliateChallengeSettings {
  singleton?: boolean;
  enabled: boolean;
  target_sales: number;
  base_level_label: string;
  base_level_number: number;
  unlock_label: string;
  unlock_level_number: number;
  description_template: string;
  restrict_marketplace_until_complete: boolean;
  allow_own_listings_while_restricted: boolean;
  seller_profile_exempt: boolean;
  updated_at?: string;
  updated_by?: string | null;
}

export interface DrightAffiliateLevelSettings {
  level_number: number;
  title: string;
  sales_to_next: number;
  product_limit: number | null;
  starter_only: boolean;
  entry_sales: number;
  cumulative_after: number;
  is_current?: boolean;
  is_unlocked?: boolean;
}

export interface DrightStarterAffiliateProgress {
  authenticated: boolean;
  enabled: boolean;
  applies: boolean;
  sales: number;
  target_sales: number;
  remaining_sales: number;
  completed: boolean;
  progress_percent: number;
  base_level_label: string;
  base_level_number: number;
  unlock_label: string;
  unlock_level_number: number;
  current_level_label: string;
  current_level_number: number;
  current_level_entry_sales: number;
  sales_in_current_level: number;
  sales_required_this_level: number;
  next_level_label: string | null;
  next_level_number: number | null;
  next_level_total_sales: number | null;
  product_limit: number | null;
  starter_only: boolean;
  max_level: boolean;
  levels: DrightAffiliateLevelSettings[];
  description_template: string;
  restrict_marketplace_until_complete: boolean;
  allow_own_listings_while_restricted: boolean;
  marketplace_limited: boolean;
  affiliate_access_limited: boolean;
  selected_profiles: string[];
  seller_exempt: boolean;
}

export function renderDrightStarterTemplate(
  value: string,
  trialDays: number,
  targetSales?: number,
): string {
  const days = Math.max(0, Math.floor(Number(trialDays) || 0));
  const sales = Math.max(0, Math.floor(Number(targetSales) || 0));
  return String(value || '')
    .replace(/\{\{trial_days\}\}/gi, String(days))
    .replace(/\{\{target_sales\}\}/gi, String(sales));
}

export async function getDrightStarterAffiliateChallenge(): Promise<DrightStarterAffiliateChallengeSettings | null> {
  const { data, error } = await supabase.rpc('get_public_dright_starter_affiliate_challenge');
  if (error || !data || typeof data !== 'object') return null;
  const row = data as Record<string, unknown>;
  return {
    enabled: row.enabled === true,
    target_sales: Number(row.target_sales ?? 20),
    base_level_label: String(row.base_level_label || 'Affiliate Level 0'),
    base_level_number: Number(row.base_level_number ?? 0),
    unlock_label: String(row.unlock_label || 'Level 1 Pro Affiliate'),
    unlock_level_number: Number(row.unlock_level_number ?? 1),
    description_template: String(row.description_template || ''),
    restrict_marketplace_until_complete: row.restrict_marketplace_until_complete === true,
    allow_own_listings_while_restricted: row.allow_own_listings_while_restricted !== false,
    seller_profile_exempt: row.seller_profile_exempt !== false,
  };
}

export async function getMyDrightStarterAffiliateProgress(): Promise<DrightStarterAffiliateProgress | null> {
  const { data, error } = await supabase.rpc('get_my_dright_starter_affiliate_progress');
  if (error || !data || typeof data !== 'object') return null;
  const row = data as Record<string, unknown>;
  return {
    authenticated: row.authenticated === true,
    enabled: row.enabled === true,
    applies: row.applies === true,
    sales: Number(row.sales ?? 0),
    target_sales: Number(row.target_sales ?? 20),
    remaining_sales: Number(row.remaining_sales ?? 0),
    completed: row.completed === true,
    progress_percent: Number(row.progress_percent ?? 0),
    base_level_label: String(row.base_level_label || 'Affiliate Level 0'),
    base_level_number: Number(row.base_level_number ?? 0),
    unlock_label: String(row.unlock_label || 'Level 1 Pro Affiliate'),
    unlock_level_number: Number(row.unlock_level_number ?? 1),
    current_level_label: String(row.current_level_label || (row.completed ? row.unlock_label : row.base_level_label) || 'Starter Affiliate'),
    current_level_number: Number(row.current_level_number ?? 0),
    current_level_entry_sales: Number(row.current_level_entry_sales ?? 0),
    sales_in_current_level: Number(row.sales_in_current_level ?? 0),
    sales_required_this_level: Number(row.sales_required_this_level ?? 0),
    next_level_label: row.next_level_label == null ? null : String(row.next_level_label),
    next_level_number: row.next_level_number == null ? null : Number(row.next_level_number),
    next_level_total_sales: row.next_level_total_sales == null ? null : Number(row.next_level_total_sales),
    product_limit: row.product_limit == null ? null : Number(row.product_limit),
    starter_only: row.starter_only === true,
    max_level: row.max_level === true,
    levels: Array.isArray(row.levels) ? row.levels.map((level) => {
      const item = (level || {}) as Record<string, unknown>;
      return {
        level_number: Number(item.level_number ?? 0),
        title: String(item.title || 'Affiliate'),
        sales_to_next: Number(item.sales_to_next ?? 0),
        product_limit: item.product_limit == null ? null : Number(item.product_limit),
        starter_only: item.starter_only === true,
        entry_sales: Number(item.entry_sales ?? 0),
        cumulative_after: Number(item.cumulative_after ?? 0),
        is_current: item.is_current === true,
        is_unlocked: item.is_unlocked === true,
      };
    }) : [],
    description_template: String(row.description_template || ''),
    restrict_marketplace_until_complete: row.restrict_marketplace_until_complete === true,
    allow_own_listings_while_restricted: row.allow_own_listings_while_restricted !== false,
    marketplace_limited: row.marketplace_limited === true,
    affiliate_access_limited: row.affiliate_access_limited === true,
    selected_profiles: Array.isArray(row.selected_profiles) ? row.selected_profiles.map(String) : [],
    seller_exempt: row.seller_exempt === true,
  };
}

export async function getAdminDrightStarterAffiliateChallenge(): Promise<DrightStarterAffiliateChallengeSettings | null> {
  const { data, error } = await supabase.rpc('admin_get_dright_starter_affiliate_challenge');
  if (error || !data || typeof data !== 'object') return null;
  const row = data as Record<string, unknown>;
  return {
    singleton: true,
    enabled: row.enabled === true,
    target_sales: Number(row.target_sales ?? 20),
    base_level_label: String(row.base_level_label || 'Affiliate Level 0'),
    base_level_number: Number(row.base_level_number ?? 0),
    unlock_label: String(row.unlock_label || 'Level 1 Pro Affiliate'),
    unlock_level_number: Number(row.unlock_level_number ?? 1),
    description_template: String(row.description_template || ''),
    restrict_marketplace_until_complete: row.restrict_marketplace_until_complete === true,
    allow_own_listings_while_restricted: row.allow_own_listings_while_restricted !== false,
    seller_profile_exempt: row.seller_profile_exempt !== false,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
    updated_by: row.updated_by ? String(row.updated_by) : null,
  };
}

export async function updateAdminDrightStarterAffiliateChallenge(
  settings: DrightStarterAffiliateChallengeSettings,
): Promise<DrightStarterAffiliateChallengeSettings> {
  const { error } = await supabase.rpc('admin_update_dright_starter_affiliate_challenge', {
    p_settings: {
      enabled: settings.enabled,
      target_sales: Number(settings.target_sales || 1),
      base_level_label: settings.base_level_label,
      base_level_number: Number(settings.base_level_number || 0),
      unlock_label: settings.unlock_label,
      unlock_level_number: Number(settings.unlock_level_number || 1),
      description_template: settings.description_template,
      restrict_marketplace_until_complete: settings.restrict_marketplace_until_complete,
      allow_own_listings_while_restricted: settings.allow_own_listings_while_restricted,
      seller_profile_exempt: settings.seller_profile_exempt,
    },
  });
  if (error) throw error;
  const next = await getAdminDrightStarterAffiliateChallenge();
  if (!next) throw new Error('Unable to reload Starter affiliate challenge settings.');
  return next;
}

export async function getAdminDrightAffiliateLevels(): Promise<DrightAffiliateLevelSettings[]> {
  const { data, error } = await supabase.rpc('admin_get_dright_affiliate_levels');
  if (error) throw error;
  if (!Array.isArray(data)) return [];
  return data.map((row) => {
    const item = (row || {}) as Record<string, unknown>;
    return {
      level_number: Number(item.level_number ?? 0),
      title: String(item.title || 'Affiliate'),
      sales_to_next: Number(item.sales_to_next ?? 0),
      product_limit: item.product_limit == null ? null : Number(item.product_limit),
      starter_only: item.starter_only === true,
      entry_sales: Number(item.entry_sales ?? 0),
      cumulative_after: Number(item.cumulative_after ?? 0),
    };
  });
}

export async function updateAdminDrightAffiliateLevels(
  levels: DrightAffiliateLevelSettings[],
): Promise<DrightAffiliateLevelSettings[]> {
  const payload = levels
    .slice()
    .sort((a, b) => a.level_number - b.level_number)
    .map((level) => ({
      level_number: level.level_number,
      title: level.title,
      sales_to_next: Math.max(0, Math.trunc(Number(level.sales_to_next || 0))),
      product_limit: level.product_limit == null ? null : Math.max(1, Math.trunc(Number(level.product_limit))),
      starter_only: level.level_number === 0 ? true : Boolean(level.starter_only),
    }));
  const { data, error } = await supabase.rpc('admin_update_dright_affiliate_levels', {
    p_levels: payload,
  });
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Unable to reload affiliate levels.');
  return data.map((row) => {
    const item = (row || {}) as Record<string, unknown>;
    return {
      level_number: Number(item.level_number ?? 0),
      title: String(item.title || 'Affiliate'),
      sales_to_next: Number(item.sales_to_next ?? 0),
      product_limit: item.product_limit == null ? null : Number(item.product_limit),
      starter_only: item.starter_only === true,
      entry_sales: Number(item.entry_sales ?? 0),
      cumulative_after: Number(item.cumulative_after ?? 0),
    };
  });
}

export interface DrightAffiliateCatalogAccess {
  authenticated: boolean;
  current_level_number: number;
  current_level_label: string;
  product_limit: number | null;
  starter_only: boolean;
  access_rules_apply: boolean;
  accessible_product_ids: string[];
  locked_product_ids: string[];
  affiliate_eligible_product_ids: string[];
}

export async function getMyAffiliateCatalogAccess(productIds: string[]): Promise<DrightAffiliateCatalogAccess | null> {
  const { data, error } = await supabase.rpc('get_my_affiliate_catalog_access', {
    p_product_ids: productIds,
  });
  if (error || !data || typeof data !== 'object') return null;
  const row = data as Record<string, unknown>;
  return {
    authenticated: row.authenticated === true,
    current_level_number: Number(row.current_level_number ?? 0),
    current_level_label: String(row.current_level_label || 'Starter Affiliate'),
    product_limit: row.product_limit == null ? null : Number(row.product_limit),
    starter_only: row.starter_only === true,
    access_rules_apply: row.access_rules_apply === true,
    accessible_product_ids: Array.isArray(row.accessible_product_ids) ? row.accessible_product_ids.map(String) : [],
    locked_product_ids: Array.isArray(row.locked_product_ids) ? row.locked_product_ids.map(String) : [],
    affiliate_eligible_product_ids: Array.isArray(row.affiliate_eligible_product_ids) ? row.affiliate_eligible_product_ids.map(String) : [],
  };
}

export async function canAffiliateProduct(productId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('can_user_affiliate_product', {
    p_user_id: (await supabase.auth.getUser()).data.user?.id || null,
    p_product_id: productId,
  });
  if (error) return false;
  return data === true;
}

