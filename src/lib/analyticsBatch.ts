import { supabase } from './supabase';
import { getAnalyticsSessionId, type TrackEventInput } from './analyticsService';

interface BufferedAnalyticsEvent extends TrackEventInput {
  queued_at?: number;
}

const MAX_BATCH = 15;
const FLUSH_MS = 5000;
let queue: BufferedAnalyticsEvent[] = [];
let timer: number | null = null;
let flushing = false;

function deviceType() {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent;
  if (/tablet|ipad/i.test(ua)) return 'tablet';
  if (/mobile|iphone|ipod|android/i.test(ua)) return 'mobile';
  return 'desktop';
}

function scheduleFlush() {
  if (typeof window === 'undefined' || timer !== null) return;
  timer = window.setTimeout(() => {
    timer = null;
    void flushAnalyticsBatch();
  }, FLUSH_MS);
}

export function queueAnalyticsEvent(input: TrackEventInput) {
  queue.push({ ...input, queued_at: Date.now() });
  if (queue.length >= MAX_BATCH) void flushAnalyticsBatch();
  else scheduleFlush();
}

export async function flushAnalyticsBatch() {
  if (flushing || queue.length === 0) return;
  flushing = true;
  if (timer !== null && typeof window !== 'undefined') {
    window.clearTimeout(timer);
    timer = null;
  }
  const batch = queue.splice(0, MAX_BATCH);
  try {
    const session = getAnalyticsSessionId();
    const events = batch.map(input => ({
      event_type: input.event_type,
      entity_type: input.entity_type || 'platform',
      entity_id: input.entity_id || null,
      seller_id: input.seller_id || null,
      session_id: session,
      source: input.source || 'direct',
      metadata: {
        ...(input.metadata || {}),
        page_path: typeof window !== 'undefined' ? window.location.pathname : undefined,
        client_queued_at: input.queued_at,
      },
      device_type: deviceType(),
      language: typeof navigator !== 'undefined' ? navigator.language || null : null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
    }));
    const { error, data } = await supabase.functions.invoke('track-event', { body: { events } });
    if (error || data?.success === false) throw error || new Error(data?.error?.message || 'Analytics batch failed');
  } catch (error) {
    // Preserve a bounded retry buffer; observational analytics must never block the UI.
    queue = [...batch, ...queue].slice(0, MAX_BATCH * 4);
    if (import.meta.env.DEV) console.warn('[analytics] batch flush failed', error);
  } finally {
    flushing = false;
    if (queue.length) scheduleFlush();
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushAnalyticsBatch();
  });
}
