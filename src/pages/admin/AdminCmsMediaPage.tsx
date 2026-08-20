import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, Search, Image as ImageIcon, File, Video, Trash2,
  Loader2, CheckCircle, AlertCircle, X, Copy,
} from 'lucide-react';
import { useCmsMedia, uploadMedia, deleteMedia, updateMedia } from '../../lib/cmsHooks';
import type { CmsMedia, CmsMediaType } from '../../lib/cmsTypes';

const FILE_TYPE_ICONS: Record<CmsMediaType, typeof ImageIcon> = {
  image: ImageIcon, video: Video, document: File, pdf: File, icon: ImageIcon,
};

const FOLDERS = ['root', 'images', 'videos', 'documents', 'banners', 'icons'];

export default function AdminCmsMediaPage() {
  const { media, loading, setMedia } = useCmsMedia();
  const [search, setSearch] = useState('');
  const [folderFilter, setFolderFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [previewItem, setPreviewItem] = useState<CmsMedia | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const handleUpload = async (files: FileList) => {
    setUploading(true);
    setUploadProgress(0);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        await uploadMedia(file, 'root', [], file.name);
        setUploadProgress(Math.round(((i + 1) / files.length) * 100));
      }
      showToast('success', `${files.length} file(s) uploaded`);
      // Reload media
      window.location.reload();
    } catch (err) {
      showToast('error', 'Upload failed');
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (mediaId: string) => {
    if (!confirm('Delete this media file?')) return;
    try {
      await deleteMedia(mediaId);
      setMedia(prev => prev.filter(m => m.id !== mediaId));
      showToast('success', 'Media deleted');
    } catch { showToast('error', 'Failed to delete'); }
  };

  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    showToast('success', 'URL copied to clipboard');
  };

  const handleUpdateAlt = async (mediaId: string, altText: string) => {
    try { await updateMedia(mediaId, { alt_text: altText }); } catch { /* ignore */ }
  };

  const filtered = media.filter(m => {
    if (folderFilter !== 'all' && m.folder !== folderFilter) return false;
    if (typeFilter !== 'all' && m.file_type !== typeFilter) return false;
    if (search && !m.filename.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Media Library</h1>
        <p className="text-gray-500 mt-1">Centralized storage for images, videos, and documents</p>
      </div>

      {toast && (
        <div className={`mb-4 rounded-xl p-3 flex items-center gap-2 text-sm ${toast.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.message}
        </div>
      )}

      {/* Upload Zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length > 0) handleUpload(e.dataTransfer.files); }}
        className={`rounded-2xl border-2 border-dashed p-8 text-center mb-6 transition-colors ${dragOver ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700'}`}
      >
        <input ref={fileInputRef} type="file" multiple accept="image/*,video/*,application/pdf" onChange={e => e.target.files && handleUpload(e.target.files)} className="hidden" />
        {uploading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            <div className="w-48 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-blue-600 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
            </div>
            <p className="text-sm text-gray-500">Uploading... {uploadProgress}%</p>
          </div>
        ) : (
          <button onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center gap-2 text-gray-400 hover:text-blue-600">
            <Upload className="w-10 h-10" />
            <p className="font-medium">Click to upload or drag and drop</p>
            <p className="text-xs">Images, videos, PDFs up to 50MB</p>
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search files..." className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:border-blue-500" />
        </div>
        <select value={folderFilter} onChange={e => setFolderFilter(e.target.value)} className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none">
          <option value="all">All Folders</option>
          {FOLDERS.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none">
          <option value="all">All Types</option>
          <option value="image">Images</option>
          <option value="video">Videos</option>
          <option value="document">Documents</option>
          <option value="pdf">PDFs</option>
          <option value="icon">Icons</option>
        </select>
      </div>

      {/* Media Grid */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-blue-500 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No media files found</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filtered.map(item => {
            const Icon = FILE_TYPE_ICONS[item.file_type] || File;
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden group"
              >
                <div className="aspect-square bg-gray-50 dark:bg-gray-900 relative cursor-pointer" onClick={() => setPreviewItem(item)}>
                  {item.file_type === 'image' || item.file_type === 'icon' ? (
                    <img src={item.file_url} alt={item.alt_text || item.filename} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Icon className="w-10 h-10 text-gray-300" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <div className="flex gap-1">
                      <button onClick={(e) => { e.stopPropagation(); handleCopyUrl(item.file_url); }} className="p-2 bg-white/20 rounded-lg text-white hover:bg-white/30" title="Copy URL">
                        <Copy className="w-4 h-4" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }} className="p-2 bg-white/20 rounded-lg text-white hover:bg-red-500" title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
                <div className="p-2">
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{item.filename}</p>
                  <p className="text-xs text-gray-400">{item.folder}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Preview Modal */}
      <AnimatePresence>
        {previewItem && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setPreviewItem(null)} className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} onClick={e => e.stopPropagation()} className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-lg space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900 dark:text-white">{previewItem.filename}</h3>
                <button onClick={() => setPreviewItem(null)} className="p-1 text-gray-400"><X className="w-5 h-5" /></button>
              </div>
              {previewItem.file_type === 'image' && (
                <img src={previewItem.file_url} alt={previewItem.alt_text || ''} className="w-full max-h-64 object-contain rounded-xl" />
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Alt Text</label>
                <input className="editor-input" defaultValue={previewItem.alt_text || ''} onBlur={e => handleUpdateAlt(previewItem.id, e.target.value)} placeholder="Describe this image..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">URL</label>
                <div className="flex gap-2">
                  <input className="editor-input flex-1" value={previewItem.file_url} readOnly />
                  <button onClick={() => handleCopyUrl(previewItem.file_url)} className="px-3 py-2 bg-blue-600 text-white rounded-xl text-sm"><Copy className="w-4 h-4" /></button>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-400">
                <span>{previewItem.file_type}</span>
                <span>{(previewItem.file_size / 1024).toFixed(0)} KB</span>
                <span>{previewItem.folder}</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
