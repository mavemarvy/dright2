import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { X, Package, Trash2, History } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { formatCurrency } from '../../lib/currency';

interface RecentlyViewedItem { id: string; name: string; price: number; image_url: string | null; is_free: boolean; category: string; }

// Shared with useRecentlyViewed. One browser history, not two competing stores.
const STORAGE_KEY = 'dright_recently_viewed_ids';
const MAX_ITEMS = 12;

function getLocalIds(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch { return []; }
}

function removeFromLocal(id: string) { localStorage.setItem(STORAGE_KEY, JSON.stringify(getLocalIds().filter(itemId => itemId !== id))); }
function clearLocal() { localStorage.setItem(STORAGE_KEY, JSON.stringify([])); }

export default function RecentlyViewedStrip() {
  const { user } = useAuth();
  const [items, setItems] = useState<RecentlyViewedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ids = getLocalIds();
    if (ids.length === 0) { setLoading(false); return; }
    (async () => {
      try {
        const { data } = await supabase.from('products')
          .select('id, name, price, image_url, is_free, category')
          .in('id', ids.slice(0, MAX_ITEMS)).eq('is_active', true).eq('is_hidden', false).eq('approval_status', 'approved');
        const itemMap = new Map((data || []).map((p: RecentlyViewedItem) => [p.id, p]));
        setItems(ids.map(id => itemMap.get(id)).filter(Boolean) as RecentlyViewedItem[]);
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, [user?.id]);

  const handleRemove = (id: string) => { removeFromLocal(id); setItems(prev => prev.filter(item => item.id !== id)); };
  const handleClear = () => { clearLocal(); setItems([]); };
  if (loading || items.length === 0) return null;

  return (
    <div className="mt-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2"><History className="w-5 h-5 text-primary-600" />Recently Viewed</h2>
        <button onClick={handleClear} className="text-sm text-gray-400 hover:text-error font-medium flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" />Clear</button>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-4 snap-x" style={{ scrollbarWidth: 'thin' }}>
        {items.map(item => (
          <div key={item.id} className="shrink-0 w-40 snap-start group relative">
            <button onClick={() => handleRemove(item.id)} className="absolute top-2 right-2 z-10 w-7 h-7 bg-white/90 rounded-full flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white" aria-label="Remove from recently viewed"><X className="w-3.5 h-3.5 text-gray-600" /></button>
            <Link to={`/product/${item.id}`} className="block">
              <div className="w-full h-32 rounded-xl overflow-hidden bg-gray-100 border border-gray-200 mb-2">
                {item.image_url ? <img src={item.image_url} alt={item.name} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform" /> : <div className="w-full h-full flex items-center justify-center"><Package className="w-8 h-8 text-gray-300" /></div>}
              </div>
              <p className="text-sm font-medium text-gray-900 truncate group-hover:text-primary-600 transition-colors">{item.name}</p>
              <p className="text-sm font-bold text-primary-600">{item.is_free ? 'FREE' : formatCurrency(Number(item.price))}</p>
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
