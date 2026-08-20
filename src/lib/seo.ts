import { supabase } from './supabase';
import type { BusinessSettings } from './types';

let cachedSettings: BusinessSettings | null = null;
let fetchPromise: Promise<BusinessSettings | null> | null = null;

export async function getBusinessSettings(): Promise<BusinessSettings | null> {
  if (cachedSettings) return cachedSettings;
  if (fetchPromise) return fetchPromise;

  fetchPromise = (async () => {
    const { data, error } = await supabase
      .from('business_settings')
      .select('*')
      .eq('is_singleton', true)
      .maybeSingle();

    if (error || !data) {
      fetchPromise = null;
      return null;
    }

    cachedSettings = data as BusinessSettings;
    return cachedSettings;
  })();

  return fetchPromise;
}

export function clearBusinessSettingsCache(): void {
  cachedSettings = null;
  fetchPromise = null;
}

const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
const DAY_LABELS: Record<string, string> = {
  monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday',
  thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
};

export function formatFullAddress(settings: BusinessSettings): string {
  const parts = [
    settings.street_address,
    settings.address_line_2,
    settings.city,
    settings.region,
    settings.postal_code,
    settings.country,
  ].filter(Boolean);
  return parts.join(', ');
}

export function formatShortAddress(settings: BusinessSettings): string {
  const parts = [settings.city, settings.region, settings.postal_code].filter(Boolean);
  return parts.join(', ');
}

export function formatHours(hours: Record<string, { open: string; close: string; closed?: boolean }> | null): { day: string; hours: string }[] {
  if (!hours) return [];
  return DAY_ORDER.map(day => {
    const entry = hours[day];
    if (!entry || entry.closed) {
      return { day: DAY_LABELS[day], hours: 'Closed' };
    }
    return { day: DAY_LABELS[day], hours: `${entry.open} – ${entry.close}` };
  });
}

export function isOpenNow(settings: BusinessSettings): boolean {
  if (!settings.hours_json) return false;
  const now = new Date();
  const dayName = DAY_ORDER[now.getDay() === 0 ? 6 : now.getDay() - 1];
  const entry = settings.hours_json[dayName];
  if (!entry || entry.closed) return false;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const [openH, openM] = entry.open.split(':').map(Number);
  const [closeH, closeM] = entry.close.split(':').map(Number);
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;
  return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
}

interface LocalBusinessSchema {
  '@context': string;
  '@type': string;
  name: string;
  description?: string;
  url?: string;
  telephone?: string;
  email?: string;
  image?: string;
  logo?: string;
  address: {
    '@type': string;
    streetAddress: string;
    addressLocality: string;
    addressRegion: string;
    postalCode: string;
    addressCountry: string;
  };
  geo?: {
    '@type': string;
    latitude: number;
    longitude: number;
  };
  openingHoursSpecification: Array<{
    '@type': string;
    dayOfWeek: string;
    opens: string;
    closes: string;
  }>;
  priceRange?: string;
  areaServed?: Array<{ '@type': string; name: string }>;
  sameAs?: string[];
  hasOfferCatalog?: {
    '@type': string;
    name: string;
    itemListElement: Array<{ '@type': string; name: string }>;
  };
}

export function generateLocalBusinessSchema(settings: BusinessSettings): LocalBusinessSchema {
  const hours = settings.hours_json || {};
  const openingHoursSpec: LocalBusinessSchema['openingHoursSpecification'] = [];

  for (const day of DAY_ORDER) {
    const entry = hours[day];
    if (entry && !entry.closed) {
      openingHoursSpec.push({
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: DAY_LABELS[day],
        opens: entry.open,
        closes: entry.close,
      });
    }
  }

  const socialUrls = settings.social_profiles ? Object.values(settings.social_profiles) : [];

  const schema: LocalBusinessSchema = {
    '@context': 'https://schema.org',
    '@type': 'OnlineStore',
    name: settings.business_name,
    address: {
      '@type': 'PostalAddress',
      streetAddress: settings.street_address || '',
      addressLocality: settings.city || '',
      addressRegion: settings.region || '',
      postalCode: settings.postal_code || '',
      addressCountry: settings.country || '',
    },
    openingHoursSpecification: openingHoursSpec,
  };

  if (settings.description) schema.description = settings.description;
  if (settings.website_url) schema.url = settings.website_url;
  if (settings.phone) schema.telephone = settings.phone;
  if (settings.email) schema.email = settings.email;
  if (settings.logo_url) schema.logo = settings.logo_url;
  if (settings.logo_url) schema.image = settings.logo_url;
  if (settings.latitude != null && settings.longitude != null) {
    schema.geo = {
      '@type': 'GeoCoordinates',
      latitude: settings.latitude,
      longitude: settings.longitude,
    };
  }
  if (settings.price_range) schema.priceRange = settings.price_range;
  if ((settings.service_area || []).length > 0) {
    schema.areaServed = (settings.service_area || []).map(area => ({ '@type': 'City', name: area }));
  }
  if (socialUrls.length > 0) schema.sameAs = socialUrls;
  if ((settings.service_categories || []).length > 0) {
    schema.hasOfferCatalog = {
      '@type': 'OfferCatalog',
      name: 'Services',
      itemListElement: (settings.service_categories || []).map(cat => ({ '@type': 'Offer', name: cat })),
    };
  }

  return schema;
}

interface BreadcrumbSchema {
  '@context': string;
  '@type': string;
  itemListElement: Array<{ '@type': string; position: number; name: string; item?: string }>;
}

export function generateBreadcrumbSchema(
  breadcrumbs: Array<{ name: string; url?: string }>
): BreadcrumbSchema {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbs.map((crumb, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: crumb.name,
      ...(crumb.url ? { item: crumb.url } : {}),
    })),
  };
}

interface ProductSchema {
  '@context': string;
  '@type': string;
  name: string;
  description?: string;
  image?: string;
  brand?: { '@type': string; name: string };
  offers: {
    '@type': string;
    price: string;
    priceCurrency: string;
    availability: string;
    url?: string;
  };
  aggregateRating?: {
    '@type': string;
    ratingValue: string;
    reviewCount: string;
  };
}

export function generateProductSchema(params: {
  name: string;
  description?: string;
  image?: string;
  price: number;
  currency?: string;
  availability?: 'in_stock' | 'out_of_stock' | 'preorder';
  url?: string;
  brandName?: string;
  ratingValue?: number;
  reviewCount?: number;
}): ProductSchema {
  const schema: ProductSchema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: params.name,
    offers: {
      '@type': 'Offer',
      price: params.price.toFixed(2),
      priceCurrency: params.currency || 'USD',
      availability: params.availability === 'out_of_stock'
        ? 'https://schema.org/OutOfStock'
        : 'https://schema.org/InStock',
      ...(params.url ? { url: params.url } : {}),
    },
  };

  if (params.description) schema.description = params.description;
  if (params.image) schema.image = params.image;
  if (params.brandName) schema.brand = { '@type': 'Brand', name: params.brandName };
  if (params.ratingValue && params.reviewCount) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: params.ratingValue.toFixed(1),
      reviewCount: String(params.reviewCount),
    };
  }

  return schema;
}

interface WebSiteSchema {
  '@context': string;
  '@type': string;
  name: string;
  url: string;
  description?: string;
  potentialAction?: {
    '@type': string;
    target: { '@type': string; urlTemplate: string };
    'query-input': string;
  };
}

export function generateWebSiteSchema(settings: BusinessSettings): WebSiteSchema {
  const baseUrl = settings.website_url || (typeof window !== 'undefined' ? window.location.origin : '');
  const schema: WebSiteSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: settings.business_name,
    url: baseUrl,
  };
  if (settings.description) schema.description = settings.description;
  schema.potentialAction = {
    '@type': 'SearchAction',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: `${baseUrl}/market?q={search_term_string}`,
    },
    'query-input': 'required name=search_term_string',
  };
  return schema;
}

export interface SeoMetaTags {
  title: string | null;
  description: string;
  canonical?: string;
  ogType?: string;
  ogImage?: string;
  keywords?: string[];
}

export function buildPageTitle(pageTitle: string | null, businessName: string): string {
  if (!pageTitle) return businessName;
  return `${pageTitle} | ${businessName}`;
}

export function injectMetaTags(tags: SeoMetaTags, businessName: string): void {
  const fullTitle = buildPageTitle(tags.title, businessName);
  document.title = fullTitle;

  const ensureMeta = (selector: string, attrs: Record<string, string>) => {
    let el = document.head.querySelector(selector) as HTMLMetaElement | null;
    if (!el) {
      el = document.createElement('meta');
      document.head.appendChild(el);
    }
    for (const [key, val] of Object.entries(attrs)) {
      el.setAttribute(key, val);
    }
  };

  ensureMeta('meta[name="description"]', { name: 'description', content: tags.description });
  ensureMeta('meta[name="keywords"]', {
    name: 'keywords',
    content: tags.keywords?.join(', ') || '',
  });

  // Open Graph
  ensureMeta('meta[property="og:title"]', { property: 'og:title', content: fullTitle });
  ensureMeta('meta[property="og:description"]', { property: 'og:description', content: tags.description });
  ensureMeta('meta[property="og:type"]', { property: 'og:type', content: tags.ogType || 'website' });
  ensureMeta('meta[property="og:site_name"]', { property: 'og:site_name', content: businessName });
  if (tags.ogImage) {
    ensureMeta('meta[property="og:image"]', { property: 'og:image', content: tags.ogImage });
  }

  // Twitter Card
  ensureMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' });
  ensureMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: fullTitle });
  ensureMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: tags.description });
  if (tags.ogImage) {
    ensureMeta('meta[name="twitter:image"]', { name: 'twitter:image', content: tags.ogImage });
  }

  // Canonical URL
  let canonical = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.setAttribute('rel', 'canonical');
    document.head.appendChild(canonical);
  }
  canonical.setAttribute('href', tags.canonical || window.location.href);
}

export function injectJsonLd(id: string, schema: Record<string, unknown>): void {
  let script = document.getElementById(id) as HTMLScriptElement | null;
  if (!script) {
    script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = id;
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(schema);
}

export function removeJsonLd(id: string): void {
  document.getElementById(id)?.remove();
}
