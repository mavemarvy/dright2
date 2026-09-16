import { useState } from 'react';
import { useKycProviders,useKycProviderSettings,updateKycProviderSetting,setActiveKycProvider,testKycConnection } from '../../lib/kycHooks';
import { PageHeader,LoadingBar } from '../../components/admin/RbacComponents';
import { Shield,Check,X,Zap,Activity,Settings,AlertTriangle,LockKeyhole } from 'lucide-react';

export default function AdminVerificationProvidersPage(){
  const {providers,loading:providersLoading}=useKycProviders();
  const {settings,loading:settingsLoading,refetch}=useKycProviderSettings();
  const [error,setError]=useState<string|null>(null);const [success,setSuccess]=useState<string|null>(null);const [testingId,setTestingId]=useState<string|null>(null);const [editingId,setEditingId]=useState<string|null>(null);const [mode,setMode]=useState<'sandbox'|'production'>('sandbox');
  const getSetting=(providerId:string)=>settings.find((s)=>s.provider_id===providerId);
  const handleToggle=async(providerId:string,field:'is_enabled'|'is_connected',current:boolean)=>{setError(null);try{const s=getSetting(providerId);if(!s)return;await updateKycProviderSetting(s.id,{[field]:!current});void refetch();}catch(e){setError(e instanceof Error?e.message:'Update failed');}};
  const handleSwitch=async(providerId:string)=>{setError(null);try{await setActiveKycProvider(providerId);setSuccess('Active verification provider switched');void refetch();}catch(e){setError(e instanceof Error?e.message:'Switch failed');}};
  const handleTest=async(providerId:string)=>{setTestingId(providerId);setError(null);const result=await testKycConnection(providerId);if(result.success)setSuccess(result.message);else setError(result.message);setTestingId(null);};
  const openSettings=(providerId:string)=>{setEditingId(providerId);setMode(getSetting(providerId)?.mode??'sandbox');};
  const saveSettings=async()=>{if(!editingId)return;const s=getSetting(editingId);if(!s)return;try{await updateKycProviderSetting(s.id,{mode});setSuccess('Provider mode saved');setEditingId(null);void refetch();}catch(e){setError(e instanceof Error?e.message:'Save failed');}};
  const loading=providersLoading||settingsLoading;
  return <div className="p-4 md:p-8">
    <PageHeader title="Verification Providers" subtitle="Manual KYC now; provider-ready architecture for future automated verification" />
    {error&&<div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-700 flex items-center justify-between"><span>{error}</span><button onClick={()=>setError(null)}><X className="w-4 h-4"/></button></div>}
    {success&&<div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-4 text-sm text-green-700 flex items-center justify-between"><span>{success}</span><button onClick={()=>setSuccess(null)}><X className="w-4 h-4"/></button></div>}
    {loading&&<LoadingBar/>}

    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 flex items-start gap-3">
      <LockKeyhole className="w-5 h-5 text-amber-700 mt-0.5"/>
      <div><p className="font-semibold text-amber-900">Provider secrets are server-side only</p><p className="text-sm text-amber-800 mt-1">API keys, secret keys and webhook signing secrets are no longer returned to this page. Configure them in approved Supabase/Vercel server secrets and validate provider webhooks in an Edge Function before enabling production automation.</p></div>
    </div>

    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
      <h3 className="font-bold text-gray-900 mb-1">Verification Mode</h3><p className="text-sm text-gray-500 mb-4">Manual DRIGHT review remains available. Automated providers can be activated after a secure server integration reports connected/healthy.</p>
      <div className="space-y-2">{providers.map((p)=>{const s=getSetting(p.id);const active=s?.is_active??false;const manual=p.slug==='manual';return <label key={p.id} className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-colors ${active?'border-primary-500 bg-primary-50':'border-gray-100'}`}>
        <input type="radio" name="active-provider" checked={active} onChange={()=>void handleSwitch(p.id)} disabled={!manual&&!s?.is_connected} className="w-4 h-4"/>
        <div className="flex-1"><div className="flex items-center gap-2"><span className="font-medium text-sm text-gray-900">{p.display_name??p.name}</span>{p.provider_type==='automated'&&<span className="px-1.5 py-0.5 rounded-full text-xs bg-blue-50 text-blue-600 border border-blue-200">Automated</span>}</div><p className="text-xs text-gray-400 mt-0.5">{p.description}</p></div>
        {!manual&&!s?.is_connected&&<span className="text-xs text-amber-600">Server connection required</span>}
      </label>;})}</div>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{providers.map((p)=>{const s=getSetting(p.id);if(!s)return null;return <div key={p.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <div className="flex items-start justify-between mb-3"><div className="flex items-center gap-2.5"><div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center"><Shield className="w-5 h-5 text-primary-500"/></div><div><p className="font-semibold text-sm text-gray-900">{p.display_name??p.name}</p><p className="text-xs text-gray-400 capitalize">{p.provider_type}</p></div></div>{s.is_active&&<span className="px-2 py-0.5 rounded-full text-xs bg-green-50 text-green-700 border border-green-200">Active</span>}</div>
      <div className="space-y-2 text-xs">
        <div className="flex justify-between"><span className="text-gray-500">Connected</span>{s.is_connected?<Check className="w-4 h-4 text-green-500"/>:<X className="w-4 h-4 text-gray-300"/>}</div>
        <div className="flex justify-between"><span className="text-gray-500">Enabled</span><button onClick={()=>void handleToggle(p.id,'is_enabled',s.is_enabled)} className={`relative w-9 h-5 rounded-full ${s.is_enabled?'bg-primary-500':'bg-gray-200'}`}><span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full ${s.is_enabled?'left-4':'left-0.5'}`}/></button></div>
        <div className="flex justify-between"><span className="text-gray-500">Mode</span><span>{s.mode}</span></div>
        <div className="flex justify-between"><span className="text-gray-500">Health</span><span className="flex items-center gap-1"><Activity className="w-3 h-3"/>{s.health_status}</span></div>
        {s.last_error&&<div className="flex items-start gap-1 text-red-500"><AlertTriangle className="w-3 h-3 mt-0.5"/><span>{s.last_error}</span></div>}
      </div>
      <div className="flex gap-1.5 mt-4"><button onClick={()=>void handleTest(p.id)} disabled={testingId===p.id} className="flex-1 flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg"><Zap className="w-3 h-3"/>{testingId===p.id?'Checking...':'Health'}</button><button onClick={()=>openSettings(p.id)} className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-gray-200 rounded-lg"><Settings className="w-3 h-3"/> Mode</button></div>
    </div>;})}</div>

    {editingId&&<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={()=>setEditingId(null)}><div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={(e)=>e.stopPropagation()}><h2 className="text-xl font-bold text-gray-900">Provider Runtime Mode</h2><p className="text-sm text-gray-500 mt-1 mb-4">This setting does not store credentials in the browser.</p><select value={mode} onChange={(e)=>setMode(e.target.value as 'sandbox'|'production')} className="w-full px-3 py-3 rounded-xl border border-gray-200"><option value="sandbox">Sandbox</option><option value="production">Production</option></select><div className="flex justify-end gap-2 mt-6"><button onClick={()=>setEditingId(null)} className="px-4 py-2 text-sm rounded-xl">Cancel</button><button onClick={()=>void saveSettings()} className="px-4 py-2 text-sm text-white bg-primary-600 rounded-xl">Save</button></div></div></div>}
  </div>;
}
