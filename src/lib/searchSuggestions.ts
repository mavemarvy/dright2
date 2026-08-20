// ─────────────────────────────────────────────────────────────────────────────
// DRIGHT Smart Search Suggestions
// Dynamic autocomplete suggestions from personal history, platform trends,
// category trends, fast-growing searches, and related keywords.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase';

export interface SearchSuggestion {
  term: string;
  type: 'keyword' | 'category' | 'trending' | 'recent' | 'popular';
  category?: string;
  popularity: number;
}

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'AI Tools': ['AI Video Generator', 'AI Image Generator', 'AI Writing Tool', 'AI Chatbot', 'AI Automation'],
  'Graphic Design': ['Logo Design', 'Brand Kit', 'Social Media Template', 'Poster Design', 'Illustration'],
  'Marketing': ['SEO Service', 'Social Media Marketing', 'Email Marketing', 'Content Marketing', 'Ad Campaign'],
  'Programming': ['React Template', 'API Development', 'Mobile App', 'Web Scraper', 'Code Review'],
  'Photography': ['Photo Editing', 'Lightroom Preset', 'Stock Photos', 'Portrait Session', 'Product Photography'],
  'Video': ['Video Editing', 'Video Editor', 'Video Production', 'Motion Graphics', 'YouTube Editing'],
  'Writing': ['Copywriting', 'Blog Writing', 'Technical Writing', 'Proofreading', 'Content Strategy'],
  'Music': ['Beat Making', 'Music Production', 'Voice Over', 'Podcast Editing', 'Sound Design'],
};

const RELATED_KEYWORDS: Record<string, string[]> = {
  'video': ['Video Editing', 'Video Editor', 'AI Video Generator', 'Video Marketing Course', 'Video Production Service'],
  'design': ['Logo Design', 'Graphic Design', 'UI Design', 'Design Template', 'Brand Design'],
  'ai': ['AI Tools', 'AI Generator', 'AI Chatbot', 'AI Automation', 'AI Course'],
  'marketing': ['Digital Marketing', 'SEO Service', 'Social Media Marketing', 'Marketing Strategy', 'Ad Campaign'],
  'code': ['Code Template', 'React Template', 'API Service', 'Code Review', 'Programming Course'],
  'music': ['Music Production', 'Beat Making', 'Voice Over', 'Sound Design', 'Music Course'],
  'photo': ['Photo Editing', 'Photography', 'Lightroom Preset', 'Stock Photos', 'Photo Retouching'],
  'writing': ['Copywriting', 'Content Writing', 'Blog Writing', 'Technical Writing', 'Proofreading'],
};

/**
 * Fetches autocomplete suggestions for a partial query.
 * Blends: database suggestions (trigram) + related keywords + personal recent searches.
 */
export async function getSmartSuggestions(
  partial: string,
  userId?: string | null,
  limit = 8,
): Promise<SearchSuggestion[]> {
  const q = partial.toLowerCase().trim();
  if (q.length < 1) return [];

  const suggestions: SearchSuggestion[] = [];
  const seen = new Set<string>();

  // 1. Related keyword expansions (instant, no DB call)
  for (const [key, expansions] of Object.entries(RELATED_KEYWORDS)) {
    if (q.includes(key) || key.includes(q)) {
      for (const term of expansions) {
        const lower = term.toLowerCase();
        if (lower.includes(q) && !seen.has(lower)) {
          seen.add(lower);
          suggestions.push({ term, type: 'keyword', popularity: 50 });
        }
      }
    }
  }

  // 2. Database suggestions (trigram search) — runs in parallel
  const dbPromise = supabase
    .from('search_suggestions')
    .select('term, term_type, category, popularity')
    .ilike('term', `%${q}%`)
    .order('popularity', { ascending: false })
    .limit(limit * 2);

  // 3. Personal recent searches
  const recentPromise = userId
    ? supabase
        .from('search_history')
        .select('query')
        .eq('user_id', userId)
        .ilike('query', `%${q}%`)
        .order('created_at', { ascending: false })
        .limit(4)
    : Promise.resolve({ data: [] });

  // 4. Fast-growing search trends
  const trendsPromise = supabase
    .from('search_trends')
    .select('term, growth_rate')
    .ilike('term', `%${q}%`)
    .order('growth_rate', { ascending: false })
    .limit(4);

  const [dbResult, recentResult, trendsResult] = await Promise.all([dbPromise, recentPromise, trendsPromise]);

  // Database suggestions
  for (const s of (dbResult.data || [])) {
    const lower = s.term.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      suggestions.push({
        term: s.term,
        type: s.term_type === 'category' ? 'category' : 'popular',
        category: s.category,
        popularity: s.popularity,
      });
    }
  }

  // Recent searches (highest priority for re-use)
  for (const r of (recentResult.data || [])) {
    const lower = r.query.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      suggestions.push({ term: r.query, type: 'recent', popularity: 100 });
    }
  }

  // Trending searches
  for (const t of (trendsResult.data || [])) {
    const lower = t.term.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      suggestions.push({ term: t.term, type: 'trending', popularity: 80 });
    }
  }

  // Sort: recent > trending > keyword > popular > category, then by popularity
  const typeOrder: Record<string, number> = { recent: 0, trending: 1, keyword: 2, popular: 3, category: 4 };
  return suggestions
    .sort((a, b) => {
      const typeDiff = (typeOrder[a.type] ?? 5) - (typeOrder[b.type] ?? 5);
      if (typeDiff !== 0) return typeDiff;
      return b.popularity - a.popularity;
    })
    .slice(0, limit);
}

/**
 * Fetches personalized suggestions for empty search box (no query yet).
 * Mixes: user's recent searches + trending + popular categories.
 */
export async function getEmptyStateSuggestions(userId?: string | null, limit = 6): Promise<SearchSuggestion[]> {
  const suggestions: SearchSuggestion[] = [];
  const seen = new Set<string>();

  // Recent searches
  if (userId) {
    const { data } = await supabase
      .from('search_history')
      .select('query')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(4);
    for (const r of (data || [])) {
      if (!seen.has(r.query.toLowerCase())) {
        seen.add(r.query.toLowerCase());
        suggestions.push({ term: r.query, type: 'recent', popularity: 100 });
      }
    }
  }

  // Trending searches from search_trends
  const { data: trends } = await supabase
    .from('search_trends')
    .select('term, growth_rate')
    .order('growth_rate', { ascending: false })
    .limit(6);
  for (const t of (trends || [])) {
    if (!seen.has(t.term.toLowerCase())) {
      seen.add(t.term.toLowerCase());
      suggestions.push({ term: t.term, type: 'trending', popularity: 80 });
    }
  }

  // Fallback: popular categories
  if (suggestions.length < limit) {
    for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      if (suggestions.length >= limit) break;
      const term = keywords[0];
      if (!seen.has(term.toLowerCase())) {
        seen.add(term.toLowerCase());
        suggestions.push({ term, type: 'category', category: cat, popularity: 30 });
      }
    }
  }

  return suggestions.slice(0, limit);
}

/**
 * Fetches trending search terms for discovery sections.
 */
export async function getTrendingSearchTerms(limit = 10): Promise<{ term: string; growth_rate: number }[]> {
  try {
    const { data } = await supabase
      .from('search_trends')
      .select('term, growth_rate')
      .eq('period_type', 'daily')
      .order('growth_rate', { ascending: false })
      .limit(limit);
    return (data || []).map(d => ({ term: d.term, growth_rate: Number(d.growth_rate) }));
  } catch {
    return [];
  }
}
