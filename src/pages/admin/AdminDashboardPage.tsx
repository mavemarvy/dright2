import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Users, UserCheck, Package, DollarSign, TrendingUp, ShoppingBag,
  Star, Heart, Search, Eye, AlertTriangle, ArrowRight, Loader2,
  Activity, Gift, Ticket, FileCheck,
} from 'lucide-react';
import {
  useAdminAnalytics, useAdminDailyActivity,
} from '../../lib/analyticsHooks';
import { useAdminAnalytics as usePromoAnalytics } from '../../lib/promotionHooks';
import { useRewardAnalytics } from '../../lib/rewardHooks';
import { AdminAnalyticsDashboard } from '../../components/analytics/AdminAnalyticsDashboard';
import { SearchAnalyticsSection } from '../../components/analytics/SearchAnalyticsSection';
import { AdminIntelligenceDashboard, TrendingEngineDashboard } from '../../components/analytics/AdvancedAnalytics';
import { LiveLeaderboards, FraudDetectionDashboard } from '../../components/analytics/IntelligenceComponents';
import { formatCurrency } from '../../lib/currency';

export default function AdminDashboardPage() {
  const { analytics: kpis, loading } = useAdminAnalytics();
  const { activity } = useAdminDailyActivity(14);
  const { analytics: promoAnalytics } = usePromoAnalytics();
  const { analytics: rewardAnalytics } = useRewardAnalytics();
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('today');

  const maxViews = useMemo(() => Math.max(...activity.map(a => a.views), 1), [activity]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
      </div>
    );
  }

  const kpiCards = [
    { label: 'Total Users', value: kpis?.total_users || 0, sub: `${kpis?.active_users_today || 0} active today`, icon: Users, color: 'text-blue-500', bg: 'bg-blue-50' },
    { label: 'New Today', value: kpis?.new_users_today || 0, sub: 'registrations', icon: UserCheck, color: 'text-green-500', bg: 'bg-green-50' },
    { label: 'Sellers', value: kpis?.total_sellers || 0, sub: 'active sellers', icon: TrendingUp, color: 'text-purple-500', bg: 'bg-purple-50' },
    { label: 'Listings', value: kpis?.total_listings || 0, sub: `${kpis?.active_listings || 0} active`, icon: Package, color: 'text-amber-500', bg: 'bg-amber-50' },
    { label: 'Orders', value: kpis?.total_orders || 0, sub: 'total orders', icon: ShoppingBag, color: 'text-indigo-500', bg: 'bg-indigo-50' },
    { label: 'Revenue', value: formatCurrency(kpis?.total_revenue || 0), sub: 'marketplace', icon: DollarSign, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Conversion', value: `${kpis?.conversion_rate || 0}%`, sub: 'view-to-purchase', icon: TrendingUp, color: 'text-primary-500', bg: 'bg-primary-50' },
    { label: 'Pending Orders', value: kpis?.pending_orders || 0, sub: 'awaiting action', icon: Activity, color: 'text-orange-500', bg: 'bg-orange-50' },
    { label: 'Buyers', value: kpis?.total_buyers || 0, sub: 'total buyers', icon: Heart, color: 'text-pink-500', bg: 'bg-pink-50' },
    { label: 'Cancelled', value: kpis?.cancelled_orders || 0, sub: 'cancelled orders', icon: Star, color: 'text-yellow-500', bg: 'bg-yellow-50' },
    { label: 'Total Views', value: kpis?.total_views || 0, sub: 'all listing views', icon: Eye, color: 'text-cyan-500', bg: 'bg-cyan-50' },
    { label: 'Searches', value: kpis?.total_searches || 0, sub: 'total searches', icon: Search, color: 'text-teal-500', bg: 'bg-teal-50' },
  ];

  const urgentItemLinks = [
    { count: kpis?.pending_listings || 0, label: 'pending listings', to: '/admin/products' },
    { count: kpis?.pending_verifications || 0, label: 'verifications', to: '/admin/verifications' },
    { count: kpis?.pending_withdrawals || 0, label: 'withdrawals', to: '/admin/withdrawals' },
  ].filter(u => u.count > 0);

  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Executive Dashboard</h1>
          <p className="text-gray-500 mt-1">Real-time marketplace intelligence</p>
        </div>
        <div className="flex items-center gap-2">
          {(['today', 'week', 'month'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors capitalize ${
                period === p ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 border border-gray-200'
              }`}
            >
              {p === 'today' ? 'Today' : p === 'week' ? 'This Week' : 'This Month'}
            </button>
          ))}
        </div>
      </div>

      {/* Urgent Alert */}
      {urgentItemLinks.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-5 mb-6"
        >
          <div className="flex items-center gap-3 mb-3">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <span className="font-bold text-gray-900">{urgentItemLinks.length} item(s) awaiting your review</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {urgentItemLinks.map((u, i) => (
              <Link key={i} to={u.to} className="px-3 py-1.5 bg-white rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors flex items-center gap-1">
                {u.count} {u.label} <ArrowRight className="w-4 h-4" />
              </Link>
            ))}
          </div>
        </motion.div>
      )}

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
        {kpiCards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.03, 0.3) }}
            className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100"
          >
            <div className="flex items-center justify-between mb-2">
              <div className={`w-10 h-10 rounded-xl ${card.bg} flex items-center justify-center`}>
                <card.icon className={`w-5 h-5 ${card.color}`} />
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900">{card.value}</p>
            <p className="text-sm text-gray-500">{card.label}</p>
            <p className="text-xs text-gray-400 mt-1">{card.sub}</p>
          </motion.div>
        ))}
      </div>

      {/* Activity Chart */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
        <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary-500" />
          14-Day Activity Trend
        </h3>
        {activity.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No activity data yet</p>
        ) : (
          <div className="space-y-2">
            {activity.slice(-14).map(a => (
              <div key={a.date} className="flex items-center gap-3">
                <span className="text-xs text-gray-400 w-20 shrink-0">{new Date(a.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                <div className="flex-1 flex items-center gap-2">
                  <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden relative">
                    <div
                      className="bg-blue-400 h-full rounded-full transition-all"
                      style={{ width: `${(a.views / maxViews) * 100}%` }}
                    />
                    <span className="absolute inset-0 flex items-center px-2 text-xs text-gray-600">{a.views} views</span>
                  </div>
                  {a.purchases > 0 && (
                    <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-full whitespace-nowrap">
                      {a.purchases} purchases
                    </span>
                  )}
                  {a.signups > 0 && (
                    <span className="text-xs font-medium text-primary-600 bg-primary-50 px-2 py-1 rounded-full whitespace-nowrap">
                      {a.signups} signups
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { to: '/admin/promotions', label: 'Promotions', icon: TrendingUp, value: (promoAnalytics as Record<string, number> | null)?.total_campaigns || 0, sub: 'campaigns' },
          { to: '/admin/coupons', label: 'Coupons', icon: Ticket, value: rewardAnalytics?.total_coupons || 0, sub: 'total coupons' },
          { to: '/admin/giveaways', label: 'Giveaways', icon: Gift, value: 0, sub: 'active' },
          { to: '/admin/verifications', label: 'Verifications', icon: FileCheck, value: kpis?.pending_verifications || 0, sub: 'pending' },
        ].map(link => (
          <Link key={link.to} to={link.to} className="bg-white rounded-2xl border border-gray-100 p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 mb-2">
              <link.icon className="w-5 h-5 text-gray-400" />
              <span className="text-sm font-medium text-gray-700">{link.label}</span>
            </div>
            <p className="text-xl font-bold text-gray-900">{link.value}</p>
            <p className="text-xs text-gray-400">{link.sub}</p>
          </Link>
        ))}
      </div>

      {/* Real-time Platform Analytics */}
      <div className="mt-8">
        <AdminAnalyticsDashboard />
      </div>

      {/* Search Analytics */}
      <div className="mt-8">
        <SearchAnalyticsSection />
      </div>

      {/* Admin Intelligence */}
      <div className="mt-8">
        <AdminIntelligenceDashboard />
      </div>

      {/* Trending Engine */}
      <div className="mt-8">
        <TrendingEngineDashboard />
      </div>

      {/* Live Leaderboards */}
      <div className="mt-8">
        <LiveLeaderboards />
      </div>

      {/* Fraud Detection */}
      <div className="mt-8">
        <FraudDetectionDashboard />
      </div>
    </div>
  );
}
