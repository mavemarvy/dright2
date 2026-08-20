import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Search, Tag, Plus, Flame, ArrowRight } from 'lucide-react';
import { useActiveBanners, useTrackBannerEvent } from '../../lib/bannerHooks';
import { resolveBannerUrl } from '../../lib/bannerTypes';
import type { MarketplaceBanner } from '../../lib/bannerTypes';

interface HeroBannerProps {
  onSearch: (query: string) => void;
  onBrowseCategories: () => void;
}

function useCountdown(target: string | null): { hours: number; minutes: number; seconds: number; active: boolean } {
  const [remaining, setRemaining] = useState({ hours: 0, minutes: 0, seconds: 0, active: false });

  useEffect(() => {
    if (!target) return;
    const targetTime = new Date(target).getTime();
    const update = () => {
      const diff = targetTime - Date.now();
      if (diff <= 0) { setRemaining({ hours: 0, minutes: 0, seconds: 0, active: false }); return; }
      setRemaining({
        hours: Math.floor(diff / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
        seconds: Math.floor((diff % 60000) / 1000),
        active: true,
      });
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [target]);

  return remaining;
}

function getResponsiveImage(banner: MarketplaceBanner): string | null {
  if (typeof window === 'undefined') return banner.desktop_image || banner.media_url || null;
  const width = window.innerWidth;
  if (width < 768) return banner.mobile_image || banner.tablet_image || banner.desktop_image || banner.media_url || null;
  if (width < 1024) return banner.tablet_image || banner.desktop_image || banner.media_url || null;
  return banner.desktop_image || banner.media_url || null;
}

function BannerSlide({ banner }: { banner: MarketplaceBanner }) {
  const countdown = useCountdown(banner.countdown_ends_at);
  const imageUrl = getResponsiveImage(banner);
  const destUrl = banner.button_link || resolveBannerUrl(null, banner.button_link);

  return (
    <>
      {/* Background media */}
      {imageUrl && (
        <img src={imageUrl} alt={banner.title} loading="lazy" className="w-full h-full object-cover" />
      )}
      {banner.video_url && (
        <video src={banner.video_url} autoPlay loop muted playsInline className="w-full h-full object-cover" />
      )}

      {/* Overlay gradient */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-transparent" />

      {/* Content */}
      <div className="relative px-6 py-12 md:px-12 md:py-20 flex flex-col items-start gap-4 min-h-[320px] md:min-h-[420px] justify-center max-w-3xl">
        {banner.badge_text && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-orange-500/90 text-white text-xs font-bold rounded-full uppercase tracking-wide">
            <Flame className="w-3 h-3" /> {banner.badge_text}
          </span>
        )}
        <div>
          <h1 className="text-3xl md:text-5xl font-bold text-white leading-tight">{banner.title}</h1>
          {banner.subtitle && (
            <p className="text-base md:text-xl text-white/80 mt-3 max-w-xl">{banner.subtitle}</p>
          )}
          {banner.description && (
            <p className="text-sm md:text-base text-white/60 mt-2 max-w-lg hidden md:block">{banner.description}</p>
          )}
        </div>

        {banner.promotional_message && (
          <p className="text-sm text-white/70 italic">{banner.promotional_message}</p>
        )}

        {/* Countdown timer */}
        {countdown.active && (
          <div className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-orange-400" />
            <span className="text-sm text-white/90 font-medium">Ends in</span>
            <div className="flex items-center gap-1.5">
              {[
                { label: 'H', value: countdown.hours },
                { label: 'M', value: countdown.minutes },
                { label: 'S', value: countdown.seconds },
              ].map((unit, i) => (
                <span key={i} className="bg-white/20 backdrop-blur rounded-lg px-2.5 py-1 text-white font-bold text-sm tabular-nums">
                  {String(unit.value).padStart(2, '0')}
                  <span className="text-white/60 text-xs ml-0.5">{unit.label}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* CTA button */}
        {banner.button_visible && banner.button_text && destUrl && (
          destUrl.startsWith('http') ? (
            <a href={destUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 bg-white text-primary-700 rounded-xl font-bold text-sm hover:bg-gray-50 transition-colors shadow-lg">
              {banner.button_text} <ArrowRight className="w-4 h-4" />
            </a>
          ) : (
            <Link to={destUrl}
              className="inline-flex items-center gap-2 px-6 py-3 bg-white text-primary-700 rounded-xl font-bold text-sm hover:bg-gray-50 transition-colors shadow-lg">
              {banner.button_text} <ArrowRight className="w-4 h-4" />
            </Link>
          )
        )}
      </div>
    </>
  );
}

export default function HeroBanner({ onSearch, onBrowseCategories }: HeroBannerProps) {
  const { banners, loading } = useActiveBanners();
  const [currentIdx, setCurrentIdx] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragDelta, setDragDelta] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const trackEvent = useTrackBannerEvent();

  // Track impressions
  useEffect(() => {
    if (banners.length > 0 && banners[currentIdx]) {
      trackEvent(banners[currentIdx].id, 'impression');
    }
  }, [currentIdx, banners, trackEvent]);

  // Auto-slide
  useEffect(() => {
    if (banners.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIdx(prev => (prev + 1) % banners.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [banners.length]);

  const goTo = useCallback((idx: number) => {
    setCurrentIdx(((idx % banners.length) + banners.length) % banners.length);
  }, [banners.length]);

  // Touch/mouse swipe
  const handleDragStart = (clientX: number) => {
    setIsDragging(true);
    setDragStartX(clientX);
    setDragDelta(0);
  };

  const handleDragMove = (clientX: number) => {
    if (!isDragging) return;
    setDragDelta(clientX - dragStartX);
  };

  const handleDragEnd = () => {
    if (!isDragging) return;
    if (Math.abs(dragDelta) > 80) {
      if (dragDelta > 0) goTo(currentIdx - 1);
      else goTo(currentIdx + 1);
    }
    setIsDragging(false);
    setDragDelta(0);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) onSearch(searchQuery.trim());
  };

  // Empty state: no banners at all — render fallback hero
  if (!loading && banners.length === 0) {
    return (
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-primary-600 via-primary-700 to-indigo-800 shadow-xl">
        <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-transparent" />
        <div className="relative px-6 py-12 md:px-12 md:py-20 flex flex-col items-start gap-6 min-h-[320px] md:min-h-[420px] justify-center max-w-3xl">
          <div>
            <h1 className="text-3xl md:text-5xl font-bold text-white leading-tight">DRIGHT Marketplace</h1>
            <p className="text-base md:text-xl text-white/80 mt-3 max-w-xl">
              Discover digital products, courses, services, and jobs from creators worldwide.
            </p>
          </div>
          <form onSubmit={handleSearch} className="w-full max-w-2xl mt-2">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search for anything..."
                className="w-full pl-12 pr-4 py-4 rounded-2xl bg-white/95 backdrop-blur text-gray-900 placeholder-gray-400 outline-none focus:ring-4 focus:ring-white/30 transition-all shadow-lg" />
            </div>
          </form>
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={onBrowseCategories}
              className="inline-flex items-center gap-2 px-5 py-3 bg-white/15 backdrop-blur border border-white/20 text-white rounded-xl font-semibold text-sm hover:bg-white/25 transition-colors">
              <Tag className="w-4 h-4" /> Browse Categories
            </button>
            <Link to="/upload-product"
              className="inline-flex items-center gap-2 px-5 py-3 bg-white text-primary-700 rounded-xl font-bold text-sm hover:bg-gray-50 transition-colors shadow-lg">
              <Plus className="w-4 h-4" /> Sell Now
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-3xl bg-gray-100 dark:bg-gray-800 animate-pulse min-h-[320px] md:min-h-[420px]" />
    );
  }

  return (
    <div
      className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-primary-600 via-primary-700 to-indigo-800 shadow-xl select-none"
      onMouseDown={(e) => handleDragStart(e.clientX)}
      onMouseMove={(e) => handleDragMove(e.clientX)}
      onMouseUp={handleDragEnd}
      onMouseLeave={handleDragEnd}
      onTouchStart={(e) => handleDragStart(e.touches[0].clientX)}
      onTouchMove={(e) => handleDragMove(e.touches[0].clientX)}
      onTouchEnd={handleDragEnd}
    >
      {/* Carousel track */}
      <div
        ref={trackRef}
        className="flex transition-transform duration-500 ease-out"
        style={{
          transform: `translateX(calc(-${currentIdx * 100}% + ${isDragging ? dragDelta : 0}px))`,
          transitionDuration: isDragging ? '0ms' : '500ms',
        }}
      >
        {banners.map(banner => (
          <div key={banner.id} className="relative w-full flex-shrink-0">
            <BannerSlide banner={banner} />
          </div>
        ))}
      </div>

      {/* Search bar overlay (shared across all slides) */}
      <div className="relative px-6 md:px-12 pb-6 md:pb-8 -mt-2">
        <form onSubmit={handleSearch} className="w-full max-w-2xl">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for anything..."
              className="w-full pl-12 pr-4 py-4 rounded-2xl bg-white/95 backdrop-blur text-gray-900 placeholder-gray-400 outline-none focus:ring-4 focus:ring-white/30 transition-all shadow-lg" />
          </div>
        </form>
        <div className="flex flex-wrap items-center gap-3 mt-4">
          <button onClick={onBrowseCategories}
            className="inline-flex items-center gap-2 px-5 py-3 bg-white/15 backdrop-blur border border-white/20 text-white rounded-xl font-semibold text-sm hover:bg-white/25 transition-colors">
            <Tag className="w-4 h-4" /> Browse Categories
          </button>
          <Link to="/upload-product"
            className="inline-flex items-center gap-2 px-5 py-3 bg-white text-primary-700 rounded-xl font-bold text-sm hover:bg-gray-50 transition-colors shadow-lg">
            <Plus className="w-4 h-4" /> Sell Now
          </Link>
        </div>
      </div>

      {/* Navigation controls */}
      {banners.length > 1 && (
        <>
          {/* Arrow buttons */}
          <button
            onClick={() => goTo(currentIdx - 1)}
            className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/20 backdrop-blur text-white hover:bg-white/30 transition-colors z-10 hidden md:block"
            aria-label="Previous banner"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => goTo(currentIdx + 1)}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/20 backdrop-blur text-white hover:bg-white/30 transition-colors z-10 hidden md:block"
            aria-label="Next banner"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          {/* Dot indicators */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 z-10">
            {banners.map((_, idx) => (
              <button
                key={idx}
                onClick={() => goTo(idx)}
                className={`h-2 rounded-full transition-all ${idx === currentIdx ? 'w-8 bg-white' : 'w-2 bg-white/40'}`}
                aria-label={`Go to banner ${idx + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
