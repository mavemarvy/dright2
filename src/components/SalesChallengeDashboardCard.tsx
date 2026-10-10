import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Medal, Package, ShieldCheck, Sparkles, Target, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { supabase } from '../lib/supabase';

type Challenge = {
  id: string;
  title: string;
  currency: string;
  minimum_product_price: number;
};

type Cycle = {
  id: string;
  cycle_number: number;
};

type Tier = {
  id: string;
  sort_order: number;
  sales_required: number;
  reward_type: 'CASH' | 'PRIZE' | 'CASH_OR_PRIZE';
  cash_reward: number;
  prize_name: string | null;
};

type Participant = {
  current_cycle_tier_id: string | null;
  current_tier_sales: number;
  lifetime_qualified_sales: number;
  status: 'ACTIVE' | 'COMPLETED' | 'EXPIRED';
};

type Leader = {
  user_id: string;
  display_name: string;
  lifetime_qualified_sales: number;
  rank: number;
};

type EligibleProduct = {
  product_id: string;
  product_name_snapshot: string;
  price_snapshot: number;
  affiliate_pct_snapshot: number;
};

const plural = (value: number, singular: string, pluralValue = `${singular}s`) =>
  `${value.toLocaleString()} ${value === 1 ? singular : pluralValue}`;

export default function SalesChallengeDashboardCard({ className = '' }: { className?: string }) {
  const { user } = useAuth();
  const { format } = useCurrency();
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [products, setProducts] = useState<EligibleProduct[]>([]);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: challengeData, error: challengeError } = await supabase
        .from('sales_challenges')
        .select('id,title,currency,minimum_product_price')
        .eq('status', 'ACTIVE')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (challengeError) throw challengeError;
      if (!challengeData) {
        setChallenge(null);
        setCycle(null);
        setTiers([]);
        setParticipant(null);
        setLeaders([]);
        setProducts([]);
        setMyRank(null);
        return;
      }

      const currentChallenge = challengeData as Challenge;
      const { data: cycleData, error: cycleError } = await supabase
        .from('sales_challenge_cycles')
        .select('id,cycle_number')
        .eq('challenge_id', currentChallenge.id)
        .eq('status', 'ACTIVE')
        .order('cycle_number', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cycleError) throw cycleError;
      if (!cycleData) {
        setChallenge(null);
        return;
      }

      const currentCycle = cycleData as Cycle;
      const [tiersRes, participantRes, leadersRes, productsRes, rankRes] = await Promise.all([
        supabase
          .from('sales_challenge_cycle_tiers')
          .select('id,sort_order,sales_required,reward_type,cash_reward,prize_name')
          .eq('challenge_cycle_id', currentCycle.id)
          .eq('enabled', true)
          .order('sort_order'),
        supabase
          .from('sales_challenge_participants')
          .select('current_cycle_tier_id,current_tier_sales,lifetime_qualified_sales,status')
          .eq('challenge_cycle_id', currentCycle.id)
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('sales_challenge_leaderboard_view')
          .select('user_id,display_name,lifetime_qualified_sales,rank')
          .eq('challenge_cycle_id', currentCycle.id)
          .order('rank')
          .limit(5),
        supabase
          .from('sales_challenge_cycle_products')
          .select('product_id,product_name_snapshot,price_snapshot,affiliate_pct_snapshot')
          .eq('challenge_cycle_id', currentCycle.id)
          .eq('active', true)
          .eq('meets_minimum_product_price', true)
          .order('price_snapshot'),
        supabase.rpc('get_sales_challenge_my_rank', { p_cycle_id: currentCycle.id }),
      ]);

      for (const result of [tiersRes, participantRes, leadersRes, productsRes, rankRes]) {
        if (result.error) throw result.error;
      }

      setChallenge(currentChallenge);
      setCycle(currentCycle);
      setTiers((tiersRes.data || []) as Tier[]);
      setParticipant((participantRes.data || null) as Participant | null);
      setLeaders((leadersRes.data || []) as Leader[]);
      setProducts((productsRes.data || []) as EligibleProduct[]);
      setMyRank(rankRes.data == null ? null : Number(rankRes.data));
    } catch (error) {
      console.error('Unable to load sales challenge dashboard card:', error);
      setChallenge(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const currentTier = useMemo(() => {
    if (participant?.status === 'COMPLETED') return null;
    return tiers.find((tier) => tier.id === participant?.current_cycle_tier_id) || tiers[0] || null;
  }, [participant, tiers]);

  if (loading || !challenge || !cycle || tiers.length === 0) return null;

  const currentSales = Number(participant?.current_tier_sales || 0);
  const lifetimeSales = Number(participant?.lifetime_qualified_sales || 0);
  const target = Number(currentTier?.sales_required || 0);
  const remaining = Math.max(0, target - currentSales);
  const progress = target > 0 ? Math.min(100, (currentSales / target) * 100) : 100;
  const currentLevelIndex = currentTier
    ? Math.max(0, tiers.findIndex((tier) => tier.id === currentTier.id))
    : tiers.length;
  const currentLevel = currentTier ? currentLevelIndex + 1 : tiers.length;
  const nextTier = currentTier ? tiers[currentLevelIndex + 1] || null : null;

  const rewardLabel = (tier: Tier | null) => {
    if (!tier) return 'Champion status';
    if (tier.reward_type === 'PRIZE') return tier.prize_name || 'your prize';
    if (tier.reward_type === 'CASH_OR_PRIZE' && tier.prize_name) {
      return `${format(Number(tier.cash_reward || 0), challenge.currency)} or ${tier.prize_name}`;
    }
    return format(Number(tier.cash_reward || 0), challenge.currency);
  };

  const currentReward = rewardLabel(currentTier);
  const motivationalMessage = participant?.status === 'COMPLETED'
    ? 'You completed every mission in this cycle. Keep your position strong until the challenge closes.'
    : currentTier && currentSales >= target
      ? `Mission complete — claim ${currentReward} now to unlock Level ${Math.min(currentLevel + 1, tiers.length)}.`
      : currentSales === 0
        ? `Your climb starts with one qualifying sale. Reach ${target.toLocaleString()} sales to unlock ${currentReward}.`
        : progress >= 90
          ? `Almost there — only ${plural(remaining, 'sale')} left to unlock ${currentReward}.`
          : progress >= 50
            ? `You are past halfway. Keep the momentum: ${plural(remaining, 'sale')} to ${currentReward}.`
            : `Keep moving — every eligible sale counts. ${plural(remaining, 'sale')} to unlock ${currentReward}.`;

  return (
    <section className={`rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden ${className}`}>
      <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white p-5 md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-emerald-300">
              <Trophy className="w-4 h-4" />
              Sales Challenge · Cycle {cycle.cycle_number}
            </div>
            <h2 className="mt-2 text-xl md:text-2xl font-black">{challenge.title}</h2>
            <p className="mt-2 text-sm text-slate-300">{motivationalMessage}</p>
          </div>
          <Sparkles className="w-7 h-7 text-amber-400 shrink-0" />
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-white/10 p-3">
            <p className="text-[10px] uppercase tracking-wide text-slate-300 font-bold">Your Level</p>
            <p className="mt-1 text-lg font-black">{participant?.status === 'COMPLETED' ? 'Champion' : `Level ${currentLevel}`}</p>
          </div>
          <div className="rounded-2xl bg-white/10 p-3">
            <p className="text-[10px] uppercase tracking-wide text-slate-300 font-bold">Cycle Sales</p>
            <p className="mt-1 text-lg font-black">{lifetimeSales.toLocaleString()}</p>
          </div>
          <div className="rounded-2xl bg-white/10 p-3">
            <p className="text-[10px] uppercase tracking-wide text-slate-300 font-bold">Your Rank</p>
            <p className="mt-1 text-lg font-black">{myRank ? `#${myRank}` : '—'}</p>
          </div>
        </div>
      </div>

      <div className="p-5 md:p-6">
        {currentTier ? (
          <>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-slate-500">Current Mission</p>
                <p className="mt-1 text-2xl font-black text-slate-950 dark:text-white">
                  {currentSales.toLocaleString()} / {target.toLocaleString()}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-black uppercase tracking-wider text-slate-500">Unlock</p>
                <p className="mt-1 font-black text-amber-600 dark:text-amber-400">{currentReward}</p>
              </div>
            </div>
            <div className="mt-4 h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-500">
              <span>{Math.round(progress)}% complete</span>
              <span>{plural(remaining, 'sale')} remaining</span>
            </div>
            {nextTier && (
              <div className="mt-4 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/50 p-3 flex items-center gap-3">
                <Target className="w-5 h-5 text-amber-600 shrink-0" />
                <p className="text-sm text-slate-700 dark:text-slate-200">
                  <span className="font-black">Next level:</span> Level {currentLevel + 1} needs {nextTier.sales_required.toLocaleString()} fresh sales and unlocks {rewardLabel(nextTier)}.
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/20 p-4 text-sm font-bold text-emerald-700 dark:text-emerald-300">
            All challenge levels completed for this cycle.
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800 p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-300 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-black text-slate-950 dark:text-white">Challenge Rules</h3>
              <ul className="mt-2 space-y-1.5 text-sm text-slate-700 dark:text-slate-200">
                <li>• Only products explicitly selected by DRIGHT Admin for this cycle count.</li>
                <li>• A selected product must cost at least <b>{format(Number(challenge.minimum_product_price || 0), challenge.currency)}</b> for this challenge.</li>
                <li>• Only legitimate completed affiliate sales count, and each eligible order counts once.</li>
                <li>• After you claim a mission reward, the next mission starts fresh from 0 sales.</li>
                <li>• Your normal affiliate commission is separate from challenge rewards.</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <h3 className="font-black text-slate-950 dark:text-white">Admin-Selected Eligible Products</h3>
              <p className="text-xs text-slate-500">{products.length} product{products.length === 1 ? '' : 's'} currently count toward this cycle</p>
            </div>
            <Package className="w-5 h-5 text-primary-500" />
          </div>
          {products.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 p-4 text-sm text-slate-500 text-center">
              Admin has not selected any qualifying products for this cycle yet.
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-2">
              {products.slice(0, 6).map((product) => (
                <Link
                  key={product.product_id}
                  to={`/product/${product.product_id}`}
                  className="rounded-2xl border border-slate-200 dark:border-slate-700 p-3 hover:border-slate-400 transition-colors"
                >
                  <p className="text-sm font-black text-slate-950 dark:text-white line-clamp-2">{product.product_name_snapshot}</p>
                  <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-500">
                    <span>{format(Number(product.price_snapshot || 0), challenge.currency)}</span>
                    <span>{Number(product.affiliate_pct_snapshot || 0).toFixed(0)}% affiliate</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
          {products.length > 6 && (
            <p className="mt-2 text-xs text-slate-500">+{products.length - 6} more eligible products are listed on the full challenge page.</p>
          )}
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <h3 className="font-black text-slate-950 dark:text-white">Top Affiliates</h3>
              <p className="text-xs text-slate-500">Live cycle leaderboard</p>
            </div>
            <Medal className="w-5 h-5 text-amber-500" />
          </div>

          {leaders.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 p-4 text-center text-sm text-slate-500">
              The leaderboard will appear after the first qualified sale.
            </div>
          ) : (
            <div className="space-y-2">
              {leaders.map((leader) => {
                const isMe = leader.user_id === user?.id;
                return (
                  <div
                    key={leader.user_id}
                    className={`flex items-center gap-3 rounded-2xl border p-3 ${isMe
                      ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700'
                      : 'border-slate-100 dark:border-slate-800'}`}
                  >
                    <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 grid place-items-center text-xs font-black">
                      #{leader.rank}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm text-slate-900 dark:text-white truncate">
                        {isMe ? 'You' : leader.display_name}
                      </p>
                    </div>
                    <p className="text-sm font-black text-slate-900 dark:text-white">
                      {leader.lifetime_qualified_sales.toLocaleString()} sales
                    </p>
                  </div>
                );
              })}
              {myRank && myRank > 5 && (
                <div className="rounded-2xl bg-slate-50 dark:bg-slate-800 p-3 flex items-center justify-between text-sm">
                  <span className="font-bold text-slate-700 dark:text-slate-200">Your position</span>
                  <span className="font-black text-slate-950 dark:text-white">#{myRank}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <Link
          to="/sales-challenge"
          className="mt-5 w-full min-h-[46px] rounded-2xl bg-slate-950 dark:bg-white text-white dark:text-slate-950 font-black flex items-center justify-center gap-2 hover:opacity-90 transition"
        >
          View Full Challenge <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </section>
  );
}
