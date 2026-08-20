// ─────────────────────────────────────────────────────────────────────────────
// DRIGHT Social Follow System — Hooks and Components
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';
import { useAuth } from '../contexts/AuthContext';

export function useFollow() {
  const { user } = useAuth();
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const loadFollowing = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    try {
      const { data, error } = await supabase
        .from('user_follows')
        .select('following_id')
        .eq('follower_id', user.id);
      if (error) throw error;
      setFollowingIds(new Set((data || []).map((f) => f.following_id)));
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { loadFollowing(); }, [loadFollowing]);

  const toggleFollow = useCallback(async (targetUserId: string) => {
    if (!user || user.id === targetUserId) return;
    const isFollowing = followingIds.has(targetUserId);
    setFollowingIds((prev) => {
      const next = new Set(prev);
      if (isFollowing) next.delete(targetUserId);
      else next.add(targetUserId);
      return next;
    });
    try {
      if (isFollowing) {
        await supabase.from('user_follows').delete()
          .eq('follower_id', user.id).eq('following_id', targetUserId);
      } else {
        await supabase.from('user_follows').insert({
          follower_id: user.id,
          following_id: targetUserId,
        });
        await supabase.from('activity_feed').insert({
          user_id: user.id,
          event_type: 'followed_user',
          category: 'social',
          title: 'Started following',
          related_id: targetUserId,
          related_type: 'user',
        });
        await supabase.from('social_notifications').insert({
          user_id: targetUserId,
          actor_id: user.id,
          notification_type: 'follow',
          entity_type: 'user',
          entity_id: user.id,
        });
      }
    } catch {
      setFollowingIds((prev) => {
        const next = new Set(prev);
        if (isFollowing) next.add(targetUserId);
        else next.delete(targetUserId);
        return next;
      });
    }
  }, [user, followingIds]);

  return { followingIds, toggleFollow, loading, refresh: loadFollowing };
}

export function useFollowStats(userId: string | undefined) {
  const [followers, setFollowers] = useState(0);
  const [following, setFollowing] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    const load = async () => {
      setLoading(true);
      try {
        const [f1, f2] = await Promise.all([
          supabase.from('user_follows').select('*', { count: 'exact', head: true }).eq('following_id', userId),
          supabase.from('user_follows').select('*', { count: 'exact', head: true }).eq('follower_id', userId),
        ]);
        setFollowers(f1.count || 0);
        setFollowing(f2.count || 0);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    };
    load();
    const channelSuffix = Math.random().toString(36).slice(2, 8);
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase.channel(`follows:${userId}:${channelSuffix}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'user_follows', filter: `following_id=eq.${userId}` },
          () => load())
        .subscribe();
    } catch {
      // channel already subscribed — real-time updates unavailable for this instance
    }
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [userId]);

  return { followers, following, loading };
}

export function useProfileView(targetUserId: string | undefined) {
  const { user } = useAuth();
  useEffect(() => {
    if (!targetUserId || targetUserId === user?.id) return;
    const sessionId = sessionStorage.getItem('session_id') || crypto.randomUUID();
    sessionStorage.setItem('session_id', sessionId);
    supabase.from('profile_views').insert({
      profile_id: targetUserId,
      viewer_id: user?.id || null,
      session_id: sessionId,
    }).then(() => {});
  }, [targetUserId, user?.id]);
}

export function useFriendsCount(userId: string | undefined) {
  const [friends, setFriends] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.rpc('get_mutual_friends_count', { p_user_id: userId });
        if (error) throw error;
        setFriends(typeof data === 'number' ? data : 0);
      } catch {
        setFriends(0);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [userId]);

  return { friends, loading };
}
