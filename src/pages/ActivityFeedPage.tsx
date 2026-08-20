import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  ShoppingCart, MessageCircle, Megaphone,
  Users, Star, Shield, Wallet, Briefcase, Calendar, TrendingUp,
  Store, Bell, Activity,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useActivityFeed, type ActivityFeedItem, type EventModule } from '../lib/notificationEvents';
import { notificationRelativeTime } from '../lib/notificationHooks';

const MODULE_ICON: Record<EventModule, LucideIcon> = {
  marketplace: ShoppingCart,
  services: Calendar,
  jobs: Briefcase,
  chat: MessageCircle,
  wallet: Wallet,
  referral: Users,
  affiliate: TrendingUp,
  store: Store,
  review: Star,
  security: Shield,
  admin: Megaphone,
  system: Activity,
};

const MODULE_COLORS: Record<EventModule, string> = {
  marketplace: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  services: 'bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400',
  jobs: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400',
  chat: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
  wallet: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400',
  referral: 'bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400',
  affiliate: 'bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400',
  store: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  review: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
  security: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
  admin: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400',
  system: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
};

const MODULE_LABELS: Record<EventModule, string> = {
  marketplace: 'Marketplace',
  services: 'Services',
  jobs: 'Jobs',
  chat: 'Chat',
  wallet: 'Wallet',
  referral: 'Referrals',
  affiliate: 'Affiliate',
  store: 'Store',
  review: 'Reviews',
  security: 'Security',
  admin: 'Admin',
  system: 'System',
};

const MODULE_FILTERS: { key: EventModule | 'all'; label: string }[] = [
  { key: 'all', label: 'All Activity' },
  { key: 'marketplace', label: 'Marketplace' },
  { key: 'services', label: 'Services' },
  { key: 'jobs', label: 'Jobs' },
  { key: 'chat', label: 'Chat' },
  { key: 'wallet', label: 'Wallet' },
  { key: 'referral', label: 'Referrals' },
  { key: 'affiliate', label: 'Affiliate' },
  { key: 'store', label: 'Store' },
  { key: 'review', label: 'Reviews' },
  { key: 'security', label: 'Security' },
  { key: 'admin', label: 'Admin' },
  { key: 'system', label: 'System' },
];

function ActivityFeedSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 animate-pulse">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-gray-200 dark:bg-gray-700" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ActivityItem({ item }: { item: ActivityFeedItem }) {
  const moduleName = item.event_type.split('.')[0] as EventModule;
  const Icon = MODULE_ICON[moduleName] || Bell;
  const colorClass = MODULE_COLORS[moduleName] || MODULE_COLORS.system;
  const meta = item.metadata || {};
  const eventTypeLabel = item.event_type.split('.')[1]?.replace(/_/g, ' ') || item.event_type;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-3 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 hover:shadow-md transition-all"
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${colorClass}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md uppercase tracking-wide ${colorClass}`}>
            {MODULE_LABELS[moduleName]}
          </span>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 capitalize">
            {eventTypeLabel}
          </p>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
          {String(meta.productTitle || meta.serviceTitle || meta.jobTitle || meta.message || meta.reason || '')}
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          {notificationRelativeTime(item.created_at)}
        </p>
      </div>
    </motion.div>
  );
}

export default function ActivityFeedPage() {
  const { user } = useAuth();
  const [moduleFilter, setModuleFilter] = useState<EventModule | 'all'>('all');
  const { items, loading } = useActivityFeed(user?.id || null, 100);

  const filteredItems = useMemo(() => {
    if (moduleFilter === 'all') return items;
    return items.filter(item => item.event_type.startsWith(moduleFilter + '.'));
  }, [items, moduleFilter]);

  const groupedByDate = useMemo(() => {
    const groups: { label: string; items: ActivityFeedItem[] }[] = [];
    const labelMap = new Map<string, ActivityFeedItem[]>();
    for (const item of filteredItems) {
      const date = new Date(item.created_at);
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const yesterday = new Date(today.getTime() - 86400000);
      const oneWeekAgo = new Date(today.getTime() - 7 * 86400000);
      let label: string;
      if (date >= today) label = 'Today';
      else if (date >= yesterday) label = 'Yesterday';
      else if (date >= oneWeekAgo) label = 'This Week';
      else label = 'Earlier';
      if (!labelMap.has(label)) labelMap.set(label, []);
      labelMap.get(label)!.push(item);
    }
    for (const [label, items] of labelMap) {
      groups.push({ label, items });
    }
    return groups;
  }, [filteredItems]);

  return (
    <div className="min-h-screen bg-surface-muted">
      <div className="sticky top-0 z-30 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center">
              <Activity className="w-5 h-5 text-primary-600 dark:text-primary-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Activity Feed</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {filteredItems.length} events across all modules
              </p>
            </div>
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            {MODULE_FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setModuleFilter(f.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                  moduleFilter === f.key
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 pb-24 md:pb-8">
        {loading ? (
          <ActivityFeedSkeleton />
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
              <Activity className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-gray-500 dark:text-gray-400 text-sm max-w-xs">
              No activity yet. Events from marketplace, services, jobs, wallet, and more will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {groupedByDate.map(group => (
              <div key={group.label}>
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                    {group.label}
                  </h2>
                  <div className="flex-1 h-px bg-gray-100 dark:bg-gray-700" />
                </div>
                <div className="space-y-2">
                  {group.items.map((item: ActivityFeedItem) => (
                    <ActivityItem key={item.id} item={item} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
