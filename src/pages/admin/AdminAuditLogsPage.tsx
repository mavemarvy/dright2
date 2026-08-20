import { useState } from 'react';
import {
  History, Loader2, Search, Shield, User,
} from 'lucide-react';
import { useAdminLogs } from '../../lib/adminIntelligenceHooks';

export default function AdminAuditLogsPage() {
  const { logs, loading } = useAdminLogs(100);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');

  const filtered = logs.filter(l => {
    if (actionFilter !== 'all' && l.action !== actionFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return l.action.toLowerCase().includes(q) || (l.target_type || '').toLowerCase().includes(q);
    }
    return true;
  });

  const actions = ['all', ...Array.from(new Set(logs.map(l => l.action)))];

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center">
          <History className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Audit Logs</h1>
          <p className="text-sm text-gray-500">Track all administrative actions</p>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Search logs..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-primary-500" />
        </div>
        <select value={actionFilter} onChange={e => setActionFilter(e.target.value)} className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-primary-500">
          {actions.map(a => <option key={a} value={a}>{a === 'all' ? 'All Actions' : a}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-primary-500 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No audit logs found</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(log => (
            <div key={log.id} className="bg-white rounded-xl border border-gray-100 p-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                <Shield className="w-4 h-4 text-gray-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">
                  <span className="capitalize">{log.action.replace(/_/g, ' ')}</span>
                  {log.target_type && <span className="text-gray-400"> on {log.target_type}</span>}
                </p>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <User className="w-3 h-3" />
                  <span>{log.admin_id.slice(0, 8)}</span>
                  {log.target_id && <span>· Target: {log.target_id.slice(0, 8)}</span>}
                </div>
              </div>
              <span className="text-xs text-gray-400 shrink-0">{new Date(log.created_at).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
