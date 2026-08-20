import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ExternalLink, FileText, Video as VideoIcon,
  ChevronLeft, ChevronRight, X,
} from 'lucide-react';

export interface PortfolioItem {
  id: string;
  item_type: 'IMAGE' | 'VIDEO' | 'PDF' | 'LINK';
  file_url: string | null;
  external_url: string | null;
  link_platform: string | null;
  title: string | null;
  description: string | null;
  position: number;
}

interface PortfolioSectionProps {
  items: PortfolioItem[];
}

const PLATFORM_ICONS: Record<string, string> = {
  Behance: '🎨',
  Dribbble: '🏀',
  YouTube: '▶️',
  TikTok: '🎵',
  Instagram: '📸',
  'Google Drive': '📁',
  Dropbox: '📦',
  Website: '🌐',
  Upwork: '💼',
  Fiverr: '🟢',
};

export default function PortfolioSection({ items }: PortfolioSectionProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (!items || items.length === 0) return null;

  const mediaItems = items.filter(i => i.item_type !== 'LINK');
  const linkItems = items.filter(i => i.item_type === 'LINK');
  const imageItems = mediaItems.filter(i => i.item_type === 'IMAGE');

  const openLightbox = (idx: number) => setLightboxIndex(idx);
  const closeLightbox = () => setLightboxIndex(null);
  const prevLightbox = () => setLightboxIndex(prev => prev !== null ? Math.max(0, prev - 1) : 0);
  const nextLightbox = () => setLightboxIndex(prev => prev !== null ? Math.min(imageItems.length - 1, prev + 1) : 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Previous Work</h2>
        <span className="text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-400 font-medium">
          Portfolio Available
        </span>
      </div>

      {/* Image Gallery */}
      {imageItems.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {imageItems.map((item, idx) => (
            <button
              key={item.id}
              onClick={() => openLightbox(idx)}
              className="relative aspect-square rounded-xl overflow-hidden bg-gray-800 group"
            >
              <img
                src={item.file_url!}
                alt={item.title || `Portfolio item ${idx + 1}`}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
              {item.title && (
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                  <p className="text-xs text-white font-medium truncate">{item.title}</p>
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Video items */}
      {mediaItems.filter(i => i.item_type === 'VIDEO').map(item => (
        <div key={item.id} className="bg-gray-800 rounded-xl overflow-hidden">
          <div className="flex items-center gap-3 p-4">
            <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center shrink-0">
              <VideoIcon className="w-5 h-5 text-red-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{item.title || 'Video Portfolio'}</p>
              {item.description && <p className="text-xs text-gray-400 truncate">{item.description}</p>}
            </div>
            {item.file_url && (
              <a href={item.file_url} target="_blank" rel="noopener noreferrer"
                className="p-2 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors">
                <ExternalLink className="w-4 h-4 text-gray-300" />
              </a>
            )}
          </div>
        </div>
      ))}

      {/* PDF Case Studies */}
      {mediaItems.filter(i => i.item_type === 'PDF').map(item => (
        <div key={item.id} className="bg-gray-800 rounded-xl overflow-hidden">
          <div className="flex items-center gap-3 p-4">
            <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5 text-orange-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{item.title || 'Case Study'}</p>
              {item.description && <p className="text-xs text-gray-400 truncate">{item.description}</p>}
            </div>
            {item.file_url && (
              <a href={item.file_url} target="_blank" rel="noopener noreferrer"
                className="px-3 py-1.5 bg-orange-500 text-white text-xs font-medium rounded-lg hover:bg-orange-600 transition-colors">
                View PDF
              </a>
            )}
          </div>
        </div>
      ))}

      {/* External Links */}
      {linkItems.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-400">External Profiles & Links</p>
          <div className="flex flex-wrap gap-2">
            {linkItems.map(item => (
              <a
                key={item.id}
                href={item.external_url || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 bg-gray-800 rounded-xl border border-gray-700 hover:border-gray-500 transition-colors text-sm text-gray-200 font-medium"
              >
                <span>{PLATFORM_ICONS[item.link_platform || ''] || '🔗'}</span>
                <span>{item.link_platform || item.title || 'Link'}</span>
                <ExternalLink className="w-3 h-3 text-gray-500" />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxIndex !== null && imageItems[lightboxIndex] && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4"
            onClick={closeLightbox}
          >
            <button
              onClick={closeLightbox}
              className="absolute top-4 right-4 p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors"
            >
              <X className="w-6 h-6 text-white" />
            </button>

            {lightboxIndex > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); prevLightbox(); }}
                className="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors"
              >
                <ChevronLeft className="w-6 h-6 text-white" />
              </button>
            )}

            {lightboxIndex < imageItems.length - 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); nextLightbox(); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors"
              >
                <ChevronRight className="w-6 h-6 text-white" />
              </button>
            )}

            <motion.img
              key={lightboxIndex}
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              src={imageItems[lightboxIndex].file_url!}
              alt={imageItems[lightboxIndex].title || `Portfolio ${lightboxIndex + 1}`}
              className="max-h-[80vh] max-w-full rounded-xl object-contain"
              onClick={(e) => e.stopPropagation()}
            />

            {imageItems[lightboxIndex].title && (
              <div className="absolute bottom-4 left-0 right-0 text-center">
                <p className="text-white font-medium">{imageItems[lightboxIndex].title}</p>
                {imageItems[lightboxIndex].description && (
                  <p className="text-gray-400 text-sm mt-1">{imageItems[lightboxIndex].description}</p>
                )}
              </div>
            )}

            <p className="absolute bottom-4 right-4 text-gray-500 text-xs">
              {lightboxIndex + 1} / {imageItems.length}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
