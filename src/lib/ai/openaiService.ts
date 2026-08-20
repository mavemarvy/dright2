import { supabase } from '../supabase';

export type OpenAIImageSize = '1024x1024' | '1792x1024' | '1024x1792';
export type OpenAIImageQuality = 'standard' | 'hd';
export type OpenAIImageType = 'product' | 'banner' | 'marketing';
export type OpenAIAnalysisContext = 'product' | 'marketplace' | 'report';

export interface OpenAIImageResult {
  success: boolean;
  imageId?: string;
  imageUrl?: string;
  revisedPrompt?: string;
  provider?: string;
  model?: string;
  error?: string;
}

export interface OpenAIAnalysisResult {
  success: boolean;
  imageId?: string;
  analysis?: Record<string, unknown>;
  rawContent?: string;
  provider?: string;
  model?: string;
  error?: string;
}

export interface OpenAITranscriptionResult {
  success: boolean;
  transcript?: string;
  provider?: string;
  model?: string;
  error?: string;
}

export interface OpenAIChatResult {
  success: boolean;
  content?: string;
  provider?: string;
  model?: string;
  error?: string;
}

async function callOpenAI(action: string, payload: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('openai-proxy', {
    body: { action, ...payload },
  });

  if (error) return { success: false, error: error.message } as const;
  if (!data || data.success === false) return { success: false, error: data?.error || 'Unknown error' } as const;
  return { success: true, data } as const;
}

export async function generateImage(
  prompt: string,
  userId: string,
  type: OpenAIImageType = 'product',
  size: OpenAIImageSize = '1024x1024',
  quality: OpenAIImageQuality = 'standard'
): Promise<OpenAIImageResult> {
  const result = await callOpenAI('generate-image', { prompt, userId, type, size, quality });
  if (!result.success) return { success: false, error: result.error };
  return result.data as OpenAIImageResult;
}

export async function editImage(
  imageUrl: string,
  editPrompt: string,
  userId: string,
  mask?: string
): Promise<OpenAIImageResult> {
  const result = await callOpenAI('edit-image', { imageUrl, editPrompt, userId, mask });
  if (!result.success) return { success: false, error: result.error };
  return result.data as OpenAIImageResult;
}

export async function analyzeImage(
  imageUrl: string,
  userId: string,
  context: OpenAIAnalysisContext = 'product'
): Promise<OpenAIAnalysisResult> {
  const result = await callOpenAI('analyze-image', { imageUrl, userId, context });
  if (!result.success) return { success: false, error: result.error };
  return result.data as OpenAIAnalysisResult;
}

export async function transcribeAudio(
  audioUrl: string,
  userId: string,
  language?: string
): Promise<OpenAITranscriptionResult> {
  const result = await callOpenAI('transcribe', { audioUrl, userId, language });
  if (!result.success) return { success: false, error: result.error };
  return result.data as OpenAITranscriptionResult;
}

export async function chatCompletion(
  messages: Array<{ role: string; content: string }>,
  userId: string,
  maxTokens = 2000,
  temperature = 0.7
): Promise<OpenAIChatResult> {
  const result = await callOpenAI('chat', { messages, userId, maxTokens, temperature });
  if (!result.success) return { success: false, error: result.error };
  return result.data as OpenAIChatResult;
}
