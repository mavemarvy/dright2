import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabase';
import { logger, ErrorCategory } from './logger';

// ─── Device fingerprinting ────────────────────────────────────────────────────

export function getDeviceFingerprint(): string {
  const nav = navigator;
  const screen = window.screen;
  const components = [
    nav.userAgent,
    nav.language,
    nav.platform,
    screen.colorDepth,
    screen.pixelDepth,
    screen.width,
    screen.height,
    new Date().getTimezoneOffset(),
    nav.hardwareConcurrency || 0,
    (nav as unknown as { deviceMemory?: number }).deviceMemory || 0,
  ];
  const str = components.join('|');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

export function getBrowserName(): string {
  const ua = navigator.userAgent;
  if (ua.includes('Edg')) return 'Edge';
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari')) return 'Safari';
  if (ua.includes('OPR')) return 'Opera';
  return 'Unknown';
}

// ─── Auth activity logging ────────────────────────────────────────────────────

export function useAuthActivity() {
  const logActivity = useCallback(async (params: {
    eventType: string;
    success?: boolean;
    reason?: string;
    userId?: string;
    email?: string;
  }) => {
    const fingerprint = getDeviceFingerprint();
    const userAgent = navigator.userAgent;
    try {
      await supabase.rpc('log_auth_activity', {
        p_event_type: params.eventType,
        p_success: params.success ?? true,
        p_reason: params.reason ?? null,
        p_user_agent: userAgent,
        p_device_fingerprint: fingerprint,
      });
      logger.info(ErrorCategory.AUTH, `Activity logged: ${params.eventType}`, params);
    } catch (err) {
      logger.warn(ErrorCategory.AUTH, 'Failed to log auth activity', err);
    }
  }, []);

  return { logActivity };
}

// ─── Brute force protection ────────────────────────────────────────────────────

export function useBruteForceProtection() {
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<Date | null>(null);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);

  const checkLockout = useCallback(async (email: string): Promise<{ locked: boolean; remaining: number }> => {
    try {
      const { data, error } = await supabase
        .from('login_attempts')
        .select('attempt_count, locked_until')
        .eq('email', email)
        .maybeSingle();

      if (error || !data) return { locked: false, remaining: 0 };

      const lockedUntilDate = data.locked_until ? new Date(data.locked_until) : null;
      if (lockedUntilDate && lockedUntilDate > new Date()) {
        const remaining = Math.ceil((lockedUntilDate.getTime() - Date.now()) / 1000);
        setLockedUntil(lockedUntilDate);
        setLockoutRemaining(remaining);
        setLoginAttempts(data.attempt_count);
        return { locked: true, remaining };
      }

      setLoginAttempts(data.attempt_count);
      setLockedUntil(null);
      return { locked: false, remaining: 0 };
    } catch {
      return { locked: false, remaining: 0 };
    }
  }, []);

  const recordAttempt = useCallback(async (email: string, success: boolean): Promise<{ locked: boolean; remaining: number }> => {
    try {
      const { data, error } = await supabase.rpc('record_login_attempt', {
        p_email: email,
        p_success: success,
        p_user_agent: navigator.userAgent,
      });
      if (error) throw error;
      const result = data as { locked: boolean; attempt_count: number; locked_until: string | null };
      setLoginAttempts(result.attempt_count);
      if (result.locked && result.locked_until) {
        const lockDate = new Date(result.locked_until);
        setLockedUntil(lockDate);
        setLockoutRemaining(Math.ceil((lockDate.getTime() - Date.now()) / 1000));
        return { locked: true, remaining: Math.ceil((lockDate.getTime() - Date.now()) / 1000) };
      }
      return { locked: false, remaining: 0 };
    } catch (err) {
      logger.error(ErrorCategory.AUTH, 'Failed to record login attempt', err);
      return { locked: false, remaining: 0 };
    }
  }, []);

  // Countdown timer for lockout
  useEffect(() => {
    if (lockoutRemaining <= 0) return;
    const timer = setInterval(() => {
      setLockoutRemaining(prev => {
        if (prev <= 1) {
          setLockedUntil(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [lockoutRemaining]);

  return { loginAttempts, lockedUntil, lockoutRemaining, checkLockout, recordAttempt };
}

// ─── Login history ─────────────────────────────────────────────────────────────

export interface AuthActivityEntry {
  id: string;
  event_type: string;
  success: boolean;
  reason: string | null;
  user_agent: string | null;
  country: string | null;
  created_at: string;
}

export function useLoginHistory(userId: string | undefined, limit = 20) {
  const [history, setHistory] = useState<AuthActivityEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('get_auth_activity', {
        p_limit: limit,
        p_offset: 0,
      });
      if (rpcError) throw rpcError;
      setHistory((data || []) as AuthActivityEntry[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load login history');
      logger.error(ErrorCategory.AUTH, 'Failed to fetch login history', err);
    } finally {
      setLoading(false);
    }
  }, [userId, limit]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return { history, loading, error, refetch: fetchHistory };
}

// ─── Suspicious login detection ────────────────────────────────────────────────

export function useSuspiciousLoginDetection() {
  const checkSuspicious = useCallback(async (userId: string): Promise<{ suspicious: boolean; reason?: string }> => {
    const currentFingerprint = getDeviceFingerprint();
    try {
      // Check if this device has been seen before
      const { data, error } = await supabase
        .from('auth_activity')
        .select('device_fingerprint, created_at')
        .eq('user_id', userId)
        .eq('event_type', 'login')
        .eq('success', true)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error || !data || data.length === 0) {
        // First login — not suspicious, just new
        return { suspicious: false };
      }

      const knownDevices = new Set(data.map((d: { device_fingerprint: string }) => d.device_fingerprint));
      if (!knownDevices.has(currentFingerprint)) {
        return { suspicious: true, reason: 'New device detected' };
      }

      // Check for impossible travel (last login in different timezone within short window)
      const lastLogin = data[0] as { created_at: string };
      const lastLoginTime = new Date(lastLogin.created_at).getTime();
      const hoursSinceLastLogin = (Date.now() - lastLoginTime) / (1000 * 60 * 60);
      if (hoursSinceLastLogin < 1) {
        // Very rapid successive login from different device
        if (!knownDevices.has(currentFingerprint)) {
          return { suspicious: true, reason: 'Rapid login from new device' };
        }
      }

      return { suspicious: false };
    } catch {
      return { suspicious: false };
    }
  }, []);

  return { checkSuspicious };
}

// ─── Password strength ─────────────────────────────────────────────────────────

export interface PasswordStrength {
  score: number; // 0-4
  label: string;
  color: string;
  feedback: string[];
}

export function evaluatePasswordStrength(password: string): PasswordStrength {
  const feedback: string[] = [];
  let score = 0;

  if (password.length >= 8) score++;
  else feedback.push('Use at least 8 characters');

  if (password.length >= 12) score++;
  else if (password.length >= 8) feedback.push('Consider 12+ characters for stronger security');

  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  else feedback.push('Mix uppercase and lowercase letters');

  if (/\d/.test(password)) score++;
  else feedback.push('Add numbers');

  if (/[^a-zA-Z0-9]/.test(password)) score++;
  else feedback.push('Add special characters (!@#$...)');

  if (score > 4) score = 4;

  const labels = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong'];
  const colors = ['bg-red-500', 'bg-red-400', 'bg-amber-400', 'bg-blue-500', 'bg-emerald-500'];

  return {
    score,
    label: labels[score],
    color: colors[score],
    feedback: feedback.slice(0, 3),
  };
}

// ─── Session management ────────────────────────────────────────────────────────

export function useSessionManager() {
  const [sessionExpired, setSessionExpired] = useState(false);
  const lastRefreshRef = useRef<number>(Date.now());

  useEffect(() => {
    // Listen for storage events (multi-tab sync)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'sb-access-token' || e.key === 'sb-refresh-token') {
        // Another tab changed auth state — refresh our session
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (!session) {
            setSessionExpired(true);
          }
        });
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Periodic session check
  useEffect(() => {
    const interval = setInterval(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setSessionExpired(true);
      } else {
        // Check if token is close to expiry
        const expiresAt = session.expires_at || 0;
        const now = Math.floor(Date.now() / 1000);
        if (expiresAt - now < 300) {
          // Less than 5 minutes — try refresh
          const { data: { session: refreshed }, error } = await supabase.auth.refreshSession();
          if (error || !refreshed) {
            setSessionExpired(true);
            logger.warn(ErrorCategory.AUTH, 'Session refresh failed', error);
          } else {
            lastRefreshRef.current = Date.now();
            logger.info(ErrorCategory.AUTH, 'Session refreshed successfully');
          }
        }
      }
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, []);

  const clearSessionExpired = useCallback(() => setSessionExpired(false), []);

  return { sessionExpired, clearSessionExpired };
}

// ─── Redirect after login ──────────────────────────────────────────────────────

const REDIRECT_KEY = 'dright_redirect_after_login';

export function saveRedirectPath(path: string): void {
  sessionStorage.setItem(REDIRECT_KEY, path);
}

export function getRedirectPath(): string | null {
  return sessionStorage.getItem(REDIRECT_KEY);
}

export function clearRedirectPath(): void {
  sessionStorage.removeItem(REDIRECT_KEY);
}
