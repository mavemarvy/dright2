import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, Save, Loader2, AlertCircle, Check, Camera,
  History, Edit2, Package,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { ProductEditChanges, ProductEditLog } from '../lib/types';
import AIGenerateButton from '../components/ai/AIGenerateButton';

interface Product {
  id: string;
  name: string;
  description: string | null | undefined;
  price: number;
  category: string;
  image_url: string | null;
  stock_quantity: number | null;
  uploaded_by: string;
}

export default function EditProductPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [stockQuantity, setStockQuantity] = useState('');
  const [category, setCategory] = useState('General');
  const [tags, setTags] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editHistory, setEditHistory] = useState<ProductEditLog[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetchProduct();
    fetchEditHistory();
  }, [id]);

  const fetchProduct = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, description, price, category, image_url, stock_quantity, uploaded_by')
        .eq('id', id!)
        .maybeSingle();
      if (error || !data) { setError('Product not found'); return; }
      const p = data as Product;
      if (p.uploaded_by !== user?.id) {
        setError('You can only edit your own products');
        return;
      }
      setProduct(p);
      setName(p.name);
      setDescription(p.description || '');
      setPrice(String(p.price));
      setStockQuantity(p.stock_quantity !== null ? String(p.stock_quantity) : '');
      setCategory(p.category);
      setImagePreview(p.image_url);
    } catch {
      setError('Failed to load product');
    } finally {
      setLoading(false);
    }
  };

  const fetchEditHistory = async () => {
    try {
      const { data } = await supabase
        .from('product_edit_logs')
        .select('id, product_id, edit_id, action, performed_by, changes_summary, created_at')
        .eq('product_id', id!)
        .order('created_at', { ascending: false })
        .limit(20);
      if (data) setEditHistory(data as ProductEditLog[]);
    } catch { /* non-critical */ }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { setError('Image must be under 8MB'); return; }
    if (!file.type.startsWith('image/')) { setError('Please select an image file'); return; }
    setImageFile(file);
    setError(null);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product || !user) return;
    setError(null);

    const changes: ProductEditChanges = {};
    if (name.trim() !== product.name) changes.name = name.trim();
    if (description.trim() !== (product.description || '')) changes.description = description.trim();
    if (parseFloat(price) !== Number(product.price)) changes.price = parseFloat(price);
    const stockNum = stockQuantity ? parseInt(stockQuantity) : null;
    if (stockNum !== product.stock_quantity) changes.stock_quantity = stockNum;
    if (category !== product.category) changes.category = category;
    const tagsArr = tags.split(',').map(t => t.trim()).filter(Boolean);
    if (tagsArr.length > 0) changes.tags = tagsArr;

    if (imageFile) {
      const ext = imageFile.name.split('.').pop();
      const path = `${user.id}/edit_${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from('product-images').upload(path, imageFile);
      if (uploadErr) { setError('Failed to upload image'); return; }
      const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(path);
      changes.image_url = urlData.publicUrl;
    }

    if (Object.keys(changes).length === 0) {
      setError('No changes detected');
      return;
    }

    setSubmitting(true);
    try {
      const originalSnapshot: ProductEditChanges = {
        name: product.name,
        description: product.description || '',
        price: Number(product.price),
        stock_quantity: product.stock_quantity ?? undefined,
        category: product.category,
        image_url: product.image_url ?? undefined,
      };

      const { error: insertErr } = await supabase.from('product_edits').insert({
        product_id: product.id,
        proposed_by: user.id,
        status: 'pending',
        proposed_changes: changes,
        original_snapshot: originalSnapshot,
      });

      if (insertErr) throw insertErr;
      setSuccess(true);
      setTimeout(() => navigate(`/product/${product.id}`), 2000);
    } catch (err) {
      console.error('Edit submission error:', err);
      setError('Failed to submit edit for approval');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
      </div>
    );
  }

  if (error && !product) {
    return (
      <div className="p-8 max-w-2xl mx-auto text-center">
        <AlertCircle className="w-12 h-12 text-error mx-auto mb-4" />
        <p className="text-gray-900 font-semibold">{error}</p>
        <Link to="/market" className="mt-4 inline-flex items-center gap-2 text-primary-600">
          <ChevronLeft className="w-4 h-4" />Back
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <Link to={`/product/${id}`} className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-900 mb-4 text-sm">
        <ChevronLeft className="w-4 h-4" />Back to Product
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center">
            <Edit2 className="w-5 h-5 text-primary-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Edit Product</h1>
            <p className="text-sm text-gray-500">Changes require admin approval before going live</p>
          </div>
        </div>
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
        >
          <History className="w-4 h-4" />History
        </button>
      </div>

      <AnimatePresence>
        {showHistory && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-6 bg-gray-50 rounded-2xl p-4 overflow-hidden"
          >
            <h3 className="font-semibold text-gray-900 mb-3 text-sm">Edit History</h3>
            {editHistory.length === 0 ? (
              <p className="text-sm text-gray-500">No edits recorded yet</p>
            ) : (
              <div className="space-y-2">
                {editHistory.map(log => (
                  <div key={log.id} className="flex items-center gap-3 text-sm">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      log.action === 'approved' ? 'bg-success-muted text-success' :
                      log.action === 'rejected' ? 'bg-error-muted text-error' :
                      'bg-primary-50 text-primary-700'
                    }`}>{log.action}</span>
                    <span className="text-gray-500">{new Date(log.created_at).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {success ? (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
          <div className="w-16 h-16 bg-success rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Edit Submitted!</h2>
          <p className="text-gray-500">Your changes have been submitted for admin approval. You'll be notified when reviewed.</p>
        </motion.div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="bg-error-muted text-error rounded-xl p-4 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />{error}
            </div>
          )}

          {/* Image */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <label className="block text-sm font-medium text-gray-700 mb-3">Product Image</label>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />
            {imagePreview ? (
              <div className="relative inline-block">
                <img src={imagePreview} alt="Preview" className="w-32 h-32 object-cover rounded-xl border border-gray-200" />
                <button type="button" onClick={() => fileInputRef.current?.click()}
                  className="absolute -bottom-2 -right-2 w-8 h-8 bg-white rounded-full shadow-md flex items-center justify-center hover:scale-110 transition-transform">
                  <Camera className="w-4 h-4 text-primary-600" />
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="w-32 h-32 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center gap-2 hover:border-primary-400 hover:bg-primary-50 transition-all">
                <Package className="w-8 h-8 text-gray-300" />
                <span className="text-xs text-gray-400">Upload</span>
              </button>
            )}
          </div>

          {/* Name */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} required
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none text-gray-900" />
            <div className="mt-1.5">
              <AIGenerateButton type="title" productName={name} category={category} onApply={setName} />
            </div>
          </div>

          {/* Description */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none text-gray-900 resize-none" />
            <div className="flex flex-wrap items-center gap-3 mt-1.5">
              <AIGenerateButton type="description" productName={name} category={category} description={description} onApply={setDescription} />
              <AIGenerateButton type="rewrite" content={description} onApply={setDescription} />
            </div>
          </div>

          {/* Price + Stock */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">Price ($)</label>
              <input type="number" step="0.01" min="0" value={price} onChange={e => setPrice(e.target.value)} required
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none text-gray-900" />
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">Stock Quantity</label>
              <input type="number" min="0" value={stockQuantity} onChange={e => setStockQuantity(e.target.value)}
                placeholder="Leave empty = unlimited"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none text-gray-900" />
            </div>
          </div>

          {/* Category + Tags */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
              <select value={category} onChange={e => setCategory(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none text-gray-900">
                {['General', 'Electronics', 'Software', 'Courses', 'Writing', 'Design', 'Marketing', 'Music', 'Photography'].map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">Tags (comma-separated)</label>
              <input type="text" value={tags} onChange={e => setTags(e.target.value)}
                placeholder="e.g. premium, featured"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none text-gray-900" />
            </div>
          </div>

          <button type="submit" disabled={submitting}
            className="w-full py-4 bg-primary-600 hover:bg-primary-700 text-white rounded-2xl font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 min-h-[56px]">
            {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-5 h-5" />Submit for Approval</>}
          </button>
        </form>
      )}
    </div>
  );
}
