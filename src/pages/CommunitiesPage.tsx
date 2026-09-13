import { useCallback, useEffect, useState } from 'react';
import { CheckCircle, Compass, Loader2, Plus, Search, Users } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { fetchSocialRuntimeSettings } from '../lib/socialFeed';

type Community = {
  id: string; public_id: string; name: string; slug: string; description: string | null; avatar_url: string | null; banner_url: string | null;
  visibility: 'public' | 'private' | 'hidden'; category: string | null; country: string | null; location: string | null; member_count: number; post_count: number;
  is_verified: boolean; is_featured: boolean; created_at: string; viewer_role: string | null; viewer_state: string | null;
};
type Mode = 'discover' | 'mine' | 'recommended' | 'popular' | 'new';
const TABS: { value: Mode; label: string }[] = [{ value: 'discover', label: 'Discover' }, { value: 'mine', label: 'My Communities' }, { value: 'recommended', label: 'Recommended' }, { value: 'popular', label: 'Popular' }, { value: 'new', label: 'New' }];
const CATEGORIES = ['Marketplace', 'Business', 'Creators', 'Technology', 'Jobs', 'Education', 'Services', 'Fashion', 'Gaming', 'Lifestyle'];

export default function CommunitiesPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('discover');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [items, setItems] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creationEnabled, setCreationEnabled] = useState(true);
  const [threshold, setThreshold] = useState(100);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const search = [query.trim(), category].filter(Boolean).join(' ');
    const { data, error: e } = await supabase.rpc('list_communities', { p_mode: mode, p_query: search || null, p_limit: 50 });
    if (e) { setError(e.message); setItems([]); } else setItems((Array.isArray(data) ? data : []) as Community[]);
    setLoading(false);
  }, [category, mode, query]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 220); return () => window.clearTimeout(timer); }, [load]);
  useEffect(() => { void fetchSocialRuntimeSettings().then((settings) => { setCreationEnabled(settings.community?.creation_enabled !== false); setThreshold(Number(settings.community?.creation_min_followers || 100)); }).catch(() => undefined); }, []);

  const join = async (community: Community) => {
    const { data, error: e } = await supabase.rpc('join_or_request_community', { p_community_id: community.id });
    if (e) return setError(e.message);
    const result = (data || {}) as { state?: string };
    setItems((current) => current.map((item) => item.id === community.id ? { ...item, viewer_state: result.state || item.viewer_state, member_count: result.state === 'active' && item.viewer_state !== 'active' ? item.member_count + 1 : item.member_count } : item));
  };

  return <main className="min-h-screen bg-surface-muted pb-20"><div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
    <header className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 px-5 py-8 text-white shadow-xl sm:px-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between"><div><div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-bold"><Users className="h-4 w-4" />DRIGHT Communities</div><h1 className="mt-4 text-3xl font-black sm:text-4xl">Build, learn and grow together</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-white/65">Discover public communities, request access to private groups, follow conversations and share Social content without leaving DRIGHT.</p></div>{creationEnabled && <button onClick={() => navigate('/communities/create')} className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-black text-slate-950"><Plus className="h-4 w-4" />Create Community</button>}</div>
      <p className="mt-5 text-xs text-white/45">Community creation currently requires at least {threshold} followers. Super Admin can change this setting.</p>
    </header>

    <section className="mt-5 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex gap-2 overflow-x-auto pb-2">{TABS.map((tab) => <button key={tab.value} onClick={() => setMode(tab.value)} className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold ${mode === tab.value ? 'bg-primary-600 text-white' : 'bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-300'}`}>{tab.label}</button>)}</div>
      <div className="relative mt-2"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search community name, ID, category or keyword" className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-3 text-sm outline-none focus:border-primary-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white" /></div>
      <div className="mt-3 flex gap-2 overflow-x-auto">{CATEGORIES.map((value) => <button key={value} onClick={() => setCategory((current) => current === value ? null : value)} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold ${category === value ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300' : 'border-gray-200 text-gray-500 dark:border-gray-700 dark:text-gray-400'}`}>{value}</button>)}</div>
    </section>

    {error && <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">{error}</div>}
    {loading ? <div className="flex min-h-[340px] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary-600" /></div> : items.length === 0 ? <div className="mt-6 rounded-3xl border border-dashed border-gray-200 bg-white py-16 text-center dark:border-gray-800 dark:bg-gray-900"><Compass className="mx-auto h-12 w-12 text-gray-300" /><h2 className="mt-4 font-bold text-gray-900 dark:text-white">No communities found</h2><p className="mt-1 text-sm text-gray-500">Try another search or category.</p></div> : <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{items.map((community) => <article key={community.id} className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-gray-800 dark:bg-gray-900"><Link to={`/communities/${community.slug}`} className="block"><div className="relative h-28 bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-800">{community.banner_url && <img src={community.banner_url} alt="" className="h-full w-full object-cover" />}<span className="absolute right-3 top-3 rounded-full bg-black/45 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white backdrop-blur">{community.visibility}</span></div><div className="p-4"><div className="-mt-10 flex items-end gap-3">{community.avatar_url ? <img src={community.avatar_url} alt="" className="h-16 w-16 rounded-2xl border-4 border-white object-cover shadow dark:border-gray-900" /> : <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-4 border-white bg-primary-600 text-xl font-black text-white shadow dark:border-gray-900">{community.name.slice(0, 1).toUpperCase()}</div>}<div className="min-w-0 pb-1"><div className="flex items-center gap-1"><h2 className="truncate font-black text-gray-950 dark:text-white">{community.name}</h2>{community.is_verified && <CheckCircle className="h-4 w-4 shrink-0 text-blue-500" />}</div><p className="text-xs text-gray-400">#{community.public_id}</p></div></div><p className="mt-4 line-clamp-2 min-h-[40px] text-sm text-gray-500 dark:text-gray-400">{community.description || 'A DRIGHT community.'}</p><div className="mt-4 flex items-center justify-between text-xs text-gray-400"><span>{community.member_count.toLocaleString()} members</span><span>{community.post_count.toLocaleString()} posts</span></div></div></Link><div className="border-t border-gray-100 p-3 dark:border-gray-800">{community.viewer_state === 'active' ? <Link to={`/communities/${community.slug}`} className="flex min-h-[42px] items-center justify-center rounded-xl bg-gray-100 text-sm font-bold text-gray-700 dark:bg-gray-800 dark:text-gray-200">Open Community</Link> : community.viewer_state === 'pending' ? <button disabled className="w-full min-h-[42px] rounded-xl bg-amber-50 text-sm font-bold text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">Request pending</button> : <button onClick={() => void join(community)} className="w-full min-h-[42px] rounded-xl bg-primary-600 text-sm font-bold text-white hover:bg-primary-700">{community.visibility === 'private' ? 'Request to Join' : 'Join Community'}</button>}</div></article>)}</div>}
  </div></main>;
}
