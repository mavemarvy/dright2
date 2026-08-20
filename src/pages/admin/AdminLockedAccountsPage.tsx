import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Lock, Search, Loader2, Unlock, Star, Shield } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { emitEvent } from '../../lib/notificationEvents';

interface LockedUser {
  id: string;
  email: string;
  full_name: string | null;
  account_status: string;
  one_star_count: number;
  account_locks_count: number;
  total_reviews: number;
  average_rating: number;
  locked_at?: string;
}

export default function AdminLockedAccountsPage() {
  const [users, setUsers] = useState<LockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('users')
      .select('id, email, full_name, account_status, one_star_count, account_locks_count, total_reviews, average_rating')
      .in('account_status', ['LOCKED', 'BANNED'])
      .order('created_at', { ascending: false });

    if (data) setUsers(data as LockedUser[]);
    setLoading(false);
  };

  const unlockAccount = async (userId: string) => {
    if (!confirm('Unlock this account? The user will regain full access.')) return;
    setProcessingId(userId);
    try {
      await supabase.from('users').update({ account_status: 'ACTIVE' }).eq('id', userId);
      await emitEvent({
        module: 'security',
        eventType: 'suspicious_activity',
        recipientIds: userId,
        metadata: {
          details: 'Your account has been unlocked by the QA team. You can resume normal activity.',
        },
      });
      fetchUsers();
    } catch (err) {
      console.error('Error unlocking account:', err);
    } finally {
      setProcessingId(null);
    }
  };

  const banAccount = async (userId: string) => {
    if (!confirm('Ban this account permanently? This is irreversible without an appeal.')) return;
    setProcessingId(userId);
    try {
      await supabase
        .from('users')
        .update({
          account_status: 'BANNED',
          account_locks_count: 3,
        })
        .eq('id', userId);
      await emitEvent({
        module: 'security',
        eventType: 'suspicious_activity',
        recipientIds: userId,
        metadata: {
          details: 'Your account has been banned. You may submit an appeal from the login page.',
        },
      });
      fetchUsers();
    } catch (err) {
      console.error('Error banning account:', err);
    } finally {
      setProcessingId(null);
    }
  };

  const filteredUsers = users.filter((u) => {
    const q = searchQuery.toLowerCase();
    return u.email.toLowerCase().includes(q) || (u.full_name?.toLowerCase().includes(q) ?? false);
  });

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Lock className="w-6 h-6 text-error" />
          Locked Accounts
        </h1>
        <p className="text-gray-500 mt-1">Manage accounts that have been locked or banned</p>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Search locked accounts..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none bg-white text-gray-900"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-gray-300 border-t-warning rounded-full animate-spin" />
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <Lock className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-900 font-semibold text-lg">No locked accounts</p>
          <p className="text-sm text-gray-500 mt-1">Accounts that receive 100+ 1-star reviews will appear here</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredUsers.map((u, idx) => (
            <motion.div
              key={u.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
            >
              <div className="p-5">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      u.account_status === 'BANNED' ? 'bg-error-muted' : 'bg-warning-muted'
                    }`}>
                      {u.account_status === 'BANNED' ? (
                        <Shield className="w-6 h-6 text-error" />
                      ) : (
                        <Lock className="w-6 h-6 text-warning" />
                      )}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{u.full_name || 'Unknown'}</p>
                      <p className="text-sm text-gray-500">{u.email}</p>
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                    u.account_status === 'BANNED'
                      ? 'bg-error-muted text-error'
                      : 'bg-warning-muted text-warning'
                  }`}>
                    {u.account_status}
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-3 mb-4">
                  <div className="bg-gray-50 rounded-xl p-3 text-center">
                    <Star className="w-4 h-4 text-warning mx-auto mb-1" />
                    <p className="text-lg font-bold text-gray-900">{Number(u.average_rating).toFixed(1)}</p>
                    <p className="text-xs text-gray-500">Avg Rating</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3 text-center">
                    <p className="text-lg font-bold text-gray-900">{u.total_reviews}</p>
                    <p className="text-xs text-gray-500">Total Reviews</p>
                  </div>
                  <div className="bg-error-muted rounded-xl p-3 text-center">
                    <p className="text-lg font-bold text-error">{u.one_star_count}</p>
                    <p className="text-xs text-error">1-Star Reviews</p>
                  </div>
                  <div className="bg-warning-muted rounded-xl p-3 text-center">
                    <p className="text-lg font-bold text-warning">{u.account_locks_count}</p>
                    <p className="text-xs text-warning">Locks</p>
                  </div>
                </div>

                {u.account_status === 'LOCKED' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => unlockAccount(u.id)}
                      disabled={processingId === u.id}
                      className="flex items-center gap-2 px-4 py-2 bg-success text-white rounded-xl font-medium hover:bg-green-700 transition-colors disabled:opacity-50 min-h-[44px]"
                    >
                      {processingId === u.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlock className="w-4 h-4" />}
                      Unlock Account
                    </button>
                    <button
                      onClick={() => banAccount(u.id)}
                      disabled={processingId === u.id}
                      className="flex items-center gap-2 px-4 py-2 bg-error-muted text-error rounded-xl font-medium hover:bg-error hover:text-white transition-colors disabled:opacity-50 min-h-[44px]"
                    >
                      <Shield className="w-4 h-4" />
                      Ban Account
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
