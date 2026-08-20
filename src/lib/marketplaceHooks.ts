import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';
import { emitEvent } from './notificationEvents';

export interface WishlistItem {
  id: string;
  product_id: string;
  folder: string | null;
  notify_price_drop: boolean;
  notify_back_in_stock: boolean;
  created_at: string;
}

export function useWishlist(userId: string | undefined) {
  const [wishlistIds, setWishlistIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const fetchWishlist = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data } = await supabase
      .from('wishlist')
      .select('product_id')
      .eq('user_id', userId);
    setWishlistIds(new Set((data || []).map((w: { product_id: string }) => w.product_id)));
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchWishlist();
  }, [fetchWishlist]);

  const toggleWishlist = useCallback(async (productId: string): Promise<boolean> => {
    if (!userId) return false;
    if (wishlistIds.has(productId)) {
      await supabase.from('wishlist').delete().eq('user_id', userId).eq('product_id', productId);
      setWishlistIds(prev => {
        const next = new Set(prev);
        next.delete(productId);
        return next;
      });
      return false;
    } else {
      await supabase.from('wishlist').insert({ user_id: userId, product_id: productId });
      setWishlistIds(prev => new Set(prev).add(productId));
      return true;
    }
  }, [userId, wishlistIds]);

  return { wishlistIds, toggleWishlist, loading, refetch: fetchWishlist };
}

export function useStoreFollow(userId: string | undefined) {
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [followerCounts, setFollowerCounts] = useState<Record<string, number>>({});

  const fetchFollowing = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from('store_followers')
      .select('store_id')
      .eq('follower_id', userId);
    setFollowingIds(new Set((data || []).map((f: { store_id: string }) => f.store_id)));
  }, [userId]);

  useEffect(() => {
    fetchFollowing();
  }, [fetchFollowing]);

  const toggleFollow = useCallback(async (storeId: string): Promise<boolean> => {
    if (!userId) return false;
    if (followingIds.has(storeId)) {
      await supabase.from('store_followers').delete().eq('follower_id', userId).eq('store_id', storeId);
      setFollowingIds(prev => {
        const next = new Set(prev);
        next.delete(storeId);
        return next;
      });
      setFollowerCounts(prev => ({ ...prev, [storeId]: Math.max(0, (prev[storeId] || 1) - 1) }));
      return false;
    } else {
      await supabase.from('store_followers').insert({ follower_id: userId, store_id: storeId });
      // Emit new_follower notification to store owner
      const { data: store } = await supabase
        .from('products')
        .select('uploaded_by')
        .eq('id', storeId)
        .maybeSingle();
      if (store?.uploaded_by) {
        const { data: follower } = await supabase
          .from('users')
          .select('full_name, avatar_url')
          .eq('id', userId)
          .maybeSingle();
        await emitEvent({
          module: 'store',
          eventType: 'new_follower',
          recipientIds: store.uploaded_by,
          actorId: userId,
          metadata: {
            followerName: follower?.full_name || 'Someone',
            followerAvatar: follower?.avatar_url || null,
          },
        });
      }
      setFollowingIds(prev => new Set(prev).add(storeId));
      setFollowerCounts(prev => ({ ...prev, [storeId]: (prev[storeId] || 0) + 1 }));
      return true;
    }
  }, [userId, followingIds]);

  const fetchFollowerCount = useCallback(async (storeId: string) => {
    const { count } = await supabase
      .from('store_followers')
      .select('*', { count: 'exact', head: true })
      .eq('store_id', storeId);
    setFollowerCounts(prev => ({ ...prev, [storeId]: count || 0 }));
  }, []);

  return { followingIds, toggleFollow, followerCounts, fetchFollowerCount, refetch: fetchFollowing };
}

export function useRecentlyViewed(userId: string | undefined) {
  const [recentlyViewed, setRecentlyViewed] = useState<string[]>([]);

  const fetchRecentlyViewed = useCallback(async () => {
    if (!userId) {
      const local = localStorage.getItem('dright_recently_viewed_ids');
      if (local) {
        try { setRecentlyViewed(JSON.parse(local)); } catch { /* ignore */ }
      }
      return;
    }
    const { data } = await supabase
      .from('recently_viewed')
      .select('product_id')
      .eq('user_id', userId)
      .order('viewed_at', { ascending: false })
      .limit(12);
    setRecentlyViewed((data || []).map((r: { product_id: string }) => r.product_id));
  }, [userId]);

  useEffect(() => {
    fetchRecentlyViewed();
  }, [fetchRecentlyViewed]);

  const recordView = useCallback(async (productId: string) => {
    if (userId) {
      const { data: existing } = await supabase
        .from('recently_viewed')
        .select('id, view_count')
        .eq('user_id', userId)
        .eq('product_id', productId)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('recently_viewed')
          .update({ viewed_at: new Date().toISOString(), view_count: (existing as { view_count: number }).view_count + 1 })
          .eq('id', (existing as { id: string }).id);
      } else {
        await supabase.from('recently_viewed').insert({ user_id: userId, product_id: productId });
      }
    }
    // Always update local storage for guests and logged-in users
    try {
      const local = localStorage.getItem('dright_recently_viewed_ids');
      const ids: string[] = local ? JSON.parse(local) : [];
      const updated = [productId, ...ids.filter(id => id !== productId)].slice(0, 20);
      localStorage.setItem('dright_recently_viewed_ids', JSON.stringify(updated));
    } catch { /* ignore */ }
    // Also record analytics view
    await supabase.from('product_views').insert({ product_id: productId, user_id: userId || null });
  }, [userId]);

  return { recentlyViewed, recordView, refetch: fetchRecentlyViewed };
}
