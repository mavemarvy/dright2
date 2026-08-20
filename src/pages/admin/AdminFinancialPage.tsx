import {
  DollarSign, TrendingUp, Wallet, Loader2, Download,
  ArrowDownCircle, ArrowUpCircle, Gift, CreditCard, Shield, AlertTriangle,
  Repeat, Banknote, BarChart3,
} from 'lucide-react';
import { useFinancialSummary } from '../../lib/adminIntelligenceHooks';
import { useAdminFinancialDashboard } from '../../lib/paystackService';
import { formatCurrency } from '../../lib/currency';

export default function AdminFinancialPage() {
  const { summary, loading } = useFinancialSummary();
  const { dashboard } = useAdminFinancialDashboard();

  if (loading || !summary) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-primary-500 animate-spin" /></div>;
  }

  const formatNaira = (v: number) => formatCurrency(v || 0, 'NGN');

  const revenueCards = [
    { label: 'Marketplace Revenue', value: formatCurrency(summary.marketplace_revenue), icon: DollarSign, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Promotion Revenue', value: formatCurrency(summary.promotion_revenue), icon: TrendingUp, color: 'text-primary-500', bg: 'bg-primary-50' },
    { label: 'Referral Payouts', value: formatCurrency(summary.referral_payouts), icon: ArrowUpCircle, color: 'text-orange-500', bg: 'bg-orange-50' },
    { label: 'Seller Payouts', value: formatCurrency(summary.seller_payouts), icon: Wallet, color: 'text-blue-500', bg: 'bg-blue-50' },
  ];

  const transactionCards = [
    { label: 'Pending Withdrawals', value: summary.pending_withdrawals, icon: ArrowDownCircle, color: 'text-amber-500', bg: 'bg-amber-50' },
    { label: 'Completed Withdrawals', value: summary.completed_withdrawals, icon: ArrowUpCircle, color: 'text-green-500', bg: 'bg-green-50' },
    { label: 'Total Refunds', value: summary.total_refunds, icon: ArrowDownCircle, color: 'text-red-500', bg: 'bg-red-50' },
    { label: 'Coupon Discounts', value: summary.total_coupons_discount, icon: Gift, color: 'text-purple-500', bg: 'bg-purple-50' },
  ];

  const netRevenue = summary.marketplace_revenue + summary.promotion_revenue - summary.referral_payouts - summary.seller_payouts;

  const paystackCards = dashboard ? [
    { label: 'Total Revenue (Paystack)', value: formatNaira(dashboard.total_revenue), icon: CreditCard, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Monthly Revenue', value: formatNaira(dashboard.monthly_revenue), icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Daily Revenue', value: formatNaira(dashboard.daily_revenue), icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'GMV', value: formatNaira(dashboard.total_gmv), icon: BarChart3, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Escrow Held', value: formatNaira(dashboard.total_escrow_held), icon: Shield, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Escrow Released', value: formatNaira(dashboard.total_escrow_released), icon: ArrowUpCircle, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Subscriptions Revenue', value: formatNaira(dashboard.subscription_revenue), icon: Repeat, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { label: 'Platform Fees', value: formatNaira(dashboard.platform_fee_revenue), icon: Banknote, color: 'text-cyan-600', bg: 'bg-cyan-50' },
  ] : [];

  const paystackTxCards = dashboard ? [
    { label: 'Successful', value: dashboard.successful_transactions, icon: ArrowUpCircle, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Failed', value: dashboard.failed_transactions, icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-50' },
    { label: 'Abandoned', value: dashboard.abandoned_transactions, icon: ArrowDownCircle, color: 'text-gray-500', bg: 'bg-gray-50' },
    { label: 'Pending', value: dashboard.pending_transactions, icon: Loader2, color: 'text-amber-500', bg: 'bg-amber-50' },
    { label: 'Active Subscriptions', value: dashboard.active_subscriptions, icon: Repeat, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Past Due', value: dashboard.past_due_subscriptions, icon: AlertTriangle, color: 'text-orange-500', bg: 'bg-orange-50' },
    { label: 'Pending Withdrawals', value: dashboard.pending_withdrawals, icon: Banknote, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Failed Withdrawals', value: dashboard.failed_withdrawals, icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-50' },
  ] : [];

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
            <DollarSign className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Financial Dashboard</h1>
            <p className="text-sm text-gray-500">Revenue, payouts, Paystack, and transaction overview</p>
          </div>
        </div>
        <button className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {/* Net Revenue Banner */}
      <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl p-6 mb-6 text-white">
        <p className="text-sm opacity-80">Net Revenue</p>
        <p className="text-4xl font-bold">{formatCurrency(netRevenue)}</p>
        <p className="text-sm opacity-80 mt-1">After payouts and commissions</p>
      </div>

      {/* Paystack Revenue */}
      {dashboard && (
        <>
          <div className="flex items-center gap-2 mb-3">
            <CreditCard className="w-5 h-5 text-green-600" />
            <h3 className="font-semibold text-gray-900">Paystack Revenue (NGN)</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {paystackCards.map(c => (
              <div key={c.label} className="bg-white rounded-2xl border border-gray-100 p-4">
                <div className={`w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center mb-2`}>
                  <c.icon className={`w-5 h-5 ${c.color}`} />
                </div>
                <p className="text-lg font-bold text-gray-900">{c.value}</p>
                <p className="text-sm text-gray-500">{c.label}</p>
              </div>
            ))}
          </div>

          {/* Paystack Transaction Stats */}
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-gray-900">Transaction Statistics</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {paystackTxCards.map(c => (
              <div key={c.label} className="bg-white rounded-2xl border border-gray-100 p-4">
                <div className={`w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center mb-2`}>
                  <c.icon className={`w-5 h-5 ${c.color}`} />
                </div>
                <p className="text-xl font-bold text-gray-900">{c.value}</p>
                <p className="text-sm text-gray-500">{c.label}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Revenue Cards */}
      <h3 className="font-semibold text-gray-900 mb-3">Revenue Breakdown (USD)</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {revenueCards.map(c => (
          <div key={c.label} className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className={`w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center mb-2`}>
              <c.icon className={`w-5 h-5 ${c.color}`} />
            </div>
            <p className="text-xl font-bold text-gray-900">{c.value}</p>
            <p className="text-sm text-gray-500">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Transaction Cards */}
      <h3 className="font-semibold text-gray-900 mb-3">Transactions</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {transactionCards.map(c => (
          <div key={c.label} className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className={`w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center mb-2`}>
              <c.icon className={`w-5 h-5 ${c.color}`} />
            </div>
            <p className="text-xl font-bold text-gray-900">{c.value}</p>
            <p className="text-sm text-gray-500">{c.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
