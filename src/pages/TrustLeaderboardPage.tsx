import { useState, useEffect } from 'react';
import { Loader2, Trophy, Crown, Medal, TrendingUp } from 'lucide-react';
import { supabase } from '../lib/supabase';

const CATEGORIES = [
  { key: 'sellers', label: 'Top Sellers' },
  { key: 'affiliates', label: 'Top Affiliates' },
  { key: 'advertisers', label: 'Top Advertisers' },
  { key: 'creators', label: 'Top Creators' },
  { key: 'reviewers', label: 'Top Reviewers' },
  { key: 'buyers', label: 'Top Buyers' },
  { key: 'referrers', label: 'Top Referrers' },
  { key: 'rising', label: 'Rising Stars' },
  { key: 'trusted', label: 'Most Trusted' },
];

const PERIODS = [
  { key: 'weekly', label: 'This Week' },
  { key: 'monthly', label: 'This Month' },
  { key: 'yearly', label: 'This Year' },
  { key: 'all_time', label: 'All Time' },
];

export default function TrustLeaderboardPage() {
  const [category, setCategory] = useState('trusted');
  const [period, setPeriod] = useState('monthly');
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_leaderboard', {
        p_category: category, p_period: period, p_limit: 50,
      });
      setLoading(false);
      if (!error && data) setEntries(data as any[]);
    };
    load();
  }, [category, period]);

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
          <Trophy className="w-5 h-5 text-amber-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Leaderboards</h1>
          <p className="text-sm text-gray-500">Top performers across the DRIGHT marketplace</p>
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map(c => (
          <button key={c.key} onClick={() => setCategory(c.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${category === c.key ? 'bg-primary-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
            {c.label}
          </button>
        ))}
      </div>

      {/* Period tabs */}
      <div className="flex gap-2">
        {PERIODS.map(p => (
          <button key={p.key} onClick={() => setPeriod(p.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${period === p.key ? 'bg-primary-100 text-primary-700' : 'text-gray-500 hover:bg-gray-100'}`}>
            {p.label}
          </button>
        ))}
      </div>

      {/* Podium for top 3 */}
      {!loading && entries.length >= 3 && (
        <div className="grid grid-cols-3 gap-3 items-end">
          {[1, 0, 2].map(idx => {
            const e = entries[idx];
            if (!e) return <div key={idx} />;
            const heights = ['h-28', 'h-36', 'h-24'];
            const medals = [Crown, Crown, Medal];
            const colors = ['text-amber-500', 'text-gray-400', 'text-orange-600'];
            const Med = medals[idx];
            return (
              <div key={idx} className="flex flex-col items-center">
                <div className="w-14 h-14 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden mb-2 ring-2 ring-offset-2 ring-primary-300">
                  {e.avatar_url ? <img src={e.avatar_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-400 text-lg font-bold">{(e.full_name || '?')[0]}</div>}
                </div>
                <p className="text-xs font-medium text-gray-900 dark:text-white truncate max-w-full">{e.username || e.full_name || 'Unknown'}</p>
                <p className="text-xs text-gray-400">{e.trust_score} pts</p>
                <div className={`w-full ${heights[idx]} mt-2 rounded-t-xl bg-gradient-to-b ${idx === 0 ? 'from-amber-400 to-amber-200' : idx === 1 ? 'from-gray-300 to-gray-200' : 'from-orange-400 to-orange-200'} flex items-start justify-center pt-2`}>
                  <Med className={`w-6 h-6 ${colors[idx]}`} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Full list */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>
      ) : entries.length === 0 ? (
        <div className="text-center py-12">
          <TrendingUp className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-400">No entries yet. Be the first to make the leaderboard!</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
          {entries.map((e, i) => (
            <div key={e.user_id || i} className={`flex items-center gap-3 p-3 ${i > 0 ? 'border-t border-gray-50 dark:border-gray-700/50' : ''} ${i < 3 ? 'bg-amber-50/30 dark:bg-amber-900/10' : ''}`}>
              <span className={`w-8 text-center font-bold text-sm ${i < 3 ? 'text-amber-600' : 'text-gray-400'}`}>#{i + 1}</span>
              <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden flex-shrink-0">
                {e.avatar_url ? <img src={e.avatar_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm font-bold">{(e.full_name || '?')[0]}</div>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{e.full_name || e.username || 'Unknown'}</p>
                <p className="text-xs text-gray-400 capitalize">{e.level || ''}</p>
              </div>
              <span className="text-sm font-bold text-primary-600">{e.trust_score}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
