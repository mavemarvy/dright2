import { supabase } from '../supabase';

// ─────────────────────────────────────────────────────────────────────────────
// DRIGHT Smart Context Engine
//
// Automatically loads user context before AI requests to provide personalized,
// context-aware responses. Gathers: recent conversations, marketplace history,
// viewed products, orders, wishlist, search history, seller profile, affiliate
// profile, user preferences, and recent uploads.
// ─────────────────────────────────────────────────────────────────────────────

export interface UserContext {
  userId: string;
  recentConversations: Array<{ role: string; content: string; createdAt: string }>;
  recentProducts: Array<{ id: string; name: string; price: number; category: string }>;
  recentOrders: Array<{ id: string; productName: string; status: string; date: string }>;
  wishlistItems: Array<{ id: string; productName: string }>;
  searchHistory: string[];
  viewedProducts: Array<{ id: string; name: string; category: string }>;
  sellerProfile: {
    isSeller: boolean;
    productCount: number;
    totalSales: number;
    avgRating: number;
    storeName: string | null;
    storeDescription: string | null;
  } | null;
  affiliateProfile: {
    referralCode: string | null;
    totalClicks: number;
    totalConversions: number;
    totalEarnings: number;
  } | null;
  userPreferences: {
    locale: string;
    currency: string;
    theme: string;
  };
  recentUploads: Array<{ id: string; name: string; type: string; createdAt: string }>;
}

export async function loadUserContext(userId: string): Promise<UserContext> {
  // Safe query wrapper — Supabase query builders don't have .catch(), so we wrap in try/catch
  async function safeQuery<T>(queryFn: () => PromiseLike<{ data: T | null; error: any }>): Promise<{ data: T | null; error: any }> {
    try { return await Promise.resolve(queryFn()); } catch { return { data: null, error: null }; }
  }

  const [
    conversationsResult,
    productsResult,
    ordersResult,
    wishlistResult,
    searchResult,
    viewedResult,
    sellerResult,
    affiliateResult,
    uploadsResult,
  ] = await Promise.all([
    safeQuery(() => supabase.from('ai_messages').select('role, content, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(5)),
    safeQuery(() => supabase.from('products').select('id, name, price, category').eq('uploaded_by', userId).order('created_at', { ascending: false }).limit(10)),
    safeQuery(() => supabase.from('sales_records').select('id, product_name, status, sale_date').eq('promoter_id', userId).order('sale_date', { ascending: false }).limit(5)),
    safeQuery(() => supabase.from('wishlist').select('id, product_id, products!inner(name)').eq('user_id', userId).limit(10)),
    safeQuery(() => supabase.from('search_history').select('query').eq('user_id', userId).order('created_at', { ascending: false }).limit(10)),
    safeQuery(() => supabase.from('recently_viewed').select('product_id, products!inner(name, category)').eq('user_id', userId).order('viewed_at', { ascending: false }).limit(10)),
    safeQuery(() => supabase.from('users').select('role, store_title, store_description').eq('id', userId).maybeSingle()),
    safeQuery(() => supabase.from('referral_links').select('unique_code, total_clicks, total_conversions').eq('user_id', userId).maybeSingle()),
    safeQuery(() => supabase.from('products').select('id, name, product_type, created_at').eq('uploaded_by', userId).order('created_at', { ascending: false }).limit(5)),
  ]);

  // Get seller stats if applicable
  let sellerProfile: UserContext['sellerProfile'] = null;
  if (sellerResult.data && ['seller', 'admin', 'super_admin'].includes((sellerResult.data as any).role)) {
    const countResult = await safeQuery(() => supabase.from('products').select('*', { count: 'exact', head: true }).eq('uploaded_by', userId));
    const salesResult = await safeQuery(() => supabase.from('sales_records').select('commission_amount').eq('promoter_id', userId));

    const totalSales = ((salesResult.data as any[]) || []).reduce((s: number, r: any) => s + Number(r.commission_amount || 0), 0);

    sellerProfile = {
      isSeller: true,
      productCount: (countResult as any)?.count || 0,
      totalSales,
      avgRating: 0,
      storeName: (sellerResult.data as any)?.store_title || null,
      storeDescription: (sellerResult.data as any)?.store_description || null,
    };
  }

  let affiliateProfile: UserContext['affiliateProfile'] = null;
  if (affiliateResult.data) {
    const userResult = await safeQuery(() => supabase.from('users').select('affiliate_earnings').eq('id', userId).maybeSingle());

    affiliateProfile = {
      referralCode: (affiliateResult.data as any)?.unique_code || null,
      totalClicks: (affiliateResult.data as any)?.total_clicks || 0,
      totalConversions: (affiliateResult.data as any)?.total_conversions || 0,
      totalEarnings: Number((userResult.data as any)?.affiliate_earnings || 0),
    };
  }

  return {
    userId,
    recentConversations: ((conversationsResult.data as any[]) || []).map((r: any) => ({
      role: r.role,
      content: r.content,
      createdAt: r.created_at,
    })),
    recentProducts: ((productsResult.data as any[]) || []).map((r: any) => ({
      id: r.id,
      name: r.name,
      price: Number(r.price || 0),
      category: r.category || '',
    })),
    recentOrders: ((ordersResult.data as any[]) || []).map((r: any) => ({
      id: r.id,
      productName: r.product_name,
      status: r.status,
      date: r.sale_date,
    })),
    wishlistItems: ((wishlistResult.data as any[]) || []).map((r: any) => ({
      id: r.id,
      productName: r.products?.name || '',
    })),
    searchHistory: ((searchResult.data as any[]) || []).map((r: any) => r.query),
    viewedProducts: ((viewedResult.data as any[]) || []).map((r: any) => ({
      id: r.product_id,
      name: r.products?.name || '',
      category: r.products?.category || '',
    })),
    sellerProfile,
    affiliateProfile,
    userPreferences: {
      locale: typeof navigator !== 'undefined' ? navigator.language || 'en' : 'en',
      currency: 'USD',
      theme: 'light',
    },
    recentUploads: ((uploadsResult.data as any[]) || []).map((r: any) => ({
      id: r.id,
      name: r.name,
      type: r.product_type || 'product',
      createdAt: r.created_at,
    })),
  };
}

export function buildContextPrompt(context: UserContext): string {
  const parts: string[] = [];

  parts.push('User context for personalized assistance:');

  if (context.recentConversations.length > 0) {
    parts.push(`Recent conversation context: ${context.recentConversations.length} recent messages`);
  }

  if (context.recentProducts.length > 0) {
    parts.push(`User's products: ${context.recentProducts.map(p => `${p.name} ($${p.price})`).join(', ')}`);
  }

  if (context.recentOrders.length > 0) {
    parts.push(`Recent orders: ${context.recentOrders.map(o => `${o.productName} (${o.status})`).join(', ')}`);
  }

  if (context.wishlistItems.length > 0) {
    parts.push(`Wishlist: ${context.wishlistItems.map(w => w.productName).join(', ')}`);
  }

  if (context.searchHistory.length > 0) {
    parts.push(`Recent searches: ${context.searchHistory.slice(0, 5).join(', ')}`);
  }

  if (context.viewedProducts.length > 0) {
    parts.push(`Recently viewed: ${context.viewedProducts.map(v => v.name).join(', ')}`);
  }

  if (context.sellerProfile?.isSeller) {
    parts.push(`Seller profile: ${context.sellerProfile.productCount} products, $${context.sellerProfile.totalSales.toFixed(2)} in sales, store: ${context.sellerProfile.storeName || 'unnamed'}`);
  }

  if (context.affiliateProfile?.referralCode) {
    parts.push(`Affiliate: code ${context.affiliateProfile.referralCode}, ${context.affiliateProfile.totalClicks} clicks, ${context.affiliateProfile.totalConversions} conversions, $${context.affiliateProfile.totalEarnings.toFixed(2)} earnings`);
  }

  parts.push(`Language: ${context.userPreferences.locale}`);

  return parts.join('\n');
}
