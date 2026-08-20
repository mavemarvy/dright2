import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, ChevronRight, Package, X, Maximize2, Play,
} from 'lucide-react';

interface PremiumGalleryProps {
  images: string[];
  alt: string;
  videoUrl?: string | null;
}

export default function PremiumGallery({ images, alt, videoUrl }: PremiumGalleryProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [zoomPos, setZoomPos] = useState({ x: 50, y: 50 });
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);

  const media: Array<{ type: 'image' | 'video'; url: string }> = [];
  if (videoUrl) media.push({ type: 'video', url: videoUrl });
  images.forEach(url => media.push({ type: 'image', url }));

  const hasMedia = media.length > 0;

  useEffect(() => {
    setCurrentIndex(0);
  }, [images, videoUrl]);

  const goToSlide = useCallback((idx: number) => {
    setDirection(idx > currentIndex ? 1 : -1);
    setCurrentIndex(idx);
  }, [currentIndex]);

  const nextSlide = useCallback(() => {
    if (!hasMedia) return;
    setDirection(1);
    setCurrentIndex(prev => (prev + 1) % media.length);
  }, [hasMedia, media.length]);

  const prevSlide = useCallback(() => {
    if (!hasMedia) return;
    setDirection(-1);
    setCurrentIndex(prev => (prev - 1 + media.length) % media.length);
  }, [hasMedia, media.length]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (fullscreen) {
        if (e.key === 'Escape') setFullscreen(false);
        if (e.key === 'ArrowLeft') prevSlide();
        if (e.key === 'ArrowRight') nextSlide();
      } else {
        if (e.key === 'ArrowLeft') prevSlide();
        if (e.key === 'ArrowRight') nextSlide();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [fullscreen, prevSlide, nextSlide]);

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: { offset: { x: number } }) => {
    const threshold = 50;
    if (info.offset.x < -threshold) nextSlide();
    else if (info.offset.x > threshold) prevSlide();
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!zoomed || !imageRef.current) return;
    const rect = imageRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setZoomPos({ x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) });
  };

  // Touch swipe for mobile
  const touchStartX = useRef(0);
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) nextSlide();
      else prevSlide();
    }
  };

  if (!hasMedia) {
    return (
      <div className="rounded-2xl overflow-hidden bg-gray-100 border border-gray-200 aspect-square flex flex-col items-center justify-center gap-3">
        <Package className="w-16 h-16 text-gray-300" />
        <p className="text-sm text-gray-400">No images available</p>
      </div>
    );
  }

  const currentMedia = media[currentIndex];

  return (
    <>
      <div ref={containerRef} className="space-y-3">
        {/* Main Display */}
        <div
          ref={imageRef}
          className="relative rounded-2xl overflow-hidden bg-gray-100 border border-gray-200 aspect-square select-none cursor-zoom-in"
          onMouseMove={handleMouseMove}
          onMouseEnter={() => currentMedia.type === 'image' && setZoomed(true)}
          onMouseLeave={() => setZoomed(false)}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <AnimatePresence initial={false} custom={direction} mode="popLayout">
            <motion.div
              key={currentIndex}
              custom={direction}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.2}
              onDragEnd={handleDragEnd}
              initial={{ opacity: 0, x: direction > 0 ? 300 : -300 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction > 0 ? -300 : 300 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="absolute inset-0"
            >
              {currentMedia.type === 'video' ? (
                <div className="w-full h-full flex items-center justify-center bg-black">
                  <iframe
                    src={currentMedia.url}
                    title={`${alt} — Video`}
                    className="w-full h-full"
                    allow="accelerated-elements; autoplay; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              ) : (
                <img
                  src={currentMedia.url}
                  alt={`${alt} — Image ${currentIndex + 1}`}
                  className="w-full h-full object-cover pointer-events-none transition-transform duration-200"
                  style={zoomed ? {
                    transformOrigin: `${zoomPos.x}% ${zoomPos.y}%`,
                    transform: 'scale(2)',
                  } : undefined}
                  draggable={false}
                />
              )}
            </motion.div>
          </AnimatePresence>

          {/* Desktop Arrow Navigation */}
          {media.length > 1 && (
            <>
              <button
                onClick={prevSlide}
                className="hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 backdrop-blur rounded-full items-center justify-center shadow-lg hover:bg-white transition-colors z-10"
                aria-label="Previous"
              >
                <ChevronLeft className="w-5 h-5 text-gray-700" />
              </button>
              <button
                onClick={nextSlide}
                className="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 backdrop-blur rounded-full items-center justify-center shadow-lg hover:bg-white transition-colors z-10"
                aria-label="Next"
              >
                <ChevronRight className="w-5 h-5 text-gray-700" />
              </button>
            </>
          )}

          {/* Top-right controls */}
          <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
            {media.length > 1 && (
              <span className="px-3 py-1 bg-black/50 backdrop-blur rounded-full text-white text-xs font-medium">
                {currentIndex + 1} / {media.length}
              </span>
            )}
            {currentMedia.type === 'image' && (
              <button
                onClick={() => setFullscreen(true)}
                className="w-8 h-8 bg-black/50 backdrop-blur rounded-full flex items-center justify-center text-white hover:bg-black/70 transition-colors"
                aria-label="View fullscreen"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Video badge */}
          {currentMedia.type === 'video' && (
            <div className="absolute top-3 left-3 px-2 py-1 bg-red-600 rounded-full text-white text-xs font-medium flex items-center gap-1 z-10">
              <Play className="w-3 h-3 fill-white" /> Video
            </div>
          )}
        </div>

        {/* Thumbnail Strip */}
        {media.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: 'thin' }}>
            {media.map((item, idx) => (
              <button
                key={idx}
                onClick={() => goToSlide(idx)}
                className={`shrink-0 w-16 h-16 md:w-20 md:h-20 rounded-lg overflow-hidden border-2 transition-all relative ${
                  idx === currentIndex
                    ? 'border-primary-500 ring-2 ring-primary-100'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                aria-label={`View media ${idx + 1}`}
              >
                {item.type === 'video' ? (
                  <div className="w-full h-full bg-black flex items-center justify-center">
                    <Play className="w-5 h-5 text-white fill-white" />
                  </div>
                ) : (
                  <img src={item.url} alt={`${alt} thumbnail ${idx + 1}`} className="w-full h-full object-cover" loading="lazy" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Fullscreen Viewer */}
      <AnimatePresence>
        {fullscreen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/95 z-[60] flex items-center justify-center"
            onClick={() => setFullscreen(false)}
          >
            <button
              onClick={() => setFullscreen(false)}
              className="absolute top-4 right-4 w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-colors z-10"
              aria-label="Close fullscreen"
            >
              <X className="w-5 h-5" />
            </button>
            {media.length > 1 && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); prevSlide(); }}
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/10 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-colors z-10"
                  aria-label="Previous"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); nextSlide(); }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/10 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-colors z-10"
                  aria-label="Next"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              </>
            )}
            <motion.img
              key={currentIndex}
              src={media[currentIndex].url}
              alt={`${alt} — Fullscreen ${currentIndex + 1}`}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-[90vw] max-h-[90vh] object-contain"
              onClick={(e) => e.stopPropagation()}
            />
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-white/10 rounded-full text-white text-sm">
              {currentIndex + 1} / {media.length}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
