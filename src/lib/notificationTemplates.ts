// ─────────────────────────────────────────────────────────────────────────────
// DRIGHT Notification Template Engine
// Reusable notification templates with placeholder support.
// Templates support {{user}}, {{product}}, {{store}}, {{amount}}, {{date}}, etc.
// ─────────────────────────────────────────────────────────────────────────────

export interface NotificationTemplate {
  key: string;
  titleTemplate: string;
  messageTemplate: string;
  category: string;
  variables: string[];
}

export const NOTIFICATION_TEMPLATES: NotificationTemplate[] = [
  {
    key: 'marketplace_sale',
    titleTemplate: 'New Sale!',
    messageTemplate: '{{buyer}} purchased "{{product}}" for {{currency}}{{amount}}.',
    category: 'orders',
    variables: ['buyer', 'product', 'currency', 'amount'],
  },
  {
    key: 'marketplace_approved',
    titleTemplate: 'Product Approved!',
    messageTemplate: 'Your product "{{product}}" has been approved and is now live.',
    category: 'marketplace',
    variables: ['product'],
  },
  {
    key: 'marketplace_rejected',
    titleTemplate: 'Product Not Approved',
    messageTemplate: 'Your product "{{product}}" was not approved. Reason: {{reason}}.',
    category: 'marketplace',
    variables: ['product', 'reason'],
  },
  {
    key: 'wallet_deposit',
    titleTemplate: 'Wallet Credited',
    messageTemplate: 'Your wallet has been credited with {{currency}}{{amount}}.',
    category: 'wallet',
    variables: ['currency', 'amount'],
  },
  {
    key: 'wallet_withdrawal_approved',
    titleTemplate: 'Withdrawal Approved',
    messageTemplate: 'Your withdrawal of {{currency}}{{amount}} has been approved.',
    category: 'wallet',
    variables: ['currency', 'amount'],
  },
  {
    key: 'wallet_withdrawal_completed',
    titleTemplate: 'Withdrawal Complete!',
    messageTemplate: '{{currency}}{{amount}} has been sent to your account.',
    category: 'wallet',
    variables: ['currency', 'amount'],
  },
  {
    key: 'wallet_withdrawal_rejected',
    titleTemplate: 'Withdrawal Rejected',
    messageTemplate: 'Your withdrawal of {{currency}}{{amount}} was rejected. Reason: {{reason}}.',
    category: 'wallet',
    variables: ['currency', 'amount', 'reason'],
  },
  {
    key: 'affiliate_commission_earned',
    titleTemplate: 'Commission Earned!',
    messageTemplate: 'You earned {{currency}}{{amount}} commission from {{buyer}}\'s purchase.',
    category: 'affiliate',
    variables: ['currency', 'amount', 'buyer'],
  },
  {
    key: 'affiliate_commission_paid',
    titleTemplate: 'Commission Paid!',
    messageTemplate: '{{currency}}{{amount}} commission has been paid to your wallet.',
    category: 'affiliate',
    variables: ['currency', 'amount'],
  },
  {
    key: 'service_booking_new',
    titleTemplate: 'New Booking!',
    messageTemplate: '{{client}} booked your service "{{service}}" for {{date}}.',
    category: 'services',
    variables: ['client', 'service', 'date'],
  },
  {
    key: 'service_booking_confirmed',
    titleTemplate: 'Booking Confirmed',
    messageTemplate: 'Your booking for "{{service}}" has been confirmed for {{date}}.',
    category: 'services',
    variables: ['service', 'date'],
  },
  {
    key: 'job_application_received',
    titleTemplate: 'New Application',
    messageTemplate: '{{applicant}} applied for "{{job}}".',
    category: 'jobs',
    variables: ['applicant', 'job'],
  },
  {
    key: 'job_interview_invitation',
    titleTemplate: 'Interview Invitation!',
    messageTemplate: 'You\'ve been invited to an interview for "{{job}}" on {{date}}.',
    category: 'jobs',
    variables: ['job', 'date'],
  },
  {
    key: 'job_offer_received',
    titleTemplate: 'Job Offer Received!',
    messageTemplate: 'You\'ve received an offer for "{{job}}" at {{company}}.',
    category: 'jobs',
    variables: ['job', 'company'],
  },
  {
    key: 'review_received',
    titleTemplate: 'New Review',
    messageTemplate: '{{reviewer}} left a {{rating}}-star review on "{{product}}".',
    category: 'reviews',
    variables: ['reviewer', 'rating', 'product'],
  },
  {
    key: 'security_password_changed',
    titleTemplate: 'Password Changed',
    messageTemplate: 'Your password has been changed. If this wasn\'t you, please secure your account immediately.',
    category: 'security',
    variables: [],
  },
  {
    key: 'security_new_device_login',
    titleTemplate: 'Login from New Device',
    messageTemplate: 'Your account was accessed from a new device in {{location}}.',
    category: 'security',
    variables: ['location'],
  },
  {
    key: 'store_verified',
    titleTemplate: 'Store Verified!',
    messageTemplate: 'Congratulations! Your store has been verified.',
    category: 'store',
    variables: [],
  },
  {
    key: 'store_new_follower',
    titleTemplate: 'New Follower!',
    messageTemplate: '{{follower}} is now following your store.',
    category: 'followers',
    variables: ['follower'],
  },
  {
    key: 'referral_signup',
    titleTemplate: 'New Referral Signup!',
    messageTemplate: '{{referral}} just signed up using your referral link!',
    category: 'referrals',
    variables: ['referral'],
  },
  {
    key: 'referral_bonus_earned',
    titleTemplate: 'Referral Bonus Earned!',
    messageTemplate: 'You earned a referral bonus of {{currency}}{{amount}}.',
    category: 'referrals',
    variables: ['currency', 'amount'],
  },
  {
    key: 'admin_announcement',
    titleTemplate: 'Platform Announcement',
    messageTemplate: '{{message}}',
    category: 'admin',
    variables: ['message'],
  },
  {
    key: 'admin_maintenance',
    titleTemplate: 'Maintenance Notice',
    messageTemplate: 'Scheduled maintenance on {{date}}. {{details}}',
    category: 'admin',
    variables: ['date', 'details'],
  },
  {
    key: 'system_draft_saved',
    titleTemplate: 'Draft Saved',
    messageTemplate: 'Your draft "{{draft}}" has been saved.',
    category: 'system',
    variables: ['draft'],
  },
  {
    key: 'system_profile_incomplete',
    titleTemplate: 'Complete Your Profile',
    messageTemplate: 'Add more details to your profile to get better visibility and trust.',
    category: 'system',
    variables: [],
  },
  {
    key: 'promotion_flash_sale',
    titleTemplate: 'Flash Sale Started!',
    messageTemplate: 'Flash sale on "{{product}}" — {{discount}}% off for {{duration}}!',
    category: 'promotions',
    variables: ['product', 'discount', 'duration'],
  },
  {
    key: 'promotion_price_drop',
    titleTemplate: 'Price Drop Alert',
    messageTemplate: '"{{product}}" dropped from {{currency}}{{oldPrice}} to {{currency}}{{newPrice}}.',
    category: 'promotions',
    variables: ['product', 'currency', 'oldPrice', 'newPrice'],
  },
];

// ─── Template Rendering ──────────────────────────────────────────────────────────

export function renderTemplate(template: string, variables: Record<string, string | number | null>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const val = variables[key];
    return val != null ? String(val) : '';
  });
}

export function renderNotification(
  templateKey: string,
  variables: Record<string, string | number | null>,
): { title: string; message: string; category: string } | null {
  const template = NOTIFICATION_TEMPLATES.find(t => t.key === templateKey);
  if (!template) return null;
  return {
    title: renderTemplate(template.titleTemplate, variables),
    message: renderTemplate(template.messageTemplate, variables),
    category: template.category,
  };
}

export function getTemplateVariables(templateKey: string): string[] {
  const template = NOTIFICATION_TEMPLATES.find(t => t.key === templateKey);
  return template ? template.variables : [];
}

// ─── Localization-Ready Formatting ────────────────────────────────────────────────

export function formatCurrency(amount: number, currency = '$', locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency === '$' ? 'USD' : currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(date: string | Date, locale = 'en-US'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(d);
}

export function formatTime(date: string | Date, locale = 'en-US'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}
