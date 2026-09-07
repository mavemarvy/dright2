export interface CurrencyInfo {
  code: string;
  symbol: string;
  label: string;
  locale: string;
}

export type CurrencyRates = Record<string, number>;

export const BASE_CURRENCY = 'USD';
export const RATES_CACHE_KEY = 'dright_exchange_rates';
export const CURRENCY_PREF_KEY = 'dright_selected_currency';

const DEFAULT_CURRENCY_CODES = [
  'USD', 'EUR', 'GBP', 'NGN', 'GHS', 'KES', 'ZAR', 'EGP', 'CAD', 'AUD',
  'NZD', 'INR', 'JPY', 'CNY', 'HKD', 'SGD', 'AED', 'SAR', 'QAR', 'KWD',
  'BHD', 'OMR', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON',
  'BGN', 'TRY', 'BRL', 'MXN', 'ARS', 'CLP', 'COP', 'PEN', 'UYU', 'XOF',
  'XAF', 'MAD', 'DZD', 'TND', 'ETB', 'UGX', 'TZS', 'RWF', 'ZMW', 'BWP',
  'MUR', 'PHP', 'IDR', 'MYR', 'THB', 'VND', 'KRW', 'PKR', 'BDT', 'LKR',
  'NPR', 'ILS', 'JOD', 'GEL', 'UAH',
] as const;

const LOCALE_OVERRIDES: Record<string, string> = {
  NGN: 'en-NG', USD: 'en-US', EUR: 'en-IE', GBP: 'en-GB', GHS: 'en-GH',
  KES: 'en-KE', ZAR: 'en-ZA', EGP: 'ar-EG', CAD: 'en-CA', AUD: 'en-AU',
  NZD: 'en-NZ', INR: 'en-IN', JPY: 'ja-JP', CNY: 'zh-CN', HKD: 'zh-HK',
  SGD: 'en-SG', AED: 'en-AE', SAR: 'ar-SA', BRL: 'pt-BR', MXN: 'es-MX',
};

function normalizeCurrencyCode(code: string | null | undefined): string {
  const normalized = String(code || BASE_CURRENCY).trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : BASE_CURRENCY;
}

function runtimeLocale(): string {
  if (typeof navigator !== 'undefined' && navigator.language) return navigator.language;
  return 'en-US';
}

function currencyDisplayName(code: string): string {
  try {
    const names = new Intl.DisplayNames(['en'], { type: 'currency' });
    return names.of(code) || code;
  } catch {
    return code;
  }
}

function currencySymbol(code: string, locale = LOCALE_OVERRIDES[code] || runtimeLocale()): string {
  try {
    const part = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      currencyDisplay: 'narrowSymbol',
    }).formatToParts(0).find(item => item.type === 'currency');
    return part?.value || code;
  } catch {
    return code;
  }
}

export function getCurrencyInfo(code: string): CurrencyInfo {
  const normalized = normalizeCurrencyCode(code);
  const locale = LOCALE_OVERRIDES[normalized] || runtimeLocale();
  const symbol = currencySymbol(normalized, locale);
  const name = currencyDisplayName(normalized);
  return {
    code: normalized,
    symbol,
    label: `${name} (${normalized} ${symbol})`,
    locale,
  };
}

export function getCurrencySymbol(code: string): string {
  return getCurrencyInfo(code).symbol;
}

export function buildSupportedCurrencies(rateCodes?: Iterable<string>): CurrencyInfo[] {
  const codes = new Set<string>();
  const source = rateCodes ? Array.from(rateCodes) : Array.from(DEFAULT_CURRENCY_CODES);

  for (const value of source) {
    const code = normalizeCurrencyCode(value);
    if (/^[A-Z]{3}$/.test(code)) codes.add(code);
  }
  codes.add(BASE_CURRENCY);

  return Array.from(codes)
    .map(getCurrencyInfo)
    .sort((a, b) => {
      if (a.code === BASE_CURRENCY) return -1;
      if (b.code === BASE_CURRENCY) return 1;
      return a.label.localeCompare(b.label);
    });
}

// Backwards-compatible static list. CurrencyContext replaces this with the live
// exchange-rate currency set when rates are available.
export const SUPPORTED_CURRENCIES: CurrencyInfo[] = buildSupportedCurrencies();

export function getSelectedDisplayCurrency(): string {
  if (typeof window === 'undefined') return BASE_CURRENCY;
  try {
    return normalizeCurrencyCode(window.localStorage.getItem(CURRENCY_PREF_KEY));
  } catch {
    return BASE_CURRENCY;
  }
}

export function getCachedExchangeRates(): CurrencyRates {
  if (typeof window === 'undefined') return { [BASE_CURRENCY]: 1 };
  try {
    const raw = window.localStorage.getItem(RATES_CACHE_KEY);
    if (!raw) return { [BASE_CURRENCY]: 1 };
    const parsed = JSON.parse(raw) as { rates?: CurrencyRates };
    return parsed.rates && typeof parsed.rates === 'object'
      ? { [BASE_CURRENCY]: 1, ...parsed.rates }
      : { [BASE_CURRENCY]: 1 };
  } catch {
    return { [BASE_CURRENCY]: 1 };
  }
}

export function tryConvertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rates: CurrencyRates = getCachedExchangeRates(),
): number | null {
  const source = normalizeCurrencyCode(fromCurrency);
  const target = normalizeCurrencyCode(toCurrency);
  const safeAmount = Number(amount);
  if (!Number.isFinite(safeAmount)) return 0;
  if (source === target) return safeAmount;

  const fromRate = Number(rates[source]);
  const toRate = Number(rates[target]);
  if (!Number.isFinite(fromRate) || fromRate <= 0 || !Number.isFinite(toRate) || toRate <= 0) {
    return null;
  }
  return (safeAmount / fromRate) * toRate;
}

export function formatCurrencyValue(amount: number, currencyCode: string): string {
  const info = getCurrencyInfo(currencyCode);
  const safeAmount = Number.isFinite(Number(amount)) ? Number(amount) : 0;
  try {
    return new Intl.NumberFormat(info.locale, {
      style: 'currency',
      currency: info.code,
      currencyDisplay: 'narrowSymbol',
    }).format(safeAmount);
  } catch {
    return `${info.symbol}${safeAmount.toLocaleString()}`;
  }
}

/**
 * Legacy-safe money formatter.
 *
 * - formatCurrency(amount) treats the amount as DRIGHT's canonical USD value and
 *   renders it in the user's selected display currency using cached FX rates.
 * - formatCurrency(amount, code) preserves the older explicit-currency behavior
 *   and formats the amount in that currency without converting it.
 *
 * New React UI should prefer useCurrency().format(amount, sourceCurrency), which
 * is reactive and can use the freshest in-memory rates.
 */
export function formatCurrency(amount: number, currencyCode?: string): string {
  if (currencyCode) return formatCurrencyValue(amount, currencyCode);

  const displayCurrency = getSelectedDisplayCurrency();
  const converted = tryConvertCurrency(amount, BASE_CURRENCY, displayCurrency);
  if (converted === null) return formatCurrencyValue(amount, BASE_CURRENCY);
  return formatCurrencyValue(converted, displayCurrency);
}

export function formatSalaryRange(
  min: number | null | undefined,
  max: number | null | undefined,
  sourceCurrency: string = BASE_CURRENCY,
  displayCurrency: string = getSelectedDisplayCurrency(),
): string {
  const safeMin = Number(min ?? 0);
  const safeMax = Number(max ?? 0);
  if (safeMin === 0 && safeMax === 0) return 'Negotiable';

  const render = (value: number) => {
    const converted = tryConvertCurrency(value, sourceCurrency, displayCurrency);
    if (converted === null) return formatCurrencyValue(value, sourceCurrency);
    return formatCurrencyValue(converted, displayCurrency);
  };

  if (safeMax >= 150000) return `${render(safeMin)} – Above ${render(150000)}`;
  return `${render(safeMin)} – ${render(safeMax)}`;
}
