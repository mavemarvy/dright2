// ─────────────────────────────────────────────────────────────────────────────
// DRIGHT Entity Performance Components — Jobs, Services, Courses, Referrals,
// Creator Campaigns, Affiliates, Alerts
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { LineChart, BarChart, DonutChart } from './Charts';
import { AnalyticsLoading, AnalyticsNoData } from './AnalyticsState';
import {
  Eye, Users, ShoppingCart, DollarSign, TrendingUp, Star, Clock,
  CheckCircle, XCircle, AlertCircle, Award, Target, Zap, Heart,
  Share2, MessageCircle, GraduationCap, Briefcase, Gift, Activity,
} from 'lucide-react';
import { formatCurrency } from '../../lib/currency';

// ─── Helper ───────────────────────────────────────────────────────────────────

function StatBox({ label, value, icon: Icon, color = 'text-indigo-500' }: { label: string; value: string | number; icon?: React.ComponentType<{ className?: string }>; color?: string }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
      {Icon && <Icon className={`w-4 h-4 ${color} mb-1`} />}
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-lg font-bold text-gray-900 dark:text-white">{typeof value === 'number' ? value.toLocaleString() : value}</p>
    </div>
  );
}

function useEntityPerformance(rpcName: string, entityId: string, days: number = 30) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.rpc(rpcName, { p_job_id: entityId, p_service_id: entityId, p_course_id: entityId, p_days: days } as Record<string, unknown>);
        if (error) throw error;
        setData(data as Record<string, unknown>);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [rpcName, entityId, days]);

  return { data, loading, error };
}

const toChartData = (arr: Record<string, unknown>[] | undefined, labelKey: string, valueKey: string) =>
  (arr || []).map((d) => ({ label: String(d[labelKey] || ''), value: Number(d[valueKey]) || 0 }));

// ─── Job Performance ──────────────────────────────────────────────────────────

export function JobPerformanceAnalytics({ jobId }: { jobId: string }) {
  const { data, loading } = useEntityPerformance('get_job_performance', jobId);
  const num = (k: string) => Number(data?.[k]) || 0;
  const arr = (k: string) => (data?.[k] as Record<string, unknown>[]) || [];

  if (loading) return <AnalyticsLoading />;
  if (!data) return <AnalyticsNoData />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <StatBox label="Views" value={num('views')} icon={Eye} />
        <StatBox label="Unique Visitors" value={num('unique_visitors')} icon={Users} color="text-purple-500" />
        <StatBox label="Applications" value={num('applications')} icon={Briefcase} color="text-blue-500" />
        <StatBox label="Shortlisted" value={num('shortlisted')} icon={CheckCircle} color="text-green-500" />
        <StatBox label="Interviewed" value={num('interviewed')} icon={Users} color="text-orange-500" />
        <StatBox label="Accepted" value={num('accepted')} icon={Award} color="text-emerald-500" />
        <StatBox label="Rejected" value={num('rejected')} icon={XCircle} color="text-red-500" />
        <StatBox label="Response Time" value={`${num('employer_response_time')}h`} icon={Clock} color="text-cyan-500" />
        <StatBox label="Avg Salary" value={formatCurrency(num('average_salary'))} icon={DollarSign} color="text-green-500" />
        <StatBox label="CTR" value={`${num('ctr').toFixed(1)}%`} icon={Target} color="text-indigo-500" />
        <StatBox label="Conversion" value={`${num('conversion').toFixed(1)}%`} icon={TrendingUp} color="text-purple-500" />
        <StatBox label="Referral Traffic" value={num('referral_traffic')} icon={Share2} color="text-teal-500" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Daily Views</h4>
          {arr('daily_views').length ? <LineChart data={toChartData(arr('daily_views'), 'date', 'count')} color="#6366f1" /> : <AnalyticsNoData />}
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Daily Applications</h4>
          {arr('daily_applications').length ? <BarChart data={toChartData(arr('daily_applications'), 'date', 'count')} color="#3b82f6" /> : <AnalyticsNoData />}
        </div>
      </div>
    </div>
  );
}

// ─── Service Performance ──────────────────────────────────────────────────────

export function ServicePerformanceAnalytics({ serviceId }: { serviceId: string }) {
  const { data, loading } = useEntityPerformance('get_service_performance', serviceId);
  const num = (k: string) => Number(data?.[k]) || 0;
  const arr = (k: string) => (data?.[k] as Record<string, unknown>[]) || [];

  if (loading) return <AnalyticsLoading />;
  if (!data) return <AnalyticsNoData />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <StatBox label="Views" value={num('views')} icon={Eye} />
        <StatBox label="Unique Visitors" value={num('unique_visitors')} icon={Users} color="text-purple-500" />
        <StatBox label="Orders" value={num('orders')} icon={ShoppingCart} color="text-blue-500" />
        <StatBox label="Completed" value={num('completed_orders')} icon={CheckCircle} color="text-green-500" />
        <StatBox label="Cancelled" value={num('cancelled_orders')} icon={XCircle} color="text-red-500" />
        <StatBox label="Avg Delivery" value={`${num('average_delivery_time')}h`} icon={Clock} color="text-cyan-500" />
        <StatBox label="Avg Rating" value={num('average_rating').toFixed(1)} icon={Star} color="text-amber-500" />
        <StatBox label="Repeat Customers" value={num('repeat_customers')} icon={Users} color="text-indigo-500" />
        <StatBox label="Revenue" value={formatCurrency(num('revenue'))} icon={DollarSign} color="text-green-500" />
        <StatBox label="Conversion" value={`${num('conversion').toFixed(1)}%`} icon={TrendingUp} color="text-purple-500" />
        <StatBox label="Chats Started" value={num('chats_started')} icon={MessageCircle} color="text-orange-500" />
        <StatBox label="Refund Rate" value={`${num('refund_rate').toFixed(1)}%`} icon={AlertCircle} color="text-red-500" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Daily Views</h4>
          {arr('daily_views').length ? <LineChart data={toChartData(arr('daily_views'), 'date', 'count')} color="#6366f1" /> : <AnalyticsNoData />}
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Daily Revenue</h4>
          {arr('daily_revenue').length ? <BarChart data={toChartData(arr('daily_revenue'), 'date', 'revenue')} color="#10b981" formatValue={formatCurrency} /> : <AnalyticsNoData />}
        </div>
      </div>
    </div>
  );
}

// ─── Course Performance ───────────────────────────────────────────────────────

export function CoursePerformanceAnalytics({ courseId }: { courseId: string }) {
  const { data, loading } = useEntityPerformance('get_course_performance', courseId);
  const num = (k: string) => Number(data?.[k]) || 0;
  const arr = (k: string) => (data?.[k] as Record<string, unknown>[]) || [];

  if (loading) return <AnalyticsLoading />;
  if (!data) return <AnalyticsNoData />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <StatBox label="Views" value={num('views')} icon={Eye} />
        <StatBox label="Unique Visitors" value={num('unique_visitors')} icon={Users} color="text-purple-500" />
        <StatBox label="Enrollments" value={num('enrollments')} icon={GraduationCap} color="text-blue-500" />
        <StatBox label="Completions" value={num('course_completion')} icon={CheckCircle} color="text-green-500" />
        <StatBox label="Avg Watch Time" value={`${num('average_watch_time')}s`} icon={Clock} color="text-cyan-500" />
        <StatBox label="Quiz Completions" value={num('quiz_completion')} icon={CheckCircle} color="text-indigo-500" />
        <StatBox label="Downloads" value={num('downloads')} icon={Activity} color="text-orange-500" />
        <StatBox label="Certificates" value={num('certificates_issued')} icon={Award} color="text-amber-500" />
        <StatBox label="Revenue" value={formatCurrency(num('revenue'))} icon={DollarSign} color="text-green-500" />
        <StatBox label="Refunds" value={num('refunds')} icon={XCircle} color="text-red-500" />
        <StatBox label="Satisfaction" value={num('student_satisfaction').toFixed(1)} icon={Star} color="text-purple-500" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Daily Views</h4>
          {arr('daily_views').length ? <LineChart data={toChartData(arr('daily_views'), 'date', 'count')} color="#6366f1" /> : <AnalyticsNoData />}
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Daily Enrollments</h4>
          {arr('daily_enrollments').length ? <BarChart data={toChartData(arr('daily_enrollments'), 'date', 'count')} color="#3b82f6" /> : <AnalyticsNoData />}
        </div>
      </div>
      {arr('top_countries').length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Top Countries</h4>
          <DonutChart data={arr('top_countries').map((c) => ({ label: String(c.country || ''), value: Number(c.count) || 0 }))} />
        </div>
      )}
    </div>
  );
}

// ─── Referral Program Analytics ───────────────────────────────────────────────

export function ReferralProgramAnalytics({ userId }: { userId?: string }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const uid = userId || user?.id;
        const { data, error } = await supabase.rpc('get_referral_program_analytics', { p_user_id: uid, p_days: 30 });
        if (error) throw error;
        setData(data as Record<string, unknown>);
      } catch { setData(null); }
      finally { setLoading(false); }
    };
    load();
  }, [userId]);

  if (loading) return <AnalyticsLoading />;
  if (!data) return <AnalyticsNoData />;

  const num = (k: string) => Number(data[k]) || 0;
  const arr = (k: string) => (data[k] as Record<string, unknown>[]) || [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <StatBox label="Link Clicks" value={num('referral_link_clicks')} icon={Eye} />
        <StatBox label="Unique Clicks" value={num('unique_clicks')} icon={Users} color="text-purple-500" />
        <StatBox label="Registered" value={num('registered_users')} icon={CheckCircle} color="text-blue-500" />
        <StatBox label="Verified" value={num('verified_users')} icon={CheckCircle} color="text-green-500" />
        <StatBox label="Activated" value={num('activated_users')} icon={Zap} color="text-orange-500" />
        <StatBox label="1st Purchase" value={num('first_purchase')} icon={ShoppingCart} color="text-indigo-500" />
        <StatBox label="2nd Purchase" value={num('second_purchase')} icon={ShoppingCart} color="text-cyan-500" />
        <StatBox label="3rd Purchase" value={num('third_purchase')} icon={ShoppingCart} color="text-teal-500" />
        <StatBox label="Conv. Rate" value={`${num('conversion_rate').toFixed(1)}%`} icon={TrendingUp} color="text-purple-500" />
        <StatBox label="Earnings" value={formatCurrency(num('referral_earnings'))} icon={DollarSign} color="text-green-500" />
        <StatBox label="Pending" value={formatCurrency(num('pending_earnings'))} icon={Clock} color="text-amber-500" />
        <StatBox label="Paid" value={formatCurrency(num('paid_earnings'))} icon={CheckCircle} color="text-emerald-500" />
        <StatBox label="Cancelled" value={num('cancelled_rewards')} icon={XCircle} color="text-red-500" />
        <StatBox label="Fraud Detected" value={num('fraud_detected')} icon={AlertCircle} color="text-red-500" />
        <StatBox label="Quality Score" value={num('referral_quality_score').toFixed(0)} icon={Award} color="text-indigo-500" />
      </div>
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Daily Clicks</h4>
        {arr('daily_clicks').length ? <LineChart data={toChartData(arr('daily_clicks'), 'date', 'count')} color="#8b5cf6" /> : <AnalyticsNoData />}
      </div>
    </div>
  );
}

// ─── Creator Campaign Analytics ──────────────────────────────────────────────

export function CreatorCampaignAnalytics({ campaignId }: { campaignId: string }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.rpc('get_creator_campaign_analytics', { p_campaign_id: campaignId, p_days: 30 });
        if (error) throw error;
        setData(data as Record<string, unknown>);
      } catch { setData(null); }
      finally { setLoading(false); }
    };
    load();
  }, [campaignId]);

  if (loading) return <AnalyticsLoading />;
  if (!data) return <AnalyticsNoData />;

  const num = (k: string) => Number(data[k]) || 0;
  const arr = (k: string) => (data[k] as Record<string, unknown>[]) || [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <StatBox label="Reach" value={num('campaign_reach')} icon={Users} />
        <StatBox label="Impressions" value={num('impressions')} icon={Eye} color="text-purple-500" />
        <StatBox label="Views" value={num('views')} icon={Eye} color="text-blue-500" />
        <StatBox label="Clicks" value={num('clicks')} icon={Target} color="text-indigo-500" />
        <StatBox label="CTR" value={`${num('ctr').toFixed(1)}%`} icon={TrendingUp} color="text-green-500" />
        <StatBox label="Shares" value={num('shares')} icon={Share2} color="text-cyan-500" />
        <StatBox label="Likes" value={num('likes')} icon={Heart} color="text-pink-500" />
        <StatBox label="Comments" value={num('comments')} icon={MessageCircle} color="text-orange-500" />
        <StatBox label="Conversions" value={num('conversions')} icon={CheckCircle} color="text-emerald-500" />
        <StatBox label="Revenue" value={formatCurrency(num('revenue'))} icon={DollarSign} color="text-green-500" />
        <StatBox label="Cost" value={formatCurrency(num('cost'))} icon={DollarSign} color="text-red-500" />
        <StatBox label="ROI" value={`${num('roi').toFixed(0)}%`} icon={TrendingUp} color="text-purple-500" />
        <StatBox label="ROAS" value={num('roas').toFixed(2)} icon={Target} color="text-indigo-500" />
      </div>
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Campaign Timeline</h4>
        {arr('daily_timeline').length ? (
          <LineChart data={arr('daily_timeline').map((d) => ({ label: new Date(d.date as string).toLocaleDateString('en', { month: 'short', day: 'numeric' }), value: Number(d.impressions) || 0 }))} color="#6366f1" />
        ) : <AnalyticsNoData />}
      </div>
    </div>
  );
}

// ─── Affiliate Score Dashboard ────────────────────────────────────────────────

export function AffiliateScoreDashboard({ affiliateId }: { affiliateId: string }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.rpc('get_affiliate_score', { p_affiliate_id: affiliateId, p_days: 30 });
        if (error) throw error;
        setData(data as Record<string, unknown>);
      } catch { setData(null); }
      finally { setLoading(false); }
    };
    load();
  }, [affiliateId]);

  if (loading) return <AnalyticsLoading />;
  if (!data) return <AnalyticsNoData />;

  const num = (k: string) => Number(data[k]) || 0;
  const arr = (k: string) => (data[k] as Record<string, unknown>[]) || [];

  return (
    <div className="space-y-4">
      {/* Score Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl p-4 text-white">
          <Award className="w-6 h-6 mb-2" />
          <p className="text-xs opacity-80">Affiliate Score</p>
          <p className="text-3xl font-bold">{num('affiliate_score').toFixed(0)}</p>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl p-4 text-white">
          <CheckCircle className="w-6 h-6 mb-2" />
          <p className="text-xs opacity-80">Trust Score</p>
          <p className="text-3xl font-bold">{num('trust_score').toFixed(0)}</p>
        </div>
        <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl p-4 text-white">
          <Target className="w-6 h-6 mb-2" />
          <p className="text-xs opacity-80">Conversion Score</p>
          <p className="text-3xl font-bold">{num('conversion_score').toFixed(0)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <StatBox label="Clicks" value={num('clicks')} icon={Eye} />
        <StatBox label="Unique Clicks" value={num('unique_clicks')} icon={Users} color="text-purple-500" />
        <StatBox label="Conversions" value={num('conversions')} icon={CheckCircle} color="text-green-500" />
        <StatBox label="Revenue" value={formatCurrency(num('revenue'))} icon={DollarSign} color="text-green-500" />
        <StatBox label="Commission" value={formatCurrency(num('commission'))} icon={Gift} color="text-amber-500" />
        <StatBox label="Pending" value={formatCurrency(num('pending_commission'))} icon={Clock} color="text-orange-500" />
        <StatBox label="Paid" value={formatCurrency(num('paid_commission'))} icon={CheckCircle} color="text-emerald-500" />
        <StatBox label="CTR" value={`${num('ctr').toFixed(1)}%`} icon={Target} color="text-indigo-500" />
        <StatBox label="Leaderboard" value={data.leaderboard_position ? `#${data.leaderboard_position}` : '—'} icon={Award} color="text-purple-500" />
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Performance Timeline</h4>
        {arr('daily_performance').length ? (
          <BarChart data={arr('daily_performance').map((d) => ({ label: new Date(d.date as string).toLocaleDateString('en', { month: 'short', day: 'numeric' }), value: Number(d.clicks) || 0 }))} color="#f59e0b" />
        ) : <AnalyticsNoData />}
      </div>
    </div>
  );
}

// ─── Analytics Alerts ─────────────────────────────────────────────────────────

export function AnalyticsAlerts({ sellerId }: { sellerId?: string }) {
  const [alerts, setAlerts] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const uid = sellerId || user?.id;
        if (!uid) return;
        const { data, error } = await supabase.rpc('get_analytics_alerts', { p_seller_id: uid, p_days: 7 });
        if (error) throw error;
        setAlerts((data as Record<string, unknown>[])?.filter(Boolean) || []);
      } catch { setAlerts([]); }
      finally { setLoading(false); }
    };
    load();
  }, [sellerId]);

  if (loading) return <AnalyticsLoading message="Loading alerts..." />;
  if (!alerts.length) return null;

  const severityColors: Record<string, string> = {
    positive: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800',
    warning: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800',
    critical: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800',
  };

  return (
    <div className="space-y-2">
      {alerts.map((alert, i) => {
        const severity = String(alert.severity || 'warning');
        return (
          <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border ${severityColors[severity] || severityColors.warning}`}>
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p className="text-sm font-medium">{String(alert.message || '')}</p>
          </div>
        );
      })}
    </div>
  );
}
