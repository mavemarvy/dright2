import { useEffect, useState } from 'react';
import { Megaphone, Newspaper, Sparkles } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import SponsoredPlacementCard from './SponsoredPlacementCard';

type Announcement = {
  id: string;
  title: string;
  message: string;
  type: string;
};

const iconByType = {
  news: Newspaper,
  promo: Megaphone,
  update: Sparkles,
};

export default function LeaderboardInformationFeed() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data, error } = await supabase
        .from('global_announcements')
        .select('id,title,message,type')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(5);
      if (!error && alive) setAnnouncements((data || []) as Announcement[]);
    })();
    return () => { alive = false; };
  }, []);

  return (
    <section className="mb-6">
      <div className="mb-3">
        <h2 className="text-base font-black text-gray-900 dark:text-white">Leaderboard & Information</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">Official DRIGHT updates and clearly labelled sponsored opportunities.</p>
      </div>

      <div className="space-y-3">
        <SponsoredPlacementCard placement="leaderboard" variant="feed" heading="Sponsored leaderboard spotlight" />
        {announcements.map((announcement) => {
          const Icon = iconByType[announcement.type as keyof typeof iconByType] || Sparkles;
          return (
            <article key={announcement.id} className="rounded-3xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900 sm:p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 dark:bg-primary-950/50 dark:text-primary-300">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-gray-600 dark:bg-gray-800 dark:text-gray-300">Official DRIGHT</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{announcement.type}</span>
                  </div>
                  <h3 className="mt-2 text-base font-black text-gray-950 dark:text-white">{announcement.title}</h3>
                  <p className="mt-1 whitespace-pre-line text-sm leading-6 text-gray-600 dark:text-gray-300">{announcement.message}</p>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
