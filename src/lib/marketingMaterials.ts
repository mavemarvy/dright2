import { supabase } from './supabase';

export type ListingMarketingKind = 'product' | 'job' | 'task' | 'official_product';
export type MarketingMaterialType =
  | 'PDF' | 'LINK' | 'DRIVE_LINK' | 'FLYER' | 'BANNER' | 'IMAGE' | 'VIDEO' | 'OTHER';

export interface MarketingMaterialDraft {
  key: string;
  material_type: MarketingMaterialType;
  title: string;
  description: string;
  url: string;
  file?: File | null;
  existing_storage_path?: string | null;
}

export interface MarketingMaterialRecord {
  id: string;
  material_type: MarketingMaterialType;
  title: string;
  description: string | null;
  url: string;
  storage_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  sort_order: number;
}

export function newMarketingMaterialDraft(
  type: MarketingMaterialType = 'LINK',
): MarketingMaterialDraft {
  return {
    key: typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : String(Date.now()) + Math.random().toString(36).slice(2),
    material_type: type,
    title: '',
    description: '',
    url: '',
    file: null,
    existing_storage_path: null,
  };
}

export function inferMarketingMaterialType(file: File): MarketingMaterialType {
  const lower = file.name.toLowerCase();
  if (file.type === 'application/pdf' || lower.endsWith('.pdf')) return 'PDF';
  if (file.type.startsWith('video/')) return 'VIDEO';
  if (file.type.startsWith('image/')) return 'FLYER';
  return 'OTHER';
}

function safeFileName(value: string): string {
  const cleaned = value.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned.slice(-120) || 'marketing-material';
}

export async function loadListingMarketingMaterials(
  kind: ListingMarketingKind,
  listingId: string,
): Promise<MarketingMaterialDraft[]> {
  const { data, error } = await supabase.rpc('get_listing_marketing_materials', {
    p_listing_kind: kind,
    p_listing_id: listingId,
  });
  if (error) throw error;
  return ((data || []) as MarketingMaterialRecord[]).map((row) => ({
    key: row.id,
    material_type: row.material_type,
    title: row.title,
    description: row.description || '',
    url: row.url,
    file: null,
    existing_storage_path: row.storage_path,
  }));
}

export async function persistListingMarketingMaterials(input: {
  kind: ListingMarketingKind;
  listingId: string;
  ownerId: string;
  materials: MarketingMaterialDraft[];
}): Promise<number> {
  const normalized: Array<Record<string, unknown>> = [];

  for (let index = 0; index < input.materials.length; index += 1) {
    const material = input.materials[index];
    let url = material.url.trim();
    let storagePath: string | null = material.existing_storage_path || null;
    let fileName: string | null = null;
    let mimeType: string | null = null;

    if (material.file) {
      if (material.file.size > 50 * 1024 * 1024) {
        throw new Error(`${material.file.name} is larger than the 50 MB marketing-material limit.`);
      }
      fileName = material.file.name;
      mimeType = material.file.type || null;
      const path = [
        input.ownerId,
        input.kind,
        input.listingId,
        String(Date.now()) + '-' + String(index) + '-' + safeFileName(material.file.name),
      ].join('/');

      const { error: uploadError } = await supabase.storage
        .from('listing-marketing-materials')
        .upload(path, material.file, { upsert: false });
      if (uploadError) throw uploadError;

      const { data: publicUrl } = supabase.storage
        .from('listing-marketing-materials')
        .getPublicUrl(path);
      url = publicUrl.publicUrl;
      storagePath = path;
    }

    if (!url) continue;

    normalized.push({
      material_type: material.material_type,
      title: material.title.trim() || fileName || 'Marketing material',
      description: material.description.trim() || null,
      url,
      storage_path: storagePath,
      file_name: fileName,
      mime_type: mimeType,
      sort_order: index,
      is_active: true,
    });
  }

  const { data, error } = await supabase.rpc('replace_listing_marketing_materials', {
    p_listing_kind: input.kind,
    p_listing_id: input.listingId,
    p_materials: normalized,
  });
  if (error) throw error;
  return Number((data as Record<string, unknown> | null)?.count ?? normalized.length);
}
