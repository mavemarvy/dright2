export interface MarketplaceCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
  subcategories: string[];
  popular?: boolean;
}

export const MARKETPLACE_CATEGORIES: MarketplaceCategory[] = [
  {
    id: 'electronics', name: 'Electronics', icon: 'Smartphone', color: 'bg-blue-500',
    subcategories: ['Phones', 'Laptops', 'Cameras', 'Audio', 'Accessories', 'Gaming'],
    popular: true,
  },
  {
    id: 'fashion', name: 'Fashion', icon: 'Shirt', color: 'bg-pink-500',
    subcategories: ['Men', 'Women', 'Kids', 'Shoes', 'Bags', 'Jewelry', 'Watches'],
    popular: true,
  },
  {
    id: 'digital', name: 'Digital Products', icon: 'Download', color: 'bg-purple-500',
    subcategories: ['E-books', 'Templates', 'Software', 'AI Tools', 'Prompt Packs', 'Plugins'],
    popular: true,
  },
  {
    id: 'courses', name: 'Courses', icon: 'GraduationCap', color: 'bg-indigo-500',
    subcategories: ['Programming', 'Design', 'Marketing', 'Business', 'Photography', 'Music'],
    popular: true,
  },
  {
    id: 'services', name: 'Services', icon: 'Sparkles', color: 'bg-teal-500',
    subcategories: ['Graphic Design', 'Video Editing', 'Writing', 'SEO', 'Consulting', 'Voiceover'],
    popular: true,
  },
  {
    id: 'jobs', name: 'Jobs', icon: 'Briefcase', color: 'bg-orange-500',
    subcategories: ['Full-time', 'Part-time', 'Freelance', 'Remote', 'Contract', 'Internship'],
  },
  {
    id: 'software', name: 'Software', icon: 'Code', color: 'bg-cyan-500',
    subcategories: ['SaaS', 'Desktop Apps', 'Mobile Apps', 'Scripts', 'APIs'],
  },
  {
    id: 'marketing', name: 'Marketing', icon: 'Megaphone', color: 'bg-rose-500',
    subcategories: ['Social Media', 'Email Marketing', 'Content', 'PPC', 'Branding'],
  },
  {
    id: 'health', name: 'Health & Beauty', icon: 'Heart', color: 'bg-red-500',
    subcategories: ['Skincare', 'Supplements', 'Fitness', 'Wellness', 'Cosmetics'],
  },
  {
    id: 'home', name: 'Home & Garden', icon: 'Home', color: 'bg-green-500',
    subcategories: ['Furniture', 'Decor', 'Appliances', 'Garden', 'Kitchen'],
  },
  {
    id: 'agriculture', name: 'Agriculture', icon: 'Sprout', color: 'bg-lime-600',
    subcategories: ['Seeds', 'Equipment', 'Produce', 'Livestock', 'Tools'],
  },
  {
    id: 'gaming', name: 'Gaming', icon: 'Gamepad2', color: 'bg-violet-500',
    subcategories: ['Consoles', 'Games', 'Accessories', 'Accounts', 'In-game Items'],
  },
  {
    id: 'books', name: 'Books & Media', icon: 'BookOpen', color: 'bg-amber-600',
    subcategories: ['E-books', 'Audiobooks', 'Comics', 'Magazines', 'Music'],
  },
  {
    id: 'music', name: 'Music', icon: 'Music', color: 'bg-fuchsia-500',
    subcategories: ['Beats', 'Samples', 'Courses', 'Production', 'Instruments'],
  },
  {
    id: 'education', name: 'Education', icon: 'GraduationCap', color: 'bg-sky-600',
    subcategories: ['Tutoring', 'Certifications', 'Study Materials', 'Training'],
  },
  {
    id: 'business', name: 'Business', icon: 'Building2', color: 'bg-slate-600',
    subcategories: ['Business Plans', 'Legal Docs', 'Accounting', 'Templates'],
  },
  {
    id: 'accessories', name: 'Accessories', icon: 'Watch', color: 'bg-stone-500',
    subcategories: ['Watches', 'Bags', 'Jewelry', 'Sunglasses', 'Belts'],
  },
  {
    id: 'freelancing', name: 'Freelancing', icon: 'Laptop', color: 'bg-emerald-500',
    subcategories: ['Development', 'Design', 'Writing', 'Translation', 'Virtual Assistant'],
  },
  {
    id: 'cars', name: 'Cars', icon: 'Car', color: 'bg-zinc-700',
    subcategories: ['Cars', 'Motorcycles', 'Parts', 'Accessories'],
  },
  {
    id: 'real-estate', name: 'Real Estate', icon: 'Building', color: 'bg-gray-600',
    subcategories: ['For Sale', 'For Rent', 'Land', 'Commercial', 'Short Let'],
  },
];

export interface SortOption {
  value: string;
  label: string;
}

export const SORT_OPTIONS: SortOption[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'commission_desc', label: 'Highest Commission' },
  { value: 'best_selling', label: 'Best Selling' },
  { value: 'trending', label: 'Trending' },
  { value: 'most_viewed', label: 'Most Viewed' },
  { value: 'highest_rated', label: 'Highest Rated' },
  { value: 'most_discounted', label: 'Most Discounted' },
  { value: 'recommended', label: 'AI Recommended' },
];

export interface FeaturedCollection {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  sortKey: string;
  badge?: string;
  badgeColor?: string;
}

export const FEATURED_COLLECTIONS: FeaturedCollection[] = [
  { id: 'trending', title: 'Trending Now', subtitle: 'Hot products everyone is talking about', icon: 'TrendingUp', sortKey: 'trending', badge: 'HOT', badgeColor: 'bg-red-500' },
  { id: 'best_sellers', title: 'Best Sellers', subtitle: 'Top performing products', icon: 'Award', sortKey: 'best_selling', badge: 'TOP', badgeColor: 'bg-amber-500' },
  { id: 'flash_deals', title: 'Flash Deals', subtitle: 'Limited time offers', icon: 'Zap', sortKey: 'newest', badge: 'SALE', badgeColor: 'bg-orange-500' },
  { id: 'recently_added', title: 'Recently Added', subtitle: 'Fresh from the market', icon: 'Sparkles', sortKey: 'newest' },
  { id: 'top_rated', title: 'Top Rated', subtitle: 'Highest rated by buyers', icon: 'Star', sortKey: 'highest_rated', badge: '5 STAR', badgeColor: 'bg-yellow-500' },
  { id: 'digital_best', title: 'Digital Best Sellers', subtitle: 'Top digital downloads', icon: 'Download', sortKey: 'best_selling' },
  { id: 'verified_sellers', title: 'Verified Sellers', subtitle: 'Trusted and verified', icon: 'BadgeCheck', sortKey: 'trending', badge: 'VERIFIED', badgeColor: 'bg-blue-500' },
];

export interface ProductBadge {
  label: string;
  color: string;
  icon?: string;
}

export function getProductBadges(product: {
  product_type?: string;
  is_free?: boolean;
  stock_quantity?: number | null;
  total_sales?: number;
  average_rating?: number;
  created_at?: string;
  is_verified_seller?: boolean;
  is_featured?: boolean;
  is_sponsored?: boolean;
}): ProductBadge[] {
  const badges: ProductBadge[] = [];
  const now = Date.now();
  const created = product.created_at ? new Date(product.created_at).getTime() : 0;
  const isNew = now - created < 7 * 86400000;

  if (product.is_verified_seller) badges.push({ label: 'Verified', color: 'bg-blue-500', icon: 'BadgeCheck' });
  if (product.is_featured) badges.push({ label: 'Featured', color: 'bg-purple-500', icon: 'Star' });
  if (product.is_sponsored) badges.push({ label: 'Sponsored', color: 'bg-amber-500', icon: 'TrendingUp' });
  if (isNew) badges.push({ label: 'New', color: 'bg-green-500' });
  if (product.is_free) badges.push({ label: 'FREE', color: 'bg-emerald-500' });
  if (product.product_type && product.product_type === 'DIGITAL') badges.push({ label: 'Digital', color: 'bg-indigo-500', icon: 'Download' });
  if (product.product_type && product.product_type === 'COURSE') badges.push({ label: 'Course', color: 'bg-teal-500', icon: 'GraduationCap' });
  if (product.product_type && product.product_type === 'SERVICE') badges.push({ label: 'Service', color: 'bg-rose-500', icon: 'Sparkles' });
  if (product.stock_quantity !== null && product.stock_quantity !== undefined && product.stock_quantity > 0 && product.stock_quantity <= 5) {
    badges.push({ label: 'Limited Stock', color: 'bg-orange-500' });
  }
  if ((product.total_sales ?? 0) > 50) badges.push({ label: 'Best Seller', color: 'bg-amber-600', icon: 'Award' });
  if ((product.average_rating ?? 0) >= 4.5) badges.push({ label: 'Top Rated', color: 'bg-yellow-500', icon: 'Star' });
  return badges.slice(0, 3);
}

const TRENDING_SEARCHES = [
  'cheap laptops', 'AI prompts', 'graphic design', 'logo designers',
  'digital products', 'online courses', 'web templates', 'marketing tools',
  'video editing', 'phone accessories',
];

const POPULAR_SEARCHES = [
  'software', 'e-books', 'templates', 'courses', 'freelance services',
  'smartphones', 'fashion', 'home decor', 'gaming', 'beauty products',
];

export function getTrendingSearches(): string[] {
  return TRENDING_SEARCHES;
}

export function getPopularSearches(): string[] {
  return POPULAR_SEARCHES;
}

export function getRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem('dright_recent_searches');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addRecentSearch(query: string): void {
  if (!query.trim()) return;
  try {
    const existing = getRecentSearches().filter(s => s.toLowerCase() !== query.toLowerCase());
    const updated = [query, ...existing].slice(0, 8);
    localStorage.setItem('dright_recent_searches', JSON.stringify(updated));
  } catch { /* ignore */ }
}

export function clearRecentSearches(): void {
  try {
    localStorage.removeItem('dright_recent_searches');
  } catch { /* ignore */ }
}

const RECENTLY_VIEWED_KEY = 'dright_recently_viewed_ids';

export function getRecentlyViewedIds(): string[] {
  try {
    const raw = localStorage.getItem(RECENTLY_VIEWED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addRecentlyViewedId(productId: string): void {
  try {
    const existing = getRecentlyViewedIds().filter(id => id !== productId);
    const updated = [productId, ...existing].slice(0, 20);
    localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(updated));
  } catch { /* ignore */ }
}

export function clearRecentlyViewed(): void {
  try {
    localStorage.removeItem(RECENTLY_VIEWED_KEY);
  } catch { /* ignore */ }
}

export function parseNaturalLanguageSearch(query: string): { keywords: string[]; priceMax?: number; category?: string } {
  const lower = query.toLowerCase();
  const result: { keywords: string[]; priceMax?: number; category?: string } = { keywords: [] };

  const priceMatch = lower.match(/(?:under|below|less than|max|maximum)\s*[₦$]?\s*([\d,]+)/);
  if (priceMatch) {
    result.priceMax = parseFloat(priceMatch[1].replace(/,/g, ''));
  }

  const categoryMap: Record<string, string> = {
    'laptop': 'Electronics', 'phone': 'Electronics', 'computer': 'Electronics',
    'fashion': 'Fashion', 'clothes': 'Fashion', 'shoe': 'Fashion',
    'course': 'Courses', 'tutorial': 'Courses',
    'service': 'Services', 'design': 'Services',
    'job': 'Jobs', 'freelance': 'Jobs',
    'digital': 'Digital Products', 'template': 'Digital Products',
    'software': 'Software', 'app': 'Software',
    'music': 'Music', 'beat': 'Music',
    'book': 'Books & Media', 'ebook': 'Digital Products',
    'game': 'Gaming',
  };

  for (const [keyword, category] of Object.entries(categoryMap)) {
    if (lower.includes(keyword)) {
      result.category = category;
      break;
    }
  }

  const cleaned = lower
    .replace(/(?:under|below|less than|max|maximum)\s*[₦$]?\s*[\d,]+/g, '')
    .replace(/(?:cheap|affordable|best|top|good|quality)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  result.keywords = cleaned.split(' ').filter(w => w.length > 1);

  return result;
}
