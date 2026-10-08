import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Award, CheckCircle2, Clock3, Gift, Loader2, Medal, Package,
  RefreshCw, ShoppingBag, Target, Trophy, Wallet,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';

type Challenge = {
  id: string;
  title: string;
  tagline: string | null;
  short_description: string | null;
  long_description: string | null;
  cta_label: string;
  completed_tier_message: string;
  expired_message: string;
  status: 'DRAFT' | 'SCHEDULED' | 'ACTIVE' | 'ENDED' | 'ARCHIVED';
  currency: string;
};

type Cycle = {
  id: string;
  challenge_id: string;
  cycle_number: number;
  starts_at: string;
  ends_at: string;
  status: 'DRAFT' | 'SCHEDULED' | 'ACTIVE' | 'ENDED' | 'ARCHIVED';
};

type Tier = {
  id: string;
  challenge_cycle_id: string;
  sort_order: number;
  sales_required: number;
  reward_type: 'CASH' | 'PRIZE' | 'CASH_OR_PRIZE';
  cash_reward: number;
  prize_name: string | null;
  prize_description: string | null;
  enabled: boolean;
};

type Participant = {
  current_cycle_tier_id: string | null;
  current_tier_sales: number;
  lifetime_qualified_sales: number;
  status: 'ACTIVE' | 'COMPLETED' | 'EXPIRED';
};

type Claim = {
  id: string;
  cycle_tier_id: string;
  sales_target_snapshot: number;
  reward_choice: 'CASH' | 'PRIZE';
  cash_amount_snapshot: number;
  prize_name_snapshot: string | null;
  status: string;
  payout_status: string;
  claimed_at: string;
  needs_review: boolean;
};

type EligibleProduct = {
  product_id: string;
  product_name_snapshot: string;
  price_snapshot: number;
  affiliate_pct_snapshot: number;
  active: boolean;
};

type LeaderboardRow = {
  user_id: string;
  display_name: string;
  lifetime_qualified_sales: number;
  rank: number;
};

const formatMoney = (value: number, currency = 'NGN') =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const formatTime = (ms: number) => {
  if (ms <= 0) return 'Ended';
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return \`\${days}d \${hours}h \${minutes}m\`;
  return \`\${hours}h \${minutes}m\`;
};

export default function SalesChallengePage() {
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [products, setProducts] = useState<EligibleProduct[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [affiliateEarnings, setAffiliateEarnings] = useState(0);
  const [error, setError] = useState('');
  const [nowTick, setNowTick] = useState(Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;
      if (!user) throw new Error('Sign in to view your challenge progress.');

      const { data: challengeData, error: challengeError } = await supabase
        .from('sales_challenges')
        .select('*')
        .in('status', ['ACTIVE', 'SCHEDULED', 'ENDED'])
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (challengeError) throw challengeError;
      if (!challengeData) {
        setChallenge(null);
        setCycle(null);
        setTiers([]);
        setParticipant(null);
        setClaims([]);
        setProducts([]);
        setLeaderboard([]);
        return;
      }

      const currentChallenge = challengeData as Challenge;
      setChallenge(currentChallenge);

      const { data: cycleData, error: cycleError } = await supabase
        .from('sales_challenge_cycles')
        .select('*')
        .eq('challenge_id', currentChallenge.id)
        .in('status', ['ACTIVE', 'SCHEDULED', 'ENDED'])
        .order('cycle_number', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cycleError) throw cycleError;
      if (!cycleData) {
        setCycle(null);
        return;
      }

      const currentCycle = cycleData as Cycle;
      setCycle(currentCycle);

      const [tiersRes, participantRes, claimsRes, productsRes, leaderRes, userRes] = await Promise.all([
        supabase.from('sales_challenge_cycle_tiers').select('*')
          .eq('challenge_cycle_id', currentCycle.id).eq('enabled', true).order('sort_order'),
        supabase.from('sales_challenge_participants').select('*')
          .eq('challenge_cycle_id', currentCycle.id).eq('user_id', user.id).maybeSingle(),
        supabase.from('sales_challenge_claims').select('*')
          .eq('challenge_cycle_id', currentCycle.id).eq('user_id', user.id).order('claimed_at', { ascending: false }),
        supabase.from('sales_challenge_cycle_products').select('*')
          .eq('challenge_cycle_id', currentCycle.id).eq('active', true).eq('meets_minimum_product_price', true)
          .order('price_snapshot'),
        supabase.from('sales_challenge_leaderboard_view').select('*')
          .eq('challenge_cycle_id', currentCycle.id).order('rank').limit(50),
        supabase.from('users').select('affiliate_earnings').eq('id', user.id).maybeSingle(),
      ]);

      for (const result of [tiersRes, participantRes, claimsRes, productsRes, leaderRes, userRes]) {
        if (result.error) throw result.error;
      }

      setTiers((tiersRes.data || []) as Tier[]);
      setParticipant((participantRes.data || null) as Participant | null);
      setClaims((claimsRes.data || []) as Claim[]);
      setProducts((productsRes.data || []) as EligibleProduct[]);
      setLeaderboard((leaderRes.data || []) as LeaderboardRow[]);
      setAffiliateEarnings(Number((userRes.data as { affiliate_earnings?: number } | null)?.affiliate_earnings || 0));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load the challenge.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  const currentTier = useMemo(
    () => tiers.find(t => t.id === participant?.current_cycle_tier_id) || null,
    [tiers, participant?.current_cycle_tier_id],
  );

  const claimedTierIds = useMemo(() => new Set(claims.map(c => c.cycle_tier_id)), [claims]);
  const currentSales = Number(participant?.current_tier_sales || 0);
  const target = Number(currentTier?.sales_required || 0);
  const missionComplete = Boolean(currentTier && currentSales >= target);
  const remaining = Math.max(0, target - currentSales);
  const progress = target > 0 ? Math.min(100, (currentSales / target) * 100) : 0;
  const myRank = leaderboard.find(row => row.user_id === (undefined as unknown as string))?.rank;
  const bonusesEarned = claims
    .filter(c => c.status !== 'REJECTED' && c.reward_choice === 'CASH')
    .reduce((sum, c) => sum + Number(c.cash_amount_snapshot || 0), 0);

  const claim = async (choice?: 'CASH' | 'PRIZE') => {
    if (!cycle || claiming) return;
    setClaiming(true);
    setError('');
    try {
      const { error: claimError } = await supabase.rpc('claim_sales_challenge_reward', {
        p_cycle_id: cycle.id,
        p_reward_choice: choice || null,
      });
      if (claimError) throw claimError;
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to claim this reward.');
    } finally {
      setClaiming(false);
    }
  };

  if (loading) {
    return <div className="min-h-[60vh] grid place-items-center"><Loader2 className="w-8 h-8 animate-spin text-slate-500" /></div>;
  }

  if (!challenge || !cycle) {
    return (
      <div className="max-w-5xl mx-auto p-4 md:p-8">
        <div className="rounded-3xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 p-8 text-center shadow-sm">
          <Trophy className="w-12 h-12 mx-auto text-amber-500 mb-4" />
          <h1 className="text-2xl font-black text-slate-950 dark:text-white">DRIGHT Sales Challenge</h1>
          <p className="mt-2 text-slate-600 dark:text-slate-300">There is no scheduled or active sales challenge yet. Admin must review the dates, products, rewards and financial safety preview before activation.</p>
        </div>
      </div>
    );
  }

  const timeRemaining = new Date(cycle.ends_at).getTime() - nowTick;
  const currentRank = leaderboard.find(row => row.user_id && row.lifetime_qualified_sales === participant?.lifetime_qualified_sales)?.rank;

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">
      <section className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
        <div className="p-6 md:p-8 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white">
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wider">
            <span className="rounded-full bg-white/10 px-3 py-1">Cycle {cycle.cycle_number}</span>
            <span className="rounded-full bg-emerald-500/20 text-emerald-200 px-3 py-1">{cycle.status}</span>
          </div>
          <h1 className="mt-4 text-3xl md:text-5xl font-black tracking-tight">{challenge.title}</h1>
          <p className="mt-2 text-lg text-slate-200">{challenge.tagline}</p>
          <p className="mt-4 max-w-3xl text-sm md:text-base text-slate-300">{challenge.short_description}</p>
        </div>
      </section>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">{error}</div>}

      <div className="grid lg:grid-cols-[1.5fr_1fr] gap-6">
        <section className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wider font-bold text-slate-500">Current Mission</p>
              <h2 className="mt-1 text-3xl font-black text-slate-950 dark:text-white">
                {participant?.status === 'COMPLETED' ? 'All missions complete' : currentTier ? \`\${currentSales} / \${target} Sales\` : '0 / —'}
              </h2>
            </div>
            <Target className="w-10 h-10 text-amber-500" />
          </div>

          <div className="mt-5 h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: \`\${progress}%\` }} />
          </div>

          {currentTier && (
            <div className="mt-5 grid sm:grid-cols-2 gap-4">
              <div className="rounded-2xl bg-slate-50 dark:bg-slate-800 p-4">
                <p className="text-xs font-bold uppercase text-slate-500">Next Reward</p>
                <p className="mt-1 text-xl font-black text-slate-950 dark:text-white">
                  {currentTier.reward_type === 'PRIZE'
                    ? currentTier.prize_name || 'Physical prize'
                    : formatMoney(currentTier.cash_reward, challenge.currency)}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 dark:bg-slate-800 p-4">
                <p className="text-xs font-bold uppercase text-slate-500">Remaining</p>
                <p className="mt-1 text-xl font-black text-slate-950 dark:text-white">{remaining} sales</p>
              </div>
            </div>
          )}

          {missionComplete && currentTier && (
            <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
              <div className="flex gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
                <div className="flex-1">
                  <p className="font-black text-emerald-900">Mission Complete</p>
                  <p className="text-sm text-emerald-700 mt-1">{challenge.completed_tier_message}</p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    {currentTier.reward_type !== 'CASH_OR_PRIZE' && (
                      <button onClick={() => void claim()} disabled={claiming}
                        className="px-5 py-3 rounded-xl bg-slate-950 text-white font-bold disabled:opacity-50">
                        {claiming ? 'Validating…' : 'Claim Reward'}
                      </button>
                    )}
                    {currentTier.reward_type === 'CASH_OR_PRIZE' && (
                      <>
                        <button onClick={() => void claim('CASH')} disabled={claiming}
                          className="px-5 py-3 rounded-xl bg-slate-950 text-white font-bold disabled:opacity-50">
                          Claim {formatMoney(currentTier.cash_reward, challenge.currency)}
                        </button>
                        <button onClick={() => void claim('PRIZE')} disabled={claiming}
                          className="px-5 py-3 rounded-xl border border-slate-300 bg-white text-slate-900 font-bold disabled:opacity-50">
                          Claim {currentTier.prize_name || 'Prize'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="grid grid-cols-2 gap-3">
          {[
            { label: 'Cycle Sales', value: String(participant?.lifetime_qualified_sales || 0), icon: ShoppingBag },
            { label: 'Affiliate Earnings', value: formatMoney(affiliateEarnings, challenge.currency), icon: Wallet },
            { label: 'Challenge Bonuses', value: formatMoney(bonusesEarned, challenge.currency), icon: Gift },
            { label: 'Current Rank', value: currentRank ? \`#\${currentRank}\` : '—', icon: Medal },
            { label: 'Time Remaining', value: formatTime(timeRemaining), icon: Clock3 },
            { label: 'Eligible Products', value: String(products.length), icon: Package },
          ].map(item => (
            <div key={item.label} className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
              <item.icon className="w-5 h-5 text-slate-500" />
              <p className="mt-4 text-xs font-bold uppercase text-slate-500">{item.label}</p>
              <p className="mt-1 text-lg font-black text-slate-950 dark:text-white break-words">{item.value}</p>
            </div>
          ))}
        </section>
      </div>

      <section className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-slate-950 dark:text-white">Eligible Products</h2>
            <p className="text-sm text-slate-500 mt-1">Only Admin-selected products in this cycle count toward the challenge.</p>
          </div>
          <button onClick={() => void load()} className="p-2 rounded-xl border border-slate-200 dark:border-slate-700" aria-label="Refresh challenge">
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
        <div className="mt-4 grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {products.map(product => (
            <Link key={product.product_id} to={\`/product/\${product.product_id}\`}
              className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4 hover:border-slate-400 transition-colors">
              <p className="font-bold text-slate-950 dark:text-white">{product.product_name_snapshot}</p>
              <div className="mt-3 flex justify-between text-sm text-slate-500">
                <span>{formatMoney(product.price_snapshot, challenge.currency)}</span>
                <span>{Number(product.affiliate_pct_snapshot || 0).toFixed(0)}% affiliate</span>
              </div>
            </Link>
          ))}
          {products.length === 0 && <p className="text-sm text-slate-500">No eligible products are available in this cycle.</p>}
        </div>
      </section>

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm">
          <h2 className="text-xl font-black text-slate-950 dark:text-white">Mission Ladder</h2>
          <div className="mt-4 space-y-3">
            {tiers.map(tier => {
              const claimed = claimedTierIds.has(tier.id);
              const active = participant?.current_cycle_tier_id === tier.id;
              return (
                <div key={tier.id} className={\`flex items-center gap-3 rounded-2xl border p-4 \${active ? 'border-amber-300 bg-amber-50/60' : 'border-slate-200 dark:border-slate-700'}\`}>
                  <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 grid place-items-center font-black text-sm">{tier.sort_order}</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-950 dark:text-white">{tier.sales_required.toLocaleString()} fresh sales</p>
                    <p className="text-sm text-slate-500">
                      {tier.reward_type === 'PRIZE' ? tier.prize_name || 'Prize' : formatMoney(tier.cash_reward, challenge.currency)}
                    </p>
                  </div>
                  {claimed ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : active ? <Target className="w-5 h-5 text-amber-500" /> : <Award className="w-5 h-5 text-slate-400" />}
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm">
          <h2 className="text-xl font-black text-slate-950 dark:text-white">Top Affiliates</h2>
          <p className="text-sm text-slate-500 mt-1">Ranked by lifetime qualified sales in this cycle only.</p>
          <div className="mt-4 space-y-2">
            {leaderboard.slice(0, 10).map(row => (
              <div key={row.user_id} className="flex items-center gap-3 rounded-xl bg-slate-50 dark:bg-slate-800 p-3">
                <span className="w-8 font-black text-slate-500">#{row.rank}</span>
                <span className="flex-1 font-semibold text-slate-900 dark:text-white truncate">{row.display_name}</span>
                <span className="font-black text-slate-700 dark:text-slate-200">{row.lifetime_qualified_sales.toLocaleString()}</span>
              </div>
            ))}
            {leaderboard.length === 0 && <p className="text-sm text-slate-500">The leaderboard will populate after qualified sales begin.</p>}
          </div>
        </section>
      </div>

      <section className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm">
        <h2 className="text-xl font-black text-slate-950 dark:text-white">Claimed Rewards</h2>
        <div className="mt-4 grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {claims.map(claimRow => (
            <div key={claimRow.id} className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
              <p className="text-xs font-bold uppercase text-slate-500">{claimRow.status} · {claimRow.payout_status}</p>
              <p className="mt-2 font-black text-slate-950 dark:text-white">
                {claimRow.reward_choice === 'CASH'
                  ? formatMoney(claimRow.cash_amount_snapshot, challenge.currency)
                  : claimRow.prize_name_snapshot || 'Prize'}
              </p>
              <p className="mt-1 text-sm text-slate-500">{claimRow.sales_target_snapshot.toLocaleString()} fresh sales mission</p>
              {claimRow.needs_review && <p className="mt-2 text-xs font-bold text-amber-700">Admin review required</p>}
            </div>
          ))}
          {claims.length === 0 && <p className="text-sm text-slate-500">No rewards claimed in this cycle yet.</p>}
        </div>
      </section>
    </div>
  );
}
