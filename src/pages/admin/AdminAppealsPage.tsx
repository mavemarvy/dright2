import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Gavel,
  Loader2,
  CheckCircle,
  Clock,
  XCircle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { emitEvent } from '../../lib/notificationEvents';
import { useAuth } from '../../contexts/AuthContext';

interface BanAppeal {
  id: string;
  user_id: string;
  appeal_text: string;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  user_email?: string;
  user_name?: string;
}

export default function AdminAppealsPage() {
  const { user } = useAuth();
  const [appeals, setAppeals] = useState<BanAppeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'denied' | 'all'>('pending');
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    fetchAppeals();
  }, [statusFilter]);

  const fetchAppeals = async () => {
    setLoading(true);
    let query = supabase.from('ban_appeals').select('*');
    if (statusFilter !== 'all') query = query.eq('status', statusFilter);
    query = query.order('created_at', { ascending: false });
    const { data } = await query;

    if (data && data.length > 0) {
      const userIds = [...new Set(data.map((a) => a.user_id))];
      const { data: users } = await supabase
        .from('users')
        .select('id, email, full_name')
        .in('id', userIds);
      const userMap = new Map(users?.map((u) => [u.id, { email: u.email, name: u.full_name }]) || []);
      setAppeals(
        (data as BanAppeal[]).map((a) => ({
          ...a,
          user_email: userMap.get(a.user_id)?.email || 'Unknown',
          user_name: userMap.get(a.user_id)?.name || 'Unknown',
        }))
      );
    } else {
      setAppeals([]);
    }
    setLoading(false);
  };

  const reviewAppeal = async (appeal: BanAppeal, decision: 'approved' | 'denied') => {
    setProcessingId(appeal.id);
    try {
      await supabase
        .from('ban_appeals')
        .update({
          status: decision,
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', appeal.id);

      if (decision === 'approved') {
        await supabase
          .from('users')
          .update({
            account_status: 'ACTIVE',
            account_locks_count: 0,
            one_star_count: 0,
          })
          .eq('id', appeal.user_id);

        await emitEvent({
          module: 'admin',
          eventType: 'support_ticket_update',
          recipientIds: appeal.user_id,
          actorId: user?.id,
          metadata: {
            ticketTitle: 'Ban Appeal',
            actionUrl: '/profile',
          },
        });
      } else {
        await emitEvent({
          module: 'admin',
          eventType: 'support_ticket_update',
          recipientIds: appeal.user_id,
          actorId: user?.id,
          metadata: {
            ticketTitle: 'Ban Appeal',
            actionUrl: '/profile',
          },
        });
      }

      await supabase.from('admin_logs').insert({
        admin_id: user?.id,
        action_type: 'review_appeal',
        target_id: appeal.id,
        target_type: 'ban_appeal',
        details: { appeal_id: appeal.id, decision },
      });

      fetchAppeals();
    } catch (err) {
      console.error('Error reviewing appeal:', err);
    } finally {
      setProcessingId(null);
    }
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Gavel className="w-6 h-6 text-warning" />
          Ban Appeals
        </h1>
        <p className="text-gray-500 mt-1">Review appeals from banned users</p>
      </div>

      <div className="flex gap-2 mb-6">
        {(['pending', 'approved', 'denied', 'all'] as const).map((s) => (
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

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-gray-300 border-t-warning rounded-full animate-spin" />
        </div>
      ) : appeals.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <Gavel className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-900 font-semibold text-lg">No appeals</p>
          <p className="text-sm text-gray-500 mt-1">Ban appeals submitted by users will appear here</p>
        </div>
      ) : (
        <div className="space-y-4">
          {appeals.map((a, idx) => (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
            >
              <div className="p-5">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <p className="font-semibold text-gray-900">{a.user_name}</p>
                    <p className="text-sm text-gray-500">{a.user_email}</p>
                  </div>
                  <div className="text-right">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      a.status === 'approved'
                        ? 'bg-success-muted text-success'
                        : a.status === 'denied'
                        ? 'bg-error-muted text-error'
                        : 'bg-warning-muted text-warning'
                    }`}>
                      {a.status === 'approved' && <CheckCircle className="w-3 h-3 inline mr-1" />}
                      {a.status === 'denied' && <XCircle className="w-3 h-3 inline mr-1" />}
                      {a.status === 'pending' && <Clock className="w-3 h-3 inline mr-1" />}
                      {a.status}
                    </span>
                    <p className="text-xs text-gray-400 mt-1">{formatDate(a.created_at)}</p>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-xl p-3 mb-3">
                  <p className="text-sm text-gray-900">{a.appeal_text}</p>
                </div>

                {a.status === 'pending' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => reviewAppeal(a, 'approved')}
                      disabled={processingId === a.id}
                      className="flex items-center gap-2 px-4 py-2 bg-success text-white rounded-xl font-medium hover:bg-green-700 transition-colors disabled:opacity-50 min-h-[44px]"
                    >
                      {processingId === a.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                      Approve & Reactivate
                    </button>
                    <button
                      onClick={() => reviewAppeal(a, 'denied')}
                      disabled={processingId === a.id}
                      className="flex items-center gap-2 px-4 py-2 bg-error-muted text-error rounded-xl font-medium hover:bg-error hover:text-white transition-colors disabled:opacity-50 min-h-[44px]"
                    >
                      <XCircle className="w-4 h-4" />
                      Deny
                    </button>
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
