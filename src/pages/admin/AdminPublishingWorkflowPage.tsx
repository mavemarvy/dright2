import { useState, useEffect } from 'react';
import { usePublishingWorkflow, updatePublishingStatus } from '../../lib/rbacHooks';
import { PUBLISHING_STATUS_LABELS } from '../../lib/rbacTypes';
import type { PublishingWorkflowItem } from '../../lib/rbacTypes';
import { PageHeader, LoadingBar, EmptyState, StatusChip, StatCard } from '../../components/admin/RbacComponents';
import { FileEdit, Clock, CheckCircle, Archive, Send, Check, X, Calendar } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export default function AdminPublishingWorkflowPage() {
  const [tab, setTab] = useState('pending_review');
  const { items, loading, refetch } = usePublishingWorkflow(tab === 'all' ? undefined : tab);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ draft: 0, pending_review: 0, published: 0, scheduled: 0 });

  useEffect(() => {
    (async () => {
      const { count: draft } = await supabase.from('publishing_workflow').select('*', { count: 'exact', head: true }).eq('status', 'draft').eq('is_deleted', false);
      const { count: pending } = await supabase.from('publishing_workflow').select('*', { count: 'exact', head: true }).eq('status', 'pending_review').eq('is_deleted', false);
      const { count: published } = await supabase.from('publishing_workflow').select('*', { count: 'exact', head: true }).eq('status', 'published').eq('is_deleted', false);
      const { count: scheduled } = await supabase.from('publishing_workflow').select('*', { count: 'exact', head: true }).eq('status', 'scheduled').eq('is_deleted', false);
      setStats({ draft: draft ?? 0, pending_review: pending ?? 0, published: published ?? 0, scheduled: scheduled ?? 0 });
    })();
  }, [loading]);

  const handleAction = async (item: PublishingWorkflowItem, status: PublishingWorkflowItem['status'], notes?: string) => {
    setError(null);
    try {
      await updatePublishingStatus(item.id, status, notes);
      void refetch();
    } catch (e) { setError(e instanceof Error ? e.message : 'Action failed'); }
  };

  const tabs = [
    { key: 'draft', label: 'Drafts' },
    { key: 'pending_review', label: 'Pending Review' },
    { key: 'approved', label: 'Approved' },
    { key: 'published', label: 'Published' },
    { key: 'scheduled', label: 'Scheduled' },
    { key: 'archived', label: 'Archived' },
    { key: 'all', label: 'All' },
  ];

  return (
    <div className="p-4 md:p-8">
      <PageHeader title="Publishing Workflow" subtitle="Manage CMS content through draft, review, approval, and publishing lifecycle" />

      {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Drafts" value={stats.draft} icon={<FileEdit className="w-5 h-5 text-gray-500" />} color="text-gray-500" bg="bg-gray-50" />
        <StatCard label="Pending Review" value={stats.pending_review} icon={<Clock className="w-5 h-5 text-amber-500" />} color="text-amber-500" bg="bg-amber-50" />
        <StatCard label="Published" value={stats.published} icon={<CheckCircle className="w-5 h-5 text-green-500" />} color="text-green-500" bg="bg-green-50" />
        <StatCard label="Scheduled" value={stats.scheduled} icon={<Calendar className="w-5 h-5 text-blue-500" />} color="text-blue-500" bg="bg-blue-50" />
      </div>

      <div className="flex gap-1 mb-4 border-b border-gray-100 overflow-x-auto">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${tab === t.key ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{t.label}</button>
        ))}
      </div>

      {loading && <LoadingBar />}

      {!loading && items.length === 0 ? (
        <EmptyState message="No content in this stage" icon={<FileEdit className="w-12 h-12" />} />
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Entity ID</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Version</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Updated</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3"><span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-gray-50 text-gray-600 border-gray-200">{item.entity_type}</span></td>
                    <td className="px-4 py-3 text-sm text-gray-500 font-mono">{item.entity_id.slice(0, 8)}...</td>
                    <td className="px-4 py-3"><StatusChip status={item.status} labels={PUBLISHING_STATUS_LABELS} /></td>
                    <td className="px-4 py-3 text-sm text-gray-400">v{item.version}</td>
                    <td className="px-4 py-3 text-sm text-gray-400">{new Date(item.updated_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {item.status === 'draft' && <button onClick={() => handleAction(item, 'pending_review')} className="px-2.5 py-1 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 flex items-center gap-1"><Send className="w-3 h-3" /> Submit</button>}
                        {item.status === 'pending_review' && (
                          <>
                            <button onClick={() => handleAction(item, 'approved')} className="px-2.5 py-1 text-xs font-medium text-green-600 border border-green-200 rounded-lg hover:bg-green-50 flex items-center gap-1"><Check className="w-3 h-3" /> Approve</button>
                            <button onClick={() => { const r = prompt('Rejection reason:'); if (r) handleAction(item, 'draft', r); }} className="px-2.5 py-1 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 flex items-center gap-1"><X className="w-3 h-3" /> Reject</button>
                          </>
                        )}
                        {item.status === 'approved' && <button onClick={() => handleAction(item, 'published')} className="px-2.5 py-1 text-xs font-medium text-green-600 border border-green-200 rounded-lg hover:bg-green-50 flex items-center gap-1"><Check className="w-3 h-3" /> Publish</button>}
                        {(item.status === 'published' || item.status === 'approved') && <button onClick={() => handleAction(item, 'archived')} className="px-2.5 py-1 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center gap-1"><Archive className="w-3 h-3" /> Archive</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-6 bg-gray-50 rounded-2xl p-4">
        <h4 className="font-semibold text-sm text-gray-700 mb-2">Publishing Workflow</h4>
        <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
          <span className="px-2 py-1 bg-white rounded-lg border border-gray-200">Create</span> →
          <span className="px-2 py-1 bg-white rounded-lg border border-gray-200">Save Draft</span> →
          <span className="px-2 py-1 bg-white rounded-lg border border-gray-200">Submit for Review</span> →
          <span className="px-2 py-1 bg-white rounded-lg border border-gray-200">Approve</span> →
          <span className="px-2 py-1 bg-white rounded-lg border border-gray-200">Publish</span>
        </div>
        <p className="text-xs text-gray-400 mt-2">Only authorized roles can publish content. The workflow enforces review at each stage.</p>
      </div>
    </div>
  );
}
