import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  Search,
  Loader2,
  CheckCircle,
  Clock,
  Shield,
  Flag,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { emitEvent } from '../../lib/notificationEvents';
import { useAuth } from '../../contexts/AuthContext';

interface FraudReport {
  id: string;
  reporter_id: string;
  reported_id: string | null;
  report_type: string;
  description: string;
  status: string;
  created_at: string;
  reporter_email?: string;
  reported_email?: string;
  reported_name?: string;
}

export default function AdminFraudReportsPage() {
  const { user } = useAuth();
  const [reports, setReports] = useState<FraudReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'investigating' | 'resolved' | 'all'>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    fetchReports();
  }, [statusFilter]);

  const fetchReports = async () => {
    setLoading(true);
    let query = supabase.from('fraud_reports').select('*');
    if (statusFilter !== 'all') query = query.eq('status', statusFilter);
    query = query.order('created_at', { ascending: false });
    const { data } = await query;

    if (data && data.length > 0) {
      const allUserIds = new Set<string>();
      (data as FraudReport[]).forEach((r) => {
        allUserIds.add(r.reporter_id);
        if (r.reported_id) allUserIds.add(r.reported_id);
      });

      const { data: users } = await supabase
        .from('users')
        .select('id, email, full_name')
        .in('id', [...allUserIds]);
      const userMap = new Map(users?.map((u) => [u.id, { email: u.email, name: u.full_name }]) || []);

      setReports(
        (data as FraudReport[]).map((r) => ({
          ...r,
          reporter_email: userMap.get(r.reporter_id)?.email || 'Unknown',
          reported_email: r.reported_id ? userMap.get(r.reported_id)?.email || 'Unknown' : null,
          reported_name: r.reported_id ? userMap.get(r.reported_id)?.name || 'Unknown' : null,
        }))
      );
    } else {
      setReports([]);
    }
    setLoading(false);
  };

  const updateStatus = async (report: FraudReport, newStatus: string) => {
    setProcessingId(report.id);
    try {
      await supabase.from('fraud_reports').update({ status: newStatus }).eq('id', report.id);

      await supabase.from('admin_logs').insert({
        admin_id: user?.id,
        action_type: 'fraud_report_update',
        target_id: report.id,
        target_type: 'fraud_report',
        details: { report_id: report.id, new_status: newStatus },
      });

      if (newStatus === 'resolved' && report.reported_id) {
        await emitEvent({
          module: 'security',
          eventType: 'suspicious_activity',
          recipientIds: report.reported_id,
          actorId: user?.id,
          metadata: {
            details: 'Your account has been flagged for review by the Trust & Safety team.',
          },
        });
      }

      fetchReports();
    } catch (err) {
      console.error('Error updating report:', err);
    } finally {
      setProcessingId(null);
    }
  };

  const suspendAccount = async (userId: string) => {
    if (!confirm('Suspend (lock) this account? This will prevent the user from generating links, accepting contracts, or withdrawing.')) return;
    setProcessingId(userId);
    try {
      await supabase.from('users').update({ account_status: 'LOCKED' }).eq('id', userId);
      await emitEvent({
        module: 'security',
        eventType: 'suspicious_activity',
        recipientIds: userId,
        actorId: user?.id,
        metadata: {
          details: 'Your account has been locked by the Trust & Safety team due to suspicious activity.',
        },
      });
      fetchReports();
    } catch (err) {
      console.error('Error suspending account:', err);
    } finally {
      setProcessingId(null);
    }
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const filteredReports = reports.filter((r) => {
    const q = searchQuery.toLowerCase();
    return (
      r.description.toLowerCase().includes(q) ||
      r.report_type.toLowerCase().includes(q) ||
      r.reporter_email?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <AlertTriangle className="w-6 h-6 text-warning" />
          Fraud Reports
        </h1>
        <p className="text-gray-500 mt-1">Monitor and investigate fraud reports from users</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search reports..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none bg-white text-gray-900"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {(['pending', 'investigating', 'resolved', 'all'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-4 py-3 rounded-xl font-medium transition-all min-h-[48px] ${
                statusFilter === s
                  ? 'bg-primary-600 text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-primary-300'
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-gray-300 border-t-warning rounded-full animate-spin" />
        </div>
      ) : filteredReports.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <AlertTriangle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-900 font-semibold text-lg">No fraud reports</p>
          <p className="text-sm text-gray-500 mt-1">Fraud reports submitted by users will appear here</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredReports.map((r, idx) => (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
            >
              <div className="p-5">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Flag className="w-4 h-4 text-error" />
                      <span className="text-xs font-bold uppercase text-error">{r.report_type}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          r.status === 'resolved'
                            ? 'bg-success-muted text-success'
                            : r.status === 'investigating'
                            ? 'bg-primary-100 text-primary-600'
                            : 'bg-warning-muted text-warning'
                        }`}
                      >
                        {r.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">
                      Reported by <span className="font-medium text-gray-900">{r.reporter_email}</span>
                    </p>
                    {r.reported_email && (
                      <p className="text-sm text-gray-600 mt-0.5">
                        Reported user: <span className="font-medium text-gray-900">{r.reported_name} ({r.reported_email})</span>
                      </p>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 shrink-0">{formatDate(r.created_at)}</p>
                </div>

                <div className="bg-gray-50 rounded-xl p-3 mb-3">
                  <p className="text-sm text-gray-900">{r.description}</p>
                </div>

                {r.status === 'pending' && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => updateStatus(r, 'investigating')}
                      disabled={processingId === r.id}
                      className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 transition-colors disabled:opacity-50 min-h-[44px]"
                    >
                      {processingId === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />}
                      Investigate
                    </button>
                    <button
                      onClick={() => updateStatus(r, 'resolved')}
                      disabled={processingId === r.id}
                      className="flex items-center gap-2 px-4 py-2 bg-success text-white rounded-xl font-medium hover:bg-green-700 transition-colors disabled:opacity-50 min-h-[44px]"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Resolve
                    </button>
                    {r.reported_id && (
                      <button
                        onClick={() => suspendAccount(r.reported_id!)}
                        disabled={processingId === r.reported_id}
                        className="flex items-center gap-2 px-4 py-2 bg-error-muted text-error rounded-xl font-medium hover:bg-error hover:text-white transition-colors disabled:opacity-50 min-h-[44px]"
                      >
                        {processingId === r.reported_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                        Suspend Account
                      </button>
                    )}
                  </div>
                )}

                {r.status === 'investigating' && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => updateStatus(r, 'resolved')}
                      disabled={processingId === r.id}
                      className="flex items-center gap-2 px-4 py-2 bg-success text-white rounded-xl font-medium hover:bg-green-700 transition-colors disabled:opacity-50 min-h-[44px]"
                    >
                      {processingId === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                      Resolve
                    </button>
                    {r.reported_id && (
                      <button
                        onClick={() => suspendAccount(r.reported_id!)}
                        disabled={processingId === r.reported_id}
                        className="flex items-center gap-2 px-4 py-2 bg-error-muted text-error rounded-xl font-medium hover:bg-error hover:text-white transition-colors disabled:opacity-50 min-h-[44px]"
                      >
                        <Shield className="w-4 h-4" />
                        Suspend Account
                      </button>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
