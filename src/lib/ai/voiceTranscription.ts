import { supabase } from '../supabase';

// ─────────────────────────────────────────────────────────────────────────────
// DRIGHT Voice Transcription Service
//
// Correct implementation: uploads audio as Blob/File to Supabase Storage,
// then sends the storage URL to the openai-proxy edge function which fetches
// it server-side and converts to Blob for the Whisper API.
//
// Supports: WAV, MP3, OGG, WEBM, M4A
// ─────────────────────────────────────────────────────────────────────────────

export interface TranscriptionResult {
  success: boolean;
  transcript: string;
  language?: string;
  duration?: number;
  segments?: Array<{ start: number; end: number; text: string; avg_logprob?: number }>;
  confidence?: number;
  error?: string;
}

export interface VoiceRecording {
  blob: Blob;
  duration: number;
  mimeType: string;
  fileName: string;
}

const SUPPORTED_FORMATS = ['audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/webm', 'audio/mp4', 'audio/x-m4a', 'audio/m4a'];

export function isSupportedAudioFormat(mimeType: string): boolean {
  return SUPPORTED_FORMATS.some(fmt => mimeType.toLowerCase().includes(fmt.toLowerCase().replace('audio/', '')));
}

export function getMimeType(): string {
  // Prefer formats that Whisper handles well
  if (typeof MediaRecorder === 'undefined') return 'audio/webm';
  const formats = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  for (const fmt of formats) {
    if (MediaRecorder.isTypeSupported(fmt)) return fmt;
  }
  return 'audio/webm';
}

export async function uploadAudioRecording(recording: VoiceRecording, userId: string): Promise<{ url: string; path: string } | null> {
  const ext = recording.mimeType.includes('webm') ? 'webm'
    : recording.mimeType.includes('ogg') ? 'ogg'
    : recording.mimeType.includes('mp4') || recording.mimeType.includes('m4a') ? 'm4a'
    : recording.mimeType.includes('mpeg') || recording.mimeType.includes('mp3') ? 'mp3'
    : 'wav';

  const fileName = `voice/${userId}/${Date.now()}.${ext}`;
  const file = new File([recording.blob], fileName, { type: recording.mimeType });

  const { error } = await supabase.storage
    .from('chat-attachments')
    .upload(fileName, file);

  if (error) {
    console.error('uploadAudioRecording error:', error);
    return null;
  }

  const { data: urlData } = supabase.storage
    .from('chat-attachments')
    .getPublicUrl(fileName);

  return { url: urlData.publicUrl, path: fileName };
}

export async function transcribeAudio(
  audioUrl: string,
  options?: {
    language?: string;
    userId?: string;
    contextType?: string;
    contextId?: string;
  },
): Promise<TranscriptionResult> {
  try {
    const { data, error } = await supabase.functions.invoke('openai-proxy', {
      body: {
        action: 'transcribe',
        audioUrl,
        language: options?.language,
        userId: options?.userId,
        contextType: options?.contextType,
        contextId: options?.contextId,
      },
    });

    if (error) {
      return { success: false, transcript: '', error: error.message || 'Transcription failed' };
    }

    if (!data || data.success === false) {
      return { success: false, transcript: '', error: data?.error || 'Transcription failed' };
    }

    return {
      success: true,
      transcript: data.transcript || '',
      language: data.language,
      duration: data.duration,
      segments: data.segments,
      confidence: data.segments
        ? data.segments.reduce((s: number, seg: any) => s + (seg.avg_logprob || 0), 0) / (data.segments.length || 1)
        : undefined,
    };
  } catch (err) {
    return {
      success: false,
      transcript: '',
      error: err instanceof Error ? err.message : 'Unknown transcription error',
    };
  }
}

export async function transcribeRecording(
  recording: VoiceRecording,
  userId: string,
  options?: { language?: string; contextType?: string; contextId?: string },
): Promise<TranscriptionResult> {
  // Step 1: Upload audio to storage
  const uploaded = await uploadAudioRecording(recording, userId);
  if (!uploaded) {
    return { success: false, transcript: '', error: 'Failed to upload audio recording' };
  }

  // Step 2: Transcribe via edge function
  const result = await transcribeAudio(uploaded.url, {
    ...options,
    userId,
  });

  return result;
}

// ─── Voice Recorder Hook Support ─────────────────────────────────────────────

export class VoiceRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private startTime: number = 0;

  async start(): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
      throw new Error('Voice recording is not supported on this device');
    }

    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.chunks = [];
    this.startTime = Date.now();

    const mimeType = getMimeType();
    this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };

    this.mediaRecorder.start(1000); // Collect data every second
  }

  stop(): Promise<VoiceRecording> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || !this.stream) {
        reject(new Error('Not recording'));
        return;
      }

      const duration = (Date.now() - this.startTime) / 1000;
      const mimeType = this.mediaRecorder.mimeType || 'audio/webm';

      this.mediaRecorder.onstop = () => {
        // Stop all tracks to release the microphone
        this.stream?.getTracks().forEach(t => t.stop());
        const blob = new Blob(this.chunks, { type: mimeType });
        const ext = mimeType.includes('webm') ? 'webm'
          : mimeType.includes('ogg') ? 'ogg'
          : mimeType.includes('mp4') ? 'm4a'
          : 'wav';
        resolve({
          blob,
          duration,
          mimeType,
          fileName: `recording-${Date.now()}.${ext}`,
        });
      };

      this.mediaRecorder.stop();
    });
  }

  cancel(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      // Set null handlers so onstop doesn't fire
      this.mediaRecorder.ondataavailable = null;
      this.mediaRecorder.onstop = null;
      this.mediaRecorder.stop();
    }
    // Always stop tracks to release the mic
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
    this.mediaRecorder = null;
    this.chunks = [];
  }

  get isRecording(): boolean {
    return this.mediaRecorder?.state === 'recording';
  }

  get elapsedSeconds(): number {
    return this.startTime > 0 ? (Date.now() - this.startTime) / 1000 : 0;
  }
}
