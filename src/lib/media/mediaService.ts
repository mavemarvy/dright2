import { supabase } from '../supabase';
import { uploadToCloudinary, type CloudinaryResourceType } from './cloudinary';

export type MediaQualityPreference = 'auto' | 'data_saver' | 'high';
export type VideoQualityPreference = 'auto' | '360p' | '480p' | '720p' | '1080p' | '1440p' | '2160p';
export type MediaVisibility = 'public' | 'private' | 'participants' | 'admin';

export interface MediaStoragePolicy {
  feature: string;
  bucket: string | null;
  provider: 'supabase' | 'cloudinary' | string;
  max_file_size_bytes: number | null;
  allowed_mime_types: string[] | null;
  allowed_extensions: string[] | null;
  max_image_width: number | null;
  max_image_height: number | null;
  max_video_duration_seconds: number | null;
  max_video_height: number | null;
  compression_policy: Record<string, unknown> | null;
  quality_preset: string | null;
  visibility: MediaVisibility;
  enabled: boolean;
  upload_rate_limit_per_hour: number | null;
}

export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

export interface UploadOptions {
  feature: string;
  referenceTable?: string | null;
  referenceId?: string | null;
  visibility?: MediaVisibility;
  cacheControl?: string;
  upsert?: boolean;
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
}

export interface MediaUploadResult {
  provider: string;
  assetId?: string;
  bucket?: string | null;
  path?: string | null;
  publicId?: string;
  url: string;
  bytes: number;
  mimeType: string;
  resumable: boolean;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_PUBLIC_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const POLICY_TTL_MS = 5 * 60 * 1000;
let policyCache: { at: number; rows: MediaStoragePolicy[] } | null = null;

const textEncoder = new TextEncoder();
function b64(value: string) {
  let binary = '';
  for (const b of textEncoder.encode(value)) binary += String.fromCharCode(b);
  return btoa(binary);
}

function extOf(name: string) {
  const ext = name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || '';
  return ext;
}

function safeBaseName(name: string) {
  const stem = name.replace(/\.[^.]*$/, '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
  return stem || 'asset';
}

function inferCloudinaryResourceType(file: File): CloudinaryResourceType {
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('image/')) return 'image';
  return 'raw';
}

function resumableThreshold(policy: MediaStoragePolicy) {
  const raw = policy.compression_policy?.resumable_threshold_bytes;
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : 6 * 1024 * 1024;
}

export async function getMediaPolicies(force = false): Promise<MediaStoragePolicy[]> {
  if (!force && policyCache && Date.now() - policyCache.at < POLICY_TTL_MS) return policyCache.rows;
  const { data, error } = await supabase.from('media_storage_policies').select('*').eq('enabled', true).order('feature');
  if (error) throw error;
  const rows = (data || []) as MediaStoragePolicy[];
  policyCache = { at: Date.now(), rows };
  return rows;
}

export async function getMediaPolicy(feature: string): Promise<MediaStoragePolicy> {
  const policy = (await getMediaPolicies()).find(row => row.feature === feature);
  if (!policy) throw new Error(`Media feature "${feature}" is not configured.`);
  return policy;
}

export function validateMediaFile(file: File, policy: MediaStoragePolicy) {
  if (policy.max_file_size_bytes && file.size > policy.max_file_size_bytes) {
    throw new Error(`File exceeds the configured ${Math.ceil(policy.max_file_size_bytes / 1024 / 1024)} MB limit.`);
  }
  if (policy.allowed_mime_types?.length && !policy.allowed_mime_types.includes(file.type)) {
    throw new Error(`File type ${file.type || 'unknown'} is not allowed for ${policy.feature}.`);
  }
  const ext = extOf(file.name);
  if (policy.allowed_extensions?.length && (!ext || !policy.allowed_extensions.includes(ext))) {
    throw new Error(`.${ext || 'unknown'} files are not allowed for ${policy.feature}.`);
  }
}

async function sessionToken() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const uid = data.session?.user?.id;
  if (!token || !uid) throw new Error('Sign in before uploading media.');
  return { token, uid };
}

function buildObjectPath(uid: string, feature: string, file: File) {
  const ext = extOf(file.name);
  const suffix = ext ? `.${ext}` : '';
  return `${uid}/${feature}/${crypto.randomUUID()}-${safeBaseName(file.name)}${suffix}`;
}

async function registerSupabaseAsset(policy: MediaStoragePolicy, path: string, options: UploadOptions) {
  if (!policy.bucket) return undefined;
  const { data, error } = await supabase.rpc('register_supabase_media_asset', {
    p_feature: policy.feature,
    p_bucket: policy.bucket,
    p_object_path: path,
    p_reference_table: options.referenceTable || null,
    p_reference_id: options.referenceId || null,
    p_visibility: options.visibility || policy.visibility,
  });
  if (error) throw error;
  return String(data || '');
}

async function resolveUrl(policy: MediaStoragePolicy, path: string) {
  if (!policy.bucket) throw new Error('Storage bucket is missing.');
  if (policy.visibility === 'public') return supabase.storage.from(policy.bucket).getPublicUrl(path).data.publicUrl;
  const { data, error } = await supabase.storage.from(policy.bucket).createSignedUrl(path, 10 * 60);
  if (error || !data?.signedUrl) throw error || new Error('Unable to create signed media URL.');
  return data.signedUrl;
}

async function standardSupabaseUpload(file: File, policy: MediaStoragePolicy, path: string, options: UploadOptions) {
  if (!policy.bucket) throw new Error(`No Supabase bucket is configured for ${policy.feature}.`);
  options.onProgress?.({ loaded: 0, total: file.size, percent: 0 });
  const { error } = await supabase.storage.from(policy.bucket).upload(path, file, {
    cacheControl: options.cacheControl || '3600',
    contentType: file.type,
    upsert: Boolean(options.upsert),
  });
  if (error) throw error;
  options.onProgress?.({ loaded: file.size, total: file.size, percent: 100 });
  return false;
}

async function resumableSupabaseUpload(file: File, policy: MediaStoragePolicy, path: string, options: UploadOptions) {
  if (!policy.bucket || !SUPABASE_URL || !SUPABASE_PUBLIC_KEY) throw new Error('Resumable upload is unavailable.');
  const { token } = await sessionToken();
  const endpoint = `${SUPABASE_URL.replace(/\/$/, '')}/storage/v1/upload/resumable`;
  const baseHeaders: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    apikey: SUPABASE_PUBLIC_KEY,
    'Tus-Resumable': '1.0.0',
  };
  const create = await fetch(endpoint, {
    method: 'POST',
    headers: {
      ...baseHeaders,
      'Upload-Length': String(file.size),
      'Upload-Metadata': [
        `bucketName ${b64(policy.bucket)}`,
        `objectName ${b64(path)}`,
        `contentType ${b64(file.type || 'application/octet-stream')}`,
        `cacheControl ${b64(options.cacheControl || '3600')}`,
      ].join(','),
      'x-upsert': options.upsert ? 'true' : 'false',
    },
    signal: options.signal,
  });
  if (!create.ok) throw new Error(`Unable to start resumable upload (${create.status}).`);
  const locationHeader = create.headers.get('Location');
  if (!locationHeader) throw new Error('Resumable upload location was not returned.');
  const location = new URL(locationHeader, endpoint).toString();
  const chunkSize = 6 * 1024 * 1024;
  let offset = 0;
  options.onProgress?.({ loaded: 0, total: file.size, percent: 0 });
  try {
    while (offset < file.size) {
      if (options.signal?.aborted) throw new DOMException('Upload cancelled', 'AbortError');
      const chunk = file.slice(offset, Math.min(offset + chunkSize, file.size));
      let response: Response | null = null;
      let lastError: unknown = null;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          response = await fetch(location, {
            method: 'PATCH',
            headers: { ...baseHeaders, 'Content-Type': 'application/offset+octet-stream', 'Upload-Offset': String(offset) },
            body: chunk,
            signal: options.signal,
          });
          if (response.ok) break;
          lastError = new Error(`Upload chunk failed (${response.status}).`);
        } catch (error) {
          lastError = error;
          if (options.signal?.aborted) throw error;
        }
        await new Promise(resolve => window.setTimeout(resolve, 500 * (2 ** attempt)));
      }
      if (!response?.ok) throw lastError instanceof Error ? lastError : new Error('Resumable upload failed.');
      const next = Number(response.headers.get('Upload-Offset') || offset + chunk.size);
      offset = Number.isFinite(next) && next > offset ? next : offset + chunk.size;
      options.onProgress?.({ loaded: Math.min(offset, file.size), total: file.size, percent: Math.round(Math.min(offset, file.size) / file.size * 100) });
    }
  } catch (error) {
    if (options.signal?.aborted) {
      void fetch(location, { method: 'DELETE', headers: baseHeaders }).catch(() => undefined);
    }
    throw error;
  }
  return true;
}

export async function uploadMedia(file: File, options: UploadOptions): Promise<MediaUploadResult> {
  const policy = await getMediaPolicy(options.feature);
  validateMediaFile(file, policy);
  const { uid } = await sessionToken();

  if (policy.provider === 'cloudinary') {
    const result = await uploadToCloudinary(file, uid, {
      folder: `dright/${policy.feature}`,
      feature: policy.feature,
      visibility: options.visibility || policy.visibility,
      referenceTable: options.referenceTable,
      referenceId: options.referenceId,
      resourceType: inferCloudinaryResourceType(file),
    });
    if (!result) throw new Error('Cloudinary upload is unavailable.');
    options.onProgress?.({ loaded: file.size, total: file.size, percent: 100 });
    return { provider: 'cloudinary', assetId: result.assetId, publicId: result.publicId, url: result.url, bytes: file.size, mimeType: file.type, resumable: false };
  }

  if (policy.provider !== 'supabase') throw new Error(`Provider ${policy.provider} is not configured in this client.`);
  const path = buildObjectPath(uid, policy.feature, file);
  const useResumable = file.size > resumableThreshold(policy);
  let resumable = false;
  try {
    resumable = useResumable ? await resumableSupabaseUpload(file, policy, path, options) : await standardSupabaseUpload(file, policy, path, options);
  } catch (error) {
    const allowDirectFallback = Boolean(policy.compression_policy?.direct_fallback);
    if (!useResumable || !allowDirectFallback || file.size > 50 * 1024 * 1024) throw error;
    resumable = await standardSupabaseUpload(file, policy, path, options);
  }
  const assetId = await registerSupabaseAsset(policy, path, options);
  const url = await resolveUrl(policy, path);
  return { provider: 'supabase', assetId, bucket: policy.bucket, path, url, bytes: file.size, mimeType: file.type, resumable };
}

export async function getUserMediaPreferences() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { mediaQuality: 'auto' as MediaQualityPreference, videoQuality: 'auto' as VideoQualityPreference };
  const { data } = await supabase.from('users').select('media_quality_preference,preferred_video_quality').eq('id', user.id).maybeSingle();
  return {
    mediaQuality: (data?.media_quality_preference || 'auto') as MediaQualityPreference,
    videoQuality: (data?.preferred_video_quality || 'auto') as VideoQualityPreference,
  };
}

export async function saveUserMediaPreferences(mediaQuality: MediaQualityPreference, videoQuality: VideoQualityPreference) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in to save media preferences.');
  const { error } = await supabase.from('users').update({ media_quality_preference: mediaQuality, preferred_video_quality: videoQuality }).eq('id', user.id);
  if (error) throw error;
}

export function getImagePresetWidth(policy: MediaStoragePolicy, preset: 'thumbnail' | 'small' | 'medium' | 'large') {
  const presets = policy.compression_policy?.image_presets as Record<string, unknown> | undefined;
  const value = Number(presets?.[preset]);
  return Number.isFinite(value) && value > 0 ? value : ({ thumbnail: 200, small: 480, medium: 960, large: 1600 } as const)[preset];
}
