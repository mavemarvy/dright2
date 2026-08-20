import { supabase } from '../supabase';

export type EmailTemplateType =
  | 'welcome' | 'email_verification' | 'password_reset' | 'login_verification'
  | 'wallet_funding' | 'purchase_receipt' | 'subscription_confirmation'
  | 'withdrawal_request' | 'withdrawal_completed' | 'referral_reward'
  | 'affiliate_commission' | 'new_order' | 'seller_sale'
  | 'support_ticket_update' | 'report_status_update' | 'admin_invitation'
  | 'two_factor_auth';

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendEmail(
  templateType: EmailTemplateType,
  to: string,
  data: Record<string, unknown> = {},
  userId?: string
): Promise<EmailResult> {
  const { data: result, error } = await supabase.functions.invoke('resend-email', {
    body: { templateType, to, data, userId },
  });

  if (error) return { success: false, error: error.message };
  if (!result || result.success === false) return { success: false, error: result?.error || 'Unknown error' };
  return { success: true, messageId: result.messageId };
}

export async function sendWelcomeEmail(to: string, name: string, referralCode: string, userId?: string): Promise<EmailResult> {
  return sendEmail('welcome', to, { name, referralCode }, userId);
}

export async function sendEmailVerification(to: string, code: string, userId?: string): Promise<EmailResult> {
  return sendEmail('email_verification', to, { code }, userId);
}

export async function sendPasswordReset(to: string, token: string, userId?: string): Promise<EmailResult> {
  return sendEmail('password_reset', to, { token }, userId);
}

export async function sendLoginVerification(to: string, code: string, userId?: string): Promise<EmailResult> {
  return sendEmail('login_verification', to, { code }, userId);
}

export async function sendWalletFunding(to: string, amount: string, currency: string, newBalance: string, transactionId: string, userId?: string): Promise<EmailResult> {
  return sendEmail('wallet_funding', to, { amount, currency, newBalance, transactionId }, userId);
}

export async function sendPurchaseReceipt(to: string, productName: string, amount: string, currency: string, sellerName: string, userId?: string): Promise<EmailResult> {
  return sendEmail('purchase_receipt', to, { productName, amount, currency, sellerName }, userId);
}

export async function sendSubscriptionConfirmation(to: string, planName: string, amount: string, currency: string, billingCycle: string, userId?: string): Promise<EmailResult> {
  return sendEmail('subscription_confirmation', to, { planName, amount, currency, billingCycle }, userId);
}

export async function sendWithdrawalRequest(to: string, amount: string, currency: string, requestId: string, userId?: string): Promise<EmailResult> {
  return sendEmail('withdrawal_request', to, { amount, currency, requestId }, userId);
}

export async function sendWithdrawalCompleted(to: string, amount: string, currency: string, transactionId: string, userId?: string): Promise<EmailResult> {
  return sendEmail('withdrawal_completed', to, { amount, currency, transactionId }, userId);
}

export async function sendReferralReward(to: string, amount: string, currency: string, referredName: string, totalEarnings: string, userId?: string): Promise<EmailResult> {
  return sendEmail('referral_reward', to, { amount, currency, referredName, totalEarnings }, userId);
}

export async function sendAffiliateCommission(to: string, amount: string, currency: string, productName: string, totalEarnings: string, userId?: string): Promise<EmailResult> {
  return sendEmail('affiliate_commission', to, { amount, currency, productName, totalEarnings }, userId);
}

export async function sendNewOrderNotification(to: string, productName: string, buyerName: string, amount: string, currency: string, userId?: string): Promise<EmailResult> {
  return sendEmail('new_order', to, { productName, buyerName, amount, currency }, userId);
}

export async function sendSellerSaleNotification(to: string, productName: string, buyerName: string, amount: string, currency: string, userId?: string): Promise<EmailResult> {
  return sendEmail('seller_sale', to, { productName, buyerName, amount, currency }, userId);
}

export async function sendSupportTicketUpdate(to: string, ticketId: string, status: string, reply: string, userId?: string): Promise<EmailResult> {
  return sendEmail('support_ticket_update', to, { ticketId, status, reply }, userId);
}

export async function sendReportStatusUpdate(to: string, reportId: string, status: string, message: string, userId?: string): Promise<EmailResult> {
  return sendEmail('report_status_update', to, { reportId, status, message }, userId);
}

export async function sendAdminInvitation(to: string, role: string, token: string): Promise<EmailResult> {
  return sendEmail('admin_invitation', to, { role, token });
}

export async function sendTwoFactorAuth(to: string, code: string, userId?: string): Promise<EmailResult> {
  return sendEmail('two_factor_auth', to, { code }, userId);
}

export async function fetchEmailLogs(userId: string, limit = 20) {
  const { data, error } = await supabase
    .from('email_logs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return [];
  return data;
}
