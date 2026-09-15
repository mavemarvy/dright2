import { supabase } from '../supabase';

export type CloudinaryResourceType = 'image' | 'video' | 'raw' | 'auto';

export interface CloudinaryUploadParams {
  cloudName: string;
  apiKey: string;
  timestamp: string;
  folder: string;
  signature: string;
  uploadUrl: string;
  resourceType: CloudinaryResourceType;
}

export interface CloudinaryOptimizeResult {
  optimizedUrl: string;
  thumbnailUrl: string;
}

export interface CloudinaryUploadOptions {
  folder?: string;
  feature?: string;
  visibility?: 'public' | 'private' | 'participants' | 'admin';
  referenceTable?: string | null;
  referenceId?: string | null;
  resourceType?: CloudinaryResourceType;
}

function inferResourceType(file: File): CloudinaryResourceType {
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('image/')) return 'image';
  return 'raw';
}

export async function getUploadParams(
  _legacyUserId?: string,
  folder = 'dright',
  resourceType: CloudinaryResourceType = 'image',
): Promise<CloudinaryUploadParams | null> {
  const { data, error } = await supabase.functions.invoke('cloudinary-proxy', {
    body: { action: 'get-upload-params', folder, resourceType },
  });
  if (error || !data?.success) return null;
  return {
    cloudName: data.cloudName,
    apiKey: data.apiKey,
    timestamp: data.timestamp,
    folder: data.folder,
    signature: data.signature,
    uploadUrl: data.uploadUrl,
    resourceType: data.resourceType || resourceType,
  };
}

export async function uploadToCloudinary(
  file: File,
  legacyUserId?: string,
  folderOrOptions: string | CloudinaryUploadOptions = 'dright',
): Promise<{ publicId: string; url: string; optimizedUrl: string; thumbnailUrl: string; assetId?: string; resourceType: CloudinaryResourceType } | null> {
  const options: CloudinaryUploadOptions = typeof folderOrOptions === 'string' ? { folder: folderOrOptions } : folderOrOptions;
  const resourceType = options.resourceType || inferResourceType(file);
  const params = await getUploadParams(legacyUserId, options.folder || 'dright', resourceType);
  if (!params) return null;

  const formData = new FormData();
  formData.append('file', file);
  formData.append('api_key', params.apiKey);
  formData.append('timestamp', params.timestamp);
  formData.append('folder', params.folder);
  formData.append('signature', params.signature);

  try {
    const res = await fetch(params.uploadUrl, { method: 'POST', body: formData });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      console.error('Cloudinary upload error:', err.slice(0, 200));
      return null;
    }

    const data = await res.json();
    const publicId = String(data.public_id || '');
    const url = String(data.secure_url || '');
    if (!publicId || !url) return null;

    const { data: registration, error: registrationError } = await supabase.functions.invoke('cloudinary-proxy', {
      body: {
        action: 'register-upload',
        publicId,
        resourceType: data.resource_type || resourceType,
        feature: options.feature || 'cloudinary_upload',
        visibility: options.visibility || 'public',
        referenceTable: options.referenceTable || null,
        referenceId: options.referenceId || null,
      },
    });
    if (registrationError || !registration?.success) {
      console.warn('[cloudinary] uploaded asset could not be registered', registrationError || registration?.error);
    }

    const optimized = resourceType === 'image' ? await optimizeUrl(publicId) : null;
    return {
      publicId,
      url,
      optimizedUrl: optimized?.optimizedUrl || url,
      thumbnailUrl: optimized?.thumbnailUrl || url,
      assetId: registration?.assetId || undefined,
      resourceType,
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

export async function deleteFromCloudinary(publicId: string, resourceType: Exclude<CloudinaryResourceType, 'auto'> = 'image'): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke('cloudinary-proxy', {
    body: { action: 'delete', publicId, resourceType },
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
