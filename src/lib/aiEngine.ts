// ─────────────────────────────────────────────────────────────────────────────
// DRIGHT AI Intelligence Engine
// Listing quality scoring, pricing intelligence, SEO generation,
// promotion advice, forecasting, fraud analysis, marketplace reports.
// All functions use live marketplace data where available.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase';
import { callAI, DEFAULT_AI_CONFIG, type AIMessage } from './aiProvider';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ListingQualityScore {
  listing_id: string;
  overall_score: number;
  title_score: number;
  description_score: number;
  image_score: number;
  pricing_score: number;
  keyword_score: number;
  engagement_score: number;
  conversion_score: number;
  suggestions: string[];
  estimated_impact: string;
}

export interface PricingIntelligence {
  suggested_min: number;
  suggested_max: number;
  suggested_optimal: number;
  competitor_count: number;
  avg_competitor_price: number;
  demand_level: 'low' | 'medium' | 'high';
  recommendation: string;
}

export interface SEOKeywords {
  primary_keywords: string[];
  long_tail_keywords: string[];
  related_keywords: string[];
  suggested_tags: string[];
  search_phrases: string[];
}

export interface PromotionAdvice {
  suggested_budget: number;
  suggested_duration: number;
  suggested_audience: string;
  suggested_objective: string;
  estimated_reach: number;
  estimated_clicks: number;
  estimated_conversions: number;
  reasoning: string;
}

export interface MarketplaceForecast {
  forecast_type: string;
  target: string;
  prediction: {
    trend: 'growing' | 'stable' | 'declining';
    growth_rate: number;
    confidence: number;
    description: string;
  };
  time_horizon: string;
}

export interface AIChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  context_type: string | null;
  context_id: string | null;
  created_at: string;
}

// ─── Listing Quality Score ────────────────────────────────────────────────────

export async function calculateListingQuality(
  listingId: string,
  listingData: { name: string; description: string; price: number; image_url: string | null; category: string; tags: string[]; total_sales: number; view_count: number; average_rating: number; total_reviews: number; is_free: boolean },
): Promise<ListingQualityScore> {
  const titleScore = scoreTitle(listingData.name);
  const descriptionScore = scoreDescription(listingData.description);
  const imageScore = listingData.image_url ? 70 : 20;
  const pricingScore = scorePricing(listingData.price, listingData.is_free);
  const keywordScore = scoreKeywords(listingData.tags, listingData.category, listingData.name, listingData.description);
  const engagementScore = scoreEngagement(listingData.view_count, listingData.total_reviews);
  const conversionScore = scoreConversion(listingData.view_count, listingData.total_sales);
  const overall = Math.round(
    (titleScore * 0.15 + descriptionScore * 0.15 + imageScore * 0.10 +
     pricingScore * 0.15 + keywordScore * 0.15 + engagementScore * 0.10 +
     conversionScore * 0.20)
  );

  const suggestions = generateSuggestions(titleScore, descriptionScore, imageScore, pricingScore, keywordScore, engagementScore, conversionScore, listingData);
  const estimatedImpact = overall >= 80 ? 'Excellent — listing is well-optimized' :
    overall >= 60 ? 'Good — minor improvements could boost visibility by 15-25%' :
    overall >= 40 ? 'Fair — addressing suggestions could improve sales by 30-50%' :
    'Needs work — implementing suggestions could double your conversion rate';

  const result: ListingQualityScore = {
    listing_id: listingId,
    overall_score: overall,
    title_score: titleScore,
    description_score: descriptionScore,
    image_score: imageScore,
    pricing_score: pricingScore,
    keyword_score: keywordScore,
    engagement_score: engagementScore,
    conversion_score: conversionScore,
    suggestions,
    estimated_impact: estimatedImpact,
  };

  // Persist to database
  try {
    await supabase.from('ai_quality_scores').upsert({
      listing_id: listingId,
      listing_type: 'product',
      overall_score: overall,
      title_score: titleScore,
      description_score: descriptionScore,
      image_score: imageScore,
      pricing_score: pricingScore,
      keyword_score: keywordScore,
      engagement_score: engagementScore,
      conversion_score: conversionScore,
      suggestions,
      estimated_impact: estimatedImpact,
    }, { onConflict: 'listing_id' });
  } catch (err) {
    console.error('Error saving quality score:', err);
  }

  return result;
}

function scoreTitle(title: string): number {
  if (!title) return 0;
  let score = 40;
  if (title.length >= 30 && title.length <= 60) score += 30;
  else if (title.length >= 20) score += 15;
  if (/[A-Z]/.test(title)) score += 10;
  if (/\d/.test(title)) score += 10;
  if (title.split(' ').length >= 3) score += 10;
  return Math.min(100, score);
}

function scoreDescription(desc: string): number {
  if (!desc) return 0;
  let score = 30;
  if (desc.length >= 150) score += 30;
  else if (desc.length >= 80) score += 15;
  if (desc.includes('\n') || desc.split('. ').length >= 3) score += 15;
  if (/\d/.test(desc)) score += 10;
  if (/(feature|benefit|include|premium|quality|professional)/i.test(desc)) score += 15;
  return Math.min(100, score);
}

function scorePricing(price: number, isFree: boolean): number {
  if (isFree) return 75;
  if (price <= 0) return 30;
  let score = 50;
  if (price >= 5 && price <= 50) score += 25;
  else if (price >= 1 && price <= 100) score += 15;
  if (price > 0 && price < 1) score -= 10;
  return Math.min(100, Math.max(0, score));
}

function scoreKeywords(tags: string[], category: string, title: string, desc: string): number {
  let score = 30;
  if (tags && tags.length >= 3) score += 25;
  else if (tags && tags.length >= 1) score += 10;
  if (category && category !== 'Uncategorized') score += 15;
  const words = (title + ' ' + desc).toLowerCase();
  if (words.includes('best') || words.includes('premium') || words.includes('professional')) score += 15;
  if (words.includes('free') || words.includes('download') || words.includes('instant')) score += 15;
  return Math.min(100, score);
}

function scoreEngagement(views: number, reviews: number): number {
  let score = 20;
  if (views > 100) score += 30;
  else if (views > 20) score += 15;
  if (reviews > 5) score += 30;
  else if (reviews > 0) score += 15;
  return Math.min(100, score);
}

function scoreConversion(views: number, sales: number): number {
  if (views === 0) return 30;
  const rate = (sales / views) * 100;
  if (rate >= 5) return 90;
  if (rate >= 3) return 75;
  if (rate >= 1) return 55;
  if (rate >= 0.5) return 35;
  return 20;
}

function generateSuggestions(
  title: number, desc: number, image: number, pricing: number,
  keywords: number, engagement: number, conversion: number,
  data: { name: string; description: string; image_url: string | null; tags: string[]; category: string },
): string[] {
  const suggestions: string[] = [];
  if (title < 70) suggestions.push('Improve your title: aim for 30-60 characters with key features and category keywords');
  if (desc < 70) suggestions.push('Expand your description: aim for 150+ words covering benefits, features, and specifications');
  if (image < 60) suggestions.push('Add a high-quality product image — listings with images get 3x more views');
  if (pricing < 60) suggestions.push('Review your pricing: competitive pricing within $5-$50 range converts best');
  if (keywords < 60) suggestions.push(`Add more relevant tags — currently ${data.tags?.length || 0} tags, aim for 5+ tags`);
  if (engagement < 60) suggestions.push('Boost engagement: encourage satisfied customers to leave reviews');
  if (conversion < 50) suggestions.push('Improve conversion: ensure clear pricing, fast response times, and quality images');
  if (suggestions.length === 0) suggestions.push('Your listing is well-optimized! Keep monitoring performance and refresh content monthly');
  return suggestions;
}

// ─── Pricing Intelligence ──────────────────────────────────────────────────────

export async function getPricingIntelligence(
  category: string,
  currentPrice: number,
  isFree: boolean,
): Promise<PricingIntelligence> {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('price, total_sales, view_count')
      .eq('category', category)
      .eq('approval_status', 'approved')
      .eq('is_active', true)
      .neq('is_free', true);

    if (error || !data || data.length === 0) {
      return {
        suggested_min: isFree ? 0 : 5,
        suggested_max: isFree ? 0 : 50,
        suggested_optimal: isFree ? 0 : currentPrice || 15,
        competitor_count: 0,
        avg_competitor_price: 0,
        demand_level: 'medium',
        recommendation: 'Limited data available. Set a price you feel reflects the value of your offering.',
      };
    }

    const prices = (data as { price: number }[]).map(p => Number(p.price));
    const avgPrice = prices.reduce((s, p) => s + p, 0) / prices.length;
        const totalSales = (data as { total_sales: number }[]).reduce((s, p) => s + (Number(p.total_sales) || 0), 0);
    const demandLevel = totalSales > 50 ? 'high' : totalSales > 10 ? 'medium' : 'low';

    const suggestedMin = Math.max(1, avgPrice * 0.8);
    const suggestedMax = avgPrice * 1.3;
    const suggestedOptimal = avgPrice * (demandLevel === 'high' ? 1.1 : 0.95);

    const recommendation = currentPrice > avgPrice * 1.3
      ? `Your price is above the category average ($${avgPrice.toFixed(2)}). Consider lowering to $${suggestedOptimal.toFixed(2)} for better conversion.`
      : currentPrice < avgPrice * 0.5
      ? `Your price is below market value. You could increase to $${suggestedOptimal.toFixed(2)} without losing sales.`
      : `Your price is competitive. The optimal range is $${suggestedMin.toFixed(2)}-$${suggestedMax.toFixed(2)}.`;

    return {
      suggested_min: Math.round(suggestedMin * 100) / 100,
      suggested_max: Math.round(suggestedMax * 100) / 100,
      suggested_optimal: Math.round(suggestedOptimal * 100) / 100,
      competitor_count: data.length,
      avg_competitor_price: Math.round(avgPrice * 100) / 100,
      demand_level: demandLevel,
      recommendation,
    };
  } catch {
    return {
      suggested_min: 5, suggested_max: 50, suggested_optimal: 15,
      competitor_count: 0, avg_competitor_price: 0, demand_level: 'medium',
      recommendation: 'Unable to analyze pricing data. Set a price you feel reflects the value.',
    };
  }
}

// ─── SEO Keyword Generator ────────────────────────────────────────────────────

export async function generateSEOKeywords(
  name: string,
  description: string,
  category: string,
  existingTags: string[],
): Promise<SEOKeywords> {
  const text = `${name} ${description} ${category} ${existingTags.join(' ')}`.toLowerCase();
  const words = text.split(/\s+/).filter(w => w.length > 3);

  const wordFreq = new Map<string, number>();
  for (const w of words) {
    wordFreq.set(w, (wordFreq.get(w) || 0) + 1);
  }

  const sorted = Array.from(wordFreq.entries()).sort((a, b) => b[1] - a[1]).map(e => e[0]);

  const primary = sorted.slice(0, 5);
  const longTail = [
    ...primary.map(w => `best ${w} ${category}`.trim()),
    ...primary.map(w => `professional ${w} online`.trim()),
    ...primary.map(w => `affordable ${w} ${category}`.trim()),
  ].slice(0, 5);
  const related = sorted.slice(5, 12);
  const tags = [...new Set([...primary, ...related, category.toLowerCase()])].slice(0, 10);
  const phrases = [
    `how to ${primary[0] || 'get started'}`,
    `${primary[0] || 'quality'} for beginners`,
    `top ${category} ${primary[0] || 'products'}`,
  ];

  return {
    primary_keywords: primary,
    long_tail_keywords: longTail,
    related_keywords: related,
    suggested_tags: tags,
    search_phrases: phrases,
  };
}

// ─── Promotion Advisor ──────────────────────────────────────────────────────────

export async function getPromotionAdvice(
  _listingId: string,
  budget: number,
  _category: string,
  currentViews: number,
  currentSales: number,
): Promise<PromotionAdvice> {
  const conversionRate = currentViews > 0 ? (currentSales / currentViews) * 100 : 1;
  const suggestedBudget = budget > 0 ? budget : currentViews > 100 ? 25 : 15;
  const suggestedDuration = currentViews > 100 ? 14 : 7;
  const suggestedAudience = currentViews > 200 ? 'targeted' : 'broad';
  const suggestedObjective = conversionRate > 3 ? 'sales' : 'awareness';

  const estimatedReach = Math.round(suggestedBudget * 40);
  const estimatedClicks = Math.round(estimatedReach * 0.04);
  const estimatedConversions = Math.round(estimatedClicks * (conversionRate / 100));

  return {
    suggested_budget: suggestedBudget,
    suggested_duration: suggestedDuration,
    suggested_audience: suggestedAudience,
    suggested_objective: suggestedObjective,
    estimated_reach: estimatedReach,
    estimated_clicks: estimatedClicks,
    estimated_conversions: Math.max(estimatedConversions, 1),
    reasoning: `Based on your listing's current performance (${currentViews} views, ${conversionRate.toFixed(1)}% conversion), I recommend a $${suggestedBudget} budget over ${suggestedDuration} days. Your ${conversionRate > 3 ? 'high' : 'moderate'} conversion rate suggests a ${suggestedObjective}-focused campaign with ${suggestedAudience} targeting would maximize ROI.`,
  };
}

// ─── AI Chat Assistant ─────────────────────────────────────────────────────────

export async function fetchChatHistory(userId: string, limit = 50): Promise<AIChatMessage[]> {
  try {
    const { data, error } = await supabase
      .from('ai_conversations')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return ((data || []) as AIChatMessage[]).reverse();
  } catch {
    return [];
  }
}

export async function saveChatMessage(userId: string, role: 'user' | 'assistant', content: string, contextType?: string, contextId?: string): Promise<void> {
  try {
    await supabase.from('ai_conversations').insert({
      user_id: userId,
      role,
      content,
      context_type: contextType || null,
      context_id: contextId || null,
    });
  } catch (err) {
    console.error('Error saving chat message:', err);
  }
}

export async function deleteChatHistory(userId: string): Promise<boolean> {
  try {
    const { error } = await supabase.from('ai_conversations').delete().eq('user_id', userId);
    return !error;
  } catch {
    return false;
  }
}

export async function askAI(
  userId: string,
  query: string,
  context?: { type: string; id?: string; data?: Record<string, unknown> },
): Promise<string> {
  const systemPrompt = buildSystemPrompt(context?.type || 'general', context?.data);
  const history = await fetchChatHistory(userId, 10);

  const messages: AIMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-6).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user', content: query },
  ];

  await saveChatMessage(userId, 'user', query, context?.type, context?.id);
  const response = await callAI(messages, DEFAULT_AI_CONFIG);
  await saveChatMessage(userId, 'assistant', response.content, context?.type, context?.id);

  return response.content;
}

function buildSystemPrompt(contextType: string, data?: Record<string, unknown>): string {
  const base = 'You are DRIGHT AI, a marketplace intelligence assistant for the DRIGHT marketplace platform. You help users with marketplace questions using real data where available. Be concise, helpful, and specific. Always base recommendations on marketplace data patterns.';
  switch (contextType) {
    case 'seller':
      return `${base} You are advising a seller. Focus on listing optimization, pricing, promotion strategies, and conversion improvements. ${data ? `Current context: ${JSON.stringify(data).slice(0, 500)}` : ''}`;
    case 'buyer':
      return `${base} You are advising a buyer. Focus on product recommendations, comparisons, value assessments, and trusted sellers.`;
    case 'affiliate':
      return `${base} You are advising an affiliate. Focus on high-converting products, commission opportunities, and referral strategies. Never promise future earnings.`;
    case 'admin':
      return `${base} You are advising an administrator. Focus on marketplace health, moderation priorities, fraud trends, and growth opportunities. ${data ? `Current context: ${JSON.stringify(data).slice(0, 500)}` : ''}`;
    default:
      return base;
  }
}

// ─── Marketplace Forecasting ────────────────────────────────────────────────────

export async function generateForecast(forecastType: string, target: string, horizon: string = '30d'): Promise<MarketplaceForecast | null> {
  try {
    let trend: 'growing' | 'stable' | 'declining' = 'stable';
    let growthRate = 0;
    let description = '';

    if (forecastType === 'category_growth') {
      const { data } = await supabase
        .from('products')
        .select('created_at, total_sales')
        .eq('category', target)
        .eq('approval_status', 'approved')
        .gte('created_at', new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString());

      const recent = (data || []).filter(p => new Date(p.created_at) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
      const older = (data || []).filter(p => new Date(p.created_at) <= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
      growthRate = older.length > 0 ? ((recent.length - older.length) / older.length) * 100 : recent.length * 10;
      trend = growthRate > 10 ? 'growing' : growthRate < -10 ? 'declining' : 'stable';
      description = `Category "${target}" is ${trend} at ${Math.abs(growthRate).toFixed(0)}% ${growthRate > 0 ? 'growth' : 'decline'} over the past 30 days. ${recent.length} new listings in the last 30 days vs ${older.length} in the prior period.`;
    } else if (forecastType === 'search_trend') {
      const { data } = await supabase
        .from('search_history')
        .select('created_at')
        .ilike('query', `%${target}%`)
        .gte('created_at', new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString());

      const recent = (data || []).filter(s => new Date(s.created_at) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
      const older = (data || []).filter(s => new Date(s.created_at) <= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
      growthRate = older.length > 0 ? ((recent.length - older.length) / older.length) * 100 : recent.length * 20;
      trend = growthRate > 15 ? 'growing' : growthRate < -15 ? 'declining' : 'stable';
      description = `Search term "${target}" shows ${Math.abs(growthRate).toFixed(0)}% ${trend} trend. ${recent.length} recent searches vs ${older.length} prior.`;
    }

    const confidence = Math.min(95, 50 + Math.abs(growthRate));

    const forecast: MarketplaceForecast = {
      forecast_type: forecastType,
      target,
      prediction: { trend, growth_rate: growthRate, confidence, description },
      time_horizon: horizon,
    };

    await supabase.from('ai_forecasts').insert({
      forecast_type: forecastType,
      target,
      prediction: forecast.prediction,
      confidence_level: confidence,
      time_horizon: horizon,
    });

    return forecast;
  } catch (err) {
    console.error('Forecast error:', err);
    return null;
  }
}

// ─── AI Fraud Intelligence ─────────────────────────────────────────────────────

export async function analyzeFraudRisk(userId: string): Promise<{ risk_score: number; factors: string[] }> {
  try {
    const factors: string[] = [];
    let riskScore = 0;

    const { data: user } = await supabase
      .from('users')
      .select('created_at, is_verified, total_purchases, total_sales')
      .eq('id', userId)
      .maybeSingle();

    if (!user) return { risk_score: 0, factors: [] };

    const accountAge = (Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24);
    if (accountAge < 1) { riskScore += 25; factors.push('Very new account (< 1 day)'); }
    if (!user.is_verified) { riskScore += 15; factors.push('Unverified account'); }

    const { data: rapidEvents } = await supabase
      .from('listing_events')
      .select('created_at')
      .eq('user_id', userId)
      .eq('event_type', 'view')
      .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());

    if (rapidEvents && rapidEvents.length > 50) {
      riskScore += 30; factors.push(`${rapidEvents.length} views in 1 hour — possible bot activity`);
    }

    const { data: referrals } = await supabase
      .from('referrals')
      .select('created_at')
      .eq('referrer_id', userId)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    if (referrals && referrals.length > 20) {
      riskScore += 25; factors.push(`${referrals.length} referrals in 24 hours — possible referral abuse`);
    }

    return { risk_score: Math.min(100, riskScore), factors };
  } catch {
    return { risk_score: 0, factors: [] };
  }
}

// ─── AI Marketplace Reports ────────────────────────────────────────────────────

export async function generateMarketplaceReport(reportType: string): Promise<{ title: string; summary: string; data: Record<string, unknown> } | null> {
  try {
    const today = new Date();
    const startDate = new Date(today);
    if (reportType === 'daily_summary') startDate.setDate(startDate.getDate() - 1);
    else if (reportType === 'weekly_trends') startDate.setDate(startDate.getDate() - 7);
    else if (reportType === 'monthly_growth') startDate.setMonth(startDate.getMonth() - 1);

    const { data: products } = await supabase.from('products').select('id, total_sales, view_count, average_rating, category').eq('approval_status', 'approved');
    const { data: sales } = await supabase.from('sales_records').select('sale_amount, sale_date, product_id').gte('sale_date', startDate.toISOString().slice(0, 10));
    const { data: users } = await supabase.from('users').select('created_at').gte('created_at', startDate.toISOString());

    const totalRevenue = (sales || []).reduce((s, r: { sale_amount: number }) => s + Number(r.sale_amount), 0);
    const topCategories = new Map<string, number>();
    for (const p of (products || []) as { category: string; total_sales: number }[]) {
      topCategories.set(p.category || 'Other', (topCategories.get(p.category || 'Other') || 0) + (Number(p.total_sales) || 0));
    }
    const sortedCategories = Array.from(topCategories.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);

    const title = reportType === 'daily_summary' ? 'Daily Marketplace Summary' :
      reportType === 'weekly_trends' ? 'Weekly Trends Report' : 'Monthly Growth Report';

    const summary = `${reportType === 'daily_summary' ? 'Today' : reportType === 'weekly_trends' ? 'This week' : 'This month'}: ${users?.length || 0} new users, ${(sales || []).length} sales, $${totalRevenue.toFixed(2)} revenue. Top categories: ${sortedCategories.map(c => c[0]).join(', ')}.`;

    const reportData = {
      new_users: users?.length || 0,
      total_sales: (sales || []).length,
      total_revenue: totalRevenue,
      top_categories: sortedCategories,
      period: { start: startDate.toISOString(), end: today.toISOString() },
    };

    await supabase.from('ai_reports').insert({
      report_type: reportType,
      title,
      summary,
      data: reportData,
      period_start: startDate.toISOString().slice(0, 10),
      period_end: today.toISOString().slice(0, 10),
    });

    return { title, summary, data: reportData };
  } catch (err) {
    console.error('Report generation error:', err);
    return null;
  }
}
