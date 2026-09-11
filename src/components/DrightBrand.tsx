import { useId, type ComponentType } from 'react';

export type DrightBrandVariant = 'standard' | 'admin';

type DrightMarkProps = {
  size?: number;
  variant?: DrightBrandVariant;
  className?: string;
  title?: string;
};

/**
 * DRIGHT's canonical icon mark.
 * Gloss-black tile + brushed silver D, with an optional admin gold accent.
 */
export function DrightMark({
  size = 44,
  variant = 'standard',
  className = '',
  title = 'DRIGHT',
}: DrightMarkProps) {
  const rawId = useId().replace(/:/g, '');
  const metalId = `dright-metal-${rawId}`;
  const rimId = `dright-rim-${rawId}`;
  const faceId = `dright-face-${rawId}`;
  const depthId = `dright-depth-${rawId}`;
  const accentId = `dright-accent-${rawId}`;
  const isAdmin = variant === 'admin';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 drop-shadow-[0_10px_18px_rgba(0,0,0,0.28)] ${className}`}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <defs>
        <linearGradient id={rimId} x1="16" y1="4" x2="88" y2="97" gradientUnits="userSpaceOnUse">
          <stop stopColor={isAdmin ? '#fff3bf' : '#f8fafc'} />
          <stop offset="0.22" stopColor={isAdmin ? '#d6a633' : '#cbd5e1'} />
          <stop offset="0.5" stopColor="#64748b" />
          <stop offset="0.78" stopColor="#1e293b" />
          <stop offset="1" stopColor={isAdmin ? '#8a5d10' : '#0f172a'} />
        </linearGradient>
        <linearGradient id={faceId} x1="50" y1="8" x2="50" y2="94" gradientUnits="userSpaceOnUse">
          <stop stopColor="#30343b" />
          <stop offset="0.3" stopColor="#15181d" />
          <stop offset="0.72" stopColor="#07090c" />
          <stop offset="1" stopColor="#020305" />
        </linearGradient>
        <linearGradient id={metalId} x1="22" y1="17" x2="80" y2="82" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" />
          <stop offset="0.17" stopColor="#e8edf3" />
          <stop offset="0.38" stopColor="#9aa6b5" />
          <stop offset="0.55" stopColor="#f6f8fb" />
          <stop offset="0.76" stopColor="#9ca8b8" />
          <stop offset="1" stopColor="#596575" />
        </linearGradient>
        <linearGradient id={depthId} x1="49" y1="13" x2="49" y2="86" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="0.45" stopColor="#778396" stopOpacity="0.85" />
          <stop offset="1" stopColor="#111827" stopOpacity="0.98" />
        </linearGradient>
        <linearGradient id={accentId} x1="68" y1="8" x2="96" y2="38" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fff6c7" />
          <stop offset="0.48" stopColor="#f4c455" />
          <stop offset="1" stopColor="#a96812" />
        </linearGradient>
        <filter id={`shadow-${rawId}`} x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="7" stdDeviation="5" floodColor="#000000" floodOpacity="0.6" />
        </filter>
      </defs>

      <rect x="4" y="4" width="92" height="92" rx="23" fill={`url(#${rimId})`} />
      <rect x="6.2" y="6.2" width="87.6" height="87.6" rx="21" fill={`url(#${faceId})`} />
      <path d="M10 10H90V50C71 42 38 38 10 49V10Z" fill="white" fillOpacity="0.055" />
      <path d="M12 12H88" stroke="white" strokeOpacity="0.16" strokeWidth="1.4" strokeLinecap="round" />

      {isAdmin && (
        <>
          <path d="M72 7H77C86.4 7 94 14.6 94 24V29L72 7Z" fill={`url(#${accentId})`} fillOpacity="0.95" />
          <circle cx="84" cy="18" r="4.3" fill="#111318" stroke="#ffe7a1" strokeWidth="1.4" />
          <path d="M82.2 18L83.6 19.5L86.2 16.6" stroke="#f7c84b" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}

      <g filter={`url(#shadow-${rawId})`}>
        <path
          d="M26 20H52C71.4 20 83 31.7 83 50C83 68.3 71.4 80 52 80H26V20ZM42 35V65H51C60.9 65 67 59 67 50C67 41 60.9 35 51 35H42Z"
          fill={`url(#${depthId})`}
          transform="translate(0 2.4)"
          opacity="0.92"
        />
        <path
          d="M26 18H52C71.4 18 83 30.4 83 50C83 69.6 71.4 82 52 82H26V18ZM42 34V66H51C61.4 66 68 59.6 68 50C68 40.4 61.4 34 51 34H42Z"
          fill={`url(#${metalId})`}
          stroke="#64748b"
          strokeWidth="0.7"
        />
        <path d="M30 22V77" stroke="white" strokeOpacity="0.22" strokeWidth="1" />
      </g>
    </svg>
  );
}

type DrightWordmarkProps = {
  compact?: boolean;
  variant?: DrightBrandVariant;
  className?: string;
};

export function DrightWordmark({ compact = false, variant = 'standard', className = '' }: DrightWordmarkProps) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div
        className={`font-black uppercase leading-none tracking-[0.24em] text-transparent bg-clip-text ${
          compact ? 'text-lg' : 'text-xl'
        } ${
          variant === 'admin'
            ? 'bg-gradient-to-b from-amber-100 via-amber-300 to-amber-600'
            : 'bg-gradient-to-b from-slate-950 via-slate-700 to-slate-500 dark:from-white dark:via-slate-200 dark:to-slate-400'
        }`}
      >
        DRIGHT
      </div>
      {variant === 'admin' && !compact && (
        <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.28em] text-amber-400/80">
          Admin Console
        </div>
      )}
    </div>
  );
}

export function DrightBrand({
  size = 44,
  variant = 'standard',
  compact = false,
  className = '',
}: DrightMarkProps & { compact?: boolean }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <DrightMark size={size} variant={variant} />
      {!compact && <DrightWordmark variant={variant} />}
    </div>
  );
}

type MetallicNavIconProps = {
  icon: ComponentType<{ className?: string }>;
  active?: boolean;
  variant?: DrightBrandVariant;
  compact?: boolean;
  className?: string;
};

/** Compact platform/navigation icon tile that visually belongs to the DRIGHT mark. */
export function MetallicNavIcon({
  icon: Icon,
  active = false,
  variant = 'standard',
  compact = false,
  className = '',
}: MetallicNavIconProps) {
  const admin = variant === 'admin';
  const sizeClass = compact ? 'w-7 h-7 rounded-lg' : 'w-8 h-8 rounded-[10px]';
  const iconClass = compact ? 'w-4 h-4' : 'w-[17px] h-[17px]';

  return (
    <span
      className={`${sizeClass} shrink-0 inline-flex items-center justify-center border transition-all duration-200 ${
        active
          ? admin
            ? 'border-amber-300/70 bg-gradient-to-b from-[#302817] via-[#16130d] to-black text-amber-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_5px_12px_rgba(0,0,0,0.25)]'
            : 'border-slate-400/70 bg-gradient-to-b from-[#353941] via-[#15181d] to-black text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_5px_12px_rgba(0,0,0,0.22)]'
          : admin
            ? 'border-amber-500/20 bg-gradient-to-b from-amber-100/10 to-black/10 text-amber-300/80'
            : 'border-slate-300/70 dark:border-slate-600/70 bg-gradient-to-b from-white via-slate-50 to-slate-200 dark:from-slate-700 dark:via-slate-800 dark:to-slate-900 text-slate-600 dark:text-slate-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]'
      } ${className}`}
      aria-hidden="true"
    >
      <Icon className={`${iconClass} stroke-[1.9]`} />
    </span>
  );
}
