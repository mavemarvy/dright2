import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AtSign, Bookmark, ExternalLink, Loader2, MessageCircle, Megaphone, Newspaper, Pin, Send, Share2,
  Sparkles, ThumbsUp, Trash2, TrendingUp, X,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import SeoHead from '../components/SeoHead';
import { supabase } from '../lib/supabase';

type ReactionType = 'like' | 'love' | 'care' | 'haha' | 'wow' | 'sad' | 'angry';
type Item = {
  id: string;
  title: string;
  message: string;
  type: string;
  content_kind: 'news' | 'announcement';
  show_in_news: boolean;
  show_in_notifications: boolean;
  is_active: boolean;
  is_pinned: boolean;
  is_trending: boolean;
  mention_all: boolean;
  comments_enabled: boolean;
  allowed_reactions: ReactionType[];
  view_count: number;
  hide_view_count: boolean;
  hide_reaction_count: boolean;
  media_url: string | null;
  media_type: 'image' | 'video' | null;
  external_url: string | null;
  cta_label: string | null;
  published_at: string;
};
type Engagement = {
  reaction_count: number;
  comment_count: number;
  save_count: number;
  reaction_breakdown: Record<string, number>;
  current_reaction: ReactionType | null;
  is_saved: boolean;
};
type Comment = {
  id: string;
  parent_comment_id: string | null;
  user_id: string;
  body: string;
  created_at: string;
  author_name: string;
  author_avatar: string | null;
  can_delete: boolean;
  reaction_count: number;
  reaction_breakdown: Record<string, number>;
  current_reaction: ReactionType | null;
  reply_count: number;
};

const EMPTY: Engagement = { reaction_count: 0, comment_count: 0, save_count: 0, reaction_breakdown: {}, current_reaction: null, is_saved: false };
const META: Record<ReactionType, { emoji: string; label: string }> = {
  like: { emoji: '👍', label: 'Like' }, love: { emoji: '❤️', label: 'Love' }, care: { emoji: '🤗', label: 'Care' },
  haha: { emoji: '😂', label: 'Haha' }, wow: { emoji: '😮', label: 'Wow' }, sad: { emoji: '😢', label: 'Sad' }, angry: { emoji: '😡', label: 'Angry' },
};
const ALL_REACTIONS = Object.keys(META) as ReactionType[];
const FILTERS = ['all', 'news', 'update', 'market', 'affiliate', 'announcement', 'promo', 'referral'];
function compact(n: number) { return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : String(n || 0); }

function ReactionButton({ item, e, onReact }: { item: Item; e: Engagement; onReact: (r: ReactionType) => void }) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);
  const allowed = item.allowed_reactions || [];
  const fallback = allowed.includes('like') ? 'like' : allowed[0];
  if (!allowed.length) return <span className="flex min-h-[44px] items-center justify-center text-xs text-neutral-600">Reactions off</span>;
  const down = () => { timer.current = window.setTimeout(() => setOpen(true), 430); };
  const clear = () => { if (timer.current) window.clearTimeout(timer.current); timer.current = null; };
  return <div className="relative flex justify-center">
    {open && <div className="absolute bottom-full z-40 mb-2 flex gap-1 rounded-2xl border border-white/10 bg-[#0d1320]/95 p-1.5 shadow-2xl backdrop-blur-xl">{allowed.map((r) => <button key={r} type="button" onClick={() => { setOpen(false); onReact(r); }} className="h-10 w-10 rounded-xl text-2xl hover:bg-white/10" title={META[r].label}>{META[r].emoji}</button>)}</div>}
    <button type="button" onPointerDown={down} onPointerUp={clear} onPointerCancel={clear} onDoubleClick={() => setOpen(true)} onClick={() => fallback && onReact(fallback)} className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold ${e.current_reaction ? 'text-[#8792ff]' : 'text-neutral-300 hover:bg-white/5'}`}>{e.current_reaction ? <span className="text-xl">{META[e.current_reaction].emoji}</span> : <ThumbsUp className="h-5 w-5" />}<span>{e.current_reaction ? META[e.current_reaction].label : 'React'}</span>{!item.hide_reaction_count && e.reaction_count > 0 && <span className="text-xs text-neutral-500">{compact(e.reaction_count)}</span>}</button>
  </div>;
}

function CommentReaction({ comment, onReact }: { comment: Comment; onReact: (reaction: ReactionType) => void }) {
  const [open, setOpen] = useState(false);
  return <div className="relative inline-flex items-center gap-1">
    {open && <div className="absolute bottom-7 left-0 z-50 flex gap-1 rounded-2xl border border-white/10 bg-[#0d1320]/95 p-1 shadow-xl">{ALL_REACTIONS.map((reaction) => <button key={reaction} type="button" onClick={() => { setOpen(false); onReact(reaction); }} className="h-8 w-8 rounded-lg text-lg hover:bg-white/10" title={META[reaction].label}>{META[reaction].emoji}</button>)}</div>}
    <button type="button" onClick={() => onReact(comment.current_reaction || 'like')} onContextMenu={(event) => { event.preventDefault(); setOpen(true); }} onDoubleClick={() => setOpen(true)} className="text-[11px] font-semibold text-neutral-500 hover:text-white">{comment.current_reaction ? META[comment.current_reaction].emoji : 'Like'}{comment.reaction_count > 0 ? ` ${compact(comment.reaction_count)}` : ''}</button>
    <button type="button" onClick={() => setOpen((value) => !value)} className="px-1 text-[10px] text-neutral-700">▾</button>
  </div>;
}

export default function NewsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const target = params.get('item');
  const focusComments = params.get('comments') === '1';
  const [items, setItems] = useState<Item[]>([]);
  const [engagement, setEngagement] = useState<Record<string, Engagement>>({});
  const [comments, setComments] = useState<Comment[]>([]);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [loading, setLoading] = useState(true);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');
  const viewed = useRef<string | null>(null);
  const commentInput = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    const { data } = await supabase.rpc('get_global_content_engagement', { p_content_ids: ids });
    const next: Record<string, Engagement> = {};
    for (const raw of data || []) {
      const x = raw as Record<string, unknown>;
      next[String(x.content_id)] = {
        reaction_count: Number(x.reaction_count || 0), comment_count: Number(x.comment_count || 0), save_count: Number(x.save_count || 0),
        reaction_breakdown: (x.reaction_breakdown || {}) as Record<string, number>, current_reaction: (x.current_reaction || null) as ReactionType | null, is_saved: Boolean(x.is_saved),
      };
    }
    setEngagement((cur) => ({ ...cur, ...next }));
  }, []);
  const loadComments = useCallback(async (id: string) => {
    setCommentsLoading(true);
    const { data, error: e } = await supabase.rpc('get_global_content_comments_v2', { p_content_id: id });
    if (e) setError(e.message); else setComments((data || []) as Comment[]);
    setCommentsLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      const { data, error: e } = await supabase.from('global_announcements')
        .select('id,title,message,type,content_kind,show_in_news,show_in_notifications,is_active,is_pinned,is_trending,mention_all,comments_enabled,allowed_reactions,view_count,hide_view_count,hide_reaction_count,media_url,media_type,external_url,cta_label,published_at')
        .eq('is_active', true)
        .or('content_kind.eq.news,show_in_news.eq.true')
        .order('published_at', { ascending: false });
      if (!active) return;
      if (e) { setError(e.message); setItems([]); }
      else { const list = (data || []) as Item[]; setItems(list); void refresh(list.map((x) => x.id)); }
      setLoading(false);
    })();
    return () => { active = false; };
  }, [refresh]);

  useEffect(() => {
    if (!target || loading || !items.some((x) => x.id === target)) return;
    requestAnimationFrame(() => document.getElementById(`news-${target}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    if (viewed.current !== target) {
      viewed.current = target;
      void supabase.rpc('record_global_content_view', { p_content_id: target }).then(({ data, error: e }) => {
        if (e) { setError(e.message); return; }
        const n = Number(data || 0);
        setItems((cur) => cur.map((x) => x.id === target ? { ...x, view_count: n } : x));
      });
    }
    setReplyTo(null);
    void loadComments(target);
    void refresh([target]);
  }, [items.length, loading, target, loadComments, refresh]);
  useEffect(() => { if (target && focusComments && !commentsLoading) window.setTimeout(() => commentInput.current?.focus(), 150); }, [target, focusComments, commentsLoading]);

  const shown = useMemo(() => items.filter((x) => filter === 'all' || (filter === 'announcement' ? x.content_kind === 'announcement' : x.type === filter)), [items, filter]);
  const children = useMemo(() => {
    const map = new Map<string, Comment[]>();
    for (const comment of comments) {
      if (!comment.parent_comment_id) continue;
      const group = map.get(comment.parent_comment_id) || [];
      group.push(comment); map.set(comment.parent_comment_id, group);
    }
    return map;
  }, [comments]);
  const roots = useMemo(() => comments.filter((comment) => !comment.parent_comment_id || !comments.some((candidate) => candidate.id === comment.parent_comment_id)), [comments]);

  const open = (id: string, commentsOpen = false) => setParams(commentsOpen ? { item: id, comments: '1' } : { item: id });
  const react = async (item: Item, r: ReactionType) => {
    if (busy) return;
    setBusy(item.id);
    const { data, error: e } = await supabase.rpc('set_global_content_reaction', { p_content_id: item.id, p_reaction: r });
    setBusy(null);
    if (e) return setError(e.message);
    const x = (data || {}) as Record<string, unknown>;
    setEngagement((cur) => ({ ...cur, [item.id]: { ...(cur[item.id] || EMPTY), reaction_count: Number(x.reaction_count || 0), reaction_breakdown: (x.reaction_breakdown || {}) as Record<string, number>, current_reaction: (x.reaction || null) as ReactionType | null } }));
  };
  const save = async (item: Item) => {
    const { data, error: e } = await supabase.rpc('toggle_global_content_save', { p_content_id: item.id });
    if (e) return setError(e.message);
    const x = (data || {}) as Record<string, unknown>;
    setEngagement((cur) => ({ ...cur, [item.id]: { ...(cur[item.id] || EMPTY), is_saved: Boolean(x.saved), save_count: Number(x.save_count || 0) } }));
  };
  const addComment = async (item: Item) => {
    const body = draft.trim();
    if (!body || !item.comments_enabled) return;
    setBusy(item.id);
    const request = replyTo
      ? supabase.rpc('add_global_content_reply', { p_content_id: item.id, p_parent_comment_id: replyTo.id, p_body: body })
      : supabase.rpc('add_global_content_comment', { p_content_id: item.id, p_body: body });
    const { data, error: e } = await request;
    setBusy(null);
    if (e) return setError(e.message);
    setDraft(''); setReplyTo(null);
    const x = (data || {}) as Record<string, unknown>;
    setEngagement((cur) => ({ ...cur, [item.id]: { ...(cur[item.id] || EMPTY), comment_count: Number(x.comment_count || 0) } }));
    await loadComments(item.id);
  };
  const delComment = async (item: Item, id: string) => {
    const { data, error: e } = await supabase.rpc('delete_own_global_content_comment', { p_comment_id: id });
    if (e) return setError(e.message);
    const result = (data || {}) as Record<string, unknown>;
    setEngagement((cur) => ({ ...cur, [item.id]: { ...(cur[item.id] || EMPTY), comment_count: Number(result.comment_count || 0) } }));
    await loadComments(item.id);
  };
  const reactComment = async (comment: Comment, reaction: ReactionType) => {
    const { error: e } = await supabase.rpc('set_global_content_comment_reaction', { p_comment_id: comment.id, p_reaction: reaction });
    if (e) return setError(e.message);
    if (target) await loadComments(target);
  };
  const share = async (item: Item) => {
    const url = `${location.origin}/news?item=${item.id}`;
    if (navigator.share) { try { await navigator.share({ title: item.title, text: item.message.slice(0, 150), url }); return; } catch { /* fallback */ } }
    await navigator.clipboard?.writeText(url);
  };
  const renderComment = (item: Item, comment: Comment, depth = 0): React.ReactNode => <div key={comment.id} className={depth ? 'ml-7 mt-2 border-l border-[#4353ff]/20 pl-3' : ''}>
    <div className="flex gap-3">{comment.author_avatar ? <img src={comment.author_avatar} alt="" className="h-9 w-9 rounded-xl object-cover" /> : <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#4353ff]/20 text-xs font-black">{comment.author_name?.slice(0, 1).toUpperCase() || 'D'}</div>}
      <div className="min-w-0 flex-1"><div className="rounded-2xl border border-white/[.05] bg-white/[.045] px-3 py-2"><div className="flex justify-between gap-2"><div><p className="text-xs font-bold text-white">{comment.author_name}</p><p className="mt-1 whitespace-pre-wrap text-sm text-neutral-300">{comment.body}</p></div>{comment.can_delete && <button type="button" onClick={() => void delComment(item, comment.id)} className="text-neutral-600 hover:text-red-300"><Trash2 className="h-4 w-4" /></button>}</div></div><div className="mt-1 flex items-center gap-3 px-2"><CommentReaction comment={comment} onReact={(reaction) => void reactComment(comment, reaction)} /><button type="button" onClick={() => setReplyTo(comment)} className="text-[11px] font-semibold text-neutral-500 hover:text-white">Reply{comment.reply_count > 0 ? ` · ${comment.reply_count}` : ''}</button></div></div>
    </div>{(children.get(comment.id) || []).map((child) => renderComment(item, child, Math.min(depth + 1, 3)))}
  </div>;

  return <main className="min-h-screen bg-[#0d1017] pb-8 text-white">
    <SeoHead title="News" description="DRIGHT News, updates and announcements." canonical="/news" />
    <div className="mx-auto max-w-5xl px-3 pt-4 sm:px-5 sm:pt-6">
      <section className="relative aspect-video min-h-[220px] overflow-hidden rounded-[30px] border border-white/10 bg-[#07101f] shadow-2xl">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_20%,rgba(80,148,255,.28),transparent_30%),radial-gradient(circle_at_18%_74%,rgba(31,97,180,.20),transparent_36%),linear-gradient(140deg,#10233c_0%,#07111f_50%,#03070e_100%)]" />
        <div className="absolute -right-[10%] -top-[30%] h-[120%] w-[65%] rounded-full border border-blue-300/15 opacity-70" />
        <div className="absolute right-[8%] top-[7%] h-[72%] w-[42%] rounded-full border border-blue-300/10" />
        <div className="absolute right-[18%] top-[20%] h-1 w-1 rounded-full bg-white shadow-[0_0_20px_8px_rgba(255,255,255,.55)]" />
        <div className="absolute right-[34%] top-[34%] h-1 w-1 rounded-full bg-blue-100 shadow-[0_0_18px_6px_rgba(130,180,255,.5)]" />
        <div className="absolute right-[12%] top-[52%] h-1 w-1 rounded-full bg-white shadow-[0_0_18px_6px_rgba(255,255,255,.4)]" />
        <div className="relative z-10 flex h-full items-center px-[6%] py-[7%]">
          <div className="flex max-w-[76%] items-center gap-[4vw] sm:gap-8">
            <div className="relative flex h-[clamp(82px,19vw,178px)] w-[clamp(82px,19vw,178px)] shrink-0 items-center justify-center rounded-[28%] border border-white/30 bg-gradient-to-br from-white/35 via-[#313b4d]/80 to-black shadow-[0_0_35px_rgba(89,156,255,.25),inset_0_1px_2px_rgba(255,255,255,.55)]">
              <div className="absolute inset-[8%] rounded-[23%] bg-gradient-to-br from-[#2e3b50] via-[#080b11] to-black shadow-inner" />
              <span className="relative bg-gradient-to-b from-white via-[#d5dae3] to-[#8994a6] bg-clip-text text-[clamp(54px,13vw,128px)] font-black leading-none text-transparent drop-shadow">D</span>
            </div>
            <div><div className="flex items-center gap-2 text-white/70"><Megaphone className="h-[clamp(20px,4vw,40px)] w-[clamp(20px,4vw,40px)]" /><span className="text-[clamp(10px,1.7vw,16px)] font-black uppercase tracking-[.2em] text-blue-200/70">DRIGHT stories</span></div><h1 className="mt-1 text-[clamp(34px,7vw,72px)] font-black leading-none tracking-tight">News</h1><p className="mt-3 max-w-xl text-[clamp(11px,1.8vw,18px)] leading-relaxed text-white/65">Latest DRIGHT stories, product news, announcements and platform updates.</p></div>
          </div>
        </div>
      </section>

      <section className="mt-4 rounded-3xl border border-white/[.06] bg-[#141a26] p-3 sm:p-4"><div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{FILTERS.map((f) => <button key={f} type="button" onClick={() => setFilter(f)} className={`shrink-0 rounded-2xl px-4 py-2.5 text-xs font-black capitalize transition ${filter === f ? 'bg-gradient-to-r from-[#4353ff] to-[#6674ff] text-white shadow-lg' : 'border border-white/10 bg-white/[.025] text-neutral-400 hover:bg-white/[.05]'}`}>{f}</button>)}</div></section>

      {error && <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>}
      {loading ? <div className="flex min-h-[300px] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#7180ff]" /></div> : shown.length === 0 ? <div className="py-20 text-center text-neutral-600"><Newspaper className="mx-auto h-10 w-10" /><p className="mt-3">No news available.</p></div> : <div className="mt-5 space-y-5">{shown.map((item, index) => {
        const isOpen = target === item.id;
        const e = engagement[item.id] || EMPTY;
        return <motion.article id={`news-${item.id}`} key={item.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * .03, .18) }} onClick={(ev) => { const el = ev.target as HTMLElement; if (el.closest('button,a,input,textarea')) return; if (!isOpen) open(item.id); }} className={`overflow-hidden rounded-[26px] border bg-[#141822] ${isOpen ? 'border-[#7180ff] ring-2 ring-[#4353ff]/20' : 'border-white/[.07] hover:border-white/15'} ${!isOpen ? 'cursor-pointer' : ''}`}>
          {item.media_url && <button type="button" onClick={() => { if (!isOpen) open(item.id); }} className="block w-full bg-black text-left" aria-label="Open News post">{item.media_type === 'video' ? <video src={item.media_url} controls={isOpen} muted={!isOpen} playsInline preload="metadata" className={`max-h-[620px] w-full object-contain ${!isOpen ? 'pointer-events-none' : ''}`} /> : <img src={item.media_url} alt="" loading="lazy" className="max-h-[620px] w-full object-contain" />}</button>}
          <div className="p-4 sm:p-5"><div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-neutral-500"><span className="rounded-full border border-blue-400/20 bg-blue-500/10 px-2 py-1 text-blue-300">{item.content_kind === 'announcement' ? 'Announcement' : item.type}</span>{item.is_pinned && <span className="inline-flex items-center gap-1"><Pin className="h-3 w-3" />Pinned</span>}{item.is_trending && <span className="inline-flex items-center gap-1 text-orange-300"><TrendingUp className="h-3 w-3" />Trending</span>}{item.mention_all && <span className="inline-flex items-center gap-1 text-violet-300"><AtSign className="h-3 w-3" />All DRIGHT</span>}<span>{new Date(item.published_at).toLocaleDateString()}</span>{isOpen && <button type="button" onClick={() => setParams({})} className="ml-auto rounded-xl p-1.5 hover:bg-white/5"><X className="h-4 w-4" /></button>}</div>
            <h2 className="mt-3 text-lg font-black sm:text-xl">{item.title}</h2><p className={`mt-2 whitespace-pre-wrap text-sm leading-relaxed text-neutral-300 ${isOpen ? '' : 'line-clamp-2'}`}>{item.message}</p>{!isOpen && item.message.length > 90 && <button type="button" onClick={() => open(item.id)} className="mt-1 text-sm font-black text-neutral-300">… more</button>}
            {isOpen && <div className="mt-4 flex flex-wrap gap-2">{item.media_url && <button type="button" onClick={() => navigate(`/social?news=${item.id}`)} className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-[#4353ff] px-4 py-2 text-sm font-black">View in Social <ExternalLink className="h-4 w-4" /></button>}{item.external_url && <a href={item.external_url} target={item.external_url.startsWith('/') ? undefined : '_blank'} rel="noreferrer" className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold">{item.cta_label || 'Learn more'}<ExternalLink className="h-4 w-4" /></a>}</div>}
            <div className="mt-4 flex items-center gap-2 text-xs text-neutral-600">{!item.hide_view_count && <span>{compact(item.view_count || 0)} views</span>}{!item.hide_view_count && <span>·</span>}<span>{compact(e.comment_count)} comments</span>{!item.hide_reaction_count && <><span>·</span><span>{compact(e.reaction_count)} reactions</span></>}</div>
          </div>
          <div className="grid grid-cols-4 border-t border-white/[.06] px-2 py-1" onClick={(ev) => ev.stopPropagation()}><ReactionButton item={item} e={e} onReact={(r) => void react(item, r)} /><button type="button" onClick={() => open(item.id, true)} disabled={!item.comments_enabled} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl text-sm font-semibold text-neutral-300 disabled:text-neutral-700"><MessageCircle className="h-5 w-5" /><span className="hidden sm:inline">Discuss</span></button><button type="button" onClick={() => void share(item)} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl text-sm font-semibold text-neutral-300"><Share2 className="h-5 w-5" /><span className="hidden sm:inline">Share</span></button><button type="button" onClick={() => void save(item)} className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl text-sm font-semibold ${e.is_saved ? 'text-[#8792ff]' : 'text-neutral-300'}`}><Bookmark className={`h-5 w-5 ${e.is_saved ? 'fill-current' : ''}`} /><span className="hidden sm:inline">Save</span></button></div>
          {isOpen && <section className="border-t border-white/[.06] bg-[#0f141e] p-4" onClick={(ev) => ev.stopPropagation()}><div className="flex items-center justify-between"><div><h3 className="font-black">Discussion</h3><p className="text-xs text-neutral-600">Replies and reactions are shared with this News post in Social.</p></div><Sparkles className="h-5 w-5 text-[#7180ff]" /></div>{item.comments_enabled ? <><div className="mt-4 min-h-[60px]">{commentsLoading ? <Loader2 className="mx-auto h-5 w-5 animate-spin text-[#7180ff]" /> : roots.length === 0 ? <p className="py-5 text-center text-sm text-neutral-600">No comments yet.</p> : <div className="space-y-3">{roots.map((comment) => renderComment(item, comment))}</div>}</div>{replyTo && <div className="mt-3 flex items-center justify-between rounded-xl bg-white/[.04] px-3 py-2 text-xs text-neutral-500"><span>Replying to <strong className="text-neutral-300">{replyTo.author_name}</strong></span><button type="button" onClick={() => setReplyTo(null)}><X className="h-3.5 w-3.5" /></button></div>}<div className="mt-3 flex gap-2"><input ref={commentInput} data-social-tokens="true" value={draft} onChange={(ev) => setDraft(ev.target.value)} onKeyDown={(ev) => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); void addComment(item); } }} maxLength={2000} placeholder={replyTo ? `Reply to ${replyTo.author_name}…` : 'Write a comment… use @ or #'} className="min-h-[44px] flex-1 rounded-2xl border border-white/10 bg-white/[.04] px-4 text-sm outline-none focus:border-[#7180ff]/60" /><button type="button" disabled={!draft.trim() || busy === item.id} onClick={() => void addComment(item)} className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#4353ff] disabled:opacity-40">{busy === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button></div></> : <p className="mt-3 text-sm text-neutral-600">Comments are disabled for this post.</p>}</section>}
        </motion.article>;
      })}</div>}
    </div>
  </main>;
}
