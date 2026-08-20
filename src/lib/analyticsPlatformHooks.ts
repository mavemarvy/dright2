// Enterprise Analytics Platform Hooks
// Data access layer for BI dashboards, reports, AI summaries, exports, KPIs

import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';
import type {
  AnalyticsDashboard,
  AnalyticsReport,
  AIBusinessReport,
  AIRecommendation,
  AnalyticsExport,
  AnalyticsKPI,
  KPIWithValue,
  AnalyticsSession,
  ReportCategory,
  ReportFormat,
  ScheduleFrequency,
  RecommendationStatus,
} from './analyticsPlatformTypes';

// ─── Dashboards ──────────────────────────────────────────────────────────────

export function useAnalyticsDashboards() {
  const [dashboards, setDashboards] = useState<AnalyticsDashboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('analytics_dashboards')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (!active) return;
      if (err) setError(err.message);
      else setDashboards((data as AnalyticsDashboard[]) || []);
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  return { dashboards, loading, error };
}

export async function createDashboard(input: {
  name: string;
  description?: string;
  category?: string;
  widget_config?: unknown[];
  is_shared?: boolean;
}) {
  const { data, error } = await supabase
    .from('analytics_dashboards')
    .insert({
      name: input.name,
      description: input.description || null,
      category: input.category || 'custom',
      widget_config: JSON.stringify(input.widget_config || []),
      is_shared: input.is_shared ?? false,
    })
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as AnalyticsDashboard;
}

export async function updateDashboard(id: string, updates: Partial<AnalyticsDashboard>) {
  const { data, error } = await supabase
    .from('analytics_dashboards')
    .update(updates)
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as AnalyticsDashboard;
}

export async function deleteDashboard(id: string) {
  const { error } = await supabase
    .from('analytics_dashboards')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// ─── Reports ──────────────────────────────────────────────────────────────────

export function useAnalyticsReports() {
  const [reports, setReports] = useState<AnalyticsReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('analytics_reports')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (!active) return;
      if (err) setError(err.message);
      else setReports((data as AnalyticsReport[]) || []);
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  return { reports, loading, error };
}

export async function createReport(input: {
  name: string;
  description?: string;
  category: ReportCategory;
  format: ReportFormat;
  schedule_frequency: ScheduleFrequency;
  email_recipients?: string[];
  filters?: Record<string, unknown>;
  date_range?: Record<string, string>;
}) {
  const { data, error } = await supabase
    .from('analytics_reports')
    .insert({
      name: input.name,
      description: input.description || null,
      category: input.category,
      format: input.format,
      schedule_frequency: input.schedule_frequency,
      email_recipients: JSON.stringify(input.email_recipients || []),
      filters: JSON.stringify(input.filters || {}),
      date_range: JSON.stringify(input.date_range || {}),
    })
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as AnalyticsReport;
}

export async function updateReport(id: string, updates: Partial<AnalyticsReport>) {
  const { data, error } = await supabase
    .from('analytics_reports')
    .update(updates)
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as AnalyticsReport;
}

export async function deleteReport(id: string) {
  const { error } = await supabase
    .from('analytics_reports')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// ─── AI Business Reports ─────────────────────────────────────────────────────

export function useAIBusinessReports(limit = 20) {
  const [reports, setReports] = useState<AIBusinessReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('ai_business_reports')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (!active) return;
      if (err) setError(err.message);
      else setReports((data as AIBusinessReport[]) || []);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [limit]);

  return { reports, loading, error };
}

export async function saveAIBusinessReport(input: {
  title: string;
  summary: string;
  detailed_analysis?: string;
  key_findings?: Array<{ finding: string; metric?: string; change?: string }>;
  metrics_snapshot?: Record<string, number | string>;
  period_start: string;
  period_end: string;
  ai_provider: string;
  ai_model?: string;
  prompt_used?: string;
  tokens_used?: number;
}) {
  const { data, error } = await supabase
    .from('ai_business_reports')
    .insert({
      title: input.title,
      summary: input.summary,
      detailed_analysis: input.detailed_analysis || null,
      key_findings: JSON.stringify(input.key_findings || []),
      metrics_snapshot: JSON.stringify(input.metrics_snapshot || {}),
      period_start: input.period_start,
      period_end: input.period_end,
      ai_provider: input.ai_provider,
      ai_model: input.ai_model || null,
      prompt_used: input.prompt_used || null,
      tokens_used: input.tokens_used || null,
    })
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as AIBusinessReport;
}

export async function deleteAIBusinessReport(id: string) {
  const { error } = await supabase
    .from('ai_business_reports')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// ─── AI Recommendations ──────────────────────────────────────────────────────

export function useAIRecommendations(status?: RecommendationStatus) {
  const [recommendations, setRecommendations] = useState<AIRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      let query = supabase
        .from('ai_recommendations')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(50);
      if (status) query = query.eq('status', status);
      const { data, error: err } = await query;
      if (!active) return;
      if (err) setError(err.message);
      else setRecommendations((data as AIRecommendation[]) || []);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [status]);

  return { recommendations, loading, error };
}

export async function actOnRecommendation(id: string, notes?: string) {
  const { error } = await supabase
    .from('ai_recommendations')
    .update({
      status: 'acted_on',
      acted_on_at: new Date().toISOString(),
      action_notes: notes || null,
    })
    .eq('id', id);
  if (error) throw error;
}

export async function dismissRecommendation(id: string) {
  const { error } = await supabase
    .from('ai_recommendations')
    .update({
      status: 'dismissed',
      dismissed_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw error;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export function useAnalyticsExports(limit = 50) {
  const [exports, setExports] = useState<AnalyticsExport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('analytics_exports')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (!active) return;
      if (err) setError(err.message);
      else setExports((data as AnalyticsExport[]) || []);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [limit]);

  return { exports, loading, error };
}

export async function recordExport(input: {
  export_type: ReportFormat;
  data_category: string;
  file_url?: string;
  file_size_bytes?: number;
  row_count?: number;
  report_id?: string;
}) {
  const { data, error } = await supabase
    .from('analytics_exports')
    .insert({
      export_type: input.export_type,
      data_category: input.data_category,
      file_url: input.file_url || null,
      file_size_bytes: input.file_size_bytes || null,
      row_count: input.row_count || null,
      report_id: input.report_id || null,
    })
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as AnalyticsExport;
}

// ─── KPIs ──────────────────────────────────────────────────────────────────────

export function useAnalyticsKPIs() {
  const [kpis, setKpis] = useState<AnalyticsKPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('analytics_kpis')
        .select('*')
        .is('deleted_at', null)
        .eq('is_visible', true)
        .order('sort_order', { ascending: true });
      if (!active) return;
      if (err) setError(err.message);
      else setKpis((data as AnalyticsKPI[]) || []);
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  return { kpis, loading, error };
}

export function computeKPIStatus(
  kpi: AnalyticsKPI,
  currentValue: number
): KPIWithValue {
  let status_level: KPIWithValue['status_level'] = 'unknown';

  if (kpi.comparison_operator === 'greater_than') {
    if (kpi.target_value && currentValue >= kpi.target_value) status_level = 'healthy';
    else if (kpi.warning_threshold && currentValue >= kpi.warning_threshold) status_level = 'warning';
    else status_level = 'critical';
  } else {
    if (kpi.target_value !== null && currentValue <= (kpi.target_value || 0)) status_level = 'healthy';
    else if (kpi.warning_threshold !== null && currentValue <= (kpi.warning_threshold || Infinity)) status_level = 'warning';
    else status_level = 'critical';
  }

  return { ...kpi, current_value: currentValue, status_level };
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

export function useAnalyticsSessions(limit = 50) {
  const [sessions, setSessions] = useState<AnalyticsSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('analytics_sessions')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(limit);
      if (!active) return;
      if (err) setError(err.message);
      else setSessions((data as AnalyticsSession[]) || []);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [limit]);

  return { sessions, loading, error };
}

// ─── CSV Export Utility ────────────────────────────────────────────────────────

export function exportToCSV(
  filename: string,
  headers: string[],
  rows: Array<Record<string, string | number | null>>
): void {
  const csvContent = [
    headers.join(','),
    ...rows.map((row) =>
      headers
        .map((h) => {
          const val = row[h];
          if (val === null || val === undefined) return '';
          const str = String(val);
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(',')
    ),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ─── Executive KPI Fetcher ──────────────────────────────────────────────────────

export function useExecutiveKPIs(days = 30) {
  const [data, setData] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: result, error: err } = await supabase
        .rpc('get_admin_analytics_v2', { p_days: days });
      if (err) throw err;
      setData((result as Record<string, number>) || {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load KPIs');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

// ─── AI Report Generation ────────────────────────────────────────────────────

export async function generateAISummary(
  metrics: Record<string, number | string>,
  period: string,
  provider: string = 'openai'
): Promise<{ summary: string; findings: Array<{ finding: string; metric?: string; change?: string }> }> {
  const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-proxy`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
  };

  const prompt = `You are a business intelligence analyst for DRIGHT, a digital marketplace platform.
Analyze the following metrics for the period: ${period}.

Metrics:
${Object.entries(metrics)
  .map(([key, value]) => `- ${key}: ${value}`)
  .join('\n')}

Provide:
1. A concise executive summary (2-3 sentences) highlighting key trends and notable changes.
2. 3-5 key findings as bullet points, each with a metric reference and direction of change.

Format your response as JSON: {"summary": "...", "findings": [{"finding": "...", "metric": "...", "change": "up/down/flat"}]}`;

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      provider,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 800,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    throw new Error(`AI generation failed (${response.status})`);
  }

  const result = await response.json();
  const content = result.content || result.choices?.[0]?.message?.content || '';

  try {
    const parsed = JSON.parse(content);
    return {
      summary: parsed.summary || content,
      findings: parsed.findings || [],
    };
  } catch {
    return { summary: content, findings: [] };
  }
}
