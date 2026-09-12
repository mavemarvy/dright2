import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Eye, EyeOff, Loader2, MessageCircle, RotateCcw, Trash2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface ModerationComment {
  id: string;
  user_id: string;
  body: string;
  status: 'visible' | 'hidden';
  created_at: string;
  moderated_at: string | null;
  moderation_reason: string | null;
  author_name: string;
  author_email: string | null;
  author_avatar: string | null;
}

interface Props {
  contentId: string;
  title: string;
  onClose: () => void;
}

export default function AdminNewsCommentModerationModal({ contentId, title, onClose }: Props) {
  const [comments, setComments] = useState<ModerationComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: loadError } = await supabase.rpc('admin_get_global_content_comments', {
      p_content_id: contentId,
    });
    if (loadError) {
      setError(loadError.message || 'Unable to load comments.');
      setComments([]);
    } else {
      setComments((data || []) as ModerationComment[]);
    }
    setLoading(false);
  }, [contentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const moderate = async (comment: ModerationComment, action: 'hide' | 'restore' | 'delete') => {
    if (action === 'delete' && !window.confirm('Permanently delete this comment?')) return;
    setBusyId(comment.id);
    setError(null);
    const { error: actionError } = await supabase.rpc('admin_moderate_global_content_comment', {
      p_comment_id: comment.id,
      p_action: action,
      p_reason: action === 'hide' ? 'Hidden by DRIGHT content moderation' : null,
    });
    setBusyId(null);
    if (actionError) {
      setError(actionError.message || 'Unable to moderate this comment.');
      return;
    }
    await load();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 p-3 sm:p-4" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 p-4 dark:border-gray-700 sm:p-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-primary-600" />
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Comment moderation</h2>
            </div>
            <p className="mt-1 truncate text-sm text-gray-500 dark:text-gray-400">{title}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800" aria-label="Close comment moderation">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[76vh] overflow-y-auto p-4 sm:p-5">
          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-xl bg-error-muted p-3 text-sm text-error">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="flex min-h-[220px] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary-600" /></div>
          ) : comments.length === 0 ? (
            <div className="flex min-h-[220px] flex-col items-center justify-center text-center">
              <MessageCircle className="h-12 w-12 text-gray-300 dark:text-gray-700" />
              <p className="mt-3 font-semibold text-gray-700 dark:text-gray-200">No comments yet</p>
              <p className="mt-1 text-sm text-gray-500">Comments on this post will appear here for moderation.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {comments.map((comment) => (
                <article key={comment.id} className={`rounded-2xl border p-4 ${comment.status === 'hidden' ? 'border-amber-200 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/20' : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'}`}>
                  <div className="flex items-start gap-3">
                    {comment.author_avatar ? (
                      <img src={comment.author_avatar} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-bold text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
                        {(comment.author_name || 'D').slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-gray-900 dark:text-white">{comment.author_name}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${comment.status === 'visible' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>{comment.status}</span>
                      </div>
                      {comment.author_email && <p className="mt-0.5 text-xs text-gray-400">{comment.author_email}</p>}
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-700 dark:text-gray-200">{comment.body}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                        <span>{new Date(comment.created_at).toLocaleString()}</span>
                        {comment.moderated_at && <span>Moderated {new Date(comment.moderated_at).toLocaleString()}</span>}
                      </div>
                      {comment.moderation_reason && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{comment.moderation_reason}</p>}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-3 dark:border-gray-700">
                    {comment.status === 'visible' ? (
                      <button type="button" disabled={busyId === comment.id} onClick={() => void moderate(comment, 'hide')} className="inline-flex min-h-[38px] items-center gap-2 rounded-xl border border-amber-200 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50 dark:border-amber-900/50 dark:text-amber-300 dark:hover:bg-amber-950/30">
                        {busyId === comment.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <EyeOff className="h-3.5 w-3.5" />} Hide
                      </button>
                    ) : (
                      <button type="button" disabled={busyId === comment.id} onClick={() => void moderate(comment, 'restore')} className="inline-flex min-h-[38px] items-center gap-2 rounded-xl border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-900/50 dark:text-emerald-300 dark:hover:bg-emerald-950/30">
                        {busyId === comment.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Restore
                      </button>
                    )}
                    <button type="button" disabled={busyId === comment.id} onClick={() => void moderate(comment, 'delete')} className="inline-flex min-h-[38px] items-center gap-2 rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/50 dark:text-red-300 dark:hover:bg-red-950/30">
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
