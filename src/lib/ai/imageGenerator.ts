import { supabase } from '../supabase';
import { getUserImages, toggleFavorite, softDeleteImage, restoreImage, permanentlyDeleteImage, duplicateImage, downloadImage, shareImage, searchImages, regenerateImage, type AIImageRecord, type ImageFilter } from './imageLibrary';

// ─────────────────────────────────────────────────────────────────────────────
// DRIGHT AI Image Generation Service — Unified
//
// Routes all image generation through the image-gen edge function which uses
// OpenAI DALL-E 3 for real image generation. No more text-as-image.
// ─────────────────────────────────────────────────────────────────────────────

export type { AIImageRecord, ImageFilter };

export interface ImageGenerationResult {
  success: boolean;
  imageUrl: string;
  imageId: string;
  revisedPrompt?: string;
  provider: string;
  model: string;
  generationMs?: number;
  error?: string;
}

export interface ImageAnalysisResult {
  success: boolean;
  analysis: Record<string, unknown>;
  rawAnalysis: string;
  provider: string;
  error?: string;
}

export interface ImageEditResult {
  success: boolean;
  imageUrl: string;
  imageId?: string;
  provider: string;
  error?: string;
}

export async function generateImage(params: {
  prompt: string;
  userId: string;
  size?: string;
  quality?: string;
  style?: string;
}): Promise<ImageGenerationResult> {
  try {
    const { data, error } = await supabase.functions.invoke('image-gen', {
      body: {
        action: 'generate',
        prompt: params.prompt,
        userId: params.userId,
        size: params.size || '1024x1024',
        quality: params.quality || 'standard',
        style: params.style || 'vivid',
      },
    });

    if (error || !data || data.success === false) {
      return {
        success: false,
        imageUrl: '',
        imageId: '',
        provider: 'openai',
        model: 'dall-e-3',
        error: data?.error || error?.message || 'Image generation failed',
      };
    }

    return {
      success: true,
      imageUrl: data.imageUrl,
      imageId: data.imageId,
      revisedPrompt: data.revisedPrompt,
      provider: data.provider || 'openai',
      model: data.model || 'dall-e-3',
      generationMs: data.generationMs,
    };
  } catch (err) {
    return {
      success: false,
      imageUrl: '',
      imageId: '',
      provider: 'openai',
      model: 'dall-e-3',
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

export async function analyzeImage(params: {
  imageUrl: string;
  prompt?: string;
  userId: string;
}): Promise<ImageAnalysisResult> {
  try {
    const { data, error } = await supabase.functions.invoke('image-gen', {
      body: {
        action: 'analyze',
        imageUrl: params.imageUrl,
        prompt: params.prompt,
        userId: params.userId,
      },
    });

    if (error || !data || data.success === false) {
      return {
        success: false,
        analysis: {},
        rawAnalysis: '',
        provider: 'unknown',
        error: data?.error || error?.message || 'Image analysis failed',
      };
    }

    return {
      success: true,
      analysis: data.analysis || {},
      rawAnalysis: data.rawAnalysis || '',
      provider: data.provider || 'groq',
    };
  } catch (err) {
    return {
      success: false,
      analysis: {},
      rawAnalysis: '',
      provider: 'unknown',
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

export async function editImage(params: {
  imageUrl: string;
  prompt: string;
  userId: string;
  mask?: string;
}): Promise<ImageEditResult> {
  try {
    const { data, error } = await supabase.functions.invoke('image-gen', {
      body: {
        action: 'edit',
        imageUrl: params.imageUrl,
        prompt: params.prompt,
        userId: params.userId,
        mask: params.mask,
      },
    });

    if (error || !data || data.success === false) {
      return {
        success: false,
        imageUrl: '',
        provider: 'openai',
        error: data?.error || error?.message || 'Image edit failed',
      };
    }

    return {
      success: true,
      imageUrl: data.imageUrl,
      imageId: data.imageId,
      provider: data.provider || 'openai',
    };
  } catch (err) {
    return {
      success: false,
      imageUrl: '',
      provider: 'openai',
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

export async function uploadImageToStorage(file: File | Blob, userId: string): Promise<{ url: string; path: string } | null> {
  const ext = file.type.includes('png') ? 'png' : file.type.includes('webp') ? 'webp' : 'jpg';
  const fileName = `ai-images/${userId}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from('chat-attachments')
    .upload(fileName, file);

  if (error) {
    console.error('uploadImageToStorage error:', error);
    return null;
  }

  const { data: urlData } = supabase.storage
    .from('chat-attachments')
    .getPublicUrl(fileName);

  return { url: urlData.publicUrl, path: fileName };
}

// Re-export library functions for backward compatibility
export {
  getUserImages as fetchUserImages,
  getUserImages as fetchAllImages,
  toggleFavorite as updateImageStatus,
  softDeleteImage,
  restoreImage,
  permanentlyDeleteImage as deleteImage,
  duplicateImage,
  downloadImage,
  shareImage,
  searchImages,
  regenerateImage,
};
