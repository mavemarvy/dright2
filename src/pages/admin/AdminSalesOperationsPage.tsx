import { useState, useMemo } from 'react';
import { useRecoveryQueue } from '../../lib/crmHooks';
import { RECOVERY_REASONS } from '../../lib/crmTypes';
import { PageHeader, LoadingBar } from '../../components/admin/RbacComponents';
import { ShoppingCart, CreditCard, Calendar, TrendingDown, UserMinus, AlertTriangle, ChevronRight, X } from 'lucide-react';

export default function AdminSalesOperationsPage() {
  const { items, loading } = useRecoveryQueue();
  const [category, setCategory] = useState<string>('all');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const categories = [
    { value: 'abandoned_purchase', label: 'Abandoned Carts', icon: <ShoppingCart className="w-4 h-4" />, color: 'bg-amber-50 text-amber-600' },
    { value: 'failed_payment', label: 'Incomplete Payments', icon: <CreditCard className="w-4 h-4" />, color: 'bg-red-50 text-red-600' },
    { value: 'subscription_expired', label: 'Expired Subscriptions', icon: <Calendar className="w-4 h-4" />, color: 'bg-blue-50 text-blue-600' },
    { value: 'abandoned_sponsorship', label: 'Failed Promotions', icon: <TrendingDown className="w-4 h-4" />, color: 'bg-purple-50 text-purple-600' },
    { value: 'incomplete_onboarding', label: 'Inactive Users', icon: <UserMinus className="w-4 h-4" />, color: 'bg-gray-100 text-gray-600' },
    { value: 'abandoned_verification', label: 'Abandoned Verification', icon: <AlertTriangle className="w-4 h-4" />, color: 'bg-orange-50 text-orange-600' },
  ];

  const filtered = useMemo(() => {
    if (category === 'all') return items;
    return items.filter((i) => i.recovery_reason === category);
  }, [items, category]);

  const selectedUser = filtered.find((i) => i.user_id === selectedUserId);

  return (
    <div className="p-4 md:p-8">
      <PageHeader title="Sales Operations Dashboard" subtitle="Abandoned carts, incomplete payments, expired subscriptions, failed promotions, and inactive users at a glance" />

      {loading && <LoadingBar />}

      {/* Category Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {categories.map((cat) => {
          const count = items.filter((i) => i.recovery_reason === cat.value).length;
          const isActive = category === cat.value;
          return (
            <button key={cat.value} onClick={() => setCategory(cat.value)}
              className={`bg-white rounded-2xl shadow-sm border p-4 text-left transition-all ${isActive ? 'border-primary-400 ring-2 ring-primary-100' : 'border-gray-100 hover:border-gray-200'}`}>
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-2 ${cat.color}`}>{cat.icon}</div>
              <p className="text-xs text-gray-400">{cat.label}</p>
              <p className="text-xl font-bold text-gray-900">{count}</p>
            </button>
          );
        })}
      </div>

      {/* Records Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-sm text-gray-900">
            {category === 'all' ? 'All Records' : categories.find((c) => c.value === category)?.label}
          </h3>
          <span className="text-xs text-gray-400">{filtered.length} items</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Customer</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Reason</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">Last Activity</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">Assigned</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Reminders</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 && !loading && (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400">No records in this category</td></tr>
              )}
              {filtered.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedUserId(item.user_id)}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{item.user?.full_name ?? item.user?.username ?? 'Unknown'}</p>
                    <p className="text-xs text-gray-400">{item.user?.email}</p>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-gray-600 text-xs">
                    {RECOVERY_REASONS.find((r) => r.value === item.recovery_reason)?.label ?? item.recovery_reason}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-gray-500 text-xs">
                    {item.last_reminder_at ? new Date(item.last_reminder_at).toLocaleDateString() : 'Never'}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-gray-500 text-xs">
                    {item.assigned_admin ? (item.assigned_admin.full_name ?? 'Assigned') : <span className="text-gray-300">Unassigned</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{item.reminder_count}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs border ${
                      item.outcome === 'recovered' ? 'bg-green-50 text-green-700 border-green-200' :
                      item.outcome === 'lost' ? 'bg-red-50 text-red-700 border-red-200' :
                      'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>{item.outcome}</span>
                  </td>
                  <td className="px-4 py-3 text-right"><ChevronRight className="w-4 h-4 text-gray-400 inline" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Detail Modal */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setSelectedUserId(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">{selectedUser.user?.full_name ?? selectedUser.user?.username ?? 'Unknown'}</h2>
              <button onClick={() => setSelectedUserId(null)} className="p-2 hover:bg-gray-100 rounded-xl"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Email</span><span className="text-gray-800">{selectedUser.user?.email}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Reason</span><span className="text-gray-800">{RECOVERY_REASONS.find((r) => r.value === selectedUser.recovery_reason)?.label}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Reminders Sent</span><span className="text-gray-800">{selectedUser.reminder_count}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Assigned To</span><span className="text-gray-800">{selectedUser.assigned_admin?.full_name ?? 'Unassigned'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Follow-up Date</span><span className="text-gray-800">{selectedUser.follow_up_date ? new Date(selectedUser.follow_up_date).toLocaleDateString() : 'None'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Outcome</span><span className="text-gray-800 capitalize">{selectedUser.outcome}</span></div>
              {selectedUser.admin_notes && (
                <div className="pt-2">
                  <span className="text-gray-500 block mb-1">Notes</span>
                  <p className="text-gray-700 bg-gray-50 rounded-xl p-3 text-xs">{selectedUser.admin_notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
