import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, X, Send, Loader2, Trash2, MessageSquare,
  History, Archive, Download, ChevronLeft, Plus,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useUIPreferences } from '../lib/uiPreferences';
import { useAIChatMemory } from '../lib/ai/aiHooks';
import ErrorAlert from './ai/ErrorAlert';

const SUGGESTED_QUESTIONS = [
  'What products are trending today?',
  'How can I improve my conversion rate?',
  'Which category should I sell in?',
  'How does the affiliate program work?',
  'How do I withdraw my earnings?',
  'What promotion package fits my budget?',
];

export default function AIAssistant() {
  const { user } = useAuth();
  const { prefs } = useUIPreferences();
  const {
    conversations, activeConversation, messages, loading, sending, error,
    startNewConversation, resumeConversation, sendMessage,
    deleteConversation, archiveConversation, exportConversation, clearActive, refresh,
  } = useAIChatMemory(user?.id);

  const [isOpen, setIsOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending, isOpen]);

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    const query = input.trim();
    setInput('');
    await sendMessage(query);
  };

  const handleSuggestion = async (q: string) => {
    if (sending) return;
    await sendMessage(q);
  };

  const handleNewChat = async () => {
    await startNewConversation();
    setShowHistory(false);
  };

  const handleResume = async (id: string) => {
    await resumeConversation(id);
    setShowHistory(false);
  };

  const handleExport = async () => {
    if (!activeConversation) return;
    const json = await exportConversation(activeConversation.id);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `conversation-${activeConversation.title.replace(/\s+/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!user || !prefs.aiAssistantEnabled) return null;

  // Map persistent messages to display format
  const displayMessages = messages.map(m => ({
    id: m.id,
    role: m.role,
    content: m.content,
  }));

  return (
    <>
      <motion.button
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        onClick={() => { setIsOpen(!isOpen); if (!isOpen) refresh(); }}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-gradient-to-br from-primary-500 to-blue-600 shadow-lg flex items-center justify-center hover:shadow-xl transition-shadow"
        aria-label="AI Assistant"
      >
        {isOpen ? <X className="w-6 h-6 text-white" /> : <Sparkles className="w-6 h-6 text-white" />}
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-24 right-6 z-40 w-[calc(100vw-3rem)] max-w-md h-[500px] max-h-[60vh] bg-white dark:bg-gray-900 rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-800 flex flex-col overflow-hidden"
          >
            {showHistory ? (
              <>
                {/* History panel */}
                <div className="shrink-0 flex items-center justify-between px-4 py-3 bg-gradient-to-r from-primary-500 to-blue-600">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setShowHistory(false)} className="p-1 text-white/70 hover:text-white">
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <p className="text-sm font-bold text-white">Conversations</p>
                  </div>
                  <button onClick={handleNewChat} className="p-2 text-white/70 hover:text-white" title="New chat">
                    <Plus className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {conversations.length === 0 ? (
                    <div className="text-center py-8">
                      <History className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-sm text-gray-400">No conversations yet</p>
                    </div>
                  ) : (
                    conversations.map(conv => (
                      <div
                        key={conv.id}
                        className={`group rounded-xl border p-3 cursor-pointer transition-colors ${
                          activeConversation?.id === conv.id
                            ? 'border-primary-200 bg-primary-50/50'
                            : 'border-gray-100 hover:bg-gray-50'
                        }`}
                        onClick={() => handleResume(conv.id)}
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate flex-1">{conv.title}</p>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleExport(); }}
                              className="p-1 text-gray-400 hover:text-primary-600"
                              title="Export"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); archiveConversation(conv.id); }}
                              className="p-1 text-gray-400 hover:text-warning"
                              title="Archive"
                            >
                              <Archive className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); if (confirm('Delete this conversation?')) deleteConversation(conv.id); }}
                              className="p-1 text-gray-400 hover:text-error"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        {conv.summary && (
                          <p className="text-xs text-gray-400 mt-1 truncate">{conv.summary}</p>
                        )}
                        <p className="text-xs text-gray-300 mt-1">
                          {new Date(conv.updated_at || conv.created_at).toLocaleDateString()}
                          {conv.tokens_total > 0 && ` · ${conv.tokens_total.toLocaleString()} tokens`}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </>
            ) : (
              <>
                {/* Header */}
                <div className="shrink-0 flex items-center justify-between px-4 py-3 bg-gradient-to-r from-primary-500 to-blue-600">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                      <Sparkles className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">DRIGHT AI</p>
                      <p className="text-xs text-white/70">
                        {activeConversation ? activeConversation.title : 'New conversation'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setShowHistory(true)} className="p-2 text-white/70 hover:text-white transition-colors" title="History">
                      <History className="w-4 h-4" />
                    </button>
                    <button onClick={handleNewChat} className="p-2 text-white/70 hover:text-white transition-colors" title="New chat">
                      <Plus className="w-4 h-4" />
                    </button>
                    {activeConversation && (
                      <button
                        onClick={() => { if (confirm('Delete this conversation?')) { deleteConversation(activeConversation.id); clearActive(); } }}
                        className="p-2 text-white/70 hover:text-white transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Messages */}
                <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                  {displayMessages.length === 0 && !sending && (
                    <div className="text-center py-6">
                      <div className="w-12 h-12 rounded-full bg-primary-50 dark:bg-primary-500/10 flex items-center justify-center mx-auto mb-3">
                        <MessageSquare className="w-6 h-6 text-primary-500" />
                      </div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Ask me anything about the marketplace</p>
                      <p className="text-xs text-gray-400 mt-1">Your conversations are saved automatically</p>
                      <div className="mt-4 space-y-2">
                        {SUGGESTED_QUESTIONS.slice(0, 3).map(q => (
                          <button
                            key={q}
                            onClick={() => handleSuggestion(q)}
                            className="block w-full text-left px-3 py-2 text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 hover:bg-primary-50 dark:hover:bg-primary-500/10 rounded-xl transition-colors"
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {displayMessages.map(msg => (
                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                        msg.role === 'user'
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'
                      }`}>
                        {msg.content}
                      </div>
                    </div>
                  ))}

                  {sending && (
                    <div className="flex justify-start">
                      <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl px-3 py-2">
                        <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                      </div>
                    </div>
                  )}

                  {loading && (
                    <div className="flex justify-center">
                      <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                    </div>
                  )}

                  {error && <ErrorAlert message={error} />}
                </div>

                {/* Input */}
                <div className="shrink-0 border-t border-gray-100 dark:border-gray-800 p-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSend()}
                      placeholder="Ask about trends, pricing, promotions..."
                      disabled={sending}
                      className="flex-1 px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-200 dark:focus:ring-primary-500/30 disabled:opacity-50"
                    />
                    <button
                      onClick={handleSend}
                      disabled={sending || !input.trim()}
                      className="p-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-50 transition-colors"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
