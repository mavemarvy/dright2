export type CmsPageStatus = 'draft' | 'published' | 'scheduled' | 'hidden' | 'archived';
export type CmsBlockType = 'hero' | 'banner' | 'text' | 'image' | 'video' | 'card' | 'faq' | 'countdown' | 'divider';
export type CmsMediaType = 'image' | 'video' | 'document' | 'pdf' | 'icon';
export type CmsButtonType = 'primary' | 'secondary' | 'outline';

export interface CmsButtonAction {
  id: string;
  block_id: string | null;
  button_text: string;
  internal_link: string | null;
  external_link: string | null;
  open_in_new_tab: boolean;
  is_hidden: boolean;
  is_disabled: boolean;
  button_style: CmsButtonType;
  sort_order: number;
}

export interface CmsPage {
  id: string;
  slug: string;
  title: string;
  page_type: string;
  status: CmsPageStatus;
  meta_title: string | null;
  meta_description: string | null;
  meta_keywords: string[] | null;
  og_title: string | null;
  og_description: string | null;
  og_image: string | null;
  canonical_url: string | null;
  publish_at: string | null;
  expire_at: string | null;
  sort_order: number;
  is_deleted: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

export interface CmsBlock {
  id: string;
  page_id: string;
  block_type: CmsBlockType;
  block_data: Record<string, unknown>;
  title: string | null;
  status: CmsPageStatus;
  sort_order: number;
  is_hidden: boolean;
  publish_at: string | null;
  expire_at: string | null;
  is_deleted: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  button_actions?: CmsButtonAction[];
}

export interface CmsMedia {
  id: string;
  filename: string;
  file_url: string;
  file_type: CmsMediaType;
  mime_type: string | null;
  file_size: number;
  folder: string;
  tags: string[];
  alt_text: string | null;
  width: number | null;
  height: number | null;
  is_deleted: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CmsPageVersion {
  id: string;
  page_id: string;
  version_number: number;
  snapshot: {
    page: Partial<CmsPage>;
    blocks: Partial<CmsBlock>[];
  };
  change_summary: string | null;
  created_by: string | null;
  created_at: string;
}

export interface CmsNavigation {
  id: string;
  page_key: string;
  section_key: string;
  sort_order: number;
  is_hidden: boolean;
  config: Record<string, unknown>;
}

export interface CmsVisibilityRule {
  id: string;
  target_type: 'page' | 'block';
  target_id: string;
  user_role: string | null;
  country: string | null;
  device_type: string | null;
  is_visible: boolean;
}

// ─── Block data shapes ──────────────────────────────────────────────────────────

export interface HeroBlockData {
  title: string;
  subtitle: string;
  description: string;
  background_image: string | null;
  background_video: string | null;
  alignment: 'left' | 'center' | 'right';
}

export interface BannerBlockData {
  banners: Array<{
    id: string;
    image_url: string;
    link_url: string | null;
    alt_text: string;
  }>;
  carousel: boolean;
  auto_slide: boolean;
  auto_slide_interval: number;
}

export interface TextBlockData {
  content: string;
}

export interface ImageBlockData {
  images: Array<{
    id: string;
    url: string;
    alt_text: string;
    caption: string;
  }>;
  layout: 'single' | 'gallery' | 'grid' | 'masonry';
  columns: number;
}

export interface VideoBlockData {
  video_type: 'youtube' | 'vimeo' | 'direct';
  video_url: string;
  poster_image: string | null;
  autoplay: boolean;
}

export interface CardBlockData {
  cards: Array<{
    id: string;
    image_url: string | null;
    title: string;
    description: string;
    cta_text: string | null;
    cta_link: string | null;
  }>;
  columns: number;
  card_style: 'feature' | 'service' | 'promotion' | 'information';
}

export interface FaqBlockData {
  items: Array<{
    id: string;
    question: string;
    answer: string;
  }>;
}

export interface CountdownBlockData {
  title: string;
  target_date: string;
  show_days: boolean;
  show_hours: boolean;
  show_minutes: boolean;
  show_seconds: boolean;
}

export interface DividerBlockData {
  height: number;
  show_line: boolean;
}

// ─── Page type registry (extensible) ────────────────────────────────────────────

export const CMS_PAGE_TYPES: Array<{ value: string; label: string }> = [
  { value: 'welcome', label: 'Welcome Page' },
  { value: 'marketplace_home', label: 'Marketplace Home' },
  { value: 'dashboard_landing', label: 'Dashboard Landing' },
  { value: 'help_center', label: 'Help Center' },
  { value: 'tutorials', label: 'Tutorials' },
  { value: 'announcements', label: 'Announcements' },
  { value: 'challenges', label: 'Challenges' },
  { value: 'terms', label: 'Terms & Policies' },
  { value: 'permissions', label: 'Permissions' },
  { value: 'referral_landing', label: 'Referral Landing' },
  { value: 'affiliate_landing', label: 'Affiliate Landing' },
  { value: 'vendor_landing', label: 'Vendor Landing' },
  { value: 'buyer_landing', label: 'Buyer Landing' },
  { value: 'standard', label: 'Standard Page' },
];

export const CMS_BLOCK_TYPES: Array<{ value: CmsBlockType; label: string; icon: string }> = [
  { value: 'hero', label: 'Hero Section', icon: 'Layout' },
  { value: 'banner', label: 'Banner', icon: 'Image' },
  { value: 'text', label: 'Rich Text', icon: 'Type' },
  { value: 'image', label: 'Image', icon: 'Image' },
  { value: 'video', label: 'Video', icon: 'Video' },
  { value: 'card', label: 'Card Section', icon: 'LayoutGrid' },
  { value: 'faq', label: 'FAQ', icon: 'HelpCircle' },
  { value: 'countdown', label: 'Countdown', icon: 'Clock' },
  { value: 'divider', label: 'Divider', icon: 'Minus' },
];

export const CMS_STATUSES: Array<{ value: CmsPageStatus; label: string; color: string }> = [
  { value: 'draft', label: 'Draft', color: 'gray' },
  { value: 'published', label: 'Published', color: 'green' },
  { value: 'scheduled', label: 'Scheduled', color: 'blue' },
  { value: 'hidden', label: 'Hidden', color: 'amber' },
  { value: 'archived', label: 'Archived', color: 'red' },
];
