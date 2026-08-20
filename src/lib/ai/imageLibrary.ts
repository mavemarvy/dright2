import { supabase } from '../supabase';

// ─────────────────────────────────────────────────────────────────────────────
// DRIGHT AI Image Library Service
//
// Persistent image history with search, filter, download, delete, regenerate,
// duplicate, share, favorite, and soft-delete (trash).
// ─────────────────────────────────────────────────────────────────────────────

export interface AIImageRecord {
  id: string;
  user_id: string;
  prompt: string;
  image_url: string;
  type: string;
  provider: string;
  model: string;
  status: string;
  metadata: Record<string, unknown>;
  created_at: string;
  favorite: boolean;
  deleted_at: string | null;
  storage_path: string | null;
  generation_ms: number;
  cost: number;
  size: string;
  quality: string;
}

export type ImageFilter = 'all' | 'generated' | 'edited' | 'analyzed' | 'favorite' | 'deleted' | 'recent';

export async function getUserImages(userId: string, filter: ImageFilter = 'all', limit = 50): Promise<AIImageRecord[]> {
  let query = supabase.from('ai_images').select('*').eq('user_id', userId);

  switch (filter) {
    case 'generated':
      query = query.eq('type', 'generated').is('deleted_at', null);
      break;
    case 'edited':
      query = query.eq('type', 'edited').is('deleted_at', null);
      break;
    case 'favorite':
      query = query.eq('favorite', true).is('deleted_at', null);
      break;
    case 'deleted':
      query = query.not('deleted_at', 'is', null);
      break;
    case 'recent':
      query = query.is('deleted_at', null).order('created_at', { ascending: false }).limit(12);
      break;
    default:
      query = query.is('deleted_at', null);
  }

  if (filter !== 'recent') {
    query = query.order('created_at', { ascending: false }).limit(limit);
  }

  const { data, error } = await query;
  if (error) { console.error('getUserImages error:', error); return []; }
  return (data || []) as AIImageRecord[];
}

export async function searchImages(userId: string, query: string): Promise<AIImageRecord[]> {
  const { data, error } = await supabase
    .from('ai_images')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .ilike('prompt', `%${query}%`)
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) { console.error('searchImages error:', error); return []; }
  return (data || []) as AIImageRecord[];
}

export async function toggleFavorite(imageId: string, favorite: boolean): Promise<void> {
  const { error } = await supabase.from('ai_images').update({ favorite }).eq('id', imageId);
  if (error) console.error('toggleFavorite error:', error);
}

export async function softDeleteImage(imageId: string): Promise<void> {
  const { error } = await supabase
    .from('ai_images')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', imageId);
  if (error) console.error('softDeleteImage error:', error);
}

export async function restoreImage(imageId: string): Promise<void> {
  const { error } = await supabase
    .from('ai_images')
    .update({ deleted_at: null })
    .eq('id', imageId);
  if (error) console.error('restoreImage error:', error);
}

export async function permanentlyDeleteImage(imageId: string): Promise<void> {
  const { error } = await supabase.from('ai_images').delete().eq('id', imageId);
  if (error) console.error('permanentlyDeleteImage error:', error);
}

export async function duplicateImage(imageId: string, userId: string): Promise<AIImageRecord | null> {
  const { data: original, error } = await supabase
    .from('ai_images')
    .select('*')
    .eq('id', imageId)
    .maybeSingle();
  if (error || !original) return null;

  const { data: copy, error: insertError } = await supabase
    .from('ai_images')
    .insert({
      user_id: userId,
      prompt: original.prompt,
      image_url: original.image_url,
      type: original.type,
      provider: original.provider,
      model: original.model,
      status: 'completed',
      metadata: { ...original.metadata, duplicated_from: imageId },
      size: original.size,
      quality: original.quality,
    })
    .select('*')
    .single();

  if (insertError) { console.error('duplicateImage error:', insertError); return null; }
  return copy as AIImageRecord;
}

export async function downloadImage(imageUrl: string, fileName: string): Promise<void> {
  try {
    const res = await fetch(imageUrl);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName || 'dright-ai-image.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('downloadImage error:', err);
    // Fallback: open in new tab
    window.open(imageUrl, '_blank');
  }
}

export async function shareImage(imageUrl: string, prompt: string): Promise<void> {
  if (navigator.share) {
    try {
      await navigator.share({
        title: 'DRIGHT AI Image',
        text: prompt,
        url: imageUrl,
      });
    } catch {
      // User cancelled — not an error
    }
  } else {
    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(imageUrl);
    } catch {
      // ignore
    }
  }
}

export async function regenerateImage(params: {
  prompt: string;
  userId: string;
  size?: string;
  quality?: string;
  style?: string;
}): Promise<{ success: boolean; imageUrl?: string; imageId?: string; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('image-gen', {
      body: {
        action: 'generate',
        prompt: params.prompt,
        userId: params.userId,
        size: params.size || '1024x1024',
        quality: params.quality || 'standard',
        style: params.style || 'vivid',
      },
    });

    if (error || !data || data.success === false) {
      return { success: false, error: data?.error || error?.message || 'Regeneration failed' };
    }

    return {
      success: true,
      imageUrl: data.imageUrl,
      imageId: data.imageId,
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
