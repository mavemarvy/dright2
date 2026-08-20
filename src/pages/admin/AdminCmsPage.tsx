import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Copy, Trash2, Eye, EyeOff, Archive, FileText, Search,
  Loader2, Globe, Clock, CheckCircle, AlertCircle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  CMS_PAGE_TYPES, CMS_STATUSES, type CmsPage,
} from '../../lib/cmsTypes';
import { createPage, duplicatePage, deletePage, publishPage } from '../../lib/cmsHooks';

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  published: 'bg-green-100 text-green-700',
  scheduled: 'bg-blue-100 text-blue-700',
  hidden: 'bg-amber-100 text-amber-700',
  archived: 'bg-red-100 text-red-700',
};

export default function AdminCmsPage() {
  const [pages, setPages] = useState<CmsPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [newSlug, setNewSlug] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState('standard');
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadPages = async () => {
    setLoading(true);
    const { data } = await supabase.from('cms_pages').select('*').eq('is_deleted', false).order('updated_at', { ascending: false });
    setPages((data || []) as CmsPage[]);
    setLoading(false);
  };

  useEffect(() => { loadPages(); }, []);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const handleCreate = async () => {
    if (!newSlug.trim() || !newTitle.trim()) { showToast('error', 'Slug and title are required'); return; }
    setCreating(true);
    try {
      await createPage(newSlug.trim().toLowerCase().replace(/\s+/g, '-'), newTitle.trim(), newType);
      setShowCreate(false); setNewSlug(''); setNewTitle(''); setNewType('standard');
      await loadPages();
      showToast('success', 'Page created successfully');
    } catch { showToast('error', 'Failed to create page'); }
    finally { setCreating(false); }
  };

  const handleDuplicate = async (pageId: string) => {
    try { await duplicatePage(pageId); await loadPages(); showToast('success', 'Page duplicated'); }
    catch { showToast('error', 'Failed to duplicate page'); }
  };

  const handleDelete = async (pageId: string) => {
    if (!confirm('Are you sure you want to delete this page?')) return;
    try { await deletePage(pageId); await loadPages(); showToast('success', 'Page deleted'); }
    catch { showToast('error', 'Failed to delete page'); }
  };

  const handlePublish = async (pageId: string) => {
    try { await publishPage(pageId); await loadPages(); showToast('success', 'Page published'); }
    catch { showToast('error', 'Failed to publish page'); }
  };

  const handleArchive = async (pageId: string) => {
    try {
      await supabase.from('cms_pages').update({ status: 'archived' }).eq('id', pageId);
      await loadPages(); showToast('success', 'Page archived');
    } catch { showToast('error', 'Failed to archive page'); }
  };

  const handleHide = async (pageId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'hidden' ? 'draft' : 'hidden';
    try {
      await supabase.from('cms_pages').update({ status: newStatus }).eq('id', pageId);
      await loadPages();
    } catch { showToast('error', 'Failed to update visibility'); }
  };

  const filtered = pages.filter(p => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (search && !p.title.toLowerCase().includes(search.toLowerCase()) && !p.slug.includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Content Management</h1>
          <p className="text-gray-500 mt-1">Create and manage website pages without code</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors">
          <Plus className="w-5 h-5" /> New Page
        </button>
      </div>

      {toast && (
        <div className={`mb-4 rounded-xl p-3 flex items-center gap-2 text-sm ${toast.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.message}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search pages..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:border-blue-500"
          />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none">
          <option value="all">All Statuses</option>
          {CMS_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      {/* Pages List */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-blue-500 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No pages found. Create your first CMS page.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(page => {
            const pageType = CMS_PAGE_TYPES.find(t => t.value === page.page_type);
            return (
              <motion.div
                key={page.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-gray-900 dark:text-white truncate">{page.title}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[page.status] || 'bg-gray-100'}`}>
                        {page.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                      <span className="flex items-center gap-1"><Globe className="w-3 h-3" />/{page.slug}</span>
                      <span>{pageType?.label || page.page_type}</span>
                      {page.publish_at && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(page.publish_at).toLocaleDateString()}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Link to={`/admin/cms/${page.id}`} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Edit">
                      <FileText className="w-5 h-5" />
                    </Link>
                    {page.status !== 'published' && (
                      <button onClick={() => handlePublish(page.id)} className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg" title="Publish">
                        <CheckCircle className="w-5 h-5" />
                      </button>
                    )}
                    <button onClick={() => handleHide(page.id, page.status)} className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg" title={page.status === 'hidden' ? 'Unhide' : 'Hide'}>
                      {page.status === 'hidden' ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                    </button>
                    <button onClick={() => handleDuplicate(page.id)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Duplicate">
                      <Copy className="w-5 h-5" />
                    </button>
                    <button onClick={() => handleArchive(page.id)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg" title="Archive">
                      <Archive className="w-5 h-5" />
                    </button>
                    <button onClick={() => handleDelete(page.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Delete">
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setShowCreate(false)}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              onClick={e => e.stopPropagation()}
              className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-md space-y-4"
            >
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Create New Page</h2>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Page Title</label>
                <input type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="e.g. Help Center" className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">URL Slug</label>
                <input type="text" value={newSlug} onChange={e => setNewSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))} placeholder="help-center" className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Page Type</label>
                <select value={newType} onChange={e => setNewType(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none">
                  {CMS_PAGE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={handleCreate} disabled={creating} className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
                  {creating ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Plus className="w-5 h-5" /> Create Page</>}
                </button>
                <button onClick={() => setShowCreate(false)} className="px-6 py-3 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl font-medium">Cancel</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
