import { useState } from 'react';
import {
  FileText, Download, Trash2, Plus, Mail, Clock, Loader2,
  Calendar, CheckCircle, XCircle,
} from 'lucide-react';
import {
  useAnalyticsReports, createReport, deleteReport,
  useAnalyticsExports, exportToCSV, recordExport,
} from '../../lib/analyticsPlatformHooks';
import { useAdminAnalyticsV2 } from '../../lib/analyticsHooksV2';
import type { ReportCategory, ReportFormat, ScheduleFrequency } from '../../lib/analyticsPlatformTypes';

const CATEGORIES: ReportCategory[] = ['marketplace', 'revenue', 'crm', 'promotions', 'affiliate', 'verification', 'moderation', 'finance', 'support', 'custom'];
const FORMATS: ReportFormat[] = ['csv', 'pdf', 'xlsx'];
const FREQUENCIES: ScheduleFrequency[] = ['once', 'daily', 'weekly', 'monthly', 'quarterly'];

export default function AdminReportsCenterPage() {
  const { reports, loading, error } = useAnalyticsReports();
  const { exports } = useAnalyticsExports(20);
  const { data: analyticsData } = useAdminAnalyticsV2(30);
  const [showCreate, setShowCreate] = useState(false);
  const [generatingExport, setGeneratingExport] = useState<string | null>(null);

  // New report form state
  const [name, setName] = useState('');
  const [category, setCategory] = useState<ReportCategory>('marketplace');
  const [format, setFormat] = useState<ReportFormat>('csv');
  const [frequency, setFrequency] = useState<ScheduleFrequency>('once');
  const [emailRecipients, setEmailRecipients] = useState('');
  const [description, setDescription] = useState('');

  const handleCreate = async () => {
    if (!name.trim()) return;
    try {
      await createReport({
        name,
        description: description || undefined,
        category,
        format,
        schedule_frequency: frequency,
        email_recipients: emailRecipients ? emailRecipients.split(',').map(e => e.trim()) : [],
      });
      setShowCreate(false);
      setName(''); setDescription(''); setEmailRecipients('');
      window.location.reload();
    } catch { /* ignore */ }
  };

  const handleDelete = async (id: string) => {
    try { await deleteReport(id); window.location.reload(); } catch { /* ignore */ }
  };

  const handleRunReport = async (reportId: string, reportCategory: string, reportFormat: ReportFormat) => {
    setGeneratingExport(reportId);
    try {
      const a = (analyticsData || {}) as Record<string, any>;
      const rows: Array<Record<string, string | number | null>> = [];
      const headers: string[] = [];

      switch (reportCategory) {
        case 'marketplace':
          headers.push('Metric', 'Value');
          Object.entries(a).filter(([k]) => ['total_users','total_sellers','total_buyers','total_products','total_views','total_sales'].includes(k)).forEach(([k, v]) => {
            rows.push({ Metric: k, Value: String(v || 0) });
          });
          break;
        case 'revenue':
          headers.push('Metric', 'Value');
          ['revenue_today','revenue_week','revenue_month','revenue_year','gross_revenue','net_revenue'].forEach(k => {
            rows.push({ Metric: k, Value: String(a[k] || 0) });
          });
          break;
        case 'finance':
          headers.push('Metric', 'Value');
          ['total_deposits','total_withdrawals','pending_withdrawals','failed_payments','refunds','wallet_balances'].forEach(k => {
            rows.push({ Metric: k, Value: String(a[k] || 0) });
          });
          break;
        case 'support':
          headers.push('Metric', 'Value');
          ['open_tickets','resolved_tickets','avg_response_time','escalated_tickets'].forEach(k => {
            rows.push({ Metric: k, Value: String(a[k] || 0) });
          });
          break;
        default:
          headers.push('Metric', 'Value');
          Object.entries(a).slice(0, 30).forEach(([k, v]) => {
            rows.push({ Metric: k, Value: String(v || 0) });
          });
      }

      if (reportFormat === 'csv') {
        exportToCSV(`${reportCategory}-report-${Date.now()}`, headers, rows);
        await recordExport({ export_type: 'csv', data_category: reportCategory, row_count: rows.length, report_id: reportId });
      }
      window.location.reload();
    } catch { /* ignore */ } finally {
      setGeneratingExport(null);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Reports Center</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Generate, schedule, and export reports</p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> New Report
        </button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Create New Report</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Report Name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Monthly Revenue Report"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Description</label>
              <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Category</label>
              <select value={category} onChange={e => setCategory(e.target.value as ReportCategory)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white">
                {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Format</label>
              <select value={format} onChange={e => setFormat(e.target.value as ReportFormat)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white">
                {FORMATS.map(f => <option key={f} value={f}>{f.toUpperCase()}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Schedule</label>
              <select value={frequency} onChange={e => setFrequency(e.target.value as ScheduleFrequency)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white">
                {FREQUENCIES.map(f => <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Email Recipients (comma-separated)</label>
              <input value={emailRecipients} onChange={e => setEmailRecipients(e.target.value)} placeholder="admin@dright.com, ops@dright.com"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white" />
            </div>
          </div>
          <div className="flex items-center gap-3 mt-4">
            <button onClick={handleCreate} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700">Create Report</button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-300">Cancel</button>
          </div>
        </div>
      )}

      {/* Reports List */}
      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 text-indigo-500 animate-spin" /></div>
      ) : error ? (
        <p className="text-sm text-red-500 text-center py-8">{error}</p>
      ) : reports.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-400">No reports configured yet. Click "New Report" to create one.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {reports.map(report => (
            <div key={report.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-gray-900 dark:text-white truncate">{report.name}</h3>
                  <p className="text-xs text-gray-400 mt-0.5">{report.category} · {report.format.toUpperCase()}</p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  report.schedule_frequency === 'once' ? 'bg-gray-100 dark:bg-gray-800 text-gray-500' :
                  'bg-green-100 dark:bg-green-900/30 text-green-600'
                }`}>
                  {report.schedule_frequency}
                </span>
              </div>
              {report.description && <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{report.description}</p>}
              <div className="space-y-1.5 mb-4">
                {report.last_run_at && (
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <Clock className="w-3 h-3" /> Last run: {new Date(report.last_run_at).toLocaleDateString()}
                    {report.last_run_status === 'success' ? <CheckCircle className="w-3 h-3 text-green-500" /> : report.last_run_status === 'failed' ? <XCircle className="w-3 h-3 text-red-500" /> : null}
                  </div>
                )}
                {report.email_recipients.length > 0 && (
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <Mail className="w-3 h-3" /> {report.email_recipients.length} recipient(s)
                  </div>
                )}
                {report.next_run_at && (
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <Calendar className="w-3 h-3" /> Next: {new Date(report.next_run_at).toLocaleDateString()}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleRunReport(report.id, report.category, report.format)}
                  disabled={generatingExport === report.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {generatingExport === report.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                  Run & Export
                </button>
                <button
                  onClick={() => handleDelete(report.id)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recent Exports */}
      {exports.length > 0 && (
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-white mb-3">Recent Exports</h2>
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Category</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Format</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Rows</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Date</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Downloads</th>
                </tr>
              </thead>
              <tbody>
                {exports.slice(0, 10).map(exp => (
                  <tr key={exp.id} className="border-t border-gray-100 dark:border-gray-800">
                    <td className="px-4 py-3 text-gray-900 dark:text-white">{exp.data_category}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{exp.export_type.toUpperCase()}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{exp.row_count || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{new Date(exp.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{exp.download_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
