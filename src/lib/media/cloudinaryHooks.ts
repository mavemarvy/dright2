import { useState, useCallback } from 'react';
import { uploadToCloudinary, optimizeUrl, deleteFromCloudinary, getCloudinaryUrl } from './cloudinary';

export function useCloudinaryUpload() {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ publicId: string; url: string; optimizedUrl: string; thumbnailUrl: string } | null>(null);

  const upload = useCallback(async (file: File, userId: string, folder = 'dright') => {
    setUploading(true);
    setError(null);
    try {
      const res = await uploadToCloudinary(file, userId, folder);
      if (!res) {
        setError('Upload failed');
        return null;
      }
      setResult(res);
      return res;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload error');
      return null;
    } finally {
      setUploading(false);
    }
  }, []);

  return { uploading, error, result, upload, setError };
}

export function useCloudinaryOptimize() {
  const [loading, setLoading] = useState(false);

  const optimize = useCallback(async (publicId: string, transformations?: Record<string, unknown>) => {
    setLoading(true);
    const result = await optimizeUrl(publicId, transformations);
    setLoading(false);
    return result;
  }, []);

  return { loading, optimize };
}

export function useCloudinaryDelete() {
  const [loading, setLoading] = useState(false);

  const remove = useCallback(async (publicId: string) => {
    setLoading(true);
    const ok = await deleteFromCloudinary(publicId);
    setLoading(false);
    return ok;
  }, []);

  return { loading, remove };
}

export { getCloudinaryUrl };
