import { useEffect, useState } from 'react';
import { Crown, Users } from 'lucide-react';
import { motion } from 'framer-motion';
import { fetchLeaderboard, type LeaderboardEntry } from '../lib/referral';
import { formatCurrency } from '../lib/currency';

export default function ReferralLeaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    (async () => {
      try {
        const data = await fetchLeaderboard(10);
        setEntries(data);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <div className="h-6 w-32 bg-gray-100 rounded animate-pulse" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl p-5 md:p-6 shadow-sm border border-gray-100"
    >
      <div className="flex items-center gap-2 mb-4">
        <Crown className="w-5 h-5 text-warning" />
        <h2 className="text-lg font-bold text-gray-900">Leaderboard</h2>
      </div>
      {entries.length === 0 ? (
        <div className="text-center py-6">
          <Users className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          <p className="text-gray-500">No entries yet</p>
          <p className="text-sm text-gray-400 mt-1">Be the first to earn referral rewards</p>
        </div>
      ) : (
        <ol className="space-y-2">
          {entries.map((e, i) => (
            <li
              key={e.user_id}
              className={`flex items-center gap-3 p-3 rounded-xl ${i === 0 ? 'bg-warning-muted' : 'hover:bg-gray-50 transition-colors'}`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
                i === 0 ? 'bg-warning text-white' :
                i === 1 ? 'bg-gray-300 text-gray-700' :
                i === 2 ? 'bg-orange-200 text-orange-700' :
                'bg-gray-100 text-gray-500'
              }`}>
                {i + 1}
              </div>
              <div className="w-9 h-9 rounded-full flex items-center justify-center overflow-hidden bg-primary-100 shrink-0">
                {e.avatar_url ? (
                  <img src={e.avatar_url} alt={e.full_name || 'User'} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-primary-700 font-semibold text-sm">
                    {(e.full_name || 'U')[0]?.toUpperCase()}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">{e.full_name || 'Anonymous'}</p>
                <p className="text-xs text-gray-500">{e.total_referrals} referrals</p>
              </div>
              <span className="font-bold text-gray-900">{formatCurrency(e.total_earned)}</span>
            </li>
          ))}
        </ol>
      )}
    </motion.div>
  );
}
