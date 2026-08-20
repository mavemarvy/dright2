import { supabase } from './supabase';

export interface PaymentSecurityStatus {
  has_pin: boolean; pin_length?: number; is_locked?: boolean;
  failed_attempts?: number; locked_until?: string | null;
  last_pin_change?: string; auth_rules?: AuthRules; recovery_email?: string;
}

export interface AuthRules {
  require_pin_threshold: number;
  always_require_pin: boolean;
  require_pin_withdrawals: boolean;
  require_pin_new_device: boolean;
  require_pin_after_minutes: number;
  require_pin_payout_change: boolean;
}

const COMMON_PINS = ['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '1234', '4321', '1212', '1004', '2000', '1122'];

export async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin + 'dright_salt_2024');
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function validatePin(pin: string): { valid: boolean; error?: string } {
  if (!/^\d{4,8}$/.test(pin)) return { valid: false, error: 'PIN must be 4-8 digits' };
  if (COMMON_PINS.includes(pin)) return { valid: false, error: 'PIN is too common. Choose a stronger PIN' };
  if (/^(\d)\1+$/.test(pin)) return { valid: false, error: 'PIN cannot be all same digits' };
  return { valid: true };
}

export async function getSecurityStatus(userId: string): Promise<PaymentSecurityStatus> {
  const { data, error } = await supabase.rpc('get_payment_security_status', { p_user_id: userId });
  if (error) { console.error('Failed to get security status:', error); return { has_pin: false }; }
  return data as PaymentSecurityStatus;
}

export async function setPin(userId: string, pin: string): Promise<{ success: boolean; error?: string }> {
  const validation = validatePin(pin);
  if (!validation.valid) return { success: false, error: validation.error };
  const pinHash = await hashPin(pin);
  const { error } = await supabase.rpc('set_payment_pin', { p_user_id: userId, p_pin_hash: pinHash, p_pin_length: pin.length });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function changePin(userId: string, currentPin: string, newPin: string): Promise<{ success: boolean; error?: string }> {
  const currentHash = await hashPin(currentPin);
  const verifyResult = await verifyPin(userId, currentHash, 'pin_change');
  if (!verifyResult.success) return verifyResult;
  return setPin(userId, newPin);
}

export async function verifyPin(userId: string, pin: string, context = 'transaction'): Promise<{ success: boolean; error?: string; attempts_remaining?: number; locked_until?: string }> {
  const pinHash = await hashPin(pin);
  const { data, error } = await supabase.rpc('verify_payment_pin', { p_user_id: userId, p_pin_hash: pinHash, p_context: context });
  if (error) return { success: false, error: error.message };
  return data as any;
}

export async function verifyPinHash(userId: string, pinHash: string, context = 'transaction'): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('verify_payment_pin', { p_user_id: userId, p_pin_hash: pinHash, p_context: context });
  if (error) return { success: false, error: error.message };
  return data as any;
}

export async function requestPinReset(userId: string): Promise<{ success: boolean; token?: string; error?: string }> {
  const { data, error } = await supabase.rpc('create_pin_recovery_token', { p_user_id: userId });
  if (error) return { success: false, error: error.message };
  return { success: true, token: data as string };
}

export async function verifyRecoveryToken(token: string): Promise<{ success: boolean; userId?: string; error?: string }> {
  const { data, error } = await supabase.rpc('verify_pin_recovery_token', { p_token: token });
  if (error) return { success: false, error: error.message };
  const result = data as any;
  return { success: result.success, userId: result.user_id, error: result.error };
}

export async function resetPinWithToken(userId: string, newPin: string): Promise<{ success: boolean; error?: string }> {
  const validation = validatePin(newPin);
  if (!validation.valid) return { success: false, error: validation.error };
  const pinHash = await hashPin(newPin);
  const { error } = await supabase.rpc('reset_payment_pin', { p_user_id: userId, p_new_pin_hash: pinHash, p_pin_length: newPin.length });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function updateAuthRules(userId: string, rules: AuthRules): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.rpc('update_payment_auth_rules', { p_user_id: userId, p_rules: rules });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export function shouldRequirePin(rules: AuthRules, amount: number, context: 'withdrawal' | 'purchase' | 'general'): boolean {
  if (rules.always_require_pin) return true;
  if (context === 'withdrawal' && rules.require_pin_withdrawals) return true;
  if (rules.require_pin_threshold > 0 && amount >= rules.require_pin_threshold) return true;
  return false;
}

// Payout accounts
export interface PayoutAccount {
  id: string; account_type: string; nickname: string | null;
  account_details: Record<string, any>; is_default: boolean; is_verified: boolean;
  created_at: string;
}

export async function getPayoutAccounts(userId: string): Promise<PayoutAccount[]> {
  const { data, error } = await supabase.from('payout_accounts').select('*').eq('user_id', userId).order('created_at', { ascending: false });
  if (error) { console.error('Failed to get payout accounts:', error); return []; }
  return (data as PayoutAccount[]) || [];
}

export async function addPayoutAccount(userId: string, account: {
  account_type: string; nickname?: string; account_details: Record<string, any>; is_default?: boolean;
}): Promise<{ success: boolean; error?: string }> {
  if (account.is_default) {
    await supabase.from('payout_accounts').update({ is_default: false }).eq('user_id', userId);
  }
  const { error } = await supabase.from('payout_accounts').insert({
    user_id: userId, account_type: account.account_type, nickname: account.nickname,
    account_details: account.account_details, is_default: account.is_default || false,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function deletePayoutAccount(userId: string, accountId: string): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.from('payout_accounts').delete().eq('id', accountId).eq('user_id', userId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function setDefaultPayoutAccount(userId: string, accountId: string): Promise<void> {
  await supabase.from('payout_accounts').update({ is_default: false }).eq('user_id', userId).neq('id', accountId);
  await supabase.from('payout_accounts').update({ is_default: true }).eq('id', accountId).eq('user_id', userId);
}
