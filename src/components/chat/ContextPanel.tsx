import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ExternalLink, ShoppingBag, Briefcase, Store,
  CheckCircle, Star, MapPin, Clock, DollarSign, Flag,
  X, ChevronDown, ChevronUp, StickyNote, Zap, Plus,
  Trash2, Clock3, Bot, Calendar, Phone, FileText, Bell,
  History, Tag, AlertCircle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { ChatConversation } from '../../lib/types';
import { CONTEXT_TYPE_META } from '../../lib/types';
import type { ChatSellerNote, ChatTimelineEvent } from '../../lib/chatTypes';
import { useQuickReplies } from '../../lib/chatHooks';
import {
  useFollowUpReminders, useCustomerTags, useConversationSummary,
  useCustomerHistory, useConversationLabels, useLabels,
} from '../../lib/chatPart3Hooks';
import { REMINDER_TYPE_META } from '../../lib/chatTypes';
import type { ReminderType } from '../../lib/chatTypes';
import ReportModal from './ReportModal';

interface ContextPanelProps {
  conversation: ChatConversation;
  userId: string;
  onClose?: () => void;
  onResolved?: () => void;
}

export default function ContextPanel({ conversation, userId, onClose, onResolved }: ContextPanelProps) {
  const [resolving, setResolving] = useState(false);
  const [section, setSection] = useState<'info' | 'timeline' | 'notes' | 'quick' | 'reminders' | 'customer' | 'summary' | 'labels'>('info');
  const [sellerNotes, setSellerNotes] = useState<ChatSellerNote[]>([]);
  const [noteInput, setNoteInput] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [timeline, setTimeline] = useState<ChatTimelineEvent[]>([]);
  const [newQrTitle, setNewQrTitle] = useState('');
  const [newQrBody, setNewQrBody] = useState('');
  const [addingQr, setAddingQr] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reminderType, setReminderType] = useState<ReminderType>('reply_tomorrow');
  const [reminderDate, setReminderDate] = useState('');
  const [newTag, setNewTag] = useState('');

  const ctx = conversation.context_data || null;
  const contextMeta = CONTEXT_TYPE_META[conversation.context_type];
  const isSeller = conversation.seller_id === userId;
  const isResolved = conversation.status === 'resolved';
  const otherUserId = conversation.customer_id === userId ? conversation.seller_id : conversation.customer_id;

  const { quickReplies, create: createQr, remove: removeQr } = useQuickReplies(userId);
  const { reminders, createReminder, completeReminder, deleteReminder } = useFollowUpReminders(isSeller ? conversation.id : null, isSeller ? userId : null);
  const { tags, addTag, removeTag } = useCustomerTags(isSeller ? userId : null, otherUserId);
  const { summary, loading: summaryLoading, generate } = useConversationSummary(conversation.id);
  const { history, loading: historyLoading } = useCustomerHistory(isSeller ? userId : null, otherUserId);
  const { labels } = useLabels();
  const { convLabels, applyLabel, removeLabel } = useConversationLabels(conversation.id);

  useEffect(() => {
    if (isSeller) {
      supabase.from('chat_seller_notes').select('*').eq('conversation_id', conversation.id).eq('seller_id', userId).order('created_at', { ascending: false }).then(({ data }) => {
        setSellerNotes((data || []) as ChatSellerNote[]);
      });
    }
    supabase.from('chat_conversation_timeline').select('*').eq('conversation_id', conversation.id).order('created_at', { ascending: true }).then(({ data }) => {
      setTimeline((data || []) as ChatTimelineEvent[]);
    });
  }, [conversation.id, userId, isSeller]);

  const handleResolve = async () => {
    setResolving(true);
    await supabase.from('chat_conversations').update({ status: 'resolved' }).eq('id', conversation.id);
    setResolving(false);
    onResolved?.();
  };

  const addNote = async () => {
    if (!noteInput.trim()) return;
    setSavingNote(true);
    const { data } = await supabase.from('chat_seller_notes').insert({
      conversation_id: conversation.id,
      seller_id: userId,
      body: noteInput.trim(),
    }).select().single();
    if (data) setSellerNotes(prev => [data as ChatSellerNote, ...prev]);
    setNoteInput('');
    setSavingNote(false);
  };

  const deleteNote = async (id: string) => {
    await supabase.from('chat_seller_notes').delete().eq('id', id);
    setSellerNotes(prev => prev.filter(n => n.id !== id));
  };

  const handleAddReminder = async () => {
    if (!reminderDate) return;
    await createReminder({ reminderType, dueAt: new Date(reminderDate).toISOString() });
    setReminderDate('');
  };

  const handleAddTag = async () => {
    if (!newTag.trim()) return;
    await addTag(newTag.trim());
    setNewTag('');
  };

  const handleReport = () => {
    setShowReport(true);
  };

  const getListingUrl = () => {
    if (!conversation.context_id) return null;
    switch (conversation.context_type) {
      case 'product_inquiry': return `/product/${conversation.context_id}`;
      case 'service_inquiry': return `/product/${conversation.context_id}`;
      case 'job_application': return `/jobs/${conversation.context_id}`;
      case 'store_inquiry': return `/shop/${conversation.context_id}`;
      default: return null;
    }
  };
  const listingUrl = getListingUrl();

  const REMINDER_ICONS: Record<ReminderType, React.ElementType> = {
    reply_tomorrow: Clock3,
    call_customer: Phone,
    send_quotation: FileText,
    confirm_payment: DollarSign,
    custom: Bell,
  };

  const SELLER_SECTIONS = [
    { id: 'notes' as const, label: 'Notes' },
    { id: 'quick' as const, label: 'Quick' },
    { id: 'reminders' as const, label: 'Reminders' },
    { id: 'customer' as const, label: 'Customer' },
    { id: 'summary' as const, label: 'AI' },
    { id: 'labels' as const, label: 'Labels' },
  ];

  const SECTIONS = [
    { id: 'info' as const, label: 'Info' },
    { id: 'timeline' as const, label: 'Timeline' },
    ...(isSeller ? SELLER_SECTIONS : [{ id: 'summary' as const, label: 'AI' }, { id: 'labels' as const, label: 'Labels' }]),
  ];

  return (
    <div className="flex flex-col h-full bg-white border-l border-gray-100">
      <ReportModal
        isOpen={showReport}
        onClose={() => setShowReport(false)}
        reporterId={userId}
        reportedUserId={otherUserId || ''}
        conversationId={conversation.id}
      />

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
        <div className="flex gap-1 overflow-x-auto scrollbar-hide">
          {SECTIONS.map(s => (
            <button key={s.id} onClick={() => setSection(s.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 ${section === s.id ? 'bg-primary-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
              {s.label}
            </button>
          ))}
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700 rounded-lg ml-2 shrink-0">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* INFO */}
        {section === 'info' && (
          <div className="p-4 space-y-4">
            <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${contextMeta.bg} ${contextMeta.color}`}>
              {contextMeta.label}
            </div>

            {ctx && (
              <div className="bg-gray-50 rounded-xl border border-gray-100 overflow-hidden">
                {ctx.image_url && <img src={ctx.image_url} alt={ctx.title} className="w-full h-32 object-cover" />}
                <div className="p-3 space-y-1.5">
                  {ctx.title && <p className="font-semibold text-gray-900 text-sm">{ctx.title}</p>}
                  {ctx.price != null && (
                    <div className="flex items-center gap-1 text-primary-700 font-bold text-sm">
                      <DollarSign className="w-3.5 h-3.5" />
                      {ctx.price === 0 ? 'Free' : ctx.price.toLocaleString()}
                      {ctx.currency && <span className="text-xs text-gray-400">{ctx.currency}</span>}
                    </div>
                  )}
                  {ctx.seller_name && <p className="text-xs text-gray-500">{ctx.seller_name}</p>}
                  {ctx.company_name && <p className="text-xs text-gray-500">{ctx.company_name}</p>}
                  {ctx.location && <div className="flex items-center gap-1 text-xs text-gray-500"><MapPin className="w-3 h-3" />{ctx.location}</div>}
                  {ctx.salary && <div className="flex items-center gap-1 text-xs text-gray-500"><DollarSign className="w-3 h-3" />{ctx.salary}</div>}
                  {ctx.delivery_time && <div className="flex items-center gap-1 text-xs text-gray-500"><Clock className="w-3 h-3" />{ctx.delivery_time}</div>}
                  {ctx.rating != null && <div className="flex items-center gap-1 text-xs text-amber-600"><Star className="w-3 h-3 fill-current" />{ctx.rating.toFixed(1)}</div>}
                  {ctx.availability && <p className="text-xs text-gray-500">{ctx.availability}</p>}
                </div>
                {listingUrl && (
                  <Link to={listingUrl} className="flex items-center justify-center gap-2 p-2.5 border-t border-gray-100 text-primary-600 text-xs font-semibold hover:bg-primary-50 transition-colors">
                    <ExternalLink className="w-3.5 h-3.5" />
                    View {conversation.context_type === 'job_application' ? 'Job' : conversation.context_type === 'store_inquiry' ? 'Store' : 'Listing'}
                  </Link>
                )}
              </div>
            )}

            {/* Labels */}
            {convLabels.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {convLabels.map(cl => (
                  <span key={cl.id} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                    {cl.label?.name}
                  </span>
                ))}
              </div>
            )}

            {/* Quick actions */}
            <div className="space-y-2">
              {!isResolved && (
                <button onClick={handleResolve} disabled={resolving}
                  className="w-full flex items-center gap-2 px-3 py-2.5 bg-green-50 text-green-700 rounded-xl text-sm font-medium hover:bg-green-100 transition-colors disabled:opacity-60">
                  <CheckCircle className="w-4 h-4" /> Mark Resolved
                </button>
              )}
              {isResolved && (
                <div className="w-full flex items-center gap-2 px-3 py-2.5 bg-green-50 text-green-700 rounded-xl text-sm font-medium">
                  <CheckCircle className="w-4 h-4" /> Resolved
                </div>
              )}
              {isSeller && listingUrl && (
                <Link to={listingUrl} className="w-full flex items-center gap-2 px-3 py-2.5 bg-primary-50 text-primary-700 rounded-xl text-sm font-medium hover:bg-primary-100 transition-colors">
                  {conversation.context_type === 'job_application' ? <Briefcase className="w-4 h-4" /> : conversation.context_type === 'store_inquiry' ? <Store className="w-4 h-4" /> : <ShoppingBag className="w-4 h-4" />}
                  View Listing
                </Link>
              )}
              <button onClick={handleReport}
                className="w-full flex items-center gap-2 px-3 py-2.5 bg-red-50 text-red-600 rounded-xl text-sm font-medium hover:bg-red-100 transition-colors">
                <Flag className="w-4 h-4" /> Report User
              </button>
            </div>

            <div className="pt-2 border-t border-gray-50 text-xs text-gray-400 space-y-1">
              <p>ID: {conversation.id.slice(0, 8)}...</p>
              <p>Started: {new Date(conversation.created_at).toLocaleDateString()}</p>
            </div>
          </div>
        )}

        {/* TIMELINE */}
        {section === 'timeline' && (
          <div className="p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <Clock3 className="w-3.5 h-3.5" /> Conversation Timeline
            </h3>
            {timeline.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">No timeline events yet</p>
            ) : (
              <div className="space-y-2">
                {timeline.map(event => (
                  <div key={event.id} className="flex gap-2.5">
                    <div className="w-1.5 shrink-0 flex flex-col items-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary-400 mt-1.5 shrink-0" />
                      <div className="w-px flex-1 bg-gray-100 mt-0.5" />
                    </div>
                    <div className="pb-3 min-w-0">
                      <p className="text-sm text-gray-700 font-medium">{event.event_label}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{new Date(event.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* SELLER NOTES */}
        {section === 'notes' && isSeller && (
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <StickyNote className="w-3.5 h-3.5" /> Private Notes
            </div>
            <p className="text-xs text-gray-400">Only visible to you and admins.</p>
            <div className="flex gap-2">
              <textarea
                value={noteInput}
                onChange={e => setNoteInput(e.target.value)}
                placeholder="Add a private note..."
                rows={2}
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary-400 resize-none"
              />
              <button onClick={addNote} disabled={savingNote || !noteInput.trim()}
                className="px-3 bg-primary-600 text-white rounded-xl text-sm font-medium hover:bg-primary-700 disabled:opacity-40">
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2">
              {sellerNotes.map(note => (
                <div key={note.id} className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5 group relative">
                  <p className="text-sm text-gray-700">{note.body}</p>
                  <p className="text-xs text-amber-500 mt-1">{new Date(note.created_at).toLocaleDateString()}</p>
                  <button onClick={() => deleteNote(note.id)} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:text-red-600 transition-opacity">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {sellerNotes.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No notes yet</p>}
            </div>
          </div>
        )}

        {/* QUICK REPLIES */}
        {section === 'quick' && isSeller && (
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <Zap className="w-3.5 h-3.5" /> Quick Replies
            </div>
            {addingQr ? (
              <div className="space-y-2 bg-gray-50 rounded-xl p-3 border border-gray-100">
                <input value={newQrTitle} onChange={e => setNewQrTitle(e.target.value)} placeholder="Short title (e.g. Greeting)" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
                <textarea value={newQrBody} onChange={e => setNewQrBody(e.target.value)} placeholder="Message body..." rows={3} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none" />
                <div className="flex gap-2">
                  <button onClick={async () => { if (newQrTitle.trim() && newQrBody.trim()) { await createQr(newQrTitle.trim(), newQrBody.trim()); setNewQrTitle(''); setNewQrBody(''); setAddingQr(false); } }} className="flex-1 bg-primary-600 text-white text-sm rounded-lg py-2 font-medium hover:bg-primary-700">Save</button>
                  <button onClick={() => setAddingQr(false)} className="px-3 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAddingQr(true)} className="w-full flex items-center gap-2 px-3 py-2.5 border border-dashed border-gray-200 rounded-xl text-sm text-gray-500 hover:border-primary-400 hover:text-primary-600 transition-colors">
                <Plus className="w-4 h-4" /> Add quick reply
              </button>
            )}
            <div className="space-y-2">
              {quickReplies.map(qr => (
                <div key={qr.id} className="flex items-start gap-2 bg-white border border-gray-100 rounded-xl px-3 py-2.5 group">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-700">{qr.title}</p>
                    <p className="text-xs text-gray-400 truncate">{qr.body}</p>
                  </div>
                  <button onClick={() => removeQr(qr.id)} className="opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:text-red-600 shrink-0 transition-opacity">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {quickReplies.length === 0 && !addingQr && (
                <p className="text-xs text-gray-400 text-center py-4">No quick replies saved</p>
              )}
            </div>
          </div>
        )}

        {/* FOLLOW-UP REMINDERS */}
        {section === 'reminders' && isSeller && (
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <Calendar className="w-3.5 h-3.5" /> Follow-up Reminders
            </div>
            <div className="space-y-2 bg-gray-50 rounded-xl p-3 border border-gray-100">
              <select value={reminderType} onChange={e => setReminderType(e.target.value as ReminderType)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
                {(Object.keys(REMINDER_TYPE_META) as ReminderType[]).map(t => (
                  <option key={t} value={t}>{REMINDER_TYPE_META[t].label}</option>
                ))}
              </select>
              <input type="datetime-local" value={reminderDate} onChange={e => setReminderDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
              <button onClick={handleAddReminder} disabled={!reminderDate}
                className="w-full bg-primary-600 text-white text-sm rounded-lg py-2 font-medium hover:bg-primary-700 disabled:opacity-40">
                Set Reminder
              </button>
            </div>
            <div className="space-y-2">
              {reminders.map(r => {
                const Icon = REMINDER_ICONS[r.reminder_type] || Bell;
                const isOverdue = !r.is_completed && new Date(r.due_at) < new Date();
                return (
                  <div key={r.id} className={`flex items-start gap-2 bg-white border rounded-xl px-3 py-2.5 ${r.is_completed ? 'opacity-50' : isOverdue ? 'border-red-200' : 'border-gray-100'}`}>
                    <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${isOverdue ? 'text-red-400' : 'text-primary-500'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-700">{REMINDER_TYPE_META[r.reminder_type].label}</p>
                      <p className="text-xs text-gray-400">{new Date(r.due_at).toLocaleString()}</p>
                    </div>
                    {!r.is_completed && (
                      <button onClick={() => completeReminder(r.id)} className="p-1 text-green-500 hover:text-green-600 shrink-0">
                        <CheckCircle className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button onClick={() => deleteReminder(r.id)} className="opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:text-red-600 shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
              {reminders.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No reminders set</p>}
            </div>
          </div>
        )}

        {/* CUSTOMER HISTORY */}
        {section === 'customer' && isSeller && (
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <History className="w-3.5 h-3.5" /> Customer History
            </div>
            {historyLoading ? (
              <p className="text-xs text-gray-400 text-center py-4">Loading...</p>
            ) : history ? (
              <>
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-2">
                    <Tag className="w-3.5 h-3.5" /> Customer Tags
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {tags.map(t => (
                      <span key={t.id} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-primary-50 text-primary-600 rounded-full">
                        {t.tag}
                        <button onClick={() => removeTag(t.id)} className="hover:text-red-500"><X className="w-2.5 h-2.5" /></button>
                      </span>
                    ))}
                    {tags.length === 0 && <p className="text-xs text-gray-400">No tags yet</p>}
                  </div>
                  <div className="flex gap-1.5">
                    <input value={newTag} onChange={e => setNewTag(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddTag()}
                      placeholder="Add tag..." className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none" />
                    <button onClick={handleAddTag} className="px-2 bg-primary-600 text-white rounded-lg text-xs"><Plus className="w-3 h-3" /></button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                    <p className="text-lg font-bold text-primary-600">{history.total_conversations}</p>
                    <p className="text-xs text-gray-500">Conversations</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                    <p className="text-lg font-bold text-green-600">{history.total_purchases}</p>
                    <p className="text-xs text-gray-500">Purchases</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                    <p className="text-lg font-bold text-amber-600">{history.wishlist_count}</p>
                    <p className="text-xs text-gray-500">Wishlist Items</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                    <p className="text-lg font-bold text-gray-600">{new Date(history.joined_date).toLocaleDateString()}</p>
                    <p className="text-xs text-gray-500">Joined</p>
                  </div>
                </div>

                {history.location && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <MapPin className="w-3.5 h-3.5" /> {history.location}
                  </div>
                )}

                {history.recent_orders.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-600 mb-2">Recent Orders</p>
                    <div className="space-y-1.5">
                      {history.recent_orders.slice(0, 5).map(o => (
                        <div key={o.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-2.5 py-2 text-xs">
                          <span className="truncate text-gray-600">{o.product_name}</span>
                          <span className="text-primary-600 font-medium shrink-0 ml-2">{o.amount.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {history.previous_conversations.length > 1 && (
                  <div>
                    <p className="text-xs font-medium text-gray-600 mb-2">Previous Conversations</p>
                    <div className="space-y-1.5">
                      {history.previous_conversations.slice(1, 5).map(c => (
                        <div key={c.id} className="bg-gray-50 rounded-lg px-2.5 py-2 text-xs">
                          <p className="text-gray-600 truncate">{c.title}</p>
                          <p className="text-gray-400">{c.last_message_at ? new Date(c.last_message_at).toLocaleDateString() : 'No messages'}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-gray-400 text-center py-4">No history available</p>
            )}
          </div>
        )}

        {/* AI SUMMARY */}
        {section === 'summary' && (
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <Bot className="w-3.5 h-3.5" /> AI Conversation Summary
            </div>
            <p className="text-xs text-gray-400">AI-generated summary of this conversation. Click generate or refresh.</p>
            {summary ? (
              <div className="bg-purple-50 border border-purple-100 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-purple-600">{summary.message_count} messages</span>
                  <span className="text-xs text-gray-400">{new Date(summary.generated_at).toLocaleDateString()}</span>
                </div>
                {summary.bullet_points && summary.bullet_points.length > 0 ? (
                  <ul className="space-y-1.5">
                    {summary.bullet_points.map((b, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-gray-700">
                        <span className="w-1 h-1 rounded-full bg-purple-400 mt-1.5 shrink-0" />
                        {b}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-gray-700">{summary.summary_text}</p>
                )}
              </div>
            ) : (
              <div className="text-center py-6">
                <Bot className="w-10 h-10 text-purple-200 mx-auto mb-2" />
                <p className="text-xs text-gray-400 mb-3">No summary generated yet</p>
              </div>
            )}
            <button
              onClick={async () => {
                const { data: msgs } = await supabase
                  .from('chat_messages')
                  .select('*')
                  .eq('conversation_id', conversation.id)
                  .order('created_at', { ascending: true })
                  .limit(200);
                if (msgs) await generate(msgs as any, userId);
              }}
              disabled={summaryLoading}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-medium hover:bg-purple-700 disabled:opacity-50">
              <Bot className="w-4 h-4" />
              {summaryLoading ? 'Generating...' : summary ? 'Refresh Summary' : 'Generate Summary'}
            </button>
          </div>
        )}

        {/* LABELS */}
        {section === 'labels' && (
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <Tag className="w-3.5 h-3.5" /> Conversation Labels
            </div>
            <div className="space-y-1.5">
              {labels.map(label => {
                const applied = convLabels.some(cl => cl.label_id === label.id);
                return (
                  <button
                    key={label.id}
                    onClick={() => applied ? removeLabel(label.id) : applyLabel(label.id, userId)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                      applied ? 'bg-primary-50 text-primary-700 border border-primary-200' : 'bg-gray-50 text-gray-600 border border-transparent hover:bg-gray-100'
                    }`}
                  >
                    <span>{label.name}</span>
                    {applied && <CheckCircle className="w-3.5 h-3.5" />}
                  </button>
                );
              })}
            </div>
            {convLabels.length > 0 && (
              <div className="pt-2 border-t border-gray-50">
                <p className="text-xs text-gray-400 mb-2">Applied labels:</p>
                <div className="flex flex-wrap gap-1.5">
                  {convLabels.map(cl => (
                    <span key={cl.id} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                      {cl.label?.name}
                      <button onClick={() => removeLabel(cl.label_id)} className="hover:text-red-500"><X className="w-2.5 h-2.5" /></button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="hidden">
        <ChevronDown className="w-4 h-4" />
        <ChevronUp className="w-4 h-4" />
        <AlertCircle className="w-4 h-4" />
      </div>
    </div>
  );
}
