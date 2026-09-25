import { formatDisplayCurrency } from '../../lib/currency';
import { useEffect, useState, useMemo } from 'react';
import {
  TrendingUp, Eye, MousePointerClick, DollarSign, Loader2, Search,
  Pause, Play, XCircle, BarChart3, Package, Settings, Save,
  SlidersHorizontal, Mail, Users, Radio,
} from 'lucide-react';
import { useAllCampaigns, useAdminAnalytics, useAllPackages, usePricing, useCampaignActions } from '../../lib/promotionHooks';
import {
  type CampaignStatus, type PromotionPricing, type PromotionPackage,
  updatePricing, updatePackage, deletePackage, createPackage,
} from '../../lib/promotionEngine';
import { formatCurrency } from '../../lib/currency';
import {
  adminUpdatePromotionDistributionSettings,
  adminUpdatePromotionPlacement,
  adminUpdatePromotionTier,
  fetchAdminPromotionDistributionConfig,
  type PromotionDistributionAdminConfig,
  type PromotionTierCode,
} from '../../lib/universalPromotion';

const STATUS_STYLES: Record<CampaignStatus, { bg: string; text: string; label: string }> = {
  pending: { bg: 'bg-amber-50', text: 'text-amber-600', label: 'Pending' },
  active: { bg: 'bg-green-50', text: 'text-green-600', label: 'Active' },
  paused: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Paused' },
  expired: { bg: 'bg-gray-50', text: 'text-gray-400', label: 'Expired' },
  cancelled: { bg: 'bg-red-50', text: 'text-red-500', label: 'Cancelled' },
  rejected: { bg: 'bg-red-50', text: 'text-red-500', label: 'Rejected' },
};

export default function AdminPromotionsPage() {
  const [tab, setTab] = useState<'campaigns' | 'pricing' | 'distribution' | 'packages'>('campaigns');
  const { campaigns, loading } = useAllCampaigns();
  const { analytics } = useAdminAnalytics();
  const actions = useCampaignActions();
    const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | 'all'>('all');


  const filteredCampaigns = useMemo(() => {
    let result = campaigns;
    if (statusFilter !== 'all') result = result.filter(c => c.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(c => c.listing_id.toLowerCase().includes(q) || c.goal.includes(q));
    }
    return result;
  }, [campaigns, statusFilter, search]);

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-blue-500 flex items-center justify-center">
          <TrendingUp className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Promotion Dashboard</h1>
          <p className="text-sm text-gray-500">Manage all advertising campaigns</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-6">
        {([
          { key: 'campaigns', label: 'Campaigns', icon: BarChart3 },
          { key: 'pricing', label: 'Pricing', icon: DollarSign },
          { key: 'distribution', label: 'Distribution', icon: SlidersHorizontal },
          { key: 'packages', label: 'Packages', icon: Package },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* Analytics Summary */}
      {analytics && tab === 'campaigns' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-1"><BarChart3 className="w-4 h-4 text-primary-500" /><span className="text-xs text-gray-400">Total Campaigns</span></div>
            <p className="text-2xl font-bold text-gray-900">{analytics.total_campaigns}</p>
            <p className="text-xs text-green-500">{analytics.active_campaigns} active</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-1"><DollarSign className="w-4 h-4 text-green-500" /><span className="text-xs text-gray-400">Revenue</span></div>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(analytics.total_revenue)}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-1"><Eye className="w-4 h-4 text-blue-500" /><span className="text-xs text-gray-400">Impressions</span></div>
            <p className="text-2xl font-bold text-gray-900">{analytics.total_impressions.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-1"><MousePointerClick className="w-4 h-4 text-purple-500" /><span className="text-xs text-gray-400">Clicks</span></div>
            <p className="text-2xl font-bold text-gray-900">{analytics.total_clicks.toLocaleString()}</p>
            <p className="text-xs text-gray-400">CTR: {analytics.avg_ctr.toFixed(2)}%</p>
          </div>
        </div>
      )}

      {/* Campaigns Tab */}
      {tab === 'campaigns' && (
        <>
          {/* Search + Filter */}
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" placeholder="Search campaigns..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-primary-500" />
            </div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as CampaignStatus | 'all')} className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-primary-500">
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="pending">Pending</option>
              <option value="expired">Expired</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-primary-500 animate-spin" /></div>
          ) : filteredCampaigns.length === 0 ? (
            <div className="text-center py-12 text-gray-400">No campaigns found</div>
          ) : (
            <div className="space-y-3">
              {filteredCampaigns.map(campaign => (
                <div key={campaign.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[campaign.status].bg} ${STATUS_STYLES[campaign.status].text}`}>
                          {STATUS_STYLES[campaign.status].label}
                        </span>
                        <span className="text-xs text-gray-400 capitalize">{campaign.goal.replace(/_/g, ' ')}</span>
                        <span className="text-xs text-gray-400">· {campaign.payment_status}</span>
                      </div>
                      <p className="text-sm font-medium text-gray-900 truncate">Listing: {campaign.listing_id.slice(0, 8)}</p>
                      <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-400">
                        <span>Budget: {formatCurrency(campaign.budget)}</span>
                        <span>Spend: {formatCurrency(campaign.actual_spend)}</span>
                        <span>Impr: {campaign.actual_impressions.toLocaleString()}</span>
                        <span>Clicks: {campaign.actual_clicks.toLocaleString()}</span>
                        <span>Ends: {new Date(campaign.end_date).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {campaign.status === 'active' && (
                        <button onClick={() => actions.pause(campaign.id)} className="p-2 text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors" title="Pause"><Pause className="w-4 h-4" /></button>
                      )}
                      {campaign.status === 'paused' && (
                        <button onClick={() => actions.resume(campaign.id)} className="p-2 text-green-500 bg-green-50 hover:bg-green-100 rounded-lg transition-colors" title="Resume"><Play className="w-4 h-4" /></button>
                      )}
                      {(campaign.status === 'active' || campaign.status === 'paused') && (
                        <button onClick={() => actions.cancel(campaign.id)} className="p-2 text-red-500 bg-red-50 hover:bg-red-100 rounded-lg transition-colors" title="Cancel"><XCircle className="w-4 h-4" /></button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Pricing Tab */}
      {tab === 'pricing' && <PricingEditor />}

      {/* Distribution Tab */}
      {tab === 'distribution' && <DistributionEditor />}

      {/* Packages Tab */}
      {tab === 'packages' && <PackagesEditor />}
    </div>
  );
}

function DistributionEditor() {
  const [config, setConfig] = useState<PromotionDistributionAdminConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState('');
  const [error, setError] = useState('');

  const reload = async () => {
    setLoading(true);
    setError('');
    try {
      setConfig(await fetchAdminPromotionDistributionConfig());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load promotion distribution configuration.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void reload(); }, []);

  if (loading || !config) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-primary-500 animate-spin" /></div>;
  }

  const settings = (config.settings || {}) as Record<string, unknown>;
  const patchSettings = (key: string, value: boolean) => {
    setConfig(current => current ? { ...current, settings: { ...(current.settings || {}), [key]: value } } : current);
  };
  const patchPlacement = (code: string, patch: Record<string, unknown>) => {
    setConfig(current => current ? {
      ...current,
      placements: current.placements.map(item => item.code === code ? { ...item, ...patch } : item),
    } : current);
  };
  const patchTier = (code: PromotionTierCode, patch: Record<string, unknown>) => {
    setConfig(current => current ? {
      ...current,
      tiers: current.tiers.map(item => item.code === code ? { ...item, ...patch } : item),
    } : current);
  };

  const saveSettings = async () => {
    setSavingKey('settings');
    setError('');
    try {
      await adminUpdatePromotionDistributionSettings({
        emailAdsEnabled: Boolean(settings.email_ads_enabled),
        communityAdsEnabled: Boolean(settings.community_ads_enabled),
        externalPlatformsEnabled: Boolean(settings.external_platforms_enabled),
      });
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save delivery switches.');
    } finally {
      setSavingKey('');
    }
  };

  const savePlacement = async (code: string) => {
    const item = config.placements.find(row => row.code === code);
    if (!item) return;
    setSavingKey(`placement:${code}`);
    setError('');
    try {
      await adminUpdatePromotionPlacement({
        code,
        enabled: item.enabled,
        surchargePercent: Number(item.surcharge_percent || 0),
        minimumTierRank: item.minimum_tier_rank,
      });
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save placement.');
    } finally {
      setSavingKey('');
    }
  };

  const saveTier = async (code: PromotionTierCode) => {
    const item = config.tiers.find(row => row.code === code);
    if (!item) return;
    setSavingKey(`tier:${code}`);
    setError('');
    try {
      await adminUpdatePromotionTier({
        code,
        enabled: item.is_enabled,
        pricingMultiplier: Number(item.pricing_multiplier),
        reachMultiplier: Number(item.reach_multiplier),
      });
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save tier.');
    } finally {
      setSavingKey('');
    }
  };

  return (
    <div className="space-y-5">
      {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      <section className="rounded-2xl border border-gray-100 bg-white p-5">
        <div className="flex items-center gap-2">
          <Radio className="h-5 w-5 text-primary-500" />
          <div>
            <h2 className="font-bold text-gray-900">Placement delivery switches</h2>
            <p className="text-xs text-gray-500">These switches immediately control whether DRIGHT may distribute ads through each delivery family.</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {[
            { key: 'email_ads_enabled', label: 'Email Promotions', icon: Mail, note: `${config.promotion_email_subscribers} opted-in subscribers` },
            { key: 'community_ads_enabled', label: 'Community Ads', icon: Users, note: 'Sponsored community discovery inventory' },
            { key: 'external_platforms_enabled', label: 'External Platforms', icon: Radio, note: `${config.telegram_private_subscribers} active Telegram subscribers` },
          ].map(item => (
            <label key={item.key} className="flex items-start justify-between gap-3 rounded-2xl border border-gray-200 p-4">
              <div className="flex min-w-0 gap-3">
                <item.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" />
                <div>
                  <p className="text-sm font-bold text-gray-900">{item.label}</p>
                  <p className="mt-1 text-xs text-gray-500">{item.note}</p>
                </div>
              </div>
              <input type="checkbox" checked={Boolean(settings[item.key])} onChange={e => patchSettings(item.key, e.target.checked)} className="h-5 w-5 accent-primary-600" />
            </label>
          ))}
        </div>
        <button onClick={() => void saveSettings()} disabled={savingKey === 'settings'} className="mt-4 flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
          {savingKey === 'settings' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save delivery switches
        </button>
      </section>

      <section className="rounded-2xl border border-gray-100 bg-white p-5">
        <h2 className="font-bold text-gray-900">Tier delivery & spend multipliers</h2>
        <p className="mt-1 text-xs text-gray-500">Defaults are Normal 1×, Premium 5× and Platinum 25×. Spend intensity controls how quickly budget is consumed per unit; visibility controls delivery priority.</p>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {config.tiers.map(item => (
            <div key={item.code} className="rounded-2xl border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div><p className="font-bold text-gray-900">{item.name}</p><p className="text-[10px] font-bold uppercase text-gray-400">{item.code}</p></div>
                <input type="checkbox" checked={item.is_enabled} onChange={e => patchTier(item.code, { is_enabled: e.target.checked })} className="h-5 w-5 accent-primary-600" />
              </div>
              <label className="mt-4 block text-xs font-semibold text-gray-500">Spend intensity multiplier
                <input type="number" min="0.01" max="100" step="0.25" value={item.pricing_multiplier} onChange={e => patchTier(item.code, { pricing_multiplier: Number(e.target.value) })} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
              </label>
              <label className="mt-3 block text-xs font-semibold text-gray-500">Visibility / delivery multiplier
                <input type="number" min="0.01" max="1000" step="0.25" value={item.reach_multiplier} onChange={e => patchTier(item.code, { reach_multiplier: Number(e.target.value) })} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
              </label>
              <button onClick={() => void saveTier(item.code)} disabled={savingKey === `tier:${item.code}`} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-primary-200 bg-primary-50 px-3 py-2 text-xs font-bold text-primary-700 disabled:opacity-50">
                {savingKey === `tier:${item.code}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save tier
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-gray-100 bg-white p-5">
        <h2 className="font-bold text-gray-900">Placement percentage add-ons</h2>
        <p className="mt-1 text-xs text-gray-500">Each selected placement adds this percentage of the advertiser's media budget. With ten placements at 1% and a $5 media budget, the placement add-on is $0.50 and the subtotal is $5.50 before any configured platform fee or tax.</p>
        <div className="mt-4 space-y-2">
          {config.placements.map(item => (
            <div key={item.code} className="grid gap-3 rounded-2xl border border-gray-200 p-3 sm:grid-cols-[minmax(0,1fr)_120px_90px] sm:items-center">
              <div className="min-w-0">
                <div className="flex items-center gap-2"><p className="truncate text-sm font-bold text-gray-900">{item.name}</p><span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">{item.code}</span></div>
                <p className="mt-1 line-clamp-1 text-xs text-gray-500">{item.description}</p>
                <label className="mt-2 flex items-center gap-2 text-xs text-gray-500"><input type="checkbox" checked={item.enabled} onChange={e => patchPlacement(item.code, { enabled: e.target.checked })} className="accent-primary-600" /> Enabled</label>
              </div>
              <label className="text-xs font-semibold text-gray-500">Add-on %
                <input type="number" min="0" max="100" step="0.25" value={item.surcharge_percent} onChange={e => patchPlacement(item.code, { surcharge_percent: Number(e.target.value) })} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
              </label>
              <button onClick={() => void savePlacement(item.code)} disabled={savingKey === `placement:${item.code}`} className="flex items-center justify-center gap-1 rounded-xl bg-gray-950 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                {savingKey === `placement:${item.code}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function PricingEditor() {
  const { pricing, loading } = usePricing();
  const [form, setForm] = useState<PromotionPricing | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  if (loading || !pricing) return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-primary-500 animate-spin" /></div>;
  if (!form) setForm(pricing);

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    await updatePricing(form);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const fields: { key: keyof PromotionPricing; label: string; prefix?: string }[] = [
    { key: 'cost_per_impression', label: 'Cost per Impression', prefix: 'USD' },
    { key: 'cost_per_100_impressions', label: 'Cost per 100 Impressions', prefix: 'USD' },
    { key: 'cost_per_1000_impressions', label: 'Cost per 1,000 Impressions (CPM)', prefix: 'USD' },
    { key: 'cost_per_click', label: 'Cost per Click (CPC)', prefix: 'USD' },
    { key: 'cost_per_reach', label: 'Cost per Reach', prefix: 'USD' },
    { key: 'daily_minimum_budget', label: 'Daily Minimum Budget', prefix: 'USD' },
    { key: 'maximum_campaign_budget', label: 'Maximum Campaign Budget', prefix: 'USD' },
    { key: 'default_ctr', label: 'Default CTR (0-1)' },
    { key: 'default_conversion_rate', label: 'Default Conversion Rate (0-1)' },
  ];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 max-w-2xl">
      <div className="flex items-center gap-2 mb-4">
        <Settings className="w-5 h-5 text-gray-400" />
        <h2 className="font-bold text-gray-900">Pricing Configuration</h2>
      </div>
      <div className="space-y-4">
        {fields.map(f => (
          <div key={f.key}>
            <label className="text-sm text-gray-500 block mb-1">{f.label}</label>
            <div className="flex items-center gap-2">
              {f.prefix && <span className="text-lg font-bold text-gray-400">{f.prefix}</span>}
              <input
                type="number"
                step="0.01"
                value={form?.[f.key] ?? 0}
                onChange={e => setForm(prev => prev ? { ...prev, [f.key]: Number(e.target.value) } : prev)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-primary-500"
              />
            </div>
          </div>
        ))}
        <div>
          <label className="text-sm text-gray-500 block mb-1">Currency</label>
          <select value={form?.currency || 'USD'} onChange={e => setForm(prev => prev ? { ...prev, currency: e.target.value } : prev)} className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-primary-500">
            <option value="USD">USD ($)</option>
            <option value="EUR">EUR (€)</option>
            <option value="GBP">GBP (£)</option>
            <option value="NGN">NGN (₦)</option>
          </select>
        </div>
      </div>
      <button onClick={handleSave} disabled={saving} className="mt-4 flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-semibold hover:bg-primary-700 disabled:opacity-50 transition-colors">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {saving ? 'Saving...' : 'Save Pricing'}
      </button>
      {saved && <span className="ml-3 text-sm text-green-500">Saved!</span>}
    </div>
  );
}

function PackagesEditor() {
  const { packages, loading, refetch } = useAllPackages();
  const [editing, setEditing] = useState<PromotionPackage | null>(null);
  const [showNew, setShowNew] = useState(false);

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-primary-500 animate-spin" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-gray-900">Promotion Packages</h2>
        <button onClick={() => setShowNew(true)} className="px-3 py-2 bg-primary-600 text-white rounded-xl text-sm font-medium hover:bg-primary-700 transition-colors">
          + New Package
        </button>
      </div>
      <div className="space-y-3">
        {packages.map(pkg => (
          <div key={pkg.id} className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-gray-900">{pkg.name} {!pkg.is_active && <span className="text-xs text-gray-400">(inactive)</span>}</p>
                <p className="text-xs text-gray-400">{pkg.description}</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">{formatDisplayCurrency(Number(pkg.price))}</span>
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">{pkg.estimated_reach.toLocaleString()} reach</span>
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">{pkg.duration_days} days</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEditing(pkg)} className="px-3 py-1.5 text-xs font-medium text-primary-600 bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors">Edit</button>
                <button onClick={async () => { await deletePackage(pkg.id); refetch(); }} className="px-3 py-1.5 text-xs font-medium text-red-500 bg-red-50 hover:bg-red-100 rounded-lg transition-colors">Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {(editing || showNew) && (
        <PackageEditorModal
          pkg={editing}
          onClose={() => { setEditing(null); setShowNew(false); }}
          onSaved={() => { setEditing(null); setShowNew(false); refetch(); }}
        />
      )}
    </div>
  );
}

function PackageEditorModal({ pkg, onClose, onSaved }: { pkg: PromotionPackage | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: pkg?.name || '',
    description: pkg?.description || '',
    price: pkg?.price || 5,
    estimated_reach: pkg?.estimated_reach || 500,
    estimated_impressions: pkg?.estimated_impressions || 2500,
    estimated_clicks: pkg?.estimated_clicks || 50,
    duration_days: pkg?.duration_days || 1,
    bonus_impressions: pkg?.bonus_impressions || 0,
    bonus_recommendation_exposure: pkg?.bonus_recommendation_exposure || false,
    is_active: pkg?.is_active ?? true,
    sort_order: pkg?.sort_order || 0,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    if (pkg) {
      await updatePackage(pkg.id, form);
    } else {
      await createPackage(form as Omit<PromotionPackage, 'id'>);
    }
    setSaving(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">{pkg ? 'Edit Package' : 'New Package'}</h3>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600"><XCircle className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-3">
          <input type="text" placeholder="Package name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-primary-500" />
          <input type="text" placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-primary-500" />
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-gray-400">Price ($)</label><input type="number" step="0.01" value={form.price} onChange={e => setForm({ ...form, price: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-primary-500" /></div>
            <div><label className="text-xs text-gray-400">Duration (days)</label><input type="number" value={form.duration_days} onChange={e => setForm({ ...form, duration_days: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-primary-500" /></div>
            <div><label className="text-xs text-gray-400">Est. Reach</label><input type="number" value={form.estimated_reach} onChange={e => setForm({ ...form, estimated_reach: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-primary-500" /></div>
            <div><label className="text-xs text-gray-400">Est. Impressions</label><input type="number" value={form.estimated_impressions} onChange={e => setForm({ ...form, estimated_impressions: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-primary-500" /></div>
            <div><label className="text-xs text-gray-400">Est. Clicks</label><input type="number" value={form.estimated_clicks} onChange={e => setForm({ ...form, estimated_clicks: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-primary-500" /></div>
            <div><label className="text-xs text-gray-400">Bonus Impressions</label><input type="number" value={form.bonus_impressions} onChange={e => setForm({ ...form, bonus_impressions: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-primary-500" /></div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={form.bonus_recommendation_exposure} onChange={e => setForm({ ...form, bonus_recommendation_exposure: e.target.checked })} className="accent-primary-600" />
            Bonus recommendation exposure
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} className="accent-primary-600" />
            Active
          </label>
        </div>
        <div className="px-6 py-4 border-t border-gray-100">
          <button onClick={handleSave} disabled={saving} className="w-full py-2.5 bg-primary-600 text-white rounded-xl text-sm font-semibold hover:bg-primary-700 disabled:opacity-50 transition-colors">
            {saving ? 'Saving...' : 'Save Package'}
          </button>
        </div>
      </div>
    </div>
  );
}
