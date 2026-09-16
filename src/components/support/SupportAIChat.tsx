import { useEffect, useRef, useState } from 'react';
import { Bot, Headphones, Loader2, Send, Sparkles, User } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

interface SupportMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: Array<{ id: string; type: 'help_article' | 'faq'; title: string }>;
  ticketNumber?: string | null;
}

const SUGGESTIONS = [
  'Where is my latest order?',
  'Why is my payment still pending?',
  'What is the status of my withdrawal?',
  'I need to speak with a human support agent.',
];

export default function SupportAIChat() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<SupportMessage[]>([
    {
      role: 'assistant',
      content: 'Hi — I’m DRIGHT AI Support. I can use DRIGHT help content and your authenticated order, payment, withdrawal, and support-ticket records to answer support questions. If a human needs to investigate, I can escalate the conversation into a support ticket.',
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, sending]);

  const send = async (suggestion?: string) => {
    const prompt = (suggestion ?? input).trim();
    if (!user || !prompt || sending) return;

    setMessages(previous => [...previous, { role: 'user', content: prompt }]);
    setInput('');
    setError(null);
    setSending(true);

    try {
      const history = messages
        .slice(-6)
        .map(message => ({ role: message.role, content: message.content }));
      const { data, error: invokeError } = await supabase.functions.invoke('ai-proxy', {
        body: {
          feature: 'support',
          prompt,
          messages: history,
        },
      });

      if (invokeError) throw invokeError;
      if (!data || data.success === false) {
        const apiError = typeof data?.error === 'string' ? data.error : data?.error?.message;
        throw new Error(apiError || 'AI Support is unavailable right now.');
      }

      setMessages(previous => [...previous, {
        role: 'assistant',
        content: data.content || 'I could not generate a support response.',
        sources: Array.isArray(data.supportSources) ? data.supportSources : undefined,
        ticketNumber: data.ticket?.ticket_number || null,
      }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI Support is unavailable right now.');
    } finally {
      setSending(false);
    }
  };

  if (!user) {
    return (
      <section className="rounded-3xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 sm:p-8">
        <div className="max-w-2xl mx-auto text-center">
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/30 flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-7 h-7 text-indigo-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">DRIGHT AI Support</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 mb-5">Sign in so AI Support can securely check your own DRIGHT account records when answering your questions.</p>
          <Link to="/sign-in" className="inline-flex px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium">Sign in to use AI Support</Link>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
      <div className="p-5 sm:p-6 border-b border-gray-100 dark:border-gray-700 flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shrink-0">
          <Bot className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-bold text-gray-900 dark:text-white">DRIGHT AI Support</h2>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">Grounded</span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Help Center knowledge + your authenticated DRIGHT support data</p>
        </div>
      </div>

      <div ref={scrollRef} className="h-[420px] overflow-y-auto p-4 sm:p-5 space-y-3 bg-gray-50/50 dark:bg-gray-900/30">
        {messages.map((message, index) => (
          <div key={`${message.role}-${index}`} className={`flex gap-2 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {message.role === 'assistant' && (
              <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center shrink-0 mt-1"><Bot className="w-3.5 h-3.5 text-white" /></div>
            )}
            <div className={`max-w-[86%] rounded-2xl px-4 py-3 ${message.role === 'user'
              ? 'bg-blue-600 text-white rounded-tr-md'
              : 'bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-gray-800 dark:text-gray-100 rounded-tl-md'}`}>
              <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{message.content}</p>
              {message.sources && message.sources.length > 0 && (
                <div className="mt-3 pt-2 border-t border-gray-100 dark:border-gray-700">
                  <p className="text-[10px] uppercase tracking-wide font-semibold text-gray-400 mb-1">Knowledge used</p>
                  <div className="flex flex-wrap gap-1">
                    {message.sources.slice(0, 4).map(source => (
                      <span key={`${source.type}-${source.id}`} className="text-[10px] px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">{source.title}</span>
                    ))}
                  </div>
                </div>
              )}
              {message.ticketNumber && (
                <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-300">
                  <Headphones className="w-3.5 h-3.5" /> Human support ticket: {message.ticketNumber}
                </div>
              )}
            </div>
            {message.role === 'user' && (
              <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center shrink-0 mt-1"><User className="w-3.5 h-3.5 text-gray-600 dark:text-gray-300" /></div>
            )}
          </div>
        ))}

        {sending && (
          <div className="flex gap-2 items-start">
            <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center"><Bot className="w-3.5 h-3.5 text-white" /></div>
            <div className="rounded-2xl rounded-tl-md bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 px-4 py-3"><Loader2 className="w-4 h-4 text-gray-400 animate-spin" /></div>
          </div>
        )}
      </div>

      <div className="p-4 sm:p-5 border-t border-gray-100 dark:border-gray-700">
        {messages.length <= 1 && (
          <div className="flex gap-2 overflow-x-auto pb-3">
            {SUGGESTIONS.map(suggestion => (
              <button key={suggestion} onClick={() => void send(suggestion)} disabled={sending} className="shrink-0 text-xs px-3 py-2 rounded-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300 disabled:opacity-50">
                {suggestion}
              </button>
            ))}
          </div>
        )}
        {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={event => setInput(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            rows={2}
            maxLength={5000}
            placeholder="Ask about an order, payment, withdrawal, account issue, or request a human agent..."
            className="flex-1 resize-none px-4 py-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-900"
          />
          <button onClick={() => void send()} disabled={sending || !input.trim()} className="p-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50" aria-label="Send to AI Support">
            {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </div>
        <p className="text-[11px] text-gray-400 mt-2">AI Support does not approve refunds, withdrawals, KYC, disputes, or other privileged actions. Requests needing manual action are escalated to DRIGHT Support.</p>
      </div>
    </section>
  );
}
