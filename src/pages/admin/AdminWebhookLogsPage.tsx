import { useState, useEffect, useCallback } from 'react';
import {
  Webhook, Loader2, Search, Check, X, AlertTriangle,
  RefreshCw, Clock, Shield,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface WebhookLog {
  id: string;
  provider: string;
  event_type: string | null;
  reference: string | null;
  headers: Record<string, string>;
  payload: Record<string, unknown>;
  ip_address: string | null;
  signature: string | null;
  verified: boolean;
  processed: boolean;
  duration_ms: number | null;
  retry_count: number;
  error_message: string | null;
  created_at: string;
}

export default function AdminWebhookLogsPage() {
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterVerified, setFilterVerified] = useState<'all' | 'verified' | 'unverified'>('all');
  const [filterProvider, setFilterProvider] = useState('all');
  const [selectedLog, setSelectedLog] = useState<WebhookLog | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('webhook_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (!error && data) {
      setLogs(data as WebhookLog[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const providers = [...new Set(logs.map((l) => l.provider))];

  const filtered = logs.filter((log) => {
    if (search && !log.reference?.toLowerCase().includes(search.toLowerCase()) && !log.event_type?.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterVerified === 'verified' && !log.verified) return false;
    if (filterVerified === 'unverified' && log.verified) return false;
    if (filterProvider !== 'all' && log.provider !== filterProvider) return false;
    return true;
  });

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-primary-500 animate-spin" /></div>;
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
            <Webhook className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Webhook Logs</h1>
            <p className="text-sm text-gray-500">Payment provider webhook events and verification</p>
          </div>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by reference or event type..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <select
          value={filterProvider}
          onChange={(e) => setFilterProvider(e.target.value)}
          className="px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="all">All Providers</option>
          {providers.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select
          value={filterVerified}
          onChange={(e) => setFilterVerified(e.target.value as 'all' | 'verified' | 'unverified')}
          className="px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="all">All</option>
          <option value="verified">Verified</option>
          <option value="unverified">Unverified</option>
        </select>
      </div>

      {/* Log List */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <Webhook className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No webhook logs found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((log) => (
            <button
              key={log.id}
              onClick={() => setSelectedLog(log)}
              className="w-full text-left bg-white rounded-xl border border-gray-100 p-4 hover:border-primary-200 hover:shadow-sm transition-all"
            >
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  log.verified ? 'bg-emerald-100' : 'bg-red-100'
                }`}>
                  {log.verified ? <Check className="w-4 h-4 text-emerald-600" /> : <X className="w-4 h-4 text-red-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900 capitalize">{log.provider}</span>
                    {log.event_type && (
                      <span className="text-xs text-gray-500 font-mono">{log.event_type}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                    {log.reference && <span className="font-mono truncate">{log.reference}</span>}
                    <span className="flex items-center gap-0.5">
                      <Clock className="w-3 h-3" />
                      {new Date(log.created_at).toLocaleString('en-NG', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                    {log.retry_count > 0 && (
                      <span className="flex items-center gap-0.5 text-amber-500">
                        <RefreshCw className="w-3 h-3" />
                        {log.retry_count} retries
                      </span>
                    )}
                    {log.duration_ms !== null && (
                      <span>{log.duration_ms}ms</span>
                    )}
                  </div>
                </div>
                {!log.processed && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                    Unprocessed
                  </span>
                )}
                {log.error_message && (
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedLog(null)}>
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <Webhook className="w-5 h-5 text-primary-500" />
                Webhook Details
              </h3>
              <button onClick={() => setSelectedLog(null)} className="p-2 rounded-lg hover:bg-gray-100">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Provider</p>
                  <p className="font-medium text-gray-900 capitalize">{selectedLog.provider}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Event Type</p>
                  <p className="font-medium text-gray-900 font-mono">{selectedLog.event_type || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Reference</p>
                  <p className="font-medium text-gray-900 font-mono text-xs">{selectedLog.reference || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide">IP Address</p>
                  <p className="font-medium text-gray-900 font-mono text-xs">{selectedLog.ip_address || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Signature</p>
                  <p className="font-medium text-gray-900 font-mono text-xs truncate">{selectedLog.signature || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Duration</p>
                  <p className="font-medium text-gray-900">{selectedLog.duration_ms ? `${selectedLog.duration_ms}ms` : '—'}</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-gray-400" />
                  <span className="text-xs text-gray-500">Verified:</span>
                  <span className={`text-xs font-bold ${selectedLog.verified ? 'text-emerald-600' : 'text-red-500'}`}>
                    {selectedLog.verified ? 'Yes' : 'No'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-500">Processed:</span>
                  <span className={`text-xs font-bold ${selectedLog.processed ? 'text-emerald-600' : 'text-amber-500'}`}>
                    {selectedLog.processed ? 'Yes' : 'No'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-500">Retries:</span>
                  <span className="text-xs font-bold text-gray-700">{selectedLog.retry_count}</span>
                </div>
              </div>

              {selectedLog.error_message && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-100">
                  <p className="text-xs font-semibold text-red-600">Error</p>
                  <p className="text-xs text-red-500 mt-1">{selectedLog.error_message}</p>
                </div>
              )}

              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Headers</p>
                <pre className="text-xs bg-gray-50 rounded-xl p-3 overflow-x-auto font-mono text-gray-600 max-h-32">
                  {JSON.stringify(selectedLog.headers, null, 2)}
                </pre>
              </div>

              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Payload</p>
                <pre className="text-xs bg-gray-50 rounded-xl p-3 overflow-x-auto font-mono text-gray-600 max-h-48">
                  {JSON.stringify(selectedLog.payload, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
