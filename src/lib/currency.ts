export interface CurrencyInfo {
  code: string;
  symbol: string;
  label: string;
  locale: string;
}

export const SUPPORTED_CURRENCIES: CurrencyInfo[] = [
  { code: 'NGN', symbol: '₦', label: 'Nigerian Naira (NGN ₦)', locale: 'en-NG' },
  { code: 'USD', symbol: '$', label: 'US Dollars (USD $)', locale: 'en-US' },
  { code: 'EUR', symbol: '€', label: 'Euro (EUR €)', locale: 'en-IE' },
  { code: 'GBP', symbol: '£', label: 'British Pound (GBP £)', locale: 'en-GB' },
  { code: 'GHS', symbol: '₵', label: 'Ghanaian Cedi (GHS ₵)', locale: 'en-GH' },
  { code: 'KES', symbol: 'KSh', label: 'Kenyan Shilling (KES)', locale: 'en-KE' },
  { code: 'ZAR', symbol: 'R', label: 'South African Rand (ZAR R)', locale: 'en-ZA' },
  { code: 'EGP', symbol: 'E£', label: 'Egyptian Pound (EGP)', locale: 'ar-EG' },
  { code: 'CAD', symbol: 'C$', label: 'Canadian Dollar (CAD C$)', locale: 'en-CA' },
  { code: 'AUD', symbol: 'A$', label: 'Australian Dollar (AUD A$)', locale: 'en-AU' },
  { code: 'INR', symbol: '₹', label: 'Indian Rupee (INR ₹)', locale: 'en-IN' },
];

const CURRENCY_MAP: Record<string, CurrencyInfo> = Object.fromEntries(
  SUPPORTED_CURRENCIES.map(c => [c.code, c])
);

export function getCurrencyInfo(code: string): CurrencyInfo {
  return CURRENCY_MAP[code] || CURRENCY_MAP['USD'];
}

export function getCurrencySymbol(code: string): string {
  return getCurrencyInfo(code).symbol;
}

export function formatCurrency(amount: number, currencyCode: string = 'USD'): string {
  const info = getCurrencyInfo(currencyCode);
  try {
    return new Intl.NumberFormat(info.locale, {
      style: 'currency',
      currency: info.code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${info.symbol}${amount.toFixed(2)}`;
  }
}

export function formatSalaryRange(min: number | null | undefined, max: number | null | undefined, currencyCode: string = 'USD'): string {
  const safeMin: number = min ?? 0;
  const safeMax: number = max ?? 0;
  if (safeMin === 0 && safeMax === 0) return 'Negotiable';
  const symbol = getCurrencySymbol(currencyCode);
  if (safeMax >= 150000) {
    return `${symbol}${safeMin.toLocaleString()} – Above ${symbol}150,000`;
  }
  return `${symbol}${safeMin.toLocaleString()} – ${symbol}${safeMax.toLocaleString()}`;
}
