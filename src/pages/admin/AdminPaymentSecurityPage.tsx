import { useState, useEffect, useCallback } from 'react';
import {
  Shield, Lock, Unlock, KeyRound, AlertTriangle,
  Search, RefreshCw, Loader2, CheckCircle, XCircle, Download,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { exportSecurityLogsCSV } from '../../lib/fraudEngine';

interface SecurityLog {
  id: string; user_id: string; event_type: string; description: string | null;
  metadata: any; ip_address: string | null; performed_by: string | null; created_at: string;
}

interface PinAttempt {
  id: string; user_id: string; success: boolean; context: string | null;
  ip_address: string | null; created_at: string;
}

interface PaymentSecRow {
  id: string; user_id: string; is_locked: boolean; failed_attempts: number;
  locked_until: string | null; last_pin_change: string; auth_rules: any;
  is_active: boolean; created_at: string;
}

interface FraudAlert {
  id: string; user_id: string; alert_type: string; severity: string;
  description: string | null; risk_score: number; ip_address: string | null;
  country: string | null; device_fingerprint: string | null;
  browser: string | null; action_type: string | null;
  is_resolved: boolean; created_at: string;
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

export default function AdminPaymentSecurityPage() {
  const [logs, setLogs] = useState<SecurityLog[]>([]);
  const [attempts, setAttempts] = useState<PinAttempt[]>([]);
  const [secRows, setSecRows] = useState<PaymentSecRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'overview' | 'logs' | 'attempts' | 'fraud'>('overview');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [fraudAlerts, setFraudAlerts] = useState<FraudAlert[]>([]);
  const [riskScores, setRiskScores] = useState<RiskScore[]>([]);
  const [summary, setSummary] = useState<PlatformSummary | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [logsRes, attemptsRes, secRes, fraudRes, riskRes, summaryRes] = await Promise.all([
      supabase.from('payment_security_logs').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('payment_pin_attempts').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('payment_security').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('wallet_fraud_alerts').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('user_risk_scores').select('*').order('updated_at', { ascending: false }).limit(100),
      supabase.rpc('get_admin_payment_security_summary'),
    ]);
    setLogs((logsRes.data as SecurityLog[]) || []);
    setAttempts((attemptsRes.data as PinAttempt[]) || []);
    setSecRows((secRes.data as PaymentSecRow[]) || []);
    setFraudAlerts((fraudRes.data as FraudAlert[]) || []);
    setRiskScores((riskRes.data as RiskScore[]) || []);
    setSummary(summaryRes.data as PlatformSummary);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleUnlock = async (userId: string) => {
    setActionLoading(userId);
    const { error } = await supabase.rpc('unlock_payment_pin', { p_user_id: userId, p_admin_id: null });
    setActionLoading(null);
    if (error) { console.error('Unlock failed:', error); return; }
    load();
  };

  const handleForceReset = async (userId: string) => {
    if (!confirm('Force this user to reset their PIN on next transaction?')) return;
    setActionLoading(userId);
    const { error } = await supabase.from('payment_security').update({ is_locked: true, locked_until: now() }).eq('user_id', userId);
    setActionLoading(null);
    if (error) { console.error('Force reset failed:', error); return; }
    load();
  };

  const filteredLogs = logs.filter(l => !search || l.user_id.includes(search) || l.event_type.includes(search));
  const filteredAttempts = attempts.filter(a => !search || a.user_id.includes(search));
  const filteredSec = secRows.filter(s => !search || s.user_id.includes(search));

  const successRate = attempts.length > 0 ? Math.round((attempts.filter(a => a.success).length / attempts.length) * 100) : 0;

  const filteredFraud = fraudAlerts.filter(f => !search || f.user_id.includes(search) || f.alert_type.includes(search));

  const handleExportLogs = () => {
    const csv = exportSecurityLogsCSV(filteredLogs);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `security-logs-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleResolveFraud = async (id: string) => {
    const { error } = await supabase.from('wallet_fraud_alerts').update({ is_resolved: true, resolved_at: new Date().toISOString() }).eq('id', id);
    if (error) console.error('Resolve failed:', error);
    load();
  };

  const getRiskColor = (score: number) => {
    if (score >= 70) return 'bg-red-100 text-red-700';
    if (score >= 40) return 'bg-orange-100 text-orange-700';
    if (score >= 20) return 'bg-amber-100 text-amber-700';
    return 'bg-emerald-100 text-emerald-700';
  };

  if (loading) return <div className="p-8 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center">
          <Shield className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Payment Security Center</h1>
          <p className="text-sm text-gray-500">Manage PIN lockouts, view security logs, and audit failed attempts</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard icon={Shield} label="Active PINs" value={summary?.total_pins?.toString() || '0'} color="emerald" />
        <StatCard icon={Lock} label="Locked PINs" value={summary?.locked_pins?.toString() || '0'} color="red" />
        <StatCard icon={AlertTriangle} label="Failed 24h" value={summary?.failed_attempts_24h?.toString() || '0'} color="amber" />
        <StatCard icon={AlertTriangle} label="High Risk Users" value={summary?.high_risk_users?.toString() || '0'} color="red" />
        <StatCard icon={CheckCircle} label="Success Rate" value={`${successRate}%`} color="blue" />
        <StatCard icon={KeyRound} label="Recovery Codes Active" value={summary?.recovery_codes_active?.toString() || '0'} color="emerald" />
        <StatCard icon={Lock} label="Frozen Wallets" value={summary?.frozen_wallets?.toString() || '0'} color="red" />
        <StatCard icon={AlertTriangle} label="Unresolved Fraud" value={summary?.unresolved_fraud_alerts?.toString() || '0'} color="amber" />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-4">
        {(['overview', 'logs', 'attempts', 'fraud'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${tab === t ? 'bg-primary-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
            {t === 'overview' ? 'PIN Lockouts' : t === 'fraud' ? 'Fraud Alerts' : t}
          </button>
        ))}
        {tab === 'logs' && <button onClick={handleExportLogs} className="px-3 py-2 rounded-lg text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"><Download className="w-3.5 h-3.5" /> Export</button>}
        <button onClick={load} className="ml-auto p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><RefreshCw className="w-4 h-4 text-gray-400" /></button>
      </div>

      <div className="relative mb-4">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by user ID or event..."
          className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:outline-none focus:border-primary-500" />
      </div>

      {/* Overview tab */}
      {tab === 'overview' && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
          <h2 className="font-bold text-gray-900 dark:text-white mb-3">PIN Security Records</h2>
          {filteredSec.length === 0 ? <p className="text-sm text-gray-400 text-center py-8">No records.</p> : (
            <div className="space-y-2">
              {filteredSec.map(s => {
                const risk = riskScores.find(r => r.user_id === s.user_id);
                return (
                <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center ${s.is_locked ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                    {s.is_locked ? <Lock className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono text-gray-500">{s.user_id.slice(0, 12)}...</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {s.is_locked && <span className="px-1.5 py-0.5 text-xs rounded bg-red-100 text-red-600">Locked</span>}
                      <span className="text-xs text-gray-400">{s.failed_attempts} failed attempts</span>
                      <span className="text-xs text-gray-400">• Changed {new Date(s.last_pin_change).toLocaleDateString()}</span>
                      {risk && (
                        <span className={`px-1.5 py-0.5 text-xs rounded ${getRiskColor(risk.risk_score)}`}>Risk: {risk.risk_score}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {s.is_locked && (
                      <button onClick={() => handleUnlock(s.user_id)} disabled={actionLoading === s.user_id}
                        className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-medium hover:bg-emerald-600 disabled:opacity-50 flex items-center gap-1">
                        {actionLoading === s.user_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unlock className="w-3 h-3" />} Unlock
                      </button>
                    )}
                    <button onClick={() => handleForceReset(s.user_id)} disabled={actionLoading === s.user_id}
                      className="px-3 py-1.5 rounded-lg bg-amber-50 text-amber-600 text-xs font-medium hover:bg-amber-100 flex items-center gap-1">
                      <KeyRound className="w-3 h-3" /> Force Reset
                    </button>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Logs tab */}
      {tab === 'logs' && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
          <h2 className="font-bold text-gray-900 dark:text-white mb-3">Security Event Logs</h2>
          {filteredLogs.length === 0 ? <p className="text-sm text-gray-400 text-center py-8">No logs.</p> : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {filteredLogs.map(l => (
                <div key={l.id} className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${getEventColor(l.event_type)}`}>
                    {getEventIcon(l.event_type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white capitalize">{l.event_type.replace(/_/g, ' ')}</p>
                    <p className="text-xs text-gray-500">{l.description}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-gray-400">{new Date(l.created_at).toLocaleString()}</span>
                      <span className="text-xs font-mono text-gray-400">{l.user_id.slice(0, 8)}...</span>
                      {l.performed_by && <span className="text-xs text-gray-400">• by admin</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Attempts tab */}
      {tab === 'attempts' && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
          <h2 className="font-bold text-gray-900 dark:text-white mb-3">PIN Verification Attempts</h2>
          {filteredAttempts.length === 0 ? <p className="text-sm text-gray-400 text-center py-8">No attempts.</p> : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {filteredAttempts.map(a => (
                <div key={a.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
                  {a.success ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-red-500" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono text-gray-500">{a.user_id.slice(0, 12)}...</p>
                    <p className="text-xs text-gray-400">{a.context || 'transaction'} • {a.ip_address || 'no IP'}</p>
                  </div>
                  <span className="text-xs text-gray-400">{new Date(a.created_at).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Fraud tab */}
      {tab === 'fraud' && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
          <h2 className="font-bold text-gray-900 dark:text-white mb-3">Fraud Alerts & Risk Scores</h2>
          {filteredFraud.length === 0 ? <p className="text-sm text-gray-400 text-center py-8">No fraud alerts.</p> : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {filteredFraud.map(f => (
                <div key={f.id} className={`p-3 rounded-lg border ${f.is_resolved ? 'border-gray-100 dark:border-gray-700 opacity-60' : 'border-red-200 dark:border-red-800 bg-red-50/30 dark:bg-red-900/10'}`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${f.severity === 'critical' ? 'bg-red-100 text-red-600' : f.severity === 'high' ? 'bg-orange-100 text-orange-600' : f.severity === 'medium' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'}`}>
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900 dark:text-white capitalize">{f.alert_type.replace(/_/g, ' ')}</p>
                        <span className={`px-1.5 py-0.5 text-xs rounded ${getRiskColor(f.risk_score)}`}>Score: {f.risk_score}</span>
                        {f.is_resolved && <span className="px-1.5 py-0.5 text-xs rounded bg-gray-100 text-gray-500">Resolved</span>}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{f.description}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-400">{new Date(f.created_at).toLocaleString()}</span>
                        <span className="text-xs font-mono text-gray-400">{f.user_id.slice(0, 8)}...</span>
                        {f.country && <span className="text-xs text-gray-400">• {f.country}</span>}
                        {f.browser && <span className="text-xs text-gray-400">• {f.browser}</span>}
                        {f.action_type && <span className="text-xs text-gray-400">• {f.action_type}</span>}
                      </div>
                    </div>
                    {!f.is_resolved && (
                      <button onClick={() => handleResolveFraud(f.id)} className="px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-700 text-xs text-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600">Resolve</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function now(): string { return new Date().toISOString(); }

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  const colors: Record<string, string> = { emerald: 'bg-emerald-50 text-emerald-600', red: 'bg-red-50 text-red-600', amber: 'bg-amber-50 text-amber-600', blue: 'bg-blue-50 text-blue-600' };
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${colors[color]}`}><Icon className="w-4 h-4" /></div>
      <p className="text-lg font-bold text-gray-900 dark:text-white">{value}</p>
      <p className="text-xs text-gray-400">{label}</p>
    </div>
  );
}

function getEventColor(type: string): string {
  if (type.includes('locked') || type.includes('failed')) return 'bg-red-50 text-red-600';
  if (type.includes('set') || type.includes('verified') || type.includes('success')) return 'bg-emerald-50 text-emerald-600';
  if (type.includes('reset') || type.includes('recovery')) return 'bg-amber-50 text-amber-600';
  return 'bg-blue-50 text-blue-600';
}

function getEventIcon(type: string): any {
  if (type.includes('locked')) return <Lock className="w-4 h-4" />;
  if (type.includes('reset') || type.includes('recovery')) return <KeyRound className="w-4 h-4" />;
  if (type.includes('verified')) return <CheckCircle className="w-4 h-4" />;
  return <Shield className="w-4 h-4" />;
}
