import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, CheckCircle2, ChevronLeft, ChevronRight, Circle, Compass, FileText, GraduationCap, List, Lock, Menu, PlayCircle, RotateCcw, Sparkles, Target, Trophy, Video, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { AnimatePresence, motion } from 'framer-motion';
import VideoPlayer from '../components/VideoPlayer';
import { startDrightTour } from '../tours/tourDefinitions';

const COURSE_SLUG = 'facebook-instagram-ads-mastery-2026';

type Lesson = { title: string; brief: string; action: string };
type Module = { title: string; lessons: Lesson[] };

const modules: Module[] = [
  { title: '1. Meta advertising foundations', lessons: [
    { title: 'How the Meta ad auction works', brief: 'Understand objectives, estimated action rates, ad quality and why the cheapest click is not always the best business result.', action: 'Write the single business outcome your next campaign must produce.' },
    { title: 'Funnel thinking before Ads Manager', brief: 'Map awareness, consideration and conversion so every ad has one job.', action: 'Sketch a three-stage funnel for one real product or service.' },
    { title: 'Metrics that matter', brief: 'Learn CPM, CTR, CPC, CVR, CPA, AOV and ROAS, and how they connect.', action: 'Calculate break-even CPA for one offer.' },
  ]},
  { title: '2. Account, assets and security', lessons: [
    { title: 'Business Portfolio and ad account setup', brief: 'Organize pages, Instagram accounts, pixels, people and permissions cleanly.', action: 'Create an asset checklist before spending.' },
    { title: 'Payment method and billing controls', brief: 'Set budgets, billing access and backup payment processes without sharing credentials.', action: 'Document who can access billing and why.' },
    { title: 'Security and recovery', brief: 'Use two-factor authentication, least-privilege access and account recovery preparation.', action: 'Enable 2FA for every administrator.' },
  ]},
  { title: '3. Offer and audience research', lessons: [
    { title: 'Build an offer people understand fast', brief: 'Turn features into a clear promise, proof, price context and call to action.', action: 'Rewrite your offer in one sentence.' },
    { title: 'Customer research', brief: 'Collect pains, desired outcomes, objections and language from real customer conversations.', action: 'List 10 exact customer phrases.' },
    { title: 'Competitor research with Meta Ad Library', brief: 'Study active ads for concepts, formats, hooks and landing-page patterns without copying creative.', action: 'Save five patterns and explain why each may work.' },
  ]},
  { title: '4. Campaign objectives and structure', lessons: [
    { title: 'Choosing the right objective', brief: 'Match Awareness, Traffic, Engagement, Leads, App promotion or Sales to the actual conversion you need.', action: 'Choose one objective and state why.' },
    { title: 'Campaign, ad set and ad hierarchy', brief: 'Know which decisions belong at each level so testing remains readable.', action: 'Design one campaign with two ad sets and three creatives each.' },
    { title: 'When to simplify', brief: 'Avoid unnecessary fragmentation that starves ad sets of learning data.', action: 'Remove one redundant segmentation idea from your plan.' },
  ]},
  { title: '5. Audiences', lessons: [
    { title: 'Broad targeting', brief: 'Use broad audiences when your offer, conversion signal and creative can do more of the targeting work.', action: 'Build one broad audience hypothesis.' },
    { title: 'Interest and demographic targeting', brief: 'Use interests deliberately when they add information instead of creating tiny audiences.', action: 'Create one focused interest stack.' },
    { title: 'Custom and lookalike audiences', brief: 'Plan warm-audience retargeting and source-based lookalikes from quality customer signals.', action: 'List every first-party audience source you own.' },
  ]},
  { title: '6. Facebook and Instagram placements', lessons: [
    { title: 'Feeds', brief: 'Design for fast comprehension, strong first-frame communication and mobile reading.', action: 'Create one 4:5 feed concept.' },
    { title: 'Stories', brief: 'Use vertical creative, safe zones and direct response sequencing for short attention windows.', action: 'Storyboard a three-frame Story ad.' },
    { title: 'Reels', brief: 'Use native-feeling 9:16 video, early motion, captions and creator-style delivery.', action: 'Write a 15-second Reel script.' },
    { title: 'Placement strategy', brief: 'Understand automatic placements versus manual exclusions and when evidence should drive changes.', action: 'Document which placements you would exclude only after data proves it.' },
  ]},
  { title: '7. Creative strategy', lessons: [
    { title: 'Hooks', brief: 'Earn attention with specificity, tension, relevance, novelty or a strong visual pattern break.', action: 'Write 20 hooks for one offer.' },
    { title: 'Angles and concepts', brief: 'Separate the customer angle from the execution so you can test ideas systematically.', action: 'Create five distinct concepts, not five tiny variations.' },
    { title: 'Copywriting', brief: 'Write clear primary text, headline and CTA combinations that match awareness level.', action: 'Write short, medium and long copy for the same offer.' },
    { title: 'Phone-first production', brief: 'Shoot usable ads with a smartphone using clean audio, readable framing, strong lighting and fast editing.', action: 'Produce one raw 20-second vertical creative.' },
  ]},
  { title: '8. Leads and messaging funnels', lessons: [
    { title: 'Instant forms', brief: 'Balance lead volume with qualification so cheap leads do not become expensive follow-up.', action: 'Draft five qualifying questions.' },
    { title: 'Click-to-message and WhatsApp', brief: 'Design the handoff from ad to conversation with a clear opening message and response process.', action: 'Write the first four WhatsApp replies.' },
    { title: 'Follow-up speed and lead handling', brief: 'Treat lead response as part of advertising economics, not a separate problem.', action: 'Create a 24-hour follow-up sequence.' },
  ]},
  { title: '9. Tracking and measurement', lessons: [
    { title: 'Meta Pixel concepts', brief: 'Understand browser events, standard events, parameters and what a clean event map looks like.', action: 'Map ViewContent, AddToCart and Purchase for a sample store.' },
    { title: 'Conversions API concepts', brief: 'Understand server-side event delivery, deduplication and why better signal quality matters.', action: 'List the events your backend should send.' },
    { title: 'Attribution and reporting', brief: 'Read results as modeled evidence rather than perfect ground truth and compare against business records.', action: 'Define your source of truth for revenue.' },
  ]},
  { title: '10. Budgeting and bidding', lessons: [
    { title: 'Test-budget planning', brief: 'Set a budget that can produce enough conversion opportunities to evaluate a hypothesis.', action: 'Estimate a seven-day test budget from target CPA.' },
    { title: 'Campaign versus ad-set budget', brief: 'Choose budget control based on whether Meta or you should decide spend allocation during the test.', action: 'Pick one structure and document the reason.' },
    { title: 'Bid controls', brief: 'Understand when cost controls can help and when they can simply restrict delivery.', action: 'Define the condition that would justify a bid control.' },
  ]},
  { title: '11. Diagnosis and optimization', lessons: [
    { title: 'Read the funnel in order', brief: 'Diagnose delivery, attention, click quality, landing-page conversion and economics instead of reacting to one metric.', action: 'Create your own diagnosis checklist.' },
    { title: 'Creative fatigue', brief: 'Watch frequency, declining response and concept saturation, then refresh the idea rather than only changing colors.', action: 'Plan three replacement concepts.' },
    { title: 'Landing-page mismatch', brief: 'Make ad promise, page headline, proof, offer and CTA tell one continuous story.', action: 'Compare your ad headline with your landing-page headline.' },
  ]},
  { title: '12. Testing system', lessons: [
    { title: 'Hypothesis-driven tests', brief: 'State what changes, what remains controlled, what metric decides the test and what action follows.', action: 'Write three test hypotheses.' },
    { title: 'Creative test matrix', brief: 'Test concepts, hooks, creators, formats and offers in a trackable matrix.', action: 'Build your next 12-creative matrix.' },
    { title: 'Decision windows', brief: 'Avoid killing ads too early while still protecting spend with pre-defined stop rules.', action: 'Write stop, continue and scale rules before launch.' },
  ]},
  { title: '13. Retargeting and lifecycle', lessons: [
    { title: 'Warm audiences', brief: 'Retarget meaningful site, video, social and customer interactions without over-serving tiny pools.', action: 'Create a 7-day and 30-day warm-audience plan.' },
    { title: 'Message sequencing', brief: 'Change the message as the buyer gains awareness instead of repeating the same ad.', action: 'Write cold, warm and hot versions of one message.' },
    { title: 'Existing-customer campaigns', brief: 'Use customer lists for cross-sell, replenishment, launches and exclusions.', action: 'Choose one post-purchase campaign.' },
  ]},
  { title: '14. Scaling responsibly', lessons: [
    { title: 'Vertical scaling', brief: 'Increase budget with an eye on marginal CPA and delivery stability.', action: 'Define a maximum acceptable CPA before increasing spend.' },
    { title: 'Horizontal scaling', brief: 'Expand through new concepts, audiences, geographies, offers or placements without cloning chaos.', action: 'List four independent scale levers.' },
    { title: 'Protecting unit economics', brief: 'Scale contribution profit, not screenshot metrics.', action: 'Calculate contribution margin after ad spend.' },
  ]},
  { title: '15. Policy, capstone and operating rhythm', lessons: [
    { title: 'Advertising standards', brief: 'Review Meta policies, restricted categories, claims, landing-page quality and account health before launch.', action: 'Run a policy review on your strongest ad.' },
    { title: 'Capstone campaign', brief: 'Build one complete campaign plan: research, objective, audience, six creatives, budget, tracking, KPI targets and optimization rules.', action: 'Complete the capstone before marking the course finished.' },
    { title: '90-day operating plan', brief: 'Create a repeatable weekly rhythm for research, production, launch, analysis and creative replacement.', action: 'Schedule your next four creative drops.' },
  ]},
];


const embeddedVideos = [
  {
    module: 0,
    title: '2026 Meta Ads walkthrough',
    url: 'https://www.youtube.com/watch?v=gV0J-pWJDVk',
    description: 'A practical walkthrough to connect the concepts in the foundations module with the current Meta Ads workflow.',
  },
  {
    module: 6,
    title: 'Phone-first Meta Ads tutorial',
    url: 'https://www.youtube.com/watch?v=pIawYyNGZ-E',
    description: 'Use this while working through creative strategy and phone-first production.',
  },
  {
    module: 6,
    title: 'Creative testing walkthrough',
    url: 'https://www.youtube.com/watch?v=QCZoeGUr9vc',
    description: 'A companion walkthrough for creative testing, iteration and deciding what to test next.',
  },
];

const officialReferences = [
  {
    label: 'Meta Blueprint — Ads Manager learning path',
    url: 'https://metaspark.facebookblueprint.com/student/collection/507005-meta-ads-manager-learning',
  },
  {
    label: 'Meta Blueprint — Get started with Meta Ads Manager',
    url: 'https://www.facebookblueprint.com/student/path/515321-get-started-with-meta-ads-manager',
  },
  {
    label: 'Meta Blueprint — Campaign activation tools and Advantage+',
    url: 'https://www.facebookblueprint.com/student/path/253164-ads-business-manager-course',
  },
  {
    label: 'Meta for Business — Facebook & Instagram Reels Ads',
    url: 'https://www.facebook.com/business/ads/facebook-instagram-reels-ads',
  },
  {
    label: 'Meta Ad Library',
    url: 'https://www.facebook.com/ads/library/',
  },
];

const moduleIntros = [
  'Stop thinking of ads as a boost button. This module gives you the business logic behind the auction, funnels and the numbers that tell you whether a campaign is healthy.',
  'Before spending money, protect the account. You will organize assets, permissions, billing and recovery so one mistake does not lock you out of your advertising operation.',
  'Good targeting cannot rescue a weak offer. Here you learn to research the customer, sharpen the offer and study the market without copying competitors.',
  'Campaign structure should make decisions easier, not create more noise. This module shows how objectives, campaigns, ad sets and ads fit together.',
  'Audience strategy is about giving Meta enough useful signal while keeping your hypothesis clear. You will compare broad, interest, custom and lookalike approaches.',
  'The same idea behaves differently in Feed, Stories and Reels. You will learn how placement changes framing, pacing and creative requirements.',
  'Creative is where strategy becomes visible. You will build hooks, angles, copy and phone-first production habits that can be tested instead of guessed.',
  'Leads are only valuable when the handoff works. You will design forms, WhatsApp conversations and follow-up systems that protect lead quality.',
  'Tracking is your measurement system. You will learn the role of Pixel, Conversions API, attribution and a practical source of truth for business results.',
  'Budget is not just how much you can spend. You will learn how to set test budgets, choose budget control and understand when bid controls help or restrict delivery.',
  'Launch is the start of analysis, not the finish line. This module teaches a calm workflow for reading delivery, diagnosing weak points and avoiding panic edits.',
  'Testing works when each experiment answers a question. You will learn to isolate variables, read creative performance and turn results into the next test.',
  'Retargeting should respond to intent, not follow everybody forever. You will structure warm audiences, exclusions, post-purchase messaging and timing.',
  'Scaling is not simply increasing budget. You will learn several scale levers while protecting contribution margin and campaign stability.',
  'The final module turns the course into an operating system: policy review, a capstone campaign and a repeatable 90-day rhythm for research, production and analysis.',
];

const moduleChecks = [
  { question: 'Which metric tells you the maximum acquisition cost your offer can tolerate before the sale becomes unprofitable?', choices: ['Break-even CPA', 'CPM', 'Reach'], answer: 0, explanation: 'Break-even CPA connects advertising cost to your unit economics. CPM and reach describe delivery, not whether the sale is profitable.' },
  { question: 'What is the safest default for people who only need limited Business Portfolio access?', choices: ['Give everyone admin access', 'Use least-privilege permissions', 'Share one login'], answer: 1, explanation: 'Least-privilege permissions reduce account and billing risk while still giving each person the access needed for their role.' },
  { question: 'What should come before choosing interests in Ads Manager?', choices: ['Customer and offer research', 'Increasing budget', 'Duplicating ad sets'], answer: 0, explanation: 'Audience settings are downstream of the offer and customer insight. Research gives the creative and targeting something useful to work with.' },
  { question: 'Why should campaign structure stay as simple as the test allows?', choices: ['To hide weak ads', 'To reduce unnecessary fragmentation', 'To avoid tracking results'], answer: 1, explanation: 'Excessive fragmentation spreads budget and learning signals across too many ad sets, making results harder to interpret.' },
  { question: 'When can broad targeting be a strong option?', choices: ['When creative, offer and conversion signals are strong', 'Only when there is no Pixel', 'Only for tiny budgets'], answer: 0, explanation: 'Broad targeting can work well when Meta has useful conversion signals and the creative and offer clearly attract the intended customer.' },
  { question: 'What should change first when adapting a Feed concept to Reels?', choices: ['The business goal', 'The vertical framing and opening seconds', 'The product price'], answer: 1, explanation: 'Reels needs native vertical framing and immediate attention. The business goal can stay the same while execution changes for the placement.' },
  { question: 'What is a useful creative test?', choices: ['Ten almost identical ads', 'A clear hypothesis with meaningfully different concepts', 'Changing everything at once'], answer: 1, explanation: 'A good test lets you learn why one idea performed differently. Meaningful concepts and controlled variables make the result actionable.' },
  { question: 'What can turn cheap leads into an expensive campaign?', choices: ['Slow or poor follow-up', 'Using qualifying questions', 'Tracking lead source'], answer: 0, explanation: 'Lead cost alone is not the outcome. Slow follow-up and weak handling can destroy value after the ad already paid to acquire the lead.' },
  { question: 'What should be your revenue source of truth?', choices: ['Only Ads Manager', 'A defined business record reconciled with platform reporting', 'Only impressions'], answer: 1, explanation: 'Platform attribution is useful but modeled. Your business records should be the source of truth and reconciled with advertising reports.' },
  { question: 'What should influence a seven-day test budget?', choices: ['Target CPA and enough conversion opportunities', 'A random round number', 'Competitor follower count'], answer: 0, explanation: 'A test needs enough budget to create a reasonable number of opportunities to observe the behavior you are measuring.' },
  { question: 'What is usually better than making several panic edits after a few hours?', choices: ['Read the delivery and conversion chain first', 'Duplicate everything immediately', 'Turn off tracking'], answer: 0, explanation: 'Diagnose where the funnel is failing before changing variables. Fast, unstructured edits make the next result harder to interpret.' },
  { question: 'Why keep a testing log?', choices: ['To remember hypotheses and outcomes', 'To increase CPM', 'To hide losing ads'], answer: 0, explanation: 'A testing log turns experiments into accumulated knowledge so the next creative decision is based on evidence rather than memory.' },
  { question: 'What is a good retargeting habit?', choices: ['Never exclude purchasers', 'Match message to intent and use exclusions', 'Show the same ad forever'], answer: 1, explanation: 'Retargeting should reflect what the person already did and exclude people who should move to another stage of the customer journey.' },
  { question: 'What should you watch while scaling?', choices: ['Only total spend', 'Marginal CPA and contribution profit', 'Only likes'], answer: 1, explanation: 'Scaling is healthy when additional spend still produces acceptable economics. Total spend by itself does not tell you that.' },
  { question: 'What makes the capstone valuable?', choices: ['It combines research, creative, tracking and economics into one operating plan', 'It removes the need to test', 'It guarantees revenue'], answer: 0, explanation: 'The capstone forces the pieces to work together. It does not guarantee an outcome; it gives you a repeatable process for making better decisions.' },
];

export default function CourseMetaAdsPage() {
  const { user } = useAuth();
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [productId, setProductId] = useState('');
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [activeModule, setActiveModule] = useState(0);
  const [activeLesson, setActiveLesson] = useState(0);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [referenceOpen, setReferenceOpen] = useState<{ label: string; url: string } | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [checkedAnswer, setCheckedAnswer] = useState(false);

  const lessons = useMemo(
    () => modules.flatMap((module, moduleIndex) =>
      module.lessons.map((lesson, lessonIndex) => ({
        ...lesson,
        key: String(moduleIndex) + '-' + String(lessonIndex),
        module: module.title,
        moduleIndex,
        lessonIndex,
      })),
    ),
    [],
  );

  const currentModule = modules[activeModule] || modules[0];
  const currentLesson = currentModule.lessons[activeLesson] || currentModule.lessons[0];
  const currentKey = String(activeModule) + '-' + String(activeLesson);
  const doneCount = lessons.filter((lesson) => completed[lesson.key]).length;
  const percent = lessons.length ? Math.round((doneCount / lessons.length) * 100) : 0;
  const currentNumber = lessons.findIndex((lesson) => lesson.key === currentKey) + 1;
  const moduleVideos = embeddedVideos.filter((video) => video.module === activeModule);
  const moduleDone = currentModule.lessons.filter((_, index) => completed[String(activeModule) + '-' + String(index)]).length;
  const modulePercent = Math.round((moduleDone / Math.max(1, currentModule.lessons.length)) * 100);
  const isLastLesson = activeModule === modules.length - 1 && activeLesson === currentModule.lessons.length - 1;

  useEffect(() => {
    if (!user?.id) return;
    const progressKey = 'dright-course-progress:' + COURSE_SLUG + ':' + user.id;
    const notesKey = 'dright-course-notes:' + COURSE_SLUG + ':' + user.id;
    try { setCompleted(JSON.parse(localStorage.getItem(progressKey) || '{}')); } catch { setCompleted({}); }
    try { setNotes(JSON.parse(localStorage.getItem(notesKey) || '{}')); } catch { setNotes({}); }
  }, [user?.id]);

  useEffect(() => {
    const check = async () => {
      if (!user?.id) {
        setChecking(false);
        return;
      }
      setChecking(true);
      const { data } = await supabase.rpc('get_public_dright_official_products');
      const items = Array.isArray(data) ? data : [];
      const course = items.find((item: any) => item.slug === COURSE_SLUG);
      if (!course?.marketplace_product_id) {
        setChecking(false);
        return;
      }
      setProductId(String(course.marketplace_product_id));
      const { data: order } = await supabase
        .from('orders')
        .select('id')
        .eq('product_id', course.marketplace_product_id)
        .eq('buyer_id', user.id)
        .eq('status', 'COMPLETED')
        .limit(1)
        .maybeSingle();
      setAllowed(Boolean(order));
      setChecking(false);
    };
    void check();
  }, [user?.id]);

  useEffect(() => {
    setSelectedAnswer(null);
    setCheckedAnswer(false);
  }, [activeModule, activeLesson]);

  const persistCompleted = (next: Record<string, boolean>) => {
    setCompleted(next);
    if (!user?.id) return;
    localStorage.setItem('dright-course-progress:' + COURSE_SLUG + ':' + user.id, JSON.stringify(next));
  };

  const persistNotes = (next: Record<string, string>) => {
    setNotes(next);
    if (!user?.id) return;
    localStorage.setItem('dright-course-notes:' + COURSE_SLUG + ':' + user.id, JSON.stringify(next));
  };

  const goToLesson = (moduleIndex: number, lessonIndex: number) => {
    setActiveModule(moduleIndex);
    setActiveLesson(lessonIndex);
    setOutlineOpen(false);
    window.setTimeout(() => workspaceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
  };

  const goNext = () => {
    if (activeLesson < currentModule.lessons.length - 1) {
      goToLesson(activeModule, activeLesson + 1);
      return;
    }
    if (activeModule < modules.length - 1) {
      goToLesson(activeModule + 1, 0);
    }
  };

  const goPrevious = () => {
    if (activeLesson > 0) {
      goToLesson(activeModule, activeLesson - 1);
      return;
    }
    if (activeModule > 0) {
      goToLesson(activeModule - 1, modules[activeModule - 1].lessons.length - 1);
    }
  };

  const completeAndContinue = () => {
    if (!completed[currentKey]) {
      persistCompleted({ ...completed, [currentKey]: true });
    }
    if (!isLastLesson) goNext();
  };

  const resetProgress = () => {
    if (!user?.id) return;
    localStorage.removeItem('dright-course-progress:' + COURSE_SLUG + ':' + user.id);
    setCompleted({});
    goToLesson(0, 0);
  };

  if (checking) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl bg-primary-50 flex items-center justify-center mx-auto animate-pulse">
            <GraduationCap className="w-6 h-6 text-primary-600" />
          </div>
          <p className="text-gray-500 mt-3">Preparing your course workspace…</p>
        </div>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gray-100 mx-auto flex items-center justify-center"><Lock className="w-7 h-7 text-gray-500" /></div>
        <h1 className="text-2xl font-black text-gray-900 mt-5">Course access locked</h1>
        <p className="text-gray-600 mt-2">Purchase Facebook & Instagram Ads Mastery 2026 from the Official DRIGHT Store to unlock the learning workspace.</p>
        <div className="mt-6 flex gap-3 justify-center">
          {productId && <Link to={'/product/' + productId} className="px-5 py-3 rounded-xl bg-primary-600 text-white font-bold">View product</Link>}
          <Link to="/dright/store" className="px-5 py-3 rounded-xl border border-gray-200 font-bold text-gray-700">Official Store</Link>
        </div>
      </div>
    );
  }

  const check = moduleChecks[activeModule];

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <section data-tour="course-hero" className="relative overflow-hidden bg-slate-950 text-white">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900/40 via-slate-950 to-fuchsia-950/30" />
        <div className="absolute -right-24 -top-24 w-72 h-72 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="relative max-w-7xl mx-auto px-4 py-7 md:py-10">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2 text-xs font-black tracking-[0.18em] uppercase text-blue-200">
                <span>DRIGHT Course 001</span>
                <span className="w-1 h-1 rounded-full bg-blue-300" />
                <span>2026 Edition</span>
              </div>
              <h1 className="mt-3 text-3xl md:text-5xl font-black leading-tight">Facebook & Instagram Ads Mastery</h1>
              <p className="mt-4 text-sm md:text-base leading-7 text-slate-300 max-w-2xl">
                Have you ever launched an ad, watched money spend, and still struggled to understand where the sales went?
                This course is built to replace guesswork with a step-by-step system: offer, audience, creative, tracking, testing and responsible scaling.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold">{modules.length} modules</span>
                <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold">{lessons.length} lessons</span>
                <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold">{embeddedVideos.length} embedded videos</span>
                <span className="rounded-full bg-emerald-400/15 text-emerald-200 px-3 py-1.5 text-xs font-bold">Buyer-only access</span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:flex gap-2">
              <button
                type="button"
                onClick={() => startDrightTour('meta_ads_course')}
                className="min-h-[44px] rounded-xl bg-white text-slate-950 px-4 text-sm font-black inline-flex items-center justify-center gap-2"
              >
                <Compass className="w-4 h-4" /> Course tour
              </button>
              <button
                type="button"
                onClick={() => setMediaOpen(true)}
                className="min-h-[44px] rounded-xl bg-white/10 border border-white/15 px-4 text-sm font-bold inline-flex items-center justify-center gap-2"
              >
                <PlayCircle className="w-4 h-4" /> Media library
              </button>
            </div>
          </div>

          <div data-tour="course-progress" className="mt-7 grid md:grid-cols-[1fr_auto] gap-4 items-center rounded-2xl border border-white/10 bg-white/5 p-4">
            <div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black">Your course progress</p>
                  <p className="text-xs text-slate-400 mt-0.5">{doneCount} of {lessons.length} lessons completed</p>
                </div>
                <span className="text-2xl font-black">{percent}%</span>
              </div>
              <div className="mt-3 h-2.5 rounded-full bg-white/10 overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-blue-400 to-fuchsia-400"
                  animate={{ width: String(percent) + '%' }}
                  transition={{ duration: 0.45 }}
                />
              </div>
            </div>
            <button type="button" onClick={resetProgress} className="text-xs font-bold text-slate-300 inline-flex items-center gap-1.5 hover:text-white">
              <RotateCcw className="w-3.5 h-3.5" /> Reset progress
            </button>
          </div>
        </div>
      </section>

      <div ref={workspaceRef} className="max-w-7xl mx-auto px-4 py-6">
        <div className="lg:hidden mb-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setOutlineOpen(true)}
            className="min-h-[46px] rounded-xl border border-slate-200 bg-white px-3 text-sm font-black inline-flex items-center justify-center gap-2"
          >
            <Menu className="w-4 h-4" /> Course outline
          </button>
          <div className="min-h-[46px] rounded-xl border border-slate-200 bg-white px-3 flex items-center justify-center text-xs font-bold text-slate-600">
            Lesson {currentNumber} of {lessons.length}
          </div>
        </div>

        <div className="grid lg:grid-cols-[330px_minmax(0,1fr)] gap-6 items-start">
          <aside data-tour="course-outline" className="hidden lg:block sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="p-4 border-b border-slate-100 sticky top-0 bg-white z-10">
              <div className="flex items-center gap-2">
                <List className="w-4 h-4 text-primary-600" />
                <h2 className="font-black text-slate-950">Course outline</h2>
              </div>
              <p className="text-xs text-slate-500 mt-1">Work through one lesson at a time. Your progress is saved on this device.</p>
            </div>
            <div className="p-2">
              {modules.map((module, moduleIndex) => {
                const completedInModule = module.lessons.filter((_, lessonIndex) => completed[String(moduleIndex) + '-' + String(lessonIndex)]).length;
                const active = moduleIndex === activeModule;
                return (
                  <div key={module.title} className="mb-2">
                    <button
                      type="button"
                      onClick={() => goToLesson(moduleIndex, 0)}
                      className={'w-full text-left rounded-xl px-3 py-3 transition ' + (active ? 'bg-primary-50 ring-1 ring-primary-100' : 'hover:bg-slate-50')}
                    >
                      <div className="flex items-start gap-3">
                        <div className={'w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ' + (active ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-600')}>
                          {moduleIndex + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={'text-xs font-black leading-5 ' + (active ? 'text-primary-900' : 'text-slate-800')}>{module.title.replace(/^[0-9]+\.\s*/, '')}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">{completedInModule}/{module.lessons.length} complete</p>
                        </div>
                      </div>
                    </button>
                    {active && (
                      <div className="mt-1 ml-5 border-l border-primary-100 pl-3 space-y-1">
                        {module.lessons.map((lesson, lessonIndex) => {
                          const key = String(moduleIndex) + '-' + String(lessonIndex);
                          const lessonActive = lessonIndex === activeLesson;
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => goToLesson(moduleIndex, lessonIndex)}
                              className={'w-full flex items-start gap-2 rounded-lg px-2 py-2 text-left text-xs ' + (lessonActive ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-50')}
                            >
                              {completed[key]
                                ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                                : <Circle className="w-4 h-4 shrink-0 mt-0.5 opacity-40" />}
                              <span className="leading-5">{lesson.title}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </aside>

          <main data-tour="course-lesson" className="min-w-0">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentKey}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.24 }}
                className="space-y-5"
              >
                <section className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                  <div className="p-5 md:p-7 border-b border-slate-100 bg-gradient-to-br from-white to-blue-50/40">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.15em] text-primary-600">
                        <span>Module {activeModule + 1}</span>
                        <span>•</span>
                        <span>Lesson {activeLesson + 1} of {currentModule.lessons.length}</span>
                      </div>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{modulePercent}% module complete</span>
                    </div>
                    <h2 className="mt-3 text-2xl md:text-3xl font-black text-slate-950">{currentLesson.title}</h2>
                    <p className="mt-3 text-sm md:text-base leading-7 text-slate-600">{moduleIntros[activeModule]}</p>
                  </div>

                  <div className="p-5 md:p-7 space-y-6">
                    <div className="grid md:grid-cols-3 gap-3">
                      <div className="rounded-2xl bg-slate-950 text-white p-4 md:col-span-2">
                        <div className="flex items-center gap-2 text-blue-300">
                          <BookOpen className="w-4 h-4" />
                          <p className="text-xs font-black uppercase tracking-wider">Core lesson</p>
                        </div>
                        <p className="mt-3 text-base md:text-lg leading-8 text-slate-100">{currentLesson.brief}</p>
                      </div>
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                        <p className="text-xs font-black uppercase tracking-wider text-amber-700">Why this matters</p>
                        <p className="mt-2 text-sm leading-6 text-amber-950">
                          Every lesson should change a decision you make in a real campaign. Do not rush to the next lesson until you can explain this idea in your own words.
                        </p>
                      </div>
                    </div>

                    {moduleVideos.length > 0 && (
                      <div data-tour="course-video" className="space-y-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <Video className="w-5 h-5 text-primary-600" />
                            <h3 className="font-black text-slate-950">Watch inside DRIGHT</h3>
                          </div>
                          <p className="text-sm text-slate-500 mt-1">These videos play here in the course. You do not need to leave DRIGHT or open YouTube.</p>
                        </div>
                        {moduleVideos.map((video) => (
                          <div key={video.url} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 md:p-4">
                            <VideoPlayer url={video.url} title={video.title} />
                            <div className="pt-3">
                              <p className="font-black text-slate-900">{video.title}</p>
                              <p className="text-sm text-slate-500 mt-1">{video.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                      <div className="flex items-center gap-2">
                        <Target className="w-5 h-5 text-emerald-700" />
                        <h3 className="font-black text-emerald-950">Practice challenge</h3>
                      </div>
                      <p className="mt-2 text-sm md:text-base leading-7 text-emerald-950">{currentLesson.action}</p>
                      <p className="mt-3 text-xs font-bold text-emerald-700">Do the action with a real or sample business before marking this lesson complete.</p>
                    </div>

                    <div data-tour="course-check" className="rounded-2xl border border-violet-200 bg-violet-50/70 p-5">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-violet-700" />
                        <h3 className="font-black text-violet-950">Quick knowledge check</h3>
                      </div>
                      <p className="mt-3 font-bold text-slate-900">{check.question}</p>
                      <div className="mt-3 grid gap-2">
                        {check.choices.map((choice, index) => {
                          const selected = selectedAnswer === index;
                          const correct = checkedAnswer && index === check.answer;
                          const wrong = checkedAnswer && selected && index !== check.answer;
                          return (
                            <button
                              key={choice}
                              type="button"
                              onClick={() => {
                                if (!checkedAnswer) setSelectedAnswer(index);
                              }}
                              className={'text-left rounded-xl border px-4 py-3 text-sm font-semibold transition ' +
                                (correct ? 'border-emerald-400 bg-emerald-100 text-emerald-950' :
                                  wrong ? 'border-rose-300 bg-rose-100 text-rose-950' :
                                    selected ? 'border-violet-400 bg-white text-violet-950' :
                                      'border-violet-100 bg-white text-slate-700 hover:border-violet-300')}
                            >
                              {choice}
                            </button>
                          );
                        })}
                      </div>
                      {!checkedAnswer ? (
                        <button
                          type="button"
                          disabled={selectedAnswer === null}
                          onClick={() => setCheckedAnswer(true)}
                          className="mt-3 min-h-[42px] rounded-xl bg-violet-700 text-white px-4 text-sm font-black disabled:opacity-40"
                        >
                          Check my answer
                        </button>
                      ) : (
                        <div className="mt-3 rounded-xl bg-white border border-violet-100 p-3 text-sm leading-6 text-slate-700">
                          <strong>{selectedAnswer === check.answer ? 'Correct. ' : 'Not quite. '}</strong>{check.explanation}
                        </div>
                      )}
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-5">
                      <div className="flex items-center gap-2">
                        <FileText className="w-5 h-5 text-slate-500" />
                        <h3 className="font-black text-slate-900">Your lesson notes</h3>
                      </div>
                      <textarea
                        rows={5}
                        value={notes[currentKey] || ''}
                        onChange={(event) => persistNotes({ ...notes, [currentKey]: event.target.value })}
                        placeholder="Write what you learned, the campaign idea you want to test, questions to revisit, or results from the practice challenge…"
                        className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm leading-6 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 resize-y"
                      />
                    </div>
                  </div>
                </section>

                {activeModule === modules.length - 1 && (
                  <section className="rounded-3xl bg-gradient-to-br from-slate-950 to-blue-950 text-white p-5 md:p-7">
                    <div className="flex items-center gap-2 text-amber-300">
                      <Trophy className="w-5 h-5" />
                      <h3 className="font-black">Capstone campaign</h3>
                    </div>
                    <p className="mt-3 text-sm md:text-base leading-7 text-slate-200">
                      Build one complete campaign package: customer research, offer, objective, audience plan, six creative concepts, landing or messaging flow,
                      tracking map, seven-day test budget, target CPA or ROAS, stop rules and scale rules. Keep screenshots and results as portfolio evidence.
                    </p>
                  </section>
                )}

                <section data-tour="course-nav" className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5">
                  <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                    <button
                      type="button"
                      onClick={goPrevious}
                      disabled={activeModule === 0 && activeLesson === 0}
                      className="min-h-[46px] rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 inline-flex items-center justify-center gap-2 disabled:opacity-30"
                    >
                      <ChevronLeft className="w-4 h-4" /> Previous lesson
                    </button>

                    <div className="text-center">
                      <p className="text-xs text-slate-400">Lesson {currentNumber} of {lessons.length}</p>
                      <p className="text-sm font-black text-slate-800 mt-0.5">{completed[currentKey] ? 'Completed' : 'Ready when you are'}</p>
                    </div>

                    <button
                      type="button"
                      onClick={completeAndContinue}
                      className="min-h-[46px] rounded-xl bg-primary-600 hover:bg-primary-700 px-4 text-sm font-black text-white inline-flex items-center justify-center gap-2"
                    >
                      {completed[currentKey] ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                      {isLastLesson ? 'Complete course' : completed[currentKey] ? 'Continue' : 'Complete & continue'}
                      {!isLastLesson && <ChevronRight className="w-4 h-4" />}
                    </button>
                  </div>
                </section>

                {isLastLesson && percent >= 90 && (
                  <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 text-center">
                    <GraduationCap className="w-10 h-10 text-emerald-700 mx-auto" />
                    <h3 className="mt-3 text-xl font-black text-emerald-950">You reached the end of the course</h3>
                    <p className="mt-2 text-sm leading-6 text-emerald-900">
                      Review any incomplete lessons, finish the capstone and keep using the notes and practice tasks as your operating playbook.
                    </p>
                  </section>
                )}

                <section className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-black text-slate-900">Official reference library</h3>
                      <p className="text-sm text-slate-500 mt-1">Open supporting Meta references inside the course workspace.</p>
                    </div>
                    <BookOpen className="w-5 h-5 text-slate-400" />
                  </div>
                  <div className="mt-3 grid sm:grid-cols-2 gap-2">
                    {officialReferences.map((reference) => (
                      <button
                        key={reference.url}
                        type="button"
                        onClick={() => setReferenceOpen(reference)}
                        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-left text-xs font-bold text-slate-700 hover:border-primary-300 hover:bg-primary-50"
                      >
                        {reference.label}
                      </button>
                    ))}
                  </div>
                </section>

                <p className="text-xs leading-5 text-slate-500 pb-4">
                  Educational product. Not affiliated with or endorsed by Meta. Platform interfaces and policies change, and advertising results vary.
                  The course teaches decision-making and campaign process; it does not guarantee revenue or sales.
                </p>
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>

      <AnimatePresence>
        {outlineOpen && (
          <motion.div className="fixed inset-0 z-[90] lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <button type="button" aria-label="Close course outline" onClick={() => setOutlineOpen(false)} className="absolute inset-0 bg-slate-950/60" />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              className="absolute inset-y-0 left-0 w-[88%] max-w-sm bg-white shadow-2xl overflow-y-auto"
            >
              <div className="sticky top-0 bg-white border-b border-slate-100 p-4 flex items-center justify-between">
                <div><p className="font-black">Course outline</p><p className="text-xs text-slate-500">{percent}% complete</p></div>
                <button type="button" onClick={() => setOutlineOpen(false)} className="w-9 h-9 rounded-full border border-slate-200 flex items-center justify-center"><X className="w-4 h-4" /></button>
              </div>
              <div className="p-3 space-y-3">
                {modules.map((module, moduleIndex) => (
                  <div key={module.title} className="rounded-2xl border border-slate-200 p-2">
                    <p className="px-2 py-2 text-xs font-black text-slate-800">{module.title}</p>
                    <div className="space-y-1">
                      {module.lessons.map((lesson, lessonIndex) => {
                        const key = String(moduleIndex) + '-' + String(lessonIndex);
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => goToLesson(moduleIndex, lessonIndex)}
                            className={'w-full rounded-xl px-3 py-2.5 text-left text-xs flex items-start gap-2 ' + (key === currentKey ? 'bg-primary-600 text-white' : 'bg-slate-50 text-slate-700')}
                          >
                            {completed[key] ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> : <Circle className="w-4 h-4 shrink-0 opacity-40" />}
                            <span>{lesson.title}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {mediaOpen && (
          <motion.div className="fixed inset-0 z-[95] bg-slate-950/75 p-3 md:p-8 overflow-y-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="max-w-4xl mx-auto bg-white rounded-3xl overflow-hidden shadow-2xl">
              <div className="sticky top-0 z-10 bg-white border-b border-slate-100 p-4 md:p-5 flex items-center justify-between">
                <div>
                  <p className="font-black text-slate-950">Course media library</p>
                  <p className="text-xs text-slate-500 mt-0.5">Videos play inside DRIGHT.</p>
                </div>
                <button type="button" onClick={() => setMediaOpen(false)} className="w-9 h-9 rounded-full border border-slate-200 flex items-center justify-center"><X className="w-4 h-4" /></button>
              </div>
              <div className="p-4 md:p-6 space-y-6">
                {embeddedVideos.map((video) => (
                  <div key={video.url}>
                    <VideoPlayer url={video.url} title={video.title} />
                    <p className="mt-3 font-black text-slate-900">{video.title}</p>
                    <p className="text-sm text-slate-500 mt-1">{video.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {referenceOpen && (
          <motion.div className="fixed inset-0 z-[96] bg-slate-950/75 p-3 md:p-8" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="h-full max-w-5xl mx-auto bg-white rounded-3xl overflow-hidden shadow-2xl flex flex-col">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-black text-slate-950 truncate">{referenceOpen.label}</p>
                  <p className="text-xs text-slate-500">Reference viewer</p>
                </div>
                <button type="button" onClick={() => setReferenceOpen(null)} className="w-9 h-9 rounded-full border border-slate-200 flex items-center justify-center shrink-0"><X className="w-4 h-4" /></button>
              </div>
              <iframe
                src={referenceOpen.url}
                title={referenceOpen.label}
                className="w-full flex-1 min-h-0 bg-white"
                sandbox="allow-forms allow-scripts allow-same-origin allow-popups"
              />
              <div className="px-4 py-2 border-t border-slate-100 text-[11px] text-slate-500">
                Some publishers may block iframe display in browsers. The DRIGHT course itself remains available even if a third-party reference refuses embedding.
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
