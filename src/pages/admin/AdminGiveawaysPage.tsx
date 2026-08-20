import { useState } from 'react';
import {
  Gift, Plus, X, Loader2, Trophy, Calendar, Play, Pause,
  Trash2, Sparkles, Check,
} from 'lucide-react';
import { useGiveaways } from '../../lib/rewardHooks';
import {
  type GiveawayType, type RewardType, type GiveawayCampaign,
  createGiveaway, updateGiveaway, deleteGiveaway, selectWinners,
} from '../../lib/rewardEngine';

const GIVEAWAY_TYPES: { value: GiveawayType; label: string }[] = [
  { value: 'holiday', label: 'Holiday Giveaway' },
  { value: 'referral', label: 'Referral Giveaway' },
  { value: 'seller_challenge', label: 'Seller Challenge' },
  { value: 'affiliate_competition', label: 'Affiliate Competition' },
  { value: 'first_n_users', label: 'First N Users' },
  { value: 'random_winners', label: 'Random Winners' },
];

const REWARD_TYPES: { value: RewardType; label: string }[] = [
  { value: 'percentage_discount', label: 'Percentage Discount' },
  { value: 'fixed_amount', label: 'Fixed Amount' },
  { value: 'promotion_credits', label: 'Promotion Credits' },
  { value: 'promotion_token', label: 'Promotion Token' },
  { value: 'voucher', label: 'Voucher' },
  { value: 'gift_code', label: 'Gift Code' },
];

export default function AdminGiveawaysPage() {
  const { giveaways, loading, refetch } = useGiveaways();
  const [showEditor, setShowEditor] = useState(false);

  const handleToggleStatus = async (g: GiveawayCampaign) => {
    const newStatus = g.status === 'active' ? 'paused' : 'active';
    await updateGiveaway(g.id, { status: newStatus });
    refetch();
  };

  const handleDelete = async (g: GiveawayCampaign) => {
    if (!confirm(`Delete giveaway "${g.name}"?`)) return;
    await deleteGiveaway(g.id);
    refetch();
  };

  const handleSelectWinners = async (g: GiveawayCampaign) => {
    if (!confirm(`Select ${g.max_winners} random winners for "${g.name}"?`)) return;
    const winners = await selectWinners(g.id, g.max_winners);
    alert(`${winners.length} winner(s) selected and notified!`);
    refetch();
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <Gift className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Giveaway Campaigns</h1>
            <p className="text-sm text-gray-500">Create and manage promotional giveaways</p>
          </div>
        </div>
        <button onClick={() => setShowEditor(true)} className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-semibold hover:bg-primary-700 transition-colors">
          <Plus className="w-4 h-4" /> New Giveaway
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-primary-500 animate-spin" /></div>
      ) : giveaways.length === 0 ? (
        <div className="text-center py-16">
          <Gift className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No giveaways yet</p>
          <p className="text-sm text-gray-400 mt-1">Create a giveaway to reward your users</p>
        </div>
      ) : (
        <div className="space-y-3">
          {giveaways.map(g => (
            <div key={g.id} className="bg-white rounded-2xl border border-gray-100 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      g.status === 'active' ? 'bg-green-50 text-green-600' :
                      g.status === 'paused' ? 'bg-gray-100 text-gray-600' :
                      g.status === 'completed' ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-red-500'
                    }`}>{g.status}</span>
                    <span className="text-xs text-gray-400">{GIVEAWAY_TYPES.find(t => t.value === g.giveaway_type)?.label}</span>
                  </div>
                  <p className="font-medium text-gray-900">{g.name}</p>
                  {g.description && <p className="text-sm text-gray-500 mt-1">{g.description}</p>}
                  <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-400">
                    <span className="flex items-center gap-1"><Trophy className="w-3 h-3" /> {g.max_winners} winners</span>
                    <span className="flex items-center gap-1"><Sparkles className="w-3 h-3" /> {REWARD_TYPES.find(t => t.value === g.reward_type)?.label}</span>
                    {g.end_date && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> Ends {new Date(g.end_date).toLocaleDateString()}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {g.status === 'active' && (
                    <button onClick={() => handleSelectWinners(g)} title="Select Winners" className="p-2 text-amber-500 hover:bg-amber-50 rounded-lg transition-colors">
                      <Trophy className="w-4 h-4" />
                    </button>
                  )}
                  <button onClick={() => handleToggleStatus(g)} title={g.status === 'active' ? 'Pause' : 'Resume'} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
                    {g.status === 'active' ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>
                  <button onClick={() => handleDelete(g)} title="Delete" className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showEditor && (
        <GiveawayEditorModal
          onClose={() => setShowEditor(false)}
          onSaved={() => { setShowEditor(false); refetch(); }}
        />
      )}
    </div>
  );
}

function GiveawayEditorModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: '',
    description: '',
    giveaway_type: 'random_winners' as GiveawayType,
    reward_type: 'promotion_credits' as RewardType,
    reward_value: 500,
    max_winners: 1,
    max_entries: '',
    end_date: '',
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await createGiveaway({
      name: form.name,
      description: form.description || undefined,
      giveaway_type: form.giveaway_type,
      reward_type: form.reward_type,
      reward_value: Number(form.reward_value),
      max_winners: Number(form.max_winners),
      max_entries: form.max_entries ? Number(form.max_entries) : undefined,
      end_date: form.end_date ? new Date(form.end_date).toISOString() : null,
    });
    setSaving(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">New Giveaway Campaign</h3>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-sm text-gray-500 block mb-1">Name</label>
            <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Holiday Giveaway 2026" className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-primary-500" />
          </div>
          <div>
            <label className="text-sm text-gray-500 block mb-1">Description</label>
            <input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Win 500 promotion credits!" className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-primary-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-gray-500 block mb-1">Type</label>
              <select value={form.giveaway_type} onChange={e => setForm({ ...form, giveaway_type: e.target.value as GiveawayType })} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-primary-500">
                {GIVEAWAY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-500 block mb-1">Reward</label>
              <select value={form.reward_type} onChange={e => setForm({ ...form, reward_type: e.target.value as RewardType })} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-primary-500">
                {REWARD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-500 block mb-1">Reward Value</label>
              <input type="number" value={form.reward_value} onChange={e => setForm({ ...form, reward_value: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-primary-500" />
            </div>
            <div>
              <label className="text-sm text-gray-500 block mb-1">Max Winners</label>
              <input type="number" value={form.max_winners} onChange={e => setForm({ ...form, max_winners: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-primary-500" />
            </div>
            <div>
              <label className="text-sm text-gray-500 block mb-1">Max Entries (blank=unlimited)</label>
              <input type="number" value={form.max_entries} onChange={e => setForm({ ...form, max_entries: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-primary-500" />
            </div>
            <div>
              <label className="text-sm text-gray-500 block mb-1">End Date</label>
              <input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-primary-500" />
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100">
          <button onClick={handleSave} disabled={saving || !form.name} className="w-full py-2.5 bg-primary-600 text-white rounded-xl text-sm font-semibold hover:bg-primary-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {saving ? 'Creating...' : 'Create Giveaway'}
          </button>
        </div>
      </div>
    </div>
  );
}
