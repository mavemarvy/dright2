import type { Product, Job } from '../../lib/types';

export type ProfileRole =
  | 'buyer'
  | 'seller'
  | 'vendor'
  | 'service_provider'
  | 'affiliate'
  | 'employer'
  | 'campaign_creator'
  | 'creator'
  | 'agency'
  | 'admin';

export interface ProfileSectionConfig {
  key: string;
  label: string;
  icon: string;
  order: number;
  visible: boolean;
}

export interface ProfileData {
  id: string;
  full_name: string | null;
  username: string | null;
  email: string;
  phone?: string | null;
  avatar_url: string | null;
  cover_image: string | null;
  bio: string | null;
  website: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  location: string | null;
  show_email: boolean;
  show_phone: boolean;
  languages: string[];
  created_at: string;
  last_active: string | null;
  is_online: boolean;
  verified: boolean;
  is_verified: boolean;
  is_admin: boolean;
  admin_role: string | null;
  role: string;
  account_status: string;
  store_title: string | null;
  store_banner_url: string | null;
  store_description: string | null;
  store_location: string | null;
  store_theme: Record<string, unknown> | null;
  average_rating: number;
  total_reviews: number;
  total_sales_count: number;
  weekly_sales_count: number;
  response_rate: number;
  avg_response_time_hours: number;
  marketer_status: string;
  advertiser_status: string;
  affiliate_earnings: number;
  referral_code: string | null;
  social_media_links: Record<string, string>;
  followers_count: number;
  location_verified: boolean;
}

export interface ProfileProduct extends Pick<Product, 'id' | 'name' | 'description' | 'price' | 'image_url' | 'category' | 'is_free' | 'product_type' | 'approval_status' | 'is_hidden' | 'total_reviews' | 'average_rating' | 'created_at' | 'old_price' | 'discount_percent'> {}

export interface ProfileJob extends Pick<Job, 'id' | 'title' | 'category' | 'job_type' | 'work_setup' | 'region' | 'created_at' | 'salary_min' | 'salary_max' | 'salary_currency' | 'total_applications'> {}

export interface BadgeInfo {
  id: string;
  label: string;
  icon: string;
  color: string;
  priority: number;
  description?: string;
}

export interface ProfileStats {
  total_listings: number;
  total_sales: number;
  total_reviews: number;
  average_rating: number;
  response_time_hours: number;
  years_on_dright: number;
  completed_orders: number;
  followers: number;
  profile_views: number;
}

export type SortOption = 'newest' | 'price_low' | 'price_high' | 'rating' | 'best_match';

export interface RoleConfig {
  role: ProfileRole;
  label: string;
  defaultTab: string;
  sections: ProfileSectionConfig[];
  showStorefront: boolean;
  showPortfolio: boolean;
  showJobs: boolean;
  showAffiliate: boolean;
  showCampaigns: boolean;
  showStats: boolean;
  showReviews: boolean;
  showBadges: boolean;
  showAbout: boolean;
  showContact: boolean;
}

export function detectRole(profile: ProfileData, hasProducts: boolean, hasServices: boolean, hasJobs: boolean, hasCampaigns: boolean): ProfileRole {
  if (profile.is_admin || profile.admin_role) return 'admin';
  if (hasJobs) return 'employer';
  if (hasServices) return 'service_provider';
  if (hasCampaigns) return 'campaign_creator';
  if (profile.marketer_status === 'active' || profile.advertiser_status === 'active') return 'affiliate';
  if (hasProducts) return 'seller';
  if (profile.role === 'vendor') return 'vendor';
  return 'buyer';
}

export function getRoleConfig(role: ProfileRole): RoleConfig {
  const baseSections: ProfileSectionConfig[] = [
    { key: 'overview', label: 'Overview', icon: 'LayoutGrid', order: 0, visible: true },
    { key: 'about', label: 'About', icon: 'Info', order: 1, visible: true },
    { key: 'reviews', label: 'Reviews', icon: 'Star', order: 5, visible: true },
    { key: 'badges', label: 'Badges', icon: 'Award', order: 6, visible: true },
  ];

  switch (role) {
    case 'seller':
    case 'vendor':
      return {
        role,
        label: role === 'vendor' ? 'Vendor' : 'Seller',
        defaultTab: 'storefront',
        sections: [
          ...baseSections,
          { key: 'storefront', label: 'Store', icon: 'Store', order: 2, visible: true },
          { key: 'products', label: 'Products', icon: 'Package', order: 3, visible: true },
        ],
        showStorefront: true, showPortfolio: false, showJobs: false,
        showAffiliate: false, showCampaigns: false, showStats: true,
        showReviews: true, showBadges: true, showAbout: true, showContact: true,
      };
    case 'service_provider':
      return {
        role,
        label: 'Service Provider',
        defaultTab: 'portfolio',
        sections: [
          ...baseSections,
          { key: 'portfolio', label: 'Portfolio', icon: 'Briefcase', order: 2, visible: true },
          { key: 'services', label: 'Services', icon: 'Sparkles', order: 3, visible: true },
        ],
        showStorefront: false, showPortfolio: true, showJobs: false,
        showAffiliate: false, showCampaigns: false, showStats: true,
        showReviews: true, showBadges: true, showAbout: true, showContact: true,
      };
    case 'employer':
      return {
        role,
        label: 'Employer',
        defaultTab: 'jobs',
        sections: [
          ...baseSections,
          { key: 'jobs', label: 'Jobs', icon: 'Briefcase', order: 2, visible: true },
        ],
        showStorefront: false, showPortfolio: false, showJobs: true,
        showAffiliate: false, showCampaigns: false, showStats: true,
        showReviews: true, showBadges: true, showAbout: true, showContact: true,
      };
    case 'affiliate':
      return {
        role,
        label: 'Affiliate',
        defaultTab: 'overview',
        sections: [
          ...baseSections,
          { key: 'affiliate', label: 'Affiliate', icon: 'TrendingUp', order: 2, visible: true },
        ],
        showStorefront: false, showPortfolio: false, showJobs: false,
        showAffiliate: true, showCampaigns: false, showStats: true,
        showReviews: true, showBadges: true, showAbout: true, showContact: true,
      };
    case 'campaign_creator':
      return {
        role,
        label: 'Campaign Creator',
        defaultTab: 'campaigns',
        sections: [
          ...baseSections,
          { key: 'campaigns', label: 'Campaigns', icon: 'Megaphone', order: 2, visible: true },
        ],
        showStorefront: false, showPortfolio: false, showJobs: false,
        showAffiliate: false, showCampaigns: true, showStats: true,
        showReviews: true, showBadges: true, showAbout: true, showContact: true,
      };
    case 'creator':
      return {
        role,
        label: 'Creator',
        defaultTab: 'overview',
        sections: [
          ...baseSections,
          { key: 'creations', label: 'Creations', icon: 'Sparkles', order: 2, visible: true },
        ],
        showStorefront: false, showPortfolio: true, showJobs: false,
        showAffiliate: false, showCampaigns: false, showStats: true,
        showReviews: true, showBadges: true, showAbout: true, showContact: true,
      };
    case 'admin':
      return {
        role,
        label: 'Administrator',
        defaultTab: 'overview',
        sections: baseSections,
        showStorefront: false, showPortfolio: false, showJobs: false,
        showAffiliate: false, showCampaigns: false, showStats: false,
        showReviews: false, showBadges: true, showAbout: true, showContact: true,
      };
    default:
      return {
        role: 'buyer',
        label: 'Buyer',
        defaultTab: 'overview',
        sections: baseSections,
        showStorefront: false, showPortfolio: false, showJobs: false,
        showAffiliate: false, showCampaigns: false, showStats: true,
        showReviews: true, showBadges: true, showAbout: true, showContact: true,
      };
  }
}

export function getProfileBadges(profile: ProfileData): BadgeInfo[] {
  const badges: BadgeInfo[] = [];

  if (profile.verified || profile.is_verified) {
    badges.push({
      id: 'verified',
      label: 'Verified',
      icon: 'BadgeCheck',
      color: 'blue',
      priority: 100,
      description: 'Identity verified',
    });
  }

  if (profile.total_sales_count >= 100) {
    badges.push({
      id: 'top_seller',
      label: 'Top Seller',
      icon: 'Award',
      color: 'amber',
      priority: 90,
      description: '100+ sales',
    });
  }

  if (profile.average_rating >= 4.5 && profile.total_reviews >= 50) {
    badges.push({
      id: 'trusted_vendor',
      label: 'Trusted Vendor',
      icon: 'ShieldCheck',
      color: 'green',
      priority: 85,
      description: 'Highly rated seller',
    });
  }

  if (profile.response_rate >= 90 || (profile.avg_response_time_hours && profile.avg_response_time_hours <= 2)) {
    badges.push({
      id: 'fast_responder',
      label: 'Fast Responder',
      icon: 'Zap',
      color: 'purple',
      priority: 80,
      description: 'Responds quickly',
    });
  }

  if (profile.marketer_status === 'active') {
    badges.push({
      id: 'top_affiliate',
      label: 'Top Affiliate',
      icon: 'TrendingUp',
      color: 'indigo',
      priority: 75,
      description: 'Active affiliate partner',
    });
  }

  if (profile.is_admin) {
    badges.push({
      id: 'admin',
      label: 'Admin',
      icon: 'Shield',
      color: 'red',
      priority: 95,
      description: 'Platform administrator',
    });
  }

  if (profile.location_verified) {
    badges.push({
      id: 'location_verified',
      label: 'Location Verified',
      icon: 'MapPin',
      color: 'teal',
      priority: 70,
      description: 'Location confirmed',
    });
  }

  return badges.sort((a, b) => b.priority - a.priority);
}

export function formatStatValue(value: number, type: 'count' | 'rating' | 'hours' | 'years'): string {
  switch (type) {
    case 'rating':
      return value.toFixed(1);
    case 'hours':
      return value < 1 ? '<1h' : value < 24 ? `${Math.round(value)}h` : `${Math.round(value / 24)}d`;
    case 'years':
      return value < 1 ? '<1y' : `${Math.floor(value)}y`;
    default:
      return value.toLocaleString();
  }
}
