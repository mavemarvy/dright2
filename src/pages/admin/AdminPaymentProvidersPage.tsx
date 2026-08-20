import { useState, useEffect, useCallback } from 'react';
import {
  CreditCard, Loader2, Star, ArrowUp, ArrowDown, Check,
  Wrench, Clock, Search, AlertCircle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { fetchPaymentProviders, updateProviderStatus, type PaymentProvider, type ProviderStatus } from '../../lib/paymentProviders';

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
    if (!result.success) {
      setError(result.error || 'Failed to update provider');
    } else {
      setProviders((prev) =>
        prev.map((p) => (p.id === provider.id ? { ...p, status } : p))
      );
    }
    setUpdating(null);
  };

  const handlePriorityChange = async (provider: PaymentProvider, direction: 'up' | 'down') => {
    const sorted = [...providers].sort((a, b) => a.priority - b.priority);
    const idx = sorted.findIndex((p) => p.id === provider.id);
    if (idx === -1) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;

    const a = sorted[idx];
    const b = sorted[swapIdx];
    setUpdating(a.id);
    await supabase.from('payment_providers').update({ priority: b.priority, updated_at: new Date().toISOString() }).eq('id', a.id);
    await supabase.from('payment_providers').update({ priority: a.priority, updated_at: new Date().toISOString() }).eq('id', b.id);
    await load();
    setUpdating(null);
  };

  const handleToggleRecommended = async (provider: PaymentProvider) => {
    setUpdating(provider.id);
    // Unset all others, set this one
    await supabase.from('payment_providers').update({ is_recommended: false }).neq('id', provider.id);
    await supabase.from('payment_providers').update({ is_recommended: !provider.is_recommended, updated_at: new Date().toISOString() }).eq('id', provider.id);
    await load();
    setUpdating(null);
  };

  const filtered = providers.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.slug.toLowerCase().includes(search.toLowerCase())
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
          <p className="text-sm text-gray-500">Manage global payment gateway configuration</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-500" />
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search providers..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      {/* Provider List */}
      <div className="space-y-3">
        {filtered.map((provider) => {
          const statusCfg = STATUS_CONFIG[provider.status] || STATUS_CONFIG.coming_soon;
          const StatusIcon = statusCfg.icon;
          return (
            <div key={provider.id} className="bg-white rounded-2xl border border-gray-100 p-4 md:p-5">
              <div className="flex items-start gap-4">
                {/* Priority drag handle + arrows */}
                <div className="flex flex-col items-center gap-1 pt-1">
                  <button
                    onClick={() => handlePriorityChange(provider, 'up')}
                    className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                    disabled={updating === provider.id}
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-bold text-gray-400">{provider.priority}</span>
                  <button
                    onClick={() => handlePriorityChange(provider, 'down')}
                    className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                    disabled={updating === provider.id}
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                </div>

                {/* Provider info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-gray-900">{provider.name}</span>
                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${statusCfg.bg} ${statusCfg.color}`}>
                      <StatusIcon className="w-2.5 h-2.5" />
                      {statusCfg.label}
                    </span>
                    {provider.is_recommended && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                        <Star className="w-2.5 h-2.5 fill-emerald-600" />
                        Recommended
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{provider.description}</p>

                  {/* Capabilities */}
                  <div className="flex items-center gap-3 mt-2 flex-wrap text-xs">
                    <div className="flex items-center gap-1">
                      <span className="text-gray-400">Countries:</span>
                      <span className="text-gray-600 font-medium">{provider.supported_countries.join(', ') || '—'}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-gray-400">Currencies:</span>
                      <span className="text-gray-600 font-medium">{provider.supported_currencies.join(', ') || '—'}</span>
                    </div>
                  </div>
                  {provider.sub_methods && provider.sub_methods.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      {provider.sub_methods.map((m: string) => (
                        <span key={m} className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{m}</span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2 items-end">
                  {updating === provider.id ? (
                    <Loader2 className="w-4 h-4 animate-spin text-primary-500" />
                  ) : (
                    <>
                      {/* Status dropdown */}
                      <div className="flex gap-1">
                        {provider.status !== 'enabled' && (
                          <button
                            onClick={() => handleStatusChange(provider, 'enabled')}
                            className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold"
                          >
                            Enable
                          </button>
                        )}
                        {provider.status !== 'coming_soon' && (
                          <button
                            onClick={() => handleStatusChange(provider, 'coming_soon')}
                            className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-semibold"
                          >
                            Coming Soon
                          </button>
                        )}
                        {provider.status !== 'maintenance' && (
                          <button
                            onClick={() => handleStatusChange(provider, 'maintenance')}
                            className="px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-semibold"
                          >
                            Maintenance
                          </button>
                        )}
                      </div>
                      <button
                        onClick={() => handleToggleRecommended(provider)}
                        className={`text-xs font-medium px-2 py-1 rounded-lg ${
                          provider.is_recommended
                            ? 'text-amber-600 hover:bg-amber-50'
                            : 'text-gray-400 hover:bg-gray-100'
                        }`}
                      >
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
