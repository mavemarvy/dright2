import { useEffect,useMemo,useState } from 'react';
import { motion } from 'framer-motion';
import { Route,Routes,useSearchParams } from 'react-router-dom';
import { Users,Search,Shield,Mail,Phone,Wallet,Calendar,ChevronLeft,ChevronRight,BadgeCheck,TrendingUp } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/currency';
import AdminUserDetailPage from './AdminUserDetailPage';

type RoleFilter='all'|'promoters'|'admins';
interface AdminUserRow {
  id:string;email:string;username:string|null;full_name:string|null;phone:string|null;is_admin:boolean;admin_status:string|null;account_status:string;balance:number|string;created_at:string;
  kyc_status:string|null;questionnaire_status:string|null;eligibility_status:string|null;active_badges:number;growth_score:number|string|null;growth_level:string|null;
}
interface PagePayload {rows:AdminUserRow[];page:number;page_size:number;total:number;summary:{admins:number;members:number;total_balance:number|string};}

export default function AdminUsersPage(){
  const [params,setParams]=useSearchParams();const detailId=params.get('user');
  const [rows,setRows]=useState<AdminUserRow[]>([]);const [loading,setLoading]=useState(true);const [error,setError]=useState<string|null>(null);
  const [searchInput,setSearchInput]=useState('');const [searchQuery,setSearchQuery]=useState('');const [roleFilter,setRoleFilter]=useState<RoleFilter>('all');const [page,setPage]=useState(1);const [payload,setPayload]=useState<PagePayload>({rows:[],page:1,page_size:25,total:0,summary:{admins:0,members:0,total_balance:0}});

  useEffect(()=>{const timer=window.setTimeout(()=>{setPage(1);setSearchQuery(searchInput.trim());},350);return()=>window.clearTimeout(timer);},[searchInput]);
  useEffect(()=>{setPage(1);},[roleFilter]);
  useEffect(()=>{let active=true;const run=async()=>{setLoading(true);setError(null);const {data,error}=await supabase.rpc('get_admin_users_page',{p_search:searchQuery||null,p_role_filter:roleFilter,p_page:page,p_page_size:25});if(!active)return;if(error){setError(error.message);setRows([]);}else{const next=data as unknown as PagePayload;setPayload(next);setRows(next?.rows??[]);}setLoading(false);};void run();return()=>{active=false;};},[searchQuery,roleFilter,page]);

  if(detailId)return <Routes location={`/admin/users/${detailId}`}><Route path="/admin/users/:userId" element={<AdminUserDetailPage/>}/></Routes>;

  const totalPages=Math.max(1,Math.ceil((payload.total||0)/(payload.page_size||25)));
  return <div className="p-4 md:p-8 max-w-[1600px] mx-auto">
    <div className="mb-6"><h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">All Users</h1><p className="text-gray-500 mt-1">Review accounts, applications, KYC, evidence, badges, growth and eligibility.</p></div>
    {error&&<div className="mb-4 p-3 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm">{error}</div>}

    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <Stat icon={<Users/>} label="Matching users" value={String(payload.total||0)}/>
      <Stat icon={<Shield/>} label="Active admins" value={String(payload.summary?.admins??0)}/>
      <Stat icon={<Users/>} label="Members" value={String(payload.summary?.members??0)}/>
      <Stat icon={<Wallet/>} label="Total balance" value={formatCurrency(Number(payload.summary?.total_balance??0))}/>
    </div>

    <div className="flex flex-col sm:flex-row gap-3 mb-6"><div className="relative flex-1"><Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"/><input type="search" placeholder="Search name, username, email, or phone…" value={searchInput} onChange={(e)=>setSearchInput(e.target.value)} className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none bg-white dark:bg-gray-900"/></div><div className="flex gap-2 overflow-x-auto">{(['all','promoters','admins'] as const).map((role)=><button key={role} onClick={()=>setRoleFilter(role)} className={`px-4 py-3 rounded-xl font-medium whitespace-nowrap ${roleFilter===role?'bg-primary-600 text-white':'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700'}`}>{role==='promoters'?'Members':role.charAt(0).toUpperCase()+role.slice(1)}</button>)}</div></div>

    {loading?<div className="flex items-center justify-center py-20"><div className="w-10 h-10 border-4 border-gray-300 border-t-primary-600 rounded-full animate-spin"/></div>:rows.length===0?<div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-12 text-center"><Users className="w-16 h-16 text-gray-300 mx-auto mb-4"/><p className="font-semibold text-lg">No users found</p><p className="text-sm text-gray-500 mt-1">Try a different search or filter.</p></div>:<div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm"><div className="overflow-x-auto"><table className="w-full min-w-[1150px]"><thead className="bg-gray-50 dark:bg-gray-950 border-b border-gray-100 dark:border-gray-800"><tr><Th>User</Th><Th>Contact</Th><Th>Account</Th><Th>Verification</Th><Th>Achievement / growth</Th><Th right>Balance</Th><Th>Joined</Th></tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-800">{rows.map((u,index)=><motion.tr key={u.id} initial={{opacity:0}} animate={{opacity:1}} transition={{delay:index*.015}} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 cursor-pointer" onClick={()=>setParams({user:u.id})}><td className="px-5 py-4"><div className="flex items-center gap-3"><div className={`w-10 h-10 rounded-full flex items-center justify-center ${u.is_admin?'bg-amber-100':'bg-primary-100'}`}><span className={`font-semibold ${u.is_admin?'text-amber-700':'text-primary-700'}`}>{(u.full_name||u.username||u.email)?.[0]?.toUpperCase()||'U'}</span></div><div className="min-w-0"><p className="font-medium text-gray-900 dark:text-gray-100 truncate max-w-[220px]">{u.full_name||'No name'}</p><p className="text-xs text-gray-500">{u.username?`@${u.username}`:u.id.slice(0,12)}</p></div></div></td><td className="px-5 py-4"><div className="space-y-1"><div className="flex items-center gap-2 text-sm"><Mail className="w-4 h-4 text-gray-400"/><span className="truncate max-w-[200px]">{u.email}</span></div>{u.phone&&<div className="flex items-center gap-2 text-xs text-gray-500"><Phone className="w-4 h-4 text-gray-400"/>{u.phone}</div>}</div></td><td className="px-5 py-4"><div className="flex flex-wrap gap-1.5"><Chip value={u.is_admin?(u.admin_status||'admin'):'member'}/><Chip value={u.account_status}/></div></td><td className="px-5 py-4"><div className="flex flex-wrap gap-1.5"><Chip prefix="KYC" value={u.kyc_status||'not_started'}/><Chip prefix="Q" value={u.questionnaire_status||'not_started'}/><Chip prefix="Eligibility" value={u.eligibility_status||'not_calculated'}/></div></td><td className="px-5 py-4"><div className="flex items-center gap-3 text-xs"><span className="inline-flex items-center gap-1"><BadgeCheck className="w-4 h-4 text-primary-500"/>{u.active_badges||0}</span><span className="inline-flex items-center gap-1"><TrendingUp className="w-4 h-4 text-green-500"/>{u.growth_score==null?'—':Number(u.growth_score).toFixed(0)}{u.growth_level?` • ${pretty(u.growth_level)}`:''}</span></div></td><td className="px-5 py-4 text-right font-semibold">{formatCurrency(Number(u.balance||0))}</td><td className="px-5 py-4"><div className="flex items-center gap-2 text-sm text-gray-500"><Calendar className="w-4 h-4"/>{formatDate(u.created_at)}</div></td></motion.tr>)}</tbody></table></div></div>}

    <div className="mt-5 flex items-center justify-between gap-3"><p className="text-sm text-gray-500">Page {page} of {totalPages} • {payload.total||0} result{payload.total===1?'':'s'}</p><div className="flex gap-2"><button onClick={()=>setPage((p)=>Math.max(1,p-1))} disabled={page<=1||loading} className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40 inline-flex items-center gap-1"><ChevronLeft className="w-4 h-4"/> Previous</button><button onClick={()=>setPage((p)=>Math.min(totalPages,p+1))} disabled={page>=totalPages||loading} className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40 inline-flex items-center gap-1">Next <ChevronRight className="w-4 h-4"/></button></div></div>
  </div>;
}

function Stat({icon,label,value}:{icon:React.ReactNode;label:string;value:string}){return <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 sm:p-5 border border-gray-100 dark:border-gray-800"><div className="flex items-center gap-2 text-gray-500 [&>svg]:w-5 [&>svg]:h-5 [&>svg]:text-primary-600">{icon}<span className="text-xs sm:text-sm">{label}</span></div><p className="text-xl sm:text-2xl font-bold mt-2 text-gray-900 dark:text-gray-100 break-words">{value}</p></div>}
function Th({children,right}:{children:React.ReactNode;right?:boolean}){return <th className={`px-5 py-4 text-sm font-semibold text-gray-600 dark:text-gray-300 ${right?'text-right':'text-left'}`}>{children}</th>}
function Chip({value,prefix}:{value:string;prefix?:string}){const v=(value||'unknown').toLowerCase();const good=['active','approved','verified','eligible','completed'].includes(v);const bad=['rejected','ineligible','banned','locked','suspended'].includes(v);return <span className={`inline-flex px-2 py-1 rounded-full text-[11px] font-medium border ${good?'bg-green-50 text-green-700 border-green-200':bad?'bg-red-50 text-red-700 border-red-200':'bg-amber-50 text-amber-700 border-amber-200'}`}>{prefix?`${prefix}: `:''}{pretty(value)}</span>}
function pretty(value:string){return String(value||'unknown').replace(/_/g,' ').replace(/\b\w/g,(c)=>c.toUpperCase())}
function formatDate(value:string){return new Date(value).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'})}
