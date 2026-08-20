// ─────────────────────────────────────────────────────────────────────────────
// Creator Campaign Hooks
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import * as lib from './campaignLib';
import type {
  Campaign, CampaignCategory, CampaignSubmission, CampaignWallet,
  CampaignTransaction, WorkerProfile, CreatorProfile, WorkerLevelDef,
  CampaignBookmark, LeaderboardEntry, CampaignMedia,
} from './campaignTypes';

// ─── Categories ───────────────────────────────────────────────────────────────

export function useCategories() {
  const [categories, setCategories] = useState<CampaignCategory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    lib.fetchCategories().then(setCategories).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return { categories, loading };
}

// ─── Campaigns List ──────────────────────────────────────────────────────────

export function useCampaigns(opts: { sortBy?: 'trending' | 'new' | 'reward' | 'ending'; category?: string; search?: string; creatorId?: string }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const limit = 12;

  const fetchMore = useCallback(async (reset = false) => {
    setLoading(true);
    try {
      const { campaigns: data, total: t } = await lib.fetchCampaigns({
        ...opts,
        limit,
        offset: reset ? 0 : offset,
      });
      setCampaigns(prev => reset ? data : [...prev, ...data]);
      setTotal(t);
      setOffset(reset ? limit : offset + limit);
    } catch { /* */ } finally { setLoading(false); }
  }, [opts.sortBy, opts.category, opts.search, opts.creatorId, offset]);

  useEffect(() => { setCampaigns([]); setOffset(0); fetchMore(true); }, [opts.sortBy, opts.category, opts.search, opts.creatorId]);

  return { campaigns, total, loading, fetchMore, hasMore: campaigns.length < total };
}

// ─── Single Campaign ─────────────────────────────────────────────────────────

export function useCampaign(id: string | undefined) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [media, setMedia] = useState<CampaignMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      lib.fetchCampaignById(id),
      lib.fetchCampaignMedia(id),
    ]).then(([c, m]) => {
      setCampaign(c);
      setMedia(m);
      if (c && user) lib.recordView(id, user.id);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [id, user]);

  return { campaign, media, loading };
}

// ─── Submissions ──────────────────────────────────────────────────────────────

export function useSubmissions(opts: { workerId?: string; campaignId?: string; status?: string }) {
  const [submissions, setSubmissions] = useState<CampaignSubmission[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchSubs = useCallback(async () => {
    setLoading(true);
    try {
      const { submissions, total: t } = await lib.fetchSubmissions(opts);
      setSubmissions(submissions);
      setTotal(t);
    } catch { /* */ } finally { setLoading(false); }
  }, [opts.workerId, opts.campaignId, opts.status]);

  useEffect(() => { fetchSubs(); }, [fetchSubs]);

  return { submissions, total, loading, refetch: fetchSubs };
}

// ─── Wallet ───────────────────────────────────────────────────────────────────

export function useCampaignWallet() {
  const { user } = useAuth();
  const [wallet, setWallet] = useState<CampaignWallet | null>(null);
  const [transactions, setTransactions] = useState<CampaignTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchWallet = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [w, txs] = await Promise.all([
        lib.getOrCreateWallet(user.id),
        lib.fetchTransactions(user.id),
      ]);
      setWallet(w);
      setTransactions(txs);
    } catch { /* */ } finally { setLoading(false); }
  }, [user]);

  useEffect(() => { fetchWallet(); }, [fetchWallet]);

  const deposit = useCallback(async (amount: number) => {
    if (!user) return;
    await lib.depositFunds(user.id, amount);
    await fetchWallet();
  }, [user, fetchWallet]);

  const withdraw = useCallback(async (amount: number) => {
    if (!user) return;
    await lib.withdrawFunds(user.id, amount);
    await fetchWallet();
  }, [user, fetchWallet]);

  return { wallet, transactions, loading, deposit, withdraw, refetch: fetchWallet };
}

// ─── Worker Profile ───────────────────────────────────────────────────────────

export function useWorkerProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<WorkerProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    lib.getOrCreateWorkerProfile(user.id).then(setProfile).catch(() => {}).finally(() => setLoading(false));
  }, [user]);

  return { profile, loading };
}

// ─── Creator Profile ──────────────────────────────────────────────────────────

export function useCreatorProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<CreatorProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    lib.getOrCreateCreatorProfile(user.id).then(setProfile).catch(() => {}).finally(() => setLoading(false));
  }, [user]);

  return { profile, loading };
}

// ─── Worker Levels ────────────────────────────────────────────────────────────

export function useWorkerLevels() {
  const [levels, setLevels] = useState<WorkerLevelDef[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    lib.fetchWorkerLevels().then(setLevels).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return { levels, loading };
}

// ─── Bookmarks ────────────────────────────────────────────────────────────────

export function useBookmarks() {
  const { user } = useAuth();
  const [bookmarks, setBookmarks] = useState<CampaignBookmark[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBm = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try { setBookmarks(await lib.fetchBookmarks(user.id)); } catch { /* */ } finally { setLoading(false); }
  }, [user]);

  useEffect(() => { fetchBm(); }, [fetchBm]);

  const toggle = useCallback(async (campaignId: string) => {
    if (!user) return;
    await lib.toggleBookmark(campaignId, user.id);
    await fetchBm();
  }, [user, fetchBm]);

  const isBookmarked = useCallback((campaignId: string) => bookmarks.some(b => b.campaign_id === campaignId), [bookmarks]);

  return { bookmarks, loading, toggle, isBookmarked, refetch: fetchBm };
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────

export function useLeaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    lib.fetchLeaderboard().then(setEntries).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return { entries, loading };
}

// ─── Submit Task ──────────────────────────────────────────────────────────────

export function useSubmitTask() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async (campaignId: string, evidence: { evidence_urls: string[]; evidence_text: string; evidence_links: string[]; notes: string }) => {
    setSubmitting(true);
    setError(null);
    try {
      return await lib.submitTask(campaignId, evidence);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit task');
      throw err;
    } finally { setSubmitting(false); }
  }, []);

  return { submit, submitting, error };
}

// ─── Review Submission ────────────────────────────────────────────────────────

export function useReviewSubmission() {
  const [reviewing, setReviewing] = useState(false);

  const review = useCallback(async (submissionId: string, verdict: 'approved' | 'rejected' | 'revision_requested', notes: string) => {
    setReviewing(true);
    try {
      await lib.reviewSubmission(submissionId, verdict, notes);
    } finally { setReviewing(false); }
  }, []);

  return { review, reviewing };
}
