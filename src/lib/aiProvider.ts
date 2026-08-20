// ─────────────────────────────────────────────────────────────────────────────
// DRIGHT AI Provider Abstraction Layer (SECURE)
//
// SECURITY: This module runs in the browser. It MUST NEVER call AI provider
// APIs (OpenAI, Gemini, Claude, Grok) directly. All such calls go through
// secure Supabase Edge Functions (ai-proxy, openai-proxy, gemini-proxy) which
// hold the API keys server-side. The browser only ever talks to our own edge
// functions via supabase.functions.invoke().
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase';

export type AIProvider = 'groq' | 'openai' | 'gemini' | 'claude' | 'grok' | 'local' | 'mock';

export interface AIProviderConfig {
  provider: AIProvider;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeout?: number;
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIResponse {
  content: string;
  provider: AIProvider;
  tokensUsed?: number;
  latencyMs?: number;
}

export interface AIUsageStats {
  totalRequests: number;
  totalTokens: number;
  estimatedCost: number;
  byProvider: Record<string, { requests: number; tokens: number }>;
}

// ─── Usage Tracking (browser-local, for diagnostics only) ──────────────────────

let usageStats: AIUsageStats = {
  totalRequests: 0,
  totalTokens: 0,
  estimatedCost: 0,
  byProvider: {},
};

export function getUsageStats(): AIUsageStats {
  return { ...usageStats };
}

function trackUsage(provider: AIProvider, tokens: number): void {
  usageStats.totalRequests++;
  usageStats.totalTokens += tokens;
  usageStats.estimatedCost += tokens * 0.00002;
  if (!usageStats.byProvider[provider]) {
    usageStats.byProvider[provider] = { requests: 0, tokens: 0 };
  }
  usageStats.byProvider[provider].requests++;
  usageStats.byProvider[provider].tokens += tokens;
}

// ─── Main AI Call Function ─────────────────────────────────────────────────────
//
// Only 'groq' and 'mock' are reachable. The other provider enum values remain
// for type compatibility with callers, but any other value falls back to the
// data-driven mock provider — which never leaves the browser except to query
// our own Supabase tables.

export async function callAI(
  messages: AIMessage[],
  config: AIProviderConfig = { provider: 'groq' },
): Promise<AIResponse> {
  const startTime = Date.now();
  const handler = config.provider === 'groq' ? groqProvider : mockProvider;

  try {
    const response = await Promise.race([
      handler(messages, config),
      new Promise<AIResponse>((_, reject) =>
        setTimeout(() => reject(new Error('AI request timeout')), config.timeout || 15000),
      ),
    ]);

    response.latencyMs = Date.now() - startTime;
    trackUsage(response.provider, response.tokensUsed || estimateTokens(messages, response.content));
    return response;
  } catch (err) {
    console.error(`AI provider ${config.provider} failed, falling back to mock:`, err);
    const fallback = await mockProvider(messages, config);
    fallback.latencyMs = Date.now() - startTime;
    trackUsage('mock', fallback.tokensUsed || 100);
    return fallback;
  }
}

function estimateTokens(messages: AIMessage[], response: string): number {
  const inputTokens = messages.reduce((s, m) => s + Math.ceil(m.content.length / 4), 0);
  const outputTokens = Math.ceil(response.length / 4);
  return inputTokens + outputTokens;
}

// ─── Groq Provider (routes through secure ai-proxy edge function) ─────────────
//
// The edge function holds GROQ_API_KEY and GEMINI_API_KEY server-side and
// performs the Groq→Gemini fallback internally. The browser never sees a key.

async function groqProvider(messages: AIMessage[], _config: AIProviderConfig): Promise<AIResponse> {
  const systemMsg = messages.find(m => m.role === 'system');
  const userMessages = messages.filter(m => m.role !== 'system');
  const lastUserMsg = [...userMessages].reverse().find(m => m.role === 'user');

  if (!lastUserMsg) {
    return { content: '', provider: 'groq', tokensUsed: 0 };
  }

  try {
    const { data, error } = await supabase.functions.invoke('ai-proxy', {
      body: {
        feature: 'chat',
        prompt: lastUserMsg.content,
        context: systemMsg?.content,
        messages: userMessages.slice(-10).map(m => ({ role: m.role, content: m.content })),
      },
    });

    if (error || !data) {
      throw new Error(error?.message || 'Edge function returned no data');
    }

    const result = data as { success: boolean; content: string; tokens: number; model: string; provider?: string; latencyMs: number; error?: string; fallbackUsed?: boolean };

    if (!result.success) {
      throw new Error(result.error || 'AI request failed');
    }

    return {
      content: result.content,
      provider: (result.provider as AIProvider) || 'groq',
      tokensUsed: result.tokens || 0,
      latencyMs: result.latencyMs || 0,
    };
  } catch (err) {
    console.error('AI provider groq failed, falling back to mock:', err);
    const fallback = await mockProvider(messages, _config);
    fallback.provider = 'mock';
    return fallback;
  }
}

// ─── Data-Driven Intelligence Engine (mock provider) ──────────────────────────
// Queries live marketplace data to generate contextual, accurate responses.
// No external AI API is called — only our own Supabase tables.

async function mockProvider(messages: AIMessage[], _config: AIProviderConfig): Promise<AIResponse> {
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  const query = lastUserMsg?.content || '';
  const systemMsg = messages.find(m => m.role === 'system')?.content || '';

  const response = await generateDataDrivenResponse(query, systemMsg);

  return {
    content: response,
    provider: 'mock',
    tokensUsed: estimateTokens(messages, response),
  };
}

async function generateDataDrivenResponse(query: string, systemContext: string): Promise<string> {
  const q = query.toLowerCase();
  const ctx = systemContext.toLowerCase();

  if (q.includes('trending') || q.includes('popular') || q.includes('hot')) {
    return await getTrendingInsights();
  }
  if (q.includes('category') || q.includes('sell in') || q.includes('best category') || q.includes('which category')) {
    return await getCategoryInsights();
  }
  if (q.includes('sales decreasing') || q.includes('sales down') || q.includes('declining') || q.includes('why are my sales')) {
    return getSalesDeclineAnalysis(ctx.includes('seller'));
  }
  if (q.includes('conversion') || q.includes('convert better')) {
    return getConversionAdvice(ctx.includes('seller'));
  }
  if (q.includes('not ranking') || q.includes('ranking') || q.includes('visibility') || q.includes('more views')) {
    return getRankingAdvice();
  }
  if (q.includes('promote') || q.includes('promotion') || q.includes('campaign') || q.includes('advertise')) {
    return getPromotionAdvice();
  }
  if (q.includes('price') || q.includes('pricing') || q.includes('how much should')) {
    return await getPricingAdvice();
  }
  if (q.includes('affiliate') || q.includes('commission') || q.includes('referral') || q.includes('earn')) {
    return await getAffiliateInsights();
  }
  if (q.includes('title') || q.includes('description') || q.includes('listing') || q.includes('improve my')) {
    return getListingOptimizationAdvice();
  }
  if (q.includes('marketplace health') || q.includes('fraud') || q.includes('admin') || q.includes('moderation')) {
    return await getMarketplaceHealth();
  }
  if (q.includes('compare') || q.includes('alternative') || q.includes('similar') || q.includes('vs')) {
    return getComparisonAdvice();
  }
  if (q.includes('service') || q.includes('growing fast') || q.includes('courses') || q.includes('jobs')) {
    return await getGrowthInsights();
  }
  return getGeneralHelp();
}

// ─── Live Data Fetchers ──────────────────────────────────────────────────────

async function getTrendingInsights(): Promise<string> {
  try {
    const { data } = await supabase
      .from('products')
      .select('name, category, view_count, total_sales, average_rating, price, is_free')
      .eq('approval_status', 'approved')
      .eq('is_active', true)
      .order('view_count', { ascending: false })
      .limit(5);

    if (!data || data.length === 0) {
      return "I couldn't find trending products right now. The marketplace may be newly launched — check back soon as sellers add more listings!";
    }

    const top = (data as { name: string; category: string; view_count: number; total_sales: number; average_rating: number; price: string; is_free: boolean }[]).map((p, i) =>
      `${i + 1}. "${p.name}" (${p.category}) — ${p.view_count} views, ${p.total_sales} sales${p.is_free ? ', Free' : `, ${Number(p.price).toFixed(2)}`}${p.average_rating > 0 ? `, ${Number(p.average_rating).toFixed(1)}★` : ''}`
    ).join('\n');

    return `Here are the trending products on DRIGHT right now, based on live view data:\n\n${top}\n\nThese products are getting the most attention. Consider listing in similar categories or offering complementary products to capture this demand.`;
  } catch {
    return "I'm having trouble fetching trending data right now. Please try again in a moment.";
  }
}

async function getCategoryInsights(): Promise<string> {
  try {
    const { data } = await supabase
      .from('products')
      .select('category, total_sales, view_count')
      .eq('approval_status', 'approved')
      .eq('is_active', true);

    if (!data || data.length === 0) {
      return "I don't have enough category data yet. As more products are listed, I'll be able to recommend the best categories to sell in.";
    }

    const catMap = new Map<string, { sales: number; views: number; count: number }>();
    for (const p of data as { category: string; total_sales: number; view_count: number }[]) {
      const cat = p.category || 'Other';
      const existing = catMap.get(cat) || { sales: 0, views: 0, count: 0 };
      existing.sales += Number(p.total_sales) || 0;
      existing.views += Number(p.view_count) || 0;
      existing.count += 1;
      catMap.set(cat, existing);
    }

    const sorted = Array.from(catMap.entries())
      .map(([cat, stats]) => ({ cat, ...stats, avgViews: stats.count > 0 ? stats.views / stats.count : 0 }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 5);

    const result = sorted.map((s, i) =>
      `${i + 1}. ${s.cat} — ${s.count} listings, ${s.views} total views, ${s.sales} sales (avg ${Math.round(s.avgViews)} views/listing)`
    ).join('\n');

    return `Based on live marketplace data, here are the top categories by demand:\n\n${result}\n\nTip: Categories with high views per listing but fewer total listings represent low-competition, high-demand opportunities. Pick a category that matches your expertise — sellers who know their niche see 60% higher conversion rates.`;
  } catch {
    return "I'm having trouble analyzing categories right now. Please try again later.";
  }
}

function getSalesDeclineAnalysis(isSeller: boolean): Promise<string> {
  if (!isSeller) {
    return Promise.resolve("I can help analyze your sales trends. To give you specific advice, please ask from your seller dashboard where I can see your listing performance data.");
  }

  return Promise.resolve(`If your sales are decreasing, here are the most common causes and how to address them:\n\n1. **Stale listings** — Update your images and description every 30 days. Listings with fresh content get 25% more impressions.\n2. **New competition** — Check if similar products launched recently in your category and adjust your pricing or differentiation.\n3. **Seasonal trends** — Some categories naturally slow down. Diversify with evergreen products.\n4. **Price sensitivity** — Check competitor prices. Being 10%+ above average reduces clicks significantly.\n5. **Reduced visibility** — Your DRIGHT Demand Score may have dropped. Run a promotion to regain momentum, encourage reviews, and update your listing.\n\nWould you like me to analyze a specific listing? Open the product page and use the AI Seller Insights panel for a detailed quality score.`);
}

function getConversionAdvice(isSeller: boolean): string {
  const prefix = isSeller ? "To improve your conversion rate" : "For sellers looking to improve conversion";
  return `${prefix}, focus on these proven factors:\n\n1. **Images**: Add 3+ high-quality images. Listings with multiple images convert 2x better.\n2. **Description**: Write 150+ words covering what it is, key benefits, specs, and use cases.\n3. **Pricing**: Stay within 10% of your category's average price.\n4. **Response time**: Reply to buyer questions within 2 hours. Fast responders see 40% higher conversion.\n5. **Reviews**: Encourage satisfied customers to leave reviews. Each review boosts trust.\n6. **Title optimization**: Use 30-60 characters with your top keyword and category name.\n\nThe marketplace average conversion rate is 1-2%. Top sellers achieve 3-5% by hitting all these factors.`;
}

function getRankingAdvice(): string {
  return `Your DRIGHT Demand Score (DDS) determines ranking. It's calculated from:\n\n• **View count** (20%) — More views = higher rank\n• **Sales velocity** (25%) — Recent sales boost your score significantly\n• **Rating** (15%) — Higher ratings rank higher\n• **Recency** (15%) — Fresh listings get a visibility boost\n• **Engagement** (10%) — Wishlist adds, shares, and inquiries\n• **Listing quality** (15%) — Images, description completeness, tags\n\nTo improve your ranking:\n1. Run a promotion to boost views and sales velocity\n2. Add high-quality images and a detailed description\n3. Collect reviews from past customers\n4. Update your listing monthly to maintain recency\n5. Use relevant tags and keywords for better discoverability`;
}

function getPromotionAdvice(): string {
  return `Here's how to choose the right promotion:\n\n**Starter ($5, 3 days)** — Best for testing. Expect ~1,000 impressions, ~40 clicks. Good for new listings.\n\n**Growth ($15, 7 days)** — Best for established listings. Expect ~2,500 impressions, ~100 clicks. Launch Tuesday-Thursday for peak traffic.\n\n**Premium ($30, 14 days)** — Best for scaling. Expect ~5,000 impressions, ~200 clicks. Use targeted audience for higher conversion.\n\n**Tips:**\n• Launch mid-week when traffic peaks\n• Use targeted audience if your conversion rate is above 3%\n• Use broad audience if you're building awareness\n• Monitor performance daily and adjust budget allocation\n• Combine with a coupon for maximum conversion impact`;
}

async function getPricingAdvice(): Promise<string> {
  try {
    const { data } = await supabase
      .from('products')
      .select('price, category, is_free')
      .eq('approval_status', 'approved')
      .eq('is_active', true)
      .neq('is_free', true);

    if (!data || data.length === 0) {
      return "I don't have enough pricing data yet. As a general rule, price your product based on the value it provides and what similar products charge in your niche.";
    }

    const prices = (data as { price: string; category: string }[]).map(p => Number(p.price));
    const avg = prices.reduce((s, p) => s + p, 0) / prices.length;
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const median = prices.sort((a, b) => a - b)[Math.floor(prices.length / 2)];

    return `Based on ${data.length} active paid listings on DRIGHT:\n\n• **Average price**: ${avg.toFixed(2)}\n• **Median price**: ${median.toFixed(2)}\n• **Price range**: ${min.toFixed(2)} - ${max.toFixed(2)}\n\n**Pricing tips:**\n• New sellers: Start 10-15% below category average to build reviews and traction\n• Established sellers: Price at or slightly above average if your rating is 4.5+★\n• Premium positioning works if your listing quality score is 80+\n• Test different price points — a $2-3 difference can change conversion by 30%\n• Consider bundling or adding bonuses instead of discounting price directly`;
  } catch {
    return "I'm having trouble fetching pricing data right now. As a general rule, research what similar products charge and price competitively.";
  }
}

async function getAffiliateInsights(): Promise<string> {
  try {
    const { data: products } = await supabase
      .from('products')
      .select('name, category, total_sales, view_count, average_rating, price')
      .eq('approval_status', 'approved')
      .eq('is_active', true)
      .neq('is_free', true)
      .order('total_sales', { ascending: false })
      .limit(5);

    if (!products || products.length === 0) {
      return "For affiliate success, focus on products with high view counts and sales velocity. Products in Digital Services and Online Courses typically have the best conversion rates. Share your affiliate links where your audience is most active.";
    }

    const top = (products as { name: string; category: string; total_sales: number; view_count: number; price: string }[]).map((p, i) => {
      const cr = p.view_count > 0 ? ((p.total_sales / p.view_count) * 100).toFixed(1) : '0';
      return `${i + 1}. "${p.name}" (${p.category}) — ${p.total_sales} sales, ${cr}% conversion, ${Number(p.price).toFixed(2)}`;
    }).join('\n');

    return `Here are the top products for affiliate promotion, based on live sales data:\n\n${top}\n\n**Affiliate tips:**\n• Pick products with 3%+ conversion rates for best ROI\n• Products with high view counts but moderate sales have untapped potential\n• Share links in relevant communities, social media, and content\n• Focus on products you can genuinely recommend — authenticity drives clicks\n• Track which links perform best and double down on those categories\n\nNote: Commission rates vary by product. Expected earnings are based on historical data, not guarantees.`;
  } catch {
    return "For affiliate success, focus on high-converting products in Digital Services and Courses. Share your links where your audience is most engaged.";
  }
}

function getListingOptimizationAdvice(): string {
  return `Here's your listing optimization checklist:\n\n**Title (40-60 chars):**\n• Include your top keyword and category name\n• Format: [Brand/Type] [Product Name] [Key Feature]\n• Avoid generic titles like "My Product"\n\n**Description (150+ words):**\n• What it is (1-2 sentences)\n• Key benefits (bullet points)\n• Specifications/details\n• Use cases / who it's for\n• What's included\n\n**Images:**\n• Use 3+ high-quality images\n• First image is the thumbnail — make it count\n• Show the product in use, not just a logo\n\n**Tags (5+ recommended):**\n• Use relevant keywords buyers would search\n• Include category-specific terms\n• Add both broad and niche tags\n\n**Pricing:**\n• Research competitors in your category\n• Start slightly below average to build traction\n\nUse the AI Seller Insights panel on any of your product pages for a personalized quality score and specific suggestions.`;
}

async function getMarketplaceHealth(): Promise<string> {
  try {
    const { count: totalProducts } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('approval_status', 'approved');

    const { count: pendingProducts } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('approval_status', 'pending');

    const { count: totalUsers } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });

    return `Marketplace Health Report:\n\n• **Active listings**: ${totalProducts || 0}\n• **Pending review**: ${pendingProducts || 0} ${pendingProducts && pendingProducts > 5 ? '⚠️ High queue — process to avoid delays' : '✓ Manageable'}\n• **Total users**: ${totalUsers || 0}\n\n${pendingProducts && pendingProducts > 5 ? 'Action needed: Review pending listings to keep sellers engaged.' : 'Marketplace is operating normally.'} Visit the admin dashboard for detailed analytics, moderation tools, and fraud monitoring.`;
  } catch {
    return "I'm having trouble fetching marketplace health data. Please check the admin dashboard directly.";
  }
}

function getComparisonAdvice(): string {
  return `When comparing products on DRIGHT, consider these factors:\n\n1. **Price vs. value** — Cheapest isn't always best. Check what's included.\n2. **Seller rating** — Look for 4+ star sellers with 10+ reviews.\n3. **Response time** — Sellers who reply fast provide better support.\n4. **Listing quality** — Detailed descriptions and multiple images indicate professionalism.\n5. **Recent sales** — Products with recent sales are likely active and supported.\n\nTo compare specific products, open them and look at the Product Specifications and Reviews sections. You can also add products to your wishlist to compare them later.`;
}

async function getGrowthInsights(): Promise<string> {
  try {
    const { data } = await supabase
      .from('products')
      .select('product_type, category, created_at, total_sales')
      .eq('approval_status', 'approved')
      .eq('is_active', true)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    if (!data || data.length === 0) {
      return "I don't see recent growth data yet. As the marketplace grows, I'll be able to identify fast-growing service and course categories.";
    }

    const byType = new Map<string, number>();
    for (const p of data as { product_type?: string; category: string }[]) {
      const type = p.product_type || p.category || 'Other';
      byType.set(type, (byType.get(type) || 0) + 1);
    }

    const sorted = Array.from(byType.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const result = sorted.map(([type, count], i) => `${i + 1}. ${type} — ${count} new listings in 30 days`).join('\n');

    return `Fastest-growing segments in the last 30 days:\n\n${result}\n\nThese segments show active seller interest. If you have expertise in any of these areas, listing now positions you ahead of growing competition. New categories with rising listings often see early-mover advantages.`;
  } catch {
    return "I'm having trouble fetching growth data right now. Please try again later.";
  }
}

function getGeneralHelp(): string {
  return `I'm DRIGHT AI, your marketplace intelligence assistant. I can help with:\n\n• **Trending products** — "What's trending today?"\n• **Category analysis** — "Which category should I sell in?"\n• **Sales insights** — "Why are my sales decreasing?"\n• **Conversion tips** — "How can I improve my conversion rate?"\n• **Ranking help** — "Why is my listing not ranking?"\n• **Promotion advice** — "What promotion fits my budget?"\n• **Pricing guidance** — "How much should I charge?"\n• **Affiliate tips** — "Which products convert best for affiliates?"\n• **Listing optimization** — "How can I improve my listing?"\n• **Marketplace health** — "How is the marketplace doing?"\n\nAsk me anything about buying, selling, or growing on DRIGHT!`;
}

// ─── Default Config ───────────────────────────────────────────────────────────

export const DEFAULT_AI_CONFIG: AIProviderConfig = {
  provider: 'groq',
  maxTokens: 2000,
  temperature: 0.7,
  timeout: 30000,
};
