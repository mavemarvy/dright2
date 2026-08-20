import { supabase } from '../supabase';

export interface FCMTokenRecord {
  id: string;
  user_id: string;
  token: string;
  device_type: string;
  device_name: string | null;
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
}

export interface PushResult {
  success: boolean;
  sent?: number;
  failed?: number;
  error?: string;
}

export async function registerFCMToken(token: string, userId: string, deviceType = 'web', deviceName?: string): Promise<boolean> {
  const { error } = await supabase.functions.invoke('fcm-push', {
    body: { action: 'register-token', token, userId, deviceType, deviceName },
  });
  return !error;
}

export async function unregisterFCMToken(token: string): Promise<boolean> {
  const { error } = await supabase.functions.invoke('fcm-push', {
    body: { action: 'unregister-token', token },
  });
  return !error;
}

export async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  url?: string,
  data?: Record<string, unknown>
): Promise<PushResult> {
  const { data: result, error } = await supabase.functions.invoke('fcm-push', {
    body: { action: 'send', userId, title, body, url, data },
  });
  if (error) return { success: false, error: error.message };
  if (!result || result.success === false) return { success: false, error: result?.error || 'Unknown error' };
  return { success: true, sent: result.sent, failed: result.failed };
}

export async function sendBatchPushNotifications(
  userIds: string[],
  title: string,
  body: string,
  url?: string,
  data?: Record<string, unknown>
): Promise<PushResult> {
  const { data: result, error } = await supabase.functions.invoke('fcm-push', {
    body: { action: 'send-batch', userIds, title, body, url, data },
  });
  if (error) return { success: false, error: error.message };
  if (!result || result.success === false) return { success: false, error: result?.error || 'Unknown error' };
  return { success: true, sent: result.sent, failed: result.failed };
}

export async function getUserTokens(userId: string): Promise<FCMTokenRecord[]> {
  const { data, error } = await supabase
    .from('fcm_tokens')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true);
  if (error) return [];
  return data as FCMTokenRecord[];
}

export async function deactivateToken(token: string): Promise<boolean> {
  const { error } = await supabase
    .from('fcm_tokens')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('token', token);
  return !error;
}
