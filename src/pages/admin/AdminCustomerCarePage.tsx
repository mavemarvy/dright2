import { useState, useEffect } from 'react';
import { useCustomerContacts, createContact, updateContact, useContactLogs, addContactLog } from '../../lib/crmHooks';
import { CONTACT_CHANNELS, CONTACT_OUTCOMES } from '../../lib/crmTypes';
import type { CustomerContact } from '../../lib/crmTypes';
import { PageHeader, LoadingBar } from '../../components/admin/RbacComponents';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Headset, Send, MessageSquare, Mail, Phone, Smartphone, MessageCircle, X, History, ChevronRight } from 'lucide-react';

export default function AdminCustomerCarePage() {
  const { profile } = useAuth();
  const { contacts, loading, refetch } = useCustomerContacts();
  const [showNew, setShowNew] = useState(false);
  const [selectedContact, setSelectedContact] = useState<CustomerContact | null>(null);

  const channelIcon = (ch: string) => {
    switch (ch) {
      case 'email': return <Mail className="w-4 h-4" />;
      case 'phone': return <Phone className="w-4 h-4" />;
      case 'sms': return <Smartphone className="w-4 h-4" />;
      case 'whatsapp': return <MessageCircle className="w-4 h-4" />;
      default: return <MessageSquare className="w-4 h-4" />;
    }
  };

  return (
    <div className="p-4 md:p-8">
      <PageHeader title="Customer Care & Contact Center" subtitle="Unified communication hub — in-app, email, phone, SMS, and WhatsApp. Every interaction is logged." />

      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2 flex-wrap">
          {CONTACT_CHANNELS.map((ch) => (
            <span key={ch.value} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-gray-50 text-gray-500 border border-gray-100">
              {channelIcon(ch.value)} {ch.label}
            </span>
          ))}
        </div>
        <button onClick={() => setShowNew(true)} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl">
          <Headset className="w-4 h-4" /> New Contact
        </button>
      </div>

      {loading && <LoadingBar />}

      {/* Contacts List */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Customer</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Channel</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Summary</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">Follow-up</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Outcome</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Date</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {contacts.length === 0 && !loading && (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400">No contact records yet</td></tr>
              )}
              {contacts.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedContact(c)}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{c.user?.full_name ?? c.user?.username ?? 'Unknown'}</p>
                    <p className="text-xs text-gray-400">{c.user?.email}</p>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="flex items-center gap-1.5 text-gray-600 capitalize">{channelIcon(c.channel)} {c.channel.replace(/_/g, ' ')}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-700 max-w-xs truncate">{c.summary}</td>
                  <td className="px-4 py-3 hidden lg:table-cell text-gray-500 text-xs">
                    {c.follow_up_reminder ? new Date(c.follow_up_reminder).toLocaleDateString() : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs border ${
                      c.outcome === 'resolved' ? 'bg-green-50 text-green-700 border-green-200' :
                      c.outcome === 'escalated' ? 'bg-red-50 text-red-700 border-red-200' :
                      c.outcome === 'no_response' ? 'bg-gray-50 text-gray-600 border-gray-200' :
                      'bg-blue-50 text-blue-700 border-blue-200'
                    }`}>{CONTACT_OUTCOMES.find((o) => o.value === c.outcome)?.label ?? c.outcome}</span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-gray-400 text-xs">{new Date(c.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right"><ChevronRight className="w-4 h-4 text-gray-400 inline" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Contact Modal */}
      {showNew && profile && <NewContactModal staffId={profile.id} onClose={() => setShowNew(false)} onCreated={() => { void refetch(); setShowNew(false); }} />}

      {/* Contact Detail with Logs */}
      {selectedContact && profile && (
        <ContactDetailModal contact={selectedContact} staffId={profile.id} onClose={() => setSelectedContact(null)} onUpdated={() => { void refetch(); }} />
      )}
    </div>
  );
}

function NewContactModal({ staffId, onClose, onCreated }: { staffId: string; onClose: () => void; onCreated: () => void }) {
  const [userSearch, setUserSearch] = useState('');
  const [userResults, setUserResults] = useState<{ id: string; email: string; full_name?: string | null; username?: string | null }[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [channel, setChannel] = useState('in_app');
  const [subject, setSubject] = useState('');
  const [summary, setSummary] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (userSearch.length < 2) { setUserResults([]); return; }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('users')
        .select('id, email, full_name, username')
        .or(`email.ilike.%${userSearch}%,full_name.ilike.%${userSearch}%,username.ilike.%${userSearch}%`)
        .limit(5);
      setUserResults(data ?? []);
    }, 300);
    return () => clearTimeout(timer);
  }, [userSearch]);

  const handleCreate = async () => {
    if (!selectedUserId || !summary.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await createContact({
        user_id: selectedUserId,
        staff_id: staffId,
        channel,
        subject: subject || undefined,
        summary,
        follow_up_reminder: followUp ? new Date(followUp).toISOString() : undefined,
      });
      onCreated();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to create contact'); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-900">New Customer Contact</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl"><X className="w-4 h-4" /></button>
        </div>

        {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-3 text-sm text-red-700">{error}</div>}

        <div className="space-y-3">
          {/* User Search */}
          <div>
            <label className="text-sm font-medium text-gray-700">Find Customer</label>
            {selectedUserId ? (
              <div className="mt-1 flex items-center justify-between p-2.5 bg-primary-50 rounded-xl border border-primary-200">
                <span className="text-sm text-primary-700">{userResults.find((u) => u.id === selectedUserId)?.email}</span>
                <button onClick={() => setSelectedUserId(null)} className="text-xs text-primary-600 underline">Change</button>
              </div>
            ) : (
              <>
                <input type="text" value={userSearch} onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search by name, email, or username..."
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                {userResults.length > 0 && (
                  <div className="mt-1 border border-gray-100 rounded-xl divide-y divide-gray-50 max-h-40 overflow-y-auto">
                    {userResults.map((u) => (
                      <button key={u.id} onClick={() => { setSelectedUserId(u.id); setUserSearch(''); setUserResults([]); }}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm">
                        <p className="font-medium text-gray-900">{u.full_name ?? u.username ?? 'Unknown'}</p>
                        <p className="text-xs text-gray-400">{u.email}</p>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">Channel</label>
            <select value={channel} onChange={(e) => setChannel(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
              {CONTACT_CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Subject</label>
            <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Summary *</label>
            <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3}
              className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Follow-up Reminder</label>
            <input type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl">Cancel</button>
          <button onClick={handleCreate} disabled={saving || !selectedUserId || !summary.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl disabled:opacity-50">Create Contact</button>
        </div>
      </div>
    </div>
  );
}

function ContactDetailModal({ contact, staffId, onClose, onUpdated }: { contact: CustomerContact; staffId: string; onClose: () => void; onUpdated: () => void }) {
  const { logs, refetch } = useContactLogs(contact.id);
  const [newMessage, setNewMessage] = useState('');
  const [outcome, setOutcome] = useState(contact.outcome);
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!newMessage.trim()) return;
    setSending(true);
    try {
      await addContactLog({
        contact_id: contact.id,
        user_id: contact.user_id,
        staff_id: staffId,
        content: newMessage,
        channel: contact.channel,
      });
      setNewMessage('');
      void refetch();
    } catch { /* ignore */ }
    setSending(false);
  };

  const handleUpdateOutcome = async (newOutcome: string) => {
    setOutcome(newOutcome);
    try {
      await updateContact(contact.id, { outcome: newOutcome });
      void onUpdated();
    } catch { /* ignore */ }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div className="bg-white w-full max-w-xl h-full overflow-y-auto shadow-xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 p-5 flex items-center justify-between z-10">
          <div>
            <h2 className="font-bold text-gray-900">{contact.user?.full_name ?? contact.user?.username ?? 'Unknown'}</h2>
            <p className="text-xs text-gray-400">{contact.user?.email} — {contact.channel.replace(/_/g, ' ')}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Contact Summary */}
          <div className="bg-gray-50 rounded-2xl p-4">
            {contact.subject && <p className="font-medium text-sm text-gray-900 mb-1">{contact.subject}</p>}
            <p className="text-sm text-gray-600">{contact.summary}</p>
            <p className="text-xs text-gray-300 mt-2">{new Date(contact.created_at).toLocaleString()}</p>
          </div>

          {/* Logs */}
          <div>
            <h3 className="font-semibold text-sm text-gray-900 mb-2 flex items-center gap-2"><History className="w-4 h-4 text-gray-400" /> Interaction Log</h3>
            {logs.length === 0 ? (
              <p className="text-sm text-gray-400">No logged interactions yet</p>
            ) : (
              <div className="space-y-2">
                {logs.map((log) => (
                  <div key={log.id} className={`p-3 rounded-xl text-sm ${log.staff_id === staffId ? 'bg-primary-50 ml-8' : 'bg-gray-50 mr-8'}`}>
                    <p className="text-gray-700">{log.content}</p>
                    <p className="text-xs text-gray-300 mt-1">{new Date(log.created_at).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 p-4 space-y-3">
          <div className="flex gap-2">
            <input value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Add a log entry..." className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            <button onClick={handleSend} disabled={sending || !newMessage.trim()} className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl disabled:opacity-50">
              <Send className="w-4 h-4" /> Log
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Outcome:</span>
            <select value={outcome} onChange={(e) => handleUpdateOutcome(e.target.value)}
              className="px-2 py-1 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500">
              {CONTACT_OUTCOMES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
