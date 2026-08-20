import { useState } from 'react';
import {
  Wallet, Sparkles, Gift, Ticket, TrendingUp, Clock, CheckCircle2,
  Loader2, Tag, DollarSign, History,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  useWallet, useRewardTransactions, useUserRedemptions, usePublishedCoupons,
  useCouponRedemption,
} from '../lib/rewardHooks';
import { formatCurrency } from '../lib/currency';

export default function RewardWalletPage() {
  const { user } = useAuth();
    const { wallet, loading } = useWallet(user?.id);
  const { transactions } = useRewardTransactions(user?.id);
  const { redemptions } = useUserRedemptions(user?.id);
  const { coupons: publishedCoupons } = usePublishedCoupons();
  const { redeem, redeeming } = useCouponRedemption();
  const [couponCode, setCouponCode] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);


  const handleRedeem = async () => {
    if (!user || !couponCode) return;
    setMessage(null);
    const result = await redeem(couponCode, user.id, 0);
    if (result.success) {
      setMessage({ type: 'success', text: result.message });
      setCouponCode('');
    } else {
      setMessage({ type: 'error', text: result.message });
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 text-primary-500 animate-spin" /></div>;
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
          <Wallet className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Reward Wallet</h1>
          <p className="text-sm text-gray-500">Your coupons, credits, and rewards</p>
        </div>
      </div>

      {/* Wallet Balance Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-1"><Sparkles className="w-4 h-4 text-primary-500" /><span className="text-xs text-gray-400">Promo Credits</span></div>
          <p className="text-2xl font-bold text-gray-900">{wallet?.promotion_credits?.toLocaleString() || 0}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-1"><Gift className="w-4 h-4 text-purple-500" /><span className="text-xs text-gray-400">Promo Tokens</span></div>
          <p className="text-2xl font-bold text-gray-900">{wallet?.promotion_tokens || 0}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-1"><Ticket className="w-4 h-4 text-green-500" /><span className="text-xs text-gray-400">Vouchers</span></div>
          <p className="text-2xl font-bold text-gray-900">{wallet?.voucher_count || 0}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-1"><DollarSign className="w-4 h-4 text-amber-500" /><span className="text-xs text-gray-400">Total Saved</span></div>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(wallet?.total_saved || 0)}</p>
        </div>
      </div>

      {/* Redeem Coupon Code */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-6">
        <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2"><Tag className="w-4 h-4 text-primary-500" /> Redeem a Coupon Code</h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={couponCode}
            onChange={e => setCouponCode(e.target.value.toUpperCase())}
            placeholder="Enter coupon code"
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-mono focus:outline-none focus:border-primary-500"
          />
          <button onClick={handleRedeem} disabled={redeeming || !couponCode} className="px-6 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-semibold hover:bg-primary-700 disabled:opacity-50 transition-colors">
            {redeeming ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Redeem'}
          </button>
        </div>
        {message && (
          <p className={`mt-2 text-sm ${message.type === 'success' ? 'text-green-500' : 'text-red-500'}`}>{message.text}</p>
        )}
      </div>

      {/* Available Coupons */}
      {publishedCoupons.length > 0 && (
        <div className="mb-6">
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2"><Ticket className="w-4 h-4 text-green-500" /> Available Coupons</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {publishedCoupons.map(c => (
              <div key={c.id} className="bg-gradient-to-br from-primary-50 to-blue-50 rounded-2xl border border-primary-100 p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono font-bold text-primary-700">{c.code}</span>
                  <span className="text-sm font-bold text-primary-600">
                    {c.reward_type === 'percentage_discount' ? `${c.value}% OFF` : formatCurrency(c.value)}
                  </span>
                </div>
                <p className="text-sm text-gray-600">{c.name}</p>
                {c.end_date && <p className="text-xs text-gray-400 mt-1">Expires {new Date(c.end_date).toLocaleDateString()}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs: History / Used */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2"><History className="w-4 h-4 text-gray-400" /> Reward History</h3>
          <div className="space-y-2">
            {transactions.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No transactions yet</p>
            ) : (
              transactions.slice(0, 10).map(t => (
                <div key={t.id} className="bg-white rounded-xl border border-gray-100 p-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                    {t.transaction_type.includes('added') ? <TrendingUp className="w-4 h-4 text-green-500" /> : <Clock className="w-4 h-4 text-gray-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{t.description || t.transaction_type.replace(/_/g, ' ')}</p>
                    <p className="text-xs text-gray-400">{new Date(t.created_at).toLocaleDateString()}</p>
                  </div>
                  <span className="text-sm font-bold text-gray-700">{t.amount > 0 ? '+' : ''}{t.amount}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-500" /> Used Coupons</h3>
          <div className="space-y-2">
            {redemptions.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No redemptions yet</p>
            ) : (
              redemptions.slice(0, 10).map(r => (
                <div key={r.id} className="bg-white rounded-xl border border-gray-100 p-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">Saved {formatCurrency(r.discount_amount)}</p>
                    <p className="text-xs text-gray-400">{new Date(r.redeemed_at).toLocaleDateString()}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
