import { Trophy, Crown, Medal } from 'lucide-react';
import { useLeaderboard } from '../lib/campaignHooks';
import { LEVEL_ICONS, LEVEL_COLORS, type WorkerLevel } from '../lib/campaignTypes';

export default function LeaderboardPage() {
  const { entries, loading } = useLeaderboard();

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Trophy className="w-6 h-6 text-amber-500" />
        <h1 className="text-xl font-bold text-gray-900">Leaderboard</h1>
      </div>

      {/* Top 3 Podium */}
      {!loading && entries.length >= 3 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[1, 0, 2].map(idx => {
            const e = entries[idx];
            if (!e) return <div key={idx} />;
            const podiumStyles = idx === 0 ? 'order-2 mt-0' : idx === 1 ? 'order-1 mt-6' : 'order-3 mt-10';
            const icon = idx === 0 ? <Crown className="w-5 h-5 text-amber-500" /> : idx === 1 ? <Medal className="w-5 h-5 text-gray-400" /> : <Medal className="w-5 h-5 text-amber-700" />;
            return (
              <div key={e.id} className={`flex flex-col items-center ${podiumStyles}`}>
                <div className="relative">
                  <div className={`w-16 h-16 rounded-full bg-gradient-to-br ${LEVEL_COLORS[(e.level || 'bronze') as WorkerLevel]} flex items-center justify-center text-2xl`}>
                    {e.avatar_url ? <img src={e.avatar_url} alt="" className="w-full h-full rounded-full object-cover" /> : LEVEL_ICONS[(e.level || 'bronze') as WorkerLevel]}
                  </div>
                  <div className="absolute -top-1 -right-1">{icon}</div>
                </div>
                <p className="text-sm font-bold text-gray-900 mt-2 truncate max-w-full">{e.username || `Worker`}</p>
                <p className="text-xs text-green-600 font-medium">${Number(e.total_earnings).toFixed(2)}</p>
                <p className="text-xs text-gray-400">{e.completed_tasks} tasks</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Full Leaderboard */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map(i => <div key={i} className="bg-gray-100 rounded-2xl h-16 animate-pulse" />)}
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-16">
          <Trophy className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No leaderboard data yet</p>
          <p className="text-sm text-gray-400 mt-1">Complete campaigns to earn your spot!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((e, i) => (
            <div key={e.id} className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 p-4">
              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-600 shrink-0">
                {i + 1}
              </div>
              <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${LEVEL_COLORS[(e.level || 'bronze') as WorkerLevel]} flex items-center justify-center text-lg shrink-0`}>
                {e.avatar_url ? <img src={e.avatar_url} alt="" className="w-full h-full rounded-full object-cover" /> : LEVEL_ICONS[(e.level || 'bronze') as WorkerLevel]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 truncate">{e.username || 'Worker'}</p>
                <p className="text-xs text-gray-400">{e.completed_tasks} tasks completed • {e.level || 'bronze'}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-green-600">${Number(e.total_earnings).toFixed(2)}</p>
                <p className="text-xs text-gray-400">earned</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
