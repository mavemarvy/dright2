import { useState, useMemo } from 'react';
import { useMarketplaceModeration, updateModerationItem } from '../../lib/rbacHooks';
import type { MarketplaceModerationItem } from '../../lib/rbacTypes';
import { MODERATION_STATUS_LABELS } from '../../lib/rbacTypes';
import { PageHeader, LoadingBar, EmptyState, StatusChip, StatCard } from '../../components/admin/RbacComponents';
import { Shield, Clock, CheckCircle, XCircle, AlertCircle, Info } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export default function AdminModerationCenterPage() {
  const [tab, setTab] = useState('pending_review');
  const { items, loading, refetch } = useMarketplaceModeration(tab === 'all' ? undefined : tab);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ pending: 0, under_review: 0, approved: 0, rejected: 0 });

  useMemo(() => {
    (async () => {
      const { count: pending } = await supabase.from('marketplace_moderation').select('*', { count: 'exact', head: true }).eq('status', 'pending_review').eq('is_deleted', false);
      const { count: underReview } = await supabase.from('marketplace_moderation').select('*', { count: 'exact', head: true }).eq('status', 'under_review').eq('is_deleted', false);
      const { count: approved } = await supabase.from('marketplace_moderation').select('*', { count: 'exact', head: true }).eq('status', 'approved').eq('is_deleted', false);
      const { count: rejected } = await supabase.from('marketplace_moderation').select('*', { count: 'exact', head: true }).eq('status', 'rejected').eq('is_deleted', false);
      setStats({ pending: pending ?? 0, under_review: underReview ?? 0, approved: approved ?? 0, rejected: rejected ?? 0 });
    })();
  }, [loading]);

  const handleAction = async (item: MarketplaceModerationItem, status: MarketplaceModerationItem['status'], reason?: string) => {
    setError(null);
    try {
      const updates: Partial<MarketplaceModerationItem> = { status };
      if (status === 'rejected' && reason) updates.rejection_reason = reason;
      if (status === 'revision_requested' && reason) updates.revision_notes = reason;
      if (status === 'under_review') updates.review_started_at = new Date().toISOString();
      if (status === 'approved' || status === 'rejected') updates.review_completed_at = new Date().toISOString();
      await updateModerationItem(item.id, updates);
      void refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    }
  };

  const tabs = [
    { key: 'pending_review', label: 'Pending Review' },
    { key: 'under_review', label: 'Under Review' },
    { key: 'approved', label: 'Approved' },
    { key: 'rejected', label: 'Rejected' },
    { key: 'revision_requested', label: 'Revision Requested' },
    { key: 'all', label: 'All' },
  ];

  return (
    <div className="p-4 md:p-8">
      <PageHeader title="Moderation Center" subtitle="Review and moderate marketplace listings across products, services, jobs, and campaigns" />

      {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Pending Review" value={stats.pending} icon={<Clock className="w-5 h-5 text-amber-500" />} color="text-amber-500" bg="bg-amber-50" />
        <StatCard label="Under Review" value={stats.under_review} icon={<AlertCircle className="w-5 h-5 text-blue-500" />} color="text-blue-500" bg="bg-blue-50" />
        <StatCard label="Approved" value={stats.approved} icon={<CheckCircle className="w-5 h-5 text-green-500" />} color="text-green-500" bg="bg-green-50" />
        <StatCard label="Rejected" value={stats.rejected} icon={<XCircle className="w-5 h-5 text-red-500" />} color="text-red-500" bg="bg-red-50" />
      </div>

      <div className="flex gap-1 mb-4 border-b border-gray-100 overflow-x-auto">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${tab === t.key ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading && <LoadingBar />}

      {!loading && items.length === 0 ? (
        <EmptyState message="No items in this queue" icon={<Shield className="w-12 h-12" />} />
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Entity ID</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Priority</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Submitted</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3"><span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-gray-50 text-gray-600 border-gray-200">{item.entity_type}</span></td>
                    <td className="px-4 py-3 text-sm text-gray-500 font-mono">{item.entity_id.slice(0, 8)}...</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${item.priority === 'urgent' ? 'bg-red-50 text-red-700 border-red-200' : item.priority === 'high' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                        {item.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3"><StatusChip status={item.status} labels={MODERATION_STATUS_LABELS} /></td>
                    <td className="px-4 py-3 text-sm text-gray-400">{new Date(item.submitted_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {item.status === 'pending_review' && (
                          <button onClick={() => handleAction(item, 'under_review')} className="px-2.5 py-1 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50">Start Review</button>
                        )}
                        {(item.status === 'pending_review' || item.status === 'under_review') && (
                          <>
                            <button onClick={() => handleAction(item, 'approved')} className="px-2.5 py-1 text-xs font-medium text-green-600 border border-green-200 rounded-lg hover:bg-green-50">Approve</button>
                            <button onClick={() => { const r = prompt('Rejection reason:'); if (r) handleAction(item, 'rejected', r); }} className="px-2.5 py-1 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50">Reject</button>
                            <button onClick={() => { const r = prompt('Revision notes:'); if (r) handleAction(item, 'revision_requested', r); }} className="px-2.5 py-1 text-xs font-medium text-orange-600 border border-orange-200 rounded-lg hover:bg-orange-50">Return</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-blue-700">Users see: "Your submission is currently under review. Reviews may take a few hours and up to 7 days depending on workload."</p>
      </div>
    </div>
  );
}
