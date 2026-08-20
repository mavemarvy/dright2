import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Play, Clock, X, Loader2, Video, BookOpen, Tag,
} from 'lucide-react';
import SeoHead from '../components/SeoHead';
import { useTutorialCategories, usePublishedTutorials } from '../lib/contentHooks';
import type { Tutorial } from '../lib/contentTypes';
import { DIFFICULTY_LEVELS } from '../lib/contentTypes';

export default function TutorialsPage() {
  const { categories } = useTutorialCategories();
  const { tutorials, loading } = usePublishedTutorials();
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedTutorial, setSelectedTutorial] = useState<Tutorial | null>(null);

  const filtered = useMemo(() => {
    let result = tutorials;
    if (selectedCategory) result = result.filter(t => t.category_id === selectedCategory);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(t => t.title.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q));
    }
    return result;
  }, [tutorials, selectedCategory, search]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <SeoHead title="Tutorials & Learning Center" description="Learn how to use DRIGHT with step-by-step video tutorials." canonical="/tutorials" />

      <div className="bg-gradient-to-br from-purple-600 to-purple-800 text-white py-14 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-80" />
          <h1 className="text-3xl sm:text-4xl font-bold mb-3">Learning Center</h1>
          <p className="text-purple-100 mb-6">Watch tutorials and master DRIGHT</p>
          <div className="relative max-w-xl mx-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tutorials..." className="w-full pl-12 pr-4 py-4 rounded-2xl bg-white text-gray-900 outline-none shadow-lg" />
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-10">
        {/* Categories */}
        <div className="flex flex-wrap gap-2 mb-8">
          <button onClick={() => setSelectedCategory(null)} className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${!selectedCategory ? 'bg-purple-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700'}`}>All</button>
          {categories.map(cat => (
            <button key={cat.id} onClick={() => setSelectedCategory(selectedCategory === cat.id ? null : cat.id)} className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${selectedCategory === cat.id ? 'bg-purple-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700'}`}>{cat.name}</button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-purple-500 animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400"><Video className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>No tutorials available yet.</p></div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map(tutorial => {
              const diff = DIFFICULTY_LEVELS.find(d => d.value === tutorial.difficulty);
              return (
                <motion.button
                  key={tutorial.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => setSelectedTutorial(tutorial)}
                  className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden hover:shadow-lg transition-shadow text-left"
                >
                  <div className="aspect-video bg-gray-100 dark:bg-gray-700 relative">
                    {tutorial.thumbnail ? (
                      <img src={tutorial.thumbnail} alt={tutorial.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"><Video className="w-10 h-10 text-gray-300" /></div>
                    )}
                    <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                      <div className="w-12 h-12 bg-white/30 backdrop-blur rounded-full flex items-center justify-center"><Play className="w-5 h-5 text-white ml-0.5" fill="white" /></div>
                    </div>
                    {tutorial.duration_minutes > 0 && (
                      <span className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-0.5 rounded-md flex items-center gap-1"><Clock className="w-3 h-3" /> {tutorial.duration_minutes}m</span>
                    )}
                  </div>
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      {diff && <span className={`text-xs px-2 py-0.5 rounded-full bg-${diff.color}-100 text-${diff.color}-700`}>{diff.label}</span>}
                      {tutorial.category && <span className="text-xs text-gray-400">{tutorial.category.name}</span>}
                    </div>
                    <h3 className="font-semibold text-gray-900 dark:text-white text-sm mb-1 line-clamp-2">{tutorial.title}</h3>
                    {tutorial.description && <p className="text-xs text-gray-400 line-clamp-2">{tutorial.description}</p>}
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}
      </div>

      {/* Tutorial Player Modal */}
      <AnimatePresence>
        {selectedTutorial && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedTutorial(null)} className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} onClick={e => e.stopPropagation()} className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-700">
                <h2 className="font-bold text-gray-900 dark:text-white text-lg">{selectedTutorial.title}</h2>
                <button onClick={() => setSelectedTutorial(null)} className="p-1 text-gray-400"><X className="w-5 h-5" /></button>
              </div>
              <TutorialPlayer tutorial={selectedTutorial} />
              <div className="p-6">
                {selectedTutorial.description && <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">{selectedTutorial.description}</p>}
                <div className="prose prose-sm dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: selectedTutorial.content }} />
                <div className="flex flex-wrap gap-2 mt-4">
                  {selectedTutorial.tags.map(tag => <span key={tag} className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 px-2 py-1 rounded-md flex items-center gap-1"><Tag className="w-3 h-3" />{tag}</span>)}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TutorialPlayer({ tutorial }: { tutorial: Tutorial }) {
  if (!tutorial.video_url) {
    return <div className="aspect-video bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-400">No video available</div>;
  }

  if (tutorial.video_type === 'youtube') {
    const videoId = tutorial.video_url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/))([\w-]{11})/)?.[1];
    if (!videoId) return <div className="aspect-video bg-gray-100 flex items-center justify-center text-gray-400">Invalid YouTube URL</div>;
    return <div className="aspect-video bg-black"><iframe src={`https://www.youtube.com/embed/${videoId}`} className="w-full h-full" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen title={tutorial.title} /></div>;
  }

  if (tutorial.video_type === 'vimeo') {
    const videoId = tutorial.video_url.match(/vimeo\.com\/(?:video\/)?(\d+)/)?.[1];
    if (!videoId) return <div className="aspect-video bg-gray-100 flex items-center justify-center text-gray-400">Invalid Vimeo URL</div>;
    return <div className="aspect-video bg-black"><iframe src={`https://player.vimeo.com/video/${videoId}`} className="w-full h-full" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen title={tutorial.title} /></div>;
  }

  return <div className="aspect-video bg-black"><video src={tutorial.video_url} controls className="w-full h-full" poster={tutorial.video_thumbnail || undefined} /></div>;
}
