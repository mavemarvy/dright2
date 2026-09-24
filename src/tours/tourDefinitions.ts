export type TourKey =
  | 'basics'
  | 'marketplace'
  | 'wallet'
  | 'referral'
  | 'challenges'
  | 'orders'
  | 'profile';

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

export const TOUR_DEFINITIONS: Record<TourKey, TourDefinition> = {
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
        body: 'The challenge card shows the monthly rewards, current leaders and the metric used for ranking.',
        target: '[data-tour="challenges-podium"]',
      },
      {
        title: 'Participants and your position',
        body: 'The leaderboard ranks qualifying activity. Your own position can stay visible so you do not need to scroll through thousands of participants to find yourself.',
        target: '[data-tour="challenges-ranking"]',
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
