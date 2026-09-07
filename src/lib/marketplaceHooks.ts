import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';
import { emitEvent } from './notificationEvents';
import { trackEvent, trackProductView } from './analyticsService';

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
    const { data } = await supabase.from('wishlist').select('product_id').eq('user_id', userId);
    setWishlistIds(new Set((data || []).map((w: { product_id: string }) => w.product_id)));
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchWishlist(); }, [fetchWishlist]);

  const toggleWishlist = useCallback(async (productId: string): Promise<boolean> => {
    if (!userId) return false;
    if (wishlistIds.has(productId)) {
      const { error } = await supabase.from('wishlist').delete().eq('user_id', userId).eq('product_id', productId);
      if (error) return true;
      setWishlistIds(prev => { const next = new Set(prev); next.delete(productId); return next; });
      void trackEvent({ event_type: 'wishlist_remove', entity_type: 'product', entity_id: productId, source: 'marketplace' });
      return false;
    }

    const { error } = await supabase.from('wishlist').insert({ user_id: userId, product_id: productId });
    if (error) return false;
    setWishlistIds(prev => new Set(prev).add(productId));
    void trackEvent({ event_type: 'wishlist_add', entity_type: 'product', entity_id: productId, source: 'marketplace' });
    return true;
  }, [userId, wishlistIds]);

  return { wishlistIds, toggleWishlist, loading, refetch: fetchWishlist };
}

export function useStoreFollow(userId: string | undefined) {
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [followerCounts, setFollowerCounts] = useState<Record<string, number>>({});

  const fetchFollowing = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase.from('store_followers').select('store_id').eq('follower_id', userId);
    setFollowingIds(new Set((data || []).map((f: { store_id: string }) => f.store_id)));
  }, [userId]);

  useEffect(() => { fetchFollowing(); }, [fetchFollowing]);

  const toggleFollow = useCallback(async (storeId: string): Promise<boolean> => {
    if (!userId) return false;
    if (followingIds.has(storeId)) {
      const { error } = await supabase.from('store_followers').delete().eq('follower_id', userId).eq('store_id', storeId);
      if (error) return true;
      setFollowingIds(prev => { const next = new Set(prev); next.delete(storeId); return next; });
      setFollowerCounts(prev => ({ ...prev, [storeId]: Math.max(0, (prev[storeId] || 1) - 1) }));
      void trackEvent({ event_type: 'button_click', entity_type: 'profile', entity_id: storeId, source: 'store', metadata: { action: 'unfollow_store' } });
      return false;
    }

    const { error } = await supabase.from('store_followers').insert({ follower_id: userId, store_id: storeId });
    if (error) return false;

    const { data: store } = await supabase.from('products').select('uploaded_by').eq('id', storeId).maybeSingle();
    if (store?.uploaded_by) {
      const { data: follower } = await supabase.from('users').select('full_name, avatar_url').eq('id', userId).maybeSingle();
      await emitEvent({
        module: 'store',
        eventType: 'new_follower',
        recipientIds: store.uploaded_by,
        actorId: userId,
        metadata: { followerName: follower?.full_name || 'Someone', followerAvatar: follower?.avatar_url || null },
      });
    }
    setFollowingIds(prev => new Set(prev).add(storeId));
    setFollowerCounts(prev => ({ ...prev, [storeId]: (prev[storeId] || 0) + 1 }));
    void trackEvent({ event_type: 'button_click', entity_type: 'profile', entity_id: storeId, source: 'store', metadata: { action: 'follow_store' } });
    return true;
  }, [userId, followingIds]);

  const fetchFollowerCount = useCallback(async (storeId: string) => {
    const { count } = await supabase.from('store_followers').select('*', { count: 'exact', head: true }).eq('store_id', storeId);
    setFollowerCounts(prev => ({ ...prev, [storeId]: count || 0 }));
  }, []);

  return { followingIds, toggleFollow, followerCounts, fetchFollowerCount, refetch: fetchFollowing };
}

const RECENTLY_VIEWED_STORAGE_KEY = 'dright_recently_viewed_ids';
const RECENTLY_VIEWED_ACCOUNT_LIMIT = 12;
const RECENTLY_VIEWED_BROWSER_LIMIT = 20;

function getLocalRecentlyViewedIds(): string[] {
  try {
    const raw = localStorage.getItem(RECENTLY_VIEWED_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return Array.from(new Set(parsed.filter((id): id is string => typeof id === 'string' && id.length > 0)));
  } catch {
    return [];
  }
}

function setLocalRecentlyViewedIds(ids: string[]): void {
  try {
    localStorage.setItem(
      RECENTLY_VIEWED_STORAGE_KEY,
      JSON.stringify(Array.from(new Set(ids)).slice(0, RECENTLY_VIEWED_BROWSER_LIMIT)),
    );
  } catch {
    // Browser storage can be unavailable in private/restricted contexts.
  }
}

async function mergeGuestRecentlyViewed(userId: string): Promise<void> {
  const guestIds = getLocalRecentlyViewedIds().slice(0, RECENTLY_VIEWED_ACCOUNT_LIMIT);
  if (guestIds.length === 0) return;

  // Only merge products that still exist and are currently browseable. A stale local
  // ID must not create a broken account-history record.
  const { data: validProducts, error: productError } = await supabase
    .from('products')
    .select('id')
    .in('id', guestIds)
    .eq('is_active', true)
    .eq('is_hidden', false)
    .eq('approval_status', 'approved');

  if (productError) return;

  const validIdSet = new Set((validProducts || []).map((product: { id: string }) => product.id));
  const validGuestIds = guestIds.filter(id => validIdSet.has(id));
  if (validGuestIds.length === 0) return;

  const { data: existingRows, error: existingError } = await supabase
    .from('recently_viewed')
    .select('id, product_id, viewed_at, view_count')
    .eq('user_id', userId)
    .in('product_id', validGuestIds);

  if (existingError) return;

  const existingByProduct = new Map(
    (existingRows || []).map((row: { id: string; product_id: string; viewed_at: string; view_count: number }) => [row.product_id, row]),
  );

  // Local IDs are stored newest-first. Preserve that ordering while making the
  // account-side rows canonical. Do not emit product-view analytics here: this is
  // an identity-state merge, not a new view event.
  const baseTime = Date.now();
  for (let index = 0; index < validGuestIds.length; index += 1) {
    const productId = validGuestIds[index];
    const viewedAt = new Date(baseTime - index).toISOString();
    const existing = existingByProduct.get(productId);

    if (existing) {
      await supabase
        .from('recently_viewed')
        .update({ viewed_at: viewedAt })
        .eq('id', existing.id)
        .eq('user_id', userId);
    } else {
      await supabase
        .from('recently_viewed')
        .insert({ user_id: userId, product_id: productId, viewed_at: viewedAt, view_count: 1 });
    }
  }
}

export function useRecentlyViewed(userId: string | undefined) {
  const [recentlyViewed, setRecentlyViewed] = useState<string[]>([]);

  const fetchRecentlyViewed = useCallback(async () => {
    if (!userId) {
      setRecentlyViewed(getLocalRecentlyViewedIds().slice(0, RECENTLY_VIEWED_ACCOUNT_LIMIT));
      return;
    }

    // ST-1g: merge this browser's anonymous history into the existing authenticated
    // history before reading it. The operation updates existing rows or inserts only
    // missing rows, so repeated login/session restoration is idempotent.
    await mergeGuestRecentlyViewed(userId);

    const { data } = await supabase
      .from('recently_viewed')
      .select('product_id')
      .eq('user_id', userId)
      .order('viewed_at', { ascending: false })
      .limit(RECENTLY_VIEWED_ACCOUNT_LIMIT);

    const accountIds = (data || []).map((row: { product_id: string }) => row.product_id);
    setRecentlyViewed(accountIds);

    // Keep one browser history as the local continuity/fallback store. This also
    // means signing out does not erase products the person just viewed while signed in.
    setLocalRecentlyViewedIds([...accountIds, ...getLocalRecentlyViewedIds()]);
  }, [userId]);

  useEffect(() => { void fetchRecentlyViewed(); }, [fetchRecentlyViewed]);

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
          .update({
            viewed_at: new Date().toISOString(),
            view_count: (existing as { view_count: number }).view_count + 1,
          })
          .eq('id', (existing as { id: string }).id);
      } else {
        await supabase.from('recently_viewed').insert({ user_id: userId, product_id: productId });
      }
    }

    setLocalRecentlyViewedIds([productId, ...getLocalRecentlyViewedIds().filter(id => id !== productId)]);

    // Canonical analytics path; the server mirrors this into legacy product_views.
    void trackProductView(productId, null, 'marketplace');
  }, [userId]);

  return { recentlyViewed, recordView, refetch: fetchRecentlyViewed };
}
