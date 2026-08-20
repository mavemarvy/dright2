import { useState, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell, Search, Settings, Archive, CheckCheck, X,
  Trash2, Mail, MailOpen, RotateCcw,
  BellOff, SlidersHorizontal,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  useNotifications,
  getDateGroupLabel,
  DEFAULT_FILTERS,
  type NotificationFilters,
  type SortOption,
  type DateFilter,
} from '../lib/notificationHooks';
import type { NotificationCategory, NotificationItem, NotificationPriority } from '../lib/types';
import NotificationCard from '../components/NotificationCard';

// ─── Category tabs config ─────────────────────────────────────────────────────

const CATEGORIES: { key: NotificationCategory; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'messages', label: 'Messages' },
  { key: 'marketplace', label: 'Marketplace' },
  { key: 'services', label: 'Services' },
  { key: 'jobs', label: 'Jobs' },
  { key: 'orders', label: 'Orders' },
  { key: 'wallet', label: 'Wallet' },
  { key: 'affiliate', label: 'Affiliate' },
  { key: 'referrals', label: 'Referrals' },
  { key: 'store', label: 'Store' },
  { key: 'followers', label: 'Followers' },
  { key: 'reviews', label: 'Reviews' },
  { key: 'security', label: 'Security' },
  { key: 'promotions', label: 'Promotions' },
  { key: 'admin', label: 'Admin' },
  { key: 'system', label: 'System' },
  { key: 'ai', label: 'AI' },
];

const DATE_FILTERS: { key: DateFilter; label: string }[] = [
  { key: 'all', label: 'All Time' },
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'last_7', label: 'Last 7 Days' },
  { key: 'last_30', label: 'Last 30 Days' },
  { key: 'this_year', label: 'This Year' },
];

const SORT_OPTIONS: { key: SortOption; label: string }[] = [
  { key: 'newest', label: 'Newest First' },
  { key: 'oldest', label: 'Oldest First' },
  { key: 'priority', label: 'Priority' },
  { key: 'unread_first', label: 'Unread First' },
  { key: 'category', label: 'Category' },
  { key: 'alphabetical', label: 'Alphabetical' },
];

const PRIORITY_OPTIONS: { key: NotificationPriority | 'all'; label: string }[] = [
  { key: 'all', label: 'All Priorities' },
  { key: 'critical', label: 'Critical' },
  { key: 'high', label: 'High' },
  { key: 'normal', label: 'Normal' },
  { key: 'low', label: 'Low' },
];

// ─── Skeleton component ───────────────────────────────────────────────────────

function NotificationSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 animate-pulse">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-gray-200 dark:bg-gray-700" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/4" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ category, isArchived }: { category: NotificationCategory; isArchived: boolean }) {
  const messages: Record<string, string> = {
    all: 'No notifications yet. Platform activity will appear here.',
    unread: "You're all caught up! No unread notifications.",
    messages: 'No message notifications. Chat activity will appear here.',
    marketplace: 'No marketplace notifications. Sales and orders will appear here.',
    services: 'No service notifications. Bookings will appear here.',
    jobs: 'No job notifications. Applications will appear here.',
    orders: 'No order notifications. Order updates will appear here.',
    wallet: 'No wallet notifications. Transactions will appear here.',
    affiliate: 'No affiliate notifications. Commissions will appear here.',
    referrals: 'No referral notifications. Referral activity will appear here.',
    store: 'No store notifications. Store updates will appear here.',
    followers: 'No follower notifications. New followers will appear here.',
    reviews: 'No review notifications. New reviews will appear here.',
    security: 'No security notifications. Security alerts will appear here.',
    promotions: 'No promotional notifications right now.',
    admin: 'No admin notifications.',
    system: 'No system notifications.',
    ai: 'No AI notifications. AI summaries will appear here.',
  };

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
        {isArchived ? <Archive className="w-8 h-8 text-gray-400" /> : <BellOff className="w-8 h-8 text-gray-400" />}
      </div>
      <p className="text-gray-500 dark:text-gray-400 text-sm max-w-xs">
        {isArchived ? 'No archived notifications.' : (messages[category] || 'No notifications.')}
      </p>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const { user } = useAuth();
  const [filters, setFilters] = useState<NotificationFilters>(DEFAULT_FILTERS);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ y: number; scrollTop: number } | null>(null);

  const hook = useNotifications(user?.id || null, filters);

  const updateFilter = useCallback(<K extends keyof NotificationFilters>(key: K, value: NotificationFilters[K]) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  const handlePullToRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await hook.refetch();
    await hook.refetchCounts();
    setIsRefreshing(false);
  }, [hook]);

  // Touch handler for pull-to-refresh (mobile)
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const c = scrollContainerRef.current;
    if (!c) return;
    touchStartRef.current = { y: e.touches[0].clientY, scrollTop: c.scrollTop };
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current || isRefreshing) return;
    const c = scrollContainerRef.current;
    if (!c || c.scrollTop > 0) return;
    const diff = e.touches[0].clientY - touchStartRef.current.y;
    if (diff > 80) {
      handlePullToRefresh();
      touchStartRef.current = null;
    }
  }, [isRefreshing, handlePullToRefresh]);

  // Group notifications by date
  const groupedByDate = useMemo(() => {
    const groups: { label: string; items: NotificationItem[] }[] = [];
    const labelMap = new Map<string, NotificationItem[]>();

    for (const n of hook.notifications) {
      const label = getDateGroupLabel(n.created_at);
      if (!labelMap.has(label)) labelMap.set(label, []);
      labelMap.get(label)!.push(n);
    }

    for (const [label, items] of labelMap) {
      groups.push({ label, items });
    }

    return groups;
  }, [hook.notifications]);

  // Auto-collapse grouping: if >3 notifications of same group_key, collapse
  const processedGroups = useMemo(() => {
    return groupedByDate.map(group => {
      const grouped: NotificationItem[] = [];
      const ungrouped: NotificationItem[] = [];
      const groupKeyMap = new Map<string, NotificationItem[]>();

      for (const n of group.items) {
        if (n.group_key) {
          if (!groupKeyMap.has(n.group_key)) groupKeyMap.set(n.group_key, []);
          groupKeyMap.get(n.group_key)!.push(n);
        } else {
          ungrouped.push(n);
        }
      }

      for (const [, items] of groupKeyMap) {
        if (items.length > 3) {
          grouped.push(...items);
        } else {
          ungrouped.push(...items);
        }
      }

      return { label: group.label, grouped, ungrouped };
    });
  }, [groupedByDate]);

  const todayCount = useMemo(() => {
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    return hook.notifications.filter(n => new Date(n.created_at).getTime() >= todayStart).length;
  }, [hook.notifications]);

  return (
    <div className="min-h-screen bg-surface-muted">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center">
                  <Bell className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                </div>
                {hook.unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-error text-white text-xs font-bold rounded-full flex items-center justify-center">
                    {hook.unreadCount > 99 ? '99+' : hook.unreadCount}
                  </span>
                )}
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Notifications</h1>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {todayCount} today - {hook.unreadCount} unread
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Search */}
              <div className="relative hidden sm:block">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                <input
                  type="text"
                  value={filters.search}
                  onChange={e => updateFilter('search', e.target.value)}
                  placeholder="Search notifications..."
                  className="pl-9 pr-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 w-48 md:w-64"
                />
              </div>

              {/* Filter toggle */}
              <button
                onClick={() => setShowFilterPanel(!showFilterPanel)}
                className={`p-2 rounded-xl transition-colors ${
                  showFilterPanel
                    ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
                aria-label="Filters"
              >
                <SlidersHorizontal className="w-5 h-5" />
              </button>

              {/* Archive toggle */}
              <button
                onClick={() => updateFilter('showArchived', !filters.showArchived)}
                className={`p-2 rounded-xl transition-colors ${
                  filters.showArchived
                    ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
                aria-label="Archive"
                title="Archive"
              >
                <Archive className="w-5 h-5" />
              </button>

              {/* Settings */}
              <button
                className="p-2 rounded-xl text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label="Settings"
                title="Settings"
              >
                <Settings className="w-5 h-5" />
              </button>

              {/* Mark all read */}
              {hook.unreadCount > 0 && !filters.showArchived && (
                <button
                  onClick={hook.markAllRead}
                  className="p-2 rounded-xl text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                  aria-label="Mark all as read"
                  title="Mark all as read"
                >
                  <CheckCheck className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>

          {/* Mobile search */}
          <div className="sm:hidden mt-3 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
            <input
              type="text"
              value={filters.search}
              onChange={e => updateFilter('search', e.target.value)}
              placeholder="Search notifications..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Category tabs */}
          <div className="mt-3 flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            {CATEGORIES.map(cat => {
              const count = cat.key === 'unread'
                ? hook.unreadCount
                : (hook.categoryCounts[cat.key] || 0);
              const isActive = filters.category === cat.key;
              return (
                <button
                  key={cat.key}
                  onClick={() => updateFilter('category', cat.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${
                    isActive
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {cat.label}
                  {count > 0 && (
                    <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded-md ${
                      isActive ? 'bg-white/20' : 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400'
                    }`}>
                      {count > 99 ? '99+' : count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Filter panel */}
        <AnimatePresence>
          {showFilterPanel && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-t border-gray-100 dark:border-gray-700"
            >
              <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                {/* Date filter */}
                <div>
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 block">Date</label>
                  <select
                    value={filters.dateRange}
                    onChange={e => updateFilter('dateRange', e.target.value as DateFilter)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    {DATE_FILTERS.map(f => (
                      <option key={f.key} value={f.key}>{f.label}</option>
                    ))}
                  </select>
                </div>

                {/* Priority filter */}
                <div>
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 block">Priority</label>
                  <select
                    value={filters.priorityFilter}
                    onChange={e => updateFilter('priorityFilter', e.target.value as NotificationPriority | 'all')}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    {PRIORITY_OPTIONS.map(p => (
                      <option key={p.key} value={p.key}>{p.label}</option>
                    ))}
                  </select>
                </div>

                {/* Sort */}
                <div>
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 block">Sort</label>
                  <select
                    value={filters.sort}
                    onChange={e => updateFilter('sort', e.target.value as SortOption)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    {SORT_OPTIONS.map(s => (
                      <option key={s.key} value={s.key}>{s.label}</option>
                    ))}
                  </select>
                </div>

                {/* Read/Unread toggles */}
                <div>
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 block">Status</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => updateFilter('showUnread', !filters.showUnread)}
                      className={`flex-1 px-2 py-2 text-xs font-medium rounded-lg transition-colors ${
                        filters.showUnread
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      Unread
                    </button>
                    <button
                      onClick={() => updateFilter('showRead', !filters.showRead)}
                      className={`flex-1 px-2 py-2 text-xs font-medium rounded-lg transition-colors ${
                        filters.showRead
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      Read
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bulk action bar */}
        <AnimatePresence>
          {hook.selectedIds.size > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-t border-gray-100 dark:border-gray-700 bg-primary-50/50 dark:bg-primary-900/10"
            >
              <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-primary-700 dark:text-primary-400">
                  {hook.selectedIds.size} selected
                </span>
                <div className="flex-1" />
                <button onClick={hook.markSelectedRead} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <MailOpen className="w-4 h-4" /> Mark Read
                </button>
                <button onClick={hook.markSelectedUnread} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <Mail className="w-4 h-4" /> Mark Unread
                </button>
                {!filters.showArchived ? (
                  <button onClick={hook.bulkArchive} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white dark:bg-gray-800 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors">
                    <Archive className="w-4 h-4" /> Archive
                  </button>
                ) : (
                  <button onClick={hook.bulkRestore} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white dark:bg-gray-800 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors">
                    <RotateCcw className="w-4 h-4" /> Restore
                  </button>
                )}
                <button onClick={hook.bulkDelete} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white dark:bg-gray-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                  <Trash2 className="w-4 h-4" /> Delete
                </button>
                <button onClick={hook.clearSelection} className="p-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Notification list */}
      <div
        ref={scrollContainerRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        className="max-w-5xl mx-auto px-4 sm:px-6 py-4 pb-24 md:pb-8 overflow-y-auto"
      >
        {/* Pull to refresh indicator */}
        {isRefreshing && (
          <div className="flex items-center justify-center py-4">
            <div className="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Bulk select toggle */}
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setShowBulkActions(!showBulkActions)}
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
          >
            {showBulkActions ? 'Done selecting' : 'Select multiple'}
          </button>
          {showBulkActions && hook.notifications.length > 0 && (
            <button
              onClick={hook.selectAll}
              className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
            >
              Select all
            </button>
          )}
        </div>

        {hook.loading ? (
          <NotificationSkeleton />
        ) : hook.notifications.length === 0 ? (
          <EmptyState category={filters.category} isArchived={filters.showArchived} />
        ) : (
          <div className="space-y-6">
            {processedGroups.map(group => (
              <div key={group.label}>
                {/* Date group header */}
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                    {group.label}
                  </h2>
                  <div className="flex-1 h-px bg-gray-100 dark:bg-gray-700" />
                </div>

                {/* Ungrouped notifications */}
                <div className="space-y-2">
                  {group.ungrouped.map(n => (
                    <NotificationCard
                      key={n.id}
                      notification={n}
                      onMarkRead={hook.markAsRead}
                      onMarkUnread={hook.markAsUnread}
                      onArchive={hook.archive}
                      onDelete={hook.softDelete}
                      onSelect={hook.toggleSelect}
                      isSelected={hook.selectedIds.has(n.id)}
                      showBulkActions={showBulkActions}
                      isArchivedView={filters.showArchived}
                      onUnarchive={hook.unarchive}
                    />
                  ))}
                </div>

                {/* Grouped notifications */}
                {group.grouped.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {group.grouped.map(n => (
                      <NotificationCard
                        key={n.id}
                        notification={n}
                        onMarkRead={hook.markAsRead}
                        onMarkUnread={hook.markAsUnread}
                        onArchive={hook.archive}
                        onDelete={hook.softDelete}
                        onSelect={hook.toggleSelect}
                        isSelected={hook.selectedIds.has(n.id)}
                        showBulkActions={showBulkActions}
                        isArchivedView={filters.showArchived}
                        onUnarchive={hook.unarchive}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Load more */}
            {hook.hasMore && !hook.loading && (
              <div className="flex items-center justify-center py-4">
                <button
                  onClick={hook.loadMore}
                  disabled={hook.loadingMore}
                  className="px-6 py-2.5 text-sm font-medium rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                >
                  {hook.loadingMore ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
                      Loading...
                    </span>
                  ) : (
                    'Load more'
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
