import {
  Globe, Mail, Phone, MapPin, Calendar, Clock, Link2,
  Languages, Building2, FileText,
} from 'lucide-react';
import type { ProfileData } from './profileTypes';

interface ProfileAboutProps {
  profile: ProfileData;
  isOwner: boolean;
}

export function ProfileAbout({ profile, isOwner }: ProfileAboutProps) {
  const fields: Array<{ label: string; value: string | null; show: boolean; icon: typeof Globe }> = [
    { label: 'Bio', value: profile.bio ?? null, show: !!profile.bio, icon: FileText },
    { label: 'Business Description', value: profile.store_description ?? null, show: !!profile.store_description, icon: Building2 },
    { label: 'Website', value: profile.website ?? null, show: !!profile.website, icon: Globe },
    { label: 'Email', value: profile.email, show: (isOwner || profile.show_email) && !!profile.email, icon: Mail },
    { label: 'Phone', value: profile.phone ?? null, show: (isOwner || profile.show_phone) && !!profile.phone, icon: Phone },
    { label: 'Location', value: profile.store_location || [profile.city, profile.state, profile.country].filter(Boolean).join(', '), show: !!(profile.store_location || profile.city || profile.country), icon: MapPin },
    { label: 'Joined', value: new Date(profile.created_at).toLocaleDateString('en', { month: 'long', day: 'numeric', year: 'numeric' }), show: true, icon: Calendar },
    { label: 'Last Active', value: profile.last_active ? new Date(profile.last_active).toLocaleDateString() : 'Recently', show: true, icon: Clock },
  ];

  const visibleFields = fields.filter((f) => f.show);
  const socialLinks = profile.social_media_links || {};
  const socialEntries = Object.entries(socialLinks).filter(([, v]) => !!v);
  const languages = profile.languages || [];

  if (visibleFields.length === 0 && socialEntries.length === 0 && languages.length === 0) {
    return null;
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 sm:p-6">
      <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">About</h3>

      {/* Bio / Description - full width */}
      {(profile.bio || profile.store_description) && (
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-4 h-4 text-gray-400" />
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              {profile.store_description ? 'Business Description' : 'Bio'}
            </span>
          </div>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
            {profile.store_description || profile.bio}
          </p>
        </div>
      )}

      {/* Info Grid */}
      {visibleFields.filter((f) => f.label !== 'Bio' && f.label !== 'Business Description').length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
          {visibleFields.filter((f) => f.label !== 'Bio' && f.label !== 'Business Description').map((f, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-800">
              <f.icon className="w-4 h-4 text-gray-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-gray-500 dark:text-gray-400">{f.label}</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {f.label === 'Website' ? (
                    <a href={f.value!} target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:underline">
                      {f.value}
                    </a>
                  ) : f.value}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Languages */}
      {languages.length > 0 && (
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <Languages className="w-4 h-4 text-gray-400" />
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Languages</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {languages.map((lang, i) => (
              <span key={i} className="px-3 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                {lang}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Social Links */}
      {socialEntries.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Link2 className="w-4 h-4 text-gray-400" />
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Social Links</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {socialEntries.map(([platform, url], i) => (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                <Globe className="w-3 h-3" />
                {platform.charAt(0).toUpperCase() + platform.slice(1)}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
