import { useState, useEffect, useCallback } from 'react';
import { Loader2, AlertTriangle, Upload, Send, X, ArrowLeft } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useDisputes, type Dispute } from '../../lib/trustEngine';

interface Props {
  open: boolean;
  onClose: () => void;
  sellerId?: string;
  productId?: string;
  transactionId?: string;
}

export default function DisputeCenter({ open, onClose, sellerId, productId, transactionId }: Props) {
  const { user } = useAuth();
  const { disputes, loading, reload } = useDisputes(user?.id);
  const [view, setView] = useState<'list' | 'detail' | 'new'>('list');
  const [selectedDispute, setSelectedDispute] = useState<Dispute | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newReason, setNewReason] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newClaimAmount, setNewClaimAmount] = useState('');

  const loadMessages = useCallback(async (disputeId: string) => {
    const { data } = await supabase.from('dispute_messages').select('*').eq('dispute_id', disputeId).order('created_at');
    if (data) setMessages(data);
  }, []);

  useEffect(() => {
    if (selectedDispute) loadMessages(selectedDispute.id);
  }, [selectedDispute, loadMessages]);

  if (!open || !user) return null;

  const handleCreateDispute = async () => {
    if (!sellerId || !newReason) return;
    setSubmitting(true); setError(null);
    const { data, error: err } = await supabase.rpc('create_dispute', {
      p_buyer_id: user.id, p_seller_id: sellerId, p_reason: newReason,
      p_product_id: productId || null, p_transaction_id: transactionId || null,
      p_description: newDescription, p_claim_amount: parseFloat(newClaimAmount) || 0,
    });
    setSubmitting(false);
    if (err) { setError(err.message); return; }
    if (data?.success) { reload(); setView('list'); setNewReason(''); setNewDescription(''); setNewClaimAmount(''); }
  };

  const handleSendMessage = async () => {
    if (!selectedDispute || !newMessage.trim()) return;
    const { error: err } = await supabase.from('dispute_messages').insert({
      dispute_id: selectedDispute.id, sender_id: user.id, message: newMessage.trim(),
    });
    if (!err) { setNewMessage(''); loadMessages(selectedDispute.id); }
  };

  const handleUploadEvidence = async () => {
    if (!selectedDispute || evidenceFiles.length === 0) return;
    for (const file of evidenceFiles) {
      const path = `${user.id}/disputes/${selectedDispute.id}/${Date.now()}_${file.name}`;
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file);
      if (upErr) continue;
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
      await supabase.from('dispute_evidence').insert({
        dispute_id: selectedDispute.id, uploaded_by: user.id, file_url: publicUrl,
        file_name: file.name, file_type: file.type,
      });
    }
    setEvidenceFiles([]);
  };

  const statusColors: Record<string, string> = {
    open: 'bg-red-100 text-red-700', seller_responded: 'bg-amber-100 text-amber-700',
    under_review: 'bg-blue-100 text-blue-700', resolved_buyer: 'bg-emerald-100 text-emerald-700',
    resolved_seller: 'bg-emerald-100 text-emerald-700', resolved_admin: 'bg-purple-100 text-purple-700',
    closed: 'bg-gray-100 text-gray-600', escalated: 'bg-orange-100 text-orange-700', appealed: 'bg-pink-100 text-pink-700',
  };

  return (
    <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
          <div className="flex items-center gap-2">
            {view !== 'list' && <button onClick={() => setView('list')} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><ArrowLeft className="w-4 h-4 text-gray-400" /></button>}
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Dispute Center</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        <div className="p-5">
          {view === 'list' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-gray-500">{disputes.length} dispute(s)</p>
                {sellerId && <button onClick={() => setView('new')} className="px-3 py-1.5 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700">Open New Dispute</button>}
              </div>
              {loading ? <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div> :
               disputes.length === 0 ? <p className="text-sm text-gray-400 text-center py-8">No disputes yet.</p> :
               <div className="space-y-2">
                 {disputes.map((d: Dispute) => (
                   <button key={d.id} onClick={() => { setSelectedDispute(d); setView('detail'); }}
                     className="w-full p-4 rounded-xl border border-gray-100 dark:border-gray-700 hover:border-primary-300 text-left transition-colors">
                     <div className="flex items-center justify-between mb-1">
                       <span className="font-mono text-xs text-gray-400">{d.dispute_number}</span>
                       <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[d.status] || 'bg-gray-100 text-gray-600'}`}>{d.status.replace(/_/g, ' ')}</span>
                     </div>
                     <p className="text-sm font-medium text-gray-900 dark:text-white">{d.reason}</p>
                     <p className="text-xs text-gray-400 mt-1">{new Date(d.created_at).toLocaleString()}</p>
                   </button>
                 ))}
               </div>}
            </div>
          )}

          {view === 'new' && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">Reason</label>
                <select value={newReason} onChange={e => setNewReason(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                  <option value="">Select a reason...</option>
                  <option value="Item not received">Item not received</option>
                  <option value="Item not as described">Item not as described</option>
                  <option value="Damaged on delivery">Damaged on delivery</option>
                  <option value="Refund requested">Refund requested</option>
                  <option value="Seller unresponsive">Seller unresponsive</option>
                  <option value="Unauthorized charge">Unauthorized charge</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">Description</label>
                <textarea value={newDescription} onChange={e => setNewDescription(e.target.value)} rows={4}
                  placeholder="Describe the issue in detail..."
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">Claim Amount (optional)</label>
                <input type="number" value={newClaimAmount} onChange={e => setNewClaimAmount(e.target.value)} placeholder="0.00"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <button onClick={handleCreateDispute} disabled={submitting || !newReason}
                className="w-full py-3 rounded-xl bg-primary-600 text-white font-semibold hover:bg-primary-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />} Open Dispute
              </button>
            </div>
          )}

          {view === 'detail' && selectedDispute && (
            <div>
              <div className="mb-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-700/30">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-xs text-gray-400">{selectedDispute.dispute_number}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[selectedDispute.status] || 'bg-gray-100 text-gray-600'}`}>{selectedDispute.status.replace(/_/g, ' ')}</span>
                </div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{selectedDispute.reason}</p>
                {selectedDispute.description && <p className="text-sm text-gray-500 mt-1">{selectedDispute.description}</p>}
                {selectedDispute.admin_decision && (
                  <div className="mt-3 p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20">
                    <p className="text-xs font-medium text-purple-600">Admin Decision</p>
                    <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{selectedDispute.admin_decision}</p>
                  </div>
                )}
              </div>

              <div className="space-y-2 mb-4 max-h-[300px] overflow-y-auto">
                {messages.map(m => (
                  <div key={m.id} className={`flex ${m.sender_id === user.id ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] p-3 rounded-xl ${m.sender_id === user.id ? 'bg-primary-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}>
                      <p className="text-sm">{m.message}</p>
                      <p className={`text-xs mt-1 ${m.sender_id === user.id ? 'text-primary-200' : 'text-gray-400'}`}>{new Date(m.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 mb-3">
                <input type="text" value={newMessage} onChange={e => setNewMessage(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSendMessage(); }}
                  placeholder="Type a message..."
                  className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                <button onClick={handleSendMessage} disabled={!newMessage.trim()}
                  className="p-2.5 rounded-xl bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"><Send className="w-4 h-4" /></button>
              </div>

              <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
                <label className="flex items-center justify-center gap-2 p-2.5 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-600 cursor-pointer hover:border-primary-400">
                  <Upload className="w-4 h-4 text-gray-400" />
                  <span className="text-xs text-gray-500">Upload evidence</span>
                  <input type="file" multiple className="hidden" onChange={e => { const f = Array.from(e.target.files || []); setEvidenceFiles(prev => [...prev, ...f]); }} />
                </label>
                {evidenceFiles.length > 0 && (
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs text-gray-500">{evidenceFiles.length} file(s) ready</span>
                    <button onClick={handleUploadEvidence} className="text-xs text-primary-600 font-medium hover:text-primary-700">Upload</button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
