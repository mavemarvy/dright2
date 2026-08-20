// ─────────────────────────────────────────────────────────────────────────────
// DRIGHT Notification Preferences & Muting
// User-controlled notification settings: quiet hours, category toggles,
// delivery channels, smart muting, and accessibility options.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';
import type { NotificationCategory } from './types';

export type DeliveryChannel = 'in_app' | 'email' | 'push' | 'sms';
export type ReminderFrequency = 'immediate' | 'hourly' | 'daily' | 'weekly';
export type SummaryFrequency = 'daily' | 'weekly' | 'monthly';
export type MuteType = 'conversation' | 'product' | 'store' | 'service' | 'job' | 'category' | 'promotion';
export type MuteDuration = '1h' | '8h' | '24h' | '7d' | '30d' | 'indefinite';

export interface NotificationPreferences {
  quiet_hours_start: string | null; // "22:00"
  quiet_hours_end: string | null;   // "07:00"
  quiet_hours_critical_bypass: boolean;
  category_toggles: Record<string, boolean>;
  delivery_channels: Record<DeliveryChannel, boolean>;
  reminder_frequency: ReminderFrequency;
  ai_summaries_enabled: boolean;
  ai_summary_frequency: SummaryFrequency;
  reduced_motion: boolean;
  high_contrast: boolean;
}

export interface NotificationMute {
  id: string;
  mute_type: MuteType;
  target_id: string | null;
  target_label: string | null;
  muted_until: string | null;
  created_at: string;
}

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  quiet_hours_start: null,
  quiet_hours_end: null,
  quiet_hours_critical_bypass: true,
  category_toggles: {},
  delivery_channels: { in_app: true, email: false, push: false, sms: false },
  reminder_frequency: 'daily',
  ai_summaries_enabled: true,
  ai_summary_frequency: 'daily',
  reduced_motion: false,
  high_contrast: false,
};

export const ALL_CATEGORIES: { key: NotificationCategory; label: string }[] = [
  { key: 'marketplace', label: 'Marketplace' },
  { key: 'messages', label: 'Messages' },
  { key: 'wallet', label: 'Wallet' },
  { key: 'services', label: 'Services' },
  { key: 'jobs', label: 'Jobs' },
  { key: 'affiliate', label: 'Affiliate' },
  { key: 'referrals', label: 'Referrals' },
  { key: 'store', label: 'Store' },
  { key: 'reviews', label: 'Reviews' },
  { key: 'followers', label: 'Followers' },
  { key: 'orders', label: 'Orders' },
  { key: 'security', label: 'Security' },
  { key: 'system', label: 'System' },
  { key: 'promotions', label: 'Promotions' },
  { key: 'admin', label: 'Admin' },
  { key: 'ai', label: 'AI' },
];

const MUTE_DURATIONS: Record<MuteDuration, number | null> = {
  '1h': 3600_000,
  '8h': 28800_000,
  '24h': 86400_000,
  '7d': 604800_000,
  '30d': 2592000_000,
  'indefinite': null,
};

// ─── Preferences Hook ──────────────────────────────────────────────────────────

export function useNotificationPreferences(userId: string | null) {
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetch = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    try {
      const { data, error } = await supabase
        .from('notification_user_settings')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        setPrefs({
          quiet_hours_start: data.quiet_hours_start,
          quiet_hours_end: data.quiet_hours_end,
          quiet_hours_critical_bypass: data.quiet_hours_critical_bypass,
          category_toggles: data.category_toggles || {},
          delivery_channels: data.delivery_channels || DEFAULT_PREFERENCES.delivery_channels,
          reminder_frequency: data.reminder_frequency || 'daily',
          ai_summaries_enabled: data.ai_summaries_enabled ?? true,
          ai_summary_frequency: data.ai_summary_frequency || 'daily',
          reduced_motion: data.reduced_motion ?? false,
          high_contrast: data.high_contrast ?? false,
        });
      }
    } catch (err) {
      console.error('useNotificationPreferences fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetch(); }, [fetch]);

  const update = useCallback(async (patch: Partial<NotificationPreferences>) => {
    if (!userId) return;
    setSaving(true);
    const merged = { ...prefs, ...patch };
    setPrefs(merged);
    try {
      const { error } = await supabase
        .from('notification_user_settings')
        .upsert({
          user_id: userId,
          quiet_hours_start: merged.quiet_hours_start,
          quiet_hours_end: merged.quiet_hours_end,
          quiet_hours_critical_bypass: merged.quiet_hours_critical_bypass,
          category_toggles: merged.category_toggles,
          delivery_channels: merged.delivery_channels,
          reminder_frequency: merged.reminder_frequency,
          ai_summaries_enabled: merged.ai_summaries_enabled,
          ai_summary_frequency: merged.ai_summary_frequency,
          reduced_motion: merged.reduced_motion,
          high_contrast: merged.high_contrast,
          updated_at: new Date().toISOString(),
        });
      if (error) throw error;
    } catch (err) {
      console.error('useNotificationPreferences update error:', err);
      setPrefs(prefs);
    } finally {
      setSaving(false);
    }
  }, [userId, prefs]);

  const toggleCategory = useCallback((category: string, enabled: boolean) => {
    update({ category_toggles: { ...prefs.category_toggles, [category]: enabled } });
  }, [prefs, update]);

  const setDeliveryChannel = useCallback((channel: DeliveryChannel, enabled: boolean) => {
    update({ delivery_channels: { ...prefs.delivery_channels, [channel]: enabled } });
  }, [prefs, update]);

  return { prefs, loading, saving, update, toggleCategory, setDeliveryChannel, refetch: fetch };
}

// ─── Quiet Hours Logic ──────────────────────────────────────────────────────────

export function isInQuietHours(prefs: NotificationPreferences, now = new Date()): boolean {
  if (!prefs.quiet_hours_start || !prefs.quiet_hours_end) return false;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const [startH, startM] = prefs.quiet_hours_start.split(':').map(Number);
  const [endH, endM] = prefs.quiet_hours_end.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }
  // Overnight (e.g. 22:00 → 07:00)
  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

export function shouldDeliverDuringQuietHours(
  prefs: NotificationPreferences,
  priority: string,
): boolean {
  if (!isInQuietHours(prefs)) return true;
  if (priority === 'critical' && prefs.quiet_hours_critical_bypass) return true;
  return false;
}

// ─── Muting Hook ───────────────────────────────────────────────────────────────

export function useNotificationMutes(userId: string | null) {
  const [mutes, setMutes] = useState<NotificationMute[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    try {
      const { data, error } = await supabase
        .from('notification_mutes')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      // Filter out expired mutes
      const now = new Date().toISOString();
      const active = (data || []).filter((m: NotificationMute) => !m.muted_until || m.muted_until > now);
      setMutes(active);
    } catch (err) {
      console.error('useNotificationMutes fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetch(); }, [fetch]);

  const mute = useCallback(async (
    type: MuteType,
    targetId: string | null,
    targetLabel: string | null,
    duration: MuteDuration,
  ) => {
    if (!userId) return;
    const ms = MUTE_DURATIONS[duration];
    const mutedUntil = ms ? new Date(Date.now() + ms).toISOString() : null;
    try {
      await supabase.from('notification_mutes').upsert({
        user_id: userId,
        mute_type: type,
        target_id: targetId,
        target_label: targetLabel,
        muted_until: mutedUntil,
        created_at: new Date().toISOString(),
      });
      fetch();
    } catch (err) {
      console.error('mute error:', err);
    }
  }, [userId, fetch]);

  const unmute = useCallback(async (muteId: string) => {
    if (!userId) return;
    try {
      await supabase.from('notification_mutes').delete().eq('id', muteId);
      fetch();
    } catch (err) {
      console.error('unmute error:', err);
    }
  }, [userId, fetch]);

  const isMuted = useCallback((type: MuteType, targetId: string | null): boolean => {
    return mutes.some(m => m.mute_type === type && (m.target_id === targetId || (!m.target_id && !targetId)));
  }, [mutes]);

  return { mutes, loading, mute, unmute, isMuted, refetch: fetch };
}

// ─── Category Toggle Check ──────────────────────────────────────────────────────

export function isCategoryEnabled(prefs: NotificationPreferences, category: string): boolean {
  // Default to enabled if not explicitly set
  return prefs.category_toggles[category] !== false;
}
