import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Search, Filter, Download, ChevronLeft, ChevronRight, X,
  ArrowDownLeft, ArrowUpRight, Clock, CheckCircle2, XCircle,
  AlertCircle, RotateCcw, Shield, RefreshCw, FileText, Loader2,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  getTransactionHistory, exportTransactionsToCSV, downloadCSVFile,
  TRANSACTION_CATEGORIES, TRANSACTION_STATUSES, DATE_RANGES, getDateRange,
  getStatusColor, formatCurrency,
  type DetailedTransaction, type TransactionStatus, type TransactionCategory,
} from '../lib/financialCenter';

const PAGE_SIZE = 20;

export default function TransactionHistoryPage() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<DetailedTransaction[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [showFilters, setShowFilters] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TransactionStatus | ''>('');
  const [categoryFilter, setCategoryFilter] = useState<TransactionCategory | ''>('');
  const [dateRange, setDateRange] = useState('30days');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  // Detail modal
  const [selectedTx, setSelectedTx] = useState<DetailedTransaction | null>(null);

  const loadTransactions = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const range = getDateRange(dateRange);
    if (dateRange === 'custom') {
      range.from = customFrom ? new Date(customFrom).toISOString() : null;
      range.to = customTo ? new Date(customTo + 'T23:59:59').toISOString() : null;
    }
    const { transactions: data, total: count } = await getTransactionHistory(user.id, {
      status: statusFilter || null,
      category: categoryFilter || null,
      dateFrom: range.from,
      dateTo: range.to,
      search: search || null,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    });
    setTransactions(data);
    setTotal(count);
    setLoading(false);
  }, [user, statusFilter, categoryFilter, dateRange, customFrom, customTo, search, page]);

  useEffect(() => {
    const debounce = setTimeout(() => loadTransactions(), 300);
    return () => clearTimeout(debounce);
  }, [loadTransactions]);

  const handleExport = () => {
    const csv = exportTransactionsToCSV(transactions);
    downloadCSVFile(`dright-transactions-${new Date().toISOString().split('T')[0]}.csv`, csv);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const hasFilters = search || statusFilter || categoryFilter || dateRange !== '30days';

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('');
    setCategoryFilter('');
    setDateRange('30days');
    setCustomFrom('');
    setCustomTo('');
    setPage(0);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-5xl mx-auto p-4 md:p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link to="/wallet" className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Transaction History</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {total} transaction{total !== 1 ? 's' : ''} found
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <Filter className="w-4 h-4" /> Filters
            </button>
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <Download className="w-4 h-4" /> Export
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by transaction ID, reference, receipt number, or description..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="w-full pl-10 pr-4 py-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filter panel */}
        {showFilters && (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 mb-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Filters</h3>
              {hasFilters && (
                <button onClick={clearFilters} className="text-xs text-indigo-500 hover:text-indigo-600 font-medium">
                  Clear all
                </button>
              )}
            </div>

            {/* Date range */}
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">Date Range</label>
              <div className="flex flex-wrap gap-2">
                {DATE_RANGES.map(r => (
                  <button
                    key={r.value}
                    onClick={() => { setDateRange(r.value); setPage(0); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      dateRange === r.value
                        ? 'bg-indigo-500 text-white'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              {dateRange === 'custom' && (
                <div className="flex gap-2 mt-2">
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => { setCustomFrom(e.target.value); setPage(0); }}
                    className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white"
                  />
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e) => { setCustomTo(e.target.value); setPage(0); }}
                    className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white"
                  />
                </div>
              )}
            </div>

            {/* Status filter */}
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">Status</label>
              <div className="flex flex-wrap gap-2">
                {TRANSACTION_STATUSES.map(s => (
                  <button
                    key={s.value}
                    onClick={() => { setStatusFilter(statusFilter === s.value ? '' : s.value); setPage(0); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      statusFilter === s.value
                        ? 'bg-indigo-500 text-white'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Category filter */}
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">Category</label>
              <div className="flex flex-wrap gap-2">
                {TRANSACTION_CATEGORIES.map(c => (
                  <button
                    key={c.value}
                    onClick={() => { setCategoryFilter(categoryFilter === c.value ? '' : c.value); setPage(0); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      categoryFilter === c.value
                        ? 'bg-indigo-500 text-white'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Transactions list */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">No transactions found</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {hasFilters ? 'Try adjusting your filters or search terms.' : 'Your transaction history will appear here.'}
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {transactions.map(tx => (
                <TransactionRow key={tx.id} tx={tx} onClick={() => setSelectedTx(tx)} />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-6">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Page {page + 1} of {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(Math.max(0, page - 1))}
                    disabled={page === 0}
                    className="p-2 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                  </button>
                  <button
                    onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                    disabled={page >= totalPages - 1}
                    className="p-2 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Transaction detail modal */}
      {selectedTx && (
        <TransactionDetailModal tx={selectedTx} onClose={() => setSelectedTx(null)} />
      )}
    </div>
  );
}

function TransactionRow({ tx, onClick }: { tx: DetailedTransaction; onClick: () => void }) {
  const isCredit = tx.type === 'credit';
  const statusColor = getStatusColor(tx.status);
  const statusColors: Record<string, string> = {
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    green: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    red: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    gray: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    purple: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    orange: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    pink: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  };

  const StatusIcon: Record<string, any> = {
    pending: Clock, processing: RefreshCw, completed: CheckCircle2,
    failed: XCircle, cancelled: XCircle, refunded: RotateCcw,
    reversed: RotateCcw, disputed: AlertCircle,
  };
  const StatusIconComp = StatusIcon[tx.status] || Clock;

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl hover:border-indigo-200 dark:hover:border-indigo-800 hover:shadow-sm transition-all text-left"
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
        isCredit ? 'bg-green-100 dark:bg-green-900/30' : 'bg-gray-100 dark:bg-gray-800'
      }`}>
        {isCredit ? (
          <ArrowDownLeft className="w-5 h-5 text-green-600 dark:text-green-400" />
        ) : (
          <ArrowUpRight className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
          {tx.description || tx.type}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${statusColors[statusColor]}`}>
            <StatusIconComp className="w-3 h-3 inline mr-1" />
            {tx.status}
          </span>
          {tx.category && (
            <span className="text-xs text-gray-400 dark:text-gray-500 capitalize">{tx.category}</span>
          )}
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {new Date(tx.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <p className={`text-sm font-bold ${isCredit ? 'text-green-600 dark:text-green-400' : 'text-gray-900 dark:text-white'}`}>
          {isCredit ? '+' : '-'}{formatCurrency(tx.amount, tx.currency)}
        </p>
        {tx.balance_after != null && (
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Balance: {formatCurrency(tx.balance_after, tx.currency)}
          </p>
        )}
      </div>
    </button>
  );
}

function TransactionDetailModal({ tx, onClose }: { tx: DetailedTransaction; onClose: () => void }) {
  const isCredit = tx.type === 'credit';
  const statusColor = getStatusColor(tx.status);

  const detailRows = useMemo(() => [
    { label: 'Transaction ID', value: tx.id },
    { label: 'Reference', value: tx.reference || '—' },
    { label: 'Receipt Number', value: tx.receipt_number || '—' },
    { label: 'Date & Time', value: new Date(tx.created_at).toLocaleString() },
    { label: 'Type', value: tx.type.toUpperCase() },
    { label: 'Amount', value: formatCurrency(tx.amount, tx.currency) },
    { label: 'Currency', value: tx.currency },
    { label: 'Exchange Rate', value: tx.exchange_rate?.toString() || '1.0' },
    { label: 'Gateway', value: tx.gateway || '—' },
    { label: 'Balance Before', value: tx.balance_before != null ? formatCurrency(tx.balance_before, tx.currency) : '—' },
    { label: 'Balance After', value: tx.balance_after != null ? formatCurrency(tx.balance_after, tx.currency) : '—' },
    { label: 'Status', value: tx.status },
    { label: 'Category', value: tx.category || '—' },
    { label: 'Description', value: tx.description || '—' },
    { label: 'Notes', value: tx.notes || '—' },
    { label: 'Payment Provider', value: tx.payment_provider || '—' },
    { label: 'Device', value: tx.device_info || '—' },
    { label: 'IP Address', value: tx.ip_address || '—' },
    { label: 'Country', value: tx.country || '—' },
    { label: 'Browser', value: tx.browser || '—' },
  ].filter(r => r.value && r.value !== '—'), [tx]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              isCredit ? 'bg-green-100 dark:bg-green-900/30' : 'bg-gray-100 dark:bg-gray-800'
            }`}>
              {isCredit ? (
                <ArrowDownLeft className="w-5 h-5 text-green-600 dark:text-green-400" />
              ) : (
                <ArrowUpRight className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              )}
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white">Transaction Details</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">{tx.receipt_number || tx.id}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Amount */}
        <div className="p-5 border-b border-gray-200 dark:border-gray-800 text-center">
          <p className={`text-3xl font-bold ${isCredit ? 'text-green-600 dark:text-green-400' : 'text-gray-900 dark:text-white'}`}>
            {isCredit ? '+' : '-'}{formatCurrency(tx.amount, tx.currency)}
          </p>
          <span className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-medium ${
            statusColor === 'green' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
            statusColor === 'red' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
            statusColor === 'amber' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
            'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
          }`}>
            {tx.status}
          </span>
        </div>

        {/* Details */}
        <div className="p-5 space-y-2">
          {detailRows.map((row, i) => (
            <div key={i} className="flex items-center justify-between py-1.5">
              <span className="text-sm text-gray-500 dark:text-gray-400">{row.label}</span>
              <span className="text-sm font-medium text-gray-900 dark:text-white text-right max-w-[60%] truncate">
                {row.value}
              </span>
            </div>
          ))}
        </div>

        {/* Related entities */}
        {(tx.related_order_id || tx.related_escrow_id || tx.related_subscription_id || tx.related_withdrawal_id) && (
          <div className="p-5 border-t border-gray-200 dark:border-gray-800">
            <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Related</h4>
            <div className="space-y-1.5">
              {tx.related_order_id && (
                <div className="flex items-center gap-2 text-sm">
                  <Shield className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-500 dark:text-gray-400">Order:</span>
                  <span className="font-medium text-gray-900 dark:text-white">{tx.related_order_id}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="p-5 border-t border-gray-200 dark:border-gray-800 flex gap-2">
          <button
            onClick={() => {
              const csv = exportTransactionsToCSV([tx]);
              downloadCSVFile(`transaction-${tx.id}.csv`, csv);
            }}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-100 dark:bg-gray-800 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            <Download className="w-4 h-4" /> Download CSV
          </button>
          <button
            onClick={() => window.print()}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-500 rounded-xl text-sm font-medium text-white hover:bg-indigo-600 transition-colors"
          >
            <FileText className="w-4 h-4" /> Print Receipt
          </button>
        </div>
      </div>
    </div>
  );
}
