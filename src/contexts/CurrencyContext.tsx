import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { SUPPORTED_CURRENCIES, getCurrencyInfo } from '../lib/currency';

const BASE_CURRENCY = 'USD';
const RATES_CACHE_KEY = 'dright_exchange_rates';
const CURRENCY_PREF_KEY = 'dright_selected_currency';
const COUNTRY_CACHE_KEY = 'dright_detected_country';
const REFRESH_INTERVAL_MS = 20 * 60 * 1000; // 20 minutes
const STALE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour
const CURRENCY_CHANGE_EVENT = 'dright-currency-changed';

type Rates = Record<string, number>;

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
  supportedCurrencies: typeof SUPPORTED_CURRENCIES;
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
  try {
    return localStorage.getItem(CURRENCY_PREF_KEY) || BASE_CURRENCY;
  } catch {
    return BASE_CURRENCY;
  }
}

const FALLBACK_RATES: Rates = {
  USD: 1, NGN: 1600, EUR: 0.92, GBP: 0.79, GHS: 15.5, KES: 129, ZAR: 18.5,
  CAD: 1.36, AUD: 1.52, INR: 83.5, XOF: 600, UGX: 3800, TZS: 2530, JPY: 149,
  SGD: 1.35, AED: 3.67, BRL: 4.95, MXN: 17.2, EGP: 30.9,
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
  JP: 'JPY', SG: 'SGD', AE: 'AED', IN: 'INR', AU: 'AUD',
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

  // On mount: load cached rates, detect currency, then fetch fresh
  useEffect(() => {
    const cached = loadCachedRates();
    if (cached) {
      setRates(cached.rates);
      setLastUpdated(cached.timestamp);
    } else {
      setRates(FALLBACK_RATES);
    }

    // Auto-detect recommended currency from timezone (only if no saved preference)
    if (!localStorage.getItem(CURRENCY_PREF_KEY)) {
      const detected = detectCurrencyFromTimezone();
      if (detected) {
        setDetectedCurrency(detected);
        // Check if user has a DB-saved preference first (handled below)
      }
    }

    // Detect country for storage
    try {
      const cachedCountry = localStorage.getItem(COUNTRY_CACHE_KEY);
      if (cachedCountry) {
        const country = cachedCountry;
        const currency = COUNTRY_TO_CURRENCY[country];
        if (currency) setDetectedCurrency(currency);
      }
    } catch { /* ignore */ }

    refreshRates();
    intervalRef.current = setInterval(refreshRates, REFRESH_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refreshRates]);

  // Load user's DB-saved currency preference on auth change
  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user || !active) return;
      const { data } = await supabase
        .from('users')
        .select('preferred_currency, location')
        .eq('id', session.user.id)
        .maybeSingle();

      if (!active) return;

      if (data?.preferred_currency) {
        setSelectedCurrency(data.preferred_currency);
        localStorage.setItem(CURRENCY_PREF_KEY, data.preferred_currency);
      } else if (data?.location) {
        // No explicit currency preference — use location to recommend
        const loc = data.location.toLowerCase();
        const entry = Object.entries(COUNTRY_TO_CURRENCY).find(([c]) => loc.includes(c.toLowerCase()));
        if (entry && !localStorage.getItem(CURRENCY_PREF_KEY)) {
          setDetectedCurrency(entry[1]);
        }
      }
    })();

    const { data: authSub } = supabase.auth.onAuthStateChange(() => {
      // Re-run when auth state changes
      (async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user || !active) return;
        const { data: userData } = await supabase
          .from('users')
          .select('preferred_currency')
          .eq('id', session.user.id)
          .maybeSingle();
        if (active && userData?.preferred_currency) {
          setSelectedCurrency(userData.preferred_currency);
          localStorage.setItem(CURRENCY_PREF_KEY, userData.preferred_currency);
        }
      })();
    });

    return () => {
      active = false;
      authSub?.subscription?.unsubscribe();
    };
  }, []);

  // Persist currency preference to localStorage immediately
  useEffect(() => {
    localStorage.setItem(CURRENCY_PREF_KEY, selectedCurrency);
  }, [selectedCurrency]);

  // Broadcast currency changes to other tabs/components
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(CURRENCY_CHANGE_EVENT, {
      detail: { currency: selectedCurrency },
    }));
  }, [selectedCurrency]);

  // Listen for currency changes from other tabs
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === CURRENCY_PREF_KEY && e.newValue) {
        setSelectedCurrency(e.newValue);
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const setCurrency = useCallback((code: string) => {
    setSelectedCurrency(code);
    localStorage.setItem(CURRENCY_PREF_KEY, code);
    // Persist to database if user is logged in
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          await supabase
            .from('users')
            .update({ preferred_currency: code })
            .eq('id', session.user.id);
          // Also upsert to user_currency_preferences table
          await supabase
            .from('user_currency_preferences')
            .upsert({
              user_id: session.user.id,
              currency: code,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'user_id' });
        }
      } catch { /* non-critical */ }
    })();
  }, []);

  const convert = useCallback((amount: number, fromCurrency: string = BASE_CURRENCY): number => {
    if (fromCurrency === selectedCurrency) return amount;
    const fromRate = rates[fromCurrency];
    const toRate = rates[selectedCurrency];
    if (!fromRate || !toRate) return amount;
    return (amount / fromRate) * toRate;
  }, [rates, selectedCurrency]);

  const format = useCallback((amount: number, fromCurrency: string = BASE_CURRENCY): string => {
    const converted = convert(amount, fromCurrency);
    const info = getCurrencyInfo(selectedCurrency);
    try {
      return new Intl.NumberFormat(info.locale, {
        style: 'currency',
        currency: info.code,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(converted);
    } catch {
      return `${info.symbol}${converted.toFixed(2)}`;
    }
  }, [convert, selectedCurrency]);

  // Format in a specific display currency (not the user's selected one)
  const formatInCurrency = useCallback((
    amount: number,
    displayCurrency: string,
    fromCurrency: string = BASE_CURRENCY,
  ): string => {
    let converted = amount;
    if (fromCurrency !== displayCurrency) {
      const fromRate = rates[fromCurrency];
      const toRate = rates[displayCurrency];
      if (fromRate && toRate) {
        converted = (amount / fromRate) * toRate;
      }
    }
    const info = getCurrencyInfo(displayCurrency);
    try {
      return new Intl.NumberFormat(info.locale, {
        style: 'currency',
        currency: info.code,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(converted);
    } catch {
      return `${info.symbol}${converted.toFixed(2)}`;
    }
  }, [rates]);

  const isStale = lastUpdated !== null && (Date.now() - lastUpdated) > STALE_THRESHOLD_MS;

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
      supportedCurrencies: SUPPORTED_CURRENCIES,
    }}>
      {children}
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
