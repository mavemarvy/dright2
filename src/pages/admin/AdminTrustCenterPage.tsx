import { useState, useEffect, useCallback } from 'react';
import {
  Shield, Loader2, RefreshCw, CheckCircle, XCircle,
  AlertTriangle, FileText, MessageSquare, Flag, Award, TrendingUp,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

type Tab = 'overview' | 'verifications' | 'portfolio' | 'disputes' | 'reports' | 'risk' | 'badges';

export default function AdminTrustCenterPage() {
  const [tab, setTab] = useState<Tab>('overview');
  const [summary, setSummary] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [verifications, setVerifications] = useState<any[]>([]);
  const [portfolioVerifs, setPortfolioVerifs] = useState<any[]>([]);
  const [disputes, setDisputes] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [riskProfiles, setRiskProfiles] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [sumRes, verRes, portRes, dispRes, repRes, riskRes] = await Promise.all([
      supabase.rpc('get_admin_trust_center_summary'),
      supabase.from('verification_requests').select('*').in('status', ['submitted', 'pending', 'needs_more_info']).order('submitted_at', { ascending: false }).limit(50),
      supabase.from('portfolio_verifications').select('*').eq('status', 'pending').order('created_at', { ascending: false }).limit(50),
      supabase.from('disputes').select('*').not('status', 'in', '("closed","resolved_admin")').order('created_at', { ascending: false }).limit(50),
      supabase.from('user_reports').select('*').eq('status', 'pending').order('created_at', { ascending: false }).limit(50),
      supabase.from('risk_profiles').select('*').in('risk_level', ['high', 'critical']).order('risk_score', { ascending: false }).limit(50),
    ]);
    setSummary(sumRes.data as Record<string, number>);
    setVerifications(verRes.data || []);
    setPortfolioVerifs(portRes.data || []);
    setDisputes(dispRes.data || []);
    setReports(repRes.data || []);
    setRiskProfiles(riskRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleApproveVerification = async (id: string) => {
    setActionLoading(id);
    const { error } = await supabase.from('verification_requests')
      .update({ status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: (await supabase.auth.getUser()).data.user?.id })
      .eq('id', id);
    if (!error) {
      const req = verifications.find(v => v.id === id);
      if (req) {
        const badgeType = req.type === 'business' ? 'verified_business' : 'verified_seller';
        const badgeName = req.type === 'business' ? 'Verified Business' : 'Verified Seller';
        await supabase.rpc('award_badge', { p_user_id: req.user_id, p_badge_type: badgeType, p_badge_name: badgeName, p_icon: 'verified' });
        if (req.type === 'business') await supabase.from('users').update({ business_verified: true }).eq('id', req.user_id);
        else await supabase.from('users').update({ id_verified: true }).eq('id', req.user_id);
      }
    }
    setActionLoading(null);
    load();
  };

  const handleRejectVerification = async (id: string) => {
    setActionLoading(id);
    await supabase.from('verification_requests')
      .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
      .eq('id', id);
    setActionLoading(null);
    load();
  };

  const handleResolveReport = async (id: string, status: string) => {
    setActionLoading(id);
    await supabase.from('user_reports').update({ status, resolved_at: new Date().toISOString() }).eq('id', id);
    setActionLoading(null);
    load();
  };

  const handleResolveDispute = async (id: string, decision: string) => {
    setActionLoading(id);
    await supabase.from('disputes').update({ status: 'resolved_admin', admin_decision: decision, resolved_at: new Date().toISOString() }).eq('id', id);
    setActionLoading(null);
    load();
  };

  const tabs: { key: Tab; label: string; icon: any; count?: number }[] = [
    { key: 'overview', label: 'Overview', icon: TrendingUp },
    { key: 'verifications', label: 'Verifications', icon: FileText, count: summary?.pending_verifications },
    { key: 'portfolio', label: 'Portfolio', icon: Award, count: summary?.pending_portfolio_verifs },
    { key: 'disputes', label: 'Disputes', icon: MessageSquare, count: summary?.open_disputes },
    { key: 'reports', label: 'Reports', icon: Flag, count: summary?.pending_reports },
    { key: 'risk', label: 'Risk Profiles', icon: AlertTriangle, count: summary?.high_risk_users },
  ];

  if (loading) return <div className="p-8 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
            <Shield className="w-5 h-5 text-primary-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Trust Center</h1>
            <p className="text-sm text-gray-500">Marketplace integrity, verification, and security</p>
          </div>
        </div>
        <button onClick={load} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><RefreshCw className="w-4 h-4 text-gray-400" /></button>
      </div>

      {/* Summary stats */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
          <StatCard label="Pending Verifications" value={summary.pending_verifications} icon={FileText} color="amber" />
          <StatCard label="Open Disputes" value={summary.open_disputes} icon={MessageSquare} color="red" />
          <StatCard label="Pending Reports" value={summary.pending_reports} icon={Flag} color="orange" />
          <StatCard label="High Risk Users" value={summary.high_risk_users} icon={AlertTriangle} color="red" />
          <StatCard label="Trusted Users" value={summary.trusted_users} icon={Shield} color="emerald" />
          <StatCard label="Low Trust" value={summary.low_trust_users} icon={TrendingUp} color="gray" />
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
          className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors ${tab === t.key ? 'bg-primary-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
            <t.icon className="w-4 h-4" />
            {t.label}
            {t.count !== undefined && t.count > 0 && <span className={`px-1.5 py-0.5 rounded-full text-xs ${tab === t.key ? 'bg-white/20' : 'bg-red-100 text-red-600'}`}>{t.count}</span>}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'overview' && summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
            <h3 className="font-bold text-gray-900 dark:text-white mb-3">Verification Statistics</h3>
            <div className="space-y-2">
              <StatRow label="Pending" value={summary.pending_verifications} color="text-amber-600" />
              <StatRow label="Approved" value={summary.approved_verifications} color="text-emerald-600" />
              <StatRow label="Rejected" value={summary.rejected_verifications} color="text-red-600" />
              <StatRow label="Portfolio Pending" value={summary.pending_portfolio_verifs} color="text-amber-600" />
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
            <h3 className="font-bold text-gray-900 dark:text-white mb-3">Trust & Risk</h3>
            <div className="space-y-2">
              <StatRow label="Trusted Users (80+)" value={summary.trusted_users} color="text-emerald-600" />
              <StatRow label="Low Trust (<30)" value={summary.low_trust_users} color="text-red-600" />
              <StatRow label="High Risk Users" value={summary.high_risk_users} color="text-red-600" />
              <StatRow label="Unresolved Fraud" value={summary.fraud_alerts_unresolved} color="text-amber-600" />
              <StatRow label="Badges Awarded" value={summary.total_badges_awarded} color="text-blue-600" />
              <StatRow label="Achievements Unlocked" value={summary.achievements_unlocked} color="text-purple-600" />
            </div>
          </div>
        </div>
      )}

      {tab === 'verifications' && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
          {verifications.length === 0 ? <p className="text-sm text-gray-400 text-center py-8">No pending verifications.</p> :
          <div className="space-y-2">
            {verifications.map(v => (
              <div key={v.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
                <div className="w-9 h-9 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-4 h-4 text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white capitalize">{v.type} Verification</p>
                  <p className="text-xs text-gray-400">User: {v.user_id?.slice(0, 8)}... • Submitted {new Date(v.submitted_at).toLocaleDateString()}</p>
                  {v.status === 'needs_more_info' && <span className="text-xs text-amber-600">Needs more info</span>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleApproveVerification(v.id)} disabled={actionLoading === v.id}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-medium hover:bg-emerald-600 disabled:opacity-50 flex items-center gap-1">
                    {actionLoading === v.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />} Approve
                  </button>
                  <button onClick={() => handleRejectVerification(v.id)} disabled={actionLoading === v.id}
                    className="px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-xs font-medium hover:bg-red-100 flex items-center gap-1">
                    <XCircle className="w-3 h-3" /> Reject
                  </button>
                </div>
              </div>
            ))}
          </div>}
        </div>
      )}

      {tab === 'disputes' && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
          {disputes.length === 0 ? <p className="text-sm text-gray-400 text-center py-8">No open disputes.</p> :
          <div className="space-y-2">
            {disputes.map(d => (
              <div key={d.id} className="p-3 rounded-lg border border-gray-100 dark:border-gray-700">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-xs text-gray-400">{d.dispute_number}</span>
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 capitalize">{d.status.replace(/_/g, ' ')}</span>
                </div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{d.reason}</p>
                <p className="text-xs text-gray-400 mt-1">{new Date(d.created_at).toLocaleString()}</p>
                <div className="flex gap-2 mt-2">
                  <button onClick={() => handleResolveDispute(d.id, 'Resolved in favor of buyer')} disabled={actionLoading === d.id}
                    className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-600 text-xs font-medium hover:bg-emerald-100">Resolve for Buyer</button>
                  <button onClick={() => handleResolveDispute(d.id, 'Resolved in favor of seller')} disabled={actionLoading === d.id}
                    className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-600 text-xs font-medium hover:bg-blue-100">Resolve for Seller</button>
                </div>
              </div>
            ))}
          </div>}
        </div>
      )}

      {tab === 'reports' && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
          {reports.length === 0 ? <p className="text-sm text-gray-400 text-center py-8">No pending reports.</p> :
          <div className="space-y-2">
            {reports.map(r => (
              <div key={r.id} className="p-3 rounded-lg border border-gray-100 dark:border-gray-700">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-900 dark:text-white capitalize">{r.reason} — {r.target_type}</span>
                  <span className="text-xs text-gray-400">{new Date(r.created_at).toLocaleString()}</span>
                </div>
                {r.description && <p className="text-xs text-gray-500 mt-1">{r.description}</p>}
                <div className="flex gap-2 mt-2">
                  <button onClick={() => handleResolveReport(r.id, 'resolved')} disabled={actionLoading === r.id}
                    className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-600 text-xs font-medium hover:bg-emerald-100">Resolve</button>
                  <button onClick={() => handleResolveReport(r.id, 'dismissed')} disabled={actionLoading === r.id}
                    className="px-2.5 py-1 rounded-lg bg-gray-50 text-gray-600 text-xs font-medium hover:bg-gray-100">Dismiss</button>
                  <button onClick={() => handleResolveReport(r.id, 'escalated')} disabled={actionLoading === r.id}
                    className="px-2.5 py-1 rounded-lg bg-orange-50 text-orange-600 text-xs font-medium hover:bg-orange-100">Escalate</button>
                </div>
              </div>
            ))}
          </div>}
        </div>
      )}

      {tab === 'risk' && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
          {riskProfiles.length === 0 ? <p className="text-sm text-gray-400 text-center py-8">No high-risk users.</p> :
          <div className="space-y-2">
            {riskProfiles.map(r => (
              <div key={r.user_id} className="flex items-center gap-3 p-3 rounded-lg border border-red-100 dark:border-red-900/50 bg-red-50/30 dark:bg-red-900/10">
                <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">User: {r.user_id?.slice(0, 8)}...</p>
                  <p className="text-xs text-gray-400 capitalize">Risk: {r.risk_level} • Score: {r.risk_score}</p>
                  {r.flags && r.flags.length > 0 && <p className="text-xs text-amber-600 mt-0.5">Flags: {r.flags.join(', ')}</p>}
                </div>
                {r.recommended_action && <span className="text-xs text-gray-500">{r.recommended_action}</span>}
              </div>
            ))}
          </div>}
        </div>
      )}

      {tab === 'portfolio' && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
          {portfolioVerifs.length === 0 ? <p className="text-sm text-gray-400 text-center py-8">No pending portfolio verifications.</p> :
          <div className="space-y-2">
            {portfolioVerifs.map(p => (
              <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
                <div className="w-9 h-9 rounded-full bg-purple-50 flex items-center justify-center flex-shrink-0">
                  <Award className="w-4 h-4 text-purple-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Portfolio Item: {p.portfolio_item_id?.slice(0, 8)}...</p>
                  <p className="text-xs text-gray-400">User: {p.user_id?.slice(0, 8)}... • {new Date(p.created_at).toLocaleDateString()}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={async () => { setActionLoading(p.id); await supabase.from('portfolio_verifications').update({ status: 'approved', verified_at: new Date().toISOString() }).eq('id', p.id); setActionLoading(null); load(); }}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-medium hover:bg-emerald-600">Approve</button>
                  <button onClick={async () => { setActionLoading(p.id); await supabase.from('portfolio_verifications').update({ status: 'rejected' }).eq('id', p.id); setActionLoading(null); load(); }}
                    className="px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-xs font-medium hover:bg-red-100">Reject</button>
                </div>
              </div>
            ))}
          </div>}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: any; color: string }) {
  const colors: Record<string, string> = {
    amber: 'bg-amber-50 text-amber-600', red: 'bg-red-50 text-red-600', orange: 'bg-orange-50 text-orange-600',
    emerald: 'bg-emerald-50 text-emerald-600', gray: 'bg-gray-50 text-gray-600', blue: 'bg-blue-50 text-blue-600',
  };
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-3">
      <div className="flex items-center gap-2 mb-1">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${colors[color] || colors.gray}`}><Icon className="w-3.5 h-3.5" /></div>
        <span className="text-lg font-bold text-gray-900 dark:text-white">{value}</span>
      </div>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

function StatRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className={`font-semibold ${color}`}>{value}</span>
    </div>
  );
}
