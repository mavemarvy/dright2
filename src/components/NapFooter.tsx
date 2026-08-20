import { useEffect, useState } from 'react';
import { MapPin, Phone, Mail, Clock, Globe, ExternalLink } from 'lucide-react';
import { getBusinessSettings, formatHours, isOpenNow, formatShortAddress } from '../lib/seo';
import type { BusinessSettings } from '../lib/types';

const SOCIAL_ICONS: Record<string, string> = {
  twitter: 'Twitter',
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
  github: 'GitHub',
};

export default function NapFooter({ compact = false }: { compact?: boolean }) {
  const [settings, setSettings] = useState<BusinessSettings | null>(null);

  useEffect(() => {
    (async () => {
      const data = await getBusinessSettings();
      setSettings(data);
    })();
  }, []);

  if (!settings) {
    if (compact) return null;
    return (
      <div className="border-t border-gray-200 bg-white py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="h-24 bg-gray-50 rounded-2xl animate-pulse" />
        </div>
      </div>
    );
  }

  const hoursList = formatHours(settings.hours_json ?? null);
  const openNow = isOpenNow(settings);
  const socials = settings.social_profiles ? Object.entries(settings.social_profiles) : [];

  if (compact) {
    return (
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 text-sm text-gray-600">
        <div className="flex items-center gap-1.5">
          <MapPin className="w-4 h-4 text-primary-600 shrink-0" />
          <span>{formatShortAddress(settings)}</span>
        </div>
        {settings.phone && (
          <div className="flex items-center gap-1.5">
            <Phone className="w-4 h-4 text-primary-600 shrink-0" />
            <a href={`tel:${settings.phone.replace(/\s/g, '')}`} className="hover:text-primary-700 transition-colors">
              {settings.phone}
            </a>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <Clock className="w-4 h-4 text-primary-600 shrink-0" />
          <span className={openNow ? 'text-success font-medium' : ''}>
            {openNow ? 'Open now' : 'Closed'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Business Identity + NAP */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <svg width="32" height="32" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
                <defs>
                  <linearGradient id="napFooterLogoGrad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#4f46e5" /><stop offset="1" stopColor="#3b82f6" />
                  </linearGradient>
                </defs>
                <rect width="48" height="48" rx="12" fill="url(#napFooterLogoGrad)" />
                <path d="M17 14H26.5C31.7467 14 36 18.2533 36 23.5C36 28.7467 31.7467 33 26.5 33H17V14ZM22 19V28H26.5C28.9853 28 31 25.9853 31 23.5C31 21.0147 28.9853 19 26.5 19H22Z" fill="white" />
                <circle cx="33" cy="15" r="3" fill="#60a5fa" />
              </svg>
              <span className="text-lg font-bold text-gray-900">{settings.business_name}</span>
            </div>
            {settings.tagline && (
              <p className="text-sm text-gray-500">{settings.tagline}</p>
            )}

            {/* NAP Block - structured for consistency */}
            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-primary-600 mt-0.5 shrink-0" />
                <address className="not-italic text-gray-600">
                  {settings.street_address}
                  {settings.address_line_2 && <><br />{settings.address_line_2}</>}
                  <br />{settings.city}, {settings.region} {settings.postal_code}
                  <br />{settings.country}
                </address>
              </div>
              {settings.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-primary-600 shrink-0" />
                  <a href={`tel:${settings.phone.replace(/\s/g, '')}`} className="text-gray-600 hover:text-primary-700 transition-colors">
                    {settings.phone}
                  </a>
                </div>
              )}
              {settings.email && (
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-primary-600 shrink-0" />
                  <a href={`mailto:${settings.email}`} className="text-gray-600 hover:text-primary-700 transition-colors">
                    {settings.email}
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Opening Hours */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary-600" /> Opening Hours
            </h4>
            <div className="flex items-center gap-2 mb-3">
              <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
                openNow ? 'bg-success-muted text-success' : 'bg-gray-100 text-gray-500'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${openNow ? 'bg-success' : 'bg-gray-400'}`} />
                {openNow ? 'Open now' : 'Currently closed'}
              </span>
            </div>
            <ul className="space-y-1.5 text-sm">
              {hoursList.map(entry => (
                <li key={entry.day} className="flex items-center justify-between">
                  <span className="text-gray-500">{entry.day}</span>
                  <span className={entry.hours === 'Closed' ? 'text-gray-400' : 'text-gray-700 font-medium'}>
                    {entry.hours}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Service Area + Categories */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Globe className="w-4 h-4 text-primary-600" /> Service Area
            </h4>
            {(settings.service_area || []).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {(settings.service_area || []).map(area => (
                  <span key={area} className="inline-block text-xs font-medium text-gray-600 bg-gray-100 rounded-full px-3 py-1">
                    {area}
                  </span>
                ))}
              </div>
            )}
            {(settings.service_categories || []).length > 0 && (
              <div className="space-y-2">
                <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Categories</h5>
                <div className="flex flex-wrap gap-2">
                  {(settings.service_categories || []).map(cat => (
                    <span key={cat} className="inline-block text-xs text-gray-600 border border-gray-200 rounded-lg px-2.5 py-1">
                      {cat}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Google Business Profile + Social */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-gray-900">Connect With Us</h4>

            {/* Google Business Profile Integration */}
            {settings.google_business_profile_url && (
              <a
                href={settings.google_business_profile_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                View on Google Business Profile
              </a>
            )}

            {settings.google_maps_embed_url && (
              <a
                href={settings.google_maps_embed_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
              >
                <MapPin className="w-4 h-4" />
                Get Directions
              </a>
            )}

            {socials.length > 0 && (
              <div className="space-y-2">
                <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Follow Us</h5>
                <div className="flex flex-wrap gap-3">
                  {socials.map(([platform, url]) => (
                    <a
                      key={platform}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-gray-100 hover:bg-primary-50 text-gray-600 hover:text-primary-700 transition-colors text-sm font-medium"
                      aria-label={SOCIAL_ICONS[platform] || platform}
                      title={SOCIAL_ICONS[platform] || platform}
                    >
                      {SOCIAL_ICONS[platform]?.[0] || platform[0].toUpperCase()}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {settings.website_url && (
              <div className="text-xs text-gray-400 pt-2">
                <a href={settings.website_url} className="hover:text-gray-600 transition-colors">
                  {settings.website_url.replace(/^https?:\/\//, '')}
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Bottom NAP consistency bar — visible to crawlers, microdata for structured data parsers */}
        <div className="mt-10 pt-6 border-t border-gray-100">
          <div
            className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-400"
            itemScope
            itemType="https://schema.org/LocalBusiness"
          >
            <div className="flex items-center gap-3">
              <span itemProp="name" className="font-medium text-gray-600">{settings.business_name}</span>
              <span aria-hidden="true">·</span>
              <a href={`tel:${settings.phone?.replace(/\s/g, '')}`} itemProp="telephone" className="hover:text-gray-600">
                {settings.phone}
              </a>
              <span aria-hidden="true">·</span>
              <span itemProp="address" itemScope itemType="https://schema.org/PostalAddress">
                <span itemProp="streetAddress">{settings.street_address}</span>,{' '}
                <span itemProp="addressLocality">{settings.city}</span>,{' '}
                <span itemProp="addressRegion">{settings.region}</span>{' '}
                <span itemProp="postalCode">{settings.postal_code}</span>
              </span>
            </div>
            <p>&copy; {new Date().getFullYear()} {settings.business_name}. All rights reserved.</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
