import { supabase } from '../supabase';

export interface CloudinaryUploadParams {
  cloudName: string;
  apiKey: string;
  timestamp: string;
  folder: string;
  signature: string;
  uploadUrl: string;
}

export interface CloudinaryOptimizeResult {
  optimizedUrl: string;
  thumbnailUrl: string;
}

export async function getUploadParams(userId: string, folder = 'dright'): Promise<CloudinaryUploadParams | null> {
  const { data, error } = await supabase.functions.invoke('cloudinary-proxy', {
    body: { action: 'get-upload-params', userId, folder },
  });
  if (error || !data?.success) return null;
  return {
    cloudName: data.cloudName,
    apiKey: data.apiKey,
    timestamp: data.timestamp,
    folder: data.folder,
    signature: data.signature,
    uploadUrl: data.uploadUrl,
  };
}

export async function uploadToCloudinary(file: File, userId: string, folder = 'dright'): Promise<{ publicId: string; url: string; optimizedUrl: string; thumbnailUrl: string } | null> {
  const params = await getUploadParams(userId, folder);
  if (!params) return null;

  const formData = new FormData();
  formData.append('file', file);
  formData.append('api_key', params.apiKey);
  formData.append('timestamp', params.timestamp);
  formData.append('folder', params.folder);
  formData.append('signature', params.signature);
  formData.append('upload_preset', 'dright_unsigned');

  try {
    const res = await fetch(params.uploadUrl, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      console.error('Cloudinary upload error:', err.slice(0, 200));
      return null;
    }

    const data = await res.json();
    const publicId = data.public_id;
    const url = data.secure_url;

    const optimized = await optimizeUrl(publicId);
    return {
      publicId,
      url,
      optimizedUrl: optimized?.optimizedUrl || url,
      thumbnailUrl: optimized?.thumbnailUrl || url,
    };
  } catch {
    return null;
  }
}

export async function optimizeUrl(publicId: string, transformations?: Record<string, unknown>): Promise<CloudinaryOptimizeResult | null> {
  const { data, error } = await supabase.functions.invoke('cloudinary-proxy', {
    body: { action: 'optimize-url', publicId, transformations },
  });
  if (error || !data?.success) return null;
  return { optimizedUrl: data.optimizedUrl, thumbnailUrl: data.thumbnailUrl };
}

export async function deleteFromCloudinary(publicId: string): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke('cloudinary-proxy', {
    body: { action: 'delete', publicId },
  });
  return !error && data?.success;
}

export function getCloudinaryUrl(publicId: string, transformations: Record<string, string | number> = {}): string {
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || '';
  const defaults = { quality: 'auto', fetch_format: 'auto', width: 1200, crop: 'limit' };
  const merged = { ...defaults, ...transformations };
  const transformStr = Object.entries(merged).map(([k, v]) => `${k}_${v}`).join(',');
  return `https://res.cloudinary.com/${cloudName}/image/upload/${transformStr}/${publicId}`;
}
