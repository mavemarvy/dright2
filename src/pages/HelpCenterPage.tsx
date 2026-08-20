import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, ChevronDown, Headphones, Mail, Phone, MessageCircle,
  Send, Clock, ArrowRight, HelpCircle, FileText, LifeBuoy,
} from 'lucide-react';
import SeoHead from '../components/SeoHead';
import { useHelpCategories, usePublishedHelpArticles, usePublishedFaqs, useSupportDepartments } from '../lib/contentHooks';
import type { HelpArticle, FaqItem } from '../lib/contentTypes';

const ICON_MAP: Record<string, typeof HelpCircle> = {
  HelpCircle, Rocket: HelpCircle, User: HelpCircle, ShoppingCart: HelpCircle,
  Tag: HelpCircle, CreditCard: HelpCircle, Wallet: HelpCircle, Banknote: HelpCircle,
  Users: HelpCircle, Gift: HelpCircle, Megaphone: HelpCircle, Shield: HelpCircle,
  BadgeCheck: HelpCircle,
};

export default function HelpCenterPage() {
  const { categories } = useHelpCategories();
  const { articles } = usePublishedHelpArticles();
  const { faqs } = usePublishedFaqs();
  const { departments } = useSupportDepartments();
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<HelpArticle | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const filteredArticles = useMemo(() => {
    if (!search) return articles;
    const q = search.toLowerCase();
    return articles.filter(a => a.title.toLowerCase().includes(q) || (a.summary || '').toLowerCase().includes(q));
  }, [articles, search]);

  const filteredFaqs = useMemo(() => {
    if (!search) return faqs;
    const q = search.toLowerCase();
    return faqs.filter(f => f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q));
  }, [faqs, search]);

  const popularArticles = useMemo(() => [...filteredArticles].sort((a, b) => b.view_count - a.view_count).slice(0, 5), [filteredArticles]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <SeoHead title="Help Center" description="Find answers, browse articles, and contact DRIGHT support." canonical="/help" />

      {/* Hero */}
      <div className="bg-gradient-to-br from-blue-600 to-blue-800 text-white py-16 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <LifeBuoy className="w-12 h-12 mx-auto mb-4 opacity-80" />
          <h1 className="text-3xl sm:text-4xl font-bold mb-3">How can we help?</h1>
          <p className="text-blue-100 mb-6">Search our help articles, browse FAQs, or contact support</p>
          <div className="relative max-w-xl mx-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search for help..."
              className="w-full pl-12 pr-4 py-4 rounded-2xl bg-white text-gray-900 outline-none shadow-lg"
            />
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-12">
        {/* Categories */}
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">Categories</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-12">
          {categories.map(cat => {
            const Icon = ICON_MAP[cat.icon] || HelpCircle;
            const count = articles.filter(a => a.category_id === cat.id).length;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(selectedCategory === cat.id ? null : cat.id)}
                className={`p-5 rounded-2xl border text-left transition-all ${selectedCategory === cat.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-blue-300'}`}
              >
                <Icon className="w-6 h-6 text-blue-600 mb-3" />
                <h3 className="font-semibold text-gray-900 dark:text-white text-sm">{cat.name}</h3>
                <p className="text-xs text-gray-400 mt-1">{count} articles</p>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Articles */}
          <div className="lg:col-span-2 space-y-6">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
                {selectedCategory ? 'Category Articles' : 'Popular Articles'}
              </h2>
              {popularArticles.length === 0 ? (
                <p className="text-gray-400 text-sm">No articles available yet.</p>
              ) : (
                <div className="space-y-2">
                  {popularArticles.map(article => (
                    <button
                      key={article.id}
                      onClick={() => setSelectedArticle(article)}
                      className="w-full flex items-center gap-3 p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 hover:shadow-md transition-shadow text-left"
                    >
                      <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-gray-900 dark:text-white text-sm truncate">{article.title}</h3>
                        {article.summary && <p className="text-xs text-gray-400 truncate">{article.summary}</p>}
                      </div>
                      <ArrowRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* FAQs */}
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Frequently Asked Questions</h2>
              {filteredFaqs.length === 0 ? (
                <p className="text-gray-400 text-sm">No FAQs available yet.</p>
              ) : (
                <div className="space-y-2">
                  {filteredFaqs.map((faq: FaqItem, i: number) => (
                    <div key={faq.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                      <button
                        onClick={() => setOpenFaq(openFaq === i ? null : i)}
                        className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50"
                      >
                        <span className="font-medium text-gray-900 dark:text-white text-sm">{faq.question}</span>
                        <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${openFaq === i ? 'rotate-180' : ''}`} />
                      </button>
                      <AnimatePresence>
                        {openFaq === i && (
                          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                            <p className="p-4 pt-0 text-sm text-gray-600 dark:text-gray-300" dangerouslySetInnerHTML={{ __html: faq.answer }} />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Contact Support */}
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Contact Support</h2>
            {departments.filter(d => d.is_available).map(dept => (
              <div key={dept.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Headphones className="w-5 h-5 text-blue-600" />
                  <h3 className="font-semibold text-gray-900 dark:text-white text-sm">{dept.name}</h3>
                  <span className="ml-auto w-2 h-2 rounded-full bg-green-500" title="Available" />
                </div>
                {dept.description && <p className="text-xs text-gray-400 mb-3">{dept.description}</p>}
                <div className="space-y-1.5 text-xs">
                  {dept.email && <a href={`mailto:${dept.email}`} className="flex items-center gap-2 text-gray-600 dark:text-gray-300 hover:text-blue-600"><Mail className="w-3.5 h-3.5" /> {dept.email}</a>}
                  {dept.phone && <a href={`tel:${dept.phone}`} className="flex items-center gap-2 text-gray-600 dark:text-gray-300 hover:text-blue-600"><Phone className="w-3.5 h-3.5" /> {dept.phone}</a>}
                  {dept.whatsapp && <a href={dept.whatsapp} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-gray-600 dark:text-gray-300 hover:text-green-600"><MessageCircle className="w-3.5 h-3.5" /> WhatsApp</a>}
                  {dept.telegram && <a href={dept.telegram} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-gray-600 dark:text-gray-300 hover:text-blue-600"><Send className="w-3.5 h-3.5" /> Telegram</a>}
                  {dept.live_chat_link && <a href={dept.live_chat_link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-gray-600 dark:text-gray-300 hover:text-blue-600"><MessageCircle className="w-3.5 h-3.5" /> Live Chat</a>}
                  {dept.working_hours && <p className="flex items-center gap-2 text-gray-400"><Clock className="w-3.5 h-3.5" /> {dept.working_hours}</p>}
                  {dept.avg_response_time && <p className="text-gray-400">Avg response: {dept.avg_response_time}</p>}
                </div>
              </div>
            ))}
            <Link to="/support" className="block w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-center font-medium text-sm">
              Submit a Support Ticket
            </Link>
          </div>
        </div>
      </div>

      {/* Article Modal */}
      <AnimatePresence>
        {selectedArticle && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedArticle(null)} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} onClick={e => e.stopPropagation()} className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">{selectedArticle.title}</h2>
              <div className="prose prose-sm dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: selectedArticle.content }} />
              <button onClick={() => setSelectedArticle(null)} className="mt-6 px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-600 dark:text-gray-300">Close</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
