import { useState, useEffect, useCallback } from 'react';
import {
  FileText, Plus, Search, Edit3, Trash2, Tag,
  Loader2, Save, X, Code, History, ArrowLeft,
} from 'lucide-react';
import {
  fetchPrompts, createPrompt, updatePrompt, deletePrompt,
  fetchPromptVersions, extractTemplateVariables,
  type AIPrompt, type AIPromptVersion,
} from '../../lib/ai/promptLibrary';

export default function AdminPromptLibraryPage() {
  const [prompts, setPrompts] = useState<AIPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedPrompt, setSelectedPrompt] = useState<AIPrompt | null>(null);
  const [editing, setEditing] = useState<AIPrompt | null>(null);
  const [creating, setCreating] = useState(false);
  const [versions, setVersions] = useState<AIPromptVersion[]>([]);
  const [showVersions, setShowVersions] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const data = await fetchPrompts(); setPrompts(data); } catch (err) { console.error('Failed to load prompts:', err); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadVersions = useCallback(async (promptId: string) => {
    try { const data = await fetchPromptVersions(promptId); setVersions(data); } catch (err) { console.error('Failed to load versions:', err); }
  }, []);

  const handleSelect = (prompt: AIPrompt) => { setSelectedPrompt(prompt); loadVersions(prompt.id); setShowVersions(false); };

  const handleSave = async (prompt: Partial<AIPrompt> & { id?: string }) => {
    try { if (prompt.id) { await updatePrompt(prompt.id, prompt); } else { await createPrompt(prompt as any); } await load(); setEditing(null); setCreating(false); } catch (err) { console.error('Failed to save prompt:', err); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this prompt? This cannot be undone.')) return;
    try { await deletePrompt(id); await load(); setSelectedPrompt(null); } catch (err) { console.error('Failed to delete prompt:', err); }
  };

  const handleToggleActive = async (prompt: AIPrompt) => {
    try { await updatePrompt(prompt.id, { is_active: !prompt.is_active }); await load(); } catch (err) { console.error('Failed to toggle prompt:', err); }
  };

  const filtered = prompts.filter(p => !search || p.title.toLowerCase().includes(search.toLowerCase()) || p.key.toLowerCase().includes(search.toLowerCase()) || p.feature.toLowerCase().includes(search.toLowerCase()) || p.tags.some(t => t.toLowerCase().includes(search.toLowerCase())));

  if (loading) return <div className="p-8 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center"><FileText className="w-5 h-5 text-white" /></div>
        <div><h1 className="text-xl font-bold text-gray-900">Prompt Library</h1><p className="text-sm text-gray-500">Manage versioned AI prompts for all features</p></div>
      </div>

      {selectedPrompt && !editing && !creating ? (
        <PromptDetail prompt={selectedPrompt} versions={showVersions ? versions : []} onBack={() => setSelectedPrompt(null)} onEdit={() => setEditing(selectedPrompt)} onDelete={() => handleDelete(selectedPrompt.id)} onToggleActive={() => handleToggleActive(selectedPrompt)} onShowVersions={() => setShowVersions(!showVersions)} />
      ) : editing || creating ? (
        <PromptEditor prompt={editing} onSave={handleSave} onCancel={() => { setEditing(null); setCreating(false); }} />
      ) : (
        <>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 relative"><Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" /><input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search prompts by title, key, feature, or tag..." className="w-full pl-10 pr-4 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-indigo-500" /></div>
            <button onClick={() => setCreating(true)} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center gap-1"><Plus className="w-4 h-4" /> New Prompt</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filtered.map(p => (
              <div key={p.id} className="bg-white rounded-2xl border border-gray-100 p-5 hover:border-indigo-200 cursor-pointer transition-all" onClick={() => handleSelect(p)}>
                <div className="flex items-start justify-between mb-2">
                  <div><h3 className="font-semibold text-gray-900">{p.title}</h3><p className="text-xs text-gray-400 font-mono">{p.key}</p></div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 text-xs rounded-full ${p.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{p.is_active ? 'Active' : 'Inactive'}</span>
                    <span className="px-2 py-0.5 text-xs bg-indigo-50 text-indigo-600 rounded-full">v{p.version}</span>
                  </div>
                </div>
                <p className="text-sm text-gray-500 line-clamp-2">{p.description || p.system_prompt.slice(0, 100) + '...'}</p>
                <div className="flex items-center gap-2 mt-3">
                  <span className="px-2 py-0.5 text-xs bg-purple-50 text-purple-600 rounded-md">{p.feature}</span>
                  {p.tags.slice(0, 3).map(tag => <span key={tag} className="px-2 py-0.5 text-xs bg-gray-50 text-gray-500 rounded-md flex items-center gap-1"><Tag className="w-2.5 h-2.5" /> {tag}</span>)}
                </div>
              </div>
            ))}
          </div>
          {filtered.length === 0 && <div className="text-center py-12 text-gray-400"><FileText className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>No prompts found. Create one to get started.</p></div>}
        </>
      )}
    </div>
  );
}

function PromptDetail({ prompt, versions, onBack, onEdit, onDelete, onToggleActive, onShowVersions }: { prompt: AIPrompt; versions: AIPromptVersion[]; onBack: () => void; onEdit: () => void; onDelete: () => void; onToggleActive: () => void; onShowVersions: () => void; }) {
  const variables = extractTemplateVariables(prompt.user_prompt_template);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"><ArrowLeft className="w-4 h-4" /> Back to list</button>
        <div className="flex items-center gap-2">
          <button onClick={onToggleActive} className="text-sm text-gray-500 hover:text-gray-700">{prompt.is_active ? 'Deactivate' : 'Activate'}</button>
          <button onClick={onEdit} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 flex items-center gap-1"><Edit3 className="w-3.5 h-3.5" /> Edit</button>
          <button onClick={onDelete} className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-sm hover:bg-red-100 flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" /> Delete</button>
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <div className="flex items-center gap-2 mb-1"><h2 className="text-lg font-bold text-gray-900">{prompt.title}</h2><span className="px-2 py-0.5 text-xs bg-indigo-50 text-indigo-600 rounded-full">v{prompt.version}</span></div>
        <p className="text-sm text-gray-500 mb-4">{prompt.description}</p>
        <div className="flex items-center gap-2 mb-4">
          <span className="px-2 py-0.5 text-xs bg-purple-50 text-purple-600 rounded-md">{prompt.feature}</span>
          {prompt.tags.map(tag => <span key={tag} className="px-2 py-0.5 text-xs bg-gray-50 text-gray-500 rounded-md">{tag}</span>)}
          {prompt.model_override && <span className="px-2 py-0.5 text-xs bg-blue-50 text-blue-600 rounded-md">Model: {prompt.model_override}</span>}
        </div>
        <div className="mb-4"><h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1"><Code className="w-4 h-4" /> System Prompt</h3><pre className="bg-gray-50 rounded-xl p-4 text-sm text-gray-700 whitespace-pre-wrap font-mono max-h-64 overflow-y-auto">{prompt.system_prompt}</pre></div>
        {prompt.user_prompt_template && (<div className="mb-4"><h3 className="text-sm font-semibold text-gray-700 mb-2">User Prompt Template</h3><pre className="bg-gray-50 rounded-xl p-4 text-sm text-gray-700 whitespace-pre-wrap font-mono">{prompt.user_prompt_template}</pre>{variables.length > 0 && (<div className="mt-2 flex items-center gap-2 flex-wrap"><span className="text-xs text-gray-400">Variables:</span>{variables.map(v => <code key={v} className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded">{`{{${v}}}`}</code>)}</div>)}</div>)}
        <button onClick={onShowVersions} className="text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-1"><History className="w-4 h-4" /> Version History</button>
        {versions.length > 0 && (<div className="mt-3 space-y-2">{versions.map(v => (<div key={v.id} className="flex items-center gap-3 text-sm border border-gray-100 rounded-xl p-3"><span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">v{v.version}</span><span className="text-gray-400 text-xs">{new Date(v.created_at).toLocaleString()}</span><span className="text-gray-500">{v.change_note}</span></div>))}</div>)}
      </div>
    </div>
  );
}

function PromptEditor({ prompt, onSave, onCancel }: { prompt: AIPrompt | null; onSave: (p: Partial<AIPrompt> & { id?: string }) => void; onCancel: () => void; }) {
  const [form, setForm] = useState({
    id: prompt?.id, key: prompt?.key || '', title: prompt?.title || '', description: prompt?.description || '',
    system_prompt: prompt?.system_prompt || '', user_prompt_template: prompt?.user_prompt_template || '',
    feature: prompt?.feature || 'chat', tags: prompt?.tags.join(', ') || '',
    model_override: prompt?.model_override || '', temperature_override: prompt?.temperature_override?.toString() || '',
    max_tokens_override: prompt?.max_tokens_override?.toString() || '', is_active: prompt?.is_active ?? true,
  });
  const variables = extractTemplateVariables(form.user_prompt_template);
  const handleSave = () => { onSave({ id: form.id, key: form.key, title: form.title, description: form.description, system_prompt: form.system_prompt, user_prompt_template: form.user_prompt_template, feature: form.feature, tags: form.tags.split(',').map(t => t.trim()).filter(Boolean), model_override: form.model_override || null, temperature_override: form.temperature_override ? parseFloat(form.temperature_override) : null, max_tokens_override: form.max_tokens_override ? parseInt(form.max_tokens_override) : null, is_active: form.is_active }); };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">{prompt ? 'Edit Prompt' : 'New Prompt'}</h2>
        <div className="flex items-center gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 text-gray-500 hover:text-gray-700 text-sm flex items-center gap-1"><X className="w-4 h-4" /> Cancel</button>
          <button onClick={handleSave} className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 flex items-center gap-1"><Save className="w-4 h-4" /> Save</button>
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div><label className="text-sm font-medium text-gray-700 mb-1 block">Key (unique identifier)</label><input type="text" value={form.key} onChange={e => setForm({ ...form, key: e.target.value })} placeholder="my_prompt_key" disabled={!!prompt} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-indigo-500 disabled:bg-gray-50" /></div>
          <div><label className="text-sm font-medium text-gray-700 mb-1 block">Title</label><input type="text" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="My Prompt" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-indigo-500" /></div>
        </div>
        <div><label className="text-sm font-medium text-gray-700 mb-1 block">Description</label><input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="What does this prompt do?" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-indigo-500" /></div>
        <div><label className="text-sm font-medium text-gray-700 mb-1 block">System Prompt</label><textarea value={form.system_prompt} onChange={e => setForm({ ...form, system_prompt: e.target.value })} rows={6} placeholder="You are..." className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm font-mono focus:outline-none focus:border-indigo-500" /></div>
        <div><label className="text-sm font-medium text-gray-700 mb-1 block">User Prompt Template (optional, use {'{{variables}}'})</label><textarea value={form.user_prompt_template} onChange={e => setForm({ ...form, user_prompt_template: e.target.value })} rows={4} placeholder="Generate a description for {{product_name}}..." className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm font-mono focus:outline-none focus:border-indigo-500" />{variables.length > 0 && (<div className="mt-2 flex items-center gap-2 flex-wrap"><span className="text-xs text-gray-400">Detected variables:</span>{variables.map(v => <code key={v} className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded">{`{{${v}}}`}</code>)}</div>)}</div>
        <div className="grid grid-cols-3 gap-4">
          <div><label className="text-sm font-medium text-gray-700 mb-1 block">Feature</label><input type="text" value={form.feature} onChange={e => setForm({ ...form, feature: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-indigo-500" /></div>
          <div><label className="text-sm font-medium text-gray-700 mb-1 block">Tags (comma-separated)</label><input type="text" value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} placeholder="seller, product, seo" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-indigo-500" /></div>
          <div><label className="text-sm font-medium text-gray-700 mb-1 block">Model Override</label><input type="text" value={form.model_override} onChange={e => setForm({ ...form, model_override: e.target.value })} placeholder="gpt-4o-mini" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-indigo-500" /></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="text-sm font-medium text-gray-700 mb-1 block">Temperature Override</label><input type="number" step="0.1" value={form.temperature_override} onChange={e => setForm({ ...form, temperature_override: e.target.value })} placeholder="0.7" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-indigo-500" /></div>
          <div><label className="text-sm font-medium text-gray-700 mb-1 block">Max Tokens Override</label><input type="number" value={form.max_tokens_override} onChange={e => setForm({ ...form, max_tokens_override: e.target.value })} placeholder="4096" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-indigo-500" /></div>
        </div>
      </div>
    </div>
  );
}
