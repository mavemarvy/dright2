export type TourKey =
  | 'basics'
  | 'dashboard'
  | 'marketplace'
  | 'social'
  | 'news'
  | 'promote'
  | 'profile'
  | 'subscriptions'
  | 'wallet'
  | 'orders'
  | 'saved_items'
  | 'messages'
  | 'my_store'
  | 'post_ad'
  | 'my_drafts'
  | 'sales'
  | 'job_board'
  | 'referral'
  | 'campaigns'
  | 'creator_campaigns'
  | 'rewards'
  | 'communities'
  | 'notifications'
  | 'activity_feed'
  | 'challenges'
  | 'announcements'
  | 'help_support'
  | 'tutorials'
  | 'terms_policies'
  | 'settings';

export type TourPlacement = 'top' | 'bottom' | 'center';

export type TourStep = {
  title: string;
  body: string;
  target?: string;
  placement?: TourPlacement;
  route?: string;
};

export type TourDefinition = {
  key: TourKey;
  version: number;
  title: string;
  description: string;
  duration: string;
  startPath: string;
  autoStart?: boolean;
  steps: TourStep[];
};

function pageTour(
  key: TourKey,
  title: string,
  description: string,
  startPath: string,
  body: string,
  navFeatureKey: string,
): TourDefinition {
  return {
    key,
    version: 1,
    title,
    description,
    duration: '1 min',
    startPath,
    steps: [
      {
        title,
        body,
        placement: 'center',
        route: startPath,
      },
      {
        title: 'Where to find it',
        body: `${title} is available from your DRIGHT navigation menu. On mobile, open the menu button to see the full list.`,
        target: `[data-tour="nav-${navFeatureKey}"]`,
        route: startPath,
      },
    ],
  };
}

export const TOUR_DEFINITIONS: Record<TourKey, TourDefinition> = {
  dashboard: pageTour(
    'dashboard',
    'Dashboard',
    'Learn where your main DRIGHT overview and dashboard navigation live.',
    '/',
    'The Dashboard is your starting point for account shortcuts, activity, performance and quick access to the rest of DRIGHT.',
    'dashboard',
  ),
  basics: {
    key: 'basics',
    version: 1,
    title: 'DRIGHT Basics',
    description: 'A quick orientation to the main DRIGHT user interface.',
    duration: '2 min',
    startPath: '/',
    autoStart: true,
    steps: [
      {
        title: 'Welcome to DRIGHT',
        body: 'DRIGHT brings your marketplace, social activity, referrals, earnings, orders and growth tools together in one place. This short tour shows you where the main controls are.',
        placement: 'center',
      },
      {
        title: 'Your navigation',
        body: 'Use this menu to reach your account, store, referral tools, communities, support and the rest of DRIGHT. On mobile, tap the menu button whenever you need the full list.',
        target: '[data-tour="navigation-menu"]',
      },
      {
        title: 'Dashboard',
        body: 'Your dashboard is the personal overview for shortcuts, activity, earnings, sales and performance information.',
        target: '[data-tour="nav-dashboard"]',
      },
      {
        title: 'Marketplace',
        body: 'Browse products, services, courses and other listings. Search, filter, save items and open listings for full details.',
        target: '[data-tour="nav-market"]',
      },
      {
        title: 'Social',
        body: 'Use Social to follow people, discover posts and interact with the DRIGHT community.',
        target: '[data-tour="nav-social"]',
      },
      {
        title: 'News',
        body: 'News keeps DRIGHT announcements and important platform updates easy to find.',
        target: '[data-tour="nav-news"]',
      },
      {
        title: 'Your account',
        body: 'Your identity appears here. Open the full menu for Profile and Settings. You can replay any tour later from Help Center.',
        target: '[data-tour="profile-control"]',
      },
    ],
  },
  marketplace: {
    key: 'marketplace',
    version: 1,
    title: 'Marketplace',
    description: 'Learn search, filters, listings and seller actions.',
    duration: '2 min',
    startPath: '/market',
    steps: [
      {
        title: 'Search the marketplace',
        body: 'Search across DRIGHT listings and use discovery suggestions to find what you need faster.',
        target: '[data-tour="marketplace-search"]',
        route: '/market',
      },
      {
        title: 'Filter and sort',
        body: 'Narrow results by listing type, category, price, location, verification and other available filters. You can also change the listing-card size.',
        target: '[data-tour="marketplace-filters"]',
      },
      {
        title: 'Browse listings',
        body: 'Open a listing for full details, save it, compare it when available, or use eligible affiliate sharing options.',
        target: '[data-tour="marketplace-listings"]',
      },
      {
        title: 'Sell on DRIGHT',
        body: 'When you are ready to list something, use Post an Ad to start the seller listing flow.',
        target: '[data-tour="marketplace-post-ad"]',
      },
    ],
  },
  social: pageTour(
    'social',
    'Social',
    'Learn where DRIGHT social posts, profiles and interactions live.',
    '/social',
    'Use Social to discover posts, follow people, participate in conversations and keep up with the DRIGHT community.',
    'social',
  ),
  news: pageTour(
    'news',
    'News',
    'Find DRIGHT announcements and platform updates.',
    '/news',
    'News collects current DRIGHT announcements and important platform information in one place.',
    'news',
  ),
  promote: pageTour(
    'promote',
    'Promote',
    'Learn where listing and campaign promotion starts.',
    '/promote',
    'Use Promote to review available promotion options, visibility products and campaign tools for eligible listings.',
    'promote',
  ),
  profile: {
    key: 'profile',
    version: 1,
    title: 'Profile & Account',
    description: 'Learn your profile, wallet shortcut and account settings.',
    duration: '1 min',
    startPath: '/profile',
    steps: [
      {
        title: 'Your profile',
        body: 'Your profile contains your public identity, picture and the personal information DRIGHT uses for your account.',
        target: '[data-tour="profile-card"]',
        route: '/profile',
      },
      {
        title: 'Available balance',
        body: 'This shortcut shows the live available wallet balance and provides quick access to verified withdrawals.',
        target: '[data-tour="profile-balance"]',
      },
      {
        title: 'Social connections',
        body: 'Followers, following and friends are accessible directly from your profile.',
        target: '[data-tour="profile-social"]',
      },
      {
        title: 'Account settings',
        body: 'Open Settings for profile, account, payment PIN, privacy, notification and security controls.',
        target: '[data-tour="profile-settings"]',
      },
    ],
  },
  subscriptions: pageTour(
    'subscriptions',
    'Subscriptions & Capacity',
    'Understand platform access, trials, subscription status and listing capacity.',
    '/subscriptions',
    'This page shows your current platform-access state, remaining trial or subscription time, available plans and listing-capacity options.',
    'subscriptions',
  ),
  wallet: {
    key: 'wallet',
    version: 1,
    title: 'Wallet & Withdrawals',
    description: 'Understand balances, funding, withdrawals and history.',
    duration: '2 min',
    startPath: '/wallet',
    steps: [
      {
        title: 'Your DRIGHT wallet',
        body: 'Your wallet separates money by status and source so you can see what is available, pending, locked, in escrow or earned through DRIGHT programs.',
        target: '[data-tour="wallet-balances"]',
        route: '/wallet',
      },
      {
        title: 'Fund your wallet',
        body: 'Use Fund Wallet when you want to add supported funds to your DRIGHT wallet.',
        target: '[data-tour="wallet-fund"]',
      },
      {
        title: 'Withdraw',
        body: 'Use Withdraw to request a payout from eligible available funds. Security and verified payout-account requirements still apply.',
        target: '[data-tour="wallet-withdraw"]',
      },
      {
        title: 'Transaction history',
        body: 'Review wallet activity here, including the status and source of transactions.',
        target: '[data-tour="wallet-history"]',
      },
    ],
  },
  orders: {
    key: 'orders',
    version: 1,
    title: 'My Orders',
    description: 'Track purchases, downloads and service orders.',
    duration: '1 min',
    startPath: '/my-orders',
    steps: [
      {
        title: 'Order center',
        body: 'My Orders keeps your purchases, digital access and service orders together.',
        target: '[data-tour="orders-page"]',
        route: '/my-orders',
      },
      {
        title: 'Order tabs',
        body: 'Switch between Active, Completed and Downloads to quickly find the order state you need.',
        target: '[data-tour="orders-tabs"]',
      },
      {
        title: 'Order activity',
        body: 'Each order card shows its status and the actions available for that order type.',
        target: '[data-tour="orders-list"]',
      },
    ],
  },
  saved_items: pageTour(
    'saved_items',
    'Saved Items',
    'Find products and listings you saved for later.',
    '/wishlist',
    'Saved Items keeps your wishlist and saved marketplace choices together so you can return to them without searching again.',
    'saved_items',
  ),
  messages: pageTour(
    'messages',
    'Messages',
    'Learn where buyer, seller and user conversations live.',
    '/chat',
    'Messages is your DRIGHT conversation center for eligible marketplace and user chats.',
    'messages',
  ),
  my_store: pageTour(
    'my_store',
    'My Store',
    'Manage your seller storefront and published inventory.',
    '/store',
    'My Store is the seller workspace for your storefront, listings and store-facing information.',
    'my_store',
  ),
  post_ad: pageTour(
    'post_ad',
    'Post an Ad',
    'Learn how to create a product, service or other eligible listing.',
    '/upload-product',
    'Post an Ad starts the listing workflow. Complete the required listing details and submit the item for the applicable review process.',
    'post_ad',
  ),
  my_drafts: pageTour(
    'my_drafts',
    'My Drafts',
    'Return to listings you started but have not published.',
    '/drafts',
    'My Drafts keeps unfinished listing work available so you can continue editing before submission.',
    'my_drafts',
  ),
  sales: pageTour(
    'sales',
    'Sales',
    'Review seller sales and order activity.',
    '/sales',
    'Sales shows the seller-side activity and records available for the products or services you sell through DRIGHT.',
    'sales',
  ),
  job_board: {
    key: 'job_board',
    version: 1,
    title: 'Job Board',
    description: 'Learn how to search jobs, filter opportunities and reach employer tools.',
    duration: '2 min',
    startPath: '/jobs',
    steps: [
      {
        title: 'DRIGHT Job Board',
        body: 'Browse active job opportunities, open a role for full details and apply without losing your place in DRIGHT.',
        target: '[data-tour="jobs-hero"]',
        route: '/jobs',
      },
      {
        title: 'Search and filter',
        body: 'Narrow jobs by keywords, location, category, work setup, career level, salary and date posted.',
        target: '[data-tour="jobs-filters"]',
      },
      {
        title: 'Job results',
        body: 'Open any job for its full description. Job items also include a shortcut to the affiliate leaderboard so you can review DRIGHT affiliate rankings.',
        target: '[data-tour="jobs-results"]',
      },
      {
        title: 'Post a job',
        body: 'Employers can start a job listing here. When a professional-access trial has ended, DRIGHT will ask for the platform fee before the posting tool opens.',
        target: '[data-tour="jobs-post"]',
      },
    ],
  },
  referral: {
    key: 'referral',
    version: 1,
    title: 'Referral Program',
    description: 'Learn your link, network levels and referral activity.',
    duration: '2 min',
    startPath: '/refer',
    steps: [
      {
        title: 'Your referral link',
        body: 'This is your personal DRIGHT referral link. Copy or share it when you want to invite someone to DRIGHT.',
        target: '[data-tour="referral-link"]',
        route: '/refer',
      },
      {
        title: 'Referral overview',
        body: 'These cards summarize the referral program and the qualification windows that apply to different referral actions.',
        target: '[data-tour="referral-overview"]',
      },
      {
        title: 'Monthly progress',
        body: 'Track your current monthly referral activity and progress here.',
        target: '[data-tour="referral-target"]',
      },
      {
        title: 'Your three-level network',
        body: 'The referral tree shows your Level 1, Level 2 and Level 3 network structure and the reward level attached to each tier.',
        target: '[data-tour="referral-tree"]',
      },
    ],
  },
  campaigns: pageTour(
    'campaigns',
    'Campaigns',
    'Review campaigns and earning opportunities available to your account.',
    '/campaigns',
    'Campaigns brings available campaign activity, participation and performance tools into one workspace.',
    'campaigns',
  ),
  creator_campaigns: pageTour(
    'creator_campaigns',
    'Creator Campaigns',
    'Create and manage campaign or task opportunities.',
    '/creator-campaigns',
    'Creator Campaigns contains campaign creation, management and creator-side task tools available to eligible accounts.',
    'creator_campaigns',
  ),
  rewards: pageTour(
    'rewards',
    'Rewards',
    'Review reward balances, achievements and related earning records.',
    '/rewards',
    'Rewards shows the reward-side information and progress available to your DRIGHT account.',
    'rewards',
  ),
  communities: pageTour(
    'communities',
    'Communities',
    'Discover and participate in DRIGHT communities.',
    '/communities',
    'Communities lets you browse groups, join conversations and open the communities available to your account.',
    'communities',
  ),
  notifications: pageTour(
    'notifications',
    'Notifications',
    'Review account and marketplace alerts.',
    '/notifications',
    'Notifications keeps important account, marketplace, social and transaction alerts together.',
    'notifications',
  ),
  activity_feed: pageTour(
    'activity_feed',
    'Activity Feed',
    'Review recent activity connected to your account.',
    '/activity',
    'Activity Feed summarizes recent actions and events available to your DRIGHT account.',
    'activity_feed',
  ),
  challenges: {
    key: 'challenges',
    version: 1,
    title: 'DRIGHT Challenges',
    description: 'Understand monthly competitions, rewards and rankings.',
    duration: '2 min',
    startPath: '/challenges',
    steps: [
      {
        title: 'Monthly challenges',
        body: 'DRIGHT Challenges groups the live monthly referral and affiliate competitions in one place.',
        target: '[data-tour="challenges-hero"]',
        route: '/challenges',
      },
      {
        title: 'Choose a section',
        body: 'Switch between Referral and Affiliate challenges, then choose the specific competition you want to view.',
        target: '[data-tour="challenges-selector"]',
      },
      {
        title: 'Rewards and podium',
        body: 'The challenge card shows the monthly rewards, current leaders, the metric used for ranking and a shortcut to the action that can increase your score.',
        target: '[data-tour="challenges-podium"]',
      },
      {
        title: 'Participants and your position',
        body: 'The leaderboard ranks qualifying activity. Your own position can stay visible so you do not need to scroll through thousands of participants to find yourself.',
        target: '[data-tour="challenges-ranking"]',
      },
    ],
  },
  announcements: pageTour(
    'announcements',
    'Announcements',
    'Read official DRIGHT announcements.',
    '/announcements',
    'Announcements contains official platform notices and updates that DRIGHT publishes for users.',
    'announcements',
  ),
  help_support: pageTour(
    'help_support',
    'Help & Support',
    'Find guided tours, answers and support resources.',
    '/help',
    'Help & Support contains the guided tours you can replay, help content and available support routes.',
    'help_support',
  ),
  tutorials: pageTour(
    'tutorials',
    'Tutorials',
    'Open DRIGHT learning material and walkthroughs.',
    '/tutorials',
    'Tutorials contains longer learning content for DRIGHT features and workflows.',
    'tutorials',
  ),
  terms_policies: pageTour(
    'terms_policies',
    'Terms & Policies',
    'Find legal, policy and platform-rule pages.',
    '/legal',
    'Terms & Policies is the central place for DRIGHT legal pages, user policies and applicable platform rules.',
    'terms_policies',
  ),
  settings: pageTour(
    'settings',
    'Settings',
    'Manage account preferences, privacy and security-related options.',
    '/settings',
    'Settings contains the account and preference controls available to you, including privacy, notifications and linked account options.',
    'settings',
  ),
};

export const TOUR_LIST = Object.values(TOUR_DEFINITIONS);
export const PENDING_TOUR_STORAGE_KEY = 'dright:pending-guided-tour';

export function startDrightTour(tourKey: TourKey) {
  try {
    window.sessionStorage.setItem(PENDING_TOUR_STORAGE_KEY, tourKey);
  } catch {
    // Session storage is optional; the in-page event still starts the tour.
  }
  window.dispatchEvent(new CustomEvent('dright:start-tour', { detail: { tourKey } }));
}
