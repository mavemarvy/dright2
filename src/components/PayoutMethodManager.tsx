import { useState } from 'react';
import { usePayoutMethods, createPayoutMethod, updatePayoutMethod, setPrimaryPayoutMethod, deletePayoutMethod } from '../lib/crmHooks';
import { PAYOUT_METHOD_TYPES, CRYPTO_CURRENCIES, CRYPTO_NETWORKS } from '../lib/crmTypes';
import type { PayoutMethod } from '../lib/crmTypes';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Trash2, Star, X, Wallet, Building2, Bitcoin, Mail, Landmark, Shield } from 'lucide-react';

const METHOD_ICONS: Record<string, React.ReactNode> = {
  bank: <Building2 className="w-5 h-5" />,
  paypal: <Mail className="w-5 h-5" />,
  payoneer: <Landmark className="w-5 h-5" />,
  crypto: <Bitcoin className="w-5 h-5" />,
};

export default function PayoutMethodManager() {
  const { profile } = useAuth();
  const { methods, loading, refetch } = usePayoutMethods(profile?.id ?? null);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    method_type: 'bank' as PayoutMethod['method_type'],
    is_primary: false,
    account_holder_name: '',
    bank_name: '',
    account_number: '',
    bank_code: '',
    account_nickname: '',
    paypal_email: '',
    payoneer_email: '',
    crypto_currency: 'BTC',
    crypto_network: 'bitcoin',
    crypto_wallet_address: '',
    crypto_wallet_nickname: '',
  });

  const resetForm = () => {
    setForm({
      method_type: 'bank', is_primary: false, account_holder_name: '', bank_name: '',
      account_number: '', bank_code: '', account_nickname: '', paypal_email: '', payoneer_email: '',
      crypto_currency: 'BTC', crypto_network: 'bitcoin', crypto_wallet_address: '', crypto_wallet_nickname: '',
    });
    setEditId(null);
  };

  const handleSave = async () => {
    if (!profile) return;
    setError(null);
    try {
      if (editId) {
        const updates: Partial<PayoutMethod> = { is_primary: form.is_primary };
        if (form.method_type === 'bank') {
          updates.account_holder_name = form.account_holder_name || null;
          updates.bank_name = form.bank_name || null;
          updates.account_number = form.account_number || null;
          updates.bank_code = form.bank_code || null;
          updates.account_nickname = form.account_nickname || null;
        } else if (form.method_type === 'paypal') {
          updates.paypal_email = form.paypal_email || null;
        } else if (form.method_type === 'payoneer') {
          updates.payoneer_email = form.payoneer_email || null;
        } else if (form.method_type === 'crypto') {
          updates.crypto_currency = form.crypto_currency;
          updates.crypto_network = form.crypto_network;
          updates.crypto_wallet_address = form.crypto_wallet_address || null;
          updates.crypto_wallet_nickname = form.crypto_wallet_nickname || null;
        }
        await updatePayoutMethod(editId, updates);
        if (form.is_primary) await setPrimaryPayoutMethod(profile.id, editId);
      } else {
        const input: Record<string, unknown> = {
          user_id: profile.id,
          method_type: form.method_type,
          is_primary: form.is_primary,
        };
        if (form.method_type === 'bank') {
          input.account_holder_name = form.account_holder_name || null;
          input.bank_name = form.bank_name || null;
          input.account_number = form.account_number || null;
          input.bank_code = form.bank_code || null;
          input.account_nickname = form.account_nickname || null;
        } else if (form.method_type === 'paypal') {
          input.paypal_email = form.paypal_email || null;
        } else if (form.method_type === 'payoneer') {
          input.payoneer_email = form.payoneer_email || null;
        } else if (form.method_type === 'crypto') {
          input.crypto_currency = form.crypto_currency;
          input.crypto_network = form.crypto_network;
          input.crypto_wallet_address = form.crypto_wallet_address || null;
          input.crypto_wallet_nickname = form.crypto_wallet_nickname || null;
        }
        await createPayoutMethod(input as Parameters<typeof createPayoutMethod>[0]);
        if (form.is_primary) {
          const newMethods = await refetch();
          const newMethod = (newMethods as PayoutMethod[] | undefined)?.find((m) => m.method_type === form.method_type && !m.is_deleted);
          if (newMethod) await setPrimaryPayoutMethod(profile.id, newMethod.id);
        }
      }
      void refetch();
      setShowAdd(false);
      resetForm();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to save payout method'); }
  };

  const handleDelete = async (id: string) => {
    setError(null);
    try {
      await deletePayoutMethod(id);
      void refetch();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to delete'); }
  };

  const handleSetPrimary = async (id: string) => {
    if (!profile) return;
    try {
      await setPrimaryPayoutMethod(profile.id, id);
      void refetch();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to set primary'); }
  };

  const handleEdit = (m: PayoutMethod) => {
    setEditId(m.id);
    setForm({
      method_type: m.method_type, is_primary: m.is_primary,
      account_holder_name: m.account_holder_name ?? '', bank_name: m.bank_name ?? '',
      account_number: m.account_number ?? '', bank_code: m.bank_code ?? '', account_nickname: m.account_nickname ?? '',
      paypal_email: m.paypal_email ?? '', payoneer_email: m.payoneer_email ?? '',
      crypto_currency: m.crypto_currency ?? 'BTC', crypto_network: m.crypto_network ?? 'bitcoin',
      crypto_wallet_address: m.crypto_wallet_address ?? '', crypto_wallet_nickname: m.crypto_wallet_nickname ?? '',
    });
    setShowAdd(true);
  };

  const getDisplayName = (m: PayoutMethod): string => {
    switch (m.method_type) {
      case 'bank': return m.account_nickname || m.bank_name || 'Bank Account';
      case 'paypal': return m.paypal_email || 'PayPal';
      case 'payoneer': return m.payoneer_email || 'Payoneer';
      case 'crypto': return m.crypto_wallet_nickname || `${m.crypto_currency} Wallet`;
      default: return 'Payout Method';
    }
  };

  const getDetail = (m: PayoutMethod): string => {
    switch (m.method_type) {
      case 'bank': return `${m.account_holder_name ?? ''} ••••${m.account_number?.slice(-4) ?? ''}`;
      case 'paypal': return 'PayPal Account';
      case 'payoneer': return 'Payoneer Account';
      case 'crypto': return `${m.crypto_currency} (${m.crypto_network})`;
      default: return '';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2"><Wallet className="w-5 h-5 text-primary-500" /> Payout Methods</h3>
        <button onClick={() => { resetForm(); setShowAdd(true); }} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl">
          <Plus className="w-4 h-4" /> Add Method
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 flex items-center justify-between"><span>{error}</span><button onClick={() => setError(null)}><X className="w-4 h-4" /></button></div>}

      {loading && <div className="text-sm text-gray-400">Loading payout methods...</div>}

      {/* Method List */}
      <div className="space-y-2">
        {methods.length === 0 && !loading && (
          <div className="text-center py-8 bg-gray-50 rounded-xl">
            <Wallet className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No payout methods added yet</p>
          </div>
        )}
        {methods.map((m) => (
          <div key={m.id} className={`bg-white rounded-xl border p-4 flex items-center gap-3 ${m.is_primary ? 'border-primary-300 ring-1 ring-primary-100' : 'border-gray-100'}`}>
            <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center text-primary-600 flex-shrink-0">{METHOD_ICONS[m.method_type]}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium text-sm text-gray-900 truncate">{getDisplayName(m)}</p>
                {m.is_primary && <span className="px-1.5 py-0.5 rounded-full text-xs bg-primary-50 text-primary-600 border border-primary-200 flex items-center gap-1"><Star className="w-3 h-3" /> Primary</span>}
              </div>
              <p className="text-xs text-gray-400 truncate">{getDetail(m)}</p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {!m.is_primary && <button onClick={() => handleSetPrimary(m.id)} className="text-xs text-primary-600 hover:underline">Set Primary</button>}
              <button onClick={() => handleEdit(m)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg"><Shield className="w-4 h-4" /></button>
              <button onClick={() => handleDelete(m.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        ))}
      </div>

      {/* Add/Edit Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => { setShowAdd(false); resetForm(); }}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">{editId ? 'Edit Payout Method' : 'Add Payout Method'}</h2>
              <button onClick={() => { setShowAdd(false); resetForm(); }} className="p-2 hover:bg-gray-100 rounded-xl"><X className="w-4 h-4" /></button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700">Method Type</label>
                <select value={form.method_type} onChange={(e) => setForm({ ...form, method_type: e.target.value as PayoutMethod['method_type'] })}
                  disabled={!!editId}
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-50">
                  {PAYOUT_METHOD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>

              {/* Bank fields */}
              {form.method_type === 'bank' && (
                <>
                  <Field label="Account Holder Name" value={form.account_holder_name} onChange={(v) => setForm({ ...form, account_holder_name: v })} />
                  <Field label="Bank Name" value={form.bank_name} onChange={(v) => setForm({ ...form, bank_name: v })} />
                  <Field label="Account Number" value={form.account_number} onChange={(v) => setForm({ ...form, account_number: v })} />
                  <Field label="Bank Code (optional)" value={form.bank_code} onChange={(v) => setForm({ ...form, bank_code: v })} />
                  <Field label="Account Nickname" value={form.account_nickname} onChange={(v) => setForm({ ...form, account_nickname: v })} />
                </>
              )}

              {/* PayPal */}
              {form.method_type === 'paypal' && (
                <Field label="PayPal Email" type="email" value={form.paypal_email} onChange={(v) => setForm({ ...form, paypal_email: v })} />
              )}

              {/* Payoneer */}
              {form.method_type === 'payoneer' && (
                <Field label="Payoneer Email" type="email" value={form.payoneer_email} onChange={(v) => setForm({ ...form, payoneer_email: v })} />
              )}

              {/* Crypto */}
              {form.method_type === 'crypto' && (
                <>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Cryptocurrency</label>
                    <select value={form.crypto_currency} onChange={(e) => setForm({ ...form, crypto_currency: e.target.value })}
                      className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                      {CRYPTO_CURRENCIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Network</label>
                    <select value={form.crypto_network} onChange={(e) => setForm({ ...form, crypto_network: e.target.value })}
                      className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                      {CRYPTO_NETWORKS.map((n) => <option key={n.value} value={n.value}>{n.label}</option>)}
                    </select>
                  </div>
                  <Field label="Wallet Address" value={form.crypto_wallet_address} onChange={(v) => setForm({ ...form, crypto_wallet_address: v })} />
                  <Field label="Wallet Nickname" value={form.crypto_wallet_nickname} onChange={(v) => setForm({ ...form, crypto_wallet_nickname: v })} />
                </>
              )}

              {/* Primary toggle */}
              <label className="flex items-center gap-2 mt-2">
                <input type="checkbox" checked={form.is_primary} onChange={(e) => setForm({ ...form, is_primary: e.target.checked })}
                  className="w-4 h-4 rounded text-primary-600 focus:ring-primary-500" />
                <span className="text-sm text-gray-700">Set as primary payout method</span>
              </label>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => { setShowAdd(false); resetForm(); }} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl">Cancel</button>
              <button onClick={handleSave} className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl">{editId ? 'Update' : 'Add'} Method</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
    </div>
  );
}
