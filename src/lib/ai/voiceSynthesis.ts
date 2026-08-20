import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '../supabase';

export interface VoicePreferences {
  enabled: boolean;
  voiceURI: string | null;
  rate: number;
  pitch: number;
  volume: number;
  autoRead: boolean;
}

const DEFAULT_PREFERENCES: VoicePreferences = {
  enabled: false,
  voiceURI: null,
  rate: 1.0,
  pitch: 1.0,
  volume: 1.0,
  autoRead: false,
};

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function getAvailableVoices(): SpeechSynthesisVoice[] {
  if (!isSpeechSynthesisSupported()) return [];
  return window.speechSynthesis.getVoices();
}

export function useVoiceSynthesis(userId?: string) {
  const [supported] = useState(isSpeechSynthesisSupported());
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const [preferences, setPreferences] = useState<VoicePreferences>(DEFAULT_PREFERENCES);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (!supported) return;

    const loadVoices = () => {
      const available = getAvailableVoices();
      setVoices(available);
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, [supported]);

  useEffect(() => {
    if (!userId || !supported) return;

    const loadPreferences = async () => {
      const { data } = await supabase
        .from('voice_preferences')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (data) {
        setPreferences({
          enabled: data.enabled,
          voiceURI: data.voice_uri,
          rate: data.rate,
          pitch: data.pitch,
          volume: data.volume,
          autoRead: data.auto_read,
        });
      }
    };

    loadPreferences();
  }, [userId, supported]);

  const savePreferences = useCallback(async (prefs: Partial<VoicePreferences>) => {
    if (!userId) return;
    const updated = { ...preferences, ...prefs };
    setPreferences(updated);

    await supabase.from('voice_preferences').upsert({
      user_id: userId,
      enabled: updated.enabled,
      voice_uri: updated.voiceURI,
      rate: updated.rate,
      pitch: updated.pitch,
      volume: updated.volume,
      auto_read: updated.autoRead,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  }, [userId, preferences]);

  const speak = useCallback((text: string) => {
    if (!supported || !preferences.enabled || !text) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = preferences.rate;
    utterance.pitch = preferences.pitch;
    utterance.volume = preferences.volume;

    if (preferences.voiceURI) {
      const voice = voices.find((v) => v.voiceURI === preferences.voiceURI);
      if (voice) utterance.voice = voice;
    }

    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [supported, preferences, voices]);

  const stop = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [supported]);

  const toggle = useCallback(() => {
    savePreferences({ enabled: !preferences.enabled });
  }, [preferences.enabled, savePreferences]);

  return {
    supported,
    voices,
    speaking,
    preferences,
    speak,
    stop,
    toggle,
    savePreferences,
  };
}
