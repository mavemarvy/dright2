import { useState, useEffect, useCallback } from 'react';
import {
  Wallet, Search, Lock, ArrowUpRight, ArrowDownLeft,
  RefreshCw, Loader2, Download, TrendingUp, TrendingDown,
  DollarSign, Eye,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatCurrency, exportTransactionsCSV, downloadCSV } from '../../lib/walletEngine';

interface AdminWallet {
  id: string; user_id: string; balance: number; pending_balance: number;
  locked_balance: number; escrow_balance: number; referral_balance: number;
  affiliate_balance: number; creator_balance: number; advertiser_budget: number;
  seller_earnings: number; currency: string; is_frozen: boolean;
  frozen_reason: string | null; total_deposited: number; total_withdrawn: number;
  created_at: string; updated_at: string;
}

interface AdminTransaction {
  id: string; wallet_id: string; user_id: string; type: string; amount: number;
  balance_after: number | null; description: string | null; metadata: any; created_at: string;
}

export default function AdminWalletManagerPage() {
  const [wallets, setWallets] = useState<AdminWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedWallet, setSelectedWallet] = useState<AdminWallet | null>(null);
  const [transactions, setTransactions] = useState<AdminTransaction[]>([]);
  const [adjustment, setAdjustment] = useState({ type: 'credit', amount: '', description: '', balanceField: 'balance' });
  const [freezeReason, setFreezeReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('cc_wallets').select('*').order('updated_at', { ascending: false }).limit(100);
    if (error) console.error('Failed to load wallets:', error);
    setWallets((data as AdminWallet[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadTransactions = useCallback(async (walletId: string) => {
    const { data, error } = await supabase.from('cc_transactions').select('*').eq('wallet_id', walletId).order('created_at', { ascending: false }).limit(50);
    if (error) console.error('Failed to load transactions:', error);
    setTransactions((data as AdminTransaction[]) || []);
  }, []);

  const handleSelect = (w: AdminWallet) => { setSelectedWallet(w); loadTransactions(w.id); };

  const handleFreeze = async () => {
    if (!selectedWallet) return;
    setActionLoading(true);
    const { error } = await supabase.rpc('admin_freeze_wallet', {
      p_admin_id: null, p_wallet_id: selectedWallet.id,
      p_freeze: !selectedWallet.is_frozen, p_reason: freezeReason || null,
    });
    setActionLoading(false);
    if (error) { console.error('Freeze failed:', error); return; }
    setFreezeReason(''); load(); if (selectedWallet) handleSelect({ ...selectedWallet, is_frozen: !selectedWallet.is_frozen });
  };

  const handleAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWallet) return;
    setActionLoading(true);
    const { error } = await supabase.rpc('admin_manual_adjustment', {
      p_admin_id: null, p_user_id: selectedWallet.user_id, p_wallet_id: selectedWallet.id,
      p_type: adjustment.type, p_amount: parseFloat(adjustment.amount),
      p_description: adjustment.description, p_balance_field: adjustment.balanceField,
    });
    setActionLoading(false);
    if (error) { console.error('Adjustment failed:', error); return; }
    setAdjustment({ type: 'credit', amount: '', description: '', balanceField: 'balance' });
    load(); loadTransactions(selectedWallet.id);
  };

  const filtered = wallets.filter(w => !search || w.user_id.includes(search));

  if (loading) return <div className="p-8 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
          <Wallet className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Wallet Manager</h1>
          <p className="text-sm text-gray-500">View wallets, manage balances, freeze/unfreeze, manual adjustments</p>
        </div>
      </div>

      {/* Platform stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard icon={DollarSign} label="Total Balance" value={formatCurrency(wallets.reduce((s, w) => s + Number(w.balance), 0))} color="emerald" />
        <StatCard icon={TrendingUp} label="Total Deposited" value={formatCurrency(wallets.reduce((s, w) => s + Number(w.total_deposited), 0))} color="blue" />
        <StatCard icon={TrendingDown} label="Total Withdrawn" value={formatCurrency(wallets.reduce((s, w) => s + Number(w.total_withdrawn), 0))} color="amber" />
        <StatCard icon={Lock} label="Frozen Wallets" value={wallets.filter(w => w.is_frozen).length.toString()} color="red" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Wallet list */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-900 dark:text-white">All Wallets ({filtered.length})</h2>
            <button onClick={load} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><RefreshCw className="w-4 h-4 text-gray-400" /></button>
          </div>
          <div className="relative mb-3">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by user ID..."
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:outline-none focus:border-emerald-500" />
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {filtered.map(w => (
              <div key={w.id} onClick={() => handleSelect(w)}
                className={`p-3 rounded-lg cursor-pointer transition-colors ${selectedWallet?.id === w.id ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800' : 'hover:bg-gray-50 dark:hover:bg-gray-700/30 border border-transparent'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-gray-500">{w.user_id.slice(0, 8)}...</span>
                  {w.is_frozen && <span className="px-1.5 py-0.5 text-xs rounded bg-red-100 text-red-600">Frozen</span>}
                </div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{formatCurrency(Number(w.balance), w.currency)}</p>
                <p className="text-xs text-gray-400">Updated {new Date(w.updated_at).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Selected wallet detail */}
        {selectedWallet ? (
          <div className="space-y-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
              <h2 className="font-bold text-gray-900 dark:text-white mb-3">Wallet Details</h2>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {[
                  ['Available', selectedWallet.balance], ['Pending', selectedWallet.pending_balance],
                  ['Locked', selectedWallet.locked_balance], ['Escrow', selectedWallet.escrow_balance],
                  ['Referral', selectedWallet.referral_balance], ['Affiliate', selectedWallet.affiliate_balance],
                  ['Creator', selectedWallet.creator_balance], ['Seller', selectedWallet.seller_earnings],
                ].map(([label, val]) => (
                  <div key={label as string} className="p-2 rounded-lg bg-gray-50 dark:bg-gray-700/30">
                    <p className="text-xs text-gray-400">{label}</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{formatCurrency(Number(val), selectedWallet.currency)}</p>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 mt-4">
                <button onClick={handleFreeze} disabled={actionLoading}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium ${selectedWallet.is_frozen ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-red-500 text-white hover:bg-red-600'} disabled:opacity-50`}>
                  {actionLoading ? '...' : selectedWallet.is_frozen ? 'Unfreeze' : 'Freeze'}
                </button>
                {!selectedWallet.is_frozen && (
                  <input type="text" value={freezeReason} onChange={e => setFreezeReason(e.target.value)} placeholder="Freeze reason (optional)"
                    className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs" />
                )}
              </div>
            </div>

            {/* Manual adjustment */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
              <h3 className="font-bold text-gray-900 dark:text-white mb-3">Manual Adjustment</h3>
              <form onSubmit={handleAdjustment} className="space-y-2">
                <div className="flex gap-2">
                  <select value={adjustment.type} onChange={e => setAdjustment({ ...adjustment, type: e.target.value })}
                    className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm">
                    <option value="credit">Credit (Add)</option>
                    <option value="debit">Debit (Remove)</option>
                  </select>
                  <select value={adjustment.balanceField} onChange={e => setAdjustment({ ...adjustment, balanceField: e.target.value })}
                    className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm">
                    <option value="balance">Available</option>
                    <option value="pending_balance">Pending</option>
                    <option value="locked_balance">Locked</option>
                    <option value="escrow_balance">Escrow</option>
                    <option value="referral_balance">Referral</option>
                    <option value="affiliate_balance">Affiliate</option>
                    <option value="creator_balance">Creator</option>
                    <option value="seller_earnings">Seller</option>
                  </select>
                  <input type="number" step="0.01" value={adjustment.amount} onChange={e => setAdjustment({ ...adjustment, amount: e.target.value })} placeholder="Amount" required
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" />
                </div>
                <input type="text" value={adjustment.description} onChange={e => setAdjustment({ ...adjustment, description: e.target.value })} placeholder="Description / reason" required
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" />
                <button type="submit" disabled={actionLoading} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
                  {actionLoading ? 'Processing...' : 'Apply Adjustment'}
                </button>
              </form>
            </div>

            {/* Transaction history */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-gray-900 dark:text-white">Recent Transactions</h3>
                <button onClick={() => downloadCSV('admin-transactions.csv', exportTransactionsCSV(transactions as any))} className="text-xs text-gray-500 flex items-center gap-1"><Download className="w-3.5 h-3.5" /> Export</button>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {transactions.length === 0 ? <p className="text-sm text-gray-400 text-center py-4">No transactions.</p> : transactions.map(t => (
                  <div key={t.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${t.type === 'credit' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                      {t.type === 'credit' ? <ArrowDownLeft className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{t.description || t.type}</p>
                      <p className="text-xs text-gray-400">{new Date(t.created_at).toLocaleString()}</p>
                    </div>
                    <p className={`text-xs font-semibold ${t.type === 'credit' ? 'text-emerald-600' : 'text-red-600'}`}>{t.type === 'credit' ? '+' : '-'}{formatCurrency(Number(t.amount))}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center text-gray-400 p-12">
            <Eye className="w-8 h-8 mr-2" /> Select a wallet to view details
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  const colors: Record<string, string> = { emerald: 'bg-emerald-50 text-emerald-600', blue: 'bg-blue-50 text-blue-600', amber: 'bg-amber-50 text-amber-600', red: 'bg-red-50 text-red-600' };
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${colors[color]}`}><Icon className="w-4 h-4" /></div>
      <p className="text-lg font-bold text-gray-900 dark:text-white">{value}</p>
      <p className="text-xs text-gray-400">{label}</p>
    </div>
  );
}
