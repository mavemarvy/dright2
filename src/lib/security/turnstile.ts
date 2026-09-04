export type TurnstileAction =
  | 'registration' | 'signup' | 'login' | 'signin' | 'password_reset'
  | 'forgot_password' | 'contact_form' | 'guest_checkout'
  | 'customer_support' | 'report_abuse' | 'product_creation'
  | 'service_creation' | 'course_creation' | 'job_posting'
  | 'wallet_funding' | 'withdrawals' | 'comments' | 'reviews'
  | 'ai_chat' | 'ai_image_generation' | 'ai_voice_transcription'
  | 'referral_abuse_prevention';

export interface TurnstileResult {
  success: boolean;
  action?: string;
  error?: string;
  remaining?: number;
}

export function getTurnstileSiteKey(): string | null {
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
  return typeof siteKey === 'string' && siteKey.trim() ? siteKey.trim() : null;
}

export async function verifyTurnstileToken(token: string, action: TurnstileAction, userId?: string): Promise<TurnstileResult> {
  try {
    const response = await fetch('/api/turnstile-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, action, userId }),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        success: false,
        error: data?.error || `Turnstile verification failed (${response.status})`,
        remaining: data?.remaining,
      };
    }

    if (!data || data.success === false) {
      return { success: false, error: data?.error || 'Verification failed', remaining: data?.remaining };
    }

    return { success: true, action: data.action };
  } catch (error) {
    console.error('Turnstile verification request failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unable to reach verification service',
    };
  }
}

export function renderTurnstileWidget(
  containerId: string,
  action: TurnstileAction,
  onVerified: (token: string) => void,
  onError?: (errorCode?: string) => void,
): void {
  const siteKey = getTurnstileSiteKey();
  if (!siteKey) {
    onError?.('site-key-missing');
    return;
  }

  const container = document.getElementById(containerId);
  const turnstile = (window as any).turnstile;
  if (!container || !turnstile?.render) {
    onError?.('turnstile-not-ready');
    return;
  }

  const previousWidgetId = (container as any)._turnstileWidgetId;
  if (previousWidgetId !== undefined && turnstile.remove) {
    try {
      turnstile.remove(previousWidgetId);
    } catch {
      // Ignore cleanup errors and recreate the widget.
    }
  }

  container.innerHTML = '';

  try {
    const widgetId = turnstile.render(container, {
      sitekey: siteKey,
      action,
      callback: onVerified,
      'error-callback': (code?: string) => onError?.(code),
      'expired-callback': () => onError?.('expired'),
      'timeout-callback': () => onError?.('timeout'),
      theme: 'auto',
    });

    (container as any)._turnstileWidgetId = widgetId;
  } catch (error) {
    console.error('Turnstile widget render failed:', error);
    onError?.('render-failed');
  }
}

export function resetTurnstileWidget(containerId: string): void {
  const container = document.getElementById(containerId);
  if (!container) return;
  const widgetId = (container as any)._turnstileWidgetId;
  const turnstile = (window as any).turnstile;
  if (widgetId !== undefined && turnstile) {
    try {
      turnstile.reset(widgetId);
    } catch (error) {
      console.warn('Turnstile reset failed:', error);
    }
  }
}

export function loadTurnstileScript(): void {
  if ((window as any).turnstile) return;
  if (document.getElementById('turnstile-script')) return;

  const script = document.createElement('script');
  script.id = 'turnstile-script';
  script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
}
