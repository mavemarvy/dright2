import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import {
  createConversation, getConversations, getConversationMessages,
  saveMessage, renameConversation, deleteConversation,
  archiveConversation, searchConversations, searchMessages,
  exportConversation, updateConversationStats,
  type AIConversation, type AIConversationMessage,
} from './conversationMemory';
import { loadUserContext, buildContextPrompt, type UserContext } from './contextEngine';
import { validatePrompt, logAbuseAttempt } from './safety';
import { getCachedResponse, setCachedResponse, isCacheable, getCacheKey } from './responseCache';

// ─────────────────────────────────────────────────────────────────────────────
// useAIChatMemory — Persistent cross-session AI chat with conversation memory
//
// Replaces the session-only useAIChat from groqHooks.
// Conversations persist across page reloads. Supports resume, rename, delete,
// search, archive, and export.
// ─────────────────────────────────────────────────────────────────────────────

export function useAIChatMemory(userId: string | undefined) {
  const [conversations, setConversations] = useState<AIConversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<AIConversation | null>(null);
  const [messages, setMessages] = useState<AIConversationMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<AIConversation[]>([]);
  const [context, setContext] = useState<UserContext | null>(null);
  const initialized = useRef(false);

  // Load conversation list
  const loadConversations = useCallback(async () => {
    if (!userId) return;
    const convs = await getConversations(userId);
    setConversations(convs);
  }, [userId]);

  // Load user context for smart context engine
  const loadContext = useCallback(async () => {
    if (!userId) return;
    const ctx = await loadUserContext(userId);
    setContext(ctx);
  }, [userId]);

  // Initialize on mount
  useEffect(() => {
    if (userId && !initialized.current) {
      initialized.current = true;
      loadConversations();
      loadContext();
    }
  }, [userId, loadConversations, loadContext]);

  // Start a new conversation
  const startNewConversation = useCallback(async (title?: string): Promise<AIConversation | null> => {
    if (!userId) return null;
    const conv = await createConversation(userId, title || 'New Conversation');
    if (conv) {
      setConversations(prev => [conv, ...prev]);
      setActiveConversation(conv);
      setMessages([]);
    }
    return conv;
  }, [userId]);

  // Resume an existing conversation
  const resumeConversation = useCallback(async (conversationId: string) => {
    setLoading(true);
    const conv = conversations.find(c => c.id === conversationId) || null;
    setActiveConversation(conv);
    const msgs = await getConversationMessages(conversationId);
    setMessages(msgs);
    setLoading(false);
  }, [conversations]);

  // Send a message with full context
  const sendMessage = useCallback(async (prompt: string, options?: {
    feature?: string;
    conversationId?: string;
  }): Promise<{ success: boolean; response?: string; error?: string }> => {
    if (!userId) return { success: false, error: 'Not authenticated' };

    // Safety check
    const safety = validatePrompt(prompt);
    if (safety.blocked) {
      logAbuseAttempt({
        userId,
        feature: options?.feature || 'chat',
        prompt,
        violationType: safety.violations[0] || 'unknown',
        blocked: true,
      });
      return { success: false, error: 'Your message was blocked by safety filters. Please rephrase.' };
    }

    setSending(true);
    setError(null);

    // Get or create conversation
    let convId = options?.conversationId || activeConversation?.id;
    let conv = activeConversation;

    if (!convId) {
      conv = await startNewConversation('New Conversation');
      convId = conv?.id;
    }

    // Save user message
    if (convId) {
      await saveMessage({
        conversationId: convId,
        userId,
        role: 'user',
        content: safety.sanitizedPrompt,
        feature: options?.feature || 'chat',
      });
    }

    // Build context-aware system prompt
    const contextPrompt = context ? buildContextPrompt(context) : '';

    // Check cache for cacheable features
    const feature = options?.feature || 'chat';
    if (isCacheable(feature)) {
      const cacheKey = getCacheKey(feature, safety.sanitizedPrompt, contextPrompt);
      const cached = await getCachedResponse<string>(cacheKey);
      if (cached) {
        // Save assistant message from cache
        if (convId) {
          await saveMessage({
            conversationId: convId,
            userId,
            role: 'assistant',
            content: cached,
            feature,
          });
        }
        // Refresh messages
        if (convId) {
          const msgs = await getConversationMessages(convId);
          setMessages(msgs);
        }
        setSending(false);
        return { success: true, response: cached };
      }
    }

    // Call AI proxy
    try {
      const { data, error: aiError } = await supabase.functions.invoke('ai-proxy', {
        body: {
          feature,
          prompt: safety.sanitizedPrompt,
          context: contextPrompt,
          userId,
          conversationId: convId,
        },
      });

      if (aiError || !data || data.success === false) {
        const errMsg = data?.error || aiError?.message || 'AI service unavailable';
        setError(errMsg);
        setSending(false);
        return { success: false, error: errMsg };
      }

      const response = data.content || '';

      // Save assistant message
      if (convId) {
        await saveMessage({
          conversationId: convId,
          userId,
          role: 'assistant',
          content: response,
          tokens: data.tokens || 0,
          model: data.model || 'groq-llama-3.3-70b',
          provider: data.provider || 'groq',
          feature,
          latencyMs: data.latencyMs || 0,
        });

        // Update conversation stats
        await updateConversationStats(convId, data.tokens || 0, data.estimatedCost || 0);

        // Refresh messages
        const msgs = await getConversationMessages(convId);
        setMessages(msgs);
      }

      // Cache the response
      if (isCacheable(feature)) {
        const cacheKey = getCacheKey(feature, safety.sanitizedPrompt, contextPrompt);
        await setCachedResponse(cacheKey, response, feature);
      }

      setSending(false);
      return { success: true, response };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(errMsg);
      setSending(false);
      return { success: false, error: errMsg };
    }
  }, [userId, activeConversation, context, startNewConversation]);

  // Rename conversation
  const handleRename = useCallback(async (conversationId: string, title: string) => {
    await renameConversation(conversationId, title);
    setConversations(prev => prev.map(c => c.id === conversationId ? { ...c, title } : c));
    if (activeConversation?.id === conversationId) {
      setActiveConversation(prev => prev ? { ...prev, title } : prev);
    }
  }, [activeConversation]);

  // Delete conversation
  const handleDelete = useCallback(async (conversationId: string) => {
    await deleteConversation(conversationId);
    setConversations(prev => prev.filter(c => c.id !== conversationId));
    if (activeConversation?.id === conversationId) {
      setActiveConversation(null);
      setMessages([]);
    }
  }, [activeConversation]);

  // Archive conversation
  const handleArchive = useCallback(async (conversationId: string, archived = true) => {
    await archiveConversation(conversationId, archived);
    setConversations(prev => prev.filter(c => c.id === conversationId ? !archived : true));
    if (activeConversation?.id === conversationId) {
      setActiveConversation(null);
      setMessages([]);
    }
  }, [activeConversation]);

  // Search conversations and messages
  const handleSearch = useCallback(async (query: string) => {
    if (!userId || !query.trim()) {
      setSearchResults([]);
      return;
    }
    const [convs, msgs] = await Promise.all([
      searchConversations(userId, query),
      searchMessages(userId, query),
    ]);
    // Merge unique conversation IDs from message search
    const convIds = new Set(msgs.map(m => m.conversation_id));
    const additional = conversations.filter(c => convIds.has(c.id) && !convs.find(cc => cc.id === c.id));
    setSearchResults([...convs, ...additional]);
  }, [userId, conversations]);

  // Export conversation
  const handleExport = useCallback(async (conversationId: string): Promise<string> => {
    return await exportConversation(conversationId);
  }, []);

  // Clear current conversation
  const clearActive = useCallback(() => {
    setActiveConversation(null);
    setMessages([]);
  }, []);

  return {
    conversations,
    activeConversation,
    messages,
    loading,
    sending,
    error,
    searchResults,
    context,
    startNewConversation,
    resumeConversation,
    sendMessage,
    renameConversation: handleRename,
    deleteConversation: handleDelete,
    archiveConversation: handleArchive,
    search: handleSearch,
    exportConversation: handleExport,
    clearActive,
    refresh: loadConversations,
  };
}

// ─── Voice Transcription Hook ────────────────────────────────────────────────

export function useVoiceTranscription() {
  const [transcribing, setTranscribing] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);

  const transcribe = useCallback(async (
    audioUrl: string,
    options?: { language?: string; userId?: string; contextType?: string; contextId?: string },
  ) => {
    setTranscribing(true);
    setError(null);
    setTranscript(null);

    try {
      const { transcribeAudio } = await import('./voiceTranscription');
      const result = await transcribeAudio(audioUrl, options);
      if (result.success) {
        setTranscript(result.transcript);
        setConfidence(result.confidence ?? null);
      } else {
        setError(result.error || 'Transcription failed');
      }
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      return { success: false, transcript: '', error: msg };
    } finally {
      setTranscribing(false);
    }
  }, []);

  const reset = useCallback(() => {
    setTranscript(null);
    setError(null);
    setConfidence(null);
  }, []);

  return { transcribing, transcript, error, confidence, transcribe, reset };
}

// ─── Product Q&A Hook ─────────────────────────────────────────────────────────

export function useProductQA(productId: string | undefined) {
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [sources, setSources] = useState<string[]>([]);
  const [confidence, setConfidence] = useState<'high' | 'medium' | 'low'>('low');
  const [error, setError] = useState<string | null>(null);

  const ask = useCallback(async (question: string, userId?: string) => {
    if (!productId) return;
    setLoading(true);
    setError(null);
    setAnswer(null);

    try {
      const { askProductQuestion } = await import('./productQA');
      const result = await askProductQuestion(productId, question, userId);
      if (result.success) {
        setAnswer(result.answer);
        setSources(result.sources);
        setConfidence(result.confidence);
      } else {
        setError(result.error || 'Failed to get answer');
      }
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      return { success: false, answer: '', sources: [], confidence: 'low' as const, error: msg };
    } finally {
      setLoading(false);
    }
  }, [productId]);

  const reset = useCallback(() => {
    setAnswer(null);
    setSources([]);
    setConfidence('low');
    setError(null);
  }, []);

  return { loading, answer, sources, confidence, error, ask, reset };
}

// ─── Image Generation Hook (Fixed) ───────────────────────────────────────────

export function useImageGeneration() {
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ imageUrl: string; imageId: string; revisedPrompt?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const abortController = useRef<AbortController | null>(null);

  const generate = useCallback(async (params: {
    prompt: string;
    userId: string;
    size?: string;
    quality?: string;
    style?: string;
  }) => {
    setGenerating(true);
    setError(null);
    setResult(null);
    setProgress('Generating image...');

    abortController.current = new AbortController();

    try {
      const { data, error: fnError } = await supabase.functions.invoke('image-gen', {
        body: {
          action: 'generate',
          prompt: params.prompt,
          userId: params.userId,
          size: params.size || '1024x1024',
          quality: params.quality || 'standard',
          style: params.style || 'vivid',
        },
      });

      if (fnError || !data || data.success === false) {
        const msg = data?.error || fnError?.message || 'Image generation failed';
        setError(msg);
        return null;
      }

      // Real image URL from DALL-E 3
      setResult({
        imageUrl: data.imageUrl,
        imageId: data.imageId,
        revisedPrompt: data.revisedPrompt,
      });
      setProgress(null);
      return data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      return null;
    } finally {
      setGenerating(false);
      setProgress(null);
    }
  }, []);

  const cancel = useCallback(() => {
    abortController.current?.abort();
    setGenerating(false);
    setProgress(null);
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setProgress(null);
  }, []);

  return { generating, result, error, progress, generate, cancel, reset };
}
