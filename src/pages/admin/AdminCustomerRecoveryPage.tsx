import { useState } from 'react';
import { useRecoveryQueue, updateRecoveryItem } from '../../lib/crmHooks';
import { RECOVERY_REASONS, RECOVERY_OUTCOMES } from '../../lib/crmTypes';
import type { RecoveryQueueItem } from '../../lib/crmTypes';
import { PageHeader, LoadingBar } from '../../components/admin/RbacComponents';
import { AlertCircle, CheckCircle, X, Users, Clock } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export default function AdminCustomerRecoveryPage() {
  const { profile } = useAuth();
  const { items, loading, refetch } = useRecoveryQueue();
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [reasonFilter, setReasonFilter] = useState<string>('');
  const [selected, setSelected] = useState<RecoveryQueueItem | null>(null);
  const [notes, setNotes] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [outcome, setOutcome] = useState('pending');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = items.filter((item) => {
    if (statusFilter && item.status !== statusFilter) return false;
    if (reasonFilter && item.recovery_reason !== reasonFilter) return false;
    return true;
  });

  const stats = {
    total: items.length,
    active: items.filter((i) => i.status === 'active').length,
    recovered: items.filter((i) => i.outcome === 'recovered').length,
    lost: items.filter((i) => i.outcome === 'lost').length,
  };

  const handleSave = async () => {
    if (!selected || !profile) return;
    setSaving(true);
    setError(null);
    try {
      const updates: Partial<RecoveryQueueItem> = {
        admin_notes: notes,
        outcome,
        assigned_admin_id: selected.assigned_admin_id ?? profile.id,
      };
      if (followUp) updates.follow_up_date = new Date(followUp).toISOString();
      await updateRecoveryItem(selected.id, updates);
      void refetch();
      setSelected(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Update failed'); }
    setSaving(false);
  };

  const handleAssign = async (item: RecoveryQueueItem) => {
    if (!profile) return;
    try {
      await updateRecoveryItem(item.id, { assigned_admin_id: profile.id });
      void refetch();
    } catch { /* ignore */ }
  };

  const openDetail = (item: RecoveryQueueItem) => {
    setSelected(item);
    setNotes(item.admin_notes ?? '');
    setFollowUp(item.follow_up_date ? item.follow_up_date.slice(0, 10) : '');
    setOutcome(item.outcome);
    setError(null);
  };

  return (
    <div className="p-4 md:p-8">
      <PageHeader title="Customer Recovery Queue" subtitle="Users needing outreach — expired subscriptions, abandoned purchases, incomplete onboarding, and failed payments" />

      {loading && <LoadingBar />}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <MiniStat icon={<Users className="w-4 h-4" />} label="Total" value={stats.total} color="bg-gray-100 text-gray-600" />
        <MiniStat icon={<Clock className="w-4 h-4" />} label="Active" value={stats.active} color="bg-amber-50 text-amber-600" />
        <MiniStat icon={<CheckCircle className="w-4 h-4" />} label="Recovered" value={stats.recovered} color="bg-green-50 text-green-600" />
        <MiniStat icon={<AlertCircle className="w-4 h-4" />} label="Lost" value={stats.lost} color="bg-red-50 text-red-600" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="resolved">Resolved</option>
        </select>
        <select value={reasonFilter} onChange={(e) => setReasonFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
          <option value="">All Reasons</option>
          {RECOVERY_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </div>

      {/* Queue Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Customer</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Reason</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">Assigned To</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">Follow-up</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Outcome</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 && !loading && (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400">No items in queue</td></tr>
              )}
              {filtered.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{item.user?.full_name ?? item.user?.username ?? 'Unknown'}</p>
                    <p className="text-xs text-gray-400">{item.user?.email}</p>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-600 border border-blue-200">
                      {RECOVERY_REASONS.find((r) => r.value === item.recovery_reason)?.label ?? item.recovery_reason}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-gray-600">
                    {item.assigned_admin ? (item.assigned_admin.full_name ?? item.assigned_admin.email) : <span className="text-gray-300">Unassigned</span>}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-gray-600">
                    {item.follow_up_date ? new Date(item.follow_up_date).toLocaleDateString() : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs border ${
                      item.outcome === 'recovered' ? 'bg-green-50 text-green-700 border-green-200' :
                      item.outcome === 'lost' ? 'bg-red-50 text-red-700 border-red-200' :
                      item.outcome === 'pending' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                      'bg-blue-50 text-blue-700 border-blue-200'
                    }`}>{RECOVERY_OUTCOMES.find((o) => o.value === item.outcome)?.label ?? item.outcome}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      {!item.assigned_admin_id && (
                        <button onClick={() => handleAssign(item)} className="px-2 py-1 text-xs font-medium text-primary-600 border border-primary-200 rounded-lg hover:bg-primary-50">Assign Me</button>
                      )}
                      <button onClick={() => openDetail(item)} className="px-2 py-1 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Manage</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-bold text-gray-900">{selected.user?.full_name ?? selected.user?.username ?? 'Unknown'}</h2>
                <p className="text-xs text-gray-400">{selected.user?.email}</p>
              </div>
              <button onClick={() => setSelected(null)} className="p-2 hover:bg-gray-100 rounded-xl"><X className="w-4 h-4" /></button>
            </div>

            {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-3 text-sm text-red-700">{error}</div>}

            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700">Recovery Reason</label>
                <p className="text-sm text-gray-500 mt-1">{RECOVERY_REASONS.find((r) => r.value === selected.recovery_reason)?.label}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Admin Notes</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Schedule Follow-up</label>
                <input type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Outcome</label>
                <select value={outcome} onChange={(e) => setOutcome(e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                  {RECOVERY_OUTCOMES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setSelected(null)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl disabled:opacity-50">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MiniStat({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color}`}>{icon}</div>
      <div>
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-lg font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );
}
