import { useState, useEffect, useCallback } from 'react';
import {
  Settings, Brain, Zap, CheckCircle,
  Loader2, Star, Clock, Thermometer,
  Gauge, Shield, Activity, TrendingUp, DollarSign, Hash,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  updateProviderConfig, setDefaultProvider,
  updateRateLimit, testProvider,
  type AIProviderConfig, type AIRateLimit,
} from '../../lib/ai/providerManager';

interface ProviderRow extends AIProviderConfig {}

interface RateLimitRow extends AIRateLimit {
  id: string;
}

export default function AdminAIConfigPage() {
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [rateLimits, setRateLimits] = useState<RateLimitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; latency: number; error?: string }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [providerData, limitData] = await Promise.all([
        supabase.from('ai_provider_config').select('*').order('fallback_priority', { ascending: true }),
        supabase.from('ai_rate_limits').select('*').order('tier', { ascending: true }),
      ]);
      setProviders((providerData.data as ProviderRow[]) || []);
      setRateLimits((limitData.data as RateLimitRow[]) || []);
    } catch (err) {
      console.error('Failed to load AI config:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggleProvider = async (provider: string, enabled: boolean) => {
    setSaving(provider);
    try { await updateProviderConfig(provider, { enabled: !enabled }); await load(); } finally { setSaving(null); }
  };

  const handleSetDefault = async (provider: string) => {
    setSaving(provider);
    try { await setDefaultProvider(provider); await load(); } finally { setSaving(null); }
  };

  const handleUpdateProvider = async (provider: string, updates: Partial<AIProviderConfig>) => {
    setSaving(provider);
    try { await updateProviderConfig(provider, updates); await load(); } finally { setSaving(null); }
  };

  const handleTestProvider = async (provider: string, model: string) => {
    setTesting(provider);
    try {
      const result = await testProvider(provider, model);
      setTestResults(prev => ({ ...prev, [provider]: result }));
    } finally { setTesting(null); }
  };

  const handleUpdateRateLimit = async (tier: string, feature: string, field: string, value: number) => {
    setSaving(`rate-${tier}`);
    try { await updateRateLimit(tier, feature, { [field]: value } as any); await load(); } finally { setSaving(null); }
  };

  if (loading) return <div className="p-8 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center">
          <Settings className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">AI Configuration Center</h1>
          <p className="text-sm text-gray-500">Manage AI providers, models, rate limits, and health</p>
        </div>
      </div>

      <div className="mb-6">
        <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2"><Brain className="w-5 h-5 text-purple-500" /> AI Providers</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {providers.map(p => (
            <div key={p.provider} className={`rounded-2xl border p-5 transition-all ${p.is_default ? 'border-purple-300 bg-purple-50/50 ring-1 ring-purple-200' : p.enabled ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50/50'}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${p.enabled ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <span className="font-semibold text-gray-900">{p.display_name}</span>
                  {p.is_default && <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded-full flex items-center gap-1"><Star className="w-3 h-3" /> Default</span>}
                </div>
                <button onClick={() => handleToggleProvider(p.provider, p.enabled)} disabled={saving === p.provider} className={`relative w-10 h-6 rounded-full transition-colors ${p.enabled ? 'bg-green-500' : 'bg-gray-300'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${p.enabled ? 'translate-x-4' : ''}`} />
                </button>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Model</span>
                  <select value={p.default_model} onChange={e => handleUpdateProvider(p.provider, { default_model: e.target.value })} className="text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-purple-500">
                    {p.available_models.map(m => <option key={m.model} value={m.model}>{m.label}</option>)}
                  </select>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 flex items-center gap-1"><Thermometer className="w-3.5 h-3.5" /> Temperature</span>
                  <input type="number" step="0.1" min="0" max="2" value={Number(p.temperature)} onChange={e => handleUpdateProvider(p.provider, { temperature: parseFloat(e.target.value) })} className="w-16 text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-purple-500" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 flex items-center gap-1"><Hash className="w-3.5 h-3.5" /> Max Tokens</span>
                  <input type="number" value={p.max_tokens} onChange={e => handleUpdateProvider(p.provider, { max_tokens: parseInt(e.target.value) || 4096 })} className="w-20 text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-purple-500" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Timeout</span>
                  <input type="number" value={p.timeout_ms} onChange={e => handleUpdateProvider(p.provider, { timeout_ms: parseInt(e.target.value) || 30000 })} className="w-20 text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-purple-500" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 flex items-center gap-1"><Gauge className="w-3.5 h-3.5" /> Fallback Priority</span>
                  <input type="number" value={p.fallback_priority} onChange={e => handleUpdateProvider(p.provider, { fallback_priority: parseInt(e.target.value) || 0 })} className="w-16 text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-purple-500" />
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3">
                {p.supports_streaming && <span className="px-2 py-0.5 text-xs bg-blue-50 text-blue-600 rounded-md">Stream</span>}
                {p.supports_vision && <span className="px-2 py-0.5 text-xs bg-green-50 text-green-600 rounded-md">Vision</span>}
                {p.supports_images && <span className="px-2 py-0.5 text-xs bg-amber-50 text-amber-600 rounded-md">Images</span>}
              </div>
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 text-xs rounded-full ${p.health_status === 'healthy' ? 'bg-green-100 text-green-700' : p.health_status === 'degraded' ? 'bg-amber-100 text-amber-700' : p.health_status === 'down' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>{p.health_status}</span>
                  {testResults[p.provider] && <span className={`text-xs ${testResults[p.provider].ok ? 'text-green-600' : 'text-red-500'}`}>{testResults[p.provider].ok ? `${testResults[p.provider].latency}ms` : 'Failed'}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleTestProvider(p.provider, p.default_model)} disabled={!p.enabled || testing === p.provider} className="text-xs text-purple-600 hover:text-purple-700 flex items-center gap-1 disabled:opacity-50">
                    {testing === p.provider ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />} Test
                  </button>
                  {!p.is_default && p.enabled && <button onClick={() => handleSetDefault(p.provider)} disabled={saving === p.provider} className="text-xs text-purple-600 hover:text-purple-700 flex items-center gap-1"><Star className="w-3 h-3" /> Set Default</button>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
        <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2"><Shield className="w-5 h-5 text-blue-500" /> Rate Limits</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100 text-gray-500">
              <th className="text-left py-2 px-3 font-medium">Tier</th>
              <th className="text-center py-2 px-3 font-medium">Per Minute</th>
              <th className="text-center py-2 px-3 font-medium">Per Hour</th>
              <th className="text-center py-2 px-3 font-medium">Per Day</th>
              <th className="text-center py-2 px-3 font-medium">Burst</th>
              <th className="text-center py-2 px-3 font-medium">Cooldown (s)</th>
            </tr></thead>
            <tbody>
              {rateLimits.map(rl => (
                <tr key={rl.id} className="border-b border-gray-50">
                  <td className="py-2 px-3 font-medium text-gray-900 capitalize">{rl.tier}</td>
                  <td className="py-2 px-3"><input type="number" value={rl.requests_per_minute} onChange={e => handleUpdateRateLimit(rl.tier, rl.feature, 'requests_per_minute', parseInt(e.target.value) || 0)} className="w-16 text-center border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-blue-500" /></td>
                  <td className="py-2 px-3"><input type="number" value={rl.requests_per_hour} onChange={e => handleUpdateRateLimit(rl.tier, rl.feature, 'requests_per_hour', parseInt(e.target.value) || 0)} className="w-20 text-center border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-blue-500" /></td>
                  <td className="py-2 px-3"><input type="number" value={rl.requests_per_day} onChange={e => handleUpdateRateLimit(rl.tier, rl.feature, 'requests_per_day', parseInt(e.target.value) || 0)} className="w-24 text-center border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-blue-500" /></td>
                  <td className="py-2 px-3"><input type="number" value={rl.burst_limit} onChange={e => handleUpdateRateLimit(rl.tier, rl.feature, 'burst_limit', parseInt(e.target.value) || 0)} className="w-14 text-center border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-blue-500" /></td>
                  <td className="py-2 px-3"><input type="number" value={rl.cooldown_seconds} onChange={e => handleUpdateRateLimit(rl.tier, rl.feature, 'cooldown_seconds', parseInt(e.target.value) || 0)} className="w-16 text-center border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-blue-500" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <UsageAnalytics />
    </div>
  );
}

function UsageAnalytics() {
  const [summary, setSummary] = useState<any>(null);
  const [daily, setDaily] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [sumRes, dailyRes] = await Promise.all([
          supabase.rpc('get_ai_marketplace_usage_summary'),
          supabase.rpc('get_ai_usage_daily', { p_days: 7 }),
        ]);
        setSummary(sumRes.data);
        setDaily((dailyRes.data as any[]) || []);
      } catch (err) { console.error('Failed to load usage:', err); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return null;

  const total = summary?.total_requests || 0;
  const tokens = summary?.total_tokens || 0;
  const cost = summary?.estimated_cost || 0;
  const users = summary?.unique_users || 0;
  const successRate = summary?.success_rate || 0;
  const avgLatency = Math.round(summary?.avg_latency_ms || 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard icon={Activity} label="Total Requests" value={total.toLocaleString()} color="purple" />
        <StatCard icon={Hash} label="Tokens Used" value={tokens.toLocaleString()} color="blue" />
        <StatCard icon={DollarSign} label="Est. Cost" value={`$${cost.toFixed(4)}`} color="green" />
        <StatCard icon={TrendingUp} label="Unique Users" value={users.toString()} color="orange" />
        <StatCard icon={CheckCircle} label="Success Rate" value={`${successRate}%`} color="green" />
        <StatCard icon={Clock} label="Avg Latency" value={`${avgLatency}ms`} color="blue" />
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2"><TrendingUp className="w-5 h-5 text-purple-500" /> Daily AI Usage (7 days)</h3>
        <div className="flex items-end gap-2 h-32">
          {daily.map((d, i) => {
            const max = Math.max(...daily.map(x => x.total_requests), 1);
            const height = (d.total_requests / max) * 100;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full bg-purple-100 rounded-t-lg transition-all hover:bg-purple-200" style={{ height: `${Math.max(height, 2)}%` }}>
                  <div className="text-xs text-center text-purple-700 pt-1">{d.total_requests}</div>
                </div>
                <span className="text-xs text-gray-400">{String(d.date).slice(5)}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <h3 className="font-bold text-gray-900 mb-3">By Feature</h3>
          <div className="space-y-2">
            {(summary?.by_feature || []).map((f: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-sm"><span className="text-gray-600">{f.feature}</span><span className="font-medium text-gray-900">{f.requests}</span></div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <h3 className="font-bold text-gray-900 mb-3">By Provider</h3>
          <div className="space-y-2">
            {(summary?.by_provider || []).map((p: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-sm"><span className="text-gray-600 capitalize">{p.provider}</span><span className="font-medium text-gray-900">{p.requests}</span></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  const colorMap: Record<string, string> = { purple: 'bg-purple-50 text-purple-600', blue: 'bg-blue-50 text-blue-600', green: 'bg-green-50 text-green-600', orange: 'bg-orange-50 text-orange-600' };
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${colorMap[color]}`}><Icon className="w-4 h-4" /></div>
      <p className="text-lg font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-400">{label}</p>
    </div>
  );
}
