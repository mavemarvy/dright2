import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HelpCircle, Send, X, ThumbsUp, MessageSquare, Loader2,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface QAItem {
  id: string;
  asker_id: string | null;
  question: string;
  answer: string | null;
  answered_by: string | null;
  answered_at: string | null;
  helpful_count: number;
  created_at: string;
  asker_name?: string;
}

interface ProductQAProps {
  productId: string;
  productName: string;
  sellerId: string;
}

export default function ProductQA({ productId, productName, sellerId }: ProductQAProps) {
  const { user } = useAuth();
  const [questions, setQuestions] = useState<QAItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAskForm, setShowAskForm] = useState(false);
  const [newQuestion, setNewQuestion] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState('');
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchQuestions();
  }, [productId]);

  const fetchQuestions = async () => {
    const { data } = await supabase
      .from('product_qa')
      .select(`
        id, asker_id, question, answer, answered_by, answered_at, helpful_count, created_at
      `)
      .eq('product_id', productId)
      .eq('is_approved', true)
      .order('answered_at', { ascending: false, nullsFirst: false });

    if (data) {
      // Fetch asker names
      const askerIds = data.map(q => q.asker_id).filter(Boolean) as string[];
      if (askerIds.length > 0) {
        const { data: askers } = await supabase
          .from('users')
          .select('id, full_name')
          .in('id', askerIds);
        const askerMap = new Map((askers || []).map(a => [a.id, a.full_name]));
        setQuestions(data.map(q => ({
          ...q,
          asker_name: q.asker_id ? askerMap.get(q.asker_id) || 'Anonymous' : 'Anonymous',
        })) as QAItem[]);
      } else {
        setQuestions(data as QAItem[]);
      }
    }
    setLoading(false);
  };

  const handleAsk = async () => {
    if (!user || !newQuestion.trim()) return;
    setSubmitting(true);
    const { data } = await supabase
      .from('product_qa')
      .insert({
        product_id: productId,
        asker_id: user.id,
        question: newQuestion.trim(),
      })
      .select('id, asker_id, question, answer, answered_by, answered_at, helpful_count, created_at')
      .single();

    if (data) {
      setQuestions(prev => [{ ...data, asker_name: user.email?.split('@')[0] || 'You' } as QAItem, ...prev]);
      setNewQuestion('');
      setShowAskForm(false);
    }
    setSubmitting(false);
  };

  const handleAnswer = async (qId: string) => {
    if (!user || !answerText.trim()) return;
    setAnsweringId(qId);
    const { error } = await supabase
      .from('product_qa')
      .update({
        answer: answerText.trim(),
        answered_by: user.id,
        answered_at: new Date().toISOString(),
      })
      .eq('id', qId);

    if (!error) {
      setQuestions(prev => prev.map(q =>
        q.id === qId
          ? { ...q, answer: answerText.trim(), answered_by: user.id, answered_at: new Date().toISOString() }
          : q
      ));
      setAnswerText('');
      setExpandedId(null);
    }
    setAnsweringId(null);
  };

  const handleHelpful = async (qId: string) => {
    if (!user || votedIds.has(qId)) return;
    setVotedIds(prev => new Set(prev).add(qId));
    const item = questions.find(q => q.id === qId);
    if (!item) return;
    await supabase
      .from('product_qa')
      .update({ helpful_count: item.helpful_count + 1 })
      .eq('id', qId);
    setQuestions(prev => prev.map(q =>
      q.id === qId ? { ...q, helpful_count: q.helpful_count + 1 } : q
    ));
  };

  const isSeller = user?.id === sellerId;

  return (
    <div className="mt-8 pt-6 border-t border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <HelpCircle className="w-5 h-5 text-primary-600" />
          Questions & Answers
        </h3>
        {user && (
          <button
            onClick={() => setShowAskForm(true)}
            className="flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-700"
          >
            <MessageSquare className="w-4 h-4" /> Ask a Question
          </button>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
        </div>
      )}

      {/* Questions list */}
      {!loading && questions.length === 0 && (
        <div className="text-center py-8">
          <HelpCircle className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No questions yet. Be the first to ask!</p>
        </div>
      )}

      <div className="space-y-3">
        {questions.map(qa => (
          <div key={qa.id} className="bg-gray-50 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-primary-700">Q</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 text-sm">{qa.question}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {qa.asker_name} · {new Date(qa.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </p>

                {qa.answer ? (
                  <div className="mt-3 flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-success-muted flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-success">A</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-gray-700 leading-relaxed">{qa.answer}</p>
                      {qa.answered_at && (
                        <p className="text-xs text-gray-400 mt-1">
                          Seller · {new Date(qa.answered_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  isSeller ? (
                    <div className="mt-3">
                      {expandedId === qa.id ? (
                        <div className="space-y-2">
                          <textarea
                            value={answerText}
                            onChange={e => setAnswerText(e.target.value)}
                            placeholder="Type your answer..."
                            rows={2}
                            className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:border-primary-500 outline-none resize-none"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleAnswer(qa.id)}
                              disabled={answeringId === qa.id || !answerText.trim()}
                              className="px-3 py-1.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
                            >
                              {answeringId === qa.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Post Answer'}
                            </button>
                            <button
                              onClick={() => { setExpandedId(null); setAnswerText(''); }}
                              className="px-3 py-1.5 bg-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-300"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setExpandedId(qa.id); setAnswerText(''); }}
                          className="text-sm text-primary-600 font-medium hover:underline"
                        >
                          Answer this question
                        </button>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 mt-2 italic">Awaiting seller response</p>
                  )
                )}

                {/* Helpful button */}
                {qa.answer && (
                  <button
                    onClick={() => handleHelpful(qa.id)}
                    disabled={votedIds.has(qa.id)}
                    className={`mt-2 flex items-center gap-1 text-xs ${votedIds.has(qa.id) ? 'text-success' : 'text-gray-400 hover:text-gray-600'}`}
                  >
                    <ThumbsUp className="w-3.5 h-3.5" />
                    Helpful ({qa.helpful_count})
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Ask form modal */}
      <AnimatePresence>
        {showAskForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowAskForm(false)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-gray-900">Ask about: {productName}</h3>
                <button onClick={() => setShowAskForm(false)} className="p-1 text-gray-400">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <textarea
                value={newQuestion}
                onChange={e => setNewQuestion(e.target.value)}
                placeholder="What would you like to know?"
                rows={3}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:border-primary-500 outline-none resize-none"
              />
              <button
                onClick={handleAsk}
                disabled={submitting || !newQuestion.trim()}
                className="w-full py-2.5 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4" /> Submit Question</>}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
