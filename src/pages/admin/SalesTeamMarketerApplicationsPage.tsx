import { useCallback, useEffect, useState } from 'react';
import { Bot, CheckCircle, ExternalLink, Microscope, RefreshCw, ScanSearch, Search, ShieldAlert, XCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

type Analysis = { profile_url: string; final_url?: string; platform: string; status: string; profile_title?: string | null; profile_description?: string | null; followers?: number | null; following?: number | null; likes?: number | null; content_count?: number | null; verified_indicator?: boolean; authenticity_score?: number | null; risk_level?: string; confidence_score?: number | null; signals?: string[]; error?: string };
type Source = { title: string; link: string; snippet: string; source: string; query: string };
type DeepResearch = { profile_url: string; platform: string; status: string; provider?: string; model?: string | null; research: any; search_evidence?: Source[]; search_queries?: string[]; requested_at: string };
type Application = { id: string; email: string; full_name: string | null; username: string | null; avatar_url: string | null; created_at: string; joined_at: string | null; location: string | null; profession: string | null; marketer_level: number; marketer_status: string; social_media_links: unknown; marketer_social_analysis: Analysis[]; marketer_deep_research?: DeepResearch[]; verification_status: string | null; is_verified: boolean; last_active_at: string | null };
type Review = { id: string; applicant_id: string; reviewer_id: string; decision: string; note: string | null; social_links_snapshot: unknown; created_at: string };

const linksOf = (value: unknown): string[] => Array.isArray(value) ? value.map(String).filter(Boolean) : [];
const count = (n: number | null | undefined) => n == null ? 'UNKNOWN' : n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : n.toLocaleString();
const errorFrom = (error: unknown, data: any, fallback: string) => { if (data?.error) { if (typeof data.error === 'string') return new Error(data.error); return new Error(`${data.error.code ? `${data.error.code}: ` : ''}${data.error.message || fallback}`); } return error instanceof Error ? error : new Error(fallback); };
const reviewCall = async (method: 'GET' | 'POST', body?: Record<string, unknown>) => { const { data, error } = await supabase.functions.invoke('sales-team-review', { method, body }); if (error || data?.error) throw errorFrom(error, data, 'Sales Team request failed'); return data; };
const analyzerCall = async (id: string) => { const { data, error } = await supabase.functions.invoke('social-profile-analyzer', { method: 'POST', body: { applicant_id: id } }); if (error || data?.error) throw errorFrom(error, data, 'Automatic profile analysis failed'); return data; };
const deepResearchCall = async (id: string) => { const { data, error } = await supabase.functions.invoke('marketer-profile-deep-research', { method: 'POST', body: { applicant_id: id } }); if (error || data?.error) throw errorFrom(error, data, 'Deep Research failed'); return data; };

export default function SalesTeamMarketerApplicationsPage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [history, setHistory] = useState<Review[]>([]);
  const [selected, setSelected] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [researchBusy, setResearchBusy] = useState(false);
  const [researchStage, setResearchStage] = useState('');
  const [query, setQuery] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await reviewCall('GET');
      const pending = data.pendingApplications || [];
      setApps(pending);
      setHistory(data.reviewHistory || []);
      setSelected(current => current ? pending.find((a: Application) => a.id === current.id) || null : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load marketer applications');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const reanalyze = async () => {
    if (!selected) return;
    setAnalysisBusy(true);
    setError('');
    try { await analyzerCall(selected.id); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Automatic profile analysis failed'); }
    finally { setAnalysisBusy(false); }
  };

  const deepResearch = async () => {
    if (!selected) return;
    setResearchBusy(true);
    setResearchStage('Searching public sources…');
    setError('');
    try {
      const request = deepResearchCall(selected.id);
      const timer = window.setTimeout(() => setResearchStage('Analyzing evidence with DRIGHT AI…'), 1200);
      const data = await request;
      window.clearTimeout(timer);
      if (!data?.success) {
        const item = data?.errors?.find((x: any) => x?.stage === 'ai' || x?.stage === 'search' || x?.stage === 'database');
        throw new Error(item?.error?.message ? `${item.error.code}: ${item.error.message}` : 'Deep Research did not complete.');
      }
      setResearchStage('Deep Research completed.');
      await load();
    } catch (e) {
      setResearchStage('');
      setError(e instanceof Error ? e.message : 'Deep Research failed');
    } finally { setResearchBusy(false); }
  };

  const review = async (decision: 'approved' | 'rejected' | 'needs_changes') => {
    if (!selected) return;
    setBusy(decision);
    setError('');
    try {
      await reviewCall('POST', { action: 'review_marketer_application', applicant_id: selected.id, decision, note });
      setNote('');
      setSelected(null);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Review failed'); }
    finally { setBusy(''); }
  };

  const filtered = apps.filter(a => {
    const q = query.trim().toLowerCase();
    return !q || [a.full_name, a.email, a.username, a.profession, a.location].filter(Boolean).some(v => String(v).toLowerCase().includes(q));
  });

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div><h1 className="text-2xl font-bold text-gray-900">Marketer Applications</h1><p className="text-sm text-gray-500">Review users who submitted social or professional profile links to join the Marketer program.</p></div>
        <button onClick={load} disabled={loading} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 text-sm disabled:opacity-50"><RefreshCw className="w-4 h-4" />Refresh</button>
      </div>
      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="grid lg:grid-cols-[380px_1fr] gap-5">
        <section className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-gray-100"><div className="flex items-center justify-between mb-3"><h2 className="font-bold">Pending review <span className="text-xs font-semibold px-2 py-1 rounded-full bg-amber-50 text-amber-700">{apps.length}</span></h2></div><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" /><input className="input pl-9" placeholder="Search applicant" value={query} onChange={e => setQuery(e.target.value)} /></div></div>
          <div className="max-h-[650px] overflow-y-auto">
            {loading ? <div className="p-8 text-center text-gray-400">Loading…</div> : filtered.length === 0 ? <div className="p-10 text-center text-gray-400">No pending marketer applications.</div> : filtered.map(a => (
              <button key={a.id} onClick={() => { setSelected(a); setNote(''); setError(''); }} className={`w-full text-left p-4 border-b border-gray-100 hover:bg-gray-50 ${selected?.id === a.id ? 'bg-gray-50 border-l-4 border-l-gray-900' : ''}`}>
                <div className="font-semibold">{a.full_name || a.username || a.email}</div><div className="text-xs text-gray-500 mt-1">{a.email}</div><div className="text-xs text-gray-400 mt-2">Submitted {new Date(a.created_at).toLocaleString()}</div>
                <div className="mt-2 flex flex-wrap gap-1">{linksOf(a.social_media_links).map((link, i) => <span key={i} className="text-[11px] px-2 py-1 rounded-full bg-gray-100">{hostname(link)}</span>)}</div>
              </button>
            ))}
          </div>
        </section>

        <section className="bg-white border border-gray-100 rounded-2xl p-5">
          {!selected ? <div className="min-h-[500px] flex flex-col items-center justify-center text-center text-gray-400"><ShieldAlert className="w-10 h-10 mb-3" /><h2 className="font-semibold text-gray-600">Select an application</h2><p className="text-sm max-w-md mt-1">Choose a pending applicant to inspect submitted profiles and run evidence-based research.</p></div> : (
            <div>
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 border-b border-gray-100 pb-5"><div><h2 className="text-xl font-bold">{selected.full_name || selected.username || 'Applicant'}</h2><p className="text-sm text-gray-500">{selected.email}</p><div className="flex flex-wrap gap-2 mt-3"><span className="text-xs px-2.5 py-1 rounded-full bg-amber-50 text-amber-700">Pending review</span><span className="text-xs px-2.5 py-1 rounded-full bg-gray-100">Marketer {selected.marketer_level}</span></div></div><div className="text-xs text-gray-400">Account created {new Date(selected.created_at).toLocaleDateString()}</div></div>
              <div className="grid sm:grid-cols-2 gap-3 py-5">{selected.profession && <Info label="Profession" value={selected.profession} />}{selected.location && <Info label="Location" value={selected.location} />}{selected.verification_status && <Info label="Verification status" value={selected.verification_status} />}{selected.last_active_at && <Info label="Last active" value={new Date(selected.last_active_at).toLocaleString()} />}</div>

              <div className="mb-6 rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4"><div><div className="flex items-center gap-2"><ScanSearch className="w-5 h-5" /><h3 className="font-bold">Automatic profile analysis</h3></div><p className="text-xs text-gray-500 mt-1">Missing platform metrics remain UNKNOWN and are never treated as zero.</p></div><div className="flex flex-wrap gap-2"><button onClick={reanalyze} disabled={analysisBusy || researchBusy} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-gray-200 text-sm font-semibold disabled:opacity-50"><RefreshCw className={`w-4 h-4 ${analysisBusy ? 'animate-spin' : ''}`} />{analysisBusy ? 'Analyzing…' : 'Re-analyze'}</button><button onClick={deepResearch} disabled={analysisBusy || researchBusy} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-900 text-white text-sm font-semibold disabled:opacity-50"><Microscope className="w-4 h-4" />{researchBusy ? researchStage || 'Researching…' : 'Deep Research with AI'}</button></div></div>
                <div className="space-y-3">{selected.marketer_social_analysis?.length ? selected.marketer_social_analysis.map((a, i) => <AnalysisCard key={`${a.profile_url}-${i}`} analysis={a} />) : <div className="text-sm text-gray-500">Analysis is pending or the platform did not expose public data.</div>}</div>
              </div>

              {selected.marketer_deep_research?.length ? <div className="mb-6 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4"><div className="flex items-center gap-2 mb-4"><Microscope className="w-5 h-5" /><div><h3 className="font-bold">DEEP RESEARCH REPORT</h3><p className="text-xs text-gray-500">Historical runs are preserved. AI assessments are estimates, not proof.</p></div></div><div className="space-y-4">{selected.marketer_deep_research.slice(0, 10).map((r, i) => <DeepResearchCard key={`${r.profile_url}-${i}-${r.requested_at}`} report={r} />)}</div></div> : null}

              <div><h3 className="font-bold mb-3">Submitted profiles</h3><div className="space-y-3">{linksOf(selected.social_media_links).map((link, i) => <div key={`${link}-${i}`} className="flex items-center justify-between gap-3 border border-gray-100 rounded-xl p-3"><div className="min-w-0"><div className="text-xs font-semibold text-gray-500">Profile {i + 1}</div><div className="text-sm truncate mt-1">{link}</div></div><a href={link} target="_blank" rel="noreferrer" className="shrink-0 inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-gray-100 text-sm font-medium">Open <ExternalLink className="w-4 h-4" /></a></div>)}</div></div>
              <div className="mt-6"><label className="block text-xs font-medium text-gray-500 mb-1.5">Review note (optional)</label><textarea className="input min-h-24" value={note} onChange={e => setNote(e.target.value)} placeholder="Record why the application was approved, rejected, or returned for changes…" /></div>
              <div className="mt-5 flex flex-wrap gap-2"><button onClick={() => review('approved')} disabled={!!busy || researchBusy} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold disabled:opacity-50"><CheckCircle className="w-4 h-4" />{busy === 'approved' ? 'Approving…' : 'Approve Marketer'}</button><button onClick={() => review('needs_changes')} disabled={!!busy || researchBusy} className="px-4 py-2.5 rounded-xl border border-amber-300 bg-amber-50 text-amber-800 text-sm font-semibold disabled:opacity-50">Request Changes</button><button onClick={() => review('rejected')} disabled={!!busy || researchBusy} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm font-semibold disabled:opacity-50"><XCircle className="w-4 h-4" />{busy === 'rejected' ? 'Rejecting…' : 'Reject'}</button></div>
            </div>
          )}
        </section>
      </div>

      <section className="mt-5 bg-white border border-gray-100 rounded-2xl p-5"><h2 className="font-bold mb-3">Recent review history</h2>{history.length === 0 ? <p className="text-sm text-gray-400">No reviews recorded yet.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-gray-100 text-left text-gray-500"><th className="py-2 pr-4">Date</th><th className="py-2 pr-4">Applicant</th><th className="py-2 pr-4">Decision</th><th className="py-2">Note</th></tr></thead><tbody className="divide-y divide-gray-100">{history.slice(0, 50).map(h => <tr key={h.id}><td className="py-3 pr-4">{new Date(h.created_at).toLocaleString()}</td><td className="py-3 pr-4">{h.applicant_id.slice(0, 8)}…</td><td className="py-3 pr-4 capitalize font-semibold">{h.decision.replace('_', ' ')}</td><td className="py-3 text-gray-500">{h.note || '—'}</td></tr>)}</tbody></table></div>}</section>
    </div>
  );
}

function hostname(value: string) { try { return new URL(value).hostname.replace(/^www\./, ''); } catch { return 'profile'; } }
function Info({ label, value }: { label: string; value: string }) { return <div className="border border-gray-100 rounded-xl p-3"><div className="text-xs text-gray-400">{label}</div><div className="text-sm font-medium mt-1">{value}</div></div>; }
function AnalysisCard({ analysis: a }: { analysis: Analysis }) { const risk = a.risk_level || 'UNKNOWN'; const riskClass = risk === 'LOW' ? 'bg-green-50 text-green-700 border-green-200' : risk === 'MEDIUM' ? 'bg-amber-50 text-amber-700 border-amber-200' : risk === 'HIGH' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-gray-100 text-gray-600 border-gray-200'; return <div className="rounded-xl border border-gray-200 bg-white p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2"><Bot className="w-4 h-4" /><span className="font-bold">{a.platform}</span><span className="text-xs px-2 py-0.5 rounded-full bg-gray-100">{a.status.replaceAll('_', ' ')}</span></div><div className="text-sm font-medium mt-2 truncate">{a.profile_title || a.profile_url}</div></div><span className={`text-xs font-bold px-2.5 py-1.5 rounded-full border ${riskClass}`}>{risk === 'UNKNOWN' ? 'RISK UNKNOWN' : `${risk} RISK`}</span></div><div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-4">{[['Followers', count(a.followers)], ['Following', count(a.following)], ['Likes', count(a.likes)], ['Content', count(a.content_count)], ['Authenticity', a.authenticity_score == null ? 'UNKNOWN' : `${a.authenticity_score}/100`]].map(([l, v]) => <div key={String(l)} className="rounded-lg bg-gray-50 p-2"><div className="text-[10px] text-gray-400">{l}</div><div className="text-sm font-bold mt-1">{v}</div></div>)}</div><div className="mt-3 text-xs text-gray-500">Confidence: {a.confidence_score == null ? 'UNKNOWN' : `${a.confidence_score}%`}</div>{a.signals?.length ? <div className="mt-2 text-xs text-gray-500"><span className="font-semibold text-gray-700">Signals:</span> {a.signals.join(' • ')}</div> : null}</div>; }
function DeepResearchCard({ report: r }: { report: DeepResearch }) { const x = r.research || {}; return <article className="rounded-xl border border-gray-200 bg-white p-4"><div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3"><div><div className="font-semibold">{r.platform} · {r.profile_url}</div><div className="text-xs text-gray-400 mt-1">Research date: {new Date(r.requested_at).toLocaleString()}</div><div className="text-xs text-gray-500 mt-1">Provider: {r.provider || 'ai-proxy'}{r.model ? ` · ${r.model}` : ''}</div></div><span className={`text-xs font-bold px-2 py-1 rounded-full ${r.status === 'completed' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{r.status}</span></div>{r.status !== 'completed' ? <div className="mt-4 rounded-lg bg-red-50 border border-red-100 p-3 text-sm text-red-700">This research run failed. Retry Deep Research to generate a new report.</div> : <><p className="text-sm text-gray-700 mt-4">{x.summary || 'UNKNOWN'}</p><div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-4"><ReportMetric title="Profile Health" value={x.profile_health?.score} status={x.profile_health?.status} /><ReportMetric title="Audience Authenticity" value={x.audience_authenticity?.score} status={x.audience_authenticity?.status} extra={x.audience_authenticity?.confidence} /><ReportMetric title="Bot Risk" value={x.bot_risk?.score} status={x.bot_risk?.status} extra={x.bot_risk?.confidence} /><ReportMetric title="Identity Consistency" value={x.identity_consistency?.score} status={x.identity_consistency?.status} /><ReportMetric title="Activity" value={null} status={x.activity?.status} /><ReportMetric title="Platform Consistency" value={null} status={x.platform_consistency?.status} /></div><div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3"><div className="text-[10px] uppercase tracking-wide text-indigo-600">Recommendation</div><div className="font-bold mt-1 capitalize">{String(x.recommendation || 'manual_review').replaceAll('_', ' ')}</div><p className="text-sm mt-1">{x.recommendation_reason || 'UNKNOWN'}</p></div><Evidence title="Positive Signals" items={x.positive_signals} /><Evidence title="Risk Signals" items={x.risk_signals} /><Evidence title="Verified Facts" items={x.verified_facts} /><Evidence title="Observed Public Data" items={x.observed_data} /><Evidence title="Calculated Metrics" items={x.calculated_metrics} /><Evidence title="Unknowns" items={x.unknowns} /><Evidence title="Limitations" items={x.limitations} /><div className="mt-4"><h5 className="font-semibold mb-2">Sources</h5>{r.search_evidence?.length ? <div className="space-y-2">{r.search_evidence.map((s, i) => <div key={`${s.link}-${i}`} className="rounded-lg border border-gray-100 p-3"><a href={s.link} target="_blank" rel="noreferrer" className="text-sm font-semibold hover:underline break-words">{s.title || s.link}</a><div className="text-[10px] text-gray-400 mt-1">{s.source} · query: {s.query}</div><p className="text-xs text-gray-500 mt-1">{s.snippet || 'No snippet returned.'}</p></div>)}</div> : <p className="text-sm text-gray-400">No public search sources were returned.</p>}</div></>}</article>; }
function ReportMetric({ title, value, status, extra }: { title: string; value: unknown; status: unknown; extra?: unknown }) { const scoreValue = typeof value === 'number' ? `${value}/100` : 'UNKNOWN'; const extraValue = typeof extra === 'number' ? ` · confidence ${extra}%` : ''; return <div className="rounded-lg bg-gray-50 p-3"><div className="text-[10px] text-gray-400">{title}</div><div className="text-sm font-bold mt-1 capitalize">{scoreValue}</div><div className="text-[10px] text-gray-500 mt-1 capitalize">{String(status || 'unknown').replaceAll('_', ' ')}{extraValue}</div></div>; }
function Evidence({ title, items }: { title: string; items: unknown }) { const list = Array.isArray(items) ? items : []; return <div className="mt-4"><h5 className="font-semibold mb-2">{title}</h5>{list.length ? <ul className="space-y-1">{list.slice(0, 20).map((item: any, i: number) => <li key={i} className="text-sm text-gray-700">• {typeof item === 'object' ? String(item.detail || JSON.stringify(item)) : String(item)}</li>)}</ul> : <p className="text-sm text-gray-400">UNKNOWN</p>}</div>; }
