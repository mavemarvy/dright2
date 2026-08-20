export interface KycProvider {
  id: string;
  name: string;
  slug: string;
  display_name: string | null;
  description: string | null;
  provider_type: 'manual' | 'automated';
  is_enabled: boolean;
  is_system: boolean;
  config_schema: Record<string, unknown>;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface KycProviderSetting {
  id: string;
  provider_id: string;
  is_connected: boolean;
  is_enabled: boolean;
  is_active: boolean;
  api_key: string | null;
  secret_key: string | null;
  webhook_secret: string | null;
  mode: 'sandbox' | 'production';
  health_status: 'unknown' | 'healthy' | 'degraded' | 'down';
  last_sync_at: string | null;
  last_error: string | null;
  error_log: { timestamp: string; error: string }[];
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface KycRule {
  id: string;
  user_type: string;
  is_required: boolean;
  required_for_action: string | null;
  description: string | null;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface KycProfile {
  id: string;
  user_id: string;
  user_type: string;
  status: KycStatus;
  provider_id: string | null;
  verification_level: string;
  expires_at: string | null;
  last_reviewed_at: string | null;
  reviewer_id: string | null;
  notes: string | null;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface KycSubmission {
  id: string;
  profile_id: string;
  user_id: string;
  status: 'pending' | 'under_review' | 'approved' | 'rejected' | 'more_info_required';
  provider_id: string | null;
  provider_reference: string | null;
  provider_result: Record<string, unknown> | null;
  reviewer_id: string | null;
  reviewer_notes: string | null;
  rejection_reason: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  version: number;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface KycDocument {
  id: string;
  submission_id: string;
  user_id: string;
  doc_type: string;
  doc_url: string;
  doc_name: string | null;
  doc_mime_type: string | null;
  doc_size_bytes: number | null;
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'replaced';
  expires_at: string | null;
  replaced_by: string | null;
  reviewer_id: string | null;
  reviewer_notes: string | null;
  version: number;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface KycReview {
  id: string;
  submission_id: string;
  reviewer_id: string;
  action: 'approved' | 'rejected' | 'more_info_requested' | 'note_added';
  notes: string | null;
  internal_notes: string | null;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface KycAuditLog {
  id: string;
  user_id: string | null;
  admin_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  ip_address: string | null;
  device_info: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export type KycStatus =
  | 'not_started'
  | 'pending_submission'
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'more_info_required'
  | 'expired';

export const KYC_STATUS_LABELS: Record<string, string> = {
  not_started: 'Not Started',
  pending_submission: 'Pending Submission',
  submitted: 'Submitted',
  under_review: 'Under Review',
  approved: 'Approved',
  rejected: 'Rejected',
  more_info_required: 'More Information Required',
  expired: 'Expired',
};

export const KYC_DOC_TYPES = [
  { value: 'government_id', label: 'Government-issued ID' },
  { value: 'passport', label: 'Passport' },
  { value: 'drivers_license', label: "Driver's License" },
  { value: 'national_id', label: 'National ID' },
  { value: 'proof_of_address', label: 'Proof of Address' },
  { value: 'utility_bill', label: 'Utility Bill' },
  { value: 'bank_statement', label: 'Bank Statement (optional)' },
  { value: 'selfie', label: 'Selfie (optional)' },
  { value: 'other', label: 'Additional Supporting Document' },
];

export const KYC_DOC_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  KYC_DOC_TYPES.map((d) => [d.value, d.label])
);

export const KYC_REVIEW_ESTIMATE =
  'Verification reviews typically take a few hours and may take up to 7 days, depending on submission volume.';

export const USER_TYPES = [
  'buyer', 'seller', 'vendor', 'affiliate', 'employer',
  'service_provider', 'campaign_creator', 'admin',
];

export const USER_TYPE_LABELS: Record<string, string> = {
  buyer: 'Buyer',
  seller: 'Seller',
  vendor: 'Vendor',
  affiliate: 'Affiliate',
  employer: 'Employer',
  service_provider: 'Service Provider',
  campaign_creator: 'Campaign Creator',
  admin: 'Administrator',
};
