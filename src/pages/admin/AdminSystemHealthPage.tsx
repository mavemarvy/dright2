import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { logger } from '../../lib/logger';
import {
  ShieldCheck, Database, Radio, HardDrive, AlertTriangle,
  CheckCircle, XCircle, RefreshCw, Activity, Zap,
} from 'lucide-react';

type Severity = 'critical' | 'warning' | 'info' | 'healthy';

interface HealthCheck {
  label: string;
  status: Severity;
  detail: string;
  recommendation?: string;
}

interface SystemHealth {
  checks: HealthCheck[];
  overallScore: number;
  lastUpdated: string;
}

const SEVERITY_STYLES: Record<Severity, { icon: typeof CheckCircle; color: string; bg: string; label: string }> = {
  critical: { icon: XCircle, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-500/10', label: 'Critical' },
  warning: { icon: AlertTriangle, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10', label: 'Warning' },
  info: { icon: Activity, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/10', label: 'Info' },
  healthy: { icon: CheckCircle, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10', label: 'Healthy' },
};

const TABLES_TO_CHECK = [
  'users', 'products', 'product_views', 'notifications', 'user_follows',
  'social_notifications', 'activity_feed', 'wishlist', 'store_followers',
  'chat_conversations', 'chat_messages', 'profile_views', 'recently_viewed',
  'referral_links', 'referrals',
];

export default function AdminSystemHealthPage() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const runDiagnostics = useCallback(async () => {
    setLoading(true);
    setError(null);
    const checks: HealthCheck[] = [];

    // 1. Database table checks
    for (const table of TABLES_TO_CHECK) {
      try {
        const { error: tblError } = await supabase.from(table).select('id').limit(1);
        if (tblError) {
          checks.push({
            label: `Table: ${table}`,
            status: 'critical',
            detail: `Cannot query table — ${tblError.message}`,
            recommendation: 'Check if the table exists and RLS policies are configured.',
          });
        } else {
          checks.push({ label: `Table: ${table}`, status: 'healthy', detail: 'Accessible with RLS.' });
        }
      } catch {
        checks.push({ label: `Table: ${table}`, status: 'critical', detail: 'Query threw an exception.' });
      }
    }

    // 2. Realtime connectivity
    try {
      const rtChannel = supabase.channel('health-check-rt');
      let rtConnected = false;
      await new Promise<void>((resolve) => {
        rtChannel.subscribe((status: string) => {
          if (status === 'SUBSCRIBED') rtConnected = true;
          resolve();
        });
        setTimeout(() => resolve(), 3000);
      });
      supabase.removeChannel(rtChannel);
      checks.push({
        label: 'Realtime',
        status: rtConnected ? 'healthy' : 'warning',
        detail: rtConnected ? 'WebSocket connection established.' : 'Subscription timed out after 3s.',
        recommendation: rtConnected ? undefined : 'Check Supabase Realtime is enabled for this project.',
      });
    } catch {
      checks.push({ label: 'Realtime', status: 'warning', detail: 'Could not test realtime channel.' });
    }

    // 3. Edge function health (invoke ai-health as a smoke test)
    try {
      const { error: fnError } = await supabase.functions.invoke('ai-health');
      if (fnError) {
        checks.push({
          label: 'Edge Functions',
          status: 'warning',
          detail: `ai-health returned an error — ${fnError.message}`,
          recommendation: 'Check that edge functions are deployed and secrets are set.',
        });
      } else {
        checks.push({ label: 'Edge Functions', status: 'healthy', detail: 'ai-health responded successfully.' });
      }
    } catch {
      checks.push({
        label: 'Edge Functions',
        status: 'warning',
        detail: 'Could not invoke edge function.',
        recommendation: 'Verify functions are deployed.',
      });
    }

    // 4. Storage bucket check
    try {
      const { error: storageError } = await supabase.storage.from('product-images').list('', { limit: 1 });
      if (storageError && !storageError.message.includes('not found')) {
        checks.push({
          label: 'Storage: product-images',
          status: 'warning',
          detail: `Bucket error — ${storageError.message}`,
        });
      } else {
        checks.push({ label: 'Storage: product-images', status: 'healthy', detail: 'Bucket accessible.' });
      }
    } catch {
      checks.push({ label: 'Storage: product-images', status: 'info', detail: 'Could not test storage bucket.' });
    }

    // 5. Auth session check
    const { data: { session } } = await supabase.auth.getSession();
    checks.push({
      label: 'Auth Session',
      status: session ? 'healthy' : 'info',
      detail: session ? 'Active session found.' : 'No active session (expected for admin page if not signed in).',
    });

    // 6. Notification system check
    try {
      const { count, error: notifError } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true });
      if (notifError) {
        checks.push({ label: 'Notifications', status: 'warning', detail: `Query error — ${notifError.message}` });
      } else {
        checks.push({ label: 'Notifications', status: 'healthy', detail: `${count || 0} notifications in system.` });
      }
    } catch {
      checks.push({ label: 'Notifications', status: 'warning', detail: 'Could not query notifications table.' });
    }

    // 7. Social system check
    try {
      const { count } = await supabase
        .from('user_follows')
        .select('*', { count: 'exact', head: true });
      checks.push({ label: 'Social: Follows', status: 'healthy', detail: `${count || 0} follow relationships.` });
    } catch {
      checks.push({ label: 'Social: Follows', status: 'warning', detail: 'Could not query user_follows.' });
    }

    // 8. Chat system check
    try {
      const { count } = await supabase
        .from('chat_conversations')
        .select('*', { count: 'exact', head: true });
      checks.push({ label: 'Chat: Conversations', status: 'healthy', detail: `${count || 0} conversations.` });
    } catch {
      checks.push({ label: 'Chat: Conversations', status: 'warning', detail: 'Could not query chat_conversations.' });
    }

    // 9. Recent error logs
    const recentErrors = logger.getRecentLogs().filter((l) => l.level === 'error' || l.level === 'fatal');
    if (recentErrors.length > 0) {
      checks.push({
        label: 'Recent Errors (log buffer)',
        status: recentErrors.length > 5 ? 'warning' : 'info',
        detail: `${recentErrors.length} error(s) in the in-memory log buffer.`,
        recommendation: 'Review browser console for full error details.',
      });
    } else {
      checks.push({ label: 'Recent Errors (log buffer)', status: 'healthy', detail: 'No errors in log buffer.' });
    }

    // Calculate score
    const criticalCount = checks.filter((c) => c.status === 'critical').length;
    const warningCount = checks.filter((c) => c.status === 'warning').length;
    const score = Math.max(0, 100 - criticalCount * 20 - warningCount * 5);

    const result: SystemHealth = {
      checks,
      overallScore: score,
      lastUpdated: new Date().toISOString(),
    };
    setHealth(result);
    logger.info('admin', 'System health check completed', { score, criticalCount, warningCount });
  }, []);

  useEffect(() => {
    runDiagnostics();
  }, [runDiagnostics]);

  const criticalCount = health?.checks.filter((c) => c.status === 'critical').length ?? 0;
  const warningCount = health?.checks.filter((c) => c.status === 'warning').length ?? 0;
  const healthyCount = health?.checks.filter((c) => c.status === 'healthy').length ?? 0;

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="w-7 h-7 text-primary" />
            System Health
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Real-time diagnostics for database, realtime, storage, edge functions, and core systems.
          </p>
        </div>
        <button
          onClick={runDiagnostics}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 text-white font-medium hover:bg-primary-700 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Re-run
        </button>
      </div>

      {error && (
        <div className="rounded-xl p-4 mb-6 bg-red-500/10 text-red-700 dark:text-red-400 flex items-center gap-3">
          <XCircle className="w-5 h-5" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Score banner */}
      {health && (
        <div className={`rounded-xl p-5 mb-6 flex items-center gap-4 ${
          health.overallScore >= 90 ? 'bg-emerald-500/10' :
          health.overallScore >= 60 ? 'bg-amber-500/10' :
          'bg-red-500/10'
        }`}>
          <div className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold ${
            health.overallScore >= 90 ? 'bg-emerald-500 text-white' :
            health.overallScore >= 60 ? 'bg-amber-500 text-white' :
            'bg-red-500 text-white'
          }`}>
            {health.overallScore}
          </div>
          <div>
            <p className="font-semibold text-lg">
              {health.overallScore >= 90 ? 'System Healthy' : health.overallScore >= 60 ? 'Needs Attention' : 'Critical Issues'}
            </p>
            <p className="text-sm text-gray-500">
              {healthyCount} healthy · {warningCount} warnings · {criticalCount} critical
              {health.lastUpdated && ` · Last checked: ${new Date(health.lastUpdated).toLocaleString()}`}
            </p>
          </div>
        </div>
      )}

      {/* Summary cards */}
      {health && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <SummaryCard icon={Database} label="Database" count={health.checks.filter((c) => c.label.startsWith('Table:')).length} healthy={health.checks.filter((c) => c.label.startsWith('Table:') && c.status === 'healthy').length} />
          <SummaryCard icon={Radio} label="Realtime" count={health.checks.filter((c) => c.label === 'Realtime').length} healthy={health.checks.filter((c) => c.label === 'Realtime' && c.status === 'healthy').length} />
          <SummaryCard icon={Zap} label="Edge Functions" count={health.checks.filter((c) => c.label === 'Edge Functions').length} healthy={health.checks.filter((c) => c.label === 'Edge Functions' && c.status === 'healthy').length} />
          <SummaryCard icon={HardDrive} label="Storage" count={health.checks.filter((c) => c.label.startsWith('Storage')).length} healthy={health.checks.filter((c) => c.label.startsWith('Storage') && c.status === 'healthy').length} />
        </div>
      )}

      {/* Loading state */}
      {loading && !health && (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
            <p className="text-sm text-gray-500">Running diagnostics...</p>
          </div>
        </div>
      )}

      {/* Detailed checks */}
      {health && (
        <div className="space-y-3">
          {health.checks.map((check, idx) => {
            const style = SEVERITY_STYLES[check.status];
            const Icon = style.icon;
            return (
              <div key={idx} className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-start gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${style.bg}`}>
                  <Icon className={`w-5 h-5 ${style.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm">{check.label}</p>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${style.bg} ${style.color}`}>
                      {style.label}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">{check.detail}</p>
                  {check.recommendation && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      {check.recommendation}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ icon: Icon, label, count, healthy }: {
  icon: typeof Database;
  label: string;
  count: number;
  healthy: number;
}) {
  const allHealthy = count > 0 && healthy === count;
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${allHealthy ? 'text-emerald-500' : 'text-amber-500'}`} />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <p className="text-lg font-bold">
        {healthy}/{count}
      </p>
      <p className={`text-xs ${allHealthy ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
        {allHealthy ? 'All healthy' : `${count - healthy} issue(s)`}
      </p>
    </div>
  );
}
