import { useState, useMemo } from 'react';
import { useMarketingCampaigns, usePromotionStatistics, updateMarketingCampaign } from '../../lib/crmHooks';
import { CAMPAIGN_TYPES, CAMPAIGN_STATUS_LABELS } from '../../lib/crmTypes';
import type { MarketingCampaign, PromotionStatistic } from '../../lib/crmTypes';
import { PageHeader, LoadingBar } from '../../components/admin/RbacComponents';
import { TrendingUp, MousePointer, Eye, Target, DollarSign, BarChart3, X, Lightbulb } from 'lucide-react';

export default function AdminMarketingDashboardPage() {
  const { campaigns, loading, refetch } = useMarketingCampaigns();
  const { stats } = usePromotionStatistics();
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [tab, setTab] = useState<'overview' | 'performance'>('overview');
  const [selectedCampaign, setSelectedCampaign] = useState<MarketingCampaign | null>(null);
  const [adminNote, setAdminNote] = useState('');
  const [action, setAction] = useState('');

  const filtered = useMemo(() => {
    return campaigns.filter((c) => {
      if (statusFilter && c.status !== statusFilter) return false;
      if (typeFilter && c.campaign_type !== typeFilter) return false;
      return true;
    });
  }, [campaigns, statusFilter, typeFilter]);

  const statsForCampaign = (campaignId: string): PromotionStatistic | null => {
    return stats.find((s) => s.campaign_id === campaignId) ?? null;
  };

  const totalImpressions = stats.reduce((s, st) => s + Number(st.impressions), 0);
  const totalClicks = stats.reduce((s, st) => s + Number(st.clicks), 0);
  const totalConversions = stats.reduce((s, st) => s + Number(st.conversions), 0);
  const totalRevenue = stats.reduce((s, st) => s + Number(st.revenue_generated), 0);
  const totalSpent = campaigns.reduce((s, c) => s + Number(c.spent), 0);
  const avgCTR = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const avgConversionRate = totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0;
  const roi = totalSpent > 0 ? ((totalRevenue - totalSpent) / totalSpent) * 100 : 0;

  return (
    <div className="p-4 md:p-8">
      <PageHeader title="Marketing & Promotions" subtitle="Overview of sponsored products, services, jobs, campaigns, coupons, and promotions with performance metrics" />

      {loading && <LoadingBar />}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-100 mb-6">
        <TabBtn active={tab === 'overview'} onClick={() => setTab('overview')} icon={<BarChart3 className="w-4 h-4" />} label="Promotions Overview" />
        <TabBtn active={tab === 'performance'} onClick={() => setTab('performance')} icon={<TrendingUp className="w-4 h-4" />} label="Advertisement Performance" />
      </div>

      {tab === 'overview' && (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <StatCard icon={<Eye className="w-5 h-5" />} label="Total Impressions" value={totalImpressions.toLocaleString()} color="bg-blue-50 text-blue-600" />
            <StatCard icon={<MousePointer className="w-5 h-5" />} label="Total Clicks" value={totalClicks.toLocaleString()} color="bg-primary-50 text-primary-600" />
            <StatCard icon={<Target className="w-5 h-5" />} label="Conversions" value={totalConversions.toLocaleString()} color="bg-green-50 text-green-600" />
            <StatCard icon={<DollarSign className="w-5 h-5" />} label="Revenue" value={`$${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 0 })}`} color="bg-amber-50 text-amber-600" />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-4">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="">All Statuses</option>
              {Object.entries(CAMPAIGN_STATUS_LABELS).map(([val, label]) => <option key={val} value={val}>{label}</option>)}
            </select>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="">All Types</option>
              {CAMPAIGN_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          {/* Campaigns Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Campaign</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Type</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">Impressions</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">Clicks</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 hidden xl:table-cell">CTR</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 hidden xl:table-cell">Conversions</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Budget</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">Expiry</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.length === 0 && !loading && (
                    <tr><td colSpan={9} className="text-center py-8 text-gray-400">No campaigns found</td></tr>
                  )}
                  {filtered.map((c) => {
                    const cs = statsForCampaign(c.id);
                    const impressions = cs?.impressions ?? 0;
                    const clicks = cs?.clicks ?? 0;
                    const ctr = impressions > 0 ? ((clicks / impressions) * 100).toFixed(2) : '0.00';
                    const conversions = cs?.conversions ?? 0;
                    const remaining = Number(c.budget) - Number(c.spent);
                    return (
                      <tr key={c.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedCampaign(c)}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">{c.campaign_name}</p>
                          <p className="text-xs text-gray-400">{c.owner?.full_name ?? c.owner?.email ?? 'No owner'}</p>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <span className="px-2 py-0.5 rounded-full text-xs bg-gray-50 text-gray-600 border border-gray-100">
                            {CAMPAIGN_TYPES.find((t) => t.value === c.campaign_type)?.label ?? c.campaign_type}
                          </span>
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell text-gray-600">{impressions.toLocaleString()}</td>
                        <td className="px-4 py-3 hidden lg:table-cell text-gray-600">{clicks.toLocaleString()}</td>
                        <td className="px-4 py-3 hidden xl:table-cell text-gray-600">{ctr}%</td>
                        <td className="px-4 py-3 hidden xl:table-cell text-gray-600">{conversions}</td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <p className="text-gray-700">${Number(c.budget).toLocaleString(undefined, { minimumFractionDigits: 0 })}</p>
                          <p className="text-xs text-gray-400">${remaining.toLocaleString(undefined, { minimumFractionDigits: 0 })} left</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs border ${
                            c.status === 'active' ? 'bg-green-50 text-green-700 border-green-200' :
                            c.status === 'paused' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                            c.status === 'completed' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                            'bg-gray-50 text-gray-600 border-gray-200'
                          }`}>{CAMPAIGN_STATUS_LABELS[c.status] ?? c.status}</span>
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell text-gray-400 text-xs">
                          {c.end_date ? new Date(c.end_date).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === 'performance' && (
        <>
          {/* Performance Summary */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <StatCard icon={<MousePointer className="w-5 h-5" />} label="Avg CTR" value={`${avgCTR.toFixed(2)}%`} color="bg-primary-50 text-primary-600" />
            <StatCard icon={<Target className="w-5 h-5" />} label="Conversion Rate" value={`${avgConversionRate.toFixed(2)}%`} color="bg-green-50 text-green-600" />
            <StatCard icon={<DollarSign className="w-5 h-5" />} label="Total Revenue" value={`$${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 0 })}`} color="bg-amber-50 text-amber-600" />
            <StatCard icon={<TrendingUp className="w-5 h-5" />} label="ROI" value={`${roi.toFixed(1)}%`} color={roi >= 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'} />
          </div>

          {/* Underperforming Campaigns */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-4">
            <h3 className="font-semibold text-sm text-gray-900 mb-3 flex items-center gap-2"><Lightbulb className="w-4 h-4 text-amber-500" /> Performance Analysis</h3>
            <div className="space-y-2">
              {filtered.filter((c) => c.status === 'active').map((c) => {
                const cs = statsForCampaign(c.id);
                const ctr = cs && cs.impressions > 0 ? (cs.clicks / cs.impressions) * 100 : 0;
                const isUnderperforming = ctr < 1.0 && (cs?.impressions ?? 0) > 100;
                return (
                  <div key={c.id} className={`p-3 rounded-xl border ${isUnderperforming ? 'border-amber-200 bg-amber-50' : 'border-gray-100 bg-gray-50'}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-900">{c.campaign_name}</span>
                      {isUnderperforming && <span className="text-xs text-amber-600 font-medium">Underperforming</span>}
                    </div>
                    <div className="flex gap-4 text-xs text-gray-500">
                      <span>CTR: {ctr.toFixed(2)}%</span>
                      <span>Revenue: ${Number(cs?.revenue_generated ?? 0).toLocaleString()}</span>
                      <span>Remaining: ${(Number(c.budget) - Number(c.spent)).toLocaleString()}</span>
                    </div>
                    {isUnderperforming && (
                      <button onClick={() => { setSelectedCampaign(c); setAction('suggest_improvements'); }}
                        className="mt-2 text-xs text-primary-600 hover:underline">Suggest improvements →</button>
                    )}
                  </div>
                );
              })}
              {filtered.filter((c) => c.status === 'active').length === 0 && (
                <p className="text-sm text-gray-400">No active campaigns to analyze</p>
              )}
            </div>
          </div>
        </>
      )}

      {/* Campaign Action Modal */}
      {selectedCampaign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => { setSelectedCampaign(null); setAdminNote(''); setAction(''); }}>
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">{selectedCampaign.campaign_name}</h2>
              <button onClick={() => { setSelectedCampaign(null); setAdminNote(''); setAction(''); }} className="p-2 hover:bg-gray-100 rounded-xl"><X className="w-4 h-4" /></button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Owner</span><span className="text-gray-800">{selectedCampaign.owner?.email ?? '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Budget / Spent</span><span className="text-gray-800">${Number(selectedCampaign.budget).toLocaleString()} / ${Number(selectedCampaign.spent).toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Status</span><span className="text-gray-800">{CAMPAIGN_STATUS_LABELS[selectedCampaign.status] ?? selectedCampaign.status}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">End Date</span><span className="text-gray-800">{selectedCampaign.end_date ? new Date(selectedCampaign.end_date).toLocaleDateString() : '—'}</span></div>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700">Admin Action</label>
                <select value={action} onChange={(e) => setAction(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                  <option value="">Select an action...</option>
                  <option value="contact_advertiser">Contact Advertiser</option>
                  <option value="suggest_improvements">Suggest Improvements</option>
                  <option value="recommend_higher_tier">Recommend Higher Tier</option>
                  <option value="extend_campaign">Extend Campaign</option>
                  <option value="add_notes">Add Notes</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Notes</label>
                <textarea value={adminNote} onChange={(e) => setAdminNote(e.target.value)} rows={3} placeholder="Add notes about this campaign..."
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => { setSelectedCampaign(null); setAdminNote(''); setAction(''); }} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl">Close</button>
              <button onClick={async () => {
                try {
                  const updates: Partial<MarketingCampaign> = {};
                  if (action === 'extend_campaign' && selectedCampaign.end_date) {
                    const d = new Date(selectedCampaign.end_date);
                    d.setDate(d.getDate() + 14);
                    updates.end_date = d.toISOString();
                  }
                  if (action === 'recommend_higher_tier') updates.is_paid = true;
                  if (Object.keys(updates).length > 0) await updateMarketingCampaign(selectedCampaign.id, updates);
                  void refetch();
                  setSelectedCampaign(null); setAdminNote(''); setAction('');
                } catch { /* ignore */ }
              }} className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl">Apply Action</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${active ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
      {icon} {label}
    </button>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${color}`}>{icon}</div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-lg font-bold text-gray-900">{value}</p>
    </div>
  );
}
