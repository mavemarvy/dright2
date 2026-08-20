import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart3,
  TrendingUp,
  Award,
  ShoppingBag,
  Loader2,
  Table,
} from 'lucide-react';
import { fetchSalesAnalytics, type SalesAnalytics } from '../lib/affiliate';

interface Props {
  userId: string;
}

export default function SalesAnalyticsSection({ userId }: Props) {
  const [analytics, setAnalytics] = useState<SalesAnalytics | null>(null);
  const [recentSales, setRecentSales] = useState<
    Array<{
      id: string;
      product_name: string;
      sale_amount: number;
      sale_date: string;
      buyer_name: string;
      referrer_role: string | null;
    }>
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSalesAnalytics(userId).then((result) => {
      setAnalytics(result.analytics);
      setRecentSales(result.recentSales);
      setLoading(false);
    });
  }, [userId]);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
          <BarChart3 className="w-5 h-5 text-primary-600" />
          Sales Analytics
        </h3>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
        </div>
      </div>
    );
  }

  if (!analytics) return null;

  const metrics = [
    {
      label: 'Affiliate Sales',
      value: analytics.totalAffiliateSales,
      icon: TrendingUp,
      color: 'primary',
      hint: 'Affiliate + Admin',
    },
    {
      label: 'Marketer Sales',
      value: analytics.totalMarketerSales,
      icon: Award,
      color: 'success',
      hint: 'Marketer referrals',
    },
    {
      label: 'Advertiser Sales',
      value: analytics.totalAdvertiserSales,
      icon: ShoppingBag,
      color: 'warning',
      hint: 'Advertiser referrals',
    },
    {
      label: 'Overall Sales',
      value: analytics.totalOverallSales,
      icon: BarChart3,
      color: 'primary',
      hint: 'All combined',
    },
  ];

  const colorMap: Record<string, { bg: string; text: string; icon: string }> = {
    primary: { bg: 'bg-primary-50', text: 'text-primary-700', icon: 'text-primary-600' },
    success: { bg: 'bg-success-muted', text: 'text-success', icon: 'text-success' },
    warning: { bg: 'bg-warning/10', text: 'text-warning', icon: 'text-warning' },
  };

  return (
    <div className="space-y-4">
      {/* Metric Cards */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
          <BarChart3 className="w-5 h-5 text-primary-600" />
          Sales Analytics
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {metrics.map((metric, idx) => {
            const colors = colorMap[metric.color];
            return (
              <motion.div
                key={metric.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className={`${colors.bg} rounded-xl p-4 text-center`}
              >
                <metric.icon className={`w-5 h-5 ${colors.icon} mx-auto mb-2`} />
                <p className={`text-2xl font-bold ${colors.text}`}>{metric.value}</p>
                <p className="text-xs text-gray-600 font-medium mt-1">{metric.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{metric.hint}</p>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Recent Sales Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
          <Table className="w-5 h-5 text-primary-600" />
          Recent Tracked Sales
        </h3>
        {recentSales.length === 0 ? (
          <div className="text-center py-8">
            <ShoppingBag className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No tracked sales yet.</p>
            <p className="text-xs text-gray-400 mt-1">
              Share your affiliate links to start earning!
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 font-medium text-gray-500">Order ID</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-500">Product</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-500">Amount</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-500">Date</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-500">Buyer</th>
                </tr>
              </thead>
              <tbody>
                {recentSales.map((sale) => (
                  <tr
                    key={sale.id}
                    className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                  >
                    <td className="py-2.5 px-3 text-gray-600 font-mono text-xs">
                      {sale.id.substring(0, 8)}...
                    </td>
                    <td className="py-2.5 px-3 text-gray-900 font-medium">
                      {sale.product_name}
                    </td>
                    <td className="py-2.5 px-3 text-gray-900 font-semibold">
                      ${Number(sale.sale_amount).toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-gray-500">
                      {new Date(sale.sale_date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="py-2.5 px-3 text-gray-600">{sale.buyer_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
