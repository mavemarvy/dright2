import { Compass, Play, RotateCcw } from 'lucide-react';
import { TOUR_LIST, startDrightTour, type TourKey } from '../../tours/tourDefinitions';
import { useAuth } from '../../contexts/AuthContext';

const icons: Partial<Record<TourKey, string>> = {
  basics: '🧭',
  marketplace: '🛍️',
  social: '👥',
  news: '📰',
  promote: '🚀',
  profile: '👤',
  subscriptions: '💳',
  wallet: '👛',
  orders: '📦',
  saved_items: '❤️',
  messages: '💬',
  my_store: '🏪',
  post_ad: '➕',
  my_drafts: '📝',
  sales: '📈',
  job_board: '💼',
  referral: '🔗',
  campaigns: '📣',
  creator_campaigns: '🎯',
  rewards: '🎁',
  communities: '🌐',
  notifications: '🔔',
  activity_feed: '⚡',
  challenges: '🏆',
  announcements: '📢',
  help_support: '❓',
  tutorials: '🎓',
  terms_policies: '📜',
  settings: '⚙️',
};

export default function GuidedToursPanel() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <section className="mb-12" aria-labelledby="guided-tours-title">
      <div className="flex items-start gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 flex items-center justify-center shrink-0">
          <Compass className="w-5 h-5" />
        </div>
        <div>
          <h2 id="guided-tours-title" className="text-xl font-bold text-gray-900 dark:text-white">Guided Tours</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Learn DRIGHT inside the interface. Tours are optional, can be skipped, and can be replayed at any time.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {TOUR_LIST.map(tour => (
          <button
            key={tour.key}
            type="button"
            onClick={() => startDrightTour(tour.key)}
            className="group text-left bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-md transition-all"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-lg shrink-0" aria-hidden="true">
                {icons[tour.key] ?? '🧭'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-gray-900 dark:text-white text-sm">{tour.title}</h3>
                  <span className="text-[10px] font-semibold text-gray-400 whitespace-nowrap">{tour.duration}</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{tour.description}</p>
                <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-300">
                  <Play className="w-3.5 h-3.5" /> Start tour
                  <RotateCcw className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
