import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Megaphone, Loader2, Tag, AlertTriangle, Bell } from 'lucide-react';
import SeoHead from '../components/SeoHead';
import { supabase } from '../lib/supabase';

interface Announcement {
  id: string;
  title: string;
  message: string;
  type: 'news' | 'promo' | 'update';
  is_active: boolean;
  created_at: string;
}

const TYPE_CONFIG: Record<string, { icon: typeof Tag; color: string; bg: string }> = {
  news: { icon: Megaphone, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20' },
  promo: { icon: Tag, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/20' },
  update: { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20' },
};

export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase.from('global_announcements').select('*').eq('is_active', true).order('created_at', { ascending: false });
      setAnnouncements((data || []) as Announcement[]);
      setLoading(false);
    };
    load();
  }, []);

  const filtered = filter === 'all' ? announcements : announcements.filter(a => a.type === filter);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <SeoHead title="Announcements" description="Latest news, updates, and promotions from DRIGHT." canonical="/announcements" />

      <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white py-14 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <Megaphone className="w-12 h-12 mx-auto mb-4 opacity-80" />
          <h1 className="text-3xl sm:text-4xl font-bold mb-3">Announcements</h1>
          <p className="text-blue-100">Stay up to date with the latest from DRIGHT</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-10">
        <div className="flex flex-wrap gap-2 mb-6">
          <button onClick={() => setFilter('all')} className={`px-4 py-2 rounded-xl text-sm font-medium ${filter === 'all' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700'}`}>All</button>
          {['news', 'promo', 'update'].map(t => (
            <button key={t} onClick={() => setFilter(t)} className={`px-4 py-2 rounded-xl text-sm font-medium capitalize ${filter === t ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700'}`}>{t}</button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-blue-500 animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400"><Bell className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>No announcements available.</p></div>
        ) : (
          <div className="space-y-4">
            {filtered.map((a, i) => {
              const config = TYPE_CONFIG[a.type] || TYPE_CONFIG.news;
              const Icon = config.icon;
              return (
                <motion.div
                  key={a.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5"
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${config.bg}`}>
                      <Icon className={`w-5 h-5 ${config.color}`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium uppercase ${config.bg} ${config.color}`}>{a.type}</span>
                        <span className="text-xs text-gray-400">{new Date(a.created_at).toLocaleDateString()}</span>
                      </div>
                      <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{a.title}</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">{a.message}</p>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
