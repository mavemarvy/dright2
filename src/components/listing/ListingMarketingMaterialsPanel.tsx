import { useEffect, useState } from 'react';
import { Copy, ExternalLink, FileText, Image as ImageIcon, Link2, Loader2, Megaphone, Video } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  loadListingMarketingMaterials,
  type ListingMarketingKind,
  type MarketingMaterialDraft,
} from '../../lib/marketingMaterials';

export default function ListingMarketingMaterialsPanel({
  kind,
  listingId,
  title = 'Affiliate marketing kit',
}: {
  kind: ListingMarketingKind;
  listingId: string;
  title?: string;
}) {
  const { user } = useAuth();
  const [materials, setMaterials] = useState<MarketingMaterialDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id || !listingId) {
      setMaterials([]);
      return;
    }
    setLoading(true);
    void loadListingMarketingMaterials(kind, listingId)
      .then(setMaterials)
      .catch(() => setMaterials([]))
      .finally(() => setLoading(false));
  }, [kind, listingId, user?.id]);

  const copy = async (item: MarketingMaterialDraft) => {
    try {
      await navigator.clipboard.writeText(item.url);
      setCopiedKey(item.key);
      window.setTimeout(() => setCopiedKey(null), 1600);
    } catch {
      window.open(item.url, '_blank', 'noopener,noreferrer');
    }
  };

  if (!user?.id) return null;
  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-4 flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading marketing kit…
      </div>
    );
  }
  if (materials.length === 0) return null;

  return (
    <section className="rounded-2xl border border-violet-100 bg-violet-50/50 p-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-violet-600 text-white flex items-center justify-center shrink-0">
          <Megaphone className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-black text-gray-900">{title}</h3>
          <p className="text-xs text-gray-500 mt-1">
            Promotional resources supplied by the listing owner for affiliates and sales partners.
          </p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3 mt-4">
        {materials.map((item) => {
          const Icon = item.material_type === 'VIDEO'
            ? Video
            : ['FLYER','BANNER','IMAGE'].includes(item.material_type)
              ? ImageIcon
              : ['LINK','DRIVE_LINK'].includes(item.material_type)
                ? Link2
                : FileText;
          return (
            <div key={item.key} className="rounded-xl border border-violet-100 bg-white p-3">
              <div className="flex gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-violet-50 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-violet-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-gray-900 truncate">{item.title}</p>
                  <p className="text-[10px] font-black uppercase tracking-wide text-violet-600">{item.material_type.replace(/_/g, ' ')}</p>
                  {item.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{item.description}</p>}
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 min-h-[38px] rounded-lg bg-violet-600 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Open
                </a>
                <button
                  type="button"
                  onClick={() => copy(item)}
                  className="min-h-[38px] px-3 rounded-lg border border-violet-200 text-violet-700 text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5" /> {copiedKey === item.key ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
