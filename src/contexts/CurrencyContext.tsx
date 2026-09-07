import {
  cloneElement,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { supabase } from '../lib/supabase';
import {
  BASE_CURRENCY,
  CURRENCY_PREF_KEY,
  RATES_CACHE_KEY,
  SUPPORTED_CURRENCIES,
  buildSupportedCurrencies,
  formatCurrencyValue,
  getCurrencyInfo,
  getSelectedDisplayCurrency,
  tryConvertCurrency,
  type CurrencyRates,
} from '../lib/currency';

const COUNTRY_CACHE_KEY = 'dright_detected_country';
const REFRESH_INTERVAL_MS = 20 * 60 * 1000; // 20 minutes
const STALE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour
const CURRENCY_CHANGE_EVENT = 'dright-currency-changed';

type Rates = CurrencyRates;

interface CachedRates {
  rates: Rates;
  timestamp: number;
}

export interface CurrencyContextType {
  selectedCurrency: string;
  setCurrency: (code: string) => void;
  convert: (amount: number, fromCurrency?: string) => number;
  format: (amount: number, fromCurrency?: string) => string;
  formatInCurrency: (amount: number, displayCurrency: string, fromCurrency?: string) => string;
  rates: Rates;
  lastUpdated: number | null;
  isStale: boolean;
  loading: boolean;
  detectedCurrency: string | null;
  baseCurrency: string;
  supportedCurrencies: ReturnType<typeof buildSupportedCurrencies>;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

function loadCachedRates(): CachedRates | null {
  try {
    const raw = localStorage.getItem(RATES_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedRates;
    if (!parsed.rates || typeof parsed.timestamp !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveCachedRates(rates: Rates, timestamp: number) {
  try {
    localStorage.setItem(RATES_CACHE_KEY, JSON.stringify({ rates, timestamp }));
  } catch { /* ignore quota errors */ }
}

function loadSelectedCurrency(): string {
  return getSelectedDisplayCurrency();
}

const FALLBACK_RATES: Rates = {
  USD: 1,
  NGN: 1600,
  EUR: 0.92,
  GBP: 0.79,
  GHS: 15.5,
  KES: 129,
  ZAR: 18.5,
  CAD: 1.36,
  AUD: 1.52,
  NZD: 1.66,
  INR: 83.5,
  XOF: 600,
  XAF: 600,
  UGX: 3800,
  TZS: 2530,
  JPY: 149,
  CNY: 7.2,
  HKD: 7.8,
  SGD: 1.35,
  AED: 3.67,
  SAR: 3.75,
  BRL: 4.95,
  MXN: 17.2,
  EGP: 30.9,
  CHF: 0.89,
};

const TIMEZONE_TO_COUNTRY: Record<string, string> = {
  'Africa/Lagos': 'NG', 'Africa/Accra': 'GH', 'Africa/Nairobi': 'KE',
  'Africa/Johannesburg': 'ZA', 'Africa/Abidjan': 'CI', 'Africa/Kampala': 'UG',
  'Africa/Dar_es_Salaam': 'TZ', 'Africa/Cairo': 'EG',
  'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US',
  'America/Los_Angeles': 'US', 'America/Toronto': 'CA', 'America/Sao_Paulo': 'BR',
  'America/Mexico_City': 'MX', 'Europe/London': 'GB', 'Europe/Berlin': 'DE',
  'Europe/Paris': 'FR', 'Europe/Amsterdam': 'NL', 'Europe/Madrid': 'ES',
  'Europe/Rome': 'IT', 'Asia/Tokyo': 'JP', 'Asia/Singapore': 'SG',
  'Asia/Dubai': 'AE', 'Asia/Kolkata': 'IN', 'Australia/Sydney': 'AU',
};

const COUNTRY_TO_CURRENCY: Record<string, string> = {
  NG: 'NGN', GH: 'GHS', KE: 'KES', ZA: 'ZAR', CI: 'XOF', UG: 'UGX',
  TZ: 'TZS', EG: 'EGP', US: 'USD', CA: 'CAD', BR: 'BRL', MX: 'MXN',
  GB: 'GBP', DE: 'EUR', FR: 'EUR', NL: 'EUR', ES: 'EUR', IT: 'EUR',
  JP: 'JPY', SG: 'SGD', AE: 'AED', IN: 'INR', AU: 'AUD', NZ: 'NZD',
};

function detectCurrencyFromTimezone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const country = TIMEZONE_TO_COUNTRY[tz];
    if (country) return COUNTRY_TO_CURRENCY[country] || null;
  } catch { /* ignore */ }
  return null;
}

async function fetchRates(): Promise<Rates | null> {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    if (res.ok) {
      const data = await res.json();
      if (data && data.rates && typeof data.rates.USD === 'number') {
        return data.rates as Rates;
      }
    }
  } catch { /* fall through */ }

  try {
    const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    if (res.ok) {
      const data = await res.json();
      if (data && data.rates && typeof data.rates.USD === 'number') {
        return data.rates as Rates;
      }
    }
  } catch { /* fall through */ }

  return null;
}

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [selectedCurrency, setSelectedCurrency] = useState<string>(loadSelectedCurrency);
  const [rates, setRates] = useState<Rates>(FALLBACK_RATES);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [detectedCurrency, setDetectedCurrency] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const supportedCurrencies = useMemo(
    () => buildSupportedCurrencies(Object.keys(rates)),
    [rates],
  );

  const refreshRates = useCallback(async (): Promise<boolean> => {
    const fetched = await fetchRates();
    if (fetched) {
      const now = Date.now();
      saveCachedRates(fetched, now);
      setRates(fetched);
      setLastUpdated(now);
      setLoading(false);
      return true;
    }
    const cached = loadCachedRates();
    if (cached) {
      setRates(cached.rates);
      setLastUpdated(cached.timestamp);
    } else {
      setRates(FALLBACK_RATES);
      setLastUpdated(Date.now());
    }
    setLoading(false);
    return false;
  }, []);

  // On mount: load cached rates, detect currency, then fetch fresh.
  useEffect(() => {
    const cached = loadCachedRates();
    if (cached) {
      setRates(cached.rates);
      setLastUpdated(cached.timestamp);
    } else {
      setRates(FALLBACK_RATES);
    }

    if (!localStorage.getItem(CURRENCY_PREF_KEY)) {
      const detected = detectCurrencyFromTimezone();
      if (detected) setDetectedCurrency(detected);
    }

    try {
      const cachedCountry = localStorage.getItem(COUNTRY_CACHE_KEY);
      if (cachedCountry) {
        const currency = COUNTRY_TO_CURRENCY[cachedCountry];
        if (currency) setDetectedCurrency(currency);
      }
    } catch { /* ignore */ }

    refreshRates();
    intervalRef.current = setInterval(refreshRates, REFRESH_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refreshRates]);

  // Load user's DB-saved currency preference on auth change.
  useEffect(() => {
    let active = true;

    const loadUserCurrency = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user || !active) return;
      const { data } = await supabase
        .from('users')
        .select('preferred_currency, location')
        .eq('id', session.user.id)
        .maybeSingle();

      if (!active) return;

      if (data?.preferred_currency) {
        const normalized = getCurrencyInfo(data.preferred_currency).code;
        setSelectedCurrency(normalized);
        localStorage.setItem(CURRENCY_PREF_KEY, normalized);
      } else if (data?.location) {
        const loc = data.location.toLowerCase();
        const entry = Object.entries(COUNTRY_TO_CURRENCY).find(([country]) => loc.includes(country.toLowerCase()));
        if (entry && !localStorage.getItem(CURRENCY_PREF_KEY)) setDetectedCurrency(entry[1]);
      }
    };

    loadUserCurrency();
    const { data: authSub } = supabase.auth.onAuthStateChange(() => {
      loadUserCurrency();
    });

    return () => {
      active = false;
      authSub?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(CURRENCY_PREF_KEY, selectedCurrency);
  }, [selectedCurrency]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent(CURRENCY_CHANGE_EVENT, {
      detail: { currency: selectedCurrency },
    }));
  }, [selectedCurrency]);

  useEffect(() => {
    const handler = (event: StorageEvent) => {
      if (event.key === CURRENCY_PREF_KEY && event.newValue) {
        setSelectedCurrency(getCurrencyInfo(event.newValue).code);
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const setCurrency = useCallback((code: string) => {
    const normalized = getCurrencyInfo(code).code;
    setSelectedCurrency(normalized);
    localStorage.setItem(CURRENCY_PREF_KEY, normalized);

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          await supabase
            .from('users')
            .update({ preferred_currency: normalized })
            .eq('id', session.user.id);
          await supabase
            .from('user_currency_preferences')
            .upsert({
              user_id: session.user.id,
              currency: normalized,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'user_id' });
        }
      } catch { /* non-critical */ }
    })();
  }, []);

  const convert = useCallback((amount: number, fromCurrency: string = BASE_CURRENCY): number => {
    return tryConvertCurrency(amount, fromCurrency, selectedCurrency, rates) ?? Number(amount || 0);
  }, [rates, selectedCurrency]);

  const format = useCallback((amount: number, fromCurrency: string = BASE_CURRENCY): string => {
    const source = getCurrencyInfo(fromCurrency).code;
    const converted = tryConvertCurrency(amount, source, selectedCurrency, rates);
    if (converted === null) return formatCurrencyValue(amount, source);
    return formatCurrencyValue(converted, selectedCurrency);
  }, [rates, selectedCurrency]);

  const formatInCurrency = useCallback((
    amount: number,
    displayCurrency: string,
    fromCurrency: string = BASE_CURRENCY,
  ): string => {
    const source = getCurrencyInfo(fromCurrency).code;
    const display = getCurrencyInfo(displayCurrency).code;
    const converted = tryConvertCurrency(amount, source, display, rates);
    if (converted === null) return formatCurrencyValue(amount, source);
    return formatCurrencyValue(converted, display);
  }, [rates]);

  const isStale = lastUpdated !== null && (Date.now() - lastUpdated) > STALE_THRESHOLD_MS;

  // Compatibility bridge: a number of older DRIGHT components still call the
  // pure formatCurrency(amount) helper instead of consuming this context. Clone
  // the existing child element when display currency/rates change so those
  // components re-render and pick up the new runtime preference. This preserves
  // component state because the element type/key do not change; it is not a DOM
  // text-replacement hack and it does not mutate stored monetary values.
  const renderedChildren = useMemo(
    () => (isValidElement(children) ? cloneElement(children) : children),
    [children, selectedCurrency, lastUpdated],
  );

  return (
    <CurrencyContext.Provider value={{
      selectedCurrency,
      setCurrency,
      convert,
      format,
      formatInCurrency,
      rates,
      lastUpdated,
      isStale,
      loading,
      detectedCurrency,
      baseCurrency: BASE_CURRENCY,
      supportedCurrencies,
    }}>
      {renderedChildren}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (context === undefined) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
}

export { SUPPORTED_CURRENCIES, BASE_CURRENCY, CURRENCY_CHANGE_EVENT };
