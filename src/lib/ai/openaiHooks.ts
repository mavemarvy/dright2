import { useState, useCallback } from 'react';
import {
  generateImage,
  editImage,
  analyzeImage,
  transcribeAudio,
  chatCompletion,
  type OpenAIImageType,
  type OpenAIImageSize,
  type OpenAIImageQuality,
  type OpenAIAnalysisContext,
  type OpenAIImageResult,
  type OpenAIAnalysisResult,
  type OpenAITranscriptionResult,
  type OpenAIChatResult,
} from './openaiService';

export function useOpenAIImageGeneration() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OpenAIImageResult | null>(null);

  const generate = useCallback(async (
    prompt: string,
    userId: string,
    type: OpenAIImageType = 'product',
    size: OpenAIImageSize = '1024x1024',
    quality: OpenAIImageQuality = 'standard'
  ) => {
    setLoading(true);
    setError(null);
    try {
      const res = await generateImage(prompt, userId, type, size, quality);
      if (!res.success) { setError(res.error || 'Generation failed'); return null; }
      setResult(res);
      return res;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, result, generate, setError };
}

export function useOpenAIImageEdit() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OpenAIImageResult | null>(null);

  const edit = useCallback(async (imageUrl: string, editPrompt: string, userId: string, mask?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await editImage(imageUrl, editPrompt, userId, mask);
      if (!res.success) { setError(res.error || 'Edit failed'); return null; }
      setResult(res);
      return res;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, result, edit, setError };
}

export function useOpenAIImageAnalysis() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OpenAIAnalysisResult | null>(null);

  const analyze = useCallback(async (imageUrl: string, userId: string, context: OpenAIAnalysisContext = 'product') => {
    setLoading(true);
    setError(null);
    try {
      const res = await analyzeImage(imageUrl, userId, context);
      if (!res.success) { setError(res.error || 'Analysis failed'); return null; }
      setResult(res);
      return res;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, result, analyze, setError };
}

export function useOpenAITranscription() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OpenAITranscriptionResult | null>(null);

  const transcribe = useCallback(async (audioUrl: string, userId: string, language?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await transcribeAudio(audioUrl, userId, language);
      if (!res.success) { setError(res.error || 'Transcription failed'); return null; }
      setResult(res);
      return res;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, result, transcribe, setError };
}

export function useOpenAIChat() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OpenAIChatResult | null>(null);

  const chat = useCallback(async (
    messages: Array<{ role: string; content: string }>,
    userId: string,
    maxTokens = 2000,
    temperature = 0.7
  ) => {
    setLoading(true);
    setError(null);
    try {
      const res = await chatCompletion(messages, userId, maxTokens, temperature);
      if (!res.success) { setError(res.error || 'Chat failed'); return null; }
      setResult(res);
      return res;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, result, chat, setError };
}
