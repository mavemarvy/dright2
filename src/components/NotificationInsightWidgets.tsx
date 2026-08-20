import { motion } from 'framer-motion';
import {
  Sparkles, TrendingUp, TrendingDown, Minus, Bell, Clock,
  ShoppingCart, MessageCircle, Wallet, Users, Star, Briefcase,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNotificationSummary, useMonthlyInsights, type SummaryPeriod, type SummaryData, type MonthlyInsight } from '../lib/notificationSummary';
import { useNotificationInsights } from '../lib/notificationInsights';
import { useState } from 'react';

const SUMMARY_ICONS: Record<string, LucideIcon> = {
  messages: MessageCircle,
  orders: ShoppingCart,
  wallet: Wallet,
  followers: Users,
  reviews: Star,
  jobs: Briefcase,
  affiliate: TrendingUp,
  referrals: Users,
  services: Clock,
  store: Bell,
  security: Bell,
  promotions: Sparkles,
  admin: Bell,
  system: Bell,
  ai: Sparkles,
  marketplace: ShoppingCart,
};

function SummaryCard({ summary, period, onDismiss }: {
  summary: SummaryData; period: SummaryPeriod; onDismiss: () => void;
}) {
  const periodLabel = period === 'daily' ? "Today's Summary" : period === 'weekly' ? 'Weekly Summary' : 'Monthly Summary';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-primary-100 dark:border-primary-900/30 bg-gradient-to-br from-primary-50 to-white dark:from-primary-900/20 dark:to-gray-800 p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-primary-600 dark:text-primary-400" />
          </div>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">{periodLabel}</h3>
        </div>
        <button onClick={onDismiss} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">Dismiss</button>
      </div>

      {summary.lines.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No notifications in this period.</p>
      ) : (
        <div className="space-y-2">
          {summary.lines.slice(0, 7).map((line, i) => {
            const Icon = SUMMARY_ICONS[line.category] || Bell;
            return (
              <div key={i} className="flex items-center gap-2 text-sm">
                <Icon className="w-4 h-4 text-gray-400 shrink-0" />
                <span className="text-gray-700 dark:text-gray-300">{line.text}</span>
              </div>
            );
          })}
        </div>
      )}

      {summary.highlights.length > 0 && (
        <div className="mt-4 pt-4 border-t border-primary-100 dark:border-primary-900/30">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Highlights</p>
          <div className="flex flex-wrap gap-2">
            {summary.highlights.map((h, i) => (
              <span key={i} className="px-2 py-1 rounded-lg bg-primary-100 dark:bg-primary-900/30 text-xs font-medium text-primary-700 dark:text-primary-300">
                {h}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        <a href="/activity" className="px-3 py-1.5 rounded-lg bg-primary-600 text-white text-xs font-medium hover:bg-primary-700">
          View Details
        </a>
        <span className="text-xs text-gray-400">{summary.totalNotifications} total · {summary.unreadCount} unread</span>
      </div>
    </motion.div>
  );
}

export function DailySummaryWidget() {
  const { user } = useAuth();
  const { summary, loading } = useNotificationSummary(user?.id || null, 'daily');
  const [dismissed, setDismissed] = useState(false);

  if (loading || dismissed || !summary || summary.totalNotifications === 0) return null;

  return <SummaryCard summary={summary} period="daily" onDismiss={() => setDismissed(true)} />;
}

export function WeeklySummaryWidget() {
  const { user } = useAuth();
  const { summary, loading } = useNotificationSummary(user?.id || null, 'weekly');
  const [dismissed, setDismissed] = useState(false);

  if (loading || dismissed || !summary || summary.totalNotifications === 0) return null;

  return <SummaryCard summary={summary} period="weekly" onDismiss={() => setDismissed(true)} />;
}

export function MonthlyInsightsWidget() {
  const { user } = useAuth();
  const { insights, loading } = useMonthlyInsights(user?.id || null);
  const [dismissed, setDismissed] = useState(false);

  if (loading || dismissed || insights.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Monthly Insights</h3>
        </div>
        <button onClick={() => setDismissed(true)} className="text-xs text-gray-400 hover:text-gray-600">Dismiss</button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {insights.map((insight: MonthlyInsight, i: number) => {
          const TrendIcon = insight.trend === 'up' ? TrendingUp : insight.trend === 'down' ? TrendingDown : Minus;
          const trendColor = insight.trend === 'up' ? 'text-success' : insight.trend === 'down' ? 'text-error' : 'text-gray-400';
          return (
            <div key={i} className="p-3 rounded-xl bg-gray-50 dark:bg-gray-700/50">
              <p className="text-xs text-gray-500 dark:text-gray-400">{insight.label}</p>
              <div className="flex items-center gap-1 mt-1">
                <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{insight.value}</p>
                {insight.trendPercent > 0 && (
                  <span className={`text-xs ${trendColor} flex items-center gap-0.5`}>
                    <TrendIcon className="w-3 h-3" />
                    {insight.trendPercent}%
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

export function NotificationInsightsPanel() {
  const { user } = useAuth();
  const { insights, loading } = useNotificationInsights(user?.id || null, 30);

  if (loading || !insights) return null;

  const maxDayCount = Math.max(...insights.mostActiveDays.map(d => d.count), 1);
  

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-5"
    >
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
          <Bell className="w-4 h-4 text-amber-600 dark:text-amber-400" />
        </div>
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">Notification Insights</h3>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="p-3 rounded-xl bg-primary-50 dark:bg-primary-900/20 text-center">
          <p className="text-2xl font-bold text-primary-600 dark:text-primary-400">{insights.unreadCount}</p>
          <p className="text-xs text-gray-500">Unread</p>
        </div>
        <div className="p-3 rounded-xl bg-success/10 text-center">
          <p className="text-2xl font-bold text-success">{insights.responseRate}%</p>
          <p className="text-xs text-gray-500">Response Rate</p>
        </div>
        <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-700/50 text-center">
          <p className="text-2xl font-bold text-gray-600 dark:text-gray-300">
            {insights.averageResponseTimeHours != null
              ? insights.averageResponseTimeHours < 1
                ? `${Math.round(insights.averageResponseTimeHours * 60)}m`
                : `${Math.round(insights.averageResponseTimeHours)}h`
              : '—'}
          </p>
          <p className="text-xs text-gray-500">Avg Response</p>
        </div>
      </div>

      {/* Most active days */}
      <div className="mb-5">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Most Active Days</p>
        <div className="space-y-1.5">
          {insights.mostActiveDays.slice(0, 7).map(day => (
            <div key={day.day} className="flex items-center gap-2">
              <span className="text-xs text-gray-500 w-20">{day.day}</span>
              <div className="flex-1 h-4 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary-500 rounded-full transition-all"
                  style={{ width: `${(day.count / maxDayCount) * 100}%` }}
                />
              </div>
              <span className="text-xs text-gray-400 w-8 text-right">{day.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Most common types */}
      {insights.mostCommonTypes.length > 0 && (
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Most Common Types</p>
          <div className="flex flex-wrap gap-2">
            {insights.mostCommonTypes.slice(0, 6).map(t => (
              <span key={t.type} className="px-2 py-1 rounded-lg bg-gray-100 dark:bg-gray-700 text-xs text-gray-600 dark:text-gray-400">
                {t.type.replace(/_/g, ' ')} ({t.count})
              </span>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
