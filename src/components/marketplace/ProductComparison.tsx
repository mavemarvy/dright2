import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  GitCompare, X, Check, Package, Star, Download, BadgeCheck,
  ShoppingCart, Trash2, ChevronRight,
} from 'lucide-react';
import { formatCurrency } from '../../lib/currency';

export interface ComparisonProduct {
  id: string;
  name: string;
  price: number;
  is_free: boolean;
  image_url: string | null;
  category: string;
  product_type: string;
  average_rating: number;
  total_reviews: number;
  total_sales: number;
  seller_name: string;
  store_name: string | null;
  seller_verified: boolean;
  specifications: Record<string, string> | null;
  commission_rate: number;
  stock_quantity: number | null;
}

const STORAGE_KEY = 'dright_compare_list';

export function useComparisonList() {
  const [productIds, setProductIds] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setProductIds(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  const persist = (ids: string[]) => {
    setProductIds(ids);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    } catch { /* ignore */ }
  };

  const addToCompare = (id: string) => {
    if (productIds.includes(id)) return;
    if (productIds.length >= 4) return;
    persist([...productIds, id]);
  };

  const removeFromCompare = (id: string) => {
    persist(productIds.filter(pid => pid !== id));
  };

  const toggleCompare = (id: string) => {
    if (productIds.includes(id)) {
      removeFromCompare(id);
    } else {
      addToCompare(id);
    }
  };

  const clearAll = () => persist([]);

  return { productIds, addToCompare, removeFromCompare, toggleCompare, clearAll };
}

export function ComparisonBar({
  products, onRemove, onClear, onCompare,
}: {
  products: ComparisonProduct[];
  onRemove: (id: string) => void;
  onClear: () => void;
  onCompare: () => void;
}) {
  if (products.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        exit={{ y: 100 }}
        className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-2xl"
      >
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <span className="text-sm font-semibold text-gray-700 flex items-center gap-1.5 shrink-0">
            <GitCompare className="w-4 h-4 text-primary-600" />
            Compare ({products.length}/4)
          </span>
          <div className="flex items-center gap-2 flex-1 overflow-x-auto">
            {products.map(p => (
              <div key={p.id} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-1.5 shrink-0">
                {p.image_url ? (
                  <img src={p.image_url} alt="" className="w-8 h-8 rounded-lg object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-gray-200 flex items-center justify-center">
                    <Package className="w-4 h-4 text-gray-400" />
                  </div>
                )}
                <span className="text-xs font-medium text-gray-700 max-w-[100px] truncate">{p.name}</span>
                <button onClick={() => onRemove(p.id)} className="p-0.5 text-gray-400 hover:text-error">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={onClear} className="text-sm text-gray-400 hover:text-error flex items-center gap-1">
              <Trash2 className="w-3.5 h-3.5" /> Clear
            </button>
            <button
              onClick={onCompare}
              disabled={products.length < 2}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white rounded-xl text-sm font-semibold hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              Compare <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export function CompareButton({
  productId, isInList, onToggle,
}: {
  productId: string;
  isInList: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <button
      onClick={() => onToggle(productId)}
      className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
        isInList ? 'bg-primary-50 text-primary-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
      title={isInList ? 'Remove from compare' : 'Add to compare'}
    >
      <GitCompare className="w-4 h-4" />
      {isInList ? 'In Compare' : 'Compare'}
    </button>
  );
}

export function CompareTable({ products }: { products: ComparisonProduct[] }) {
  
  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-24 h-24 bg-gray-100 rounded-3xl flex items-center justify-center mb-5">
          <GitCompare className="w-12 h-12 text-gray-300" />
        </div>
        <h3 className="text-xl font-bold text-gray-900 mb-2">No products to compare</h3>
        <p className="text-gray-500 mb-6">Add products to compare using the Compare button on product pages.</p>
        <Link to="/market" className="px-6 py-3 bg-primary-600 text-white rounded-xl font-semibold hover:bg-primary-700">
          Browse Marketplace
        </Link>
      </div>
    );
  }

  const allSpecKeys = new Set<string>();
  products.forEach(p => {
    if (p.specifications) Object.keys(p.specifications).forEach(k => allSpecKeys.add(k));
  });

  const rows: Array<{ label: string; render: (p: ComparisonProduct) => React.ReactNode }> = [
    { label: 'Price', render: p => p.is_free ? <span className="text-success font-bold">FREE</span> : <span className="font-bold text-gray-900">{formatCurrency(p.price)}</span> },
    { label: 'Category', render: p => p.category },
    { label: 'Type', render: p => (
      <span className="inline-flex items-center gap-1 text-xs bg-gray-100 rounded-full px-2 py-0.5">
        {p.product_type === 'DIGITAL' && <Download className="w-3 h-3" />}
        {p.product_type}
      </span>
    ) },
    { label: 'Rating', render: p => p.average_rating > 0 ? (
      <span className="flex items-center gap-1">
        <Star className="w-3.5 h-3.5 fill-warning text-warning" />
        {p.average_rating.toFixed(1)} ({p.total_reviews})
      </span>
    ) : 'No ratings' },
    { label: 'Total Sales', render: p => `${p.total_sales} sold` },
    { label: 'Seller', render: p => (
      <span className="flex items-center gap-1">
        {p.seller_name}
        {p.seller_verified && <BadgeCheck className="w-4 h-4 text-blue-500" />}
      </span>
    ) },
    { label: 'Store', render: p => p.store_name || '—' },
    { label: 'Commission', render: p => `${p.commission_rate}%` },
    { label: 'Stock', render: p => p.stock_quantity !== null ? `${p.stock_quantity} left` : 'Unlimited' },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="sticky left-0 bg-white z-10 px-4 py-4 text-left text-sm font-semibold text-gray-500 min-w-[120px]">
              Compare
            </th>
            {products.map(p => (
              <th key={p.id} className="px-4 py-4 text-center min-w-[200px]">
                <Link to={`/product/${p.id}`} className="block">
                  <div className="w-24 h-24 mx-auto rounded-xl bg-gray-50 overflow-hidden mb-2 border border-gray-100">
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package className="w-8 h-8 text-gray-300" />
                      </div>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-gray-900 line-clamp-2 hover:text-primary-600">{p.name}</p>
                </Link>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={row.label} className={idx % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
              <td className="sticky left-0 bg-inherit z-10 px-4 py-3 text-sm font-medium text-gray-600">{row.label}</td>
              {products.map(p => (
                <td key={p.id} className="px-4 py-3 text-center text-sm text-gray-700">
                  {row.render(p)}
                </td>
              ))}
            </tr>
          ))}
          {/* Dynamic spec rows */}
          {Array.from(allSpecKeys).map(specKey => (
            <tr key={specKey} className="bg-white">
              <td className="sticky left-0 bg-white z-10 px-4 py-3 text-sm font-medium text-gray-600">{specKey}</td>
              {products.map(p => (
                <td key={p.id} className="px-4 py-3 text-center text-sm text-gray-700">
                  {p.specifications?.[specKey] ? (
                    <span className="inline-flex items-center gap-1">
                      <Check className="w-3.5 h-3.5 text-success" /> {p.specifications[specKey]}
                    </span>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
          {/* Action row */}
          <tr>
            <td className="sticky left-0 bg-white z-10 px-4 py-4"></td>
            {products.map(p => (
              <td key={p.id} className="px-4 py-4 text-center">
                <Link
                  to={`/product/${p.id}`}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white rounded-xl text-sm font-semibold hover:bg-primary-700 transition-colors"
                >
                  <ShoppingCart className="w-4 h-4" /> View
                </Link>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
