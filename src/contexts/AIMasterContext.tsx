import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { BrainCircuit, Power } from 'lucide-react';
import { supabase } from '../lib/supabase';

type AIMasterState = {
  enabled: boolean;
  disabledMessage: string;
  loading: boolean;
  refresh: () => Promise<void>;
};

const AIMasterContext = createContext<AIMasterState>({
  enabled: true,
  disabledMessage: 'AI features are temporarily turned off by DRIGHT.',
  loading: true,
  refresh: async () => undefined,
});

export function AIMasterProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState(true);
  const [disabledMessage, setDisabledMessage] = useState('AI features are temporarily turned off by DRIGHT.');
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const { data, error } = await supabase.rpc('get_ai_master_status');
    if (!error && data && typeof data === 'object') {
      const row = data as Record<string, unknown>;
      setEnabled(row.enabled !== false);
      setDisabledMessage(String(row.disabled_message || 'AI features are temporarily turned off by DRIGHT.'));
    }
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
    const channel = supabase
      .channel('ai-master-settings-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ai_master_settings' }, () => void refresh())
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, []);

  const value = useMemo(() => ({ enabled, disabledMessage, loading, refresh }), [enabled, disabledMessage, loading]);

  return <AIMasterContext.Provider value={value}>{children}</AIMasterContext.Provider>;
}

export function useAIMaster() {
  return useContext(AIMasterContext);
}

export function AIMasterGate({
  children,
  compact = false,
}: {
  children: React.ReactNode;
  compact?: boolean;
}) {
  const { enabled, disabledMessage, loading } = useAIMaster();

  if (loading) return null;
  if (enabled) return <>{children}</>;

  if (compact) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
        <span className="inline-flex items-center gap-1.5 font-semibold">
          <Power className="h-3.5 w-3.5" /> AI is currently off
        </span>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[55vh] max-w-2xl items-center justify-center p-5">
      <div className="w-full rounded-3xl border border-gray-200 bg-white p-7 text-center shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-300">
          <BrainCircuit className="h-7 w-7" />
        </div>
        <h1 className="mt-4 text-xl font-black text-gray-950 dark:text-white">DRIGHT AI is turned off</h1>
        <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">{disabledMessage}</p>
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          Chat, AI analysis, AI images, AI moderation, AI recommendations and other AI-powered tools stay unavailable until an authorized administrator turns the master switch back on.
        </p>
      </div>
    </div>
  );
}
