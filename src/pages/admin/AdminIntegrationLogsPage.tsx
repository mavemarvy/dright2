import { useState, useMemo } from 'react';
import { useProviderLogs } from '../../lib/integrationHooks';
import { LOG_ACTION_LABELS } from '../../lib/integrationTypes';
import { PageHeader, LoadingBar } from '../../components/admin/RbacComponents';
import { Search } from 'lucide-react';

export default function AdminIntegrationLogsPage() {
  const { logs, loading } = useProviderLogs(200);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [resultFilter, setResultFilter] = useState('all');

  const allActions = useMemo(() => {
    const set = new Set(logs.map((l) => l.action));
    return Array.from(set).sort();
  }, [logs]);

  const filtered = useMemo(() => {
    let result = logs;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((l) =>
        (l.provider?.provider_name ?? '').toLowerCase().includes(q) ||
        (l.provider_key ?? '').toLowerCase().includes(q) ||
        (l.admin?.email ?? '').toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q)
      );
    }
    if (actionFilter !== 'all') result = result.filter((l) => l.action === actionFilter);
    if (resultFilter !== 'all') result = result.filter((l) => l.result === resultFilter);
    return result;
  }, [logs, search, actionFilter, resultFilter]);

  const successCount = filtered.filter((l) => l.result === 'success').length;
  const failureCount = filtered.filter((l) => l.result !== 'success').length;

  return (
    <div className="p-4 md:p-8">
      <PageHeader title="Integration Audit Logs" subtitle="Every integration event — configuration changes, connection tests, and errors" />

      {loading && <LoadingBar />}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <p className="text-2xl font-bold text-gray-900">{filtered.length}</p>
          <p className="text-xs text-gray-400">Total Events</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <p className="text-2xl font-bold text-green-600">{successCount}</p>
          <p className="text-xs text-gray-400">Successful</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <p className="text-2xl font-bold text-red-600">{failureCount}</p>
          <p className="text-xs text-gray-400">Failures</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by provider, admin, or action..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
          <option value="all">All Actions</option>
          {allActions.map((a) => <option key={a} value={a}>{LOG_ACTION_LABELS[a] ?? a}</option>)}
        </select>
        <select value={resultFilter} onChange={(e) => setResultFilter(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
          <option value="all">All Results</option>
          <option value="success">Success</option>
          <option value="failure">Failure</option>
        </select>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Provider</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Action</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Admin</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Result</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">Error</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 && !loading && (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400">No audit events found</td></tr>
              )}
              {filtered.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{log.provider?.provider_name ?? log.provider_key ?? 'Unknown'}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-gray-700">{LOG_ACTION_LABELS[log.action] ?? log.action}</span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-gray-500">{log.admin?.email ?? 'System'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs border ${
                      log.result === 'success' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'
                    }`}>{log.result}</span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-xs text-red-500 truncate max-w-[200px]">{log.error_message ?? '—'}</td>
                  <td className="px-4 py-3 text-right text-xs text-gray-400">{new Date(log.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
