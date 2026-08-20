import { useCmsPage } from '../../lib/cmsHooks';
import { BlockRenderer } from './BlockRenderer';
import SeoHead from '../SeoHead';
import type { ReactNode } from 'react';
import type { CmsBlock } from '../../lib/cmsTypes';

interface CmsPageRendererProps {
  slug: string;
  fallback?: ReactNode;
  fallbackSeoDescription?: string;
}

export function CmsPageRenderer({ slug, fallback, fallbackSeoDescription }: CmsPageRendererProps) {
  const { page, blocks, loading } = useCmsPage(slug);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  // No CMS page found, or not published — render fallback
  if (!page || page.status !== 'published') {
    return <>{fallback}</>;
  }

  // Check page-level scheduling
  const now = new Date();
  if (page.publish_at && new Date(page.publish_at) > now) return <>{fallback}</>;
  if (page.expire_at && new Date(page.expire_at) < now) return <>{fallback}</>;

  // Filter visible blocks
  const visibleBlocks = blocks.filter((b: CmsBlock) => !b.is_hidden && b.status === 'published');

  // If no blocks, render fallback
  if (visibleBlocks.length === 0) return <>{fallback}</>;

  return (
    <div className="min-h-screen">
      <SeoHead
        title={page.meta_title || page.title}
        description={page.meta_description || fallbackSeoDescription || ''}
      />
      {visibleBlocks.map((block: CmsBlock) => (
        <BlockRenderer key={block.id} block={block} />
      ))}
    </div>
  );
}
