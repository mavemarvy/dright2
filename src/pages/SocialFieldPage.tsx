import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Bookmark, CheckCircle, Expand, ExternalLink, Image as ImageIcon, Loader2, MessageCircle,
  MoreHorizontal, Pencil, Plus, Send, Share2, Sparkles, ThumbsUp, Trash2, UserCheck, UserPlus, Users,
  Video, Volume2, VolumeX, X,
} from 'lucide-react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useFollow } from '../lib/socialHooks';
import { supabase } from '../lib/supabase';
import SponsoredPlacementCard from '../components/promotion/SponsoredPlacementCard';
import {
  fetchSocialFeed, fetchSocialRuntimeSettings, fetchSocialSuggestions, recordEntityClick, recordSocialClick,
  recordSocialEvent, recordVideoProgress, recordVideoStart, signSocialMedia, updateSocialPosition,
  type SocialAccountSuggestion, type SocialFeedItem, type SocialFeedMode, type SocialReactionType, type SocialRuntimeSettings,
} from '../lib/socialFeed';

type Visibility = 'public' | 'followers' | 'friends' | 'private';
type MediaType = 'image' | 'video';
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
  current_reaction: SocialReactionType | null;
  reply_count: number;
};
type Composer = {
  id: string | null;
  body: string;
  visibility: Visibility;
  commentsEnabled: boolean;
  allowedReactions: SocialReactionType[];
  mediaPath: string | null;
  mediaType: MediaType | null;
  mediaWidth: number | null;
  mediaHeight: number | null;
  mediaUrl: string | null;
};
type Snapshot = {
  timestamp: number;
  posts: SocialFeedItem[];
  cursor: string | null;
  sessionId: string | null;
  hasMore: boolean;
  activePostId: string | null;
};
type PlaybackState = { position: number; leftAt: number | null };

const REACTIONS: Record<SocialReactionType, { emoji: string; label: string }> = {
  like: { emoji: '👍', label: 'Like' }, love: { emoji: '❤️', label: 'Love' }, care: { emoji: '🤗', label: 'Care' },
  haha: { emoji: '😂', label: 'Haha' }, wow: { emoji: '😮', label: 'Wow' }, sad: { emoji: '😢', label: 'Sad' }, angry: { emoji: '😡', label: 'Angry' },
};
const ALL_REACTIONS = Object.keys(REACTIONS) as SocialReactionType[];
const MAX_MEDIA_SIZE = 100 * 1024 * 1024;
const SNAPSHOT_TTL = 60 * 60 * 1000;
const VIDEO_RESET_AFTER_MS = 30_000;
const playbackStates = new Map<string, PlaybackState>();
const emptyComposer = (): Composer => ({
  id: null, body: '', visibility: 'public', commentsEnabled: true, allowedReactions: [...ALL_REACTIONS],
  mediaPath: null, mediaType: null, mediaWidth: null, mediaHeight: null, mediaUrl: null,
});
const compact = (value: number) => value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M` : value >= 1_000 ? `${(value / 1_000).toFixed(1)}K` : String(value || 0);

function modeFromPath(pathname: string): SocialFeedMode {
  if (pathname.endsWith('/following')) return 'following';
  if (pathname.endsWith('/friends')) return 'friends';
  if (pathname.endsWith('/mine')) return 'mine';
  return 'social';
}
function snapshotKey(userId: string, mode: SocialFeedMode) { return `dright:social:${userId}:${mode}`; }
function extension(file: File, type: MediaType) {
  const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '');
  return ext && ext.length <= 8 ? ext : type === 'video' ? 'mp4' : 'jpg';
}
function readDimensions(file: File, type: MediaType): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    if (type === 'image') {
      const image = new Image();
      image.onload = () => { resolve({ width: image.naturalWidth || 1, height: image.naturalHeight || 1 }); URL.revokeObjectURL(url); };
      image.onerror = () => { resolve({ width: 1, height: 1 }); URL.revokeObjectURL(url); };
      image.src = url;
    } else {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => { resolve({ width: video.videoWidth || 1, height: video.videoHeight || 1 }); URL.revokeObjectURL(url); };
      video.onerror = () => { resolve({ width: 1, height: 1 }); URL.revokeObjectURL(url); };
      video.src = url;
    }
  });
}

function ReactionControl({ post, onReact }: { post: SocialFeedItem; onReact: (reaction: SocialReactionType) => void }) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);
  const allowed = post.allowed_reactions || [];
  const fallback = allowed.includes('like') ? 'like' : allowed[0];
  const start = () => { if (allowed.length) timer.current = window.setTimeout(() => setOpen(true), 430); };
  const clear = () => { if (timer.current) window.clearTimeout(timer.current); timer.current = null; };
  if (!allowed.length) return <div className="flex min-w-[68px] flex-1 items-center justify-center rounded-2xl border border-white/10 bg-white/[.06] px-2 py-2 text-[10px] text-white/40">Reactions off</div>;
  return <div className="relative min-w-0 flex-1">
    {open && <div className="absolute bottom-[calc(100%+10px)] left-1/2 z-50 flex -translate-x-1/2 gap-1 rounded-2xl border border-white/15 bg-[#0d1320]/95 p-1.5 shadow-2xl backdrop-blur-xl">{allowed.map((reaction) => <button key={reaction} type="button" onClick={() => { setOpen(false); onReact(reaction); }} className="h-10 w-10 rounded-xl text-2xl transition hover:-translate-y-1 hover:bg-white/10" title={REACTIONS[reaction].label}>{REACTIONS[reaction].emoji}</button>)}</div>}
    <button type="button" onPointerDown={start} onPointerUp={clear} onPointerCancel={clear} onPointerLeave={clear} onDoubleClick={() => setOpen(true)} onClick={() => fallback && onReact(fallback)} className={`flex w-full items-center justify-center gap-2 rounded-2xl border px-2 py-2.5 text-xs font-bold backdrop-blur-xl transition ${post.current_reaction ? 'border-[#7180ff]/50 bg-[#4353ff]/20 text-[#dce0ff]' : 'border-white/10 bg-white/[.07] text-white/85 hover:bg-white/10'}`}>
      {post.current_reaction ? <span className="text-lg">{REACTIONS[post.current_reaction].emoji}</span> : <ThumbsUp className="h-4 w-4" />}
      <span className="truncate">{post.current_reaction ? REACTIONS[post.current_reaction].label : 'React'}</span>
      {post.reaction_count > 0 && <span className="text-[10px] text-white/55">{compact(post.reaction_count)}</span>}
    </button>
  </div>;
}

function CommentReaction({ comment, onReact }: { comment: Comment; onReact: (reaction: SocialReactionType) => void }) {
  const [open, setOpen] = useState(false);
  const selected = comment.current_reaction;
  return <div className="relative inline-flex items-center gap-1">
    {open && <div className="absolute bottom-7 left-0 z-50 flex gap-1 rounded-2xl border border-white/10 bg-[#0d1320]/95 p-1 shadow-xl">{ALL_REACTIONS.map((reaction) => <button key={reaction} type="button" onClick={() => { setOpen(false); onReact(reaction); }} className="h-8 w-8 rounded-lg text-lg hover:bg-white/10" title={REACTIONS[reaction].label}>{REACTIONS[reaction].emoji}</button>)}</div>}
    <button type="button" onClick={() => onReact(selected || 'like')} onContextMenu={(event) => { event.preventDefault(); setOpen(true); }} onDoubleClick={() => setOpen(true)} className="text-[11px] font-semibold text-neutral-400 hover:text-white">{selected ? REACTIONS[selected].emoji : 'Like'}{comment.reaction_count > 0 ? ` ${compact(comment.reaction_count)}` : ''}</button>
    <button type="button" onClick={() => setOpen((value) => !value)} className="px-1 text-[10px] text-neutral-600">▾</button>
  </div>;
}

function CommentsModal({ post, onClose, onCount }: { post: SocialFeedItem; onClose: () => void; onCount: (count: number) => void }) {
  const [items, setItems] = useState<Comment[]>([]);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: e } = await supabase.rpc('get_social_post_comments_v2', { p_post_id: post.id });
    if (e) setError(e.message); else setItems((data || []) as Comment[]);
    setLoading(false);
  }, [post.id]);
  useEffect(() => { void load(); }, [load]);
  const send = async () => {
    if (!draft.trim() || busy) return;
    setBusy(true);
    const request = replyTo
      ? supabase.rpc('add_social_post_reply', { p_post_id: post.id, p_parent_comment_id: replyTo.id, p_body: draft.trim() })
      : supabase.rpc('add_social_post_comment', { p_post_id: post.id, p_body: draft.trim() });
    const { data, error: e } = await request;
    setBusy(false);
    if (e) return setError(e.message);
    setDraft(''); setReplyTo(null);
    const result = (data || {}) as Record<string, unknown>;
    onCount(Number(result.comment_count || post.comment_count + 1));
    await load();
  };
  const remove = async (id: string) => {
    const { data, error: e } = await supabase.rpc('delete_social_post_comment', { p_comment_id: id });
    if (e) return setError(e.message);
    onCount(Number(data || 0));
    await load();
  };
  const react = async (comment: Comment, reaction: SocialReactionType) => {
    const { error: e } = await supabase.rpc('set_social_comment_reaction', { p_comment_id: comment.id, p_reaction: reaction });
    if (e) return setError(e.message);
    await load();
  };
  const children = useMemo(() => {
    const map = new Map<string, Comment[]>();
    for (const item of items) {
      if (!item.parent_comment_id) continue;
      const group = map.get(item.parent_comment_id) || [];
      group.push(item); map.set(item.parent_comment_id, group);
    }
    return map;
  }, [items]);
  const renderComment = (comment: Comment, depth = 0): React.ReactNode => <div key={comment.id} className={depth ? 'ml-7 mt-2 border-l border-[#4353ff]/25 pl-3' : ''}>
    <div className="flex gap-3">{comment.author_avatar ? <img src={comment.author_avatar} alt="" className="h-9 w-9 rounded-xl object-cover" /> : <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#4353ff]/25 text-xs font-bold">{comment.author_name?.slice(0, 1).toUpperCase() || 'D'}</div>}
      <div className="min-w-0 flex-1"><div className="rounded-2xl border border-white/[.06] bg-white/[.05] px-3 py-2"><div className="flex justify-between gap-2"><div><p className="text-xs font-bold">{comment.author_name}</p><p className="mt-1 whitespace-pre-wrap text-sm text-neutral-300">{comment.body}</p></div>{comment.can_delete && <button type="button" onClick={() => void remove(comment.id)} className="text-neutral-500 hover:text-red-300"><Trash2 className="h-4 w-4" /></button>}</div></div>
        <div className="mt-1 flex items-center gap-3 px-2"><CommentReaction comment={comment} onReact={(reaction) => void react(comment, reaction)} /><button type="button" onClick={() => setReplyTo(comment)} className="text-[11px] font-semibold text-neutral-400 hover:text-white">Reply{comment.reply_count > 0 ? ` · ${comment.reply_count}` : ''}</button></div>
      </div>
    </div>{(children.get(comment.id) || []).map((child) => renderComment(child, Math.min(depth + 1, 3)))}
  </div>;
  const roots = items.filter((item) => !item.parent_comment_id || !items.some((candidate) => candidate.id === item.parent_comment_id));
  return <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/70 sm:items-center sm:p-4" onClick={onClose}>
    <div className="flex max-h-[86dvh] w-full max-w-xl flex-col rounded-t-[30px] border border-white/10 bg-[#0e1420] text-white shadow-2xl sm:rounded-[30px]" onClick={(event) => event.stopPropagation()}>
      <div className="mx-auto mt-2 h-1 w-12 rounded-full bg-white/20" />
      <header className="flex items-center justify-between border-b border-white/10 p-4"><div><h2 className="font-black">Discussion</h2><p className="text-xs text-neutral-500">{post.comment_count} comments · replies and reactions</p></div><button type="button" onClick={onClose} className="rounded-xl border border-white/10 p-2 hover:bg-white/10"><X className="h-5 w-5" /></button></header>
      <div className="min-h-[220px] flex-1 overflow-y-auto p-4">{error && <div className="mb-3 rounded-xl bg-red-500/10 p-3 text-sm text-red-200">{error}</div>}{loading ? <div className="flex min-h-[160px] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div> : roots.length === 0 ? <p className="py-10 text-center text-sm text-neutral-500">Start the discussion.</p> : <div className="space-y-3">{roots.map((comment) => renderComment(comment))}</div>}</div>
      {post.comments_enabled && <footer className="border-t border-white/10 p-3">{replyTo && <div className="mb-2 flex items-center justify-between rounded-xl bg-white/[.05] px-3 py-2 text-xs text-neutral-400"><span>Replying to <strong className="text-neutral-200">{replyTo.author_name}</strong></span><button type="button" onClick={() => setReplyTo(null)}><X className="h-3.5 w-3.5" /></button></div>}<div className="flex gap-2"><input data-social-tokens="true" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }} maxLength={2000} placeholder={replyTo ? `Reply to ${replyTo.author_name}…` : 'Write a comment… use @ or #'} className="min-h-[44px] flex-1 rounded-2xl border border-white/10 bg-white/[.06] px-4 text-sm outline-none focus:border-[#7180ff]/60" /><button type="button" disabled={busy || !draft.trim()} onClick={() => void send()} className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#4353ff] disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button></div></footer>}
    </div>
  </div>;
}

function ComposerModal({ initial, onClose, onSaved }: { initial: SocialFeedItem | null; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth();
  const [form, setForm] = useState<Composer>(() => initial ? {
    id: initial.id, body: initial.body, visibility: initial.visibility, commentsEnabled: initial.comments_enabled,
    allowedReactions: [...(initial.allowed_reactions || [])], mediaPath: initial.media_path, mediaType: initial.media_type,
    mediaWidth: initial.media_width, mediaHeight: initial.media_height, mediaUrl: initial.media_url || null,
  } : emptyComposer());
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const choose = async (selected?: File) => {
    if (!selected) return;
    const type: MediaType | null = selected.type.startsWith('image/') ? 'image' : selected.type.startsWith('video/') ? 'video' : null;
    if (!type) return setError('Choose a photo or video.');
    if (selected.size > MAX_MEDIA_SIZE) return setError('Upload must be 100 MB or smaller.');
    const dimensions = await readDimensions(selected, type);
    if (preview) URL.revokeObjectURL(preview);
    setFile(selected); setPreview(URL.createObjectURL(selected));
    setForm((current) => ({ ...current, mediaType: type, mediaWidth: dimensions.width, mediaHeight: dimensions.height }));
    setError(null);
  };
  const removeMedia = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null); setFile(null);
    setForm((current) => ({ ...current, mediaPath: null, mediaType: null, mediaWidth: null, mediaHeight: null, mediaUrl: null }));
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || (!form.body.trim() && !file && !form.mediaPath)) return setError('Add text, a photo, or a video.');
    setBusy(true); setError(null);
    let uploaded: string | null = null;
    const oldPath = initial?.media_path || null;
    let mediaPath = form.mediaPath;
    try {
      if (file && form.mediaType) {
        uploaded = `${user.id}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${extension(file, form.mediaType)}`;
        const { error: uploadError } = await supabase.storage.from('social-media').upload(uploaded, file, { contentType: file.type, upsert: false });
        if (uploadError) throw uploadError;
        mediaPath = uploaded;
      }
      const args = {
        p_body: form.body.trim(), p_media_path: mediaPath, p_media_type: mediaPath ? form.mediaType : null,
        p_visibility: form.visibility, p_comments_enabled: form.commentsEnabled, p_allowed_reactions: form.allowedReactions,
        p_media_width: mediaPath ? form.mediaWidth : null, p_media_height: mediaPath ? form.mediaHeight : null,
      };
      const result = form.id ? await supabase.rpc('update_social_post', { p_post_id: form.id, ...args }) : await supabase.rpc('create_social_post', args);
      if (result.error) throw result.error;
      if (oldPath && oldPath !== mediaPath && !/^https?:\/\//i.test(oldPath)) await supabase.storage.from('social-media').remove([oldPath]);
      setBusy(false); onSaved();
    } catch (caught) {
      if (uploaded) await supabase.storage.from('social-media').remove([uploaded]);
      setBusy(false); setError(caught instanceof Error ? caught.message : 'Unable to save post.');
    }
  };
  const visiblePreview = preview || form.mediaUrl;
  return <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/75 sm:items-center sm:p-4" onClick={onClose}>
    <div className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-[30px] border border-white/10 bg-[#0e1420] p-5 text-white shadow-2xl sm:rounded-[30px]" onClick={(event) => event.stopPropagation()}>
      <header className="mb-5 flex items-center justify-between"><div><h2 className="text-xl font-black">{form.id ? 'Edit your Social post' : 'Create in Social'}</h2><p className="text-xs text-neutral-500">Your Social space is separate from official DRIGHT News.</p></div><button type="button" onClick={onClose} className="rounded-xl border border-white/10 p-2 hover:bg-white/10"><X className="h-5 w-5" /></button></header>
      {error && <div className="mb-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-200">{error}</div>}
      <form onSubmit={submit} className="space-y-4"><textarea data-social-tokens="true" value={form.body} onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))} rows={5} maxLength={5000} placeholder="Share something… mention @people or add #topics" className="w-full rounded-2xl border border-white/10 bg-white/[.05] p-4 text-sm outline-none focus:border-[#7180ff]/60" />
        {visiblePreview && <div className="relative overflow-hidden rounded-2xl bg-black">{form.mediaType === 'video' ? <video src={visiblePreview} controls playsInline className="max-h-[420px] w-full object-contain" /> : <img src={visiblePreview} alt="Preview" className="max-h-[420px] w-full object-contain" />}<button type="button" onClick={removeMedia} className="absolute right-2 top-2 rounded-xl bg-black/70 p-2"><X className="h-4 w-4" /></button></div>}
        {!visiblePreview && <label className="flex min-h-[90px] cursor-pointer items-center justify-center gap-3 rounded-2xl border border-dashed border-white/15 text-sm font-semibold"><ImageIcon className="h-5 w-5" /><Video className="h-5 w-5" /> Add photo or video<input type="file" accept="image/*,video/*" className="hidden" onChange={(event) => void choose(event.target.files?.[0])} /></label>}
        <div className="grid gap-3 sm:grid-cols-2"><select value={form.visibility} onChange={(event) => setForm((current) => ({ ...current, visibility: event.target.value as Visibility }))} className="rounded-xl border border-white/10 bg-[#1b202b] px-3 py-3"><option value="public">Public</option><option value="followers">Followers</option><option value="friends">Friends</option><option value="private">Only me</option></select><label className="flex items-center justify-between rounded-xl border border-white/10 px-3 py-3 text-sm">Comments<input type="checkbox" checked={form.commentsEnabled} onChange={(event) => setForm((current) => ({ ...current, commentsEnabled: event.target.checked }))} /></label></div>
        <div className="flex flex-wrap gap-2">{ALL_REACTIONS.map((reaction) => <button key={reaction} type="button" onClick={() => setForm((current) => ({ ...current, allowedReactions: current.allowedReactions.includes(reaction) ? current.allowedReactions.filter((value) => value !== reaction) : [...current.allowedReactions, reaction] }))} className={`rounded-xl border px-3 py-2 text-sm ${form.allowedReactions.includes(reaction) ? 'border-[#7180ff] bg-[#4353ff]/15' : 'border-white/10 text-neutral-600'}`}>{REACTIONS[reaction].emoji} {REACTIONS[reaction].label}</button>)}</div>
        <button type="submit" disabled={busy} className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#4353ff] to-[#6977ff] font-bold disabled:opacity-50">{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : form.id ? <Pencil className="h-5 w-5" /> : <Plus className="h-5 w-5" />}{form.id ? 'Save changes' : 'Publish to Social'}</button>
      </form>
    </div>
  </div>;
}

function SuggestionEmpty({ mode }: { mode: 'following' | 'friends' }) {
  const { toggleFollow, followingIds } = useFollow();
  const navigate = useNavigate();
  const [items, setItems] = useState<SocialAccountSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { let active = true; void fetchSocialSuggestions(mode).then((data) => { if (active) setItems(data); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [mode]);
  return <div className="flex min-h-full items-center justify-center bg-[radial-gradient(circle_at_top,#17233a_0,#080b12_48%,#030509_100%)] px-5 pb-28 pt-24"><div className="w-full max-w-xl"><div className="text-center"><Users className="mx-auto h-12 w-12 text-[#7180ff]" /><h2 className="mt-4 text-xl font-black">{mode === 'following' ? 'Build your Following field' : 'Find people you may know'}</h2><p className="mt-2 text-sm text-white/45">{mode === 'following' ? 'Follow creators and people you care about. Their eligible posts will appear here.' : 'Friends on DRIGHT are mutual follows. These suggestions can help you build your network.'}</p></div>{loading ? <Loader2 className="mx-auto mt-8 h-6 w-6 animate-spin" /> : <div className="mt-7 space-y-2">{items.map((item) => <div key={item.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[.05] p-3 backdrop-blur">{item.avatar_url ? <img src={item.avatar_url} alt="" className="h-11 w-11 rounded-xl object-cover" /> : <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#4353ff] font-bold">{(item.full_name || item.username || 'D').slice(0, 1).toUpperCase()}</div>}<button type="button" onClick={() => navigate(`/profile/${item.id}`)} className="min-w-0 flex-1 text-left"><p className="truncate text-sm font-bold">{item.username ? `@${item.username}` : item.full_name || 'DRIGHT User'} {item.is_verified && <CheckCircle className="inline h-3.5 w-3.5 text-blue-400" />}</p><p className="text-xs text-white/40">{compact(item.followers)} followers{item.mutual_score > 0 ? ` · ${item.mutual_score} mutual` : ''}</p></button><button type="button" onClick={() => void toggleFollow(item.id)} className="rounded-xl border border-[#7180ff]/50 bg-[#4353ff]/20 px-4 py-2 text-xs font-bold text-[#dce0ff]">{followingIds.has(item.id) ? 'Following' : 'Follow'}</button></div>)}</div>}</div></div>;
}

function SocialCard({ post, index, activeIndex, active, sessionId, qualifiedMs, fastSkipMs, following, own, onPatch, onActive, onProfile, onFollow, onEdit, onDelete, onComments, onRemove }: {
  post: SocialFeedItem; index: number; activeIndex: number; active: boolean; sessionId: string | null; qualifiedMs: number; fastSkipMs: number; following: boolean; own: boolean;
  onPatch: (patch: Partial<SocialFeedItem>) => void; onActive: () => void; onProfile: () => void; onFollow: () => void; onEdit: () => void; onDelete: () => void; onComments: () => void; onRemove: () => void;
}) {
  const navigate = useNavigate();
  const root = useRef<HTMLElement | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const visibleAt = useRef<number | null>(null);
  const segmentStart = useRef<number | null>(null);
  const qualifiedTimer = useRef<number | null>(null);
  const qualified = useRef(false);
  const ended = useRef(false);
  const impressions = useRef(false);
  const [muted, setMuted] = useState(true);
  const [menu, setMenu] = useState(false);
  const near = Math.abs(index - activeIndex) <= 2;
  const mediaUrl = post.media_type === 'video' && !near ? null : post.media_url;
  const isLandscape = Boolean(post.media_type === 'video' && post.media_width && post.media_height && post.media_width > post.media_height);
  const clearQualified = () => { if (qualifiedTimer.current) window.clearTimeout(qualifiedTimer.current); qualifiedTimer.current = null; };
  const ratio = () => video.current && Number.isFinite(video.current.duration) && video.current.duration > 0 ? Math.min(video.current.currentTime / video.current.duration, 1.5) : 0;
  const watchMs = () => segmentStart.current ? Math.max(0, Date.now() - segmentStart.current) : 0;
  const rememberPosition = () => {
    const node = video.current;
    if (!node || !Number.isFinite(node.currentTime)) return;
    const previous = playbackStates.get(post.id);
    playbackStates.set(post.id, { position: node.currentTime, leftAt: previous?.leftAt ?? null });
  };
  const markAway = () => {
    const node = video.current;
    const previous = playbackStates.get(post.id);
    playbackStates.set(post.id, { position: node && Number.isFinite(node.currentTime) ? node.currentTime : previous?.position || 0, leftAt: Date.now() });
  };
  const restoreForReturn = (node: HTMLVideoElement) => {
    const saved = playbackStates.get(post.id);
    if (!saved) return;
    const expired = saved.leftAt != null && Date.now() - saved.leftAt >= VIDEO_RESET_AFTER_MS;
    const target = expired ? 0 : saved.position;
    if (Number.isFinite(node.duration) && node.duration > 0 && target > 0.2 && target < node.duration - 0.25) node.currentTime = target;
    else if (expired || target >= (node.duration || Infinity) - 0.25) node.currentTime = 0;
    playbackStates.set(post.id, { position: node.currentTime || 0, leftAt: null });
  };
  const pauseAway = () => {
    const node = video.current;
    if (!node) return;
    markAway();
    node.pause();
  };

  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.intersectionRatio >= 0.72) {
          visibleAt.current = Date.now(); onActive();
          if (!impressions.current) { impressions.current = true; void recordSocialEvent(post.id, 'impression'); }
        } else if (entry.intersectionRatio < 0.55) {
          if (post.media_type === 'video') pauseAway();
          if (visibleAt.current) {
            const dwell = Date.now() - visibleAt.current; visibleAt.current = null;
            if (dwell < fastSkipMs) void recordVideoProgress(post.id, 'skip', dwell, ratio(), sessionId);
            else if (dwell >= 2000) void recordVideoProgress(post.id, 'dwell', dwell, ratio(), sessionId);
          }
        }
      }
    }, { threshold: [0.25, 0.55, 0.72, 0.9] });
    observer.observe(node);
    return () => observer.disconnect();
  }, [fastSkipMs, onActive, post.id, post.media_type, sessionId]);

  useEffect(() => {
    const node = video.current;
    if (!node) return;
    if (!active || document.hidden) { pauseAway(); return; }
    restoreForReturn(node);
    if (ended.current && Number.isFinite(node.duration) && node.currentTime >= node.duration - 0.2) node.currentTime = 0;
    void node.play().catch(() => undefined);
  }, [active, mediaUrl]);
  useEffect(() => {
    const visibility = () => {
      const node = video.current;
      if (!node) return;
      if (document.hidden) pauseAway();
      else if (active) { restoreForReturn(node); void node.play().catch(() => undefined); }
    };
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, [active]);
  useEffect(() => () => { clearQualified(); if (video.current) { markAway(); video.current.pause(); } }, []);

  const onLoadedMetadata = () => { if (active && video.current) restoreForReturn(video.current); };
  const onPlay = () => {
    const replaying = ended.current; ended.current = false;
    if (replaying) void recordVideoProgress(post.id, 'replay', 0, 0, sessionId);
    const state = playbackStates.get(post.id);
    playbackStates.set(post.id, { position: video.current?.currentTime || state?.position || 0, leftAt: null });
    qualified.current = false; segmentStart.current = Date.now(); clearQualified();
    qualifiedTimer.current = window.setTimeout(() => {
      if (video.current && !video.current.paused && !qualified.current && active) {
        qualified.current = true;
        void recordVideoProgress(post.id, 'qualified_view', qualifiedMs, ratio(), sessionId);
      }
    }, qualifiedMs);
    void recordVideoStart(post.id, sessionId).then((result) => onPatch({ view_count: Number(result.view_count || post.view_count), unique_view_count: Number(result.unique_view_count || post.unique_view_count) })).catch(() => undefined);
  };
  const onPause = () => {
    rememberPosition(); clearQualified();
    if (ended.current) return;
    const watched = watchMs(); segmentStart.current = null;
    if (watched > 0) void recordVideoProgress(post.id, 'pause', watched, ratio(), sessionId);
  };
  const onEnded = () => {
    ended.current = true;
    playbackStates.set(post.id, { position: video.current?.duration || 0, leftAt: null });
    clearQualified(); const watched = watchMs(); segmentStart.current = null;
    void recordVideoProgress(post.id, 'watch_complete', watched, 1, sessionId);
  };
  const videoClick = () => {
    void recordSocialClick(post.id, sessionId).then((result) => onPatch({ click_count: Number(result.click_count || post.click_count) })).catch(() => undefined);
    const node = video.current; if (!node) return;
    if (node.paused) { if (ended.current) node.currentTime = 0; void node.play().catch(() => undefined); } else node.pause();
  };
  const fullscreen = () => {
    const node = video.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (!node) return;
    if (node.requestFullscreen) void node.requestFullscreen().catch(() => undefined); else node.webkitEnterFullscreen?.();
  };
  const react = async (reaction: SocialReactionType) => {
    const { data, error } = await supabase.rpc('set_social_post_reaction', { p_post_id: post.id, p_reaction: reaction });
    if (error || !data) return;
    const result = data as Record<string, unknown>;
    onPatch({ current_reaction: (result.reaction || null) as SocialReactionType | null, reaction_count: Number(result.reaction_count || 0) });
  };
  const save = async () => {
    const { data } = await supabase.rpc('toggle_social_post_save', { p_post_id: post.id });
    if (!data) return;
    const result = data as Record<string, unknown>;
    onPatch({ is_saved: Boolean(result.saved), save_count: Number(result.save_count || 0) });
  };
  const share = async () => {
    const url = post.source_type === 'news' && post.linked_entity_id ? `${window.location.origin}/news?item=${post.linked_entity_id}` : `${window.location.origin}/social?post=${post.id}`;
    if (navigator.share) { try { await navigator.share({ text: post.body.slice(0, 140), url }); await recordSocialEvent(post.id, 'share'); return; } catch { /* fallback */ } }
    await navigator.clipboard?.writeText(url); await recordSocialEvent(post.id, 'share');
  };
  const hide = async (kind: 'not_interested' | 'hide_creator') => { await recordSocialEvent(post.id, kind); onRemove(); };
  const report = async () => { await recordSocialEvent(post.id, 'report'); setMenu(false); onRemove(); };
  const openEntity = async () => {
    try {
      const result = await recordEntityClick(post.id, sessionId);
      if (result.url) { if (result.url.startsWith('/')) navigate(result.url); else window.location.assign(result.url); return; }
      if (!result.entity_id) return;
      const routes: Record<string, string> = { product: `/product/${result.entity_id}`, service: `/product/${result.entity_id}`, course: `/product/${result.entity_id}`, job: `/jobs/${result.entity_id}`, creator: `/profile/${result.entity_id}`, community: post.community_slug ? `/communities/${post.community_slug}` : '/communities', news: `/news?item=${result.entity_id}` };
      navigate(routes[result.entity_type] || '/market');
    } catch { /* unavailable CTA */ }
  };

  return <section id={`social-post-${post.id}`} ref={root} className="relative h-dvh min-h-[520px] snap-start overflow-hidden bg-[#030509]">
    <div className="absolute inset-0 flex items-center justify-center bg-black">{post.media_type === 'video' && mediaUrl ? <video ref={video} src={mediaUrl} muted={muted} playsInline preload={near ? 'metadata' : 'none'} onLoadedMetadata={onLoadedMetadata} onTimeUpdate={rememberPosition} onPlay={onPlay} onPause={onPause} onEnded={onEnded} onClick={videoClick} className="h-full w-full cursor-pointer object-contain" /> : post.media_type === 'image' && mediaUrl ? <img src={mediaUrl} alt="" className="h-full w-full object-contain" /> : <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(67,83,255,.28),transparent_32%),radial-gradient(circle_at_80%_70%,rgba(42,131,255,.16),transparent_30%),linear-gradient(160deg,#111a2b_0%,#060911_48%,#020306_100%)]" />}</div>
    <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/95" />

    {post.media_type === 'video' && <div className="absolute right-4 top-20 z-30 flex gap-2"><button type="button" onClick={() => setMuted((value) => !value)} className="rounded-2xl border border-white/10 bg-black/45 p-3 text-white backdrop-blur-xl" aria-label={muted ? 'Unmute' : 'Mute'}>{muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}</button>{isLandscape && <button type="button" onClick={fullscreen} className="rounded-2xl border border-white/10 bg-black/45 p-3 text-white backdrop-blur-xl" title="Expand landscape video"><Expand className="h-5 w-5" /></button>}</div>}

    <div className="absolute bottom-[92px] left-4 right-4 z-20 text-white sm:bottom-[100px] sm:left-6 sm:right-6">
      <div className="max-w-2xl">
        <div className="mb-3 flex flex-wrap items-center gap-2">{post.source_type === 'news' && <button type="button" onClick={() => post.linked_entity_id && navigate(`/news?item=${post.linked_entity_id}`)} className="inline-flex items-center gap-2 rounded-xl border border-blue-300/20 bg-blue-500/15 px-3 py-1.5 text-xs font-black text-blue-100 backdrop-blur-xl"><Sparkles className="h-3.5 w-3.5" />From DRIGHT News <ExternalLink className="h-3.5 w-3.5" /></button>}{post.community_id && post.community_slug && <button type="button" onClick={() => navigate(`/communities/${post.community_slug}`)} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-bold backdrop-blur-xl">{post.community_avatar ? <img src={post.community_avatar} alt="" className="h-5 w-5 rounded-md object-cover" /> : <Users className="h-4 w-4" />}{post.community_name || 'Community'}</button>}</div>
        <div className="flex items-center gap-3"><button type="button" onClick={onProfile}>{post.author_avatar ? <img src={post.author_avatar} alt="" className="h-11 w-11 rounded-xl border border-white/40 object-cover" /> : <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/30 bg-[#4353ff] font-black">{(post.author_name || post.author_username || 'D').slice(0, 1).toUpperCase()}</div>}</button><button type="button" onClick={onProfile} className="min-w-0 text-left"><p className="truncate text-sm font-extrabold">{post.author_username ? `@${post.author_username}` : post.author_name || 'DRIGHT User'} {post.author_verified && <CheckCircle className="inline h-4 w-4 text-blue-400" />}</p>{post.author_username && post.author_name && <p className="truncate text-xs text-white/55">{post.author_name}</p>}</button>{!own && <button type="button" onClick={onFollow} className={`rounded-xl border px-3 py-1.5 text-xs font-bold backdrop-blur ${following ? 'border-white/15 bg-white/10' : 'border-[#7180ff]/50 bg-[#4353ff]/25'}`}>{following ? <UserCheck className="mr-1 inline h-3.5 w-3.5" /> : <UserPlus className="mr-1 inline h-3.5 w-3.5" />}{following ? 'Following' : 'Follow'}</button>}</div>
        {post.body && <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm leading-relaxed text-white/95 drop-shadow">{post.body}</p>}
        {post.recommendation_reason && <p className="mt-2 text-[11px] font-semibold text-white/40">{post.recommendation_reason}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2">{post.linked_entity_type && <button type="button" onClick={() => void openEntity()} className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/90 px-3.5 py-2 text-xs font-black text-black">{post.linked_entity_type === 'news' ? 'Read News' : post.linked_entity_type === 'job' ? 'View Job' : post.linked_entity_type === 'store' ? 'View Store' : post.linked_entity_type === 'course' ? 'View Course' : post.linked_entity_type === 'service' ? 'View Service' : 'Learn More'} <ExternalLink className="h-3.5 w-3.5" /></button>}<span className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-[10px] font-semibold text-white/50 backdrop-blur">{compact(post.view_count)} views · {compact(post.click_count)} clicks · {new Date(post.created_at).toLocaleDateString()}{post.edited_at ? ' · edited' : ''}</span></div>
      </div>
    </div>

    <div className="absolute bottom-3 left-3 right-3 z-40 rounded-[24px] border border-white/10 bg-[#0b111d]/72 p-2 shadow-2xl backdrop-blur-2xl sm:bottom-4 sm:left-1/2 sm:right-auto sm:w-[min(640px,calc(100%-32px))] sm:-translate-x-1/2">
      <div className="flex items-stretch gap-1.5">
        <ReactionControl post={post} onReact={(reaction) => void react(reaction)} />
        {post.comments_enabled ? <button type="button" onClick={onComments} className="flex min-w-[68px] flex-1 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[.07] px-2 py-2.5 text-xs font-bold text-white/85"><MessageCircle className="h-4 w-4" /><span className="truncate">Discuss</span>{post.comment_count > 0 && <span className="text-[10px] text-white/55">{compact(post.comment_count)}</span>}</button> : <div className="flex min-w-[68px] flex-1 items-center justify-center rounded-2xl border border-white/10 bg-white/[.04] px-2 py-2 text-[10px] text-white/35">Comments off</div>}
        <button type="button" onClick={() => void share()} className="flex min-w-[58px] items-center justify-center rounded-2xl border border-white/10 bg-white/[.07] px-3 text-white/85" aria-label="Share"><Share2 className="h-4 w-4" /></button>
        <button type="button" onClick={() => void save()} className={`flex min-w-[58px] items-center justify-center rounded-2xl border px-3 ${post.is_saved ? 'border-[#7180ff]/50 bg-[#4353ff]/20 text-[#bfc6ff]' : 'border-white/10 bg-white/[.07] text-white/85'}`} aria-label="Save"><Bookmark className={`h-4 w-4 ${post.is_saved ? 'fill-current' : ''}`} /></button>
        <div className="relative"><button type="button" onClick={() => setMenu((value) => !value)} className="flex h-full min-w-[48px] items-center justify-center rounded-2xl border border-white/10 bg-white/[.07] text-white/80"><MoreHorizontal className="h-5 w-5" /></button>{menu && <div className="absolute bottom-[calc(100%+10px)] right-0 w-48 overflow-hidden rounded-2xl border border-white/10 bg-[#0e1420] py-1 text-left text-sm shadow-2xl">{own && post.source_type !== 'news' ? <><button type="button" onClick={onEdit} className="flex w-full items-center gap-2 px-4 py-3 hover:bg-white/5"><Pencil className="h-4 w-4" />Edit post</button><button type="button" onClick={onDelete} className="flex w-full items-center gap-2 px-4 py-3 text-red-300 hover:bg-white/5"><Trash2 className="h-4 w-4" />Delete post</button></> : <><button type="button" onClick={() => void hide('not_interested')} className="w-full px-4 py-3 hover:bg-white/5">Not interested</button>{post.source_type !== 'news' && <button type="button" onClick={() => void hide('hide_creator')} className="w-full px-4 py-3 hover:bg-white/5">Hide this creator</button>}<button type="button" onClick={() => void report()} className="w-full px-4 py-3 text-red-300 hover:bg-white/5">Report post</button></>}</div>}</div>
      </div>
    </div>
  </section>;
}

export default function SocialFieldPage() {
  const { user } = useAuth();
  const { followingIds, toggleFollow } = useFollow();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const mode = modeFromPath(location.pathname);
  const targetPost = params.get('post');
  const newsId = params.get('news');
  const [posts, setPosts] = useState<SocialFeedItem[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [settings, setSettings] = useState<SocialRuntimeSettings>({});
  const [composer, setComposer] = useState(false);
  const [editing, setEditing] = useState<SocialFeedItem | null>(null);
  const [comments, setComments] = useState<SocialFeedItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLElement | null>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const replenishing = useRef(false);

  const persist = useCallback((overrideActive?: string | null) => {
    if (!user) return;
    const snapshot: Snapshot = { timestamp: Date.now(), posts, cursor, sessionId, hasMore, activePostId: overrideActive === undefined ? activePostId : overrideActive };
    try { sessionStorage.setItem(snapshotKey(user.id, mode), JSON.stringify(snapshot)); } catch { /* optional */ }
  }, [activePostId, cursor, hasMore, mode, posts, sessionId, user]);
  useEffect(() => { const timer = window.setTimeout(() => persist(), 150); return () => window.clearTimeout(timer); }, [persist]);

  const applyFeed = useCallback((result: Awaited<ReturnType<typeof fetchSocialFeed>>, append: boolean) => {
    setSessionId(result.session_id); setCursor(result.next_cursor); setHasMore(result.has_more);
    setPosts((current) => append ? [...current, ...result.items.filter((next) => !current.some((item) => item.id === next.id))] : result.items);
  }, []);
  const resolveTarget = useCallback(async () => {
    if (targetPost) return targetPost;
    if (!newsId) return null;
    const { data } = await supabase.from('social_posts').select('id').eq('source_type', 'news').eq('linked_entity_type', 'news').eq('linked_entity_id', newsId).eq('is_active', true).maybeSingle();
    return data?.id || null;
  }, [newsId, targetPost]);
  const freshLoad = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError(null);
    try {
      const resolvedTarget = await resolveTarget();
      const result = await fetchSocialFeed({ feed: mode, targetId: resolvedTarget, limit: 20 });
      applyFeed(result, false);
      const targetIndex = resolvedTarget ? Math.max(0, result.items.findIndex((item) => item.id === resolvedTarget)) : 0;
      setActiveIndex(targetIndex); setActivePostId(result.items[targetIndex]?.id || result.items[0]?.id || null);
      window.setTimeout(() => { if (resolvedTarget) document.getElementById(`social-post-${resolvedTarget}`)?.scrollIntoView({ block: 'start' }); }, 80);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to load Social.'); setPosts([]); }
    finally { setLoading(false); }
  }, [applyFeed, mode, resolveTarget, user]);

  useEffect(() => {
    let cancelled = false;
    if (!user) return;
    void fetchSocialRuntimeSettings().then((value) => { if (!cancelled) setSettings(value); }).catch(() => undefined);
    void (async () => {
      if (targetPost || newsId) { await freshLoad(); return; }
      try {
        const raw = sessionStorage.getItem(snapshotKey(user.id, mode));
        if (raw) {
          const saved = JSON.parse(raw) as Snapshot;
          if (Date.now() - saved.timestamp < SNAPSHOT_TTL && saved.posts.length) {
            const signed = await signSocialMedia(saved.posts);
            if (cancelled) return;
            setPosts(signed); setCursor(saved.cursor); setSessionId(saved.sessionId); setHasMore(saved.hasMore); setActivePostId(saved.activePostId);
            const index = Math.max(0, signed.findIndex((item) => item.id === saved.activePostId));
            setActiveIndex(index); setLoading(false);
            window.setTimeout(() => document.getElementById(`social-post-${saved.activePostId}`)?.scrollIntoView({ block: 'start' }), 80);
            return;
          }
        }
      } catch { /* load fresh */ }
      await freshLoad();
    })();
    return () => { cancelled = true; };
  }, [freshLoad, mode, newsId, targetPost, user]);

  const patch = useCallback((id: string, value: Partial<SocialFeedItem>) => {
    setPosts((current) => current.map((item) => item.id === id ? { ...item, ...value } : item));
    setComments((current) => current?.id === id ? { ...current, ...value } : current);
  }, []);
  const loadMore = useCallback(async (forceRefresh = false) => {
    if (!user || loadingMore || (!hasMore && !forceRefresh)) return;
    setLoadingMore(true);
    try { const result = await fetchSocialFeed({ feed: mode, cursor: forceRefresh ? null : cursor, sessionId, limit: 20 }); applyFeed(result, true); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load more posts.'); }
    finally { setLoadingMore(false); replenishing.current = false; }
  }, [applyFeed, cursor, hasMore, loadingMore, mode, sessionId, user]);
  const onScroll = () => {
    const node = scroller.current;
    if (!node || loadingMore) return;
    if (node.scrollTop + node.clientHeight >= node.scrollHeight - node.clientHeight * 2) {
      if (hasMore) void loadMore();
      else if (!replenishing.current) { replenishing.current = true; window.setTimeout(() => void loadMore(true), 1200); }
    }
  };
  const onActive = (post: SocialFeedItem, index: number) => {
    if (activePostId === post.id) return;
    setActiveIndex(index); setActivePostId(post.id);
    if (sessionId) void updateSocialPosition(sessionId, post.id, index);
    persist(post.id);
  };
  const deletePost = async (post: SocialFeedItem) => {
    if (post.source_type === 'news') return;
    if (!window.confirm('Delete this Social post permanently?')) return;
    const { data, error: e } = await supabase.rpc('delete_social_post', { p_post_id: post.id });
    if (e) return setError(e.message);
    if (typeof data === 'string' && data && !/^https?:\/\//i.test(data)) await supabase.storage.from('social-media').remove([data]);
    setPosts((current) => current.filter((item) => item.id !== post.id));
  };
  const switchMode = (next: SocialFeedMode) => { persist(); navigate(next === 'social' ? '/social' : `/social/${next}`); };
  const handleFollow = async (post: SocialFeedItem) => {
    const wasFollowing = followingIds.has(post.author_id) || post.is_following;
    await toggleFollow(post.author_id); void recordSocialEvent(post.id, wasFollowing ? 'unfollow' : 'follow'); patch(post.id, { is_following: !wasFollowing });
  };
  const openProfile = (post: SocialFeedItem) => { persist(post.id); void recordSocialEvent(post.id, 'profile_visit'); navigate(`/profile/${post.author_id}`); };
  const handleTouchEnd = (event: React.TouchEvent<HTMLElement>) => {
    if (!touch.current) return;
    const end = event.changedTouches[0];
    const dx = end.clientX - touch.current.x; const dy = end.clientY - touch.current.y; touch.current = null;
    if (Math.abs(dx) < 75 || Math.abs(dx) < Math.abs(dy) * 1.25) return;
    if (mode === 'social' && dx < 0) switchMode('friends');
    else if (mode === 'friends' && dx > 0) switchMode('social');
    else if (mode === 'social' && dx > 0) switchMode('following');
    else if (mode === 'following' && dx < 0) switchMode('social');
  };
  const exitSocial = () => {
    persist();
    if (window.history.length > 1) navigate(-1); else navigate('/');
  };

  const qualifiedMs = Number(settings.algorithm?.social_qualified_view_ms || 3000);
  const fastSkipMs = Number(settings.algorithm?.social_fast_skip_ms || 1800);
  const adGap = Math.max(2, Number(settings.sponsored?.min_organic_between_ads || 6));
  const maxAds = Math.max(0, Number(settings.sponsored?.max_ads_per_session || 4));
  const tabs = useMemo(() => [{ mode: 'following' as SocialFeedMode, label: 'Following' }, { mode: 'social' as SocialFeedMode, label: 'Social' }, { mode: 'friends' as SocialFeedMode, label: 'Friends' }, { mode: 'mine' as SocialFeedMode, label: 'My Posts' }], []);

  return <div className="fixed inset-0 z-[90] h-dvh overflow-hidden bg-[#030509] text-white">
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex items-start justify-between gap-2 px-3 pb-3 pt-[max(10px,env(safe-area-inset-top))] sm:px-5">
      <button type="button" onClick={exitSocial} className="pointer-events-auto mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/12 bg-[#0b111d]/70 text-white shadow-xl backdrop-blur-2xl" aria-label="Exit Social"><ArrowLeft className="h-5 w-5" /></button>
      <div className="pointer-events-auto flex max-w-[calc(100vw-124px)] gap-1 overflow-x-auto rounded-2xl border border-white/10 bg-[#0b111d]/68 p-1 shadow-xl backdrop-blur-2xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{tabs.map((tab) => <button key={tab.mode} type="button" onClick={() => switchMode(tab.mode)} className={`shrink-0 rounded-xl px-3 py-2 text-xs font-black transition ${mode === tab.mode ? 'bg-gradient-to-r from-[#4353ff] to-[#7180ff] text-white shadow-lg' : 'text-white/55 hover:bg-white/[.06] hover:text-white'}`}>{tab.label}</button>)}</div>
      <button type="button" onClick={() => { setEditing(null); setComposer(true); }} className="pointer-events-auto mt-1 flex h-11 shrink-0 items-center gap-1.5 rounded-2xl border border-[#7180ff]/40 bg-[#4353ff]/25 px-3 text-xs font-black text-[#e5e8ff] shadow-xl backdrop-blur-2xl" aria-label="Create Social post"><Plus className="h-4 w-4" /><span className="hidden sm:inline">Post</span></button>
    </div>

    {error && <div className="fixed left-1/2 top-20 z-[110] w-[min(92vw,520px)] -translate-x-1/2 rounded-2xl border border-red-400/20 bg-red-950/90 p-3 text-sm text-red-100 backdrop-blur-xl">{error}</div>}
    <main ref={scroller} onScroll={onScroll} onTouchStart={(event) => { const start = event.touches[0]; touch.current = { x: start.clientX, y: start.clientY }; }} onTouchEnd={handleTouchEnd} className="h-dvh snap-y snap-mandatory overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {loading ? <div className="flex h-dvh items-center justify-center"><div className="rounded-3xl border border-white/10 bg-white/[.04] p-5"><Loader2 className="h-8 w-8 animate-spin text-[#7180ff]" /></div></div> : posts.length === 0 && (mode === 'following' || mode === 'friends') ? <SuggestionEmpty mode={mode} /> : posts.length === 0 ? <div className="flex h-dvh flex-col items-center justify-center bg-[radial-gradient(circle_at_top,#17233a_0,#080b12_48%,#030509_100%)] px-6 text-center"><Sparkles className="h-12 w-12 text-[#7180ff]" /><h2 className="mt-4 text-xl font-black">{mode === 'mine' ? 'Your Social space is ready' : 'Social is ready for discovery'}</h2><p className="mt-2 max-w-sm text-sm text-white/45">{mode === 'mine' ? 'Create your first post. You can edit or delete anything you publish.' : 'New eligible Social, community and News media posts will appear here.'}</p><button type="button" onClick={() => navigate('/communities')} className="mt-5 rounded-2xl border border-white/10 bg-white/[.06] px-4 py-2.5 text-sm font-bold">Explore Communities</button></div> : posts.map((post, index) => <div key={post.id}>{settings.sponsored?.enabled && maxAds > 0 && index > 0 && index % adGap === 0 && Math.floor(index / adGap) <= maxAds && <section className="flex h-dvh min-h-[520px] snap-start items-center justify-center bg-[radial-gradient(circle_at_top,#17233a_0,#080b12_50%,#030509_100%)] p-4"><div className="w-full max-w-xl"><SponsoredPlacementCard placement="feed" variant="feed" heading="Sponsored on Social" /></div></section>}<SocialCard post={post} index={index} activeIndex={activeIndex} active={post.id === activePostId} sessionId={sessionId} qualifiedMs={qualifiedMs} fastSkipMs={fastSkipMs} following={followingIds.has(post.author_id) || post.is_following} own={post.source_type !== 'news' && post.author_id === user?.id} onPatch={(value) => patch(post.id, value)} onActive={() => onActive(post, index)} onProfile={() => openProfile(post)} onFollow={() => void handleFollow(post)} onEdit={() => { if (post.source_type === 'news') return; setEditing(post); setComposer(true); }} onDelete={() => void deletePost(post)} onComments={() => setComments(post)} onRemove={() => setPosts((current) => current.filter((item) => item.id !== post.id))} /></div>)}
      {loadingMore && <div className="pointer-events-none fixed bottom-24 left-1/2 z-[105] -translate-x-1/2 rounded-2xl border border-white/10 bg-black/60 p-3 backdrop-blur"><Loader2 className="h-5 w-5 animate-spin text-[#7180ff]" /></div>}
    </main>
    {composer && <ComposerModal initial={editing} onClose={() => { setComposer(false); setEditing(null); }} onSaved={() => { setComposer(false); setEditing(null); sessionStorage.removeItem(user ? snapshotKey(user.id, mode) : ''); void freshLoad(); }} />}
    {comments && <CommentsModal post={comments} onClose={() => setComments(null)} onCount={(count) => patch(comments.id, { comment_count: count })} />}
  </div>;
}
