import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Send, X, MessageSquare, Loader2, Bot, User, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useProductQA } from '../../lib/ai/aiHooks';

interface AIAssistantProps {
  product: {
    id: string;
    name: string;
    description: string | null;
    category: string;
    product_type: string;
    price: number;
    is_free: boolean;
    specifications?: Record<string, string> | null;
    faqs?: Array<{ question: string; answer: string }> | null;
    stock_quantity?: number | null;
    location?: string | null;
    brand?: string | null;
    condition?: string | null;
  };
  onContactSeller: () => void;
}

interface ChatMsg {
  role: 'user' | 'assistant';
  text: string;
  suggestContact?: boolean;
  sources?: string[];
  confidence?: 'high' | 'medium' | 'low';
}

const SUGGESTED_QUESTIONS = [
  'What is this product about?',
  'Is this compatible with Mac?',
  'When will I receive it?',
  'Does it include updates?',
  'Can I resell this?',
  'What payment methods are accepted?',
];

export default function ProductAIAssistant({ product, onContactSeller }: AIAssistantProps) {
  const { user } = useAuth();
  const { ask, loading: aiLoading, answer, sources, confidence, error: aiError, reset } = useProductQA(product.id);
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: 'assistant',
      text: `Hi! I'm the Dright AI Assistant for "${product.name}". Ask me anything about this listing — I'll answer using the product description, specifications, reviews, and FAQs.`,
    },
  ]);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, aiLoading]);

  // When AI response arrives, add it to messages
  useEffect(() => {
    if (answer && messages.length > 0 && messages[messages.length - 1].role === 'user') {
      const suggestContact = confidence === 'low' || answer.includes("I don't have that information");
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: answer,
        suggestContact,
        sources,
        confidence,
      }]);
      reset();
    }
  }, [answer, sources, confidence, messages, reset]);

  // Handle errors
  useEffect(() => {
    if (aiError && messages.length > 0 && messages[messages.length - 1].role === 'user') {
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: 'I\'m having trouble connecting to the AI service right now. You can try again or contact the seller directly.',
        suggestContact: true,
      }]);
      reset();
    }
  }, [aiError, messages, reset]);

  const handleSend = (question?: string) => {
    const q = (question ?? input).trim();
    if (!q || aiLoading) return;

    setMessages(prev => [...prev, { role: 'user', text: q }]);
    setInput('');
    ask(q, user?.id);
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 md:bottom-6 md:right-6 z-40 flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-primary-600 to-indigo-600 text-white rounded-2xl shadow-xl hover:shadow-2xl transition-all hover:scale-105"
      >
        <Sparkles className="w-5 h-5" />
        <span className="font-semibold text-sm">Ask AI</span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-4 right-4 md:bottom-6 md:right-6 z-50 w-[calc(100vw-2rem)] max-w-md bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col"
            style={{ maxHeight: '70vh' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gradient-to-r from-primary-600 to-indigo-600 rounded-t-2xl">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <Bot className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-bold text-white text-sm">AI Product Assistant</p>
                  <p className="text-white/70 text-xs">Powered by real AI</p>
                </div>
              </div>
              <button onClick={() => setIsOpen(false)} className="p-1.5 text-white/80 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                    msg.role === 'user' ? 'bg-gray-200' : 'bg-gradient-to-r from-primary-500 to-indigo-500'
                  }`}>
                    {msg.role === 'user' ? <User className="w-4 h-4 text-gray-600" /> : <Bot className="w-4 h-4 text-white" />}
                  </div>
                  <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                    msg.role === 'user' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-800'
                  }`}>
                    <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="mt-1.5 flex items-center gap-1 flex-wrap">
                        {msg.sources.map(s => (
                          <span key={s} className="text-[10px] bg-white rounded-full px-1.5 py-0.5 text-gray-400 border border-gray-200">
                            <CheckCircle2 className="w-2.5 h-2.5 inline mr-0.5" />{s}
                          </span>
                        ))}
                      </div>
                    )}
                    {msg.suggestContact && (
                      <button
                        onClick={() => { onContactSeller(); setIsOpen(false); }}
                        className="mt-2 flex items-center gap-1.5 text-xs font-medium text-primary-600 bg-white rounded-lg px-2 py-1.5 hover:bg-primary-50 transition-colors"
                      >
                        <MessageSquare className="w-3.5 h-3.5" /> Contact Seller
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {aiLoading && (
                <div className="flex gap-2">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-r from-primary-500 to-indigo-500 flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                  <div className="bg-gray-100 rounded-2xl px-3 py-2 flex items-center gap-1.5">
                    {[0, 1, 2].map(i => (
                      <span key={i} className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Suggested questions */}
            {messages.length <= 1 && (
              <div className="px-4 pb-2 flex flex-wrap gap-1.5">
                {SUGGESTED_QUESTIONS.slice(0, 4).map(q => (
                  <button
                    key={q}
                    onClick={() => handleSend(q)}
                    disabled={aiLoading}
                    className="text-xs bg-primary-50 text-primary-700 rounded-full px-2.5 py-1.5 hover:bg-primary-100 transition-colors disabled:opacity-50"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div className="p-3 border-t border-gray-100">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
                  placeholder="Ask about this product..."
                  disabled={aiLoading}
                  className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none disabled:opacity-50"
                />
                <button
                  onClick={() => handleSend()}
                  disabled={!input.trim() || aiLoading}
                  className="p-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors disabled:opacity-40"
                >
                  {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
