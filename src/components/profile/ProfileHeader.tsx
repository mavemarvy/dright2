import { Link } from 'react-router-dom';
import {
  CheckCircle, MapPin, Calendar, Globe,
  MessageSquare, Store, BadgeCheck, Zap, Award, ShieldCheck, TrendingUp,
  Shield,
} from 'lucide-react';
import type { ProfileData, BadgeInfo } from './profileTypes';
import { FollowButton } from '../Social';
import { ProfileShareButton, BlockReportButton } from '../SocialFeatures';
import { TrustScoreBadge } from '../trust/TrustScoreBadge';
import { VerificationBadges } from '../SocialFeatures';

const badgeIconMap: Record<string, typeof Award> = {
  BadgeCheck, Zap, Award, ShieldCheck, TrendingUp, Shield,
};

interface ProfileHeaderProps {
  profile: ProfileData;
  badges: BadgeInfo[];
  isOwner: boolean;
  followers: number;
  following: number;
  friends: number;
  roleLabel: string;
}

export function ProfileHeader({ profile, badges, isOwner, followers, following, friends, roleLabel }: ProfileHeaderProps) {
  const isVerified = profile.verified || profile.is_verified;
  const joinDate = new Date(profile.created_at).toLocaleDateString('en', { month: 'short', year: 'numeric' });

  return (
    <div className="relative">
      {/* Cover Banner */}
      <div className="h-40 sm:h-52 md:h-64 lg:h-72 relative overflow-hidden bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500">
        {profile.cover_image ? (
          <img src={profile.cover_image} alt="Cover" className="w-full h-full object-cover" />
        ) : profile.store_banner_url ? (
          <img src={profile.store_banner_url} alt="Cover" className="w-full h-full object-cover" />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
      </div>

      {/* Header Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 -mt-16 sm:-mt-20 relative z-10">
        <div className="flex flex-col md:flex-row items-start md:items-end gap-4">
          {/* Avatar */}
          <div className="w-24 h-24 sm:w-28 sm:h-28 md:w-32 md:h-32 rounded-2xl bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center ring-4 ring-white dark:ring-gray-950 overflow-hidden shrink-0 shadow-xl">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt={profile.full_name || 'User'} className="w-full h-full object-cover" />
            ) : (
              <span className="text-white text-3xl sm:text-4xl font-bold">
                {(profile.full_name || 'U').charAt(0).toUpperCase()}
              </span>
            )}
          </div>

          {/* Name + Meta */}
          <div className="flex-1 pb-2 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white truncate">
                {profile.full_name || 'Anonymous User'}
              </h1>
              {isVerified && <CheckCircle className="w-5 h-5 text-blue-500 shrink-0" />}
              <VerificationBadges userId={profile.id} />
              <TrustScoreBadge userId={profile.id} size="sm" />
            </div>

            {profile.username && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">@{profile.username}</p>
            )}

            {/* Role Badge */}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                <Store className="w-3 h-3" /> {roleLabel}
              </span>
              {profile.is_online && (
                <span className="flex items-center gap-1 text-xs text-green-500 font-medium">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> Online
                </span>
              )}
              {profile.store_title && (
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400 truncate max-w-[200px]">
                  {profile.store_title}
                </span>
              )}
            </div>

            {/* Location + Join Date */}
            <div className="flex items-center gap-4 mt-2 text-sm text-gray-600 dark:text-gray-400 flex-wrap">
              {(profile.city || profile.country || profile.store_location) && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-4 h-4 shrink-0" />
                  {profile.store_location || [profile.city, profile.country].filter(Boolean).join(', ')}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4 shrink-0" /> Joined {joinDate}
              </span>
              {profile.website && (
                <a href={profile.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-indigo-500 transition-colors">
                  <Globe className="w-4 h-4 shrink-0" /> Website
                </a>
              )}
            </div>

            {/* Follow Stats */}
            <div className="flex items-center gap-4 mt-2 text-sm">
              <Link to={`/followers/${profile.id}`} className="hover:text-indigo-500 transition-colors">
                <span className="font-bold text-gray-900 dark:text-white">{followers.toLocaleString()}</span>
                <span className="text-gray-500 dark:text-gray-400 ml-1">Followers</span>
              </Link>
              <Link to={`/following/${profile.id}`} className="hover:text-indigo-500 transition-colors">
                <span className="font-bold text-gray-900 dark:text-white">{following.toLocaleString()}</span>
                <span className="text-gray-500 dark:text-gray-400 ml-1">Following</span>
              </Link>
              <Link to={`/friends/${profile.id}`} className="hover:text-indigo-500 transition-colors">
                <span className="font-bold text-gray-900 dark:text-white">{friends.toLocaleString()}</span>
                <span className="text-gray-500 dark:text-gray-400 ml-1">Friends</span>
              </Link>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap pb-2">
            {!isOwner ? (
              <>
                <FollowButton targetUserId={profile.id} />
                <Link
                  to={`/chat?user=${profile.id}`}
                  className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  <MessageSquare className="w-4 h-4" /> Message
                </Link>
                <ProfileShareButton userId={profile.id} username={profile.username || undefined} />
                <BlockReportButton targetUserId={profile.id} />
              </>
            ) : (
              <ProfileShareButton userId={profile.id} username={profile.username || undefined} />
            )}
          </div>
        </div>

        {/* Bio */}
        {profile.bio && (
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-4 max-w-3xl leading-relaxed">{profile.bio}</p>
        )}

        {/* Badges Row */}
        {badges.length > 0 && (
          <div className="flex items-center gap-2 mt-4 flex-wrap">
            {badges.slice(0, 6).map((badge) => {
              const Icon = badgeIconMap[badge.icon] || Award;
              const colorClasses: Record<string, string> = {
                blue: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
                amber: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
                green: 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400',
                purple: 'bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
                indigo: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400',
                red: 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400',
                teal: 'bg-teal-50 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400',
              };
              return (
                <span
                  key={badge.id}
                  title={badge.description}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${colorClasses[badge.color] || colorClasses.blue}`}
                >
                  <Icon className="w-3 h-3" /> {badge.label}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
