import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, ArrowRight, Award, Loader2, Medal, Target, Trophy, Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCurrency } from '../../contexts/CurrencyContext';
import { supabase } from '../../lib/supabase';

type Challenge = {
  id: string;
  title: string;
  currency: string;
};

type Cycle = {
  id: string;
  cycle_number: number;
  ends_at: string;
};

type Tier = {
  id: string;
  sales_required: number;
};

type Leader = {
  user_id: string;
  display_name: string;
  lifetime_qualified_sales: number;
  rank: number;
};

type Participant = {
  user_id: string;
  current_cycle_tier_id: string | null;
  current_tier_sales: number;
  lifetime_qualified_sales: number;
  status: string;
  joined_at: string;
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
  claimed_at: string;
};

type UserName = {
  id: string;
  full_name: string | null;
};

type ActivityItem = {
  id: string;
  timestamp: string;
  userId: string;
  type: 'joined' | 'claim';
  text: string;
  needsReview?: boolean;
};

const shortUser = (id: string) => `User ${id.slice(0, 8)}`;

export default function AdminSalesChallengeDashboardPanel({ className = '' }: { className?: string }) {
  const { format } = useCurrency();
  const [loading, setLoading] = useState(true);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [leaderParticipants, setLeaderParticipants] = useState<Participant[]>([]);
  const [recentParticipants, setRecentParticipants] = useState<Participant[]>([]);
  const [recentClaims, setRecentClaims] = useState<Claim[]>([]);
  const [participantCount, setParticipantCount] = useState(0);
  const [claimCount, setClaimCount] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);
  const [names, setNames] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: challengeData, error: challengeError } = await supabase
        .from('sales_challenges')
        .select('id,title,currency')
        .eq('status', 'ACTIVE')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (challengeError) throw challengeError;
      if (!challengeData) {
        setChallenge(null);
        return;
      }

      const currentChallenge = challengeData as Challenge;
      const { data: cycleData, error: cycleError } = await supabase
        .from('sales_challenge_cycles')
        .select('id,cycle_number,ends_at')
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
      const [
        tiersRes,
        leadersRes,
        recentParticipantsRes,
        recentClaimsRes,
        participantCountRes,
        claimCountRes,
        reviewCountRes,
      ] = await Promise.all([
        supabase
          .from('sales_challenge_cycle_tiers')
          .select('id,sales_required')
          .eq('challenge_cycle_id', currentCycle.id)
          .eq('enabled', true)
          .order('sort_order'),
        supabase
          .from('sales_challenge_leaderboard_view')
          .select('user_id,display_name,lifetime_qualified_sales,rank')
          .eq('challenge_cycle_id', currentCycle.id)
          .order('rank')
          .limit(5),
        supabase
          .from('sales_challenge_participants')
          .select('user_id,current_cycle_tier_id,current_tier_sales,lifetime_qualified_sales,status,joined_at')
          .eq('challenge_cycle_id', currentCycle.id)
          .order('joined_at', { ascending: false })
          .limit(8),
        supabase
          .from('sales_challenge_claims')
          .select('id,user_id,sales_target_snapshot,reward_choice,cash_amount_snapshot,prize_name_snapshot,status,payout_status,needs_review,claimed_at')
          .eq('challenge_cycle_id', currentCycle.id)
          .order('claimed_at', { ascending: false })
          .limit(8),
        supabase
          .from('sales_challenge_participants')
          .select('*', { count: 'exact', head: true })
          .eq('challenge_cycle_id', currentCycle.id),
        supabase
          .from('sales_challenge_claims')
          .select('*', { count: 'exact', head: true })
          .eq('challenge_cycle_id', currentCycle.id)
          .neq('status', 'REJECTED'),
        supabase
          .from('sales_challenge_claims')
          .select('*', { count: 'exact', head: true })
          .eq('challenge_cycle_id', currentCycle.id)
          .eq('needs_review', true),
      ]);

      for (const result of [
        tiersRes,
        leadersRes,
        recentParticipantsRes,
        recentClaimsRes,
        participantCountRes,
        claimCountRes,
        reviewCountRes,
      ]) {
        if (result.error) throw result.error;
      }

      const topLeaders = (leadersRes.data || []) as Leader[];
      let topParticipants: Participant[] = [];
      if (topLeaders.length > 0) {
        const { data, error } = await supabase
          .from('sales_challenge_participants')
          .select('user_id,current_cycle_tier_id,current_tier_sales,lifetime_qualified_sales,status,joined_at')
          .eq('challenge_cycle_id', currentCycle.id)
          .in('user_id', topLeaders.map((leader) => leader.user_id));
        if (error) throw error;
        topParticipants = (data || []) as Participant[];
      }

      const recentParticipants = (recentParticipantsRes.data || []) as Participant[];
      const recentClaims = (recentClaimsRes.data || []) as Claim[];
      const userIds = Array.from(new Set([
        ...topLeaders.map((leader) => leader.user_id),
        ...recentParticipants.map((participant) => participant.user_id),
        ...recentClaims.map((claim) => claim.user_id),
      ]));

      let userNames: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: userRows, error: userError } = await supabase
          .from('users')
          .select('id,full_name')
          .in('id', userIds);
        if (!userError) {
          userNames = Object.fromEntries(
            ((userRows || []) as UserName[]).map((row) => [row.id, row.full_name || shortUser(row.id)]),
          );
        }
      }

      setChallenge(currentChallenge);
      setCycle(currentCycle);
      setTiers((tiersRes.data || []) as Tier[]);
      setLeaders(topLeaders);
      setLeaderParticipants(topParticipants);
      setRecentParticipants(recentParticipants);
      setRecentClaims(recentClaims);
      setParticipantCount(participantCountRes.count || 0);
      setClaimCount(claimCountRes.count || 0);
      setReviewCount(reviewCountRes.count || 0);
      setNames(userNames);
    } catch (error) {
      console.error('Unable to load admin sales challenge dashboard panel:', error);
      setChallenge(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const participantMap = useMemo(
    () => new Map(leaderParticipants.map((participant) => [participant.user_id, participant])),
    [leaderParticipants],
  );
  const tierMap = useMemo(() => new Map(tiers.map((tier) => [tier.id, tier])), [tiers]);

  const activity = useMemo<ActivityItem[]>(() => {
    const joined: ActivityItem[] = recentParticipants.map((participant) => ({
      id: `joined-${participant.user_id}`,
      timestamp: participant.joined_at,
      userId: participant.user_id,
      type: 'joined',
      text: `entered the challenge with ${participant.lifetime_qualified_sales.toLocaleString()} qualified sales recorded this cycle`,
    }));
    const claims: ActivityItem[] = recentClaims.map((claim) => {
      const reward = claim.reward_choice === 'CASH'
        ? challenge ? format(Number(claim.cash_amount_snapshot || 0), challenge.currency) : 'cash reward'
        : claim.prize_name_snapshot || 'prize';
      return {
        id: `claim-${claim.id}`,
        timestamp: claim.claimed_at,
        userId: claim.user_id,
        type: 'claim',
        text: `claimed the ${claim.sales_target_snapshot.toLocaleString()}-sale mission reward (${reward}) · ${claim.status}/${claim.payout_status}`,
        needsReview: claim.needs_review,
      };
    });
    return [...joined, ...claims]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 8);
  }, [challenge, format, recentClaims, recentParticipants]);

  if (loading) {
    return (
      <div className={`rounded-3xl border border-gray-100 bg-white p-8 grid place-items-center ${className}`}>
        <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
      </div>
    );
  }

  if (!challenge || !cycle) return null;

  const topScore = Number(leaders[0]?.lifetime_qualified_sales || 0);

  return (
    <section className={`rounded-3xl border border-gray-100 bg-white shadow-sm overflow-hidden ${className}`}>
      <div className="p-5 md:p-6 bg-gradient-to-br from-slate-950 to-slate-800 text-white">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-emerald-300">
              <Trophy className="w-4 h-4" />
              Live Sales Challenge · Cycle {cycle.cycle_number}
            </div>
            <h2 className="mt-2 text-2xl font-black">{challenge.title}</h2>
            <p className="mt-1 text-sm text-slate-300">Admin snapshot of affiliate progress, ranking and reward activity.</p>
          </div>
          <Link
            to="/admin/sales-challenges"
            className="rounded-xl bg-white/10 hover:bg-white/20 px-4 py-2 text-sm font-bold flex items-center gap-2 transition"
          >
            Manage Challenge <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Participants', value: participantCount.toLocaleString(), icon: Users },
            { label: 'Top Score', value: `${topScore.toLocaleString()} sales`, icon: Medal },
            { label: 'Rewards Claimed', value: claimCount.toLocaleString(), icon: Award },
            { label: 'Needs Review', value: reviewCount.toLocaleString(), icon: AlertTriangle },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl bg-white/10 p-3">
              <div className="flex items-center gap-2 text-slate-300">
                <item.icon className="w-4 h-4" />
                <span className="text-[10px] uppercase tracking-wide font-bold">{item.label}</span>
              </div>
              <p className="mt-1 text-lg font-black">{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid xl:grid-cols-2 gap-0 xl:divide-x divide-gray-100">
        <div className="p-5 md:p-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="font-black text-gray-900">Leaderboard Progress</h3>
              <p className="text-xs text-gray-500">Top affiliates and their current mission</p>
            </div>
            <Target className="w-5 h-5 text-amber-500" />
          </div>

          {leaders.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-gray-200 p-5 text-sm text-gray-500 text-center">
              No qualified challenge sales yet.
            </p>
          ) : (
            <div className="space-y-3">
              {leaders.map((leader) => {
                const participant = participantMap.get(leader.user_id);
                const tier = participant?.current_cycle_tier_id
                  ? tierMap.get(participant.current_cycle_tier_id)
                  : null;
                const current = Number(participant?.current_tier_sales || 0);
                const target = Number(tier?.sales_required || 0);
                const progress = target > 0 ? Math.min(100, (current / target) * 100) : 100;
                return (
                  <div key={leader.user_id} className="rounded-2xl border border-gray-100 p-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gray-100 grid place-items-center text-xs font-black">#{leader.rank}</div>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-sm text-gray-900 truncate">{leader.display_name || names[leader.user_id] || shortUser(leader.user_id)}</p>
                        <p className="text-xs text-gray-500">{leader.lifetime_qualified_sales.toLocaleString()} lifetime cycle sales</p>
                      </div>
                      <p className="text-xs font-black text-gray-700">
                        {participant?.status === 'COMPLETED'
                          ? 'COMPLETED'
                          : target > 0 ? `${current.toLocaleString()}/${target.toLocaleString()}` : '—'}
                      </p>
                    </div>
                    {target > 0 && participant?.status !== 'COMPLETED' && (
                      <div className="mt-3 h-2 rounded-full bg-gray-100 overflow-hidden">
                        <div className="h-full bg-amber-500 rounded-full" style={{ width: `${progress}%` }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-5 md:p-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="font-black text-gray-900">Recent Challenge Activity</h3>
              <p className="text-xs text-gray-500">Participant joins and reward claims</p>
            </div>
            <Activity className="w-5 h-5 text-primary-500" />
          </div>

          {activity.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-gray-200 p-5 text-sm text-gray-500 text-center">
              Challenge activity will appear here as affiliates participate.
            </p>
          ) : (
            <div className="space-y-3">
              {activity.map((item) => (
                <div key={item.id} className="flex gap-3">
                  <div className={`mt-1 w-2.5 h-2.5 rounded-full shrink-0 ${item.needsReview ? 'bg-amber-500' : item.type === 'claim' ? 'bg-emerald-500' : 'bg-primary-500'}`} />
                  <div className="min-w-0">
                    <p className="text-sm text-gray-700">
                      <span className="font-black text-gray-900">{names[item.userId] || shortUser(item.userId)}</span> {item.text}
                    </p>
                    <p className="mt-1 text-xs text-gray-400">
                      {new Date(item.timestamp).toLocaleString()}
                      {item.needsReview ? ' · REVIEW REQUIRED' : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
