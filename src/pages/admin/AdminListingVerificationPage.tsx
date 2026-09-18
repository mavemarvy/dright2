import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock3, FileCheck2, Loader2, RefreshCw, Search, ShieldCheck, X, XCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/currency';

type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'suspended' | 'all';
type ListingType = 'all' | 'physical_product' | 'digital_product' | 'service' | 'course' | 'job' | 'campaign' | 'task' | 'promotion_campaign';

interface ListingReviewRow {
  listing_type: string;
  source_table: string;
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  status: string;
  rejection_reason: string | null;
  category: string | null;
  amount: number | null;
  currency: string | null;
  created_at: string;
  reviewed_at: string | null;
  metadata: Record<string, unknown> | null;
  owner_name?: string | null;
  owner_email?: string | null;
}

const TYPE_LABELS: Record<string,string> = {
  physical_product:'Physical Product', digital_product:'Digital Product', service:'Service', course:'Course',
  job:'Job', campaign:'Campaign', task:'Task', promotion_campaign:'Promotion Campaign', job_product:'Marketplace Job', product:'Product',
};
const TYPE_OPTIONS: Array<{value:ListingType;label:string}> = [
  {value:'all',label:'All listing types'}, {value:'physical_product',label:'Physical products'},
  {value:'digital_product',label:'Digital products'}, {value:'service',label:'Services'}, {value:'course',label:'Courses'},
  {value:'job',label:'Jobs'}, {value:'campaign',label:'Campaigns'}, {value:'task',label:'Tasks'},
  {value:'promotion_campaign',label:'Promotion campaigns'},
];

function statusClass(status:string){
  if(status==='approved') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
  if(status==='rejected') return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
  if(status==='suspended') return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300';
  return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
}

export default function AdminListingVerificationPage(){
  const [rows,setRows]=useState<ListingReviewRow[]>([]);
  const [loading,setLoading]=useState(true);
  const [processingId,setProcessingId]=useState<string|null>(null);
  const [status,setStatus]=useState<ReviewStatus>('pending');
  const [listingType,setListingType]=useState<ListingType>('all');
  const [search,setSearch]=useState('');
  const [error,setError]=useState<string|null>(null);
  const [rejecting,setRejecting]=useState<ListingReviewRow|null>(null);
  const [rejectReason,setRejectReason]=useState('');

  const loadQueue=useCallback(async()=>{
    setLoading(true);setError(null);
    try{
      const {data,error:queueError}=await supabase.rpc('get_admin_listing_review_queue',{
        p_status:status,p_listing_type:listingType==='all'?null:listingType,p_limit:250,p_offset:0,
      });
      if(queueError)throw queueError;
      const baseRows=(data||[]) as ListingReviewRow[];
      const ownerIds=[...new Set(baseRows.map(row=>row.owner_id).filter(Boolean))];
      let ownerMap=new Map<string,{full_name:string|null;email:string|null}>();
      if(ownerIds.length){
        const {data:owners}=await supabase.from('users').select('id, full_name, email').in('id',ownerIds);
        ownerMap=new Map((owners||[]).map(owner=>[owner.id,{full_name:owner.full_name,email:owner.email}]));
      }
      setRows(baseRows.map(row=>({...row,owner_name:ownerMap.get(row.owner_id)?.full_name??null,owner_email:ownerMap.get(row.owner_id)?.email??null})));
    }catch(e){
      console.error('Listing verification queue failed:',e);setRows([]);
      setError(e instanceof Error?e.message:'Could not load the listing verification queue.');
    }finally{setLoading(false);}
  },[status,listingType]);

  useEffect(()=>{void loadQueue();},[loadQueue]);

  const visibleRows=useMemo(()=>{
    const q=search.trim().toLowerCase();if(!q)return rows;
    return rows.filter(row=>row.title?.toLowerCase().includes(q)||row.description?.toLowerCase().includes(q)
      ||row.category?.toLowerCase().includes(q)||row.owner_email?.toLowerCase().includes(q)
      ||row.owner_name?.toLowerCase().includes(q)||row.id.toLowerCase().includes(q));
  },[rows,search]);

  const review=async(row:ListingReviewRow,decision:'approve'|'reject',reason?:string)=>{
    setProcessingId(row.id);setError(null);
    try{
      const {error:reviewError}=await supabase.rpc('review_dright_listing',{
        p_listing_type:row.listing_type,p_listing_id:row.id,p_decision:decision,
        p_reason:decision==='reject'?reason?.trim()||null:null,
      });
      if(reviewError)throw reviewError;
      setRejecting(null);setRejectReason('');await loadQueue();
    }catch(e){
      console.error('Listing review failed:',e);
      setError(e instanceof Error?e.message:'Listing review failed.');
    }finally{setProcessingId(null);}
  };

  return <div className="p-4 md:p-8 max-w-7xl mx-auto text-gray-900 dark:text-gray-100">
    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-6">
      <div>
        <div className="flex items-center gap-2"><FileCheck2 className="w-7 h-7 text-primary-600 dark:text-primary-400"/><h1 className="text-2xl font-bold">Listing Verification</h1></div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-3xl">Review physical and digital products, services, courses, jobs, creator campaigns, tasks, and paid promotion campaigns from one permission-aware queue.</p>
      </div>
      <button type="button" onClick={()=>void loadQueue()} disabled={loading}
        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50">
        <RefreshCw className={`w-4 h-4 ${loading?'animate-spin':''}`}/> Refresh
      </button>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3 mb-5">
      <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search title, owner, category, or listing ID"
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-primary-500/30"/>
      </div>
      <select value={listingType} onChange={e=>setListingType(e.target.value as ListingType)}
        className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white">
        {TYPE_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <select value={status} onChange={e=>setStatus(e.target.value as ReviewStatus)}
        className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white">
        <option value="pending">Pending review</option><option value="approved">Approved</option>
        <option value="rejected">Rejected</option><option value="suspended">Suspended</option><option value="all">All statuses</option>
      </select>
    </div>

    {error&&<div className="mb-5 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-700 dark:text-red-300 flex items-start gap-2"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0"/>{error}</div>}

    {loading?<div className="min-h-[280px] flex items-center justify-center"><Loader2 className="w-7 h-7 animate-spin text-primary-600"/></div>
    :visibleRows.length===0?<div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-10 text-center"><ShieldCheck className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3"/><p className="font-semibold">No listings match this queue.</p><p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Only listing types your admin role is authorized to review are returned.</p></div>
    :<div className="space-y-3">{visibleRows.map(row=>{
      const metadata=row.metadata||{};const busy=processingId===row.id;
      return <div key={`${row.source_table}:${row.id}`} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 md:p-5">
        <div className="flex flex-col lg:flex-row lg:items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-xs font-semibold px-2 py-1 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300">{TYPE_LABELS[row.listing_type]||row.listing_type.replace(/_/g,' ')}</span>
              <span className={`text-xs font-semibold px-2 py-1 rounded-full capitalize ${statusClass(row.status)}`}>{row.status}</span>
              <span className="text-xs text-gray-400">{new Date(row.created_at).toLocaleString()}</span>
            </div>
            <h2 className="font-bold text-lg text-gray-900 dark:text-white">{row.title||'Untitled listing'}</h2>
            {row.description&&<p className="text-sm text-gray-600 dark:text-gray-300 mt-1 line-clamp-3">{row.description}</p>}
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-gray-500 dark:text-gray-400">
              {row.owner_name&&<span>Owner: <strong className="text-gray-700 dark:text-gray-200">{row.owner_name}</strong></span>}
              {row.owner_email&&<span>{row.owner_email}</span>}{row.category&&<span>Category: {row.category}</span>}
              {row.amount!==null&&Number.isFinite(Number(row.amount))&&<span>Amount: {row.currency?formatCurrency(Number(row.amount),row.currency):Number(row.amount).toLocaleString()}</span>}
              <span>ID: {row.id.slice(0,8)}…</span>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-3">{Object.entries(metadata).slice(0,8).map(([key,value])=>{
              if(value===null||value===undefined||typeof value==='object')return null;
              return <span key={key} className="text-[11px] px-2 py-1 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">{key.replace(/_/g,' ')}: {String(value)}</span>;
            })}</div>
            {row.rejection_reason&&<div className="mt-3 rounded-xl bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-700 dark:text-red-300"><strong>Review reason:</strong> {row.rejection_reason}</div>}
          </div>
          <div className="flex lg:flex-col gap-2 shrink-0">
            {row.status!=='approved'&&<button type="button" onClick={()=>void review(row,'approve')} disabled={busy}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-50">
              {busy?<Loader2 className="w-4 h-4 animate-spin"/>:<CheckCircle2 className="w-4 h-4"/>} Approve</button>}
            {row.status!=='rejected'&&<button type="button" onClick={()=>{setRejecting(row);setRejectReason('');setError(null);}} disabled={busy}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-50"><XCircle className="w-4 h-4"/> Reject</button>}
          </div>
        </div>
      </div>;
    })}</div>}

    {rejecting&&<div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Reject listing">
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-2xl p-5">
        <div className="flex items-start justify-between gap-3"><div><h2 className="font-bold text-lg text-gray-900 dark:text-white">Reject listing</h2><p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{rejecting.title}</p></div>
          <button type="button" onClick={()=>setRejecting(null)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X className="w-5 h-5"/></button></div>
        <label className="block text-sm font-medium mt-5 mb-2 text-gray-700 dark:text-gray-300">Reason required</label>
        <textarea value={rejectReason} onChange={e=>setRejectReason(e.target.value)} rows={4} placeholder="Explain what must be corrected before this listing can be approved."
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500/30"/>
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={()=>setRejecting(null)} className="px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-semibold">Cancel</button>
          <button type="button" onClick={()=>void review(rejecting,'reject',rejectReason)} disabled={!rejectReason.trim()||processingId===rejecting.id}
            className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-2">
            {processingId===rejecting.id?<Loader2 className="w-4 h-4 animate-spin"/>:<XCircle className="w-4 h-4"/>} Reject listing</button>
        </div>
      </div>
    </div>}

    <div className="mt-5 flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500"><Clock3 className="w-3.5 h-3.5"/>Decisions are recorded in the immutable listing review history and notify the listing owner.</div>
  </div>;
}
