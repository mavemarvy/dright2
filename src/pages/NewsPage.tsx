import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  AtSign,
  Bell,
  Bookmark,
  ExternalLink,
  Loader2,
  Megaphone,
  MessageCircle,
  Newspaper,
  Pin,
  Send,
  Share2,
  ShoppingBag,
  Sparkles,
  Tag,
  ThumbsUp,
  Trash2,
  TrendingUp,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import SeoHead from '../components/SeoHead';
import { DrightMark } from '../components/DrightBrand';
import SponsoredPlacementCard from '../components/promotion/SponsoredPlacementCard';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

type ContentKind = 'news' | 'announcement';
type NewsCategory = 'news' | 'update' | 'market' | 'affiliate' | 'announcement' | 'promo' | 'referral';
type NewsFilter = 'all' | NewsCategory;
type SortOption = 'newest' | 'oldest' | 'trending';
type MediaType = 'image' | 'video';
type ReactionType = 'like' | 'love' | 'care' | 'haha' | 'wow' | 'sad' | 'angry';

interface NewsItem {
  id: string;
  title: string;
  message: string;
  type: NewsCategory;
  content_kind: ContentKind;
  show_in_news: boolean;
  show_in_notifications: boolean;
  is_active: boolean;
  is_pinned: boolean;
  is_trending: boolean;
  mention_all: boolean;
  comments_enabled: boolean;
  allowed_reactions: ReactionType[];
  view_count: number;
  media_url: string | null;
  media_type: MediaType | null;
  external_url: string | null;
  cta_label: string | null;
  created_at: string;
  published_at: string;
  updated_at: string;
}

interface EngagementSummary {
  reaction_count: number;
  comment_count: number;
  save_count: number;
  reaction_breakdown: Record<string, number>;
  current_reaction: ReactionType | null;
  is_saved: boolean;
}

interface CommentItem {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  author_name: string;
  author_avatar: string | null;
  can_delete: boolean;
}

const categories: { value: NewsFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'news', label: 'News' },
  { value: 'update', label: 'Updates' },
  { value: 'market', label: 'Market' },
  { value: 'affiliate', label: 'Affiliate' },
  { value: 'announcement', label: 'Announcements' },
  { value: 'promo', label: 'Promo' },
  { value: 'referral', label: 'Referral' },
];

const categoryConfig: Record<NewsCategory, { icon: LucideIcon; label: string; accent: string; badge: string }> = {
  news: { icon: Newspaper, label: 'News', accent: 'text-blue-300', badge: 'border-blue-400/20 bg-blue-500/10 text-blue-300' },
  update: { icon: AlertTriangle, label: 'Update', accent: 'text-amber-300', badge: 'border-amber-400/20 bg-amber-500/10 text-amber-300' },
  market: { icon: ShoppingBag, label: 'Market', accent: 'text-cyan-300', badge: 'border-cyan-400/20 bg-cyan-500/10 text-cyan-300' },
  affiliate: { icon: Users, label: 'Affiliate', accent: 'text-violet-300', badge: 'border-violet-400/20 bg-violet-500/10 text-violet-300' },
  announcement: { icon: Megaphone, label: 'Announcement', accent: 'text-slate-200', badge: 'border-slate-400/20 bg-slate-500/10 text-slate-200' },
  promo: { icon: Tag, label: 'Promo', accent: 'text-emerald-300', badge: 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300' },
  referral: { icon: Share2, label: 'Referral', accent: 'text-pink-300', badge: 'border-pink-400/20 bg-pink-500/10 text-pink-300' },
};

const reactionMeta: Record<ReactionType, { emoji: string; label: string }> = {
  like: { emoji: '👍', label: 'Like' },
  love: { emoji: '❤️', label: 'Love' },
  care: { emoji: '🤗', label: 'Care' },
  haha: { emoji: '😂', label: 'Haha' },
  wow: { emoji: '😮', label: 'Wow' },
  sad: { emoji: '😢', label: 'Sad' },
  angry: { emoji: '😡', label: 'Angry' },
};

const emptyEngagement: EngagementSummary = {
  reaction_count: 0,
  comment_count: 0,
  save_count: 0,
  reaction_breakdown: {},
  current_reaction: null,
  is_saved: false,
};

function itemCategory(item: NewsItem): NewsCategory {
  if (item.content_kind === 'announcement') return 'announcement';
  return categoryConfig[item.type] ? item.type : 'news';
}

function ReactionButton({
  allowed,
  currentReaction,
  count,
  onReact,
}: {
  allowed: ReactionType[];
  currentReaction: ReactionType | null;
  count: number;
  onReact: (reaction: ReactionType) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const clickTimer = useRef<number | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const longPressed = useRef(false);
  const lastClickAt = useRef(0);

  useEffect(() => () => {
    if (clickTimer.current) window.clearTimeout(clickTimer.current);
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
  }, []);

  if (allowed.length === 0) {
    return (
      <button type="button" disabled className="inline-flex min-h-[42px] items-center gap-2 px-3 text-sm font-medium text-neutral-600">
        <ThumbsUp className="h-5 w-5" /> Reactions off
      </button>
    );
  }

  const defaultReaction = allowed.includes('like') ? 'like' : allowed[0];
  const currentMeta = currentReaction ? reactionMeta[currentReaction] : reactionMeta.like;

  const openPicker = () => {
    if (clickTimer.current) {
      window.clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
    setPickerOpen(true);
  };

  const handleClick = () => {
    if (longPressed.current) {
      longPressed.current = false;
      return;
    }
    const now = Date.now();
    if (now - lastClickAt.current < 300) {
      lastClickAt.current = 0;
      openPicker();
      return;
    }
    lastClickAt.current = now;
    clickTimer.current = window.setTimeout(() => {
      onReact(defaultReaction);
      clickTimer.current = null;
    }, 290);
  };

  const handlePointerDown = () => {
    longPressed.current = false;
    longPressTimer.current = window.setTimeout(() => {
      longPressed.current = true;
      openPicker();
    }, 450);
  };

  const clearLongPress = () => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  return (
    <div className="relative" onClick={(event) => event.stopPropagation()}>
      {pickerOpen && (
        <div className="absolute bottom-full left-0 z-30 mb-2 flex items-center gap-1 rounded-full border border-white/10 bg-[#202531] p-1.5 shadow-2xl">
          {allowed.map((reaction) => (
            <button
              key={reaction}
              type="button"
              onClick={() => {
                setPickerOpen(false);
                onReact(reaction);
              }}
              className={`flex h-10 w-10 items-center justify-center rounded-full text-2xl transition hover:-translate-y-1 hover:bg-white/10 ${currentReaction === reaction ? 'bg-white/10 ring-1 ring-[#7180ff]' : ''}`}
              title={reactionMeta[reaction].label}
              aria-label={reactionMeta[reaction].label}
            >
              {reactionMeta[reaction].emoji}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={handleClick}
        onDoubleClick={(event) => {
          event.preventDefault();
          openPicker();
        }}
        onPointerDown={handlePointerDown}
        onPointerUp={clearLongPress}
        onPointerCancel={clearLongPress}
        onPointerLeave={clearLongPress}
        onContextMenu={(event) => {
          event.preventDefault();
          openPicker();
        }}
        className={`inline-flex min-h-[42px] items-center gap-2 rounded-xl px-3 text-sm font-semibold transition ${currentReaction ? 'text-[#7180ff] hover:bg-[#4353ff]/10' : 'text-neutral-300 hover:bg-white/[0.05] hover:text-white'}`}
        aria-label="Like or react"
      >
        {currentReaction ? <span className="text-xl leading-none">{currentMeta.emoji}</span> : <ThumbsUp className="h-5 w-5" />}
        <span>{currentReaction ? currentMeta.label : 'Like'}</span>
        {count > 0 && <span className="text-xs font-medium text-neutral-500">{count}</span>}
      </button>
    </div>
  );
}

export default function NewsPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const targetItemId = searchParams.get('item');
  const focusComments = searchParams.get('comments') === '1';
  const viewedTargetRef = useRef<string | null>(null);
  const commentsSectionRef = useRef<HTMLDivElement | null>(null);
  const commentInputRef = useRef<HTMLInputElement | null>(null);
  const [items, setItems] = useState<NewsItem[]>([]);
  const [engagement, setEngagement] = useState<Record<string, EngagementSummary>>({});
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentBusy, setCommentBusy] = useState(false);
  const [interactionBusyId, setInteractionBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<NewsFilter>('all');
  const [sort, setSort] = useState<SortOption>('newest');
  const [welcomeVisible, setWelcomeVisible] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshEngagement = async (contentIds: string[]) => {
    if (!contentIds.length || !user) return;
    const { data, error: engagementError } = await supabase.rpc('get_global_content_engagement', {
      p_content_ids: contentIds,
    });
    if (engagementError) return;
    const next: Record<string, EngagementSummary> = {};
    for (const raw of data || []) {
      const row = raw as Record<string, unknown>;
      next[String(row.content_id)] = {
        reaction_count: Number(row.reaction_count || 0),
        comment_count: Number(row.comment_count || 0),
        save_count: Number(row.save_count || 0),
        reaction_breakdown: (row.reaction_breakdown || {}) as Record<string, number>,
        current_reaction: (row.current_reaction || null) as ReactionType | null,
        is_saved: Boolean(row.is_saved),
      };
    }
    setEngagement((current) => ({ ...current, ...next }));
  };

  const loadComments = async (contentId: string) => {
    setCommentsLoading(true);
    const { data, error: commentsError } = await supabase.rpc('get_global_content_comments', {
      p_content_id: contentId,
    });
    if (commentsError) {
      setError(commentsError.message || 'Unable to load comments.');
      setComments([]);
    } else {
      setComments((data || []) as CommentItem[]);
    }
    setCommentsLoading(false);
  };

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      const { data, error: loadError } = await supabase
        .from('global_announcements')
        .select('id,title,message,type,content_kind,show_in_news,show_in_notifications,is_active,is_pinned,is_trending,mention_all,comments_enabled,allowed_reactions,view_count,media_url,media_type,external_url,cta_label,created_at,published_at,updated_at')
        .eq('is_active', true)
        .order('published_at', { ascending: false });

      if (!active) return;
      if (loadError) {
        setError(loadError.message || 'Unable to load News.');
        setItems([]);
        setLoading(false);
        return;
      }
      const visible = ((data || []) as NewsItem[]).filter((item) => item.content_kind === 'news' || item.show_in_news);
      setItems(visible);
      setLoading(false);
      void refreshEngagement(visible.map((item) => item.id));
    };

    void load();
    return () => {
      active = false;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!targetItemId || loading || !items.some((item) => item.id === targetItemId)) {
      if (!targetItemId) setComments([]);
      return;
    }

    const node = document.getElementById(`news-${targetItemId}`);
    if (node) {
      window.requestAnimationFrame(() => node.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    }

    if (viewedTargetRef.current !== targetItemId) {
      viewedTargetRef.current = targetItemId;
      void (async () => {
        const { data } = await supabase.rpc('record_global_content_view', { p_content_id: targetItemId });
        const nextCount = Number(data || 0);
        if (nextCount > 0) {
          setItems((current) => current.map((item) => item.id === targetItemId ? { ...item, view_count: nextCount } : item));
        }
      })();
    }

    void loadComments(targetItemId);
    void refreshEngagement([targetItemId]);
  }, [items.length, loading, targetItemId]);

  useEffect(() => {
    if (!targetItemId || !focusComments || commentsLoading) return;
    const timer = window.setTimeout(() => {
      commentsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      commentInputRef.current?.focus();
    }, 180);
    return () => window.clearTimeout(timer);
  }, [commentsLoading, focusComments, targetItemId]);

  const filtered = useMemo(() => {
    const categoryFiltered = filter === 'all'
      ? items
      : filter === 'announcement'
        ? items.filter((item) => item.content_kind === 'announcement')
        : items.filter((item) => item.content_kind === 'news' && item.type === filter);

    return [...categoryFiltered].sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
      if (sort === 'oldest') return new Date(a.published_at).getTime() - new Date(b.published_at).getTime();
      if (sort === 'trending') {
        if (a.is_trending !== b.is_trending) return a.is_trending ? -1 : 1;
        if ((b.view_count || 0) !== (a.view_count || 0)) return (b.view_count || 0) - (a.view_count || 0);
      }
      return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
    });
  }, [filter, items, sort]);

  const openPost = (id: string, commentsOpen = false) => {
    setSearchParams(commentsOpen ? { item: id, comments: '1' } : { item: id });
  };

  const closePost = () => {
    setSearchParams({});
    setComments([]);
    setCommentDraft('');
  };

  const react = async (item: NewsItem, reaction: ReactionType) => {
    if (interactionBusyId === item.id) return;
    setInteractionBusyId(item.id);
    setError(null);
    const { data, error: reactionError } = await supabase.rpc('set_global_content_reaction', {
      p_content_id: item.id,
      p_reaction: reaction,
    });
    setInteractionBusyId(null);
    if (reactionError) {
      setError(reactionError.message || 'Unable to react to this post.');
      return;
    }
    const result = (data || {}) as Record<string, unknown>;
    setEngagement((current) => ({
      ...current,
      [item.id]: {
        ...(current[item.id] || emptyEngagement),
        reaction_count: Number(result.reaction_count || 0),
        reaction_breakdown: (result.reaction_breakdown || {}) as Record<string, number>,
        current_reaction: (result.reaction || null) as ReactionType | null,
      },
    }));
  };

  const toggleSave = async (item: NewsItem) => {
    if (interactionBusyId === item.id) return;
    setInteractionBusyId(item.id);
    const { data, error: saveError } = await supabase.rpc('toggle_global_content_save', {
      p_content_id: item.id,
    });
    setInteractionBusyId(null);
    if (saveError) {
      setError(saveError.message || 'Unable to save this post.');
      return;
    }
    const result = (data || {}) as Record<string, unknown>;
    setEngagement((current) => ({
      ...current,
      [item.id]: {
        ...(current[item.id] || emptyEngagement),
        is_saved: Boolean(result.saved),
        save_count: Number(result.save_count || 0),
      },
    }));
  };

  const submitComment = async (item: NewsItem) => {
    const body = commentDraft.trim();
    if (!body || commentBusy || !item.comments_enabled) return;
    setCommentBusy(true);
    setError(null);
    const { data, error: commentError } = await supabase.rpc('add_global_content_comment', {
      p_content_id: item.id,
      p_body: body,
    });
    setCommentBusy(false);
    if (commentError) {
      setError(commentError.message || 'Unable to post comment.');
      return;
    }
    const result = (data || {}) as Record<string, unknown>;
    setCommentDraft('');
    setEngagement((current) => ({
      ...current,
      [item.id]: {
        ...(current[item.id] || emptyEngagement),
        comment_count: Number(result.comment_count || 0),
      },
    }));
    await loadComments(item.id);
  };

  const deleteComment = async (item: NewsItem, commentId: string) => {
    const { data, error: deleteError } = await supabase.rpc('delete_own_global_content_comment', {
      p_comment_id: commentId,
    });
    if (deleteError) {
      setError(deleteError.message || 'Unable to delete comment.');
      return;
    }
    const result = (data || {}) as Record<string, unknown>;
    setEngagement((current) => ({
      ...current,
      [item.id]: {
        ...(current[item.id] || emptyEngagement),
        comment_count: Number(result.comment_count || 0),
      },
    }));
    await loadComments(item.id);
  };

  const sponsoredPlacement = filter === 'promo' ? 'announcement_feed' : 'news';

  return (
    <div className="min-h-[calc(100vh-7rem)] bg-[#0d1017] text-white">
      <SeoHead title="News" description="Latest DRIGHT stories, marketplace news, affiliate and referral updates, promotions, and platform announcements." canonical="/news" />

      {welcomeVisible && (
        <div className="border-b border-white/5 bg-[#141822] px-4 py-3 sm:px-6">
          <div className="mx-auto flex max-w-5xl items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-[#1e2331] text-[#7180ff]">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-[#1e2331] px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-[#7180ff]">NEW</span>
                <p className="truncate text-sm font-semibold text-white">Welcome to DRIGHT News</p>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-neutral-400">News, market stories, affiliate and referral updates, promotions, and announcements from across DRIGHT.</p>
            </div>
            <button type="button" onClick={() => setWelcomeVisible(false)} className="rounded-lg p-1.5 text-neutral-600 transition hover:bg-white/5 hover:text-neutral-300" aria-label="Dismiss welcome message">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <section className="relative overflow-hidden border-b border-white/5 bg-gradient-to-b from-[#141822] via-[#11151e] to-[#0d1017] px-4 py-7 sm:px-6 sm:py-10">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#4353ff]/10 blur-3xl" />
        <div className="pointer-events-none absolute left-1/2 top-0 h-px w-[70%] -translate-x-1/2 bg-gradient-to-r from-transparent via-blue-400/30 to-transparent" />
        <div className="relative mx-auto max-w-5xl">
          <div className="flex items-center gap-5 sm:gap-8">
            <div className="relative shrink-0">
              <div className="absolute inset-0 rounded-[2rem] bg-blue-500/20 blur-2xl" />
              <div className="relative rounded-[1.8rem] border border-white/10 bg-gradient-to-br from-[#2a2f39] via-[#111318] to-black p-1 shadow-2xl sm:rounded-[2.2rem]">
                <DrightMark size={104} className="sm:hidden" title="DRIGHT" />
                <DrightMark size={132} className="hidden sm:block" title="DRIGHT" />
              </div>
            </div>
            <div className="relative min-w-0 flex-1">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-neutral-300 shadow-inner sm:h-12 sm:w-12">
                <Megaphone className="h-6 w-6" />
              </div>
              <div className="absolute right-0 top-0 grid grid-cols-4 gap-2 opacity-20" aria-hidden="true">
                {Array.from({ length: 16 }).map((_, index) => <span key={index} className="h-1 w-1 rounded-full bg-slate-300" />)}
              </div>
              <h1 className="text-4xl font-black tracking-tight text-white sm:text-5xl">News</h1>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-neutral-300 sm:text-base">Latest DRIGHT stories, product news, market updates, affiliate opportunities, referrals, promotions, and announcements.</p>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4 pb-12 sm:px-6">
        <div className="flex flex-col gap-3 border-b border-white/5 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {categories.map((category) => {
              const active = filter === category.value;
              return (
                <button key={category.value} type="button" onClick={() => setFilter(category.value)} className={`shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-all ${active ? 'border-transparent bg-[#4353ff] text-white shadow-[0_8px_24px_rgba(67,83,255,0.28)]' : 'border-neutral-700 bg-[#1e2331] text-neutral-300 hover:border-neutral-500 hover:text-white'}`}>
                  {category.label}
                </button>
              );
            })}
          </div>
          <select value={sort} onChange={(event) => setSort(event.target.value as SortOption)} className="min-h-[42px] rounded-xl border border-neutral-700 bg-[#1e2331] px-3 text-sm font-medium text-neutral-200 outline-none focus:border-[#7180ff]" aria-label="Sort news">
            <option value="newest">Recently posted</option>
            <option value="oldest">Oldest first</option>
            <option value="trending">Trending</option>
          </select>
        </div>

        <SponsoredPlacementCard placement={sponsoredPlacement} variant={filter === 'all' ? 'compact' : 'feed'} className="my-6" heading={filter === 'promo' ? 'Sponsored promotion' : 'Sponsored news'} />

        {error && (
          <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>
        )}

        {loading ? (
          <div className="flex min-h-[280px] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#7180ff]" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-[320px] flex-col items-center justify-center px-6 text-center">
            <div className="flex h-24 w-24 items-center justify-center rounded-full border border-white/5 bg-white/[0.02]"><Bell className="h-14 w-14 text-neutral-800" strokeWidth={1} /></div>
            <p className="mt-6 text-lg font-medium text-neutral-600">No {filter === 'all' ? 'news' : categories.find((category) => category.value === filter)?.label.toLowerCase()} available.</p>
            <p className="mt-2 max-w-sm text-sm text-neutral-700">Published DRIGHT content will appear here.</p>
          </div>
        ) : (
          <div className="space-y-5 py-1">
            {filtered.map((item, index) => {
              const effectiveCategory = itemCategory(item);
              const config = categoryConfig[effectiveCategory];
              const Icon = config.icon;
              const targeted = targetItemId === item.id;
              const itemEngagement = engagement[item.id] || emptyEngagement;
              const allowedReactions = Array.isArray(item.allowed_reactions) ? item.allowed_reactions : [];

              return (
                <motion.article
                  id={`news-${item.id}`}
                  key={item.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(index * 0.04, 0.2) }}
                  onClick={(event) => {
                    const element = event.target as HTMLElement;
                    if (element.closest('button,a,input,textarea,video')) return;
                    if (!targeted) openPost(item.id);
                  }}
                  onKeyDown={(event) => {
                    if (!targeted && (event.key === 'Enter' || event.key === ' ')) {
                      event.preventDefault();
                      openPost(item.id);
                    }
                  }}
                  role={!targeted ? 'button' : undefined}
                  tabIndex={!targeted ? 0 : undefined}
                  className={`rounded-2xl border bg-[#141822] shadow-[0_18px_50px_rgba(0,0,0,0.18)] transition ${!targeted ? 'cursor-pointer hover:border-white/15' : ''} ${targeted ? 'border-[#7180ff] ring-2 ring-[#4353ff]/30' : item.is_pinned ? 'border-blue-400/20' : 'border-white/[0.07]'}`}
                >
                  {item.media_url && (
                    <div className="max-h-[540px] overflow-hidden rounded-t-2xl bg-black">
                      {item.media_type === 'video' ? (
                        <video src={item.media_url} controls playsInline preload="metadata" className="max-h-[540px] w-full object-contain" />
                      ) : (
                        <img src={item.media_url} alt="" loading="lazy" className="max-h-[540px] w-full object-cover" />
                      )}
                    </div>
                  )}

                  <div className="p-4 sm:p-5">
                    <div className="flex items-start gap-3.5">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.07] bg-[#1e2331]">
                        <Icon className={`h-5 w-5 ${config.accent}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${config.badge}`}>{config.label}</span>
                          {item.is_pinned && <span className="inline-flex items-center gap-1 rounded-full border border-blue-400/20 bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-300"><Pin className="h-3 w-3" />Pinned</span>}
                          {item.is_trending && <span className="inline-flex items-center gap-1 rounded-full border border-orange-400/20 bg-orange-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-300"><TrendingUp className="h-3 w-3" />Trending</span>}
                          {item.mention_all && <span className="inline-flex items-center gap-1 rounded-full border border-violet-400/20 bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-300"><AtSign className="h-3 w-3" />All DRIGHT</span>}
                          <span className="text-[11px] text-neutral-600">{new Date(item.published_at).toLocaleDateString()}</span>
                          {targeted && (
                            <button type="button" onClick={(event) => { event.stopPropagation(); closePost(); }} className="ml-auto rounded-lg p-1.5 text-neutral-600 hover:bg-white/5 hover:text-white" aria-label="Close post"><X className="h-4 w-4" /></button>
                          )}
                        </div>

                        <h2 className="mt-2 text-base font-semibold leading-snug text-white sm:text-lg">{item.title}</h2>
                        <p className={`mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-neutral-400 ${targeted ? '' : 'line-clamp-2'}`}>{item.message}</p>
                        {!targeted && item.message.length > 110 && (
                          <button type="button" onClick={(event) => { event.stopPropagation(); openPost(item.id); }} className="mt-1 text-sm font-semibold text-neutral-300 hover:text-white">… more</button>
                        )}

                        {item.external_url && (
                          <div className="mt-4">
                            <a href={item.external_url} target={item.external_url.startsWith('/') ? undefined : '_blank'} rel="noreferrer" onClick={(event) => event.stopPropagation()} className="inline-flex min-h-[38px] items-center gap-2 rounded-xl bg-[#4353ff] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#5261ff]">
                              {item.cta_label || 'Learn more'} <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          </div>
                        )}

                        <div className="mt-4 flex items-center gap-2 text-xs text-neutral-600">
                          <span>{item.view_count || 0} views</span>
                          <span>·</span>
                          <span>{itemEngagement.comment_count} comments</span>
                          <span>·</span>
                          <span>{itemEngagement.save_count} saves</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-white/[0.06] px-2 py-1" onClick={(event) => event.stopPropagation()}>
                    <div className="grid grid-cols-3">
                      <ReactionButton
                        allowed={allowedReactions}
                        currentReaction={itemEngagement.current_reaction}
                        count={itemEngagement.reaction_count}
                        onReact={(reaction) => void react(item, reaction)}
                      />
                      <button type="button" onClick={() => openPost(item.id, true)} className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold text-neutral-300 transition hover:bg-white/[0.05] hover:text-white">
                        <MessageCircle className="h-5 w-5" /> Comment
                        {itemEngagement.comment_count > 0 && <span className="text-xs text-neutral-500">{itemEngagement.comment_count}</span>}
                      </button>
                      <button type="button" disabled={interactionBusyId === item.id} onClick={() => void toggleSave(item)} className={`inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition ${itemEngagement.is_saved ? 'text-[#7180ff] hover:bg-[#4353ff]/10' : 'text-neutral-300 hover:bg-white/[0.05] hover:text-white'}`}>
                        <Bookmark className={`h-5 w-5 ${itemEngagement.is_saved ? 'fill-current' : ''}`} /> Save
                      </button>
                    </div>
                  </div>

                  {targeted && (
                    <div ref={commentsSectionRef} className="border-t border-white/[0.06] bg-[#11151e] p-4 sm:p-5" onClick={(event) => event.stopPropagation()}>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="font-bold text-white">Comments</h3>
                          <p className="mt-0.5 text-xs text-neutral-500">{itemEngagement.comment_count} visible comment{itemEngagement.comment_count === 1 ? '' : 's'}</p>
                        </div>
                        {Object.keys(itemEngagement.reaction_breakdown).length > 0 && (
                          <div className="flex items-center gap-1 text-sm text-neutral-400">
                            {Object.entries(itemEngagement.reaction_breakdown)
                              .filter(([reaction]) => reaction in reactionMeta)
                              .slice(0, 4)
                              .map(([reaction, count]) => <span key={reaction} title={`${reactionMeta[reaction as ReactionType].label}: ${count}`}>{reactionMeta[reaction as ReactionType].emoji}</span>)}
                            <span className="ml-1 text-xs">{itemEngagement.reaction_count}</span>
                          </div>
                        )}
                      </div>

                      {item.comments_enabled ? (
                        <div className="mt-4 flex items-center gap-2">
                          <input
                            ref={commentInputRef}
                            value={commentDraft}
                            onChange={(event) => setCommentDraft(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' && !event.shiftKey) {
                                event.preventDefault();
                                void submitComment(item);
                              }
                            }}
                            maxLength={2000}
                            placeholder="Write a comment…"
                            className="min-h-[44px] flex-1 rounded-full border border-white/10 bg-[#1b202b] px-4 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-[#7180ff]"
                          />
                          <button type="button" disabled={commentBusy || !commentDraft.trim()} onClick={() => void submitComment(item)} className="flex h-11 w-11 items-center justify-center rounded-full bg-[#4353ff] text-white transition hover:bg-[#5261ff] disabled:opacity-40" aria-label="Post comment">
                            {commentBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                          </button>
                        </div>
                      ) : (
                        <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-sm text-neutral-500">Comments are turned off for this post.</div>
                      )}

                      <div className="mt-4 space-y-3">
                        {commentsLoading ? (
                          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-[#7180ff]" /></div>
                        ) : comments.length === 0 ? (
                          <p className="py-6 text-center text-sm text-neutral-600">No comments yet.</p>
                        ) : comments.map((comment) => (
                          <div key={comment.id} className="flex items-start gap-3">
                            {comment.author_avatar ? (
                              <img src={comment.author_avatar} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                            ) : (
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#252b38] text-xs font-bold text-neutral-300">{comment.author_name?.slice(0, 1).toUpperCase() || 'D'}</div>
                            )}
                            <div className="min-w-0 flex-1 rounded-2xl bg-[#1b202b] px-3.5 py-2.5">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="text-xs font-bold text-neutral-200">{comment.author_name}</p>
                                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-neutral-300">{comment.body}</p>
                                </div>
                                {comment.can_delete && (
                                  <button type="button" onClick={() => void deleteComment(item, comment.id)} className="rounded-lg p-1.5 text-neutral-600 hover:bg-white/5 hover:text-red-300" aria-label="Delete comment"><Trash2 className="h-3.5 w-3.5" /></button>
                                )}
                              </div>
                              <p className="mt-1.5 text-[10px] text-neutral-600">{new Date(comment.created_at).toLocaleString()}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
