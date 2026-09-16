import { useEffect,useMemo,useRef,useState } from 'react';
import { ChevronLeft,ChevronRight,Maximize2,Minimize2,RotateCw,ZoomIn,ZoomOut,X,ShieldCheck,FileText,RefreshCw } from 'lucide-react';

interface SecureDocumentViewerProps {
  open:boolean;
  onClose:()=>void;
  title:string;
  mimeType:string|null;
  signedUrl:string|null;
  expiresAt?:Date|null;
  metadata?:Array<{label:string;value:string|null|undefined}>;
  watermark?:string;
  onRefreshUrl?:()=>Promise<string>;
}

export default function SecureDocumentViewer({open,onClose,title,mimeType,signedUrl,expiresAt,metadata=[],watermark='DRIGHT VERIFICATION REVIEW',onRefreshUrl}:SecureDocumentViewerProps){
  const [zoom,setZoom]=useState(1);const [rotation,setRotation]=useState(0);const [fullscreen,setFullscreen]=useState(false);const [url,setUrl]=useState<string|null>(signedUrl);const [refreshing,setRefreshing]=useState(false);const shellRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{setUrl(signedUrl);setZoom(1);setRotation(0);},[signedUrl,open]);
  useEffect(()=>{if(!open)return;const handler=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose();};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);},[open,onClose]);
  const isPdf=useMemo(()=>mimeType==='application/pdf'||title.toLowerCase().endsWith('.pdf'),[mimeType,title]);
  const refresh=async()=>{if(!onRefreshUrl)return;setRefreshing(true);try{setUrl(await onRefreshUrl());}finally{setRefreshing(false);}};
  const toggleFullscreen=async()=>{if(!shellRef.current)return;if(!document.fullscreenElement){await shellRef.current.requestFullscreen();setFullscreen(true);}else{await document.exitFullscreen();setFullscreen(false);}};
  if(!open)return null;
  return <div className="fixed inset-0 z-[90] bg-black/75 p-0 sm:p-4 flex items-center justify-center" role="dialog" aria-modal="true" aria-label={title}>
    <div ref={shellRef} className="relative bg-gray-950 w-full h-full sm:max-w-7xl sm:h-[94vh] sm:rounded-2xl overflow-hidden flex flex-col">
      <header className="flex items-center gap-2 px-3 sm:px-4 py-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <ShieldCheck className="w-5 h-5 text-primary-600 flex-shrink-0"/><div className="min-w-0 flex-1"><p className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">{title}</p><p className="text-xs text-gray-500">Private, temporary review preview{expiresAt?` • URL expires ${expiresAt.toLocaleTimeString()}`:''}</p></div>
        {!isPdf&&<><button onClick={()=>setZoom((v)=>Math.max(.5,v-.25))} className="viewer-btn" aria-label="Zoom out"><ZoomOut className="w-4 h-4"/></button><button onClick={()=>setZoom((v)=>Math.min(4,v+.25))} className="viewer-btn" aria-label="Zoom in"><ZoomIn className="w-4 h-4"/></button><button onClick={()=>setRotation((v)=>(v+90)%360)} className="viewer-btn" aria-label="Rotate"><RotateCw className="w-4 h-4"/></button></>}
        {onRefreshUrl&&<button onClick={()=>void refresh()} disabled={refreshing} className="viewer-btn" aria-label="Refresh temporary link"><RefreshCw className={`w-4 h-4 ${refreshing?'animate-spin':''}`}/></button>}
        <button onClick={()=>void toggleFullscreen()} className="viewer-btn" aria-label="Toggle fullscreen">{fullscreen?<Minimize2 className="w-4 h-4"/>:<Maximize2 className="w-4 h-4"/>}</button>
        <button onClick={onClose} className="viewer-btn" aria-label="Close"><X className="w-5 h-5"/></button>
      </header>
      <div className="flex-1 min-h-0 grid lg:grid-cols-[1fr_300px]">
        <main className="relative min-h-0 overflow-auto flex items-center justify-center bg-[radial-gradient(circle_at_center,_#374151_0,_#111827_70%)] p-4">
          {!url?<div className="text-center text-gray-300"><FileText className="w-12 h-12 mx-auto mb-3 opacity-50"/><p>Secure preview unavailable.</p></div>:isPdf?<iframe src={`${url}#toolbar=1&navpanes=1&view=FitH`} title={title} className="w-full h-full min-h-[60vh] bg-white rounded-lg"/>:<img src={url} alt={title} className="max-w-none object-contain transition-transform duration-150 select-none" style={{transform:`scale(${zoom}) rotate(${rotation}deg)`,maxHeight:zoom<=1?'calc(100vh - 130px)':undefined,maxWidth:zoom<=1?'100%':undefined}}/>}
          <div className="pointer-events-none absolute inset-x-4 bottom-5 text-center text-white/30 font-bold tracking-[0.25em] text-xs sm:text-sm rotate-[-8deg]">{watermark}</div>
          {isPdf&&<div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-black/60 text-white text-xs flex items-center gap-2"><ChevronLeft className="w-3 h-3"/> Use the PDF viewer controls for page navigation, zoom and fit <ChevronRight className="w-3 h-3"/></div>}
        </main>
        <aside className="bg-white dark:bg-gray-900 border-t lg:border-t-0 lg:border-l border-gray-200 dark:border-gray-800 p-4 overflow-auto max-h-52 lg:max-h-none">
          <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100 mb-3">Document metadata</h3><dl className="space-y-3">{metadata.map((item)=><div key={item.label}><dt className="text-xs text-gray-400">{item.label}</dt><dd className="text-sm text-gray-800 dark:text-gray-200 break-words">{item.value||'—'}</dd></div>)}</dl>
          <div className="mt-5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-3"><p className="text-xs text-amber-800 dark:text-amber-200">Viewing is permission-gated. This preview does not make the source object public and does not alter the stored original.</p></div>
        </aside>
      </div>
      <style>{`.viewer-btn{display:inline-flex;align-items:center;justify-content:center;width:2.25rem;height:2.25rem;border-radius:.65rem;color:#6b7280}.viewer-btn:hover{background:#f3f4f6}.viewer-btn:disabled{opacity:.45}`}</style>
    </div>
  </div>;
}
