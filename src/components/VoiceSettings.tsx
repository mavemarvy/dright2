import { useState } from 'react';
import { Volume2, VolumeX, Play, Square, Gauge } from 'lucide-react';
import { useVoiceSynthesis } from '../lib/ai/voiceSynthesis';

interface VoiceSettingsProps {
  userId: string;
  className?: string;
}

export default function VoiceSettings({ userId, className = '' }: VoiceSettingsProps) {
  const { supported, voices, speaking, preferences, speak, stop, toggle, savePreferences } = useVoiceSynthesis(userId);
  const [testText] = useState('Hello! This is a test of the DRIGHT AI voice synthesis feature.');

  if (!supported) {
    return (
      <div className={`p-4 bg-gray-50 dark:bg-gray-900 rounded-xl ${className}`}>
        <div className="flex items-center gap-2 text-gray-500">
          <VolumeX className="w-5 h-5" />
          <p className="text-sm">Voice synthesis is not supported in your browser.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Volume2 className="w-5 h-5 text-primary-600" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">AI Voice Replies</h3>
        </div>
        <button
          onClick={toggle}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${preferences.enabled ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'}`}
          aria-label={preferences.enabled ? 'Disable voice' : 'Enable voice'}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${preferences.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>

      {preferences.enabled && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Voice</label>
            <select
              value={preferences.voiceURI || ''}
              onChange={(e) => savePreferences({ voiceURI: e.target.value || null })}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Default</option>
              {voices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="flex items-center gap-2 text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              <Gauge className="w-3.5 h-3.5" /> Speed: {preferences.rate.toFixed(1)}x
            </label>
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.1"
              value={preferences.rate}
              onChange={(e) => savePreferences({ rate: parseFloat(e.target.value) })}
              className="w-full accent-primary-600"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Pitch: {preferences.pitch.toFixed(1)}
            </label>
            <input
              type="range"
              min="0"
              max="2.0"
              step="0.1"
              value={preferences.pitch}
              onChange={(e) => savePreferences({ pitch: parseFloat(e.target.value) })}
              className="w-full accent-primary-600"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Volume: {Math.round(preferences.volume * 100)}%
            </label>
            <input
              type="range"
              min="0"
              max="1.0"
              step="0.1"
              value={preferences.volume}
              onChange={(e) => savePreferences({ volume: parseFloat(e.target.value) })}
              className="w-full accent-primary-600"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => speak(testText)}
              disabled={speaking}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary-600 bg-primary-50 dark:bg-primary-900/30 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" /> Test Voice
            </button>
            {speaking && (
              <button
                onClick={stop}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-500 bg-red-50 dark:bg-red-900/30 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
              >
                <Square className="w-3.5 h-3.5" /> Stop
              </button>
            )}
          </div>

          <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
            <input
              type="checkbox"
              checked={preferences.autoRead}
              onChange={(e) => savePreferences({ autoRead: e.target.checked })}
              className="accent-primary-600"
            />
            Automatically read AI responses aloud
          </label>
        </div>
      )}
    </div>
  );
}
