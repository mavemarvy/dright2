import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertCircle,
  AtSign,
  CheckCircle,
  Edit2,
  ExternalLink,
  Eye,
  Image as ImageIcon,
  Loader2,
  Megaphone,
  Newspaper,
  Pin,
  Plus,
  Power,
  Send,
  Trash2,
  TrendingUp,
  Video,
  X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

type ContentKind = 'news' | 'announcement';
type ContentCategory = 'news' | 'update' | 'market' | 'affiliate' | 'announcement' | 'promo' | 'referral';
type SortOption = 'newest' | 'oldest' | 'trending';
type MediaType = 'image' | 'video';

interface GlobalContentItem {
  id: string;
  title: string;
  message: string;
  type: ContentCategory;
  content_kind: ContentKind;
  show_in_news: boolean;
  is_active: boolean;
  is_pinned: boolean;
  is_trending: boolean;
  mention_all: boolean;
  view_count: number;
  media_url: string | null;
  media_type: MediaType | null;
  external_url: string | null;
  cta_label: string | null;
  created_by: string | null;
  created_at: string;
  published_at: string;
  updated_at: string;
}

interface ContentForm {
  title: string;
  message: string;
  category: ContentCategory;
  showInNews: boolean;
  isActive: boolean;
  isPinned: boolean;
  isTrending: boolean;
  mentionAll: boolean;
  mediaUrl: string;
  mediaType: MediaType;
  externalUrl: string;
  ctaLabel: string;
}

const CATEGORY_LABELS: Record<ContentCategory, string> = {
  news: 'News',
  update: 'Update',
  market: 'Market',
  affiliate: 'Affiliate',
  announcement: 'Announcement',
  promo: 'Promo',
  referral: 'Referral',
};

const NEWS_CATEGORIES: ContentCategory[] = ['news', 'update', 'market', 'affiliate', 'promo', 'referral'];
const ANNOUNCEMENT_CATEGORIES: ContentCategory[] = ['announcement', 'update', 'market', 'affiliate', 'promo', 'referral'];

const emptyForm = (kind: ContentKind): ContentForm => ({
  title: '',
  message: '',
  category: kind === 'news' ? 'news' : 'announcement',
  showInNews: kind === 'news',
  isActive: true,
  isPinned: false,
  isTrending: false,
  mentionAll: false,
  mediaUrl: '',
  mediaType: 'image',
  externalUrl: '',
  ctaLabel: '',
});

function contentParams(item: GlobalContentItem, overrides: Partial<GlobalContentItem> = {}) {
  const next = { ...item, ...overrides };
  return {
    p_id: next.id,
    p_content_kind: next.content_kind,
    p_title: next.title,
    p_message: next.message,
    p_category: next.type,
    p_show_in_news: next.content_kind === 'news' ? true : next.show_in_news,
    p_is_active: next.is_active,
    p_is_pinned: next.is_pinned,
    p_is_trending: next.is_trending,
    p_mention_all: next.mention_all,
    p_media_url: next.media_url,
    p_media_type: next.media_url ? next.media_type : null,
    p_external_url: next.external_url,
    p_cta_label: next.cta_label,
  };
}

export default function AdminAnnouncementsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const contentKind: ContentKind = searchParams.get('mode') === 'news' ? 'news' : 'announcement';
  const isNewsMode = contentKind === 'news';
  const [items, setItems] = useState<GlobalContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<GlobalContentItem | null>(null);
  const [form, setForm] = useState<ContentForm>(() => emptyForm(contentKind));
  const [sort, setSort] = useState<SortOption>('newest');
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchContent = useCallback(async () => {
    setLoading(true);
    const { data, error: loadError } = await supabase
      .from('global_announcements')
      .select('id,title,message,type,content_kind,show_in_news,is_active,is_pinned,is_trending,mention_all,view_count,media_url,media_type,external_url,cta_label,created_by,created_at,published_at,updated_at')
      .eq('content_kind', contentKind)
      .order('published_at', { ascending: false });

    if (loadError) {
      setError(loadError.message || 'Unable to load content.');
      setItems([]);
    } else {
      setItems((data || []) as GlobalContentItem[]);
    }
    setLoading(false);
  }, [contentKind]);

  useEffect(() => {
    setEditing(null);
    setShowForm(false);
    setForm(emptyForm(contentKind));
    setError(null);
    void fetchContent();
  }, [contentKind, fetchContent]);

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
      if (sort === 'oldest') return new Date(a.published_at).getTime() - new Date(b.published_at).getTime();
      if (sort === 'trending') {
        if (a.is_trending !== b.is_trending) return a.is_trending ? -1 : 1;
        if ((b.view_count || 0) !== (a.view_count || 0)) return (b.view_count || 0) - (a.view_count || 0);
      }
      return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
    });
  }, [items, sort]);

  const switchMode = (mode: ContentKind) => {
    setSearchParams(mode === 'news' ? { mode: 'news' } : {});
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm(contentKind));
    setError(null);
    setShowForm(true);
  };

  const openEdit = (item: GlobalContentItem) => {
    setEditing(item);
    setForm({
      title: item.title,
      message: item.message,
      category: item.type,
      showInNews: item.content_kind === 'news' ? true : item.show_in_news,
      isActive: item.is_active,
      isPinned: item.is_pinned,
      isTrending: item.is_trending,
      mentionAll: item.mention_all,
      mediaUrl: item.media_url || '',
      mediaType: item.media_type || 'image',
      externalUrl: item.external_url || '',
      ctaLabel: item.cta_label || '',
    });
    setError(null);
    setShowForm(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.title.trim() || !form.message.trim()) {
      setError('Title and post text are required.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const payload = {
      p_content_kind: contentKind,
      p_title: form.title.trim(),
      p_message: form.message.trim(),
      p_category: form.category,
      p_show_in_news: isNewsMode ? true : form.showInNews,
      p_is_active: form.isActive,
      p_is_pinned: form.isPinned,
      p_is_trending: form.isTrending,
      p_mention_all: form.mentionAll,
      p_media_url: form.mediaUrl.trim() || null,
      p_media_type: form.mediaUrl.trim() ? form.mediaType : null,
      p_external_url: form.externalUrl.trim() || null,
      p_cta_label: form.ctaLabel.trim() || null,
    };

    const result = editing
      ? await supabase.rpc('admin_update_global_content', { p_id: editing.id, ...payload })
      : await supabase.rpc('admin_create_global_content', payload);

    if (result.error) {
      setError(result.error.message || `Failed to ${editing ? 'update' : 'publish'} ${isNewsMode ? 'news' : 'announcement'}.`);
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    setShowForm(false);
    setEditing(null);
    setForm(emptyForm(contentKind));
    setSuccess(`${isNewsMode ? 'News post' : 'Announcement'} ${editing ? 'updated' : 'published'} successfully.`);
    window.setTimeout(() => setSuccess(null), 3500);
    await fetchContent();
  };

  const updateItem = async (item: GlobalContentItem, overrides: Partial<GlobalContentItem>) => {
    setBusyId(item.id);
    setError(null);
    const { error: updateError } = await supabase.rpc('admin_update_global_content', contentParams(item, overrides));
    setBusyId(null);
    if (updateError) {
      setError(updateError.message || 'Unable to update this post.');
      return;
    }
    await fetchContent();
  };

  const deleteItem = async (item: GlobalContentItem) => {
    if (!window.confirm(`Delete “${item.title}”? This also removes its global notification links.`)) return;
    setBusyId(item.id);
    const { error: deleteError } = await supabase.rpc('admin_delete_global_content', { p_id: item.id });
    setBusyId(null);
    if (deleteError) {
      setError(deleteError.message || 'Unable to delete this post.');
      return;
    }
    setSuccess(`${isNewsMode ? 'News post' : 'Announcement'} deleted.`);
    window.setTimeout(() => setSuccess(null), 3000);
    await fetchContent();
  };

  const publicUrl = (item: GlobalContentItem) =>
    item.content_kind === 'news' || item.show_in_news
      ? `/news?item=${item.id}`
      : `/announcements?item=${item.id}`;

  const availableCategories = isNewsMode ? NEWS_CATEGORIES : ANNOUNCEMENT_CATEGORIES;

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-3 inline-flex rounded-2xl border border-gray-200 bg-white p-1 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <button
              type="button"
              onClick={() => switchMode('announcement')}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${!isNewsMode ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'}`}
            >
              <Megaphone className="h-4 w-4" />
              Announcements
            </button>
            <button
              type="button"
              onClick={() => switchMode('news')}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${isNewsMode ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'}`}
            >
              <Newspaper className="h-4 w-4" />
              News Posting
            </button>
          </div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
            {isNewsMode ? <Newspaper className="h-6 w-6 text-primary-600" /> : <Megaphone className="h-6 w-6 text-warning" />}
            {isNewsMode ? 'DRIGHT News Publishing' : 'Global Announcements'}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
            {isNewsMode
              ? 'Publish editable DRIGHT news, pin important stories, mark trending posts, attach media or links, and mention all users when a global notification is required.'
              : 'Publish platform announcements. Announcements can optionally appear in the News feed and can notify every DRIGHT user with a direct link.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortOption)}
            className="min-h-[44px] rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 outline-none focus:border-primary-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
            aria-label="Sort posts"
          >
            <option value="newest">Recently posted</option>
            <option value="oldest">Oldest first</option>
            <option value="trending">Trending</option>
          </select>
          <button
            type="button"
            onClick={openCreate}
            className="flex min-h-[44px] items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 font-semibold text-white transition hover:bg-primary-700"
          >
            <Plus className="h-5 w-5" />
            New {isNewsMode ? 'News Post' : 'Announcement'}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {success && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mb-4 flex items-center gap-2 rounded-xl bg-success-muted p-3 text-success">
            <CheckCircle className="h-5 w-5" />
            {success}
          </motion.div>
        )}
      </AnimatePresence>

      {error && !showForm && (
        <div className="mb-4 flex items-start gap-2 rounded-xl bg-error-muted p-3 text-sm text-error">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex min-h-[320px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
        </div>
      ) : sortedItems.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-12 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
          {isNewsMode ? <Newspaper className="mx-auto mb-4 h-16 w-16 text-gray-300" /> : <Megaphone className="mx-auto mb-4 h-16 w-16 text-gray-300" />}
          <p className="text-lg font-semibold text-gray-900 dark:text-white">No {isNewsMode ? 'news posts' : 'announcements'} yet</p>
          <p className="mt-1 text-sm text-gray-500">Create the first post from the button above.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedItems.map((item, index) => (
            <motion.article
              key={item.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(index * 0.035, 0.2) }}
              className={`overflow-hidden rounded-2xl border bg-white shadow-sm dark:bg-gray-800 ${item.is_pinned ? 'border-primary-300 dark:border-primary-700' : 'border-gray-100 dark:border-gray-700'} ${!item.is_active ? 'opacity-60' : ''}`}
            >
              {item.media_url && (
                <div className="max-h-[360px] overflow-hidden bg-gray-950">
                  {item.media_type === 'video' ? (
                    <video src={item.media_url} controls preload="metadata" className="max-h-[360px] w-full object-contain" />
                  ) : (
                    <img src={item.media_url} alt="" className="max-h-[360px] w-full object-cover" />
                  )}
                </div>
              )}

              <div className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                        {CATEGORY_LABELS[item.type]}
                      </span>
                      {item.is_pinned && <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"><Pin className="h-3 w-3" />Pinned</span>}
                      {item.is_trending && <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-1 text-[11px] font-semibold text-orange-700 dark:bg-orange-900/30 dark:text-orange-300"><TrendingUp className="h-3 w-3" />Trending</span>}
                      {item.mention_all && <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-1 text-[11px] font-semibold text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"><AtSign className="h-3 w-3" />All DRIGHT</span>}
                      {!item.is_active && <span className="rounded-full bg-gray-100 px-2 py-1 text-[11px] font-semibold text-gray-500 dark:bg-gray-700">Inactive</span>}
                      {!isNewsMode && item.show_in_news && <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">Also in News</span>}
                    </div>
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">{item.title}</h2>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-gray-600 dark:text-gray-300">{item.message}</p>

                    <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-gray-400">
                      <span>{new Date(item.published_at).toLocaleString()}</span>
                      <span className="inline-flex items-center gap-1"><Eye className="h-3.5 w-3.5" />{item.view_count || 0} unique views</span>
                      {item.external_url && (
                        <a href={item.external_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary-600 hover:underline">
                          {item.cta_label || 'Open link'} <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                      <a href={publicUrl(item)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary-600 hover:underline">
                        View public post <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                    <button type="button" disabled={busyId === item.id} onClick={() => void updateItem(item, { is_pinned: !item.is_pinned })} className={`rounded-lg p-2 transition ${item.is_pinned ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30' : 'text-gray-400 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/20'}`} title={item.is_pinned ? 'Unpin' : 'Pin'}><Pin className="h-4 w-4" /></button>
                    <button type="button" disabled={busyId === item.id} onClick={() => void updateItem(item, { is_trending: !item.is_trending })} className={`rounded-lg p-2 transition ${item.is_trending ? 'bg-orange-50 text-orange-600 dark:bg-orange-900/30' : 'text-gray-400 hover:bg-orange-50 hover:text-orange-600 dark:hover:bg-orange-900/20'}`} title={item.is_trending ? 'Remove trending' : 'Mark trending'}><TrendingUp className="h-4 w-4" /></button>
                    <button type="button" onClick={() => openEdit(item)} className="rounded-lg p-2 text-gray-400 transition hover:bg-primary-50 hover:text-primary-600 dark:hover:bg-primary-900/20" title="Edit"><Edit2 className="h-4 w-4" /></button>
                    <button type="button" disabled={busyId === item.id} onClick={() => void updateItem(item, { is_active: !item.is_active })} className="rounded-lg p-2 text-gray-400 transition hover:bg-warning-muted hover:text-warning" title={item.is_active ? 'Deactivate' : 'Activate'}><Power className="h-4 w-4" /></button>
                    <button type="button" disabled={busyId === item.id} onClick={() => void deleteItem(item)} className="rounded-lg p-2 text-gray-400 transition hover:bg-error-muted hover:text-error" title="Delete"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              </div>
            </motion.article>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.97, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.97, opacity: 0, y: 12 }} onClick={(event) => event.stopPropagation()} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl dark:bg-gray-800 sm:p-6">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">{editing ? 'Edit' : 'Create'} {isNewsMode ? 'News Post' : 'Announcement'}</h3>
                  <p className="mt-1 text-xs text-gray-500">Only DRIGHT admins with News/Announcement publishing access can save changes.</p>
                </div>
                <button type="button" onClick={() => setShowForm(false)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700"><X className="h-5 w-5" /></button>
              </div>

              {error && (
                <div className="mb-4 flex items-start gap-2 rounded-xl bg-error-muted p-3 text-sm text-error">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-200">Category</label>
                  <div className="flex flex-wrap gap-2">
                    {availableCategories.map((category) => (
                      <button key={category} type="button" onClick={() => setForm((current) => ({ ...current, category }))} className={`rounded-full border px-3 py-2 text-sm font-medium transition ${form.category === category ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-primary-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
                        {CATEGORY_LABELS[category]}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-200">Title</label>
                  <input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder={isNewsMode ? 'News headline' : 'Announcement title'} required maxLength={180} className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-900 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-gray-600 dark:bg-gray-900 dark:text-white" />
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200">Post text</label>
                    <span className="text-xs text-gray-400">Use @all, @everyone, or @dright to mention everyone automatically.</span>
                  </div>
                  <textarea value={form.message} onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))} placeholder="Write the post..." rows={7} required className="w-full resize-y rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-900 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-gray-600 dark:bg-gray-900 dark:text-white" />
                </div>

                <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-200">Media type</label>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-1">
                      <button type="button" onClick={() => setForm((current) => ({ ...current, mediaType: 'image' }))} className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm ${form.mediaType === 'image' ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300' : 'border-gray-200 text-gray-500 dark:border-gray-600 dark:text-gray-300'}`}><ImageIcon className="h-4 w-4" />Image</button>
                      <button type="button" onClick={() => setForm((current) => ({ ...current, mediaType: 'video' }))} className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm ${form.mediaType === 'video' ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300' : 'border-gray-200 text-gray-500 dark:border-gray-600 dark:text-gray-300'}`}><Video className="h-4 w-4" />Video</button>
                    </div>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-200">Media URL <span className="font-normal text-gray-400">(optional)</span></label>
                    <input type="url" value={form.mediaUrl} onChange={(event) => setForm((current) => ({ ...current, mediaUrl: event.target.value }))} placeholder="https://... image or video" className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-900 outline-none focus:border-primary-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white" />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-200">Destination link <span className="font-normal text-gray-400">(optional)</span></label>
                    <input type="url" value={form.externalUrl} onChange={(event) => setForm((current) => ({ ...current, externalUrl: event.target.value }))} placeholder="https://..." className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-900 outline-none focus:border-primary-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white" />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-200">Link button label</label>
                    <input value={form.ctaLabel} onChange={(event) => setForm((current) => ({ ...current, ctaLabel: event.target.value }))} placeholder="Learn more / Shop now / View offer" maxLength={40} className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-900 outline-none focus:border-primary-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white" />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {!isNewsMode && (
                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 p-3 dark:border-gray-600">
                      <input type="checkbox" checked={form.showInNews} onChange={(event) => setForm((current) => ({ ...current, showInNews: event.target.checked }))} className="mt-1 h-4 w-4" />
                      <span><span className="block text-sm font-semibold text-gray-800 dark:text-gray-100">Show in News</span><span className="text-xs text-gray-500">Makes this announcement appear under the News “Announcements” category.</span></span>
                    </label>
                  )}
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 p-3 dark:border-gray-600">
                    <input type="checkbox" checked={form.mentionAll} onChange={(event) => setForm((current) => ({ ...current, mentionAll: event.target.checked }))} className="mt-1 h-4 w-4" />
                    <span><span className="block text-sm font-semibold text-gray-800 dark:text-gray-100">Mention @all DRIGHT users</span><span className="text-xs text-gray-500">Creates an in-app notification for every active DRIGHT user with a direct link to this post.</span></span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 p-3 dark:border-gray-600">
                    <input type="checkbox" checked={form.isPinned} onChange={(event) => setForm((current) => ({ ...current, isPinned: event.target.checked }))} className="mt-1 h-4 w-4" />
                    <span><span className="block text-sm font-semibold text-gray-800 dark:text-gray-100">Pin post</span><span className="text-xs text-gray-500">Pinned content stays above normal sorting.</span></span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 p-3 dark:border-gray-600">
                    <input type="checkbox" checked={form.isTrending} onChange={(event) => setForm((current) => ({ ...current, isTrending: event.target.checked }))} className="mt-1 h-4 w-4" />
                    <span><span className="block text-sm font-semibold text-gray-800 dark:text-gray-100">Mark trending</span><span className="text-xs text-gray-500">Trending content is prioritized by the Trending sort and automatically notifies active DRIGHT users.</span></span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 p-3 dark:border-gray-600">
                    <input type="checkbox" checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} className="mt-1 h-4 w-4" />
                    <span><span className="block text-sm font-semibold text-gray-800 dark:text-gray-100">Published / active</span><span className="text-xs text-gray-500">Turn off to hide the post without deleting it.</span></span>
                  </label>
                </div>

                <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row">
                  <button type="button" onClick={() => setShowForm(false)} className="min-h-[48px] flex-1 rounded-xl border border-gray-200 px-4 py-3 font-medium text-gray-600 transition hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">Cancel</button>
                  <button type="submit" disabled={submitting} className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-3 font-semibold text-white transition hover:bg-primary-700 disabled:opacity-50">
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    {editing ? 'Save changes' : `Publish ${isNewsMode ? 'news' : 'announcement'}`}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
