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
    updated_at: string;
    updated_by: string | null;
  };
}

const PENDING_KEY = 'dright_starter_pending_purchase';

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
      benefits: Array.isArray(payload.product?.benefits) ? payload.product.benefits.map(String) : [],
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
    },
  };
}

export async function updateAdminDrightStarterSettings(
  settings: DrightStarterAdminSettings,
): Promise<DrightStarterAdminSettings> {
  const { data, error } = await supabase.rpc('admin_update_dright_starter_settings', {
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
      affiliate_commission_percent: Number(settings.product.affiliate_commission_percent || 0),
      included_trial_days: Number(settings.product.included_trial_days || 0),
      is_enabled: settings.product.is_enabled,
      public_visible: settings.product.public_visible,
      official_badge_enabled: settings.product.official_badge_enabled,
      official_rating_enabled: settings.product.official_rating_enabled,
      official_rating: Number(settings.product.official_rating || 0),
      benefits: settings.product.benefits,
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

export function setPendingDrightStarterPurchase(reference: string, email?: string): void {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify({
      reference,
      email: email?.trim().toLowerCase() || null,
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

  clearPendingDrightStarterPurchase();
  const payload = (data || {}) as Record<string, unknown>;
  return {
    claimed: Boolean(payload.success),
    trialEndsAt: payload.trial_ends_at ? String(payload.trial_ends_at) : null,
  };
}
