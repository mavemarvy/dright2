export const USER_NAV_FEATURE_BY_PATH = {
  '/': 'dashboard',
  '/market': 'market',
  '/social': 'social',
  '/news': 'news',
  '/promote': 'promote',
  '/profile': 'profile',
  '/wallet': 'wallet',
  '/my-orders': 'my_orders',
  '/wishlist': 'saved_items',
  '/chat': 'messages',
  '/store': 'my_store',
  '/upload-product': 'post_ad',
  '/drafts': 'my_drafts',
  '/sales': 'sales',
  '/jobs': 'job_board',
  '/refer': 'refer',
  '/campaigns': 'campaigns',
  '/creator-campaigns': 'creator_campaigns',
  '/rewards': 'rewards',
  '/communities': 'communities',
  '/notifications': 'notifications',
  '/activity': 'activity_feed',
  '/challenges': 'challenges',
  '/announcements': 'announcements',
  '/help': 'help_support',
  '/tutorials': 'tutorials',
  '/legal': 'terms_policies',
  '/settings': 'settings',
} as const;

export type UserNavigationFeatureKey =
  typeof USER_NAV_FEATURE_BY_PATH[keyof typeof USER_NAV_FEATURE_BY_PATH];

export function getUserNavigationFeatureForPath(pathname: string): UserNavigationFeatureKey | null {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;

  if (normalized === '/') return 'dashboard';
  if (normalized === '/market') return 'market';
  if (/^\/product\/[^/]+\/edit$/.test(normalized)) return 'post_ad';
  if (/^\/product\/[^/]+$/.test(normalized)) return 'market';
  if (normalized === '/social' || normalized.startsWith('/social/')) return 'social';
  if (normalized === '/news') return 'news';
  if (normalized === '/promote') return 'promote';

  if (normalized === '/profile') return 'profile';
  if (normalized === '/wallet' || normalized.startsWith('/wallet/')) return 'wallet';
  if (normalized === '/my-orders') return 'my_orders';
  if (normalized === '/wishlist' || normalized === '/collections' || normalized === '/compare') return 'saved_items';
  if (normalized === '/chat' || normalized === '/blocked-users') return 'messages';

  if (normalized === '/store') return 'my_store';
  if (normalized === '/upload-product') return 'post_ad';
  if (normalized === '/drafts') return 'my_drafts';
  if (normalized === '/sales') return 'sales';
  if (normalized === '/jobs' || normalized.startsWith('/jobs/') || normalized === '/post-job') return 'job_board';

  if (normalized === '/refer') return 'refer';
  if (normalized === '/campaigns') return 'campaigns';
  if (normalized === '/creator-campaigns' || normalized.startsWith('/creator-campaigns/')) return 'creator_campaigns';
  if (normalized === '/rewards' || normalized === '/leaderboards' || normalized === '/achievements') return 'rewards';

  if (normalized === '/communities' || normalized.startsWith('/communities/')) return 'communities';
  if (normalized === '/notifications' || normalized === '/notification-preferences') return 'notifications';
  if (normalized === '/activity') return 'activity_feed';
  if (normalized === '/challenges') return 'challenges';
  if (normalized === '/announcements') return 'announcements';

  if (normalized === '/help') return 'help_support';
  if (normalized === '/tutorials') return 'tutorials';
  if (normalized === '/legal' || normalized.startsWith('/legal/') || normalized === '/permissions') return 'terms_policies';
  if (normalized === '/settings' || normalized === '/security') return 'settings';

  return null;
}
