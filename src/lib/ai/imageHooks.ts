import { useState, useCallback, useEffect } from 'react';
import {
  generateImage, analyzeImage, editImage, uploadImageToStorage,
} from './imageGenerator';
import {
  getUserImages as fetchUserImages,
  toggleFavorite,
  softDeleteImage,
  permanentlyDeleteImage,
  duplicateImage,
  downloadImage,
  shareImage,
  searchImages,
  regenerateImage,
  type AIImageRecord,
  type ImageFilter,
} from './imageLibrary';

// ─────────────────────────────────────────────────────────────────────────────
// DRIGHT AI Image Hooks — Fixed to work with real image URLs
// ─────────────────────────────────────────────────────────────────────────────

export function useImageGeneration() {
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ imageUrl: string; imageId: string; revisedPrompt?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async (params: {
    prompt: string;
    userId: string;
    size?: string;
    quality?: string;
    style?: string;
  }) => {
    setGenerating(true);
    setError(null);
    setResult(null);

    const res = await generateImage(params);
    if (res.success) {
      setResult({
        imageUrl: res.imageUrl,
        imageId: res.imageId,
        revisedPrompt: res.revisedPrompt,
      });
    } else {
      setError(res.error || 'Generation failed');
    }
    setGenerating(false);
    return res;
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { generating, result, error, generate, reset };
}

export function useImageAnalysis() {
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const analyze = useCallback(async (imageUrl: string, userId: string, prompt?: string) => {
    setAnalyzing(true);
    setError(null);
    setResult(null);

    const res = await analyzeImage({ imageUrl, userId, prompt });
    if (res.success) {
      setResult(res.analysis);
    } else {
      setError(res.error || 'Analysis failed');
    }
    setAnalyzing(false);
    return res;
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { analyzing, result, error, analyze, reset };
}

export function useImageEdit() {
  const [editing, setEditing] = useState(false);
  const [result, setResult] = useState<{ imageUrl: string; imageId?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const edit = useCallback(async (params: {
    imageUrl: string;
    prompt: string;
    userId: string;
    mask?: string;
  }) => {
    setEditing(true);
    setError(null);
    setResult(null);

    const res = await editImage(params);
    if (res.success) {
      setResult({ imageUrl: res.imageUrl, imageId: res.imageId });
    } else {
      setError(res.error || 'Edit failed');
    }
    setEditing(false);
    return res;
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { editing, result, error, edit, reset };
}

export function useImageUpload() {
  const [uploading, setUploading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(async (file: File, userId: string) => {
    setUploading(true);
    setError(null);
    setUploadedUrl(null);

    const result = await uploadImageToStorage(file, userId);
    if (result) {
      setUploadedUrl(result.url);
    } else {
      setError('Upload failed');
    }
    setUploading(false);
    return result;
  }, []);

  const reset = useCallback(() => {
    setUploadedUrl(null);
    setError(null);
  }, []);

  return { uploading, uploadedUrl, error, upload, reset };
}

export function useUserImages(userId: string | undefined, filter: ImageFilter = 'all') {
  const [images, setImages] = useState<AIImageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    const imgs = await fetchUserImages(userId, filter);
    setImages(imgs);
    setError(null);
    setLoading(false);
  }, [userId, filter]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleFav = useCallback(async (imageId: string, current: boolean) => {
    await toggleFavorite(imageId, !current);
    setImages(prev => prev.map(img => img.id === imageId ? { ...img, favorite: !current } : img));
  }, []);

  const remove = useCallback(async (imageId: string) => {
    await softDeleteImage(imageId);
    setImages(prev => prev.filter(img => img.id !== imageId));
  }, []);

  return { images, loading, error, refresh: load, toggleFavorite: toggleFav, remove };
}

export function useAllImages(limit = 100) {
  const [images, setImages] = useState<AIImageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Admin fetches all images — use a service-role query via the edge function
      const { supabase } = await import('../supabase');
      const { data, error: queryError } = await supabase
        .from('ai_images')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (queryError) throw queryError;
      setImages((data || []) as AIImageRecord[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load images');
    }
    setLoading(false);
  }, [limit]);

  useEffect(() => {
    load();
  }, [load]);

  const moderate = useCallback(async (imageId: string, status: string) => {
    const { supabase } = await import('../supabase');
    await supabase.from('ai_images').update({ status }).eq('id', imageId);
    setImages(prev => prev.map(img => img.id === imageId ? { ...img, status } : img));
  }, []);

  const remove = useCallback(async (imageId: string) => {
    await permanentlyDeleteImage(imageId);
    setImages(prev => prev.filter(img => img.id !== imageId));
  }, []);

  return { images, loading, error, refresh: load, moderate, remove };
}

export function useImageLibrary(userId: string | undefined) {
  const [images, setImages] = useState<AIImageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const load = useCallback(async (filter: ImageFilter = 'all') => {
    if (!userId) return;
    setLoading(true);
    const imgs = searchQuery
      ? await searchImages(userId, searchQuery)
      : await fetchUserImages(userId, filter);
    setImages(imgs);
    setLoading(false);
  }, [userId, searchQuery]);

  useEffect(() => {
    load();
  }, [load]);

  return {
    images, loading, searchQuery, setSearchQuery,
    refresh: load,
    toggleFavorite: async (id: string, fav: boolean) => {
      await toggleFavorite(id, fav);
      setImages(prev => prev.map(img => img.id === id ? { ...img, favorite: fav } : img));
    },
    delete: async (id: string) => {
      await softDeleteImage(id);
      setImages(prev => prev.filter(img => img.id !== id));
    },
    restore: async (id: string) => {
      await import('./imageGenerator').then(m => m.restoreImage(id));
      setImages(prev => prev.filter(img => img.id !== id));
    },
    duplicate: async (id: string) => {
      if (userId) {
        const copy = await duplicateImage(id, userId);
        if (copy) setImages(prev => [copy, ...prev]);
      }
    },
    download: async (url: string, name: string) => {
      await downloadImage(url, name);
    },
    share: async (url: string, prompt: string) => {
      await shareImage(url, prompt);
    },
    regenerate: async (prompt: string, size?: string, quality?: string) => {
      if (!userId) return null;
      return await regenerateImage({ prompt, userId, size, quality });
    },
  };
}
