import { useState, useMemo } from 'react';
import { useIntegrationProviders, useHealthChecks, toggleProviderEnabled, testProviderConnection, setDefaultProvider, logProviderEvent } from '../../lib/integrationHooks';
import { CATEGORY_LABELS, CATEGORY_ORDER, CATEGORY_ICONS, CONNECTION_INDICATORS, HEALTH_COLORS, HEALTH_LABELS, ENVIRONMENT_LABELS, type ProviderCategory, type IntegrationProvider } from '../../lib/integrationTypes';
import { useAuth } from '../../contexts/AuthContext';
import { PageHeader, LoadingBar } from '../../components/admin/RbacComponents';
import { Brain, CreditCard, Mail, MessageSquare, Phone, MessageCircle, ShieldCheck, Bell, Database, BarChart3, Palette, Settings, Plug, Zap, Check, AlertTriangle, Power, Star, Activity, Search, RefreshCw } from 'lucide-react';
import ProviderConfigModal from './AdminIntegrationProviderDetailPage';

const ICON_MAP: Record<string, React.ElementType> = {
  Brain, CreditCard, Mail, MessageSquare, Phone, MessageCircle, ShieldCheck, Bell, Database, BarChart3, Palette, Settings,
};

export default function AdminIntegrationHubPage() {
  const { providers, loading, refetch } = useIntegrationProviders();
  const { checks } = useHealthChecks();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<ProviderCategory | 'all'>('all');
  const [selectedProvider, setSelectedProvider] = useState<IntegrationProvider | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  const healthMap = useMemo(() => {
    const map: Record<string, typeof checks[number]> = {};
    for (const c of checks) {
      if (!map[c.provider_id] || new Date(c.checked_at) > new Date(map[c.provider_id].checked_at)) {
        map[c.provider_id] = c;
      }
    }
    return map;
  }, [checks]);

  const filtered = useMemo(() => {
    let result = providers;
    if (activeCategory !== 'all') result = result.filter((p) => p.category === activeCategory);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((p) => p.provider_name.toLowerCase().includes(q) || p.provider_key.toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q));
    }
    return result;
  }, [providers, activeCategory, search]);

  const stats = useMemo(() => {
    const enabled = providers.filter((p) => p.is_enabled).length;
    const connected = providers.filter((p) => p.is_connected).length;
    const healthy = providers.filter((p) => healthMap[p.id]?.health_status === 'healthy').length;
    const failed = providers.filter((p) => p.is_enabled && healthMap[p.id]?.health_status === 'down').length;
    return { total: providers.length, enabled, connected, healthy, failed };
  }, [providers, healthMap]);

  const getConnectionState = (p: IntegrationProvider): keyof typeof CONNECTION_INDICATORS => {
    if (!p.is_enabled) return 'disabled';
    if (p.is_connected && healthMap[p.id]?.health_status !== 'down') return 'connected';
    if (healthMap[p.id]?.health_status === 'down') return 'failed';
    return 'needs_config';
  };

  const handleToggle = async (p: IntegrationProvider) => {
    setToggling(p.id);
    try {
      await toggleProviderEnabled(p.id, !p.is_enabled);
      await logProviderEvent({
        provider_id: p.id,
        provider_key: p.provider_key,
        admin_id: user?.id,
        action: p.is_enabled ? 'provider_disabled' : 'provider_enabled',
      });
      void refetch();
    } catch { /* ignore */ }
    setToggling(null);
  };

  const handleTest = async (p: IntegrationProvider) => {
    setTesting(p.id);
    try {
      await testProviderConnection(p, user?.id ?? '');
      void refetch();
    } catch { /* ignore */ }
    setTesting(null);
  };

  const handleSetDefault = async (p: IntegrationProvider) => {
    try {
      await setDefaultProvider(p.category, p.id);
      await logProviderEvent({
        provider_id: p.id,
        provider_key: p.provider_key,
        admin_id: user?.id,
        action: 'default_changed',
      });
      void refetch();
    } catch { /* ignore */ }
  };

  return (
    <div className="p-4 md:p-8">
      <PageHeader title="Integration Hub" subtitle="Centralized management for all third-party service providers" action={
        <button onClick={() => void refetch()} className="flex items-center gap-2 px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl hover:bg-gray-50">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      } />

      {loading && <LoadingBar />}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <StatTile icon={<Plug className="w-5 h-5" />} label="Total Providers" value={stats.total} color="bg-blue-50 text-blue-600" />
        <StatTile icon={<Power className="w-5 h-5" />} label="Enabled" value={stats.enabled} color="bg-green-50 text-green-600" />
        <StatTile icon={<Check className="w-5 h-5" />} label="Connected" value={stats.connected} color="bg-primary-50 text-primary-600" />
        <StatTile icon={<Activity className="w-5 h-5" />} label="Healthy" value={stats.healthy} color="bg-emerald-50 text-emerald-600" />
        <StatTile icon={<AlertTriangle className="w-5 h-5" />} label="Failed" value={stats.failed} color="bg-red-50 text-red-600" />
      </div>

      {/* Search + Category Filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search providers..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          <CategoryPill label="All" active={activeCategory === 'all'} onClick={() => setActiveCategory('all')} />
          {CATEGORY_ORDER.map((cat) => (
            <CategoryPill key={cat} label={CATEGORY_LABELS[cat]} active={activeCategory === cat} onClick={() => setActiveCategory(cat)} />
          ))}
        </div>
      </div>

      {/* Provider Grid */}
      {filtered.length === 0 && !loading ? (
        <div className="text-center py-12 text-gray-400">No providers found</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((p) => {
            const conn = getConnectionState(p);
            const health = healthMap[p.id]?.health_status ?? 'unknown';
            const IconComp = ICON_MAP[CATEGORY_ICONS[p.category]] ?? Plug;
            return (
              <div key={p.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col gap-3">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center">
                      <IconComp className="w-5 h-5 text-gray-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">{p.provider_name}</p>
                      <p className="text-xs text-gray-400">{CATEGORY_LABELS[p.category]}</p>
                    </div>
                  </div>
                  {p.is_default && (
                    <span className="flex items-center gap-1 text-xs text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full">
                      <Star className="w-3 h-3" /> Default
                    </span>
                  )}
                </div>

                {/* Description */}
                <p className="text-xs text-gray-500 line-clamp-2">{p.description ?? 'No description'}</p>

                {/* Status Indicators */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs border ${CONNECTION_INDICATORS[conn].color}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${CONNECTION_INDICATORS[conn].dot}`} />
                    {CONNECTION_INDICATORS[conn].label}
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border bg-gray-50 text-gray-600 border-gray-200">
                    <span className={`w-1.5 h-1.5 rounded-full ${HEALTH_COLORS[health]}`} />
                    {HEALTH_LABELS[health]}
                  </span>
                </div>

                {/* Environment + Features */}
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <span className="px-2 py-0.5 rounded bg-gray-100">{ENVIRONMENT_LABELS[p.environment as keyof typeof ENVIRONMENT_LABELS] ?? p.environment}</span>
                  <span>{p.supported_features.length} features</span>
                </div>

                {/* Last Health Check */}
                {healthMap[p.id] && (
                  <p className="text-xs text-gray-400">Last check: {new Date(healthMap[p.id].checked_at).toLocaleString()}</p>
                )}

                {/* Actions */}
                <div className="flex items-center gap-1.5 mt-auto pt-2 border-t border-gray-50">
                  <button onClick={() => setSelectedProvider(p)} className="flex-1 px-2 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 rounded-lg">
                    Configure
                  </button>
                  <button
                    onClick={() => void handleTest(p)}
                    disabled={testing === p.id}
                    className="px-2 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-50"
                  >
                    {testing === p.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => void handleToggle(p)}
                    disabled={toggling === p.id}
                    className={`px-2 py-1.5 rounded-lg disabled:opacity-50 ${p.is_enabled ? 'text-red-600 hover:bg-red-50' : 'text-green-600 hover:bg-green-50'}`}
                  >
                    <Power className="w-3.5 h-3.5" />
                  </button>
                  {!p.is_default && p.is_enabled && (
                    <button onClick={() => void handleSetDefault(p)} className="px-2 py-1.5 text-xs font-medium text-amber-600 hover:bg-amber-50 rounded-lg" title="Set as default">
                      <Star className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedProvider && (
        <ProviderConfigModal provider={selectedProvider} onClose={() => { setSelectedProvider(null); void refetch(); }} />
      )}
    </div>
  );
}

function StatTile({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${color}`}>{icon}</div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-400">{label}</p>
    </div>
  );
}

function CategoryPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
        active ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
      }`}
    >
      {label}
    </button>
  );
}
