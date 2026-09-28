import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock3,
  Database,
  ExternalLink,
  Loader2,
  Mail,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

type Prospect = {
  id:string;
  company_name:string|null;
  contact_name:string|null;
  email:string;
  website_url:string|null;
  source_url:string;
  country:string|null;
  segment:string;
  qualification_status:'discovered'|'qualified'|'rejected'|'queued'|'contacted'|'replied'|'unsubscribed'|'invalid';
  verification_status:'unknown'|'public_verified'|'invalid'|'bounced';
  qualification_score:number;
  campaign_id:string|null;
  discovered_at:string;
  updated_at:string;
};

type AcquisitionRun = {
  id:string;
  name:string;
  segment:string;
  status:string;
  source_type:string;
  source_query:string|null;
  discovered_count:number;
  qualified_count:number;
  duplicate_count:number;
  invalid_count:number;
  queued_count:number;
  started_at:string;
  completed_at:string|null;
};

type Campaign = {
  id:string;
  name:string;
  segment:string;
  status:string;
  target_count:number;
  sent_count:number;
  remaining_count:number;
};

function fmt(value:string|null) {
  if(!value) return '—';
  return new Date(value).toLocaleString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
}

function Metric({label,value,icon:Icon}:{label:string;value:number;icon:typeof Users}) {
  return <div className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
    <div className="flex items-center gap-2 text-xs text-gray-400"><Icon className="h-4 w-4 text-primary-500"/>{label}</div>
    <div className="mt-1 text-2xl font-black text-gray-900 dark:text-white">{Number(value||0).toLocaleString()}</div>
  </div>;
}

export default function AdminProspectAcquisitionPage() {
  const [prospects,setProspects] = useState<Prospect[]>([]);
  const [runs,setRuns] = useState<AcquisitionRun[]>([]);
  const [campaigns,setCampaigns] = useState<Campaign[]>([]);
  const [loading,setLoading] = useState(true);
  const [search,setSearch] = useState('');
  const [status,setStatus] = useState('all');
  const [segment,setSegment] = useState('all');
  const [campaignId,setCampaignId] = useState('');
  const [queueLimit,setQueueLimit] = useState(1000);
  const [working,setWorking] = useState(false);
  const [notice,setNotice] = useState<string|null>(null);

  const load = useCallback(async()=>{
    setLoading(true);
    setNotice(null);
    try {
      const [pRes,rRes,cRes] = await Promise.all([
        supabase.from('outreach_prospects')
          .select('*')
          .order('qualification_score',{ascending:false})
          .order('updated_at',{ascending:false})
          .limit(500),
        supabase.from('outreach_acquisition_runs')
          .select('*')
          .order('created_at',{ascending:false})
          .limit(50),
        supabase.from('outreach_campaigns')
          .select('id,name,segment,status,target_count,sent_count,remaining_count')
          .in('status',['draft','scheduled','running','paused'])
          .order('created_at',{ascending:false}),
      ]);
      if(pRes.error) throw pRes.error;
      if(rRes.error) throw rRes.error;
      if(cRes.error) throw cRes.error;
      setProspects((pRes.data||[]) as Prospect[]);
      setRuns((rRes.data||[]) as AcquisitionRun[]);
      setCampaigns((cRes.data||[]) as Campaign[]);
      if(!campaignId && cRes.data?.[0]?.id) setCampaignId(cRes.data[0].id);
    } catch(reason) {
      setNotice(reason instanceof Error ? reason.message : 'Unable to load prospect acquisition data.');
    } finally {
      setLoading(false);
    }
  },[campaignId]);

  useEffect(()=>{ void load(); },[load]);

  useEffect(()=>{
    const channel = supabase.channel('admin-prospect-acquisition-live')
      .on('postgres_changes',{event:'*',schema:'public',table:'outreach_prospects'},()=>void load())
      .on('postgres_changes',{event:'*',schema:'public',table:'outreach_acquisition_runs'},()=>void load())
      .subscribe();
    return ()=>{ void supabase.removeChannel(channel); };
  },[load]);

  const totals = useMemo(()=>({
    total:prospects.length,
    qualified:prospects.filter(p=>p.qualification_status==='qualified').length,
    queued:prospects.filter(p=>p.qualification_status==='queued').length,
    contacted:prospects.filter(p=>p.qualification_status==='contacted').length,
    replied:prospects.filter(p=>p.qualification_status==='replied').length,
    invalid:prospects.filter(p=>p.qualification_status==='invalid'||p.verification_status==='invalid'||p.verification_status==='bounced').length,
  }),[prospects]);

  const filtered = useMemo(()=>{
    const q=search.trim().toLowerCase();
    return prospects.filter(p=>{
      if(status!=='all'&&p.qualification_status!==status) return false;
      if(segment!=='all'&&p.segment!==segment) return false;
      if(!q) return true;
      return [p.company_name,p.contact_name,p.email,p.website_url,p.country,p.segment]
        .filter(Boolean).some(v=>String(v).toLowerCase().includes(q));
    });
  },[prospects,search,status,segment]);

  const queueQualified = async()=>{
    if(!campaignId||working) return;
    setWorking(true); setNotice(null);
    const {data,error}=await supabase.rpc('queue_qualified_outreach_prospects',{
      p_campaign_id:campaignId,
      p_limit:Math.max(1,Math.min(5000,queueLimit||1000)),
    });
    setWorking(false);
    if(error){ setNotice(error.message); return; }
    const result=Array.isArray(data)?data[0]:data;
    setNotice(`Queued ${Number(result?.queued_count||0).toLocaleString()} qualified prospect(s) into the campaign.`);
    await load();
  };

  return <div className="mx-auto max-w-7xl p-4 md:p-8">
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-black text-gray-900 dark:text-white">Prospect Acquisition</h1>
        <p className="mt-1 text-sm text-gray-500">Verified public business prospects feeding DRIGHT outreach campaigns.</p>
      </div>
      <button onClick={()=>void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-600 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
        <RefreshCw className={`h-4 w-4 ${loading?'animate-spin':''}`}/> Refresh
      </button>
    </div>

    {notice && <div className="mb-4 rounded-2xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-300">{notice}</div>}

    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <Metric label="Prospects" value={totals.total} icon={Database}/>
      <Metric label="Qualified" value={totals.qualified} icon={CheckCircle2}/>
      <Metric label="Queued" value={totals.queued} icon={Clock3}/>
      <Metric label="Contacted" value={totals.contacted} icon={Send}/>
      <Metric label="Replies" value={totals.replied} icon={Mail}/>
      <Metric label="Invalid" value={totals.invalid} icon={ShieldCheck}/>
    </div>

    <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_420px]">
      <section className="rounded-3xl border border-gray-100 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center gap-2"><Send className="h-5 w-5 text-primary-600"/><h2 className="font-black text-gray-900 dark:text-white">Feed qualified prospects into a campaign</h2></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_140px_auto]">
          <select value={campaignId} onChange={e=>setCampaignId(e.target.value)} className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950">
            <option value="">Choose campaign</option>
            {campaigns.map(c=><option key={c.id} value={c.id}>{c.name} · {c.segment}</option>)}
          </select>
          <input type="number" min={1} max={5000} value={queueLimit} onChange={e=>setQueueLimit(Number(e.target.value)||1)} className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950"/>
          <button onClick={()=>void queueQualified()} disabled={!campaignId||working} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">
            {working?<Loader2 className="h-4 w-4 animate-spin"/>:<Send className="h-4 w-4"/>} Queue
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-400">Suppressed, unsubscribed and duplicate addresses are excluded. Segment matching is enforced.</p>
      </section>

      <section className="rounded-3xl border border-gray-100 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="font-black text-gray-900 dark:text-white">Acquisition runs</h2>
        <div className="mt-3 max-h-52 space-y-2 overflow-y-auto">
          {runs.length===0?<p className="text-sm text-gray-400">No acquisition runs yet.</p>:runs.map(run=><div key={run.id} className="rounded-2xl bg-gray-50 p-3 dark:bg-gray-800">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-bold text-gray-900 dark:text-white">{run.name}</p>
              <span className="text-[10px] font-bold uppercase text-gray-400">{run.status}</span>
            </div>
            <p className="mt-1 text-[11px] text-gray-400">{run.segment} · {Number(run.discovered_count||0).toLocaleString()} discovered · {Number(run.qualified_count||0).toLocaleString()} qualified · {Number(run.queued_count||0).toLocaleString()} queued</p>
          </div>)}
        </div>
      </section>
    </div>

    <section className="mt-4 overflow-hidden rounded-3xl border border-gray-100 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="grid gap-2 border-b border-gray-100 p-4 sm:grid-cols-[1fr_180px_180px] dark:border-gray-800">
        <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-gray-400"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search prospects..." className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary-500 dark:border-gray-700 dark:bg-gray-950"/></div>
        <select value={status} onChange={e=>setStatus(e.target.value)} className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950">
          <option value="all">All statuses</option>
          <option value="discovered">Discovered</option><option value="qualified">Qualified</option><option value="queued">Queued</option><option value="contacted">Contacted</option><option value="replied">Replied</option><option value="unsubscribed">Unsubscribed</option><option value="invalid">Invalid</option>
        </select>
        <select value={segment} onChange={e=>setSegment(e.target.value)} className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-950">
          <option value="all">All segments</option>
          <option value="affiliate">Affiliate</option><option value="seller">Seller</option><option value="employer">Employer</option><option value="freelancer">Freelancer</option><option value="course_creator">Course Creator</option><option value="task_creator">Task Creator</option><option value="advertiser">Advertiser</option><option value="general">General</option>
        </select>
      </div>

      {loading?<div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-primary-600"/></div>:<div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-400 dark:bg-gray-800/70">
            <tr><th className="px-4 py-3">Prospect</th><th className="px-4 py-3">Segment</th><th className="px-4 py-3">Score</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Country</th><th className="px-4 py-3">Source</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {filtered.map(p=><tr key={p.id}>
              <td className="px-4 py-3"><p className="font-bold text-gray-900 dark:text-white">{p.company_name||p.contact_name||p.email}</p><p className="text-xs text-gray-400">{p.email}</p></td>
              <td className="px-4 py-3 capitalize text-gray-600 dark:text-gray-300">{p.segment.replaceAll('_',' ')}</td>
              <td className="px-4 py-3"><span className="rounded-full bg-primary-50 px-2 py-1 text-xs font-black text-primary-700 dark:bg-primary-950/30 dark:text-primary-300">{p.qualification_score}</span></td>
              <td className="px-4 py-3 capitalize text-gray-600 dark:text-gray-300">{p.qualification_status.replaceAll('_',' ')}</td>
              <td className="px-4 py-3 text-gray-500">{p.country||'—'}</td>
              <td className="px-4 py-3"><a href={p.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary-600 hover:underline">Verify <ExternalLink className="h-3 w-3"/></a></td>
            </tr>)}
          </tbody>
        </table>
      </div>}
    </section>
  </div>;
}
