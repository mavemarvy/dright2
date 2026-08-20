export interface Role {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string;
  icon: string;
  is_system: boolean;
  is_archived: boolean;
  is_deleted: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Permission {
  id: string;
  module: string;
  action: string;
  label: string;
  description: string | null;
  is_active: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface RolePermission {
  id: string;
  role_id: string;
  permission_id: string;
  created_at: string;
}

export interface AdminPermissionOverride {
  id: string;
  admin_id: string;
  permission_id: string;
  is_granted: boolean;
  granted_by: string | null;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminAgreement {
  id: string;
  admin_id: string;
  agreement_version: string;
  accepted_at: string;
  ip_address: string | null;
  user_agent: string | null;
  pdf_downloaded: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface AdminVerification {
  id: string;
  admin_id: string;
  doc_type: 'government_id' | 'proof_of_address' | 'selfie' | 'other';
  doc_url: string;
  status: 'pending' | 'under_review' | 'verified' | 'rejected';
  reviewer_id: string | null;
  reviewer_notes: string | null;
  reviewed_at: string | null;
  phone_verified: boolean;
  email_verified: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface MarketplaceModerationItem {
  id: string;
  entity_type: 'product' | 'service' | 'job' | 'campaign';
  entity_id: string;
  submitter_id: string | null;
  status: 'pending_review' | 'under_review' | 'approved' | 'rejected' | 'revision_requested';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  moderator_id: string | null;
  rejection_reason: string | null;
  revision_notes: string | null;
  reviewer_notes: string | null;
  submitted_at: string;
  review_started_at: string | null;
  review_completed_at: string | null;
  version: number;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface Badge {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  image_type: 'png' | 'svg' | 'webp' | null;
  display_priority: number;
  target_type: string;
  eligibility_rules: Record<string, unknown>;
  is_active: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface BadgeAssignment {
  id: string;
  badge_id: string;
  user_id: string;
  assigned_by: string | null;
  reason: string | null;
  expires_at: string | null;
  is_active: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface PublishingWorkflowItem {
  id: string;
  entity_type: string;
  entity_id: string;
  status: 'draft' | 'pending_review' | 'approved' | 'published' | 'scheduled' | 'archived' | 'hidden';
  author_id: string | null;
  reviewer_id: string | null;
  publisher_id: string | null;
  review_notes: string | null;
  rejection_reason: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  archived_at: string | null;
  version: number;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface RoleInput {
  name: string;
  slug: string;
  description?: string;
  color?: string;
  icon?: string;
}

export interface BadgeInput {
  name: string;
  slug: string;
  description?: string;
  image_url?: string;
  image_type?: 'png' | 'svg' | 'webp';
  display_priority?: number;
  target_type?: string;
  eligibility_rules?: Record<string, unknown>;
  is_active?: boolean;
}

export const MODERATION_STATUS_LABELS: Record<string, string> = {
  pending_review: 'Pending Review',
  under_review: 'Under Review',
  approved: 'Approved',
  rejected: 'Rejected',
  revision_requested: 'Returned for Revision',
};

export const PUBLISHING_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  pending_review: 'Pending Review',
  approved: 'Approved',
  published: 'Published',
  scheduled: 'Scheduled',
  archived: 'Archived',
  hidden: 'Hidden',
};

export const VERIFICATION_STATUS_LABELS: Record<string, string> = {
  not_submitted: 'Not Submitted',
  pending: 'Pending',
  under_review: 'Under Review',
  verified: 'Verified',
  rejected: 'Rejected',
};

export const ADMIN_AGREEMENT_TEXT = `DRIGHT Administrator Agreement

By accepting this agreement, you acknowledge and agree to the following terms:

1. No Fraud: You will not engage in any fraudulent activity, including but not limited to manipulating transactions, falsifying records, or misrepresenting platform data.

2. No Misuse of Customer Information: You will not access, share, sell, or misuse any customer or user information obtained through your administrative privileges. All user data is confidential and must be handled in accordance with DRIGHT's privacy policies.

3. No Abuse of Administrator Privileges: You will not use your administrative access for personal gain, retaliation, unauthorized surveillance, or any purpose outside your official duties.

4. Compliance with DRIGHT Policies: You will comply with all DRIGHT policies, guidelines, and procedures applicable to administrators, including content moderation standards, user protection rules, and operational protocols.

5. Understanding of Consequences: You understand that violations of this agreement may result in immediate suspension of your administrative access, removal from your role, and where applicable, legal action.

6. Confidentiality: You agree to maintain the confidentiality of all sensitive platform information, including security configurations, user data, and internal processes.

7. Reporting: You agree to report any security concerns, policy violations, or suspicious activity to the Super Admin or Security Manager immediately.

By clicking "Accept," you confirm that you have read, understood, and agree to abide by this agreement.`;
