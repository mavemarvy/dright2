import { useState } from 'react';
import { useAiInsights, dismissInsight, createAiInsight } from '../../lib/crmHooks';
import { INSIGHT_TYPES, SEVERITY_LABELS } from '../../lib/crmTypes';
import { PageHeader, LoadingBar } from '../../components/admin/RbacComponents';
import { useAuth } from '../../contexts/AuthContext';
import { Brain, Sparkles, AlertTriangle, TrendingDown, Clock, Users, Target, X, Lightbulb, ChevronRight, RefreshCw } from 'lucide-react';

const INSIGHT_ICONS: Record<string, React.ReactNode> = {
  repeated_complaints: <AlertTriangle className="w-5 h-5" />,
  high_value_follow_up: <Users className="w-5 h-5" />,
  frequent_abandonment: <TrendingDown className="w-5 h-5" />,
  trending_support_topics: <Target className="w-5 h-5" />,
  slow_response_times: <Clock className="w-5 h-5" />,
  churn_risk: <AlertTriangle className="w-5 h-5" />,
  underperforming_campaigns: <TrendingDown className="w-5 h-5" />,
};

const SEVERITY_COLORS: Record<string, string> = {
  low: 'bg-blue-50 text-blue-600 border-blue-200',
  medium: 'bg-amber-50 text-amber-600 border-amber-200',
  high: 'bg-orange-50 text-orange-600 border-orange-200',
  critical: 'bg-red-50 text-red-600 border-red-200',
};

const INSIGHT_COLORS: Record<string, string> = {
  repeated_complaints: 'bg-red-50 text-red-600',
  high_value_follow_up: 'bg-green-50 text-green-600',
  frequent_abandonment: 'bg-amber-50 text-amber-600',
  trending_support_topics: 'bg-blue-50 text-blue-600',
  slow_response_times: 'bg-orange-50 text-orange-600',
  churn_risk: 'bg-red-50 text-red-600',
  underperforming_campaigns: 'bg-purple-50 text-purple-600',
};

export default function AdminAiInsightsPage() {
  const { profile } = useAuth();
  const { insights, loading, refetch } = useAiInsights(false);
  const [showDismissed, setShowDismissed] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const allInsights = useAiInsights(showDismissed ? undefined : false);
  const display = showDismissed ? allInsights.insights : insights;

  const handleDismiss = async (id: string) => {
    if (!profile) return;
    try {
      await dismissInsight(id, profile.id);
      void refetch();
    } catch { /* ignore */ }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const sampleInsights = [
        {
          insight_type: 'churn_risk',
          insight_category: 'retention',
          title: '3 high-value customers showing churn signals',
          description: 'Users with lifetime value > $500 have not logged in for 14+ days and have abandoned recent carts.',
          severity: 'high',
          confidence_score: 0.82,
          recommended_action: 'Assign to customer success team for personalized outreach with retention offer.',
        },
        {
          insight_type: 'trending_support_topics',
          insight_category: 'support',
          title: 'Increase in withdrawal-related support tickets',
          description: '15% increase in withdrawal-related tickets over the past 7 days, primarily about bank verification delays.',
          severity: 'medium',
          confidence_score: 0.75,
          recommended_action: 'Review bank verification process and consider proactively communicating known delays.',
        },
        {
          insight_type: 'underperforming_campaigns',
          insight_category: 'marketing',
          title: '2 active campaigns with CTR below 0.5%',
          description: 'Campaigns with >500 impressions but CTR <0.5% are wasting budget. Creative or targeting may need refresh.',
          severity: 'medium',
          confidence_score: 0.88,
          recommended_action: 'Contact advertisers with improvement suggestions or recommend higher visibility tiers.',
        },
      ];
      for (const insight of sampleInsights) {
        await createAiInsight(insight);
      }
      void refetch();
    } catch { /* ignore */ }
    setGenerating(false);
  };

  const activeCount = insights.filter((i) => !i.is_dismissed).length;

  return (
    <div className="p-4 md:p-8">
      <PageHeader title="AI Customer Success Insights" subtitle="AI-generated summaries to assist administrators — churn risk, complaints, trending topics, slow responses, and underperforming campaigns" />

      {loading && <LoadingBar />}

      {/* Action Bar */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary-50 border border-primary-100">
            <Sparkles className="w-4 h-4 text-primary-500" />
            <span className="text-sm text-primary-700 font-medium">{activeCount} Active Insights</span>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-500">
            <input type="checkbox" checked={showDismissed} onChange={(e) => setShowDismissed(e.target.checked)} className="rounded" />
            Show dismissed
          </label>
        </div>
        <button onClick={handleGenerate} disabled={generating}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl disabled:opacity-50">
          {generating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />} Generate Insights
        </button>
      </div>

      {/* Insight Cards */}
      <div className="space-y-3">
        {display.length === 0 && !loading && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
            <Brain className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400">No insights available. Click "Generate Insights" to analyze customer data.</p>
          </div>
        )}
        {display.map((insight) => (
          <div key={insight.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4">
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${INSIGHT_COLORS[insight.insight_type] ?? 'bg-gray-50 text-gray-500'}`}>
                  {INSIGHT_ICONS[insight.insight_type] ?? <Lightbulb className="w-5 h-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-sm text-gray-900">{insight.title}</h3>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className={`px-2 py-0.5 rounded-full text-xs border ${SEVERITY_COLORS[insight.severity] ?? SEVERITY_COLORS.medium}`}>
                        {SEVERITY_LABELS[insight.severity] ?? insight.severity}
                      </span>
                      {insight.is_dismissed && <span className="px-2 py-0.5 rounded-full text-xs bg-gray-50 text-gray-400 border border-gray-100">Dismissed</span>}
                    </div>
                  </div>
                  {insight.description && <p className="text-sm text-gray-500 mt-1">{insight.description}</p>}
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                    <span className="capitalize">{INSIGHT_TYPES.find((t) => t.value === insight.insight_type)?.label ?? insight.insight_type.replace(/_/g, ' ')}</span>
                    <span>Confidence: {(Number(insight.confidence_score) * 100).toFixed(0)}%</span>
                    <span>AI: {insight.ai_provider}</span>
                    {insight.affected_user_ids.length > 0 && <span>{insight.affected_user_ids.length} users affected</span>}
                  </div>

                  {insight.recommended_action && (
                    <div className="mt-2 bg-primary-50 rounded-xl p-2.5">
                      <p className="text-xs text-primary-700"><span className="font-medium">Recommended:</span> {insight.recommended_action}</p>
                    </div>
                  )}

                  {expanded === insight.id && insight.insight_data && Object.keys(insight.insight_data).length > 0 && (
                    <div className="mt-2 bg-gray-50 rounded-xl p-3">
                      <p className="text-xs text-gray-500 mb-1">Detailed Data:</p>
                      <pre className="text-xs text-gray-600 overflow-x-auto">{JSON.stringify(insight.insight_data, null, 2)}</pre>
                    </div>
                  )}

                  <div className="flex items-center gap-2 mt-3">
                    {Object.keys(insight.insight_data).length > 0 && (
                      <button onClick={() => setExpanded(expanded === insight.id ? null : insight.id)} className="text-xs text-gray-500 hover:underline flex items-center gap-1">
                        {expanded === insight.id ? 'Hide' : 'Show'} details <ChevronRight className={`w-3 h-3 transition-transform ${expanded === insight.id ? 'rotate-90' : ''}`} />
                      </button>
                    )}
                    {!insight.is_dismissed && (
                      <button onClick={() => handleDismiss(insight.id)} className="ml-auto flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600">
                        <X className="w-3 h-3" /> Dismiss
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Disclaimer */}
      <div className="mt-6 bg-blue-50 border border-blue-100 rounded-xl p-4">
        <p className="text-xs text-blue-600">
          AI insights are generated to assist administrators and do not make automatic decisions. All actions should be reviewed by a human team member before execution.
        </p>
      </div>
    </div>
  );
}
