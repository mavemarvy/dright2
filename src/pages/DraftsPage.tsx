import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText, Trash2, Edit2, Send, Plus, Loader2, AlertCircle,
  CloudOff, Cloud, Clock, Briefcase,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useCurrency } from '../contexts/CurrencyContext';
import {
  syncDrafts, deleteCloudDraft, removeLocalDraft,
  type DraftData,
} from '../lib/drafts';
import SeoHead from '../components/SeoHead';

interface LocalDraft {
  id: string;
  draft_name: string | null;
  draft_data: DraftData;
  status: string;
  updated_at: string;
  created_at: string;
  last_synced_at: string | null;
}

interface JobDraft {
  type: 'job';
  title: string;
  updated_at: string;
  data: Record<string, unknown>;
}

type UnifiedDraft =
  | { kind: 'product'; id: string; title: string; subtitle: string; price?: string; isFree?: boolean; step?: number; updated_at: string; status: string; last_synced_at: string | null; raw: LocalDraft }
  | { kind: 'job'; id: string; title: string; subtitle: string; updated_at: string; raw: JobDraft };

const JOB_DRAFT_KEY = 'job_posting_draft';

export default function DraftsPage() {
  const { user } = useAuth();
  const { format } = useCurrency();
  const navigate = useNavigate();
  const [productDrafts, setProductDrafts] = useState<LocalDraft[]>([]);
  const [jobDraft, setJobDraft] = useState<JobDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [publishing, setPublishing] = useState<string | null>(null);

  useEffect(() => {
    loadAllDrafts();
  }, [user]);

  const loadAllDrafts = async () => {
    setLoading(true);

    // Product drafts (Supabase + localStorage sync)
    if (user) {
      const synced = await syncDrafts(user.id);
      setProductDrafts(synced.filter(d => d.status === 'draft'));
    }

    // Job draft (localStorage only)
    try {
      const raw = localStorage.getItem(JOB_DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        setJobDraft({
          type: 'job',
          title: (parsed.title as string) || 'Untitled Job',
          updated_at: new Date().toISOString(),
          data: parsed,
        });
      }
    } catch { /* ignore */ }

    setLoading(false);
  };

  const handleDeleteProduct = async (id: string) => {
    await deleteCloudDraft(id);
    removeLocalDraft(id);
    setProductDrafts(prev => prev.filter(d => d.id !== id));
    setConfirmDelete(null);
  };

  const handleDeleteJob = () => {
    localStorage.removeItem(JOB_DRAFT_KEY);
    setJobDraft(null);
    setConfirmDelete(null);
  };

  const handleEditProduct = (draft: LocalDraft) => {
    navigate('/upload-product', { state: { draftId: draft.id } });
  };

  const handleEditJob = () => {
    navigate('/post-job');
  };

  const handlePublishProduct = async (draft: LocalDraft) => {
    setPublishing(draft.id);
    navigate('/upload-product', { state: { draftId: draft.id, publish: true } });
  };

  const handlePublishJob = () => {
    navigate('/post-job');
  };

  const formatRelative = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const syncStatus = (draft: LocalDraft) => {
    if (!draft.last_synced_at) return { label: 'Offline', icon: CloudOff, color: 'text-warning' };
    return { label: 'Synced', icon: Cloud, color: 'text-success' };
  };

  const allDrafts: UnifiedDraft[] = [
    ...productDrafts.map<UnifiedDraft>(d => ({
      kind: 'product',
      id: d.id,
      title: d.draft_data.name || d.draft_name || 'Untitled Product',
      subtitle: d.draft_data.productType,
      price: d.draft_data.price,
      isFree: d.draft_data.isFree,
      step: d.draft_data.step,
      updated_at: d.updated_at,
      status: d.status,
      last_synced_at: d.last_synced_at,
      raw: d,
    })),
    ...(jobDraft ? [{
      kind: 'job' as const,
      id: 'job-draft',
      title: jobDraft.title,
      subtitle: 'Job Posting',
      updated_at: jobDraft.updated_at,
      raw: jobDraft,
    }] : []),
  ].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <SeoHead
        title="My Drafts"
        description="Manage your saved product and job drafts on Dright."
        canonical="/drafts"
      />

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center">
            <FileText className="w-5 h-5 text-primary-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Drafts</h1>
            <p className="text-sm text-gray-500">Product and job drafts in one place</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            to="/post-job"
            className="flex items-center gap-2 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold transition-colors min-h-[48px]"
          >
            <Briefcase className="w-5 h-5" />
            <span className="hidden sm:inline">New Job</span>
          </Link>
          <Link
            to="/upload-product"
            className="flex items-center gap-2 px-4 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-semibold transition-colors shadow-md shadow-primary-600/20 min-h-[48px]"
          >
            <Plus className="w-5 h-5" />
            <span className="hidden sm:inline">New Product</span>
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
        </div>
      ) : allDrafts.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-20 text-center"
        >
          <div className="w-24 h-24 bg-gray-100 rounded-3xl flex items-center justify-center mb-5">
            <FileText className="w-12 h-12 text-gray-400" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">No drafts yet</h3>
          <p className="text-gray-500 max-w-xs mb-6">
            Start creating a product or posting a job and save it as a draft to continue later.
          </p>
          <div className="flex gap-3">
            <Link
              to="/upload-product"
              className="flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-semibold transition-colors"
            >
              <Plus className="w-5 h-5" />
              Create Product
            </Link>
            <Link
              to="/post-job"
              className="flex items-center gap-2 px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold transition-colors"
            >
              <Briefcase className="w-5 h-5" />
              Post Job
            </Link>
          </div>
        </motion.div>
      ) : (
        <div className="space-y-3">
          {allDrafts.map((draft, index) => {
            const isProduct = draft.kind === 'product';
            const status = isProduct ? syncStatus(draft.raw) : { label: 'Local', icon: CloudOff, color: 'text-gray-500' };
            const StatusIcon = status.icon;
            const Icon = isProduct ? FileText : Briefcase;

            return (
              <motion.div
                key={draft.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className="w-4 h-4 text-gray-400 shrink-0" />
                      <h3 className="font-semibold text-gray-900 truncate">{draft.title}</h3>
                      <span className={`flex items-center gap-1 text-xs font-medium ${status.color}`}>
                        <StatusIcon className="w-3.5 h-3.5" />
                        {status.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {formatRelative(draft.updated_at)}
                      </span>
                      <span className="px-2 py-0.5 bg-gray-100 rounded-full">{draft.subtitle}</span>
                      {isProduct && draft.price && !draft.isFree && (
                        <span>{format(parseFloat(draft.price) || 0)}</span>
                      )}
                      {isProduct && draft.isFree && (
                        <span className="text-success font-medium">FREE</span>
                      )}
                      {isProduct && draft.step && <span>Step {draft.step}</span>}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-4">
                  <button
                    onClick={() => isProduct ? handleEditProduct(draft.raw) : handleEditJob()}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-primary-50 text-primary-700 rounded-xl text-sm font-medium hover:bg-primary-100 transition-colors min-h-[44px]"
                  >
                    <Edit2 className="w-4 h-4" />
                    Edit
                  </button>
                  <button
                    onClick={() => isProduct ? handlePublishProduct(draft.raw) : handlePublishJob()}
                    disabled={publishing === draft.id}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-success-muted text-success rounded-xl text-sm font-medium hover:bg-success/10 transition-colors min-h-[44px] disabled:opacity-50"
                  >
                    {publishing === draft.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Publish
                  </button>
                  <button
                    onClick={() => setConfirmDelete(draft.id)}
                    className="flex items-center gap-1.5 px-4 py-2.5 text-error rounded-xl text-sm font-medium hover:bg-error-muted transition-colors min-h-[44px]"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                </div>

                <AnimatePresence>
                  {confirmDelete === draft.id && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-3 overflow-hidden"
                    >
                      <div className="flex items-center gap-3 p-3 bg-error-muted rounded-xl">
                        <AlertCircle className="w-5 h-5 text-error shrink-0" />
                        <p className="text-sm text-error flex-1">
                          Delete this draft permanently? This cannot be undone.
                        </p>
                        <button
                          onClick={() => isProduct ? handleDeleteProduct(draft.id) : handleDeleteJob()}
                          className="px-3 py-2 bg-error text-white rounded-lg text-sm font-medium hover:opacity-90"
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="px-3 py-2 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-100"
                        >
                          Cancel
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
