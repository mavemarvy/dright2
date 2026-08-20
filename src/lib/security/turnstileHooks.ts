import { useState, useCallback, useEffect } from 'react';
import { verifyTurnstileToken, renderTurnstileWidget, resetTurnstileWidget, loadTurnstileScript, getTurnstileSiteKey } from './turnstile';
import type { TurnstileAction, TurnstileResult } from './turnstile';

export function useTurnstile(action: TurnstileAction, containerId: string) {
  const [token, setToken] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTurnstileScript();
  }, []);

  const render = useCallback(() => {
    const siteKey = getTurnstileSiteKey();
    if (!siteKey) {
      setError('Turnstile site key not configured');
      return;
    }

    const checkAndRender = () => {
      if ((window as any).turnstile) {
        renderTurnstileWidget(containerId, action, (t: string) => {
          setToken(t);
          setVerified(false);
          setError(null);
        }, () => {
          setError('CAPTCHA widget error');
        });
      } else {
        setTimeout(checkAndRender, 200);
      }
    };
    checkAndRender();
  }, [action, containerId]);

  const verify = useCallback(async (userId?: string): Promise<TurnstileResult> => {
    if (!token) return { success: false, error: 'No CAPTCHA token. Please complete the challenge.' };
    setLoading(true);
    setError(null);
    const result = await verifyTurnstileToken(token, action, userId);
    if (!result.success) {
      setError(result.error || 'Verification failed');
      resetTurnstileWidget(containerId);
      setToken(null);
    } else {
      setVerified(true);
    }
    setLoading(false);
    return result;
  }, [token, action, containerId]);

  const reset = useCallback(() => {
    resetTurnstileWidget(containerId);
    setToken(null);
    setVerified(false);
    setError(null);
  }, [containerId]);

  return { token, verified, loading, error, render, verify, reset, setError };
}
