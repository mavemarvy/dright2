import type { PaymentProvider } from './paymentProviders';

// Country to preferred gateway mapping
const COUNTRY_GATEWAY_PRIORITY: Record<string, string[]> = {
  NG: ['paystack', 'flutterwave', 'google_pay'],
  GH: ['paystack', 'flutterwave'],
  KE: ['flutterwave', 'paystack'],
  ZA: ['paystack', 'stripe'],
  CI: ['paystack', 'flutterwave'],
  UG: ['flutterwave', 'paystack'],
  TZ: ['flutterwave', 'paystack'],
  US: ['stripe', 'google_pay', 'apple_pay'],
  GB: ['wise', 'stripe', 'google_pay', 'apple_pay'],
  CA: ['stripe', 'google_pay', 'apple_pay'],
  AU: ['stripe', 'google_pay', 'apple_pay'],
  DE: ['stripe', 'wise', 'google_pay'],
  FR: ['stripe', 'wise', 'google_pay'],
  NL: ['stripe', 'wise'],
  ES: ['stripe', 'wise'],
  IT: ['stripe', 'wise'],
  JP: ['stripe', 'google_pay', 'apple_pay'],
  SG: ['stripe', 'apple_pay', 'wise'],
  AE: ['stripe'],
  BR: ['stripe'],
  MX: ['stripe'],
  IN: ['google_pay', 'stripe'],
  EG: ['flutterwave'],
};

export interface CountryInfo {
  code: string;
  name: string;
  currency: string;
  flag: string;
}

const COUNTRIES: Record<string, CountryInfo> = {
  NG: { code: 'NG', name: 'Nigeria', currency: 'NGN', flag: '🇳🇬' },
  GH: { code: 'GH', name: 'Ghana', currency: 'GHS', flag: '🇬🇭' },
  KE: { code: 'KE', name: 'Kenya', currency: 'KES', flag: '🇰🇪' },
  ZA: { code: 'ZA', name: 'South Africa', currency: 'ZAR', flag: '🇿🇦' },
  CI: { code: 'CI', name: "Côte d'Ivoire", currency: 'XOF', flag: '🇨🇮' },
  UG: { code: 'UG', name: 'Uganda', currency: 'UGX', flag: '🇺🇬' },
  TZ: { code: 'TZ', name: 'Tanzania', currency: 'TZS', flag: '🇹🇿' },
  US: { code: 'US', name: 'United States', currency: 'USD', flag: '🇺🇸' },
  GB: { code: 'GB', name: 'United Kingdom', currency: 'GBP', flag: '🇬🇧' },
  CA: { code: 'CA', name: 'Canada', currency: 'CAD', flag: '🇨🇦' },
  AU: { code: 'AU', name: 'Australia', currency: 'AUD', flag: '🇦🇺' },
  DE: { code: 'DE', name: 'Germany', currency: 'EUR', flag: '🇩🇪' },
  FR: { code: 'FR', name: 'France', currency: 'EUR', flag: '🇫🇷' },
  NL: { code: 'NL', name: 'Netherlands', currency: 'EUR', flag: '🇳🇱' },
  ES: { code: 'ES', name: 'Spain', currency: 'EUR', flag: '🇪🇸' },
  IT: { code: 'IT', name: 'Italy', currency: 'EUR', flag: '🇮🇹' },
  JP: { code: 'JP', name: 'Japan', currency: 'JPY', flag: '🇯🇵' },
  SG: { code: 'SG', name: 'Singapore', currency: 'SGD', flag: '🇸🇬' },
  AE: { code: 'AE', name: 'UAE', currency: 'AED', flag: '🇦🇪' },
  BR: { code: 'BR', name: 'Brazil', currency: 'BRL', flag: '🇧🇷' },
  MX: { code: 'MX', name: 'Mexico', currency: 'MXN', flag: '🇲🇽' },
  IN: { code: 'IN', name: 'India', currency: 'INR', flag: '🇮🇳' },
  EG: { code: 'EG', name: 'Egypt', currency: 'EGP', flag: '🇪🇬' },
};

// Supported currencies for multi-currency architecture
export const SUPPORTED_CURRENCIES = ['NGN', 'USD', 'EUR', 'GBP', 'KES', 'GHS', 'ZAR'] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export const CURRENCY_SYMBOLS: Record<string, string> = {
  NGN: '₦',
  USD: '$',
  EUR: '€',
  GBP: '£',
  KES: 'KSh',
  GHS: '₵',
  ZAR: 'R',
};

// Currency formatting is centralized in lib/currency.ts — import from there.
// Use CurrencyContext.useCurrency().format() for display-currency conversion in components.

let detectedCountry: string | null = null;

export async function detectCountry(): Promise<string> {
  if (detectedCountry) return detectedCountry;

  // Try localStorage cache first
  try {
    const cached = localStorage.getItem('dright_detected_country');
    if (cached && COUNTRIES[cached]) {
      detectedCountry = cached;
      return cached;
    }
  } catch {
    // ignore
  }

  // Try browser timezone detection
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const tzToCountry: Record<string, string> = {
      'Africa/Lagos': 'NG',
      'Africa/Accra': 'GH',
      'Africa/Nairobi': 'KE',
      'Africa/Johannesburg': 'ZA',
      'Africa/Abidjan': 'CI',
      'Africa/Kampala': 'UG',
      'Africa/Dar_es_Salaam': 'TZ',
      'Africa/Cairo': 'EG',
      'America/New_York': 'US',
      'America/Chicago': 'US',
      'America/Denver': 'US',
      'America/Los_Angeles': 'US',
      'America/Toronto': 'CA',
      'America/Sao_Paulo': 'BR',
      'America/Mexico_City': 'MX',
      'Europe/London': 'GB',
      'Europe/Berlin': 'DE',
      'Europe/Paris': 'FR',
      'Europe/Amsterdam': 'NL',
      'Europe/Madrid': 'ES',
      'Europe/Rome': 'IT',
      'Asia/Tokyo': 'JP',
      'Asia/Singapore': 'SG',
      'Asia/Dubai': 'AE',
      'Asia/Kolkata': 'IN',
      'Australia/Sydney': 'AU',
    };
    const country = tzToCountry[tz];
    if (country) {
      detectedCountry = country;
      try { localStorage.setItem('dright_detected_country', country); } catch { /* ignore */ }
      return country;
    }
  } catch {
    // ignore
  }

  // Default to Nigeria
  detectedCountry = 'NG';
  return detectedCountry;
}

export function getCountryInfo(code: string): CountryInfo | null {
  return COUNTRIES[code] || null;
}

export function sortProvidersByCountry(providers: PaymentProvider[], countryCode: string): PaymentProvider[] {
  const priority = COUNTRY_GATEWAY_PRIORITY[countryCode];
  if (!priority) return providers;

  return [...providers].sort((a, b) => {
    const aIdx = priority.indexOf(a.slug);
    const bIdx = priority.indexOf(b.slug);
    const aPriority = aIdx === -1 ? 99 : aIdx;
    const bPriority = bIdx === -1 ? 99 : bIdx;
    if (aPriority !== bPriority) return aPriority - bPriority;
    return a.priority - b.priority;
  });
}
