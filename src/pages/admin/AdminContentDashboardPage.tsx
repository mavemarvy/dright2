import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HelpCircle, Headphones, GraduationCap, Trophy, FileText, Shield,
  Plus, Edit2, Trash2, Eye, EyeOff, X, Save, CheckCircle,
  AlertCircle,
} from 'lucide-react';
import {
  useHelpCategories, useAllFaqs, useHelpArticles,
  useSupportDepartments, useTutorialCategories, useAllTutorials,
  useAllChallenges, useAllLegalPages, usePermissionInfo,
  createHelpArticle, updateHelpArticle, deleteHelpArticle,
  createFaq, updateFaq, deleteFaq,
  createDepartment, updateDepartment, deleteDepartment,
  createTutorial, updateTutorial, deleteTutorial,
  createChallenge, updateChallenge, deleteChallenge,
  createLegalPage, updateLegalPage, deleteLegalPage, saveLegalPageVersion,
  updatePermissionInfo,
} from '../../lib/contentHooks';
import { LEGAL_PAGE_TYPES, PERMISSION_TYPES, DIFFICULTY_LEVELS, CHALLENGE_STATUSES } from '../../lib/contentTypes';
import type {
  HelpArticle, FaqItem, SupportDepartment, Tutorial, Challenge, LegalPage,
} from '../../lib/contentTypes';

type Tab = 'help' | 'support' | 'tutorials' | 'challenges' | 'legal' | 'permissions';

const TABS: Array<{ id: Tab; label: string; icon: typeof HelpCircle }> = [
  { id: 'help', label: 'Help & FAQ', icon: HelpCircle },
  { id: 'support', label: 'Support', icon: Headphones },
  { id: 'tutorials', label: 'Tutorials', icon: GraduationCap },
  { id: 'challenges', label: 'Challenges', icon: Trophy },
  { id: 'legal', label: 'Legal', icon: FileText },
  { id: 'permissions', label: 'Permissions', icon: Shield },
];

export default function AdminContentDashboardPage() {
  const [tab, setTab] = useState<Tab>('help');

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Content Dashboard</h1>
        <p className="text-gray-500 mt-1">Manage help articles, FAQs, support, tutorials, challenges, legal pages, and permissions</p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-6 border-b border-gray-200 dark:border-gray-700 pb-2">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${tab === t.id ? 'bg-blue-600 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
            >
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'help' && <HelpTab />}
      {tab === 'support' && <SupportTab />}
      {tab === 'tutorials' && <TutorialsTab />}
      {tab === 'challenges' && <ChallengesTab />}
      {tab === 'legal' && <LegalTab />}
      {tab === 'permissions' && <PermissionsTab />}
    </div>
  );
}

// ─── Shared UI helpers ──────────────────────────────────────────────────────────

function Toast({ toast }: { toast: { type: 'success' | 'error'; message: string } | null }) {
  if (!toast) return null;
  return (
    <div className={`mb-4 rounded-xl p-3 flex items-center gap-2 text-sm ${toast.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
      {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
      {toast.message}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} onClick={e => e.stopPropagation()} className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 p-4 flex items-center justify-between z-10">
          <h2 className="font-semibold text-gray-900 dark:text-white">{title}</h2>
          <button onClick={onClose} className="p-1 text-gray-400"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6">{children}</div>
      </motion.div>
    </motion.div>
  );
}

function Input({ label, value, onChange, type = 'text', placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="editor-input" />
    </div>
  );
}

function TextArea({ label, value, onChange, rows = 4, placeholder }: { label: string; value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
      <textarea rows={rows} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="editor-input" />
    </div>
  );
}

function SelectInput({ label, value, options, onChange }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} className="editor-input">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function ToggleInput({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <button type="button" onClick={() => onChange(!value)} className={`w-10 h-6 rounded-full transition-colors ${value ? 'bg-blue-600' : 'bg-gray-300'}`}>
        <span className={`block w-4 h-4 bg-white rounded-full transition-transform ${value ? 'translate-x-5' : 'translate-x-1'}`} />
      </button>
      <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
    </label>
  );
}

function ActionButton({ onClick, icon: Icon, title, color = 'gray' }: { onClick: () => void; icon: typeof Edit2; title: string; color?: string }) {
  const colors: Record<string, string> = {
    gray: 'text-gray-400 hover:text-gray-600 hover:bg-gray-100',
    blue: 'text-gray-400 hover:text-blue-600 hover:bg-blue-50',
    red: 'text-gray-400 hover:text-red-600 hover:bg-red-50',
    green: 'text-gray-400 hover:text-green-600 hover:bg-green-50',
    amber: 'text-gray-400 hover:text-amber-600 hover:bg-amber-50',
  };
  return <button onClick={onClick} className={`p-2 rounded-lg transition-colors ${colors[color] || colors.gray}`} title={title}><Icon className="w-4 h-4" /></button>;
}

// ─── Help Tab ───────────────────────────────────────────────────────────────────

function HelpTab() {
  const { categories } = useHelpCategories();
  const { articles, setArticles } = useHelpArticles();
  const { faqs, setFaqs } = useAllFaqs();
  const [subTab, setSubTab] = useState<'articles' | 'faqs'>('articles');
  const [editing, setEditing] = useState<HelpArticle | FaqItem | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => { setToast({ type, message }); setTimeout(() => setToast(null), 3000); };

  return (
    <div>
      <Toast toast={toast} />
      <div className="flex gap-2 mb-4">
        <button onClick={() => setSubTab('articles')} className={`px-4 py-2 rounded-xl text-sm font-medium ${subTab === 'articles' ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white' : 'text-gray-500'}`}>Articles ({articles.length})</button>
        <button onClick={() => setSubTab('faqs')} className={`px-4 py-2 rounded-xl text-sm font-medium ${subTab === 'faqs' ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white' : 'text-gray-500'}`}>FAQs ({faqs.length})</button>
      </div>

      {subTab === 'articles' ? (
        <div>
          <button onClick={async () => { try { const a = await createHelpArticle('New Article', `article-${Date.now()}`, null); setArticles([a, ...articles]); setEditing(a); } catch { showToast('error', 'Failed to create'); } }} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm mb-4"><Plus className="w-4 h-4" /> New Article</button>
          <div className="space-y-2">
            {articles.map(article => (
              <div key={article.id} className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-gray-900 dark:text-white text-sm truncate">{article.title}</h3>
                  <p className="text-xs text-gray-400">{article.category?.name || 'Uncategorized'} · {article.view_count} views · {article.status}</p>
                </div>
                <ActionButton onClick={() => setEditing(article)} icon={Edit2} title="Edit" color="blue" />
                <ActionButton onClick={() => { updateHelpArticle(article.id, { is_published: !article.is_published }).then(() => setArticles(articles.map(a => a.id === article.id ? { ...a, is_published: !a.is_published } : a))); }} icon={article.is_published ? Eye : EyeOff} title={article.is_published ? 'Unpublish' : 'Publish'} color="green" />
                <ActionButton onClick={async () => { await deleteHelpArticle(article.id); setArticles(articles.filter(a => a.id !== article.id)); showToast('success', 'Deleted'); }} icon={Trash2} title="Delete" color="red" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div>
          <button onClick={async () => { try { const f = await createFaq('New Question', '', null); setFaqs([f, ...faqs]); setEditing(f); } catch { showToast('error', 'Failed to create'); } }} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm mb-4"><Plus className="w-4 h-4" /> New FAQ</button>
          <div className="space-y-2">
            {faqs.map(faq => (
              <div key={faq.id} className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-gray-900 dark:text-white text-sm truncate">{faq.question}</h3>
                  <p className="text-xs text-gray-400">{faq.category?.name || 'Uncategorized'} · {faq.status}</p>
                </div>
                <ActionButton onClick={() => setEditing(faq)} icon={Edit2} title="Edit" color="blue" />
                <ActionButton onClick={() => { updateFaq(faq.id, { is_published: !faq.is_published }).then(() => setFaqs(faqs.map(f => f.id === faq.id ? { ...f, is_published: !f.is_published } : f))); }} icon={faq.is_published ? Eye : EyeOff} title={faq.is_published ? 'Unpublish' : 'Publish'} color="green" />
                <ActionButton onClick={async () => { await deleteFaq(faq.id); setFaqs(faqs.filter(f => f.id !== faq.id)); showToast('success', 'Deleted'); }} icon={Trash2} title="Delete" color="red" />
              </div>
            ))}
          </div>
        </div>
      )}

      <AnimatePresence>
        {editing && (
          <Modal title={subTab === 'articles' ? 'Edit Article' : 'Edit FAQ'} onClose={() => setEditing(null)}>
            {subTab === 'articles' ? (
              <ArticleEditor article={editing as HelpArticle} categories={categories} onSave={async (updates) => { await updateHelpArticle(editing.id, updates); setArticles(articles.map(a => a.id === editing.id ? { ...a, ...updates } as HelpArticle : a)); setEditing(null); showToast('success', 'Saved'); }} />
            ) : (
              <FaqEditor faq={editing as FaqItem} categories={categories} onSave={async (updates) => { await updateFaq(editing.id, updates); setFaqs(faqs.map(f => f.id === editing.id ? { ...f, ...updates } as FaqItem : f)); setEditing(null); showToast('success', 'Saved'); }} />
            )}
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}

function ArticleEditor({ article, categories, onSave }: { article: HelpArticle; categories: any[]; onSave: (u: Partial<HelpArticle>) => void }) {
  const [form, setForm] = useState({ title: article.title, slug: article.slug, content: article.content, summary: article.summary || '', category_id: article.category_id || '', is_published: article.is_published, tags: (article.tags || []).join(', ') });
  return (
    <div className="space-y-4">
      <Input label="Title" value={form.title} onChange={v => setForm({ ...form, title: v })} />
      <Input label="Slug" value={form.slug} onChange={v => setForm({ ...form, slug: v })} />
      <SelectInput label="Category" value={form.category_id} onChange={v => setForm({ ...form, category_id: v })} options={[{ value: '', label: 'Uncategorized' }, ...categories.map((c: any) => ({ value: c.id, label: c.name }))]} />
      <Input label="Summary" value={form.summary} onChange={v => setForm({ ...form, summary: v })} />
      <TextArea label="Content (HTML)" value={form.content} onChange={v => setForm({ ...form, content: v })} rows={8} />
      <Input label="Tags (comma-separated)" value={form.tags} onChange={v => setForm({ ...form, tags: v })} />
      <ToggleInput label="Published" value={form.is_published} onChange={v => setForm({ ...form, is_published: v })} />
      <button onClick={() => onSave({ title: form.title, slug: form.slug, content: form.content, summary: form.summary || null, category_id: form.category_id || null, is_published: form.is_published, tags: form.tags ? form.tags.split(',').map(t => t.trim()) : [] })} className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm"><Save className="w-4 h-4" /> Save</button>
    </div>
  );
}

function FaqEditor({ faq, categories, onSave }: { faq: FaqItem; categories: any[]; onSave: (u: Partial<FaqItem>) => void }) {
  const [form, setForm] = useState({ question: faq.question, answer: faq.answer, category_id: faq.category_id || '', is_published: faq.is_published, tags: (faq.tags || []).join(', ') });
  return (
    <div className="space-y-4">
      <Input label="Question" value={form.question} onChange={v => setForm({ ...form, question: v })} />
      <TextArea label="Answer (HTML)" value={form.answer} onChange={v => setForm({ ...form, answer: v })} rows={5} />
      <SelectInput label="Category" value={form.category_id} onChange={v => setForm({ ...form, category_id: v })} options={[{ value: '', label: 'Uncategorized' }, ...categories.map((c: any) => ({ value: c.id, label: c.name }))]} />
      <Input label="Tags (comma-separated)" value={form.tags} onChange={v => setForm({ ...form, tags: v })} />
      <ToggleInput label="Published" value={form.is_published} onChange={v => setForm({ ...form, is_published: v })} />
      <button onClick={() => onSave({ question: form.question, answer: form.answer, category_id: form.category_id || null, is_published: form.is_published, tags: form.tags ? form.tags.split(',').map(t => t.trim()) : [] })} className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm"><Save className="w-4 h-4" /> Save</button>
    </div>
  );
}

// ─── Support Tab ────────────────────────────────────────────────────────────────

function SupportTab() {
  const { departments, setDepartments } = useSupportDepartments();
  const [editing, setEditing] = useState<SupportDepartment | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const showToast = (type: 'success' | 'error', message: string) => { setToast({ type, message }); setTimeout(() => setToast(null), 3000); };

  return (
    <div>
      <Toast toast={toast} />
      <button onClick={() => setEditing({} as SupportDepartment)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm mb-4"><Plus className="w-4 h-4" /> New Department</button>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {departments.map(dept => (
          <div key={dept.id} className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
            <div className="flex items-start justify-between mb-2">
              <div>
                <h3 className="font-medium text-gray-900 dark:text-white text-sm">{dept.name}</h3>
                {dept.email && <p className="text-xs text-gray-400">{dept.email}</p>}
              </div>
              <span className={`w-2 h-2 rounded-full ${dept.is_available ? 'bg-green-500' : 'bg-gray-300'}`} />
            </div>
            {dept.description && <p className="text-xs text-gray-400 mb-2">{dept.description}</p>}
            <div className="flex gap-1 mt-2">
              <ActionButton onClick={() => setEditing(dept)} icon={Edit2} title="Edit" color="blue" />
              <ActionButton onClick={async () => { await deleteDepartment(dept.id); setDepartments(departments.filter(d => d.id !== dept.id)); showToast('success', 'Deleted'); }} icon={Trash2} title="Delete" color="red" />
            </div>
          </div>
        ))}
      </div>

      <AnimatePresence>
        {editing && (
          <Modal title={editing.id ? 'Edit Department' : 'New Department'} onClose={() => setEditing(null)}>
            <DepartmentEditor dept={editing} onSave={async (data) => {
              if (editing.id) { const updated = await updateDepartment(editing.id, data); setDepartments(departments.map(d => d.id === editing.id ? updated : d)); }
              else { const created = await createDepartment(data); setDepartments([...departments, created]); }
              setEditing(null); showToast('success', 'Saved');
            }} />
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}

function DepartmentEditor({ dept, onSave }: { dept: SupportDepartment; onSave: (data: Partial<SupportDepartment>) => void }) {
  const [form, setForm] = useState({
    name: dept.name || '', description: dept.description || '', email: dept.email || '',
    phone: dept.phone || '', whatsapp: dept.whatsapp || '', telegram: dept.telegram || '',
    messenger: dept.messenger || '', live_chat_link: dept.live_chat_link || '',
    working_hours: dept.working_hours || '', avg_response_time: dept.avg_response_time || '',
    is_available: dept.is_available ?? true,
  });
  return (
    <div className="space-y-4">
      <Input label="Department Name" value={form.name} onChange={v => setForm({ ...form, name: v })} />
      <TextArea label="Description" value={form.description} onChange={v => setForm({ ...form, description: v })} rows={2} />
      <div className="grid grid-cols-2 gap-3">
        <Input label="Email" value={form.email} onChange={v => setForm({ ...form, email: v })} />
        <Input label="Phone" value={form.phone} onChange={v => setForm({ ...form, phone: v })} />
        <Input label="WhatsApp URL" value={form.whatsapp} onChange={v => setForm({ ...form, whatsapp: v })} />
        <Input label="Telegram URL" value={form.telegram} onChange={v => setForm({ ...form, telegram: v })} />
        <Input label="Messenger URL" value={form.messenger} onChange={v => setForm({ ...form, messenger: v })} />
        <Input label="Live Chat Link" value={form.live_chat_link} onChange={v => setForm({ ...form, live_chat_link: v })} />
      </div>
      <Input label="Working Hours" value={form.working_hours} onChange={v => setForm({ ...form, working_hours: v })} placeholder="Mon-Fri 9 AM - 6 PM" />
      <Input label="Average Response Time" value={form.avg_response_time} onChange={v => setForm({ ...form, avg_response_time: v })} placeholder="Within 24 hours" />
      <ToggleInput label="Available" value={form.is_available} onChange={v => setForm({ ...form, is_available: v })} />
      <button onClick={() => onSave(form)} className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm"><Save className="w-4 h-4" /> Save</button>
    </div>
  );
}

// ─── Tutorials Tab ──────────────────────────────────────────────────────────────

function TutorialsTab() {
  const { categories } = useTutorialCategories();
  const { tutorials, setTutorials } = useAllTutorials();
  const [editing, setEditing] = useState<Tutorial | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const showToast = (type: 'success' | 'error', message: string) => { setToast({ type, message }); setTimeout(() => setToast(null), 3000); };

  return (
    <div>
      <Toast toast={toast} />
      <button onClick={async () => { try { const t = await createTutorial('New Tutorial', `tutorial-${Date.now()}`, null); setTutorials([t, ...tutorials]); setEditing(t); } catch { showToast('error', 'Failed'); } }} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm mb-4"><Plus className="w-4 h-4" /> New Tutorial</button>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {tutorials.map(tut => (
          <div key={tut.id} className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-gray-900 dark:text-white text-sm truncate">{tut.title}</h3>
                <p className="text-xs text-gray-400">{tut.category?.name || 'Uncategorized'} · {tut.difficulty}</p>
              </div>
            </div>
            <div className="flex gap-1 mt-2">
              <ActionButton onClick={() => setEditing(tut)} icon={Edit2} title="Edit" color="blue" />
              <ActionButton onClick={() => { updateTutorial(tut.id, { is_published: !tut.is_published }).then(() => setTutorials(tutorials.map(t => t.id === tut.id ? { ...t, is_published: !tut.is_published } : t))); }} icon={tut.is_published ? Eye : EyeOff} title={tut.is_published ? 'Unpublish' : 'Publish'} color="green" />
              <ActionButton onClick={async () => { await deleteTutorial(tut.id); setTutorials(tutorials.filter(t => t.id !== tut.id)); showToast('success', 'Deleted'); }} icon={Trash2} title="Delete" color="red" />
            </div>
          </div>
        ))}
      </div>

      <AnimatePresence>
        {editing && (
          <Modal title="Edit Tutorial" onClose={() => setEditing(null)}>
            <TutorialEditor tutorial={editing} categories={categories} onSave={async (updates) => { await updateTutorial(editing.id, updates); setTutorials(tutorials.map(t => t.id === editing.id ? { ...t, ...updates } as Tutorial : t)); setEditing(null); showToast('success', 'Saved'); }} />
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}

function TutorialEditor({ tutorial, categories, onSave }: { tutorial: Tutorial; categories: any[]; onSave: (u: Partial<Tutorial>) => void }) {
  const [form, setForm] = useState<{
    title: string; slug: string; description: string; content: string; category_id: string;
    video_type: 'youtube' | 'vimeo' | 'direct'; video_url: string; cover_image: string;
    thumbnail: string; duration_minutes: string; difficulty: 'beginner' | 'intermediate' | 'advanced';
    tags: string; is_published: boolean;
  }>({
    title: tutorial.title, slug: tutorial.slug, description: tutorial.description || '',
    content: tutorial.content, category_id: tutorial.category_id || '',
    video_type: tutorial.video_type || 'youtube', video_url: tutorial.video_url || '',
    cover_image: tutorial.cover_image || '', thumbnail: tutorial.thumbnail || '',
    duration_minutes: String(tutorial.duration_minutes || 0), difficulty: tutorial.difficulty || 'beginner',
    tags: (tutorial.tags || []).join(', '), is_published: tutorial.is_published,
  });
  return (
    <div className="space-y-4">
      <Input label="Title" value={form.title} onChange={v => setForm({ ...form, title: v })} />
      <Input label="Slug" value={form.slug} onChange={v => setForm({ ...form, slug: v })} />
      <SelectInput label="Category" value={form.category_id} onChange={v => setForm({ ...form, category_id: v })} options={[{ value: '', label: 'Uncategorized' }, ...categories.map((c: any) => ({ value: c.id, label: c.name }))]} />
      <TextArea label="Description" value={form.description} onChange={v => setForm({ ...form, description: v })} rows={2} />
      <TextArea label="Content (HTML)" value={form.content} onChange={v => setForm({ ...form, content: v })} rows={6} />
      <div className="grid grid-cols-2 gap-3">
        <SelectInput label="Video Type" value={form.video_type} onChange={v => setForm({ ...form, video_type: v as 'youtube' | 'vimeo' | 'direct' })} options={[{ value: 'youtube', label: 'YouTube' }, { value: 'vimeo', label: 'Vimeo' }, { value: 'direct', label: 'Direct URL' }]} />
        <SelectInput label="Difficulty" value={form.difficulty} onChange={v => setForm({ ...form, difficulty: v as 'beginner' | 'intermediate' | 'advanced' })} options={DIFFICULTY_LEVELS.map(d => ({ value: d.value, label: d.label }))} />
      </div>
      <Input label="Video URL" value={form.video_url} onChange={v => setForm({ ...form, video_url: v })} />
      <Input label="Cover Image URL" value={form.cover_image} onChange={v => setForm({ ...form, cover_image: v })} />
      <Input label="Thumbnail URL" value={form.thumbnail} onChange={v => setForm({ ...form, thumbnail: v })} />
      <Input label="Duration (minutes)" type="number" value={form.duration_minutes} onChange={v => setForm({ ...form, duration_minutes: v })} />
      <Input label="Tags (comma-separated)" value={form.tags} onChange={v => setForm({ ...form, tags: v })} />
      <ToggleInput label="Published" value={form.is_published} onChange={v => setForm({ ...form, is_published: v })} />
      <button onClick={() => onSave({ title: form.title, slug: form.slug, description: form.description || null, content: form.content, category_id: form.category_id || null, video_type: form.video_type as 'youtube' | 'vimeo' | 'direct', video_url: form.video_url || null, cover_image: form.cover_image || null, thumbnail: form.thumbnail || null, duration_minutes: Number(form.duration_minutes), difficulty: form.difficulty as 'beginner' | 'intermediate' | 'advanced', tags: form.tags ? form.tags.split(',').map((t: string) => t.trim()) : [], is_published: form.is_published })} className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm"><Save className="w-4 h-4" /> Save</button>
    </div>
  );
}

// ─── Challenges Tab ──────────────────────────────────────────────────────────────

function ChallengesTab() {
  const { challenges, setChallenges } = useAllChallenges();
  const [editing, setEditing] = useState<Challenge | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const showToast = (type: 'success' | 'error', message: string) => { setToast({ type, message }); setTimeout(() => setToast(null), 3000); };

  return (
    <div>
      <Toast toast={toast} />
      <button onClick={() => setEditing({} as Challenge)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm mb-4"><Plus className="w-4 h-4" /> New Challenge</button>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {challenges.map(ch => (
          <div key={ch.id} className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
            <div className="flex items-start justify-between mb-2">
              <div>
                <h3 className="font-medium text-gray-900 dark:text-white text-sm">{ch.title}</h3>
                <p className="text-xs text-gray-400">{ch.status} · {ch.reward_currency} {ch.reward_amount.toLocaleString()}</p>
              </div>
            </div>
            <div className="flex gap-1 mt-2">
              <ActionButton onClick={() => setEditing(ch)} icon={Edit2} title="Edit" color="blue" />
              <ActionButton onClick={() => { updateChallenge(ch.id, { is_active: !ch.is_active }).then(() => setChallenges(challenges.map(c => c.id === ch.id ? { ...c, is_active: !ch.is_active } : c))); }} icon={ch.is_active ? Eye : EyeOff} title={ch.is_active ? 'Deactivate' : 'Activate'} color="green" />
              <ActionButton onClick={async () => { await deleteChallenge(ch.id); setChallenges(challenges.filter(c => c.id !== ch.id)); showToast('success', 'Deleted'); }} icon={Trash2} title="Delete" color="red" />
            </div>
          </div>
        ))}
      </div>

      <AnimatePresence>
        {editing && (
          <Modal title={editing.id ? 'Edit Challenge' : 'New Challenge'} onClose={() => setEditing(null)}>
            <ChallengeEditor challenge={editing} onSave={async (data) => {
              if (editing.id) { const updated = await updateChallenge(editing.id, data); setChallenges(challenges.map(c => c.id === editing.id ? updated : c)); }
              else { const created = await createChallenge(data); setChallenges([...challenges, created]); }
              setEditing(null); showToast('success', 'Saved');
            }} />
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}

function ChallengeEditor({ challenge, onSave }: { challenge: Challenge; onSave: (data: Partial<Challenge>) => void }) {
  const [form, setForm] = useState<{
    title: string; description: string; banner_image: string; icon: string;
    reward_amount: string; reward_currency: string; reward_description: string;
    start_date: string; end_date: string; challenge_type: string;
    status: 'upcoming' | 'active' | 'completed' | 'expired'; is_active: boolean;
  }>({
    title: challenge.title || '', description: challenge.description || '',
    banner_image: challenge.banner_image || '', icon: challenge.icon || 'Trophy',
    reward_amount: String(challenge.reward_amount || 0), reward_currency: challenge.reward_currency || 'NGN',
    reward_description: challenge.reward_description || '',
    start_date: challenge.start_date?.slice(0, 16) || '', end_date: challenge.end_date?.slice(0, 16) || '',
    challenge_type: challenge.challenge_type || 'general', status: challenge.status || 'upcoming',
    is_active: challenge.is_active ?? true,
  });
  return (
    <div className="space-y-4">
      <Input label="Title" value={form.title} onChange={v => setForm({ ...form, title: v })} />
      <TextArea label="Description" value={form.description} onChange={v => setForm({ ...form, description: v })} rows={3} />
      <Input label="Banner Image URL" value={form.banner_image} onChange={v => setForm({ ...form, banner_image: v })} />
      <div className="grid grid-cols-2 gap-3">
        <Input label="Reward Amount" type="number" value={form.reward_amount} onChange={v => setForm({ ...form, reward_amount: v })} />
        <Input label="Reward Currency" value={form.reward_currency} onChange={v => setForm({ ...form, reward_currency: v })} />
      </div>
      <Input label="Reward Description" value={form.reward_description} onChange={v => setForm({ ...form, reward_description: v })} />
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start Date</label><input type="datetime-local" className="editor-input" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} /></div>
        <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End Date</label><input type="datetime-local" className="editor-input" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <SelectInput label="Status" value={form.status} onChange={v => setForm({ ...form, status: v as 'upcoming' | 'active' | 'completed' | 'expired' })} options={CHALLENGE_STATUSES.map(s => ({ value: s.value, label: s.label }))} />
        <Input label="Challenge Type" value={form.challenge_type} onChange={v => setForm({ ...form, challenge_type: v })} />
      </div>
      <ToggleInput label="Active" value={form.is_active} onChange={v => setForm({ ...form, is_active: v })} />
      <button onClick={() => onSave({ title: form.title, description: form.description || null, banner_image: form.banner_image || null, icon: form.icon, reward_amount: Number(form.reward_amount), reward_currency: form.reward_currency, reward_description: form.reward_description || null, start_date: form.start_date ? new Date(form.start_date).toISOString() : null, end_date: form.end_date ? new Date(form.end_date).toISOString() : null, challenge_type: form.challenge_type, status: form.status as 'upcoming' | 'active' | 'completed' | 'expired', is_active: form.is_active })} className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm"><Save className="w-4 h-4" /> Save</button>
    </div>
  );
}

// ─── Legal Tab ──────────────────────────────────────────────────────────────────

function LegalTab() {
  const { pages, setPages } = useAllLegalPages();
  const [editing, setEditing] = useState<LegalPage | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const showToast = (type: 'success' | 'error', message: string) => { setToast({ type, message }); setTimeout(() => setToast(null), 3000); };

  return (
    <div>
      <Toast toast={toast} />
      <button onClick={async () => { try { const p = await createLegalPage('New Legal Page', `legal-${Date.now()}`, 'terms'); setPages([p, ...pages]); setEditing(p); } catch { showToast('error', 'Failed'); } }} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm mb-4"><Plus className="w-4 h-4" /> New Legal Page</button>
      <div className="space-y-2">
        {pages.map(page => {
          const typeInfo = LEGAL_PAGE_TYPES.find(t => t.value === page.page_type);
          return (
            <div key={page.id} className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-gray-900 dark:text-white text-sm truncate">{page.title}</h3>
                <p className="text-xs text-gray-400">{typeInfo?.label || page.page_type} · v{page.version_number} · {page.is_published ? 'Published' : 'Draft'}</p>
              </div>
              <ActionButton onClick={() => setEditing(page)} icon={Edit2} title="Edit" color="blue" />
              <ActionButton onClick={() => { updateLegalPage(page.id, { is_published: !page.is_published }).then(() => setPages(pages.map(p => p.id === page.id ? { ...p, is_published: !page.is_published } : p))); }} icon={page.is_published ? Eye : EyeOff} title={page.is_published ? 'Unpublish' : 'Publish'} color="green" />
              <ActionButton onClick={async () => { await deleteLegalPage(page.id); setPages(pages.filter(p => p.id !== page.id)); showToast('success', 'Deleted'); }} icon={Trash2} title="Delete" color="red" />
            </div>
          );
        })}
      </div>

      <AnimatePresence>
        {editing && (
          <Modal title="Edit Legal Page" onClose={() => setEditing(null)}>
            <LegalEditor page={editing} onSave={async (updates) => {
              await updateLegalPage(editing.id, updates);
              if (updates.content !== undefined) await saveLegalPageVersion(editing.id, updates.content, 'Updated content');
              setPages(pages.map(p => p.id === editing.id ? { ...p, ...updates } as LegalPage : p));
              setEditing(null); showToast('success', 'Saved');
            }} />
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}

function LegalEditor({ page, onSave }: { page: LegalPage; onSave: (u: Partial<LegalPage>) => void }) {
  const [form, setForm] = useState({ title: page.title, slug: page.slug, page_type: page.page_type, content: page.content, is_published: page.is_published });
  return (
    <div className="space-y-4">
      <Input label="Title" value={form.title} onChange={v => setForm({ ...form, title: v })} />
      <Input label="Slug" value={form.slug} onChange={v => setForm({ ...form, slug: v })} />
      <SelectInput label="Page Type" value={form.page_type} onChange={v => setForm({ ...form, page_type: v })} options={LEGAL_PAGE_TYPES} />
      <TextArea label="Content (HTML)" value={form.content} onChange={v => setForm({ ...form, content: v })} rows={12} />
      <ToggleInput label="Published" value={form.is_published} onChange={v => setForm({ ...form, is_published: v })} />
      <button onClick={() => onSave({ title: form.title, slug: form.slug, page_type: form.page_type, content: form.content, is_published: form.is_published })} className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm"><Save className="w-4 h-4" /> Save</button>
    </div>
  );
}

// ─── Permissions Tab ──────────────────────────────────────────────────────────────

function PermissionsTab() {
  const { permissions, setPermissions } = usePermissionInfo();
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const showToast = (type: 'success' | 'error', message: string) => { setToast({ type, message }); setTimeout(() => setToast(null), 3000); };

  return (
    <div>
      <Toast toast={toast} />
      <div className="space-y-3">
        {permissions.map(perm => {
          const typeInfo = PERMISSION_TYPES.find(t => t.value === perm.permission_type);
          return (
            <div key={perm.id} className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <h3 className="font-medium text-gray-900 dark:text-white text-sm">{perm.title}</h3>
                  <p className="text-xs text-gray-400">{typeInfo?.label || perm.permission_type}</p>
                </div>
                <ToggleInput label="" value={perm.is_enabled} onChange={async (v) => { const updated = await updatePermissionInfo(perm.id, { is_enabled: v }); setPermissions(permissions.map(p => p.id === perm.id ? updated : p)); }} />
              </div>
              <p className="text-xs text-gray-500 line-clamp-2">{perm.description}</p>
              <div className="flex gap-1 mt-2">
                <ActionButton onClick={() => setEditing(perm)} icon={Edit2} title="Edit" color="blue" />
              </div>
            </div>
          );
        })}
      </div>

      <AnimatePresence>
        {editing && (
          <Modal title="Edit Permission Info" onClose={() => setEditing(null)}>
            <PermissionEditor perm={editing} onSave={async (updates) => { const updated = await updatePermissionInfo(editing.id, updates); setPermissions(permissions.map(p => p.id === editing.id ? updated : p)); setEditing(null); showToast('success', 'Saved'); }} />
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}

function PermissionEditor({ perm, onSave }: { perm: any; onSave: (u: any) => void }) {
  const [form, setForm] = useState({ title: perm.title || '', description: perm.description || '', image_url: perm.image_url || '', video_url: perm.video_url || '', is_enabled: perm.is_enabled ?? true });
  return (
    <div className="space-y-4">
      <Input label="Title" value={form.title} onChange={v => setForm({ ...form, title: v })} />
      <TextArea label="Description" value={form.description} onChange={v => setForm({ ...form, description: v })} rows={4} />
      <Input label="Image URL" value={form.image_url} onChange={v => setForm({ ...form, image_url: v })} />
      <Input label="Video URL" value={form.video_url} onChange={v => setForm({ ...form, video_url: v })} />
      <ToggleInput label="Enabled" value={form.is_enabled} onChange={v => setForm({ ...form, is_enabled: v })} />
      <button onClick={() => onSave(form)} className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm"><Save className="w-4 h-4" /> Save</button>
    </div>
  );
}
