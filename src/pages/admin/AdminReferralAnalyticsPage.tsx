import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Users,
  TrendingUp,
  DollarSign,
  AlertTriangle,
  Crown,
  Loader2,
  CheckCircle,
  Ban,
} from 'lucide-react';
import { fetchAdminReferralAnalytics, type LeaderboardEntry } from '../../lib/referral';
import { formatCurrency } from '../../lib/currency';

interface Analytics {
  totalReferrals: number;
  activeReferrals: number;
  expiredReferrals: number;
  payoutVolume: number;
  topReferrers: LeaderboardEntry[];
  fraudAlerts: number;
  funnel: { signups: number; first_purchases: number; first_sales: number };
}

export default function AdminReferralAnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const result = await fetchAdminReferralAnalytics();
        setData(result);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-warning animate-spin" />
      </div>
    );
  }

  if (!data) return null;

  const funnelSteps = [
    { label: 'Signups', value: data.funnel.signups, pct: 100 },
    { label: 'First Purchases', value: data.funnel.first_purchases, pct: data.funnel.signups > 0 ? Math.round((data.funnel.first_purchases / data.funnel.signups) * 100) : 0 },
    { label: 'First Sales', value: data.funnel.first_sales, pct: data.funnel.signups > 0 ? Math.round((data.funnel.first_sales / data.funnel.signups) * 100) : 0 },
  ];

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Referral Analytics</h1>
        <p className="text-gray-500 mt-1">Monitor referral performance and fraud</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <AdminStatCard icon={Users} label="Total Referrals" value={data.totalReferrals.toString()} tint="text-primary-600 bg-primary-100" />
        <AdminStatCard icon={CheckCircle} label="Active Referrals" value={data.activeReferrals.toString()} tint="text-success bg-success-muted" />
        <AdminStatCard icon={Ban} label="Expired" value={data.expiredReferrals.toString()} tint="text-error bg-error-muted" />
        <AdminStatCard icon={AlertTriangle} label="Fraud Alerts" value={data.fraudAlerts.toString()} tint="text-warning bg-warning-muted" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Payout Volume */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100"
        >
          <div className="flex items-center gap-3 mb-2">
            <DollarSign className="w-6 h-6 text-success" />
            <h2 className="text-lg font-bold text-gray-900">Payout Volume</h2>
          </div>
          <p className="text-3xl font-extrabold text-gray-900">{formatCurrency(data.payoutVolume)}</p>
          <p className="text-sm text-gray-500 mt-1">Total paid out in referral rewards</p>
        </motion.div>

        {/* Conversion Funnel */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100"
        >
          <div className="flex items-center gap-3 mb-4">
            <TrendingUp className="w-6 h-6 text-primary-600" />
            <h2 className="text-lg font-bold text-gray-900">Conversion Funnel</h2>
          </div>
          <div className="space-y-3">
            {funnelSteps.map((s) => (
              <div key={s.label}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-gray-600">{s.label}</span>
                  <span className="font-semibold text-gray-900">{s.value} ({s.pct}%)</span>
                </div>
                <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${s.pct}%` }}
                    transition={{ duration: 0.5 }}
                    className="h-full bg-primary-600 rounded-full"
                  />
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Top Referrers */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100"
      >
        <div className="flex items-center gap-3 mb-4">
          <Crown className="w-6 h-6 text-warning" />
          <h2 className="text-lg font-bold text-gray-900">Top Referrers</h2>
        </div>
        {data.topReferrers.length === 0 ? (
          <p className="text-gray-500 text-center py-6">No referral activity yet</p>
        ) : (
          <ol className="space-y-2">
            {data.topReferrers.map((e, i) => (
              <li key={e.user_id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                  i === 0 ? 'bg-warning text-white' : i === 1 ? 'bg-gray-300 text-gray-700' : i === 2 ? 'bg-orange-200 text-orange-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{e.full_name || 'Anonymous'}</p>
                  <p className="text-xs text-gray-500">{e.total_referrals} referrals</p>
                </div>
                <span className="font-bold text-gray-900">{formatCurrency(e.total_earned)}</span>
              </li>
            ))}
          </ol>
        )}
      </motion.div>
    </div>
  );
}

function AdminStatCard({ icon: Icon, label, value, tint }: { icon: React.ElementType; label: string; value: string; tint: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100"
    >
      <div className={`p-2.5 rounded-xl inline-flex ${tint} mb-3`}>
        <Icon className="w-5 h-5" />
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm text-gray-500">{label}</p>
    </motion.div>
  );
}
