import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { supabase } from '../lib/supabase';

type VisibilityMap = Record<string, boolean>;

interface NavigationVisibilityContextValue {
  visibility: VisibilityMap;
  ready: boolean;
  error: string | null;
  isVisible: (featureKey: string) => boolean;
  refresh: () => Promise<void>;
}

const CACHE_KEY = 'dright:user-navigation-visibility:v1';

function readCache(): VisibilityMap {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as VisibilityMap : {};
  } catch {
    return {};
  }
}

function writeCache(value: VisibilityMap) {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(value));
  } catch {
    // Local storage is only a performance cache; Supabase remains authoritative.
  }
}

const NavigationVisibilityContext = createContext<NavigationVisibilityContextValue | undefined>(undefined);

export function NavigationVisibilityProvider({ children }: { children: ReactNode }) {
  const [visibility, setVisibility] = useState<VisibilityMap>(() => readCache());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from('user_navigation_visibility')
      .select('feature_key, visible')
      .order('sort_order', { ascending: true });

    if (fetchError) {
      setError('Navigation visibility could not be refreshed.');
      setReady(true);
      return;
    }

    const next = Object.fromEntries(
      (data || []).map(row => [String(row.feature_key), row.visible !== false]),
    ) as VisibilityMap;

    setVisibility(next);
    writeCache(next);
    setError(null);
    setReady(true);
  }, []);

  useEffect(() => {
    void refresh();

    const channel = supabase
      .channel('user-navigation-visibility-global')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_navigation_visibility' },
        () => {
          void refresh();
        },
      )
      .subscribe();

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  const isVisible = useCallback(
    (featureKey: string) => visibility[featureKey] !== false,
    [visibility],
  );

  const value = useMemo(
    () => ({ visibility, ready, error, isVisible, refresh }),
    [visibility, ready, error, isVisible, refresh],
  );

  return (
    <NavigationVisibilityContext.Provider value={value}>
      {children}
    </NavigationVisibilityContext.Provider>
  );
}

export function useNavigationVisibility() {
  const context = useContext(NavigationVisibilityContext);
  if (!context) {
    throw new Error('useNavigationVisibility must be used within NavigationVisibilityProvider');
  }
  return context;
}
