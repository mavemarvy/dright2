import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Play } from 'lucide-react';
import type {
  CmsBlock,
  HeroBlockData,
  BannerBlockData,
  TextBlockData,
  ImageBlockData,
  VideoBlockData,
  CardBlockData,
  FaqBlockData,
  CountdownBlockData,
  DividerBlockData,
  CmsButtonAction,
} from '../../lib/cmsTypes';

// ─── Main Block Renderer ──────────────────────────────────────────────────────

export function BlockRenderer({ block, buttons }: { block: CmsBlock; buttons?: CmsButtonAction[] }) {
  if (block.is_hidden) return null;
  if (block.status !== 'published') return null;

  // Check scheduling
  const now = new Date();
  if (block.publish_at && new Date(block.publish_at) > now) return null;
  if (block.expire_at && new Date(block.expire_at) < now) return null;

  switch (block.block_type) {
    case 'hero': return <HeroBlock block={block} buttons={buttons} />;
    case 'banner': return <BannerBlock block={block} />;
    case 'text': return <TextBlock block={block} />;
    case 'image': return <ImageBlock block={block} />;
    case 'video': return <VideoBlock block={block} />;
    case 'card': return <CardBlock block={block} />;
    case 'faq': return <FaqBlock block={block} />;
    case 'countdown': return <CountdownBlock block={block} />;
    case 'divider': return <DividerBlock block={block} />;
    default: return null;
  }
}

// ─── Button Renderer ────────────────────────────────────────────────────────────

function ButtonRenderer({ button }: { button: CmsButtonAction }) {
  if (button.is_hidden || button.is_disabled) return null;

  const styles: Record<string, string> = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white',
    secondary: 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white',
    outline: 'border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-900 dark:text-white',
  };

  const content = (
    <span className={`inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all min-h-[48px] ${styles[button.button_style] || styles.primary}`}>
      {button.button_text}
    </span>
  );

  if (button.internal_link) {
    return <Link to={button.internal_link}>{content}</Link>;
  }
  if (button.external_link) {
    return (
      <a
        href={button.external_link}
        target={button.open_in_new_tab ? '_blank' : undefined}
        rel={button.open_in_new_tab ? 'noopener noreferrer' : undefined}
      >
        {content}
      </a>
    );
  }
  return content;
}

// ─── Hero Block ──────────────────────────────────────────────────────────────────

function HeroBlock({ block, buttons }: { block: CmsBlock; buttons?: CmsButtonAction[] }) {
  const data = block.block_data as unknown as HeroBlockData;
  const alignmentClass =
    data.alignment === 'center' ? 'text-center mx-auto' :
    data.alignment === 'right' ? 'text-right ml-auto' : 'text-left';

  return (
    <section className="relative overflow-hidden py-20 sm:py-32">
      {data.background_video && (
        <video
          src={data.background_video}
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}
      {data.background_image && (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${data.background_image})` }}
        />
      )}
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative max-w-4xl px-4 sm:px-6 lg:px-8">
        <div className={alignmentClass}>
          {data.title && (
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-tight">
              {data.title}
            </h1>
          )}
          {data.subtitle && (
            <h2 className="mt-4 text-xl sm:text-2xl text-white/80 font-medium">
              {data.subtitle}
            </h2>
          )}
          {data.description && (
            <p className="mt-6 text-base sm:text-lg text-white/70 leading-relaxed max-w-2xl">
              {data.description}
            </p>
          )}
          {buttons && buttons.length > 0 && (
            <div className="mt-8 flex flex-wrap gap-3 justify-inherit">
              {buttons.map(btn => <ButtonRenderer key={btn.id} button={btn} />)}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ─── Banner Block ────────────────────────────────────────────────────────────────

function BannerBlock({ block }: { block: CmsBlock }) {
  const data = block.block_data as unknown as BannerBlockData;
  const banners = data.banners || [];
  const [currentIndex, setCurrentIndex] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (data.carousel && data.auto_slide && banners.length > 1) {
      intervalRef.current = setInterval(() => {
        setCurrentIndex(prev => (prev + 1) % banners.length);
      }, data.auto_slide_interval || 5000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [data.carousel, data.auto_slide, data.auto_slide_interval, banners.length]);

  if (banners.length === 0) return null;

  if (!data.carousel || banners.length === 1) {
    const banner = banners[0];
    return (
      <div className="relative rounded-2xl overflow-hidden">
        {banner.link_url ? (
          <a href={banner.link_url}>
            <img src={banner.image_url} alt={banner.alt_text} className="w-full h-auto object-cover" />
          </a>
        ) : (
          <img src={banner.image_url} alt={banner.alt_text} className="w-full h-auto object-cover" />
        )}
      </div>
    );
  }

  return (
    <div className="relative rounded-2xl overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.div
          key={currentIndex}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="relative"
          draggable
          onDragEnd={(_, info) => {
            if (info.offset.x < -50) setCurrentIndex(prev => (prev + 1) % banners.length);
            if (info.offset.x > 50) setCurrentIndex(prev => (prev - 1 + banners.length) % banners.length);
          }}
        >
          {banners[currentIndex].link_url ? (
            <a href={banners[currentIndex].link_url}>
              <img src={banners[currentIndex].image_url} alt={banners[currentIndex].alt_text} className="w-full h-auto object-cover" />
            </a>
          ) : (
            <img src={banners[currentIndex].image_url} alt={banners[currentIndex].alt_text} className="w-full h-auto object-cover" />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Dots */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
        {banners.map((_: unknown, i: number) => (
          <button
            key={i}
            onClick={() => setCurrentIndex(i)}
            className={`w-2 h-2 rounded-full transition-all ${i === currentIndex ? 'bg-white w-6' : 'bg-white/50'}`}
            aria-label={`Slide ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Text Block ──────────────────────────────────────────────────────────────────

function TextBlock({ block }: { block: CmsBlock }) {
  const data = block.block_data as unknown as TextBlockData;
  return (
    <div className="prose prose-lg dark:prose-invert max-w-none">
      <div dangerouslySetInnerHTML={{ __html: data.content || '' }} />
    </div>
  );
}

// ─── Image Block ──────────────────────────────────────────────────────────────────

function ImageBlock({ block }: { block: CmsBlock }) {
  const data = block.block_data as unknown as ImageBlockData;
  const images = data.images || [];

  if (images.length === 0) return null;

  if (data.layout === 'single' || images.length === 1) {
    return (
      <figure className="max-w-4xl mx-auto">
        <img src={images[0].url} alt={images[0].alt_text} className="w-full h-auto rounded-xl" />
        {images[0].caption && <figcaption className="mt-2 text-sm text-gray-500 text-center">{images[0].caption}</figcaption>}
      </figure>
    );
  }

  if (data.layout === 'grid') {
    const cols = `grid-cols-2 md:grid-cols-${data.columns || 3}`;
    return (
      <div className={`grid ${cols} gap-4`}>
        {images.map(img => (
          <figure key={img.id}>
            <img src={img.url} alt={img.alt_text} className="w-full h-48 object-cover rounded-xl" />
            {img.caption && <figcaption className="mt-1 text-xs text-gray-500">{img.caption}</figcaption>}
          </figure>
        ))}
      </div>
    );
  }

  if (data.layout === 'masonry') {
    return (
      <div className="columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4">
        {images.map((img: { id: string; url: string; alt_text: string; caption: string }) => (
          <figure key={img.id} className="break-inside-avoid">
            <img src={img.url} alt={img.alt_text} className="w-full h-auto rounded-xl" />
            {img.caption && <figcaption className="mt-1 text-xs text-gray-500">{img.caption}</figcaption>}
          </figure>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-4 justify-center">
      {images.map((img: { id: string; url: string; alt_text: string; caption: string }) => (
        <figure key={img.id} className="max-w-sm">
          <img src={img.url} alt={img.alt_text} className="w-full h-auto rounded-xl" />
          {img.caption && <figcaption className="mt-1 text-xs text-gray-500">{img.caption}</figcaption>}
        </figure>
      ))}
    </div>
  );
}

// ─── Video Block ──────────────────────────────────────────────────────────────────

function VideoBlock({ block }: { block: CmsBlock }) {
  const data = block.block_data as unknown as VideoBlockData;
  const [playing, setPlaying] = useState(false);

  if (data.video_type === 'youtube') {
    const videoId = extractYouTubeId(data.video_url);
    if (!videoId) return null;

    if (playing) {
      return (
        <div className="relative aspect-video rounded-xl overflow-hidden bg-black">
          <iframe
            src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
            className="w-full h-full"
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            title="YouTube video"
          />
        </div>
      );
    }

    return (
      <div className="relative aspect-video rounded-xl overflow-hidden bg-black cursor-pointer group" onClick={() => setPlaying(true)}>
        {data.poster_image && (
          <img src={data.poster_image} alt="Video poster" className="w-full h-full object-cover" />
        )}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-16 h-16 bg-white/20 backdrop-blur rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
            <Play className="w-7 h-7 text-white ml-1" fill="white" />
          </div>
        </div>
      </div>
    );
  }

  if (data.video_type === 'vimeo') {
    const videoId = extractVimeoId(data.video_url);
    if (!videoId) return null;
    return (
      <div className="relative aspect-video rounded-xl overflow-hidden">
        <iframe
          src={`https://player.vimeo.com/video/${videoId}${data.autoplay ? '?autoplay=1' : ''}`}
          className="w-full h-full"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          title="Vimeo video"
        />
      </div>
    );
  }

  return (
    <div className="relative aspect-video rounded-xl overflow-hidden bg-black">
      <video
        src={data.video_url}
        controls
        autoPlay={data.autoplay}
        className="w-full h-full"
        poster={data.poster_image || undefined}
      />
    </div>
  );
}

function extractYouTubeId(url: string): string | null {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/))([\w-]{11})/);
  return match ? match[1] : null;
}

function extractVimeoId(url: string): string | null {
  const match = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  return match ? match[1] : null;
}

// ─── Card Block ──────────────────────────────────────────────────────────────────

function CardBlock({ block }: { block: CmsBlock }) {
  const data = block.block_data as unknown as CardBlockData;
  const cards = data.cards || [];
  if (cards.length === 0) return null;

  const cols = `grid-cols-1 sm:grid-cols-2 lg:grid-cols-${data.columns || 3}`;

  return (
    <div className={`grid ${cols} gap-6`}>
      {cards.map((card: { id: string; image_url: string | null; title: string; description: string; cta_text: string | null; cta_link: string | null }) => (
        <div key={card.id} className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden hover:shadow-md transition-shadow">
          {card.image_url && (
            <div className="aspect-video bg-gray-100 dark:bg-gray-700">
              <img src={card.image_url} alt={card.title} className="w-full h-full object-cover" />
            </div>
          )}
          <div className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{card.title}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{card.description}</p>
            {card.cta_text && card.cta_link && (
              <Link to={card.cta_link} className="mt-4 inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-700">
                {card.cta_text} →
              </Link>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── FAQ Block ────────────────────────────────────────────────────────────────────

function FaqBlock({ block }: { block: CmsBlock }) {
  const data = block.block_data as unknown as FaqBlockData;
  const items = data.items || [];
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  if (items.length === 0) return null;

  return (
    <div className="max-w-3xl mx-auto space-y-3">
      {items.map((item: { id: string; question: string; answer: string }, i: number) => (
        <div key={item.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
          <button
            onClick={() => setOpenIndex(openIndex === i ? null : i)}
            className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50"
            aria-expanded={openIndex === i}
          >
            <span className="font-medium text-gray-900 dark:text-white">{item.question}</span>
            <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${openIndex === i ? 'rotate-180' : ''}`} />
          </button>
          <AnimatePresence>
            {openIndex === i && (
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: 'auto' }}
                exit={{ height: 0 }}
                className="overflow-hidden"
              >
                <p className="p-5 pt-0 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{item.answer}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}

// ─── Countdown Block ──────────────────────────────────────────────────────────────

function CountdownBlock({ block }: { block: CmsBlock }) {
  const data = block.block_data as unknown as CountdownBlockData;
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    if (!data.target_date) return;
    const target = new Date(data.target_date).getTime();

    const update = () => {
      const diff = target - Date.now();
      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        return;
      }
      setTimeLeft({
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((diff % (1000 * 60)) / 1000),
      });
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [data.target_date]);

  const units = [
    { show: data.show_days, value: timeLeft.days, label: 'Days' },
    { show: data.show_hours, value: timeLeft.hours, label: 'Hours' },
    { show: data.show_minutes, value: timeLeft.minutes, label: 'Minutes' },
    { show: data.show_seconds, value: timeLeft.seconds, label: 'Seconds' },
  ].filter(u => u.show);

  return (
    <div className="text-center">
      {data.title && <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">{data.title}</h3>}
      <div className="flex justify-center gap-4">
        {units.map(unit => (
          <div key={unit.label} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 min-w-[80px]">
            <div className="text-3xl font-bold text-gray-900 dark:text-white tabular-nums">
              {String(unit.value).padStart(2, '0')}
            </div>
            <div className="text-xs text-gray-500 mt-1">{unit.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Divider Block ────────────────────────────────────────────────────────────────

function DividerBlock({ block }: { block: CmsBlock }) {
  const data = block.block_data as unknown as DividerBlockData;
  const height = data.height || 24;

  if (data.show_line) {
    return <div style={{ paddingTop: height / 2, paddingBottom: height / 2 }}><hr className="border-gray-200 dark:border-gray-700" /></div>;
  }

  return <div style={{ height }} />;
}
