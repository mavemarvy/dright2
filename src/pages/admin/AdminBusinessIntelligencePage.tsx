import { useState } from 'react';
import {
  Brain, Loader2, Sparkles, Trash2, FileText,
  TrendingUp, TrendingDown, AlertTriangle, Lightbulb, CheckCircle, XCircle,
} from 'lucide-react';
import {
  useAIBusinessReports, saveAIBusinessReport, deleteAIBusinessReport,
  useAIRecommendations, actOnRecommendation, dismissRecommendation,
  generateAISummary, useExecutiveKPIs,
} from '../../lib/analyticsPlatformHooks';

export default function AdminBusinessIntelligencePage() {
  const { reports, loading, error } = useAIBusinessReports(20);
  const { recommendations, loading: recsLoading } = useAIRecommendations();
  const { data: execData } = useExecutiveKPIs(30);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [provider, setProvider] = useState('openai');

  const handleGenerate = async () => {
    setGenerating(true);
    setGenError(null);
    try {
      const metrics: Record<string, number | string> = {};
      if (execData) {
        Object.entries(execData).forEach(([k, v]) => {
          if (typeof v === 'number' && v !== 0) metrics[k] = v;
        });
      }
      const result = await generateAISummary(metrics, 'last 30 days', provider);
      await saveAIBusinessReport({
        title: `Executive Summary - ${new Date().toLocaleDateString()}`,
        summary: result.summary,
        key_findings: result.findings,
        metrics_snapshot: metrics,
        period_start: new Date(Date.now() - 30 * 86400000).toISOString(),
        period_end: new Date().toISOString(),
        ai_provider: provider,
      });
      window.location.reload();
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Failed to generate report');
    } finally {
      setGenerating(false);
    }
  };

  const handleActOn = async (id: string) => {
    try {
      await actOnRecommendation(id);
      window.location.reload();
    } catch { /* ignore */ }
  };

  const handleDismiss = async (id: string) => {
    try {
      await dismissRecommendation(id);
      window.location.reload();
    } catch { /* ignore */ }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteAIBusinessReport(id);
      window.location.reload();
    } catch { /* ignore */ }
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
          <Brain className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">AI Business Intelligence</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">AI-generated executive summaries and recommendations</p>
        </div>
      </div>

      {/* Generate New Report */}
      <div className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-2xl border border-purple-200 dark:border-purple-800 p-6 mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-5 h-5 text-purple-500" />
          <h2 className="font-semibold text-gray-900 dark:text-white">Generate Executive Summary</h2>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Uses the current 30-day analytics data and your configured AI provider to generate a natural-language executive summary with key findings and recommendations.
        </p>
        <div className="flex items-center gap-3">
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
          >
            <option value="openai">OpenAI</option>
            <option value="grok">Grok (xAI)</option>
            <option value="gemini">Gemini (Google)</option>
            <option value="openrouter">OpenRouter</option>
          </select>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {generating ? 'Generating...' : 'Generate Summary'}
          </button>
        </div>
        {genError && (
          <div className="mt-3 flex items-center gap-2 text-sm text-red-500">
            <AlertTriangle className="w-4 h-4" /> {genError}
          </div>
        )}
      </div>

      {/* AI Recommendations */}
      <div className="mb-8">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-amber-500" />
          AI Recommendations
          {recommendations.filter(r => r.status === 'pending').length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 text-xs font-medium">
              {recommendations.filter(r => r.status === 'pending').length} pending
            </span>
          )}
        </h2>
        {recsLoading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 text-purple-500 animate-spin" /></div>
        ) : recommendations.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No recommendations yet. Generate a summary to get AI-powered recommendations.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {recommendations.filter(r => r.status === 'pending').slice(0, 6).map(rec => {
              const priorityColors: Record<string, string> = {
                critical: 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/10',
                high: 'border-orange-300 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/10',
                medium: 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10',
                low: 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900',
              };
              return (
                <div key={rec.id} className={`rounded-xl border-2 ${priorityColors[rec.priority] || priorityColors.medium} p-4`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-medium text-gray-900 dark:text-white text-sm">{rec.title}</h3>
                    <span className="text-xs font-medium uppercase text-gray-500 shrink-0">{rec.priority}</span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">{rec.description}</p>
                  {rec.expected_impact && (
                    <p className="text-xs text-green-600 dark:text-green-400 mb-3">Expected impact: {rec.expected_impact}</p>
                  )}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleActOn(rec.id)}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-green-700 transition-colors"
                    >
                      <CheckCircle className="w-3 h-3" /> Act On
                    </button>
                    <button
                      onClick={() => handleDismiss(rec.id)}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                    >
                      <XCircle className="w-3 h-3" /> Dismiss
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Generated Reports */}
      <div>
        <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Generated Executive Summaries</h2>
        {loading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 text-purple-500 animate-spin" /></div>
        ) : error ? (
          <p className="text-sm text-red-500 text-center py-8">{error}</p>
        ) : reports.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-400">No reports generated yet. Click "Generate Summary" above to create your first AI executive summary.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {reports.map(report => (
              <div key={report.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">{report.title}</h3>
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(report.period_start).toLocaleDateString()} - {new Date(report.period_end).toLocaleDateString()} ·
                      Provider: {report.ai_provider} · {new Date(report.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 text-xs font-medium">
                      {report.ai_provider}
                    </span>
                    <button
                      onClick={() => handleDelete(report.id)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">{report.summary}</p>
                {Array.isArray(report.key_findings) && report.key_findings.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase">Key Findings</p>
                    {report.key_findings.map((finding, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        {finding.change === 'up' ? (
                          <TrendingUp className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                        ) : finding.change === 'down' ? (
                          <TrendingDown className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                        ) : (
                          <div className="w-2 h-2 rounded-full bg-gray-400 mt-1.5 shrink-0" />
                        )}
                        <span className="text-gray-600 dark:text-gray-400">{finding.finding}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
