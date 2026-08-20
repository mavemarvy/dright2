import { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Download, ZoomIn, ZoomOut } from 'lucide-react';

interface ImageLightboxProps {
  images: string[];
  initialIndex?: number;
  onClose: () => void;
}

export default function ImageLightbox({ images, initialIndex = 0, onClose }: ImageLightboxProps) {
  const [current, setCurrent] = useState(initialIndex);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [current]);

  const prev = () => { setScale(1); setCurrent(c => (c - 1 + images.length) % images.length); };
  const next = () => { setScale(1); setCurrent(c => (c + 1) % images.length); };

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col" onClick={onClose}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0" onClick={e => e.stopPropagation()}>
        <span className="text-white/70 text-sm">{current + 1} / {images.length}</span>
        <div className="flex items-center gap-2">
          <button onClick={() => setScale(s => Math.max(0.5, s - 0.25))} className="p-2 text-white/70 hover:text-white">
            <ZoomOut className="w-5 h-5" />
          </button>
          <button onClick={() => setScale(s => Math.min(4, s + 0.25))} className="p-2 text-white/70 hover:text-white">
            <ZoomIn className="w-5 h-5" />
          </button>
          <a href={images[current]} download target="_blank" rel="noopener noreferrer"
            className="p-2 text-white/70 hover:text-white" onClick={e => e.stopPropagation()}>
            <Download className="w-5 h-5" />
          </a>
          <button onClick={onClose} className="p-2 text-white/70 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Image */}
      <div className="flex-1 flex items-center justify-center overflow-hidden" onClick={e => e.stopPropagation()}>
        {images.length > 1 && (
          <button onClick={prev} className="absolute left-4 z-10 p-2 text-white/70 hover:text-white bg-white/10 rounded-full">
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}
        <img
          src={images[current]}
          alt={`Image ${current + 1}`}
          className="max-h-full max-w-full object-contain transition-transform duration-200"
          style={{ transform: `scale(${scale})` }}
          draggable={false}
        />
        {images.length > 1 && (
          <button onClick={next} className="absolute right-4 z-10 p-2 text-white/70 hover:text-white bg-white/10 rounded-full">
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Thumbnails */}
      {images.length > 1 && (
        <div className="flex gap-1.5 justify-center px-4 py-3 shrink-0 overflow-x-auto" onClick={e => e.stopPropagation()}>
          {images.map((img, i) => (
            <button key={i} onClick={() => { setCurrent(i); setScale(1); }}
              className={`w-12 h-12 shrink-0 rounded overflow-hidden border-2 transition-all ${i === current ? 'border-white' : 'border-transparent opacity-60 hover:opacity-100'}`}>
              <img src={img} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
