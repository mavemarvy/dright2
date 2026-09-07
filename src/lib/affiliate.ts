import { supabase } from './supabase';
import {
  saveRedirectPath,
  peekRedirectPath,
  clearRedirectPath,
} from './authContinuation';

const COOKIE_NAME = 'affiliate_ref_code';
const COOKIE_MAX_AGE_DAYS = 30;
const ATTRIBUTION_KEY = 'dright_attribution';
const ATTRIBUTION_MAX_AGE_MS = COOKIE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
const VISITOR_KEY = 'dright_visitor_id';
const SESSION_KEY = 'dright_session_id';

export interface TrackingAttribution {
  linkId: string | null;
  trackingCode: string;
  ownerId: string | null;
  productId: string | null;
  sourceType: string;
  sourceLevel: string | null;
  campaignId: string | null;
  salesTeamId: string | null;
  teamMemberId: string | null;
  teamLeadId: string | null;
  capturedAt: string;
}

function getOrCreateBrowserId(key: string): string {
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const value = crypto.randomUUID();
    localStorage.setItem(key, value);
    return value;
  } catch {
    return '';
  }
}

export function getVisitorId(): string { return getOrCreateBrowserId(VISITOR_KEY); }
export function getSessionId(): string { return getOrCreateBrowserId(SESSION_KEY); }

export function setAffiliateCookie(refCode: string): void {
  const maxAge = COOKIE_MAX_AGE_DAYS * 24 * 60 * 60;
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(refCode)};path=/;max-age=${maxAge};SameSite=Lax`;
}

export function getAffiliateCookie(): string | null {
  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [name, ...rest] = cookie.trim().split('=');
    if (name === COOKIE_NAME) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export function clearAffiliateCookie(): void {
  document.cookie = `${COOKIE_NAME}=;path=/;max-age=0;SameSite=Lax`;
}

export function setAttribution(attribution: TrackingAttribution): void {
  try {
    localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(attribution));
  } catch { /* storage may be unavailable */ }
}

export function getAttribution(): TrackingAttribution | null {
  try {
    const raw = localStorage.getItem(ATTRIBUTION_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as TrackingAttribution;
    if (!parsed || typeof parsed.trackingCode !== 'string' || typeof parsed.capturedAt !== 'string') {
      clearAttribution();
      return null;
    }

    const capturedAt = new Date(parsed.capturedAt).getTime();
    if (!Number.isFinite(capturedAt) || Date.now() - capturedAt > ATTRIBUTION_MAX_AGE_MS) {
      clearAttribution();
      clearAffiliateCookie();
      return null;
    }

    return parsed;
  } catch {
    clearAttribution();
    return null;
  }
}

export function clearAttribution(): void {
  try { localStorage.removeItem(ATTRIBUTION_KEY); } catch { /* ignore */ }
}

// Compatibility wrappers retained for older tracked-link callers.
// All auth continuation now uses the canonical authContinuation storage.
export function setPendingRedirect(path: string): void {
  saveRedirectPath(path);
}

export function getPendingRedirect(): string | null {
  return peekRedirectPath();
}

export function clearPendingRedirect(): void {
  clearRedirectPath();
}

export function generateAffiliateLink(referralCode: string, productId?: string): string {
  const baseUrl = window.location.origin;
  const params = new URLSearchParams({ ref: referralCode });
  if (productId) params.set('product', productId);
  return `${baseUrl}/ref?${params.toString()}`;
}

export async function getOrCreateAffiliateLink(userId: string, productId?: string): Promise<string> {
  const { data, error } = await supabase.rpc('get_or_create_tracking_link', {
    p_user_id: userId,
    p_product_id: productId || null,
    p_source_type: 'affiliate',
  });
  if (error || !data?.[0]?.tracking_code) {
    const { data: user } = await supabase.from('users').select('referral_code').eq('id', userId).maybeSingle();
    if (!user?.referral_code) throw new Error('Unable to create affiliate link');
    return generateAffiliateLink(user.referral_code, productId);
  }
  const params = new URLSearchParams({ ref: data[0].tracking_code });
  if (productId) params.set('product', productId);
  return `${window.location.origin}/ref?${params.toString()}`;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

export async function resolveReferrer(refCode: string): Promise<{ id: string; role: string } | null> {
  const { data } = await supabase.from('users').select('id, role').eq('referral_code', refCode).maybeSingle();
  return data ? { id: data.id, role: data.role } : null;
}

export async function resolveAndRecordTracking(refCode: string, productId?: string): Promise<TrackingAttribution | null> {
  const { data, error } = await supabase.rpc('record_tracking_click', {
    p_code: refCode,
    p_product_id: productId || null,
    p_visitor_id: getVisitorId(),
    p_session_id: getSessionId(),
  });
  if (error || !data?.[0]) return null;

  const row = data[0];
  const attribution: TrackingAttribution = {
    linkId: row.link_id,
    trackingCode: refCode,
    ownerId: row.owner_id,
    productId: productId || null,
    sourceType: row.source_type || 'affiliate',
    sourceLevel: row.source_level || null,
    campaignId: row.campaign_id || null,
    salesTeamId: row.sales_team_id || null,
    teamMemberId: row.team_member_id || null,
    teamLeadId: row.team_lead_id || null,
    capturedAt: new Date().toISOString(),
  };
  setAffiliateCookie(refCode);
  setAttribution(attribution);
  return attribution;
}

export async function recordClick(referrerId: string, productId?: string): Promise<void> {
  const refCode = getAffiliateCookie();
  if (refCode) {
    await resolveAndRecordTracking(refCode, productId);
    return;
  }
  try {
    await supabase.from('affiliate_clicks').insert({ referrer_id: referrerId, product_id: productId || null });
  } catch (err) { console.error('Error recording affiliate click:', err); }
}

/**
 * @deprecated Financial conversion authority belongs to the server-side order/payment
 * finalization pipeline. This compatibility helper intentionally performs no sale,
 * earnings, wallet, or commission mutation.
 */
export async function recordSaleWithReferrer(params: {
  promoterId: string;
  buyerName: string;
  productName: string;
  commissionAmount: number;
  saleAmount: number;
  productId?: string;
}): Promise<{ referrerId: string | null; referrerRole: string | null }> {
  void params;
  const attribution = getAttribution();
  const referrerId = attribution?.ownerId || null;
  const referrerRole = attribution?.sourceType || null;

  console.warn(
    '[DRIGHT ST-1g] recordSaleWithReferrer is deprecated. Conversion and commission records are created only by the authoritative server payment/order finalization flow.',
  );

  return { referrerId, referrerRole };
}

export interface SalesAnalytics {
  totalAffiliateSales: number;
  totalMarketerSales: number;
  totalAdvertiserSales: number;
  totalOverallSales: number;
}

export async function fetchSalesAnalytics(userId: string): Promise<{
  analytics: SalesAnalytics;
  recentSales: Array<{ id: string; product_name: string; sale_amount: number; sale_date: string; buyer_name: string; referrer_role: string | null }>;
}> {
  const { data, error } = await supabase.from('sales_records')
    .select('id, product_name, sale_amount, sale_date, buyer_name, referrer_role')
    .eq('referrer_id', userId).order('sale_date', { ascending: false }).limit(20);
  if (error || !data) return { analytics: { totalAffiliateSales: 0, totalMarketerSales: 0, totalAdvertiserSales: 0, totalOverallSales: 0 }, recentSales: [] };
  let totalAffiliateSales = 0, totalMarketerSales = 0, totalAdvertiserSales = 0;
  for (const sale of data) {
    if (sale.referrer_role === 'affiliate' || sale.referrer_role === 'admin') totalAffiliateSales++;
    else if (sale.referrer_role === 'marketer') totalMarketerSales++;
    else if (sale.referrer_role === 'advertiser') totalAdvertiserSales++;
  }
  return { analytics: { totalAffiliateSales, totalMarketerSales, totalAdvertiserSales, totalOverallSales: totalAffiliateSales + totalMarketerSales + totalAdvertiserSales }, recentSales: data };
}

export interface AffiliateStats { totalClicks: number; totalConversions: number; totalEarnings: number; conversionRate: number; }

export async function fetchAffiliateStats(userId: string): Promise<AffiliateStats> {
  const { data } = await supabase.from('referral_links').select('total_clicks, total_conversions').eq('user_id', userId).eq('source_type', 'affiliate').is('product_id', null).maybeSingle();
  const { data: userData } = await supabase.from('users').select('affiliate_earnings').eq('id', userId).maybeSingle();
  const clicks = data?.total_clicks || 0;
  const conversions = data?.total_conversions || 0;
  const earnings = Number(userData?.affiliate_earnings || 0);
  return { totalClicks: clicks, totalConversions: conversions, totalEarnings: earnings, conversionRate: clicks > 0 ? (conversions / clicks) * 100 : 0 };
}
