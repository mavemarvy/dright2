import { useState, useMemo } from 'react';
import { useKycComplianceStats, useKycReviewQueue, useKycRules, updateKycRule, useKycAuditLogs } from '../../lib/kycHooks';
import { USER_TYPE_LABELS } from '../../lib/kycTypes';
import { PageHeader, LoadingBar, StatCard } from '../../components/admin/RbacComponents';
import { Clock, CheckCircle, XCircle, AlertCircle, FileX, FileWarning, History, Shield } from 'lucide-react';

export default function AdminComplianceCenterPage() {
  const { stats, loading: statsLoading } = useKycComplianceStats();
  const { rules, loading: rulesLoading, refetch } = useKycRules();
  const { logs, loading: logsLoading } = useKycAuditLogs(undefined, 20);
  const [filterRole, setFilterRole] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterDate, setFilterDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { items: filteredItems, loading: queueLoading } = useKycReviewQueue(filterStatus === 'all' ? undefined : filterStatus);

  const filteredByRole = useMemo(() => {
    if (filterRole === 'all') return filteredItems;
    return filteredItems.filter((i) => i.profile?.user_type === filterRole);
  }, [filteredItems, filterRole]);

  const handleToggleRule = async (ruleId: string, current: boolean) => {
    setError(null);
    try {
      await updateKycRule(ruleId, { is_required: !current });
      void refetch();
    } catch (e) { setError(e instanceof Error ? e.message : 'Update failed'); }
  };

  const loading = statsLoading || rulesLoading || queueLoading || logsLoading;

  return (
    <div className="p-4 md:p-8">
      <PageHeader title="Compliance Center" subtitle="Monitor verification metrics, configure rules, and review audit logs" />

      {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-700">{error}</div>}
      {loading && <LoadingBar />}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <StatCard label="Pending" value={stats.pending} icon={<Clock className="w-5 h-5 text-amber-500" />} color="text-amber-500" bg="bg-amber-50" />
        <StatCard label="Under Review" value={stats.under_review} icon={<AlertCircle className="w-5 h-5 text-blue-500" />} color="text-blue-500" bg="bg-blue-50" />
        <StatCard label="Approved" value={stats.approved} icon={<CheckCircle className="w-5 h-5 text-green-500" />} color="text-green-500" bg="bg-green-50" />
        <StatCard label="Rejected" value={stats.rejected} icon={<XCircle className="w-5 h-5 text-red-500" />} color="text-red-500" bg="bg-red-50" />
        <StatCard label="More Info" value={stats.more_info} icon={<FileWarning className="w-5 h-5 text-orange-500" />} color="text-orange-500" bg="bg-orange-50" />
        <StatCard label="Expired Docs" value={stats.expired} icon={<FileX className="w-5 h-5 text-gray-500" />} color="text-gray-500" bg="bg-gray-50" />
      </div>

      {/* Verification Rules */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
        <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2"><Shield className="w-5 h-5 text-primary-500" /> Verification Rules</h3>
        <p className="text-sm text-gray-500 mb-4">Configure which user types require verification and what action it gates.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {rules.map((rule) => (
            <div key={rule.id} className="border border-gray-100 rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-sm text-gray-900">{USER_TYPE_LABELS[rule.user_type] ?? rule.user_type}</span>
                <button onClick={() => handleToggleRule(rule.id, rule.is_required)}
                  className={`relative w-9 h-5 rounded-full transition-colors ${rule.is_required ? 'bg-primary-500' : 'bg-gray-200'}`}>
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${rule.is_required ? 'left-4' : 'left-0.5'}`} />
                </button>
              </div>
              <p className="text-xs text-gray-400">{rule.description ?? 'No description'}</p>
              {rule.required_for_action && (
                <p className="text-xs text-amber-500 mt-1">Required for: {rule.required_for_action.replace(/_/g, ' ')}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Filtered Queue */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
        <h3 className="font-bold text-gray-900 mb-4">Verification Queue</h3>
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)}
            className="px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
            <option value="all">All Roles</option>
            {Object.entries(USER_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="under_review">Under Review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="more_info_required">More Info Required</option>
          </select>
          <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)}
            className="px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
        {filteredByRole.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No submissions match the filters</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">User</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Role</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Submitted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredByRole.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-mono text-gray-500">{item.user_id.slice(0, 8)}...</td>
                    <td className="px-4 py-3 text-sm text-gray-600 capitalize">{item.profile?.user_type ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{item.status.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3 text-sm text-gray-400">{new Date(item.submitted_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Audit Logs */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2"><History className="w-5 h-5 text-primary-500" /> Recent Audit Logs</h3>
        {logs.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No audit logs yet</p>
        ) : (
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {logs.map((log) => (
              <div key={log.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg">
                <div className="w-2 h-2 rounded-full bg-primary-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700">{log.action.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-gray-400">
                    {new Date(log.created_at).toLocaleString()}
                    {log.entity_type && ` · ${log.entity_type}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
