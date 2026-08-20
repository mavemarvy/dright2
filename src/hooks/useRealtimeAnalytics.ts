// ─────────────────────────────────────────────────────────────────────────────
// DRIGHT Realtime Analytics Hook
// Uses Supabase Realtime for live updates with 30s fallback polling
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';

type Fetcher<T> = () => Promise<T | null>;

interface RealtimeState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  syncing: boolean;
  offline: boolean;
  refetch: () => void;
}

export function useRealtimeAnalytics<T>(
  fetcher: Fetcher<T>,
  options: {
    channel?: string;
    table?: string;
    intervalMs?: number;
    enabled?: boolean;
  } = {}
): RealtimeState<T> {
  const { channel = 'analytics_events', table = 'analytics_events', intervalMs = 30000, enabled = true } = options;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [offline, setOffline] = useState(!navigator.onLine);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const doFetch = useCallback(async (isSync = false) => {
    if (isSync) setSyncing(true);
    try {
      const result = await fetcherRef.current();
      if (result) {
        setData(result);
        setError(null);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load analytics';
      if (msg.includes('Unauthorized')) {
        setError('Permission Denied');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    if (!enabled) return;
    doFetch();
  }, [doFetch, enabled]);

  // Realtime subscription
  useEffect(() => {
    if (!enabled) return;

    const sub = supabase
      .channel(`realtime-${channel}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table }, () => {
        doFetch(true);
      })
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          setOffline(false);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setOffline(true);
        }
      });

    return () => {
      supabase.removeChannel(sub);
    };
  }, [channel, table, doFetch, enabled]);

  // Fallback polling (every 30s, or more frequently if offline)
  useEffect(() => {
    if (!enabled) return;
    const interval = setInterval(() => {
      doFetch(true);
    }, intervalMs);
    return () => clearInterval(interval);
  }, [intervalMs, doFetch, enabled]);

  // Online/offline detection
  useEffect(() => {
    const onOnline = () => { setOffline(false); doFetch(true); };
    const onOffline = () => setOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [doFetch]);

  return { data, loading, error, syncing, offline, refetch: () => doFetch(true) };
}
