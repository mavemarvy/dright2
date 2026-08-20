// ─────────────────────────────────────────────────────────────────────────────
// DRIGHT Admin Intelligence Hooks
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react';
import {
  type ExecutiveKPIs, type MarketplaceAnalytics, type FinancialSummary,
  type AdminActivityLog, type ModerationItem, type FraudCase,
  type SellerIntelligence, type CategoryAnalytics,
  fetchExecutiveKPIs, fetchMarketplaceAnalytics, fetchFinancialSummary,
  fetchAdminLogs, fetchModerationQueue, fetchFraudCases,
  fetchSellerIntelligence, fetchBuyerIntelligence, fetchCategoryAnalytics,
  fetchDailyActivity,
} from './adminIntelligence';

export function useExecutiveKPIs() {
  const [kpis, setKpis] = useState<ExecutiveKPIs | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(() => {
    setLoading(true);
    fetchExecutiveKPIs().then(k => { setKpis(k); setLoading(false); });
  }, []);

  useEffect(() => { refetch(); }, [refetch]);
  return { kpis, loading, refetch };
}

export function useMarketplaceAnalytics() {
  const [analytics, setAnalytics] = useState<MarketplaceAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMarketplaceAnalytics().then(a => { setAnalytics(a); setLoading(false); });
  }, []);

  return { analytics, loading };
}

export function useFinancialSummary() {
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(() => {
    setLoading(true);
    fetchFinancialSummary().then(s => { setSummary(s); setLoading(false); });
  }, []);

  useEffect(() => { refetch(); }, [refetch]);
  return { summary, loading, refetch };
}

export function useAdminLogs(limit = 100, adminId?: string) {
  const [logs, setLogs] = useState<AdminActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(() => {
    setLoading(true);
    fetchAdminLogs(limit, adminId).then(l => { setLogs(l); setLoading(false); });
  }, [limit, adminId]);

  useEffect(() => { refetch(); }, [refetch]);
  return { logs, loading, refetch };
}

export function useModerationQueue(status?: string) {
  const [items, setItems] = useState<ModerationItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(() => {
    setLoading(true);
    fetchModerationQueue(status).then(i => { setItems(i); setLoading(false); });
  }, [status]);

  useEffect(() => { refetch(); }, [refetch]);
  return { items, loading, refetch };
}

export function useFraudCases(status?: string) {
  const [cases, setCases] = useState<FraudCase[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(() => {
    setLoading(true);
    fetchFraudCases(status).then(c => { setCases(c); setLoading(false); });
  }, [status]);

  useEffect(() => { refetch(); }, [refetch]);
  return { cases, loading, refetch };
}

export function useSellerIntelligence(limit = 50) {
  const [sellers, setSellers] = useState<SellerIntelligence[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSellerIntelligence(limit).then(s => { setSellers(s); setLoading(false); });
  }, [limit]);

  return { sellers, loading };
}

export function useBuyerIntelligence(limit = 50) {
  const [buyers, setBuyers] = useState<{ user_id: string; username: string | null; email: string; total_purchases: number; total_spent: number; is_suspended: boolean }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBuyerIntelligence(limit).then(b => { setBuyers(b); setLoading(false); });
  }, [limit]);

  return { buyers, loading };
}

export function useCategoryAnalytics() {
  const [categories, setCategories] = useState<CategoryAnalytics[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCategoryAnalytics().then(c => { setCategories(c); setLoading(false); });
  }, []);

  return { categories, loading };
}

export function useDailyActivity(days = 30) {
  const [activity, setActivity] = useState<{ date: string; views: number; purchases: number; signups: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDailyActivity(days).then(a => { setActivity(a); setLoading(false); });
  }, [days]);

  return { activity, loading };
}
