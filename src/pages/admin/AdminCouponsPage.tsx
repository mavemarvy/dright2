import { useState, useMemo } from 'react';
import {
  Ticket, Plus, Search, Copy, Pause, Play, Archive, Trash2, Edit2, X,
  Loader2, TrendingUp, DollarSign, Percent, Gift, Sparkles, Check, Eye,
} from 'lucide-react';
import {
  useCoupons, useRewardAnalytics,
} from '../../lib/rewardHooks';
import {
  type Coupon, type RewardType, type CreateCouponInput,
  createCoupon, updateCoupon, duplicateCoupon, deleteCoupon, generateCouponCode,
} from '../../lib/rewardEngine';
import { formatCurrency } from '../../lib/currency';

const REWARD_TYPES: { value: RewardType; label: string; icon: typeof Percent }[] = [
  { value: 'percentage_discount', label: 'Percentage Discount', icon: Percent },
  { value: 'fixed_amount', label: 'Fixed Amount', icon: DollarSign },
  { value: 'promotion_credits', label: 'Promotion Credits', icon: Sparkles },
  { value: 'promotion_token', label: 'Promotion Token', icon: Gift },
  { value: 'voucher', label: 'Marketplace Voucher', icon: Ticket },
  { value: 'gift_code', label: 'Gift Code', icon: Gift },
];

export default function AdminCouponsPage() {
  const { coupons, loading, refetch } = useCoupons();
  const { analytics } = useRewardAnalytics();
    const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'archived'>('all');
  const [showEditor, setShowEditor] = useState(false);
  const [editing, setEditing] = useState<Coupon | null>(null);


  const filtered = useMemo(() => {
    let result = coupons;
    if (statusFilter === 'active') result = result.filter(c => c.is_active && !c.is_archived);
    if (statusFilter === 'inactive') result = result.filter(c => !c.is_active && !c.is_archived);
    if (statusFilter === 'archived') result = result.filter(c => c.is_archived);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(c => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q));
    }
    return result;
  }, [coupons, statusFilter, search]);

  const handleToggleActive = async (c: Coupon) => {
    await updateCoupon(c.id, { is_active: !c.is_active });
    refetch();
  };

  const handleArchive = async (c: Coupon) => {
    await updateCoupon(c.id, { is_archived: !c.is_archived });
    refetch();
  };

  const handlePublish = async (c: Coupon) => {
    await updateCoupon(c.id, { is_published: !c.is_published });
    refetch();
  };

  const handleDuplicate = async (c: Coupon) => {
    await duplicateCoupon(c.id);
    refetch();
  };

  const handleDelete = async (c: Coupon) => {
    if (!confirm(`Delete coupon "${c.code}"? This cannot be undone.`)) return;
    await deleteCoupon(c.id);
    refetch();
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
            <Ticket className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Coupon & Reward Center</h1>
            <p className="text-sm text-gray-500">Create and manage promotional rewards</p>
          </div>
        </div>
        <button onClick={() => { setEditing(null); setShowEditor(true); }} className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-semibold hover:bg-primary-700 transition-colors">
          <Plus className="w-4 h-4" /> New Coupon
        </button>
      </div>

      {analytics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-1"><Ticket className="w-4 h-4 text-primary-500" /><span className="text-xs text-gray-400">Total Coupons</span></div>
            <p className="text-2xl font-bold text-gray-900">{analytics.total_coupons}</p>
            <p className="text-xs text-green-500">{analytics.active_coupons} active</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-1"><TrendingUp className="w-4 h-4 text-blue-500" /><span className="text-xs text-gray-400">Redemptions</span></div>
            <p className="text-2xl font-bold text-gray-900">{analytics.total_redemptions.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-1"><DollarSign className="w-4 h-4 text-green-500" /><span className="text-xs text-gray-400">Discount Given</span></div>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(analytics.total_discount_given)}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-1"><Percent className="w-4 h-4 text-purple-500" /><span className="text-xs text-gray-400">Redemption Rate</span></div>
            <p className="text-2xl font-bold text-gray-900">{analytics.avg_redemption_rate.toFixed(1)}%</p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Search by code or name..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-primary-500" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive' | 'archived')} className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-primary-500">
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-primary-500 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No coupons found</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(coupon => {
            const Icon = REWARD_TYPES.find(t => t.value === coupon.reward_type)?.icon || Ticket;
            return (
              <div key={coupon.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className="w-4 h-4 text-gray-400" />
                      <span className="font-mono font-bold text-sm text-gray-900">{coupon.code}</span>
                      {coupon.is_published && <span className="text-xs text-green-500 bg-green-50 px-2 py-0.5 rounded-full">Published</span>}
                      {!coupon.is_active && <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Inactive</span>}
                      {coupon.is_archived && <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Archived</span>}
                    </div>
                    <p className="text-sm text-gray-600">{coupon.name}</p>
                    <div className="flex flex-wrap gap-2 mt-2 text-xs text-gray-400">
                      <span className="bg-gray-100 px-2 py-1 rounded-full capitalize">{coupon.reward_type.replace(/_/g, ' ')}</span>
                      <span className="bg-gray-100 px-2 py-1 rounded-full">
                        {coupon.reward_type === 'percentage_discount' ? `${coupon.value}%` : formatCurrency(coupon.value)}
                      </span>
                      <span className="bg-gray-100 px-2 py-1 rounded-full">{coupon.current_uses} uses{coupon.max_uses ? ` / ${coupon.max_uses}` : ''}</span>
                      {coupon.end_date && <span className="bg-gray-100 px-2 py-1 rounded-full">Exp: {new Date(coupon.end_date).toLocaleDateString()}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => handlePublish(coupon)} title={coupon.is_published ? 'Unpublish' : 'Publish'} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
                      <Eye className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleToggleActive(coupon)} title={coupon.is_active ? 'Pause' : 'Activate'} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
                      {coupon.is_active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </button>
                    <button onClick={() => { setEditing(coupon); setShowEditor(true); }} title="Edit" className="p-2 text-primary-500 hover:bg-primary-50 rounded-lg transition-colors">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDuplicate(coupon)} title="Duplicate" className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
                      <Copy className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleArchive(coupon)} title="Archive" className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
                      <Archive className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(coupon)} title="Delete" className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showEditor && (
        <CouponEditorModal
          coupon={editing}
          onClose={() => { setShowEditor(false); setEditing(null); }}
          onSaved={() => { setShowEditor(false); setEditing(null); refetch(); }}
        />
      )}
    </div>
  );
}

function CouponEditorModal({ coupon, onClose, onSaved }: { coupon: Coupon | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    code: coupon?.code || '',
    name: coupon?.name || '',
    description: coupon?.description || '',
    reward_type: coupon?.reward_type || 'percentage_discount' as RewardType,
    value: coupon?.value || 10,
    currency: coupon?.currency || 'USD',
    end_date: coupon?.end_date ? new Date(coupon.end_date).toISOString().slice(0, 10) : '',
    max_uses: coupon?.max_uses ?? '',
    uses_per_user: coupon?.uses_per_user ?? 1,
    min_purchase_amount: coupon?.min_purchase_amount ?? 0,
    max_discount_amount: coupon?.max_discount_amount ?? '',
    is_active: coupon?.is_active ?? true,
    is_published: coupon?.is_published ?? false,
  });
  const [saving, setSaving] = useState(false);

  const handleGenerate = async () => {
    const code = await generateCouponCode(form.code.slice(0, 4), 8);
    setForm({ ...form, code });
  };

  const handleSave = async () => {
    setSaving(true);
    const input: CreateCouponInput = {
      code: form.code,
      name: form.name,
      description: form.description || undefined,
      reward_type: form.reward_type,
      value: Number(form.value),
      currency: form.currency,
      end_date: form.end_date ? new Date(form.end_date).toISOString() : null,
      max_uses: form.max_uses ? Number(form.max_uses) : null,
      uses_per_user: Number(form.uses_per_user),
      min_purchase_amount: Number(form.min_purchase_amount),
      max_discount_amount: form.max_discount_amount ? Number(form.max_discount_amount) : null,
      is_active: form.is_active,
      is_published: form.is_published,
    };
    if (coupon) {
      await updateCoupon(coupon.id, input as Partial<Coupon>);
    } else {
      await createCoupon(input);
    }
    setSaving(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">{coupon ? 'Edit Coupon' : 'New Coupon'}</h3>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-sm text-gray-500 block mb-1">Code</label>
            <div className="flex gap-2">
              <input type="text" value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="WELCOME10" className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-mono focus:outline-none focus:border-primary-500" />
              <button onClick={handleGenerate} className="px-3 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors whitespace-nowrap">Generate</button>
            </div>
          </div>
          <div>
            <label className="text-sm text-gray-500 block mb-1">Name</label>
            <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Welcome Discount" className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-primary-500" />
          </div>
          <div>
            <label className="text-sm text-gray-500 block mb-1">Description</label>
            <input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="10% off for new users" className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-primary-500" />
          </div>
          <div>
            <label className="text-sm text-gray-500 block mb-1">Reward Type</label>
            <select value={form.reward_type} onChange={e => setForm({ ...form, reward_type: e.target.value as RewardType })} className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-primary-500">
              {REWARD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-gray-500 block mb-1">Value {form.reward_type === 'percentage_discount' ? '(%)' : '($)'}</label>
              <input type="number" value={form.value} onChange={e => setForm({ ...form, value: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-primary-500" />
            </div>
            <div>
              <label className="text-sm text-gray-500 block mb-1">End Date</label>
              <input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-primary-500" />
            </div>
            <div>
              <label className="text-sm text-gray-500 block mb-1">Max Uses (blank=unlimited)</label>
              <input type="number" value={form.max_uses} onChange={e => setForm({ ...form, max_uses: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-primary-500" />
            </div>
            <div>
              <label className="text-sm text-gray-500 block mb-1">Uses Per User</label>
              <input type="number" value={form.uses_per_user} onChange={e => setForm({ ...form, uses_per_user: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-primary-500" />
            </div>
            <div>
              <label className="text-sm text-gray-500 block mb-1">Min Purchase ($)</label>
              <input type="number" value={form.min_purchase_amount} onChange={e => setForm({ ...form, min_purchase_amount: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-primary-500" />
            </div>
            <div>
              <label className="text-sm text-gray-500 block mb-1">Max Discount ($)</label>
              <input type="number" value={form.max_discount_amount} onChange={e => setForm({ ...form, max_discount_amount: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-primary-500" />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} className="accent-primary-600" /> Active
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input type="checkbox" checked={form.is_published} onChange={e => setForm({ ...form, is_published: e.target.checked })} className="accent-primary-600" /> Published
            </label>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100">
          <button onClick={handleSave} disabled={saving || !form.code || !form.name} className="w-full py-2.5 bg-primary-600 text-white rounded-xl text-sm font-semibold hover:bg-primary-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {saving ? 'Saving...' : 'Save Coupon'}
          </button>
        </div>
      </div>
    </div>
  );
}
