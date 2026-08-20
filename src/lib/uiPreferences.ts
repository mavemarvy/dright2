// ─────────────────────────────────────────────────────────────────────────────
// DRIGHT UI Preferences — user-controlled visibility of floating UI elements.
// Persisted to localStorage. Shared across the app via a lightweight hook.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react';

export interface UIPreferences {
  showFloatingChat: boolean;
  showNotificationSettingsIcon: boolean;
  showNotificationButton: boolean;
  aiRecommendationsEnabled: boolean;
  aiAssistantEnabled: boolean;
}

const STORAGE_KEY = 'dright:ui-preferences';

export const DEFAULT_UI_PREFERENCES: UIPreferences = {
  showFloatingChat: false,
  showNotificationSettingsIcon: false,
  showNotificationButton: true,
  aiRecommendationsEnabled: true,
  aiAssistantEnabled: true,
};

function readPrefs(): UIPreferences {
  if (typeof window === 'undefined') return DEFAULT_UI_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_UI_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<UIPreferences>;
    return {
      showFloatingChat: parsed.showFloatingChat ?? DEFAULT_UI_PREFERENCES.showFloatingChat,
      showNotificationSettingsIcon: parsed.showNotificationSettingsIcon ?? DEFAULT_UI_PREFERENCES.showNotificationSettingsIcon,
      showNotificationButton: parsed.showNotificationButton ?? DEFAULT_UI_PREFERENCES.showNotificationButton,
      aiRecommendationsEnabled: parsed.aiRecommendationsEnabled ?? DEFAULT_UI_PREFERENCES.aiRecommendationsEnabled,
      aiAssistantEnabled: parsed.aiAssistantEnabled ?? DEFAULT_UI_PREFERENCES.aiAssistantEnabled,
    };
  } catch {
    return DEFAULT_UI_PREFERENCES;
  }
}

const listeners = new Set<(prefs: UIPreferences) => void>();

export function useUIPreferences() {
  const [prefs, setPrefs] = useState<UIPreferences>(readPrefs);

  useEffect(() => {
    const handler = (next: UIPreferences) => setPrefs(next);
    listeners.add(handler);
    // Sync across tabs
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setPrefs(readPrefs());
    };
    window.addEventListener('storage', onStorage);
    return () => {
      listeners.delete(handler);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const update = useCallback((patch: Partial<UIPreferences>) => {
    setPrefs(prev => {
      const next = { ...prev, ...patch };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore quota errors
      }
      listeners.forEach(cb => cb(next));
      return next;
    });
  }, []);

  return { prefs, update };
}
