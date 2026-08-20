import { supabase } from '../supabase';

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
  return import.meta.env.VITE_TURNSTILE_SITE_KEY || null;
}

export async function verifyTurnstileToken(token: string, action: TurnstileAction, userId?: string): Promise<TurnstileResult> {
  const { data, error } = await supabase.functions.invoke('turnstile-verify', {
    body: { token, action, userId },
  });

  if (error) return { success: false, error: error.message };
  if (!data || data.success === false) return { success: false, error: data?.error || 'Verification failed', remaining: data?.remaining };
  return { success: true, action: data.action };
}

export function renderTurnstileWidget(containerId: string, action: TurnstileAction, onVerified: (token: string) => void, onError?: () => void): void {
  const siteKey = getTurnstileSiteKey();
  if (!siteKey) {
    onError?.();
    return;
  }

  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '';

  const widgetId = (window as any).turnstile?.render(container, {
    sitekey: siteKey,
    action,
    callback: onVerified,
    'error-callback': onError,
    theme: 'auto',
  });

  container.setAttribute('data-action', 'turnstile-spin-v2');
  (container as any)._turnstileWidgetId = widgetId;
}

export function resetTurnstileWidget(containerId: string): void {
  const container = document.getElementById(containerId);
  if (!container) return;
  const widgetId = (container as any)._turnstileWidgetId;
  if (widgetId !== undefined && (window as any).turnstile) {
    (window as any).turnstile.reset(widgetId);
  }
}

export function loadTurnstileScript(): void {
  if (document.getElementById('turnstile-script')) return;
  const script = document.createElement('script');
  script.id = 'turnstile-script';
  script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  script.async = true;
  document.head.appendChild(script);
}
