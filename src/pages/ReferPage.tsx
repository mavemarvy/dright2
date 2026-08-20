import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { ReferralProgramAnalytics } from '../components/analytics/EntityPerformance';
import { ReferralIntelligenceDashboard } from '../components/analytics/AdvancedAnalytics';
import {
  Users,
  Copy,
  Check,
  Share2,
  MessageCircle,
  Send,
  TrendingUp,
  Award,
  Clock,
  Store,
  Wallet,
  ChevronRight,
  Loader2,
  AlertCircle,
  Crown,
  Ban,
  Gift,
} from 'lucide-react';
import {
  BUYER_WINDOW_DAYS,
  VENDOR_WINDOW_DAYS,
  MIN_WITHDRAWAL_USD,
  EMPTY_STATS,
  buildReferralLink,
  fetchReferralStats,
  refreshStats,
  expireRewards,
  fetchReferralRewards,
  fetchReferralTree,
  fetchWithdrawals,
  requestWithdrawal,
  type ReferralStats,
  type ReferralReward,
  type ReferralRelationship,
  type RewardStatus,
} from '../lib/referral';
import { formatCurrency } from '../lib/currency';

const LeaderboardSection = lazy(() => import('../components/ReferralLeaderboard'));

type WithdrawalMethod = 'paystack' | 'bank' | 'crypto';

const STATUS_STYLES: Record<RewardStatus, string> = {
  pending: 'bg-warning-muted text-warning',
  confirmed: 'bg-primary-100 text-primary-700',
  expired: 'bg-error-muted text-error',
  paid: 'bg-success-muted text-success',
};

const ACTION_LABELS: Record<string, string> = {
  first_purchase: 'First Purchase',
  first_sale: 'First Sale',
};

export default function ReferPage() {
  const { user, profile } = useAuth();
  
  const [stats, setStats] = useState<ReferralStats>(EMPTY_STATS);
  const [rewards, setRewards] = useState<ReferralReward[]>([]);
  const [rewardsTotal, setRewardsTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [tree, setTree] = useState<ReferralRelationship[]>([]);
  const [withdrawals, setWithdrawals] = useState<Array<{ id: string; amount: number; method: string; status: string; created_at: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawMethod, setWithdrawMethod] = useState<WithdrawalMethod>('paystack');
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawSuccess, setWithdrawSuccess] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  const referralLink = useMemo(() => buildReferralLink(profile?.referral_code), [profile?.referral_code]);
  const pageSize = 8;
  const totalPages = Math.max(1, Math.ceil(rewardsTotal / pageSize));

  const loadAll = useCallback(async () => {
    if (!user) return;
    await expireRewards();
    await refreshStats(user.id);
    const [s, { rewards: rw, total }, t, w] = await Promise.all([
      fetchReferralStats(user.id),
      fetchReferralRewards(user.id, page, pageSize),
      fetchReferralTree(user.id),
      fetchWithdrawals(user.id),
    ]);
    setStats(s);
    setRewards(rw);
    setRewardsTotal(total);
    setTree(t);
    setWithdrawals(w);
  }, [user, page]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await loadAll();
      } finally {
        setLoading(false);
      }
    })();
  }, [loadAll]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleShare = async () => {
    const shareData = {
      title: 'Join DRIGHT',
      text: 'Invite partners & earn one-time rewards on DRIGHT',
      url: referralLink,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // user cancelled
      }
    } else {
      handleCopy();
    }
  };

  const shareUrls = useMemo(() => {
    const text = encodeURIComponent('Join me on DRIGHT and earn rewards!');
    const url = encodeURIComponent(referralLink);
    return {
      whatsapp: `https://wa.me/?text=${text}%20${url}`,
      telegram: `https://t.me/share/url?url=${url}&text=${text}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
      x: `https://twitter.com/intent/tweet?text=${text}&url=${url}`,
    };
  }, [referralLink]);

  const handleWithdraw = async () => {
    if (!user) return;
    setWithdrawError(null);
    setWithdrawSuccess(false);
    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      setWithdrawError('Enter a valid amount');
      return;
    }
    setWithdrawing(true);
    const { error } = await requestWithdrawal(user.id, amount, withdrawMethod);
    setWithdrawing(false);
    if (error) {
      setWithdrawError(error);
    } else {
      setWithdrawSuccess(true);
      setWithdrawAmount('');
      await loadAll();
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const conversionRate = stats.total_referrals > 0
    ? Math.round((stats.active_referrals / stats.total_referrals) * 100)
    : 0;
  const monthlyTarget = 1000;
  const monthlyProgress = Math.min(100, Math.round((Number(stats.total_earned) / monthlyTarget) * 100));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      {/* 1. Hero Banner */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl p-6 md:p-10 mb-6 text-white shadow-xl"
        style={{ background: 'linear-gradient(135deg, #2563EB 0%, #1d4ed8 45%, #F97316 100%)' }}
      >
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="px-3 py-1 text-xs font-bold uppercase tracking-wider bg-white/20 rounded-full backdrop-blur-sm">
                Limited Bonus
              </span>
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">Referral Program</h1>
            <p className="mt-2 text-white/90 text-base md:text-lg">Invite partners &amp; earn one-time rewards</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 md:w-16 md:h-16 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm">
              <Users className="w-7 h-7 md:w-8 md:h-8" />
            </div>
          </div>
        </div>
        <div className="absolute -right-12 -top-12 w-48 h-48 bg-white/10 rounded-full" />
        <div className="absolute -right-24 -bottom-24 w-64 h-64 bg-white/5 rounded-full" />
      </motion.div>

      {/* Desktop 12-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left column: control center + analytics */}
        <div className="lg:col-span-8 space-y-6">
          {/* 2. Referral Link Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-2xl p-5 md:p-6 shadow-sm border border-gray-100"
          >
            <h2 className="text-lg font-bold text-gray-900 mb-1">Your Referral Link</h2>
            <p className="text-sm text-gray-500 mb-4">Share this link. When someone signs up, they join your network.</p>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 flex items-center gap-2 bg-surface-muted rounded-xl px-4 py-3 border border-gray-200 min-w-0">
                <span className="font-mono text-sm text-gray-700 truncate">{referralLink}</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-2 px-4 py-3 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 transition-colors"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
                </button>
                <button
                  onClick={handleShare}
                  className="flex items-center gap-2 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
                >
                  <Share2 className="w-4 h-4" />
                  <span className="hidden sm:inline">Share</span>
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              <a href={shareUrls.whatsapp} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-2 bg-success-muted text-success rounded-lg text-sm font-medium hover:opacity-80 transition-opacity">
                <MessageCircle className="w-4 h-4" /> WhatsApp
              </a>
              <a href={shareUrls.telegram} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-2 bg-primary-100 text-primary-700 rounded-lg text-sm font-medium hover:opacity-80 transition-opacity">
                <Send className="w-4 h-4" /> Telegram
              </a>
              <a href={shareUrls.facebook} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium hover:opacity-80 transition-opacity">
                <Share2 className="w-4 h-4" /> Facebook
              </a>
              <a href={shareUrls.x} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:opacity-80 transition-opacity">
                <Send className="w-4 h-4" /> X
              </a>
            </div>
          </motion.div>

          {/* 3. Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={Gift} label="Direct Bonus" value="10%" tint="bg-primary-100 text-primary-700" />
            <StatCard icon={Users} label="Network Bonus" value="5% + 1%" tint="bg-success-muted text-success" />
            <StatCard icon={Clock} label="Buyer Window" value={`${BUYER_WINDOW_DAYS} days`} tint="bg-warning-muted text-warning" />
            <StatCard icon={Store} label="Seller Window" value={`${VENDOR_WINDOW_DAYS} days`} tint="bg-error-muted text-error" />
          </div>

          {/* 4. Monthly Target Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-2xl p-5 md:p-6 shadow-sm border border-gray-100"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Monthly Target</h2>
              <TrendingUp className="w-5 h-5 text-success" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <div>
                <p className="text-sm text-gray-500">Estimated Income</p>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(Number(stats.total_earned))}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Active Referrals</p>
                <p className="text-2xl font-bold text-gray-900">{stats.active_referrals}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Conversion Rate</p>
                <p className="text-2xl font-bold text-gray-900">{conversionRate}%</p>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-gray-500">Progress to {formatCurrency(monthlyTarget)}</span>
                <span className="font-semibold text-gray-900">{monthlyProgress}%</span>
              </div>
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${monthlyProgress}%` }}
                  transition={{ duration: 0.6 }}
                  className="h-full rounded-full"
                  style={{ background: 'linear-gradient(90deg, #2563EB, #F97316)' }}
                />
              </div>
            </div>
          </motion.div>

          {/* 5. 3-Level Referral Tree */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white rounded-2xl p-5 md:p-6 shadow-sm border border-gray-100"
          >
            <h2 className="text-lg font-bold text-gray-900 mb-4">3-Level Referral Tree</h2>
            <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
              <TreeNode label="You" subtext="Start here" highlight />
              <TreeConnector />
              <TreeNode label="Level 1" subtext="10% reward" count={tree.filter((t) => t.level === 1).length} />
              <TreeConnector />
              <TreeNode label="Level 2" subtext="5% reward" count={tree.filter((t) => t.level === 2).length} />
              <TreeConnector />
              <TreeNode label="Level 3" subtext="1% reward" count={tree.filter((t) => t.level === 3).length} />
              <TreeConnector />
              <TreeNode label="Stop" subtext="Rewards stop here" end />
            </div>
          </motion.div>

          {/* 6. Qualification Rules */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="bg-white rounded-2xl p-5 md:p-6 shadow-sm border border-gray-100"
          >
            <h2 className="text-lg font-bold text-gray-900 mb-4">Qualification Rules</h2>
            <ul className="space-y-3">
              <RuleItem icon={Clock} text={`Buyers must complete first purchase within ${BUYER_WINDOW_DAYS} days of registration`} />
              <RuleItem icon={Store} text={`Vendors must complete first sale within ${VENDOR_WINDOW_DAYS} days of registration`} />
              <RuleItem icon={Ban} text="Rewards auto-expire if the window is missed — permanently void" />
              <RuleItem icon={Award} text="One-time reward only per qualifying action" />
              <RuleItem icon={Crown} text="No Level 4 commissions — the chain ends after Level 3" />
            </ul>
          </motion.div>

          {/* 7. Bonus History Table */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
          >
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Bonus History</h2>
              <span className="text-sm text-gray-500">{rewardsTotal} total</span>
            </div>
            {rewards.length === 0 ? (
              <div className="p-8 text-center">
                <Award className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500">No bonuses yet</p>
                <p className="text-sm text-gray-400 mt-1">Share your link to start earning</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-surface-muted text-gray-500">
                      <tr>
                        <th className="text-left font-medium px-4 py-3">User</th>
                        <th className="text-left font-medium px-4 py-3">Level</th>
                        <th className="text-left font-medium px-4 py-3">Action</th>
                        <th className="text-right font-medium px-4 py-3">Amount</th>
                        <th className="text-left font-medium px-4 py-3">Status</th>
                        <th className="text-left font-medium px-4 py-3">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {rewards.map((r) => (
                        <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-gray-900 font-medium truncate max-w-[160px]">
                            {r.referred_name || r.referred_email || 'User'}
                          </td>
                          <td className="px-4 py-3 text-gray-600">L{r.level}</td>
                          <td className="px-4 py-3 text-gray-600">{ACTION_LABELS[r.reward_type] || r.reward_type}</td>
                          <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatCurrency(Number(r.reward_amount))}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${STATUS_STYLES[r.status]}`}>{r.status}</span>
                          </td>
                          <td className="px-4 py-3 text-gray-500">{formatDate(r.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center justify-between p-4 border-t border-gray-100">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="px-3 py-1.5 text-sm font-medium rounded-lg disabled:opacity-40 bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                    >
                      Previous
                    </button>
                    <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="px-3 py-1.5 text-sm font-medium rounded-lg disabled:opacity-40 bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </motion.div>

          {/* 9. Leaderboard (lazy loaded) */}
          <Suspense fallback={<div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100"><Loader2 className="w-6 h-6 text-primary-600 animate-spin" /></div>}>
            <LeaderboardSection />
          </Suspense>
        </div>

        {/* Right column: earnings + withdrawal */}
        <div className="lg:col-span-4 space-y-6">
          {/* 9. Withdrawal Summary */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="bg-white rounded-2xl p-5 md:p-6 shadow-sm border border-gray-100 lg:sticky lg:top-6"
          >
            <div className="flex items-center gap-2 mb-4">
              <Wallet className="w-5 h-5 text-primary-600" />
              <h2 className="text-lg font-bold text-gray-900">Withdrawal</h2>
            </div>
            <div className="space-y-3 mb-5">
              <BalanceRow label="Available" value={formatCurrency(Number(stats.withdrawable_earnings))} />
              <BalanceRow label="Pending" value={formatCurrency(Number(stats.pending_earnings))} />
              <BalanceRow label="Total Earned" value={formatCurrency(Number(stats.total_earned))} />
            </div>

            <div className="bg-surface-muted rounded-xl p-3 mb-4 text-xs text-gray-500">
              Minimum withdrawal: {formatCurrency(MIN_WITHDRAWAL_USD)}
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Amount (USD)</label>
                <input
                  type="number"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Payout Method</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['paystack', 'bank', 'crypto'] as WithdrawalMethod[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => setWithdrawMethod(m)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                        withdrawMethod === m
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {withdrawError && (
                <div className="flex items-center gap-2 text-sm text-error bg-error-muted rounded-lg px-3 py-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {withdrawError}
                </div>
              )}
              {withdrawSuccess && (
                <div className="flex items-center gap-2 text-sm text-success bg-success-muted rounded-lg px-3 py-2">
                  <Check className="w-4 h-4 shrink-0" />
                  Withdrawal request submitted!
                </div>
              )}

              <button
                onClick={handleWithdraw}
                disabled={withdrawing}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary-600 text-white rounded-xl font-semibold hover:bg-primary-700 transition-colors disabled:opacity-60"
              >
                {withdrawing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4" />}
                Withdraw Earnings
              </button>
            </div>

            {withdrawals.length > 0 && (
              <div className="mt-5 pt-4 border-t border-gray-100">
                <p className="text-sm font-medium text-gray-700 mb-2">Recent Withdrawals</p>
                <div className="space-y-2">
                  {withdrawals.slice(0, 4).map((w) => (
                    <div key={w.id} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600 capitalize">{w.method}</span>
                      <span className="font-medium text-gray-900">{formatCurrency(Number(w.amount))}</span>
                      <span className={`px-2 py-0.5 text-xs rounded-full ${
                        w.status === 'paid' ? 'bg-success-muted text-success' :
                        w.status === 'rejected' ? 'bg-error-muted text-error' :
                        'bg-warning-muted text-warning'
                      }`}>{w.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>

          {/* Quick link back to dashboard */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-gradient-to-br from-primary-600 to-primary-500 rounded-2xl p-5 text-white shadow-sm"
          >
            <p className="text-sm text-primary-100">Your Network</p>
            <p className="text-3xl font-bold mt-1">{stats.total_referrals}</p>
            <p className="text-sm text-primary-100 mt-1">total referrals across all levels</p>
          </motion.div>
        </div>
      </div>

      <ReferralAnalyticsSection />
    </div>
  );
}

function ReferralAnalyticsSection() {
  return (
    <div className="mt-8 max-w-7xl mx-auto px-4">
      <h2 className="text-lg font-bold text-gray-900 mb-3">Referral Program Analytics</h2>
      <ReferralProgramAnalytics />
      <div className="mt-6">
        <h2 className="text-lg font-bold text-gray-900 mb-3">Referral Intelligence</h2>
        <ReferralIntelligenceDashboard />
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tint }: { icon: React.ElementType; label: string; value: string; tint: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl p-4 md:p-5 shadow-sm border border-gray-100"
    >
      <div className={`p-2.5 rounded-xl inline-flex ${tint} mb-3`}>
        <Icon className="w-5 h-5" />
      </div>
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-lg font-bold text-gray-900">{value}</p>
    </motion.div>
  );
}

function TreeNode({ label, subtext, count, highlight, end }: { label: string; subtext: string; count?: number; highlight?: boolean; end?: boolean }) {
  return (
    <div className={`flex-1 min-w-[120px] rounded-2xl p-4 text-center border ${
      highlight ? 'bg-primary-600 text-white border-primary-600' :
      end ? 'bg-gray-100 text-gray-500 border-gray-200 border-dashed' :
      'bg-white text-gray-900 border-gray-200'
    }`}>
      <p className="font-bold">{label}</p>
      <p className={`text-xs mt-1 ${highlight ? 'text-primary-100' : 'text-gray-500'}`}>{subtext}</p>
      {typeof count === 'number' && (
        <p className="text-2xl font-extrabold mt-2">{count}</p>
      )}
    </div>
  );
}

function TreeConnector() {
  return (
    <div className="flex items-center justify-center text-gray-300">
      <ChevronRight className="w-6 h-6 rotate-90 md:rotate-0" />
    </div>
  );
}

function RuleItem({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <li className="flex items-start gap-3">
      <div className="p-2 bg-primary-50 rounded-lg shrink-0">
        <Icon className="w-4 h-4 text-primary-600" />
      </div>
      <span className="text-sm text-gray-700 pt-1">{text}</span>
    </li>
  );
}

function BalanceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="font-semibold text-gray-900">{value}</span>
    </div>
  );
}
