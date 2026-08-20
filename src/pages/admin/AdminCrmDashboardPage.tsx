import { useState, useMemo } from 'react';
import { useCrmCustomers, useCrmCustomer, useCustomerTimeline, updateCrmCustomer } from '../../lib/crmHooks';
import { PageHeader, LoadingBar } from '../../components/admin/RbacComponents';
import { Search, Users, DollarSign, ShoppingBag, Star, Phone, Mail, Shield, Calendar, X, ChevronRight } from 'lucide-react';

export default function AdminCrmDashboardPage() {
  const { customers, loading, refetch } = useCrmCustomers();
  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!search) return customers;
    const q = search.toLowerCase();
    return customers.filter((c) => {
      const name = c.user?.full_name ?? c.user?.username ?? '';
      const email = c.user?.email ?? '';
      return name.toLowerCase().includes(q) || email.toLowerCase().includes(q) || c.tags.some((t) => t.toLowerCase().includes(q));
    });
  }, [customers, search]);

  const totalLTV = filtered.reduce((s, c) => s + Number(c.lifetime_value), 0);
  const totalPurchases = filtered.reduce((s, c) => s + c.total_purchases, 0);
  const avgRating = filtered.length ? filtered.reduce((s, c) => s + Number(c.avg_rating), 0) / filtered.length : 0;

  return (
    <div className="p-4 md:p-8">
      <PageHeader title="CRM Dashboard" subtitle="Centralized customer profiles, activity, financials, and engagement" />

      {loading && <LoadingBar />}

      {/* Stats Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard icon={<Users className="w-5 h-5" />} label="Total Customers" value={filtered.length.toString()} color="primary" />
        <StatCard icon={<DollarSign className="w-5 h-5" />} label="Total Lifetime Value" value={`$${totalLTV.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`} color="green" />
        <StatCard icon={<ShoppingBag className="w-5 h-5" />} label="Total Purchases" value={totalPurchases.toString()} color="blue" />
        <StatCard icon={<Star className="w-5 h-5" />} label="Avg Rating" value={avgRating.toFixed(2)} color="amber" />
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email, or tag..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      {/* Customer List */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Customer</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">LTV</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">Purchases</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden xl:table-cell">Rating</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">View</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 && !loading && (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400">No customers found</td></tr>
              )}
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedUserId(c.user_id)}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 text-xs font-bold flex-shrink-0">
                        {(c.user?.full_name ?? c.user?.email ?? '?')[0]?.toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">{c.user?.full_name ?? c.user?.username ?? 'Unknown'}</p>
                        <p className="text-xs text-gray-400 truncate">{c.user?.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className={`px-2 py-0.5 rounded-full text-xs border ${
                      c.customer_status === 'active' ? 'bg-green-50 text-green-700 border-green-200' :
                      c.customer_status === 'churned' ? 'bg-red-50 text-red-700 border-red-200' :
                      'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>{c.customer_status}</span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-gray-700">${Number(c.lifetime_value).toLocaleString(undefined, { minimumFractionDigits: 0 })}</td>
                  <td className="px-4 py-3 hidden lg:table-cell text-gray-700">{c.total_purchases}</td>
                  <td className="px-4 py-3 hidden xl:table-cell">
                    {Number(c.avg_rating) > 0 ? (
                      <span className="flex items-center gap-1"><Star className="w-3.5 h-3.5 text-amber-400" /> {Number(c.avg_rating).toFixed(2)}</span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ChevronRight className="w-4 h-4 text-gray-400 inline" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedUserId && <CustomerDetailDrawer userId={selectedUserId} onClose={() => setSelectedUserId(null)} onRefetch={refetch} />}
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  const colors: Record<string, string> = {
    primary: 'bg-primary-50 text-primary-600',
    green: 'bg-green-50 text-green-600',
    blue: 'bg-blue-50 text-blue-600',
    amber: 'bg-amber-50 text-amber-600',
  };
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${colors[color] ?? colors.primary}`}>{icon}</div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-lg font-bold text-gray-900">{value}</p>
    </div>
  );
}

function CustomerDetailDrawer({ userId, onClose, onRefetch }: { userId: string; onClose: () => void; onRefetch: () => void }) {
  const { customer, loading, refetch } = useCrmCustomer(userId);
  const { events } = useCustomerTimeline(userId, 50);
  const [tab, setTab] = useState<'profile' | 'activity' | 'financials' | 'engagement'>('profile');
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  const user = customer?.user;
  const name = user?.full_name ?? user?.username ?? 'Unknown User';

  const handleSaveNotes = async () => {
    if (!customer) return;
    setSavingNotes(true);
    try {
      await updateCrmCustomer(customer.id, { notes });
      void refetch();
      void onRefetch();
      setEditingNotes(false);
    } catch { /* ignore */ }
    setSavingNotes(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div className="bg-white w-full max-w-2xl h-full overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 p-5 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 text-lg font-bold">
              {name[0]?.toUpperCase()}
            </div>
            <div>
              <h2 className="font-bold text-gray-900">{name}</h2>
              <p className="text-xs text-gray-400">{user?.email}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl"><X className="w-5 h-5" /></button>
        </div>

        {loading && <LoadingBar />}

        {customer && (
          <div className="p-5 space-y-5">
            {/* Quick Info */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              <InfoTile icon={<Shield className="w-4 h-4" />} label="Verification" value={user?.verification_status ?? 'unknown'} />
              <InfoTile icon={<Calendar className="w-4 h-4" />} label="Joined" value={user?.created_at ? new Date(user.created_at).toLocaleDateString() : '—'} />
              <InfoTile icon={<Phone className="w-4 h-4" />} label="Phone" value={user?.phone ?? '—'} />
              <InfoTile icon={<Mail className="w-4 h-4" />} label="Last Login" value={user?.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleDateString() : '—'} />
            </div>

            {/* Tabs */}
            <div className="flex gap-1 border-b border-gray-100">
              {(['profile', 'activity', 'financials', 'engagement'] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-3 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${tab === t ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                  {t}
                </button>
              ))}
            </div>

            {/* Profile Tab */}
            {tab === 'profile' && (
              <div className="space-y-4">
                <Section title="Basic Information">
                  <DataRow label="Full Name" value={user?.full_name ?? '—'} />
                  <DataRow label="Username" value={user?.username ?? '—'} />
                  <DataRow label="Email" value={user?.email ?? '—'} />
                  <DataRow label="Account Status" value={customer.customer_status} />
                  <DataRow label="Verification" value={user?.verification_status ?? 'unknown'} />
                  <DataRow label="Tags" value={customer.tags.length ? customer.tags.join(', ') : 'None'} />
                </Section>

                <Section title="Admin Notes">
                  {editingNotes ? (
                    <div className="space-y-2">
                      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4}
                        className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                      <div className="flex gap-2">
                        <button onClick={() => setEditingNotes(false)} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-xl">Cancel</button>
                        <button onClick={handleSaveNotes} disabled={savingNotes} className="px-3 py-1.5 text-sm text-white bg-primary-600 hover:bg-primary-700 rounded-xl disabled:opacity-50">Save</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between">
                      <p className="text-sm text-gray-600">{customer.notes ?? 'No notes yet'}</p>
                      <button onClick={() => { setNotes(customer.notes ?? ''); setEditingNotes(true); }} className="text-xs text-primary-600 hover:underline">Edit</button>
                    </div>
                  )}
                </Section>
              </div>
            )}

            {/* Activity Tab — Timeline */}
            {tab === 'activity' && (
              <div>
                <h3 className="font-semibold text-sm text-gray-900 mb-3">Activity Timeline</h3>
                {events.length === 0 ? (
                  <p className="text-sm text-gray-400">No activity recorded yet</p>
                ) : (
                  <div className="space-y-2">
                    {events.map((ev) => (
                      <div key={ev.id} className="flex gap-3 p-3 rounded-xl border border-gray-50">
                        <div className="w-2 h-2 rounded-full bg-primary-400 mt-1.5 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900">{ev.event_title}</p>
                          {ev.event_description && <p className="text-xs text-gray-500 mt-0.5">{ev.event_description}</p>}
                          <p className="text-xs text-gray-300 mt-1">{new Date(ev.created_at).toLocaleString()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Financials Tab */}
            {tab === 'financials' && (
              <Section title="Financial Summary">
                <DataRow label="Wallet Balance" value={`$${Number(customer.wallet_balance).toLocaleString()}`} />
                <DataRow label="Total Earnings" value={`$${Number(customer.total_earnings).toLocaleString()}`} />
                <DataRow label="Total Withdrawals" value={`$${Number(customer.total_withdrawals).toLocaleString()}`} />
                <DataRow label="Pending Withdrawals" value={`$${Number(customer.pending_withdrawals).toLocaleString()}`} />
                <DataRow label="Total Purchases" value={customer.total_purchases.toString()} />
                <DataRow label="Lifetime Value" value={`$${Number(customer.lifetime_value).toLocaleString()}`} />
              </Section>
            )}

            {/* Engagement Tab */}
            {tab === 'engagement' && (
              <div className="space-y-4">
                <Section title="Engagement">
                  <DataRow label="Reviews Received" value={customer.reviews_received.toString()} />
                  <DataRow label="Average Rating" value={Number(customer.avg_rating) > 0 ? `${Number(customer.avg_rating).toFixed(2)} / 5` : 'No ratings'} />
                  <DataRow label="Referral Count" value={customer.referral_count.toString()} />
                  <DataRow label="Total Sales" value={customer.total_sales.toString()} />
                  <DataRow label="Last Contacted" value={customer.last_contacted_at ? new Date(customer.last_contacted_at).toLocaleDateString() : 'Never'} />
                </Section>
                <Section title="Performance">
                  <DataRow label="Seller Performance" value={Object.keys(customer.seller_performance).length > 0 ? 'Data available' : 'No data'} />
                  <DataRow label="Affiliate Performance" value={Object.keys(customer.affiliate_performance).length > 0 ? 'Data available' : 'No data'} />
                </Section>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-xl p-3">
      <div className="flex items-center gap-1.5 text-gray-400 mb-1">{icon}<span className="text-xs">{label}</span></div>
      <p className="text-sm font-medium text-gray-700 capitalize truncate">{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-50 rounded-2xl p-4">
      <h3 className="font-semibold text-sm text-gray-900 mb-3">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-800 capitalize">{value}</span>
    </div>
  );
}
