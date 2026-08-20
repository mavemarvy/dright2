import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle, XCircle, Clock, Loader2, Search, ArrowRight,
  Package, X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { emitEvent } from '../../lib/notificationEvents';
import { useAuth } from '../../contexts/AuthContext';
import type { ProductEdit, ProductEditChanges } from '../../lib/types';

interface EditWithDetails extends ProductEdit {
  product_name: string;
  proposer_email: string;
}

export default function AdminProductEditsPage() {
  const { user } = useAuth();
  const [edits, setEdits] = useState<EditWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [selectedEdit, setSelectedEdit] = useState<EditWithDetails | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);

  useEffect(() => { fetchEdits(); }, [statusFilter]);

  const fetchEdits = async () => {
    setLoading(true);
    try {
      let query = supabase.from('product_edits').select('*');
      if (statusFilter !== 'all') query = query.eq('status', statusFilter);
      query = query.order('created_at', { ascending: false });
      const { data, error } = await query;
      if (error) throw error;
      if (!data) { setEdits([]); return; }

      const productIds = [...new Set(data.map(e => e.product_id))];
      const proposerIds = [...new Set(data.map(e => e.proposed_by))];

      const [{ data: products }, { data: proposers }] = await Promise.all([
        supabase.from('products').select('id, name').in('id', productIds),
        supabase.from('users').select('id, email').in('id', proposerIds),
      ]);

      const productMap = new Map((products || []).map(p => [p.id, p.name]));
      const proposerMap = new Map((proposers || []).map(u => [u.id, u.email]));

      const enriched = data.map(e => ({
        ...e,
        product_name: productMap.get(e.product_id) || 'Unknown',
        proposer_email: proposerMap.get(e.proposed_by) || 'Unknown',
      })) as EditWithDetails[];

      const filtered = searchQuery
        ? enriched.filter(e =>
            e.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            e.proposer_email.toLowerCase().includes(searchQuery.toLowerCase()))
        : enriched;

      setEdits(filtered);
    } catch (err) {
      console.error('Error fetching edits:', err);
    } finally {
      setLoading(false);
    }
  };

  const approveEdit = async (edit: EditWithDetails) => {
    setProcessingId(edit.id);
    try {
      const changes = edit.proposed_changes as ProductEditChanges;
      const updateData: Record<string, unknown> = {};
      if (changes.name) updateData.name = changes.name;
      if (changes.description !== undefined) updateData.description = changes.description;
      if (changes.price !== undefined) updateData.price = changes.price;
      if (changes.stock_quantity !== undefined) updateData.stock_quantity = changes.stock_quantity;
      if (changes.category) updateData.category = changes.category;
      if (changes.image_url !== undefined) updateData.image_url = changes.image_url;

      const { error: prodErr } = await supabase.from('products').update(updateData).eq('id', edit.product_id);
      if (prodErr) throw prodErr;

      await supabase.from('product_edits').update({
        status: 'approved',
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
      }).eq('id', edit.id);

      await supabase.from('product_edit_logs').insert({
        product_id: edit.product_id,
        edit_id: edit.id,
        action: 'approved',
        performed_by: user?.id,
        changes_summary: changes,
      });

      await emitEvent({
        module: 'marketplace',
        eventType: 'product_approved',
        recipientIds: edit.proposed_by || '',
        actorId: user?.id,
        metadata: {
          productTitle: edit.product_name,
          actionUrl: `/product/${edit.product_id}`,
        },
      });

      setShowRejectModal(false);
      setSelectedEdit(null);
      fetchEdits();
    } catch (err) {
      console.error('Approve error:', err);
    } finally {
      setProcessingId(null);
    }
  };

  const rejectEdit = async () => {
    if (!selectedEdit) return;
    setProcessingId(selectedEdit.id);
    try {
      await supabase.from('product_edits').update({
        status: 'rejected',
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
        rejection_reason: rejectionReason || null,
      }).eq('id', selectedEdit.id);

      await supabase.from('product_edit_logs').insert({
        product_id: selectedEdit.product_id,
        edit_id: selectedEdit.id,
        action: 'rejected',
        performed_by: user?.id,
        changes_summary: { reason: rejectionReason },
      });

      await emitEvent({
        module: 'marketplace',
        eventType: 'product_rejected',
        recipientIds: selectedEdit.proposed_by || '',
        actorId: user?.id,
        metadata: {
          productTitle: selectedEdit.product_name,
          reason: rejectionReason || 'Edit not approved',
          actionUrl: `/product/${selectedEdit.product_id}`,
        },
      });

      setShowRejectModal(false);
      setSelectedEdit(null);
      setRejectionReason('');
      fetchEdits();
    } catch (err) {
      console.error('Reject error:', err);
    } finally {
      setProcessingId(null);
    }
  };

  const openReject = (edit: EditWithDetails) => {
    setSelectedEdit(edit);
    setShowRejectModal(true);
  };

  const fieldLabels: Record<string, string> = {
    name: 'Title', description: 'Description', price: 'Price', stock_quantity: 'Stock',
    category: 'Category', tags: 'Tags', image_url: 'Image',
  };

  const formatValue = (key: string, value: unknown): string => {
    if (value === null || value === undefined) return '—';
    if (key === 'price') return `$${Number(value).toFixed(2)}`;
    if (Array.isArray(value)) return value.join(', ');
    return String(value);
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-warning-muted rounded-xl flex items-center justify-center">
          <Package className="w-5 h-5 text-warning" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Product Edit Approvals</h1>
          <p className="text-gray-500 text-sm">Review and approve seller-submitted product changes</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by product or seller..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none text-sm" />
        </div>
        {(['pending', 'approved', 'rejected', 'all'] as const).map(status => (
          <button key={status} onClick={() => setStatusFilter(status)}
            className={`px-3 py-2 rounded-xl text-sm font-medium capitalize transition-colors ${
              statusFilter === status ? 'bg-primary-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}>{status}</button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
        </div>
      ) : edits.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No {statusFilter !== 'all' ? statusFilter : ''} edit requests</p>
        </div>
      ) : (
        <div className="space-y-3">
          {edits.map(edit => (
            <motion.div key={edit.id} layout
              className="bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-semibold text-gray-900">{edit.product_name}</h3>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1 ${
                      edit.status === 'pending' ? 'bg-warning-muted text-warning' :
                      edit.status === 'approved' ? 'bg-success-muted text-success' :
                      'bg-error-muted text-error'
                    }`}>
                      {edit.status === 'pending' ? <Clock className="w-3 h-3" /> :
                       edit.status === 'approved' ? <CheckCircle className="w-3 h-3" /> :
                       <XCircle className="w-3 h-3" />}
                      {edit.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500">by {edit.proposer_email}</p>
                  <p className="text-xs text-gray-400 mt-1">{new Date(edit.created_at).toLocaleString()}</p>

                  {/* Change summary */}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {Object.keys(edit.proposed_changes).map(key => (
                      <span key={key} className="px-2 py-1 bg-primary-50 text-primary-700 rounded-lg text-xs font-medium">
                        {fieldLabels[key] || key}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Link to={`/product/${edit.product_id}`}
                    className="px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                    View Product
                  </Link>
                  {edit.status === 'pending' && (
                    <>
                      <button onClick={() => approveEdit(edit)} disabled={processingId === edit.id}
                        className="flex items-center gap-2 px-4 py-2 bg-success text-white rounded-xl font-medium hover:bg-green-700 transition-colors disabled:opacity-50 min-h-[40px]">
                        {processingId === edit.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                        Approve
                      </button>
                      <button onClick={() => openReject(edit)}
                        className="flex items-center gap-2 px-4 py-2 bg-error-muted text-error rounded-xl font-medium hover:bg-error hover:text-white transition-colors min-h-[40px]">
                        <XCircle className="w-4 h-4" />Reject
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Diff view */}
              {edit.status === 'pending' && edit.original_snapshot && (
                <div className="mt-4 border-t border-gray-100 pt-4">
                  <p className="text-xs font-medium text-gray-500 mb-2">Proposed Changes:</p>
                  <div className="space-y-1.5">
                    {Object.entries(edit.proposed_changes).map(([key, newVal]) => {
                      const oldVal = (edit.original_snapshot as ProductEditChanges)[key as keyof ProductEditChanges];
                      return (
                        <div key={key} className="flex items-start gap-3 text-sm">
                          <span className="text-gray-500 w-24 shrink-0">{fieldLabels[key] || key}:</span>
                          <div className="flex-1">
                            <span className="text-error line-through">{formatValue(key, oldVal)}</span>
                            <ArrowRight className="w-3 h-3 inline mx-2 text-gray-400" />
                            <span className="text-success font-medium">{formatValue(key, newVal)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {edit.status === 'rejected' && edit.rejection_reason && (
                <div className="mt-3 bg-error-muted rounded-xl p-3 text-sm text-error">
                  <span className="font-medium">Rejection reason:</span> {edit.rejection_reason}
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}

      {/* Reject Modal */}
      <AnimatePresence>
        {showRejectModal && selectedEdit && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowRejectModal(false)}
              className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                onClick={e => e.stopPropagation()}
                className="bg-white rounded-2xl p-6 max-w-md w-full">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-gray-900">Reject Edit</h2>
                  <button onClick={() => setShowRejectModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
                </div>
                <p className="text-sm text-gray-500 mb-4">Provide an optional reason for rejecting this edit for "{selectedEdit.product_name}":</p>
                <textarea value={rejectionReason} onChange={e => setRejectionReason(e.target.value)}
                  placeholder="Reason (optional)..."
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none text-gray-900 resize-none mb-4" />
                <div className="flex gap-3">
                  <button onClick={() => setShowRejectModal(false)}
                    className="flex-1 py-3 border border-gray-200 rounded-xl font-medium text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
                  <button onClick={rejectEdit} disabled={processingId === selectedEdit.id}
                    className="flex-1 py-3 bg-error text-white rounded-xl font-medium hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                    {processingId === selectedEdit.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                    Reject Edit
                  </button>
                </div>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
