import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Megaphone,
  Plus,
  X,
  Send,
  Loader2,
  CheckCircle,
  AlertCircle,
  Edit2,
  Trash2,
  Power,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface Announcement {
  id: string;
  title: string;
  message: string;
  type: 'news' | 'promo' | 'update';
  is_active: boolean;
  created_by: string;
  created_at: string;
}

const TYPE_STYLES: Record<string, { bg: string; text: string; icon: string }> = {
  news: { bg: 'bg-primary-50', text: 'text-primary-700', icon: 'text-primary-600' },
  promo: { bg: 'bg-success-muted', text: 'text-success', icon: 'text-success' },
  update: { bg: 'bg-warning-muted', text: 'text-warning', icon: 'text-warning' },
};

export default function AdminAnnouncementsPage() {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [form, setForm] = useState<{ title: string; message: string; type: 'news' | 'promo' | 'update' }>({ title: '', message: '', type: 'news' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const fetchAnnouncements = async () => {
    const { data, error } = await supabase
      .from('global_announcements')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setAnnouncements(data as Announcement[]);
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.message.trim()) {
      setError('Title and message are required');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      if (editing) {
        const { error } = await supabase
          .from('global_announcements')
          .update({
            title: form.title.trim(),
            message: form.message.trim(),
            type: form.type,
          })
          .eq('id', editing.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from('global_announcements').insert({
          title: form.title.trim(),
          message: form.message.trim(),
          type: form.type,
          is_active: true,
          created_by: user?.id,
        });

        if (error) throw error;
      }

      setSuccess(true);
      setShowForm(false);
      setEditing(null);
      setForm({ title: '', message: '', type: 'news' });
      fetchAnnouncements();
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError('Failed to save announcement. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (announcement: Announcement) => {
    await supabase
      .from('global_announcements')
      .update({ is_active: !announcement.is_active })
      .eq('id', announcement.id);
    fetchAnnouncements();
  };

  const handleEdit = (announcement: Announcement) => {
    setEditing(announcement);
    setForm({
      title: announcement.title,
      message: announcement.message,
      type: announcement.type,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this announcement?')) return;
    await supabase.from('global_announcements').delete().eq('id', id);
    fetchAnnouncements();
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-gray-300 border-t-warning rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Megaphone className="w-6 h-6 text-warning" />
            Global Announcements
          </h1>
          <p className="text-gray-500 mt-1">Publish news, promos, and updates to user dashboards</p>
        </div>
        <button
          onClick={() => {
            setEditing(null);
            setForm({ title: '', message: '', type: 'news' });
            setShowForm(true);
          }}
          className="flex items-center gap-2 px-4 py-3 bg-warning hover:bg-orange-600 text-white rounded-xl font-semibold transition-colors min-h-[48px]"
        >
          <Plus className="w-5 h-5" />
          <span className="hidden sm:inline">New Announcement</span>
        </button>
      </div>

      <AnimatePresence>
        {success && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center gap-2 bg-success-muted text-success rounded-xl p-3 mb-4"
          >
            <CheckCircle className="w-5 h-5" />
            Announcement saved successfully!
          </motion.div>
        )}
      </AnimatePresence>

      {announcements.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <Megaphone className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-900 font-semibold text-lg">No announcements yet</p>
          <p className="text-sm text-gray-500 mt-1">Create your first announcement to broadcast to users</p>
        </div>
      ) : (
        <div className="space-y-4">
          {announcements.map((a, idx) => {
            const styles = TYPE_STYLES[a.type] || TYPE_STYLES.news;
            return (
              <motion.div
                key={a.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className={`bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden ${!a.is_active ? 'opacity-60' : ''}`}
              >
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase ${styles.bg} ${styles.text}`}>
                          {a.type}
                        </span>
                        {!a.is_active && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                            Inactive
                          </span>
                        )}
                      </div>
                      <h3 className="font-semibold text-gray-900 text-lg">{a.title}</h3>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleEdit(a)}
                        className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                        title="Edit"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => toggleActive(a)}
                        className="p-2 text-gray-400 hover:text-warning hover:bg-warning-muted rounded-lg transition-colors"
                        title={a.is_active ? 'Deactivate' : 'Activate'}
                      >
                        <Power className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(a.id)}
                        className="p-2 text-gray-400 hover:text-error hover:bg-error-muted rounded-lg transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <p className="text-gray-600 text-sm whitespace-pre-wrap">{a.message}</p>
                  <p className="text-xs text-gray-400 mt-3">Created {formatDate(a.created_at)}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Form Modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowForm(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900">
                  {editing ? 'Edit Announcement' : 'New Announcement'}
                </h3>
                <button onClick={() => setShowForm(false)} className="p-1 text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-error text-sm">
                  <AlertCircle className="w-4 h-4" />
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['news', 'promo', 'update'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setForm({ ...form, type: t })}
                        className={`py-2 rounded-xl text-sm font-medium capitalize transition-colors ${
                          form.type === t
                            ? 'bg-warning text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="Announcement title"
                    required
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-warning focus:ring-2 focus:ring-warning/20 outline-none text-gray-900"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Message</label>
                  <textarea
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    placeholder="Write your announcement..."
                    rows={4}
                    required
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-warning focus:ring-2 focus:ring-warning/20 outline-none text-gray-900 resize-none"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="flex-1 py-3 border border-gray-200 rounded-xl font-medium text-gray-600 hover:bg-gray-50 transition-colors min-h-[48px]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 py-3 bg-warning hover:bg-orange-600 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 min-h-[48px]"
                  >
                    {submitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        {editing ? 'Update' : 'Publish'}
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
