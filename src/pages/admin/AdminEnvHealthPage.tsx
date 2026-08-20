import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { getBrowserEnvStatuses, ENV_CATEGORIES } from '../../lib/env';
import { Shield, CheckCircle, XCircle, RefreshCw, AlertTriangle, Lock, Globe } from 'lucide-react';

interface ServerVarStatus {
  key: string;
  label: string;
  category: string;
  serverOnly: boolean;
  description: string;
  present: boolean;
}

interface CategorySummary {
  category: string;
  total: number;
  configured: number;
  missing: number;
  healthy: boolean;
}

interface ServerResponse {
  variables: ServerVarStatus[];
  summary: CategorySummary[];
  timestamp: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  Supabase: 'text-emerald-400 bg-emerald-500/10',
  AI: 'text-purple-400 bg-purple-500/10',
  Email: 'text-blue-400 bg-blue-500/10',
  Push: 'text-orange-400 bg-orange-500/10',
  Cloudflare: 'text-amber-400 bg-amber-500/10',
  Cloudinary: 'text-cyan-400 bg-cyan-500/10',
  Algolia: 'text-pink-400 bg-pink-500/10',
};

export default function AdminEnvHealthPage() {
  const [serverData, setServerData] = useState<ServerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<string | null>(null);

  const browserStatuses = getBrowserEnvStatuses();

  const fetchServerHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('env-health');
      if (invokeError) throw invokeError;
      if (data?.error) throw new Error(data.error);
      setServerData(data as ServerResponse);
      setLastChecked(new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch env health');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchServerHealth();
  }, [fetchServerHealth]);

  const allVars = serverData?.variables ?? [];
  const allCategories = ENV_CATEGORIES.filter((cat) =>
    allVars.some((v) => v.category === cat) || browserStatuses.some((b) => b.category === cat)
  );

  const getCategoryVars = (category: string) => {
    const server = allVars.filter((v) => v.category === category);
    const browser = browserStatuses.filter((b) => b.category === category);
    const seen = new Set<string>();
    const merged: Array<ServerVarStatus & { browserExposed?: boolean }> = [];

    for (const v of server) {
      if (seen.has(v.key)) continue;
      seen.add(v.key);
      merged.push({ ...v, browserExposed: !v.serverOnly });
    }
    for (const b of browser) {
      if (seen.has(b.key)) continue;
      seen.add(b.key);
      merged.push({
        key: b.key,
        label: b.label,
        category: b.category,
        serverOnly: false,
        description: b.description,
        present: b.present,
        browserExposed: true,
      });
    }
    return merged;
  };

  const totalConfigured = allVars.filter((v) => v.present).length + browserStatuses.filter((b) => b.present).length;
  const uniqueKeys = new Set([...allVars.map((v) => v.key), ...browserStatuses.map((b) => b.key)]);
  const overallHealthy = totalConfigured === [...uniqueKeys].length;

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="w-7 h-7 text-warning" />
            Environment Health
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Configuration status for all integrations. Secret values are never shown.
          </p>
        </div>
        <button
          onClick={fetchServerHealth}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-warning text-gray-900 font-medium hover:bg-warning/90 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Overall status banner */}
      <div className={`rounded-xl p-4 mb-6 flex items-center gap-3 ${overallHealthy ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-red-500/10 text-red-700 dark:text-red-400'}`}>
        {overallHealthy ? <CheckCircle className="w-6 h-6" /> : <AlertTriangle className="w-6 h-6" />}
        <div>
          <p className="font-semibold">
            {overallHealthy ? 'All integrations configured' : `${totalConfigured}/${[...uniqueKeys].length} variables configured`}
          </p>
          <p className="text-sm opacity-80">
            {lastChecked ? `Last checked: ${new Date(lastChecked).toLocaleString()}` : 'Not yet checked'}
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl p-4 mb-6 bg-red-500/10 text-red-700 dark:text-red-400 flex items-center gap-3">
          <XCircle className="w-5 h-5" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Category sections */}
      <div className="space-y-6">
        {allCategories.map((category) => {
          const vars = getCategoryVars(category);
          const configuredCount = vars.filter((v) => v.present).length;
          const isHealthy = configuredCount === vars.length;
          const colorClass = CATEGORY_COLORS[category] || 'text-gray-400 bg-gray-500/10';

          return (
            <div key={category} className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 bg-gray-50 dark:bg-gray-800/50">
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${colorClass}`}>
                    {category}
                  </span>
                  <span className="text-sm text-gray-500">
                    {configuredCount}/{vars.length} configured
                  </span>
                </div>
                {isHealthy ? (
                  <span className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                    <CheckCircle className="w-4 h-4" /> Healthy
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400 font-medium">
                    <AlertTriangle className="w-4 h-4" /> Needs attention
                  </span>
                )}
              </div>

              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {vars.map((v) => (
                  <div key={v.key} className="flex items-center gap-4 px-5 py-3">
                    <div className="flex-shrink-0">
                      {v.present ? (
                        <CheckCircle className="w-5 h-5 text-emerald-500" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <code className="text-sm font-mono font-medium">{v.key}</code>
                        {v.serverOnly ? (
                          <span className="flex items-center gap-1 text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
                            <Lock className="w-3 h-3" /> Server only
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">
                            <Globe className="w-3 h-3" /> Browser
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{v.description}</p>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      {v.present ? (
                        <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Configured</span>
                      ) : (
                        <span className="text-xs font-medium text-red-500">Missing</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Configuration errors section */}
      {!loading && !error && serverData && (
        <div className="mt-6 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Configuration Errors
          </h2>
          {allVars.filter((v) => !v.present).length === 0 && browserStatuses.filter((b) => !b.present).length === 0 ? (
            <p className="text-sm text-gray-500">No configuration errors detected. All environment variables are set.</p>
          ) : (
            <ul className="space-y-2">
              {allVars.filter((v) => !v.present).map((v) => (
                <li key={v.key} className="text-sm text-red-600 dark:text-red-400 flex items-start gap-2">
                  <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>
                    <code className="font-mono">{v.key}</code> is missing — {v.description}
                  </span>
                </li>
              ))}
              {browserStatuses.filter((b) => !b.present).map((b) => (
                <li key={b.key} className="text-sm text-red-600 dark:text-red-400 flex items-start gap-2">
                  <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>
                    <code className="font-mono">VITE_{b.key}</code> is missing in .env — {b.description}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
