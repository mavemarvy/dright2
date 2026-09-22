import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Trophy, Clock, Loader2, Target, Crown, Medal, Users, ShoppingCart,
  Store, Share2, Rocket, History, ChevronDown, Bot,
} from 'lucide-react';
import SeoHead from '../components/SeoHead';
import {
  fetchMonthlyChallengeCatalog,
  fetchMonthlyLeaderboard,
  formatChallengeReward,
  challengeRewardForRank,
  subscribeToCompetitionActivity,
  type MonthlyChallengeDefinition,
  type MonthlyChallengePeriod,
  type MonthlyChallengeSection,
  type MonthlyLeaderboardEntry,
} from '../lib/monthlyChallenges';
import {
  getMyDrightStarterAffiliateProgress,
  renderDrightStarterTemplate,
  type DrightStarterAffiliateProgress,
} from '../lib/drightStarter';

const CHALLENGE_ICONS: Record<string, typeof Trophy> = {
  top_referrer: Users,
  top_buyer_referrer: ShoppingCart,
  top_seller: Store,
  top_affiliate: Share2,
  starter_affiliate: Rocket,
};

function nameFor(entry: MonthlyLeaderboardEntry): string {
  return entry.full_name || entry.username || 'DRIGHT User';
}

function metricText(challenge: MonthlyChallengeDefinition, entry: MonthlyLeaderboardEntry): string {
  const p = Number(entry.primary_metric || 0);
  const s = Number(entry.secondary_metric || 0);
  if (challenge.challenge_key === 'top_seller') {
    return `${p.toLocaleString()} sale${p === 1 ? '' : 's'} · ${s.toLocaleString()} approved upload${s === 1 ? '' : 's'}`;
  }
  if (challenge.challenge_key === 'top_affiliate' || challenge.challenge_key === 'starter_affiliate') {
    const earned = Number(entry.detail?.affiliate_earnings ?? s ?? 0);
    return `${p.toLocaleString()} ${challenge.metric_label} · ${earned.toLocaleString()} commission value`;
  }
  return `${p.toLocaleString()} ${challenge.metric_label}`;
}

function InitialAvatar({ entry, className = '' }: { entry: MonthlyLeaderboardEntry; className?: string }) {
  if (entry.avatar_url) {
    return <img src={entry.avatar_url} alt="" className={`w-full h-full rounded-full object-cover ${className}`} />;
  }
  return (
    <div className={`w-full h-full rounded-full bg-white/15 flex items-center justify-center font-black text-white ${className}`}>
      {entry.is_simulated ? <Bot className="w-1/2 h-1/2" /> : nameFor(entry).slice(0, 1).toUpperCase()}
    </div>
  );
}

function SourceBadge({ entry }: { entry: MonthlyLeaderboardEntry }) {
  if (!entry.is_simulated) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-cyan-300/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-cyan-200">
      <Bot className="w-3 h-3" /> {entry.source_label || 'AI challenger'}
    </span>
  );
}

function Podium({
  challenge,
  entries,
}: {
  challenge: MonthlyChallengeDefinition;
  entries: MonthlyLeaderboardEntry[];
}) {
  const top = entries.filter(e => e.is_ranked).slice(0, 3);
  if (top.length === 0) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/[0.06] px-5 py-10 text-center">
        <Trophy className="w-12 h-12 mx-auto text-violet-200/40 mb-3" />
        <p className="font-bold text-white">No ranked activity yet</p>
        <p className="text-sm text-violet-200 mt-1">Recent DRIGHT users still appear below as unranked participants until they record qualifying activity.</p>
      </div>
    );
  }

  const slots = [top[1], top[0], top[2]];
  const ranks = [2, 1, 3];

  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-4 items-end pt-4">
      {slots.map((entry, idx) => {
        const rank = ranks[idx];
        if (!entry) return <div key={rank} />;
        const isFirst = rank === 1;
        const reward = !entry.is_simulated && entry.reward_rank > 0
          ? challengeRewardForRank(challenge, entry.reward_rank)
          : 0;
        return (
          <motion.div
            key={entry.user_id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex flex-col items-center text-center ${rank === 2 ? 'pb-1' : rank === 3 ? 'pb-0' : 'pb-5'}`}
          >
            <div className="relative">
              <div className={`${isFirst ? 'w-20 h-20 sm:w-24 sm:h-24 ring-4 ring-amber-300' : 'w-16 h-16 sm:w-20 sm:h-20 ring-2 ring-white/40'} rounded-full overflow-hidden bg-violet-400/30 shadow-xl`}>
                <InitialAvatar entry={entry} />
              </div>
              <div className={`absolute -bottom-2 left-1/2 -translate-x-1/2 min-w-8 h-7 px-2 rounded-full flex items-center justify-center font-black text-xs shadow-lg ${rank === 1 ? 'bg-amber-300 text-violet-950' : rank === 2 ? 'bg-slate-200 text-slate-800' : 'bg-orange-300 text-orange-950'}`}>
                #{rank}
              </div>
              {isFirst && <Crown className="absolute -top-8 left-1/2 -translate-x-1/2 w-7 h-7 text-amber-300" />}
            </div>
            <p className="mt-5 text-xs sm:text-sm font-black text-white truncate w-full">{nameFor(entry)}</p>
            <div className="mt-1 min-h-[18px]"><SourceBadge entry={entry} /></div>
            <p className="mt-1 text-[10px] sm:text-xs text-violet-200 line-clamp-2">{metricText(challenge, entry)}</p>
            <p className="mt-2 text-[10px] sm:text-xs font-bold text-amber-200">
              {entry.is_simulated
                ? 'Benchmark only · no prize'
                : reward > 0
                  ? formatChallengeReward(reward, challenge.reward_currency)
                  : 'Prize rank outside top 3'}
            </p>
          </motion.div>
        );
      })}
    </div>
  );
}

export default function ChallengesPage() {
  const [period, setPeriod] = useState<MonthlyChallengePeriod>('current');
  const [section, setSection] = useState<MonthlyChallengeSection>('referral');
  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof fetchMonthlyChallengeCatalog>> | null>(null);
  const [selectedKey, setSelectedKey] = useState('');
  const [entries, setEntries] = useState<MonthlyLeaderboardEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [loadingBoard, setLoadingBoard] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [starterProgress, setStarterProgress] = useState<DrightStarterAffiliateProgress | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    void getMyDrightStarterAffiliateProgress().then(setStarterProgress);
  }, []);

  useEffect(() => {
    if (period !== 'current') return;
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, [period]);

  useEffect(() => {
    let alive = true;
    setLoadingCatalog(true);
    void fetchMonthlyChallengeCatalog(period)
      .then(data => {
        if (!alive) return;
        setCatalog(data);
        const available = data.challenges.filter(c => c.section === section);
        setSelectedKey(prev => available.some(c => c.challenge_key === prev) ? prev : (available[0]?.challenge_key ?? ''));
      })
      .finally(() => alive && setLoadingCatalog(false));
    return () => { alive = false; };
  }, [period, section]);

  const selected = useMemo(
    () => catalog?.challenges.find(c => c.challenge_key === selectedKey) ?? null,
    [catalog, selectedKey],
  );

  useEffect(() => {
    if (!selected) {
      setEntries([]);
      setTotal(0);
      return;
    }
    let alive = true;
    setLoadingBoard(true);
    void fetchMonthlyLeaderboard(selected.challenge_key, period, selected.display_limit, 0)
      .then(data => {
        if (!alive) return;
        setEntries(data.entries);
        setTotal(data.total);
      })
      .finally(() => alive && setLoadingBoard(false));
    return () => { alive = false; };
  }, [selected?.challenge_key, selected?.display_limit, period]);

  useEffect(() => {
    if (!selected || period !== 'current') return;
    let alive = true;
    let debounceId: number | null = null;

    const refresh = () => {
      if (debounceId) window.clearTimeout(debounceId);
      debounceId = window.setTimeout(() => {
        void Promise.all([
          fetchMonthlyChallengeCatalog(period),
          fetchMonthlyLeaderboard(selected.challenge_key, period, selected.display_limit, 0),
        ]).then(([nextCatalog, nextBoard]) => {
          if (!alive) return;
          setCatalog(nextCatalog);
          const available = nextCatalog.challenges.filter(c => c.section === section);
          setSelectedKey(prev => available.some(ch => ch.challenge_key === prev) ? prev : (available[0]?.challenge_key ?? ''));
          if (nextCatalog.challenges.some(ch => ch.challenge_key === selected.challenge_key)) {
            setEntries(nextBoard.entries);
            setTotal(nextBoard.total);
          }
        }).catch(() => {
          // Keep the last good leaderboard visible; the next realtime/poll cycle retries.
        });
      }, 300);
    };

    const unsubscribe = subscribeToCompetitionActivity(refresh);
    const intervalId = window.setInterval(refresh, 15_000);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);

    return () => {
      alive = false;
      unsubscribe();
      window.clearInterval(intervalId);
      if (debounceId) window.clearTimeout(debounceId);
      window.removeEventListener('focus', onFocus);
    };
  }, [period, section, selected?.challenge_key, selected?.display_limit]);

  const sectionChallenges = useMemo(
    () => (catalog?.challenges ?? []).filter(c => c.section === section),
    [catalog, section],
  );

  const historyPeriods = catalog?.history_periods ?? [];
  const periodLabel = period === 'current'
    ? 'Current Month'
    : historyPeriods.find(item => item.period === period)?.label
      ?? (catalog?.period_start ? new Date(`${catalog.period_start}T00:00:00Z`).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' }) : 'History');

  const countdown = useMemo(() => {
    if (period !== 'current' || !catalog?.period_end) return '';
    const ms = Math.max(0, new Date(`${catalog.period_end}T00:00:00Z`).getTime() - now);
    const days = Math.floor(ms / 86_400_000);
    const hours = Math.floor((ms % 86_400_000) / 3_600_000);
    const minutes = Math.floor((ms % 3_600_000) / 60_000);
    return `${days}d ${hours}h ${minutes}m`;
  }, [catalog?.period_end, now, period]);

  const loadMore = async () => {
    if (!selected || entries.length >= total) return;
    setLoadingMore(true);
    try {
      const data = await fetchMonthlyLeaderboard(
        selected.challenge_key,
        period,
        selected.display_limit,
        entries.length,
      );
      setEntries(prev => [...prev, ...data.entries]);
      setTotal(data.total);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <SeoHead
        title="DRIGHT Challenges"
        description="Compete in monthly DRIGHT referral, seller and affiliate leaderboards."
        canonical="/challenges"
      />

      <section className="bg-gradient-to-br from-amber-500 via-orange-500 to-orange-600 px-4 py-12 sm:py-16">
        <div className="max-w-5xl mx-auto text-center">
          <Trophy className="w-14 h-14 mx-auto mb-4 text-white/90" />
          <h1 className="text-3xl sm:text-4xl font-black">DRIGHT Challenges</h1>
          <p className="mt-3 text-white/85 max-w-xl mx-auto">
            Refer, sell, buy and affiliate your way to the top. Rankings restart automatically every month.
          </p>
        </div>
      </section>

      <main className="max-w-5xl mx-auto px-4 py-8 sm:py-10">
        <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-slate-900 border border-white/10 mb-4">
          <button
            onClick={() => setPeriod('current')}
            className={`rounded-xl py-3 text-sm font-black transition ${period === 'current' ? 'bg-white text-slate-950' : 'text-slate-300'}`}
          >
            Current Month
          </button>
          <div className="relative">
            <History className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <select
              value={period === 'current' ? '' : period}
              onChange={e => {
                if (e.target.value) setPeriod(e.target.value as MonthlyChallengePeriod);
              }}
              disabled={historyPeriods.length === 0}
              className={`w-full h-full min-h-[44px] rounded-xl border-0 pl-9 pr-8 text-sm font-black outline-none ${period !== 'current' ? 'bg-white text-slate-950' : 'bg-transparent text-slate-300'} disabled:opacity-50`}
            >
              <option value="" disabled>{historyPeriods.length ? 'Previous results' : 'History hidden'}</option>
              {historyPeriods.map(item => <option key={item.period} value={item.period}>{item.label}</option>)}
            </select>
          </div>
        </div>

        {catalog?.simulation_enabled && period === 'current' && (
          <div className="mb-4 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4 text-sm text-cyan-50">
            <div className="flex gap-3">
              <Bot className="w-5 h-5 shrink-0 mt-0.5 text-cyan-300" />
              <div>
                <p className="font-black">AI challenger mode is active</p>
                <p className="mt-1 text-cyan-100/80">
                  Profiles labeled “{catalog.simulation_label}” are simulated benchmark competitors. They cannot receive prizes and do not reduce the prize rank of real DRIGHT users.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 mb-5">
          {(['referral', 'affiliate'] as MonthlyChallengeSection[]).map(item => (
            <button
              key={item}
              onClick={() => setSection(item)}
              className={`rounded-2xl border px-4 py-3 text-sm font-black capitalize transition ${section === item ? 'border-violet-400 bg-violet-500/15 text-violet-200' : 'border-white/10 bg-slate-900 text-slate-400'}`}
            >
              {item === 'referral' ? 'Referral' : 'Affiliate'}
            </button>
          ))}
        </div>

        {loadingCatalog ? (
          <div className="py-20 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-violet-300" /></div>
        ) : (
          <>
            <div className="flex gap-2 overflow-x-auto pb-3 mb-3">
              {sectionChallenges.map(challenge => {
                const Icon = CHALLENGE_ICONS[challenge.challenge_key] || Trophy;
                return (
                  <button
                    key={challenge.challenge_key}
                    onClick={() => setSelectedKey(challenge.challenge_key)}
                    className={`shrink-0 rounded-full border px-4 py-2 text-xs font-bold flex items-center gap-2 transition ${selectedKey === challenge.challenge_key ? 'border-amber-300 bg-amber-300 text-slate-950' : 'border-white/10 bg-slate-900 text-slate-300'}`}
                  >
                    <Icon className="w-4 h-4" /> {challenge.title}
                  </button>
                );
              })}
            </div>

            {selected && (
              <motion.section
                key={`${selected.challenge_key}-${period}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="overflow-hidden rounded-[28px] border border-violet-400/20 bg-gradient-to-b from-violet-700 via-indigo-800 to-slate-950 shadow-2xl"
              >
                <div className="px-5 pt-6 pb-3 sm:px-8">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.2em] font-black text-violet-200">
                        {period === 'current' ? 'Live monthly leaderboard' : `${periodLabel} results`}
                      </p>
                      <h2 className="text-2xl sm:text-3xl font-black mt-1">{selected.title}</h2>
                      {selected.description && <p className="text-sm text-violet-100/80 mt-2 max-w-2xl">{selected.description}</p>}
                    </div>
                    {period === 'current' && (
                      <div className="shrink-0 rounded-2xl bg-black/20 border border-white/10 px-3 py-2 text-right">
                        <p className="text-[10px] text-violet-200 flex items-center gap-1 justify-end"><Clock className="w-3 h-3" /> Resets in</p>
                        <p className="text-sm font-black">{countdown}</p>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-5">
                    {[1, 2, 3].map(rank => (
                      <div key={rank} className="rounded-2xl bg-black/20 border border-white/10 p-3">
                        <p className="text-[10px] text-violet-200">#{rank} real-user reward</p>
                        <p className="text-xs sm:text-sm font-black mt-1 text-amber-200">
                          {formatChallengeReward(challengeRewardForRank(selected, rank), selected.reward_currency)}
                        </p>
                      </div>
                    ))}
                  </div>

                  {loadingBoard ? (
                    <div className="py-16 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-violet-200" /></div>
                  ) : (
                    <Podium challenge={selected} entries={entries} />
                  )}
                </div>

                {!loadingBoard && (
                  <div className="bg-slate-950/75 border-t border-white/10 px-3 sm:px-6 py-5">
                    <div className="flex items-center justify-between mb-3 px-1">
                      <p className="font-black text-sm">{period === 'current' ? 'Participants & ranking' : `${periodLabel} winners & ranking`}</p>
                      <p className="text-xs text-slate-400">{total.toLocaleString()} participant{total === 1 ? '' : 's'}</p>
                    </div>

                    {entries.length === 0 ? (
                      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.04] p-6 text-center text-sm text-slate-400">
                        No finalized results are available for this challenge and month.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {entries.map(entry => {
                          const reward = !entry.is_simulated && entry.reward_rank > 0
                            ? challengeRewardForRank(selected, entry.reward_rank)
                            : 0;
                          return (
                            <div key={entry.user_id} className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.04] p-3">
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm ${entry.is_ranked && entry.rank === 1 ? 'bg-amber-300 text-slate-950' : entry.is_ranked && entry.rank === 2 ? 'bg-slate-300 text-slate-900' : entry.is_ranked && entry.rank === 3 ? 'bg-orange-300 text-slate-950' : 'bg-white/10 text-slate-300'}`}>
                                {!entry.is_ranked ? '—' : entry.rank <= 3 ? (entry.rank === 1 ? <Crown className="w-4 h-4" /> : <Medal className="w-4 h-4" />) : entry.rank}
                              </div>
                              <div className="w-10 h-10 rounded-full overflow-hidden bg-violet-500/25 shrink-0">
                                <InitialAvatar entry={entry} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-bold text-sm truncate">{nameFor(entry)}</p>
                                  <SourceBadge entry={entry} />
                                  {!entry.is_ranked && (
                                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[9px] font-black uppercase text-slate-400">Unranked</span>
                                  )}
                                </div>
                                <p className="text-xs text-slate-400 truncate">{metricText(selected, entry)}</p>
                                {!entry.is_simulated && entry.reward_rank > 0 && entry.reward_rank !== entry.rank && (
                                  <p className="mt-0.5 text-[10px] text-emerald-300">Real-user prize rank #{entry.reward_rank}</p>
                                )}
                              </div>
                              {entry.is_simulated ? (
                                <div className="text-right shrink-0">
                                  <p className="text-[10px] text-cyan-300">Benchmark</p>
                                  <p className="text-[10px] text-slate-500">No prize</p>
                                </div>
                              ) : reward > 0 && entry.reward_rank <= 3 ? (
                                <div className="text-right shrink-0">
                                  <p className="text-[10px] text-slate-500">Prize #{entry.reward_rank}</p>
                                  <p className="text-xs font-black text-amber-300">{formatChallengeReward(reward, selected.reward_currency)}</p>
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {entries.length < total && (
                      <button
                        onClick={loadMore}
                        disabled={loadingMore}
                        className="mt-4 w-full min-h-[46px] rounded-xl border border-white/10 bg-white/[0.05] text-sm font-bold text-slate-200 flex items-center justify-center gap-2"
                      >
                        {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronDown className="w-4 h-4" />}
                        Load more participants
                      </button>
                    )}
                  </div>
                )}
              </motion.section>
            )}
          </>
        )}

        {starterProgress?.enabled && starterProgress.applies && (
          <section className="mt-8 rounded-3xl border border-white/10 bg-slate-900 p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="max-w-2xl">
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.15em] text-violet-300">
                  <Target className="w-4 h-4" /> Affiliate onboarding challenge
                </div>
                <h2 className="text-xl font-black mt-2">
                  {starterProgress.completed ? starterProgress.unlock_label + ' unlocked' : 'Sell DRIGHT Starter Access'}
                </h2>
                <p className="text-sm text-slate-400 mt-2">
                  {renderDrightStarterTemplate(
                    starterProgress.description_template,
                    0,
                    starterProgress.target_sales,
                  )}
                </p>
              </div>
              <div className="sm:text-right">
                <p className="text-xs text-slate-500">Verified Starter sales</p>
                <p className="text-3xl font-black">{starterProgress.sales}/{starterProgress.target_sales}</p>
              </div>
            </div>
            <div className="mt-5 h-3 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-violet-500 transition-all"
                style={{ width: `${Math.min(100, starterProgress.target_sales > 0 ? (starterProgress.sales / starterProgress.target_sales) * 100 : 0)}%` }}
              />
            </div>
            <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-sm text-slate-400">
                {starterProgress.completed
                  ? 'Challenge complete. Your affiliate onboarding level is unlocked.'
                  : `${starterProgress.remaining_sales} verified sale${starterProgress.remaining_sales === 1 ? '' : 's'} remaining.`}
              </p>
              <Link to="/dright/starter" className="inline-flex min-h-[42px] items-center justify-center rounded-xl bg-violet-500 px-4 font-black text-sm">
                Open Starter Product
              </Link>
            </div>
          </section>
        )}

        <p className="mt-6 text-center text-xs text-slate-500">
          Monthly rankings use verified DRIGHT activity and refresh automatically. Unranked real users can appear with zero activity. Public history visibility is controlled by DRIGHT admins.
        </p>
      </main>
    </div>
  );
}
