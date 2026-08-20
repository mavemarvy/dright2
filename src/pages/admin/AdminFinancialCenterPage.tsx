import { useState, useEffect, useCallback } from 'react';
import {
  DollarSign, TrendingUp, Wallet, Loader2, Download, Search,
  ArrowDownCircle, ArrowUpCircle, Shield,
  Banknote, BarChart3, FileText, ChevronLeft, ChevronRight,
  RefreshCw, Activity, Lock, CheckCircle2, XCircle, Clock,
  Building2, Scale, PiggyBank, Receipt, RotateCcw,
} from 'lucide-react';
import {
  getPlatformFinancialSummary, getPlatformAccounts, getPlatformLedgerEntries,
  searchPlatformTransactions, getRefundRecords, updateRefundStatus,
  getWithdrawalQueue, exportTransactionsToCSV, exportRefundsToCSV, downloadCSVFile,
  TRANSACTION_STATUSES, TRANSACTION_CATEGORIES, getStatusColor, formatCurrency,
  type PlatformFinancialSummary, type PlatformAccount, type PlatformLedgerEntry,
  type DetailedTransaction, type RefundRecord, type RefundStatus,
  type TransactionStatus, type TransactionCategory,
} from '../../lib/financialCenter';
import { useAuth } from '../../contexts/AuthContext';

type Tab = 'overview' | 'accounts' | 'explorer' | 'ledger' | 'refunds' | 'withdrawals' | 'audit';

const TABS: { id: Tab; label: string; icon: any }[] = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'accounts', label: 'Platform Accounts', icon: Building2 },
  { id: 'explorer', label: 'Transaction Explorer', icon: Search },
  { id: 'ledger', label: 'Platform Ledger', icon: Scale },
  { id: 'refunds', label: 'Refund Center', icon: RotateCcw },
  { id: 'withdrawals', label: 'Withdrawal Center', icon: ArrowDownCircle },
  { id: 'audit', label: 'Audit Logs', icon: Shield },
];

// (RotateCcw imported above with other lucide icons)

export default function AdminFinancialCenterPage() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [summary, setSummary] = useState<PlatformFinancialSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    const data = await getPlatformFinancialSummary();
    setSummary(data);
    setLoading(false);
  }, []);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  if (loading && !summary) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
            <DollarSign className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Financial Center</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Platform accounting, ledger, and transaction management</p>
          </div>
        </div>
        <button
          onClick={loadSummary}
          className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 overflow-x-auto pb-1">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? 'bg-indigo-500 text-white'
                : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            <tab.icon className="w-4 h-4" /> {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && summary && <OverviewTab summary={summary} />}
      {activeTab === 'accounts' && <AccountsTab />}
      {activeTab === 'explorer' && <ExplorerTab />}
      {activeTab === 'ledger' && <LedgerTab />}
      {activeTab === 'refunds' && <RefundsTab />}
      {activeTab === 'withdrawals' && <WithdrawalsTab />}
      {activeTab === 'audit' && <AuditTab />}
    </div>
  );
}

// ============================================================
// Overview Tab
// ============================================================

function OverviewTab({ summary }: { summary: PlatformFinancialSummary }) {
  const walletTotal = summary.total_wallet_funds + summary.total_escrow + summary.total_pending_balance + summary.total_locked;
  const balanceCards = [
    { label: 'Total Wallet Funds', value: formatCurrency(summary.total_wallet_funds), icon: Wallet, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { label: 'Total Escrow Funds', value: formatCurrency(summary.total_escrow), icon: Shield, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Pending Balances', value: formatCurrency(summary.total_pending_balance), icon: Clock, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Locked Balances', value: formatCurrency(summary.total_locked), icon: Lock, color: 'text-gray-600', bg: 'bg-gray-100' },
  ];

  const earningsCards = [
    { label: 'Seller Earnings', value: formatCurrency(summary.total_seller_earnings), icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Creator Earnings', value: formatCurrency(summary.total_creator), icon: Activity, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Affiliate Balance', value: formatCurrency(summary.total_affiliate), icon: ArrowUpCircle, color: 'text-cyan-600', bg: 'bg-cyan-50' },
    { label: 'Referral Balance', value: formatCurrency(summary.total_referral), icon: ArrowDownCircle, color: 'text-orange-600', bg: 'bg-orange-50' },
    { label: 'Advertiser Budget', value: formatCurrency(summary.total_advertiser), icon: BarChart3, color: 'text-pink-600', bg: 'bg-pink-50' },
  ];

  const txCards = [
    { label: 'Total Transactions', value: summary.total_transactions, icon: FileText, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { label: 'Completed', value: summary.completed_transactions, icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Pending', value: summary.pending_transactions, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Failed', value: summary.failed_transactions, icon: XCircle, color: 'text-red-600', bg: 'bg-red-50' },
  ];

  const pendingCards = [
    { label: 'Pending Withdrawals', value: summary.pending_withdrawals, amount: formatCurrency(summary.pending_withdrawals_amount), icon: ArrowDownCircle, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Pending Refunds', value: summary.pending_refunds, amount: formatCurrency(summary.pending_refunds_amount), icon: RotateCcw, color: 'text-red-600', bg: 'bg-red-50' },
  ];

  return (
    <div className="space-y-6">
      {/* GMV banner */}
      <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm opacity-80">Total Platform Value</p>
            <p className="text-4xl font-bold">{formatCurrency(walletTotal)}</p>
            <p className="text-sm opacity-80 mt-1">Wallet + Escrow + Pending + Locked</p>
          </div>
          <BarChart3 className="w-16 h-16 opacity-30" />
        </div>
      </div>

      {/* Wallet balances */}
      <div>
        <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Wallet Balances</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {balanceCards.map(c => (
            <div key={c.label} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4">
              <div className={`w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center mb-2`}>
                <c.icon className={`w-5 h-5 ${c.color}`} />
              </div>
              <p className="text-lg font-bold text-gray-900 dark:text-white">{c.value}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{c.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Earnings breakdown */}
      <div>
        <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Earnings & Budgets</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {earningsCards.map(c => (
            <div key={c.label} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4">
              <div className={`w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center mb-2`}>
                <c.icon className={`w-5 h-5 ${c.color}`} />
              </div>
              <p className="text-lg font-bold text-gray-900 dark:text-white">{c.value}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{c.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Transaction stats */}
      <div>
        <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Transaction Statistics</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {txCards.map(c => (
            <div key={c.label} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4">
              <div className={`w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center mb-2`}>
                <c.icon className={`w-5 h-5 ${c.color}`} />
              </div>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{c.value}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{c.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Pending items */}
      <div>
        <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Pending Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {pendingCards.map(c => (
            <div key={c.label} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4 flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl ${c.bg} flex items-center justify-center flex-shrink-0`}>
                <c.icon className={`w-6 h-6 ${c.color}`} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{c.label}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{c.amount}</p>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{c.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Accounts Tab
// ============================================================

function AccountsTab() {
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const data = await getPlatformAccounts();
      setAccounts(data);
      setLoading(false);
    })();
  }, []);

  const accountIcons: Record<string, any> = {
    operating: Building2, escrow: Shield, settlement: Banknote,
    reserve: PiggyBank, refund: RotateCcw, marketing: BarChart3, tax: Receipt,
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>;

  return (
    <div>
      <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Platform Accounts</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {accounts.map(acc => {
          const Icon = accountIcons[acc.account_type] || Building2;
          return (
            <div key={acc.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                {acc.is_locked && (
                  <span className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
                    <Lock className="w-3 h-3" /> Locked
                  </span>
                )}
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(acc.balance, acc.currency)}</p>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mt-1">{acc.account_name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{acc.description}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// Transaction Explorer Tab
// ============================================================

function ExplorerTab() {
  const [transactions, setTransactions] = useState<DetailedTransaction[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TransactionStatus | ''>('');
  const [categoryFilter, setCategoryFilter] = useState<TransactionCategory | ''>('');

  const load = useCallback(async () => {
    setLoading(true);
    const { transactions: data, total: count } = await searchPlatformTransactions({
      search: search || null,
      status: statusFilter || null,
      category: categoryFilter || null,
      limit: 25,
      offset: page * 25,
    });
    setTransactions(data);
    setTotal(count);
    setLoading(false);
  }, [search, statusFilter, categoryFilter, page]);

  useEffect(() => {
    const debounce = setTimeout(() => load(), 300);
    return () => clearTimeout(debounce);
  }, [load]);

  const totalPages = Math.ceil(total / 25);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900 dark:text-white">Transaction Explorer</h3>
        <button
          onClick={() => {
            const csv = exportTransactionsToCSV(transactions);
            downloadCSVFile(`platform-transactions-${Date.now()}.csv`, csv);
          }}
          className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {/* Search + filters */}
      <div className="flex flex-col md:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by ID, reference, receipt, description..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as any); setPage(0); }}
          className="px-3 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl text-sm text-gray-900 dark:text-white"
        >
          <option value="">All Statuses</option>
          {TRANSACTION_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => { setCategoryFilter(e.target.value as any); setPage(0); }}
          className="px-3 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl text-sm text-gray-900 dark:text-white"
        >
          <option value="">All Categories</option>
          {TRANSACTION_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>
      ) : transactions.length === 0 ? (
        <div className="text-center py-10">
          <Search className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500 dark:text-gray-400">No transactions found</p>
        </div>
      ) : (
        <>
          {/* Transaction table */}
          <div className="overflow-x-auto bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 text-left">
                  <th className="p-3 font-medium text-gray-500 dark:text-gray-400">Date</th>
                  <th className="p-3 font-medium text-gray-500 dark:text-gray-400">User</th>
                  <th className="p-3 font-medium text-gray-500 dark:text-gray-400">Type</th>
                  <th className="p-3 font-medium text-gray-500 dark:text-gray-400">Amount</th>
                  <th className="p-3 font-medium text-gray-500 dark:text-gray-400">Status</th>
                  <th className="p-3 font-medium text-gray-500 dark:text-gray-400">Category</th>
                  <th className="p-3 font-medium text-gray-500 dark:text-gray-400">Reference</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map(tx => (
                  <tr key={tx.id} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                    <td className="p-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                      {new Date(tx.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                    </td>
                    <td className="p-3 text-gray-900 dark:text-white truncate max-w-[120px]">
                      {tx.username || tx.email || tx.user_id.substring(0, 8)}
                    </td>
                    <td className="p-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                        tx.type === 'credit' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                      }`}>{tx.type}</span>
                    </td>
                    <td className="p-3 font-medium text-gray-900 dark:text-white whitespace-nowrap">
                      {formatCurrency(tx.amount, tx.currency)}
                    </td>
                    <td className="p-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                        getStatusColor(tx.status) === 'green' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                        getStatusColor(tx.status) === 'red' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                        getStatusColor(tx.status) === 'amber' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                        'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                      }`}>{tx.status}</span>
                    </td>
                    <td className="p-3 text-gray-600 dark:text-gray-400 capitalize">{tx.category || '—'}</td>
                    <td className="p-3 text-gray-500 dark:text-gray-500 text-xs">{tx.reference || tx.receipt_number || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-gray-500">Page {page + 1} of {totalPages}</p>
              <div className="flex gap-2">
                <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}
                  className="p-2 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}
                  className="p-2 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ============================================================
// Platform Ledger Tab
// ============================================================

function LedgerTab() {
  const [entries, setEntries] = useState<PlatformLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page] = useState(0);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const data = await getPlatformLedgerEntries(25, page * 25);
      setEntries(data);
      setLoading(false);
    })();
  }, [page]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white">Platform Ledger</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">Immutable double-entry accounting records</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
          <Lock className="w-3 h-3" /> Entries cannot be deleted
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>
      ) : entries.length === 0 ? (
        <div className="text-center py-10">
          <Scale className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500 dark:text-gray-400">No ledger entries yet</p>
        </div>
      ) : (
        <div className="overflow-x-auto bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 text-left">
                <th className="p-3 font-medium text-gray-500 dark:text-gray-400">Entry ID</th>
                <th className="p-3 font-medium text-gray-500 dark:text-gray-400">Date</th>
                <th className="p-3 font-medium text-gray-500 dark:text-gray-400">Debit Account</th>
                <th className="p-3 font-medium text-gray-500 dark:text-gray-400">Credit Account</th>
                <th className="p-3 font-medium text-gray-500 dark:text-gray-400">Amount</th>
                <th className="p-3 font-medium text-gray-500 dark:text-gray-400">Description</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(entry => (
                <tr key={entry.id} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                  <td className="p-3 text-xs font-mono text-gray-500 dark:text-gray-400">{entry.entry_id}</td>
                  <td className="p-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                    {new Date(entry.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                  </td>
                  <td className="p-3">
                    <span className="text-xs font-medium px-2 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                      {entry.debit_account}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className="text-xs font-medium px-2 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                      {entry.credit_account}
                    </span>
                  </td>
                  <td className="p-3 font-medium text-gray-900 dark:text-white whitespace-nowrap">
                    {formatCurrency(entry.amount, entry.currency)}
                  </td>
                  <td className="p-3 text-gray-600 dark:text-gray-400 truncate max-w-[200px]">{entry.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Refunds Tab
// ============================================================

function RefundsTab() {
  const { user } = useAuth();
  const [refunds, setRefunds] = useState<RefundRecord[]>([]);
  const [, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<RefundStatus | ''>('');
  const [page, setPage] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const { records, total: count } = await getRefundRecords(statusFilter || null, 25, page * 25);
    setRefunds(records);
    setTotal(count);
    setLoading(false);
  }, [statusFilter, page]);

  useEffect(() => { load(); }, [load]);

  const handleAction = async (refundId: string, action: RefundStatus) => {
    if (!user) return;
    await updateRefundStatus(refundId, action, user.id, user.email || 'Admin');
    load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900 dark:text-white">Refund Center</h3>
        <button
          onClick={() => {
            const csv = exportRefundsToCSV(refunds);
            downloadCSVFile(`refunds-${Date.now()}.csv`, csv);
          }}
          className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50"
        >
          <Download className="w-4 h-4" /> Export
        </button>
      </div>

      <div className="flex gap-2 mb-4">
        {(['pending', 'approved', 'processing', 'completed', 'rejected'] as RefundStatus[]).map(s => (
          <button
            key={s}
            onClick={() => { setStatusFilter(statusFilter === s ? '' : s); setPage(0); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
              statusFilter === s ? 'bg-indigo-500 text-white' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-800'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>
      ) : refunds.length === 0 ? (
        <div className="text-center py-10">
          <RotateCcw className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500 dark:text-gray-400">No refund records</p>
        </div>
      ) : (
        <div className="space-y-2">
          {refunds.map(r => (
            <div key={r.id} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                    <RotateCcw className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{r.refund_number}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{r.reason}</p>
                  </div>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded capitalize ${
                  r.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                  r.status === 'rejected' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                  r.status === 'approved' || r.status === 'processing' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                  'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                }`}>{r.status}</span>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">{formatCurrency(r.amount, r.currency)}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {new Date(r.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                {r.status === 'pending' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAction(r.id, 'approved')}
                      className="px-3 py-1.5 bg-green-500 text-white rounded-lg text-xs font-medium hover:bg-green-600"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleAction(r.id, 'rejected')}
                      className="px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-medium hover:bg-red-600"
                    >
                      Reject
                    </button>
                  </div>
                )}
                {r.status === 'approved' && (
                  <button
                    onClick={() => handleAction(r.id, 'processing')}
                    className="px-3 py-1.5 bg-blue-500 text-white rounded-lg text-xs font-medium hover:bg-blue-600"
                  >
                    Start Processing
                  </button>
                )}
                {r.status === 'processing' && (
                  <button
                    onClick={() => handleAction(r.id, 'completed')}
                    className="px-3 py-1.5 bg-green-500 text-white rounded-lg text-xs font-medium hover:bg-green-600"
                  >
                    Mark Completed
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Withdrawals Tab
// ============================================================

function WithdrawalsTab() {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const { records: data } = await getWithdrawalQueue(statusFilter || null, 25, page * 25);
    setRecords(data);
    setLoading(false);
  }, [statusFilter, page]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Withdrawal Center</h3>

      <div className="flex gap-2 mb-4">
        {['pending', 'approved', 'processing', 'paid', 'failed', 'cancelled'].map(s => (
          <button
            key={s}
            onClick={() => { setStatusFilter(statusFilter === s ? '' : s); setPage(0); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
              statusFilter === s ? 'bg-indigo-500 text-white' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-800'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>
      ) : records.length === 0 ? (
        <div className="text-center py-10">
          <ArrowDownCircle className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500 dark:text-gray-400">No withdrawal records</p>
        </div>
      ) : (
        <div className="space-y-2">
          {records.map((r, i) => (
            <div key={r.id || i} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                <ArrowDownCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {formatCurrency(r.amount || 0)} withdrawal
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {new Date(r.created_at).toLocaleDateString()} · Queue position #{i + 1}
                </p>
              </div>
              <span className={`text-xs font-medium px-2 py-0.5 rounded capitalize ${
                r.status === 'paid' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                r.status === 'failed' || r.status === 'cancelled' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
              }`}>{r.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Audit Logs Tab
// ============================================================

function AuditTab() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page] = useState(0);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { supabase } = await import('../../lib/supabase');
      const { data, error } = await supabase
        .from('financial_audit_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * 25, page * 25 + 24);
      if (!error) {
        setLogs(data || []);
      }
      setLoading(false);
    })();
  }, [page]);

  return (
    <div>
      <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Financial Audit Logs</h3>
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>
      ) : logs.length === 0 ? (
        <div className="text-center py-10">
          <Shield className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500 dark:text-gray-400">No audit logs yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map(log => (
            <div key={log.id} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-900 dark:text-white">{log.action}</span>
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {new Date(log.created_at).toLocaleString()}
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {log.actor_name || log.actor_id?.substring(0, 8)} · {log.entity_type}
                {log.description && ` · ${log.description}`}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
