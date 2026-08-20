import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Users } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { ProfileLink, FollowButton } from '../components/Social';
import { useFollowStats } from '../lib/socialHooks';

interface FriendUser {
  id: string;
  full_name?: string;
  username?: string;
  avatar_url?: string | null;
  is_verified?: boolean;
  location?: string;
}

export default function FriendsPage() {
  const { userId } = useParams<{ userId: string }>();
  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!userId) return;
    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.rpc('get_mutual_friends', { p_user_id: userId });
        if (error) throw error;
        setFriends((data as FriendUser[]) || []);
      } catch {
        setFriends([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [userId]);

  const filtered = friends.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (u.full_name || '').toLowerCase().includes(q) || (u.username || '').toLowerCase().includes(q);
  });

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-4">
        <Link to={`/profile/${userId}`} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </Link>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Mutual Friends</h1>
      </div>

      <input
        type="text"
        placeholder="Search friends..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white mb-3"
      />

      {loading ? (
        <p className="text-center text-gray-400 py-8">Loading...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <Users className="w-12 h-12 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
          <p className="text-gray-400">No mutual friends yet</p>
          <p className="text-xs text-gray-400 mt-1">When two users follow each other, they become friends</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((u) => (
            <FriendCard key={u.id} user={u} />
          ))}
        </div>
      )}
    </div>
  );
}

function FriendCard({ user: u }: { user: FriendUser }) {
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
        <span className="text-xs text-gray-400">{followers} followers</span>
        <FollowButton targetUserId={u.id} />
      </div>
    </div>
  );
}
