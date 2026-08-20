export type BannerStatus = 'active' | 'disabled' | 'archived';
export type BannerType = 'platform' | 'seller_sponsored' | 'affiliate_campaign' | 'partner_ad';
export type ButtonStyle = 'primary' | 'secondary' | 'ghost' | 'gradient';
export type PaymentStatus = 'unpaid' | 'pending' | 'paid' | 'refunded';
export type AnalyticsEventType = 'impression' | 'click' | 'conversion';
export type DeviceType = 'mobile' | 'tablet' | 'desktop';

export type DestinationType =
  | 'product' | 'service' | 'job' | 'course' | 'category' | 'store'
  | 'tutorials' | 'announcements' | 'challenges' | 'referral'
  | 'affiliate' | 'vendor' | 'help' | 'external';

export type TargetAudience =
  | 'all' | 'buyers' | 'sellers' | 'affiliates' | 'vendors' | 'new_users' | 'verified_users';

export interface BannerLink {
  id: string;
  banner_id: string;
  destination_type: DestinationType;
  destination_id: string | null;
  external_url: string | null;
  created_at: string;
}

export interface MarketplaceBanner {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  badge_text: string | null;
  promotional_message: string | null;
  desktop_image: string | null;
  tablet_image: string | null;
  mobile_image: string | null;
  background_image: string | null;
  video_url: string | null;
  media_url: string | null;
  media_type: string;
  button_text: string | null;
  button_link: string | null;
  button_style: ButtonStyle;
  button_visible: boolean;
  banner_type: BannerType;
  target_audience: TargetAudience[];
  start_date: string | null;
  end_date: string | null;
  starts_at: string | null;
  ends_at: string | null;
  status: BannerStatus;
  is_active: boolean;
  priority: number;
  display_order: number;
  countdown_ends_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  deleted_at: string | null;
  advertiser_name: string | null;
  campaign_id: string | null;
  payment_status: PaymentStatus;
  campaign_duration: string | null;
  budget: number | null;
  performance_data: Record<string, unknown>;
}

export interface BannerAnalyticsRow {
  id: string;
  banner_id: string;
  user_id: string | null;
  event_type: AnalyticsEventType;
  device_type: DeviceType;
  timestamp: string;
}

export interface BannerAnalyticsSummary {
  banner_id: string;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
}

export interface BannerInput {
  title: string;
  subtitle?: string | null;
  description?: string | null;
  badge_text?: string | null;
  promotional_message?: string | null;
  desktop_image?: string | null;
  tablet_image?: string | null;
  mobile_image?: string | null;
  background_image?: string | null;
  video_url?: string | null;
  button_text?: string | null;
  button_link?: string | null;
  button_style?: ButtonStyle;
  button_visible?: boolean;
  banner_type?: BannerType;
  target_audience?: TargetAudience[];
  start_date?: string | null;
  end_date?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  status?: BannerStatus;
  priority?: number;
  display_order?: number;
  countdown_ends_at?: string | null;
  advertiser_name?: string | null;
  campaign_id?: string | null;
  payment_status?: PaymentStatus;
  campaign_duration?: string | null;
  budget?: number | null;
}

export const BANNER_STATUSES: { value: BannerStatus; label: string; color: string }[] = [
  { value: 'active', label: 'Active', color: 'text-green-600' },
  { value: 'disabled', label: 'Disabled', color: 'text-gray-500' },
  { value: 'archived', label: 'Archived', color: 'text-orange-600' },
];

export const BANNER_TYPES: { value: BannerType; label: string }[] = [
  { value: 'platform', label: 'Platform Banner' },
  { value: 'seller_sponsored', label: 'Seller Sponsored' },
  { value: 'affiliate_campaign', label: 'Affiliate Campaign' },
  { value: 'partner_ad', label: 'Partner Advertisement' },
];

export const BUTTON_STYLES: { value: ButtonStyle; label: string }[] = [
  { value: 'primary', label: 'Primary (White)' },
  { value: 'secondary', label: 'Secondary (Outline)' },
  { value: 'ghost', label: 'Ghost (Transparent)' },
  { value: 'gradient', label: 'Gradient' },
];

export const TARGET_AUDIENCES: { value: TargetAudience; label: string }[] = [
  { value: 'all', label: 'All Users' },
  { value: 'buyers', label: 'Buyers' },
  { value: 'sellers', label: 'Sellers' },
  { value: 'affiliates', label: 'Affiliates' },
  { value: 'vendors', label: 'Vendors' },
  { value: 'new_users', label: 'New Users' },
  { value: 'verified_users', label: 'Verified Users' },
];

export const DESTINATION_TYPES: { value: DestinationType; label: string }[] = [
  { value: 'product', label: 'Product Page' },
  { value: 'service', label: 'Service Page' },
  { value: 'job', label: 'Job Page' },
  { value: 'course', label: 'Course Page' },
  { value: 'category', label: 'Category Page' },
  { value: 'store', label: 'Seller Store' },
  { value: 'tutorials', label: 'Tutorials' },
  { value: 'announcements', label: 'Announcements' },
  { value: 'challenges', label: 'Challenges' },
  { value: 'referral', label: 'Referral Page' },
  { value: 'affiliate', label: 'Affiliate Page' },
  { value: 'vendor', label: 'Vendor Page' },
  { value: 'help', label: 'Help Center' },
  { value: 'external', label: 'External Link' },
];

export const PAYMENT_STATUSES: { value: PaymentStatus; label: string }[] = [
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'pending', label: 'Pending' },
  { value: 'paid', label: 'Paid' },
  { value: 'refunded', label: 'Refunded' },
];

export function resolveBannerUrl(link?: BannerLink | null, fallback?: string | null): string | null {
  if (link) {
    if (link.destination_type === 'external' && link.external_url) return link.external_url;
    if (link.destination_id) {
      const routes: Partial<Record<DestinationType, string>> = {
        product: `/product/${link.destination_id}`,
        service: `/product/${link.destination_id}`,
        job: `/jobs/${link.destination_id}`,
        course: `/product/${link.destination_id}`,
        category: `/market?category=${link.destination_id}`,
        store: `/shop/${link.destination_id}`,
        tutorials: '/tutorials',
        announcements: '/announcements',
        challenges: '/challenges',
        referral: '/refer',
        affiliate: '/affiliate',
        vendor: '/vendor',
        help: '/help',
      };
      return routes[link.destination_type] || null;
    }
  }
  return fallback || null;
}

export function detectDeviceType(): DeviceType {
  if (typeof window === 'undefined') return 'desktop';
  const width = window.innerWidth;
  if (width < 768) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}
