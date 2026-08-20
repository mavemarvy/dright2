import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import SalesAnalyticsSection from '../components/SalesAnalyticsSection';
import ProductInsights from '../components/ProductInsights';
import { SellerAnalyticsDashboard } from '../components/analytics/SellerAnalyticsDashboard';
import { FunnelAnalyticsSection } from '../components/analytics/FunnelAnalyticsSection';
import { ProductPerformanceTable } from '../components/analytics/ProductPerformanceTable';
import { AnalyticsAlerts } from '../components/analytics/EntityPerformance';
import { TrendingEngineDashboard, PredictionEngineDashboard, AIBusinessAdvisor } from '../components/analytics/AdvancedAnalytics';
import { LiveLeaderboards, HeatmapDashboard, CustomerJourneyDashboard, CompetitorBenchmarking, FinancialDashboard, FraudDetectionDashboard } from '../components/analytics/IntelligenceComponents';
import { DailySummaryWidget, MonthlyInsightsWidget, NotificationInsightsPanel } from '../components/NotificationInsightWidgets';
import {
  DollarSign,
  Clock,
  ShoppingBag,
  Link2,
  Copy,
  FileCheck,
  TrendingUp,
  ChevronRight,
  ExternalLink,
  Store,
  Plus,
  Megaphone,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/currency';

interface Announcement {
  id: string;
  title: string;
  message: string;
  type: 'news' | 'promo' | 'update';
  is_active: boolean;
}

interface AffiliateInfo {
  referralCode: string | null;
  totalClicks: number;
  totalConversions: number;
  totalEarnings: number;
}

interface Stats {
  totalEarnings: number;
  pendingPayouts: number;
  totalSales: number;
  recentSales: SaleRecord[];
}

interface SaleRecord {
  id: string;
  buyer_name: string;
  product_name: string;
  commission_amount: number;
  status: string;
  sale_date: string;
}

export default function DashboardPage() {
  const { user, profile } = useAuth();
  const [affiliateInfo, setAffiliateInfo] = useState<AffiliateInfo | null>(null);
  const [stats, setStats] = useState<Stats>({
    totalEarnings: 0,
    pendingPayouts: 0,
    totalSales: 0,
    recentSales: [],
  });
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (user) {
      fetchData();
      fetchAnnouncements();
    }
  }, [user]);

  const fetchAnnouncements = async () => {
    const { data } = await supabase
      .from('global_announcements')
      .select('id, title, message, type, is_active')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(5);
    if (data) setAnnouncements(data as Announcement[]);
  };

  const fetchData = async () => {
    try {
      // Fetch referral link + affiliate earnings
      const { data: linkData } = await supabase
        .from('referral_links')
        .select('unique_code, total_clicks, total_conversions')
        .eq('user_id', user?.id)
        .maybeSingle();

      const { data: userData } = await supabase
        .from('users')
        .select('referral_code, affiliate_earnings')
        .eq('id', user?.id)
        .maybeSingle();

      if (linkData) {
        setAffiliateInfo({
          referralCode: userData?.referral_code || linkData.unique_code,
          totalClicks: linkData.total_clicks || 0,
          totalConversions: linkData.total_conversions || 0,
          totalEarnings: Number(userData?.affiliate_earnings || 0),
        });
      } else if (userData?.referral_code) {
        setAffiliateInfo({
          referralCode: userData.referral_code,
          totalClicks: 0,
          totalConversions: 0,
          totalEarnings: Number(userData.affiliate_earnings || 0),
        });
      }

      // Fetch sales stats
      const { data: salesData } = await supabase
        .from('sales_records')
        .select('id, buyer_name, product_name, commission_amount, status, sale_date')
        .eq('promoter_id', user?.id)
        .order('sale_date', { ascending: false })
        .limit(5);

      if (salesData) {
        const totalEarnings = salesData
          .filter(s => s.status === 'paid')
          .reduce((sum, s) => sum + Number(s.commission_amount), 0);

        const pendingPayouts = salesData
          .filter(s => s.status === 'pending')
          .reduce((sum, s) => sum + Number(s.commission_amount), 0);

        const { count } = await supabase
          .from('sales_records')
          .select('*', { count: 'exact', head: true })
          .eq('promoter_id', user?.id);

        setStats({
          totalEarnings,
          pendingPayouts,
          totalSales: count || 0,
          recentSales: salesData as SaleRecord[],
        });
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const copyReferralLink = async () => {
    if (affiliateInfo?.referralCode) {
      const link = `${window.location.origin}/ref?ref=${affiliateInfo.referralCode}`;
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="p-4 md:p-8 max-w-7xl mx-auto">
        <div className="h-8 w-64 skeleton rounded-lg mb-2" />
        <div className="h-4 w-48 skeleton rounded-lg mb-6" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 skeleton rounded-xl" />
                <div className="h-3 w-8 skeleton rounded" />
              </div>
              <div className="h-3 w-20 skeleton rounded mb-2" />
              <div className="h-5 w-16 skeleton rounded" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {[0, 1].map(i => (
            <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 skeleton rounded-xl" />
                <div className="flex-1">
                  <div className="h-4 w-32 skeleton rounded mb-2" />
                  <div className="h-3 w-24 skeleton rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="h-5 w-32 skeleton rounded m-5 mb-4" />
          {[0, 1, 2].map(i => (
            <div key={i} className="flex items-center gap-4 p-4 border-t border-gray-100 dark:border-gray-700">
              <div className="w-10 h-10 skeleton rounded-full" />
              <div className="flex-1">
                <div className="h-4 w-40 skeleton rounded mb-2" />
                <div className="h-3 w-24 skeleton rounded" />
              </div>
              <div className="h-4 w-16 skeleton rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const metricCards = [
    {
      label: 'Total Earnings',
      value: formatCurrency(stats.totalEarnings),
      icon: DollarSign,
      color: 'bg-success-muted text-success',
      trend: '+12%',
    },
    {
      label: 'Pending Payouts',
      value: formatCurrency(stats.pendingPayouts),
      icon: Clock,
      color: 'bg-warning-muted text-warning',
    },
    {
      label: 'Total Sales',
      value: stats.totalSales.toString(),
      icon: ShoppingBag,
      color: 'bg-primary-100 text-primary-600',
      trend: '+5',
    },
    {
      label: 'Referral Link',
      value: affiliateInfo?.referralCode || 'N/A',
      icon: Link2,
      color: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
      isCode: true,
    },
  ];

  const visibleAnnouncements = announcements.filter((a) => !dismissedIds.has(a.id));

  const announcementStyles: Record<string, string> = {
    news: 'from-primary-600 to-primary-500',
    promo: 'from-success to-green-600',
    update: 'from-warning to-orange-600',
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      {/* Welcome Section */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Welcome back, {profile?.full_name?.split(' ')[0] || 'Promoter'}!
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Here's your earnings overview</p>
      </div>

      {/* AI Daily Summary */}
      <div className="mb-6">
        <DailySummaryWidget />
      </div>

      {/* Global Announcements */}
      {visibleAnnouncements.length > 0 && (
        <div className="space-y-3 mb-6">
          {visibleAnnouncements.map((a) => (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`bg-gradient-to-r ${announcementStyles[a.type] || announcementStyles.news} rounded-2xl p-4 text-white shadow-lg flex items-start gap-3`}
            >
              <Megaphone className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm uppercase tracking-wide opacity-90">{a.type}</p>
                <p className="font-bold mt-0.5">{a.title}</p>
                <p className="text-sm mt-1 opacity-95">{a.message}</p>
              </div>
              <button
                onClick={() => setDismissedIds(new Set([...dismissedIds, a.id]))}
                className="p-1 hover:bg-white dark:bg-gray-800/20 rounded-lg transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          ))}
        </div>
      )}

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {metricCards.map((card, index) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700"
          >
            <div className="flex items-start justify-between mb-3">
              <div className={`p-2.5 rounded-xl ${card.color}`}>
                <card.icon className="w-5 h-5" />
              </div>
              {card.trend && (
                <span className="text-xs font-medium text-success flex items-center gap-0.5">
                  <TrendingUp className="w-3 h-3" />
                  {card.trend}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{card.label}</p>
            <p className={`text-xl font-bold text-gray-900 dark:text-gray-100 ${card.isCode ? 'font-mono text-lg' : ''}`}>
              {card.value}
            </p>
          </motion.div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          onClick={copyReferralLink}
          className="flex items-center gap-3 bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:bg-gray-900/50 transition-colors"
        >
          <div className="p-3 bg-primary-100 rounded-xl">
            {copied ? (
              <span className="text-sm font-medium text-primary-600">Copied!</span>
            ) : (
              <Copy className="w-5 h-5 text-primary-600" />
            )}
          </div>
          <div className="flex-1 text-left">
            <p className="font-semibold text-gray-900 dark:text-gray-100">Copy Referral Link</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Share with buyers</p>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-400 dark:text-gray-500" />
        </motion.button>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Link
            to="/verify"
            className="flex items-center gap-3 bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:bg-gray-900/50 transition-colors"
          >
            <div className="p-3 bg-warning-muted rounded-xl">
              <FileCheck className="w-5 h-5 text-warning" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-semibold text-gray-900 dark:text-gray-100">Submit Verification</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Upload proof of sale</p>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400 dark:text-gray-500" />
          </Link>
        </motion.div>
      </div>

      {/* Market Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <Link
            to="/market"
            className="flex items-center gap-3 bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:bg-gray-900/50 transition-colors"
          >
            <div className="p-3 bg-primary-100 rounded-xl">
              <Store className="w-5 h-5 text-primary-600" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-semibold text-gray-900 dark:text-gray-100">Browse Marketplace</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Find products to affiliate</p>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400 dark:text-gray-500" />
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.65 }}
        >
          <Link
            to="/store"
            className="flex items-center gap-3 bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:bg-gray-900/50 transition-colors"
          >
            <div className="p-3 bg-primary-100 rounded-xl">
              <Store className="w-5 h-5 text-primary-600" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-semibold text-gray-900 dark:text-gray-100">My Store</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Manage your products</p>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400 dark:text-gray-500" />
          </Link>
        </motion.div>
      </div>

      {/* Post Ad Quick Action */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
        >
          <Link
            to="/upload-product"
            className="flex items-center gap-3 bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:bg-gray-900/50 transition-colors"
          >
            <div className="p-3 bg-success-muted rounded-xl">
              <Plus className="w-5 h-5 text-success" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-semibold text-gray-900 dark:text-gray-100">Post an Ad</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Share a product to sell</p>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400 dark:text-gray-500" />
          </Link>
        </motion.div>
      </div>

      {/* Referral Link Stats */}
      {affiliateInfo && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="bg-gradient-to-br from-primary-600 to-primary-500 rounded-2xl p-5 text-white mb-6"
        >
          <div className="flex items-center justify-between mb-4 gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-primary-100 text-sm">Your Referral Link</p>
              <p className="font-mono text-sm sm:text-lg font-semibold mt-1 truncate">
                {window.location.origin}/ref?ref={affiliateInfo.referralCode}
              </p>
            </div>
            <button
              onClick={copyReferralLink}
              className="p-3 bg-white dark:bg-gray-800/20 hover:bg-white dark:bg-gray-800/30 rounded-xl transition-colors shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Copy referral link"
            >
              <ExternalLink className="w-5 h-5" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3 sm:gap-6">
            <div>
              <p className="text-primary-100 text-xs sm:text-sm">Total Clicks</p>
              <p className="text-xl sm:text-2xl font-bold">{affiliateInfo.totalClicks}</p>
            </div>
            <div>
              <p className="text-primary-100 text-xs sm:text-sm">Conversions</p>
              <p className="text-xl sm:text-2xl font-bold">{affiliateInfo.totalConversions}</p>
            </div>
            <div>
              <p className="text-primary-100 text-xs sm:text-sm">Earnings</p>
              <p className="text-xl sm:text-2xl font-bold">{formatCurrency(affiliateInfo.totalEarnings)}</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Recent Sales */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700"
      >
        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Recent Sales</h2>
          <Link
            to="/sales"
            className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
          >
            View all
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        {stats.recentSales.length === 0 ? (
          <div className="p-8 text-center">
            <ShoppingBag className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400">No sales yet</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Share your referral link to get started</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {stats.recentSales.map((sale) => (
              <div
                key={sale.id}
                className="flex items-center gap-4 p-4 hover:bg-gray-50 dark:bg-gray-900/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{sale.buyer_name}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{sale.product_name}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-gray-900 dark:text-gray-100">
                    {formatCurrency(Number(sale.commission_amount))}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{formatDate(sale.sale_date)}</p>
                </div>
                <span
                  className={`px-2.5 py-1 text-xs font-medium rounded-full ${
                    sale.status === 'paid'
                      ? 'bg-success-muted text-success'
                      : 'bg-warning-muted text-warning'
                  }`}
                >
                  {sale.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Sales Analytics Section */}
      {user && <SalesAnalyticsSection userId={user.id} />}

      {/* Monthly Insights & Notification Analytics */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <MonthlyInsightsWidget />
        <NotificationInsightsPanel />
      </div>

      {/* Product Insights */}
      {user && (
        <div className="mt-6">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">Product Insights</h2>
          <ProductInsights />
        </div>
      )}

      {/* Real-time Seller Analytics */}
      <div className="mt-6">
        <SellerAnalyticsDashboard />
      </div>

      {/* Analytics Alerts */}
      <div className="mt-6">
        <AnalyticsAlerts />
      </div>

      {/* Product Performance Table */}
      <div className="mt-6">
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">Product Performance</h2>
        <ProductPerformanceTable />
      </div>

      {/* Conversion Funnel */}
      <div className="mt-6">
        <FunnelAnalyticsSection />
      </div>

      {/* AI Business Advisor */}
      <div className="mt-8">
        <AIBusinessAdvisor sellerId={user?.id} />
      </div>

      {/* Prediction Engine */}
      <div className="mt-8">
        <PredictionEngineDashboard sellerId={user?.id} />
      </div>

      {/* Trending Engine */}
      <div className="mt-8">
        <TrendingEngineDashboard />
      </div>

      {/* Financial Dashboard */}
      <div className="mt-8">
        <FinancialDashboard sellerId={user?.id} />
      </div>

      {/* Customer Journey */}
      <div className="mt-8">
        <CustomerJourneyDashboard sellerId={user?.id} />
      </div>

      {/* Heatmap */}
      <div className="mt-8">
        <HeatmapDashboard sellerId={user?.id} />
      </div>

      {/* Competitor Benchmarking */}
      <div className="mt-8">
        <CompetitorBenchmarking sellerId={user?.id} />
      </div>

      {/* Fraud Detection */}
      <div className="mt-8">
        <FraudDetectionDashboard sellerId={user?.id} />
      </div>

      {/* Live Leaderboards */}
      <div className="mt-8">
        <LiveLeaderboards />
      </div>
    </div>
  );
}
