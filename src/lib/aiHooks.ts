// ─────────────────────────────────────────────────────────────────────────────
// DRIGHT AI Hooks
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react';
import {
  type AIChatMessage, type ListingQualityScore, type PricingIntelligence,
  type SEOKeywords, type PromotionAdvice, type MarketplaceForecast,
  fetchChatHistory, askAI, deleteChatHistory, calculateListingQuality,
  getPricingIntelligence, generateSEOKeywords, getPromotionAdvice,
  generateForecast, analyzeFraudRisk, generateMarketplaceReport,
} from './aiEngine';

export function useAIChat(userId: string | null | undefined) {
  const [messages, setMessages] = useState<AIChatMessage[]>([]);
  const [loading, setLoading] = useState(false);

  const loadHistory = useCallback(async () => {
    if (!userId) return;
    const history = await fetchChatHistory(userId);
    setMessages(history);
  }, [userId]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const ask = useCallback(async (query: string, context?: { type: string; id?: string; data?: Record<string, unknown> }) => {
    if (!userId) return '';
    setLoading(true);
    const response = await askAI(userId, query, context);
    await loadHistory();
    setLoading(false);
    return response;
  }, [userId, loadHistory]);

  const clearHistory = useCallback(async () => {
    if (!userId) return;
    await deleteChatHistory(userId);
    setMessages([]);
  }, [userId]);

  return { messages, loading, ask, clearHistory, loadHistory };
}

export function useListingQuality() {
  const [score, setScore] = useState<ListingQualityScore | null>(null);
  const [loading, setLoading] = useState(false);

  const analyze = useCallback(async (
    listingId: string,
    data: { name: string; description: string; price: number; image_url: string | null; category: string; tags: string[]; total_sales: number; view_count: number; average_rating: number; total_reviews: number; is_free: boolean },
  ) => {
    setLoading(true);
    const result = await calculateListingQuality(listingId, data);
    setScore(result);
    setLoading(false);
    return result;
  }, []);

  return { score, loading, analyze };
}

export function usePricingIntelligence() {
  const [pricing, setPricing] = useState<PricingIntelligence | null>(null);
  const [loading, setLoading] = useState(false);

  const analyze = useCallback(async (category: string, currentPrice: number, isFree: boolean) => {
    setLoading(true);
    const result = await getPricingIntelligence(category, currentPrice, isFree);
    setPricing(result);
    setLoading(false);
    return result;
  }, []);

  return { pricing, loading, analyze };
}

export function useSEOKeywords() {
  const [keywords, setKeywords] = useState<SEOKeywords | null>(null);
  const [loading, setLoading] = useState(false);

  const generate = useCallback(async (name: string, description: string, category: string, existingTags: string[]) => {
    setLoading(true);
    const result = await generateSEOKeywords(name, description, category, existingTags);
    setKeywords(result);
    setLoading(false);
    return result;
  }, []);

  return { keywords, loading, generate };
}

export function usePromotionAdvice() {
  const [advice, setAdvice] = useState<PromotionAdvice | null>(null);
  const [loading, setLoading] = useState(false);

  const analyze = useCallback(async (listingId: string, budget: number, category: string, views: number, sales: number) => {
    setLoading(true);
    const result = await getPromotionAdvice(listingId, budget, category, views, sales);
    setAdvice(result);
    setLoading(false);
    return result;
  }, []);

  return { advice, loading, analyze };
}

export function useForecast() {
  const [forecast, setForecast] = useState<MarketplaceForecast | null>(null);
  const [loading, setLoading] = useState(false);

  const generate = useCallback(async (type: string, target: string, horizon?: string) => {
    setLoading(true);
    const result = await generateForecast(type, target, horizon);
    setForecast(result);
    setLoading(false);
    return result;
  }, []);

  return { forecast, loading, generate };
}

export function useFraudAnalysis() {
  const [analysis, setAnalysis] = useState<{ risk_score: number; factors: string[] } | null>(null);
  const [loading, setLoading] = useState(false);

  const analyze = useCallback(async (userId: string) => {
    setLoading(true);
    const result = await analyzeFraudRisk(userId);
    setAnalysis(result);
    setLoading(false);
    return result;
  }, []);

  return { analysis, loading, analyze };
}

export function useMarketplaceReport() {
  const [report, setReport] = useState<{ title: string; summary: string; data: Record<string, unknown> } | null>(null);
  const [loading, setLoading] = useState(false);

  const generate = useCallback(async (reportType: string) => {
    setLoading(true);
    const result = await generateMarketplaceReport(reportType);
    setReport(result);
    setLoading(false);
    return result;
  }, []);

  return { report, loading, generate };
}
