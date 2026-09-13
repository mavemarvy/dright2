import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bookmark,
  CheckCircle,
  ChevronLeft,
  Expand,
  Image as ImageIcon,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCw,
  Send,
  Share2,
  ThumbsUp,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  Video,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useFollow } from '../lib/socialHooks';
import { supabase } from '../lib/supabase';

type ReactionType = 'like' | 'love' | 'care' | 'haha' | 'wow' | 'sad' | 'angry';
type FeedMode = 'for_you' | 'following' | 'friends' | 'mine';
type Visibility = 'public' | 'followers' | 'friends' | 'private';
type MediaType = 'image' | 'video';

type SocialPost = {
  id: string;
  author_id: string;
  author_name: string | null;
  author_username: string | null;
  author_avatar: string | null;
  author_verified: boolean;
  body: string;
  media_path: string | null;
  media_type: MediaType | null;
  media_width: number | null;
  media_height: number | null;
  media_url?: string | null;
  visibility: Visibility;
  comments_enabled: boolean;
  allowed_reactions: ReactionType[];
  created_at: string;
  updated_at: string;
  edited_at: string | null;
  is_following: boolean;
  is_friend: boolean;
  view_count: number;
  reaction_count: number;
  comment_count: number;
  save_count: number;
  current_reaction: ReactionType | null;
  is_saved: boolean;
};

type SocialComment = {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  author_name: string;
  author_avatar: string | null;
  can_delete: boolean;
};

type NewsBridge = {
  id: string;
  title: string;
  message: string;
  media_url: string | null;
  media_type: MediaType | null;
  published_at: string;
  view_count: number;
};

type ComposerState = {
  id: string | null;
  body: string;
  visibility: Visibility;
  commentsEnabled: boolean;
  allowedReactions: ReactionType[];
  mediaPath: string | null;
  mediaType: MediaType | null;
  mediaWidth: number | null;
  mediaHeight: number | null;
  mediaUrl: string | null;
};

const REACTIONS: Record<ReactionType, { emoji: string; label: string }> = {
  like: { emoji: '👍', label: 'Like' },
  love: { emoji: '❤️', label: 'Love' },
  care: { emoji: '🤗', label: 'Care' },
  haha: { emoji: '😂', label: 'Haha' },
  wow: { emoji: '😮', label: 'Wow' },
  sad: { emoji: '😢', label: 'Sad' },
  angry: { emoji: '😡', label: 'Angry' },
};
const ALL_REACTIONS = Object.keys(REACTIONS) as ReactionType[];
const PAGE_SIZE = 20;
const MAX_MEDIA_SIZE = 100 * 1024 * 1024;

const emptyComposer = (): ComposerState => ({
  id: null,
  body: '',
  visibility: 'public',
  commentsEnabled: true,
  allowedReactions: [...ALL_REACTIONS],
  mediaPath: null,
  mediaType: null,
  mediaWidth: null,
  mediaHeight: null,
  mediaUrl: null,
});

function compact(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`;
  return String(value || 0);
}

function safeExtension(file: File, mediaType: MediaType) {
  const candidate = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (candidate && candidate.length <= 8) return candidate;
  if (mediaType === 'video') return file.type === 'video/webm' ? 'webm' : file.type === 'video/quicktime' ? 'mov' : 'mp4';
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  if (file.type === 'image/gif') return 'gif';
  return 'jpg';
}

function readDimensions(file: File, mediaType: MediaType): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    if (mediaType === 'image') {
      const image = new Image();
      image.onload = () => {
        resolve({ width: image.naturalWidth || 1, height: image.naturalHeight || 1 });
        URL.revokeObjectURL(url);
      };
      image.onerror = () => {
        resolve({ width: 1, height: 1 });
        URL.revokeObjectURL(url);
      };
      image.src = url;
      return;
    }
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      resolve({ width: video.videoWidth || 1, height: video.videoHeight || 1 });
      URL.revokeObjectURL(url);
    };
    video.onerror = () => {
      resolve({ width: 1, height: 1 });
      URL.revokeObjectURL(url);
    };
    video.src = url;
  });
}

function feedMode(pathname: string): FeedMode {
  if (pathname.endsWith('/following')) return 'following';
  if (pathname.endsWith('/friends')) return 'friends';
  if (pathname.endsWith('/mine')) return 'mine';
  return 'for_you';
}

function SocialReaction({ post, onReact }: { post: SocialPost; onReact: (reaction: ReactionType) => void }) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);
  const allowed = Array.isArray(post.allowed_reactions) ? post.allowed_reactions : [];
  const fallback: ReactionType | undefined = allowed.includes('like') ? 'like' : allowed[0];

  const beginPress = () => {
    if (!allowed.length) return;
    timer.current = window.setTimeout(() => setOpen(true), 430);
  };
  const clearPress = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  };

  if (!allowed.length) return null;

  return (
    <div className="relative flex flex-col items-center">
      {open && (
        <div className="absolute bottom-14 right-0 z-50 flex gap-1 rounded-full border border-white/10 bg-black/85 p-1.5 shadow-2xl backdrop-blur-xl">
          {allowed.map((reaction) => (
            <button key={reaction} type="button" onClick={() => { setOpen(false); onReact(reaction); }} className="h-10 w-10 rounded-full text-2xl hover:bg-white/10" title={REACTIONS[reaction].label}>
              {REACTIONS[reaction].emoji}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        onPointerDown={beginPress}
        onPointerUp={clearPress}
        onPointerCancel={clearPress}
        onPointerLeave={clearPress}
        onDoubleClick={() => setOpen(true)}
        onClick={() => fallback && onReact(fallback)}
        className="flex h-12 w-12 items-center justify-center rounded-full bg-black/45 text-white shadow-lg backdrop-blur"
        aria-label="React"
      >
        {post.current_reaction ? <span className="text-2xl">{REACTIONS[post.current_reaction].emoji}</span> : <ThumbsUp className="h-7 w-7" />}
      </button>
      {post.reaction_count > 0 && <span className="mt-1 text-xs font-bold text-white drop-shadow">{compact(post.reaction_count)}</span>}
    </div>
  );
}

function CommentsModal({ post, onClose, onCountChange }: { post: SocialPost; onClose: () => void; onCountChange: (count: number) => void }) {
  const [comments, setComments] = useState<SocialComment[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: loadError } = await supabase.rpc('get_social_post_comments', { p_post_id: post.id });
    if (loadError) setError(loadError.message);
    else setComments((data || []) as SocialComment[]);
    setLoading(false);
  }, [post.id]);

  useEffect(() => { void load(); }, [load]);

  const send = async () => {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    const { data, error: sendError } = await supabase.rpc('add_social_post_comment', { p_post_id: post.id, p_body: body });
    setBusy(false);
    if (sendError) return setError(sendError.message);
    setDraft('');
    const result = (data || {}) as Record<string, unknown>;
    onCountChange(Number(result.comment_count || post.comment_count + 1));
    await load();
  };

  const remove = async (commentId: string) => {
    const { data, error: deleteError } = await supabase.rpc('delete_social_post_comment', { p_comment_id: commentId });
    if (deleteError) return setError(deleteError.message);
    onCountChange(Number(data || 0));
    await load();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 sm:items-center sm:p-4" onClick={onClose}>
      <div className="flex max-h-[82vh] w-full max-w-xl flex-col rounded-t-3xl border border-white/10 bg-[#11151e] text-white shadow-2xl sm:rounded-3xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
          <div><h2 className="font-bold">Comments</h2><p className="text-xs text-neutral-500">{post.comment_count} comment{post.comment_count === 1 ? '' : 's'}</p></div>
          <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-white/10"><X className="h-5 w-5" /></button>
        </div>
        <div className="min-h-[220px] flex-1 overflow-y-auto p-4">
          {error && <div className="mb-3 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>}
          {loading ? <div className="flex min-h-[180px] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div> : comments.length === 0 ? <p className="py-12 text-center text-sm text-neutral-500">No comments yet.</p> : (
            <div className="space-y-3">
              {comments.map((comment) => (
                <div key={comment.id} className="flex items-start gap-3">
                  {comment.author_avatar ? <img src={comment.author_avatar} alt="" className="h-9 w-9 rounded-full object-cover" /> : <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-xs font-bold">{comment.author_name?.slice(0, 1).toUpperCase() || 'D'}</div>}
                  <div className="min-w-0 flex-1 rounded-2xl bg-white/[0.06] px-3.5 py-2.5">
                    <div className="flex items-start justify-between gap-2"><div><p className="text-xs font-bold text-neutral-200">{comment.author_name}</p><p className="mt-1 whitespace-pre-wrap text-sm text-neutral-300">{comment.body}</p></div>{comment.can_delete && <button type="button" onClick={() => void remove(comment.id)} className="rounded-lg p-1 text-neutral-500 hover:bg-white/10 hover:text-red-300"><Trash2 className="h-4 w-4" /></button>}</div>
                    <p className="mt-1.5 text-[10px] text-neutral-600">{new Date(comment.created_at).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {post.comments_enabled && (
          <div className="flex gap-2 border-t border-white/10 p-3 safe-area-bottom">
            <input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }} maxLength={2000} placeholder="Write a comment…" className="min-h-[44px] flex-1 rounded-full border border-white/10 bg-white/[0.06] px-4 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-[#7180ff]" />
            <button type="button" disabled={busy || !draft.trim()} onClick={() => void send()} className="flex h-11 w-11 items-center justify-center rounded-full bg-[#4353ff] disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button>
          </div>
        )}
      </div>
    </div>
  );
}

function ComposerModal({ initial, onClose, onSaved }: { initial?: SocialPost | null; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth();
  const [form, setForm] = useState<ComposerState>(() => initial ? {
    id: initial.id,
    body: initial.body,
    visibility: initial.visibility,
    commentsEnabled: initial.comments_enabled,
    allowedReactions: [...(initial.allowed_reactions || [])],
    mediaPath: initial.media_path,
    mediaType: initial.media_type,
    mediaWidth: initial.media_width,
    mediaHeight: initial.media_height,
    mediaUrl: initial.media_url || null,
  } : emptyComposer());
  const [file, setFile] = useState<File | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => { if (localPreview) URL.revokeObjectURL(localPreview); }, [localPreview]);

  const chooseFile = async (selected: File | undefined) => {
    if (!selected) return;
    const mediaType: MediaType | null = selected.type.startsWith('image/') ? 'image' : selected.type.startsWith('video/') ? 'video' : null;
    if (!mediaType) return setError('Choose a photo or video.');
    if (selected.size > MAX_MEDIA_SIZE) return setError('Social media uploads must be 100 MB or smaller.');
    const dimensions = await readDimensions(selected, mediaType);
    if (localPreview) URL.revokeObjectURL(localPreview);
    setFile(selected);
    setLocalPreview(URL.createObjectURL(selected));
    setForm((current) => ({ ...current, mediaType, mediaWidth: dimensions.width, mediaHeight: dimensions.height }));
    setError(null);
  };

  const removeMedia = () => {
    if (localPreview) URL.revokeObjectURL(localPreview);
    setLocalPreview(null);
    setFile(null);
    setForm((current) => ({ ...current, mediaPath: null, mediaType: null, mediaWidth: null, mediaHeight: null, mediaUrl: null }));
  };

  const toggleReaction = (reaction: ReactionType) => setForm((current) => ({ ...current, allowedReactions: current.allowedReactions.includes(reaction) ? current.allowedReactions.filter((value) => value !== reaction) : [...current.allowedReactions, reaction] }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;
    if (!form.body.trim() && !file && !form.mediaPath) return setError('Add text, a photo, or a video.');
    setSubmitting(true);
    setError(null);

    const oldPath = initial?.media_path || null;
    let uploadedPath: string | null = null;
    let mediaPath = form.mediaPath;
    try {
      if (file && form.mediaType) {
        const extension = safeExtension(file, form.mediaType);
        const unique = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        uploadedPath = `${user.id}/${new Date().toISOString().slice(0, 10)}/${unique}.${extension}`;
        const { error: uploadError } = await supabase.storage.from('social-media').upload(uploadedPath, file, { upsert: false, cacheControl: '3600', contentType: file.type });
        if (uploadError) throw uploadError;
        mediaPath = uploadedPath;
      }

      const args = {
        p_body: form.body.trim(),
        p_media_path: mediaPath,
        p_media_type: mediaPath ? form.mediaType : null,
        p_visibility: form.visibility,
        p_comments_enabled: form.commentsEnabled,
        p_allowed_reactions: form.allowedReactions,
        p_media_width: mediaPath ? form.mediaWidth : null,
        p_media_height: mediaPath ? form.mediaHeight : null,
      };
      const result = form.id ? await supabase.rpc('update_social_post', { p_post_id: form.id, ...args }) : await supabase.rpc('create_social_post', args);
      if (result.error) throw result.error;

      if (oldPath && oldPath !== mediaPath) await supabase.storage.from('social-media').remove([oldPath]);
      setSubmitting(false);
      onSaved();
    } catch (caught) {
      if (uploadedPath) await supabase.storage.from('social-media').remove([uploadedPath]);
      setSubmitting(false);
      setError(caught instanceof Error ? caught.message : 'Unable to save this post.');
    }
  };

  const preview = localPreview || form.mediaUrl;
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/70 sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-white/10 bg-[#11151e] p-5 text-white shadow-2xl sm:rounded-3xl sm:p-6" onClick={(event) => event.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between"><div><h2 className="text-xl font-black">{form.id ? 'Edit your post' : 'Create a Social post'}</h2><p className="mt-1 text-xs text-neutral-500">This is your Social content, separate from admin News.</p></div><button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-white/10"><X className="h-5 w-5" /></button></div>
        {error && <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>}
        <form onSubmit={submit} className="space-y-5">
          <textarea value={form.body} onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))} rows={6} maxLength={5000} placeholder="What do you want to share?" className="w-full resize-y rounded-2xl border border-white/10 bg-white/[0.05] p-4 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-[#7180ff]" />
          {preview && <div className="relative overflow-hidden rounded-2xl bg-black">{form.mediaType === 'video' ? <video src={preview} controls playsInline className="max-h-[420px] w-full object-contain" /> : <img src={preview} alt="Preview" className="max-h-[420px] w-full object-contain" />}<button type="button" onClick={removeMedia} className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/70"><X className="h-4 w-4" /></button></div>}
          {!preview && <label className="flex min-h-[90px] cursor-pointer items-center justify-center gap-3 rounded-2xl border border-dashed border-white/15 bg-white/[0.03] text-sm font-semibold text-neutral-300 hover:border-[#7180ff]"><ImageIcon className="h-5 w-5" /><Video className="h-5 w-5" /> Add photo or video<input type="file" accept="image/*,video/*" className="hidden" onChange={(event) => void chooseFile(event.target.files?.[0])} /></label>}
          {preview && <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-neutral-300 hover:bg-white/5">Replace media<input type="file" accept="image/*,video/*" className="hidden" onChange={(event) => void chooseFile(event.target.files?.[0])} /></label>}
          <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold text-neutral-300">Audience<select value={form.visibility} onChange={(event) => setForm((current) => ({ ...current, visibility: event.target.value as Visibility }))} className="mt-2 w-full rounded-xl border border-white/10 bg-[#1b202b] px-3 py-3 text-white outline-none"><option value="public">Public</option><option value="followers">Followers</option><option value="friends">Friends</option><option value="private">Only me</option></select></label><label className="flex items-center justify-between rounded-2xl border border-white/10 p-4 text-sm font-semibold text-neutral-300">Comments<input type="checkbox" checked={form.commentsEnabled} onChange={(event) => setForm((current) => ({ ...current, commentsEnabled: event.target.checked }))} className="h-4 w-4" /></label></div>
          <div><p className="text-sm font-semibold text-neutral-300">Allowed reactions</p><div className="mt-2 flex flex-wrap gap-2">{ALL_REACTIONS.map((reaction) => { const active = form.allowedReactions.includes(reaction); return <button key={reaction} type="button" onClick={() => toggleReaction(reaction)} className={`rounded-full border px-3 py-2 text-sm ${active ? 'border-[#7180ff] bg-[#4353ff]/15 text-white' : 'border-white/10 text-neutral-600'}`}><span className="mr-1 text-lg">{REACTIONS[reaction].emoji}</span>{REACTIONS[reaction].label}</button>; })}</div><p className="mt-2 text-xs text-neutral-600">Deselect every reaction to disable reactions on this post.</p></div>
          <button type="submit" disabled={submitting} className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-[#4353ff] px-4 font-bold text-white hover:bg-[#5261ff] disabled:opacity-50">{submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : form.id ? <Pencil className="h-5 w-5" /> : <Plus className="h-5 w-5" />}{form.id ? 'Save changes' : 'Post to Social'}</button>
        </form>
      </div>
    </div>
  );
}

function NewsBridgeCard({ item }: { item: NewsBridge }) {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const viewed = useRef(false);
  const [landscape, setLandscape] = useState(false);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    if (viewed.current) return;
    viewed.current = true;
    void supabase.rpc('record_global_content_view', { p_content_id: item.id });
  }, [item.id]);

  const fullscreen = async () => { try { await videoRef.current?.requestFullscreen?.(); } catch { /* unsupported */ } };
  const rotate = async () => {
    try {
      await videoRef.current?.requestFullscreen?.();
      const orientation = (screen as Screen & { orientation?: ScreenOrientation & { lock?: (orientation: string) => Promise<void> } }).orientation;
      await orientation?.lock?.('landscape');
    } catch { /* orientation lock is optional */ }
  };
  const share = async () => {
    const url = `${window.location.origin}/news?item=${item.id}`;
    if (navigator.share) { try { await navigator.share({ title: item.title, text: item.message.slice(0, 140), url }); return; } catch { /* copy fallback */ } }
    await navigator.clipboard?.writeText(url);
  };

  return (
    <section className="relative h-[calc(100dvh-8rem)] min-h-[520px] w-full snap-start overflow-hidden bg-black md:h-screen">
      <div className="absolute inset-0 flex items-center justify-center bg-black">
        {item.media_type === 'video' && item.media_url ? <video ref={videoRef} src={item.media_url} playsInline loop muted={muted} autoPlay preload="metadata" onLoadedMetadata={(event) => setLandscape(event.currentTarget.videoWidth > event.currentTarget.videoHeight)} onClick={(event) => event.currentTarget.paused ? void event.currentTarget.play() : event.currentTarget.pause()} className="h-full w-full object-contain" /> : item.media_type === 'image' && item.media_url ? <img src={item.media_url} alt="" className="h-full w-full object-contain" /> : <div className="absolute inset-0 bg-gradient-to-b from-[#1b2030] via-[#10151f] to-black" />}
      </div>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/85" />
      <div className="absolute left-4 right-20 top-16 z-20"><span className="rounded-full border border-blue-400/20 bg-blue-500/20 px-3 py-1 text-xs font-bold text-blue-200 backdrop-blur">DRIGHT News</span></div>
      {item.media_type === 'video' && <div className="absolute right-3 top-16 z-30 flex flex-col gap-2"><button type="button" onClick={() => setMuted((value) => !value)} className="flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur">{muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}</button>{landscape && <><button type="button" onClick={() => void fullscreen()} className="flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur" title="Full screen"><Expand className="h-5 w-5" /></button><button type="button" onClick={() => void rotate()} className="flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur" title="Flip landscape video"><RotateCw className="h-5 w-5" /></button></>}</div>}
      <div className="absolute bottom-20 left-4 right-20 z-20 text-white md:bottom-6"><p className="text-sm font-extrabold">DRIGHT News</p><p className="mt-1 text-xs text-white/65">{new Date(item.published_at).toLocaleDateString()}</p><h2 className="mt-3 text-xl font-black leading-tight">{item.title}</h2><p className="mt-2 line-clamp-2 text-sm leading-relaxed text-white/90">{item.message}</p><button type="button" onClick={() => navigate(`/news?item=${item.id}`)} className="mt-2 text-sm font-bold">… more</button></div>
      <div className="absolute bottom-20 right-3 z-30 flex flex-col gap-4 md:bottom-6"><button type="button" onClick={() => navigate(`/news?item=${item.id}&comments=1`)} className="flex h-12 w-12 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur"><MessageCircle className="h-7 w-7" /></button><button type="button" onClick={() => void share()} className="flex h-12 w-12 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur"><Share2 className="h-7 w-7" /></button></div>
    </section>
  );
}

function SocialCard({
  post,
  own,
  following,
  onFollow,
  onPatch,
  onEdit,
  onDelete,
  onComments,
  onRemoved,
}: {
  post: SocialPost;
  own: boolean;
  following: boolean;
  onFollow: () => void;
  onPatch: (patch: Partial<SocialPost>) => void;
  onEdit: () => void;
  onDelete: () => void;
  onComments: () => void;
  onRemoved: () => void;
}) {
  const navigate = useNavigate();
  const root = useRef<HTMLElement | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const viewed = useRef(false);
  const visibleAt = useRef<number | null>(null);
  const [muted, setMuted] = useState(true);
  const [landscape, setLandscape] = useState(Boolean(post.media_width && post.media_height && post.media_width > post.media_height));
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reactionBusy, setReactionBusy] = useState(false);

  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.intersectionRatio >= 0.65) {
          visibleAt.current = Date.now();
          video.current?.play().catch(() => undefined);
          if (!viewed.current) {
            viewed.current = true;
            void supabase.rpc('record_social_post_view', { p_post_id: post.id }).then(({ data }) => onPatch({ view_count: Number(data || post.view_count) }));
          }
        } else {
          video.current?.pause();
          if (visibleAt.current) {
            const dwell = Date.now() - visibleAt.current;
            visibleAt.current = null;
            if (dwell >= 2000) void supabase.rpc('record_social_post_event', { p_post_id: post.id, p_event_type: 'dwell', p_dwell_ms: dwell });
          }
        }
      }
    }, { threshold: [0.2, 0.65, 0.9] });
    observer.observe(node);
    return () => observer.disconnect();
  }, [onPatch, post.id, post.view_count]);

  const react = async (reaction: ReactionType) => {
    if (reactionBusy) return;
    setReactionBusy(true);
    const { data } = await supabase.rpc('set_social_post_reaction', { p_post_id: post.id, p_reaction: reaction });
    setReactionBusy(false);
    if (data) {
      const result = data as Record<string, unknown>;
      onPatch({ current_reaction: (result.reaction || null) as ReactionType | null, reaction_count: Number(result.reaction_count || 0) });
    }
  };

  const save = async () => {
    const { data } = await supabase.rpc('toggle_social_post_save', { p_post_id: post.id });
    if (data) {
      const result = data as Record<string, unknown>;
      onPatch({ is_saved: Boolean(result.saved), save_count: Number(result.save_count || 0) });
    }
  };

  const share = async () => {
    const url = `${window.location.origin}/social?post=${post.id}`;
    if (navigator.share) { try { await navigator.share({ text: post.body.slice(0, 140), url }); void supabase.rpc('record_social_post_event', { p_post_id: post.id, p_event_type: 'share', p_dwell_ms: null }); return; } catch { /* copy fallback */ } }
    await navigator.clipboard?.writeText(url);
    void supabase.rpc('record_social_post_event', { p_post_id: post.id, p_event_type: 'share', p_dwell_ms: null });
  };

  const openProfile = () => {
    void supabase.rpc('record_social_post_event', { p_post_id: post.id, p_event_type: 'profile_visit', p_dwell_ms: null });
    navigate(`/profile/${post.author_id}`);
  };

  const hide = async (eventType: 'not_interested' | 'hide_creator') => {
    const { error } = await supabase.rpc('record_social_post_event', { p_post_id: post.id, p_event_type: eventType, p_dwell_ms: null });
    if (!error) onRemoved();
  };

  const fullscreen = async () => { try { await video.current?.requestFullscreen?.(); } catch { /* unsupported */ } };
  const rotate = async () => {
    try {
      await video.current?.requestFullscreen?.();
      const orientation = (screen as Screen & { orientation?: ScreenOrientation & { lock?: (orientation: string) => Promise<void> } }).orientation;
      await orientation?.lock?.('landscape');
    } catch { /* optional */ }
  };

  return (
    <section ref={root} className="relative h-[calc(100dvh-8rem)] min-h-[520px] w-full snap-start overflow-hidden bg-black md:h-screen">
      <div className="absolute inset-0 flex items-center justify-center bg-black">
        {post.media_type === 'video' && post.media_url ? (
          <video ref={video} src={post.media_url} playsInline loop muted={muted} preload="metadata" onEnded={() => void supabase.rpc('record_social_post_event', { p_post_id: post.id, p_event_type: 'watch_complete', p_dwell_ms: null })} onLoadedMetadata={(event) => setLandscape(event.currentTarget.videoWidth > event.currentTarget.videoHeight)} onClick={(event) => event.currentTarget.paused ? void event.currentTarget.play() : event.currentTarget.pause()} className="h-full w-full object-contain" />
        ) : post.media_type === 'image' && post.media_url ? <img src={post.media_url} alt="" className="h-full w-full object-contain" /> : <div className="absolute inset-0 bg-gradient-to-b from-[#172033] via-[#111827] to-black" />}
      </div>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/90" />

      {post.media_type === 'video' && <div className="absolute right-3 top-16 z-30 flex flex-col gap-2"><button type="button" onClick={() => setMuted((value) => !value)} className="flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur">{muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}</button>{landscape && <><button type="button" onClick={() => void fullscreen()} className="flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur" title="Full screen"><Expand className="h-5 w-5" /></button><button type="button" onClick={() => void rotate()} className="flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur" title="Flip landscape video"><RotateCw className="h-5 w-5" /></button></>}</div>}

      <div className="absolute bottom-20 left-4 right-20 z-20 text-white md:bottom-6">
        <div className="flex items-center gap-3">
          <button type="button" onClick={openProfile} className="shrink-0">{post.author_avatar ? <img src={post.author_avatar} alt="" className="h-11 w-11 rounded-full border-2 border-white object-cover" /> : <div className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-white bg-[#4353ff] font-black">{(post.author_name || post.author_username || 'D').slice(0, 1).toUpperCase()}</div>}</button>
          <button type="button" onClick={openProfile} className="min-w-0 text-left"><div className="flex items-center gap-1"><span className="truncate text-sm font-extrabold">{post.author_username ? `@${post.author_username}` : post.author_name || 'DRIGHT User'}</span>{post.author_verified && <CheckCircle className="h-4 w-4 shrink-0 text-blue-400" />}</div>{post.author_username && post.author_name && <p className="truncate text-xs text-white/65">{post.author_name}</p>}</button>
          {!own && <button type="button" onClick={onFollow} className={`ml-1 inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold ${following ? 'bg-white/15 text-white' : 'bg-[#4353ff] text-white'}`}>{following ? <UserCheck className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}{following ? 'Following' : 'Follow'}</button>}
        </div>
        {post.body && <div className="mt-3"><p className={`whitespace-pre-wrap text-sm leading-relaxed text-white/95 ${expanded ? '' : 'line-clamp-2'}`}>{post.body}</p>{post.body.length > 100 && <button type="button" onClick={() => setExpanded((value) => !value)} className="mt-1 text-sm font-bold text-white">{expanded ? 'less' : '… more'}</button>}</div>}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-white/60"><span>{compact(post.view_count)} views</span><span>·</span><span>{new Date(post.created_at).toLocaleDateString()}</span>{post.edited_at && <><span>·</span><span>edited</span></>}</div>
      </div>

      <div className="absolute bottom-20 right-3 z-30 flex flex-col items-center gap-4 md:bottom-6">
        <SocialReaction post={post} onReact={(reaction) => void react(reaction)} />
        {post.comments_enabled && <button type="button" onClick={onComments} className="flex flex-col items-center text-white"><span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/45 backdrop-blur"><MessageCircle className="h-7 w-7" /></span>{post.comment_count > 0 && <span className="mt-1 text-xs font-bold">{compact(post.comment_count)}</span>}</button>}
        <button type="button" onClick={() => void share()} className="flex h-12 w-12 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur"><Share2 className="h-7 w-7" /></button>
        <button type="button" onClick={() => void save()} className={`flex h-12 w-12 items-center justify-center rounded-full bg-black/45 backdrop-blur ${post.is_saved ? 'text-[#7180ff]' : 'text-white'}`}><Bookmark className={`h-7 w-7 ${post.is_saved ? 'fill-current' : ''}`} /></button>
        <div className="relative"><button type="button" onClick={() => setMenuOpen((value) => !value)} className="flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur"><MoreHorizontal className="h-6 w-6" /></button>{menuOpen && <div className="absolute bottom-12 right-0 w-44 overflow-hidden rounded-2xl border border-white/10 bg-[#171b25] py-1 text-sm text-white shadow-2xl">{own ? <><button type="button" onClick={() => { setMenuOpen(false); onEdit(); }} className="flex w-full items-center gap-2 px-4 py-3 hover:bg-white/5"><Pencil className="h-4 w-4" /> Edit post</button><button type="button" onClick={() => { setMenuOpen(false); onDelete(); }} className="flex w-full items-center gap-2 px-4 py-3 text-red-300 hover:bg-white/5"><Trash2 className="h-4 w-4" /> Delete post</button></> : <><button type="button" onClick={() => void hide('not_interested')} className="w-full px-4 py-3 text-left hover:bg-white/5">Not interested</button><button type="button" onClick={() => void hide('hide_creator')} className="w-full px-4 py-3 text-left hover:bg-white/5">Hide this creator</button></>}</div>}</div>
      </div>
    </section>
  );
}

export default function SocialFieldPage() {
  const { user } = useAuth();
  const { followingIds, toggleFollow } = useFollow();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const mode = feedMode(location.pathname);
  const targetPost = params.get('post');
  const newsId = params.get('news');
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [newsBridge, setNewsBridge] = useState<NewsBridge | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editing, setEditing] = useState<SocialPost | null>(null);
  const [commentsPost, setCommentsPost] = useState<SocialPost | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLElement | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const signPosts = useCallback(async (rows: SocialPost[]) => Promise.all(rows.map(async (post) => {
    if (!post.media_path) return { ...post, media_url: null };
    const { data, error: signError } = await supabase.storage.from('social-media').createSignedUrl(post.media_path, 60 * 60);
    return { ...post, media_url: signError ? null : data.signedUrl };
  })), []);

  const loadFeed = useCallback(async (reset: boolean) => {
    if (!user) return;
    reset ? setLoading(true) : setLoadingMore(true);
    setError(null);
    const offset = reset ? 0 : posts.length;
    const { data, error: feedError } = await supabase.rpc('get_social_feed', { p_feed: mode, p_limit: PAGE_SIZE, p_offset: offset, p_target_id: reset ? targetPost : null });
    if (feedError) {
      setError(feedError.message);
      if (reset) setPosts([]);
    } else {
      const raw = (Array.isArray(data) ? data : []) as SocialPost[];
      const signed = await signPosts(raw);
      setPosts((current) => reset ? signed : [...current, ...signed.filter((next) => !current.some((existing) => existing.id === next.id))]);
      setHasMore(raw.length === PAGE_SIZE);
    }
    setLoading(false);
    setLoadingMore(false);
  }, [mode, posts.length, signPosts, targetPost, user]);

  useEffect(() => { void loadFeed(true); }, [mode, targetPost]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let active = true;
    if (!newsId) { setNewsBridge(null); return; }
    void (async () => {
      const { data } = await supabase.from('global_announcements').select('id,title,message,media_url,media_type,published_at,view_count').eq('id', newsId).eq('is_active', true).maybeSingle();
      if (active) setNewsBridge(data ? data as NewsBridge : null);
    })();
    return () => { active = false; };
  }, [newsId]);

  const patchPost = useCallback((id: string, patch: Partial<SocialPost>) => {
    setPosts((current) => current.map((post) => post.id === id ? { ...post, ...patch } : post));
    setCommentsPost((current) => current?.id === id ? { ...current, ...patch } : current);
  }, []);

  const removeFromFeed = (id: string) => setPosts((current) => current.filter((post) => post.id !== id));

  const deletePost = async (post: SocialPost) => {
    if (!window.confirm('Delete this Social post permanently?')) return;
    const { data, error: deleteError } = await supabase.rpc('delete_social_post', { p_post_id: post.id });
    if (deleteError) return setError(deleteError.message);
    const mediaPath = typeof data === 'string' ? data : null;
    if (mediaPath) await supabase.storage.from('social-media').remove([mediaPath]);
    removeFromFeed(post.id);
  };

  const switchFeed = (next: FeedMode) => navigate(next === 'for_you' ? '/social' : `/social/${next}`);

  const handleTouchEnd = (event: React.TouchEvent<HTMLElement>) => {
    if (!touchStart.current) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStart.current.x;
    const dy = touch.clientY - touchStart.current.y;
    touchStart.current = null;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    if (mode === 'for_you' && dx < 0) switchFeed('following');
    else if (mode === 'for_you' && dx > 0) switchFeed('friends');
    else if (mode === 'following' && dx > 0) switchFeed('for_you');
    else if (mode === 'friends' && dx < 0) switchFeed('for_you');
  };

  const onScroll = () => {
    const node = scroller.current;
    if (!node || loadingMore || !hasMore) return;
    if (node.scrollTop + node.clientHeight >= node.scrollHeight - node.clientHeight * 1.5) void loadFeed(false);
  };

  const tabs = useMemo(() => [
    { mode: 'following' as FeedMode, label: 'Following' },
    { mode: 'for_you' as FeedMode, label: 'Social Field' },
    { mode: 'friends' as FeedMode, label: 'Friends' },
  ], []);

  return (
    <div className="relative bg-black text-white">
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-40 flex justify-center pt-3">
        <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-white/10 bg-black/45 p-1 shadow-xl backdrop-blur-xl">
          {tabs.map((tab) => <button key={tab.mode} type="button" onClick={() => switchFeed(tab.mode)} className={`rounded-full px-3 py-2 text-xs font-bold transition sm:px-4 ${mode === tab.mode ? 'bg-white text-black' : 'text-white/70 hover:text-white'}`}>{tab.label}</button>)}
          <button type="button" onClick={() => switchFeed('mine')} className={`rounded-full px-3 py-2 text-xs font-bold transition ${mode === 'mine' ? 'bg-white text-black' : 'text-white/70 hover:text-white'}`}>My Posts</button>
        </div>
      </div>

      <button type="button" onClick={() => { setEditing(null); setComposerOpen(true); }} className="fixed bottom-24 left-1/2 z-[55] flex h-12 -translate-x-1/2 items-center gap-2 rounded-full bg-[#4353ff] px-5 text-sm font-black text-white shadow-[0_10px_35px_rgba(67,83,255,.45)] md:bottom-6 md:left-auto md:right-6 md:translate-x-0"><Plus className="h-5 w-5" /> Post</button>

      {error && <div className="fixed left-1/2 top-16 z-[60] w-[min(92vw,520px)] -translate-x-1/2 rounded-xl border border-red-500/20 bg-red-950/90 p-3 text-sm text-red-100 shadow-2xl">{error}</div>}

      <main
        ref={scroller}
        onScroll={onScroll}
        onTouchStart={(event) => { const touch = event.touches[0]; touchStart.current = { x: touch.clientX, y: touch.clientY }; }}
        onTouchEnd={handleTouchEnd}
        className="h-[calc(100dvh-8rem)] snap-y snap-mandatory overflow-y-auto bg-black [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:h-screen"
      >
        {newsBridge && mode === 'for_you' && <NewsBridgeCard item={newsBridge} />}
        {loading ? <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#7180ff]" /></div> : posts.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center"><div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/[0.05]"><Users className="h-10 w-10 text-neutral-600" /></div><h2 className="mt-5 text-xl font-black">{mode === 'mine' ? 'Your Social space is ready' : mode === 'following' ? 'Follow creators to build this feed' : mode === 'friends' ? 'Your friends’ posts will appear here' : 'Social Field is ready'}</h2><p className="mt-2 max-w-sm text-sm text-neutral-500">{mode === 'mine' ? 'Create your first post. You can edit or delete anything you publish.' : mode === 'following' ? 'Posts from people you follow will appear here.' : mode === 'friends' ? 'Friends are people who follow each other on DRIGHT.' : 'New public posts will appear here as people start sharing.'}</p>{mode === 'mine' && <button type="button" onClick={() => setComposerOpen(true)} className="mt-5 rounded-full bg-[#4353ff] px-5 py-3 text-sm font-bold"><Plus className="mr-2 inline h-4 w-4" />Create post</button>}</div>
        ) : posts.map((post) => (
          <SocialCard
            key={post.id}
            post={post}
            own={post.author_id === user?.id}
            following={followingIds.has(post.author_id) || post.is_following}
            onFollow={() => void toggleFollow(post.author_id)}
            onPatch={(patch) => patchPost(post.id, patch)}
            onEdit={() => { setEditing(post); setComposerOpen(true); }}
            onDelete={() => void deletePost(post)}
            onComments={() => setCommentsPost(post)}
            onRemoved={() => removeFromFeed(post.id)}
          />
        ))}
        {loadingMore && <div className="flex h-20 items-center justify-center bg-black"><Loader2 className="h-6 w-6 animate-spin text-[#7180ff]" /></div>}
      </main>

      {composerOpen && <ComposerModal initial={editing} onClose={() => { setComposerOpen(false); setEditing(null); }} onSaved={() => { setComposerOpen(false); setEditing(null); void loadFeed(true); }} />}
      {commentsPost && <CommentsModal post={commentsPost} onClose={() => setCommentsPost(null)} onCountChange={(count) => patchPost(commentsPost.id, { comment_count: count })} />}

      <button type="button" onClick={() => navigate(-1)} className="fixed left-3 top-[4.5rem] z-50 hidden h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur md:flex" aria-label="Back"><ChevronLeft className="h-6 w-6" /></button>
    </div>
  );
}
