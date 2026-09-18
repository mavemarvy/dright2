import { useCallback, useEffect, useState } from 'react';
import {
  CreditCard, Loader2, Star, ArrowUp, ArrowDown, Check,
  Wrench, Clock, Search, AlertCircle,
} from 'lucide-react';
import {
  fetchPaymentProviders,
  updateProviderStatus,
  updateProviderConfiguration,
  type PaymentProvider,
  type ProviderStatus,
} from '../../lib/paymentProviders';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: typeof Check }> = {
  enabled: { label: 'Active', color: 'text-emerald-700', bg: 'bg-emerald-100', icon: Check },
  coming_soon: { label: 'Coming Soon', color: 'text-gray-500', bg: 'bg-gray-100', icon: Clock },
  maintenance: { label: 'Maintenance', color: 'text-amber-700', bg: 'bg-amber-100', icon: Wrench },
};

export default function AdminPaymentProvidersPage() {
  const [providers, setProviders] = useState<PaymentProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [updating, setUpdating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchPaymentProviders();
    setProviders(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleStatusChange = async (provider: PaymentProvider, status: ProviderStatus) => {
    setUpdating(provider.id);
    setError(null);
    const result = await updateProviderStatus(provider.id, status);
    if (!result.success) setError(result.error || 'Failed to update provider');
    else await load();
    setUpdating(null);
  };

  const handlePriorityChange = async (provider: PaymentProvider, direction: 'up' | 'down') => {
    const sorted = [...providers].sort((a, b) => a.priority - b.priority);
    const index = sorted.findIndex((item) => item.id === provider.id);
    if (index === -1) return;
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= sorted.length) return;

    const current = sorted[index];
    const adjacent = sorted[swapIndex];
    setUpdating(current.id);
    setError(null);

    const first = await updateProviderConfiguration(current.id, { priority: adjacent.priority });
    if (!first.success) {
      setError(first.error || 'Failed to update provider priority');
      setUpdating(null);
      return;
    }

    const second = await updateProviderConfiguration(adjacent.id, { priority: current.priority });
    if (!second.success) setError(second.error || 'Failed to complete provider priority swap');
    await load();
    setUpdating(null);
  };

  const handleToggleRecommended = async (provider: PaymentProvider) => {
    setUpdating(provider.id);
    setError(null);
    const result = await updateProviderConfiguration(provider.id, {
      isRecommended: !provider.is_recommended,
    });
    if (!result.success) setError(result.error || 'Failed to update recommended provider');
    else await load();
    setUpdating(null);
  };

  const filtered = providers.filter((provider) =>
    provider.name.toLowerCase().includes(search.toLowerCase())
    || provider.slug.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-primary-500 animate-spin" /></div>;
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
          <CreditCard className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Payment Providers</h1>
          <p className="text-sm text-gray-500">Manage provider availability and ordering through audited admin permissions</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-100 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-500" />
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search providers..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      <div className="space-y-3">
        {filtered.map((provider) => {
          const statusConfig = STATUS_CONFIG[provider.status] || STATUS_CONFIG.coming_soon;
          const StatusIcon = statusConfig.icon;
          const isFallback = provider.id.startsWith('fb-');

          return (
            <div key={provider.id} className="bg-white rounded-2xl border border-gray-100 p-4 md:p-5">
              <div className="flex items-start gap-4">
                <div className="flex flex-col items-center gap-1 pt-1">
                  <button onClick={() => handlePriorityChange(provider, 'up')} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 disabled:opacity-40" disabled={updating === provider.id || isFallback} aria-label={`Move ${provider.name} up`}>
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-bold text-gray-400">{provider.priority}</span>
                  <button onClick={() => handlePriorityChange(provider, 'down')} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 disabled:opacity-40" disabled={updating === provider.id || isFallback} aria-label={`Move ${provider.name} down`}>
                    <ArrowDown className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-gray-900">{provider.name}</span>
                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${statusConfig.bg} ${statusConfig.color}`}>
                      <StatusIcon className="w-2.5 h-2.5" />
                      {statusConfig.label}
                    </span>
                    {provider.is_recommended && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                        <Star className="w-2.5 h-2.5 fill-emerald-600" /> Recommended
                      </span>
                    )}
                    {isFallback && <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">Fallback only</span>}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{provider.description}</p>
                  <div className="flex items-center gap-3 mt-2 flex-wrap text-xs">
                    <div className="flex items-center gap-1"><span className="text-gray-400">Countries:</span><span className="text-gray-600 font-medium">{provider.supported_countries.join(', ') || '—'}</span></div>
                    <div className="flex items-center gap-1"><span className="text-gray-400">Currencies:</span><span className="text-gray-600 font-medium">{provider.supported_currencies.join(', ') || '—'}</span></div>
                  </div>
                  {provider.sub_methods && provider.sub_methods.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      {provider.sub_methods.map((method) => <span key={method} className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{method}</span>)}
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2 items-end">
                  {updating === provider.id ? (
                    <Loader2 className="w-4 h-4 animate-spin text-primary-500" />
                  ) : (
                    <>
                      <div className="flex gap-1 flex-wrap justify-end">
                        {provider.status !== 'enabled' && <button onClick={() => handleStatusChange(provider, 'enabled')} disabled={isFallback} className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold disabled:opacity-40">Enable</button>}
                        {provider.status !== 'coming_soon' && <button onClick={() => handleStatusChange(provider, 'coming_soon')} disabled={isFallback} className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-semibold disabled:opacity-40">Coming Soon</button>}
                        {provider.status !== 'maintenance' && <button onClick={() => handleStatusChange(provider, 'maintenance')} disabled={isFallback} className="px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-semibold disabled:opacity-40">Maintenance</button>}
                      </div>
                      <button onClick={() => handleToggleRecommended(provider)} disabled={isFallback} className={`text-xs font-medium px-2 py-1 rounded-lg disabled:opacity-40 ${provider.is_recommended ? 'text-amber-600 hover:bg-amber-50' : 'text-gray-400 hover:bg-gray-100'}`}>
                        {provider.is_recommended ? '★ Recommended' : 'Set Recommended'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
