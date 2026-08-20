import { supabase } from './supabase';

export interface DraftData {
  // Form fields
  name: string;
  description: string;
  price: string;
  category: string;
  stock: string;
  // Product type & step
  productType: string;
  step: number;
  // Pricing flags
  isFree: boolean;
  adminTaskAgreed: boolean;
  selectedTier: string | null;
  affiliateCommission: string;
  // Digital/Course fields
  deliveryType: string;
  downloadFileUrl: string;
  accessLink: string;
  fileFormat: string;
  downloadLimit: string;
  expiryDays: string;
  includesBonus: boolean;
  demoVideoUrl: string;
  // Service fields
  serviceCategory: string;
  serviceDeliveryDays: string;
  requiresConsultation: boolean;
  hasDrightSalesTeam: boolean;
  // Tiers & customizations (service)
  tiers: Array<Record<string, unknown>>;
  customizations: Array<Record<string, unknown>>;
  // Portfolio
  portfolioLinks: Array<{ platform: string; url: string }>;
  // Image previews (base64 data URLs for offline restore)
  imagePreviews: string[];
}

export interface Draft {
  id: string;
  user_id: string;
  draft_name: string | null;
  draft_data: DraftData;
  status: string;
  created_at: string;
  updated_at: string;
  last_synced_at: string | null;
}

const LOCAL_KEY = 'dright_product_drafts';

// --- localStorage helpers ---

interface LocalDraft {
  id: string;
  draft_name: string | null;
  draft_data: DraftData;
  status: string;
  updated_at: string;
  created_at: string;
  last_synced_at: string | null;
}

function loadLocalDrafts(): Record<string, LocalDraft> {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, LocalDraft>;
  } catch {
    return {};
  }
}

function saveLocalDrafts(drafts: Record<string, LocalDraft>) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(drafts));
  } catch { /* quota — ignore */ }
}

export function saveLocalDraft(draft: LocalDraft) {
  const drafts = loadLocalDrafts();
  drafts[draft.id] = draft;
  saveLocalDrafts(drafts);
}

export function removeLocalDraft(id: string) {
  const drafts = loadLocalDrafts();
  delete drafts[id];
  saveLocalDrafts(drafts);
}

export function getLocalDrafts(): LocalDraft[] {
  return Object.values(loadLocalDrafts());
}

// --- Supabase sync ---

export async function saveDraftToCloud(
  draftId: string,
  draftName: string | null,
  draftData: DraftData,
  userId: string
): Promise<{ error: string | null; updated_at: string }> {
  const now = new Date().toISOString();

  const payload = {
    id: draftId,
    user_id: userId,
    draft_name: draftName,
    draft_data: draftData as unknown as Record<string, unknown>,
    status: 'draft',
    updated_at: now,
    last_synced_at: now,
  };

  const { error } = await supabase
    .from('product_drafts')
    .upsert(payload, { onConflict: 'id' });

  return { error: error?.message ?? null, updated_at: now };
}

export async function fetchCloudDrafts(userId: string): Promise<Draft[]> {
  const { data, error } = await supabase
    .from('product_drafts')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'draft')
    .order('updated_at', { ascending: false });

  if (error || !data) return [];
  return data as Draft[];
}

export async function deleteCloudDraft(draftId: string): Promise<void> {
  await supabase.from('product_drafts').delete().eq('id', draftId);
}

export async function markDraftPublished(draftId: string): Promise<void> {
  await supabase
    .from('product_drafts')
    .update({ status: 'published' })
    .eq('id', draftId);
}

// --- Conflict resolution: merge local + cloud, keep most recently updated ---

export async function syncDrafts(userId: string): Promise<LocalDraft[]> {
  const localDrafts = loadLocalDrafts();

  let cloudDrafts: Draft[] = [];
  try {
    cloudDrafts = await fetchCloudDrafts(userId);
  } catch {
    // Network/RLS error — proceed with local drafts only
  }

  const merged: Record<string, LocalDraft> = { ...localDrafts };

  for (const cloud of cloudDrafts) {
    const local = localDrafts[cloud.id];
    const cloudTime = new Date(cloud.updated_at).getTime();
    const localTime = local ? new Date(local.updated_at).getTime() : 0;

    if (!local || cloudTime > localTime) {
      // Cloud is newer — update local
      merged[cloud.id] = {
        id: cloud.id,
        draft_name: cloud.draft_name,
        draft_data: cloud.draft_data,
        status: cloud.status,
        updated_at: cloud.updated_at,
        created_at: cloud.created_at,
        last_synced_at: cloud.last_synced_at,
      };
    } else if (localTime > cloudTime) {
      // Local is newer — push to cloud
      try {
        await saveDraftToCloud(local.id, local.draft_name, local.draft_data, userId);
      } catch { /* ignore push failure */ }
    }
  }

  // Save merged back to localStorage
  saveLocalDrafts(merged);

  return Object.values(merged)
    .filter(d => d.status === 'draft')
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
}

// --- Combined save: localStorage + Supabase ---

export async function saveDraft(
  draftId: string,
  draftName: string | null,
  draftData: DraftData,
  userId: string
): Promise<{ syncStatus: 'synced' | 'offline'; updated_at: string }> {
  const now = new Date().toISOString();

  // 1. Save to localStorage immediately (preserve created_at for existing drafts)
  const existing = loadLocalDrafts()[draftId];
  const localDraft: LocalDraft = {
    id: draftId,
    draft_name: draftName,
    draft_data: draftData,
    status: 'draft',
    created_at: existing?.created_at ?? now,
    updated_at: now,
    last_synced_at: null,
  };
  saveLocalDraft(localDraft);

  // 2. Save to Supabase
  const { error, updated_at } = await saveDraftToCloud(draftId, draftName, draftData, userId);

  if (error) {
    // Offline — local draft is saved, cloud sync pending
    return { syncStatus: 'offline', updated_at: now };
  }

  // Update local with synced timestamp
  localDraft.last_synced_at = updated_at;
  localDraft.updated_at = updated_at;
  saveLocalDraft(localDraft);

  return { syncStatus: 'synced', updated_at };
}

export function generateDraftId(): string {
  return crypto.randomUUID();
}

export function createDefaultDraftData(): DraftData {
  return {
    name: '',
    description: '',
    price: '',
    category: 'General',
    stock: '',
    productType: 'DIGITAL',
    step: 1,
    isFree: false,
    adminTaskAgreed: false,
    selectedTier: null,
    affiliateCommission: '50',
    deliveryType: 'INSTANT_DOWNLOAD',
    downloadFileUrl: '',
    accessLink: '',
    fileFormat: 'PDF',
    downloadLimit: '5',
    expiryDays: '30',
    includesBonus: false,
    demoVideoUrl: '',
    serviceCategory: 'Writing',
    serviceDeliveryDays: '7',
    requiresConsultation: false,
    hasDrightSalesTeam: false,
    tiers: [],
    customizations: [],
    portfolioLinks: [],
    imagePreviews: [],
  };
}
