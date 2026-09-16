import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ChevronRight,
  Headset,
  History,
  Mail,
  MessageCircle,
  MessageSquare,
  Phone,
  Send,
  Smartphone,
  X,
} from 'lucide-react';
import {
  addContactLog,
  createContact,
  updateContact,
  useContactLogs,
  useCustomerContacts,
} from '../../lib/crmHooks';
import { CONTACT_CHANNELS, CONTACT_OUTCOMES } from '../../lib/crmTypes';
import type { CustomerContact } from '../../lib/crmTypes';
import { PageHeader, LoadingBar } from '../../components/admin/RbacComponents';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

const CARE_CHANNELS = [
  ...CONTACT_CHANNELS,
  ...(CONTACT_CHANNELS.some(channel => channel.value === 'telegram')
    ? []
    : [{ value: 'telegram', label: 'Telegram' }]),
];

function channelIcon(channel: string) {
  switch (channel) {
    case 'email': return <Mail className="w-4 h-4" />;
    case 'phone': return <Phone className="w-4 h-4" />;
    case 'sms': return <Smartphone className="w-4 h-4" />;
    case 'whatsapp':
    case 'telegram': return <MessageCircle className="w-4 h-4" />;
    default: return <MessageSquare className="w-4 h-4" />;
  }
}

function outcomeClass(outcome: string) {
  if (outcome === 'resolved') return 'bg-green-50 text-green-700 border-green-200';
  if (outcome === 'escalated') return 'bg-red-50 text-red-700 border-red-200';
  if (outcome === 'no_response') return 'bg-gray-50 text-gray-600 border-gray-200';
  if (outcome === 'follow_up_needed') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-blue-50 text-blue-700 border-blue-200';
}

export default function AdminCustomerCarePage() {
  const { profile } = useAuth();
  const { contacts, loading, refetch } = useCustomerContacts();
  const [showNew, setShowNew] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);

  const selectedContact = useMemo(
    () => contacts.find(contact => contact.id === selectedContactId) || null,
    [contacts, selectedContactId],
  );

  useEffect(() => {
    const channel = supabase
      .channel('admin-customer-care')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_contacts' }, () => void refetch())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [refetch]);

  return (
    <div className="p-4 md:p-8">
      <PageHeader
        title="Customer Care & Contact Center"
        subtitle="In-app messages are delivered through DRIGHT notifications. Email, phone, SMS, WhatsApp, and Telegram are logged as external interactions until their delivery providers are connected."
      />

      <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        <strong>Delivery status:</strong> In-App is live. Other channels currently preserve the customer-care record only; they do not claim an external message was sent.
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex gap-2 flex-wrap">
          {CARE_CHANNELS.map(channel => (
            <span key={channel.value} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-gray-50 text-gray-500 border border-gray-100">
              {channelIcon(channel.value)} {channel.label}
              {channel.value === 'in_app' ? <span className="text-green-600">· live</span> : <span className="text-gray-400">· log</span>}
            </span>
          ))}
        </div>
        <button onClick={() => setShowNew(true)} className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl">
          <Headset className="w-4 h-4" /> New Contact Record
        </button>
      </div>

      {loading && <LoadingBar />}

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
                <th className="text-right px-4 py-3 font-medium text-gray-600" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {contacts.length === 0 && !loading && (
                <tr><td colSpan={7} className="text-center py-10 text-gray-400">No customer-care interaction records yet</td></tr>
              )}
              {contacts.map(contact => (
                <tr key={contact.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedContactId(contact.id)}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{contact.user?.full_name ?? contact.user?.username ?? 'Unknown'}</p>
                    <p className="text-xs text-gray-400">{contact.user?.email}</p>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="flex items-center gap-1.5 text-gray-600 capitalize">
                      {channelIcon(contact.channel)} {contact.channel.replace(/_/g, ' ')}
                      <span className={`text-[10px] ${contact.channel === 'in_app' ? 'text-green-600' : 'text-gray-400'}`}>
                        {contact.channel === 'in_app' ? 'live' : 'log'}
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700 max-w-xs truncate">{contact.summary}</td>
                  <td className="px-4 py-3 hidden lg:table-cell text-gray-500 text-xs">
                    {contact.follow_up_reminder ? new Date(contact.follow_up_reminder).toLocaleDateString() : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs border ${outcomeClass(contact.outcome)}`}>
                      {CONTACT_OUTCOMES.find(outcome => outcome.value === contact.outcome)?.label ?? contact.outcome}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-gray-400 text-xs">{new Date(contact.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right"><ChevronRight className="w-4 h-4 text-gray-400 inline" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showNew && profile && (
        <NewContactModal
          staffId={profile.id}
          onClose={() => setShowNew(false)}
          onCreated={() => { void refetch(); setShowNew(false); }}
        />
      )}

      {selectedContact && profile && (
        <ContactDetailModal
          contact={selectedContact}
          staffId={profile.id}
          onClose={() => setSelectedContactId(null)}
          onUpdated={() => { void refetch(); }}
        />
      )}
    </div>
  );
}

function NewContactModal({ staffId, onClose, onCreated }: { staffId: string; onClose: () => void; onCreated: () => void }) {
  const [userSearch, setUserSearch] = useState('');
  const [userResults, setUserResults] = useState<{ id: string; email: string; full_name?: string | null; username?: string | null }[]>([]);
  const [selectedUser, setSelectedUser] = useState<{ id: string; email: string; full_name?: string | null; username?: string | null } | null>(null);
  const [channel, setChannel] = useState('in_app');
  const [subject, setSubject] = useState('');
  const [summary, setSummary] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (userSearch.length < 2) { setUserResults([]); return; }
    const timer = window.setTimeout(async () => {
      const escaped = userSearch.replace(/[,%()]/g, ' ').trim();
      const { data, error: searchError } = await supabase
        .from('users')
        .select('id,email,full_name,username')
        .or(`email.ilike.%${escaped}%,full_name.ilike.%${escaped}%,username.ilike.%${escaped}%`)
        .limit(8);
      if (searchError) setError(searchError.message);
      setUserResults(data ?? []);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [userSearch]);

  const handleCreate = async () => {
    if (!selectedUser || !summary.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      await createContact({
        user_id: selectedUser.id,
        staff_id: staffId,
        channel,
        subject: subject.trim() || undefined,
        summary: summary.trim(),
        follow_up_reminder: followUp ? new Date(`${followUp}T12:00:00`).toISOString() : undefined,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create contact record');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto" onClick={event => event.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div><h2 className="font-bold text-gray-900">New Customer Contact Record</h2><p className="text-xs text-gray-400 mt-1">Create the interaction record first; add the actual in-app message from the contact detail.</p></div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl"><X className="w-4 h-4" /></button>
        </div>

        {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-3 text-sm text-red-700 flex gap-2"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{error}</div>}

        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-gray-700">Find Customer</label>
            {selectedUser ? (
              <div className="mt-1 flex items-center justify-between p-2.5 bg-primary-50 rounded-xl border border-primary-200">
                <div><p className="text-sm text-primary-800">{selectedUser.full_name ?? selectedUser.username ?? 'Customer'}</p><p className="text-xs text-primary-600">{selectedUser.email}</p></div>
                <button onClick={() => setSelectedUser(null)} className="text-xs text-primary-600 underline">Change</button>
              </div>
            ) : (
              <>
                <input value={userSearch} onChange={event => setUserSearch(event.target.value)} placeholder="Search by name, email, or username..." className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                {userResults.length > 0 && (
                  <div className="mt-1 border border-gray-100 rounded-xl divide-y divide-gray-50 max-h-44 overflow-y-auto">
                    {userResults.map(user => (
                      <button key={user.id} onClick={() => { setSelectedUser(user); setUserSearch(''); setUserResults([]); }} className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm">
                        <p className="font-medium text-gray-900">{user.full_name ?? user.username ?? 'Unknown'}</p><p className="text-xs text-gray-400">{user.email}</p>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">Interaction Channel</label>
            <select value={channel} onChange={event => setChannel(event.target.value)} className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
              {CARE_CHANNELS.map(option => <option key={option.value} value={option.value}>{option.label}{option.value === 'in_app' ? ' — live delivery' : ' — log only'}</option>)}
            </select>
          </div>
          <div><label className="text-sm font-medium text-gray-700">Subject</label><input value={subject} onChange={event => setSubject(event.target.value)} className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" /></div>
          <div><label className="text-sm font-medium text-gray-700">Internal Summary *</label><textarea value={summary} onChange={event => setSummary(event.target.value)} rows={3} className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" /></div>
          <div><label className="text-sm font-medium text-gray-700">Follow-up Reminder</label><input type="date" value={followUp} onChange={event => setFollowUp(event.target.value)} className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" /></div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl">Cancel</button>
          <button onClick={handleCreate} disabled={saving || !selectedUser || !summary.trim()} className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl disabled:opacity-50">{saving ? 'Creating…' : 'Create Record'}</button>
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
  const [error, setError] = useState<string | null>(null);
  const isInApp = contact.channel === 'in_app';

  useEffect(() => {
    const channel = supabase
      .channel(`customer-contact-logs-${contact.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_contact_logs', filter: `contact_id=eq.${contact.id}` }, () => void refetch())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [contact.id, refetch]);

  const handleSend = async () => {
    if (!newMessage.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      await addContactLog({
        contact_id: contact.id,
        user_id: contact.user_id,
        staff_id: staffId,
        content: newMessage.trim(),
        channel: contact.channel,
      });
      setNewMessage('');
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record interaction');
    } finally {
      setSending(false);
    }
  };

  const handleUpdateOutcome = async (newOutcome: string) => {
    const previous = outcome;
    setOutcome(newOutcome);
    setError(null);
    try {
      await updateContact(contact.id, { outcome: newOutcome });
      onUpdated();
    } catch (err) {
      setOutcome(previous);
      setError(err instanceof Error ? err.message : 'Failed to update outcome');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div className="bg-white w-full max-w-xl h-full overflow-y-auto shadow-xl flex flex-col" onClick={event => event.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-100 p-5 flex items-center justify-between z-10">
          <div><h2 className="font-bold text-gray-900">{contact.user?.full_name ?? contact.user?.username ?? 'Unknown'}</h2><p className="text-xs text-gray-400">{contact.user?.email} — {contact.channel.replace(/_/g, ' ')} — {isInApp ? 'live delivery' : 'interaction log'}</p></div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="bg-gray-50 rounded-2xl p-4">{contact.subject && <p className="font-medium text-sm text-gray-900 mb-1">{contact.subject}</p>}<p className="text-sm text-gray-600">{contact.summary}</p><p className="text-xs text-gray-300 mt-2">Record created {new Date(contact.created_at).toLocaleString()}</p></div>

          {!isInApp && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              This channel is currently a <strong>log-only</strong> workflow. Record here what was handled externally; DRIGHT does not yet claim to send {contact.channel.replace(/_/g, ' ')} messages from this screen.
            </div>
          )}

          <div>
            <h3 className="font-semibold text-sm text-gray-900 mb-2 flex items-center gap-2"><History className="w-4 h-4 text-gray-400" /> Interaction History</h3>
            {logs.length === 0 ? <p className="text-sm text-gray-400">No logged interactions yet</p> : (
              <div className="space-y-2">
                {logs.map(log => (
                  <div key={log.id} className={`p-3 rounded-xl text-sm ${log.staff_id === staffId ? 'bg-primary-50 ml-8' : 'bg-gray-50 mr-8'}`}>
                    <p className="text-gray-700 whitespace-pre-wrap">{log.content}</p><p className="text-xs text-gray-300 mt-1">{new Date(log.created_at).toLocaleString()} · {log.channel.replace(/_/g, ' ')}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-gray-100 p-4 space-y-3">
          {error && <div className="rounded-xl border border-red-200 bg-red-50 p-2.5 text-sm text-red-700 flex gap-2"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{error}</div>}
          <div className="flex gap-2">
            <input value={newMessage} onChange={event => setNewMessage(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void handleSend(); }} placeholder={isInApp ? 'Message the customer in DRIGHT…' : `Log ${contact.channel.replace(/_/g, ' ')} interaction…`} className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            <button onClick={() => void handleSend()} disabled={sending || !newMessage.trim()} className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl disabled:opacity-50">
              <Send className="w-4 h-4" /> {isInApp ? 'Send' : 'Log'}
            </button>
          </div>
          <p className="text-[11px] text-gray-400">{isInApp ? 'Sending creates a user notification and CRM timeline event.' : 'This records the interaction only; external delivery must occur through the external provider.'}</p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Outcome:</span>
            <select value={outcome} onChange={event => void handleUpdateOutcome(event.target.value)} className="px-2 py-1 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500">
              {CONTACT_OUTCOMES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
