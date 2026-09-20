import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Menu, Sparkles, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import SeoHead from '../components/SeoHead';

type DrightLogoProps = {
  size?: 'large' | 'small';
};

function DrightLogo({ size = 'large' }: DrightLogoProps) {
  const isLarge = size === 'large';
  const metalSurfaceId = 'metal-surface-' + size;
  const metalBevelId = 'metal-bevel-' + size;

  return (
    <div
      className={
        isLarge
          ? 'relative h-56 w-56 min-[390px]:h-60 min-[390px]:w-60 sm:h-72 sm:w-72 rounded-[2.35rem] p-[4px] bg-gradient-to-br from-white via-slate-400 to-slate-800 shadow-[0_28px_70px_-18px_rgba(0,0,0,0.98),0_0_55px_rgba(59,130,246,0.16)]'
          : 'relative h-11 w-11 rounded-[0.9rem] p-[2px] bg-gradient-to-br from-white via-slate-400 to-slate-800 shadow-[0_10px_24px_-8px_rgba(0,0,0,0.95),0_0_18px_rgba(59,130,246,0.12)]'
      }
    >
      <div
        className={
          isLarge
            ? 'relative flex h-full w-full items-center justify-center overflow-hidden rounded-[2.15rem] bg-gradient-to-b from-neutral-700 via-neutral-950 to-black p-4 shadow-[inset_0_4px_10px_rgba(255,255,255,0.38),inset_0_-12px_24px_rgba(0,0,0,0.96)]'
            : 'relative flex h-full w-full items-center justify-center overflow-hidden rounded-[0.78rem] bg-gradient-to-b from-neutral-700 via-neutral-950 to-black p-1 shadow-[inset_0_2px_4px_rgba(255,255,255,0.36),inset_0_-5px_10px_rgba(0,0,0,0.95)]'
        }
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[48%] rounded-t-[inherit] bg-gradient-to-b from-white/16 via-white/6 to-transparent" />
        <div className="pointer-events-none absolute bottom-1 right-2 h-3 w-3 rounded-full bg-blue-400/50 blur-[9px]" />

        {isLarge && (
          <motion.div
            aria-hidden="true"
            className="pointer-events-none absolute -left-[45%] top-[-20%] h-[145%] w-[34%] rotate-[16deg] bg-gradient-to-r from-transparent via-white/14 to-transparent blur-[2px]"
            animate={{ x: ['0%', '430%'] }}
            transition={{ duration: 5.8, repeat: Infinity, repeatDelay: 3.6, ease: 'easeInOut' }}
          />
        )}

        <svg
          viewBox="0 0 100 100"
          className={
            isLarge
              ? 'relative z-10 h-40 w-40 min-[390px]:h-44 min-[390px]:w-44 sm:h-52 sm:w-52 drop-shadow-[0_14px_20px_rgba(0,0,0,0.98)]'
              : 'relative z-10 h-8 w-8 drop-shadow-[0_5px_7px_rgba(0,0,0,0.95)]'
          }
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-label="DRIGHT"
          role="img"
        >
          <defs>
            <linearGradient id={metalSurfaceId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="18%" stopColor="#f8fafc" />
              <stop offset="36%" stopColor="#cbd5e1" />
              <stop offset="56%" stopColor="#94a3b8" />
              <stop offset="76%" stopColor="#e2e8f0" />
              <stop offset="100%" stopColor="#64748b" />
            </linearGradient>
            <linearGradient id={metalBevelId} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.96" />
              <stop offset="42%" stopColor="#94a3b8" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#0f172a" stopOpacity="0.98" />
            </linearGradient>
          </defs>

          <path
            d="M26 15 H52 C72 15 85 28 85 50 C85 72 72 85 52 85 H26 V15 Z M42 32 V68 H51 C62 68 68 60 68 50 C68 40 62 32 51 32 H42 Z"
            fill={'url(#' + metalBevelId + ')'}
            transform="translate(0, 3)"
          />
          <path
            d="M26 15 H52 C72 15 85 28 85 50 C85 72 72 85 52 85 H26 V15 Z M41 31 V69 H51 C63 69 69 61 69 50 C69 39 63 31 51 31 H41 Z"
            fill={'url(#' + metalSurfaceId + ')'}
            stroke="#475569"
            strokeWidth="0.7"
          />
        </svg>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="relative min-h-[100dvh] w-full overflow-hidden bg-[#030712] font-sans text-white">
      <SeoHead
        title={null}
        description="DRIGHT is the AI-powered digital marketplace for creators, sellers, and marketers."
        canonical="/welcome"
        keywords={['digital marketplace', 'AI marketplace', 'DRIGHT', 'digital products', 'creator platform']}
        breadcrumbs={[{ name: 'Home', url: '/welcome' }]}
      />

      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute left-1/2 top-[18%] h-[560px] w-[560px] -translate-x-1/2 rounded-full bg-blue-600/12 blur-[120px]" />
        <div className="absolute right-[-220px] top-[5%] h-[620px] w-[620px] rounded-full bg-indigo-600/9 blur-[140px]" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#030712] via-[#030712]/72 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#030712] via-transparent to-[#030712]" />
      </div>

      <motion.header
        initial={{ opacity: 0, y: -14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="fixed inset-x-0 top-0 z-30 flex items-center justify-between border-b border-white/[0.035] bg-[#07101f]/48 px-5 py-4 backdrop-blur-md sm:px-7 sm:py-5"
      >
        <Link to="/welcome" aria-label="DRIGHT home" className="rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-400/60">
          <DrightLogo size="small" />
        </Link>

        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          className="rounded-xl p-2 text-slate-300 transition-colors hover:bg-white/5 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-400/60"
        >
          {menuOpen ? <X className="h-8 w-8" strokeWidth={1.5} /> : <Menu className="h-8 w-8" strokeWidth={1.5} />}
        </button>
      </motion.header>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="fixed right-5 top-[82px] z-40 w-[min(300px,calc(100vw-40px))] overflow-hidden rounded-2xl border border-white/10 bg-[#08111f]/95 p-2 shadow-2xl backdrop-blur-xl"
          >
            <Link onClick={() => setMenuOpen(false)} to="/market" className="block rounded-xl px-4 py-3 text-sm font-medium text-slate-200 hover:bg-white/5">
              Marketplace
            </Link>
            {user ? (
              <Link onClick={() => setMenuOpen(false)} to="/" className="block rounded-xl px-4 py-3 text-sm font-medium text-slate-200 hover:bg-white/5">
                Dashboard
              </Link>
            ) : (
              <>
                <Link onClick={() => setMenuOpen(false)} to="/sign-in" className="block rounded-xl px-4 py-3 text-sm font-medium text-slate-200 hover:bg-white/5">
                  Sign In
                </Link>
                <Link onClick={() => setMenuOpen(false)} to="/sign-up" className="block rounded-xl px-4 py-3 text-sm font-medium text-blue-300 hover:bg-blue-500/10">
                  Create Account
                </Link>
              </>
            )}
            <Link onClick={() => setMenuOpen(false)} to="/help" className="block rounded-xl px-4 py-3 text-sm font-medium text-slate-200 hover:bg-white/5">
              Help Center
            </Link>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="relative z-10 flex min-h-[100dvh] items-center justify-center px-5 pb-28 pt-24 sm:px-8 sm:pb-32 sm:pt-28">
        <div className="flex w-full max-w-5xl flex-col items-center justify-center text-center">
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 95, damping: 16, delay: 0.08 }}
            className="relative"
          >
            <motion.div
              aria-hidden="true"
              className="pointer-events-none absolute bottom-[-42px] left-1/2 h-20 w-64 -translate-x-1/2 -rotate-6 rounded-full bg-blue-500/25 blur-3xl"
              animate={{ opacity: [0.45, 0.75, 0.45], scale: [0.94, 1.06, 0.94] }}
              transition={{ duration: 4.6, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 5.2, repeat: Infinity, ease: 'easeInOut' }}
            >
              <DrightLogo size="large" />
            </motion.div>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 95, damping: 17, delay: 0.2 }}
            className="mt-10 whitespace-nowrap text-[2.05rem] font-black leading-none tracking-[0.025em] text-white min-[390px]:text-[2.25rem] sm:mt-12 sm:text-5xl md:text-7xl"
          >
            Welcome <span className="text-slate-300">to</span> DRIGHT
          </motion.h1>
        </div>
      </main>

      <motion.div
        initial={{ opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 95, damping: 17, delay: 0.32 }}
        className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-8"
      >
        <Link
          to="/market"
          className="group relative flex min-h-[54px] w-full max-w-[620px] items-center justify-center gap-2.5 overflow-hidden rounded-full border border-blue-600/65 bg-[#050B1D]/95 px-5 py-3.5 shadow-[0_14px_42px_rgba(37,99,235,0.28),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl transition-all duration-300 hover:scale-[1.015] hover:border-blue-400/90"
        >
          <div className="pointer-events-none absolute inset-0 rounded-full bg-blue-600/10 opacity-70 blur-xl transition-opacity group-hover:opacity-100" />
          <Sparkles className="relative h-5 w-5 shrink-0 text-blue-400 sm:h-6 sm:w-6" strokeWidth={1.5} />
          <span className="relative text-center text-[0.95rem] font-normal tracking-[0.055em] text-slate-100 min-[390px]:text-base sm:text-xl sm:tracking-[0.08em]">
            AI-powered marketplace, now live
          </span>
          <Sparkles className="relative h-5 w-5 shrink-0 text-blue-400 sm:h-6 sm:w-6" strokeWidth={1.5} />
        </Link>
      </motion.div>
    </div>
  );
}
