import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';
import type {
  Role,
  Permission,
  AdminPermissionOverride,
  AdminAgreement,
  AdminVerification,
  MarketplaceModerationItem,
  Badge,
  BadgeAssignment,
  PublishingWorkflowItem,
  RoleInput,
  BadgeInput,
} from './rbacTypes';

const ensure = <T,>(data: T | null | undefined, fallback: T): T => data ?? fallback;

// ─── Roles ────────────────────────────────────────────────────────────
export function useRoles() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('roles')
      .select('*')
      .eq('is_deleted', false)
      .order('is_system', { ascending: false })
      .order('name', { ascending: true });
    if (error) setError(error.message);
    else {
      setRoles(ensure(data, []));
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void fetch(); }, [fetch]);
  return { roles, loading, error, refetch: fetch };
}

export async function createRole(input: RoleInput): Promise<Role | null> {
  const { data, error } = await supabase
    .from('roles')
    .insert({
      name: input.name,
      slug: input.slug,
      description: input.description ?? null,
      color: input.color ?? '#6366f1',
      icon: input.icon ?? 'Shield',
      is_system: false,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateRole(id: string, input: Partial<RoleInput>): Promise<void> {
  const { error } = await supabase.from('roles').update({
    ...input,
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw error;
}

export async function cloneRole(roleId: string, newName: string, newSlug: string): Promise<Role | null> {
  const { data: role } = await supabase.from('roles').select('*').eq('id', roleId).single();
  if (!role) throw new Error('Role not found');
  const { data: newRole, error: createErr } = await supabase.from('roles').insert({
    name: newName,
    slug: newSlug,
    description: role.description,
    color: role.color,
    icon: role.icon,
    is_system: false,
  }).select().single();
  if (createErr) throw createErr;
  const { data: perms } = await supabase.from('role_permissions').select('permission_id').eq('role_id', roleId);
  if (perms && perms.length > 0 && newRole) {
    const rows = perms.map((p: { permission_id: string }) => ({ role_id: newRole.id, permission_id: p.permission_id }));
    const { error: permErr } = await supabase.from('role_permissions').insert(rows);
    if (permErr) throw permErr;
  }
  return newRole;
}

export async function archiveRole(id: string): Promise<void> {
  const { error } = await supabase.from('roles').update({ is_archived: true, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function restoreRole(id: string): Promise<void> {
  const { error } = await supabase.from('roles').update({ is_archived: false, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function deleteRole(id: string): Promise<void> {
  const { error } = await supabase.from('roles').update({ is_deleted: true, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

// ─── Permissions ───────────────────────────────────────────────────────
export function usePermissions() {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('permissions')
      .select('*')
      .eq('is_deleted', false)
      .order('module', { ascending: true })
      .order('action', { ascending: true });
    if (error) setError(error.message);
    else {
      setPermissions(ensure(data, []));
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void fetch(); }, [fetch]);
  return { permissions, loading, error, refetch: fetch };
}

export function useRolePermissions(roleId: string | null) {
  const [permissionIds, setPermissionIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!roleId) { setPermissionIds(new Set()); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('role_permissions')
      .select('permission_id')
      .eq('role_id', roleId);
    if (!error && data) {
      setPermissionIds(new Set(data.map((r: { permission_id: string }) => r.permission_id)));
    }
    setLoading(false);
  }, [roleId]);

  useEffect(() => { void fetch(); }, [fetch]);
  return { permissionIds, loading, refetch: fetch, setPermissionIds };
}

export async function setRolePermissions(roleId: string, permissionIds: string[]): Promise<void> {
  await supabase.from('role_permissions').delete().eq('role_id', roleId);
  if (permissionIds.length > 0) {
    const rows = permissionIds.map((pid) => ({ role_id: roleId, permission_id: pid }));
    const { error } = await supabase.from('role_permissions').insert(rows);
    if (error) throw error;
  }
}

// ─── Admin Permission Overrides ───────────────────────────────────────
export function useAdminPermissions(adminId: string | null) {
  const [overrides, setOverrides] = useState<AdminPermissionOverride[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!adminId) { setOverrides([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('admin_permissions')
      .select('*')
      .eq('admin_id', adminId);
    if (!error && data) setOverrides(ensure(data, []));
    setLoading(false);
  }, [adminId]);

  useEffect(() => { void fetch(); }, [fetch]);
  return { overrides, loading, refetch: fetch };
}

export async function grantAdminPermission(adminId: string, permissionId: string, reason?: string): Promise<void> {
  const { error } = await supabase.from('admin_permissions').upsert({
    admin_id: adminId,
    permission_id: permissionId,
    is_granted: true,
    reason: reason ?? null,
  }, { onConflict: 'admin_id,permission_id' });
  if (error) throw error;
}

export async function revokeAdminPermission(adminId: string, permissionId: string): Promise<void> {
  const { error } = await supabase.from('admin_permissions').delete()
    .eq('admin_id', adminId).eq('permission_id', permissionId);
  if (error) throw error;
}

// ─── Admin Agreements ─────────────────────────────────────────────────
export function useAdminAgreements(adminId: string | null) {
  const [agreements, setAgreements] = useState<AdminAgreement[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!adminId) { setAgreements([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('admin_agreements')
      .select('*')
      .eq('admin_id', adminId)
      .eq('is_deleted', false)
      .order('accepted_at', { ascending: false });
    if (!error && data) setAgreements(ensure(data, []));
    setLoading(false);
  }, [adminId]);

  useEffect(() => { void fetch(); }, [fetch]);
  return { agreements, loading, refetch: fetch };
}

export async function acceptAgreement(adminId: string, pdfDownloaded: boolean): Promise<void> {
  const { error } = await supabase.from('admin_agreements').insert({
    admin_id: adminId,
    agreement_version: 'v1.0',
    pdf_downloaded: pdfDownloaded,
  });
  if (error) throw error;
  const { error: uerr } = await supabase.from('users').update({ agreement_accepted: true }).eq('id', adminId);
  if (uerr) throw uerr;
}

// ─── Admin Verifications ──────────────────────────────────────────────
export function useAdminVerifications(adminId: string | null) {
  const [verifications, setVerifications] = useState<AdminVerification[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!adminId) { setVerifications([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('admin_verifications')
      .select('*')
      .eq('admin_id', adminId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });
    if (!error && data) setVerifications(ensure(data, []));
    setLoading(false);
  }, [adminId]);

  useEffect(() => { void fetch(); }, [fetch]);
  return { verifications, loading, refetch: fetch };
}

export async function submitVerification(adminId: string, docType: AdminVerification['doc_type'], docUrl: string): Promise<void> {
  const { error } = await supabase.from('admin_verifications').insert({
    admin_id: adminId,
    doc_type: docType,
    doc_url: docUrl,
    status: 'pending',
  });
  if (error) throw error;
  const { error: uerr } = await supabase.from('users').update({ verification_status: 'pending' }).eq('id', adminId);
  if (uerr) throw uerr;
}

export async function reviewVerification(verificationId: string, status: AdminVerification['status'], notes: string): Promise<void> {
  const { error } = await supabase.from('admin_verifications').update({
    status,
    reviewer_notes: notes,
    reviewed_at: new Date().toISOString(),
  }).eq('id', verificationId);
  if (error) throw error;
}

// ─── Marketplace Moderation ───────────────────────────────────────────
export function useMarketplaceModeration(statusFilter?: string) {
  const [items, setItems] = useState<MarketplaceModerationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('marketplace_moderation').select('*').eq('is_deleted', false);
    if (statusFilter) query = query.eq('status', statusFilter);
    query = query.order('submitted_at', { ascending: false });
    const { data, error } = await query;
    if (error) setError(error.message);
    else { setItems(ensure(data, [])); setError(null); }
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { void fetch(); }, [fetch]);
  return { items, loading, error, refetch: fetch };
}

export async function updateModerationItem(id: string, updates: Partial<MarketplaceModerationItem>): Promise<void> {
  const { error } = await supabase.from('marketplace_moderation').update({
    ...updates,
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw error;
}

// ─── Badges ────────────────────────────────────────────────────────────
export function useBadges() {
  const [badges, setBadges] = useState<Badge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('badges')
      .select('*')
      .eq('is_deleted', false)
      .order('display_priority', { ascending: false });
    if (error) setError(error.message);
    else { setBadges(ensure(data, [])); setError(null); }
    setLoading(false);
  }, []);

  useEffect(() => { void fetch(); }, [fetch]);
  return { badges, loading, error, refetch: fetch };
}

export async function createBadge(input: BadgeInput): Promise<Badge | null> {
  const { data, error } = await supabase.from('badges').insert({
    name: input.name,
    slug: input.slug,
    description: input.description ?? null,
    image_url: input.image_url ?? null,
    image_type: input.image_type ?? null,
    display_priority: input.display_priority ?? 0,
    target_type: input.target_type ?? 'any',
    eligibility_rules: input.eligibility_rules ?? {},
    is_active: input.is_active ?? true,
  }).select().single();
  if (error) throw error;
  return data;
}

export async function updateBadge(id: string, input: Partial<BadgeInput>): Promise<void> {
  const { error } = await supabase.from('badges').update({
    ...input,
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw error;
}

export async function deleteBadge(id: string): Promise<void> {
  const { error } = await supabase.from('badges').update({ is_deleted: true, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

// ─── Badge Assignments ─────────────────────────────────────────────────
export function useBadgeAssignments(badgeId?: string) {
  const [assignments, setAssignments] = useState<BadgeAssignment[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('badge_assignments').select('*').eq('is_deleted', false);
    if (badgeId) query = query.eq('badge_id', badgeId);
    query = query.order('created_at', { ascending: false });
    const { data, error } = await query;
    if (!error && data) setAssignments(ensure(data, []));
    setLoading(false);
  }, [badgeId]);

  useEffect(() => { void fetch(); }, [fetch]);
  return { assignments, loading, refetch: fetch };
}

export async function assignBadge(badgeId: string, userId: string, reason?: string): Promise<void> {
  const { error } = await supabase.from('badge_assignments').upsert({
    badge_id: badgeId,
    user_id: userId,
    reason: reason ?? null,
    is_active: true,
  }, { onConflict: 'badge_id,user_id' });
  if (error) throw error;
}

export async function revokeBadge(assignmentId: string): Promise<void> {
  const { error } = await supabase.from('badge_assignments').update({ is_active: false, is_deleted: true }).eq('id', assignmentId);
  if (error) throw error;
}

// ─── Publishing Workflow ───────────────────────────────────────────────
export function usePublishingWorkflow(statusFilter?: string) {
  const [items, setItems] = useState<PublishingWorkflowItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('publishing_workflow').select('*').eq('is_deleted', false);
    if (statusFilter) query = query.eq('status', statusFilter);
    query = query.order('updated_at', { ascending: false });
    const { data, error } = await query;
    if (!error && data) setItems(ensure(data, []));
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { void fetch(); }, [fetch]);
  return { items, loading, refetch: fetch };
}

export async function updatePublishingStatus(id: string, status: PublishingWorkflowItem['status'], notes?: string): Promise<void> {
  const updates: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (notes) updates.review_notes = notes;
  if (status === 'published') updates.published_at = new Date().toISOString();
  if (status === 'archived') updates.archived_at = new Date().toISOString();
  const { error } = await supabase.from('publishing_workflow').update(updates).eq('id', id);
  if (error) throw error;
}

// ─── Admin Activation Workflow (server-side via SECURITY DEFINER RPCs) ──
export async function activateAdmin(userId: string, roleId: string): Promise<void> {
  const { error } = await supabase.rpc('activate_admin', {
    p_target_id: userId,
    p_rbac_role_id: roleId || null,
  });
  if (error) throw error;
}

export async function setAdminPending(userId: string): Promise<void> {
  const { error } = await supabase.rpc('set_admin_pending', { p_target_id: userId });
  if (error) throw error;
}

export async function suspendAdmin(userId: string): Promise<void> {
  const { error } = await supabase.rpc('suspend_admin', { p_target_id: userId });
  if (error) throw error;
}

export async function rejectAdmin(userId: string): Promise<void> {
  const { error } = await supabase.rpc('reject_admin', { p_target_id: userId });
  if (error) throw error;
}
