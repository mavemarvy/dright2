// Types for Help Center, Tutorials, Challenges, Legal, Permissions systems

export type ContentStatus = 'draft' | 'published' | 'scheduled' | 'hidden' | 'archived';

export interface HelpCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string;
  sort_order: number;
  is_deleted: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface HelpArticle {
  id: string;
  category_id: string | null;
  title: string;
  slug: string;
  content: string;
  summary: string | null;
  tags: string[];
  view_count: number;
  sort_order: number;
  status: ContentStatus;
  is_published: boolean;
  publish_at: string | null;
  expire_at: string | null;
  is_deleted: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  category?: HelpCategory | null;
}

export interface FaqItem {
  id: string;
  category_id: string | null;
  question: string;
  answer: string;
  tags: string[];
  sort_order: number;
  status: ContentStatus;
  is_published: boolean;
  is_deleted: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  category?: HelpCategory | null;
}

export interface SupportDepartment {
  id: string;
  name: string;
  description: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  telegram: string | null;
  messenger: string | null;
  live_chat_link: string | null;
  working_hours: string | null;
  avg_response_time: string | null;
  is_available: boolean;
  sort_order: number;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface TutorialCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface Tutorial {
  id: string;
  category_id: string | null;
  title: string;
  slug: string;
  description: string | null;
  content: string;
  cover_image: string | null;
  thumbnail: string | null;
  video_type: 'youtube' | 'vimeo' | 'direct';
  video_url: string | null;
  video_thumbnail: string | null;
  duration_minutes: number;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  tags: string[];
  view_count: number;
  sort_order: number;
  status: ContentStatus;
  is_published: boolean;
  publish_at: string | null;
  is_deleted: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  category?: TutorialCategory | null;
}

export interface Challenge {
  id: string;
  title: string;
  description: string | null;
  banner_image: string | null;
  icon: string;
  reward_amount: number;
  reward_currency: string;
  reward_description: string | null;
  start_date: string | null;
  end_date: string | null;
  requirements: unknown[];
  challenge_type: string;
  status: 'upcoming' | 'active' | 'completed' | 'expired';
  is_active: boolean;
  sort_order: number;
  is_deleted: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChallengeProgress {
  id: string;
  challenge_id: string;
  user_id: string;
  progress: number;
  is_completed: boolean;
  completed_at: string | null;
  reward_claimed: boolean;
  claimed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LegalPage {
  id: string;
  title: string;
  slug: string;
  page_type: string;
  content: string;
  is_published: boolean;
  publish_at: string | null;
  version_number: number;
  is_deleted: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PolicyVersion {
  id: string;
  legal_page_id: string;
  version_number: number;
  content: string;
  change_summary: string | null;
  created_by: string | null;
  created_at: string;
}

export interface PermissionInfo {
  id: string;
  permission_type: 'camera' | 'gallery' | 'storage' | 'notifications' | 'location' | 'microphone';
  title: string;
  description: string;
  image_url: string | null;
  video_url: string | null;
  is_enabled: boolean;
  sort_order: number;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

export const LEGAL_PAGE_TYPES: Array<{ value: string; label: string }> = [
  { value: 'terms', label: 'Terms of Service' },
  { value: 'privacy', label: 'Privacy Policy' },
  { value: 'refund', label: 'Refund Policy' },
  { value: 'vendor_agreement', label: 'Vendor Agreement' },
  { value: 'affiliate_agreement', label: 'Affiliate Agreement' },
  { value: 'buyer_rules', label: 'Buyer Rules' },
  { value: 'seller_rules', label: 'Seller Rules' },
  { value: 'community_guidelines', label: 'Community Guidelines' },
  { value: 'kyc_policy', label: 'KYC Policy' },
  { value: 'advertising_policy', label: 'Advertising Policy' },
];

export const PERMISSION_TYPES: Array<{ value: string; label: string; icon: string }> = [
  { value: 'camera', label: 'Camera', icon: 'Camera' },
  { value: 'gallery', label: 'Gallery', icon: 'Image' },
  { value: 'storage', label: 'Storage', icon: 'HardDrive' },
  { value: 'notifications', label: 'Notifications', icon: 'Bell' },
  { value: 'location', label: 'Location', icon: 'MapPin' },
  { value: 'microphone', label: 'Microphone', icon: 'Mic' },
];

export const DIFFICULTY_LEVELS: Array<{ value: string; label: string; color: string }> = [
  { value: 'beginner', label: 'Beginner', color: 'green' },
  { value: 'intermediate', label: 'Intermediate', color: 'blue' },
  { value: 'advanced', label: 'Advanced', color: 'purple' },
];

export const CHALLENGE_STATUSES: Array<{ value: string; label: string; color: string }> = [
  { value: 'upcoming', label: 'Upcoming', color: 'blue' },
  { value: 'active', label: 'Active', color: 'green' },
  { value: 'completed', label: 'Completed', color: 'gray' },
  { value: 'expired', label: 'Expired', color: 'red' },
];
