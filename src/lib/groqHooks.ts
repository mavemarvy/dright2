// ─────────────────────────────────────────────────────────────────────────────
// DRIGHT Groq AI Hooks
// Reusable React hooks for AI features, built on the groqService.
// Includes: useAI, useAIChat (Groq-backed), useSmartSearch, useProductGenerator,
// useContentRewriter, useSummarizer, useModeration, useAIHealth
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  type AIGroqResult,
  type GroqMessage,
  type SmartSearchResult,
  type ModerationResult,
  generateText,
  generateProductDescription,
  chat as chatAI,
  summarize as summarizeAI,
  rewrite as rewriteAI,
  smartSearch as smartSearchAI,
  moderateContent as moderateAI,
  checkAIHealth,
  testAI,
} from './groqService';
import { useAuth } from '../contexts/AuthContext';

// ─── useAI — Generic AI call hook ────────────────────────────────────────────

export function useAI() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AIGroqResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async (prompt: string, context?: string) => {
    setLoading(true);
    setError(null);
    const res = await generateText(prompt, context, user?.id);
    setResult(res);
    if (!res.success) setError(res.error || 'AI request failed');
    setLoading(false);
    return res;
  }, [user?.id]);

  return { loading, result, error, generate };
}

// ─── useAIChat — Groq-backed chat with history ───────────────────────────────

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export function useAIChat() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(async (message: string, contextType?: string) => {
    if (!message.trim() || loading) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: message,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    setError(null);

    const history: GroqMessage[] = messages.slice(-10).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const res = await chatAI(message, history, user?.id, undefined);
    void contextType;

    if (res.success) {
      const aiMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: res.content,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } else {
      setError(res.error || 'Chat failed');
    }

    setLoading(false);
    return res;
  }, [user?.id, messages, loading]);

  const clear = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return { messages, loading, error, send, clear };
}

// ─── useSmartSearch — Natural language search ────────────────────────────────

export function useSmartSearch() {
  const { user } = useAuth();
  const [results, setResults] = useState<SmartSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback((query: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    return new Promise<SmartSearchResult | null>((resolve) => {
      debounceRef.current = setTimeout(async () => {
        if (!query.trim()) {
          setResults(null);
          resolve(null);
          return;
        }
        setLoading(true);
        setError(null);
        const res = await smartSearchAI(query, user?.id);
        setResults(res);
        if (!res) setError('Could not understand that search. Please try rephrasing.');
        setLoading(false);
        resolve(res);
      }, 400);
    });
  }, [user?.id]);

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  return { results, loading, error, search };
}

// ─── useProductGenerator — Generate product descriptions ─────────────────────

export function useProductGenerator() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AIGroqResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generateDescription = useCallback(async (
    productName: string,
    category: string,
    keyFeatures: string,
  ) => {
    setLoading(true);
    setError(null);
    const res = await generateProductDescription(productName, category, keyFeatures, user?.id);
    setResult(res);
    if (!res.success) setError(res.error || 'Failed to generate description');
    setLoading(false);
    return res;
  }, [user?.id]);

  const improveTitle = useCallback(async (currentTitle: string, category: string) => {
    setLoading(true);
    setError(null);
    const res = await generateText(
      `Improve this product title for the DRIGHT marketplace. Make it SEO-optimized, 40-60 characters, include the category "${category}". Return only the improved title, nothing else.\n\nCurrent title: "${currentTitle}"`,
      undefined,
      user?.id,
    );
    setResult(res);
    if (!res.success) setError(res.error || 'Failed to improve title');
    setLoading(false);
    return res;
  }, [user?.id]);

  const suggestTags = useCallback(async (productName: string, category: string, description: string) => {
    setLoading(true);
    setError(null);
    const res = await generateText(
      `Suggest 8-10 relevant tags for this marketplace product. Return ONLY a comma-separated list, no numbering or other text.\n\nProduct: ${productName}\nCategory: ${category}\nDescription: ${description}`,
      undefined,
      user?.id,
    );
    setResult(res);
    if (!res.success) setError(res.error || 'Failed to suggest tags');
    setLoading(false);
    return res;
  }, [user?.id]);

  const suggestCategory = useCallback(async (productName: string, description: string) => {
    setLoading(true);
    setError(null);
    const res = await generateText(
      `Based on this product name and description, suggest the best category for it on a digital marketplace. Return ONLY the category name, nothing else.\n\nProduct: ${productName}\nDescription: ${description}`,
      undefined,
      user?.id,
    );
    setResult(res);
    if (!res.success) setError(res.error || 'Failed to suggest category');
    setLoading(false);
    return res;
  }, [user?.id]);

  return { loading, result, error, generateDescription, improveTitle, suggestTags, suggestCategory };
}

// ─── useContentRewriter ──────────────────────────────────────────────────────

export function useContentRewriter() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AIGroqResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rewriteContent = useCallback(async (content: string, context?: string) => {
    setLoading(true);
    setError(null);
    const res = await rewriteAI(content, user?.id, context);
    setResult(res);
    if (!res.success) setError(res.error || 'Failed to rewrite content');
    setLoading(false);
    return res;
  }, [user?.id]);

  return { loading, result, error, rewriteContent };
}

// ─── useSummarizer ───────────────────────────────────────────────────────────

export function useSummarizer() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AIGroqResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const summarizeContent = useCallback(async (content: string) => {
    setLoading(true);
    setError(null);
    const res = await summarizeAI(content, user?.id);
    setResult(res);
    if (!res.success) setError(res.error || 'Failed to summarize');
    setLoading(false);
    return res;
  }, [user?.id]);

  return { loading, result, error, summarizeContent };
}

// ─── useModeration ───────────────────────────────────────────────────────────

export function useModeration() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ModerationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const moderate = useCallback(async (content: string) => {
    setLoading(true);
    setError(null);
    const res = await moderateAI(content, user?.id);
    setResult(res);
    if (!res) setError('Moderation check failed');
    setLoading(false);
    return res;
  }, [user?.id]);

  return { loading, result, error, moderate };
}

// ─── useAIHealth ─────────────────────────────────────────────────────────────

export function useAIHealth() {
  const [status, setStatus] = useState<{ success: boolean; provider: string; configured: boolean; model?: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const check = useCallback(async () => {
    setLoading(true);
    const res = await checkAIHealth();
    setStatus(res);
    setLoading(false);
    return res;
  }, []);

  return { status, loading, check };
}

// ─── useAITest ───────────────────────────────────────────────────────────────

export function useAITest() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AIGroqResult | null>(null);

  const runTest = useCallback(async () => {
    setLoading(true);
    const res = await testAI(user?.id);
    setResult(res);
    setLoading(false);
    return res;
  }, [user?.id]);

  return { loading, result, runTest };
}
