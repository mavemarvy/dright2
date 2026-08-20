import { useState } from 'react';
import { useSubscriptionReminders, updateSubscriptionReminder } from '../../lib/crmHooks';
import { REMINDER_STAGE_LABELS } from '../../lib/crmTypes';
import { PageHeader, LoadingBar } from '../../components/admin/RbacComponents';
import { Bell, Clock, CheckCircle, Calendar, Mail, MessageSquare, Smartphone, X } from 'lucide-react';

export default function AdminSubscriptionRecoveryPage() {
  const { reminders, loading, refetch } = useSubscriptionReminders();
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const filtered = statusFilter ? reminders.filter((r) => r.status === statusFilter) : reminders;

  const stats = {
    total: reminders.length,
    pending: reminders.filter((r) => r.status === 'pending').length,
    sent: reminders.filter((r) => r.status === 'sent').length,
    upcoming: reminders.filter((r) => r.status === 'pending' && new Date(r.expiry_date) > new Date()).length,
  };

  const channelIcon = (channel: string) => {
    switch (channel) {
      case 'email': return <Mail className="w-3.5 h-3.5" />;
      case 'sms': return <Smartphone className="w-3.5 h-3.5" />;
      case 'whatsapp': return <MessageSquare className="w-3.5 h-3.5" />;
      default: return <Bell className="w-3.5 h-3.5" />;
    }
  };

  const handleMarkSent = async (id: string) => {
    setError(null);
    try {
      await updateSubscriptionReminder(id, { status: 'sent', sent_at: new Date().toISOString() });
      void refetch();
    } catch (e) { setError(e instanceof Error ? e.message : 'Update failed'); }
  };

  return (
    <div className="p-4 md:p-8">
      <PageHeader title="Subscription Recovery" subtitle="Automated reminders for expiring and expired subscriptions — 30, 14, 7, 3, 1 days before, on expiry, and 3, 7, 14 days after" />

      {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-700 flex items-center justify-between"><span>{error}</span><button onClick={() => setError(null)}><X className="w-4 h-4" /></button></div>}
      {loading && <LoadingBar />}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <MiniStat icon={<Bell className="w-4 h-4" />} label="Total Reminders" value={stats.total} color="bg-gray-100 text-gray-600" />
        <MiniStat icon={<Clock className="w-4 h-4" />} label="Pending" value={stats.pending} color="bg-amber-50 text-amber-600" />
        <MiniStat icon={<CheckCircle className="w-4 h-4" />} label="Sent" value={stats.sent} color="bg-green-50 text-green-600" />
        <MiniStat icon={<Calendar className="w-4 h-4" />} label="Upcoming Expiries" value={stats.upcoming} color="bg-blue-50 text-blue-600" />
      </div>

      {/* Filter */}
      <div className="flex gap-3 mb-4">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
          <option value="">All Stages</option>
          {Object.entries(REMINDER_STAGE_LABELS).map(([val, label]) => <option key={val} value={val}>{label}</option>)}
        </select>
      </div>

      {/* Reminders Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Customer</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Subscription</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Expiry Date</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">Offset</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">Channel</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 && !loading && (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400">No reminders found</td></tr>
              )}
              {filtered.map((r) => {
                const daysUntil = Math.ceil((new Date(r.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                const offsetLabel = r.reminder_offset_days === 0 ? 'On expiry' : r.reminder_offset_days > 0 ? `${r.reminder_offset_days}d after` : `${Math.abs(r.reminder_offset_days)}d before`;
                return (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{r.user?.full_name ?? r.user?.username ?? 'Unknown'}</p>
                      <p className="text-xs text-gray-400">{r.user?.email}</p>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-gray-600 capitalize">{r.subscription_type.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3">
                      <span className={`text-sm ${daysUntil < 0 ? 'text-red-600 font-medium' : daysUntil <= 7 ? 'text-amber-600' : 'text-gray-700'}`}>
                        {new Date(r.expiry_date).toLocaleDateString()}
                      </span>
                      {daysUntil < 0 && <span className="block text-xs text-red-400">Expired {Math.abs(daysUntil)}d ago</span>}
                      {daysUntil >= 0 && daysUntil <= 30 && <span className="block text-xs text-amber-400">{daysUntil}d left</span>}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-gray-500 text-xs">{offsetLabel}</td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="flex items-center gap-1.5 text-gray-500 capitalize">{channelIcon(r.channel)} {r.channel}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs border ${
                        r.status === 'sent' ? 'bg-green-50 text-green-700 border-green-200' :
                        r.status === 'failed' ? 'bg-red-50 text-red-700 border-red-200' :
                        'bg-amber-50 text-amber-700 border-amber-200'
                      }`}>{REMINDER_STAGE_LABELS[r.status] ?? r.status}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {r.status === 'pending' && (
                        <button onClick={() => handleMarkSent(r.id)} className="px-2 py-1 text-xs font-medium text-green-600 border border-green-200 rounded-lg hover:bg-green-50">Mark Sent</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color}`}>{icon}</div>
      <div>
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-lg font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );
}
