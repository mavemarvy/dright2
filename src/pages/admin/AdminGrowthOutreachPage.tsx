import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  Ban,
  BarChart3,
  Bot,
  CheckCircle2,
  Clock3,
  Inbox,
  LayoutTemplate,
  Loader2,
  Mail,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  Settings,
  Pause,
  Play,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

type ConversationStatus = 'new'|'interested'|'needs_reply'|'follow_up'|'not_interested'|'unsubscribed'|'archived';

type Conversation = {
  id: string;
  prospect_email: string;
  prospect_name: string | null;
  company_name: string | null;
  role_segment: string;
  status: ConversationStatus;
  subject: string | null;
  unread_count: number;
  auto_reply_enabled: boolean;
  auto_replies_sent: number;
  last_message_at: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  created_at: string;
};

type OutreachMessage = {
  id: string;
  conversation_id: string;
  direction: 'inbound'|'outbound';
  from_email: string;
  to_email: string;
  subject: string | null;
  text_body: string | null;
  auto_generated: boolean;
  delivery_status: string;
  created_at: string;
};

type AutoReplyRule = {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  priority: number;
  trigger_type: string;
  keywords: string[];
  send_reply: boolean;
  safe_for_automatic: boolean;
  cooldown_hours: number;
  max_replies_per_conversation: number;
  reply_subject_template: string | null;
  reply_body_template: string | null;
  set_status: ConversationStatus | null;
};

type OutreachSettings = {
  singleton: boolean;
  auto_reply_enabled: boolean;
  safe_auto_reply_only: boolean;
  max_auto_replies_per_conversation_per_day: number;
  reply_from_name: string;
  reply_from_email: string;
  reply_to_email: string;
  inbox_email: string;
  logo_url: string;
  website_url: string;
  signup_url: string;
};

type EmailTemplate = {
  id: string;
  segment: string;
  name: string;
  enabled: boolean;
  subject_template: string;
  preheader_template: string | null;
  headline_template: string;
  body_template: string;
  benefits: string[];
  cta_label: string;
  cta_url: string;
};

type CampaignStatus = 'draft'|'scheduled'|'running'|'paused'|'completed'|'cancelled';

type Campaign = {
  id: string;
  name: string;
  segment: string;
  status: CampaignStatus;
  source_type: string;
  source_label: string | null;
  hourly_limit: number;
  daily_limit: number;
  adaptive_throttle: boolean;
  max_audience_size: number;
  target_count: number;
  scheduled_count: number;
  queued_count: number;
  sent_count: number;
  delivered_count: number;
  bounced_count: number;
  complained_count: number;
  failed_count: number;
  skipped_count: number;
  replied_count: number;
  unsubscribed_count: number;
  remaining_count: number;
  start_at: string | null;
  stop_at: string | null;
  last_dispatch_at: string | null;
  created_at: string;
};

const STATUS_META: Record<ConversationStatus, { label: string; cls: string }> = {
  new: { label: 'New', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  interested: { label: 'Interested', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  needs_reply: { label: 'Needs Reply', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  follow_up: { label: 'Follow-up', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  not_interested: { label: 'Not Interested', cls: 'bg-gray-100 text-gray-600 border-gray-200' },
  unsubscribed: { label: 'Unsubscribed', cls: 'bg-red-50 text-red-700 border-red-200' },
  archived: { label: 'Archived', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
};

function fmt(date: string | null) {
  if (!date) return '—';
  return new Date(date).toLocaleString('en-US', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
}

function statusIcon(status: ConversationStatus) {
  if (status === 'interested') return CheckCircle2;
  if (status === 'needs_reply') return MessageSquare;
  if (status === 'follow_up') return Clock3;
  if (status === 'unsubscribed') return Ban;
  if (status === 'archived') return Archive;
  return Mail;
}

export default function AdminGrowthOutreachPage() {
  const [tab, setTab] = useState<'campaigns'|'inbox'|'rules'|'templates'|'settings'>('campaigns');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [rules, setRules] = useState<AutoReplyRule[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [settings, setSettings] = useState<OutreachSettings | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<OutreachMessage[]>([]);
  const [filter, setFilter] = useState<'all'|ConversationStatus>('all');
  const [search, setSearch] = useState('');
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [convRes, campaignRes, ruleRes, settingsRes, templateRes] = await Promise.all([
        supabase.from('outreach_conversations').select('*').order('last_message_at', { ascending:false, nullsFirst:false }),
        supabase.from('outreach_campaigns').select('*').order('created_at', { ascending:false }),
        supabase.from('outreach_auto_reply_rules').select('*').order('priority', { ascending:true }),
        supabase.from('outreach_settings').select('*').eq('singleton', true).maybeSingle(),
        supabase.from('outreach_email_templates').select('*').order('segment', { ascending:true }),
      ]);
      if (convRes.error) throw convRes.error;
      if (campaignRes.error) throw campaignRes.error;
      if (ruleRes.error) throw ruleRes.error;
      if (settingsRes.error) throw settingsRes.error;
      if (templateRes.error) throw templateRes.error;
      setConversations((convRes.data || []) as Conversation[]);
      setCampaigns((campaignRes.data || []) as Campaign[]);
      setRules((ruleRes.data || []) as AutoReplyRule[]);
      setSettings((settingsRes.data || null) as OutreachSettings | null);
      setTemplates((templateRes.data || []) as EmailTemplate[]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load Growth & Outreach.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMessages = useCallback(async (conversationId: string) => {
    setDetailLoading(true);
    try {
      const { data, error: queryError } = await supabase
        .from('outreach_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending:true });
      if (queryError) throw queryError;
      setMessages((data || []) as OutreachMessage[]);
      await supabase.from('outreach_conversations').update({ unread_count:0, updated_at:new Date().toISOString() }).eq('id', conversationId);
      setConversations(current => current.map(item => item.id === conversationId ? { ...item, unread_count:0 } : item));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load conversation.');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    void loadMessages(selectedId);
  }, [selectedId, loadMessages]);

  useEffect(() => {
    const channel = supabase.channel('admin-growth-outreach-live')
      .on('postgres_changes', { event:'*', schema:'public', table:'outreach_conversations' }, () => void load())
      .on('postgres_changes', { event:'*', schema:'public', table:'outreach_campaigns' }, () => void load())
      .on('postgres_changes', { event:'*', schema:'public', table:'outreach_campaign_recipients' }, () => void load())
      .on('postgres_changes', { event:'*', schema:'public', table:'outreach_messages' }, payload => {
        const row = payload.new as Partial<OutreachMessage>;
        if (selectedId && row.conversation_id === selectedId) void loadMessages(selectedId);
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load, loadMessages, selectedId]);

  const selected = conversations.find(item => item.id === selectedId) || null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return conversations.filter(item => {
      if (filter !== 'all' && item.status !== filter) return false;
      if (!q) return true;
      return [item.prospect_email,item.prospect_name,item.company_name,item.subject,item.role_segment]
        .filter(Boolean).some(value => String(value).toLowerCase().includes(q));
    });
  }, [conversations, filter, search]);

  const stats = useMemo(() => ({
    total: conversations.length,
    unread: conversations.reduce((sum, item) => sum + Number(item.unread_count || 0), 0),
    interested: conversations.filter(item => item.status === 'interested').length,
    needsReply: conversations.filter(item => item.status === 'needs_reply').length,
    campaignSent: campaigns.reduce((sum,item)=>sum+Number(item.sent_count||0),0),
    campaignRemaining: campaigns.reduce((sum,item)=>sum+Number(item.remaining_count||0),0),
  }), [conversations,campaigns]);

  const updateConversation = async (id: string, changes: Partial<Conversation>) => {
    setWorking(`conversation:${id}`);
    setError(null);
    try {
      const { error: updateError } = await supabase.from('outreach_conversations')
        .update({ ...changes, updated_at:new Date().toISOString() })
        .eq('id', id);
      if (updateError) throw updateError;
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not update conversation.');
    } finally {
      setWorking(null);
    }
  };

  const sendReply = async () => {
    if (!selected || !reply.trim() || working) return;
    setWorking('reply');
    setError(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('outreach-reply', {
        body: { conversation_id:selected.id, message:reply.trim() },
      });
      if (invokeError) throw invokeError;
      if (data?.error) throw new Error(data.error);
      setReply('');
      await Promise.all([load(), loadMessages(selected.id)]);
      setSaved('Reply sent from DRIGHT Partnerships.');
      setTimeout(() => setSaved(null), 3000);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not send reply.');
    } finally {
      setWorking(null);
    }
  };

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 via-blue-600 to-cyan-500 shadow-lg shadow-blue-600/20">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black text-gray-900 dark:text-white">Growth & Outreach</h1>
            <p className="text-sm text-gray-500">Partnership inbox, safe auto replies and premium DRIGHT outreach templates.</p>
          </div>
        </div>
        <button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">{error}</div>}
      {saved && <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">{saved}</div>}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Metric label="Emails sent" value={stats.campaignSent} icon={Send} />
        <Metric label="Remaining" value={stats.campaignRemaining} icon={Clock3} />
        <Metric label="Conversations" value={stats.total} icon={Users} />
        <Metric label="Unread replies" value={stats.unread} icon={Inbox} />
        <Metric label="Interested" value={stats.interested} icon={CheckCircle2} />
        <Metric label="Needs reply" value={stats.needsReply} icon={MessageSquare} />
      </div>

      <div className="mb-5 flex gap-2 overflow-x-auto">
        {([
          ['campaigns','Campaigns',BarChart3],
          ['inbox','Partnership Inbox',Inbox],
          ['rules','Auto Replies',Bot],
          ['templates','Email Templates',LayoutTemplate],
          ['settings','Settings',Settings],
        ] as const).map(([key,label,Icon]) => (
          <button key={key} onClick={() => setTab(key)} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${tab === key ? 'bg-primary-600 text-white' : 'border border-gray-200 bg-white text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'}`}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary-600" /></div>
      ) : tab === 'campaigns' ? (
        <CampaignsTab campaigns={campaigns} reload={load} />
      ) : tab === 'inbox' ? (
        <InboxTab
          conversations={filtered}
          selected={selected}
          messages={messages}
          detailLoading={detailLoading}
          filter={filter}
          search={search}
          setFilter={setFilter}
          setSearch={setSearch}
          setSelectedId={setSelectedId}
          reply={reply}
          setReply={setReply}
          sendReply={sendReply}
          updateConversation={updateConversation}
          working={working}
        />
      ) : tab === 'rules' ? (
        <RulesTab rules={rules} setRules={setRules} reload={load} />
      ) : tab === 'templates' ? (
        <TemplatesTab templates={templates} setTemplates={setTemplates} reload={load} />
      ) : (
        <SettingsTab settings={settings} setSettings={setSettings} reload={load} />
      )}
    </div>
  );
}

function Metric({ label, value, icon:Icon }: { label:string; value:number; icon:typeof Users }) {
  return <div className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
    <div className="mb-1 flex items-center gap-2 text-xs text-gray-400"><Icon className="h-4 w-4 text-primary-500" />{label}</div>
    <p className="text-2xl font-black text-gray-900 dark:text-white">{Number(value||0).toLocaleString()}</p>
  </div>;
}

function CampaignsTab({ campaigns,reload }: { campaigns:Campaign[]; reload:()=>Promise<void> }) {
  const [working,setWorking] = useState<string|null>(null);
  const totals = campaigns.reduce((acc,item)=>({
    target:acc.target+Number(item.target_count||0),
    sent:acc.sent+Number(item.sent_count||0),
    remaining:acc.remaining+Number(item.remaining_count||0),
    queued:acc.queued+Number(item.queued_count||0),
    replied:acc.replied+Number(item.replied_count||0),
    delivered:acc.delivered+Number(item.delivered_count||0),
    bounced:acc.bounced+Number(item.bounced_count||0),
    complained:acc.complained+Number(item.complained_count||0),
    failed:acc.failed+Number(item.failed_count||0),
  }),{target:0,sent:0,remaining:0,queued:0,replied:0,delivered:0,bounced:0,complained:0,failed:0});

  const setStatus = async (campaign:Campaign,status:CampaignStatus) => {
    setWorking(campaign.id);
    await supabase.from('outreach_campaigns').update({status,updated_at:new Date().toISOString()}).eq('id',campaign.id);
    setWorking(null);
    await reload();
  };

  return <div className="space-y-4">
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
      <Metric label="Audience" value={totals.target} icon={Users}/>
      <Metric label="Sent" value={totals.sent} icon={Send}/>
      <Metric label="Delivered" value={totals.delivered} icon={CheckCircle2}/>
      <Metric label="Remaining" value={totals.remaining} icon={Clock3}/>
      <Metric label="Queued" value={totals.queued} icon={Mail}/>
      <Metric label="Replies" value={totals.replied} icon={MessageSquare}/>
      <Metric label="Bounced" value={totals.bounced} icon={Ban}/>
      <Metric label="Complaints" value={totals.complained} icon={ShieldCheck}/>
    </div>

    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-300">
      Campaign storage supports up to <strong>100,000,000 recipients per campaign</strong>. The queue can be much larger than the current send rate; delivery is released automatically according to sender reputation and configured limits. Only legitimate, relevant contacts should be imported.
    </div>

    {campaigns.length===0 ? (
      <div className="rounded-3xl border border-dashed border-gray-200 bg-white p-10 text-center text-sm text-gray-400 dark:border-gray-800 dark:bg-gray-900">No outreach campaigns yet.</div>
    ) : campaigns.map(campaign=>{
      const progress = campaign.target_count>0 ? Math.min(100,(Number(campaign.sent_count||0)/Number(campaign.target_count))*100) : 0;
      const processed = Number(campaign.sent_count||0)+Number(campaign.failed_count||0)+Number(campaign.skipped_count||0)+Number(campaign.unsubscribed_count||0);
      return <section key={campaign.id} className="rounded-3xl border border-gray-100 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-black text-gray-900 dark:text-white">{campaign.name}</h2>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${campaign.status==='running'?'bg-emerald-100 text-emerald-700':campaign.status==='paused'?'bg-amber-100 text-amber-700':campaign.status==='completed'?'bg-blue-100 text-blue-700':'bg-gray-100 text-gray-600'}`}>{campaign.status}</span>
            </div>
            <p className="mt-1 text-xs text-gray-400">{campaign.segment.replaceAll('_',' ')} · {campaign.source_label || campaign.source_type}</p>
          </div>
          <div className="flex gap-2">
            {campaign.status==='running' || campaign.status==='scheduled' ? (
              <button onClick={()=>void setStatus(campaign,'paused')} disabled={working===campaign.id} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-xs font-bold text-gray-600 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300"><Pause className="h-3.5 w-3.5"/> Pause</button>
            ) : campaign.status==='paused' || campaign.status==='draft' ? (
              <button onClick={()=>void setStatus(campaign,'running')} disabled={working===campaign.id} className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Play className="h-3.5 w-3.5"/> Run</button>
            ) : null}
          </div>
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
          <div className="h-full rounded-full bg-primary-600 transition-all" style={{width:`${progress}%`}}/>
        </div>
        <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-gray-400">
          <span>{progress.toFixed(1)}% sent</span>
          <span>{processed.toLocaleString()} processed of {Number(campaign.target_count||0).toLocaleString()}</span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-10">
          <CampaignValue label="Audience" value={campaign.target_count}/>
          <CampaignValue label="Sent" value={campaign.sent_count}/>
          <CampaignValue label="Delivered" value={campaign.delivered_count}/>
          <CampaignValue label="Remaining" value={campaign.remaining_count}/>
          <CampaignValue label="Scheduled" value={campaign.scheduled_count}/>
          <CampaignValue label="Queued" value={campaign.queued_count}/>
          <CampaignValue label="Replies" value={campaign.replied_count}/>
          <CampaignValue label="Bounced" value={campaign.bounced_count}/>
          <CampaignValue label="Complaints" value={campaign.complained_count}/>
          <CampaignValue label="Unsubscribed" value={campaign.unsubscribed_count}/>
        </div>

        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 border-t border-gray-100 pt-4 text-[11px] text-gray-400 dark:border-gray-800">
          <span>Campaign cap: {Number(campaign.max_audience_size||0).toLocaleString()}</span>
          <span>Campaign rate ceiling: {Number(campaign.hourly_limit||0).toLocaleString()}/hour · {Number(campaign.daily_limit||0).toLocaleString()}/day</span>
          <span>Last dispatch: {fmt(campaign.last_dispatch_at)}</span>
        </div>
      </section>;
    })}
  </div>;
}

function CampaignValue({label,value}:{label:string;value:number}) {
  return <div className="rounded-2xl bg-gray-50 p-3 dark:bg-gray-800">
    <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
    <p className="mt-1 text-base font-black text-gray-900 dark:text-white">{Number(value||0).toLocaleString()}</p>
  </div>;
}

function InboxTab(props: {
  conversations: Conversation[];
  selected: Conversation | null;
  messages: OutreachMessage[];
  detailLoading: boolean;
  filter:'all'|ConversationStatus;
  search:string;
  setFilter:(value:'all'|ConversationStatus)=>void;
  setSearch:(value:string)=>void;
  setSelectedId:(value:string|null)=>void;
  reply:string;
  setReply:(value:string)=>void;
  sendReply:()=>Promise<void>;
  updateConversation:(id:string, changes:Partial<Conversation>)=>Promise<void>;
  working:string|null;
}) {
  const { conversations,selected,messages,detailLoading,filter,search,setFilter,setSearch,setSelectedId,reply,setReply,sendReply,updateConversation,working } = props;
  return <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
    <section className="overflow-hidden rounded-3xl border border-gray-100 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="border-b border-gray-100 p-3 dark:border-gray-800">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search prospects..." className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary-500 dark:border-gray-700 dark:bg-gray-950" />
        </div>
        <select value={filter} onChange={e=>setFilter(e.target.value as 'all'|ConversationStatus)} className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900">
          <option value="all">All conversations</option>
          {Object.entries(STATUS_META).map(([key,value]) => <option key={key} value={key}>{value.label}</option>)}
        </select>
      </div>
      <div className="max-h-[68vh] overflow-y-auto">
        {conversations.length === 0 ? <div className="p-8 text-center text-sm text-gray-400">No partnership replies yet.</div> : conversations.map(item => {
          const Icon = statusIcon(item.status);
          return <button key={item.id} onClick={()=>setSelectedId(item.id)} className={`w-full border-b border-gray-100 p-4 text-left transition-colors hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/60 ${selected?.id===item.id ? 'bg-primary-50/70 dark:bg-primary-950/20' : ''}`}>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-500 dark:bg-gray-800"><Icon className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-bold text-gray-900 dark:text-white">{item.company_name || item.prospect_name || item.prospect_email}</p>
                  {item.unread_count > 0 && <span className="rounded-full bg-primary-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{item.unread_count}</span>}
                </div>
                <p className="truncate text-xs text-gray-400">{item.prospect_email}</p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATUS_META[item.status].cls}`}>{STATUS_META[item.status].label}</span>
                  <span className="text-[10px] text-gray-400">{fmt(item.last_message_at)}</span>
                </div>
              </div>
            </div>
          </button>;
        })}
      </div>
    </section>

    <section className="min-h-[520px] overflow-hidden rounded-3xl border border-gray-100 bg-white dark:border-gray-800 dark:bg-gray-900">
      {!selected ? (
        <div className="flex min-h-[520px] flex-col items-center justify-center p-8 text-center">
          <Inbox className="h-10 w-10 text-gray-300" />
          <h2 className="mt-3 font-black text-gray-900 dark:text-white">Select a partnership conversation</h2>
          <p className="mt-1 max-w-md text-sm text-gray-500">Replies sent to partnerships@dright.store appear here automatically.</p>
        </div>
      ) : <>
        <div className="border-b border-gray-100 p-5 dark:border-gray-800">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate font-black text-gray-900 dark:text-white">{selected.company_name || selected.prospect_name || selected.prospect_email}</h2>
              <p className="truncate text-xs text-gray-400">{selected.prospect_email} · {selected.role_segment.replaceAll('_',' ')}</p>
              <p className="mt-1 truncate text-sm text-gray-600 dark:text-gray-300">{selected.subject || 'No subject'}</p>
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold text-gray-600 dark:text-gray-300">
              <input type="checkbox" checked={selected.auto_reply_enabled} onChange={e=>void updateConversation(selected.id,{auto_reply_enabled:e.target.checked})} className="h-4 w-4 rounded" />
              Auto replies
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {(['interested','needs_reply','follow_up','not_interested','archived'] as ConversationStatus[]).map(status => (
              <button key={status} onClick={()=>void updateConversation(selected.id,{status})} disabled={working===`conversation:${selected.id}`} className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold ${selected.status===status ? STATUS_META[status].cls : 'border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-gray-700'}`}>
                {STATUS_META[status].label}
              </button>
            ))}
          </div>
        </div>

        <div className="max-h-[48vh] min-h-[310px] overflow-y-auto p-5">
          {detailLoading ? <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary-600" /></div> : messages.length===0 ? <p className="text-center text-sm text-gray-400">No messages in this thread.</p> : (
            <div className="space-y-3">
              {messages.map(message => {
                const outbound = message.direction === 'outbound';
                return <div key={message.id} className={`flex ${outbound ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[88%] rounded-2xl px-4 py-3 ${outbound ? 'rounded-tr-md bg-primary-600 text-white' : 'rounded-tl-md border border-gray-100 bg-gray-50 text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100'}`}>
                    <div className="mb-1 flex items-center gap-2 text-[10px] opacity-70">
                      <span>{outbound ? (message.auto_generated ? 'DRIGHT Auto Reply' : 'DRIGHT Partnerships') : message.from_email}</span>
                      <span>·</span><span>{fmt(message.created_at)}</span>
                      {message.auto_generated && <Bot className="h-3 w-3" />}
                    </div>
                    <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.text_body || '(HTML email — no plain text body)'}</p>
                  </div>
                </div>;
              })}
            </div>
          )}
        </div>

        {selected.status !== 'unsubscribed' && <div className="border-t border-gray-100 p-4 dark:border-gray-800">
          <textarea value={reply} onChange={e=>setReply(e.target.value)} rows={4} maxLength={8000} placeholder="Reply as DRIGHT Partnerships..." className="w-full resize-none rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-950" />
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-[11px] text-gray-400">Replies are sent from partnerships@mail.dright.store and return to partnerships@dright.store.</p>
            <button onClick={()=>void sendReply()} disabled={!reply.trim() || working==='reply'} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">
              {working==='reply' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send
            </button>
          </div>
        </div>}
      </>}
    </section>
  </div>;
}

function RulesTab({ rules,setRules,reload }: { rules:AutoReplyRule[]; setRules:(value:AutoReplyRule[])=>void; reload:()=>Promise<void> }) {
  const [saving,setSaving] = useState<string|null>(null);
  const [notice,setNotice] = useState<string|null>(null);

  const save = async (rule:AutoReplyRule) => {
    setSaving(rule.id); setNotice(null);
    const { error } = await supabase.from('outreach_auto_reply_rules').update({
      name:rule.name,
      description:rule.description,
      enabled:rule.enabled,
      priority:rule.priority,
      keywords:rule.keywords,
      send_reply:rule.send_reply,
      safe_for_automatic:rule.safe_for_automatic,
      cooldown_hours:rule.cooldown_hours,
      max_replies_per_conversation:rule.max_replies_per_conversation,
      reply_subject_template:rule.reply_subject_template,
      reply_body_template:rule.reply_body_template,
      set_status:rule.set_status,
      updated_at:new Date().toISOString(),
    }).eq('id',rule.id);
    setSaving(null);
    if (error) setNotice(error.message);
    else { setNotice('Auto-reply rule saved.'); await reload(); }
  };

  return <div className="space-y-4">
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300">
      <div className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /><p><strong>Safe-rule engine:</strong> automatic replies use explicit phrases, cooldowns and per-thread caps. Clear unsubscribe and rejection replies are never answered automatically.</p></div>
    </div>
    {notice && <p className="text-sm text-gray-500">{notice}</p>}
    {rules.map((rule,index) => <div key={rule.id} className="rounded-3xl border border-gray-100 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><Bot className="h-5 w-5 text-primary-600" /><h2 className="font-black text-gray-900 dark:text-white">{rule.name}</h2></div>
          <p className="mt-1 text-sm text-gray-500">{rule.description}</p>
        </div>
        <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={rule.enabled} onChange={e=>setRules(rules.map((r,i)=>i===index?{...r,enabled:e.target.checked}:r))} /> Enabled</label>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Field label="Trigger phrases">
          <textarea value={rule.keywords.join('\n')} onChange={e=>setRules(rules.map((r,i)=>i===index?{...r,keywords:e.target.value.split('\n').map(v=>v.trim()).filter(Boolean)}:r))} rows={5} className="w-full resize-y rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
        </Field>
        <Field label="Automatic reply text">
          <textarea value={rule.reply_body_template || ''} onChange={e=>setRules(rules.map((r,i)=>i===index?{...r,reply_body_template:e.target.value}:r))} rows={5} disabled={!rule.send_reply} className="w-full resize-y rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 disabled:opacity-50" />
        </Field>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <NumberField label="Priority" value={rule.priority} onChange={v=>setRules(rules.map((r,i)=>i===index?{...r,priority:v}:r))} />
        <NumberField label="Cooldown hours" value={rule.cooldown_hours} onChange={v=>setRules(rules.map((r,i)=>i===index?{...r,cooldown_hours:v}:r))} />
        <NumberField label="Max replies/thread" value={rule.max_replies_per_conversation} onChange={v=>setRules(rules.map((r,i)=>i===index?{...r,max_replies_per_conversation:v}:r))} />
        <Field label="Set status">
          <select value={rule.set_status || ''} onChange={e=>setRules(rules.map((r,i)=>i===index?{...r,set_status:(e.target.value||null) as ConversationStatus|null}:r))} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100">
            <option value="">No change</option>{Object.entries(STATUS_META).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
          </select>
        </Field>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-xs font-semibold text-gray-600 dark:text-gray-300"><input type="checkbox" checked={rule.send_reply} onChange={e=>setRules(rules.map((r,i)=>i===index?{...r,send_reply:e.target.checked}:r))} /> Send reply</label>
        <label className="flex items-center gap-2 text-xs font-semibold text-gray-600 dark:text-gray-300"><input type="checkbox" checked={rule.safe_for_automatic} onChange={e=>setRules(rules.map((r,i)=>i===index?{...r,safe_for_automatic:e.target.checked}:r))} /> Safe for automatic mode</label>
        <button onClick={()=>void save(rule)} disabled={saving===rule.id} className="ml-auto inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{saving===rule.id?<Loader2 className="h-4 w-4 animate-spin"/>:null}Save rule</button>
      </div>
    </div>)}
  </div>;
}

function TemplatesTab({ templates,setTemplates,reload }: { templates:EmailTemplate[]; setTemplates:(value:EmailTemplate[])=>void; reload:()=>Promise<void> }) {
  const [selectedSegment,setSelectedSegment] = useState(templates[0]?.segment || 'general');
  const [saving,setSaving] = useState(false);
  const template = templates.find(item=>item.segment===selectedSegment) || templates[0];

  useEffect(()=>{ if (!templates.some(t=>t.segment===selectedSegment) && templates[0]) setSelectedSegment(templates[0].segment); },[templates,selectedSegment]);

  if (!template) return <div className="rounded-3xl border border-dashed p-8 text-center text-gray-400">No templates configured.</div>;
  const index = templates.findIndex(item=>item.id===template.id);
  const patch = (changes:Partial<EmailTemplate>) => setTemplates(templates.map((item,i)=>i===index?{...item,...changes}:item));

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from('outreach_email_templates').update({
      name:template.name,
      enabled:template.enabled,
      subject_template:template.subject_template,
      preheader_template:template.preheader_template,
      headline_template:template.headline_template,
      body_template:template.body_template,
      benefits:template.benefits,
      cta_label:template.cta_label,
      cta_url:template.cta_url,
      updated_at:new Date().toISOString(),
    }).eq('id',template.id);
    setSaving(false);
    if (!error) await reload();
  };

  return <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
    <div className="rounded-3xl border border-gray-100 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
      {templates.map(item=><button key={item.id} onClick={()=>setSelectedSegment(item.segment)} className={`mb-1 w-full rounded-xl px-3 py-2.5 text-left text-sm font-bold ${item.segment===selectedSegment?'bg-primary-600 text-white':'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800'}`}>{item.name}</button>)}
    </div>
    <div className="rounded-3xl border border-gray-100 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center justify-between gap-3"><div><h2 className="font-black text-gray-900 dark:text-white">{template.name}</h2><p className="text-xs text-gray-400">Segment: {template.segment}</p></div><label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={template.enabled} onChange={e=>patch({enabled:e.target.checked})}/> Enabled</label></div>
      <div className="mt-4 grid gap-3">
        <Field label="Subject"><input value={template.subject_template} onChange={e=>patch({subject_template:e.target.value})} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /></Field>
        <Field label="Preheader"><input value={template.preheader_template || ''} onChange={e=>patch({preheader_template:e.target.value})} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /></Field>
        <Field label="Headline"><input value={template.headline_template} onChange={e=>patch({headline_template:e.target.value})} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /></Field>
        <Field label="Body"><textarea value={template.body_template} onChange={e=>patch({body_template:e.target.value})} rows={5} className="w-full resize-y rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /></Field>
        <Field label="Benefits — one per line"><textarea value={template.benefits.join('\n')} onChange={e=>patch({benefits:e.target.value.split('\n').map(v=>v.trim()).filter(Boolean)})} rows={4} className="w-full resize-y rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /></Field>
        <div className="grid gap-3 md:grid-cols-2"><Field label="CTA label"><input value={template.cta_label} onChange={e=>patch({cta_label:e.target.value})} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /></Field><Field label="CTA URL"><input value={template.cta_url} onChange={e=>patch({cta_url:e.target.value})} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /></Field></div>
      </div>
      <button onClick={()=>void save()} disabled={saving} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving?<Loader2 className="h-4 w-4 animate-spin"/>:<LayoutTemplate className="h-4 w-4"/>} Save template</button>
    </div>
  </div>;
}

function SettingsTab({ settings,setSettings,reload }: { settings:OutreachSettings|null; setSettings:(value:OutreachSettings|null)=>void; reload:()=>Promise<void> }) {
  const [saving,setSaving] = useState(false);
  if (!settings) return <div className="rounded-3xl border border-dashed p-8 text-center text-gray-400">Outreach settings unavailable.</div>;

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from('outreach_settings').update({
      auto_reply_enabled:settings.auto_reply_enabled,
      safe_auto_reply_only:settings.safe_auto_reply_only,
      max_auto_replies_per_conversation_per_day:settings.max_auto_replies_per_conversation_per_day,
      reply_from_name:settings.reply_from_name,
      reply_from_email:settings.reply_from_email,
      reply_to_email:settings.reply_to_email,
      inbox_email:settings.inbox_email,
      logo_url:settings.logo_url,
      website_url:settings.website_url,
      signup_url:settings.signup_url,
      updated_at:new Date().toISOString(),
    }).eq('singleton',true);
    setSaving(false);
    if (!error) await reload();
  };

  return <div className="grid gap-4 lg:grid-cols-2">
    <section className="rounded-3xl border border-gray-100 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center gap-2"><Bot className="h-5 w-5 text-primary-600"/><h2 className="font-black text-gray-900 dark:text-white">Auto-reply engine</h2></div>
      <div className="mt-4 space-y-4">
        <label className="flex items-start justify-between gap-4 rounded-2xl bg-gray-50 p-4 dark:bg-gray-800"><div><p className="font-bold text-gray-900 dark:text-white">Master auto replies</p><p className="text-xs text-gray-500">Allow safe matching rules to send automatic replies.</p></div><input type="checkbox" checked={settings.auto_reply_enabled} onChange={e=>setSettings({...settings,auto_reply_enabled:e.target.checked})} className="mt-1 h-5 w-5"/></label>
        <label className="flex items-start justify-between gap-4 rounded-2xl bg-gray-50 p-4 dark:bg-gray-800"><div><p className="font-bold text-gray-900 dark:text-white">Safe rules only</p><p className="text-xs text-gray-500">Do not run experimental or unapproved automatic rules.</p></div><input type="checkbox" checked={settings.safe_auto_reply_only} onChange={e=>setSettings({...settings,safe_auto_reply_only:e.target.checked})} className="mt-1 h-5 w-5"/></label>
        <NumberField label="Maximum auto replies per conversation / 24h" value={settings.max_auto_replies_per_conversation_per_day} onChange={v=>setSettings({...settings,max_auto_replies_per_conversation_per_day:v})}/>
      </div>
    </section>
    <section className="rounded-3xl border border-gray-100 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center gap-2"><Mail className="h-5 w-5 text-primary-600"/><h2 className="font-black text-gray-900 dark:text-white">Partnership identity</h2></div>
      <div className="mt-4 space-y-3">
        <Field label="Sender name"><input value={settings.reply_from_name} onChange={e=>setSettings({...settings,reply_from_name:e.target.value})} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"/></Field>
        <Field label="Sending address"><input value={settings.reply_from_email} onChange={e=>setSettings({...settings,reply_from_email:e.target.value})} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"/></Field>
        <Field label="Reply-To / Inbox"><input value={settings.reply_to_email} onChange={e=>setSettings({...settings,reply_to_email:e.target.value,inbox_email:e.target.value})} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"/></Field>
        <Field label="Logo URL"><input value={settings.logo_url} onChange={e=>setSettings({...settings,logo_url:e.target.value})} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"/></Field>
        <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Current routing</p>
          <p className="mt-2 text-sm font-bold text-gray-900 dark:text-white">{settings.reply_from_name} &lt;{settings.reply_from_email}&gt;</p>
          <p className="text-xs text-gray-500">Replies → {settings.reply_to_email}</p>
        </div>
      </div>
    </section>
    <button onClick={()=>void save()} disabled={saving} className="lg:col-span-2 inline-flex w-fit items-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving?<Loader2 className="h-4 w-4 animate-spin"/>:<Settings className="h-4 w-4"/>} Save outreach settings</button>
  </div>;
}

function Field({label,children}:{label:string;children:React.ReactNode}) {
  return <label className="block"><span className="mb-1.5 block text-xs font-bold text-gray-500">{label}</span>{children}</label>;
}
function NumberField({label,value,onChange}:{label:string;value:number;onChange:(value:number)=>void}) {
  return <Field label={label}><input type="number" min={0} value={value} onChange={e=>onChange(Math.max(0,Number(e.target.value)||0))} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"/></Field>;
}
