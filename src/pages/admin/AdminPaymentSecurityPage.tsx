import { useCallback, useEffect, useState } from 'react';
import {
  Shield, Lock, Unlock, KeyRound, AlertTriangle,
  Search, RefreshCw, Loader2, CheckCircle, XCircle, Download,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { exportSecurityLogsCSV } from '../../lib/fraudEngine';
import { useAuth } from '../../contexts/AuthContext';

interface SecurityLog {
  id: string; user_id: string; event_type: string; description: string | null;
  metadata: unknown; ip_address: string | null; performed_by: string | null; created_at: string;
}

interface PinAttempt {
  id: string; user_id: string; success: boolean; context: string | null;
  ip_address: string | null; created_at: string;
}

interface PaymentSecRow {
  id: string; user_id: string; is_locked: boolean; failed_attempts: number;
  locked_until: string | null; last_pin_change: string; auth_rules: Record<string, unknown> | null;
  is_active: boolean; created_at: string;
}

interface FraudAlert {
  id: string; user_id: string; alert_type: string; severity: string;
  description: string | null; risk_score: number; ip_address: string | null;
  country: string | null; device_fingerprint: string | null;
  browser: string | null; action_type: string | null;
  is_resolved: boolean; resolved_by?: string | null; resolved_at?: string | null; created_at: string;
}

interface RiskScore {
  user_id: string; risk_score: number; flags: string[]; updated_at: string;
}

interface PlatformSummary {
  total_pins: number; locked_pins: number; total_attempts_24h: number;
  failed_attempts_24h: number; high_risk_users: number;
  unresolved_fraud_alerts: number; recovery_codes_active: number;
  frozen_wallets: number;
}

type Tab = 'overview' | 'logs' | 'attempts' | 'fraud';

export default function AdminPaymentSecurityPage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<SecurityLog[]>([]);
  const [attempts, setAttempts] = useState<PinAttempt[]>([]);
  const [secRows, setSecRows] = useState<PaymentSecRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('overview');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [fraudAlerts, setFraudAlerts] = useState<FraudAlert[]>([]);
  const [riskScores, setRiskScores] = useState<RiskScore[]>([]);
  const [summary, setSummary] = useState<PlatformSummary | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setActionError(null);
    const [logsRes, attemptsRes, secRes, fraudRes, riskRes, summaryRes] = await Promise.all([
      supabase.from('payment_security_logs').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('payment_pin_attempts').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('payment_security').select('id,user_id,is_locked,failed_attempts,locked_until,last_pin_change,auth_rules,is_active,created_at').order('created_at', { ascending: false }).limit(100),
      supabase.from('wallet_fraud_alerts').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('user_risk_scores').select('user_id,risk_score,flags,updated_at').order('updated_at', { ascending: false }).limit(100),
      supabase.rpc('get_admin_payment_security_summary'),
    ]);

    const firstError = logsRes.error || attemptsRes.error || secRes.error || fraudRes.error || riskRes.error || summaryRes.error;
    if (firstError) {
      console.error('Failed to load payment security data:', firstError);
      setActionError(firstError.message);
    }

    setLogs((logsRes.data as SecurityLog[]) || []);
    setAttempts((attemptsRes.data as PinAttempt[]) || []);
    setSecRows((secRes.data as PaymentSecRow[]) || []);
    setFraudAlerts((fraudRes.data as FraudAlert[]) || []);
    setRiskScores((riskRes.data as RiskScore[]) || []);
    setSummary((summaryRes.data as PlatformSummary | null) || null);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleUnlock = async (userId: string) => {
    if (!user?.id) return;
    setActionLoading(userId);
    setActionError(null);
    const { error } = await supabase.rpc('unlock_payment_pin', {
      p_user_id: userId,
      p_admin_id: user.id,
    });
    setActionLoading(null);
    if (error) {
      console.error('Unlock failed:', error);
      setActionError(error.message);
      return;
    }
    await load();
  };

  const handleForceReset = async (userId: string) => {
    if (!user?.id || !window.confirm('Require this user to change their payment PIN before another protected transaction?')) return;
    setActionLoading(userId);
    setActionError(null);
    const { error } = await supabase.rpc('admin_force_payment_pin_reset', { p_user_id: userId });
    setActionLoading(null);
    if (error) {
      console.error('Force reset failed:', error);
      setActionError(error.message);
      return;
    }
    await load();
  };

  const handleResolveFraud = async (alertId: string) => {
    setActionLoading(alertId);
    setActionError(null);
    const { error } = await supabase.rpc('admin_resolve_wallet_fraud_alert', { p_alert_id: alertId });
    setActionLoading(null);
    if (error) {
      console.error('Resolve failed:', error);
      setActionError(error.message);
      return;
    }
    await load();
  };

  const filteredLogs = logs.filter((item) => !search || item.user_id.includes(search) || item.event_type.toLowerCase().includes(search.toLowerCase()));
  const filteredAttempts = attempts.filter((item) => !search || item.user_id.includes(search) || item.context?.toLowerCase().includes(search.toLowerCase()));
  const filteredSec = secRows.filter((item) => !search || item.user_id.includes(search));
  const filteredFraud = fraudAlerts.filter((item) => !search || item.user_id.includes(search) || item.alert_type.toLowerCase().includes(search.toLowerCase()));
  const successRate = attempts.length > 0 ? Math.round((attempts.filter((item) => item.success).length / attempts.length) * 100) : 0;

  const handleExportLogs = () => {
    const csv = exportSecurityLogsCSV(filteredLogs);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `security-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const getRiskColor = (score: number) => {
    if (score >= 70) return 'bg-red-100 text-red-700';
    if (score >= 40) return 'bg-orange-100 text-orange-700';
    if (score >= 20) return 'bg-amber-100 text-amber-700';
    return 'bg-emerald-100 text-emerald-700';
  };

  if (loading) {
    return <div className="p-8 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center">
          <Shield className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Payment Security Center</h1>
          <p className="text-sm text-gray-500">Manage PIN lockouts and investigate payment fraud through audited operations</p>
        </div>
      </div>

      {actionError && (
        <div className="mb-4 p-3 rounded-xl border border-red-100 bg-red-50 text-red-700 text-sm flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard icon={Shield} label="Active PINs" value={summary?.total_pins?.toString() || '0'} color="emerald" />
        <StatCard icon={Lock} label="Locked PINs" value={summary?.locked_pins?.toString() || '0'} color="red" />
        <StatCard icon={AlertTriangle} label="Failed 24h" value={summary?.failed_attempts_24h?.toString() || '0'} color="amber" />
        <StatCard icon={AlertTriangle} label="High Risk Users" value={summary?.high_risk_users?.toString() || '0'} color="red" />
        <StatCard icon={CheckCircle} label="Attempt Success" value={`${successRate}%`} color="blue" />
        <StatCard icon={KeyRound} label="Recovery Codes" value={summary?.recovery_codes_active?.toString() || '0'} color="emerald" />
        <StatCard icon={Lock} label="Frozen Wallets" value={summary?.frozen_wallets?.toString() || '0'} color="red" />
        <StatCard icon={AlertTriangle} label="Unresolved Fraud" value={summary?.unresolved_fraud_alerts?.toString() || '0'} color="amber" />
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {(['overview', 'logs', 'attempts', 'fraud'] as const).map((item) => (
          <button
            key={item}
            onClick={() => setTab(item)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${tab === item ? 'bg-primary-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
          >
            {item === 'overview' ? 'PIN Lockouts' : item === 'fraud' ? 'Fraud Alerts' : item}
          </button>
        ))}
        {tab === 'logs' && (
          <button onClick={handleExportLogs} className="px-3 py-2 rounded-lg text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
            <Download className="w-3.5 h-3.5" /> Export
          </button>
        )}
        <button onClick={load} className="ml-auto p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Refresh security data">
          <RefreshCw className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      <div className="relative mb-4">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input type="text" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by user ID or event..." className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:outline-none focus:border-primary-500" />
      </div>

      {tab === 'overview' && (
        <Panel title="PIN Security Records">
          {filteredSec.length === 0 ? <Empty /> : (
            <div className="space-y-2">
              {filteredSec.map((row) => {
                const risk = riskScores.find((item) => item.user_id === row.user_id);
                const forceReset = row.auth_rules?.force_reset_required === true;
                return (
                  <div key={row.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center ${row.is_locked ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                      {row.is_locked ? <Lock className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono text-gray-500">{row.user_id}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {row.is_locked && <span className="px-1.5 py-0.5 text-xs rounded bg-red-100 text-red-600">Locked</span>}
                        {forceReset && <span className="px-1.5 py-0.5 text-xs rounded bg-amber-100 text-amber-700">Reset required</span>}
                        <span className="text-xs text-gray-400">{row.failed_attempts} failed attempts</span>
                        {risk && <span className={`px-1.5 py-0.5 text-xs rounded ${getRiskColor(Number(risk.risk_score))}`}>Risk: {risk.risk_score}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {row.is_locked && !forceReset && (
                        <button onClick={() => handleUnlock(row.user_id)} disabled={actionLoading === row.user_id || !user?.id} className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-medium hover:bg-emerald-600 disabled:opacity-50 flex items-center gap-1">
                          {actionLoading === row.user_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unlock className="w-3 h-3" />} Unlock
                        </button>
                      )}
                      <button onClick={() => handleForceReset(row.user_id)} disabled={actionLoading === row.user_id || !user?.id || forceReset} className="px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 text-xs font-medium hover:bg-amber-100 disabled:opacity-50 flex items-center gap-1">
                        <KeyRound className="w-3 h-3" /> {forceReset ? 'Reset Required' : 'Force Reset'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      )}

      {tab === 'logs' && (
        <Panel title="Security Event Logs">
          {filteredLogs.length === 0 ? <Empty /> : (
            <div className="space-y-2 max-h-[520px] overflow-y-auto">
              {filteredLogs.map((item) => (
                <div key={item.id} className="p-3 rounded-lg border border-gray-100 dark:border-gray-700">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-gray-900 dark:text-white capitalize">{item.event_type.replace(/_/g, ' ')}</p>
                    <span className="text-xs text-gray-400">{new Date(item.created_at).toLocaleString()}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{item.description || 'No description'}</p>
                  <p className="text-xs font-mono text-gray-400 mt-1">{item.user_id}</p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}

      {tab === 'attempts' && (
        <Panel title="PIN Verification Attempts">
          {filteredAttempts.length === 0 ? <Empty /> : (
            <div className="space-y-2 max-h-[520px] overflow-y-auto">
              {filteredAttempts.map((item) => (
                <div key={item.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
                  {item.success ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-red-500" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono text-gray-500">{item.user_id}</p>
                    <p className="text-xs text-gray-400">{item.context || 'transaction'} • {new Date(item.created_at).toLocaleString()}</p>
                  </div>
                  <span className={`text-xs font-semibold ${item.success ? 'text-emerald-600' : 'text-red-600'}`}>{item.success ? 'Success' : 'Failed'}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}

      {tab === 'fraud' && (
        <Panel title="Fraud Alerts">
          {filteredFraud.length === 0 ? <Empty /> : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {filteredFraud.map((alert) => (
                <div key={alert.id} className="p-4 rounded-xl border border-gray-100 dark:border-gray-700">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900 dark:text-white capitalize">{alert.alert_type.replace(/_/g, ' ')}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${getRiskColor(Number(alert.risk_score || 0))}`}>Risk {alert.risk_score || 0}</span>
                        <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600 capitalize">{alert.severity}</span>
                        {alert.is_resolved && <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700">Resolved</span>}
                      </div>
                      <p className="text-sm text-gray-500 mt-1">{alert.description || 'No description'}</p>
                      <p className="text-xs font-mono text-gray-400 mt-1">{alert.user_id}</p>
                      <p className="text-xs text-gray-400 mt-1">{new Date(alert.created_at).toLocaleString()}</p>
                    </div>
                    {!alert.is_resolved && (
                      <button onClick={() => handleResolveFraud(alert.id)} disabled={actionLoading === alert.id || !user?.id} className="px-3 py-2 rounded-lg bg-primary-600 text-white text-xs font-semibold hover:bg-primary-700 disabled:opacity-50 inline-flex items-center gap-1">
                        {actionLoading === alert.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />} Resolve
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
      <h2 className="font-bold text-gray-900 dark:text-white mb-3">{title}</h2>
      {children}
    </div>
  );
}

function Empty() {
  return <p className="text-sm text-gray-400 text-center py-8">No records.</p>;
}

function StatCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: string; color: string }) {
  const colors: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-600',
    blue: 'bg-blue-50 text-blue-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
  };
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${colors[color]}`}><Icon className="w-4 h-4" /></div>
      <p className="text-lg font-bold text-gray-900 dark:text-white">{value}</p>
      <p className="text-xs text-gray-400">{label}</p>
    </div>
  );
}
