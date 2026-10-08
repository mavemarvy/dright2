import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import {
  AlertTriangle, Archive, BarChart3, CalendarClock, ChevronDown,
  ChevronUp, History, Loader2, Package, Plus,
  RefreshCw, Save, Search, ShieldCheck, Trophy, Users, WalletCards, XCircle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

type Challenge = {
  id: string;
  title: string;
  tagline: string | null;
  short_description: string | null;
  long_description: string | null;
  cta_label: string;
  status: string;
  currency: string;
  minimum_product_price: number;
  minimum_retained_margin_pct: number;
  estimated_payment_cost_pct: number;
  estimated_payment_cost_fixed: number;
  leaderboard_enabled: boolean;
  claims_enabled: boolean;
  is_template: boolean;
};

type Tier = {
  id?: string;
  sort_order: number;
  sales_required: number;
  reward_type: 'CASH' | 'PRIZE' | 'CASH_OR_PRIZE';
  cash_reward: number;
  prize_name: string | null;
  prize_description: string | null;
  prize_estimated_cost: number;
  enabled: boolean;
};

type Product = {
  id: string;
  name: string;
  price: number;
  affiliate_commission_percent: number;
  approval_status: string;
  is_active: boolean;
};

type SelectedProduct = { product_id: string; active: boolean };

type Cycle = {
  id: string;
  challenge_id: string;
  cycle_number: number;
  starts_at: string;
  ends_at: string;
  status: string;
  ended_at: string | null;
  reset_reason: string | null;
};

type Participant = {
  user_id: string;
  current_tier_sales: number;
  lifetime_qualified_sales: number;
  status: string;
  joined_at: string;
};

type Leader = {
  user_id: string;
  display_name: string;
  lifetime_qualified_sales: number;
  rank: number;
};

type Claim = {
  id: string;
  user_id: string;
  sales_target_snapshot: number;
  reward_choice: string;
  cash_amount_snapshot: number;
  prize_name_snapshot: string | null;
  status: string;
  payout_status: string;
  needs_review: boolean;
  review_reason: string | null;
  claimed_at: string;
};

type Audit = {
  id: string;
  event_type: string;
  target_type: string | null;
  actor_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

const tabs = [
  'Overview', 'Schedule', 'Eligible Products', 'Milestones & Rewards', 'Financial Safety',
  'Participants', 'Leaderboard', 'Claims & Payouts', 'Cycle History', 'Audit History',
] as const;
type Tab = typeof tabs[number];

const money = (value: number, currency = 'NGN') =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency, maximumFractionDigits: 0 })
    .format(Number(value || 0));

const localInput = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function AdminSalesChallengesPage() {
  const [tab, setTab] = useState<Tab>('Overview');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [challengeId, setChallengeId] = useState('');
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [audits, setAudits] = useState<Audit[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [productFilter, setProductFilter] = useState<'ALL' | 'QUALIFYING' | 'BELOW_MINIMUM' | 'SELECTED'>('ALL');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [scheduleReason, setScheduleReason] = useState('');

  const challenge = challenges.find(c => c.id === challengeId) || null;
  const latestCycle = cycles[0] || null;
  const selectedIds = useMemo(
    () => new Set(selectedProducts.filter(p => p.active).map(p => p.product_id)),
    [selectedProducts],
  );

  const load = useCallback(async (preferredId?: string) => {
    setLoading(true);
    setError('');
    try {
      const { data: challengeRows, error: challengeError } = await supabase
        .from('sales_challenges').select('*').order('created_at', { ascending: true });
      if (challengeError) throw challengeError;
      const list = (challengeRows || []) as Challenge[];
      setChallenges(list);
      const nextId = preferredId || challengeId || list[0]?.id || '';
      setChallengeId(nextId);
      if (!nextId) return;

      const [tiersRes, selectedRes, productsRes, cyclesRes] = await Promise.all([
        supabase.from('sales_challenge_tiers').select('*').eq('challenge_id', nextId).order('sort_order'),
        supabase.from('sales_challenge_products').select('product_id,active').eq('challenge_id', nextId),
        supabase.from('products').select('id,name,price,affiliate_commission_percent,approval_status,is_active')
          .eq('approval_status', 'approved').order('name'),
        supabase.from('sales_challenge_cycles').select('*').eq('challenge_id', nextId)
          .order('cycle_number', { ascending: false }),
      ]);
      for (const result of [tiersRes, selectedRes, productsRes, cyclesRes]) if (result.error) throw result.error;

      const cycleRows = (cyclesRes.data || []) as Cycle[];
      setTiers((tiersRes.data || []) as Tier[]);
      setSelectedProducts((selectedRes.data || []) as SelectedProduct[]);
      setProducts((productsRes.data || []) as Product[]);
      setCycles(cycleRows);

      const cycle = cycleRows[0];
      if (cycle) {
        setStartsAt(localInput(cycle.starts_at));
        setEndsAt(localInput(cycle.ends_at));
        const [participantsRes, claimsRes] = await Promise.all([
          supabase.from('sales_challenge_participants').select('*')
            .eq('challenge_cycle_id', cycle.id).order('lifetime_qualified_sales', { ascending: false }),
          supabase.from('sales_challenge_claims').select('*')
            .eq('challenge_cycle_id', cycle.id).order('claimed_at', { ascending: false }),
        ]);
        for (const result of [participantsRes, claimsRes]) if (result.error) throw result.error;
        setParticipants((participantsRes.data || []) as Participant[]);
        setClaims((claimsRes.data || []) as Claim[]);

        const allLeaders: Leader[] = [];
        for (let from = 0; ; from += 1000) {
          const { data: page, error: pageError } = await supabase
            .from('sales_challenge_leaderboard_view')
            .select('*')
            .eq('challenge_cycle_id', cycle.id)
            .order('rank')
            .range(from, from + 999);
          if (pageError) throw pageError;
          const typedPage = (page || []) as Leader[];
          allLeaders.push(...typedPage);
          if (typedPage.length < 1000) break;
        }
        setLeaders(allLeaders);
      } else {
        setParticipants([]); setLeaders([]); setClaims([]);
        const start = new Date(Date.now() + 60 * 60 * 1000);
        const end = new Date(start.getTime() + 30 * 86400000);
        setStartsAt(localInput(start.toISOString()));
        setEndsAt(localInput(end.toISOString()));
      }

      const { data: auditRows, error: auditError } = await supabase
        .from('sales_challenge_audit_logs').select('*').eq('challenge_id', nextId)
        .order('created_at', { ascending: false }).limit(300);
      if (auditError) throw auditError;
      setAudits((auditRows || []) as Audit[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load challenge management.');
    } finally {
      setLoading(false);
    }
  }, [challengeId]);

  useEffect(() => { void load(); }, []);

  const run = async (action: () => Promise<void>, success: string) => {
    setBusy(true); setError(''); setMessage('');
    try {
      await action();
      setMessage(success);
      await load(challengeId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  };

  const updateChallengeField = <K extends keyof Challenge>(key: K, value: Challenge[K]) => {
    setChallenges(rows => rows.map(row => row.id === challengeId ? { ...row, [key]: value } : row));
  };

  const saveChallenge = () => run(async () => {
    if (!challenge) return;
    const { error: saveError } = await supabase.from('sales_challenges').update({
      title: challenge.title,
      tagline: challenge.tagline,
      short_description: challenge.short_description,
      long_description: challenge.long_description,
      cta_label: challenge.cta_label,
      minimum_product_price: Number(challenge.minimum_product_price),
      minimum_retained_margin_pct: Number(challenge.minimum_retained_margin_pct),
      estimated_payment_cost_pct: Number(challenge.estimated_payment_cost_pct),
      estimated_payment_cost_fixed: Number(challenge.estimated_payment_cost_fixed),
      leaderboard_enabled: challenge.leaderboard_enabled,
      claims_enabled: challenge.claims_enabled,
    }).eq('id', challenge.id);
    if (saveError) throw saveError;
  }, 'Challenge settings saved.');

  const createChallenge = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      const { data: auth } = await supabase.auth.getUser();
      const template = challenges.find(item => item.is_template) || null;

      const { data, error: createError } = await supabase.from('sales_challenges').insert({
        title: template ? `${template.title} Copy` : 'New DRIGHT Sales Challenge',
        tagline: template?.tagline || 'Sell More. Earn More. Unlock Bigger Rewards.',
        short_description: template?.short_description || 'Promote Admin-selected products and unlock one-time rewards through fresh sales missions.',
        long_description: template?.long_description || 'Each mission starts from zero after the previous mission reward is successfully claimed. Normal affiliate commission remains separate from challenge bonuses.',
        cta_label: template?.cta_label || 'Start Selling',
        status: 'DRAFT',
        currency: template?.currency || 'NGN',
        minimum_product_price: Number(template?.minimum_product_price ?? 20000),
        minimum_retained_margin_pct: Number(template?.minimum_retained_margin_pct ?? 15),
        estimated_payment_cost_pct: Number(template?.estimated_payment_cost_pct ?? 0),
        estimated_payment_cost_fixed: Number(template?.estimated_payment_cost_fixed ?? 0),
        leaderboard_enabled: template?.leaderboard_enabled ?? true,
        claims_enabled: template?.claims_enabled ?? true,
        is_template: false,
        created_by: auth.user?.id || null,
      }).select('id').single();
      if (createError) throw createError;

      if (template) {
        const { data: templateTiers, error: templateTierError } = await supabase
          .from('sales_challenge_tiers')
          .select('*')
          .eq('challenge_id', template.id)
          .order('sort_order');
        if (templateTierError) throw templateTierError;

        const tierPayload = ((templateTiers || []) as Tier[]).map((tier, index) => ({
          sort_order: index + 1,
          sales_required: Number(tier.sales_required),
          reward_type: tier.reward_type,
          cash_reward: Number(tier.cash_reward || 0),
          prize_name: tier.prize_name,
          prize_description: tier.prize_description,
          prize_estimated_cost: Number(tier.prize_estimated_cost || 0),
          enabled: tier.enabled,
        }));

        if (tierPayload.length > 0) {
          const { error: cloneTierError } = await supabase.rpc('admin_replace_sales_challenge_tiers', {
            p_challenge_id: data.id,
            p_tiers: tierPayload,
          });
          if (cloneTierError) throw cloneTierError;
        }
      }

      setChallengeId(data.id);
      setMessage(template ? 'Draft challenge created from the default template. Products were not copied.' : 'Draft challenge created.');
      await load(data.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to create challenge.');
    } finally {
      setBusy(false);
    }
  };

  const toggleProduct = async (productId: string, active: boolean) => {
    await run(async () => {
      if (!challenge) return;
      if (active) {
        const { data: auth } = await supabase.auth.getUser();
        const { error: productError } = await supabase.from('sales_challenge_products').upsert({
          challenge_id: challenge.id,
          product_id: productId,
          active: true,
          added_by: auth.user?.id || null,
        }, { onConflict: 'challenge_id,product_id' });
        if (productError) throw productError;
      } else {
        const { error: productError } = await supabase.from('sales_challenge_products')
          .update({ active: false }).eq('challenge_id', challenge.id).eq('product_id', productId);
        if (productError) throw productError;
      }
    }, active ? 'Product added to the challenge.' : 'Product removed from the challenge.');
  };

  const saveTiers = () => run(async () => {
    if (!challenge) return;
    const payload = tiers.map((tier, index) => ({
      sort_order: index + 1,
      sales_required: Number(tier.sales_required),
      reward_type: tier.reward_type,
      cash_reward: Number(tier.cash_reward || 0),
      prize_name: tier.prize_name,
      prize_description: tier.prize_description,
      prize_estimated_cost: Number(tier.prize_estimated_cost || 0),
      enabled: tier.enabled,
    }));
    const { error: tierError } = await supabase.rpc('admin_replace_sales_challenge_tiers', {
      p_challenge_id: challenge.id,
      p_tiers: payload,
    });
    if (tierError) throw tierError;
  }, 'Milestones and rewards saved.');

  const launchCycle = () => run(async () => {
    if (!challenge || !startsAt || !endsAt) throw new Error('Choose a valid start and end time.');
    const startedBefore = Boolean(latestCycle && new Date(latestCycle.starts_at).getTime() <= Date.now());
    let force = false;
    if (startedBefore) {
      force = window.confirm(
        'This will close the current challenge cycle and start a new cycle. All participant progress in the new cycle will begin from zero. Previous records will remain available in Challenge History.',
      );
      if (!force) throw new Error('Reschedule cancelled.');
    }
    const { error: launchError } = await supabase.rpc('admin_launch_sales_challenge_cycle', {
      p_challenge_id: challenge.id,
      p_starts_at: new Date(startsAt).toISOString(),
      p_ends_at: new Date(endsAt).toISOString(),
      p_reason: scheduleReason || null,
      p_force_new_cycle: force,
    });
    if (launchError) throw launchError;
  }, latestCycle ? 'Challenge schedule updated.' : 'Challenge cycle scheduled.');

  const restartCycle = () => run(async () => {
    if (!challenge) return;
    const confirmed = window.confirm(
      'This will close the current challenge cycle and start a new cycle. All participant progress in the new cycle will begin from zero. Previous records will remain available in Challenge History.',
    );
    if (!confirmed) throw new Error('Reset / restart cancelled.');

    const start = new Date();
    let end = endsAt ? new Date(endsAt) : new Date(start.getTime() + 30 * 86400000);
    if (Number.isNaN(end.getTime()) || end.getTime() <= start.getTime()) {
      end = new Date(start.getTime() + 30 * 86400000);
    }

    const { error: restartError } = await supabase.rpc('admin_launch_sales_challenge_cycle', {
      p_challenge_id: challenge.id,
      p_starts_at: start.toISOString(),
      p_ends_at: end.toISOString(),
      p_reason: scheduleReason || 'Reset / restart by admin',
      p_force_new_cycle: true,
    });
    if (restartError) throw restartError;
  }, 'New challenge cycle created. Participant progress starts from zero.');

  const stopChallenge = (archive = false) => run(async () => {
    if (!challenge) return;
    const { error: stopError } = await supabase.rpc('admin_stop_sales_challenge', {
      p_challenge_id: challenge.id,
      p_reason: scheduleReason || (archive ? 'Archived by admin' : 'Stopped by admin'),
      p_archive: archive,
    });
    if (stopError) throw stopError;
  }, archive ? 'Challenge archived.' : 'Challenge stopped.');

  const claimAction = (claimId: string, action: 'APPROVE' | 'PAY' | 'FULFILL' | 'FLAG' | 'REJECT') =>
    run(async () => {
      const notes = action === 'FLAG' || action === 'REJECT' ? window.prompt('Admin notes') : null;
      const paymentReference = action === 'PAY' || action === 'FULFILL'
        ? window.prompt('Payment / fulfilment reference (optional)') : null;
      const { error: claimError } = await supabase.rpc('admin_review_sales_challenge_claim', {
        p_claim_id: claimId,
        p_action: action,
        p_notes: notes,
        p_payment_reference: paymentReference,
      });
      if (claimError) throw claimError;
    }, `Claim action ${action.toLowerCase()} completed.`);

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(productSearch.toLowerCase());
    if (!matchesSearch || !challenge) return false;
    const meetsMinimum = Number(p.price) >= Number(challenge.minimum_product_price);
    if (productFilter === 'QUALIFYING') return meetsMinimum;
    if (productFilter === 'BELOW_MINIMUM') return !meetsMinimum;
    if (productFilter === 'SELECTED') return selectedIds.has(p.id);
    return true;
  });

  const bulkSetProducts = (active: boolean) => run(async () => {
    if (!challenge) return;
    const ids = filteredProducts
      .filter(p => active ? Number(p.price) >= Number(challenge.minimum_product_price) : selectedIds.has(p.id))
      .map(p => p.id);
    if (ids.length === 0) throw new Error(active ? 'No qualifying products are visible to add.' : 'No selected products are visible to remove.');

    if (active) {
      const { data: auth } = await supabase.auth.getUser();
      const rows = ids.map(productId => ({
        challenge_id: challenge.id,
        product_id: productId,
        active: true,
        added_by: auth.user?.id || null,
      }));
      const { error: bulkError } = await supabase
        .from('sales_challenge_products')
        .upsert(rows, { onConflict: 'challenge_id,product_id' });
      if (bulkError) throw bulkError;
    } else {
      const { error: bulkError } = await supabase
        .from('sales_challenge_products')
        .update({ active: false })
        .eq('challenge_id', challenge.id)
        .in('product_id', ids);
      if (bulkError) throw bulkError;
    }
  }, active ? 'Visible qualifying products added.' : 'Visible selected products removed.');

  const financial = useMemo(() => {
    if (!challenge) return null;
    const chosen = products.filter(p => selectedIds.has(p.id) && Number(p.price) >= Number(challenge.minimum_product_price));
    const productModels = chosen.map(p => {
      const price = Number(p.price || 0);
      const affiliatePct = Number(p.affiliate_commission_percent || 0);
      const affiliatePerSale = price * affiliatePct / 100;
      const paymentPerSale = price * Number(challenge.estimated_payment_cost_pct || 0) / 100
        + Number(challenge.estimated_payment_cost_fixed || 0);
      const retainedBeforeBonus = price - affiliatePerSale - paymentPerSale;
      const retainedBeforeBonusPct = price > 0 ? retainedBeforeBonus / price * 100 : -Infinity;
      return { product: p, price, affiliatePct, affiliatePerSale, paymentPerSale, retainedBeforeBonus, retainedBeforeBonusPct };
    });
    const conservative = [...productModels].sort((a, b) =>
      a.retainedBeforeBonusPct - b.retainedBeforeBonusPct || a.retainedBeforeBonus - b.retainedBeforeBonus
    )[0];

    const enabledTiers = tiers.filter(t => t.enabled);
    const rewardCost = (tier: Tier) => {
      const cash = Number(tier.cash_reward || 0);
      const prize = Number(tier.prize_estimated_cost || 0);
      if (tier.reward_type === 'CASH') return cash;
      if (tier.reward_type === 'PRIZE') return prize;
      return Math.max(cash, prize);
    };
    const rows = productModels.length > 0 ? enabledTiers.map(tier => {
      const sales = Number(tier.sales_required || 0);
      const reward = rewardCost(tier);
      const candidates = productModels.map(model => {
        const gross = model.price * sales;
        const affiliate = model.affiliatePerSale * sales;
        const payment = model.paymentPerSale * sales;
        const retained = gross - affiliate - payment - reward;
        const pct = gross > 0 ? retained / gross * 100 : -Infinity;
        return { product: model.product, gross, affiliate, payment, retained, pct };
      });
      const worst = candidates.sort((a, b) => a.pct - b.pct || a.retained - b.retained)[0];
      const status = worst.retained < 0 ? 'UNSAFE / NEGATIVE MARGIN'
        : worst.pct < Number(challenge.minimum_retained_margin_pct) ? 'LOW MARGIN' : 'SAFE';
      return { tier, product: worst.product, gross: worst.gross, affiliate: worst.affiliate, payment: worst.payment, reward, retained: worst.retained, pct: worst.pct, status };
    }) : [];
    return {
      chosen,
      conservative,
      rows,
      maxLiability: enabledTiers.reduce((m, t) => Math.max(m, rewardCost(t)), 0),
      cumulativeLiability: enabledTiers.reduce((s, t) => s + rewardCost(t), 0),
      highestAffiliate: chosen.reduce((m, p) => Math.max(m, Number(p.affiliate_commission_percent || 0)), 0),
      cheapest: [...chosen].sort((a, b) => Number(a.price) - Number(b.price))[0],
    };
  }, [challenge, products, selectedIds, tiers]);

  const moveTier = (index: number, direction: -1 | 1) => {
    const next = [...tiers];
    const swap = index + direction;
    if (swap < 0 || swap >= next.length) return;
    [next[index], next[swap]] = [next[swap], next[index]];
    setTiers(next.map((t, i) => ({ ...t, sort_order: i + 1 })));
  };

  if (loading) return <div className="min-h-[60vh] grid place-items-center"><Loader2 className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="max-w-[1500px] mx-auto p-4 md:p-7 space-y-5">
      <header className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] font-bold text-slate-500">Affiliates & Referrals</p>
          <h1 className="text-3xl font-black text-slate-950 dark:text-white">Sales Challenge Engine</h1>
          <p className="text-sm text-slate-500 mt-1">Fresh missions, cycle-isolated accounting, server-validated claims and conservative margin controls.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={challengeId} onChange={e => { setChallengeId(e.target.value); void load(e.target.value); }}
            className="min-w-64 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2">
            {challenges.map(c => <option key={c.id} value={c.id}>{c.title} · {c.status}</option>)}
          </select>
          <button onClick={() => void createChallenge()} disabled={busy}
            className="rounded-xl bg-slate-950 text-white px-4 py-2 font-bold flex items-center gap-2">
            <Plus className="w-4 h-4" /> Create from Default
          </button>
          <button onClick={() => void load(challengeId)} className="rounded-xl border border-slate-200 dark:border-slate-700 p-2.5">
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </header>

      {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-800 p-4 font-semibold">{message}</div>}
      {error && <div className="rounded-2xl border border-red-200 bg-red-50 text-red-800 p-4 font-semibold">{error}</div>}

      <nav className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map(item => (
          <button key={item} onClick={() => setTab(item)}
            className={`shrink-0 rounded-xl px-4 py-2 text-sm font-bold border ${tab === item ? 'bg-slate-950 text-white border-slate-950' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'}`}>
            {item}
          </button>
        ))}
      </nav>

      {!challenge ? (
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-8 text-center">Create a challenge to begin.</div>
      ) : (
        <>
          {tab === 'Overview' && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {(['ACTIVE','SCHEDULED','DRAFT','ENDED','ARCHIVED'] as const).map(status => (
                  <div key={status} className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
                    <p className="text-xs font-bold uppercase text-slate-500">{status}</p>
                    <p className="mt-1 text-2xl font-black">{challenges.filter(item => item.status === status).length}</p>
                  </div>
                ))}
              </div>
              <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-3">
                {([
                  { label: 'Status', value: challenge.status, Icon: Trophy },
                  { label: 'Selected Products', value: selectedIds.size, Icon: Package },
                  { label: 'Enabled Tiers', value: tiers.filter(t => t.enabled).length, Icon: BarChart3 },
                  { label: 'Participants', value: participants.length, Icon: Users },
                  { label: 'Claims', value: claims.length, Icon: WalletCards },
                ] satisfies Array<{ label: string; value: string | number; Icon: ComponentType<{ className?: string }> }>).map(({ label, value, Icon }) => (
                  <div key={label} className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
                    <Icon className="w-5 h-5 text-slate-500" />
                    <p className="mt-4 text-xs uppercase font-bold text-slate-500">{label}</p>
                    <p className="mt-1 text-xl font-black">{String(value)}</p>
                  </div>
                ))}
              </div>
              <div className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 grid lg:grid-cols-2 gap-5">
                <label className="space-y-1"><span className="text-sm font-bold">Title</span><input value={challenge.title} onChange={e => updateChallengeField('title', e.target.value)} className="w-full rounded-xl border p-3 bg-transparent" /></label>
                <label className="space-y-1"><span className="text-sm font-bold">Tagline</span><input value={challenge.tagline || ''} onChange={e => updateChallengeField('tagline', e.target.value)} className="w-full rounded-xl border p-3 bg-transparent" /></label>
                <label className="space-y-1 lg:col-span-2"><span className="text-sm font-bold">Short description</span><textarea value={challenge.short_description || ''} onChange={e => updateChallengeField('short_description', e.target.value)} className="w-full rounded-xl border p-3 bg-transparent min-h-24" /></label>
                <label className="space-y-1 lg:col-span-2"><span className="text-sm font-bold">Long description</span><textarea value={challenge.long_description || ''} onChange={e => updateChallengeField('long_description', e.target.value)} className="w-full rounded-xl border p-3 bg-transparent min-h-36" /></label>
                <label className="space-y-1"><span className="text-sm font-bold">CTA</span><input value={challenge.cta_label} onChange={e => updateChallengeField('cta_label', e.target.value)} className="w-full rounded-xl border p-3 bg-transparent" /></label>
                <div className="flex items-center gap-6 pt-7">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={challenge.leaderboard_enabled} onChange={e => updateChallengeField('leaderboard_enabled', e.target.checked)} /> Leaderboard</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={challenge.claims_enabled} onChange={e => updateChallengeField('claims_enabled', e.target.checked)} /> Claims</label>
                </div>
                <button onClick={() => void saveChallenge()} disabled={busy} className="lg:col-span-2 rounded-xl bg-slate-950 text-white px-5 py-3 font-bold flex items-center justify-center gap-2"><Save className="w-4 h-4" /> Save Challenge</button>
              </div>
            </div>
          )}

          {tab === 'Schedule' && (
            <div className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 space-y-5">
              <div className="flex items-center gap-3"><CalendarClock className="w-6 h-6" /><div><h2 className="text-xl font-black">Schedule / Reset / Restart / Reschedule</h2><p className="text-sm text-slate-500">Supports short campaigns and long multi-year cycles.</p></div></div>
              <div className="grid md:grid-cols-2 gap-4">
                <label className="space-y-1"><span className="text-sm font-bold">Start</span><input type="datetime-local" value={startsAt} onChange={e => setStartsAt(e.target.value)} className="w-full rounded-xl border p-3 bg-transparent" /></label>
                <label className="space-y-1"><span className="text-sm font-bold">End</span><input type="datetime-local" value={endsAt} onChange={e => setEndsAt(e.target.value)} className="w-full rounded-xl border p-3 bg-transparent" /></label>
              </div>
              <label className="space-y-1 block"><span className="text-sm font-bold">Reason / note</span><input value={scheduleReason} onChange={e => setScheduleReason(e.target.value)} className="w-full rounded-xl border p-3 bg-transparent" placeholder="Optional audit note" /></label>
              {latestCycle && <div className="rounded-2xl bg-slate-50 dark:bg-slate-800 p-4 text-sm">Current/latest: Cycle {latestCycle.cycle_number} · <b>{latestCycle.status}</b> · {new Date(latestCycle.starts_at).toLocaleString()} → {new Date(latestCycle.ends_at).toLocaleString()}</div>}
              <div className="flex flex-wrap gap-3">
                <button onClick={() => void launchCycle()} disabled={busy} className="rounded-xl bg-emerald-600 text-white px-5 py-3 font-bold">Save Schedule / Launch</button>
                <button onClick={() => void restartCycle()} disabled={busy || !latestCycle} className="rounded-xl border border-amber-300 text-amber-800 px-5 py-3 font-bold">Reset / Restart as New Cycle</button>
                <button onClick={() => void stopChallenge(false)} disabled={busy} className="rounded-xl border border-red-200 text-red-700 px-5 py-3 font-bold">Stop Challenge</button>
                <button onClick={() => void stopChallenge(true)} disabled={busy} className="rounded-xl border border-slate-300 px-5 py-3 font-bold flex gap-2 items-center"><Archive className="w-4 h-4" /> Archive</button>
              </div>
            </div>
          )}

          {tab === 'Eligible Products' && (
            <div className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div><h2 className="text-xl font-black">Challenge → Eligible Products</h2><p className="text-sm text-slate-500">No product joins automatically, even when it meets the price threshold.</p></div>
                <div className="flex flex-wrap gap-2">
                  <select value={productFilter} onChange={e => setProductFilter(e.target.value as typeof productFilter)}
                    className="rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2">
                    <option value="ALL">All products</option>
                    <option value="QUALIFYING">Meets minimum</option>
                    <option value="BELOW_MINIMUM">Below minimum</option>
                    <option value="SELECTED">Selected</option>
                  </select>
                  <div className="relative"><Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" /><input value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder="Search products" className="rounded-xl border pl-9 pr-3 py-2 bg-transparent" /></div>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={() => void bulkSetProducts(true)} disabled={busy} className="rounded-xl bg-slate-950 text-white px-4 py-2 text-sm font-bold">Add qualifying shown</button>
                <button onClick={() => void bulkSetProducts(false)} disabled={busy} className="rounded-xl border border-red-200 text-red-700 px-4 py-2 text-sm font-bold">Remove selected shown</button>
              </div>
              <div className="mt-5 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-slate-500 border-b"><th className="py-3">Product</th><th>Price</th><th>Affiliate %</th><th>Approx. contribution</th><th className="text-right">Challenge</th></tr></thead>
                <tbody>{filteredProducts.map(p => {
                  const active = selectedIds.has(p.id);
                  const contribution = Number(p.price) * (1 - Number(p.affiliate_commission_percent || 0) / 100);
                  const meets = Number(p.price) >= Number(challenge.minimum_product_price);
                  return <tr key={p.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-4 font-semibold">{p.name}<div className="text-xs text-slate-500">{meets ? 'Meets configured minimum' : 'Below configured minimum'}</div></td>
                    <td>{money(p.price, challenge.currency)}</td><td>{Number(p.affiliate_commission_percent || 0).toFixed(0)}%</td><td>{money(contribution, challenge.currency)}</td>
                    <td className="text-right"><button onClick={() => void toggleProduct(p.id, !active)} disabled={busy}
                      className={`rounded-lg px-3 py-2 font-bold ${active ? 'border border-red-200 text-red-700' : 'bg-slate-950 text-white'}`}>{active ? 'Remove' : 'Add to Challenge'}</button></td>
                  </tr>;
                })}</tbody></table></div>
            </div>
          )}

          {tab === 'Milestones & Rewards' && (
            <div className="space-y-4">
              {tiers.map((tier, index) => {
                const rewardValue = tier.reward_type === 'PRIZE'
                  ? Number(tier.prize_estimated_cost || 0)
                  : tier.reward_type === 'CASH_OR_PRIZE'
                    ? Math.max(Number(tier.cash_reward || 0), Number(tier.prize_estimated_cost || 0))
                    : Number(tier.cash_reward || 0);
                const cumulativeSales = tiers.slice(0, index + 1).filter(t => t.enabled).reduce((sum, item) => sum + Number(item.sales_required || 0), 0);
                const rewardPerSale = Number(tier.sales_required || 0) > 0 ? rewardValue / Number(tier.sales_required) : 0;
                return (
                <div key={tier.id || index} className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 grid xl:grid-cols-[70px_1fr_1fr_1fr_1fr_120px] gap-3 items-end">
                  <div><p className="text-xs font-bold text-slate-500">Mission</p><p className="text-xl font-black">{index + 1}</p><div className="flex gap-1 mt-1"><button onClick={() => moveTier(index,-1)}><ChevronUp className="w-4 h-4" /></button><button onClick={() => moveTier(index,1)}><ChevronDown className="w-4 h-4" /></button></div></div>
                  <label><span className="text-xs font-bold text-slate-500">Fresh sales</span><input type="number" min={1} value={tier.sales_required} onChange={e => setTiers(rows => rows.map((r,i) => i===index ? {...r,sales_required:Number(e.target.value)} : r))} className="w-full rounded-xl border p-2 bg-transparent" /></label>
                  <label><span className="text-xs font-bold text-slate-500">Reward type</span><select value={tier.reward_type} onChange={e => setTiers(rows => rows.map((r,i) => i===index ? {...r,reward_type:e.target.value as Tier['reward_type']} : r))} className="w-full rounded-xl border p-2 bg-transparent"><option>CASH</option><option>PRIZE</option><option>CASH_OR_PRIZE</option></select></label>
                  <label><span className="text-xs font-bold text-slate-500">Cash reward</span><input type="number" min={0} value={tier.cash_reward} onChange={e => setTiers(rows => rows.map((r,i) => i===index ? {...r,cash_reward:Number(e.target.value)} : r))} className="w-full rounded-xl border p-2 bg-transparent" /></label>
                  <label><span className="text-xs font-bold text-slate-500">Prize / cost</span><input value={tier.prize_name || ''} onChange={e => setTiers(rows => rows.map((r,i) => i===index ? {...r,prize_name:e.target.value} : r))} placeholder="Prize name" className="w-full rounded-xl border p-2 bg-transparent" /><input type="number" min={0} value={tier.prize_estimated_cost} onChange={e => setTiers(rows => rows.map((r,i) => i===index ? {...r,prize_estimated_cost:Number(e.target.value)} : r))} placeholder="Estimated cost" className="w-full mt-1 rounded-xl border p-2 bg-transparent" /></label>
                  <div className="flex gap-2"><label className="flex items-center gap-1"><input type="checkbox" checked={tier.enabled} onChange={e => setTiers(rows => rows.map((r,i) => i===index ? {...r,enabled:e.target.checked} : r))} /> Enabled</label><button onClick={() => setTiers(rows => rows.filter((_,i) => i!==index))}><XCircle className="w-5 h-5 text-red-500" /></button></div>
                  <div className="xl:col-span-6 text-xs text-slate-500 flex flex-wrap gap-x-5 gap-y-1">
                    <span>Reward / qualifying sale: <b>{money(rewardPerSale, challenge.currency)}</b></span>
                    <span>Cumulative fresh sales through this mission: <b>{cumulativeSales.toLocaleString()}</b></span>
                    <span>Estimated reward impact: <b>{money(rewardValue, challenge.currency)}</b></span>
                  </div>
                </div>
                );
              })}
              <div className="flex gap-3"><button onClick={() => setTiers(rows => [...rows,{sort_order:rows.length+1,sales_required:100,reward_type:'CASH',cash_reward:0,prize_name:null,prize_description:null,prize_estimated_cost:0,enabled:true}])} className="rounded-xl border px-4 py-3 font-bold"><Plus className="w-4 h-4 inline mr-1" /> Add Tier</button><button onClick={() => void saveTiers()} disabled={busy} className="rounded-xl bg-slate-950 text-white px-5 py-3 font-bold">Save Reward Ladder</button></div>
            </div>
          )}

          {tab === 'Financial Safety' && financial && (
            <div className="space-y-5">
              <div className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 grid md:grid-cols-4 gap-4">
                <label><span className="text-xs font-bold text-slate-500">Minimum product price</span><input type="number" value={challenge.minimum_product_price} onChange={e => updateChallengeField('minimum_product_price',Number(e.target.value))} className="w-full rounded-xl border p-2 bg-transparent" /></label>
                <label><span className="text-xs font-bold text-slate-500">Minimum retained margin %</span><input type="number" value={challenge.minimum_retained_margin_pct} onChange={e => updateChallengeField('minimum_retained_margin_pct',Number(e.target.value))} className="w-full rounded-xl border p-2 bg-transparent" /></label>
                <label><span className="text-xs font-bold text-slate-500">Payment variable cost %</span><input type="number" value={challenge.estimated_payment_cost_pct} onChange={e => updateChallengeField('estimated_payment_cost_pct',Number(e.target.value))} className="w-full rounded-xl border p-2 bg-transparent" /></label>
                <label><span className="text-xs font-bold text-slate-500">Payment fixed cost</span><input type="number" value={challenge.estimated_payment_cost_fixed} onChange={e => updateChallengeField('estimated_payment_cost_fixed',Number(e.target.value))} className="w-full rounded-xl border p-2 bg-transparent" /></label>
                <button onClick={() => void saveChallenge()} className="md:col-span-4 rounded-xl bg-slate-950 text-white px-5 py-3 font-bold">Save Safety Settings</button>
              </div>
              <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-3">
                {[
                  ['Selected qualifying', financial.chosen.length],
                  ['Cheapest qualifying', financial.cheapest ? money(financial.cheapest.price,challenge.currency) : '—'],
                  ['Lowest-margin product', financial.conservative?.product.name || '—'],
                  ['Highest affiliate %', `${financial.highestAffiliate.toFixed(0)}%`],
                  ['Cumulative liability', money(financial.cumulativeLiability,challenge.currency)],
                ].map(([label,value]) => <div key={String(label)} className="rounded-2xl bg-white dark:bg-slate-900 border p-4"><p className="text-xs font-bold uppercase text-slate-500">{label}</p><p className="mt-2 font-black">{String(value)}</p></div>)}
              </div>
              {!financial.conservative ? <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-800"><AlertTriangle className="w-5 h-5 inline mr-2" />Select at least one product that meets the minimum price to calculate safety.</div> :
              <div className="overflow-x-auto rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"><table className="w-full text-sm"><thead><tr className="text-left border-b text-slate-500"><th className="p-4">Mission</th><th>Conservative product</th><th>Gross revenue</th><th>Affiliate payout</th><th>Payment cost</th><th>Challenge bonus</th><th>DRIGHT retained</th><th>Retained %</th><th>Status</th></tr></thead><tbody>{financial.rows.map(row => <tr key={row.tier.sort_order} className="border-b border-slate-100 dark:border-slate-800"><td className="p-4 font-bold">{row.tier.sales_required.toLocaleString()} sales</td><td className="pr-4 font-semibold">{row.product.name}</td><td>{money(row.gross,challenge.currency)}</td><td>{money(row.affiliate,challenge.currency)}</td><td>{money(row.payment,challenge.currency)}</td><td>{money(row.reward,challenge.currency)}</td><td>{money(row.retained,challenge.currency)}</td><td>{row.pct.toFixed(1)}%</td><td><span className={`font-black ${row.status==='SAFE'?'text-emerald-600':row.status==='LOW MARGIN'?'text-amber-600':'text-red-600'}`}>{row.status}</span></td></tr>)}</tbody></table></div>}
            </div>
          )}

          {tab === 'Participants' && <DataTable title="Participants" icon={Users} rows={participants.map(p => [p.user_id, p.status, `${p.current_tier_sales} current`, `${p.lifetime_qualified_sales} lifetime`, new Date(p.joined_at).toLocaleString()])} />}
          {tab === 'Leaderboard' && <DataTable title="Current-Cycle Leaderboard" icon={Trophy} rows={leaders.map(l => [`#${l.rank}`, l.display_name, `${l.lifetime_qualified_sales} qualified sales`, l.user_id])} />}

          {tab === 'Claims & Payouts' && (
            <div className="space-y-3">{claims.map(c => <div key={c.id} className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 flex flex-col xl:flex-row xl:items-center gap-4">
              <div className="flex-1"><p className="font-black">{c.user_id}</p><p className="text-sm text-slate-500">{c.sales_target_snapshot.toLocaleString()} sales · {c.reward_choice} · {c.reward_choice==='CASH'?money(c.cash_amount_snapshot,challenge.currency):c.prize_name_snapshot||'Prize'}</p><p className="text-xs mt-1 font-bold">{c.status} / {c.payout_status}{c.needs_review ? ' · REVIEW REQUIRED' : ''}</p>{c.review_reason && <p className="text-xs text-amber-700 mt-1">{c.review_reason}</p>}</div>
              <div className="flex flex-wrap gap-2"><button onClick={() => void claimAction(c.id,'APPROVE')} className="rounded-lg border px-3 py-2 font-bold">Approve</button>{c.reward_choice==='CASH'?<button onClick={() => void claimAction(c.id,'PAY')} className="rounded-lg bg-emerald-600 text-white px-3 py-2 font-bold">Mark Paid</button>:<button onClick={() => void claimAction(c.id,'FULFILL')} className="rounded-lg bg-emerald-600 text-white px-3 py-2 font-bold">Mark Fulfilled</button>}<button onClick={() => void claimAction(c.id,'FLAG')} className="rounded-lg border border-amber-300 text-amber-700 px-3 py-2 font-bold">Flag</button><button onClick={() => void claimAction(c.id,'REJECT')} className="rounded-lg border border-red-300 text-red-700 px-3 py-2 font-bold">Reject</button></div>
            </div>)}{claims.length===0 && <Empty text="No claims in the latest cycle." />}</div>
          )}

          {tab === 'Cycle History' && <DataTable title="Cycle History" icon={History} rows={cycles.map(c => [`Cycle ${c.cycle_number}`, c.status, new Date(c.starts_at).toLocaleString(), new Date(c.ends_at).toLocaleString(), c.reset_reason || '—'])} />}
          {tab === 'Audit History' && <DataTable title="Audit History" icon={ShieldCheck} rows={audits.map(a => [new Date(a.created_at).toLocaleString(), a.event_type, a.target_type || '—', a.actor_id || 'system'])} />}
        </>
      )}

      {busy && <div className="fixed bottom-5 right-5 rounded-xl bg-slate-950 text-white px-4 py-3 shadow-xl flex gap-2 items-center"><Loader2 className="w-4 h-4 animate-spin" /> Processing</div>}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-500">{text}</div>;
}

function DataTable({ title, icon: Icon, rows }: {
  title: string;
  icon: ComponentType<{ className?: string }>;
  rows: Array<Array<string | number>>;
}) {
  return <div className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6">
    <div className="flex items-center gap-2"><Icon className="w-6 h-6" /><h2 className="text-xl font-black">{title}</h2></div>
    {rows.length===0 ? <div className="mt-4"><Empty text={`No ${title.toLowerCase()} yet.`} /></div> :
    <div className="mt-4 overflow-x-auto"><table className="w-full text-sm"><tbody>{rows.map((row,i) => <tr key={i} className="border-b border-slate-100 dark:border-slate-800">{row.map((cell,j) => <td key={j} className={`py-3 pr-5 ${j===0?'font-bold':''}`}>{cell}</td>)}</tr>)}</tbody></table></div>}
  </div>;
}
