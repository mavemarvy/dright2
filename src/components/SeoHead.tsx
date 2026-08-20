import { useEffect } from 'react';
import {
  getBusinessSettings,
  injectMetaTags,
  injectJsonLd,
  removeJsonLd,
  generateLocalBusinessSchema,
  generateWebSiteSchema,
  generateBreadcrumbSchema,
  generateProductSchema,
  type SeoMetaTags,
} from '../lib/seo';

interface ProductSeoData {
  name: string;
  description?: string;
  image?: string;
  price: number;
  currency?: string;
  availability?: 'in_stock' | 'out_of_stock' | 'preorder';
  brandName?: string;
  ratingValue?: number;
  reviewCount?: number;
}

interface BreadcrumbItem {
  name: string;
  url?: string;
}

interface SeoHeadProps {
  title: string | null;
  description: string;
  canonical?: string;
  ogType?: string;
  ogImage?: string;
  keywords?: string[];
  breadcrumbs?: BreadcrumbItem[];
  product?: ProductSeoData;
}

export default function SeoHead({
  title,
  description,
  canonical,
  ogType,
  ogImage,
  keywords,
  breadcrumbs,
  product,
}: SeoHeadProps) {
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const settings = await getBusinessSettings();
      if (cancelled) return;

      const businessName = settings?.business_name || 'Dright';

      const tags: SeoMetaTags = {
        title,
        description,
        canonical: canonical || (typeof window !== 'undefined' ? window.location.href : undefined),
        ogType,
        ogImage,
        keywords,
      };

      injectMetaTags(tags, businessName);

      // Always inject LocalBusiness + WebSite schema
      if (settings) {
        injectJsonLd('jsonld-localbusiness', generateLocalBusinessSchema(settings) as unknown as Record<string, unknown>);
        injectJsonLd('jsonld-website', generateWebSiteSchema(settings) as unknown as Record<string, unknown>);
      }

      // Breadcrumb structured data
      if (breadcrumbs && breadcrumbs.length > 0) {
        const baseUrl = settings?.website_url || window.location.origin;
        const crumbs = breadcrumbs.map(c => ({
          name: c.name,
          url: c.url ? `${baseUrl}${c.url}` : undefined,
        }));
        injectJsonLd('jsonld-breadcrumbs', generateBreadcrumbSchema(crumbs) as unknown as Record<string, unknown>);
      } else {
        removeJsonLd('jsonld-breadcrumbs');
      }

      // Product structured data
      if (product) {
        const baseUrl = settings?.website_url || window.location.origin;
        injectJsonLd('jsonld-product', generateProductSchema({
          ...product,
          url: `${baseUrl}${window.location.pathname}`,
        }) as unknown as Record<string, unknown>);
      } else {
        removeJsonLd('jsonld-product');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [title, description, canonical, ogType, ogImage, keywords, breadcrumbs, product]);

  return null;
}
