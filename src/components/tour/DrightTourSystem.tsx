import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Check, Compass } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import {
  PENDING_TOUR_STORAGE_KEY,
  TOUR_DEFINITIONS,
  type TourDefinition,
  type TourKey,
} from '../../tours/tourDefinitions';

type Props = {
  userId?: string | null;
  userCreatedAt?: string | null;
};

type SpotlightRect = {
  top: number;
  left: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
};

type TourStatus = 'started' | 'completed' | 'skipped';

const SAFE_AUTOSTART_PATH = '/';
const LOCAL_PREFIX = 'dright-tour-progress';
// Existing DRIGHT accounts are not forced through a new onboarding experience.
// Accounts created after the tour rollout can receive the one-time Basics tour.
const AUTO_TOUR_ROLLOUT_AT = Date.parse('2026-09-24T14:30:00Z');

function localKey(userId: string, tour: TourDefinition) {
  return `${LOCAL_PREFIX}:${userId}:${tour.key}:v${tour.version}`;
}

function getVisibleTarget(selector?: string): HTMLElement | null {
  if (!selector) return null;
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(selector));
  return candidates.find(el => {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  }) ?? null;
}

function paddedRect(element: HTMLElement): SpotlightRect {
  const rect = element.getBoundingClientRect();
  const pad = 8;
  const top = Math.max(8, rect.top - pad);
  const left = Math.max(8, rect.left - pad);
  const right = Math.min(window.innerWidth - 8, rect.right + pad);
  const bottom = Math.min(window.innerHeight - 8, rect.bottom + pad);
  return {
    top,
    left,
    right,
    bottom,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

async function saveProgress(
  userId: string,
  tour: TourDefinition,
  status: TourStatus,
  currentStep: number,
) {
  const now = new Date().toISOString();
  const payload = {
    user_id: userId,
    tour_key: tour.key,
    tour_version: tour.version,
    status,
    current_step: currentStep,
    started_at: now,
    last_seen_at: now,
    completed_at: status === 'completed' ? now : null,
    skipped_at: status === 'skipped' ? now : null,
  };

  try {
    const { error } = await supabase
      .from('user_tour_progress')
      .upsert(payload, { onConflict: 'user_id,tour_key,tour_version' });
    if (error) throw error;
  } catch {
    // The database table may not be available during a preview deploy.
    // Local persistence keeps the tour safe and non-blocking.
  }

  try {
    window.localStorage.setItem(localKey(userId, tour), JSON.stringify({
      status,
      current_step: currentStep,
      updated_at: now,
    }));
  } catch {
    // Storage is best-effort only.
  }
}

async function hasFinishedTour(userId: string, tour: TourDefinition): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('user_tour_progress')
      .select('status')
      .eq('user_id', userId)
      .eq('tour_key', tour.key)
      .eq('tour_version', tour.version)
      .maybeSingle();

    if (!error && data) {
      return data.status === 'completed' || data.status === 'skipped';
    }
  } catch {
    // Fall through to local storage.
  }

  try {
    const raw = window.localStorage.getItem(localKey(userId, tour));
    if (!raw) return false;
    const stored = JSON.parse(raw) as { status?: string };
    return stored.status === 'completed' || stored.status === 'skipped';
  } catch {
    return false;
  }
}

export default function DrightTourSystem({ userId, userCreatedAt }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeKey, setActiveKey] = useState<TourKey | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null);
  const autoCheckedFor = useRef<string | null>(null);

  const tour = activeKey ? TOUR_DEFINITIONS[activeKey] : null;
  const step = tour?.steps[stepIndex] ?? null;

  const beginTour = useCallback((tourKey: TourKey) => {
    const nextTour = TOUR_DEFINITIONS[tourKey];
    if (!nextTour) return;

    // Keep a manually selected tour queued while React Router switches between
    // public/protected route shells. The new AppShell instance resumes it.
    if (location.pathname !== nextTour.startPath) {
      try {
        window.sessionStorage.setItem(PENDING_TOUR_STORAGE_KEY, tourKey);
      } catch {
        // Session storage is best-effort only.
      }
      setActiveKey(null);
      setSpotlight(null);
      navigate(nextTour.startPath);
      return;
    }

    try {
      window.sessionStorage.removeItem(PENDING_TOUR_STORAGE_KEY);
    } catch {
      // Session storage is best-effort only.
    }
    setActiveKey(tourKey);
    setStepIndex(0);
    setSpotlight(null);
    if (userId) void saveProgress(userId, nextTour, 'started', 0);
  }, [location.pathname, navigate, userId]);

  useEffect(() => {
    const onStart = (event: Event) => {
      const detail = (event as CustomEvent<{ tourKey?: TourKey }>).detail;
      if (detail?.tourKey && TOUR_DEFINITIONS[detail.tourKey]) beginTour(detail.tourKey);
    };
    window.addEventListener('dright:start-tour', onStart);
    return () => window.removeEventListener('dright:start-tour', onStart);
  }, [beginTour]);

  useEffect(() => {
    if (!userId || activeKey) return;
    try {
      const pending = window.sessionStorage.getItem(PENDING_TOUR_STORAGE_KEY) as TourKey | null;
      if (pending && TOUR_DEFINITIONS[pending]) beginTour(pending);
    } catch {
      // Session storage is best-effort only.
    }
  }, [activeKey, beginTour, location.pathname, userCreatedAt, userId]);

  useEffect(() => {
    if (!userId || !userCreatedAt || location.pathname !== SAFE_AUTOSTART_PATH || activeKey) return;
    const createdAt = Date.parse(userCreatedAt);
    if (!Number.isFinite(createdAt) || createdAt < AUTO_TOUR_ROLLOUT_AT) return;
    const marker = `${userId}:basics:v${TOUR_DEFINITIONS.basics.version}`;
    if (autoCheckedFor.current === marker) return;
    autoCheckedFor.current = marker;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const finished = await hasFinishedTour(userId, TOUR_DEFINITIONS.basics);
      if (!cancelled && !finished && location.pathname === SAFE_AUTOSTART_PATH) {
        beginTour('basics');
      }
    }, 900);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeKey, beginTour, location.pathname, userCreatedAt, userId]);

  useEffect(() => {
    if (!tour || !step) return;

    if (step.route && location.pathname !== step.route) {
      navigate(step.route);
      setSpotlight(null);
      return;
    }

    if (!step.target) {
      setSpotlight(null);
      return;
    }

    let attempts = 0;
    let frame = 0;
    const resolve = () => {
      attempts += 1;
      const target = getVisibleTarget(step.target);
      if (!target) {
        setSpotlight(null);
        if (attempts < 10) frame = window.setTimeout(resolve, 120);
        return;
      }

      const rect = target.getBoundingClientRect();
      if (rect.top < 12 || rect.bottom > window.innerHeight - 12) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      }
      window.setTimeout(() => setSpotlight(paddedRect(target)), 180);
    };

    resolve();

    const onViewportChange = () => {
      const target = getVisibleTarget(step.target);
      setSpotlight(target ? paddedRect(target) : null);
    };
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);

    return () => {
      window.clearTimeout(frame);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [location.pathname, navigate, step, tour]);

  useEffect(() => {
    if (!tour) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (userId) void saveProgress(userId, tour, 'skipped', stepIndex);
        setActiveKey(null);
        setSpotlight(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stepIndex, tour, userId]);

  const cardStyle = useMemo(() => {
    if (!spotlight || step?.placement === 'center') return undefined;
    const cardWidth = Math.min(380, window.innerWidth - 32);
    const estimatedHeight = 245;
    const gap = 14;
    const roomBelow = window.innerHeight - spotlight.bottom;
    const preferBelow = step?.placement === 'bottom' || (step?.placement !== 'top' && roomBelow >= estimatedHeight + gap);
    const top = preferBelow
      ? Math.min(window.innerHeight - estimatedHeight - 16, spotlight.bottom + gap)
      : Math.max(16, spotlight.top - estimatedHeight - gap);
    const left = Math.max(16, Math.min(
      window.innerWidth - cardWidth - 16,
      spotlight.left + (spotlight.width / 2) - (cardWidth / 2),
    ));
    return { width: cardWidth, top, left };
  }, [spotlight, step?.placement]);

  if (!tour || !step) return null;

  const isLast = stepIndex === tour.steps.length - 1;

  const close = (status: 'completed' | 'skipped') => {
    if (userId) void saveProgress(userId, tour, status, stepIndex);
    setActiveKey(null);
    setSpotlight(null);
  };

  const next = () => {
    if (isLast) {
      close('completed');
      return;
    }
    const nextIndex = stepIndex + 1;
    setStepIndex(nextIndex);
    if (userId) void saveProgress(userId, tour, 'started', nextIndex);
  };

  const previous = () => {
    const nextIndex = Math.max(0, stepIndex - 1);
    setStepIndex(nextIndex);
    if (userId) void saveProgress(userId, tour, 'started', nextIndex);
  };

  const backdrop = 'rgba(2, 6, 23, 0.72)';

  return (
    <div className="fixed inset-0 z-[120] pointer-events-none" aria-live="polite">
      {spotlight && step.placement !== 'center' ? (
        <>
          <div className="fixed left-0 right-0 top-0 pointer-events-auto" style={{ height: spotlight.top, background: backdrop }} />
          <div className="fixed left-0 pointer-events-auto" style={{ top: spotlight.top, width: spotlight.left, height: spotlight.height, background: backdrop }} />
          <div className="fixed right-0 pointer-events-auto" style={{ top: spotlight.top, left: spotlight.right, height: spotlight.height, background: backdrop }} />
          <div className="fixed left-0 right-0 bottom-0 pointer-events-auto" style={{ top: spotlight.bottom, background: backdrop }} />
          <div
            className="fixed rounded-2xl ring-4 ring-white/90 shadow-[0_0_0_2px_rgba(99,102,241,0.8),0_0_40px_rgba(99,102,241,0.45)] transition-all duration-200"
            style={{ top: spotlight.top, left: spotlight.left, width: spotlight.width, height: spotlight.height }}
          />
          <div
            className="fixed pointer-events-auto rounded-2xl"
            style={{ top: spotlight.top, left: spotlight.left, width: spotlight.width, height: spotlight.height }}
            aria-hidden="true"
          />
        </>
      ) : (
        <div className="fixed inset-0 pointer-events-auto" style={{ background: backdrop }} />
      )}

      <div
        role="dialog"
        aria-modal="true"
        aria-label={tour.title}
        className={spotlight && step.placement !== 'center'
          ? 'fixed pointer-events-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 shadow-2xl p-5'
          : 'fixed pointer-events-auto left-4 right-4 top-1/2 -translate-y-1/2 mx-auto max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 shadow-2xl p-6'}
        style={cardStyle}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-300">
              <Compass className="w-4 h-4" />
              <span className="text-[11px] font-black uppercase tracking-[0.16em]">{tour.title}</span>
            </div>
            <h2 className="mt-2 text-xl font-black text-slate-950 dark:text-white">{step.title}</h2>
          </div>
          <button
            type="button"
            onClick={() => close('skipped')}
            className="shrink-0 w-9 h-9 rounded-full border border-slate-200 dark:border-white/10 flex items-center justify-center text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10"
            aria-label="Skip tour"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{step.body}</p>

        <div className="mt-5">
          <div className="flex items-center gap-1.5 mb-4">
            {tour.steps.map((_, index) => (
              <span
                key={index}
                className={`h-1.5 rounded-full transition-all ${index === stepIndex ? 'w-7 bg-indigo-600' : index < stepIndex ? 'w-3 bg-indigo-300' : 'w-3 bg-slate-200 dark:bg-slate-700'}`}
              />
            ))}
            <span className="ml-auto text-xs font-semibold text-slate-400">{stepIndex + 1} of {tour.steps.length}</span>
          </div>

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => close('skipped')}
              className="text-sm font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            >
              Skip
            </button>
            <div className="flex items-center gap-2">
              {stepIndex > 0 && (
                <button
                  type="button"
                  onClick={previous}
                  className="min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-white/10 text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1"
                >
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
              )}
              <button
                type="button"
                onClick={next}
                className="min-h-[42px] px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black flex items-center gap-1.5"
              >
                {isLast ? <><Check className="w-4 h-4" /> Finish</> : <>Next <ChevronRight className="w-4 h-4" /></>}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
