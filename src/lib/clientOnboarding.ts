import { supabase } from './supabase';

export interface DrightClientOnboardingState {
  required: boolean;
  must_change_password?: boolean;
  password_changed_at?: string | null;
  must_complete_kyc?: boolean;
  kyc_submitted?: boolean;
  kyc_status?: string;
  kyc_submission_status?: string | null;
  kyc_document_count?: number;
  starter_purchase_id?: string;
  created_at?: string;
}

export interface AdminClientAccountResult {
  success: boolean;
  account_created?: boolean;
  credentials_reset?: boolean;
  email_sent?: boolean;
  email_error?: string | null;
  user_id?: string;
  purchase_reference?: string;
  trial_days?: number;
  trial_ends_at?: string | null;
}

async function edgeErrorMessage(error: unknown, fallback: string): Promise<string> {
  const candidate = error as { message?: string; context?: Response };
  if (candidate?.context instanceof Response) {
    try {
      const payload = await candidate.context.clone().json() as { error?: string };
      if (payload?.error) return payload.error;
    } catch {
      // Ignore malformed error body and fall through to the SDK message.
    }
  }
  return candidate?.message || fallback;
}

export async function getMyDrightClientOnboarding(): Promise<DrightClientOnboardingState> {
  const { data, error } = await supabase.rpc('get_my_dright_client_onboarding');
  if (error) throw error;
  return (data ?? { required: false }) as DrightClientOnboardingState;
}

export async function createDrightStarterClientAccount(input: {
  fullName: string;
  email: string;
  temporaryPassword: string;
}): Promise<AdminClientAccountResult> {
  const { data, error } = await supabase.functions.invoke('admin-client-onboarding', {
    body: {
      action: 'create_account',
      full_name: input.fullName.trim(),
      email: input.email.trim().toLowerCase(),
      temporary_password: input.temporaryPassword,
    },
  });

  if (error) throw new Error(await edgeErrorMessage(error, 'Unable to create the client account.'));
  const result = (data ?? {}) as AdminClientAccountResult & { error?: string };
  if (!result.success) throw new Error(result.error || 'Unable to create the client account.');
  return result;
}

export async function changeDrightClientTemporaryPassword(newPassword: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('admin-client-onboarding', {
    body: { action: 'change_password', new_password: newPassword },
  });
  if (error) throw new Error(await edgeErrorMessage(error, 'Unable to change your password.'));
  const result = (data ?? {}) as { success?: boolean; error?: string };
  if (!result.success) throw new Error(result.error || 'Unable to change your password.');
}


export interface AssistedStarterPurchase {
  reference: string;
  full_name: string;
  email: string;
  claimed: boolean;
  included_trial_days: number;
}

export async function getAssistedStarterPurchase(reference: string): Promise<AssistedStarterPurchase> {
  const { data, error } = await supabase.functions.invoke('starter-assisted-signup', {
    body: { action: 'get_purchase', reference: reference.trim() },
  });
  if (error) throw new Error(await edgeErrorMessage(error, 'Unable to load the assisted Starter payment.'));
  const payload = (data ?? {}) as AssistedStarterPurchase & { success?: boolean; error?: string };
  if (!payload.success) throw new Error(payload.error || 'Unable to load the assisted Starter payment.');
  return payload;
}

export async function createAssistedStarterAccount(reference: string, temporaryPassword: string) {
  const { data, error } = await supabase.functions.invoke('starter-assisted-signup', {
    body: {
      action: 'create_account',
      reference: reference.trim(),
      temporary_password: temporaryPassword,
    },
  });
  if (error) throw new Error(await edgeErrorMessage(error, 'Unable to create the new DRIGHT account.'));
  const payload = (data ?? {}) as {
    success?: boolean;
    error?: string;
    account_created?: boolean;
    credentials_reset?: boolean;
    email_sent?: boolean;
    email_error?: string | null;
    email?: string;
    full_name?: string;
  };
  if (!payload.success) throw new Error(payload.error || 'Unable to create the new DRIGHT account.');
  return payload;
}

export async function verifyAssistedSignupEmail(token: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('starter-assisted-signup', {
    body: { action: 'verify_email', token },
  });
  if (error) throw new Error(await edgeErrorMessage(error, 'Unable to verify your email.'));
  const payload = (data ?? {}) as { success?: boolean; error?: string };
  if (!payload.success) throw new Error(payload.error || 'Unable to verify your email.');
}
