import { supabase } from './supabase';

export type ProviderStatus = 'enabled' | 'coming_soon' | 'maintenance';

export interface PaymentProvider {
  id: string;
  slug: string;
  name: string;
  logo: string;
  description: string;
  status: ProviderStatus;
  priority: number;
  supported_countries: string[];
  supported_currencies: string[];
  badge: string | null;
  is_recommended: boolean;
  sub_methods?: string[];
  rating?: number;
  processing_time?: string;
  country_priority?: Record<string, number>;
  created_at: string;
  updated_at: string;
}

// Fallback used when the database table isn't reachable
export const FALLBACK_PROVIDERS: PaymentProvider[] = [
  {
    id: 'fb-paystack',
    slug: 'paystack',
    name: 'Paystack',
    logo: '',
    description: "Pay with card, bank transfer, USSD, or mobile money. Nigeria's most trusted payment gateway.",
    status: 'enabled',
    priority: 1,
    supported_countries: ['NG', 'GH', 'KE', 'ZA', 'CI'],
    supported_currencies: ['NGN', 'GHS', 'KES', 'ZAR', 'USD'],
    badge: 'Recommended',
    is_recommended: true,
    created_at: '',
    updated_at: '',
  },
  {
    id: 'fb-google_pay',
    slug: 'google_pay',
    name: 'Google Pay',
    logo: '',
    description: 'Fast, secure checkout with your Google account. Card details stay with Google.',
    status: 'coming_soon',
    priority: 2,
    supported_countries: ['US', 'GB', 'CA', 'AU', 'DE', 'FR', 'JP', 'IN', 'NG'],
    supported_currencies: ['USD', 'GBP', 'CAD', 'AUD', 'EUR', 'JPY', 'INR', 'NGN'],
    badge: null,
    is_recommended: false,
    created_at: '',
    updated_at: '',
  },
  {
    id: 'fb-apple_pay',
    slug: 'apple_pay',
    name: 'Apple Pay',
    logo: '',
    description: 'One-tap checkout on iPhone, iPad, and Mac. Your card number is never shared.',
    status: 'coming_soon',
    priority: 3,
    supported_countries: ['US', 'GB', 'CA', 'AU', 'DE', 'FR', 'JP', 'SG'],
    supported_currencies: ['USD', 'GBP', 'CAD', 'AUD', 'EUR', 'JPY', 'SGD'],
    badge: null,
    is_recommended: false,
    created_at: '',
    updated_at: '',
  },
  {
    id: 'fb-flutterwave',
    slug: 'flutterwave',
    name: 'Flutterwave',
    logo: '',
    description: 'Accept payments across Africa with cards, mobile money, and bank transfers.',
    status: 'coming_soon',
    priority: 4,
    supported_countries: ['NG', 'GH', 'KE', 'UG', 'TZ', 'ZA', 'CI', 'EG'],
    supported_currencies: ['NGN', 'GHS', 'KES', 'UGX', 'TZS', 'ZAR', 'USD', 'EUR'],
    badge: null,
    is_recommended: false,
    created_at: '',
    updated_at: '',
  },
  {
    id: 'fb-stripe',
    slug: 'stripe',
    name: 'Stripe',
    logo: '',
    description: 'Global payments for businesses of all sizes. Supports 135+ currencies worldwide.',
    status: 'coming_soon',
    priority: 5,
    supported_countries: ['US', 'GB', 'CA', 'AU', 'DE', 'FR', 'NL', 'ES', 'IT', 'JP', 'SG', 'AE', 'BR', 'MX'],
    supported_currencies: ['USD', 'GBP', 'EUR', 'CAD', 'AUD', 'JPY', 'SGD', 'AED', 'BRL', 'MXN'],
    badge: null,
    is_recommended: false,
    created_at: '',
    updated_at: '',
  },
  {
    id: 'fb-wise',
    slug: 'wise',
    name: 'Wise (TransferWise)',
    logo: '',
    description: 'Low-cost international transfers with the real exchange rate.',
    status: 'coming_soon',
    priority: 6,
    supported_countries: ['GB', 'US', 'DE', 'FR', 'ES', 'IT', 'NL', 'BE', 'IE', 'AU', 'JP', 'SG'],
    supported_currencies: ['GBP', 'USD', 'EUR', 'AUD', 'JPY', 'SGD', 'CAD', 'NZD'],
    badge: null,
    is_recommended: false,
    created_at: '',
    updated_at: '',
  },
];

const PROVIDER_LOGOS: Record<string, string> = {
  paystack: '🟢',
  google_pay: '🔵',
  apple_pay: '⚪',
  flutterwave: '🟠',
  stripe: '🟣',
  wise: '🟩',
};

export function getProviderLogo(slug: string): string {
  return PROVIDER_LOGOS[slug] || '💳';
}

export async function fetchPaymentProviders(): Promise<PaymentProvider[]> {
  const { data, error } = await supabase
    .from('payment_providers')
    .select('*')
    .order('priority', { ascending: true });

  if (error || !data || data.length === 0) {
    return FALLBACK_PROVIDERS;
  }
  return data as PaymentProvider[];
}

export async function updateProviderStatus(
  providerId: string,
  status: ProviderStatus,
  priority?: number
): Promise<{ success: boolean; error?: string }> {
  const updates: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (priority !== undefined) updates.priority = priority;

  const { error } = await supabase
    .from('payment_providers')
    .update(updates)
    .eq('id', providerId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export function getEnabledProviders(providers: PaymentProvider[]): PaymentProvider[] {
  return providers.filter((p) => p.status === 'enabled');
}

export function getComingSoonProviders(providers: PaymentProvider[]): PaymentProvider[] {
  return providers.filter((p) => p.status === 'coming_soon');
}

export function getMaintenanceProviders(providers: PaymentProvider[]): PaymentProvider[] {
  return providers.filter((p) => p.status === 'maintenance');
}
