import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import {
  ArrowLeft, Plus, Copy, Trash2, Eye, EyeOff, GripVertical,
  Loader2, Save, CheckCircle, AlertCircle,
  Layout, Image, Type, Video, LayoutGrid, HelpCircle, Clock, Minus,
  X, Settings, History, ExternalLink,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  CMS_BLOCK_TYPES, CMS_STATUSES, type CmsBlock, type CmsBlockType, type CmsPage,
} from '../../lib/cmsTypes';
import {
  createBlock, updateBlock, deleteBlock, duplicateBlock, reorderBlocks,
  updatePage, publishPage, savePageVersion,
} from '../../lib/cmsHooks';
import { usePageVersions } from '../../lib/cmsHooks';
import { BlockRenderer } from '../../components/cms/BlockRenderer';
import BlockEditor from '../../components/cms/BlockEditor';

const BLOCK_ICONS: Record<string, typeof Layout> = {
  hero: Layout, banner: Image, text: Type, image: Image, video: Video,
  card: LayoutGrid, faq: HelpCircle, countdown: Clock, divider: Minus,
};

export default function AdminCmsPageBuilder() {
  const { pageId } = useParams<{ pageId: string }>();

  const [page, setPage] = useState<CmsPage | null>(null);
  const [blocks, setBlocks] = useState<CmsBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingBlock, setEditingBlock] = useState<CmsBlock | null>(null);
  const [showAddBlock, setShowAddBlock] = useState(false);
  const [showSeo, setShowSeo] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const { versions, refetch: refetchVersions } = usePageVersions(pageId || null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const loadData = useCallback(async () => {
    if (!pageId) return;
    setLoading(true);
    const { data: pageData } = await supabase.from('cms_pages').select('*').eq('id', pageId).maybeSingle();
    setPage(pageData as CmsPage | null);

    const { data: blockData } = await supabase
      .from('cms_blocks')
      .select('*')
      .eq('page_id', pageId)
      .eq('is_deleted', false)
      .order('sort_order', { ascending: true });
    setBlocks((blockData || []) as CmsBlock[]);
    setLoading(false);
  }, [pageId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAddBlock = async (blockType: CmsBlockType) => {
    if (!pageId) return;
    try {
      const newBlock = await createBlock(pageId, blockType, blocks.length);
      setBlocks(prev => [...prev, newBlock]);
      setShowAddBlock(false);
      setEditingBlock(newBlock);
    } catch { showToast('error', 'Failed to add block'); }
  };

  const handleSaveBlock = async (blockId: string, updates: Partial<CmsBlock>) => {
    try {
      const updated = await updateBlock(blockId, updates);
      setBlocks(prev => prev.map(b => b.id === blockId ? updated : b));
      setEditingBlock(null);
      showToast('success', 'Block saved');
    } catch { showToast('error', 'Failed to save block'); }
  };

  const handleDeleteBlock = async (blockId: string) => {
    if (!confirm('Delete this block?')) return;
    try {
      await deleteBlock(blockId);
      setBlocks(prev => prev.filter(b => b.id !== blockId));
      showToast('success', 'Block deleted');
    } catch { showToast('error', 'Failed to delete block'); }
  };

  const handleDuplicateBlock = async (blockId: string) => {
    try {
      const newBlock = await duplicateBlock(blockId);
      setBlocks(prev => {
        const idx = prev.findIndex(b => b.id === blockId);
        const newBlocks = [...prev];
        newBlocks.splice(idx + 1, 0, newBlock);
        return newBlocks;
      });
      showToast('success', 'Block duplicated');
    } catch { showToast('error', 'Failed to duplicate block'); }
  };

  const handleToggleHidden = async (blockId: string, isHidden: boolean) => {
    try {
      await updateBlock(blockId, { is_hidden: !isHidden });
      setBlocks(prev => prev.map(b => b.id === blockId ? { ...b, is_hidden: !isHidden } : b));
    } catch { showToast('error', 'Failed to toggle visibility'); }
  };

  const handleReorder = async (newOrder: CmsBlock[]) => {
    setBlocks(newOrder);
    await reorderBlocks(pageId!, newOrder.map(b => b.id));
  };

  const handlePublish = async () => {
    if (!pageId) return;
    setSaving(true);
    try {
      await savePageVersion(pageId, 'Published page');
      await publishPage(pageId);
      await loadData();
      refetchVersions();
      showToast('success', 'Page published successfully');
    } catch { showToast('error', 'Failed to publish page'); }
    finally { setSaving(false); }
  };

  const handleSaveVersion = async () => {
    if (!pageId) return;
    setSaving(true);
    try {
      await savePageVersion(pageId, 'Saved draft version');
      refetchVersions();
      showToast('success', 'Version saved');
    } catch { showToast('error', 'Failed to save version'); }
    finally { setSaving(false); }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-blue-500 animate-spin" /></div>;
  }

  if (!page) {
    return <div className="p-8 text-center text-gray-400">Page not found</div>;
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link to="/admin/cms" className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"><ArrowLeft className="w-5 h-5" /></Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{page.title}</h1>
          <p className="text-sm text-gray-400">/{page.slug}</p>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
          page.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
        }`}>{page.status}</span>
      </div>

      {toast && (
        <div className={`mb-4 rounded-xl p-3 flex items-center gap-2 text-sm ${toast.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.message}
        </div>
      )}

      {/* Action Bar */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button onClick={() => setShowAddBlock(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium">
          <Plus className="w-4 h-4" /> Add Block
        </button>
        <button onClick={() => setShowSeo(!showSeo)} className="flex items-center gap-2 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800">
          <Settings className="w-4 h-4" /> SEO & Settings
        </button>
        <button onClick={() => setShowVersions(!showVersions)} className="flex items-center gap-2 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800">
          <History className="w-4 h-4" /> Versions ({versions.length})
        </button>
        <a href={`/${page.slug}`} target="_blank" className="flex items-center gap-2 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800">
          <ExternalLink className="w-4 h-4" /> Preview
        </a>
        <div className="flex-1" />
        <button onClick={handleSaveVersion} disabled={saving} className="flex items-center gap-2 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Draft
        </button>
        <button onClick={handlePublish} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-medium">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Publish
        </button>
      </div>

      {/* SEO & Settings Panel */}
      <AnimatePresence>
        {showSeo && (
          <SeoSettingsPanel page={page} onSave={async (updates) => { await updatePage(page.id, updates); await loadData(); setShowSeo(false); showToast('success', 'Settings saved'); }} onClose={() => setShowSeo(false)} />
        )}
      </AnimatePresence>

      {/* Version History Panel */}
      <AnimatePresence>
        {showVersions && (
          <VersionHistoryPanel versions={versions} onRestore={async (versionId) => {
            try {
              const { restoreVersion } = await import('../../lib/cmsHooks');
              await restoreVersion(versionId);
              await loadData();
              refetchVersions();
              showToast('success', 'Version restored');
            } catch { showToast('error', 'Failed to restore version'); }
          }} onClose={() => setShowVersions(false)} />
        )}
      </AnimatePresence>

      {/* Blocks */}
      {blocks.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700">
          <Layout className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400 mb-4">No content blocks yet</p>
          <button onClick={() => setShowAddBlock(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium">
            <Plus className="w-4 h-4" /> Add Your First Block
          </button>
        </div>
      ) : (
        <Reorder.Group axis="y" values={blocks} onReorder={handleReorder} className="space-y-3">
          {blocks.map(block => {
            const Icon = BLOCK_ICONS[block.block_type] || Layout;
            return (
              <Reorder.Item key={block.id} value={block} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div className="flex items-center gap-2 p-3 border-b border-gray-50 dark:border-gray-700/50">
                  <GripVertical className="w-5 h-5 text-gray-300 cursor-grab" />
                  <div className="flex items-center gap-2 flex-1">
                    <Icon className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {CMS_BLOCK_TYPES.find(t => t.value === block.block_type)?.label || block.block_type}
                    </span>
                    {block.title && <span className="text-xs text-gray-400">— {block.title}</span>}
                    {block.is_hidden && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Hidden</span>}
                    <span className={`text-xs px-2 py-0.5 rounded-full ${block.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{block.status}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setEditingBlock(block)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg text-xs">Edit</button>
                    <button onClick={() => handleToggleHidden(block.id, block.is_hidden)} className="p-1.5 text-gray-400 hover:text-amber-600 rounded-lg" title={block.is_hidden ? 'Show' : 'Hide'}>
                      {block.is_hidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>
                    <button onClick={() => handleDuplicateBlock(block.id)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg" title="Duplicate">
                      <Copy className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDeleteBlock(block.id)} className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg" title="Delete">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {/* Preview */}
                <div className="p-4 bg-gray-50/50 dark:bg-gray-900/30 max-h-64 overflow-y-auto">
                  <BlockRenderer block={{ ...block, status: 'published', is_hidden: false }} />
                </div>
              </Reorder.Item>
            );
          })}
        </Reorder.Group>
      )}

      {/* Add Block Modal */}
      <AnimatePresence>
        {showAddBlock && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowAddBlock(false)} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} onClick={e => e.stopPropagation()} className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-2xl">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Add Content Block</h2>
                <button onClick={() => setShowAddBlock(false)} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {CMS_BLOCK_TYPES.map(type => {
                  const Icon = BLOCK_ICONS[type.value] || Layout;
                  return (
                    <button key={type.value} onClick={() => handleAddBlock(type.value)} className="flex flex-col items-center gap-2 p-4 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                      <Icon className="w-6 h-6 text-gray-400" />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{type.label}</span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Block Editor Modal */}
      <AnimatePresence>
        {editingBlock && (
          <BlockEditor block={editingBlock} onSave={(updates) => handleSaveBlock(editingBlock.id, updates)} onClose={() => setEditingBlock(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── SEO Settings Panel ──────────────────────────────────────────────────────────

function SeoSettingsPanel({ page, onSave, onClose }: { page: CmsPage; onSave: (updates: Partial<CmsPage>) => void; onClose: () => void }) {
  const [form, setForm] = useState({
    title: page.title, slug: page.slug,
    meta_title: page.meta_title || '', meta_description: page.meta_description || '',
    meta_keywords: (page.meta_keywords || []).join(', '),
    og_title: page.og_title || '', og_description: page.og_description || '', og_image: page.og_image || '',
    canonical_url: page.canonical_url || '',
    status: page.status, publish_at: page.publish_at?.slice(0, 16) || '', expire_at: page.expire_at?.slice(0, 16) || '',
  });

  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden mb-6">
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 dark:text-white">SEO & Page Settings</h3>
          <button onClick={onClose} className="p-1 text-gray-400"><X className="w-5 h-5" /></button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Page Title"><input className="seo-input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="URL Slug"><input className="seo-input" value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} /></Field>
          <Field label="Meta Title"><input className="seo-input" value={form.meta_title} onChange={e => setForm({ ...form, meta_title: e.target.value })} /></Field>
          <Field label="Meta Description"><textarea className="seo-input" rows={2} value={form.meta_description} onChange={e => setForm({ ...form, meta_description: e.target.value })} /></Field>
          <Field label="Meta Keywords (comma-separated)"><input className="seo-input" value={form.meta_keywords} onChange={e => setForm({ ...form, meta_keywords: e.target.value })} /></Field>
          <Field label="Canonical URL"><input className="seo-input" value={form.canonical_url} onChange={e => setForm({ ...form, canonical_url: e.target.value })} /></Field>
          <Field label="OG Title"><input className="seo-input" value={form.og_title} onChange={e => setForm({ ...form, og_title: e.target.value })} /></Field>
          <Field label="OG Description"><textarea className="seo-input" rows={2} value={form.og_description} onChange={e => setForm({ ...form, og_description: e.target.value })} /></Field>
          <Field label="OG Image URL"><input className="seo-input" value={form.og_image} onChange={e => setForm({ ...form, og_image: e.target.value })} /></Field>
          <Field label="Status">
            <select className="seo-input" value={form.status} onChange={e => setForm({ ...form, status: e.target.value as CmsPage['status'] })}>
              {CMS_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Publish Date"><input type="datetime-local" className="seo-input" value={form.publish_at} onChange={e => setForm({ ...form, publish_at: e.target.value })} /></Field>
          <Field label="Expiry Date"><input type="datetime-local" className="seo-input" value={form.expire_at} onChange={e => setForm({ ...form, expire_at: e.target.value })} /></Field>
        </div>
        <button onClick={() => onSave({
          title: form.title, slug: form.slug, meta_title: form.meta_title || null,
          meta_description: form.meta_description || null, meta_keywords: form.meta_keywords ? form.meta_keywords.split(',').map(k => k.trim()) : null,
          og_title: form.og_title || null, og_description: form.og_description || null, og_image: form.og_image || null,
          canonical_url: form.canonical_url || null, status: form.status,
          publish_at: form.publish_at ? new Date(form.publish_at).toISOString() : null,
          expire_at: form.expire_at ? new Date(form.expire_at).toISOString() : null,
        })} className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm">Save Settings</button>
      </div>
    </motion.div>
  );
}

// ─── Version History Panel ──────────────────────────────────────────────────────

function VersionHistoryPanel({ versions, onRestore, onClose }: { versions: any[]; onRestore: (id: string) => void; onClose: () => void }) {
  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden mb-6">
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900 dark:text-white">Version History</h3>
          <button onClick={onClose} className="p-1 text-gray-400"><X className="w-5 h-5" /></button>
        </div>
        {versions.length === 0 ? (
          <p className="text-sm text-gray-400">No versions saved yet. Save a draft to create a version.</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {versions.map(v => (
              <div key={v.id} className="flex items-center justify-between p-3 rounded-xl border border-gray-100 dark:border-gray-700">
                <div>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">v{v.version_number}</span>
                  <span className="text-xs text-gray-400 ml-2">{new Date(v.created_at).toLocaleString()}</span>
                  {v.change_summary && <p className="text-xs text-gray-400 mt-0.5">{v.change_summary}</p>}
                </div>
                <button onClick={() => onRestore(v.id)} className="text-xs px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg font-medium">Restore</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>{children}</div>;
}
