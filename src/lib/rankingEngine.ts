import { supabase } from './supabase';

export interface RankingWeights {
  relevance_weight: number;
  seller_verification_weight: number;
  listing_quality_weight: number;
  conversion_rate_weight: number;
  sales_history_weight: number;
  rating_weight: number;
  freshness_weight: number;
  trending_weight: number;
}

const DEFAULT_WEIGHTS: RankingWeights = {
  relevance_weight: 30,
  seller_verification_weight: 15,
  listing_quality_weight: 10,
  conversion_rate_weight: 15,
  sales_history_weight: 10,
  rating_weight: 10,
  freshness_weight: 5,
  trending_weight: 5,
};

export async function fetchRankingWeights(): Promise<RankingWeights> {
  const { data } = await supabase
    .from('marketplace_ranking_weights')
    .select('relevance_weight, seller_verification_weight, listing_quality_weight, conversion_rate_weight, sales_history_weight, rating_weight, freshness_weight, trending_weight')
    .maybeSingle();
  return (data as RankingWeights) || DEFAULT_WEIGHTS;
}

interface RankableProduct {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  category: string;
  uploaded_by: string;
  created_at: string;
  is_free?: boolean;
  stock_quantity?: number | null;
  total_sales?: number;
  average_rating?: number;
  total_reviews?: number;
  view_count?: number;
  image_url?: string | null;
  seller_verified?: boolean;
  is_featured?: boolean;
  is_sponsored?: boolean;
}

export function computeRankingScore(
  product: RankableProduct,
  searchQuery: string,
  weights: RankingWeights,
): number {
  const w = weights;
  let score = 0;

  // 1. Relevance to search (0-100, scaled by weight)
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase().trim();
    const nameLower = product.name.toLowerCase();
    const descLower = (product.description ?? '').toLowerCase();
    const catLower = product.category.toLowerCase();

    let relevance = 0;
    if (nameLower === q) relevance = 100;
    else if (nameLower.startsWith(q)) relevance = 85;
    else if (nameLower.includes(q)) relevance = 70;
    else if (descLower.includes(q)) relevance = 40;
    else if (catLower.includes(q)) relevance = 50;

    // Fuzzy: check word-by-word overlap
    if (relevance === 0) {
      const queryWords = q.split(' ').filter(w => w.length > 1);
      const productWords = [...nameLower.split(' '), ...descLower.split(' '), ...catLower.split(' ')].filter(w => w.length > 1);
      let matched = 0;
      for (const qw of queryWords) {
        if (productWords.some(pw => pw.includes(qw) || qw.includes(pw))) matched++;
      }
      relevance = queryWords.length > 0 ? (matched / queryWords.length) * 30 : 0;
    }

    score += (relevance / 100) * w.relevance_weight;
  } else {
    score += w.relevance_weight * 0.5;
  }

  // 2. Seller verification (0 or weight)
  if (product.seller_verified) score += w.seller_verification_weight;

  // 3. Listing quality (has image, has description, has stock info)
  let quality = 0;
  if (product.image_url) quality += 33;
  if (product.description && product.description.length > 50) quality += 33;
  if (product.stock_quantity !== null && product.stock_quantity !== undefined) quality += 34;
  score += (quality / 100) * w.listing_quality_weight;

  // 4. Conversion rate (total_sales / views, normalized)
  const views = product.view_count ?? 0;
  const sales = product.total_sales ?? 0;
  const conversionRate = views > 0 ? Math.min(sales / views, 1) : 0;
  score += conversionRate * w.conversion_rate_weight;

  // 5. Sales history (log scale, capped)
  const salesScore = Math.min(Math.log10(sales + 1) / 2, 1);
  score += salesScore * w.sales_history_weight;

  // 6. Rating (0-1 scale, requires minimum reviews)
  const rating = product.average_rating ?? 0;
  const reviews = product.total_reviews ?? 0;
  const ratingScore = reviews > 0 ? (rating / 5) : 0;
  score += ratingScore * w.rating_weight;

  // 7. Freshness (newer = higher, decays over 30 days)
  const created = new Date(product.created_at).getTime();
  const ageDays = (Date.now() - created) / 86400000;
  const freshnessScore = Math.max(0, 1 - ageDays / 30);
  score += freshnessScore * w.freshness_weight;

  // 8. Trending (views in last period, normalized)
  const trendingScore = Math.min(views / 200, 1);
  score += trendingScore * w.trending_weight;

  // Boost featured/sponsored
  if (product.is_featured) score += 5;
  if (product.is_sponsored) score += 8;

  return score;
}

export function rankProducts<T extends RankableProduct>(
  products: T[],
  searchQuery: string,
  weights: RankingWeights,
): T[] {
  return [...products]
    .map(p => ({ product: p, score: computeRankingScore(p, searchQuery, weights) }))
    .sort((a, b) => b.score - a.score)
    .map(item => item.product);
}

// Fuzzy search: Levenshtein-based similarity for typo correction
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

export function fuzzyMatch(query: string, target: string, maxDistance: number = 2): boolean {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t.includes(q)) return true;
  const queryWords = q.split(' ');
  const targetWords = t.split(' ');
  for (const qw of queryWords) {
    for (const tw of targetWords) {
      if (tw.includes(qw) || qw.includes(tw)) return true;
      if (qw.length > 3 && tw.length > 3 && levenshteinDistance(qw, tw) <= maxDistance) return true;
    }
  }
  return false;
}

const SYNONYMS: Record<string, string[]> = {
  'cheap': ['affordable', 'budget', 'low cost', 'inexpensive'],
  'best': ['top', 'premium', 'quality', 'excellent'],
  'phone': ['smartphone', 'mobile', 'cellphone'],
  'laptop': ['notebook', 'computer', 'pc'],
  'course': ['tutorial', 'training', 'class', 'lesson'],
  'design': ['graphic', 'creative', 'logo', 'branding'],
  'marketing': ['advertising', 'promotion', 'seo', 'social media'],
  'ai': ['artificial intelligence', 'machine learning', 'ml'],
  'template': ['template', 'theme', 'preset', 'starter'],
};

export function expandSynonyms(query: string): string[] {
  const lower = query.toLowerCase();
  const expanded = [query];
  for (const [word, syns] of Object.entries(SYNONYMS)) {
    if (lower.includes(word)) {
      for (const syn of syns) {
        expanded.push(lower.replace(word, syn));
      }
    }
  }
  return expanded;
}
