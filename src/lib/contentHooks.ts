import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';
import type {
  HelpCategory, HelpArticle, FaqItem, SupportDepartment,
  TutorialCategory, Tutorial, Challenge, ChallengeProgress,
  LegalPage, PolicyVersion, PermissionInfo,
} from './contentTypes';

// ─── Help Categories ────────────────────────────────────────────────────────────

export function useHelpCategories() {
  const [categories, setCategories] = useState<HelpCategory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase.from('help_categories').select('*').eq('is_deleted', false).order('sort_order');
      setCategories((data || []) as HelpCategory[]);
      setLoading(false);
    };
    load();
  }, []);

  return { categories, loading, setCategories };
}

export async function createHelpCategory(name: string, slug: string, description: string, icon: string) {
  const { data, error } = await supabase.from('help_categories').insert({ name, slug, description, icon }).select().single();
  if (error) throw error;
  return data as HelpCategory;
}

export async function updateHelpCategory(id: string, updates: Partial<HelpCategory>) {
  const { data, error } = await supabase.from('help_categories').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data as HelpCategory;
}

export async function deleteHelpCategory(id: string) {
  await supabase.from('help_categories').update({ is_deleted: true }).eq('id', id);
}

// ─── Help Articles ──────────────────────────────────────────────────────────────

export function useHelpArticles(categoryId?: string) {
  const [articles, setArticles] = useState<HelpArticle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      let query = supabase.from('help_articles').select('*, category:help_categories(*)').eq('is_deleted', false).order('sort_order');
      if (categoryId) query = query.eq('category_id', categoryId);
      const { data } = await query;
      setArticles((data || []) as HelpArticle[]);
      setLoading(false);
    };
    load();
  }, [categoryId]);

  return { articles, loading, setArticles };
}

export function usePublishedHelpArticles(categoryId?: string) {
  const [articles, setArticles] = useState<HelpArticle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      let query = supabase.from('help_articles')
        .select('*, category:help_categories(*)')
        .eq('is_deleted', false).eq('is_published', true).order('sort_order');
      if (categoryId) query = query.eq('category_id', categoryId);
      const { data } = await query;
      setArticles((data || []) as HelpArticle[]);
      setLoading(false);
    };
    load();
  }, [categoryId]);

  return { articles, loading };
}

export async function createHelpArticle(title: string, slug: string, categoryId: string | null) {
  const { data, error } = await supabase.from('help_articles').insert({ title, slug, category_id: categoryId, content: '' }).select().single();
  if (error) throw error;
  return data as HelpArticle;
}

export async function updateHelpArticle(id: string, updates: Partial<HelpArticle>) {
  const { data, error } = await supabase.from('help_articles').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data as HelpArticle;
}

export async function deleteHelpArticle(id: string) {
  await supabase.from('help_articles').update({ is_deleted: true }).eq('id', id);
}

export async function incrementArticleView(id: string) {
  await supabase.rpc('increment_help_article_view', { article_id: id }).then(() => {});
  // Fallback: direct update if RPC doesn't exist
  const { data } = await supabase.from('help_articles').select('view_count').eq('id', id).maybeSingle();
  if (data) await supabase.from('help_articles').update({ view_count: (data.view_count || 0) + 1 }).eq('id', id);
}

// ─── FAQ Items ──────────────────────────────────────────────────────────────────

export function usePublishedFaqs(categoryId?: string) {
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      let query = supabase.from('faq_items').select('*, category:help_categories(*)').eq('is_deleted', false).eq('is_published', true).order('sort_order');
      if (categoryId) query = query.eq('category_id', categoryId);
      const { data } = await query;
      setFaqs((data || []) as FaqItem[]);
      setLoading(false);
    };
    load();
  }, [categoryId]);

  return { faqs, loading };
}

export function useAllFaqs() {
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase.from('faq_items').select('*, category:help_categories(*)').eq('is_deleted', false).order('sort_order');
      setFaqs((data || []) as FaqItem[]);
      setLoading(false);
    };
    load();
  }, []);

  return { faqs, loading, setFaqs };
}

export async function createFaq(question: string, answer: string, categoryId: string | null) {
  const { data, error } = await supabase.from('faq_items').insert({ question, answer, category_id: categoryId }).select().single();
  if (error) throw error;
  return data as FaqItem;
}

export async function updateFaq(id: string, updates: Partial<FaqItem>) {
  const { data, error } = await supabase.from('faq_items').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data as FaqItem;
}

export async function deleteFaq(id: string) {
  await supabase.from('faq_items').update({ is_deleted: true }).eq('id', id);
}

// ─── Support Departments ────────────────────────────────────────────────────────

export function useSupportDepartments() {
  const [departments, setDepartments] = useState<SupportDepartment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase.from('support_departments').select('*').eq('is_deleted', false).order('sort_order');
      setDepartments((data || []) as SupportDepartment[]);
      setLoading(false);
    };
    load();
  }, []);

  return { departments, loading, setDepartments };
}

export async function createDepartment(dept: Partial<SupportDepartment>) {
  const { data, error } = await supabase.from('support_departments').insert(dept).select().single();
  if (error) throw error;
  return data as SupportDepartment;
}

export async function updateDepartment(id: string, updates: Partial<SupportDepartment>) {
  const { data, error } = await supabase.from('support_departments').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data as SupportDepartment;
}

export async function deleteDepartment(id: string) {
  await supabase.from('support_departments').update({ is_deleted: true }).eq('id', id);
}

// ─── Tutorial Categories ────────────────────────────────────────────────────────

export function useTutorialCategories() {
  const [categories, setCategories] = useState<TutorialCategory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase.from('tutorial_categories').select('*').eq('is_deleted', false).order('sort_order');
      setCategories((data || []) as TutorialCategory[]);
      setLoading(false);
    };
    load();
  }, []);

  return { categories, loading, setCategories };
}

export async function createTutorialCategory(name: string, slug: string, description: string) {
  const { data, error } = await supabase.from('tutorial_categories').insert({ name, slug, description }).select().single();
  if (error) throw error;
  return data as TutorialCategory;
}

export async function deleteTutorialCategory(id: string) {
  await supabase.from('tutorial_categories').update({ is_deleted: true }).eq('id', id);
}

// ─── Tutorials ──────────────────────────────────────────────────────────────────

export function usePublishedTutorials(categoryId?: string) {
  const [tutorials, setTutorials] = useState<Tutorial[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      let query = supabase.from('tutorials').select('*, category:tutorial_categories(*)').eq('is_deleted', false).eq('is_published', true).order('sort_order');
      if (categoryId) query = query.eq('category_id', categoryId);
      const { data } = await query;
      setTutorials((data || []) as Tutorial[]);
      setLoading(false);
    };
    load();
  }, [categoryId]);

  return { tutorials, loading };
}

export function useAllTutorials() {
  const [tutorials, setTutorials] = useState<Tutorial[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase.from('tutorials').select('*, category:tutorial_categories(*)').eq('is_deleted', false).order('sort_order');
      setTutorials((data || []) as Tutorial[]);
      setLoading(false);
    };
    load();
  }, []);

  return { tutorials, loading, setTutorials };
}

export async function createTutorial(title: string, slug: string, categoryId: string | null) {
  const { data, error } = await supabase.from('tutorials').insert({ title, slug, category_id: categoryId, content: '' }).select().single();
  if (error) throw error;
  return data as Tutorial;
}

export async function updateTutorial(id: string, updates: Partial<Tutorial>) {
  const { data, error } = await supabase.from('tutorials').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data as Tutorial;
}

export async function deleteTutorial(id: string) {
  await supabase.from('tutorials').update({ is_deleted: true }).eq('id', id);
}

// ─── Challenges ──────────────────────────────────────────────────────────────────

export function usePublishedChallenges() {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase.from('challenges').select('*').eq('is_deleted', false).eq('is_active', true).order('sort_order');
      setChallenges((data || []) as Challenge[]);
      setLoading(false);
    };
    load();
  }, []);

  return { challenges, loading };
}

export function useAllChallenges() {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase.from('challenges').select('*').eq('is_deleted', false).order('sort_order');
      setChallenges((data || []) as Challenge[]);
      setLoading(false);
    };
    load();
  }, []);

  return { challenges, loading, setChallenges };
}

export async function createChallenge(challenge: Partial<Challenge>) {
  const { data, error } = await supabase.from('challenges').insert(challenge).select().single();
  if (error) throw error;
  return data as Challenge;
}

export async function updateChallenge(id: string, updates: Partial<Challenge>) {
  const { data, error } = await supabase.from('challenges').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data as Challenge;
}

export async function deleteChallenge(id: string) {
  await supabase.from('challenges').update({ is_deleted: true }).eq('id', id);
}

// ─── Challenge Progress ─────────────────────────────────────────────────────────

export function useUserChallengeProgress() {
  const [progress, setProgress] = useState<ChallengeProgress[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase.from('challenge_progress').select('*').order('updated_at', { ascending: false });
      setProgress((data || []) as ChallengeProgress[]);
      setLoading(false);
    };
    load();
  }, []);

  return { progress, loading };
}

export async function upsertChallengeProgress(challengeId: string, progress: number, isCompleted: boolean) {
  const { data, error } = await supabase.from('challenge_progress')
    .upsert({ challenge_id: challengeId, progress, is_completed: isCompleted, completed_at: isCompleted ? new Date().toISOString() : null })
    .select().single();
  if (error) throw error;
  return data as ChallengeProgress;
}

// ─── Legal Pages ────────────────────────────────────────────────────────────────

export function usePublishedLegalPages() {
  const [pages, setPages] = useState<LegalPage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase.from('legal_pages').select('*').eq('is_deleted', false).eq('is_published', true).order('title');
      setPages((data || []) as LegalPage[]);
      setLoading(false);
    };
    load();
  }, []);

  return { pages, loading };
}

export function useAllLegalPages() {
  const [pages, setPages] = useState<LegalPage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase.from('legal_pages').select('*').eq('is_deleted', false).order('title');
      setPages((data || []) as LegalPage[]);
      setLoading(false);
    };
    load();
  }, []);

  return { pages, loading, setPages };
}

export async function createLegalPage(title: string, slug: string, pageType: string) {
  const { data, error } = await supabase.from('legal_pages').insert({ title, slug, page_type: pageType, content: '' }).select().single();
  if (error) throw error;
  return data as LegalPage;
}

export async function updateLegalPage(id: string, updates: Partial<LegalPage>) {
  const { data, error } = await supabase.from('legal_pages').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data as LegalPage;
}

export async function deleteLegalPage(id: string) {
  await supabase.from('legal_pages').update({ is_deleted: true }).eq('id', id);
}

export async function saveLegalPageVersion(pageId: string, content: string, changeSummary: string) {
  const { data: page } = await supabase.from('legal_pages').select('version_number').eq('id', pageId).maybeSingle();
  const nextVersion = (page?.version_number || 0) + 1;
  await supabase.from('legal_pages').update({ version_number: nextVersion }).eq('id', pageId);
  const { data, error } = await supabase.from('policy_versions').insert({
    legal_page_id: pageId, version_number: nextVersion, content, change_summary: changeSummary,
  }).select().single();
  if (error) throw error;
  return data as PolicyVersion;
}

export function usePolicyVersions(pageId: string | null) {
  const [versions, setVersions] = useState<PolicyVersion[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!pageId) return;
    setLoading(true);
    const { data } = await supabase.from('policy_versions').select('*').eq('legal_page_id', pageId).order('version_number', { ascending: false });
    setVersions((data || []) as PolicyVersion[]);
    setLoading(false);
  }, [pageId]);

  useEffect(() => { load(); }, [load]);
  return { versions, loading, refetch: load };
}

// ─── Permission Information ─────────────────────────────────────────────────────

export function usePermissionInfo() {
  const [permissions, setPermissions] = useState<PermissionInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase.from('permission_information').select('*').eq('is_deleted', false).order('sort_order');
      setPermissions((data || []) as PermissionInfo[]);
      setLoading(false);
    };
    load();
  }, []);

  return { permissions, loading, setPermissions };
}

export async function updatePermissionInfo(id: string, updates: Partial<PermissionInfo>) {
  const { data, error } = await supabase.from('permission_information').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data as PermissionInfo;
}
