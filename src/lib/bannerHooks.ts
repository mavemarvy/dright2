import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabase';
import type {
  MarketplaceBanner,
  BannerInput,
  BannerLink,
  BannerAnalyticsSummary,
  AnalyticsEventType,
  DeviceType,
  DestinationType,
} from './bannerTypes';
import { detectDeviceType } from './bannerTypes';

function isWithinSchedule(banner: MarketplaceBanner): boolean {
  const now = new Date();
  const startVal = banner.starts_at || banner.start_date;
  const endVal = banner.ends_at || banner.end_date;
  if (startVal) {
    const start = new Date(startVal);
    if (now < start) return false;
  }
  if (endVal) {
    const end = new Date(endVal);
    if (now > end) return false;
  }
  return true;
}

export function useActiveBanners(userAudience: string[] = ['all']) {
  const [banners, setBanners] = useState<MarketplaceBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBanners = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('promotional_banners')
        .select('*')
        .eq('is_deleted', false)
        .eq('status', 'active')
        .order('priority', { ascending: false })
        .order('display_order', { ascending: true });

      if (error) throw error;
      if (!data) return;

      const typed = data as MarketplaceBanner[];
      const visible = typed.filter(b => {
        if (!isWithinSchedule(b)) return false;
        if (b.target_audience.includes('all' as never)) return true;
        return b.target_audience.some(a => userAudience.includes(a));
      });
      setBanners(visible);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load banners');
    } finally {
      setLoading(false);
    }
  }, [userAudience.join(',')]);

  useEffect(() => { fetchBanners(); }, [fetchBanners]);
  return { banners, loading, error, refetch: fetchBanners };
}

export function useAllBanners() {
  const [banners, setBanners] = useState<MarketplaceBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBanners = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('promotional_banners')
        .select('*')
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setBanners((data || []) as MarketplaceBanner[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load banners');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBanners(); }, [fetchBanners]);
  return { banners, loading, error, refetch: fetchBanners };
}

export function useBannerLinks(bannerId: string | null) {
  const [links, setLinks] = useState<BannerLink[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchLinks = useCallback(async () => {
    if (!bannerId) { setLinks([]); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('banner_links')
        .select('*')
        .eq('banner_id', bannerId);
      if (error) throw error;
      setLinks((data || []) as BannerLink[]);
    } catch {
      setLinks([]);
    } finally {
      setLoading(false);
    }
  }, [bannerId]);

  useEffect(() => { fetchLinks(); }, [fetchLinks]);
  return { links, loading, refetch: fetchLinks };
}

export async function createBanner(input: BannerInput, userId: string): Promise<MarketplaceBanner | null> {
  const { data, error } = await supabase
    .from('promotional_banners')
    .insert({
      ...input,
      created_by: userId,
      is_active: input.status === 'active',
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as MarketplaceBanner;
}

export async function updateBanner(id: string, input: Partial<BannerInput>): Promise<void> {
  const update: Record<string, unknown> = { ...input };
  if (input.status !== undefined) update.is_active = input.status === 'active';
  const { error } = await supabase.from('promotional_banners').update(update).eq('id', id);
  if (error) throw error;
}

export async function duplicateBanner(id: string): Promise<MarketplaceBanner | null> {
  const { data: original, error: fetchErr } = await supabase
    .from('promotional_banners')
    .select('*')
    .eq('id', id)
    .single();
  if (fetchErr) throw fetchErr;
  if (!original) return null;

  const { id: _id, created_at: _ca, updated_at: _ua, created_by: _cb, updated_by: _ub,
    is_deleted: _del, deleted_at: _da, ...rest } = original as MarketplaceBanner;

  const { data, error } = await supabase
    .from('promotional_banners')
    .insert({
      ...rest,
      title: `${original.title} (Copy)`,
      status: 'disabled',
      is_active: false,
      display_order: (original.display_order || 0) + 1,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as MarketplaceBanner;
}

export async function softDeleteBanner(id: string): Promise<void> {
  const { error } = await supabase
    .from('promotional_banners')
    .update({ is_deleted: true, deleted_at: new Date().toISOString(), status: 'archived', is_active: false })
    .eq('id', id);
  if (error) throw error;
}

export async function hardDeleteBanner(id: string): Promise<void> {
  const { error } = await supabase.from('promotional_banners').delete().eq('id', id);
  if (error) throw error;
}

export async function reorderBanners(orderedIds: string[]): Promise<void> {
  const updates = orderedIds.map((id, idx) =>
    supabase.from('promotional_banners').update({ display_order: idx }).eq('id', id)
  );
  await Promise.all(updates);
}

export async function upsertBannerLink(
  bannerId: string,
  link: { destination_type: DestinationType; destination_id?: string | null; external_url?: string | null },
  existingId?: string | null,
): Promise<BannerLink | null> {
  const payload = {
    banner_id: bannerId,
    destination_type: link.destination_type,
    destination_id: link.destination_id || null,
    external_url: link.external_url || null,
  };
  if (existingId) {
    const { data, error } = await supabase
      .from('banner_links').update(payload).eq('id', existingId).select('*').single();
    if (error) throw error;
    return data as BannerLink;
  }
  const { data, error } = await supabase
    .from('banner_links').insert(payload).select('*').single();
  if (error) throw error;
  return data as BannerLink;
}

export async function deleteBannerLink(linkId: string): Promise<void> {
  const { error } = await supabase.from('banner_links').delete().eq('id', linkId);
  if (error) throw error;
}

export function useTrackBannerEvent() {
  const trackedRef = useRef<Set<string>>(new Set());

  const track = useCallback(async (bannerId: string, eventType: AnalyticsEventType) => {
    const key = `${bannerId}:${eventType}`;
    if (eventType === 'impression' && trackedRef.current.has(key)) return;
    trackedRef.current.add(key);

    try {
      await supabase.from('banner_analytics').insert({
        banner_id: bannerId,
        event_type: eventType,
        device_type: detectDeviceType() as DeviceType,
      });
    } catch {
      // Silent fail — analytics should never break the UI
    }
  }, []);

  return track;
}

export function useBannerAnalytics(bannerId: string | null) {
  const [summary, setSummary] = useState<BannerAnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!bannerId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('banner_analytics')
        .select('event_type')
        .eq('banner_id', bannerId);
      if (error) throw error;
      const rows = (data || []) as { event_type: string }[];
      const impressions = rows.filter(r => r.event_type === 'impression').length;
      const clicks = rows.filter(r => r.event_type === 'click').length;
      const conversions = rows.filter(r => r.event_type === 'conversion').length;
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
      setSummary({ banner_id: bannerId, impressions, clicks, conversions, ctr });
    } catch {
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [bannerId]);

  useEffect(() => { fetch(); }, [fetch]);
  return { summary, loading, refetch: fetch };
}

export function useAllBannerAnalytics() {
  const [summaries, setSummaries] = useState<Record<string, BannerAnalyticsSummary>>({});
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('banner_analytics')
        .select('banner_id, event_type');
      if (error) throw error;
      const rows = (data || []) as { banner_id: string; event_type: string }[];
      const map: Record<string, BannerAnalyticsSummary> = {};
      for (const row of rows) {
        if (!map[row.banner_id]) {
          map[row.banner_id] = { banner_id: row.banner_id, impressions: 0, clicks: 0, conversions: 0, ctr: 0 };
        }
        if (row.event_type === 'impression') map[row.banner_id].impressions++;
        if (row.event_type === 'click') map[row.banner_id].clicks++;
        if (row.event_type === 'conversion') map[row.banner_id].conversions++;
      }
      for (const key of Object.keys(map)) {
        const s = map[key];
        s.ctr = s.impressions > 0 ? (s.clicks / s.impressions) * 100 : 0;
      }
      setSummaries(map);
    } catch {
      setSummaries({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);
  return { summaries, loading, refetch: fetch };
}
