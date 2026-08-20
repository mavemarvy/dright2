// ─────────────────────────────────────────────────────────────────────────────
// DRIGHT Social Components — ProfileLink, FollowButton, FollowersList
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useFollow, useFollowStats } from '../lib/socialHooks';
import { useAuth } from '../contexts/AuthContext';
import { UserPlus, UserCheck, CheckCircle, MapPin } from 'lucide-react';

// ProfileLink — clickable avatar/name that navigates to public profile
export function ProfileLink({
  userId,
  username,
  displayName,
  avatar,
  size = 'md',
  showName = true,
  showBadge = false,
  verified = false,
  className = '',
}: {
  userId: string;
  username?: string;
  displayName?: string;
  avatar?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  showName?: boolean;
  showBadge?: boolean;
  verified?: boolean;
  className?: string;
}) {
  const sizes = { xs: 'w-6 h-6', sm: 'w-8 h-8', md: 'w-10 h-10', lg: 'w-14 h-14' };
  const nameSizes = { xs: 'text-xs', sm: 'text-sm', md: 'text-sm', lg: 'text-base' };

  return (
    <Link to={`/profile/${userId}`} className={`flex items-center gap-2 group ${className}`}>
      <div className={`${sizes[size]} rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center overflow-hidden shrink-0 ring-2 ring-white dark:ring-gray-800`}>
        {avatar ? (
          <img src={avatar} alt={displayName || username || 'User'} className="w-full h-full object-cover" />
        ) : (
          <span className="text-white font-medium text-xs">
            {(displayName || username || 'U').charAt(0).toUpperCase()}
          </span>
        )}
      </div>
      {showName && (
        <div className="min-w-0">
          <p className={`${nameSizes[size]} font-medium text-gray-900 dark:text-white group-hover:text-indigo-500 transition-colors truncate flex items-center gap-1`}>
            {displayName || username || 'Unknown'}
            {verified && showBadge && <CheckCircle className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
          </p>
          {username && displayName && (
            <p className="text-xs text-gray-400 truncate">@{username}</p>
          )}
        </div>
      )}
    </Link>
  );
}

// FollowButton — follows/unfollows a user with optimistic update
export function FollowButton({ targetUserId }: { targetUserId: string }) {
  const { user } = useAuth();
  const { followingIds, toggleFollow, loading } = useFollow();
  const { followers } = useFollowStats(targetUserId);

  if (!user || user.id === targetUserId) return null;
  if (loading) return null;

  const isFollowing = followingIds.has(targetUserId);

  return (
    <button
      onClick={() => toggleFollow(targetUserId)}
      className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        isFollowing
          ? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600'
          : 'bg-indigo-600 text-white hover:bg-indigo-700'
      }`}
    >
      {isFollowing ? <UserCheck className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
      {isFollowing ? 'Following' : 'Follow'}
      {followers > 0 && <span className="text-xs opacity-70">({followers})</span>}
    </button>
  );
}

// UserCard — compact user card for follower/following lists
export function UserCard({ user: u }: { user: { id: string; full_name?: string; username?: string; avatar_url?: string | null; is_verified?: boolean; location?: string } }) {
  const { followers } = useFollowStats(u.id);
  const isVerified = Boolean(u.is_verified);

  return (
    <div className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:shadow-sm transition-shadow">
      <ProfileLink
        userId={u.id}
        username={u.username}
        displayName={u.full_name}
        avatar={u.avatar_url}
        size="md"
        showBadge
        verified={isVerified}
      />
      <div className="flex items-center gap-2">
        {u.location && (
          <span className="hidden sm:flex items-center gap-1 text-xs text-gray-400">
            <MapPin className="w-3 h-3" /> {u.location}
          </span>
        )}
        <span className="text-xs text-gray-400">{followers} followers</span>
        <FollowButton targetUserId={u.id} />
      </div>
    </div>
  );
}

// FollowersList — paginated list of followers or following
export function FollowersList({ userId, type }: { userId: string; type: 'followers' | 'following' }) {
  const [users, setUsers] = useState<{ id: string; full_name?: string; username?: string; avatar_url?: string | null; is_verified?: boolean; location?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const fkColumn = type === 'followers' ? 'follower_id' : 'following_id';
        const selectColumn = type === 'followers' ? 'follower' : 'following';
        const { data, error } = await supabase
          .from('user_follows')
          .select(`${selectColumn} (id, full_name, username, avatar_url, is_verified, location)`)
          .eq(fkColumn, userId)
          .order('created_at', { ascending: false });
        if (error) throw error;
        setUsers((data || []).map((r: Record<string, unknown>) => r[selectColumn] as typeof users[0]).filter(Boolean))
      } catch { /* ignore */ }
      finally { setLoading(false); }
    };
    load();
  }, [userId, type]);

  const filtered = users.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (u.full_name || '').toLowerCase().includes(q) || (u.username || '').toLowerCase().includes(q);
  });

  if (loading) return <p className="text-center text-gray-400 py-8">Loading...</p>;
  if (!filtered.length) return <p className="text-center text-gray-400 py-8">No {type} found</p>;

  return (
    <div className="space-y-2">
      <input
        type="text"
        placeholder="Search..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white mb-3"
      />
      {filtered.map((u) => <UserCard key={u.id} user={u} />)}
    </div>
  );
}

import { supabase } from '../lib/supabase';
