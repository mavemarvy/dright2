import { useState, useMemo } from 'react';
import {
  TrendingUp, Eye, MousePointerClick, DollarSign, Loader2, Search,
  Pause, Play, XCircle, BarChart3, Package, Settings, Save,
} from 'lucide-react';
import { useAllCampaigns, useAdminAnalytics, useAllPackages, usePricing, useCampaignActions } from '../../lib/promotionHooks';
import {
  type CampaignStatus, type PromotionPricing, type PromotionPackage,
  updatePricing, updatePackage, deletePackage, createPackage,
} from '../../lib/promotionEngine';
import { formatCurrency } from '../../lib/currency';

const STATUS_STYLES: Record<CampaignStatus, { bg: string; text: string; label: string }> = {
  pending: { bg: 'bg-amber-50', text: 'text-amber-600', label: 'Pending' },
  active: { bg: 'bg-green-50', text: 'text-green-600', label: 'Active' },
  paused: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Paused' },
  expired: { bg: 'bg-gray-50', text: 'text-gray-400', label: 'Expired' },
  cancelled: { bg: 'bg-red-50', text: 'text-red-500', label: 'Cancelled' },
  rejected: { bg: 'bg-red-50', text: 'text-red-500', label: 'Rejected' },
};

export default function AdminPromotionsPage() {
  const [tab, setTab] = useState<'campaigns' | 'pricing' | 'packages'>('campaigns');
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

      {/* Packages Tab */}
      {tab === 'packages' && <PackagesEditor />}
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
    { key: 'cost_per_impression', label: 'Cost per Impression', prefix: '$' },
    { key: 'cost_per_100_impressions', label: 'Cost per 100 Impressions', prefix: '$' },
    { key: 'cost_per_1000_impressions', label: 'Cost per 1,000 Impressions (CPM)', prefix: '$' },
    { key: 'cost_per_click', label: 'Cost per Click (CPC)', prefix: '$' },
    { key: 'cost_per_reach', label: 'Cost per Reach', prefix: '$' },
    { key: 'daily_minimum_budget', label: 'Daily Minimum Budget', prefix: '$' },
    { key: 'maximum_campaign_budget', label: 'Maximum Campaign Budget', prefix: '$' },
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
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">${pkg.price}</span>
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
