import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { GitCompare, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import SeoHead from '../components/SeoHead';
import { CompareTable, type ComparisonProduct, useComparisonList } from '../components/marketplace/ProductComparison';
import AIComparisonAnalysis from '../components/AIComparisonAnalysis';

export default function ComparePage() {
  const { productIds, clearAll } = useComparisonList();
  const [products, setProducts] = useState<ComparisonProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (productIds.length === 0) {
      setProducts([]);
      setLoading(false);
      return;
    }
    let cancelled = false;

    const fetchProducts = async () => {
      const { data } = await supabase
        .from('products')
        .select(`
          id, name, price, is_free, image_url, category, product_type,
          average_rating, total_reviews, total_sales, uploaded_by,
          specifications, commission_rate, stock_quantity
        `)
        .in('id', productIds)
        .eq('is_active', true)
        .eq('is_hidden', false)
        .eq('approval_status', 'approved');

      if (cancelled) return;

      if (data) {
        const sellerIds = [...new Set(data.map(p => p.uploaded_by))];
        const { data: sellers } = await supabase
          .from('users')
          .select('id, full_name, store_title, is_verified')
          .in('id', sellerIds);
        const sellerMap = new Map((sellers || []).map(s => [s.id, s]));
        const enriched = data.map(p => {
          const seller = sellerMap.get(p.uploaded_by);
          return {
            ...p,
            seller_name: seller?.full_name || 'Unknown',
            store_name: seller?.store_title || null,
            seller_verified: seller?.is_verified || false,
          } as ComparisonProduct;
        });
        const ordered = productIds.map(id => enriched.find(p => p.id === id)).filter(Boolean) as ComparisonProduct[];
        if (!cancelled) setProducts(ordered);
      }
      if (!cancelled) setLoading(false);
    };

    fetchProducts();
    return () => { cancelled = true; };
  }, [productIds]);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <SeoHead
        title="Compare Products"
        description="Compare Dright marketplace products side by side."
        canonical="/compare"
      />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <GitCompare className="w-7 h-7 text-primary-600" />
            Compare Products
          </h1>
          <p className="text-gray-500 mt-1">Compare up to 4 products side by side</p>
        </div>
        {products.length > 0 && (
          <button
            onClick={clearAll}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl text-sm font-medium transition-colors"
          >
            <Trash2 className="w-4 h-4" /> Clear All
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {products.length >= 2 && <AIComparisonAnalysis products={products} />}
          <CompareTable products={products} />
          {products.length > 0 && products.length < 4 && (
            <div className="mt-6 text-center">
              <Link to="/market" className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-xl font-semibold hover:bg-primary-700">
                Add More Products
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
