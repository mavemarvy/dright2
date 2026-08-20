import { Shield, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useTrustScore, getTrustLevel, type TrustScoreData } from '../../lib/trustEngine';

interface Props {
  userId: string;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  showBreakdown?: boolean;
}

export function TrustScoreBadge({ userId, size = 'md', showLabel = true, showBreakdown = false }: Props) {
  const { data, loading } = useTrustScore(userId);

  if (loading) return <div className="animate-pulse bg-gray-100 dark:bg-gray-700 rounded-full h-6 w-20" />;
  if (!data) return null;

  const level = getTrustLevel(data.score);
  const sizes = {
    sm: { badge: 'text-xs px-2 py-0.5', icon: 12 },
    md: { badge: 'text-sm px-2.5 py-1', icon: 14 },
    lg: { badge: 'text-base px-3 py-1.5', icon: 16 },
  };
  const s = sizes[size];

  return (
    <div className="inline-flex items-center gap-2">
      <span className={`inline-flex items-center gap-1 rounded-full font-medium ${level.color} ${s.badge}`}>
        <Shield size={s.icon} />
        <span>{data.score}</span>
        {showLabel && <span className="hidden sm:inline opacity-80">{level.label}</span>}
      </span>
      {showBreakdown && <TrustScoreBreakdown data={data} />}
    </div>
  );
}

export function TrustScoreBreakdown({ data }: { data: TrustScoreData }) {
  const components = data.components || {};
  const entries = Object.entries(components).filter(([, v]) => typeof v === 'number') as [string, number][];

  return (
    <div className="absolute top-full mt-2 right-0 z-50 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 p-4 min-w-[260px]">
      <div className="flex items-center gap-2 mb-3">
        <Shield size={16} className="text-primary-600" />
        <span className="font-semibold text-sm text-gray-900 dark:text-white">Trust Score: {data.score}</span>
      </div>
      <div className="space-y-1.5">
        {entries.map(([key, val]: [string, number]) => (
          <div key={key} className="flex items-center justify-between text-xs">
            <span className="text-gray-500 capitalize">{key.replace(/_/g, ' ')}</span>
            <span className={`font-medium ${val > 0 ? 'text-emerald-600' : val < 0 ? 'text-red-500' : 'text-gray-400'}`}>
              {val > 0 ? '+' : ''}{val}
            </span>
          </div>
        ))}
      </div>
      {data.last_calculated && (
        <p className="text-xs text-gray-400 mt-3 pt-2 border-t border-gray-100 dark:border-gray-700">
          Updated {new Date(data.last_calculated).toLocaleDateString()}
        </p>
      )}
    </div>
  );
}

export function TrustScoreCard({ userId }: { userId: string }) {
  const { data, loading } = useTrustScore(userId);

  if (loading) return <div className="animate-pulse bg-gray-100 dark:bg-gray-700 rounded-2xl h-32" />;
  if (!data) return null;

  const level = getTrustLevel(data.score);
  const allEntries = Object.entries(data.components || {}).filter(([, v]) => typeof v === 'number') as [string, number][];
  const positiveEntries = allEntries.filter(([, v]) => v > 0);
  const negativeEntries = allEntries.filter(([, v]) => v < 0);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-gray-900 dark:text-white">Trust Score</h3>
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${level.color}`}>{level.label}</span>
      </div>
      <div className="flex items-center gap-4 mb-4">
        <div className="relative w-20 h-20">
          <svg className="w-full h-full -rotate-90">
            <circle cx="40" cy="40" r="34" fill="none" stroke="currentColor" strokeWidth="6" className="text-gray-100 dark:text-gray-700" />
            <circle cx="40" cy="40" r="34" fill="none" stroke="currentColor" strokeWidth="6"
              strokeDasharray={`${(data.score / 100) * 213.6} 213.6`}
              className={data.score >= 80 ? 'text-emerald-500' : data.score >= 60 ? 'text-blue-500' : data.score >= 40 ? 'text-amber-500' : 'text-gray-400'}
              strokeLinecap="round" />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-2xl font-bold text-gray-900 dark:text-white">{data.score}</span>
        </div>
        <div className="flex-1">
          <p className="text-xs text-gray-400 mb-1">Out of 100</p>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {data.score >= 80 ? 'Highly trusted member of the DRIGHT community.' :
             data.score >= 60 ? 'Established member with good standing.' :
             data.score >= 40 ? 'Building reputation on the platform.' :
             'New member — keep engaging to build trust.'}
          </p>
        </div>
      </div>
      <div className="space-y-1.5">
        {positiveEntries.map(([key, val]: [string, number]) => (
          <div key={key} className="flex items-center justify-between text-xs">
            <span className="text-gray-500 capitalize">{key.replace(/_/g, ' ')}</span>
            <span className="flex items-center gap-1 text-emerald-600 font-medium">
              <TrendingUp size={12} /> +{val}
            </span>
          </div>
        ))}
        {negativeEntries.map(([key, val]: [string, number]) => (
          <div key={key} className="flex items-center justify-between text-xs">
            <span className="text-gray-500 capitalize">{key.replace(/_/g, ' ')}</span>
            <span className="flex items-center gap-1 text-red-500 font-medium">
              <TrendingDown size={12} /> {val}
            </span>
          </div>
        ))}
        {positiveEntries.length === 0 && negativeEntries.length === 0 && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">No factors yet</span>
            <Minus size={12} className="text-gray-400" />
          </div>
        )}
      </div>
    </div>
  );
}
