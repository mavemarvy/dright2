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

interface FeatureVisibility {
  users: boolean;
  admins: boolean;
  scope: string;
}

type VisibilityMap = Record<string, FeatureVisibility>;

interface NavigationVisibilityContextValue {
  visibility: VisibilityMap;
  ready: boolean;
  error: string | null;
  isVisible: (featureKey: string, isAdmin?: boolean) => boolean;
  refresh: () => Promise<void>;
}

const CACHE_KEY = 'dright:user-navigation-visibility:v2';

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
    // Cache failure must never override Supabase as the authoritative source.
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
      .select('feature_key, visible, visible_to_admins, feature_scope')
      .order('sort_order', { ascending: true });

    if (fetchError) {
      setError('Navigation visibility could not be refreshed.');
      setReady(true);
      return;
    }

    const next = Object.fromEntries(
      (data || []).map(row => [
        String(row.feature_key),
        {
          users: row.visible !== false,
          admins: row.visible_to_admins !== false,
          scope: String(row.feature_scope || 'navigation'),
        },
      ]),
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
    (featureKey: string, isAdmin = false) => {
      const rule = visibility[featureKey];
      if (!rule) return true;
      return isAdmin ? rule.admins : rule.users;
    },
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
