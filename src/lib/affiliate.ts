import { supabase } from './supabase';
import { trackPurchase } from './analyticsService';

const COOKIE_NAME = 'affiliate_ref_code';
const COOKIE_MAX_AGE_DAYS = 30;
const REDIRECT_KEY = 'pending_redirect';

export function setAffiliateCookie(refCode: string): void {
  const maxAge = COOKIE_MAX_AGE_DAYS * 24 * 60 * 60;
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(refCode)};path=/;max-age=${maxAge};SameSite=Lax`;
}

export function getAffiliateCookie(): string | null {
  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === COOKIE_NAME) {
      return decodeURIComponent(value);
    }
  }
  return null;
}

export function clearAffiliateCookie(): void {
  document.cookie = `${COOKIE_NAME}=;path=/;max-age=0`;
}

export function setPendingRedirect(path: string): void {
  sessionStorage.setItem(REDIRECT_KEY, path);
}

export function getPendingRedirect(): string | null {
  return sessionStorage.getItem(REDIRECT_KEY);
}

export function clearPendingRedirect(): void {
  sessionStorage.removeItem(REDIRECT_KEY);
}

export function generateAffiliateLink(referralCode: string, productId?: string): string {
  const baseUrl = window.location.origin;
  if (productId) {
    return `${baseUrl}/ref?ref=${referralCode}&product=${productId}`;
  }
  return `${baseUrl}/ref?ref=${referralCode}`;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function resolveReferrer(refCode: string): Promise<{
  id: string;
  role: string;
} | null> {
  const { data, error } = await supabase
    .from('users')
    .select('id, role')
    .eq('referral_code', refCode)
    .maybeSingle();

  if (error || !data) return null;

  return { id: data.id, role: data.role };
}

export async function recordClick(referrerId: string, productId?: string): Promise<void> {
  try {
    await supabase.from('affiliate_clicks').insert({
      referrer_id: referrerId,
      product_id: productId || null,
    });
    await supabase.rpc('increment_referral_clicks', { p_referrer_id: referrerId });
  } catch (err) {
    console.error('Error recording affiliate click:', err);
  }
}

export async function recordSaleWithReferrer(params: {
  promoterId: string;
  buyerName: string;
  productName: string;
  commissionAmount: number;
  saleAmount: number;
  productId?: string;
}): Promise<{ referrerId: string | null; referrerRole: string | null }> {
  const refCode = getAffiliateCookie();
  let referrerId: string | null = null;
  let referrerRole: string | null = null;

  if (refCode) {
    const referrer = await resolveReferrer(refCode);
    if (referrer) {
      referrerId = referrer.id;
      referrerRole = referrer.role;
    }
  }

  await supabase.from('sales_records').insert({
    promoter_id: params.promoterId,
    buyer_name: params.buyerName,
    product_name: params.productName,
    commission_amount: params.commissionAmount,
    sale_amount: params.saleAmount,
    product_id: params.productId || null,
    referrer_id: referrerId,
    referrer_role: referrerRole,
    status: 'pending',
  });

  trackPurchase(params.productId || '', params.promoterId, 0);

  if (referrerId) {
    await supabase.rpc('increment_referral_conversions', { p_referrer_id: referrerId });
    await supabase.rpc('add_affiliate_earnings', {
      p_user_id: referrerId,
      p_amount: params.commissionAmount,
    });
  }

  if (params.productId) {
    const { data: product } = await supabase
      .from('products')
      .select('stock_quantity')
      .eq('id', params.productId)
      .maybeSingle();

    if (product && product.stock_quantity !== null) {
      const newStock = Math.max(0, product.stock_quantity - 1);
      await supabase
        .from('products')
        .update({ stock_quantity: newStock })
        .eq('id', params.productId);
    }
  }

  if (refCode) {
    clearAffiliateCookie();
  }

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
  recentSales: Array<{
    id: string;
    product_name: string;
    sale_amount: number;
    sale_date: string;
    buyer_name: string;
    referrer_role: string | null;
  }>;
}> {
  const { data, error } = await supabase
    .from('sales_records')
    .select('id, product_name, sale_amount, sale_date, buyer_name, referrer_role')
    .eq('referrer_id', userId)
    .order('sale_date', { ascending: false })
    .limit(20);

  if (error || !data) {
    return {
      analytics: {
        totalAffiliateSales: 0,
        totalMarketerSales: 0,
        totalAdvertiserSales: 0,
        totalOverallSales: 0,
      },
      recentSales: [],
    };
  }

  let totalAffiliateSales = 0;
  let totalMarketerSales = 0;
  let totalAdvertiserSales = 0;

  for (const sale of data) {
    const role = sale.referrer_role;
    if (role === 'affiliate' || role === 'admin') {
      totalAffiliateSales++;
    } else if (role === 'marketer') {
      totalMarketerSales++;
    } else if (role === 'advertiser') {
      totalAdvertiserSales++;
    }
  }

  return {
    analytics: {
      totalAffiliateSales,
      totalMarketerSales,
      totalAdvertiserSales,
      totalOverallSales: totalAffiliateSales + totalMarketerSales + totalAdvertiserSales,
    },
    recentSales: data,
  };
}

export interface AffiliateStats {
  totalClicks: number;
  totalConversions: number;
  totalEarnings: number;
  conversionRate: number;
}

export async function fetchAffiliateStats(userId: string): Promise<AffiliateStats> {
  const { data } = await supabase
    .from('referral_links')
    .select('total_clicks, total_conversions')
    .eq('user_id', userId)
    .maybeSingle();

  const { data: userData } = await supabase
    .from('users')
    .select('affiliate_earnings')
    .eq('id', userId)
    .maybeSingle();

  const clicks = data?.total_clicks || 0;
  const conversions = data?.total_conversions || 0;
  const earnings = Number(userData?.affiliate_earnings || 0);

  return {
    totalClicks: clicks,
    totalConversions: conversions,
    totalEarnings: earnings,
    conversionRate: clicks > 0 ? (conversions / clicks) * 100 : 0,
  };
}
