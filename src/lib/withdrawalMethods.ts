import { supabase } from './supabase';

export type WithdrawalMethodStatus = 'enabled' | 'coming_soon' | 'maintenance';

export interface WithdrawalMethod {
  id: string;
  slug: string;
  name: string;
  logo: string;
  description: string;
  status: WithdrawalMethodStatus;
  priority: number;
  supported_currencies: string[];
  is_crypto: boolean;
  badge: string | null;
  created_at: string;
  updated_at: string;
}

export const FALLBACK_WITHDRAWAL_METHODS: WithdrawalMethod[] = [
  {
    id: 'fb-nigerian_bank',
    slug: 'nigerian_bank',
    name: 'Nigerian Bank',
    logo: '',
    description: 'Transfer to any Nigerian bank account. Processed via Paystack.',
    status: 'enabled',
    priority: 1,
    supported_currencies: ['NGN'],
    is_crypto: false,
    badge: 'Recommended',
    created_at: '',
    updated_at: '',
  },
  {
    id: 'fb-wise',
    slug: 'wise',
    name: 'Wise (TransferWise)',
    logo: '',
    description: 'Low-cost international transfers to bank accounts in 70+ countries.',
    status: 'coming_soon',
    priority: 2,
    supported_currencies: ['USD', 'GBP', 'EUR', 'AUD', 'CAD', 'JPY', 'SGD'],
    is_crypto: false,
    badge: null,
    created_at: '',
    updated_at: '',
  },
  {
    id: 'fb-paypal',
    slug: 'paypal',
    name: 'PayPal',
    logo: '',
    description: 'Withdraw to your PayPal account. Available for international users.',
    status: 'coming_soon',
    priority: 3,
    supported_currencies: ['USD', 'GBP', 'EUR', 'CAD', 'AUD'],
    is_crypto: false,
    badge: null,
    created_at: '',
    updated_at: '',
  },
  {
    id: 'fb-us_bank',
    slug: 'us_bank',
    name: 'US Bank (ACH)',
    logo: '',
    description: 'Direct ACH transfer to US bank accounts.',
    status: 'coming_soon',
    priority: 4,
    supported_currencies: ['USD'],
    is_crypto: false,
    badge: null,
    created_at: '',
    updated_at: '',
  },
  {
    id: 'fb-international_bank',
    slug: 'international_bank',
    name: 'International Bank Wire',
    logo: '',
    description: 'SWIFT wire transfer to bank accounts worldwide.',
    status: 'coming_soon',
    priority: 5,
    supported_currencies: ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD'],
    is_crypto: false,
    badge: null,
    created_at: '',
    updated_at: '',
  },
  {
    id: 'fb-crypto',
    slug: 'crypto',
    name: 'Crypto Wallet',
    logo: '',
    description: 'Withdraw to a crypto wallet. Disabled until activated by Super Admin.',
    status: 'coming_soon',
    priority: 6,
    supported_currencies: ['USDT', 'USDC', 'BTC', 'ETH'],
    is_crypto: true,
    badge: null,
    created_at: '',
    updated_at: '',
  },
];

const METHOD_LOGOS: Record<string, string> = {
  nigerian_bank: '🏦',
  wise: '🟩',
  paypal: '🔵',
  us_bank: '🏛️',
  international_bank: '🌍',
  crypto: '₿',
};

export function getMethodLogo(slug: string): string {
  return METHOD_LOGOS[slug] || '💸';
}

export async function fetchWithdrawalMethods(): Promise<WithdrawalMethod[]> {
  const { data, error } = await supabase
    .from('withdrawal_methods')
    .select('*')
    .order('priority', { ascending: true });

  if (error || !data || data.length === 0) {
    return FALLBACK_WITHDRAWAL_METHODS;
  }
  return data as WithdrawalMethod[];
}

export function getEnabledMethods(methods: WithdrawalMethod[]): WithdrawalMethod[] {
  return methods.filter((m) => m.status === 'enabled' && !m.is_crypto);
}

export function getComingSoonMethods(methods: WithdrawalMethod[]): WithdrawalMethod[] {
  return methods.filter((m) => m.status === 'coming_soon');
}
