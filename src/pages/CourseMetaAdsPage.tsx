import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, ExternalLink, Lock, Printer, RotateCcw, Target } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

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

const refs = [
  ['Meta Blueprint — Ads Manager learning path', 'https://metaspark.facebookblueprint.com/student/collection/507005-meta-ads-manager-learning'],
  ['Meta Blueprint — Get started with Meta Ads Manager', 'https://www.facebookblueprint.com/student/path/515321-get-started-with-meta-ads-manager'],
  ['Meta Blueprint — Campaign activation tools and Advantage+', 'https://www.facebookblueprint.com/student/path/253164-ads-business-manager-course'],
  ['Meta for Business — Facebook & Instagram Reels Ads', 'https://www.facebook.com/business/ads/facebook-instagram-reels-ads'],
  ['Meta Ad Library', 'https://www.facebook.com/ads/library/'],
  ['2026 Meta Ads walkthrough — D2C by Nikhil', 'https://www.youtube.com/watch?v=gV0J-pWJDVk'],
  ['Phone-first Meta Ads tutorial — Bizliftng', 'https://www.youtube.com/watch?v=pIawYyNGZ-E'],
  ['2026 creative testing walkthrough — Etienne Garcia', 'https://www.youtube.com/watch?v=QCZoeGUr9vc'],
];

export default function CourseMetaAdsPage() {
  const { user } = useAuth();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [productId, setProductId] = useState('');
  const [completed, setCompleted] = useState<Record<string, boolean>>({});

  const lessons = useMemo(() => modules.flatMap((m, mi) => m.lessons.map((l, li) => ({ ...l, key: `${mi}-${li}`, module: m.title }))), []);
  const doneCount = lessons.filter((l) => completed[l.key]).length;
  const percent = lessons.length ? Math.round((doneCount / lessons.length) * 100) : 0;

  useEffect(() => {
    if (!user?.id) return;
    const key = `dright-course-progress:${COURSE_SLUG}:${user.id}`;
    try { setCompleted(JSON.parse(localStorage.getItem(key) || '{}')); } catch { setCompleted({}); }
  }, [user?.id]);

  useEffect(() => {
    const check = async () => {
      if (!user?.id) return;
      setChecking(true);
      const { data } = await supabase.rpc('get_public_dright_official_products');
      const items = Array.isArray(data) ? data : [];
      const course = items.find((item: any) => item.slug === COURSE_SLUG);
      if (!course?.marketplace_product_id) { setChecking(false); return; }
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

  const toggle = (key: string) => {
    if (!user?.id) return;
    setCompleted((current) => {
      const next = { ...current, [key]: !current[key] };
      localStorage.setItem(`dright-course-progress:${COURSE_SLUG}:${user.id}`, JSON.stringify(next));
      return next;
    });
  };

  if (checking) return <div className="min-h-[70vh] flex items-center justify-center text-gray-500">Checking course access...</div>;

  if (!allowed) return (
    <div className="max-w-xl mx-auto px-4 py-16 text-center">
      <div className="w-16 h-16 rounded-2xl bg-gray-100 mx-auto flex items-center justify-center"><Lock className="w-7 h-7 text-gray-500" /></div>
      <h1 className="text-2xl font-black text-gray-900 mt-5">Course access locked</h1>
      <p className="text-gray-600 mt-2">Purchase Facebook & Instagram Ads Mastery 2026 from the official Dright Shop to unlock this learning portal.</p>
      <div className="mt-6 flex gap-3 justify-center">
        {productId && <Link to={`/product/${productId}`} className="px-5 py-3 rounded-xl bg-primary-600 text-white font-bold">View product</Link>}
        <Link to="/dright/store" className="px-5 py-3 rounded-xl border border-gray-200 font-bold text-gray-700">Official shop</Link>
      </div>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <section className="rounded-3xl bg-gray-950 text-white p-6 md:p-10 overflow-hidden relative">
        <div className="absolute -right-20 -top-20 w-72 h-72 rounded-full bg-fuchsia-500/20 blur-3xl" />
        <div className="relative">
          <p className="text-fuchsia-300 font-bold tracking-widest text-xs">DRIGHT COURSE 001 • 2026 EDITION</p>
          <h1 className="text-3xl md:text-5xl font-black mt-3">Facebook & Instagram Ads Mastery</h1>
          <p className="text-gray-300 mt-4 max-w-3xl">A practical, phone-friendly Meta advertising course covering strategy, creative, audiences, leads, WhatsApp funnels, measurement, testing and responsible scaling.</p>
          <div className="mt-6 flex flex-wrap gap-2">
            <span className="rounded-full bg-white/10 px-3 py-1.5 text-sm">15 modules</span>
            <span className="rounded-full bg-white/10 px-3 py-1.5 text-sm">{lessons.length} lessons</span>
            <span className="rounded-full bg-white/10 px-3 py-1.5 text-sm">Buyer-only access</span>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 md:p-6">
        <div className="flex items-center justify-between gap-4">
          <div><p className="text-sm font-bold text-gray-900">Course progress</p><p className="text-xs text-gray-500">{doneCount}/{lessons.length} lessons complete</p></div>
          <div className="text-2xl font-black text-primary-600">{percent}%</div>
        </div>
        <div className="h-3 rounded-full bg-gray-100 mt-4 overflow-hidden"><div className="h-full bg-primary-600 rounded-full" style={{ width: `${percent}%` }} /></div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 text-sm font-bold"><Printer className="w-4 h-4" /> Print / Save PDF</button>
          <button type="button" onClick={() => { if (user?.id) { localStorage.removeItem(`dright-course-progress:${COURSE_SLUG}:${user.id}`); setCompleted({}); } }} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 text-sm font-bold"><RotateCcw className="w-4 h-4" /> Reset progress</button>
        </div>
      </section>

      <div className="space-y-5">
        {modules.map((module, mi) => (
          <section key={module.title} className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
            <div className="px-5 py-4 bg-gray-50 border-b border-gray-100"><h2 className="font-black text-gray-900">{module.title}</h2></div>
            <div className="divide-y divide-gray-100">
              {module.lessons.map((lesson, li) => {
                const key = `${mi}-${li}`;
                const done = Boolean(completed[key]);
                return (
                  <article key={key} className="p-5">
                    <div className="flex items-start gap-3">
                      <button type="button" onClick={() => toggle(key)} className="mt-0.5 shrink-0" aria-label={done ? 'Mark incomplete' : 'Mark complete'}>
                        {done ? <CheckCircle2 className="w-6 h-6 text-emerald-600" /> : <Circle className="w-6 h-6 text-gray-300" />}
                      </button>
                      <div>
                        <h3 className="font-extrabold text-gray-900">{lesson.title}</h3>
                        <p className="text-sm text-gray-600 mt-1 leading-6">{lesson.brief}</p>
                        <div className="mt-3 rounded-xl bg-primary-50 border border-primary-100 px-3 py-2 text-sm text-primary-900"><strong>Practice:</strong> {lesson.action}</div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 md:p-6">
        <div className="flex items-center gap-2"><Target className="w-5 h-5 text-primary-600" /><h2 className="font-black text-gray-900">Capstone</h2></div>
        <p className="text-sm text-gray-600 mt-2 leading-6">Build one complete campaign package: customer research, offer, objective, audience plan, six creatives, landing/message flow, tracking map, seven-day test budget, target CPA/ROAS, stop rules and scale rules. Keep screenshots and results as your portfolio evidence.</p>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 md:p-6">
        <h2 className="font-black text-gray-900">Current reference library</h2>
        <p className="text-sm text-gray-500 mt-1">The course is original. These official and selected third-party resources are supporting references and may change over time.</p>
        <div className="mt-4 grid gap-3">
          {refs.map(([label, href]) => (
            <a key={href} href={href} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-4 py-3 text-sm font-bold text-gray-800 hover:border-primary-300">
              <span>{label}</span><ExternalLink className="w-4 h-4 shrink-0 text-gray-400" />
            </a>
          ))}
        </div>
      </section>

      <p className="text-xs text-gray-500 pb-8">Educational product. Not affiliated with or endorsed by Meta. Platform interfaces and policies change. Advertising results vary; no revenue or sales outcome is guaranteed.</p>
    </div>
  );
}
