import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';
import type { CmsPage, CmsBlock, CmsMedia, CmsPageVersion, CmsNavigation } from './cmsTypes';

// ─── Pages ────────────────────────────────────────────────────────────────────

export function useCmsPages() {
  const [pages, setPages] = useState<CmsPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('cms_pages')
        .select('*')
        .eq('is_deleted', false)
        .order('sort_order', { ascending: true });
      if (err) setError(err.message);
      else setPages(data as CmsPage[]);
      setLoading(false);
    };
    load();
  }, []);

  return { pages, loading, error, setPages };
}

export function useCmsPage(slug: string) {
  const [page, setPage] = useState<CmsPage | null>(null);
  const [blocks, setBlocks] = useState<CmsBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: pageData, error: pageErr } = await supabase
        .from('cms_pages')
        .select('*')
        .eq('slug', slug)
        .eq('is_deleted', false)
        .maybeSingle();

      if (pageErr) { setError(pageErr.message); setLoading(false); return; }
      if (!pageData) { setPage(null); setLoading(false); return; }

      setPage(pageData as CmsPage);

      const { data: blockData, error: blockErr } = await supabase
        .from('cms_blocks')
        .select('*')
        .eq('page_id', pageData.id)
        .eq('is_deleted', false)
        .order('sort_order', { ascending: true });

      if (blockErr) setError(blockErr.message);
      else setBlocks(blockData as CmsBlock[]);

      setLoading(false);
    };
    load();
  }, [slug]);

  return { page, blocks, loading, error, setBlocks };
}

// ─── Blocks ────────────────────────────────────────────────────────────────────

export async function createBlock(pageId: string, blockType: string, sortOrder: number) {
  const { data, error } = await supabase
    .from('cms_blocks')
    .insert({
      page_id: pageId,
      block_type: blockType,
      block_data: {},
      status: 'draft',
      sort_order: sortOrder,
    })
    .select()
    .single();
  if (error) throw error;
  return data as CmsBlock;
}

export async function updateBlock(blockId: string, updates: Partial<CmsBlock>) {
  const { data, error } = await supabase
    .from('cms_blocks')
    .update(updates)
    .eq('id', blockId)
    .select()
    .single();
  if (error) throw error;
  return data as CmsBlock;
}

export async function deleteBlock(blockId: string) {
  const { error } = await supabase
    .from('cms_blocks')
    .update({ is_deleted: true })
    .eq('id', blockId);
  if (error) throw error;
}

export async function duplicateBlock(blockId: string) {
  const { data: original, error: fetchErr } = await supabase
    .from('cms_blocks')
    .select('*')
    .eq('id', blockId)
    .single();
  if (fetchErr) throw fetchErr;

  const { data, error } = await supabase
    .from('cms_blocks')
    .insert({
      page_id: original.page_id,
      block_type: original.block_type,
      block_data: original.block_data,
      title: original.title,
      status: 'draft',
      sort_order: original.sort_order + 1,
    })
    .select()
    .single();
  if (error) throw error;
  return data as CmsBlock;
}

export async function reorderBlocks(_pageId: string, blockIds: string[]) {
  const updates = blockIds.map((id, index) => ({
    id,
    sort_order: index,
  }));

  for (const update of updates) {
    await supabase.from('cms_blocks').update({ sort_order: update.sort_order }).eq('id', update.id);
  }
}

// ─── Pages CRUD ──────────────────────────────────────────────────────────────────

export async function createPage(slug: string, title: string, pageType: string) {
  const { data, error } = await supabase
    .from('cms_pages')
    .insert({ slug, title, page_type: pageType, status: 'draft' })
    .select()
    .single();
  if (error) throw error;
  return data as CmsPage;
}

export async function updatePage(pageId: string, updates: Partial<CmsPage>) {
  const { data, error } = await supabase
    .from('cms_pages')
    .update(updates)
    .eq('id', pageId)
    .select()
    .single();
  if (error) throw error;
  return data as CmsPage;
}

export async function duplicatePage(pageId: string) {
  const { data: original, error: fetchErr } = await supabase
    .from('cms_pages')
    .select('*')
    .eq('id', pageId)
    .single();
  if (fetchErr) throw fetchErr;

  const { data: newPage, error: pageErr } = await supabase
    .from('cms_pages')
    .insert({
      slug: `${original.slug}-copy-${Date.now()}`,
      title: `${original.title} (Copy)`,
      page_type: original.page_type,
      status: 'draft',
      meta_title: original.meta_title,
      meta_description: original.meta_description,
      meta_keywords: original.meta_keywords,
    })
    .select()
    .single();
  if (pageErr) throw pageErr;

  const { data: blocks } = await supabase
    .from('cms_blocks')
    .select('*')
    .eq('page_id', pageId)
    .eq('is_deleted', false);

  if (blocks && blocks.length > 0) {
    for (const block of blocks) {
      await supabase.from('cms_blocks').insert({
        page_id: newPage.id,
        block_type: block.block_type,
        block_data: block.block_data,
        title: block.title,
        status: 'draft',
        sort_order: block.sort_order,
      });
    }
  }

  return newPage as CmsPage;
}

export async function deletePage(pageId: string) {
  const { error } = await supabase
    .from('cms_pages')
    .update({ is_deleted: true })
    .eq('id', pageId);
  if (error) throw error;
}

export async function publishPage(pageId: string) {
  const { error } = await supabase
    .from('cms_pages')
    .update({ status: 'published', published_at: new Date().toISOString() })
    .eq('id', pageId);
  if (error) throw error;

  await supabase
    .from('cms_blocks')
    .update({ status: 'published' })
    .eq('page_id', pageId)
    .eq('is_deleted', false);
}

// ─── Version History ──────────────────────────────────────────────────────────

export async function savePageVersion(pageId: string, changeSummary: string) {
  const { data: page } = await supabase
    .from('cms_pages')
    .select('*')
    .eq('id', pageId)
    .single();
  if (!page) throw new Error('Page not found');

  const { data: blocks } = await supabase
    .from('cms_blocks')
    .select('*')
    .eq('page_id', pageId)
    .eq('is_deleted', false)
    .order('sort_order', { ascending: true });

  const { data: lastVersion } = await supabase
    .from('cms_page_versions')
    .select('version_number')
    .eq('page_id', pageId)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = (lastVersion?.version_number || 0) + 1;

  const { data, error } = await supabase
    .from('cms_page_versions')
    .insert({
      page_id: pageId,
      version_number: nextVersion,
      snapshot: { page, blocks: blocks || [] },
      change_summary: changeSummary,
    })
    .select()
    .single();
  if (error) throw error;
  return data as CmsPageVersion;
}

export function usePageVersions(pageId: string | null) {
  const [versions, setVersions] = useState<CmsPageVersion[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!pageId) return;
    setLoading(true);
    const { data } = await supabase
      .from('cms_page_versions')
      .select('*')
      .eq('page_id', pageId)
      .order('version_number', { ascending: false });
    setVersions((data || []) as CmsPageVersion[]);
    setLoading(false);
  }, [pageId]);

  useEffect(() => { load(); }, [load]);
  return { versions, loading, refetch: load };
}

export async function restoreVersion(versionId: string) {
  const { data: version, error: fetchErr } = await supabase
    .from('cms_page_versions')
    .select('*')
    .eq('id', versionId)
    .single();
  if (fetchErr) throw fetchErr;

  const snapshot = version.snapshot as { page: CmsPage; blocks: CmsBlock[] };

  await supabase
    .from('cms_pages')
    .update({
      title: snapshot.page.title,
      meta_title: snapshot.page.meta_title,
      meta_description: snapshot.page.meta_description,
      meta_keywords: snapshot.page.meta_keywords,
      og_title: snapshot.page.og_title,
      og_description: snapshot.page.og_description,
      og_image: snapshot.page.og_image,
    })
    .eq('id', snapshot.page.id);

  await supabase
    .from('cms_blocks')
    .update({ is_deleted: true })
    .eq('page_id', snapshot.page.id);

  if (snapshot.blocks && snapshot.blocks.length > 0) {
    for (const block of snapshot.blocks) {
      await supabase.from('cms_blocks').insert({
        page_id: snapshot.page.id,
        block_type: block.block_type,
        block_data: block.block_data,
        title: block.title,
        status: block.status,
        sort_order: block.sort_order,
      });
    }
  }
}

// ─── Media Library ──────────────────────────────────────────────────────────────

export function useCmsMedia(folder?: string) {
  const [media, setMedia] = useState<CmsMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      let query = supabase.from('cms_media').select('*').eq('is_deleted', false);
      if (folder) query = query.eq('folder', folder);
      const { data, error: err } = await query.order('created_at', { ascending: false });
      if (err) setError(err.message);
      else setMedia(data as CmsMedia[]);
      setLoading(false);
    };
    load();
  }, [folder]);

  return { media, loading, error, setMedia };
}

export async function uploadMedia(
  file: File,
  folder: string,
  tags: string[] = [],
  altText = ''
): Promise<CmsMedia> {
  const ext = file.name.split('.').pop();
  const path = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from('cms-media')
    .upload(path, file, { upsert: false });
  if (uploadErr) throw uploadErr;

  const { data: urlData } = supabase.storage.from('cms-media').getPublicUrl(path);

  let fileType: CmsMedia['file_type'] = 'document';
  if (file.type.startsWith('image/')) fileType = 'image';
  else if (file.type.startsWith('video/')) fileType = 'video';
  else if (file.type === 'application/pdf') fileType = 'pdf';
  else if (file.type.startsWith('image/svg')) fileType = 'icon';

  const { data, error: dbErr } = await supabase
    .from('cms_media')
    .insert({
      filename: file.name,
      file_url: urlData.publicUrl,
      file_type: fileType,
      mime_type: file.type,
      file_size: file.size,
      folder,
      tags,
      alt_text: altText,
    })
    .select()
    .single();
  if (dbErr) throw dbErr;
  return data as CmsMedia;
}

export async function updateMedia(mediaId: string, updates: Partial<CmsMedia>) {
  const { data, error } = await supabase
    .from('cms_media')
    .update(updates)
    .eq('id', mediaId)
    .select()
    .single();
  if (error) throw error;
  return data as CmsMedia;
}

export async function deleteMedia(mediaId: string) {
  const { error } = await supabase
    .from('cms_media')
    .update({ is_deleted: true })
    .eq('id', mediaId);
  if (error) throw error;
}

// ─── Navigation ──────────────────────────────────────────────────────────────────

export function useCmsNavigation(pageKey: string) {
  const [nav, setNav] = useState<CmsNavigation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('cms_navigation')
        .select('*')
        .eq('page_key', pageKey)
        .order('sort_order', { ascending: true });
      setNav((data || []) as CmsNavigation[]);
      setLoading(false);
    };
    load();
  }, [pageKey]);

  return { nav, loading, setNav };
}

export async function updateNavigationOrder(_pageKey: string, sections: Array<{ id: string; sort_order: number; is_hidden: boolean }>) {
  for (const section of sections) {
    await supabase
      .from('cms_navigation')
      .update({ sort_order: section.sort_order, is_hidden: section.is_hidden })
      .eq('id', section.id);
  }
}

// ─── Button Actions ──────────────────────────────────────────────────────────────

export async function getBlockButtons(blockId: string) {
  const { data, error } = await supabase
    .from('cms_button_actions')
    .select('*')
    .eq('block_id', blockId)
    .eq('is_hidden', false)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data;
}

export async function upsertButton(button: {
  block_id: string | null;
  button_text: string;
  internal_link?: string | null;
  external_link?: string | null;
  open_in_new_tab?: boolean;
  is_hidden?: boolean;
  is_disabled?: boolean;
  button_style?: 'primary' | 'secondary' | 'outline';
  sort_order?: number;
}) {
  const { data, error } = await supabase
    .from('cms_button_actions')
    .insert(button)
    .select()
    .single();
  if (error) throw error;
  return data;
}
