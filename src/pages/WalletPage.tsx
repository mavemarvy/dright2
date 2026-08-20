import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Wallet, ArrowDownLeft, ArrowUpRight, Lock, Download, RefreshCw, Plus,
  TrendingUp, Clock, Shield, DollarSign, Loader2, Search, ArrowUpRight as WithdrawIcon,
} from 'lucide-react';
import {
  getWalletSummary, getTransactions, getOrCreateWallet,
  exportTransactionsCSV, downloadCSV,
  type WalletSummary as TWalletSummary, type WalletTransaction,
} from '../lib/walletEngine';
import { useCurrency } from '../contexts/CurrencyContext';
import {
  getSecurityStatus, type PaymentSecurityStatus,
} from '../lib/paymentSecurity';

export default function WalletPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { format, selectedCurrency } = useCurrency();
  const [summary, setSummary] = useState<TWalletSummary | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [security, setSecurity] = useState<PaymentSecurityStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'credit' | 'debit'>('all');
  const [page, setPage] = useState(0);

  const PAGE_SIZE = 20;

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const walletId = await getOrCreateWallet(user.id);
    if (!walletId) { setLoading(false); return; }
    const [sum, txns, sec] = await Promise.all([
      getWalletSummary(user.id),
      getTransactions(user.id, PAGE_SIZE, page * PAGE_SIZE),
      getSecurityStatus(user.id),
    ]);
    setSummary(sum); setTransactions(txns); setSecurity(sec);
    setLoading(false);
  }, [user?.id, page]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh when returning from payment callback
  useEffect(() => {
    const handler = () => load();
    window.addEventListener('wallet-updated', handler);
    return () => window.removeEventListener('wallet-updated', handler);
  }, [load]);

  const filtered = transactions.filter(t => {
    if (filterType !== 'all' && t.type !== filterType) return false;
    if (search && !t.description?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleExport = () => {
    const csv = exportTransactionsCSV(filtered);
    downloadCSV(`wallet-statement-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  if (loading) return (
    <div className="p-8 flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
    </div>
  );

  const balances = summary ? [
    { label: 'Available', value: summary.balance, icon: Wallet, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'Pending', value: summary.pending_balance, icon: Clock, color: 'text-amber-600 bg-amber-50' },
    { label: 'Locked', value: summary.locked_balance, icon: Lock, color: 'text-red-600 bg-red-50' },
    { label: 'Escrow', value: summary.escrow_balance, icon: Shield, color: 'text-blue-600 bg-blue-50' },
    { label: 'Referral', value: summary.referral_balance, icon: TrendingUp, color: 'text-purple-600 bg-purple-50' },
    { label: 'Affiliate', value: summary.affiliate_balance, icon: DollarSign, color: 'text-indigo-600 bg-indigo-50' },
    { label: 'Creator', value: summary.creator_balance, icon: TrendingUp, color: 'text-pink-600 bg-pink-50' },
    { label: 'Seller Earnings', value: summary.seller_earnings, icon: DollarSign, color: 'text-teal-600 bg-teal-50' },
  ] : [];

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
            <Wallet className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">My Wallet</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">{summary?.currency || selectedCurrency} • {summary?.is_frozen ? 'Frozen' : 'Active'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/wallet/fund')} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700">
            <Plus className="w-4 h-4" /> Fund Wallet
          </button>
          <button onClick={() => navigate('/wallet/withdraw')} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800">
            <WithdrawIcon className="w-4 h-4" /> Withdraw
          </button>
          <button onClick={load} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            <RefreshCw className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          </button>
        </div>
      </div>

      {summary?.is_frozen && (
        <div className="mb-4 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 flex items-center gap-2">
          <Lock className="w-5 h-5 text-red-500" />
          <p className="text-sm text-red-700 dark:text-red-400">Your wallet is frozen. {summary.frozen_reason || 'Contact support for assistance.'}</p>
        </div>
      )}

      {/* Balance cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {balances.map(b => (
          <div key={b.label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${b.color}`}>
              <b.icon className="w-4 h-4" />
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-white">{format(b.value, summary?.currency || selectedCurrency)}</p>
            <p className="text-xs text-gray-400">{b.label}</p>
          </div>
        ))}
      </div>

      {/* Lifetime stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4">
          <p className="text-xs text-gray-400 mb-1">Total Deposited</p>
          <p className="text-sm font-semibold text-emerald-600">{format(summary?.total_deposited || 0, summary?.currency || selectedCurrency)}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4">
          <p className="text-xs text-gray-400 mb-1">Total Withdrawn</p>
          <p className="text-sm font-semibold text-amber-600">{format(summary?.total_withdrawn || 0, summary?.currency || selectedCurrency)}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4">
          <p className="text-xs text-gray-400 mb-1">Total Paid Out</p>
          <p className="text-sm font-semibold text-blue-600">{format(summary?.total_paid_out || 0, summary?.currency || selectedCurrency)}</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <button onClick={() => navigate('/wallet/fund')} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 flex items-center gap-3 hover:border-emerald-300 transition-colors text-left">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
            <Plus className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Add Money</p>
            <p className="text-xs text-gray-400">Fund your wallet</p>
          </div>
        </button>
        <button onClick={() => navigate('/wallet/withdraw')} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 flex items-center gap-3 hover:border-gray-300 transition-colors text-left">
          <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
            <WithdrawIcon className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Withdraw</p>
            <p className="text-xs text-gray-400">Transfer to bank</p>
          </div>
        </button>
      </div>

      {/* PIN status banner */}
      {security && !security.has_pin && (
        <a href="/security" className="block mb-6 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors">
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-amber-500" />
            <div>
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Set up your Payment PIN</p>
              <p className="text-xs text-amber-600 dark:text-amber-500">Secure your wallet with a payment PIN before making transactions</p>
            </div>
          </div>
        </a>
      )}

      {/* Escrow Info */}
      {summary && Number(summary.escrow_balance) > 0 && (
        <div className="mb-6 p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-blue-700 dark:text-blue-400">
                {format(summary.escrow_balance, summary.currency || selectedCurrency)} in Escrow
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-500 mt-0.5">
                Funds held safely until your orders are completed. Released automatically after delivery or when you confirm receipt.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Transaction history */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-900 dark:text-white">Transaction History</h2>
          <div className="flex items-center gap-3">
            <Link to="/wallet/history" className="text-xs text-indigo-500 hover:text-indigo-600 font-medium">
              View Full History →
            </Link>
            <button onClick={handleExport} className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1">
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-4">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search transactions..."
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:outline-none focus:border-emerald-500" />
          </div>
          <select value={filterType} onChange={e => setFilterType(e.target.value as any)}
            className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:outline-none focus:border-emerald-500">
            <option value="all">All</option>
            <option value="credit">Credits</option>
            <option value="debit">Debits</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No transactions yet.</p>
        ) : (
          <div className="space-y-2">
            {filtered.map(t => (
              <div key={t.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/30">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center ${t.type === 'credit' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                  {t.type === 'credit' ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{t.description || t.type}</p>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <span>{new Date(t.created_at).toLocaleString()}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-semibold ${t.type === 'credit' ? 'text-emerald-600' : 'text-red-600'}`}>
                    {t.type === 'credit' ? '+' : '-'}{format(t.amount, summary?.currency || selectedCurrency)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {transactions.length === PAGE_SIZE && (
          <button onClick={() => setPage(p => p + 1)} className="w-full mt-4 py-2 text-sm text-emerald-600 hover:text-emerald-700">
            Load more
          </button>
        )}
      </div>
    </div>
  );
}
