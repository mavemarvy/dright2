import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Trophy, Clock, Gift, CheckCircle, Loader2, Target, Star } from 'lucide-react';
import SeoHead from '../components/SeoHead';
import { usePublishedChallenges, useUserChallengeProgress, upsertChallengeProgress } from '../lib/contentHooks';
import { CHALLENGE_STATUSES } from '../lib/contentTypes';

const ICON_MAP: Record<string, typeof Trophy> = { Trophy, Target, Star, Gift, CheckCircle };

export default function ChallengesPage() {
  const { challenges, loading } = usePublishedChallenges();
  const { progress: userProgress } = useUserChallengeProgress();
  const [filter, setFilter] = useState<string>('all');

  const progressMap = useMemo(() => {
    const map: Record<string, { progress: number; is_completed: boolean; reward_claimed: boolean }> = {};
    userProgress.forEach(p => { map[p.challenge_id] = { progress: p.progress, is_completed: p.is_completed, reward_claimed: p.reward_claimed }; });
    return map;
  }, [userProgress]);

  const filtered = useMemo(() => {
    if (filter === 'all') return challenges;
    return challenges.filter(c => c.status === filter);
  }, [challenges, filter]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <SeoHead title="Challenges" description="Complete challenges and earn rewards on DRIGHT." canonical="/challenges" />

      <div className="bg-gradient-to-br from-amber-500 to-orange-600 text-white py-14 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <Trophy className="w-12 h-12 mx-auto mb-4 opacity-80" />
          <h1 className="text-3xl sm:text-4xl font-bold mb-3">DRIGHT Challenges</h1>
          <p className="text-amber-100">Complete challenges, earn rewards, and level up</p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-10">
        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-8">
          <button onClick={() => setFilter('all')} className={`px-4 py-2 rounded-xl text-sm font-medium ${filter === 'all' ? 'bg-amber-500 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700'}`}>All</button>
          {CHALLENGE_STATUSES.map(s => (
            <button key={s.value} onClick={() => setFilter(s.value)} className={`px-4 py-2 rounded-xl text-sm font-medium ${filter === s.value ? 'bg-amber-500 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700'}`}>{s.label}</button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-amber-500 animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400"><Trophy className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>No challenges available right now. Check back soon!</p></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filtered.map(challenge => {
              const Icon = ICON_MAP[challenge.icon] || Trophy;
              const userProg = progressMap[challenge.id];
              const progress = userProg?.progress || 0;
              const isCompleted = userProg?.is_completed || false;
              const rewardClaimed = userProg?.reward_claimed || false;
              const statusInfo = CHALLENGE_STATUSES.find(s => s.value === challenge.status);

              return (
                <motion.div
                  key={challenge.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden"
                >
                  {challenge.banner_image && (
                    <div className="h-32 bg-cover bg-center" style={{ backgroundImage: `url(${challenge.banner_image})` }} />
                  )}
                  <div className="p-5">
                    <div className="flex items-start gap-3 mb-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isCompleted ? 'bg-green-100' : 'bg-amber-100'}`}>
                        <Icon className={`w-5 h-5 ${isCompleted ? 'text-green-600' : 'text-amber-600'}`} />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900 dark:text-white">{challenge.title}</h3>
                        {statusInfo && <span className={`text-xs px-2 py-0.5 rounded-full bg-${statusInfo.color}-100 text-${statusInfo.color}-700`}>{statusInfo.label}</span>}
                      </div>
                    </div>

                    {challenge.description && <p className="text-sm text-gray-500 mb-4">{challenge.description}</p>}

                    {/* Reward */}
                    {(challenge.reward_amount > 0 || challenge.reward_description) && (
                      <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl mb-4">
                        <Gift className="w-5 h-5 text-amber-600" />
                        <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
                          {challenge.reward_amount > 0 ? `Reward: ${challenge.reward_currency} ${challenge.reward_amount.toLocaleString()}` : challenge.reward_description}
                        </span>
                      </div>
                    )}

                    {/* Progress */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                        <span>Progress</span>
                        <span>{progress}%</span>
                      </div>
                      <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${isCompleted ? 'bg-green-500' : 'bg-amber-500'}`} style={{ width: `${progress}%` }} />
                      </div>
                    </div>

                    {/* Dates */}
                    <div className="flex items-center gap-4 text-xs text-gray-400 mb-4">
                      {challenge.start_date && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Starts: {new Date(challenge.start_date).toLocaleDateString()}</span>}
                      {challenge.end_date && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Ends: {new Date(challenge.end_date).toLocaleDateString()}</span>}
                    </div>

                    {/* Action */}
                    {isCompleted ? (
                      <div className="flex items-center gap-2 text-green-600 font-medium text-sm">
                        <CheckCircle className="w-5 h-5" />
                        {rewardClaimed ? 'Reward claimed!' : 'Completed! Claim your reward.'}
                      </div>
                    ) : challenge.status === 'active' && (
                      <button
                        onClick={() => upsertChallengeProgress(challenge.id, Math.min(progress + 25, 100), progress + 25 >= 100)}
                        className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-medium text-sm"
                      >
                        Update Progress
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
