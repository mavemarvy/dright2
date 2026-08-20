import { useState } from 'react';
import {
  Plus, Trash2, Edit2, Check, Star, X, Shield, Loader2,
  Building2, AlertCircle,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  useBankAccounts, addBankAccount, updateBankAccount, deleteBankAccount,
  setDefaultBankAccount, verifyBankAccount, NIGERIAN_BANKS, type BankAccount,
} from '../lib/bankAccounts';

interface Props {
  onSelect?: (account: BankAccount) => void;
  selectedId?: string;
  compact?: boolean;
}

export default function BankAccountManager({ onSelect, selectedId, compact }: Props) {
  const { user } = useAuth();
  const { accounts, loading, reload } = useBankAccounts(user?.id);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<BankAccount | null>(null);
  const [form, setForm] = useState({ bank_code: '', bank_name: '', account_number: '', account_name: '', is_default: false });
  const [saving, setSaving] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  const resetForm = () => {
    setForm({ bank_code: '', bank_name: '', account_number: '', account_name: '', is_default: false });
    setEditing(null);
    setError(null);
  };

  const handleSave = async () => {
    if (!form.bank_name || !form.account_number || !form.account_name) {
      setError('Please fill all fields');
      return;
    }
    if (form.account_number.length !== 10) {
      setError('Account number must be exactly 10 digits');
      return;
    }

    setSaving(true);
    setError(null);

    if (editing) {
      const result = await updateBankAccount(editing.id, {
        bank_name: form.bank_name,
        account_name: form.account_name,
        is_default: form.is_default,
      });
      if (form.is_default) {
        await setDefaultBankAccount(user.id, editing.id);
      }
      if (!result.success) setError(result.error || 'Failed to update');
    } else {
      const result = await addBankAccount(user.id, form);
      if (!result.success) setError(result.error || 'Failed to add bank account');
    }

    setSaving(false);
    if (!error) {
      setShowAdd(false);
      resetForm();
      reload();
    }
  };

  const handleDelete = async (id: string) => {
    const result = await deleteBankAccount(id);
    if (result.success) reload();
  };

  const handleSetDefault = async (id: string) => {
    await setDefaultBankAccount(user.id, id);
    reload();
  };

  const handleVerify = async (account: BankAccount) => {
    setVerifyingId(account.id);
    const result = await verifyBankAccount(account.id, account.account_number, account.bank_code);
    setVerifyingId(null);
    if (result.success) {
      reload();
    } else {
      setError(result.error || 'Verification failed');
    }
  };

  const startEdit = (account: BankAccount) => {
    setEditing(account);
    setForm({
      bank_code: account.bank_code,
      bank_name: account.bank_name,
      account_number: account.account_number,
      account_name: account.account_name,
      is_default: account.is_default,
    });
    setShowAdd(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-primary-600" />
          Bank Accounts
        </h3>
        {!showAdd && (
          <button
            onClick={() => { resetForm(); setShowAdd(true); }}
            className="flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-700"
          >
            <Plus className="w-4 h-4" />Add Account
          </button>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {showAdd && (
        <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-900">{editing ? 'Edit Account' : 'Add Bank Account'}</span>
            <button onClick={() => { setShowAdd(false); resetForm(); }} className="p-1 rounded-lg hover:bg-gray-200">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Bank</label>
            <select
              value={form.bank_code}
              onChange={(e) => {
                const bank = NIGERIAN_BANKS.find(b => b.code === e.target.value);
                setForm({ ...form, bank_code: e.target.value, bank_name: bank?.name || '' });
              }}
              disabled={!!editing}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100"
            >
              <option value="">Select bank...</option>
              {NIGERIAN_BANKS.map(b => (
                <option key={b.code + b.name} value={b.code}>{b.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Account Number (10 digits)</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={10}
              value={form.account_number}
              onChange={(e) => setForm({ ...form, account_number: e.target.value.replace(/\D/g, '') })}
              placeholder="0123456789"
              disabled={!!editing}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Account Name</label>
            <input
              type="text"
              value={form.account_name}
              onChange={(e) => setForm({ ...form, account_name: e.target.value })}
              placeholder="John Doe"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_default}
              onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm text-gray-600">Set as default account</span>
          </label>

          <button
            onClick={handleSave}
            disabled={saving || !form.bank_name || !form.account_number || !form.account_name}
            className="w-full py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {editing ? 'Update Account' : 'Save Account'}
          </button>
        </div>
      )}

      {/* Account List */}
      {accounts.length === 0 && !showAdd ? (
        <div className="text-center py-8 bg-gray-50 rounded-2xl">
          <Building2 className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No bank accounts yet. Add one to start withdrawing.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {accounts.map((account) => (
            <div
              key={account.id}
              className={`p-4 rounded-2xl border-2 transition-all ${
                selectedId === account.id
                  ? 'border-primary-600 bg-primary-50'
                  : 'border-gray-100 bg-white hover:border-gray-200'
              } ${onSelect ? 'cursor-pointer' : ''}`}
              onClick={() => onSelect?.(account)}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-5 h-5 text-gray-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900 text-sm truncate">{account.bank_name}</span>
                      {account.is_default && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary-100 text-primary-700">
                          <Star className="w-2.5 h-2.5 fill-primary-600" />Default
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 font-mono mt-0.5">{account.account_number}</p>
                    <p className="text-xs text-gray-400 truncate">{account.account_name}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      {account.is_verified || account.verification_status === 'verified' ? (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                          <Shield className="w-2.5 h-2.5" />Verified
                        </span>
                      ) : account.verification_status === 'pending' ? (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                          <Loader2 className="w-2.5 h-2.5" />Verifying
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
                          Unverified
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {!compact && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {!account.is_verified && account.verification_status !== 'pending' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleVerify(account); }}
                        disabled={verifyingId === account.id}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-primary-600"
                        title="Verify account"
                      >
                        {verifyingId === account.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Shield className="w-3.5 h-3.5" />}
                      </button>
                    )}
                    {!account.is_default && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleSetDefault(account.id); }}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-primary-600"
                        title="Set as default"
                      >
                        <Star className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); startEdit(account); }}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-primary-600"
                      title="Edit"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(account.id); }}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-red-500"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!compact && (
        <p className="text-xs text-gray-400 flex items-start gap-1.5">
          <Shield className="w-3 h-3 mt-0.5 flex-shrink-0" />
          Bank account details are encrypted and never shared. Account verification uses Paystack's secure resolve API.
        </p>
      )}
    </div>
  );
}
