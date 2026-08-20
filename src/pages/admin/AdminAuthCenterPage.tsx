import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { logger, ErrorCategory } from '../../lib/logger';
import {
  Shield, Lock, Unlock, Ban, RefreshCw, Mail, AlertTriangle,
  CheckCircle, XCircle, Clock, Activity, Users, KeyRound, LogOut,
} from 'lucide-react';

interface AuthActivityRow {
  id: string;
  user_id: string | null;
  email: string | null;
  event_type: string;
  success: boolean;
  reason: string | null;
  user_agent: string | null;
  country: string | null;
  created_at: string;
}

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  account_status: string;
  is_verified: boolean;
  is_admin: boolean;
  created_at: string;
  last_active_at: string | null;
}

type Tab = 'overview' | 'activity' | 'locked' | 'users';

export default function AdminAuthCenterPage() {
  const [tab, setTab] = useState<Tab>('overview');
  const [activity, setActivity] = useState<AuthActivityRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [lockedUsers, setLockedUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [activityRes, usersRes] = await Promise.all([
        supabase.rpc('admin_get_auth_activity', { p_limit: 50, p_offset: 0 }),
        supabase.from('users').select('id, email, full_name, account_status, is_verified, is_admin, created_at, last_active_at').order('created_at', { ascending: false }).limit(100),
      ]);

      if (activityRes.error) throw activityRes.error;
      if (usersRes.error) throw usersRes.error;

      setActivity((activityRes.data || []) as AuthActivityRow[]);
      const allUsers = (usersRes.data || []) as UserRow[];
      setUsers(allUsers);
      setLockedUsers(allUsers.filter(u => u.account_status === 'LOCKED' || u.account_status === 'BANNED'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
      logger.error(ErrorCategory.AUTH, 'Admin auth center fetch failed', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleUnlock = async (userId: string) => {
    setActionLoading(userId);
    try {
      const { error: err } = await supabase.rpc('admin_unlock_account', { p_user_id: userId });
      if (err) throw err;
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unlock account');
    } finally {
      setActionLoading(null);
    }
  };

  const handleResetAttempts = async (email: string) => {
    setActionLoading(email);
    try {
      const { error: err } = await supabase.rpc('admin_reset_login_attempts', { p_email: email });
      if (err) throw err;
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset attempts');
    } finally {
      setActionLoading(null);
    }
  };

  const handleStatusChange = async (userId: string, status: string) => {
    setActionLoading(userId + status);
    try {
      const { error: err } = await supabase.from('users').update({ account_status: status }).eq('id', userId);
      if (err) throw err;
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update account');
    } finally {
      setActionLoading(null);
    }
  };

  const handleResendVerification = async (email: string) => {
    setActionLoading(email + 'verify');
    try {
      const { error: err } = await supabase.auth.admin.inviteUserByEmail(email);
      if (err) throw err;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend verification');
    } finally {
      setActionLoading(null);
    }
  };

  const handleForceLogout = async (userId: string) => {
    setActionLoading(userId + 'logout');
    try {
      const { error: err } = await supabase.rpc('admin_force_lockout', { p_user_id: userId, p_reason: 'Admin forced logout' });
      if (err) throw err;
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to force logout');
    } finally {
      setActionLoading(null);
    }
  };

  const stats = {
    totalLogins: activity.filter(a => a.event_type === 'login' && a.success).length,
    failedLogins: activity.filter(a => a.event_type === 'failed_login').length,
    lockedAccounts: lockedUsers.filter(u => u.account_status === 'LOCKED').length,
    bannedAccounts: lockedUsers.filter(u => u.account_status === 'BANNED').length,
    unverified: users.filter(u => !u.is_verified).length,
    recentSignups: users.filter(u => new Date(u.created_at) > new Date(Date.now() - 7 * 86400000)).length,
  };

  const TABS: { key: Tab; label: string; icon: typeof Shield }[] = [
    { key: 'overview', label: 'Overview', icon: Activity },
    { key: 'activity', label: 'Recent Activity', icon: Clock },
    { key: 'locked', label: 'Locked / Banned', icon: Lock },
    { key: 'users', label: 'All Users', icon: Users },
  ];

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="w-7 h-7 text-primary" />
            Authentication Center
          </h1>
          <p className="text-sm text-gray-500 mt-1">Monitor and manage authentication, sessions, and account security.</p>
        </div>
        <button onClick={fetchData} disabled={loading} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 text-white font-medium hover:bg-primary-700 disabled:opacity-50 transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-xl p-4 mb-6 bg-red-500/10 text-red-700 dark:text-red-400 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5" />
          <span className="text-sm">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-xs underline">Dismiss</button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <StatCard icon={CheckCircle} label="Logins" value={stats.totalLogins} color="text-emerald-500" />
        <StatCard icon={XCircle} label="Failed" value={stats.failedLogins} color="text-red-500" />
        <StatCard icon={Lock} label="Locked" value={stats.lockedAccounts} color="text-amber-500" />
        <StatCard icon={Ban} label="Banned" value={stats.bannedAccounts} color="text-red-600" />
        <StatCard icon={Mail} label="Unverified" value={stats.unverified} color="text-blue-500" />
        <StatCard icon={Users} label="New (7d)" value={stats.recentSignups} color="text-purple-500" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                tab === t.key
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}>
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Overview tab */}
          {tab === 'overview' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-5">
                <h3 className="font-semibold mb-3 flex items-center gap-2"><Activity className="w-5 h-5 text-primary" /> Recent Events</h3>
                <div className="space-y-2">
                  {activity.slice(0, 10).map(a => <ActivityRow key={a.id} row={a} />)}
                </div>
              </div>
            </div>
          )}

          {/* Activity tab */}
          {tab === 'activity' && (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {activity.length === 0 ? (
                  <p className="text-center text-gray-400 py-8 text-sm">No activity recorded yet</p>
                ) : activity.map(a => <ActivityRow key={a.id} row={a} />)}
              </div>
            </div>
          )}

          {/* Locked/Banned tab */}
          {tab === 'locked' && (
            <div className="space-y-3">
              {lockedUsers.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
                  <p className="text-gray-400 text-sm">No locked or banned accounts</p>
                </div>
              ) : lockedUsers.map(u => (
                <div key={u.id} className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${u.account_status === 'BANNED' ? 'bg-red-500/10' : 'bg-amber-500/10'}`}>
                    {u.account_status === 'BANNED' ? <Ban className="w-5 h-5 text-red-500" /> : <Lock className="w-5 h-5 text-amber-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{u.full_name} <span className="text-gray-400 font-normal">· {u.email}</span></p>
                    <p className="text-xs text-gray-500">Status: <span className={u.account_status === 'BANNED' ? 'text-red-500 font-medium' : 'text-amber-500 font-medium'}>{u.account_status}</span></p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {u.account_status === 'LOCKED' && (
                      <button onClick={() => handleUnlock(u.id)} disabled={actionLoading === u.id}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-50">
                        <Unlock className="w-3.5 h-3.5 inline mr-1" />Unlock
                      </button>
                    )}
                    <button onClick={() => handleResetAttempts(u.email)} disabled={actionLoading === u.email}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50">
                      <RefreshCw className="w-3.5 h-3.5 inline mr-1" />Reset
                    </button>
                    {u.account_status !== 'BANNED' && (
                      <button onClick={() => handleStatusChange(u.id, 'BANNED')} disabled={actionLoading === u.id + 'BANNED'}
                        className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-50">
                        <Ban className="w-3.5 h-3.5 inline mr-1" />Ban
                      </button>
                    )}
                    {u.account_status === 'BANNED' && (
                      <button onClick={() => handleStatusChange(u.id, 'ACTIVE')} disabled={actionLoading === u.id + 'ACTIVE'}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-50">
                        Activate
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Users tab */}
          {tab === 'users' && (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-800/50">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">User</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">Verified</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">Last Active</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {users.map(u => (
                      <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                        <td className="px-4 py-3">
                          <p className="font-medium truncate">{u.full_name}</p>
                          <p className="text-xs text-gray-400 truncate">{u.email}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            u.account_status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-600' :
                            u.account_status === 'LOCKED' ? 'bg-amber-500/10 text-amber-600' :
                            u.account_status === 'BANNED' ? 'bg-red-500/10 text-red-600' :
                            'bg-gray-500/10 text-gray-500'
                          }`}>{u.account_status}</span>
                        </td>
                        <td className="px-4 py-3">
                          {u.is_verified ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-gray-300" />}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400">
                          {u.last_active_at ? new Date(u.last_active_at).toLocaleDateString() : 'Never'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-1">
                            {!u.is_verified && (
                              <button onClick={() => handleResendVerification(u.email)} disabled={actionLoading === u.email + 'verify'}
                                title="Resend verification" className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-500 disabled:opacity-50">
                                <Mail className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button onClick={() => handleForceLogout(u.id)} disabled={actionLoading === u.id + 'logout'}
                              title="Force logout" className="p-1.5 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20 text-amber-500 disabled:opacity-50">
                              <LogOut className="w-3.5 h-3.5" />
                            </button>
                            {u.account_status === 'ACTIVE' ? (
                              <button onClick={() => handleStatusChange(u.id, 'LOCKED')} disabled={actionLoading === u.id + 'LOCKED'}
                                title="Lock" className="p-1.5 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20 text-amber-500 disabled:opacity-50">
                                <Lock className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <button onClick={() => handleUnlock(u.id)} disabled={actionLoading === u.id}
                                title="Unlock" className="p-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-emerald-500 disabled:opacity-50">
                                <Unlock className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: typeof Shield; label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}

function ActivityRow({ row }: { row: AuthActivityRow }) {
  const eventIcons: Record<string, typeof Shield> = {
    login: CheckCircle, logout: LogOut, signup: Users, failed_login: XCircle,
    password_reset_request: KeyRound, password_change: KeyRound,
    email_verification: Mail, session_refresh: RefreshCw,
    account_lock: Lock, account_unlock: Unlock, admin_forced_logout: LogOut,
  };
  const Icon = eventIcons[row.event_type] || Activity;
  const iconColor = row.success ? 'text-emerald-500' : 'text-red-500';

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/30">
      <Icon className={`w-4 h-4 shrink-0 ${iconColor}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{row.event_type.replace(/_/g, ' ')}</p>
        <p className="text-xs text-gray-400 truncate">{row.email || 'Unknown'} {row.reason ? `· ${row.reason}` : ''}</p>
      </div>
      <span className="text-xs text-gray-400 shrink-0">{new Date(row.created_at).toLocaleString()}</span>
    </div>
  );
}
