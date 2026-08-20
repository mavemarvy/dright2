// ─────────────────────────────────────────────────────────────────────────────
// DRIGHT Promotion Hooks
// React hooks for the promotion system — campaign management, analytics,
// pricing, packages, and sponsored listings.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react';
import {
  type PromotionPricing,
  type PromotionPackage,
  type PromotionCampaign,
  type CampaignStatistics,
  type CampaignAnalyticsSummary,
  fetchPricing,
  fetchPackages,
  fetchAllPackages,
  fetchSellerCampaigns,
  fetchAllCampaigns,
  fetchCampaignStatistics,
  fetchSellerAnalytics,
  fetchAdminAnalytics,
  createCampaign,
  activateCampaign,
  updateCampaignStatus,
  duplicateCampaign,
  extendCampaign,
  type CreateCampaignInput,
} from './promotionEngine';

export function usePricing() {
  const [pricing, setPricing] = useState<PromotionPricing | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPricing().then(p => { setPricing(p); setLoading(false); });
  }, []);

  return { pricing, loading };
}

export function usePackages() {
  const [packages, setPackages] = useState<PromotionPackage[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(() => {
    setLoading(true);
    fetchPackages().then(p => { setPackages(p); setLoading(false); });
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  return { packages, loading, refetch };
}

export function useAllPackages() {
  const [packages, setPackages] = useState<PromotionPackage[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(() => {
    setLoading(true);
    fetchAllPackages().then(p => { setPackages(p); setLoading(false); });
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  return { packages, loading, refetch };
}

export function useSellerCampaigns(sellerId: string | null | undefined) {
  const [campaigns, setCampaigns] = useState<PromotionCampaign[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(() => {
    if (!sellerId) { setLoading(false); return; }
    setLoading(true);
    fetchSellerCampaigns(sellerId).then(c => { setCampaigns(c); setLoading(false); });
  }, [sellerId]);

  useEffect(() => { refetch(); }, [refetch]);

  return { campaigns, loading, refetch };
}

export function useAllCampaigns() {
  const [campaigns, setCampaigns] = useState<PromotionCampaign[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(() => {
    setLoading(true);
    fetchAllCampaigns().then(c => { setCampaigns(c); setLoading(false); });
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  return { campaigns, loading, refetch };
}

export function useCampaignStatistics(campaignId: string | null | undefined) {
  const [stats, setStats] = useState<CampaignStatistics[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!campaignId) { setLoading(false); return; }
    setLoading(true);
    fetchCampaignStatistics(campaignId).then(s => { setStats(s); setLoading(false); });
  }, [campaignId]);

  return { stats, loading };
}

export function useSellerAnalytics(sellerId: string | null | undefined) {
  const [analytics, setAnalytics] = useState<CampaignAnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sellerId) { setLoading(false); return; }
    setLoading(true);
    fetchSellerAnalytics(sellerId).then(a => { setAnalytics(a); setLoading(false); });
  }, [sellerId]);

  return { analytics, loading };
}

export function useAdminAnalytics() {
  const [analytics, setAnalytics] = useState<CampaignAnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(() => {
    setLoading(true);
    fetchAdminAnalytics().then(a => { setAnalytics(a); setLoading(false); });
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  return { analytics, loading, refetch };
}

export function useCreateCampaign() {
  const [creating, setCreating] = useState(false);

  const create = useCallback(async (sellerId: string, input: CreateCampaignInput, pricing: PromotionPricing) => {
    setCreating(true);
    const campaign = await createCampaign(sellerId, input, pricing);
    setCreating(false);
    return campaign;
  }, []);

  return { create, creating };
}

export function useCampaignActions() {
  const activate = useCallback(async (campaignId: string, paymentId: string) => {
    return activateCampaign(campaignId, paymentId);
  }, []);

  const pause = useCallback(async (campaignId: string) => {
    return updateCampaignStatus(campaignId, 'paused');
  }, []);

  const resume = useCallback(async (campaignId: string) => {
    return updateCampaignStatus(campaignId, 'active');
  }, []);

  const cancel = useCallback(async (campaignId: string) => {
    return updateCampaignStatus(campaignId, 'cancelled');
  }, []);

  const duplicate = useCallback(async (campaignId: string, sellerId: string) => {
    return duplicateCampaign(campaignId, sellerId);
  }, []);

  const extend = useCallback(async (campaignId: string, extraDays: number) => {
    return extendCampaign(campaignId, extraDays);
  }, []);

  return { activate, pause, resume, cancel, duplicate, extend };
}

// ─── Sponsored Listings Hook ───────────────────────────────────────────────────

export function useSponsoredListings(placement: string, limit = 5) {
  const [sponsored, setSponsored] = useState<{ listing_id: string; campaign_id: string; listing_type: string; goal: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    import('./promotionEngine').then(({ fetchSponsoredListings }) => {
      fetchSponsoredListings(placement, limit).then(s => {
        if (mounted) { setSponsored(s); setLoading(false); }
      });
    });
    return () => { mounted = false; };
  }, [placement, limit]);

  return { sponsored, loading };
}
