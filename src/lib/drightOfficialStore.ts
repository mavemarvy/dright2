import { supabase } from './supabase';

export interface DrightOfficialProduct {
  id: string;
  marketplace_product_id: string;
  slug: string;
  name: string;
  subtitle: string | null;
  description: string | null;
  product_type: 'PHYSICAL' | 'DIGITAL' | 'SERVICE' | 'COURSE';
  category: string;
  price: number;
  currency: string;
  affiliate_commission_percent: number;
  image_url: string | null;
  image_urls: string[];
  public_visible: boolean;
  is_enabled: boolean;
  is_featured: boolean;
  official_badge_enabled: boolean;
  official_rating_enabled: boolean;
  official_rating: number;
  benefits: string[];
  created_at?: string;
  updated_at?: string;
}

function normalize(row: Record<string, any>): DrightOfficialProduct {
  return {
    id: String(row.id ?? row.official_product_id ?? ''),
    marketplace_product_id: String(row.marketplace_product_id ?? ''),
    slug: String(row.slug ?? ''),
    name: String(row.name ?? ''),
    subtitle: row.subtitle == null ? null : String(row.subtitle),
    description: row.description == null ? null : String(row.description),
    product_type: String(row.product_type || 'DIGITAL') as DrightOfficialProduct['product_type'],
    category: String(row.category || 'General'),
    price: Number(row.price || 0),
    currency: String(row.currency || 'NGN'),
    affiliate_commission_percent: Number(row.affiliate_commission_percent || 0),
    image_url: row.image_url == null ? null : String(row.image_url),
    image_urls: Array.isArray(row.image_urls) ? row.image_urls.map(String) : [],
    public_visible: row.public_visible !== false,
    is_enabled: row.is_enabled !== false,
    is_featured: row.is_featured === true,
    official_badge_enabled: row.official_badge_enabled !== false,
    official_rating_enabled: row.official_rating_enabled === true,
    official_rating: Number(row.official_rating ?? 5),
    benefits: Array.isArray(row.benefits) ? row.benefits.map(String) : [],
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  };
}

export async function listAdminDrightOfficialProducts(): Promise<DrightOfficialProduct[]> {
  const { data, error } = await supabase.rpc('admin_list_dright_official_products');
  if (error) throw error;
  return Array.isArray(data) ? data.map((row) => normalize(row as Record<string, any>)) : [];
}

export async function fetchPublicDrightOfficialProducts(): Promise<DrightOfficialProduct[]> {
  const { data, error } = await supabase.rpc('get_public_dright_official_products');
  if (error) {
    console.error('Unable to load official DRIGHT products', error);
    return [];
  }
  return Array.isArray(data) ? data.map((row) => normalize(row as Record<string, any>)) : [];
}

export async function createAdminDrightOfficialProduct(input: Record<string, unknown>): Promise<{
  officialProductId: string;
  marketplaceProductId: string;
}> {
  const { data, error } = await supabase.rpc('admin_create_dright_official_product', { p_input: input });
  if (error) throw error;
  const row = (data || {}) as Record<string, unknown>;
  return {
    officialProductId: String(row.official_product_id || ''),
    marketplaceProductId: String(row.marketplace_product_id || ''),
  };
}

export async function updateAdminDrightOfficialProduct(
  officialProductId: string,
  input: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.rpc('admin_update_dright_official_product', {
    p_official_product_id: officialProductId,
    p_input: input,
  });
  if (error) throw error;
}

export async function uploadOfficialProductImages(userId: string, files: File[]): Promise<string[]> {
  const urls: string[] = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    if (!file.type.startsWith('image/')) throw new Error('Official product images must be image files.');
    if (file.size > 8 * 1024 * 1024) throw new Error('Each official product image must be under 8 MB.');
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${userId}/dright-official/${Date.now()}-${index}.${ext}`;
    const { error } = await supabase.storage.from('product-images').upload(path, file, { upsert: false });
    if (error) throw error;
    const { data } = supabase.storage.from('product-images').getPublicUrl(path);
    urls.push(data.publicUrl);
  }
  return urls;
}
