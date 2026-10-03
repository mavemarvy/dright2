import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  BookOpen, CheckCircle2, ChevronLeft, ChevronRight, Circle, Compass, ExternalLink,
  FileDown, FileText, Images, List, Lock, Menu, PlayCircle, RotateCcw,
  Sparkles, Target, Trophy, Video, X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import VideoPlayer from './VideoPlayer';
import FitnessProgressPlanner from './course/FitnessProgressPlanner';

export type PremiumCourseLesson = {
  title: string;
  brief: string;
  action: string;
};

export type PremiumCourseModule = {
  title: string;
  intro: string;
  principles: string[];
  mistakes: string[];
  deliverable: string;
  lessons: PremiumCourseLesson[];
  question: {
    prompt: string;
    choices: string[];
    answer: number;
    explanation: string;
  };
};

export type PremiumCourseVideo = {
  module: number;
  title: string;
  url: string;
  description: string;
  region?: string;
};

export type PremiumCourseStockVisual = {
  title: string;
  imageUrl: string;
  sourceUrl: string;
  sourceLabel: string;
  caption: string;
  videoUrl?: string;
};

export type PremiumCourseReference = {
  label: string;
  url: string;
  summary: string;
  points: string[];
};

export type PremiumCourseDownload = {
  label: string;
  href: string;
  type: string;
};

export type PremiumCourseConfig = {
  courseNumber: string;
  slug: string;
  title: string;
  subtitle: string;
  promise: string;
  accent: 'instagram' | 'whatsapp' | 'youtube' | 'google';
  productPath?: string;
  modules: PremiumCourseModule[];
  videos: PremiumCourseVideo[];
  visuals: PremiumCourseStockVisual[];
  references: PremiumCourseReference[];
  downloads: PremiumCourseDownload[];
};

function accentClasses(accent: PremiumCourseConfig['accent']) {
  if (accent === 'whatsapp') {
    return {
      badge: 'bg-emerald-400/15 text-emerald-200',
      solid: 'bg-emerald-600 hover:bg-emerald-700',
      text: 'text-emerald-600',
      border: 'border-emerald-200',
      soft: 'bg-emerald-50',
      gradient: 'from-emerald-500 to-teal-400',
      hero: 'from-emerald-950/55 via-slate-950 to-teal-950/40',
    };
  }
  if (accent === 'youtube') {
    return {
      badge: 'bg-red-400/15 text-red-200',
      solid: 'bg-red-600 hover:bg-red-700',
      text: 'text-red-600',
      border: 'border-red-200',
      soft: 'bg-red-50',
      gradient: 'from-red-600 to-rose-400',
      hero: 'from-red-950/70 via-slate-950 to-zinc-950',
    };
  }
  if (accent === 'google') {
    return {
      badge: 'bg-blue-400/15 text-blue-200',
      solid: 'bg-blue-600 hover:bg-blue-700',
      text: 'text-blue-600',
      border: 'border-blue-200',
      soft: 'bg-blue-50',
      gradient: 'from-blue-600 to-emerald-400',
      hero: 'from-blue-950/70 via-slate-950 to-emerald-950/35',
    };
  }
  return {
    badge: 'bg-fuchsia-400/15 text-fuchsia-200',
    solid: 'bg-fuchsia-600 hover:bg-fuchsia-700',
    text: 'text-fuchsia-600',
    border: 'border-fuchsia-200',
    soft: 'bg-fuchsia-50',
    gradient: 'from-fuchsia-500 to-orange-400',
    hero: 'from-indigo-950/50 via-slate-950 to-fuchsia-950/45',
  };
}

export default function PremiumCourseLearningPage({ config }: { config: PremiumCourseConfig }) {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const guestToken = searchParams.get('guest') || '';
  const colors = accentClasses(config.accent);
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [adminPreview, setAdminPreview] = useState(false);
  const [expired, setExpired] = useState(false);
  const [expiryDays, setExpiryDays] = useState<number | null>(null);
  const [productId, setProductId] = useState('');
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [activeModule, setActiveModule] = useState(0);
  const [activeLesson, setActiveLesson] = useState(0);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [checkedAnswer, setCheckedAnswer] = useState(false);
  const [guestMode, setGuestMode] = useState(false);
  const [guestDaysRemaining, setGuestDaysRemaining] = useState(0);
  const [guestEmail, setGuestEmail] = useState('');

  const lessons = useMemo(
    () => config.modules.flatMap((module, moduleIndex) =>
      module.lessons.map((lesson, lessonIndex) => ({
        ...lesson,
        key: String(moduleIndex) + '-' + String(lessonIndex),
        moduleIndex,
        lessonIndex,
      })),
    ),
    [config.modules],
  );

  const currentModule = config.modules[activeModule];
  const currentLesson = currentModule.lessons[activeLesson];
  const currentKey = String(activeModule) + '-' + String(activeLesson);
  const doneCount = lessons.filter((lesson) => completed[lesson.key]).length;
  const percent = lessons.length ? Math.round((doneCount / lessons.length) * 100) : 0;
  const currentNumber = lessons.findIndex((lesson) => lesson.key === currentKey) + 1;
  const moduleVideos = config.videos.filter((video) => video.module === activeModule);
  const visualStart = config.visuals.length > 0 ? (activeModule * 2) % config.visuals.length : 0;
  const lessonVisuals = config.visuals.length <= 2
    ? config.visuals
    : [config.visuals[visualStart], config.visuals[(visualStart + 1) % config.visuals.length]];
  const moduleDone = currentModule.lessons.filter((_, index) => completed[String(activeModule) + '-' + String(index)]).length;
  const modulePercent = Math.round((moduleDone / Math.max(1, currentModule.lessons.length)) * 100);
  const isLastLesson = activeModule === config.modules.length - 1 && activeLesson === currentModule.lessons.length - 1;

  const progressIdentity = user?.id || (guestToken ? 'guest:' + guestToken : '');
  const progressKey = progressIdentity ? 'dright-course-progress:' + config.slug + ':' + progressIdentity : '';
  const notesKey = progressIdentity ? 'dright-course-notes:' + config.slug + ':' + progressIdentity : '';

  useEffect(() => {
    if (!progressIdentity) return;
    let localCompleted: Record<string, boolean> = {};
    let localNotes: Record<string, string> = {};
    try { localCompleted = JSON.parse(localStorage.getItem(progressKey) || '{}'); } catch { /* ignore */ }
    try { localNotes = JSON.parse(localStorage.getItem(notesKey) || '{}'); } catch { /* ignore */ }

    void (async () => {
      const { data, error } = await supabase.rpc('get_course_learning_progress', {
        p_course_slug: config.slug,
        p_guest_token: user?.id ? null : (guestToken || null),
      });
      const remote = data && typeof data === 'object' ? data as Record<string, any> : null;
      if (!error && remote?.success) {
        const remoteCompleted = remote.completed && typeof remote.completed === 'object' ? remote.completed : {};
        const remoteNotes = remote.notes && typeof remote.notes === 'object' ? remote.notes : {};
        const mergedCompleted = { ...localCompleted, ...remoteCompleted };
        const mergedNotes = { ...localNotes, ...remoteNotes };
        setCompleted(mergedCompleted);
        setNotes(mergedNotes);
        setActiveModule(Math.max(0, Math.min(config.modules.length - 1, Number(remote.active_module || 0))));
        const remoteModule = Math.max(0, Math.min(config.modules.length - 1, Number(remote.active_module || 0)));
        setActiveLesson(Math.max(0, Math.min(config.modules[remoteModule]?.lessons.length - 1 || 0, Number(remote.active_lesson || 0))));
        try {
          localStorage.setItem(progressKey, JSON.stringify(mergedCompleted));
          localStorage.setItem(notesKey, JSON.stringify(mergedNotes));
        } catch { /* local fallback is optional */ }
      } else {
        setCompleted(localCompleted);
        setNotes(localNotes);
      }
    })();
  }, [progressIdentity, config.slug, guestToken, user?.id]);

  useEffect(() => {
    const check = async () => {
      setChecking(true);
      setAdminPreview(false);
      setGuestMode(false);
      setGuestDaysRemaining(0);
      setGuestEmail('');
      setExpired(false);
      setExpiryDays(null);
      setAllowed(false);

      if (!user?.id) {
        if (!guestToken) {
          setChecking(false);
          return;
        }
        const { data: guestData, error: guestError } = await supabase.rpc('get_guest_access', { p_token: guestToken });
        const guest = Array.isArray(guestData) ? guestData[0] : guestData;
        if (
          !guestError
          && guest?.active === true
          && String(guest?.course_slug || '') === config.slug
        ) {
          setProductId(String(guest.product_id || ''));
          setGuestMode(true);
          setGuestDaysRemaining(Number(guest.days_remaining || 0));
          setGuestEmail(String(guest.recipient_email || ''));
          setAllowed(true);
        }
        setChecking(false);
        return;
      }

      const { data: publicData } = await supabase.rpc('get_public_dright_official_products');
      const publicItems = Array.isArray(publicData) ? publicData : [];
      let course = publicItems.find((item: any) => item.slug === config.slug);
      let hiddenAdminCourse = false;

      if (!course?.marketplace_product_id) {
        const { data: adminData, error: adminError } = await supabase.rpc('admin_list_dright_official_products');
        if (!adminError && Array.isArray(adminData)) {
          const hiddenCourse = adminData.find((item: any) => item.slug === config.slug);
          if (hiddenCourse?.marketplace_product_id) {
            course = hiddenCourse;
            hiddenAdminCourse = true;
          }
        }
      }

      if (!course?.marketplace_product_id) {
        setChecking(false);
        return;
      }

      setProductId(String(course.marketplace_product_id));

      const [{ data: order }, { data: digitalDetails }] = await Promise.all([
        supabase
          .from('orders')
          .select('id, created_at')
          .eq('product_id', course.marketplace_product_id)
          .eq('buyer_id', user.id)
          .eq('status', 'COMPLETED')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('digital_product_details')
          .select('expiry_days')
          .eq('product_id', course.marketplace_product_id)
          .maybeSingle(),
      ]);

      const days = Number(digitalDetails?.expiry_days || 365);
      setExpiryDays(days);
      if (order?.created_at) {
        const purchasedAt = new Date(order.created_at).getTime();
        const expiresAt = purchasedAt + days * 24 * 60 * 60 * 1000;
        const isExpired = Date.now() > expiresAt;
        setExpired(isExpired);
        setAllowed(!isExpired);
      } else if (hiddenAdminCourse) {
        // Admin QA preview remains available, but once the admin buys the hidden
        // product the real buyer-order entitlement above takes precedence.
        setAdminPreview(true);
        setAllowed(true);
      }

      setChecking(false);
    };
    void check();
  }, [user?.id, config.slug, guestToken]);

  useEffect(() => {
    setSelectedAnswer(null);
    setCheckedAnswer(false);
  }, [activeModule, activeLesson]);

  const saveServerProgress = (
    nextCompleted: Record<string, boolean>,
    nextNotes: Record<string, string>,
    moduleIndex = activeModule,
    lessonIndex = activeLesson,
  ) => {
    if (!progressIdentity) return;
    void supabase.rpc('save_course_learning_progress', {
      p_course_slug: config.slug,
      p_completed: nextCompleted,
      p_notes: nextNotes,
      p_active_module: moduleIndex,
      p_active_lesson: lessonIndex,
      p_guest_token: user?.id ? null : (guestToken || null),
    }).then(({ error }) => {
      if (error) console.warn('Course progress sync failed:', error.message);
    });
  };

  const persistCompleted = (next: Record<string, boolean>) => {
    setCompleted(next);
    if (progressKey) localStorage.setItem(progressKey, JSON.stringify(next));
    saveServerProgress(next, notes);
  };

  const persistNotes = (next: Record<string, string>) => {
    setNotes(next);
    if (notesKey) localStorage.setItem(notesKey, JSON.stringify(next));
    saveServerProgress(completed, next);
  };

  const goToLesson = (moduleIndex: number, lessonIndex: number) => {
    setActiveModule(moduleIndex);
    setActiveLesson(lessonIndex);
    saveServerProgress(completed, notes, moduleIndex, lessonIndex);
    setOutlineOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goNext = () => {
    if (activeLesson < currentModule.lessons.length - 1) {
      goToLesson(activeModule, activeLesson + 1);
    } else if (activeModule < config.modules.length - 1) {
      goToLesson(activeModule + 1, 0);
    }
  };

  const goPrevious = () => {
    if (activeLesson > 0) {
      goToLesson(activeModule, activeLesson - 1);
    } else if (activeModule > 0) {
      goToLesson(activeModule - 1, config.modules[activeModule - 1].lessons.length - 1);
    }
  };

  const completeAndContinue = () => {
    if (!completed[currentKey]) persistCompleted({ ...completed, [currentKey]: true });
    if (!isLastLesson) goNext();
  };

  const resetProgress = () => {
    if (progressKey) localStorage.removeItem(progressKey);
    setCompleted({});
    goToLesson(0, 0);
  };

  const tourSteps = [
    ['Welcome', 'This is a guided learning workspace. Start from Module 1 and move one lesson at a time instead of scrolling through the whole course.'],
    ['Course outline', 'Use the outline to see all 15 modules, jump to a lesson, and check what you have already completed.'],
    ['Watch + learn', 'Embedded tutorials play inside DRIGHT. Stock visuals and lesson explanations sit beside the practical work so the course stays visual.'],
    ['Practice', 'Every lesson ends with an action. Do the task with a real or sample business before marking the lesson complete.'],
    ['Check + continue', 'Use the knowledge check, save notes, then press Complete & Continue. Progress is synced to your DRIGHT buyer or guest access so it can continue after account claim.'],
  ];

  if (checking) {
    return <div className="min-h-[70vh] flex items-center justify-center text-gray-500">Preparing your course workspace…</div>;
  }

  if (!allowed) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gray-100 mx-auto flex items-center justify-center"><Lock className="w-7 h-7 text-gray-500" /></div>
        <h1 className="text-2xl font-black text-gray-900 mt-5">{expired ? 'Course access expired' : 'Course access locked'}</h1>
        <p className="text-gray-600 mt-2">
          {expired
            ? `Your paid access period has ended after ${expiryDays || 365} days. Repurchase or renew the course to continue learning.`
            : `Purchase ${config.title} from the Official DRIGHT Store to unlock this learning portal.`}
        </p>
        <div className="mt-6 flex gap-3 justify-center">
          {productId && <Link to={'/product/' + productId} className={'px-5 py-3 rounded-xl text-white font-bold ' + colors.solid}>{expired ? 'Renew access' : 'View product'}</Link>}
          <Link to="/dright/store" className="px-5 py-3 rounded-xl border border-gray-200 font-bold text-gray-700">Official Store</Link>
        </div>
      </div>
    );
  }

  const check = currentModule.question;

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <section className="relative overflow-hidden bg-slate-950 text-white">
        <div className={'absolute inset-0 bg-gradient-to-br ' + colors.hero} />
        <div className="relative max-w-7xl mx-auto px-4 py-7 md:py-10">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
            <div className="max-w-3xl">
              <div className="flex items-center gap-2 text-xs font-black tracking-[0.18em] uppercase text-slate-300">
                <span>DRIGHT Course {config.courseNumber}</span><span>•</span><span>2026 Edition</span>
              </div>
              <h1 className="mt-3 text-3xl md:text-5xl font-black leading-tight">{config.title}</h1>
              <p className="mt-3 text-lg font-bold text-slate-200">{config.subtitle}</p>
              <p className="mt-3 text-sm md:text-base leading-7 text-slate-300 max-w-2xl">{config.promise}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold">{config.modules.length} modules</span>
                <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold">{lessons.length} lessons</span>
                <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold">{config.videos.length} embedded tutorials</span>
                <span className={'rounded-full px-3 py-1.5 text-xs font-bold ' + colors.badge}>{adminPreview ? 'ADMIN PREVIEW • NOT PUBLIC' : 'Buyer-only access'}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => { setTourStep(0); setTourOpen(true); }} className="min-h-[44px] rounded-xl bg-white text-slate-950 px-4 text-sm font-black inline-flex items-center justify-center gap-2">
                <Compass className="w-4 h-4" /> Course tour
              </button>
              <button onClick={() => setMediaOpen(true)} className="min-h-[44px] rounded-xl bg-white/10 border border-white/15 px-4 text-sm font-bold inline-flex items-center justify-center gap-2">
                <PlayCircle className="w-4 h-4" /> Media library
              </button>
            </div>
          </div>

          {guestMode && (
            <div className="mt-6 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-amber-100">Guest mode • {guestDaysRemaining} day{guestDaysRemaining === 1 ? '' : 's'} left</p>
                  <p className="mt-1 text-xs leading-5 text-amber-100/90">
                    This course was purchased for {guestEmail}. Sign in or create a DRIGHT buyer account with that same email before guest mode expires; the purchase and supported course progress will move into Orders.
                  </p>
                </div>
                <Link to={'/guest-access/' + guestToken} className="shrink-0 rounded-xl bg-white px-4 py-2 text-xs font-black text-slate-950">Guest purchase</Link>
              </div>
            </div>
          )}

          <div className="mt-7 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-sm font-black">Your course progress</p><p className="text-xs text-slate-400">{doneCount}/{lessons.length} lessons complete</p></div>
              <span className="text-2xl font-black">{percent}%</span>
            </div>
            <div className="mt-3 h-2.5 rounded-full bg-white/10 overflow-hidden">
              <motion.div className={'h-full rounded-full bg-gradient-to-r ' + colors.gradient} animate={{ width: percent + '%' }} transition={{ duration: 0.4 }} />
            </div>
            <button onClick={resetProgress} className="mt-3 text-xs font-bold text-slate-300 inline-flex items-center gap-1.5"><RotateCcw className="w-3.5 h-3.5" /> Reset progress</button>
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {config.slug === 'weight-loss-fitness-business-affiliate-mastery-2026' && (
          <div className="mb-6">
            <FitnessProgressPlanner storageKey={'dright:course006:fitness-planner:' + (progressIdentity || 'admin-preview')} />
          </div>
        )}

        <div className="lg:hidden mb-4">
          <button onClick={() => setOutlineOpen(true)} className="w-full min-h-[46px] rounded-xl border border-slate-200 bg-white text-sm font-black inline-flex items-center justify-center gap-2"><Menu className="w-4 h-4" /> Course outline</button>
        </div>

        <div className="grid lg:grid-cols-[330px_minmax(0,1fr)] gap-6 items-start">
          <aside className="hidden lg:block sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="p-4 border-b border-slate-100 sticky top-0 bg-white z-10"><div className="flex items-center gap-2"><List className="w-4 h-4" /><h2 className="font-black">Course outline</h2></div></div>
            <div className="p-2">
              {config.modules.map((module, moduleIndex) => (
                <div key={module.title} className="mb-2">
                  <button onClick={() => goToLesson(moduleIndex, 0)} className={'w-full text-left rounded-xl px-3 py-3 ' + (moduleIndex === activeModule ? colors.soft : 'hover:bg-slate-50')}>
                    <div className="flex gap-3">
                      <div className={'w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ' + (moduleIndex === activeModule ? colors.solid + ' text-white' : 'bg-slate-100 text-slate-600')}>{moduleIndex + 1}</div>
                      <div className="min-w-0"><p className="text-xs font-black leading-5 text-slate-800">{module.title}</p><p className="text-[11px] text-slate-400">{module.lessons.filter((_, i) => completed[moduleIndex + '-' + i]).length}/{module.lessons.length} complete</p></div>
                    </div>
                  </button>
                  {moduleIndex === activeModule && (
                    <div className="ml-5 mt-1 border-l border-slate-200 pl-3 space-y-1">
                      {module.lessons.map((lesson, lessonIndex) => {
                        const key = moduleIndex + '-' + lessonIndex;
                        return (
                          <button key={key} onClick={() => goToLesson(moduleIndex, lessonIndex)} className={'w-full flex gap-2 rounded-lg px-2 py-2 text-left text-xs ' + (lessonIndex === activeLesson ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-50')}>
                            {completed[key] ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> : <Circle className="w-4 h-4 shrink-0 opacity-40" />}
                            <span>{lesson.title}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </aside>

          <main className="min-w-0 space-y-5">
            <AnimatePresence mode="wait">
              <motion.section key={currentKey} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="p-5 md:p-7 border-b border-slate-100">
                  <div className="flex items-center justify-between gap-3">
                    <p className={'text-xs font-black uppercase tracking-[0.14em] ' + colors.text}>Module {activeModule + 1} • Lesson {activeLesson + 1}</p>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{modulePercent}% module</span>
                  </div>
                  <h2 className="mt-3 text-2xl md:text-3xl font-black text-slate-950">{currentLesson.title}</h2>
                  <p className="mt-3 text-sm md:text-base leading-7 text-slate-600">{currentModule.intro}</p>
                </div>

                <div className="p-5 md:p-7 space-y-6">
                  <div className="rounded-2xl bg-slate-950 text-white p-5">
                    <div className="flex items-center gap-2"><BookOpen className="w-4 h-4" /><p className="text-xs font-black uppercase tracking-wider">Core lesson</p></div>
                    <p className="mt-3 text-base md:text-lg leading-8 text-slate-100">{currentLesson.brief}</p>
                  </div>

                  <div className="grid lg:grid-cols-3 gap-3">
                    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                      <p className="text-xs font-black uppercase tracking-wider text-blue-700">Framework</p>
                      <ul className="mt-3 space-y-2">{currentModule.principles.map((point) => <li key={point} className="flex gap-2 text-sm leading-6 text-blue-950"><CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-1" /><span>{point}</span></li>)}</ul>
                    </div>
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                      <p className="text-xs font-black uppercase tracking-wider text-rose-700">Common mistakes</p>
                      <ul className="mt-3 space-y-2">{currentModule.mistakes.map((point) => <li key={point} className="flex gap-2 text-sm leading-6 text-rose-950"><Circle className="w-4 h-4 text-rose-500 shrink-0 mt-1" /><span>{point}</span></li>)}</ul>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-black uppercase tracking-wider text-slate-600">Module deliverable</p><p className="mt-3 text-sm leading-6 text-slate-800">{currentModule.deliverable}</p></div>
                  </div>

                  {moduleVideos.length > 0 && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2"><Video className="w-5 h-5" /><h3 className="font-black">Watch inside DRIGHT</h3></div>
                      {moduleVideos.map((video) => (
                        <div key={video.url} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 md:p-4">
                          <VideoPlayer url={video.url} title={video.title} />
                          <div className="pt-3"><div className="flex flex-wrap gap-2"><span className="text-[10px] font-black uppercase tracking-wider text-slate-500">{video.region || 'English tutorial'}</span></div><p className="font-black text-slate-900">{video.title}</p><p className="text-sm text-slate-500 mt-1">{video.description}</p></div>
                        </div>
                      ))}
                    </div>
                  )}

                  {lessonVisuals.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3"><Images className="w-5 h-5" /><h3 className="font-black">Visual reference</h3></div>
                      <div className="grid md:grid-cols-2 gap-4">
                        {lessonVisuals.map((visual) => (
                          <figure key={visual.sourceUrl} className="rounded-2xl overflow-hidden border border-slate-200 bg-white">
                            {visual.videoUrl ? (
                              <video src={visual.videoUrl} poster={visual.imageUrl} controls playsInline preload="metadata" className="w-full aspect-video object-cover bg-black" />
                            ) : (
                              <img src={visual.imageUrl} alt={visual.title} className="w-full aspect-[4/3] object-cover" loading="lazy" />
                            )}
                            <figcaption className="p-3"><p className="font-black text-sm text-slate-900">{visual.title}</p><p className="text-xs text-slate-500 mt-1 leading-5">{visual.caption}</p><a href={visual.sourceUrl} target="_blank" rel="noreferrer" className={'mt-2 inline-flex items-center gap-1 text-xs font-bold ' + colors.text}>{visual.sourceLabel}<ExternalLink className="w-3 h-3" /></a></figcaption>
                          </figure>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className={'rounded-2xl border p-5 ' + colors.border + ' ' + colors.soft}>
                    <div className="flex items-center gap-2"><Target className={'w-5 h-5 ' + colors.text} /><h3 className="font-black">Practice challenge</h3></div>
                    <p className="mt-2 text-sm md:text-base leading-7 text-slate-800">{currentLesson.action}</p>
                  </div>

                  <div className="rounded-2xl border border-violet-200 bg-violet-50/70 p-5">
                    <div className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-violet-700" /><h3 className="font-black">Quick knowledge check</h3></div>
                    <p className="mt-3 font-bold text-slate-900">{check.prompt}</p>
                    <div className="mt-3 grid gap-2">
                      {check.choices.map((choice, index) => {
                        const selected = selectedAnswer === index;
                        const correct = checkedAnswer && index === check.answer;
                        const wrong = checkedAnswer && selected && index !== check.answer;
                        return <button key={choice} onClick={() => !checkedAnswer && setSelectedAnswer(index)} className={'text-left rounded-xl border px-4 py-3 text-sm font-semibold ' + (correct ? 'border-emerald-400 bg-emerald-100' : wrong ? 'border-rose-300 bg-rose-100' : selected ? 'border-violet-400 bg-white' : 'border-violet-100 bg-white')}>{choice}</button>;
                      })}
                    </div>
                    {!checkedAnswer ? <button disabled={selectedAnswer === null} onClick={() => setCheckedAnswer(true)} className="mt-3 min-h-[42px] rounded-xl bg-violet-700 text-white px-4 text-sm font-black disabled:opacity-40">Check my answer</button> : <div className="mt-3 rounded-xl bg-white border border-violet-100 p-3 text-sm leading-6"><strong>{selectedAnswer === check.answer ? 'Correct. ' : 'Not quite. '}</strong>{check.explanation}</div>}
                  </div>

                  <div className="rounded-2xl border border-slate-200 p-5">
                    <div className="flex items-center gap-2"><FileText className="w-5 h-5 text-slate-500" /><h3 className="font-black">Your lesson notes</h3></div>
                    <textarea rows={5} value={notes[currentKey] || ''} onChange={(e) => persistNotes({ ...notes, [currentKey]: e.target.value })} placeholder="Write what you learned, what you want to test, questions, results, or ideas…" className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm leading-6 outline-none focus:border-primary-500 resize-y" />
                  </div>
                </div>
              </motion.section>
            </AnimatePresence>

            {activeModule === config.modules.length - 1 && (
              <section className="rounded-3xl bg-slate-950 text-white p-5 md:p-7">
                <div className="flex items-center gap-2 text-amber-300"><Trophy className="w-5 h-5" /><h3 className="font-black">Capstone project</h3></div>
                <p className="mt-3 text-sm md:text-base leading-7 text-slate-200">{currentModule.deliverable}</p>
              </section>
            )}

            <section className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5">
              <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                <button onClick={goPrevious} disabled={activeModule === 0 && activeLesson === 0} className="min-h-[46px] rounded-xl border border-slate-200 px-4 text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-30"><ChevronLeft className="w-4 h-4" /> Previous</button>
                <div className="text-center"><p className="text-xs text-slate-400">Lesson {currentNumber} of {lessons.length}</p><p className="text-sm font-black">{completed[currentKey] ? 'Completed' : 'Ready when you are'}</p></div>
                <button onClick={completeAndContinue} className={'min-h-[46px] rounded-xl px-4 text-sm font-black text-white inline-flex items-center justify-center gap-2 ' + colors.solid}>{completed[currentKey] ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}{isLastLesson ? 'Complete course' : 'Complete & continue'}{!isLastLesson && <ChevronRight className="w-4 h-4" />}</button>
              </div>
            </section>

            {config.downloads.length > 0 && (
              <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex items-center gap-2"><FileDown className="w-5 h-5" /><h3 className="font-black">Downloads & tools</h3></div>
                <div className="mt-3 grid sm:grid-cols-2 gap-2">
                  {config.downloads.map((item) => <a key={item.href} href={item.href} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 flex items-center justify-between gap-3"><span><span className="block text-sm font-bold">{item.label}</span><span className="text-[11px] text-slate-400">{item.type}</span></span><FileDown className="w-4 h-4 text-slate-400" /></a>)}
                </div>
              </section>
            )}

            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="font-black">Official reference library</h3>
              <div className="mt-3 grid sm:grid-cols-2 gap-2">{config.references.map((ref) => <a key={ref.url} href={ref.url} target="_blank" rel="noreferrer" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-left"><span className="block text-sm font-bold">{ref.label}</span><span className="block mt-1 text-xs leading-5 text-slate-500">{ref.summary}</span></a>)}</div>
            </section>
          </main>
        </div>
      </div>

      <AnimatePresence>
        {outlineOpen && (
          <motion.div className="fixed inset-0 z-[90] lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <button aria-label="Close" onClick={() => setOutlineOpen(false)} className="absolute inset-0 bg-slate-950/60" />
            <motion.div initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} className="absolute inset-y-0 left-0 w-[88%] max-w-sm bg-white overflow-y-auto">
              <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between"><div><p className="font-black">Course outline</p><p className="text-xs text-slate-500">{percent}% complete</p></div><button onClick={() => setOutlineOpen(false)} className="w-9 h-9 rounded-full border flex items-center justify-center"><X className="w-4 h-4" /></button></div>
              <div className="p-3 space-y-3">{config.modules.map((module, moduleIndex) => <div key={module.title} className="rounded-2xl border p-2"><p className="px-2 py-2 text-xs font-black">{module.title}</p>{module.lessons.map((lesson, lessonIndex) => <button key={lesson.title} onClick={() => goToLesson(moduleIndex, lessonIndex)} className={'w-full rounded-xl px-3 py-2.5 text-left text-xs flex gap-2 ' + (moduleIndex === activeModule && lessonIndex === activeLesson ? colors.solid + ' text-white' : 'bg-slate-50')}><span>{lesson.title}</span></button>)}</div>)}</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {mediaOpen && (
          <motion.div className="fixed inset-0 z-[95] bg-slate-950/75 p-3 md:p-8 overflow-y-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="max-w-4xl mx-auto bg-white rounded-3xl overflow-hidden shadow-2xl">
              <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between"><div><p className="font-black">Course media library</p><p className="text-xs text-slate-500">Tutorials play inside DRIGHT.</p></div><button onClick={() => setMediaOpen(false)} className="w-9 h-9 rounded-full border flex items-center justify-center"><X className="w-4 h-4" /></button></div>
              <div className="p-4 md:p-6 space-y-8">
                <div className="space-y-6">
                  {config.videos.map((video) => <div key={video.url}><VideoPlayer url={video.url} title={video.title} /><p className="mt-3 font-black">{video.title}</p><p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mt-1">{video.region || 'English tutorial'}</p><p className="text-sm text-slate-500 mt-1">{video.description}</p></div>)}
                </div>
                {config.visuals.length > 0 && (
                  <div className="border-t border-slate-200 pt-6">
                    <div className="flex items-center gap-2"><Images className="w-5 h-5" /><h3 className="font-black">Stock visual & demonstration library</h3></div>
                    <p className="text-xs text-slate-500 mt-1">These real-world visual references support the lessons; they are not endorsements by the platforms shown.</p>
                    <div className="mt-4 grid md:grid-cols-2 gap-4">
                      {config.visuals.map((visual) => (
                        <figure key={visual.sourceUrl} className="rounded-2xl overflow-hidden border border-slate-200 bg-slate-50">
                          {visual.videoUrl ? (
                            <video src={visual.videoUrl} poster={visual.imageUrl} controls playsInline preload="metadata" className="w-full aspect-video object-cover bg-black" />
                          ) : (
                            <img src={visual.imageUrl} alt={visual.title} className="w-full aspect-[4/3] object-cover" loading="lazy" />
                          )}
                          <figcaption className="p-3">
                            <p className="font-black text-sm">{visual.title}</p>
                            <p className="text-xs leading-5 text-slate-500 mt-1">{visual.caption}</p>
                            <a href={visual.sourceUrl} target="_blank" rel="noreferrer" className={'mt-2 inline-flex items-center gap-1 text-xs font-bold ' + colors.text}>{visual.sourceLabel}<ExternalLink className="w-3 h-3" /></a>
                          </figcaption>
                        </figure>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {tourOpen && (
          <motion.div className="fixed inset-0 z-[100] bg-slate-950/75 p-4 flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
              <div className="flex items-center justify-between"><span className={'text-xs font-black uppercase tracking-wider ' + colors.text}>Course tour {tourStep + 1}/{tourSteps.length}</span><button onClick={() => setTourOpen(false)} className="w-9 h-9 rounded-full border flex items-center justify-center"><X className="w-4 h-4" /></button></div>
              <Compass className={'w-10 h-10 mt-6 ' + colors.text} />
              <h3 className="mt-4 text-2xl font-black">{tourSteps[tourStep][0]}</h3>
              <p className="mt-3 text-sm leading-7 text-slate-600">{tourSteps[tourStep][1]}</p>
              <div className="mt-6 flex gap-2"><button disabled={tourStep === 0} onClick={() => setTourStep((s) => Math.max(0, s - 1))} className="min-h-[44px] rounded-xl border px-4 font-bold disabled:opacity-30">Back</button><button onClick={() => tourStep === tourSteps.length - 1 ? setTourOpen(false) : setTourStep((s) => s + 1)} className={'flex-1 min-h-[44px] rounded-xl text-white font-black ' + colors.solid}>{tourStep === tourSteps.length - 1 ? 'Start learning' : 'Next'}</button></div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
