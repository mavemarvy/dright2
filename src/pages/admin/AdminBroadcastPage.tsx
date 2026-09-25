import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check, Copy, Link as LinkIcon, Loader2, Megaphone, Radio, RefreshCw,
  Send, Settings, Shield, Users, X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

type BroadcastChat = {
  id: string;
  chat_id: string;
  chat_type: 'group' | 'supergroup' | 'channel' | 'private';
  title: string | null;
  username: string | null;
  bot_status: string;
  bot_permissions: Record<string, boolean>;
  is_active: boolean;
  publish_enabled: boolean;
  moderation_enabled: boolean;
  welcome_enabled: boolean;
  join_requests_enabled: boolean;
  request_invite_link: string | null;
  last_seen_at: string;
};

type JoinRequest = {
  id: string;
  chat_id: string;
  telegram_user_id: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  requested_at: string;
};

type BroadcastCampaign = {
  id: string;
  source_type: string;
  title: string | null;
  status: string;
  stats: Record<string, number>;
  created_at: string;
};

type BroadcastSettings = {
  support_bot_username: string;
  welcome_enabled: boolean;
  welcome_template: string;
  welcome_delete_after_seconds: number;
  moderation_enabled: boolean;
  delete_blocked_messages: boolean;
  blocked_terms: string[];
  support_redirect_terms: string[];
  auto_create_join_request_link: boolean;
  private_broadcasts_enabled: boolean;
  news_broadcasts_enabled: boolean;
  promotion_broadcasts_enabled: boolean;
  recommendation_broadcasts_enabled: boolean;
};

type BroadcastState = {
  chats: BroadcastChat[];
  pending_join_requests: JoinRequest[];
  campaigns: BroadcastCampaign[];
  settings: BroadcastSettings | null;
  active_subscriber_count: number;
};

const emptyState: BroadcastState = {
  chats: [],
  pending_join_requests: [],
  campaigns: [],
  settings: null,
  active_subscriber_count: 0,
};

async function invoke(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('telegram-broadcast-admin', { body });
  if (error) throw error;
  if (!data?.success) throw new Error(data?.error || 'Broadcast request failed');
  return data;
}

export default function AdminBroadcastPage() {
  const [state, setState] = useState<BroadcastState>(emptyState);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [tab, setTab] = useState<'destinations' | 'publish' | 'settings'>('destinations');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await invoke({ action: 'list_state' });
      setState({
        chats: data.chats || [],
        pending_join_requests: data.pending_join_requests || [],
        campaigns: data.campaigns || [],
        settings: data.settings || null,
        active_subscriber_count: Number(data.active_subscriber_count || 0),
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load Dright Broadcast.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const groups = state.chats.filter(chat => chat.chat_type === 'group' || chat.chat_type === 'supergroup');
  const channels = state.chats.filter(chat => chat.chat_type === 'channel');
  const recentSent = state.campaigns.filter(campaign => campaign.status === 'sent').length;

  const act = async (key: string, body: Record<string, unknown>, message?: string) => {
    setWorking(key);
    setError(null);
    setSaved(null);
    try {
      await invoke(body);
      if (message) setSaved(message);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Action failed.');
    } finally {
      setWorking(null);
    }
  };

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-blue-500">
            <Radio className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black text-gray-900 dark:text-white">Broadcast & Community</h1>
            <p className="text-sm text-gray-500">Dright Broadcast destinations, promotions, join requests and moderation.</p>
          </div>
        </div>
        <button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">{error}</div>}
      {saved && <div className="mb-4 rounded-2xl border border-green-200 bg-green-50 p-3 text-sm text-green-700 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-300">{saved}</div>}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Groups" value={groups.length} icon={Users} />
        <Metric label="Channels" value={channels.length} icon={Megaphone} />
        <Metric label="Private subscribers" value={state.active_subscriber_count} icon={Radio} />
        <Metric label="Sent broadcasts" value={recentSent} icon={Send} />
      </div>

      <div className="mb-6 flex gap-2 overflow-x-auto">
        {([
          ['destinations', 'Destinations', Radio],
          ['publish', 'Publish', Send],
          ['settings', 'Settings', Settings],
        ] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key)} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${tab === key ? 'bg-primary-600 text-white' : 'border border-gray-200 bg-white text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'}`}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-primary-600" /></div>
      ) : tab === 'destinations' ? (
        <DestinationsTab
          chats={state.chats}
          requests={state.pending_join_requests}
          working={working}
          act={act}
        />
      ) : tab === 'publish' ? (
        <PublishTab campaigns={state.campaigns} working={working} act={act} />
      ) : (
        <SettingsTab settings={state.settings} working={working} act={act} />
      )}
    </div>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Users }) {
  return <div className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
    <div className="mb-1 flex items-center gap-2 text-xs text-gray-400"><Icon className="h-4 w-4 text-primary-500" />{label}</div>
    <p className="text-2xl font-black text-gray-900 dark:text-white">{value}</p>
  </div>;
}

function DestinationsTab({
  chats, requests, working, act,
}: {
  chats: BroadcastChat[];
  requests: JoinRequest[];
  working: string | null;
  act: (key: string, body: Record<string, unknown>, message?: string) => Promise<void>;
}) {
  if (chats.length === 0) {
    return <div className="rounded-3xl border border-dashed border-gray-300 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-900">
      <Radio className="mx-auto h-8 w-8 text-gray-300" />
      <h2 className="mt-3 font-black text-gray-900 dark:text-white">No Telegram destination discovered yet</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-gray-500">Send one new message in the group and publish one new post in the channel after adding @Dright_broadcast_bot as an administrator. Their names and permissions will appear here automatically.</p>
    </div>;
  }

  return <div className="space-y-6">
    <div className="grid gap-4 lg:grid-cols-2">
      {chats.map(chat => <ChatCard key={chat.id} chat={chat} working={working} act={act} />)}
    </div>

    <section className="rounded-3xl border border-gray-100 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
      <div className="mb-4 flex items-center gap-2">
        <Shield className="h-5 w-5 text-primary-600" />
        <div>
          <h2 className="font-black text-gray-900 dark:text-white">Pending join requests</h2>
          <p className="text-xs text-gray-500">Approval is manual by design.</p>
        </div>
      </div>
      {requests.length === 0 ? <p className="text-sm text-gray-400">No pending requests.</p> : (
        <div className="space-y-2">
          {requests.map(request => {
            const name = [request.first_name, request.last_name].filter(Boolean).join(' ') || request.username || 'Telegram user';
            return <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-100 p-3 dark:border-gray-800">
              <div><p className="font-bold text-gray-900 dark:text-white">{name}</p><p className="text-xs text-gray-400">{new Date(request.requested_at).toLocaleString()}</p></div>
              <div className="flex gap-2">
                <button disabled={working === `join:${request.id}`} onClick={() => void act(`join:${request.id}`, { action: 'decide_join_request', chat_id: request.chat_id, telegram_user_id: request.telegram_user_id, decision: 'approve' }, 'Join request approved.')} className="inline-flex items-center gap-1 rounded-xl bg-green-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Check className="h-4 w-4" />Approve</button>
                <button disabled={working === `join:${request.id}`} onClick={() => void act(`join:${request.id}`, { action: 'decide_join_request', chat_id: request.chat_id, telegram_user_id: request.telegram_user_id, decision: 'decline' }, 'Join request declined.')} className="inline-flex items-center gap-1 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-600 disabled:opacity-50 dark:bg-red-950/30"><X className="h-4 w-4" />Decline</button>
              </div>
            </div>;
          })}
        </div>
      )}
    </section>
  </div>;
}

function ChatCard({
  chat, working, act,
}: {
  chat: BroadcastChat;
  working: string | null;
  act: (key: string, body: Record<string, unknown>, message?: string) => Promise<void>;
}) {
  const [title, setTitle] = useState(chat.title || '');
  const [description, setDescription] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');

  const updateToggle = (field: 'publish_enabled' | 'moderation_enabled' | 'welcome_enabled' | 'join_requests_enabled', value: boolean) =>
    act(`chat:${chat.id}`, { action: 'update_chat', chat_id: chat.chat_id, [field]: value }, 'Destination updated.');

  return <article className="rounded-3xl border border-gray-100 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-black text-gray-900 dark:text-white">{chat.title || 'Untitled Telegram destination'}</h2>
          <span className="rounded-full bg-primary-50 px-2 py-1 text-[10px] font-black uppercase text-primary-600 dark:bg-primary-950/40">{chat.chat_type}</span>
        </div>
        <p className="mt-1 text-xs text-gray-400">Bot status: {chat.bot_status} · last seen {new Date(chat.last_seen_at).toLocaleString()}</p>
      </div>
      <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${chat.is_active ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>{chat.is_active ? 'Active' : 'Inactive'}</span>
    </div>

    <div className="grid gap-2 sm:grid-cols-2">
      <Toggle label="Broadcast publishing" checked={chat.publish_enabled} onChange={value => void updateToggle('publish_enabled', value)} />
      <Toggle label="Join-request mode" checked={chat.join_requests_enabled} onChange={value => void updateToggle('join_requests_enabled', value)} />
      {(chat.chat_type === 'group' || chat.chat_type === 'supergroup') && <>
        <Toggle label="Welcome messages" checked={chat.welcome_enabled} onChange={value => void updateToggle('welcome_enabled', value)} />
        <Toggle label="Message moderation" checked={chat.moderation_enabled} onChange={value => void updateToggle('moderation_enabled', value)} />
      </>}
    </div>

    <div className="mt-4 space-y-2">
      <div className="flex gap-2">
        <input value={title} onChange={event => setTitle(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700" placeholder="Telegram name" />
        <button disabled={!title.trim() || working === `title:${chat.id}`} onClick={() => void act(`title:${chat.id}`, { action: 'set_title', chat_id: chat.chat_id, title }, 'Telegram name updated.')} className="rounded-xl bg-gray-950 px-3 py-2 text-xs font-bold text-white disabled:opacity-40 dark:bg-white dark:text-gray-950">Rename</button>
      </div>
      <div className="flex gap-2">
        <input value={description} onChange={event => setDescription(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700" placeholder="New group/channel description" />
        <button disabled={working === `description:${chat.id}`} onClick={() => void act(`description:${chat.id}`, { action: 'set_description', chat_id: chat.chat_id, description }, 'Telegram description updated.')} className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-bold dark:border-gray-700">Save</button>
      </div>
      <div className="flex gap-2">
        <input value={photoUrl} onChange={event => setPhotoUrl(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700" placeholder="DRIGHT/Supabase HTTPS image URL" />
        <button disabled={!photoUrl.trim() || working === `photo:${chat.id}`} onClick={() => void act(`photo:${chat.id}`, { action: 'set_photo', chat_id: chat.chat_id, photo_url: photoUrl }, 'Telegram photo updated.')} className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-bold dark:border-gray-700">Set photo</button>
      </div>
    </div>

    <div className="mt-4 flex flex-wrap gap-2">
      <button disabled={working === `link:${chat.id}`} onClick={() => void act(`link:${chat.id}`, { action: 'create_join_request_link', chat_id: chat.chat_id }, 'Request-to-join invite link created.')} className="inline-flex items-center gap-2 rounded-xl bg-primary-50 px-3 py-2 text-xs font-bold text-primary-700 dark:bg-primary-950/30 dark:text-primary-300"><LinkIcon className="h-4 w-4" />Create request-to-join link</button>
      {chat.request_invite_link && <button onClick={() => void navigator.clipboard.writeText(chat.request_invite_link || '')} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-xs font-bold dark:border-gray-700"><Copy className="h-4 w-4" />Copy invite link</button>}
    </div>

    <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] text-gray-500">
      {Object.entries(chat.bot_permissions || {}).filter(([, value]) => value).map(([key]) => <span key={key} className="rounded-lg bg-gray-50 px-2 py-1 dark:bg-gray-800">{key.replace(/^can_/, '').replaceAll('_', ' ')}</span>)}
    </div>
  </article>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex cursor-pointer items-center justify-between rounded-xl border border-gray-100 p-3 text-sm font-semibold text-gray-700 dark:border-gray-800 dark:text-gray-200">
    {label}
    <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} className="h-4 w-4 accent-primary-600" />
  </label>;
}

function PublishTab({
  campaigns, working, act,
}: {
  campaigns: BroadcastCampaign[];
  working: string | null;
  act: (key: string, body: Record<string, unknown>, message?: string) => Promise<void>;
}) {
  const [sourceType, setSourceType] = useState<'news' | 'recommendation'>('news');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [ctaUrl, setCtaUrl] = useState('https://dright.store');

  const canPublish = title.trim() || body.trim();

  return <div className="grid gap-5 lg:grid-cols-[1fr_.8fr]">
    <section className="rounded-3xl border border-gray-100 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
      <div className="mb-4 flex items-center gap-2"><Send className="h-5 w-5 text-primary-600" /><h2 className="font-black text-gray-900 dark:text-white">Publish broadcast</h2></div>
      <div className="space-y-3">
        <select value={sourceType} onChange={event => setSourceType(event.target.value as 'news' | 'recommendation')} className="w-full rounded-xl border border-gray-200 bg-transparent px-3 py-2.5 text-sm dark:border-gray-700">
          <option value="news">News / announcement</option>
          <option value="recommendation">Recommendation</option>
        </select>
        <input value={title} onChange={event => setTitle(event.target.value)} className="w-full rounded-xl border border-gray-200 bg-transparent px-3 py-2.5 text-sm dark:border-gray-700" placeholder="Title" />
        <textarea value={body} onChange={event => setBody(event.target.value)} rows={7} className="w-full rounded-xl border border-gray-200 bg-transparent px-3 py-2.5 text-sm dark:border-gray-700" placeholder="Broadcast message" />
        <input value={mediaUrl} onChange={event => setMediaUrl(event.target.value)} className="w-full rounded-xl border border-gray-200 bg-transparent px-3 py-2.5 text-sm dark:border-gray-700" placeholder="Optional image/video HTTPS URL" />
        <input value={ctaUrl} onChange={event => setCtaUrl(event.target.value)} className="w-full rounded-xl border border-gray-200 bg-transparent px-3 py-2.5 text-sm dark:border-gray-700" placeholder="CTA URL" />
        <button disabled={!canPublish || working === 'publish'} onClick={() => void act('publish', {
          action: 'publish',
          source_type: sourceType,
          title,
          body,
          media_url: mediaUrl || undefined,
          media_type: mediaUrl ? (/.+\.(mp4|webm|mov)(\?|$)/i.test(mediaUrl) ? 'video' : 'image') : undefined,
          cta_label: 'Open DRIGHT',
          cta_url: ctaUrl,
          publish_to_chats: true,
          publish_to_subscribers: true,
          idempotency_key: `admin:${sourceType}:${Date.now()}`,
        }, 'Broadcast queued and processed.')} className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-40">
          {working === 'publish' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Publish to external platforms
        </button>
      </div>
    </section>

    <section className="rounded-3xl border border-gray-100 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
      <h2 className="mb-4 font-black text-gray-900 dark:text-white">Recent broadcasts</h2>
      <div className="space-y-2">
        {campaigns.slice(0, 15).map(campaign => <div key={campaign.id} className="rounded-2xl border border-gray-100 p-3 dark:border-gray-800">
          <div className="flex items-center justify-between gap-3"><p className="min-w-0 truncate text-sm font-bold text-gray-900 dark:text-white">{campaign.title || campaign.source_type}</p><span className="text-[10px] font-black uppercase text-gray-400">{campaign.status}</span></div>
          <p className="mt-1 text-xs text-gray-400">{campaign.source_type} · {new Date(campaign.created_at).toLocaleString()}</p>
          {campaign.stats && <p className="mt-1 text-xs text-gray-500">Sent {Number(campaign.stats.sent || 0)} · Failed {Number(campaign.stats.failed || 0)}</p>}
        </div>)}
        {campaigns.length === 0 && <p className="text-sm text-gray-400">No broadcasts yet.</p>}
      </div>
    </section>
  </div>;
}

function SettingsTab({
  settings, working, act,
}: {
  settings: BroadcastSettings | null;
  working: string | null;
  act: (key: string, body: Record<string, unknown>, message?: string) => Promise<void>;
}) {
  const initial = useMemo(() => settings || {
    support_bot_username: 'DrightSupportBot',
    welcome_enabled: true,
    welcome_template: 'Welcome, {name}, to {chat}. For private support, use @DrightSupportBot.',
    welcome_delete_after_seconds: 180,
    moderation_enabled: true,
    delete_blocked_messages: true,
    blocked_terms: [],
    support_redirect_terms: ['fraud', 'scam', 'dispute', 'allegation'],
    auto_create_join_request_link: true,
    private_broadcasts_enabled: true,
    news_broadcasts_enabled: true,
    promotion_broadcasts_enabled: true,
    recommendation_broadcasts_enabled: true,
  }, [settings]);
  const [form, setForm] = useState(initial);

  useEffect(() => setForm(initial), [initial]);

  return <section className="max-w-3xl rounded-3xl border border-gray-100 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
    <div className="mb-5 flex items-center gap-2"><Settings className="h-5 w-5 text-primary-600" /><h2 className="font-black text-gray-900 dark:text-white">Community automation settings</h2></div>
    <div className="grid gap-3 sm:grid-cols-2">
      <Toggle label="Welcome automation" checked={form.welcome_enabled} onChange={value => setForm(current => ({ ...current, welcome_enabled: value }))} />
      <Toggle label="Moderation automation" checked={form.moderation_enabled} onChange={value => setForm(current => ({ ...current, moderation_enabled: value }))} />
      <Toggle label="Delete moderated messages" checked={form.delete_blocked_messages} onChange={value => setForm(current => ({ ...current, delete_blocked_messages: value }))} />
      <Toggle label="Auto request-to-join links" checked={form.auto_create_join_request_link} onChange={value => setForm(current => ({ ...current, auto_create_join_request_link: value }))} />
      <Toggle label="Private bot broadcasts" checked={form.private_broadcasts_enabled} onChange={value => setForm(current => ({ ...current, private_broadcasts_enabled: value }))} />
      <Toggle label="News broadcasts" checked={form.news_broadcasts_enabled} onChange={value => setForm(current => ({ ...current, news_broadcasts_enabled: value }))} />
      <Toggle label="Promotion broadcasts" checked={form.promotion_broadcasts_enabled} onChange={value => setForm(current => ({ ...current, promotion_broadcasts_enabled: value }))} />
      <Toggle label="Recommendation broadcasts" checked={form.recommendation_broadcasts_enabled} onChange={value => setForm(current => ({ ...current, recommendation_broadcasts_enabled: value }))} />
    </div>

    <label className="mt-4 block text-sm font-bold text-gray-700 dark:text-gray-200">Welcome auto-delete seconds
      <input type="number" min={30} max={86400} value={form.welcome_delete_after_seconds} onChange={event => setForm(current => ({ ...current, welcome_delete_after_seconds: Number(event.target.value) }))} className="mt-1 w-full rounded-xl border border-gray-200 bg-transparent px-3 py-2.5 text-sm dark:border-gray-700" />
    </label>
    <label className="mt-4 block text-sm font-bold text-gray-700 dark:text-gray-200">Welcome message
      <textarea rows={4} value={form.welcome_template} onChange={event => setForm(current => ({ ...current, welcome_template: event.target.value }))} className="mt-1 w-full rounded-xl border border-gray-200 bg-transparent px-3 py-2.5 text-sm dark:border-gray-700" />
      <span className="mt-1 block text-xs font-normal text-gray-400">Use {'{name}'} and {'{chat}'}. The support link is @DrightSupportBot.</span>
    </label>
    <label className="mt-4 block text-sm font-bold text-gray-700 dark:text-gray-200">Blocked terms
      <textarea rows={3} value={form.blocked_terms.join(', ')} onChange={event => setForm(current => ({ ...current, blocked_terms: event.target.value.split(',').map(value => value.trim()).filter(Boolean) }))} className="mt-1 w-full rounded-xl border border-gray-200 bg-transparent px-3 py-2.5 text-sm dark:border-gray-700" placeholder="term one, term two" />
    </label>
    <label className="mt-4 block text-sm font-bold text-gray-700 dark:text-gray-200">Redirect-to-support terms
      <textarea rows={3} value={form.support_redirect_terms.join(', ')} onChange={event => setForm(current => ({ ...current, support_redirect_terms: event.target.value.split(',').map(value => value.trim()).filter(Boolean) }))} className="mt-1 w-full rounded-xl border border-gray-200 bg-transparent px-3 py-2.5 text-sm dark:border-gray-700" />
    </label>

    <button disabled={working === 'settings'} onClick={() => void act('settings', { action: 'update_settings', ...form }, 'Broadcast settings saved.')} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-40">
      {working === 'settings' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save settings
    </button>
  </section>;
}
