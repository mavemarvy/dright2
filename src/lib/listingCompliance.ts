import { supabase } from './supabase';

export type ListingVerificationStatus = {
  required: boolean;
  eligible: boolean;
  requirement_id?: string;
  rule_key?: string;
  name?: string;
  require_kyc?: boolean;
  kyc_status?: string;
  required_kyc_status?: string[];
  required_document_types?: string[];
  missing_documents?: string[];
  document_must_be_verified?: boolean;
  message?: string | null;
  reasons?: Array<{ code?: string; message?: string }>;
};

export const LISTING_EVIDENCE_LABELS: Record<string, string> = {
  proof_of_purchase: 'Receipt / proof of purchase',
  proof_of_ownership: 'Proof of ownership',
  vehicle_registration: 'Vehicle registration document',
  business_registration: 'Business registration',
  authorization_letter: 'Authorization letter',
  warranty_document: 'Warranty / ownership document',
};

export async function getListingVerificationStatus(
  listingTypeCode: string,
  categoryId: string | null,
  scopeId: string | null,
): Promise<ListingVerificationStatus> {
  if (!categoryId) return { required: false, eligible: true, missing_documents: [], reasons: [] };
  const { data, error } = await supabase.rpc('get_my_listing_verification_status', {
    p_listing_type_code: listingTypeCode,
    p_category_id: categoryId,
    p_scope_id: scopeId,
  });
  if (error) throw error;
  return (data ?? { required: false, eligible: true }) as ListingVerificationStatus;
}

export async function uploadListingEvidence(input: {
  file: File;
  requirementId: string;
  scopeId: string;
  documentType: string;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Authentication required');

  const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(input.file.type)) throw new Error('Use PDF, JPG, PNG or WEBP');
  if (input.file.size <= 0 || input.file.size > 20 * 1024 * 1024) throw new Error('File must be 20MB or smaller');

  const safeName = input.file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${user.id}/${input.scopeId}/${Date.now()}_${crypto.randomUUID()}_${safeName}`;
  const { error: uploadError } = await supabase.storage
    .from('listing-evidence')
    .upload(path, input.file, { upsert: false, contentType: input.file.type });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase.rpc('register_listing_requirement_evidence', {
    p_requirement_id: input.requirementId,
    p_scope_id: input.scopeId,
    p_document_type: input.documentType,
    p_storage_path: path,
    p_original_file_name: input.file.name,
    p_mime_type: input.file.type,
    p_size_bytes: input.file.size,
  });

  if (error) {
    await supabase.storage.from('listing-evidence').remove([path]);
    throw error;
  }
  return data;
}

export function prettyVerificationStatus(status?: string | null) {
  return String(status || 'not_started').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
