import { supabase } from './supabase';

export interface FraudCheckResult {
  riskScore: number;
  flags: string[];
  shouldBlock: boolean;
}

export interface DeviceInfo {
  ip: string;
  country?: string;
  deviceFingerprint?: string;
  browser?: string;
}

export async function getDeviceInfo(): Promise<DeviceInfo> {
  const ua = navigator.userAgent;
  const browser = ua.includes('Firefox') ? 'Firefox' : ua.includes('Chrome') ? 'Chrome' : ua.includes('Safari') ? 'Safari' : 'Unknown';
  const fingerprint = btoa(ua + navigator.language + screen.width + screen.height).slice(0, 32);
  return { ip: '', deviceFingerprint: fingerprint, browser };
}

export async function runFraudChecks(userId: string, action: string, amount: number = 0): Promise<FraudCheckResult> {
  const device = await getDeviceInfo();
  const flags: string[] = [];
  let riskScore = 0;

  // 1. Velocity check — 20+ actions in 1 hour
  const { data: velData } = await supabase.rpc('check_velocity', { p_user_id: userId, p_action: action, p_window_minutes: 60 });
  const velocityCount = (velData as any)?.count || 0;
  if (velocityCount >= 20) { flags.push('high_velocity'); riskScore += 30; }
  else if (velocityCount >= 10) { flags.push('moderate_velocity'); riskScore += 15; }

  // 2. Recent failed PIN attempts
  const { data: failData } = await supabase
    .from('payment_pin_attempts')
    .select('id')
    .eq('user_id', userId)
    .eq('success', false)
    .gt('created_at', new Date(Date.now() - 3600000).toISOString());
  const failCount = failData?.length || 0;
  if (failCount >= 5) { flags.push('rapid_pin_failures'); riskScore += 25; }
  else if (failCount >= 3) { flags.push('multiple_pin_failures'); riskScore += 10; }

  // 3. Large withdrawal
  if (action === 'withdrawal' && amount >= 100000) { flags.push('large_withdrawal'); riskScore += 20; }
  else if (action === 'withdrawal' && amount >= 500000) { flags.push('very_large_withdrawal'); riskScore += 40; }

  // 4. Check existing risk score
  const { data: existingScore } = await supabase.rpc('get_user_risk_score', { p_user_id: userId });
  const currentScore = (existingScore as any)?.risk_score || 0;
  riskScore = Math.min(riskScore + Math.floor(currentScore / 4), 100);

  // 5. Duplicate transaction check (same amount + same action within 5 min)
  const { data: recentTxns } = await supabase
    .from('cc_transactions')
    .select('id, amount')
    .eq('user_id', userId)
    .eq('type', 'debit')
    .gt('created_at', new Date(Date.now() - 300000).toISOString());
  const dupCount = recentTxns?.filter((t: any) => Number(t.amount) === amount).length || 0;
  if (dupCount >= 3) { flags.push('duplicate_transactions'); riskScore += 20; }

  const shouldBlock = riskScore >= 70;

  // Record if any flags
  if (flags.length > 0) {
    const severity = riskScore >= 70 ? 'critical' : riskScore >= 40 ? 'high' : riskScore >= 20 ? 'medium' : 'low';
    await supabase.rpc('record_fraud_event', {
      p_user_id: userId, p_alert_type: flags[0], p_severity: severity,
      p_description: `Flags: ${flags.join(', ')}. Score: ${riskScore}`,
      p_metadata: { flags, amount, action },
      p_ip_address: device.ip, p_country: device.country,
      p_device_fingerprint: device.deviceFingerprint, p_browser: device.browser,
      p_action_type: action, p_risk_delta: Math.min(riskScore, 30),
    });
  }

  return { riskScore, flags, shouldBlock };
}

export async function getUserRiskScore(userId: string): Promise<number> {
  const { data, error } = await supabase.rpc('get_user_risk_score', { p_user_id: userId });
  if (error) return 0;
  return (data as any)?.risk_score || 0;
}

export async function getFraudEvents(userId: string, limit = 20): Promise<any[]> {
  const { data, error } = await supabase.rpc('get_fraud_events', { p_user_id: userId, p_limit: limit });
  if (error) return [];
  return (data as any[]) || [];
}

export function getRiskLevel(score: number): { label: string; color: string } {
  if (score >= 70) return { label: 'Critical', color: 'text-red-600 bg-red-50' };
  if (score >= 40) return { label: 'High', color: 'text-orange-600 bg-orange-50' };
  if (score >= 20) return { label: 'Medium', color: 'text-amber-600 bg-amber-50' };
  return { label: 'Low', color: 'text-emerald-600 bg-emerald-50' };
}

export function exportSecurityLogsCSV(logs: any[]): string {
  const headers = ['Date', 'User ID', 'Event Type', 'Description', 'IP', 'Performed By'];
  const rows = logs.map(l => [
    new Date(l.created_at).toISOString(),
    l.user_id, l.event_type, (l.description || '').replace(/,/g, ';'),
    l.ip_address || '', l.performed_by || '',
  ]);
  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}
