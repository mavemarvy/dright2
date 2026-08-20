import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Loader2, FileText, ArrowLeft, History, X } from 'lucide-react';
import SeoHead from '../components/SeoHead';
import { supabase } from '../lib/supabase';
import type { LegalPage, PolicyVersion } from '../lib/contentTypes';
import { LEGAL_PAGE_TYPES } from '../lib/contentTypes';

export function LegalPagesListPage() {
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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <SeoHead title="Legal & Policies" description="DRIGHT terms, policies, and agreements." canonical="/legal" />
      <div className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Legal & Policies</h1>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 text-blue-500 animate-spin" /></div>
        ) : pages.length === 0 ? (
          <p className="text-gray-400">No legal pages published yet.</p>
        ) : (
          <div className="space-y-2">
            {pages.map(page => {
              const typeInfo = LEGAL_PAGE_TYPES.find(t => t.value === page.page_type);
              return (
                <Link
                  key={page.id}
                  to={`/legal/${page.slug}`}
                  className="flex items-center gap-3 p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 hover:shadow-md transition-shadow"
                >
                  <FileText className="w-5 h-5 text-gray-400" />
                  <div className="flex-1">
                    <h3 className="font-medium text-gray-900 dark:text-white text-sm">{page.title}</h3>
                    <p className="text-xs text-gray-400">{typeInfo?.label || page.page_type}</p>
                  </div>
                  <span className="text-xs text-gray-400">v{page.version_number}</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function LegalPageDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [page, setPage] = useState<LegalPage | null>(null);
  const [versions, setVersions] = useState<PolicyVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showVersions, setShowVersions] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!slug) return;
      setLoading(true);
      const { data: pageData } = await supabase.from('legal_pages').select('*').eq('slug', slug).eq('is_deleted', false).eq('is_published', true).maybeSingle();
      setPage(pageData as LegalPage | null);

      if (pageData) {
        const { data: versionData } = await supabase.from('policy_versions').select('*').eq('legal_page_id', pageData.id).order('version_number', { ascending: false });
        setVersions((versionData || []) as PolicyVersion[]);
      }
      setLoading(false);
    };
    load();
  }, [slug]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 text-blue-500 animate-spin" /></div>;
  if (!page) return <div className="min-h-screen flex items-center justify-center text-gray-400">Page not found</div>;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <SeoHead title={page.title} description={`${page.title} — DRIGHT`} canonical={`/legal/${page.slug}`} />
      <div className="max-w-3xl mx-auto px-4 py-12">
        <Link to="/legal" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"><ArrowLeft className="w-4 h-4" /> All Legal Pages</Link>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{page.title}</h1>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">Version {page.version_number}</span>
            <button onClick={() => setShowVersions(!showVersions)} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"><History className="w-4 h-4" /> History</button>
          </div>
        </div>

        {showVersions && (
          <div className="mb-6 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-gray-900 dark:text-white text-sm">Version History</h3>
              <button onClick={() => setShowVersions(false)} className="p-1 text-gray-400"><X className="w-4 h-4" /></button>
            </div>
            {versions.length === 0 ? <p className="text-xs text-gray-400">No version history yet.</p> : (
              <div className="space-y-2">
                {versions.map(v => (
                  <div key={v.id} className="flex items-center justify-between text-xs p-2 rounded-lg border border-gray-100 dark:border-gray-700">
                    <div><span className="font-medium text-gray-700 dark:text-gray-300">v{v.version_number}</span><span className="text-gray-400 ml-2">{new Date(v.created_at).toLocaleDateString()}</span></div>
                    {v.change_summary && <span className="text-gray-400">{v.change_summary}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 sm:p-8">
          <div className="prose prose-sm sm:prose-base dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: page.content }} />
        </div>

        <p className="text-xs text-gray-400 mt-6 text-center">Last updated: {new Date(page.updated_at).toLocaleDateString()}</p>
      </div>
    </div>
  );
}
