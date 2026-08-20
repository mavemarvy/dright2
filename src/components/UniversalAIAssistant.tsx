import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Send, X, Loader2, Bot, User, ShoppingBag, MessageSquare, Lightbulb, Star, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { validatePrompt } from '../lib/ai/safety';
import { getMemory, buildMemoryContext, saveMemory } from '../lib/ai/memoryEngine';

export type AssistantType = 'shopping' | 'seller' | 'affiliate' | 'creator' | 'advertiser' | 'support' | 'admin';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  products?: Array<{ id: string; name: string; price: number; image_url?: string | null }>;
  suggestions?: string[];
}

const ASSISTANT_CONFIG: Record<AssistantType, { title: string; icon: any; greeting: string; suggestions: string[]; promptKey: string }> = {
  shopping: {
    title: 'AI Shopping Assistant',
    icon: ShoppingBag,
    greeting: "Hi! I'm your AI shopping assistant. I can help you find products, compare options, and discover the best deals. What are you looking for today?",
    suggestions: ['Find the best logo designer', 'Cheapest AI course', 'Best rated services', 'Trending products', 'Best affiliate products'],
    promptKey: 'marketplace_assistant',
  },
  seller: {
    title: 'AI Seller Assistant',
    icon: TrendingUp,
    greeting: "Hi! I'm your AI business advisor. I can analyze your store performance and suggest ways to improve sales. What would you like to know?",
    suggestions: ['Why are my sales dropping?', 'How do I improve conversion?', 'What price should I use?', 'Which products should I promote?'],
    promptKey: 'seller_insights',
  },
  affiliate: {
    title: 'AI Affiliate Assistant',
    icon: Star,
    greeting: "Hi! I'm your AI affiliate advisor. I can help you find the best products to promote and maximize your commissions. What do you need?",
    suggestions: ['Best products to promote', 'Best posting time', 'Estimated commissions', 'Viral opportunities'],
    promptKey: 'marketplace_assistant',
  },
  creator: {
    title: 'AI Creator Assistant',
    icon: Lightbulb,
    greeting: "Hi! I'm your AI content creator assistant. I can help generate video ideas, titles, hooks, and content calendars. What are you working on?",
    suggestions: ['Generate video ideas', 'Create catchy titles', 'Write video hooks', 'Suggest hashtags'],
    promptKey: 'marketplace_assistant',
  },
  advertiser: {
    title: 'AI Ad Assistant',
    icon: Sparkles,
    greeting: "Hi! I'm your AI advertising assistant. I can help create campaigns, ad copy, and optimize your budget. What do you need?",
    suggestions: ['Generate campaign ideas', 'Write ad copy', 'Suggest target audience', 'Budget allocation tips'],
    promptKey: 'marketplace_assistant',
  },
  support: {
    title: 'AI Support Assistant',
    icon: MessageSquare,
    greeting: "Hi! I'm your AI support assistant. I can help with orders, payments, refunds, wallet, and account questions. How can I help?",
    suggestions: ['How do I get a refund?', 'Where is my order?', 'How does the wallet work?', 'Payment issues'],
    promptKey: 'marketplace_assistant',
  },
  admin: {
    title: 'AI Admin Intelligence',
    icon: Bot,
    greeting: "Hi! I'm your AI admin assistant. I can analyze platform metrics and provide insights. What would you like to know?",
    suggestions: ['Why are sales down today?', 'Which sellers need review?', 'Fastest growing category?', 'Predict next month revenue'],
    promptKey: 'marketplace_assistant',
  },
};

interface UniversalAIAssistantProps {
  type?: AssistantType;
  contextData?: Record<string, any>;
}

export default function UniversalAIAssistant({ type = 'shopping', contextData = {} }: UniversalAIAssistantProps) {
  const { user } = useAuth();
  const config = ASSISTANT_CONFIG[type];
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', text: config.greeting },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const searchMarketplace = useCallback(async (query: string) => {
    const { data } = await supabase
      .from('products')
      .select('id, name, price, image_url, category, product_type, average_rating, total_sales')
      .eq('is_active', true)
      .eq('is_hidden', false)
      .eq('approval_status', 'approved')
      .or(`name.ilike.%${query}%,description.ilike.%${query}%,category.ilike.%${query}%`)
      .order('total_sales', { ascending: false })
      .limit(5);
    return data || [];
  }, []);

  const handleSend = useCallback(async (question?: string) => {
    const q = (question ?? input).trim();
    if (!q || loading) return;

    setMessages(prev => [...prev, { role: 'user', text: q }]);
    setInput('');
    setLoading(true);

    try {
      const safety = validatePrompt(q);
      if (!safety.safe && safety.blocked) {
        setMessages(prev => [...prev, { role: 'assistant', text: 'I cannot process that request. Please try a different question.' }]);
        setLoading(false);
        return;
      }

      // Search marketplace for relevant products
      const products = await searchMarketplace(safety.sanitizedPrompt);

      // Get user memory for personalization
      let memoryContext = '';
      if (user) {
        const memories = await getMemory('user');
        memoryContext = buildMemoryContext(memories);
      }

      // Build context
      const context = [
        memoryContext,
        Object.entries(contextData).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n'),
        products.length > 0 ? `Relevant marketplace listings found:\n${products.map((p: any) => `- ${p.name} (${p.price}, ${p.category}, ${p.total_sales} sales, ${p.average_rating}★)`).join('\n')}` : '',
      ].filter(Boolean).join('\n\n');

      // Call AI proxy
      const { data, error } = await supabase.functions.invoke('ai-proxy', {
        body: JSON.stringify({
          feature: type,
          prompt: safety.sanitizedPrompt,
          systemPrompt: config.greeting,
          context,
          conversationId: undefined,
        }),
      });

      if (error) throw new Error(error.message);

      const responseText = (data as any)?.content || 'I apologize, I could not generate a response right now. Please try again.';

      // Save conversation to memory if user is logged in
      if (user) {
        saveMemory(`chat_${Date.now()}`, { question: q, answer: responseText }, {
          memory_type: 'context',
          scope: 'user',
          source: 'conversation',
          confidence: 0.8,
        }).catch(() => {});
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        text: responseText,
        products: products.length > 0 ? products.map((p: any) => ({ id: p.id, name: p.name, price: p.price, image_url: p.image_url })) : undefined,
        suggestions: products.length === 0 ? ['Try different keywords', 'Browse trending products', 'Search by category'] : undefined,
      }]);
    } catch (err: any) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: 'I\'m having trouble connecting right now. Please try again in a moment.',
      }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, type, config, user, contextData, searchMarketplace]);

  const Icon = config.icon;

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 md:bottom-6 md:right-6 z-40 flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-primary-600 to-indigo-600 text-white rounded-2xl shadow-xl hover:shadow-2xl transition-all hover:scale-105"
        aria-label={`Open ${config.title}`}
      >
        <Icon className="w-5 h-5" />
        <span className="font-semibold text-sm hidden sm:inline">{config.title}</span>
        <span className="font-semibold text-sm sm:hidden">AI</span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-4 right-4 md:bottom-6 md:right-6 z-50 w-[calc(100vw-2rem)] max-w-md bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col"
            style={{ maxHeight: '75vh' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gradient-to-r from-primary-600 to-indigo-600 rounded-t-2xl">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-bold text-white text-sm">{config.title}</p>
                  <p className="text-white/70 text-xs">AI-powered</p>
                </div>
              </div>
              <button onClick={() => setIsOpen(false)} className="p-1.5 text-white/80 hover:text-white" aria-label="Close assistant">
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

                    {msg.products && msg.products.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        {msg.products.map(p => (
                          <Link
                            key={p.id}
                            to={`/product/${p.id}`}
                            onClick={() => setIsOpen(false)}
                            className="flex items-center gap-2 bg-white rounded-xl p-1.5 hover:bg-primary-50 transition-colors"
                          >
                            {p.image_url ? (
                              <img src={p.image_url} alt="" className="w-8 h-8 rounded-lg object-cover" />
                            ) : (
                              <div className="w-8 h-8 rounded-lg bg-gray-200 flex items-center justify-center">
                                <ShoppingBag className="w-4 h-4 text-gray-400" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-gray-800 truncate">{p.name}</p>
                              <p className="text-xs text-primary-600">${p.price}</p>
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}

                    {msg.suggestions && msg.suggestions.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {msg.suggestions.map(s => (
                          <button
                            key={s}
                            onClick={() => handleSend(s)}
                            className="text-xs bg-primary-50 text-primary-700 rounded-full px-2 py-1 hover:bg-primary-100 transition-colors"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {loading && (
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
                {config.suggestions.slice(0, 4).map(q => (
                  <button
                    key={q}
                    onClick={() => handleSend(q)}
                    disabled={loading}
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
                  placeholder="Ask me anything..."
                  disabled={loading}
                  className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none disabled:opacity-50"
                />
                <button
                  onClick={() => handleSend()}
                  disabled={!input.trim() || loading}
                  className="p-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors disabled:opacity-40"
                  aria-label="Send message"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
