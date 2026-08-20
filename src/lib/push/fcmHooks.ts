import { useState, useCallback, useEffect } from 'react';
import { registerFCMToken, unregisterFCMToken, sendPushNotification, getUserTokens, type FCMTokenRecord, type PushResult } from './fcmService';

export function useFCMToken(userId: string | null) {
  const [token, setToken] = useState<string | null>(null);
  const [registered, setRegistered] = useState(false);
  const [loading, setLoading] = useState(false);

  const requestPermission = useCallback(async (): Promise<NotificationPermission> => {
    if (!('Notification' in window)) return 'denied';
    if (Notification.permission === 'granted') return 'granted';
    return await Notification.requestPermission();
  }, []);

  const register = useCallback(async (fcmToken: string) => {
    if (!userId || !fcmToken) return false;
    setLoading(true);
    const ok = await registerFCMToken(fcmToken, userId, 'web', navigator.userAgent);
    if (ok) {
      setToken(fcmToken);
      setRegistered(true);
    }
    setLoading(false);
    return ok;
  }, [userId]);

  const unregister = useCallback(async (fcmToken: string) => {
    const ok = await unregisterFCMToken(fcmToken);
    if (ok) {
      setToken(null);
      setRegistered(false);
    }
    return ok;
  }, []);

  return { token, registered, loading, requestPermission, register, unregister };
}

export function usePushNotification() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(async (userId: string, title: string, body: string, url?: string, data?: Record<string, unknown>): Promise<PushResult> => {
    setLoading(true);
    setError(null);
    try {
      const result = await sendPushNotification(userId, title, body, url, data);
      if (!result.success) setError(result.error || 'Push failed');
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return { success: false, error: String(err) };
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, send, setError };
}

export function useUserTokens(userId: string | null) {
  const [tokens, setTokens] = useState<FCMTokenRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const data = await getUserTokens(userId);
    setTokens(data);
    setLoading(false);
  }, [userId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { tokens, loading, refresh };
}
